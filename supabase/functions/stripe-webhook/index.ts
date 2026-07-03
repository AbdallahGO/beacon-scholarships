// stripe-webhook Edge Function (specs/004-ticket-booking, contract edge-functions.md §3; US1/T010).
// The ONLY trusted writer of tickets/capacity. Verifies the Stripe signature and,
// on checkout.session.completed, idempotently creates a ticket (kind="ticket").
// Extended later: US3/T024 (kind="space" → capacity), US8/T035 (owner email).
//
// Deploy with JWT verification OFF (Stripe signs the request; we verify it):
//   supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const COOLDOWN_MS = 2 * 60 * 1000; // TESTING: 2 minutes (production/FR-009/011 = 3 days → 3 * 24 * 60 * 60 * 1000)

// ambiguity-free base32 (no I/O/0/1) ticket code: BCN-XXXX-XXXX
function ticketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return `BCN-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok");
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    console.error("signature verification failed", e);
    return new Response("bad signature", { status: 400 });
  }

  if (event.type !== "checkout.session.completed") return new Response("ok");

  const session = event.data.object as Stripe.Checkout.Session;
  const m = (session.metadata ?? {}) as Record<string, string>;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (m.kind === "ticket") {
      // idempotency: ignore replays of the same session
      const { data: ex } = await admin.from("tickets").select("id").eq("stripe_session_id", session.id).limit(1);
      if (ex && ex.length) return new Response("ok");

      const cooldownEnd = new Date(Date.now() + COOLDOWN_MS).toISOString();
      const code = ticketCode();
      const { data: tk, error } = await admin.from("tickets").insert({
        ticket_code: code,
        user_id: m.user_id,
        scholarship_id: m.scholarship_id,
        scholarship_title: m.scholarship_title || null,
        institution: m.institution || null,
        ranking_tier: m.tier,
        amount_cents: parseInt(m.amount_cents || "0", 10),
        currency: session.currency || "usd",
        stripe_session_id: session.id,
        stripe_payment_intent: (session.payment_intent as string) || null,
        status: "active",
        cooldown_end: cooldownEnd,
        provider: "stripe",
        reveal_full_name: m.reveal_full_name || null,
        reveal_country: m.reveal_country || null,
        reveal_nationality: m.reveal_nationality || null,
        reveal_degree: m.reveal_degree || null,
        reveal_field_of_interest: m.reveal_field_of_interest || null,
      }).select("id").maybeSingle();
      // a unique-index conflict (one-per-scholarship / dup session) is a benign no-op
      if (error && !/duplicate|unique/i.test(error.message)) console.error("ticket insert failed", error);

      // feature-006: mark the payments ledger row paid + link it to the ticket
      const { data: pay } = await admin.from("payments").select("id,status")
        .eq("provider", "stripe").eq("provider_ref", session.id).maybeSingle();
      if (pay) {
        if (pay.status !== "paid") {
          await admin.from("payments").update({ status: "paid", updated_at: new Date().toISOString() })
            .eq("id", pay.id).neq("status", "paid");
        }
        if (tk?.id) {
          await admin.from("payments").update({ ticket_id: tk.id }).eq("id", pay.id);
          await admin.from("tickets").update({ payment_id: pay.id }).eq("id", tk.id);
        }
      }

      // booking confirmation in the user's inbox (feature 005, FR-008/009).
      // Idempotent via dedupe_key; a duplicate-key conflict on webhook re-delivery is benign.
      const { error: noteErr } = await admin.from("notifications").insert({
        user_id: m.user_id,
        type: "booking",
        dedupe_key: "booking:" + session.id,
        ref: "account.html#ticket",
        payload: {
          scholarship_title: m.scholarship_title || null,
          ticket_code: code,
          available_at: cooldownEnd,
        },
      });
      if (noteErr && !/duplicate|unique/i.test(noteErr.message)) console.error("booking notification insert failed", noteErr);
    } else if (m.kind === "space") {
      // +1 ticket space (US3/T024): idempotent via the space_purchases ledger
      const { data: ex } = await admin.from("space_purchases").select("stripe_session_id").eq("stripe_session_id", session.id).limit(1);
      if (ex && ex.length) return new Response("ok");
      const { error: ledgerErr } = await admin.from("space_purchases").insert({ stripe_session_id: session.id, user_id: m.user_id });
      if (ledgerErr) {
        if (/duplicate|unique/i.test(ledgerErr.message)) return new Response("ok"); // replay
        console.error("space ledger insert failed", ledgerErr);
        return new Response("ok");
      }
      // keep the display column in step (authoritative capacity is derived from the ledger)
      const { data: prof } = await admin.from("profiles").select("ticket_capacity").eq("user_id", m.user_id).maybeSingle();
      await admin.from("profiles").update({ ticket_capacity: (prof?.ticket_capacity ?? 1) + 1 }).eq("user_id", m.user_id);

      // feature-006: mark the payments ledger row paid + link the purchase
      const { data: pay } = await admin.from("payments").select("id,status")
        .eq("provider", "stripe").eq("provider_ref", session.id).maybeSingle();
      if (pay) {
        if (pay.status !== "paid") {
          await admin.from("payments").update({ status: "paid", updated_at: new Date().toISOString() })
            .eq("id", pay.id).neq("status", "paid");
        }
        await admin.from("space_purchases").update({ provider: "stripe", payment_id: pay.id }).eq("stripe_session_id", session.id);
      }
    }
    // owner email on kind="ticket" added in US8/T035.
  } catch (e) {
    console.error("webhook handler error", e);
    // still 200 so Stripe doesn't infinitely retry a logic bug; investigate via logs
  }

  return new Response("ok");
});

