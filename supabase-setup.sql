-- ============================================================================
-- Beacon â€” feature 003 (user accounts) backend setup
-- Paste this WHOLE file into the Supabase dashboard SQL editor and Run.
-- Canonical contract: specs/003-user-auth-profiles/contracts/db-schema.md
-- IDEMPOTENT: safe to re-run the whole file any number of times â€” existing
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
-- keep updated_at fresh (SECURITY INVOKER â€” never DEFINER)
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
revoke execute on function public.rls_auto_enable()
from anon,
  authenticated,
  public;
-- ---------- verification (optional, run after) -------------------------------
-- select tablename, rowsecurity from pg_tables where schemaname = 'public';
-- select tablename, policyname, cmd, roles from pg_policies where schemaname in ('public','storage');
-- ============================================================================
-- Beacon â€” feature 004 (ticket booking, profiles, rankings) â€” 2026-06-13
-- Contract: specs/004-ticket-booking/contracts/db-schema.md
-- Idempotent: safe to re-run the whole file.
-- ============================================================================
-- ---------- profiles: new columns -------------------------------------------
alter table public.profiles
add column if not exists first_name text;
alter table public.profiles
add column if not exists last_name text;
alter table public.profiles
add column if not exists second_nationality text;
alter table public.profiles
add column if not exists gpa text;
alter table public.profiles
add column if not exists field_of_interest text;
alter table public.profiles
add column if not exists ticket_capacity integer not null default 1;
-- SECURITY NOTE (analysis finding S1): profiles.ticket_capacity is updatable by
-- the owner under the profiles "own update" policy, so it is treated as DISPLAY
-- ONLY. Authorization (how many concurrent tickets a user may hold) is computed
-- server-side in ticket-checkout as 1 + count(space_purchases for the user),
-- which only the service-role webhook can grow. Never trust ticket_capacity for
-- access decisions.
-- ---------- scholarship_rankings (public read; authoritative price) ----------
create table if not exists public.scholarship_rankings (
  scholarship_id text primary key,
  institution text,
  tier text not null check (
    tier in ('out_of_rank', 'lowest', 'medium', 'high')
  ),
  amount_cents integer not null check (amount_cents in (15000, 20000, 25000, 30000)),
  currency text not null default 'usd',
  updated_at timestamptz not null default now()
);
alter table public.scholarship_rankings enable row level security;
drop policy if exists "rankings public read" on public.scholarship_rankings;
create policy "rankings public read" on public.scholarship_rankings for
select to anon,
  authenticated using (true);
grant select on public.scholarship_rankings to anon,
  authenticated;
-- no insert/update/delete policies â†’ only the seed (table owner) writes.
-- ---------- admins (owner-only) ---------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
drop policy if exists "admins self select" on public.admins;
create policy "admins self select" on public.admins for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
grant select on public.admins to authenticated;
-- seed your owner id in the RANKING/ADMIN SEED block below.
-- ---------- tickets ----------------------------------------------------------
create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id text not null,
  scholarship_title text,
  institution text,
  ranking_tier text not null check (
    ranking_tier in ('out_of_rank', 'lowest', 'medium', 'high')
  ),
  amount_cents integer not null,
  currency text not null default 'usd',
  stripe_session_id text not null unique,
  stripe_payment_intent text,
  status text not null default 'active' check (status in ('active', 'revealed', 'void')),
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
create unique index if not exists tickets_user_scholarship_uniq on public.tickets (user_id, scholarship_id)
where status <> 'void';
alter table public.tickets enable row level security;
drop policy if exists "own select" on public.tickets;
create policy "own select" on public.tickets for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
drop policy if exists "admin select all" on public.tickets;
create policy "admin select all" on public.tickets for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = (
          select auth.uid()
        )
    )
  );
