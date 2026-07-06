// kashier-webhook Edge Function (specs/006-admin-dashboard, contract payment-functions.md).
// PUBLIC (no JWT). Kashier posts the payment result; we recompute the HMAC-SHA256
// signature over the documented signatureKeys and compare to the supplied
// signature. On SUCCESS we mark the payments row paid (idempotent) and book the
// ticket/space. Booking is done ONLY here.
//
// Self-contained. Deploy with JWT verification OFF:
//   supabase functions deploy kashier-webhook --no-verify-jwt
// Secrets: KASHIER_SECRET.

import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const SECRET = Deno.env.get("KASHIER_SECRET")!;
const API_KEY = Deno.env.get("KASHIER_API_KEY") ?? ""; // only used by mismatch diagnostics
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

async function hmacSha256Hex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Build the string Kashier signs: the signatureKeys' key=value pairs joined by
// "&". Kashier's docs say to order the keys ALPHABETICALLY; encoding is ambiguous
// in their docs (their own example shows raw, unencoded values), so the accepted
// canonical form is sort+raw and the other forms exist only for the mismatch
// diagnostic that pins down the exact scheme on the first real callback.
type Enc = "raw" | "enc" | "plus";
function buildSigString(data: Record<string, unknown>, keys: string[], sort: boolean, enc: Enc): string {
  const ks = sort ? [...keys].sort() : [...keys];
  return ks.map((k) => {
    const v = data[k] == null ? "" : String(data[k]);
    if (enc === "enc") return `${k}=${encodeURIComponent(v)}`;
    if (enc === "plus") return `${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`;
    return `${k}=${v}`;
  }).join("&");
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
  const body = await req.json().catch(() => null);
  const data = body?.data || body;
  if (!data) return new Response("ok");

  // Verify the signature. Kashier signs the signatureKeys' key=value pairs,
  // ordered ALPHABETICALLY, with the payment secret key (HMAC-SHA256), and sends
  // the result in `signature` / the x-kashier-signature header.
  const keys: string[] = Array.isArray(data.signatureKeys) ? data.signatureKeys : [];
  const supplied = String(data.signature || req.headers.get("x-kashier-signature") || "").toLowerCase();
  if (!keys.length || !supplied) {
    console.error("kashier: missing signatureKeys or signature");
    return new Response("invalid_signature", { status: 400 });
  }
  // Canonical accepted form: sorted keys, raw (unencoded) values, secret key.
  const expected = (await hmacSha256Hex(SECRET, buildSigString(data, keys, true, "raw"))).toLowerCase();
  if (expected !== supplied) {
    // Mismatch: log ONLY which construction (if any) reproduces the supplied
    // signature so the exact scheme can be pinned and the canonical form above
    // corrected. We never ACCEPT a non-canonical form — this is diagnostics only.
    let matched = "NONE";
    for (const sort of [true, false]) {
      for (const enc of ["raw", "enc", "plus"] as const) {
        for (const [kn, kv] of [["SECRET", SECRET], ["API_KEY", API_KEY]] as const) {
          if (!kv) continue;
          const h = (await hmacSha256Hex(kv, buildSigString(data, keys, sort, enc))).toLowerCase();
          if (h === supplied) { matched = `key=${kn} sort=${sort} enc=${enc}`; break; }
        }
        if (matched !== "NONE") break;
      }
      if (matched !== "NONE") break;
    }
    console.error("kashier signature mismatch", JSON.stringify({ signatureKeys: keys, matchedConstruction: matched }));
    return new Response("invalid_signature", { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const merchantOrderId = data.merchantOrderId || data.orderReference || null; // = our payments.id
    let pay: any = null;
    if (merchantOrderId) {
      const { data: row } = await admin.from("payments").select("*").eq("id", merchantOrderId).maybeSingle();
      pay = row;
    }
    if (!pay && merchantOrderId) {
      const { data: row } = await admin.from("payments").select("*").eq("provider", "kashier").eq("provider_ref", merchantOrderId).maybeSingle();
      pay = row;
    }
    if (!pay) return new Response("ok");

    const status = String(data.status || "").toUpperCase();
    if (status === "SUCCESS") {
      await markPaidAndBook(admin, pay);
    } else if (pay.status === "pending" && (status === "FAILED" || status === "FAILURE" || status === "DECLINED")) {
      await admin.from("payments").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", pay.id);
    }
  } catch (e) {
    console.error("kashier webhook handler error", e);
  }
  return new Response("ok");
});
