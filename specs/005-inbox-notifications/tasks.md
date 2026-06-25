# Tasks: User Inbox & Notifications

**Input**: Design documents from `/specs/005-inbox-notifications/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Automated tests are NOT requested for this feature. Validation is manual + browser acceptance per `quickstart.md` (consistent with features 001–004). No automated test tasks are generated.

**Organization**: Tasks are grouped by user story. Each story is an independently testable increment. Schema/triggers/policies all live in the single idempotent `supabase-setup.sql`; the owner re-pastes it (MCP is read-only). The owner also redeploys the existing `stripe-webhook` — **no new edge function** is created.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1–US5; setup/foundational/polish carry no story label
- **[Owner]**: Owner-gated step (paste SQL / deploy) — MCP cannot do it

## Path Conventions

Flat static site at repo root: `index.html`, `account.html`, `contact.html`, `inbox.js`, `account.js`, `auth.js`, `index.css`, `supabase-setup.sql`; edge functions under `supabase/functions/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolds the new client module and the SQL section so later tasks slot in cleanly.

- [X] T001 Create `inbox.js` skeleton at repo root: IIFE, degrade-safe guards (no `BeaconAuth`/Supabase or `file://` → no-op), and `window.BeaconInbox = { render, localize, refresh }` stubs that consume `BeaconAuth.onChange`/`getUser`.
- [X] T002 [P] Add a dated `-- Feature 005: User Inbox & Notifications (2026-06-25)` idempotent section marker to `supabase-setup.sql`, immediately after the feature-004 block.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `notifications` data layer + shared localization that EVERY user story depends on. No story can be tested until this is applied.

**⚠️ MUST complete before any user story phase.**

- [X] T003 In `supabase-setup.sql`, create `public.notifications` table (columns per data-model.md) plus the `(user_id, created_at desc)` index and the partial unique `(user_id, dedupe_key) where dedupe_key is not null` index. Per `contracts/db-schema.md`.
- [X] T004 In `supabase-setup.sql`, `enable row level security` on `public.notifications` and add the guarded `own select`, `own update` (with check), and `own delete` policies. (Admin-insert policy is added later in US5.)
- [X] T005 In `supabase-setup.sql`, add `public.notifications` to the `supabase_realtime` publication via the guarded `do $$ … alter publication … $$` block.
- [X] T006 [P] In `inbox.js`, implement the `I18N` localization map (en + ar title/body templates for `welcome`, `booking`, `contact`; `admin` = literal `title`/`body`) selected by `localStorage['beacon-lang'] || 'en'`, with `payload` interpolation and a friendly date formatter for `available_at`. Per `contracts/ui-behavior.md` §3.
- [ ] T007 [Owner] Paste the updated `supabase-setup.sql` in the Supabase SQL editor (idempotent), confirm `notifications` is in `supabase_realtime` (Database → Publications), and run `get_advisors` — expect clean. Unblocks US1 testing.

**Checkpoint**: `notifications` table exists, is RLS-protected and Realtime-enabled; localization templates exist.

---

## Phase 3: User Story 1 — Read my inbox (Priority: P1) 🎯 MVP

**Goal**: A signed-in user can see, read, mark, and delete their inbox messages, with a live nav bell + unread badge.

**Independent Test**: Seed one `notifications` row for a test user (manual SQL), sign in, and confirm the bell badge shows it, the dropdown/pane lists it newest-first, opening clears unread + decrements the badge, delete removes it, empty state shows when none, and signed-out users see no bell.

- [X] T008 [US1] In `inbox.js`, inject the nav bell (`.nav-bell`) + unread badge (`.nav-bell-badge`) beside `#navAccount`, visible only when signed in; badge shows `N` / `9+` / empty at 0. (FR-002a)
- [X] T009 [US1] In `inbox.js`, on `BeaconAuth.onChange` sign-in fetch the unread count (head+count query) and recent rows (`select … order created_at desc limit 50`); render badge; clear badge/state on sign-out. Per `contracts/notifications-api.md` read side. (FR-001/002)
- [X] T010 [US1] In `inbox.js`, open a Realtime channel `inbox:<uid>` on `notifications` filtered `user_id=eq.<uid>`; apply INSERT (prepend + bump), UPDATE (restyle + recount), DELETE (remove + recount) in place; `removeChannel` on sign-out. Per `contracts/notifications-api.md` realtime. (FR-017/SC-008)
- [X] T011 [US1] In `inbox.js`, build the quick-view dropdown on bell click: recent rows via `BeaconInbox.render`/`localize`, row open → mark read + show body/follow `ref`, footer "View all" → `account.html#inbox`, "Mark all read" action. (FR-003)
- [X] T012 [P] [US1] In `account.html`, add `<a href="#inbox" data-tab="inbox">Inbox</a>` to `#acctTabs` and `<section class="acct-pane" id="pane-inbox"></section>`.
- [X] T013 [US1] In `account.js`, render the full Inbox pane: list ≤50 newest-first with unread styling, per-row open→read, mark read/unread toggle, delete; header unread count + "Mark all read"; localized empty state; reuse `BeaconInbox.render`/`localize`. (FR-001/003/004/005)
- [X] T014 [P] [US1] In `index.css`, add `.nav-bell`, `.nav-bell-badge`, `.inbox-dropdown`/`.inbox-item`/`.is-unread`, `#pane-inbox` list + action buttons + header, `.inbox-empty`, and `[dir="rtl"]` message handling — themed with existing vars for dark-mode parity. Per `contracts/ui-behavior.md` §6.
- [X] T015 [US1] Add `<script src="inbox.js"></script>` after `auth.js` on `index.html`, `scholarship.html`, `account.html`, `contact.html`, `faq.html`, `how-to-apply.html`, `writing-your-essay.html`.
- [ ] T016 [US1] Acceptance (manual + browser harness, msedge): seed a row → verify badge, newest-first list, open→read decrements, mark-unread restores, delete removes + recount, empty state, signed-out has no bell. `node --check inbox.js account.js`. (SC-001/004; list portion of SC-005)