grant select on public.tickets to authenticated;
-- NO insert/update/delete policies â†’ only the service-role webhook writes.
-- ---------- space_purchases (idempotency ledger for +1 space) ----------------
create table if not exists public.space_purchases (
  stripe_session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.space_purchases enable row level security;
drop policy if exists "own select" on public.space_purchases;
create policy "own select" on public.space_purchases for
select to authenticated using (
    (
      select auth.uid()
    ) = user_id
  );
grant select on public.space_purchases to authenticated;
-- service role only for writes.
-- ---------- ADMIN SEED -------------------------------------------------------
-- The sole admin (owner). Re-running is safe (on conflict do nothing).
insert into public.admins (user_id)
values ('92e58300-446a-49c8-bd89-53ea0eeab696') on conflict (user_id) do nothing;
-- >>> BEACON RANKING SEED START (generated by ScholarShips_Data/build_ranking_index.ps1) <<<
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30513',
    'University of Melbourne',
    'high',
    30000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31494',
    'University of Melbourne',
    'high',
    30000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('29536', 'University of Sydney', 'high', 30000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26788',
    'University of Melbourne',
    'high',
    30000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26753',
    'University of Melbourne',
    'high',
    30000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('25079', 'Macquarie University', 'high', 30000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('24852', 'University of Sydney', 'high', 30000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24267',
    'Australian National University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '22382',
    'University of South Australia',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '22472',
    'University of South Australia',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '20223',
    'The University of Queensland',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '20286',
    'Curtin University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '19352',
    'Federation University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '19356',
    'Curtin University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '19355',
    'Federation University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30089',
    'Government of Flanders',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28047',
    'KU Leuven University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28046',
    'New College of Europe',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28045',
    'The University of LiÃ¨ge',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28044',
    'the University of Namur',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30278',
    'Global Affairs Canada',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28894',
    'McCall MacBain Scholarships',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31560',
    'University of Winnipeg',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '23978',
    'BeMo Academic Consulting',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30200',
    'University of Toronto',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29475',
    'Acadia University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29462',
    'Ø¬Ø§Ù…Ø¹Ø© ÙØ§Ù†ÙƒÙˆÙØ±',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29448',
    'Carleton University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27191',
    'Dutch Ministry of Education Culture And Science',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26886',
    'University of Guelph',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26273',
    'University of Manitoba',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24977',
    'Concordia University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24622',
    'The University of Aberdeen',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '19293',
    'University of Calgary',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30017',
    'University of Science and Technology of China (USTC)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26300',
    'Schwarzman Scholars',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30708',
    'Asian Development Bank',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28028',
    'Hunan University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28027',
    'Xiâ€™an Jiaotong University (XJTU) ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28026',
    'Fujian University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27188',
    'Chinese Government',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27008',
    'Tsinghua University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29485',
    'University of Prince Edward Island',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29455',
    'American University in Cairo (AUC)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28243',
    'the German University in Cairo',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27190',
    'The University of Westminster',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27207',
    'The Korean Government',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26501',
    'University of Aberdeen',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '25048',
    'University of Aberdeen',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24771',
    'University of Aberdeen',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('6049', 'Ahdaf', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29446',
    'French Government',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27837',
    'Nantes Tech University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30099',
    'Konrad-Adenauer-Stiftung',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30360',
    'Friedrich Ebert Foundation ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('30942', 'SBW Berlin', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30709',
    'Fondation Heinrich BÃ¶ll',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('31371', 'educations.com', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('29565', 'Ulm University', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29541',
    'Ø¬Ø§Ù…Ø¹Ø© Ø¯ÙŠØ³Ø¨ÙˆØ±Øº Ø§ÙŠØ³Ù†',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29454',
    'Heinrich Heine University DÃ¼sseldorf',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29379',
    'Max Planck Society',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29571',
    'Hesse Universities',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('28773', 'DAAD', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28301',
    'Berlin School of Business and Innovation',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29438',
    'Ø§Ù„Ø¬Ø§Ù…Ø¹Ø© Ø§Ù„Ø§Ø³Ù„Ø§Ù…ÙŠØ© ÙÙŠ Ø¥Ù†Ø¯ÙˆÙ†ÙŠØ³ÙŠØ§',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28043',
    'Andalas University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('28042', 'IPB University', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28041',
    'Universitas Padjadjaran - UNPAD',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30411',
    'School of Law, Cork',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29411',
    'Carlo Institute of Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28029',
    'Technological University of the Shannon (TUS)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27192',
    'Irish Research Council',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30035',
    'University of Genoa',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29712',
    'University of Macerata',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28018',
    'Luiss University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28017',
    'the University of Cassino and Southern Lazio',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28016',
    'Ancona University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28015',
    'The University of Verona',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '6400',
    'Bocconi University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31109',
    'International Monetary Fund (IMF)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29488',
    'Ø¬Ø§Ù…Ø¹Ø© ÙƒÙŠÙˆØªÙˆ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29471',
    'Ø¬Ø§Ù…Ø¹Ø© Ø´ÙŠØ¨Ø§ÙˆØ±Ø§',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29404',
    'Saitama University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29401',
    'Meiji University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28025',
    'Kagawa University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28023',
    'Shibaura Institute of Technology (SIT)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28024',
    'Tohoku University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('28022', 'Oita University', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27127',
    'Government of Japan',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('31292', 'QatarDebate', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27320',
    'Lusail University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '25144',
    'Hamad Bin Khalifa University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28036',
    'Alexandru Ioan Cuza University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28035',
    'BabeÈ™-Bolyai University (UBB)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28033',
    'PetroÈ™ani University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30258',
    'Skolkovo Institute of Science and Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28899',
    'SkolTech Institute of Science and Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28166',
    'Innopolis University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27126',
    'Ministry of Education and Science of the Russian Federation',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26790',
    'Singapore Management University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '16963',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '17055',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '16981',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '17030',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '17018',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '17017',
    'Nanyang Technological University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30169',
    'Korea University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29966',
    'The Korean Government',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29557',
    'Ø¬Ø§Ù…Ø¹Ø© Ù‡Ø§Ù…ÙŠ Ù„Ù„Ø¹Ù„ÙˆÙ… ÙˆØ§Ù„ØªÙƒÙ†ÙˆÙ„ÙˆØ¬ÙŠØ§',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29378',
    'YISS Summer School',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28048',
    'Ghent University Global Campus (GUGC)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26962',
    'Seoul National University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '26684',
    'Gwangju Institute of Science and Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30171',
    'Ministry of Education and Vocational Training of Spain',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30390',
    'Barcelona Executive Business School (BEBS)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30415',
    'Strategic HR and Change Management Program',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30417',
    'BEBS (Barcelona Executive Business School)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30416',
    'Barcelona Executive Business School (BEBS)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('30379', 'Les Roches', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28021',
    'Bilbao University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28020',
    'University of Granada',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28019',
    'the Autonomous University of Madrid',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29417',
    'Blekinge Institute of Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28032',
    'Kristianstad University ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31577',
    ' ÃœskÃ¼dar University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31576',
    'AltÄ±nbaÅŸ University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24687',
    'Eastern Mediterranean University (EMU)',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('15192', 'Resal', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '8681',
    'Government of Turkey',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '7761',
    'Dubai Electricity and Water Authority',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29544',
    'University of Emirates Aviation',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29397',
    'Khalifa University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28895',
    'Abu Dhabi University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '27325',
    'Mohamed bin Zayed University of Artificial Intelligence',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '25142',
    'Higher Colleges of Technology',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '24583',
    'Canadian University Dubai',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '20840',
    'Emirates Aviation University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '18573',
    'Abu Dhabi University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '18551',
    'Abu Dhabi University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '18608',
    'About Abu Dhabi University:',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '18530',
    'Abu Dhabi University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '16580',
    'Alqasimia University ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '14759',
    'About Abu Dhabi University:',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30563',
    'University of Bristol',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30184',
    'Nottingham Trent University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30185',
    'Nottingham Trent University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30448',
    'SOAS University of London',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30501',
    'University of Kent',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30495',
    'Robert Gordon University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30409',
    'Preston University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30407',
    'Bradford University ',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('30408', 'York University', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29423',
    'University of the Highlands and Islands',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('29043', 'Cambridge Trust', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '28009',
    'University of London',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('27063', 'Rhodes Trust', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30551',
    'Fulbright Program',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30377',
    'Fulbright Foreign Student Program in Jordan',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '31299',
    'The New York City Department of Citywide Administrative Services',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30568',
    'A & J Duct Cleaning',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('30471', 'Fulbright', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30332',
    'Orascom Construction',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30218',
    'Orascom Construction',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30057',
    'National Society of High School Scholars',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30553',
    'Eastern Florida State College',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '30969',
    'Boustany Foundation',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29892',
    'Miami University',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values ('29735', 'Yale University', 'out_of_rank', 15000) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
insert into public.scholarship_rankings (scholarship_id, institution, tier, amount_cents)
values (
    '29531',
    'University of Missouri USA',
    'out_of_rank',
    15000
  ) on conflict (scholarship_id) do
update
set institution = excluded.institution,
  tier = excluded.tier,
  amount_cents = excluded.amount_cents,
  updated_at = now();
-- >>> BEACON RANKING SEED END <<<
-- ============================================================================
-- Feature 005: User Inbox & Notifications (2026-06-25)
-- Idempotent. Safe to re-run. See specs/005-inbox-notifications/contracts/db-schema.md
-- ============================================================================
-- 1) Inbox messages -----------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (
    type in ('welcome', 'booking', 'contact', 'admin')
  ),
  payload jsonb not null default '{}'::jsonb,
  title text,
  body text,
  ref text,
  dedupe_key text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- one welcome / one booking-confirmation per user (FR-007 / FR-009)
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key)
where dedupe_key is not null;
alter table public.notifications enable row level security;
-- RLS: recipient reads/updates/deletes own; admins may insert (owner/dashboard sends).
-- NO user INSERT policy — system rows come from SECURITY DEFINER triggers + service-role webhook.
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and policyname = 'own select'
) then create policy "own select" on public.notifications for
select to authenticated using (user_id = auth.uid());
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and policyname = 'own update'
) then create policy "own update" on public.notifications for
update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and policyname = 'own delete'
) then create policy "own delete" on public.notifications for delete to authenticated using (user_id = auth.uid());
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'notifications'
    and policyname = 'admin insert'
) then create policy "admin insert" on public.notifications for
insert to authenticated with check (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
grant select,
  update,
  delete,
  insert on public.notifications to authenticated;
-- Realtime delivery (RLS-filtered postgres_changes for the recipient, FR-017)
do $$ begin if not exists (
  select 1
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'notifications'
) then alter publication supabase_realtime
add table public.notifications;
end if;
end $$;
-- 2) Signed-in contact submissions -------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'contact_messages'
    and policyname = 'own insert'
) then create policy "own insert" on public.contact_messages for
insert to authenticated with check (user_id = auth.uid());
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'contact_messages'
    and policyname = 'own select'
) then create policy "own select" on public.contact_messages for
select to authenticated using (user_id = auth.uid());
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'contact_messages'
    and policyname = 'admin select all'
) then create policy "admin select all" on public.contact_messages for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
grant select,
  insert on public.contact_messages to authenticated;
-- 3) Welcome message on account creation (FR-007) -----------------------------
create or replace function public.notify_welcome() returns trigger language plpgsql security definer
set search_path = public as $$ begin
insert into public.notifications (user_id, type, payload, ref, dedupe_key)
values (
    new.user_id,
    'welcome',
    '{}'::jsonb,
    'account.html#profile',
    'welcome'
  ) -- the dedupe index is PARTIAL (where dedupe_key is not null); the matching
  -- predicate is required here or inference fails with 42P10 and the AFTER
  -- INSERT rolls back the whole profile row (signup saves no data).
  on conflict (user_id, dedupe_key)
where dedupe_key is not null do nothing;
return new;
end $$;
drop trigger if exists trg_notify_welcome on public.profiles;
create trigger trg_notify_welcome
after
insert on public.profiles for each row execute function public.notify_welcome();
-- 4) Contact acknowledgement (FR-010) -----------------------------------------
create or replace function public.notify_contact() returns trigger language plpgsql security definer
set search_path = public as $$ begin
insert into public.notifications (user_id, type, payload)
values (new.user_id, 'contact', '{}'::jsonb);
return new;
end $$;
drop trigger if exists trg_notify_contact on public.contact_messages;
create trigger trg_notify_contact
after
insert on public.contact_messages for each row execute function public.notify_contact();
-- 5) Owner broadcast fan-out (FR-011, point-in-time) --------------------------
create or replace function public.admin_broadcast(p_title text, p_body text) returns integer language plpgsql security definer
set search_path = public as $$
declare n integer;
begin if not exists (
  select 1
  from public.admins
  where user_id = auth.uid()
) then raise exception 'not authorized';
end if;
insert into public.notifications (user_id, type, title, body)
select p.user_id,
  'admin',
  p_title,
  p_body
from public.profiles p;
get diagnostics n = row_count;
return n;
end $$;
-- Trigger functions must NOT be directly callable via the REST RPC surface
-- (they only ever run from their triggers; revoking EXECUTE does not affect
-- trigger firing, which runs with the function owner's privileges).
revoke all on function public.notify_welcome()
from public,
  anon,
  authenticated;
revoke all on function public.notify_contact()
from public,
  anon,
  authenticated;
-- admin_broadcast: callable only by signed-in users (the owner dashboard); it
-- additionally self-guards on public.admins and raises for non-admins.
revoke all on function public.admin_broadcast(text, text)
from public,
  anon;
grant execute on function public.admin_broadcast(text, text) to authenticated;
-- ============================================================================
-- End Feature 005
-- ============================================================================
-- ============================================================================
-- Beacon — Feature 006 (admin dashboard) backend setup (2026-06-26)
-- Idempotent. Safe to re-run. See specs/006-admin-dashboard/contracts/db-schema.md
-- ============================================================================
-- 1) Sent-message log (FR-011a/b) --------------------------------------------
create table if not exists public.admin_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references auth.users(id) on delete
  set null,
    target_type text not null check (target_type in ('user', 'all')),
    target_user_id uuid references auth.users(id) on delete
  set null,
    target_email text,
    title text check (
      title is null
      or char_length(title) <= 200
    ),
    body text not null check (
      char_length(body) between 1 and 5000
    ),
    recipient_count integer not null default 0,
    created_at timestamptz not null default now()
);
create index if not exists admin_messages_created_idx on public.admin_messages (created_at desc);
alter table public.admin_messages enable row level security;
-- admins read the full send history; NO client insert/update/delete
-- (rows are written only by the SECURITY DEFINER send functions below).
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'admin_messages'
    and policyname = 'admin select all'
) then create policy "admin select all" on public.admin_messages for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
grant select on public.admin_messages to authenticated;
-- 2) Admin read access to profiles (Accounts pane, FR-017) --------------------
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'admin select all'
) then create policy "admin select all" on public.profiles for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
-- 3) Internal helper: insert one admin inbox message + return 1 ----------------
--    (not exposed via RPC; called only by the send functions in this section)
create or replace function public.admin_message_insert(p_user_id uuid, p_title text, p_body text) returns integer language plpgsql security definer
set search_path = public as $$ begin
insert into public.notifications (user_id, type, title, body, ref, dedupe_key)
values (
    p_user_id,
    'admin',
    nullif(btrim(p_title), ''),
    p_body,
    'account.html#inbox',
    null
  );
