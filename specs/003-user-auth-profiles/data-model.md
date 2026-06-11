# Data Model: User Accounts with Social Sign-In & Scholarship-Matching Profiles

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md) | **DDL**: [contracts/db-schema.md](./contracts/db-schema.md)

Identity lives in Supabase-managed `auth.users` / `auth.identities` (never modified directly). All app tables live in `public`, keyed by `user_id uuid` referencing `auth.users(id) on delete cascade` — account deletion (FR-023) cascades through every table; storage objects are deleted by the account-deletion flow.

## Entities

### profiles — 1:1 with auth.users (FR-012, FR-013, FR-018)

| Field | Type | Rules |
|---|---|---|
| user_id | uuid PK, FK auth.users(id) on delete cascade | row created lazily on first profile save |
| full_name | text | required to *complete* profile; pre-filled from `user_metadata.full_name`/`name` when present (display only — never used for authorization) |
| address | text null | optional |
| city | text null | optional |
| country | text null | optional; country of residence (catalogue country names / free text) |
| nationality | text null | optional; used by matching |
| phone | text null | optional; loose validation (`+`, digits, spaces, 7–20 chars) |
| degree | text null | optional; CHECK in `('highschool','bachelor','master','phd')` — same vocabulary as catalogue `levels`, used by matching |
| photo_path | text null | storage object path `<user_id>/photo/...`; replaced on new upload |
| created_at / updated_at | timestamptz default now() | `updated_at` maintained by trigger |

Email is **not** duplicated here — it is `auth.users.email` (with `email_confirmed_at` driving the verification banner).

### profile_languages — N:1 profiles (FR-016)

| Field | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| user_id | uuid FK auth.users(id) on delete cascade | owner |
| language | text | required; UNIQUE (user_id, language) |
| cefr_level | text | CHECK in `('A1','A2','B1','B2','C1','C2','native')`; displayed with friendly labels |
| certificate_path | text null | storage path of the optional language certificate |
| created_at | timestamptz default now() | |

### certificates — degree/qualification uploads (FR-015)

| Field | Type | Rules |
|---|---|---|
| id | uuid PK default gen_random_uuid() | |
| user_id | uuid FK auth.users(id) on delete cascade | owner |
| file_path | text | storage path `<user_id>/certificates/<uuid>-<name>`; UNIQUE |
| file_name | text | original name for display |
| mime_type | text | client-validated: pdf/jpeg/png |
| size_bytes | int | ≤ 10 MB (client + bucket limit) |
| created_at | timestamptz default now() | |

(Language certificates are referenced directly from `profile_languages.certificate_path`; this table is for degree/qualification documents.)

### saved_scholarships (FR-008)

| Field | Type | Rules |
|---|---|---|
| user_id | uuid FK auth.users(id) on delete cascade | |
| scholarship_id | text | catalogue `id` from `scholarships.js` (scholarship data itself stays static, not in DB) |
| saved_at | timestamptz default now() | |
| — | PK (user_id, scholarship_id) | save is idempotent; unsave = delete |

### view_history (FR-009)

| Field | Type | Rules |
|---|---|---|
| id | bigint identity PK | |
| user_id | uuid FK auth.users(id) on delete cascade | |
| scholarship_id | text | |
| viewed_at | timestamptz default now() | |

Insert on detail-page load (deduped client-side: skip if same scholarship was last entry within 30 min). User can clear all (delete by user_id).

### search_history (FR-010)

| Field | Type | Rules |
|---|---|---|
| id | bigint identity PK | |
| user_id | uuid FK auth.users(id) on delete cascade | |
| query | text | trimmed; empty queries not recorded |
| filters | jsonb null | `{level, fund, country}` snapshot when non-default |
| searched_at | timestamptz default now() | |

Recorded debounced (≥ 1.5 s settle) for signed-in users; "recent searches" = last 8 distinct. User can clear all.

## Storage (FR-014/015/016/017/022)

- Bucket **`user-files`** (private). Layout: `<user_id>/photo/<filename>`, `<user_id>/certificates/<uuid>-<filename>`.
- Limits: photos JPG/PNG/WebP ≤ 5 MB; certificates PDF/JPG/PNG ≤ 10 MB (validated client-side; bucket-level `file_size_limit`/`allowed_mime_types` as backstop).
- Access: owner-only via storage RLS (first path folder = `auth.uid()`); display via signed URLs.

## Access control summary (R8)

Every table: RLS enabled; policies `TO authenticated` with `USING ((select auth.uid()) = user_id)` for SELECT/DELETE, `WITH CHECK` for INSERT, and **both** USING + WITH CHECK for UPDATE. Explicit `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`; **no** grants to `anon`. Full DDL in [contracts/db-schema.md](./contracts/db-schema.md).

## States & transitions

- **Account email**: `unverified` (banner shown; no auto-linking) → `verified` (`email_confirmed_at` set via magic-link/OTP or provider-verified at sign-up). Social-only X accounts may start `missing email` → "add email" prompt → `unverified` → `verified`.
- **Profile completeness** (drives FR-020 prompt + matching quality): `empty` → `basic` (name) → `matchable` (degree OR nationality OR ≥1 language) → `complete` (all matching fields present).
- **Linked identities**: 1..N identities per user; grows via auto-link (verified email) or manual connect (`linkIdentity`); never shrinks in v1 (unlink out of scope).

## Matching inputs (client-side, R10)

- From `scholarships.js`: `id`, `levels[]`, `country`, `fund`, `days`.
- From generated `match-index.js`: `{ levels?, nationality_signals?, language_signals? }` per id (heuristic, text-derived; absent ⇒ neutral).
- From profile: `degree`, `nationality`, `country`, languages (`language` + `cefr_level`).
- Output per scholarship: `score` (number) + `badge` (`match` | `caution` | `none`); never a hard "Not eligible" from heuristic-only signals.
