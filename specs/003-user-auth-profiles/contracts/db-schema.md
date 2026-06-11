# Contract: Database Schema, RLS & Storage Policies

**Canonical schema record** (no in-repo migration tooling — applied via Supabase dashboard SQL editor; see research R12).
After applying: run Supabase advisors (MCP `get_advisors`) and resolve findings before sign-off.

## Tables

```sql
-- 1:1 profile per auth user (email stays in auth.users)
create table public.profiles (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  address     text,
  city        text,
  country     text,
  nationality text,
  phone       text check (phone is null or phone ~ '^[+0-9][0-9 ()-]{6,19}$'),
  degree      text check (degree in ('highschool','bachelor','master','phd')),
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profile_languages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  language         text not null,
  cefr_level       text not null check (cefr_level in ('A1','A2','B1','B2','C1','C2','native')),
  certificate_path text,
  created_at       timestamptz not null default now(),
  unique (user_id, language)
);

create table public.certificates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  file_path  text not null unique,
  file_name  text not null,
  mime_type  text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create table public.saved_scholarships (
  user_id        uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  saved_at       timestamptz not null default now(),
  primary key (user_id, scholarship_id)
);

create table public.view_history (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  viewed_at      timestamptz not null default now()
);
create index view_history_user_idx on public.view_history (user_id, viewed_at desc);

create table public.search_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  query       text not null,
  filters     jsonb,
  searched_at timestamptz not null default now()
);
create index search_history_user_idx on public.search_history (user_id, searched_at desc);

-- keep updated_at fresh (SECURITY INVOKER — never DEFINER; see skill checklist)
create or replace function public.touch_updated_at()
returns trigger language plpgsql security invoker
set search_path = '' as
$$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
```

## Grants (required — since 2026-04-28 new tables are NOT auto-exposed to the Data API)

```sql
grant select, insert, update, delete
  on public.profiles, public.profile_languages, public.certificates,
     public.saved_scholarships, public.view_history, public.search_history
  to authenticated;
-- deliberately NO grants to anon: all account data is owner-only
```

## RLS — owner-only on every table

Pattern per the Supabase security checklist: `TO authenticated` **plus** ownership predicate;
UPDATE has **both** USING and WITH CHECK; INSERT has WITH CHECK.

```sql
alter table public.profiles           enable row level security;
alter table public.profile_languages  enable row level security;
alter table public.certificates      enable row level security;
alter table public.saved_scholarships enable row level security;
alter table public.view_history       enable row level security;
alter table public.search_history     enable row level security;

-- repeat this block for each table above (shown once for profiles)
create policy "own select" on public.profiles for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.profiles for insert
  to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.profiles for update
  to authenticated using ((select auth.uid()) = user_id)
                    with check ((select auth.uid()) = user_id);
create policy "own delete" on public.profiles for delete
  to authenticated using ((select auth.uid()) = user_id);
```

> `view_history` / `search_history` / `saved_scholarships` need select+insert+delete (no update).
> `profiles` / `profile_languages` / `certificates` need all four.

## Storage

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-files', 'user-files', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf']);

-- owner-only object access: first path folder must equal the user id.
-- INSERT + SELECT + UPDATE are all required for upsert to work (skill checklist).
create policy "own objects select" on storage.objects for select to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own objects insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own objects update" on storage.objects for update to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own objects delete" on storage.objects for delete to authenticated
  using (bucket_id = 'user-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

## Auth settings (dashboard, one-time)

| Setting | Value | Why |
|---|---|---|
| Email provider | enabled, **Confirm email OFF** | soft verification (FR-007a, research R5) |
| Providers | Google, Facebook, LinkedIn (OIDC), X (OAuth 2.0) | FR-002; client ids/secrets from each dev console (R2) |
| Manual linking | **enabled** (beta) | `linkIdentity` for Settings "connect" (FR-003a, R4) |
| Redirect allow-list | `http://localhost:8080/**` + production origin | OAuth return (R7) |

## Verification queries (run after apply)

```sql
-- every table RLS-enabled?
select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- policies present?
select tablename, policyname, cmd, roles from pg_policies where schemaname in ('public','storage');
```

Plus: MCP `get_advisors` (security + performance) must come back clean, and a signed-out
Data API request to any table must return zero rows / permission denied.