return 1;
end $$;
-- 4) Broadcast to all users (FR-006/010/011/013) — EXTENDED to log ------------
-- "All users" = every registered account (auth.users), NOT only users with a
-- completed profile, so no account is silently excluded from a broadcast.
-- (Replaces the feature-005 body; same (text,text)->integer signature.)
create or replace function public.admin_broadcast(p_title text, p_body text) returns integer language plpgsql security definer
set search_path = public as $$
declare n integer;
begin if not exists (
  select 1
  from public.admins
  where user_id = auth.uid()
) then raise exception 'not authorized';
end if;
if coalesce(btrim(p_body), '') = '' then raise exception 'empty_body';
end if;
if char_length(p_body) > 5000 then raise exception 'body_too_long';
end if;
if p_title is not null
and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long';
end if;
insert into public.notifications (user_id, type, title, body, ref, dedupe_key)
select u.id,
  'admin',
  nullif(btrim(p_title), ''),
  p_body,
  'account.html#inbox',
  null
from auth.users u;
get diagnostics n = row_count;
insert into public.admin_messages (
    sender_id,
    target_type,
    title,
    body,
    recipient_count
  )
values (
    auth.uid(),
    'all',
    nullif(btrim(p_title), ''),
    p_body,
    n
  );
return n;
end $$;
-- 5) Single send to a known user id (FR-007 compose-by-id + FR-015a reply) -----
create or replace function public.admin_send_to_user(p_user_id uuid, p_title text, p_body text) returns integer language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
if coalesce(btrim(p_body), '') = '' then raise exception 'empty_body';
end if;
if char_length(p_body) > 5000 then raise exception 'body_too_long';
end if;
if p_title is not null
and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long';
end if;
if not exists (
  select 1
  from auth.users u
  where u.id = p_user_id
) then raise exception 'recipient_not_found';
end if;
perform public.admin_message_insert(p_user_id, p_title, p_body);
insert into public.admin_messages (
    sender_id,
    target_type,
    target_user_id,
    title,
    body,
    recipient_count
  )
