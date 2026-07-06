// kashier-checkout Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// Verifies the caller JWT, double-pay guard, SERVER-side amount, inserts a
// payments(pending) row, and builds a signed Kashier Hosted Payment Page URL.
// Booking happens ONLY in kashier-webhook after signature verification.
//
// Self-contained. Deploy: supabase functions deploy kashier-checkout
// Secrets: KASHIER_MERCHANT_ID, KASHIER_SECRET (hpp/iframe key) (optional KASHIER_MODE=live, SPACE_PRICE_CENTS).

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MID = Deno.env.get("KASHIER_MERCHANT_ID")!;
const SECRET = Deno.env.get("KASHIER_SECRET")!;
const MODE = Deno.env.get("KASHIER_MODE") === "live" ? "live" : "test";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPACE_PRICE_CENTS = parseInt(Deno.env.get("SPACE_PRICE_CENTS") ?? "9900", 10);

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthenticated" }, 401);

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: ud, error: ue } = await anon.auth.getUser(jwt);
    if (ue || !ud?.user) return json({ error: "unauthenticated" }, 401);
    const user = ud.user;

    const body = await req.json().catch(() => ({}));
    const kind = String(body.kind ?? "");
    const origin = String(body.origin ?? "");
    if (!["ticket", "space"].includes(kind) || !/^https?:\/\//.test(origin)) return json({ error: "bad_request" }, 400);
    const base = origin.split("#")[0];
    const scholarshipId = kind === "ticket" ? String(body.scholarship_id ?? "") : "";
    if (kind === "ticket" && !scholarshipId) return json({ error: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: prov } = await admin.from("payment_providers").select("*").eq("provider", "kashier").maybeSingle();
    if (!prov || !prov.enabled) return json({ error: "provider_disabled" }, 403);

    // double-pay guard
    if (kind === "ticket") {
      const { data: booked } = await admin.from("tickets").select("id")
        .eq("user_id", user.id).eq("scholarship_id", scholarshipId).neq("status", "void").limit(1);
      if (booked && booked.length) return json({ error: "already_booked" }, 409);
      const { data: active } = await admin.from("payments").select("id")
        .eq("user_id", user.id).eq("kind", "ticket").eq("item_ref", scholarshipId)
        .in("status", ["pending", "paid"]).limit(1);
      if (active && active.length) return json({ error: "already_in_progress" }, 409);
    } else {
      const { data: active } = await admin.from("payments").select("id")
        .eq("user_id", user.id).eq("kind", "space").eq("status", "pending").limit(1);
      if (active && active.length) return json({ error: "already_in_progress" }, 409);
    }

    let baseUsd = SPACE_PRICE_CENTS;
    if (kind === "ticket") {
      const { data: rank } = await admin.from("scholarship_rankings").select("amount_cents").eq("scholarship_id", scholarshipId).maybeSingle();
      baseUsd = rank?.amount_cents ?? 15000;
    }
    const fx = Number(prov.fx_rate) || 1;
    const amountCents = Math.round(baseUsd * fx);
    const currency = String(prov.currency || "EGP").toUpperCase();
    const itemRef = kind === "ticket" ? scholarshipId : crypto.randomUUID();

    const { data: pay, error: payErr } = await admin.from("payments").insert({
      user_id: user.id, provider: "kashier", kind, item_ref: itemRef,
      amount_cents: amountCents, currency, status: "pending",
    }).select("id").single();
    if (payErr || !pay) {
      if (/duplicate|unique/i.test(payErr?.message || "")) return json({ error: "already_in_progress" }, 409);
      throw payErr || new Error("ledger_insert");
    }

    const orderId = pay.id; // our merchant order id == ledger id
    const amount = (amountCents / 100).toFixed(2);
    // Kashier HPP order hash: HMAC-SHA256 over /?payment=mid.order.amount.currency
    const path = `/?payment=${MID}.${orderId}.${amount}.${currency}`;
    const hash = await hmacSha256Hex(SECRET, path);

    await admin.from("payments").update({ provider_ref: orderId, updated_at: new Date().toISOString() }).eq("id", pay.id);

    // serverWebhook lets Kashier POST the result to our function without any
    // dashboard webhook config (extra params are not part of the order hash).
    const serverWebhook = `${SUPABASE_URL}/functions/v1/kashier-webhook`;
    const params = new URLSearchParams({
      merchantId: MID, orderId, amount, currency, hash, mode: MODE,
      merchantRedirect: base + "#pay-return", serverWebhook, display: "en",
      type: "external", redirectMethod: "get", allowedMethods: "card",
    });
    const url = "https://checkout.kashier.io/?" + params.toString();
    return json({ url });
  } catch (e) {
    console.error(e);
    return json({ error: "provider_error" }, 502);
  }
});
