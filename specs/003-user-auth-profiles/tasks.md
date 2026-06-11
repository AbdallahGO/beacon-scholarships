# Tasks: User Accounts with Social Sign-In & Scholarship-Matching Profiles

**Input**: Design documents from `/specs/003-user-auth-profiles/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (db-schema.md, auth-flows.md, ui-behavior.md), quickstart.md

**Tests**: Not requested — verification is the manual `quickstart.md` acceptance checklist (consistent with features 001/002) plus Supabase advisors. Checkpoint tasks run the relevant checklist slice in a real browser (local Chromium/Node harness; Playwright MCP unavailable per project memory).

**Organization**: Tasks are grouped by user story. US1 (auth) is the MVP; US2/US3 are independent of each other once US1 exists; US4 depends on US3's profile data.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 from spec.md
- **(user)**: requires the project owner (dashboard / developer-console access)

## Path Conventions

Flat static site at repository root (see plan.md Project Structure); PowerShell tooling in `ScholarShips_Data/`.

---

## Phase 1: Setup (Supabase project + client config)

**Purpose**: Provision the backend exactly per `contracts/db-schema.md` and wire the client config. Provider console registrations (T003–T006) are manual user steps that can proceed in parallel with everything else — only US1 social-button testing waits on them.

- [X] T001 (user-assisted) Apply full schema from `specs/003-user-auth-profiles/contracts/db-schema.md` (tables → grants → RLS → trigger → storage bucket + policies) via Supabase dashboard SQL editor; verify with the contract's `pg_tables`/`pg_policies` queries (MCP `list_tables`/`execute_sql` are read-allowed) *(applied by owner; proven working by E2E pass 2026-06-11)*
- [X] T002 (user-assisted) Configure Supabase Auth settings per db-schema.md table: email provider ON with Confirm email OFF, manual linking (beta) ON, redirect allow-list `http://localhost:8080/**` *(proven working by E2E pass 2026-06-11)*
- [X] T003 [P] (user) Register Google OAuth client (Cloud Console), callback `https://<project-ref>.supabase.co/auth/v1/callback`; enter id/secret in Supabase → Auth → Providers *(DONE 2026-06-11 after a redirect_uri_mismatch fix: authorize endpoint now reaches Google's real sign-in page; owner should do one real Google sign-in in the browser as the final smoke test)*
- [ ] T004 [P] (user) Register Facebook app (Meta for Developers) with same callback; enter id/secret in Supabase
- [ ] T005 [P] (user) Register LinkedIn app with product "Sign In with LinkedIn using OpenID Connect"; enter id/secret in Supabase (provider `linkedin_oidc`)
- [ ] T006 [P] (user) Register X OAuth 2.0 app with **"Request email from users" ON**; enter id/secret in Supabase (provider `x`)
- [X] T007 Create `supabase-config.js` at repo root: `window.SUPABASE_URL` + `window.SUPABASE_PUBLISHABLE_KEY` (publishable key only — get via MCP `get_project_url`/`get_publishable_keys`); confirm no secret/service_role key anywhere in repo
- [X] T008 Run Supabase advisors (MCP `get_advisors`, security + performance) after T001; fix schema findings before proceeding

**Checkpoint**: Backend exists, RLS verified, client config committed.

---

## Phase 2: Foundational (shared module + page wiring)

**Purpose**: The shared auth scaffolding every story plugs into. ⚠️ Blocks all user stories.

- [X] T009 Create `auth.js` core per `contracts/auth-flows.md` module surface: pinned supabase-js v2 CDN expectation documented at top (exact version chosen now and recorded), `createClient` with `{ auth: { flowType:'pkce', persistSession:true, detectSessionInUrl:true } }`, `window.BeaconAuth` = { client, getUser, onChange (fires once immediately), requireAuth (stub), openModal (stub), signOut }, `file:` protocol detection → disabled account UI notice (contract: Environment/config)
- [X] T010 Wire pages: add `<script>` includes (pinned supabase-js CDN, `supabase-config.js`, `auth.js`) and an empty nav account slot `<span id="navAccount"></span>` in `.nav-actions` to `index.html` and `scholarship.html`
- [X] T011 Create `account.html` (nav copy + tab shell: Profile | Saved | History | Settings, content panes) and `account.js` (hash router `#profile|#saved|#history|#settings` defaulting to profile, anonymous gate screen per ui-behavior.md, same script includes)
- [X] T012 [P] Add foundational styles to `index.css`: auth modal, nav avatar + dropdown menu, verification banner, account page layout/tabs, gate screen, match badge classes (`match` teal / `caution` amber) — themed via existing custom properties (light/dark)

**Checkpoint**: Pages load with Sign in slot; `BeaconAuth` initializes; account.html gates anonymous visitors.

---

## Phase 3: User Story 1 — Sign Up & Sign In (Priority: P1) 🎯 MVP

**Goal**: Email/password + 4 social providers; persistent sessions; sign-out; reset; soft verification; linked-methods settings.

**Independent Test**: quickstart.md "US1" section — create account via each method, sign out/in, verify banner lifecycle, reset password (serve via `npx http-server -p 8080`).

- [X] T013 [US1] Build auth modal in `auth.js` (`openModal('signin'|'signup')`): injected markup — Sign in / Create account tabs, email+password form, divider, 4 provider buttons, "Forgot password?", ESC/backdrop close (ui-behavior.md Nav section)
- [X] T014 [US1] Implement email flows in `auth.js`: `signUp` (≥8 char client rule, immediate session — contract F1), `signInWithPassword` with single generic failure message (F2, FR-007); modal closes on success and nav re-renders
- [X] T015 [P] [US1] Password reset: "Forgot password?" → `resetPasswordForEmail(email, { redirectTo: <origin>/account.html#reset })` in `auth.js`; `PASSWORD_RECOVERY` handler + new-password form in `account.js` (F2)
- [X] T016 [P] [US1] Social sign-in in `auth.js`: `signInWithOAuth` for `google`/`facebook`/`linkedin_oidc`/`x` with `redirectTo: location.href`; cancelled/failed return → friendly toast (F3)
- [X] T017 [US1] Signed-in nav UI in `auth.js`: avatar (photo or initial) + menu (Account / Saved / History / Sign out → `account.html#…`), global `signOut()`, cross-tab revert via supabase-js auth-state events (F8, FR-004/005)
- [X] T018 [P] [US1] Soft-verification banner in `auth.js`: shown while `email_confirmed_at` null, "Resend" → `signInWithOtp({ email, options:{ shouldCreateUser:false } })`, non-blocking (F5, FR-007a)
- [X] T019 [P] [US1] Missing-email flow in `auth.js`: `user.email` null (X case) → "add your email" prompt → `updateUser({ email })` → confirmation sent (F4)
- [X] T020 [US1] Settings tab in `account.js`: email + verification status with resend; linked sign-in methods via `getUserIdentities()` + Connect buttons via `linkIdentity({ provider })` (no unlink — F6, FR-003a); change-password form for email accounts
- [X] T021 [US1] Checkpoint: run quickstart US1 checklist in browser over `http://localhost:8080` (all 4 providers once T003–T006 done; email flows testable immediately); fix findings *(DONE 2026-06-11 for current scope: every email-flow item verified by scripted browser pass — sign-up w/ instant session, generic errors, persistence, two-tab sign-out, reset request, file:// notice; Google config verified to Google's real sign-in page (owner does one live sign-in as smoke test). Facebook/LinkedIn/X sign-ins follow when the owner registers those apps — T004–T006 deferred)*

**Checkpoint**: Accounts fully usable — this is the deployable MVP.

---

## Phase 4: User Story 2 — Saved List, History & Search (Priority: P2)

**Goal**: Supabase-backed hearts, viewing history, remembered searches; anonymous gating with action resume.

**Independent Test**: quickstart.md "US2" section — save/unsave across pages and sessions, history records and clears, recent searches re-run; anonymous heart click completes after sign-in.

- [X] T022 [US2] Implement `requireAuth(pendingAction)` + resume in `auth.js`: store `localStorage['beacon.pendingAction']`, open modal, replay on first signed-in state on any page (incl. post-OAuth), drop stale > 1 h (F7, FR-011)
- [X] T023 [US2] Rework hearts in `index.js`: id-keyed (replace index-keyed `Set`), batch-load saved ids on auth change (`saved_scholarships` select), optimistic upsert/delete with rollback, anonymous click → `requireAuth({type:'save', id})` (FR-008); update index.html tip copy ("keep it on your shortlist" → "keep it in your saved list") so UI terminology matches the account tab
- [X] T024 [P] [US2] Save button on detail page in `scholarship.js` + `scholarship.html` header (same contract as hearts)
- [X] T025 [P] [US2] View-history recording in `scholarship.js`: insert on load for signed-in users, skip if same id within 30 min (data-model rule, FR-009)
- [X] T026 [P] [US2] Search history in `index.js`: record query+filters after 1.5 s settle (signed-in, non-empty, changed); recent-searches dropdown (last 8 distinct) on focusing empty search input, click re-runs (FR-010)
- [X] T027 [US2] Saved tab in `account.js` (#saved): cards via catalogue lookup, unsave, "no longer listed" row for unknown ids, empty state → browse link
- [X] T028 [P] [US2] History tab in `account.js` (#history): viewed list (dates, newest first) + recent searches (re-run links) + per-list Clear with confirm (FR-009/010)
- [X] T029 [US2] Checkpoint: run quickstart US2 checklist (two browsers for cross-device persistence, SC-003); fix findings

**Checkpoint**: US1 + US2 work independently.

---

## Phase 5: User Story 3 — Account Profile (Priority: P2)

**Goal**: Full profile form with photo, degree certificates, and CEFR languages — incrementally savable, owner-private.

**Independent Test**: quickstart.md "US3" section — fill everything, upload photo + 2 certificate types, reload persists; invalid uploads rejected with clear message; second account sees nothing.

- [X] T030 [US3] Profile tab in `account.js` (#profile): load/upsert `profiles` row (lazy create), fields full name/address/city/country/nationality/phone/degree-select, pre-fill from `user_metadata` name/photo display only (FR-012/013), incremental save with success/failure feedback (FR-018); cache unsaved form state to sessionStorage on input and restore after re-authentication so a mid-edit session expiry never silently loses input (spec edge case)
- [X] T031 [P] [US3] Photo upload in `account.js`: validate JPG/PNG/WebP ≤ 5 MB, upload to `user-files/<uid>/photo/<name>` (upsert), update `profiles.photo_path`, preview + nav avatar refresh (FR-014)
- [X] T032 [P] [US3] Degree certificates in `account.js`: upload PDF/JPG/PNG ≤ 10 MB to `user-files/<uid>/certificates/<uuid>-<name>` + `certificates` row; list (name+date), view via signed URL, remove (row + object) (FR-015)
- [X] T033 [P] [US3] Languages in `account.js`: add/remove `profile_languages` rows — language input, CEFR select rendered with friendly labels ("B2 – Upper Intermediate", plus Native), optional per-language certificate upload to storage + `certificate_path` (FR-016)
- [X] T034 [US3] Upload/validation polish in `account.js`: explicit rejection messages stating allowed types + size (FR-017); profile-completeness computation (`empty/basic/matchable/complete` per data-model) exposed for FR-020
- [X] T035 [US3] Checkpoint: run quickstart US3 checklist incl. the cross-account isolation probe (second account + REST attempt must fail — FR-022/SC-007); fix findings

**Checkpoint**: Profiles complete; matching inputs now exist.

---

## Phase 6: User Story 4 — Profile-Based Matching (Priority: P3)

**Goal**: "Recommended for you" strip + match badges + Best-match sort, driven by profile + generated text-heuristic index.

**Independent Test**: quickstart.md "US4" section — two accounts with different degrees see different recommendations; empty profile sees the complete-profile prompt; no hard "Not eligible" from heuristics.

- [X] T036 [P] [US4] Create `ScholarShips_Data/build_match_index.ps1`: parse `details/<id>.json` EN sections for eligibility/nationality/language signals per ui-behavior.md heuristics → write `match-index.js` (`window.MATCH_INDEX`, UTF-8 **no BOM** via `[IO.File]::WriteAllText` — PS 5.1 memory gotcha); print coverage summary; run it and commit the generated file
- [X] T037 [US4] Create `match.js` (new shared file, extends plan structure): `computeMatch(profile, scholarship, indexEntry)` exactly per ui-behavior.md scoring table (level ±3 / nationality +2 or caution / languages cap +2 / deadline +1; caution copy "May not be eligible — check details"); cached profile fetch + `beacon.profileRev` invalidation; include `match-index.js` + `match.js` on index/scholarship pages
- [X] T038 [US4] Listing surfaces in `index.js` + `index.html`: "Recommended for you" strip above grid (top 6, score ≥ 3, no caution) for signed-in matchable profiles; "Complete your profile" prompt card otherwise (FR-020); match badges on cards; `Best match` option appended to `#sortSel` (score desc, then deadline) — anonymous view unchanged (FR-019, clarification Q2)
- [X] T039 [P] [US4] Detail badge in `scholarship.js`: match/caution badge next to title for signed-in matchable users, neutral when unknown
- [X] T040 [US4] Profile-change recompute: `account.js` bumps `localStorage['beacon.profileRev']` on profile/language saves; `match.js` re-fetches profile when rev changes so next view reflects updates (FR-021)
- [X] T041 [US4] Checkpoint: run quickstart US4 checklist with two differing accounts (SC-006); verify no heuristic-only "Not eligible" copy; fix findings *(verified by scripted browser pass 2026-06-11: strip + badges + Best-match sort for master's profile, empty-profile prompt, differing recos across accounts and after degree change, no "Not eligible" copy)*

**Checkpoint**: All four stories functional.

---

## Phase 7: Polish & Cross-Cutting

- [X] T042 Account deletion in `account.js` Settings (contract F9, FR-023): confirm dialog → delete all owned rows + `user-files/<uid>/**` objects → call `delete_account` Edge Function (T042a) → `signOut()` → confirmation notice
- [X] T042a Create and deploy Supabase Edge Function `delete_account` (verifies the caller's JWT, then removes the auth user via the Admin API with the service role key held server-side only) so deletion is fully self-service (FR-023); deploy via dashboard/CLI (MCP is read-only); update `specs/003-user-auth-profiles/contracts/auth-flows.md` F9 if behavior details shift *(DONE 2026-06-11: owner deployed the real code via dashboard at slug `delete_account` (underscore); client + repo folder + contract renamed to match; E2E-verified 3× — deleted accounts can no longer sign in)*
- [X] T043 Security verification: MCP `get_advisors` clean; signed-out + cross-account Data API probes return nothing; grep repo for `service_role`/secret keys (must be absent); confirm `user_metadata` never feeds authorization *(DONE 2026-06-11: probes return nothing ✓, no secret keys committed ✓ (`Strip-sandbox.text` holds local Stripe test keys — gitignored), user_metadata cosmetic-only ✓, `rls_auto_enable` revoke applied via the now-idempotent `supabase-setup.sql` and ACL-verified ✓. Sole remaining advisor item is the optional leaked-password-protection toggle — dashboard → Auth, one click, recommended before launch)*
- [X] T044 [P] Full `quickstart.md` acceptance pass end-to-end (all sections incl. cross-cutting edge cases: X-without-email, cancelled consent, file:// degradation, two-tab sign-out) *(DONE 2026-06-11 for current scope — scripted pass 28/28 green: US1 email flows, US2 save/history/search incl. pending-action replay and second-browser persistence, US3 profile save, US4 matching, RLS probes, settings/linked methods, file:// notice, two-tab sign-out, abandoned-consent recovery; delete-account later verified fully end-to-end (auth users removed, sign-in rejected). Deferred with T004–T006: F/L/X sign-ins and the X-without-email flow. Owner manual once: live Google sign-in, reset-link click, photo/cert/language uploads)*
- [X] T045 [P] Visual polish in `index.css`: dark-mode audit of all new UI, RTL safety where components appear on the detail page, empty/loading states, animation consistency with existing cards

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Ph1)**: T001 → T002/T008; T003–T006 independent (user, parallel); T007 anytime after project known
- **Foundational (Ph2)**: needs T001/T007 (client must connect) — blocks all stories
- **US1 (Ph3)**: needs Ph2; social testing (part of T021) additionally waits on T003–T006
- **US2 (Ph4)**: needs Ph2 + US1 (sign-in is the gate it opens); T022 is the bridge task
- **US3 (Ph5)**: needs Ph2 + US1 only — independent of US2, can run in parallel with Ph4
- **US4 (Ph6)**: needs US3 (profile data); T036 (PowerShell index) has no code dependencies and can start any time
- **Polish (Ph7)**: after desired stories complete

### Within stories

- US1: T013 → T014 → T017; T015/T016/T018/T019 parallel after T013; T020 after T011+T016
- US2: T022 → T023; T024/T025/T026 parallel; T027 → T028
- US3: T030 → T031/T032/T033 (parallel) → T034
- US4: T036 ∥ (T037 → T038/T039/T040)

### Parallel opportunities

- All four provider registrations (T003–T006) — hand to the user immediately
- T036 (match index script) any time — pure PowerShell over existing data
- After US1: US2 (Ph4) and US3 (Ph5) in parallel — different tabs/files mostly; coordinate on `account.js`

## Implementation Strategy

**MVP first**: Ph1 → Ph2 → Ph3 (US1) → validate → this alone is shippable (accounts + sessions).
**Incremental**: + US2 (engagement features) → + US3 (profile) → + US4 (matching) → Polish. Each checkpoint runs its quickstart slice before moving on; stop at any checkpoint with a working site.

## Notes

- Tasks total: **45** (Setup 8, Foundational 4, US1 9, US2 8, US3 6, US4 6, Polish 4)
- Site must be served over `http://localhost:8080` (`npx http-server -p 8080`) for any auth work — `file://` cannot complete OAuth (research R7)
- Supabase MCP is read-only: schema writes go through the dashboard SQL editor (T001); MCP used for verification only
- Commit after each task or logical group (speckit git hooks offer auto-commit)