values (
    auth.uid(),
    'user',
    p_user_id,
    nullif(btrim(p_title), ''),
    p_body,
    1
  );
return 1;
end $$;
-- 6) Single send by email (FR-007/012) — resolves in auth.users ---------------
create or replace function public.admin_send_to_email(p_email text, p_title text, p_body text) returns integer language plpgsql security definer
set search_path = public as $$
declare uid uuid;
begin if not exists (
  select 1
  from public.admins
  where user_id = auth.uid()
) then raise exception 'not authorized';
end if;
if coalesce(btrim(p_body), '') = '' then raise exception 'empty_body';
end if;
if char_length(p_body) > 5000 then raise exception 'body_too_long';
end if;
if p_title is not null
and char_length(btrim(p_title)) > 200 then raise exception 'title_too_long';
end if;
select u.id into uid
from auth.users u
where lower(u.email) = lower(btrim(p_email))
limit 1;
if uid is null then raise exception 'recipient_not_found';
end if;
perform public.admin_message_insert(uid, p_title, p_body);
insert into public.admin_messages (
    sender_id,
    target_type,
    target_user_id,
    target_email,
    title,
    body,
    recipient_count
  )
values (
    auth.uid(),
    'user',
    uid,
    btrim(p_email),
    nullif(btrim(p_title), ''),
    p_body,
    1
  );
