# Contract: DB schema — Feature 007 (CV profile builder)

**Delivery**: appended as a **dated, idempotent** section to `supabase-setup.sql`. The owner pastes the whole file into the Supabase SQL editor and runs it ([[sql-via-paste-ready-file]]). Supabase MCP stays **read-only** here (advisors only) — it does not apply this.

This feature is **additive only**: two columns on `public.profiles`. No new tables, no new policies, no functions, no edge functions.

---

## SQL to append to `supabase-setup.sql`

```sql
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
```

**Why no new RLS/policies.** `public.profiles` already has row-level policies scoped to `auth.uid() = user_id` for select/insert/update/delete (feature 003) plus an admin `select all` (feature 006). Row policies apply to every column of the row, so the new `cv`/`cv_theme` columns are already protected: a student can read/write only their own `cv`; admins can read it via the existing admin select. The `profiles_touch` trigger already refreshes `updated_at` on update.

**Why no CHECK on `cv_theme`.** Theme ids are validated client-side against the known 8. Omitting a DB CHECK means adding a 9th theme later needs no migration.

---

## Verification (run after paste; also `mcp__supabase__get_advisors`)

```sql
-- 1) Columns exist with expected types
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('cv','cv_theme');
-- expect: cv | jsonb   and   cv_theme | text

-- 2) Existing RLS still present on profiles (own-scoped + admin select all)
select policyname, cmd from pg_policies
where schemaname='public' and tablename='profiles'
order by policyname;

-- 3) Round-trip a value as the signed-in user (from the app, not SQL editor):
--    upsert profiles { user_id, cv: {...}, cv_theme: 'editorial', full_name: 'X' }
--    then confirm ticket-checkout still reads full_name/nationality/degree/field_of_interest.
```

**Advisors expectation**: no new security/performance findings attributable to this change (two nullable columns on an already-RLS'd table; no new policy surface). If `get_advisors` flags anything, resolve before shipping.

---

## Rollback (if ever needed)

```sql
-- Safe: drops only the two additive columns (destroys stored CV JSON + theme choice;
-- flat profile fields, certificates, photos, languages are untouched).
alter table public.profiles drop column if exists cv;
alter table public.profiles drop column if exists cv_theme;
```
