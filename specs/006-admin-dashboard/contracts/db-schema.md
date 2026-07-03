# Contract: DB Schema (Feature 006 — appended to `supabase-setup.sql`)

Idempotent, paste-ready DDL/RLS/functions to append as a dated Feature-006 section at the end of `supabase-setup.sql`. Safe to re-run. The owner pastes the whole file ([[sql-via-paste-ready-file]]). Authoritative for the data model in [data-model.md](../data-model.md).

```sql
-- ============================================================================
-- Beacon — feature 006 (admin dashboard) backend setup
-- Idempotent. Safe to re-run. See specs/006-admin-dashboard/contracts/db-schema.md
-- ============================================================================

-- 1) Sent-message log (FR-011a/b) --------------------------------------------
create table if not exists public.admin_messages (
  id              uuid primary key default gen_random_uuid(),
  sender_id       uuid references auth.users(id) on delete set null,
  target_type     text not null check (target_type in ('user','all')),
  target_user_id  uuid references auth.users(id) on delete set null,
  target_email    text,
  title           text check (title is null or char_length(title) <= 200),
  body            text not null check (char_length(body) between 1 and 5000),
  recipient_count integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists admin_messages_created_idx
  on public.admin_messages (created_at desc);

alter table public.admin_messages enable row level security;

-- admins read the full send history; NO client insert/update/delete
-- (rows are written only by the SECURITY DEFINER send functions below).
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='admin_messages' and policyname='admin select all') then
    create policy "admin select all" on public.admin_messages for select to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;

grant select on public.admin_messages to authenticated;

-- 2) Admin read access to profiles (Accounts pane, FR-017) --------------------
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='admin select all') then
    create policy "admin select all" on public.profiles for select to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;

-- 3) Internal helper: insert one admin inbox message + return 1 ----------------
--    (not exposed via RPC; called only by the send functions in this section)
create or replace function public.admin_message_insert(p_user_id uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, ref, dedupe_key)
  values (p_user_id, 'admin', nullif(btrim(p_title),''), p_body, 'account.html#inbox', null);
  return 1;
end $$;

-- 4) Broadcast to all users (FR-006/010/011/013) — EXTENDED to log ------------
-- "All users" = every registered account (auth.users), NOT only users with a
-- completed profile, so no account is silently excluded from a broadcast.
create or replace function public.admin_broadcast(p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  if coalesce(btrim(p_body),'') = '' then
    raise exception 'empty_body';
  end if;
  if char_length(p_body) > 5000 then raise exception 'body_too_long'; end if;
  if p_title is not null and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long'; end if;
  insert into public.notifications (user_id, type, title, body, ref, dedupe_key)
  select u.id, 'admin', nullif(btrim(p_title),''), p_body, 'account.html#inbox', null
  from auth.users u;
  get diagnostics n = row_count;
  insert into public.admin_messages (sender_id, target_type, title, body, recipient_count)
  values (auth.uid(), 'all', nullif(btrim(p_title),''), p_body, n);
  return n;
end $$;

-- 5) Single send to a known user id (FR-007 compose-by-id + FR-015a reply) -----
create or replace function public.admin_send_to_user(p_user_id uuid, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  if coalesce(btrim(p_body),'') = '' then
    raise exception 'empty_body';
  end if;
  if char_length(p_body) > 5000 then raise exception 'body_too_long'; end if;
  if p_title is not null and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id) then
    raise exception 'recipient_not_found';
  end if;
  perform public.admin_message_insert(p_user_id, p_title, p_body);
  insert into public.admin_messages (sender_id, target_type, target_user_id, title, body, recipient_count)
  values (auth.uid(), 'user', p_user_id, nullif(btrim(p_title),''), p_body, 1);
  return 1;
end $$;

-- 6) Single send by email (FR-007/012) — resolves in auth.users ---------------
create or replace function public.admin_send_to_email(p_email text, p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  if coalesce(btrim(p_body),'') = '' then
    raise exception 'empty_body';
  end if;
  if char_length(p_body) > 5000 then raise exception 'body_too_long'; end if;
  if p_title is not null and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long'; end if;
  select u.id into uid from auth.users u
   where lower(u.email) = lower(btrim(p_email)) limit 1;
  if uid is null then
    raise exception 'recipient_not_found';
  end if;
  perform public.admin_message_insert(uid, p_title, p_body);
  insert into public.admin_messages (sender_id, target_type, target_user_id, target_email, title, body, recipient_count)
  values (auth.uid(), 'user', uid, btrim(p_email), nullif(btrim(p_title),''), p_body, 1);
  return 1;
end $$;

-- 7) Overview counts (FR-016) -------------------------------------------------
create or replace function public.admin_overview()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return json_build_object(
    'users',            (select count(*) from auth.users),
    'profiles',         (select count(*) from public.profiles),
    'tickets',          (select count(*) from public.tickets),
    'contact_messages', (select count(*) from public.contact_messages),
    'messages_sent',    (select count(*) from public.admin_messages)
  );
end $$;

-- 8) Grants: callable by signed-in users; functions self-guard on admins ------
revoke all on function public.admin_message_insert(uuid, text, text) from public, anon, authenticated;
revoke all on function public.admin_broadcast(text, text) from public, anon;
revoke all on function public.admin_send_to_user(uuid, text, text) from public, anon;
revoke all on function public.admin_send_to_email(text, text, text) from public, anon;
revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_broadcast(text, text) to authenticated;
grant execute on function public.admin_send_to_user(uuid, text, text) to authenticated;
grant execute on function public.admin_send_to_email(text, text, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
-- ============================================================================
-- End Feature 006
-- ============================================================================
```