return 1;
end $$;
-- 7) Overview counts (FR-016) — note: redefined in the payments block below to
--    also return payments_received once the payments table exists. ------------
create or replace function public.admin_overview() returns json language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
return json_build_object(
  'users',
  (
    select count(*)
    from auth.users
  ),
  'profiles',
  (
    select count(*)
    from public.profiles
  ),
  'tickets',
  (
    select count(*)
    from public.tickets
  ),
  'contact_messages',
  (
    select count(*)
    from public.contact_messages
  ),
  'messages_sent',
  (
    select count(*)
    from public.admin_messages
  )
);
end $$;
-- 8) Grants: callable by signed-in users; functions self-guard on admins ------
revoke all on function public.admin_message_insert(uuid, text, text)
from public,
  anon,
  authenticated;
revoke all on function public.admin_broadcast(text, text)
from public,
  anon;
revoke all on function public.admin_send_to_user(uuid, text, text)
from public,
  anon;
revoke all on function public.admin_send_to_email(text, text, text)
from public,
  anon;
revoke all on function public.admin_overview()
from public,
  anon;
grant execute on function public.admin_broadcast(text, text) to authenticated;
grant execute on function public.admin_send_to_user(uuid, text, text) to authenticated;
grant execute on function public.admin_send_to_email(text, text, text) to authenticated;
grant execute on function public.admin_overview() to authenticated;
-- ============================================================================
-- Beacon — Feature 006 (multi-provider payments) backend setup (2026-06-26)
-- Idempotent. Safe to re-run. See specs/006-admin-dashboard/contracts/db-schema.md (Part B)
-- ============================================================================
-- 1) Provider config (US7) — NO secret keys -----------------------------------
create table if not exists public.payment_providers (
  provider text primary key check (
    provider in ('stripe', 'paypal', 'paymob', 'kashier')
  ),
  display_name text not null,
  enabled boolean not null default false,
  currency text not null default 'USD',
  fx_rate numeric not null default 1.0 check (fx_rate > 0),
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.payment_providers enable row level security;
-- public sees only ENABLED providers (non-secret columns); admins see all
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'payment_providers'
    and policyname = 'providers public read enabled'
) then create policy "providers public read enabled" on public.payment_providers for
select to anon,
  authenticated using (enabled = true);
