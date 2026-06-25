# Phase 1 Data Model: User Inbox & Notifications

Feature: `005-inbox-notifications` · Date: 2026-06-25

Two new tables, both RLS-enabled, both `ON DELETE CASCADE` from `auth.users`. All inbox writes flow through trusted paths (triggers, service-role webhook, admin policy) — see [research.md](./research.md) R2. DDL is appended idempotently to `supabase-setup.sql` (owner pastes; MCP is read-only).

---

## Table: `public.notifications` (the inbox)

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `user_id` | `uuid` NOT NULL | recipient; `references auth.users(id) on delete cascade` (FR-015) |
| `type` | `text` NOT NULL | `check (type in ('welcome','booking','contact','admin'))` |
| `payload` | `jsonb` NOT NULL | `default '{}'`; structured facts for templated system messages (e.g. booking: `{scholarship_title, ticket_code, available_at}`). Empty for welcome/contact |
| `title` | `text` NULL | literal title for `admin` messages (free-form). NULL for system types (rendered from templates) |
| `body` | `text` NULL | literal body for `admin` messages. NULL for system types |
| `ref` | `text` NULL | optional link target / reference (e.g. `account.html#ticket`, scholarship id) |
| `dedupe_key` | `text` NULL | idempotency key; `'welcome'`, `'booking:'+session_id`; NULL for contact/admin |
| `is_read` | `boolean` NOT NULL | `default false` |
| `created_at` | `timestamptz` NOT NULL | `default now()` |
| `read_at` | `timestamptz` NULL | set when first marked read |

**Indexes**
- `(user_id, created_at desc)` — inbox list + unread scan (newest-first, FR-001).
- **partial unique** `(user_id, dedupe_key) where dedupe_key is not null` — one welcome / one booking confirmation (FR-007/009, R9).

**RLS** (`alter table … enable row level security`)
- `own select`: `to authenticated using (user_id = auth.uid())` — FR-006/014.
- `own update`: `to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())` — flip `is_read`/`read_at`, FR-003/004.
- `own delete`: `to authenticated using (user_id = auth.uid())` — FR-004.
- `admin insert`: `to authenticated with check (exists (select 1 from public.admins a where a.user_id = auth.uid()))` — owner/dashboard single + broadcast sends, FR-011/R7.
- **No user INSERT policy** — system rows come from SECURITY DEFINER triggers and the service-role webhook (R2). (`bypassrls` service role inserts unconditionally.)

**Realtime**: `alter publication supabase_realtime add table public.notifications;` — RLS-filtered postgres_changes for the recipient (FR-017, R1).

### State

```
(row created by trusted path) → is_read=false  ──open / mark read──▶  is_read=true, read_at=now()
                                       ▲                                   │
                                       └────────── mark unread ────────────┘
                                       (read_at retained or cleared; user delete removes the row entirely)
```

---

## Table: `public.contact_messages` (signed-in contact submissions)

Backs the contact acknowledgement (FR-010) and gives the future admin dashboard a record of inbound messages (R6).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | `default gen_random_uuid()` |
| `user_id` | `uuid` NOT NULL | author; `references auth.users(id) on delete cascade` (FR-015) |
| `name` | `text` NULL | snapshot from the form |
| `email` | `text` NULL | snapshot from the form |
| `message` | `text` NOT NULL | the body the user sent |
| `created_at` | `timestamptz` NOT NULL | `default now()` |

**Indexes**: `(created_at desc)` — dashboard listing.

**RLS**
- `own insert`: `to authenticated with check (user_id = auth.uid())` — a signed-in user can file their own message (the only client write that triggers an ack).
- `own select`: `to authenticated using (user_id = auth.uid())` — author can see their own.
- `admin select all`: `to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()))` — future dashboard.

> Anonymous submissions are NOT inserted here (no auth, no policy) — they keep the existing mailto / on-page confirmation path.

---

## Trigger functions (SECURITY DEFINER, `set search_path = public`)

### `notify_welcome()` — `AFTER INSERT ON public.profiles`
Inserts one `type='welcome'` notification for `NEW.user_id` with `dedupe_key='welcome'`, `payload='{}'`, `ref='account.html#profile'`. `ON CONFLICT (user_id, dedupe_key) DO NOTHING` (idempotent, FR-007/R4). Returns `NEW`.

### `notify_contact()` — `AFTER INSERT ON public.contact_messages`
Inserts one `type='contact'` ack notification for `NEW.user_id`, `payload='{}'`, `dedupe_key=NULL` (each submission acked, FR-010/R6). Returns `NEW`.

> SECURITY DEFINER lets these insert into `notifications` despite the absence of a user INSERT policy; `set search_path = public` per Postgres security guidance.

---

## Helper: `admin_broadcast(p_title text, p_body text)` (SECURITY DEFINER)

Owner/dashboard broadcast (FR-011, point-in-time fan-out, R7).

1. Guard: `if not exists (select 1 from public.admins where user_id = auth.uid()) then raise exception …` — admins only.
2. `insert into public.notifications (user_id, type, title, body) select p.user_id, 'admin', p_title, p_body from public.profiles p;` — one row per **existing** user; later registrants get nothing.

Single targeted owner messages do not need the helper — the dashboard (or a manual SQL insert) inserts one `type='admin'` row under the `admin insert` policy.

---

## Localization mapping (client render, R3)

`inbox.js` renders each row by `type` using the viewer's `beacon-lang` (`en` default / `ar`):

| type | EN title / body source | AR title / body source | dir |
|------|------------------------|------------------------|-----|
| `welcome` | template (congrats + next step) | template | per lang |
| `booking` | template + `payload.scholarship_title`, `payload.ticket_code`, `payload.available_at` | template + payload | per lang |
| `contact` | template (we received your message) | template | per lang |
| `admin` | literal `title` / `body` (as authored) | literal `title` / `body` | auto (rtl if Arabic text) |

Unread count = `count(*) where user_id = auth.uid() and is_read = false` (rendered as the nav badge; capped display e.g. `9+`).

---

## Requirement → schema/path traceability

| FR | Mechanism |
|----|-----------|
| FR-001 list newest-first | `notifications` + `(user_id, created_at desc)` index |
| FR-002 / FR-002a unread count + nav bell | count query + `inbox.js` badge |
| FR-003 mark read on open | `own update` (is_read/read_at) |
| FR-004 mark read/unread, delete | `own update` + `own delete` |
| FR-005 empty state | client render |
| FR-006 / FR-014 isolation | `own select` RLS + Realtime RLS |
| FR-007 one welcome | `notify_welcome()` + partial unique `'welcome'` |
| FR-008 booking confirmation | stripe-webhook insert (kind='ticket') |
| FR-009 one per completed booking, none on fail | webhook fires only on `checkout.session.completed`; dedupe `'booking:'+session.id` |
| FR-010 contact ack (signed-in only) | `contact_messages` + `notify_contact()`; anon stays mailto |
| FR-011 owner single + broadcast | `admin insert` policy + `admin_broadcast()` |
| FR-012 message fields | `notifications` columns |
| FR-013 system + admin coexist, distinguishable | shared list ordered by `created_at`, `type` drives label/style |
| FR-015 delete-account cleanup | `on delete cascade` on both tables |
| FR-016 primary action survives, no dupes | triggers/webhook are post-commit/idempotent; dedupe index |
| FR-017 / SC-008 real-time | `supabase_realtime` publication + client channel |
| FR-018 EN/AR localization | type+payload templates from `beacon-lang` |
