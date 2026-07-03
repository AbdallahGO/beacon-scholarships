# Phase 1 Data Model: Admin Dashboard & Multi-Provider Payments

Authoritative DDL/RLS lives in [contracts/db-schema.md](./contracts/db-schema.md); this file is the conceptual model. **Admin dashboard** adds one table (`admin_messages`) + one policy (`admin select all` on `profiles`). **Multi-provider payments** adds two tables (`payment_providers`, `payments`), alters two (`tickets`, `space_purchases`), and adds three admin RPCs. All other tables already exist (features 003–005).

## New entity

### `public.admin_messages` — sent-message log (FR-011a/b)

The authoritative record of each admin send, independent of recipients' inbox copies.

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | `default gen_random_uuid()` |
| `sender_id` | uuid | FK → `auth.users(id)` `on delete set null` — which admin sent it |
| `target_type` | text | `check in ('user','all')` — single recipient vs broadcast |
| `target_user_id` | uuid | FK → `auth.users(id)` `on delete set null`; set when `target_type='user'`, else null |
| `target_email` | text | the email the admin typed for an email-targeted single send (audit trail); null for reply/broadcast |
| `title` | text | literal title as sent (nullable — body is the required part) |
| `body` | text | `not null` — literal body as sent |
| `recipient_count` | integer | `not null default 0` — how many inbox rows were created (1 for single, N for broadcast) |
| `created_at` | timestamptz | `not null default now()` |

**Indexes**: `(created_at desc)` for the newest-first history list.

**Lifecycle**: insert-only, written **exclusively** by the trusted send functions (`admin_broadcast`, `admin_send_to_user`, `admin_send_to_email`). No update/delete in v1. Rows persist even after recipients delete their inbox copies or accounts are removed (`set null` keeps the log entry).

**RLS**: `enable row level security`. Policy `admin select all` (SELECT, authenticated, `exists … admins`). **No INSERT/UPDATE/DELETE policy** — definer functions bypass RLS to insert; the client can never write here.

## New policy on an existing entity

### `public.profiles` — add `admin select all` (SELECT)

`create policy "admin select all" on public.profiles for select to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()))`. Coexists with the existing `own select` (permissive policies OR together). Enables the Accounts pane (FR-017) and the profiles count. Profiles remain read-only to admins (no admin insert/update/delete — FR-018).

## Reused entities (no schema change)

- **`public.admins`** `(user_id uuid pk → auth.users, created_at)` — the authorization registry. `admins self select` lets a user read their own row (drives the client gate); membership is checked inside every definer function. Seeded manually by the owner (ADMIN SEED block in `supabase-setup.sql`).
- **`public.notifications`** (feature 005) — the delivery target. Admin sends insert rows with `type='admin'`, literal `title`/`body`, `dedupe_key = null`, `ref = 'account.html#inbox'`. Recipients read/delete via their existing inbox RLS.
- **`public.contact_messages`** (feature 005) `(id, user_id, name, email, message, created_at)` — read by the Contact pane via the existing `admin select all`; `user_id` drives the reply (R9).
- **`public.tickets`** (feature 004) — read by the Accounts pane per selected user via the existing `admin select all`. Display fields: `scholarship_title`, `institution`, `ranking_tier`, `amount_cents`/`currency`, `status`, `booked_at`, `cooldown_end`.

## Trusted functions (security boundary)

All are `SECURITY DEFINER`, `set search_path = public`, self-guard `exists (… admins where user_id = auth.uid())` and raise `not authorized` otherwise. `EXECUTE` granted to `authenticated`, revoked from `public`/`anon`. Full signatures/bodies in [contracts/db-schema.md](./contracts/db-schema.md); behavior in [contracts/admin-rpc.md](./contracts/admin-rpc.md).