end if;
if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'payment_providers'
    and policyname = 'providers admin read all'
) then create policy "providers admin read all" on public.payment_providers for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
grant select on public.payment_providers to anon,
  authenticated;
-- seed the four providers (stripe on; others off until configured)
insert into public.payment_providers (
    provider,
    display_name,
    currency,
    fx_rate,
    enabled,
    sort_order
  )
values (
    'stripe',
    'Card (Stripe)',
    'USD',
    1.0,
    true,
    10
  ),
  (
    'paypal',
    'PayPal',
    'USD',
    1.0,
    false,
    20
  ),
  (
    'paymob',
    'Paymob',
    'EGP',
    50.0,
    false,
    30
  ),
  (
    'kashier',
    'Kashier',
    'EGP',
    50.0,
    false,
    40
  ) on conflict (provider) do nothing;
-- 2) Payments ledger (US6/US8) — written ONLY by edge functions ---------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete
  set null,
    provider text not null references public.payment_providers(provider),
    kind text not null check (kind in ('ticket', 'space')),
    item_ref text not null,
    amount_cents integer not null check (amount_cents > 0),
    currency text not null,
    status text not null default 'pending' check (
      status in ('pending', 'paid', 'failed', 'cancelled')
    ),
    provider_ref text,
    ticket_id uuid references public.tickets(id) on delete
  set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create index if not exists payments_created_idx on public.payments (created_at desc);
