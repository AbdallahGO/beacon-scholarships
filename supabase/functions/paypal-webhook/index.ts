// paypal-webhook Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// PUBLIC (no JWT) — PayPal calls it. Trust comes from signature verification.
// Verifies the webhook signature, then on an approved/captured order marks the
// payments row paid (idempotent on provider_ref) and books the ticket/space.
// Booking is done ONLY here (the redirect is never trusted).
//
// Self-contained. Deploy with JWT verification OFF:
//   supabase functions deploy paypal-webhook --no-verify-jwt
// Secrets: PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_WEBHOOK_ID (optional PAYPAL_ENV=live).

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const PP_BASE = (Deno.env.get("PAYPAL_ENV") === "live")
  ? "https://api-m.paypal.com"
  : "https://api-m.sandbox.paypal.com";
const PP_ID = Deno.env.get("PAYPAL_CLIENT_ID")!;
const PP_SECRET = Deno.env.get("PAYPAL_SECRET")!;
const PP_WEBHOOK_ID = Deno.env.get("PAYPAL_WEBHOOK_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COOLDOWN_MS = 2 * 60 * 1000; // TESTING: 2 min (production = 3 days)

function ticketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `BCN-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

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

// ---- shared booking: mark paid + create the ticket/space (idempotent) -------
// Re-derives tier/amount/institution + reveal fields from the DB so no booking
// snapshot needs to travel through the gateway. The client UI falls back to the
// static catalogue for title/institution when those columns are null.
async function markPaidAndBook(admin: any, pay: any) {
  if (pay.status === "paid") return;
  await admin.from("payments").update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", pay.id).neq("status", "paid");

  if (pay.kind === "ticket") {
    const { data: ex } = await admin.from("tickets").select("id")
      .eq("user_id", pay.user_id).eq("scholarship_id", pay.item_ref).neq("status", "void").limit(1);
    let ticketId = ex && ex.length ? ex[0].id : null;
    if (!ticketId) {
      const { data: prof } = await admin.from("profiles").select("*").eq("user_id", pay.user_id).maybeSingle();
      const fullName = prof ? (prof.full_name || [prof.first_name, prof.last_name].filter(Boolean).join(" ")) : "";
      const { data: rank } = await admin.from("scholarship_rankings")
        .select("tier,amount_cents,institution").eq("scholarship_id", pay.item_ref).maybeSingle();
      const cooldownEnd = new Date(Date.now() + COOLDOWN_MS).toISOString();
      const code = ticketCode();
      const { data: ins, error: insErr } = await admin.from("tickets").insert({
        ticket_code: code, user_id: pay.user_id, scholarship_id: pay.item_ref,
        scholarship_title: null, institution: rank?.institution ?? null,
        ranking_tier: rank?.tier ?? "out_of_rank", amount_cents: rank?.amount_cents ?? 15000, currency: "usd",
        stripe_session_id: "pay_" + pay.id, status: "active", cooldown_end: cooldownEnd,
        provider: pay.provider, payment_id: pay.id,
        reveal_full_name: fullName || null,
        reveal_country: null,
        reveal_nationality: prof?.nationality ?? null,
        reveal_degree: prof?.degree ?? null,
        reveal_field_of_interest: prof?.field_of_interest ?? null,
      }).select("id").maybeSingle();
      if (insErr && !/duplicate|unique/i.test(insErr.message)) { console.error("ticket insert failed", insErr); }
      ticketId = ins?.id ?? null;
      await admin.from("notifications").insert({
        user_id: pay.user_id, type: "booking", dedupe_key: "booking:" + pay.id,
        ref: "account.html#ticket",
        payload: { scholarship_title: null, ticket_code: code, available_at: cooldownEnd },
      });
    }
    if (ticketId) await admin.from("payments").update({ ticket_id: ticketId }).eq("id", pay.id);
  } else if (pay.kind === "space") {
    const sess = "pay_" + pay.id;
    const { data: ex } = await admin.from("space_purchases").select("stripe_session_id").eq("stripe_session_id", sess).limit(1);
    if (!(ex && ex.length)) {
      const { error: spErr } = await admin.from("space_purchases").insert({
        stripe_session_id: sess, user_id: pay.user_id, provider: pay.provider, payment_id: pay.id,
      });
      if (!spErr) {
        const { data: prof } = await admin.from("profiles").select("ticket_capacity").eq("user_id", pay.user_id).maybeSingle();
        await admin.from("profiles").update({ ticket_capacity: (prof?.ticket_capacity ?? 1) + 1 }).eq("user_id", pay.user_id);
      }
    }
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();

  // 1) verify signature
  try {
    const token = await ppToken();
    const verifyRes = await fetch(PP_BASE + "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: req.headers.get("paypal-auth-algo"),
        cert_url: req.headers.get("paypal-cert-url"),
        transmission_id: req.headers.get("paypal-transmission-id"),
        transmission_sig: req.headers.get("paypal-transmission-sig"),
        transmission_time: req.headers.get("paypal-transmission-time"),
        webhook_id: PP_WEBHOOK_ID,
        webhook_event: JSON.parse(raw),
      }),
    });
    const v = await verifyRes.json();
    if (v.verification_status !== "SUCCESS") {
      console.error("paypal signature mismatch", v);
      return new Response("invalid_signature", { status: 400 });
    }
  } catch (e) {
    console.error("paypal verify error", e);
    return new Response("invalid_signature", { status: 400 });
  }

  const event = JSON.parse(raw);
  const type = event.event_type as string;
  const resource = event.resource || {};
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    // resolve the order id + our payments.id (custom_id) from the event shape
    let orderId: string | null = null;
    let customId: string | null = null;
    if (type === "CHECKOUT.ORDER.APPROVED" || type === "CHECKOUT.ORDER.COMPLETED") {
      orderId = resource.id || null;
      customId = resource.purchase_units?.[0]?.custom_id || null;
    } else if (type?.startsWith("PAYMENT.CAPTURE.")) {
      customId = resource.custom_id || null;
      orderId = resource.supplementary_data?.related_ids?.order_id || null;
    }

    // look up the ledger row
    let pay: any = null;
    if (customId) {
      const { data } = await admin.from("payments").select("*").eq("id", customId).maybeSingle();
      pay = data;
    }
    if (!pay && orderId) {
      const { data } = await admin.from("payments").select("*").eq("provider", "paypal").eq("provider_ref", orderId).maybeSingle();
      pay = data;
    }
    if (!pay) return new Response("ok"); // unknown / not ours

    if (type === "CHECKOUT.ORDER.APPROVED") {
      // capture, then book once the capture completes
      const token = await ppToken();
      const capRes = await fetch(PP_BASE + `/v2/checkout/orders/${orderId}/capture`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      });
      const cap = await capRes.json();
      if (capRes.ok && cap.status === "COMPLETED") {
        await markPaidAndBook(admin, pay);
      }
    } else if (type === "PAYMENT.CAPTURE.COMPLETED" || type === "CHECKOUT.ORDER.COMPLETED") {
      await markPaidAndBook(admin, pay);
    } else if (type === "PAYMENT.CAPTURE.DENIED" || type === "PAYMENT.CAPTURE.DECLINED") {
      if (pay.status === "pending") {
        await admin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
      }
    } else if (type === "CHECKOUT.ORDER.VOIDED") {
      if (pay.status === "pending") {
        await admin.from("payments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", pay.id);
      }
    }
  } catch (e) {
    console.error("paypal webhook handler error", e);
  }

  return new Response("ok");
});