| Function | Purpose | Returns |
|----------|---------|---------|
| `admin_broadcast(p_title text, p_body text)` | **Extended**: insert one `notifications` row per **`auth.users`** account (every registered account, point-in-time) **and** one `admin_messages` log row (`target_type='all'`, `recipient_count=N`) | `integer` recipient count |
| `admin_send_to_user(p_user_id uuid, p_title text, p_body text)` | One inbox row for the given user + one log row (`target_type='user'`). Reply path (R9) and the compose-by-id path. Raises `recipient_not_found` if the user id doesn't exist | `integer` (1) |
| `admin_send_to_email(p_email text, p_title text, p_body text)` | Resolve email in `auth.users` (case-insensitive) → behaves as `admin_send_to_user` for the match, logging `target_email`. Raises `recipient_not_found` if no match | `integer` (1) |
| `admin_overview()` | Counts: `users` (auth.users), `profiles`, `tickets`, `contact_messages`, `messages_sent` (admin_messages) | `json` |

## Entity relationships

```text
auth.users 1──1 admins              (membership = admin)
auth.users 1──* notifications        (recipient inbox; admin sends create type='admin' rows)
auth.users 1──1 profiles             (admin reads all via new policy)
auth.users 1──* tickets              (admin reads all; Accounts pane)
auth.users 1──* contact_messages     (admin reads all; reply targets user_id)
admin_messages *──1 auth.users(sender_id)        (who sent)
admin_messages *──1 auth.users(target_user_id)   (single-send recipient; null for broadcast)
```

## Validation & constraints summary

- `admin_messages.target_type` ∈ {`user`,`all`}; `body` not null, `char_length` 1..5000; `title` ≤ 200 chars; `recipient_count` ≥ 0 (default 0).
- Empty body is rejected **before** send (client FR-009 + functions raise `empty_body`); over-length title/body raise `title_too_long`/`body_too_long` (FR-009a), backstopped by `admin_messages` check constraints.
- Broadcast is point-in-time over **`auth.users`** (every registered account) at send time (FR-006/FR-013).
- Admin message inbox rows use `dedupe_key = null` (multiple admin messages allowed; no collision with the partial dedupe index).
- All admin writes are read-only w.r.t. user data except creating inbox/log rows (FR-018).

---

# Multi-Provider Payments (Part B)

## New entity

### `public.payment_providers` — provider config (US7)

Drives which providers appear at checkout and how their amount is computed. **No secret keys.**

| Field | Type | Notes |
|-------|------|-------|
| `provider` | text PK | `check in ('stripe','paypal','paymob','kashier')` |
| `display_name` | text not null | shown at checkout (e.g. "PayPal", "Card (Stripe)") |
| `enabled` | boolean not null default false | admin toggle (FR-029); only enabled rows appear at checkout |
| `currency` | text not null | ISO currency the provider charges in (e.g. `USD`, `EGP`) |
| `fx_rate` | numeric not null default 1.0 | owner-set multiplier on the USD base (FR-021/R13); `>0` |
| `sort_order` | integer not null default 0 | checkout ordering |
| `updated_at` | timestamptz not null default now() | |

**Seed**: 4 rows (`stripe`,`paypal`,`paymob`,`kashier`); `stripe` seeded `enabled=true`, others `false` until the owner configures secrets and turns them on.

**RLS**: `enable row level security`. (1) `providers public read enabled` — SELECT to `anon, authenticated` `using (enabled = true)` (checkout list; non-secret columns only). (2) `providers admin read all` — SELECT to `authenticated` `using (exists … admins)`. **No client INSERT/UPDATE/DELETE policy** — admin changes go only through the self-guarding RPCs below.

### `public.payments` — cross-provider ledger (US6/US8, FR-023)

One row per payment **attempt**, across all providers and both paid flows.

| Field | Type | Notes |
|-------|------|-------|
| `id` | uuid PK | `default gen_random_uuid()` |
| `user_id` | uuid | FK → `auth.users(id)` `on delete set null` — payer |
| `provider` | text | FK → `payment_providers(provider)` |
| `kind` | text | `check in ('ticket','space')` — which paid flow |
| `item_ref` | text | scholarship_id for `ticket`; `'space'` for the +1 space |
| `amount_cents` | integer not null | charged amount **in the provider's currency** (`base_usd × fx_rate`) |
| `currency` | text not null | provider currency at charge time |
| `status` | text not null default 'pending' | `check in ('pending','paid','failed','cancelled')` |
| `provider_ref` | text | gateway order/session id; idempotency anchor |
| `ticket_id` | uuid | FK → `tickets(id)` `on delete set null`; set when a `ticket` payment is booked |
| `created_at` / `updated_at` | timestamptz | `not null default now()` |

