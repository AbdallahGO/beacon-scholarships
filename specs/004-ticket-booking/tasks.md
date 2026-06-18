---
description: "Task list for feature 004 — Scholarship Ticket Booking, Profiles & Catalogue Cleanup"
---

# Tasks: Scholarship Ticket Booking, Profiles & Catalogue Cleanup

**Input**: Design documents from `/specs/004-ticket-booking/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (db-schema, edge-functions, ui-behavior), quickstart.md

**Tests**: Automated tests are NOT requested for this feature (acceptance is manual via `quickstart.md`, consistent with features 001–003). Each story ends with a manual validation task instead.

**Organization**: Tasks are grouped by user story (priority order: P1 → P2 → P3) so each story is an independently testable increment.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[OWNER]**: Requires the project owner (Supabase dashboard / Stripe dashboard / paste SQL) — Supabase MCP is read-only and cannot deploy functions or write schema
- **[Story]**: US1…US8 maps to the spec's user stories

## Path Conventions

Flat static site at repo root (`index.html`, `*.js`, `*.css`), edge functions under `supabase/functions/<slug>/index.ts`, build tooling under `ScholarShips_Data/`. Paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding files and client config used across the ticket stories.

- [X] T001 [P] Add Stripe/functions client config to `supabase-config.js` (`window.STRIPE_PUBLISHABLE_KEY` = the `pk_test_…`, `window.FUNCTIONS_BASE = window.SUPABASE_URL + "/functions/v1"`, `window.SPACE_PRICE_CENTS = 9900`) per `contracts/edge-functions.md` — publishable key only, never `sk_*`/service_role.
- [X] T002 [P] Create edge-function scaffolding: `supabase/functions/ticket-checkout/index.ts`, `supabase/functions/space-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts` (stubs) and `supabase/functions/_shared/cors.ts` (CORS + JSON helpers).
- [X] T003 [P] Create `ScholarShips_Data/rankings.csv` (header `institution,country,rank`) and `ScholarShips_Data/rankings-overrides.csv` (header `scholarship_id,tier`) as the curated ranking inputs (recognized world ranking; populate with real data before T006).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, ranking data, and seeds that BLOCK all ticket/profile stories (US1, US2, US3, US4, US8). US5/US6/US7 are pure-frontend and do not depend on this phase.

**⚠️ CRITICAL**: No ticket/profile story work that touches the DB can be validated until this phase is complete.

- [X] T004 Append the dated, idempotent feature-004 schema section to `supabase-setup.sql` exactly per `contracts/db-schema.md` (profiles new columns; `scholarship_rankings`; `admins`; `tickets` + unique partial index; `space_purchases`; all RLS policies + grants).
- [X] T005 Create `ScholarShips_Data/build_ranking_index.ps1` (PowerShell, **no Python**) that joins `rankings.csv` (+ `rankings-overrides.csv`) to the catalogue, assigns tier/price by the band table in `research.md` (top~200→high/$300, ~201–500→medium/$250, 501+→lowest/$200, unmatched→out_of_rank/$150), and emits (a) `ranking-index.js` (`window.RANKING_INDEX`) and (b) an idempotent `scholarship_rankings` seed block appended to `supabase-setup.sql`. Save the `.ps1` UTF-8 with BOM (Arabic-safe).
- [X] T006 Run `ScholarShips_Data/build_ranking_index.ps1` to generate `ranking-index.js` and append the seed block to `supabase-setup.sql`.
- [X] T007 [P] Add `<script src="ranking-index.js"></script>` to `scholarship.html` (index.html omitted — no price-display consumer there; analysis I2) (load before `index.js`/`ticket.js`) so display prices/tiers are available client-side.
- [ ] T008 [OWNER] Paste the whole `supabase-setup.sql` into the Supabase dashboard SQL editor and Run (idempotent); then run `get_advisors` and confirm no new security lints.

**Checkpoint**: Schema live, ranking data seeded — ticket/profile stories can proceed.

---

## Phase 3: User Story 1 - Book a ticket (Priority: P1) 🎯 MVP

**Goal**: A signed-in user clicks Book Ticket on a detail page, sees the animation, pays the ranking-based fee via Stripe, and a single ticket with a 3-day cooldown is created from the confirmed payment.

**Independent Test**: Sign in, open a scholarship, confirm the button sits between `#detailBody` and `#applyArea`, click → animation → Stripe Checkout → pay `4242…` → one active ticket with a 3-day cooldown; cancel → no ticket.