## Notes & invariants

- **`admin_broadcast` signature is unchanged** `(text, text) → integer`, so feature-005's `admin_broadcast` callers/contract stay valid; it now additionally writes an `admin_messages` row. (This replaces the body created in feature 005.)
- **`admin_message_insert` is internal**: `EXECUTE` revoked from everyone including `authenticated`; it runs only via `perform` inside the other definer functions (which run as owner), so revoking does not block them. It is never an RPC surface.
- **Empty body** raises `empty_body` server-side as a backstop to the client check (FR-009).
- **Length limits** (FR-009a): body > 5000 chars raises `body_too_long`; title > 200 chars raises `title_too_long`. `admin_messages` also carries `check` constraints as a final backstop.
- **Broadcast scope**: `admin_broadcast` fans out over `auth.users` (every registered account), not `public.profiles` — so accounts without a completed profile still receive broadcasts (FR-006). `recipient_count` therefore equals the total account count at send time.
- **Unknown recipient** raises `recipient_not_found` (FR-012) for both single-send paths.
- **Admin inbox rows** use `dedupe_key = null` → no collision with `notifications_dedupe_idx` (the partial unique index). `ref='account.html#inbox'` deep-links the recipient to their inbox.
- After pasting, run `get_advisors` (security + performance) and confirm no new RLS gaps (every new table has RLS; `admin_messages` intentionally has no client-write policy).

---

## Part B — Multi-provider payments (appended to the same Feature-006 section)

Idempotent DDL/RLS/functions for `payment_providers`, `payments`, the `tickets`/`space_purchases` alterations, and the admin payment RPCs. Secret keys are **never** stored here — they live in edge-function secrets.

