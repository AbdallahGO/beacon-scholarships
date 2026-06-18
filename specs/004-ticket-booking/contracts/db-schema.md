# Contract: Database Schema (append to `supabase-setup.sql`)

This is the canonical DDL for feature 004. At implementation time it is appended as a **dated, idempotent section** to `supabase-setup.sql` (the single paste-ready file the owner runs in the dashboard SQL editor — [[sql-via-paste-ready-file]]). MCP is read-only; never hand the owner inline SQL. Safe to re-run.

Conventions reuse feature 003: RLS `TO authenticated`, `(select auth.uid()) = user_id`; UPDATE policies use USING + WITH CHECK; explicit grants (new tables are not auto-exposed since 2026-04-28); functions `security invoker`, `set search_path = ''`.

```sql
-- ============================================================================
-- Beacon — feature 004 (ticket booking, profiles, rankings) — 2026-06-13
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------- profiles: new columns -------------------------------------------
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists second_nationality text;
alter table public.profiles add column if not exists gpa text;
alter table public.profiles add column if not exists field_of_interest text;
alter table public.profiles add column if not exists ticket_capacity integer not null default 1;

-- ---------- scholarship_rankings (public read; authoritative price) ----------
create table if not exists public.scholarship_rankings (
  scholarship_id text primary key,
  institution    text,
  tier           text not null check (tier in ('out_of_rank','lowest','medium','high')),
  amount_cents   integer not null check (amount_cents in (15000,20000,25000,30000)),
  currency       text not null default 'usd',
  updated_at     timestamptz not null default now()
);
alter table public.scholarship_rankings enable row level security;
drop policy if exists "rankings public read" on public.scholarship_rankings;
create policy "rankings public read" on public.scholarship_rankings
  for select to anon, authenticated using (true);
grant select on public.scholarship_rankings to anon, authenticated;
-- no insert/update/delete policies → only the seed (table owner) writes.

-- ---------- admins (owner-only) ---------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins self select" on public.admins;
create policy "admins self select" on public.admins
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.admins to authenticated;
-- seed below once the owner confirms their auth user id.

-- ---------- tickets ----------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  scholarship_title text,
  institution text,
  ranking_tier text not null check (ranking_tier in ('out_of_rank','lowest','medium','high')),
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  status text not null default 'active' check (status in ('active','revealed','void')),
  booked_at timestamptz not null default now(),
  cooldown_end timestamptz not null,
  reveal_full_name text,
  reveal_country text,
  reveal_nationality text,
  reveal_degree text,
  reveal_field_of_interest text,
  created_at timestamptz not null default now()
);
create index if not exists tickets_user_idx on public.tickets (user_id, booked_at desc);
-- one ticket per scholarship per user (FR-014b); void tickets excluded
create unique index if not exists tickets_user_scholarship_uniq
  on public.tickets (user_id, scholarship_id) where status <> 'void';

alter table public.tickets enable row level security;
drop policy if exists "own select" on public.tickets;
create policy "own select" on public.tickets
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "admin select all" on public.tickets;
create policy "admin select all" on public.tickets
  for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
grant select on public.tickets to authenticated;
-- NO insert/update/delete policies → only the service-role webhook writes.

-- ---------- space_purchases (idempotency ledger for +1 space) ----------------
create table if not exists public.space_purchases (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.space_purchases enable row level security;
drop policy if exists "own select" on public.space_purchases;
create policy "own select" on public.space_purchases
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.space_purchases to authenticated;
-- service role only for writes.

-- ---------- seeds (filled by tooling / owner) --------------------------------
-- 1) scholarship_rankings: generated block from build_ranking_index.ps1, e.g.:
--    insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
--    values ('6049','University of Melbourne','high',30000)
--    on conflict (scholarship_id) do update
--      set institution = excluded.institution, tier = excluded.tier,
--          amount_cents = excluded.amount_cents, updated_at = now();
--    ... (one row per catalogue id) ...
--
-- 2) admins: owner confirms their user id (Authentication → Users), then:
--    insert into public.admins (user_id) values ('<OWNER_AUTH_USER_UUID>')
--      on conflict (user_id) do nothing;
```

## Notes

- `ticket_capacity` is technically updatable under the profiles "own update" policy; the **app never sends it** and capacity changes go through the service-role webhook. Optional hardening (not required for MVP): a `before update` trigger that resets `new.ticket_capacity = old.ticket_capacity` for non-service-role updates.
- After running, re-check **Supabase advisors** (`get_advisors`) for new RLS/security lints, as in feature 003.
- The unique partial index enforces one active/revealed ticket per `(user_id, scholarship_id)`; the webhook also checks before insert for a friendly path, but the index is the hard guarantee.