- [X] T009 [US1] Implement `supabase/functions/ticket-checkout/index.ts`: verify JWT → user; service-role profile/eligibility check; one-per-scholarship (409 `already_booked`) and capacity (409 `at_capacity`) checks; server price from `scholarship_rankings` (missing→out_of_rank/15000); create Stripe Checkout Session with full metadata + success/cancel URLs; return `{ url }` (per `contracts/edge-functions.md` §1).
- [X] T010 [US1] Implement `supabase/functions/stripe-webhook/index.ts`: verify `Stripe-Signature`; on `checkout.session.completed` with `kind=ticket`, idempotently (unique `stripe_session_id`) generate a unique `ticket_code` (`BCN-XXXX-XXXX`) and insert the `tickets` row with `status='active'`, `booked_at=now()`, `cooldown_end=now()+3 days`, and reveal snapshots (per §3).
- [X] T011 [P] [US1] In `scholarship.js` `renderApplyArea()`, remove the outbound "Apply on official site" link/button (FR-004a); keep only ticket-focused guidance + optional "About the organization" blurb.
- [X] T012 [US1] Create `ticket.js`: insert `#bookTicketArea` between `#detailBody` and `#applyArea`; render bookable/anonymous/already-booked/at-capacity states; show display price from `RANKING_INDEX` + non-refundable note; on bookable click call `FUNCTIONS_BASE/ticket-checkout` with the access token and redirect to `url`; handle 409s (profile_incomplete→`account.html#profile`, others→state update); anonymous click → `BeaconAuth.requireAuth({type:"route",href:location.href+"#book"})`; on `#ticket-booked` return show a toast.
- [X] T013 [US1] Add the Book Ticket animation to `ticket.js`: split label into spans that fall top→bottom, inline-SVG scene (left hand → right hand → backpack + laptop + book), then label → "Are You Ready!"; respect `prefers-reduced-motion`; fire checkout on animation end (FR-005).
- [X] T014 [P] [US1] Add Book Ticket button + animation-scene styles to `index.css` (states, reduced-motion fallback).
- [X] T015 [P] [US1] Add `<script src="ticket.js"></script>` to `scholarship.html` (after `scholarship.js`).
- [ ] T016 [OWNER] [US1] In Supabase dashboard set secret `STRIPE_SECRET_KEY` (`sk_test_…` from `Strip-sandbox.text`); deploy `ticket-checkout` and `stripe-webhook`; in Stripe (test) add a webhook endpoint → the deployed `stripe-webhook` URL, subscribe `checkout.session.completed`, copy signing secret into `STRIPE_WEBHOOK_SECRET`.
- [ ] T017 [US1] Validate US1 per `quickstart.md` (book→pay test card→ticket+cooldown created; cancel→no ticket; price matches tier — SC-001/002/003).

**Checkpoint**: Booking works end-to-end — MVP demoable.

---

## Phase 4: User Story 2 - Track an active ticket and its cooldown (Priority: P1)

**Goal**: The user sees their ticket's live countdown in the account, a cooldown ring in the nav menu, and after 3 days the ticket reveals with a unique code + selected profile fields.

**Independent Test**: With an active ticket (book one, or seed a `tickets` row), the account Ticket area shows a countdown and the nav shows a ring; push `cooldown_end` to the past → ticket reveals with `ticket_code` + reveal fields.

- [X] T018 [P] [US2] In `account.html` add a `Ticket` tab to `#acctTabs` and a `<section id="pane-ticket">` pane.
- [X] T019 [US2] In `account.js` add `ticket` to `TABS`/router and implement `renderTicket()`: fetch the user's `tickets`; render active tickets with a per-second countdown to `cooldown_end`; render revealed tickets (`now()>=cooldown_end`) in the distinctive design showing `ticket_code`, full name, country/nationality, degree, field of interest, scholarship+institution, booking date (FR-016; no address/GPA/second nationality); empty state.
- [X] T020 [US2] In `auth.js` `renderNav()` add a `Ticket` menu item linking to `account.html#ticket`; fetch the user's latest active ticket on auth change and show a CSS cooldown progress ring (elapsed/total) while active (FR-013).
- [X] T021 [P] [US2] Add ticket-pane, reveal-card, and nav cooldown-ring styles to `index.css`.
- [ ] T022 [US2] Validate US2 per `quickstart.md` (countdown + ring while active; reveal with stable unique code; cross-device countdown match — SC-005/006).

