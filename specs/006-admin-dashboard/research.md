# Phase 0 Research: Admin Dashboard & Multi-Provider Payments

All Technical Context items were resolvable from the existing codebase (features 003–005) and the clarified spec; there were no open `NEEDS CLARIFICATION` markers. Decisions below lock the approach. R1–R9 cover the admin dashboard (Part A); R10–R17 cover multi-provider payments (Part B).

## R1 — Admin gating: client check + server enforcement

**Decision**: The client decides whether to render the dashboard by selecting the caller's own row from `public.admins` (allowed today by the `admins self select` RLS policy: `auth.uid() = user_id`). If a row exists → render; otherwise → show a "not authorized" state. This is **convenience only**. The actual boundary is server-side: every privileged read is behind an `admin select all` RLS policy and every write is a `SECURITY DEFINER` function that re-checks `exists (select 1 from public.admins where user_id = auth.uid())` and raises otherwise.

**Rationale**: Defense in depth — hiding the UI is never trusted (FR-002/FR-003/SC-007). RLS + definer self-guards mean a non-admin who loads `admin.html` or calls an RPC directly gets nothing and cannot send. Reuses the policy/table already shipped in feature 005.

**Alternatives considered**: (a) A dedicated edge function as an admin API gateway — rejected: adds a deploy target and JWT-verification config for no benefit over RLS/RPC. (b) A server-rendered admin app — rejected: the project is a static site with no server.

## R2 — Sent-message log as a dedicated table (not derived from inboxes)

**Decision**: Add `public.admin_messages` (one row per admin send: sender, target type, target user/email, title, body, recipient count, timestamp). Every send path writes one log row.

**Rationale**: Clarification Q1 — the log must survive recipients deleting their inbox copies and must distinguish "one broadcast to N people" from "N individual sends," which per-recipient `notifications` rows cannot do reliably. It is also the authoritative source for the Overview "messages sent" count (FR-016) and the send-history view (FR-011b).