-- idempotency: one row per provider order/session
create unique index if not exists payments_provider_ref_idx on public.payments (provider, provider_ref)
where provider_ref is not null;
-- double-pay backstop: at most one active payment per user+item
create unique index if not exists payments_active_item_idx on public.payments (user_id, kind, item_ref)
where status in ('pending', 'paid');
alter table public.payments enable row level security;
-- admins read the ledger; NO client write (service-role functions write it)
do $$ begin if not exists (
  select 1
  from pg_policies
  where schemaname = 'public'
    and tablename = 'payments'
    and policyname = 'admin select all'
) then create policy "admin select all" on public.payments for
select to authenticated using (
    exists (
      select 1
      from public.admins a
      where a.user_id = auth.uid()
    )
  );
end if;
end $$;
grant select on public.payments to authenticated;
-- 3) Link bookings to the funding payment/provider (FR-037) --------------------
alter table public.tickets
add column if not exists provider text references public.payment_providers(provider);
alter table public.tickets
add column if not exists payment_id uuid references public.payments(id) on delete
set null;
alter table public.space_purchases
add column if not exists provider text references public.payment_providers(provider);
alter table public.space_purchases
add column if not exists payment_id uuid references public.payments(id) on delete
set null;
-- 4) Admin: toggle a provider (FR-029) ---------------------------------------
create or replace function public.admin_set_provider_enabled(p_provider text, p_enabled boolean) returns boolean language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
update public.payment_providers
set enabled = p_enabled,
  updated_at = now()
