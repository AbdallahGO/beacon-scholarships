-- ============================================================================
-- Beacon — feature 003 (user accounts) backend setup
-- Paste this WHOLE file into the Supabase dashboard SQL editor and Run.
-- Canonical contract: specs/003-user-auth-profiles/contracts/db-schema.md
-- IDEMPOTENT: safe to re-run the whole file any number of times — existing
-- objects are skipped or recreated identically, never duplicated or broken.
-- ============================================================================
-- ---------- tables ----------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  address text,
  city text,
  country text,
  nationality text,
  phone text check (
    phone is null
    or phone ~ '^[+0-9][0-9 ()-]{6,19}$'
  ),
  degree text check (
    degree in ('highschool', 'bachelor', 'master', 'phd')
  ),
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.profile_languages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  cefr_level text not null check (
    cefr_level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native')
  ),
  certificate_path text,
  created_at timestamptz not null default now(),
  unique (user_id, language)
);
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (
    size_bytes > 0
    and size_bytes <= 10485760
  ),
  created_at timestamptz not null default now()
);
create table if not exists public.saved_scholarships (
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, scholarship_id)
);
create table if not exists public.view_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  viewed_at timestamptz not null default now()
);
create index if not exists view_history_user_idx on public.view_history (user_id, viewed_at desc);
create table if not exists public.search_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  filters jsonb,
  searched_at timestamptz not null default now()
);
create index if not exists search_history_user_idx on public.search_history (user_id, searched_at desc);
-- keep updated_at fresh (SECURITY INVOKER — never DEFINER)
create or replace function public.touch_updated_at() returns trigger language plpgsql security invoker
set search_path = '' as $$ begin new.updated_at = now();
return new;
end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before
update on public.profiles for each row execute function public.touch_updated_at();
-- ---------- grants (new tables are NOT auto-exposed since 2026-04-28) -------
grant select,
  insert,
  update,
  delete on public.profiles,
  public.profile_languages,
  public.certificates,
  public.saved_scholarships,
  public.view_history,
  public.search_history to authenticated;
-- deliberately NO grants to anon: all account data is owner-only
-- ---------- row level security ----------------------------------------------
alter table public.profiles enable row level security;
alter table public.profile_languages enable row level security;
alter table public.certificates enable row level security;
alter table public.saved_scholarships enable row level security;
alter table public.view_history enable row level security;
alter table public.search_history enable row level security;
-- profiles: select / insert / update / delete
drop policy if exists "own select" on public.profiles;
create policy "own select" on public.profiles for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.profiles;
create policy "own insert" on public.profiles for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own update" on public.profiles;
create policy "own update" on public.profiles for
update to authenticated using (
    (
      select auth.uid()
    ) = user_id
  ) with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.profiles;
create policy "own delete" on public.profiles for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- profile_languages: select / insert / update / delete
drop policy if exists "own select" on public.profile_languages;
create policy "own select" on public.profile_languages for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.profile_languages;
create policy "own insert" on public.profile_languages for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own update" on public.profile_languages;
create policy "own update" on public.profile_languages for
update to authenticated using (
    (
      select auth.uid()
    ) = user_id
  ) with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.profile_languages;
create policy "own delete" on public.profile_languages for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- certificates: select / insert / update / delete
drop policy if exists "own select" on public.certificates;
create policy "own select" on public.certificates for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.certificates;
create policy "own insert" on public.certificates for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own update" on public.certificates;
create policy "own update" on public.certificates for
update to authenticated using (
    (
      select auth.uid()
    ) = user_id
  ) with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.certificates;
create policy "own delete" on public.certificates for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- saved_scholarships: select / insert / delete (no update)
drop policy if exists "own select" on public.saved_scholarships;
create policy "own select" on public.saved_scholarships for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.saved_scholarships;
create policy "own insert" on public.saved_scholarships for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.saved_scholarships;
create policy "own delete" on public.saved_scholarships for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- view_history: select / insert / delete (no update)
drop policy if exists "own select" on public.view_history;
create policy "own select" on public.view_history for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.view_history;
create policy "own insert" on public.view_history for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.view_history;
create policy "own delete" on public.view_history for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- search_history: select / insert / delete (no update)
drop policy if exists "own select" on public.search_history;
create policy "own select" on public.search_history for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own insert" on public.search_history;
create policy "own insert" on public.search_history for
insert to authenticated with check (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "own delete" on public.search_history;
create policy "own delete" on public.search_history for delete to authenticated using (
  (
    select auth.uid()
  ) = user_id
);
-- ---------- storage ----------------------------------------------------------
insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
  )
values (
    'user-files',
    'user-files',
    false,
    10485760,
    array ['image/jpeg','image/png','image/webp','application/pdf']
  ) on conflict (id) do nothing;
-- owner-only object access: first path folder must equal the user id.
-- INSERT + SELECT + UPDATE are all required for upsert to work.
drop policy if exists "own objects select" on storage.objects;
create policy "own objects select" on storage.objects for
select to authenticated using (
    bucket_id = 'user-files'
    and (storage.foldername(name)) [1] = (
      select auth.uid()
    )::text
  );
drop policy if exists "own objects insert" on storage.objects;
create policy "own objects insert" on storage.objects for
insert to authenticated with check (
    bucket_id = 'user-files'
    and (storage.foldername(name)) [1] = (
      select auth.uid()
    )::text
  );
drop policy if exists "own objects update" on storage.objects;
create policy "own objects update" on storage.objects for
update to authenticated using (
    bucket_id = 'user-files'
    and (storage.foldername(name)) [1] = (
      select auth.uid()
    )::text
  ) with check (
    bucket_id = 'user-files'
    and (storage.foldername(name)) [1] = (
      select auth.uid()
    )::text
  );
drop policy if exists "own objects delete" on storage.objects;
create policy "own objects delete" on storage.objects for delete to authenticated using (
  bucket_id = 'user-files'
  and (storage.foldername(name)) [1] = (
    select auth.uid()
  )::text
);
-- ---------- security hardening (added 2026-06-11) ----------------------------
-- Locks down a pre-existing platform helper so the API roles cannot call it
-- (Supabase advisor lints 0028/0029).
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
-- ---------- verification (optional, run after) -------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- select tablename, policyname, cmd, roles from pg_policies where schemaname in ('public','storage');