**Alternatives considered**: Deriving counts/history from `notifications` rows of `type='admin'` — rejected (lossy on deletion; can't group a broadcast; conflates system vs admin intent).

## R3 — Email→user resolution inside a SECURITY DEFINER function

**Decision**: Single-send by email (`admin_send_to_email`) resolves the address inside the definer function by querying `auth.users` (case-insensitive), then sends. If no match, it raises `recipient_not_found`.

**Rationale**: The browser (anon/authenticated role) cannot read `auth.users` — there is no RLS path to it, and exposing emails client-side would be a privacy leak. A definer function owned by `postgres` can read it safely and returns only success/failure. Satisfies FR-007 and FR-012.

**Alternatives considered**: Resolving against `public.profiles.email` — rejected: `profiles` has no email column (email lives in `auth.users`), and not every auth user has a profile row.

## R4 — Overview counts via a SECURITY DEFINER aggregate

**Decision**: `admin_overview()` (definer, admin-guarded) returns a small JSON object: total auth users, profiles, tickets, contact submissions, and messages sent.

**Rationale**: The "registered users" total comes from `auth.users`, which the client cannot read; bundling all counts in one guarded call keeps the client simple and avoids multiple round-trips. Surfacing both the `auth.users` total and the `profiles` total makes the known gap (auth users without a completed profile) visible to the owner.

**Alternatives considered**: Per-table client `count` queries — rejected for the user total (no `auth.users` access) and to avoid five separate requests.

## R5 — Admin read of profiles via a new RLS policy (accepted PII exposure)

**Decision**: Add `admin select all` on `public.profiles` (`exists … admins`). The Accounts pane lists profile rows and, per selected user, their `tickets` (which already has `admin select all`).

**Rationale**: FR-017 needs read access to accounts; `tickets`/`contact_messages` already grant admins read, so this mirrors the established pattern. Profiles contain PII (address, phone, nationality, GPA); owner oversight of their own users is the intended, acceptable use, and remains read-only (FR-018).

**Alternatives considered**: A definer function returning a redacted projection — rejected as premature; the owner is the data controller and the pattern (`admin select all`) is already used for `tickets`/`contact_messages`. Revisit if non-owner admins with limited scope are ever introduced.

## R6 — Separate English-only page + stylesheet

**Decision**: Implement as a standalone `admin.html` with its own `admin.js`/`admin.css`, English-only and LTR. It links `index.css` for shared theme tokens and base, plus `admin.css` for dashboard layout.

**Rationale**: Clarification Q4 — the admin audience is the owner + a few designees, so the bilingual EN/AR + RTL machinery used on the public site is unnecessary overhead. A separate page also guarantees admin code/markup never ships to ordinary visitors.

**Alternatives considered**: An admin tab inside `account.html` — rejected: would entangle admin-only code with the user account page, risk leaking admin affordances, and force bilingual/RTL handling.

## R7 — No new edge function, no Realtime

**Decision**: All sends are PostgREST RPC calls (`client.rpc`) to the new/extended `SECURITY DEFINER` functions; all reads are RLS-guarded `select`s. Data loads on page open and on an explicit "refresh"; no Realtime subscription on the admin page.

**Rationale**: The deferred-from-005 need is authoring/compose + oversight, none of which requires live push for an owner-driven workflow (alerting admins to new contact messages was explicitly deferred). Avoids a websocket/publication and keeps the surface minimal. The `stripe-webhook` is **not** touched by this feature.

**Alternatives considered**: Realtime badge for new contact submissions — deferred (low impact; can be added later mirroring inbox.js).

## R8 — Broadcast semantics & double-send guard

**Decision**: `admin_broadcast` fans out point-in-time to all `profiles` (consistent with feature 005 / FR-013) inside one transaction and returns the recipient count. The UI requires an explicit confirm step (FR-010) and disables the send control while a send is in flight to avoid accidental double submission (edge case). Admin `notifications` rows carry a `null` dedupe_key (multiple admin messages are legitimately allowed), so they do not collide with the partial dedupe index.

**Rationale**: One transactional RPC gives an accurate count and atomic delivery; UI-level guarding plus the single round-trip makes an accidental duplicate broadcast unlikely without adding a heavier idempotency key the spec doesn't require.

**Alternatives considered**: A per-broadcast idempotency key/dedupe on `admin_messages` — rejected as over-engineering for an owner-confirmed action; revisit if broadcasts ever become automated.

> Note (regression awareness): the `notifications` welcome trigger had a partial-index `ON CONFLICT` bug (fixed 2026-06-25). Admin sends here use `null` dedupe_key and a definer insert, so they are unaffected — but `supabase-setup.sql` must be re-pasted as a whole (it already includes that fix).

## R9 — Contact reply reuses single-send by user id

**Decision**: The "reply" action on a contact submission calls `admin_send_to_user(p_user_id, …)` with the submission's `user_id` (already present on `contact_messages`), delivering to that user's inbox and writing a log row.

**Rationale**: FR-015a — reuses the exact single-send path with no email lookup needed (we already hold the user id), keeping one code path for "send to a specific user."

**Alternatives considered**: A distinct reply mechanism / threading — rejected: out of scope; a reply is simply an admin message to that user.

## R10 — Per-provider edge functions; service-role writes

**Decision**: Add one **checkout** function and one **webhook** function per new provider (`paypal-*`, `paymob-*`, `kashier-*`), each a Deno/TypeScript Supabase Edge Function mirroring the existing `ticket-checkout`/`stripe-webhook`. Each checkout handles **both** paid flows via a `kind` ('ticket' | 'space') parameter. Functions use the Supabase **service-role** key (already the pattern in `ticket-checkout`) to write `payments`/`tickets`/`space_purchases` and read `payment_providers`/`scholarship_rankings`.

**Rationale**: Payment integration is inherently server-side — secrets, amount computation, signature verification, webhook receipt — and cannot be done from the browser or via RLS/RPC. Per-provider isolation keeps each gateway's distinct API and verification scheme in its own file (readable, testable, lower blast radius for money code), matching feature 004's established structure (FR-019, plan Complexity Tracking).

**Alternatives considered**: (a) One unified checkout/webhook function branching by provider — rejected (mixes four gateways' quirks, riskier). (b) Doing it via `SECURITY DEFINER` RPCs like the admin half — rejected: Postgres cannot safely hold/rotate provider secrets, make outbound HTTPS calls to gateways, or receive their webhooks.

## R11 — `payments` ledger as source of truth; idempotency on `provider_ref`

**Decision**: `public.payments` records one row per attempt: `user_id`, `provider`, `kind`, `item_ref` (scholarship_id for tickets / 'space' for the +1), `amount_cents`+`currency` (provider currency), `status` (`pending → paid|failed|cancelled`), `provider_ref` (gateway order/session id, **unique per provider**), `ticket_id`/links once booked, timestamps. The checkout function inserts `pending`; the webhook flips to `paid`/`failed`. A **unique index on (`provider`, `provider_ref`)** plus a status-guarded update make confirmation **idempotent** — a replayed webhook updates nothing new and books nothing twice (FR-023/FR-024, SC-010).

**Rationale**: A dedicated ledger (vs. columns on `tickets`) is required by the spec for monitoring (US8), retries (multiple attempts per item), and a reliable idempotency anchor. It is also the data source for the Payments pane and the Overview "payments received" total.

**Alternatives considered**: Provider columns on `tickets` only — rejected in spec (loses failed/abandoned history, weak monitoring, no clean idempotency key for the +1 space flow).

## R12 — Server-side double-pay guard (one booking per item)

**Decision**: Before creating a gateway session, each checkout function checks — for the authenticated `user_id` and the target item (scholarship ticket, or the single +1 space) — whether the item is **already booked** (existing `tickets`/`space_purchases` row) **or** has a **`pending`/`paid` payment** in `payments`. If so it rejects with `already_in_progress`/`already_booked` instead of creating a second charge. The successful webhook books the item and marks the payment `paid` in one transaction; the existing feature-004 `space_purchases` idempotency ledger and ticket cooldown remain in force.

**Rationale**: Cross-provider double payment (two tabs / two providers) is not caught by per-provider `provider_ref` idempotency, so a dedicated guard at session-creation time is needed (FR-039, SC-015). Checking at checkout (not just at booking) avoids charging the user twice in the first place.

**Alternatives considered**: (a) Rely only on `provider_ref` idempotency — rejected (different providers ⇒ different refs ⇒ double charge possible). (b) A DB unique constraint on (user,item) for active payments — kept as a **backstop** (partial unique index on pending/paid per user+item) but the friendly rejection happens in the function first.

## R13 — Per-provider currency via owner-set `fx_rate` over a USD base

**Decision**: Pricing stays **USD-based** (ticket tiers 15000/20000/25000/30000 cents; +1 space 9900 cents — unchanged). `payment_providers` carries `currency` + `fx_rate` (numeric, owner-set). The checkout function computes `amount = round(base_usd_cents × fx_rate)` and charges in `currency`. Same-currency providers (Stripe/PayPal in USD) use `fx_rate = 1.0`; EGP providers (Paymob/Kashier) use the owner's fixed rate (e.g. 50.0). The charged amount + currency are stored on the `payments` row.

**Rationale**: Clarified decision — fixed owner-set conversion, computed server-side so the client can never set price (FR-021). Keeps the existing per-tier USD pricing authoritative and avoids a live FX dependency (Assumptions).

**Alternatives considered**: Live FX lookup — rejected (external dependency, variability, out of scope). Per-tier per-currency price tables — rejected as premature; a single `fx_rate` per provider is sufficient for v1.

## R14 — Secrets in the function runtime; only enabled providers exposed

**Decision**: All provider secret keys live in **Supabase function secrets** (`supabase secrets set`), read via `Deno.env` inside the functions — never in `payment_providers`, the DB, or the client. The client learns which providers to show via a **public read limited to enabled rows** of `payment_providers` (a SELECT policy `using (enabled = true)` exposing only non-secret columns, or a tiny read RPC) — it returns `provider`, `display_name`, `currency`, `fx_rate`, `sort_order` only. Admin reads all rows and writes only through self-guarding RPCs.

**Rationale**: FR-031/FR-034/SC-013 — keys must never reach the browser or DB. Exposing only enabled rows lets the checkout render options without leaking disabled/secret config.

**Alternatives considered**: Storing keys (encrypted) in the DB for admin editing — rejected by the clarified decision (keys stay server-side; admin edits only non-secret config).

## R15 — Provider integration specifics (sandbox-first)

**Decision** (confirmed against each provider's current API; finalized in `contracts/payment-functions.md`):
- **PayPal**: Orders v2 — `POST /v2/checkout/orders` (create, return the approve link), capture on return or via webhook; verify webhooks with the `PAYPAL_WEBHOOK_ID` + transmission headers (verify-webhook-signature). Sandbox via `api-m.sandbox.paypal.com`.
- **Paymob**: create an intention/order + payment key, redirect to the iframe/checkout; verify the callback **HMAC** (`PAYMOB_HMAC_SECRET`) over the ordered field set; treat `success=true` as paid.
- **Kashier**: build a payment request (merchant id + order + amount + hash), redirect to Kashier; verify the response **signature** (`KASHIER_SECRET` HMAC) on the webhook/redirect.
- All three: the **webhook** is the source of truth for `paid`; the redirect return only navigates the user to a result page and triggers a status refresh.

**Rationale**: Each scheme differs, justifying per-provider functions (R10). Sandbox/test credentials are owner-supplied (Assumptions); the exact field lists/headers are pinned in the contract before coding.

**Alternatives considered**: Hosted-checkout-only vs. API-created sessions — chose API-created sessions/orders so the server controls the amount (R13) and can attach our `payments.id` as the provider reference for reconciliation.

## R16 — Booking strictly on verified webhook (redirect never trusted)

**Decision**: A ticket/space is created **only** inside the provider's webhook handler after signature verification and an idempotent `pending → paid` transition. The post-payment redirect lands the user on a result view that simply reads the `payments` row status (and may poll briefly); it never itself books or marks paid (FR-022, SC-009).

**Rationale**: Redirects are user-controllable and can be skipped/forged; only the signed server-to-server webhook is trustworthy. This matches the existing Stripe webhook model in feature 004.

**Alternatives considered**: Confirm-on-return (capture in the redirect handler) — rejected as spoofable and unreliable if the user closes the tab.

## R17 — Statuses, retries, and Stripe brought into the ledger

**Decision**: `payments.status` ∈ {`pending`,`paid`,`failed`,`cancelled`}. A `failed`/`cancelled`/abandoned attempt leaves its row terminal and the user may start a **new** attempt (new row), possibly via a different enabled provider — allowed because the double-pay guard (R12) only blocks while a `pending`/`paid` attempt exists or the item is booked (FR-040, SC-015). The existing **Stripe** `ticket-checkout`/`space-checkout` are extended to insert a `payments(pending)` row keyed by the Stripe session id, and `stripe-webhook` to mark it `paid` and set `tickets.provider='stripe'` + `payment_id` — so all four providers share one ledger and the Overview/Payments totals are complete.

**Rationale**: Uniform ledger across providers (FR-023, US8) and a forgiving retry UX (FR-040) without risking duplicates.

**Alternatives considered**: Leaving Stripe outside the ledger — rejected: monitoring/totals would be incomplete and inconsistent.