**Checkpoint**: Ticket lifecycle visible from booking to reveal.

---

## Phase 5: User Story 3 - One ticket at a time, with paid extra space (Priority: P2)

**Goal**: Capacity is 1; a permanent paid +1 space adds a slot; each booking is still charged its own fee; one ticket per scholarship.

**Independent Test**: With one active ticket, a second booking is blocked; buy +1 space → second concurrent booking works; same scholarship cannot be booked twice; revealed ticket frees its slot.

- [X] T023 [US3] Implement `supabase/functions/space-checkout/index.ts`: verify JWT; create a Stripe Checkout Session for `SPACE_PRICE_CENTS` with `metadata.kind="space"`; return `{ url }` (per `contracts/edge-functions.md` §2).
- [X] T024 [US3] Extend `supabase/functions/stripe-webhook/index.ts` to handle `kind=space`: idempotent via `space_purchases` ledger, then `update profiles set ticket_capacity = ticket_capacity + 1` (depends on T010).
- [X] T025 [US3] In `account.js` Ticket pane add an "Add ticket space (+$99)" button → `space-checkout` redirect, and show current `ticket_capacity` (depends on T019).
- [X] T026 [US3] In `ticket.js` wire the at-capacity and already-booked-this-scholarship UI states to the `ticket-checkout` 409 responses and to a pre-check of the user's tickets (depends on T012).
- [X] T027 [OWNER] [US3] Deploy `space-checkout` and redeploy `stripe-webhook` (now with the space branch).
- [ ] T028 [US3] Validate US3 per `quickstart.md` (block at capacity; +1 enables a second; per-ticket fee still charged; one-per-scholarship; revealed frees slot — SC-004).

**Checkpoint**: Capacity rules + upsell complete.

---

## Phase 6: User Story 4 - Richer account creation (Priority: P2)

**Goal**: Sign-up collects the full profile, confirms password, requires the agreement checkpoint, and assigns a unique user ID.

**Independent Test**: Open create-account; all fields present (optional ones marked); mismatched passwords and unchecked agreement block submit; valid submit creates account + profile + shows a unique user ID.

- [X] T029 [US4] In `auth.js` expand the signup-mode form with first name, last name, address, city, country, nationality, second nationality (optional), highest degree (select), GPA (optional), field of interest (optional), confirm password, and an agreement checkpoint; validate required fields, `password===confirm` (FR-021), agreement checked (FR-020); on success `upsert profiles` with the new columns and composed `full_name` (FR-019/022). Sign-in mode stays email+password only.
- [X] T030 [US4] In `account.js` Profile pane, add inputs for the new columns (first/last name, second nationality, GPA, field of interest) so they're editable post-signup, and surface the unique user ID (auth user id) on the account page (FR-001/002).
- [X] T031 [P] [US4] Add expanded signup-form layout styles to `index.css`.
- [ ] T032 [US4] Validate US4 per `quickstart.md` (field presence; validation blocks; unique user ID — SC-007).

**Checkpoint**: Full profiles captured at sign-up; feeds the ticket reveal.

---

## Phase 7: User Story 8 - Owner is notified and manages tickets (Priority: P2)

**Goal**: The owner is notified per booking and can review all tickets in an owner-only dashboard.

**Independent Test**: Book a ticket → owner email arrives (if Resend configured) and the ticket shows in `admin.html`; a non-admin/anonymous user cannot access the dashboard or see others' tickets.

