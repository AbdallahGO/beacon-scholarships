# Phase 1 Data Model: Ticket Booking, Profiles & Cleanup

All persistence is Supabase Postgres, reusing feature 003's owner-only RLS conventions (`TO authenticated`, `(select auth.uid()) = user_id`; UPDATE policies need USING + WITH CHECK). New tables are **not** auto-exposed to the Data API since 2026-04-28, so explicit `grant`s are required. Authoritative DDL lives in `contracts/db-schema.md` and is appended (idempotently) to `supabase-setup.sql` for the owner to paste.

## Extended entity: `public.profiles` (new columns)

Existing columns (from feature 003): `user_id` (PK→auth.users), `full_name`, `address`, `city`, `country`, `nationality`, `phone`, `degree`, `photo_path`, `created_at`, `updated_at`.

| New column | Type | Notes |
|---|---|---|
| `first_name` | `text` | Collected at sign-up; `full_name` is composed as `first_name + ' ' + last_name` for back-compat. |
| `last_name` | `text` | Collected at sign-up. |
| `second_nationality` | `text` (nullable) | Optional. |
| `gpa` | `text` (nullable) | Optional; free text to allow scales (e.g., "3.8/4", "Very Good"). |
| `field_of_interest` | `text` (nullable) | Optional; "field looking for". Shown on the revealed ticket. |
| `ticket_capacity` | `integer not null default 1` | Concurrent ticket slots. Increased only by the webhook (service role) on a +1 space purchase; never decreases. |

- `degree` keeps the existing check (`highschool|bachelor|master|phd`).
- RLS unchanged (owner-only select/insert/update/delete). `ticket_capacity` is writable by RLS-wise the owner, but the **app never lets the client change it**; capacity changes flow through the service-role webhook. (Optional hardening noted in db-schema: a trigger could pin `ticket_capacity` against client UPDATEs; default relies on the app + service-role-only purchase path.)
- **Validation (client, FR-019/021)**: first name, last name, address, city, country, nationality, degree, password, confirm password required; second nationality, GPA, field of interest optional; password == confirm; agreement checkpoint checked.

## New entity: `public.scholarship_rankings` (reference data, public read)

The authoritative price source. Seeded by `build_ranking_index.ps1` output.

| Column | Type | Notes |
|---|---|---|
| `scholarship_id` | `text primary key` | Matches catalogue id (text, as in `saved_scholarships`). |
| `institution` | `text` | Resolved institution name (display/debug). |
| `tier` | `text not null check (tier in ('out_of_rank','lowest','medium','high'))` | |
| `amount_cents` | `integer not null check (amount_cents in (15000,20000,25000,30000))` | Server-trusted price for the tier. |
| `currency` | `text not null default 'usd'` | |
| `updated_at` | `timestamptz not null default now()` | |

- **RLS**: enabled; a single `select` policy `using (true)` for `anon, authenticated` (prices are public, display-safe). **No insert/update/delete** policies → only the SQL seed (run as table owner) can write.
- **Grants**: `select` to `anon, authenticated`.
- Missing row → treated by `ticket-checkout` as `out_of_rank` / 15000 (safe default).

## New entity: `public.tickets`

One row per booked ticket. **Created only by the `stripe-webhook` edge function (service role)**; users may only `select` their own; admins may `select` all.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | Internal id. |
| `ticket_code` | `text not null unique` | **Public unique ticket ID**, distinct from any account/user id (e.g., `BCN-XXXX-XXXX`). Generated server-side; stable. (FR-016/FR-017, FR-002) |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | Owner. |
| `scholarship_id` | `text not null` | Catalogue id. |
| `scholarship_title` | `text` | Snapshot at booking. |
| `institution` | `text` | Snapshot at booking. |
| `ranking_tier` | `text not null check (... in 4 tiers)` | Tier charged. |
| `amount_cents` | `integer not null` | Fee paid. |
| `currency` | `text not null default 'usd'` | |
| `stripe_session_id` | `text not null unique` | Idempotency key (FR-010). |
| `stripe_payment_intent` | `text` | For reconciliation. |
| `status` | `text not null default 'active' check (status in ('active','revealed','void'))` | `active` = in cooldown; `revealed` = cooldown elapsed; `void` reserved (unused — no refunds). Effective status is derived from `cooldown_end` at read time; a column lets the dashboard filter. |
| `booked_at` | `timestamptz not null default now()` | Server-anchored (FR-011). |
| `cooldown_end` | `timestamptz not null` | `booked_at + interval '3 days'`. |
| `reveal_full_name` | `text` | Snapshot for the reveal (FR-016). |
| `reveal_country` | `text` | Snapshot. |
| `reveal_nationality` | `text` | Snapshot. |
| `reveal_degree` | `text` | Snapshot. |
| `reveal_field_of_interest` | `text` | Snapshot. |
| `created_at` | `timestamptz not null default now()` | |

