# Contract: Edge Functions & Stripe Integration

Three Deno/TypeScript Supabase Edge Functions. Deployed by the **owner via the dashboard** (MCP can't deploy). Source lives in `supabase/functions/<slug>/index.ts`.

**Secrets (owner sets in dashboard → Edge Functions → Secrets):**
`STRIPE_SECRET_KEY` (`sk_test_…` from `Strip-sandbox.text`), `STRIPE_WEBHOOK_SECRET` (`whsec_…` from the Stripe webhook endpoint), optional `RESEND_API_KEY` + `OWNER_EMAIL`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the runtime.

**Auth model:** `ticket-checkout` and `space-checkout` require the caller's Supabase JWT (sent as `Authorization: Bearer <access_token>`); they verify the user with an anon client, then use a **service-role** client for trusted reads/price. `stripe-webhook` is public but **verifies the Stripe signature**; it is the only writer of `tickets`/capacity.

---

## 1) `POST /functions/v1/ticket-checkout`

Creates a Stripe Checkout Session for booking one ticket.

**Request body**
```json
{ "scholarship_id": "6049", "origin": "https://host/scholarship.html?id=6049" }
```
**Headers**: `Authorization: Bearer <supabase access token>`

**Server logic**
1. Verify JWT → `user`. If none → `401`.
2. Service-role read `profiles` for the user. Require a complete-enough profile (full/first+last name present) — else `409 { error: "profile_incomplete" }` (client routes to Profile).
3. **One-per-scholarship**: if a non-void ticket exists for `(user_id, scholarship_id)` → `409 { error: "already_booked" }` (FR-014b).
4. **Capacity**: count tickets with `cooldown_end > now()` for the user; if `>= profiles.ticket_capacity` → `409 { error: "at_capacity" }` (FR-014).
5. **Price** (server-authoritative, FR-008): read `scholarship_rankings` by `scholarship_id`; missing → `tier=out_of_rank, amount_cents=15000`.
6. Resolve `scholarship_title`/`institution` from the request-validated catalogue id (passed in body or looked up from a server copy) for the snapshot.
7. Create Stripe Checkout Session: `mode=payment`, one `line_item` with `unit_amount = amount_cents`, `currency=usd`, `quantity=1`, product name `Scholarship Ticket — <title>`; `success_url = <origin>#ticket-booked`, `cancel_url = <origin>`; `client_reference_id = user.id`; `metadata = { kind: "ticket", user_id, scholarship_id, tier, amount_cents, scholarship_title, institution, reveal_* snapshot }`. Set `payment_intent_data.metadata` likewise. Mark `customer_email` from the user.
8. Respond `200 { url: session.url }`.

**Response**
```json
{ "url": "https://checkout.stripe.com/c/pay/cs_test_…" }
```
**Errors**: `401 unauthorized`, `409 { error }` (profile_incomplete | already_booked | at_capacity), `400 bad_request`, `500`.

> The price and all booking eligibility are decided **here on the server**; the client's displayed price (from `RANKING_INDEX`) is informational only.

---

## 2) `POST /functions/v1/space-checkout`

Creates a Checkout Session for one **+1 ticket space** (permanent slot, FR-015).

**Request**: `{ "origin": "https://host/account.html#ticket" }` + JWT.
**Logic**: verify user; create `mode=payment` session for `SPACE_PRICE_CENTS` (default **9900**, owner-confirmable); `metadata = { kind: "space", user_id }`; `success_url = <origin>` , `cancel_url = <origin>`.
**Response**: `{ "url": "…" }`.

---

## 3) `POST /functions/v1/stripe-webhook`

The **only** trusted writer. Public endpoint; verifies `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`.

**Handles** `checkout.session.completed` (and ignores others with `200`):
- Read `session.metadata.kind`.
- **kind = "ticket"**:
  1. Idempotency: if a `tickets` row with this `stripe_session_id` exists → `200` (no-op).
  2. Re-validate capacity & one-per-scholarship server-side (defensive; the unique partial index is the hard guard — on conflict, no-op `200`).
  3. Generate `ticket_code` (e.g., `BCN-` + base32 of random bytes, formatted `BCN-XXXX-XXXX`), unique.
  4. Insert ticket: `status='active'`, `booked_at=now()`, `cooldown_end=now()+interval '3 days'`, `amount_cents`/`ranking_tier`/snapshots from metadata, `stripe_payment_intent=session.payment_intent`.
  5. If `RESEND_API_KEY`+`OWNER_EMAIL` set → send owner email (user, scholarship, tier/price, ticket_code). Failure is logged and ignored (does not fail the webhook).
- **kind = "space"**:
  1. Idempotency: if `space_purchases` has this `stripe_session_id` → `200`.
  2. Insert `space_purchases` row, then `update profiles set ticket_capacity = ticket_capacity + 1 where user_id = metadata.user_id`.

**Response**: `200` on success/no-op; `400` on signature failure.

**Stripe dashboard setup (owner, test mode)**: add a webhook endpoint pointing to the deployed `stripe-webhook` URL, subscribe to `checkout.session.completed`, copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## Client config additions (`supabase-config.js`)

```js
window.STRIPE_PUBLISHABLE_KEY = "pk_test_…";          // publishable only — safe to commit-ish (it's a test key)
window.FUNCTIONS_BASE = window.SUPABASE_URL + "/functions/v1";
window.SPACE_PRICE_CENTS = 9900;                       // display only; server is authoritative
```

The client never calls Stripe directly; it `fetch`es `ticket-checkout`/`space-checkout` with the user's access token and redirects to the returned `url`.

## Security checklist
- No `sk_*` / `service_role` in any client file or `supabase-config.js`.
- Price, capacity, one-per-scholarship, and cooldown are server-decided; client values are display-only.
- Webhook verifies signature; ticket creation idempotent (`stripe_session_id` unique + unique partial index).
- Payments are **non-refundable**; no void/refund code path (clarification 2026-06-13).