- [ ] T033 [P] [US8] Create `admin.html` owner-dashboard shell (nav, auth scripts, a `#ticketsTable` container, a "not authorized" view).
- [ ] T034 [US8] Create `admin.js`: confirm admin via `admins` membership (RLS-enforced); load all `tickets` (admin RLS) into a sortable, newest-first table (ticket_code, user, scholarship+institution, tier/price, booked_at, status + remaining cooldown, payment intent); non-admins/anonymous see "Not authorized".
- [ ] T035 [US8] Extend `supabase/functions/stripe-webhook/index.ts` to send a Resend owner email on `kind=ticket` when `RESEND_API_KEY`+`OWNER_EMAIL` are set; failures are logged and ignored (depends on T010).
- [ ] T036 [P] [US8] In `auth.js`, show an "Owner dashboard" nav-menu link only for admin users (best-effort membership check).
- [ ] T037 [US8] Append the `admins` seed insert to `supabase-setup.sql` using the owner's confirmed `auth.users.id` (per `contracts/db-schema.md` seed #2).
- [ ] T038 [P] [US8] Add owner-dashboard styles to `index.css`.
- [ ] T039 [OWNER] [US8] Set secrets `RESEND_API_KEY` + `OWNER_EMAIL`; redeploy `stripe-webhook`; run the `admins` seed statement in the SQL editor.
- [ ] T040 [US8] Validate US8 per `quickstart.md` (booking → owner email + dashboard row; non-admin blocked — SC-011).

**Checkpoint**: Owner side of the action operational.

---

## Phase 8: User Story 5 - Reset password from settings; cleaner account page (Priority: P3)

**Goal**: Reset/change password lives in Settings; the `acctGate`/`acctReset` blocks are removed.

**Independent Test**: Account page renders for signed-in/signed-out/recovery without the old blocks; Settings change-password and reset-link flows work.

- [X] T041 [US5] In `account.html` remove the `#acctGate` and `#acctReset` blocks (FR-024).
- [X] T042 [US5] In `account.js` relocate password recovery (`PASSWORD_RECOVERY`/`#reset`) into the Settings pane; for anonymous visitors open the sign-in modal (or a slim inline prompt) instead of the removed gate; add a Settings "Change password" form (`updateUser({password})`) and a "Send reset link" action (`resetPasswordForEmail`) (FR-023); ensure all visitor states render (depends on T041).
- [ ] T043 [US5] Validate US5 per `quickstart.md` (no gate/reset blocks; all states render; change/reset password works — SC-010).

---

## Phase 9: User Story 6 - Filters persist across navigation (Priority: P3)

**Goal**: Filters/search/sort survive opening a card and returning, and browser reopen.

**Independent Test**: Apply filters → open a card → back → state restored; reopen list later → restored.

- [X] T044 [US6] In `index.js` persist `state` (`{q,level,fund,country,sort}`) to `localStorage["beacon.filters"]` on each change; on load restore it before the first `render()` and reflect into the search box, chips, country select, and sort select; `?q=` deep-link overrides `q`; "Clear" wipes the stored filters (FR-025/026).
- [ ] T045 [US6] Validate US6 per `quickstart.md` (restored after card view and after reopen — SC-008).

---

## Phase 10: User Story 7 - Remove all "For9a" branding (Priority: P3)

**Goal**: No visible "For9a"/"فرصة" anywhere on any page.

**Independent Test**: Content scan over all rendered pages/cards/detail bodies/footers finds zero visible occurrences; RTL/punctuation intact.

- [X] T046 [P] [US7] Extend `ScholarShips_Data/build_catalogue.ps1` to scrub visible "For9a" (any case) and "فرصة" from titles/orgs, fixing punctuation. Added a `Remove-Brand` helper (Arabic built from hex code points at runtime → script stays pure ASCII, no BOM dependency); scrubs `title`/`org` before write (`url`/`image` untouched — non-visible, out of scope). 8 fields scrubbed.
- [X] T047 [P] [US7] Extend `ScholarShips_Data/build_details.ps1` to scrub visible "For9a"/"فرصة" from rendered section text/headers, preserving RTL. Same `Remove-Brand` helper applied to section bodies+headers, en/ar titles, and `org_about`; added an FR-027 validation gate (`$reBrandLeft`) that fails the build if any visible brand token survives.
- [X] T048 [US7] Ran both build scripts: `scholarships.js` regenerated (170 records), `details/*.js` regenerated (168 files); FR-027 gate passed.
- [X] T049 [P] [US7] Added a light secondary sanitizer (`scrubBrand` + `BRAND_RE`, Arabic from `String.fromCharCode`) in `scholarship.js`; applied in `renderSections()` (title, headers, bodies) and `renderApplyArea()` (org + org_about). node --check clean.
- [X] T050 [US7] Scanned `index.html`, `scholarship.html`, `account.html`, `Backed By Results.html` (footers included) — all clean; nothing to fix.
- [X] T051 [US7] Validated US7: repo-wide scan (4 html, 2607 catalogue visible lines, 168 detail files) shows zero visible "For9a"/"فرصة"; remaining 340 `for9a` are only in non-visible url/image fields (out of scope per spec) — SC-009 PASS.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Security, integrity, and full acceptance.

