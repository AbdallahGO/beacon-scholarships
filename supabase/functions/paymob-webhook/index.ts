// paymob-webhook Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// PUBLIC (no JWT). Paymob posts the transaction callback with an `hmac` query
// param; we recompute the HMAC-SHA512 over the ordered field set and compare.
// On a successful transaction we mark the payments row paid (idempotent) and
// book the ticket/space. Booking is done ONLY here.
//
// Self-contained. Deploy with JWT verification OFF:
//   supabase functions deploy paymob-webhook --no-verify-jwt
// Secrets: PAYMOB_HMAC_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const HMAC_SECRET = Deno.env.get("PAYMOB_HMAC_SECRET")!;
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

async function hmacSha512Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
        reveal_full_name: fullName || null, reveal_country: null,
        reveal_nationality: prof?.nationality ?? null, reveal_degree: prof?.degree ?? null,
        reveal_field_of_interest: prof?.field_of_interest ?? null,
      }).select("id").maybeSingle();
      if (insErr && !/duplicate|unique/i.test(insErr.message)) console.error("ticket insert failed", insErr);
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
  const url = new URL(req.url);
  const hmacParam = url.searchParams.get("hmac") || "";
  const payload = await req.json().catch(() => null);
  if (!payload || !payload.obj) return new Response("ok");
  const o = payload.obj;

  // recompute HMAC over the documented ordered field set
  const concat = [
    o.amount_cents, o.created_at, o.currency, o.error_occured, o.has_parent_transaction,
    o.id, o.integration_id, o.is_3d_secure, o.is_auth, o.is_capture, o.is_refunded,
    o.is_standalone_payment, o.is_voided, o.order?.id, o.owner, o.pending,
    o.source_data?.pan, o.source_data?.sub_type, o.source_data?.type, o.success,
  ].map((v) => String(v)).join("");
  const expected = await hmacSha512Hex(HMAC_SECRET, concat);
  if (expected.toLowerCase() !== hmacParam.toLowerCase()) {
    console.error("paymob hmac mismatch");
    return new Response("invalid_signature", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const orderId = o.order?.id != null ? String(o.order.id) : null;
    const merchantOrderId = o.order?.merchant_order_id || null; // = our payments.id
    let pay: any = null;
    if (merchantOrderId) {
      const { data } = await admin.from("payments").select("*").eq("id", merchantOrderId).maybeSingle();
      pay = data;
    }
    if (!pay && orderId) {
      const { data } = await admin.from("payments").select("*").eq("provider", "paymob").eq("provider_ref", orderId).maybeSingle();
      pay = data;
    }
    if (!pay) return new Response("ok");

    const success = o.success === true || String(o.success) === "true";
    const errored = o.error_occured === true || String(o.error_occured) === "true";
    if (success && !errored) {
      await markPaidAndBook(admin, pay);
    } else if (pay.status === "pending") {
      await admin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    }
  } catch (e) {
    console.error("paymob webhook handler error", e);
  }
  return new Response("ok");
});