**Checkpoint**: US1 is a working MVP — the inbox surface functions for any message that exists.

---

## Phase 4: User Story 2 — Welcome message on account creation (Priority: P2)

**Goal**: Every new account gets exactly one welcome message.

**Independent Test**: Create a brand-new account, open the inbox → one unread `welcome`; sign out/in again → no duplicate.

- [X] T017 [US2] In `supabase-setup.sql`, add `notify_welcome()` (SECURITY DEFINER, `set search_path = public`) and the `AFTER INSERT ON public.profiles` trigger `trg_notify_welcome` inserting a `type='welcome'` row with `dedupe_key='welcome'`, `ref='account.html#profile'`, `on conflict (user_id, dedupe_key) do nothing`. Per `contracts/db-schema.md` §3. (FR-007)
- [ ] T018 [US2] [Owner] Re-paste `supabase-setup.sql`; acceptance: new account → exactly one welcome (rendered from the `welcome` template, EN/AR); re-sign-in creates no duplicate. (SC-002)

---

## Phase 5: User Story 3 — Booking confirmation in inbox (Priority: P2)

**Goal**: Each successful booking yields exactly one confirmation; none for failed/abandoned payments.

**Independent Test**: Complete a successful test booking → one unread `booking` message naming scholarship + code + availability; cancel a checkout → none; re-deliver the webhook → still one.

- [X] T019 [US3] In `supabase/functions/stripe-webhook/index.ts`, inside the `kind === "ticket"` branch after the `tickets` insert, insert a `type='booking'` notification (service-role `admin` client) with `dedupe_key='booking:'+session.id`, `ref='account.html#ticket'`, and `payload={ scholarship_title, ticket_code, available_at: cooldownEnd }`; ignore duplicate-key errors. Per `contracts/notifications-api.md`. (FR-008/009)
- [X] T020 [US3] In `supabase/functions/ticket-checkout/index.ts`, ensure the Checkout Session `metadata` carries `scholarship_title` (add it if absent) so the booking message can name the scholarship.
- [ ] T021 [US3] [Owner] Redeploy `stripe-webhook` **with JWT verification OFF** (and `ticket-checkout` if T020 changed it); acceptance: successful test booking (`4242…`) → one confirmation; cancelled checkout → none; Stripe "Resend" the event → still one (idempotent). (SC-003)

---

## Phase 6: User Story 4 — Contact message acknowledgement (Priority: P3)

**Goal**: Signed-in contact submissions get an inbox ack and are stored; anonymous keep on-page confirmation only.

**Independent Test**: Signed-in submit → unread `contact` ack + a `contact_messages` row; signed-out submit → on-page confirmation, no inbox row.

- [X] T022 [US4] In `supabase-setup.sql`, create `public.contact_messages` table + index, `enable row level security`, and guarded `own insert`, `own select`, `admin select all` policies. Per `contracts/db-schema.md` §2.
- [X] T023 [US4] In `supabase-setup.sql`, add `notify_contact()` (SECURITY DEFINER) and the `AFTER INSERT ON public.contact_messages` trigger `trg_notify_contact` inserting a `type='contact'` ack. (FR-010)
- [X] T024 [US4] In `contact.html`, branch the submit handler: if `BeaconAuth.getUser()` resolves → `insert` into `public.contact_messages` `{ user_id, name, email, message }` + on-page success; else keep the existing mailto/on-page confirmation. Per `contracts/ui-behavior.md` §4.
- [ ] T025 [US4] [Owner] Re-paste `supabase-setup.sql`; acceptance: signed-in submit → ack appears (Realtime) + stored `contact_messages` row; anonymous submit → on-page only, no inbox row.

