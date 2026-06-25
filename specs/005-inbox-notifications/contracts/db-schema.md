# Contract: Database Schema (feature 005)

Appended **idempotently** to `supabase-setup.sql` as a dated section. Owner pastes the whole file in the Supabase SQL editor (MCP is read-only; [[sql-via-paste-ready-file]]). Re-runnable: `create table if not exists`, `create or replace function`, `drop trigger if exists` before `create trigger`, `do $$ … $$` guards for policies/publication.

> Reference DDL — final wording is set when implementing; this fixes the contract (columns, constraints, RLS, triggers, publication).

```sql
-- ============================================================
-- Feature 005: User Inbox & Notifications (2026-06-25)
-- ============================================================

-- 1) Inbox messages -----------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('welcome','booking','contact','admin')),
  payload     jsonb not null default '{}'::jsonb,
  title       text,
  body        text,
  ref         text,
  dedupe_key  text,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- one welcome / one booking-confirmation per user (FR-007/FR-009)
create unique index if not exists notifications_dedupe_idx
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.notifications enable row level security;

-- RLS: recipient reads/updates/deletes own; admins may insert (owner/dashboard sends).
-- NO user INSERT policy — system rows come from SECURITY DEFINER triggers + service-role webhook.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='own select') then
    create policy "own select" on public.notifications for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='own update') then
    create policy "own update" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='own delete') then
    create policy "own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='admin insert') then
    create policy "admin insert" on public.notifications for insert to authenticated
      with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;

-- Realtime delivery (RLS-filtered postgres_changes for the recipient)
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- 2) Signed-in contact submissions -------------------------------------------
create table if not exists public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text,
  email       text,
  message     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contact_messages' and policyname='own insert') then
    create policy "own insert" on public.contact_messages for insert to authenticated with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contact_messages' and policyname='own select') then
    create policy "own select" on public.contact_messages for select to authenticated using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contact_messages' and policyname='admin select all') then
    create policy "admin select all" on public.contact_messages for select to authenticated
      using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
  end if;
end $$;

-- 3) Welcome message on account creation (FR-007) -----------------------------
create or replace function public.notify_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, payload, ref, dedupe_key)
  values (new.user_id, 'welcome', '{}'::jsonb, 'account.html#profile', 'welcome')
  on conflict (user_id, dedupe_key) do nothing;
  return new;
end $$;

drop trigger if exists trg_notify_welcome on public.profiles;
create trigger trg_notify_welcome
  after insert on public.profiles
  for each row execute function public.notify_welcome();

-- 4) Contact acknowledgement (FR-010) -----------------------------------------
create or replace function public.notify_contact()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, payload)
  values (new.user_id, 'contact', '{}'::jsonb);
  return new;
end $$;

drop trigger if exists trg_notify_contact on public.contact_messages;
create trigger trg_notify_contact
  after insert on public.contact_messages
  for each row execute function public.notify_contact();

-- 5) Owner broadcast fan-out (FR-011, point-in-time) --------------------------
create or replace function public.admin_broadcast(p_title text, p_body text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  insert into public.notifications (user_id, type, title, body)
  select p.user_id, 'admin', p_title, p_body from public.profiles p;
  get diagnostics n = row_count;
  return n;
end $$;
```

## Invariants the schema guarantees

- A user can read/modify/delete **only** their own `notifications` rows (RLS) — including over Realtime.
- Users **cannot** insert notifications; only triggers (definer), the service-role webhook, and admins (own policy/helper) create them.
- At most one `welcome` and one `booking:<session>` notification per user (partial unique index).
- Deleting an auth user cascades away their notifications and contact messages.
- `admin_broadcast` and the `admin insert` policy require the caller to be in `public.admins`.

## Profile-trigger note

`notify_welcome` fires on `profiles` INSERT, which happens once at signup (auth.js upserts the profile after `signUp`). Re-pasting the setup file is safe (functions are `create or replace`, trigger is dropped+recreated, table/index/policy guarded). If the welcome ever needs to backfill existing users, run `admin_broadcast` or a one-off insert — not part of this contract.
