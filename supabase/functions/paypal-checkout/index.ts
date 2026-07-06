// paypal-checkout Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// Verifies the caller JWT, enforces the double-pay guard, computes the price
// SERVER-side (base_usd × fx_rate), inserts a payments(pending) row, and creates
// a PayPal Orders v2 order. Booking happens ONLY in paypal-webhook after capture.
//
// Self-contained (no ../_shared import) so it deploys via the dashboard paste box.
// Deploy: supabase functions deploy paypal-checkout
// Secrets: PAYPAL_CLIENT_ID, PAYPAL_SECRET (optional PAYPAL_ENV=live, SPACE_PRICE_CENTS).

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PP_BASE = (Deno.env.get("PAYPAL_ENV") === "live")
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";
const PP_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PP_SECRET = Deno.env.get("PAYPAL_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SPACE_PRICE_CENTS = parseInt(Deno.env.get("SPACE_PRICE_CENTS") ?? "9900", 10);

async function ppToken(): Promise<string> {
  const res = await fetch(PP_BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(PP_ID + ":" + PP_SECRET),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const d = await res.json();
  if (!res.ok) throw new Error("paypal_token");
  return d.access_token;
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

    // provider must be enabled (FR-026)
    const { data: prov } = await admin.from("payment_providers").select("*").eq("provider", "paypal").maybeSingle();
    if (!prov || !prov.enabled) return json({ error: "provider_disabled" }, 403);

    // double-pay guard (FR-039). Pending rows older than STALE_MS are abandoned
    // checkouts (tab closed, funding declined, …) — auto-cancel them instead of
    // blocking the scholarship forever with 409 already_in_progress.
    const STALE_MS = 60 * 60 * 1000;
    const isFresh = (r: any) =>
      r.status === "paid" || Date.now() - new Date(r.created_at).getTime() < STALE_MS;
    async function cancelStale(rows: any[]) {
      const ids = rows.filter((r) => r.status === "pending" && !isFresh(r)).map((r) => r.id);
      if (ids.length) {
        await admin.from("payments")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .in("id", ids).eq("status", "pending");
      }
    }
    if (kind === "ticket") {
      const { data: booked } = await admin.from("tickets").select("id")
        .eq("user_id", user.id).eq("scholarship_id", scholarshipId).neq("status", "void").limit(1);
      if (booked && booked.length) return json({ error: "already_booked" }, 409);
      const { data: active } = await admin.from("payments").select("id,status,created_at")
        .eq("user_id", user.id).eq("kind", "ticket").eq("item_ref", scholarshipId)
        .in("status", ["pending", "paid"]);
      if ((active ?? []).some(isFresh)) return json({ error: "already_in_progress" }, 409);
      await cancelStale(active ?? []);
    } else {
      const { data: active } = await admin.from("payments").select("id,status,created_at")
        .eq("user_id", user.id).eq("kind", "space").eq("status", "pending");
      if ((active ?? []).some(isFresh)) return json({ error: "already_in_progress" }, 409);
      await cancelStale(active ?? []);
    }

    // server-authoritative amount: base USD → provider currency
    let baseUsd = SPACE_PRICE_CENTS;
    if (kind === "ticket") {
      const { data: rank } = await admin.from("scholarship_rankings").select("amount_cents").eq("scholarship_id", scholarshipId).maybeSingle();
      baseUsd = rank?.amount_cents ?? 15000;
    }
    const fx = Number(prov.fx_rate) || 1;
    const amountCents = Math.round(baseUsd * fx);
    const currency = String(prov.currency || "USD").toUpperCase();
    const itemRef = kind === "ticket" ? scholarshipId : crypto.randomUUID();

    // insert pending ledger row (unique active-item index backstops the guard)
    const { data: pay, error: payErr } = await admin.from("payments").insert({
      user_id: user.id, provider: "paypal", kind, item_ref: itemRef,
      amount_cents: amountCents, currency, status: "pending",
    }).select("id").single();
    if (payErr || !pay) {
      if (/duplicate|unique/i.test(payErr?.message || "")) return json({ error: "already_in_progress" }, 409);
      throw payErr || new Error("ledger_insert");
    }

    // create the PayPal order
    const token = await ppToken();
    const value = (amountCents / 100).toFixed(2);
    const ordRes = await fetch(PP_BASE + "/v2/checkout/orders", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          reference_id: pay.id,
          custom_id: pay.id,
          description: kind === "ticket" ? "Scholarship ticket" : "Extra ticket space (+1)",
          amount: { currency_code: currency, value },
        }],
        application_context: {
          return_url: base + "#pay-return",
          cancel_url: base + "#pay-cancel",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
        },
      }),
    });
    const ord = await ordRes.json();
    if (!ordRes.ok || !ord.id) {
      await admin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
      return json({ error: "provider_error" }, 502);
    }
    await admin.from("payments").update({ provider_ref: ord.id, updated_at: new Date().toISOString() }).eq("id", pay.id);

    const approve = (ord.links || []).find((l: any) => l.rel === "approve");
    if (!approve) return json({ error: "provider_error" }, 502);
    return json({ url: approve.href });
  } catch (e) {
    console.error(e);
    return json({ error: "server_error" }, 500);
  }
});
