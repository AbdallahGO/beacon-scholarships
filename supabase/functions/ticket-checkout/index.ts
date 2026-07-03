// ticket-checkout Edge Function (specs/004-ticket-booking, contract edge-functions.md §1; US1/T009).
// Verifies the caller JWT, enforces one-per-scholarship + capacity, reads the
// SERVER price from scholarship_rankings, and creates a Stripe Checkout Session.
//
// Capacity (analysis finding S1) is derived as 1 + count(space_purchases) — the
// client-writable profiles.ticket_capacity is NEVER trusted for authorization.
//
// Self-contained (no ../_shared import) so it deploys via the dashboard paste box.
// Deploy: supabase functions deploy ticket-checkout
// Secret required: STRIPE_SECRET_KEY. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

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
    const scholarshipId = String(body.scholarship_id ?? "");
    const origin = String(body.origin ?? "");
    if (!scholarshipId || !/^https?:\/\//.test(origin)) return json({ error: "bad_request" }, 400);
    const base = origin.split("#")[0];

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // profile must exist (name needed for the reveal snapshot, FR-016)
    const { data: prof } = await admin.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    const fullName = prof
      ? (prof.full_name || [prof.first_name, prof.last_name].filter(Boolean).join(" "))
      : "";
    if (!prof || !String(fullName).trim()) return json({ error: "profile_incomplete" }, 409);

    // one ticket per scholarship (FR-014b)
    const { data: existing } = await admin
      .from("tickets").select("id")
      .eq("user_id", user.id).eq("scholarship_id", scholarshipId).neq("status", "void").limit(1);
    if (existing && existing.length) return json({ error: "already_booked" }, 409);

    // feature-006 double-pay guard: a paid payments row for this item blocks too
    const { data: existingPay } = await admin
      .from("payments").select("id,status")
      .eq("user_id", user.id).eq("kind", "ticket").eq("item_ref", scholarshipId)
      .in("status", ["pending", "paid"]).maybeSingle();
    if (existingPay && existingPay.status === "paid") return json({ error: "already_booked" }, 409);

    // capacity = 1 + permanent space purchases; occupied = tickets still in cooldown
    const { count: spaceCount } = await admin
      .from("space_purchases").select("*", { count: "exact", head: true }).eq("user_id", user.id);
    const capacity = 1 + (spaceCount ?? 0);
    const nowIso = new Date().toISOString();
    const { count: activeCount } = await admin
      .from("tickets").select("*", { count: "exact", head: true })
      .eq("user_id", user.id).gt("cooldown_end", nowIso);
    if ((activeCount ?? 0) >= capacity) return json({ error: "at_capacity" }, 409);

    // server-authoritative price (missing ranking → out_of_rank / $150)
    const { data: rank } = await admin
      .from("scholarship_rankings").select("tier,amount_cents,institution")
      .eq("scholarship_id", scholarshipId).maybeSingle();
    const tier = rank?.tier ?? "out_of_rank";
    const amount = rank?.amount_cents ?? 15000;
    const institution = rank?.institution ?? (body.institution ? String(body.institution) : "");
    const title = body.scholarship_title ? String(body.scholarship_title).slice(0, 200) : "Scholarship";
    // ticket reveal "Country" is the scholarship's country (from the catalogue), not where the user lives
    const scholarshipCountry = body.country ? String(body.country).slice(0, 120) : "";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: `Scholarship Ticket — ${title}`,
            description: "Non-refundable booking — your first step toward the exam and interview.",
          },
        },
      }],
      success_url: base + "#ticket-booked",
      cancel_url: base,
      client_reference_id: user.id,
      customer_email: user.email ?? undefined,
      metadata: {
        kind: "ticket",
        user_id: user.id,
        scholarship_id: scholarshipId,
        tier,
        amount_cents: String(amount),
        scholarship_title: title,
        institution: institution.slice(0, 250),
        reveal_full_name: String(fullName).slice(0, 250),
        reveal_country: scholarshipCountry,
        reveal_nationality: (prof.nationality ?? "").slice(0, 120),
        reveal_degree: prof.degree ?? "",
        reveal_field_of_interest: (prof.field_of_interest ?? "").slice(0, 250),
      },
    });

    // feature-006: record a pending payments ledger row keyed by the Stripe
    // session id (provider 'stripe', USD, fx 1.0). A retry reuses the existing
    // pending slot so the active-item unique index never traps the user.
    if (existingPay) {
      await admin.from("payments").update({
        provider_ref: session.id, amount_cents: amount, currency: "usd",
        updated_at: new Date().toISOString(),
      }).eq("id", existingPay.id);
    } else {
      await admin.from("payments").insert({
        user_id: user.id, provider: "stripe", kind: "ticket", item_ref: scholarshipId,
        amount_cents: amount, currency: "usd", status: "pending", provider_ref: session.id,
      });
    }

    return json({ url: session.url });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