**Indexes**: `(created_at desc)` for the ledger list; **unique `(provider, provider_ref)`** (idempotency, R11); **partial unique** `(user_id, kind, item_ref) where status in ('pending','paid')` (double-pay backstop, R12).

**Lifecycle**: insert (`pending`) by a checkout function; update to `paid`/`failed`/`cancelled` by the webhook (idempotent forward-only). Insert/update **only** by edge functions (service role). No client writes.

**RLS**: `enable row level security`. Policy `admin select all` (SELECT, authenticated, `exists … admins`). **No INSERT/UPDATE/DELETE policy** — service-role functions bypass RLS; clients can never write (FR-036).

## Altered existing entities

### `public.tickets` (feature 004) — add provider linkage (FR-037)

Add `provider text references public.payment_providers(provider)` and `payment_id uuid references public.payments(id)`. Set by the webhook when booking. The Accounts→bookings pane displays `provider`.

### `public.space_purchases` (feature 004) — add provider linkage

Add `provider text` and `payment_id uuid` (same purpose, for the +1 space flow). Keeps the existing idempotency ledger semantics.

## Trusted functions (admin payment management/monitoring)

All `SECURITY DEFINER`, `set search_path = public`, self-guard `exists (… admins where user_id = auth.uid())`, raise `not authorized` otherwise. `EXECUTE` granted to `authenticated`, revoked from `public`/`anon`.

| Function | Purpose | Returns |
|----------|---------|---------|
| `admin_set_provider_enabled(p_provider text, p_enabled boolean)` | Toggle a provider on/off (FR-029); touches `updated_at` | `void`/`boolean` |
| `admin_set_provider_config(p_provider text, p_display_name text, p_currency text, p_fx_rate numeric)` | Edit non-secret config (FR-030); validates `fx_rate > 0` | `void`/`boolean` |
| `admin_payments_overview()` | Per-provider totals: count + sum of `paid`, plus grand total received (FR-034/FR-038) | `json` |

Plus the **extended** `admin_overview()` now also returns `payments_received` (sum of `paid` amounts). The **payments ledger list** (US8) and the **enabled-providers checkout read** are plain RLS selects (no RPC needed), per `contracts/payments-rpc.md`.

> **Money movement is NOT done via these RPCs** — booking and ledger writes happen only inside the per-provider edge functions (service role), which hold the secrets and verify signatures. See `contracts/payment-functions.md`.

## Entity relationships (payments)

```text
auth.users 1──* payments                 (a user's payment attempts)
payment_providers 1──* payments           (which gateway)
payment_providers 1──* tickets            (tickets.provider — which gateway funded it)
payments 1──0..1 tickets                  (payments.ticket_id once a ticket is booked)
payments *──(kind,item_ref)               (ticket→scholarship_id, space→'space')
```

## Validation & constraints summary (payments)

- `payment_providers.fx_rate > 0`; `provider` ∈ the four; `currency` non-empty.
- `payments.status` ∈ {`pending`,`paid`,`failed`,`cancelled`}; `kind` ∈ {`ticket`,`space`}; `amount_cents > 0`.
- **Idempotency**: unique `(provider, provider_ref)` — a replayed webhook cannot create/confirm twice (FR-024, SC-010).
- **Double-pay guard**: partial unique `(user_id, kind, item_ref) where status in ('pending','paid')` backstops the in-function check (FR-039, SC-015).
- **Amount integrity**: `amount_cents = round(base_usd_cents × fx_rate)` computed server-side in the edge function; never client-supplied (FR-021).
- **Booking only on verified webhook** (FR-022/R16); secrets never in DB/client (FR-031/FR-034).