---

## Phase 7: User Story 5 — Receive messages sent by the admin (Priority: P3)

**Goal**: Deliver owner single + broadcast messages into inboxes (point-in-time fan-out).

**Independent Test**: Insert one `type='admin'` row for a single user → only they see it; run `admin_broadcast('T','B')` → all existing users get it, a later-registered user does not.

- [X] T026 [US5] In `supabase-setup.sql`, add the guarded `admin insert` policy on `public.notifications` (caller in `public.admins`) and the `admin_broadcast(p_title, p_body)` SECURITY DEFINER function (admin guard + one `type='admin'` row per existing `profiles` user, returns count). Per `contracts/db-schema.md` §5. (FR-011)
- [X] T027 [US5] In `inbox.js` and `account.js`, ensure `type='admin'` rows render their literal `title`/`body` (no template), with a distinguishing label/style and `dir="auto"`, interleaved by date with system messages. (FR-013)
- [ ] T028 [US5] [Owner] Re-paste `supabase-setup.sql`; acceptance: single admin message to one user is seen only by them (isolation); `select admin_broadcast('Title','Body')` reaches every existing user; a user created afterward does not receive it. (SC-007)

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, isolation proof, localization/RTL finish, and the final owner deploy.

- [ ] T029 [P] Cross-account isolation probe: confirm user B never sees user A's messages on the initial `select` AND on the live Realtime channel. (SC-005, FR-014)
- [X] T030 [P] In `index.css`, finish the RTL + dark-mode pass for bell/badge, dropdown, and inbox pane (Arabic message text `dir="rtl"`); verify no layout shift in the nav.
- [X] T031 [P] Finalize EN/AR copy + empty-state wording in `inbox.js` `I18N`; verify `payload` interpolation and date formatting render correctly in both languages. (FR-018)
- [ ] T032 [Owner] Final apply: re-paste the complete `supabase-setup.sql` (all tables/triggers/policies/publication), confirm Realtime on `notifications`, redeploy `stripe-webhook` JWT-OFF, and run `get_advisors` (expect clean).
- [ ] T033 Browser validation run across `index/scholarship/account/contact/faq` via the local Chromium harness (msedge channel) per `quickstart.md`; `node --check inbox.js account.js`; verify SC-008 live update with the inbox open in one tab while a message is generated.
- [ ] T034 Update `quickstart.md` acceptance results + the feature-005 memory; note the unrelated feature-004 reminder to restore `COOLDOWN_MS` to 3 days before launch.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T007)** must finish first (the table + RLS + realtime + templates + owner apply).
- **User stories** then proceed in priority order, each independently testable after Foundational:
  - **US1 (T008–T016)** — MVP; the only story that builds the client surface. US2–US5 just generate rows the US1 surface displays.
  - **US2 (T017–T018)**, **US3 (T019–T021)**, **US4 (T022–T025)**, **US5 (T026–T028)** are mutually independent generators — they can be implemented in any order (or in parallel by different people) once US1's surface + Foundational exist. Each ends with an owner re-paste/deploy.
- **Polish (T029–T034)** last; T032 is the consolidated final owner deploy.

### Story dependency notes

- US2/US4/US5 add SQL to the same `supabase-setup.sql` → their SQL-editing tasks are sequential w.r.t. that file (not `[P]` with each other), but their non-SQL work is independent.
- US3 touches only edge functions + needs `scholarship_title` in checkout metadata (T020 before T021).
- T027 (admin rendering) edits `inbox.js`/`account.js` already created in US1 — schedule after US1.

## Parallel Execution Examples

- **Foundational**: T006 (inbox.js templates) runs parallel to T003–T005 (SQL), since different files. T007 (owner) waits on T003–T005.
- **Within US1**: T012 (account.html), T014 (index.css) are `[P]` with the `inbox.js` tasks (T008–T011) — different files. T013/T015/T016 follow.
- **Across stories**: After US1 ships, the trigger SQL (T017), webhook (T019/T020), contact table+trigger+form (T022–T024), and admin policy (T026) are largely independent workstreams.
- **Polish**: T029, T030, T031 are `[P]` (probe / CSS / copy in different files).

## Implementation Strategy

- **MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: a fully working inbox surface (bell, badge, dropdown, account pane, real-time, read/delete). Seeding a manual row proves end-to-end value.
- **Increment 2**: US2 (welcome) + US3 (booking) — the two automatic notifications tied to the highest-value actions.
- **Increment 3**: US4 (contact ack) + US5 (admin/broadcast delivery) — completes the spec; US5 readies the deferred dashboard's delivery target.
- Each increment ends with an owner SQL re-paste (idempotent) and, for US3, a webhook redeploy (JWT OFF).