- **Indexes**: `(user_id, booked_at desc)`; unique on `ticket_code` and `stripe_session_id`.
- **RLS**: enabled.
  - `own select`: `to authenticated using ((select auth.uid()) = user_id)`.
  - `admin select all`: `to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))`.
  - **No** client insert/update/delete policies → inserts/updates only via the service role (webhook), which bypasses RLS.
- **Grants**: `select` to `authenticated` (RLS still scopes rows). No insert/update/delete grants to `anon`/`authenticated`.

### State machine

```
(no ticket) --click Book Ticket--> [animation] --redirect--> Stripe Checkout
   Checkout abandoned/failed  ----> (no ticket)            # nothing written (SC-002)
   checkout.session.completed ----> webhook inserts ticket:
        status=active, booked_at=now(), cooldown_end=now()+3d   # occupies a slot (FR-014)
   now() < cooldown_end ----------> ACTIVE  (nav ring spinning, account countdown)
   now() >= cooldown_end ---------> REVEALED (slot freed FR-014a; shows ticket_code + reveal_* )
```

- Capacity check (in `ticket-checkout`, before creating a session): count tickets where `user_id = me AND cooldown_end > now()` (i.e., active/occupying). Block if `>= ticket_capacity` (FR-014). Also block if a ticket already exists for `(user_id, scholarship_id)` in any non-void status (FR-014b, one-per-scholarship).

## New entity: `public.admins`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid primary key references auth.users(id) on delete cascade` | Owner account(s). |
| `created_at` | `timestamptz not null default now()` | |

- **RLS**: enabled; `select` policy `to authenticated using ((select auth.uid()) = user_id)` (an admin can confirm their own membership; no one can enumerate others). No write policies → seeded via SQL only.
- **Seed**: the owner's `auth.users.id` inserted in `supabase-setup.sql` once confirmed. Until seeded, the admin dashboard shows zero rows (safe).

## Capacity / +1 space (no separate table)

- Capacity is the `profiles.ticket_capacity` integer. A successful **+1 space** Checkout (`space-checkout`) is confirmed by the same webhook, which does `update profiles set ticket_capacity = ticket_capacity + 1 where user_id = <buyer>` (service role), idempotent on the purchase's `stripe_session_id` (tracked in a small `public.space_purchases(stripe_session_id text pk, user_id uuid, created_at)` ledger to prevent double-increment on webhook replay).

### `public.space_purchases` (idempotency ledger)

| Column | Type | Notes |
|---|---|---|
| `stripe_session_id` | `text primary key` | Replay guard. |
| `user_id` | `uuid not null references auth.users(id) on delete cascade` | |
| `created_at` | `timestamptz not null default now()` | |

- **RLS**: enabled; `own select` only; no client writes (service role only). Grants `select` to `authenticated`.

## Client-only state (no DB)

- **Filter persistence**: `localStorage["beacon.filters"]` = JSON of `{ q, level, fund, country, sort }` (FR-025/026).
- **Pending booking intent**: reuses `auth.js`'s `beacon.pendingAction` (`{ type: "route", href }`) for the sign-in→resume flow (FR-006).

## Relationships

```
auth.users 1───1 profiles            (ticket_capacity)
auth.users 1───* tickets             (user_id)
auth.users 1───* space_purchases
auth.users 1───? admins              (owner only)
scholarship_rankings  (scholarship_id == catalogue id == tickets.scholarship_id, by value)
```
