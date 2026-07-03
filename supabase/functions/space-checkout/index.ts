// space-checkout Edge Function (specs/004-ticket-booking, contract edge-functions.md §2; US3/T023).
// Verifies the caller JWT and creates a Stripe Checkout Session for one permanent
// "+1 ticket space" add-on (metadata.kind="space"). The webhook (kind="space")
// records the purchase and bumps capacity.
//
// Self-contained (no ../_shared import) so it deploys via the dashboard paste box.
// Deploy: supabase functions deploy space-checkout
// Secret required: STRIPE_SECRET_KEY (optional SPACE_PRICE_CENTS, default 9900).

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPACE_PRICE_CENTS = parseInt(Deno.env.get("SPACE_PRICE_CENTS") ?? "9900", 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: ud, error: ue } = await anon.auth.getUser(jwt);
    if (ue || !ud?.user) return json({ error: "unauthorized" }, 401);
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const origin = String(body.origin ?? "");
    if (!/^https?:\/\//.test(origin)) return json({ error: "bad_request" }, 400);
    const base = origin.split("#")[0];

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    // feature-006 double-pay guard: reuse an in-progress pending space payment
    // (so a retry doesn't create a second active ledger row).
    const { data: pendingSpace } = await admin
      .from("payments").select("id")
      .eq("user_id", user.id).eq("kind", "space").eq("status", "pending").maybeSingle();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: SPACE_PRICE_CENTS,
          product_data: {
            name: "Extra ticket space (+1)",
            description: "Permanently lets you hold one more ticket at the same time. Non-refundable.",
          },
        },
      }],
      success_url: base + "#ticket",
      cancel_url: base + "#ticket",
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: { kind: "space", user_id: user.id },
    });

    // feature-006: pending payments ledger row keyed by the Stripe session id.
    if (pendingSpace) {
      await admin.from("payments").update({
        provider_ref: session.id, amount_cents: SPACE_PRICE_CENTS, currency: "usd",
        updated_at: new Date().toISOString(),
      }).eq("id", pendingSpace.id);
    } else {
      await admin.from("payments").insert({
        user_id: user.id, provider: "stripe", kind: "space", item_ref: crypto.randomUUID(),
        amount_cents: SPACE_PRICE_CENTS, currency: "usd", status: "pending", provider_ref: session.id,
      });
    }

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
