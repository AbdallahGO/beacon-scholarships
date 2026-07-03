# Contract: Payment Edge Functions (per provider × both paid flows)

Server-side money movement for US6. One **checkout** + one **webhook** function per new provider (`paypal`, `paymob`, `kashier`), mirroring the existing Stripe `ticket-checkout`/`space-checkout`/`stripe-webhook`. Each checkout handles **both** paid flows via a `kind` parameter. All run on Supabase Edge Functions (Deno/TS) with the **service-role** client; secrets come from `Deno.env` only.

## Shared checkout contract — `POST /{provider}-checkout`

**Auth**: requires the caller's Supabase JWT (signed-in user), same as `ticket-checkout` today.

**Request body**: `{ kind: 'ticket' | 'space', scholarship_id?: string }` (`scholarship_id` required when `kind='ticket'`).

**Steps**:
1. Resolve the authenticated `user_id` from the JWT.
2. Read the provider row; if `enabled=false` → `403 provider_disabled` (FR-026).
3. **Double-pay guard** (FR-039/R12): if the item (`kind`+`item_ref`) is already booked for this user (`tickets`/`space_purchases`) or has a `pending`/`paid` `payments` row → `409 already_in_progress` / `already_booked`.
4. Compute the base USD amount server-side: ticket = `scholarship_rankings.amount_cents` for the resolved tier (fallback 15000); space = 9900. Then `amount_cents = round(base_usd × provider.fx_rate)`, `currency = provider.currency` (FR-021/R13).
5. Insert a `payments` row `status='pending'` (provider, kind, item_ref, amount, currency, user_id).
6. Create the gateway order/session (provider API, secrets from env), attaching our `payments.id` as the merchant/order reference; persist the gateway id into `payments.provider_ref`.
7. Return `{ url }` — the gateway redirect/approve URL. The client redirects.

**Errors**: `401 unauthenticated`, `403 provider_disabled`, `409 already_in_progress|already_booked`, `400 bad_request`, `502 provider_error`.

**Never**: trust a client-supplied amount; expose any secret; book the item here.

## Shared webhook contract — `POST /{provider}-webhook`

**Auth**: **public** (no JWT — gateways call it). Trust comes from **signature verification**, not auth.

**Steps**:
1. **Verify signature** with the provider's secret/scheme (R15):
   - PayPal: verify-webhook-signature using `PAYPAL_WEBHOOK_ID` + transmission headers.
   - Paymob: recompute **HMAC** (`PAYMOB_HMAC_SECRET`) over the ordered field set; compare.
   - Kashier: recompute the response **HMAC** (`KASHIER_SECRET`); compare.
   - On mismatch → `400 invalid_signature`, do nothing (FR-028).
2. Map the event to a terminal status (`paid` / `failed` / `cancelled`) and extract the gateway reference.
3. Look up `payments` by `(provider, provider_ref)`. **Idempotent**: if already `paid`, return `200` and do nothing (FR-024/SC-010).
4. On **paid**, in one transaction: set `payments.status='paid'`; **book the item** — create the `tickets` row (reusing feature-004 booking logic: tier/amount/cooldown) or the `space_purchases` row; set the item's `provider` + `payment_id`; set `payments.ticket_id` for tickets.
5. On **failed/cancelled**: set the status; book nothing (the user may retry — FR-040).
6. Return `200` quickly (gateways retry non-2xx — idempotency in step 3 makes retries safe).

**Booking is done ONLY here** after verification (FR-022/R16). The redirect return page never books.

## Stripe additions (existing functions)

- `ticket-checkout` / `space-checkout`: also insert a `payments(pending)` row (provider `stripe`, currency `usd`, `fx_rate` 1.0) keyed by the Stripe session id, and apply the same double-pay guard.
- `stripe-webhook`: on `checkout.session.completed`, mark the matching `payments` row `paid` (idempotent) and set `tickets/space_purchases.provider='stripe'` + `payment_id`. Existing booking behavior is otherwise unchanged.

## Result page (client)

After redirect-return, the client shows a result view that **reads `payments` status** (and may poll for a few seconds) — it never marks paid itself (FR-022). Pending → "We're confirming your payment…"; paid → success + booking; failed/cancelled → "Payment not completed — you can try again" (offers the provider picker again, FR-040).

## Secrets (set via `supabase secrets set`, never in DB/client)

`PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID`; `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID`, `PAYMOB_IFRAME_ID`; `KASHIER_API_KEY`, `KASHIER_SECRET`, `KASHIER_MERCHANT_ID`. Existing: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. (Exact set confirmed per provider docs during implementation.)