where provider = p_provider;
if not found then raise exception 'unknown_provider';
end if;
return p_enabled;
end $$;
-- 5) Admin: edit non-secret config (FR-030) — NEVER a secret key --------------
create or replace function public.admin_set_provider_config(
    p_provider text,
    p_display_name text,
    p_currency text,
    p_fx_rate numeric
  ) returns boolean language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
if p_fx_rate is null
or p_fx_rate <= 0 then raise exception 'bad_fx_rate';
end if;
update public.payment_providers
set display_name = coalesce(nullif(btrim(p_display_name), ''), display_name),
  currency = coalesce(nullif(btrim(p_currency), ''), currency),
  fx_rate = p_fx_rate,
  updated_at = now()
where provider = p_provider;
if not found then raise exception 'unknown_provider';
end if;
return true;
end $$;
-- 6) Admin: per-provider payment totals (FR-034/FR-038) -----------------------
create or replace function public.admin_payments_overview() returns json language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
return json_build_object(
  'total_received_cents',
  (
    select coalesce(sum(amount_cents), 0)
    from public.payments
    where status = 'paid'
  ),
  'by_provider',
  (
    select coalesce(json_agg(row_to_json(t)), '[]'::json)
    from (
        select p.provider,
          count(*) filter (
            where pay.status = 'paid'
          ) as paid_count,
          coalesce(
            sum(pay.amount_cents) filter (
              where pay.status = 'paid'
            ),
            0
          ) as paid_cents,
          p.currency
        from public.payment_providers p
          left join public.payments pay on pay.provider = p.provider
        group by p.provider,
          p.currency,
          p.sort_order
        order by p.sort_order
      ) t
  )
);
end $$;
-- 7) Extend admin_overview() to also return payments_received (FR-038) --------
create or replace function public.admin_overview() returns json language plpgsql security definer
set search_path = public as $$ begin if not exists (
    select 1
    from public.admins
    where user_id = auth.uid()
  ) then raise exception 'not authorized';
end if;
return json_build_object(
  'users',
  (
    select count(*)
    from auth.users
  ),
  'profiles',
  (
    select count(*)
    from public.profiles
  ),
  'tickets',
  (
    select count(*)
    from public.tickets
  ),
  'contact_messages',
  (
    select count(*)
    from public.contact_messages
  ),
  'messages_sent',
  (
    select count(*)
    from public.admin_messages
  ),
  'payments_received',
  (
    select coalesce(sum(amount_cents), 0)
    from public.payments
    where status = 'paid'
  )
);
end $$;
-- 8) Grants ------------------------------------------------------------------
revoke all on function public.admin_set_provider_enabled(text, boolean)
from public,
  anon;
revoke all on function public.admin_set_provider_config(text, text, text, numeric)
from public,
  anon;
revoke all on function public.admin_payments_overview()
from public,
  anon;
grant execute on function public.admin_set_provider_enabled(text, boolean) to authenticated;
grant execute on function public.admin_set_provider_config(text, text, text, numeric) to authenticated;
grant execute on function public.admin_payments_overview() to authenticated;
-- ============================================================================
-- End Feature 006
-- ============================================================================
-- ============================================================================
-- Beacon — feature 007 (CV profile builder) — 2026-07-05
-- Canonical contract: specs/007-cv-profile-builder/contracts/db-schema.md
-- Additive & idempotent: two columns on public.profiles. No new tables/policies.
-- The CV builder stores the whole CV object in `cv` and the theme id in
-- `cv_theme`, and mirrors full_name/nationality/degree/field_of_interest into
-- the existing flat columns on save so ticket-checkout + admin keep working.
-- ============================================================================
alter table public.profiles
  add column if not exists cv jsonb;
alter table public.profiles
  add column if not exists cv_theme text;

comment on column public.profiles.cv is
  'Feature 007: full CV builder object (contact/objective/education/experience/honors/skills/activities + theme). Owner-scoped by existing profiles RLS.';
comment on column public.profiles.cv_theme is
  'Feature 007: selected CV theme id (also present as cv->>''theme''). No DB CHECK so new themes need no migration.';
-- ============================================================================
-- End Feature 007
-- ============================================================================
