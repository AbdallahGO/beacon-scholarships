// paymob-checkout Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// Verifies the caller JWT, double-pay guard, SERVER-side amount, inserts a
// payments(pending) row, and builds a Paymob iframe payment URL (auth → order →
// payment_key). Booking happens ONLY in paymob-webhook after HMAC verification.
//
// Self-contained. Deploy: supabase functions deploy paymob-checkout
// Secrets: PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_IFRAME_ID (optional SPACE_PRICE_CENTS).

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PAYMOB = "https://accept.paymob.com";
const API_KEY = Deno.env.get("PAYMOB_API_KEY")!;
const INTEGRATION_ID = Deno.env.get("PAYMOB_INTEGRATION_ID")!;
const IFRAME_ID = Deno.env.get("PAYMOB_IFRAME_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPACE_PRICE_CENTS = parseInt(Deno.env.get("SPACE_PRICE_CENTS") ?? "9900", 10);

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
    const scholarshipId = kind === "ticket" ? String(body.scholarship_id ?? "") : "";
    if (kind === "ticket" && !scholarshipId) return json({ error: "bad_request" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: prov } = await admin.from("payment_providers").select("*").eq("provider", "paymob").maybeSingle();
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
      user_id: user.id, provider: "paymob", kind, item_ref: itemRef,
      amount_cents: amountCents, currency, status: "pending",
    }).select("id").single();
    if (payErr || !pay) {
      if (/duplicate|unique/i.test(payErr?.message || "")) return json({ error: "already_in_progress" }, 409);
      throw payErr || new Error("ledger_insert");
    }

    // Paymob: auth → order → payment_key → iframe URL
    const authRes = await fetch(PAYMOB + "/api/auth/tokens", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: API_KEY }),
    });
    const auth = await authRes.json();
    if (!authRes.ok || !auth.token) throw new Error("paymob_auth");

    const orderRes = await fetch(PAYMOB + "/api/ecommerce/orders", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: auth.token, delivery_needed: false,
        amount_cents: amountCents, currency, merchant_order_id: pay.id, items: [],
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok || !order.id) throw new Error("paymob_order");

    const billing = {
      apartment: "NA", email: user.email || "NA", floor: "NA", first_name: "NA",
      street: "NA", building: "NA", phone_number: "NA", shipping_method: "NA",
      postal_code: "NA", city: "NA", country: "NA", last_name: "NA", state: "NA",
    };
    const keyRes = await fetch(PAYMOB + "/api/acceptance/payment_keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_token: auth.token, amount_cents: amountCents, expiration: 3600,
        order_id: order.id, billing_data: billing, currency,
        integration_id: Number(INTEGRATION_ID),
      }),
    });
    const key = await keyRes.json();
    if (!keyRes.ok || !key.token) throw new Error("paymob_key");

    await admin.from("payments").update({ provider_ref: String(order.id), updated_at: new Date().toISOString() }).eq("id", pay.id);

    const url = `${PAYMOB}/api/acceptance/iframes/${IFRAME_ID}/payment?payment_token=${key.token}`;
    return json({ url });
  } catch (e) {
    console.error(e);
    return json({ error: "provider_error" }, 502);
  }
});