```sql
-- ============================================================================
-- Beacon — feature 006 (multi-provider payments) backend setup
-- Idempotent. Safe to re-run. See specs/006-admin-dashboard/contracts/payment-functions.md
-- ============================================================================

-- 1) Provider config (US7) — NO secret keys -----------------------------------
create table if not exists public.payment_providers (
  provider     text primary key check (provider in ('stripe','paypal','paymob','kashier')),
  display_name text not null,
  enabled      boolean not null default false,
  currency     text not null default 'USD',
  fx_rate      numeric not null default 1.0 check (fx_rate > 0),
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.payment_providers enable row level security;

-- public sees only ENABLED providers (non-secret columns); admins see all
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_providers' and policyname='providers public read enabled') then
    create policy "providers public read enabled" on public.payment_providers for select to anon, authenticated
      using (enabled = true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payment_providers' and policyname='providers admin read all') then
    create policy "providers admin read all" on public.payment_providers for select to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;
grant select on public.payment_providers to anon, authenticated;

-- seed the four providers (stripe on; others off until configured)
insert into public.payment_providers (provider, display_name, currency, fx_rate, enabled, sort_order) values
  ('stripe',  'Card (Stripe)', 'USD', 1.0,  true,  10),
  ('paypal',  'PayPal',        'USD', 1.0,  false, 20),
  ('paymob',  'Paymob',        'EGP', 50.0, false, 30),
  ('kashier', 'Kashier',       'EGP', 50.0, false, 40)
on conflict (provider) do nothing;

-- 2) Payments ledger (US6/US8) — written ONLY by edge functions ---------------
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  provider      text not null references public.payment_providers(provider),
  kind          text not null check (kind in ('ticket','space')),
  item_ref      text not null,
  amount_cents  integer not null check (amount_cents > 0),
  currency      text not null,
  status        text not null default 'pending' check (status in ('pending','paid','failed','cancelled')),
  provider_ref  text,
  ticket_id     uuid references public.tickets(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists payments_created_idx on public.payments (created_at desc);
-- idempotency: one row per provider order/session
create unique index if not exists payments_provider_ref_idx
  on public.payments (provider, provider_ref) where provider_ref is not null;
-- double-pay backstop: at most one active payment per user+item
create unique index if not exists payments_active_item_idx
  on public.payments (user_id, kind, item_ref) where status in ('pending','paid');

alter table public.payments enable row level security;

-- admins read the ledger; NO client write (service-role functions write it)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='payments' and policyname='admin select all') then
    create policy "admin select all" on public.payments for select to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;
grant select on public.payments to authenticated;

-- 3) Link bookings to the funding payment/provider (FR-037) --------------------
alter table public.tickets         add column if not exists provider   text references public.payment_providers(provider);
alter table public.tickets         add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.space_purchases add column if not exists provider   text references public.payment_providers(provider);
alter table public.space_purchases add column if not exists payment_id uuid references public.payments(id) on delete set null;

-- 4) Admin: toggle a provider (FR-029) ---------------------------------------
create or replace function public.admin_set_provider_enabled(p_provider text, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  update public.payment_providers set enabled = p_enabled, updated_at = now() where provider = p_provider;
  if not found then raise exception 'unknown_provider'; end if;
  return p_enabled;
end $$;

-- 5) Admin: edit non-secret config (FR-030) — NEVER a secret key --------------
create or replace function public.admin_set_provider_config(p_provider text, p_display_name text, p_currency text, p_fx_rate numeric)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_fx_rate is null or p_fx_rate <= 0 then raise exception 'bad_fx_rate'; end if;
  update public.payment_providers
     set display_name = coalesce(nullif(btrim(p_display_name),''), display_name),
         currency     = coalesce(nullif(btrim(p_currency),''), currency),
         fx_rate      = p_fx_rate,
         updated_at   = now()
   where provider = p_provider;
  if not found then raise exception 'unknown_provider'; end if;
  return true;
end $$;

-- 6) Admin: per-provider payment totals (FR-034/FR-038) -----------------------
create or replace function public.admin_payments_overview()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return json_build_object(
    'total_received_cents', (select coalesce(sum(amount_cents),0) from public.payments where status='paid'),
    'by_provider', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json) from (
        select p.provider,
               count(*) filter (where pay.status='paid')                 as paid_count,
               coalesce(sum(pay.amount_cents) filter (where pay.status='paid'),0) as paid_cents,
               p.currency
        from public.payment_providers p
        left join public.payments pay on pay.provider = p.provider
        group by p.provider, p.currency, p.sort_order
        order by p.sort_order
      ) t
    )
  );
end $$;

-- 7) Grants ------------------------------------------------------------------
revoke all on function public.admin_set_provider_enabled(text, boolean) from public, anon;
revoke all on function public.admin_set_provider_config(text, text, text, numeric) from public, anon;
revoke all on function public.admin_payments_overview() from public, anon;
grant execute on function public.admin_set_provider_enabled(text, boolean) to authenticated;
grant execute on function public.admin_set_provider_config(text, text, text, numeric) to authenticated;
grant execute on function public.admin_payments_overview() to authenticated;
-- ============================================================================
-- End Feature 006 — payments
-- ============================================================================
```

### Notes & invariants (payments)

- **No secret keys in the DB**: `payment_providers` holds only non-secret config; gateway keys live in edge-function secrets (FR-031/SC-013).
- **`payments` is service-role-write-only**: no client INSERT/UPDATE/DELETE policy; the per-provider edge functions write it. Admins read via `admin select all` (FR-036).
- **Idempotency**: unique `(provider, provider_ref)` makes a replayed webhook a no-op (FR-024/SC-010).
- **Double-pay guard**: partial unique `(user_id, kind, item_ref) where status in ('pending','paid')` backstops the in-function check (FR-039/SC-015); a `failed`/`cancelled` row frees the slot for a retry (FR-040).
- **`admin_overview()` extension**: add `'payments_received'` = `sum(amount_cents) where status='paid'` to the existing JSON (FR-038).
- The owner must also **deploy the edge functions** (`supabase functions deploy …`) and **set secrets** — MCP cannot do either; see `quickstart.md`.