- [ ] T052 [P] Re-run Supabase `get_advisors` after the schema apply; resolve any new security/RLS lints.
- [ ] T053 [P] Grep all client files (`*.js`, `*.html`, `supabase-config.js`) to confirm no `sk_*` or `service_role` key is present.
- [ ] T054 Cross-account RLS probe: confirm user A cannot read user B's `tickets`/`space_purchases` via the Data API, and a non-admin gets zero rows from `tickets` admin-wide.
- [ ] T055 Browser validation of key flows (book → checkout → reveal, signup, filters) via local Chromium/Node harness, then delete `node_modules`/`package.json` (repo stays dependency-free) per project memory.
- [ ] T056 Run the full `quickstart.md` acceptance checklist (SC-001…SC-011).
- [ ] T057 [P] Confirm `.gitignore` still excludes `Strip-sandbox.text`; commit generated `ranking-index.js` and regenerated catalogue/details.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1 tasks T001–T003)**: no dependencies.
- **Foundational (T004–T008)**: needs Setup; **blocks** US1, US2, US3, US4, US8 (DB-backed). US5/US6/US7 do **not** depend on it.
- **User stories**: priority order P1 (US1, US2) → P2 (US3, US4, US8) → P3 (US5, US6, US7).
- **Polish**: after the desired stories.

### Cross-story dependencies (note — these break strict independence by design)
- **US2** reads tickets created by **US1** (or seed a row to test US2 alone).
- **US3 (T024)** and **US8 (T035)** both extend the `stripe-webhook` file authored in **US1 (T010)** → must follow T010 and are sequential with each other on that file; redeploy after each (T027, T039).
- **US3 capacity UI (T026)** builds on **US1 (T012)**; **US3 space UI (T025)** builds on **US2 (T019)**.
- **US4** depends on the profiles columns from Foundational **T004**.

### Independent / parallelizable stories
- **US5, US6, US7** are pure-frontend/tooling and can be done any time after Setup, in parallel with the ticket stories and with each other.

## Parallel execution examples

```text
# Setup — all parallel:
T001 (supabase-config.js)   T002 (edge fn stubs)   T003 (rankings CSVs)

# US1 — parallel where files differ:
T011 (scholarship.js apply-area)   T014 (index.css)   T015 (scholarship.html)
# (T009 ticket-checkout and T010 stripe-webhook are separate files → parallel;
#  T012→T013 are the same file, sequential)

# After Setup, independent stories in parallel with the ticket track:
US5 (T041–T043)   US6 (T044–T045)   US7 (T046–T051)
```

## Implementation strategy

- **MVP**: Setup → Foundational → **US1** (book + pay + ticket created), then validate and demo.
- **Increment 2 (P1)**: **US2** (see/track/reveal the ticket).
- **Increment 3 (P2)**: **US3** (capacity + +1 space), **US4** (full sign-up), **US8** (owner email + dashboard).
- **Increment 4 (P3)**: **US5** (settings/cleanup), **US6** (filters), **US7** (For9a removal) — can be picked up in parallel at any point after Setup.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

## Notes
- `[OWNER]` tasks are unavoidable: Supabase MCP is read-only (no schema writes, no `deploy_edge_function`) and Stripe webhook/secret setup is dashboard-only. Edit `supabase-setup.sql` first, then have the owner paste it ([[sql-via-paste-ready-file]]).
- Server is authoritative for price/capacity/cooldown; client values are display-only.
- Payments are non-refundable — no void/refund task exists by design.
