---
description: "Task list for Feature 006 — Admin Dashboard & Multi-Provider Payments"
---

# Tasks: Admin Dashboard & Multi-Provider Payments

**Input**: Design documents from `/specs/006-admin-dashboard/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅ (db-schema, admin-rpc, ui-behavior, payments-rpc, payment-functions), quickstart.md ✅

**Tests**: Not requested. Consistent with features 001–005, verification is **manual acceptance** via `quickstart.md` + a local Chromium/Node browser run ([[browser-validation-setup]]) and sandbox payments. No automated test tasks; each story ends with a manual validation task.

**Organization**: Tasks grouped by user story (priority order). Admin UI lives in three repo-root files (`admin.html`, `admin.js`, `admin.css`); admin backend + payments schema live in one appended `supabase-setup.sql` block; payment money-movement lives in per-provider **edge functions** under `supabase/functions/`; the checkout provider-picker edits the existing `ticket.js`/`account.js`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different file, no dependency on an incomplete task)
- **[Story]**: US1–US8 (Setup/Foundational/Polish have no story label)

## Path Conventions

Flat static-site layout at repo root (features 001–005 pattern) + Supabase Edge Functions (`supabase/functions/<name>/index.ts`, the feature-004 pattern). No `src/`, no bundler, no framework.

⚠️ **Same-file note**: `admin.js` and `admin.css` are each a single shared file across all admin stories. Tasks editing the **same** file are sequential even when stories are logically independent; only tasks on **different** files within a step are marked `[P]`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the admin UI files and the correct script load order; no behavior yet.

- [X] T001 Create `admin.html` skeleton at repo root: `<!doctype html>`, `lang="en"` (no `dir="rtl"`); `<head>` links `index.css` then `admin.css`; nav (logo + `<div id="navAccount">`); empty `<main id="adminRoot">`; a tab strip placeholder for **Overview · Messages · Contact · Accounts · Payments**; scripts at end in order — supabase-js CDN (pinned `2.108.1`) → `supabase-config.js` → `auth.js` → `inbox.js` → `admin.js`.
- [X] T002 [P] Create `admin.css` at repo root: base dashboard shell using `index.css` theme tokens — tab strip, pane container, card grid, "not authorized" card, toast parity; LTR only.
- [X] T003 [P] Create `admin.js` at repo root: IIFE `"use strict"`; obtain `window.BeaconAuth` + `BeaconAuth.client`; shared helpers (`esc`, reuse `BeaconAuth.toast`); empty `renderOverview/renderMessages/renderContact/renderAccounts/renderPayments` stubs; export nothing global.

**Checkpoint**: Page loads, shows nav + 5 tabs, no panes wired yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All backend schema/functions/policies (admin + payments) plus the shared client bootstrap. No user story can function until the SQL is applied.

**⚠️ CRITICAL**: Blocks all user stories. Edge-function deploy + secrets happen in Phase 8 (US6), once the functions exist.

- [X] T004 Append the dated idempotent **Feature-006 (admin)** block to `supabase-setup.sql` exactly per `contracts/db-schema.md` Part A: `public.admin_messages` + index + RLS (`admin select all`, no client write); `admin select all` on `public.profiles`; functions `admin_message_insert` (internal), `admin_broadcast` (extended to log), `admin_send_to_user`, `admin_send_to_email`, `admin_overview`; all grants/revokes. Verify `$$` blocks balanced and the file stays re-runnable.
- [X] T005 Append the dated idempotent **Feature-006 (payments)** block to `supabase-setup.sql` exactly per `contracts/db-schema.md` Part B: `public.payment_providers` (+ RLS `providers public read enabled` / `providers admin read all`, + seed 4 rows, stripe enabled); `public.payments` (+ `payments_created_idx`, unique `(provider,provider_ref)`, partial unique `(user_id,kind,item_ref) where status in ('pending','paid')`, RLS `admin select all`, no client write); `alter table tickets/space_purchases add provider, payment_id`; functions `admin_set_provider_enabled`, `admin_set_provider_config`, `admin_payments_overview`; **extend `admin_overview()` to also return `payments_received`**; grants/revokes. Verify idempotency + balanced `$$`.
- [X] T006 Implement shared bootstrap in `admin.js`: hash router for `#overview|#messages|#contact|#accounts|#payments` (default `#overview`), tab-active state, a "Refresh" hook that re-runs the active pane's loader, and a central `rpcError(err)` mapper covering admin errors (`not authorized`/`empty_body`/`recipient_not_found`/`title_too_long`/`body_too_long`) **and** payment errors (`unknown_provider`/`bad_fx_rate`) per `contracts/admin-rpc.md` + `contracts/payments-rpc.md`.
- [X] T007 **(owner-gated)** Owner pastes the whole `supabase-setup.sql` into Supabase SQL Editor and runs it; confirm the owner's auth id is seeded in `public.admins`; confirm `payment_providers` has 4 rows (stripe enabled); then run `get_advisors` (security + performance) and confirm no new findings. See `quickstart.md` → Owner setup.

**Checkpoint**: Backend live (admin + payments schema); `admin.js` routes 5 panes and surfaces errors. User stories can begin.

---

## Phase 3: User Story 1 — Admin-only access (Priority: P1) 🎯 MVP

**Goal**: Only designated admins reach the dashboard; everyone else is denied and sees no admin data/controls, enforced server-side.

**Independent Test**: Seeded admin → shell renders; regular user + signed-out → "not authorized"; a direct RPC by a non-admin is rejected.

- [X] T008 [US1] In `admin.js`, implement the gate: on `BeaconAuth.onChange`, if no user → "not authorized" card with a Sign-in button (`BeaconAuth.openModal('signin')`); if user present, query `client.from('admins').select('user_id').eq('user_id', uid).maybeSingle()` → row ⇒ render shell+tabs, else render the "not authorized" card. No pane data is fetched for non-admins.
- [X] T009 [US1] In `admin.js`, inject an **"Admin"** link into the nav account menu only when the caller is an admin (mirror `inbox.js`). Link targets `admin.html#overview`.
- [X] T010 [US1] In `admin.js`, handle admin-status change mid-session: on sign-out or a subsequent `not authorized` from any RPC, revert to the gate/"not authorized" state.
- [X] T011 [P] [US1] Style the "not authorized" card, dashboard shell, and tab strip in `admin.css`.
- [X] T012 [US1] Manual validation per `quickstart.md` US1 (admin renders; regular user + signed-out blocked; console `admin_broadcast` as non-admin → `not authorized`; SC-001/SC-007).

**Checkpoint**: A trustworthy locked admin shell — MVP deliverable.

---

## Phase 4: User Story 2 — Send messages (single or broadcast) (Priority: P1)

**Goal**: Admin composes a title+body and sends to one user (by email) or all users, with a confirm for broadcasts and a persistent sent-message log.

**Independent Test**: Broadcast appears in multiple inboxes with the right count; single send by email reaches only that user; the sent log lists every send.

- [X] T013 [US2] Build the **Messages** pane in `admin.js` (`renderMessages`): compose form — target radio (one user / all users), conditional email input, optional title, required body; Send disabled when body blank or in-flight (double-send guard).
- [X] T014 [US2] Implement **single send** in `admin.js`: validate, `client.rpc('admin_send_to_email', { p_email, p_title, p_body })`; success → toast, clear form, refresh log; map `recipient_not_found` → inline "No user found with that email." (FR-007/009/012).
- [X] T015 [US2] Implement **broadcast** in `admin.js`: explicit confirm dialog before `client.rpc('admin_broadcast', { p_title, p_body })`; success → toast "Sent to N users"; disable while in-flight (FR-010/011, SC-006).
- [X] T016 [US2] Implement the **sent-message log** in `admin.js`: `client.from('admin_messages').select('*').order('created_at',{ascending:false})`; render when/target/title/truncated body/recipient_count; empty state; re-fetch after each send (FR-011a/b).
- [X] T017 [P] [US2] Style the Messages pane, compose form, confirm dialog, and sent-log list in `admin.css`.
- [X] T018 [US2] Manual validation per `quickstart.md` US2 (broadcast count + literal inbox title/body, single send, bad email, empty body, log survives recipient deletion; SC-002/003).

**Checkpoint**: Owner can message users — the core deferred-from-005 capability.

---

## Phase 5: User Story 3 — Review contact submissions + reply (Priority: P2)

**Goal**: Admin reads contact submissions newest-first and can reply into the user's inbox.

**Independent Test**: Submit the contact form → it appears in the Contact pane; replying delivers to that user's inbox and is logged.

- [X] T019 [US3] Build the **Contact** pane in `admin.js` (`renderContact`): `client.from('contact_messages').select('*').order('created_at',{ascending:false})`; render sender (name/email), message, submitted-at; empty state (FR-014/015).
- [X] T020 [US3] Implement **reply** in `admin.js`: per-item inline compose (optional title, required body) → `client.rpc('admin_send_to_user', { p_user_id: item.user_id, p_title, p_body })`; success toast; in-flight disable; refresh the sent-message log (FR-015a, R9).
- [X] T021 [P] [US3] Style the Contact list and reply form in `admin.css`.
- [X] T022 [US3] Manual validation per `quickstart.md` US3 (submission appears; empty state; reply lands in inbox + sent log; SC-004).

**Checkpoint**: Inbound contact loop closed in-product.

---

## Phase 6: User Story 4 — At-a-glance overview (Priority: P3)

**Goal**: Headline counts (now including payments received) so the owner gauges site state at a glance.

**Independent Test**: Open Overview → counts match real totals; payments-received matches the ledger.

- [X] T023 [US4] Implement the **Overview** pane in `admin.js` (`renderOverview`): `client.rpc('admin_overview')`; render cards — Registered users, Completed profiles, Tickets booked, Contact messages, Messages sent, **Payments received** (`payments_received`); loading + error states (FR-016/FR-038, SC-005).
- [X] T024 [P] [US4] Style the Overview count cards in `admin.css`.
- [X] T025 [US4] Manual validation per `quickstart.md` US4 (counts + payments-received match; users-vs-profiles gap visible).

**Checkpoint**: Situational awareness landing pane.

---

## Phase 7: User Story 5 — Review accounts & bookings (Priority: P3)

**Goal**: Read-only browse of profiles and a selected user's ticket bookings (now showing the funding provider).

**Independent Test**: Accounts lists profiles; selecting a user shows their tickets incl. provider; no mutating controls.

- [X] T026 [US5] Implement the **Accounts** list in `admin.js` (`renderAccounts`): `client.from('profiles').select('user_id,first_name,last_name,full_name,country,degree,created_at').order('created_at',{ascending:false})`; render name/country/degree/joined; empty state (FR-017).
- [X] T027 [US5] Implement **per-user bookings** in `admin.js`: on row select, `client.from('tickets').select('*').eq('user_id', uid).order('booked_at',{ascending:false})`; render scholarship_title/institution/ranking_tier/amount+currency/status/booked_at/cooldown_end/**provider** (FR-037); empty state; ensure NO edit/delete/refund affordances (FR-018).
- [X] T028 [P] [US5] Style the Accounts list + bookings detail in `admin.css`.
- [X] T029 [US5] Manual validation per `quickstart.md` US5 (list + bookings render incl. provider; strictly read-only).

**Checkpoint**: All admin-dashboard stories functional.

---

## Phase 8: User Story 6 — Multi-provider checkout (Priority: P1)

**Goal**: A user picks among enabled providers and pays; the ticket/space is booked only after the provider's webhook verifies the payment. Covers **both** paid flows.

**Independent Test**: With ≥2 providers enabled, pay each in sandbox → booked only on webhook; replays don't duplicate; double-start blocked; retry works.

**⚠️ Money-handling code** — follow `contracts/payment-functions.md` exactly (server-side amount, signature verification, idempotency, webhook-only booking).

- [X] T030 [P] [US6] Create `supabase/functions/paypal-checkout/index.ts`: auth user; reject if provider disabled; **double-pay guard**; compute `amount = round(base_usd × fx_rate)` in provider currency; insert `payments(pending)`; create PayPal Orders v2 order (env secrets) with our `payments.id` ref; persist `provider_ref`; return `{ url }`. Handle `kind=ticket|space`.
- [X] T031 [P] [US6] Create `supabase/functions/paypal-webhook/index.ts`: verify webhook signature (`PAYPAL_WEBHOOK_ID`); idempotent lookup by `(provider,provider_ref)`; on paid → mark `paid` + book ticket/space (reuse feature-004 logic) + set `provider`/`payment_id`/`ticket_id`; on failed/cancelled → set status only. Public (no JWT).
- [X] T032 [P] [US6] Create `supabase/functions/paymob-checkout/index.ts`: same contract as T030 using Paymob intention/order + payment key (env secrets).
- [X] T033 [P] [US6] Create `supabase/functions/paymob-webhook/index.ts`: verify Paymob **HMAC** (`PAYMOB_HMAC_SECRET`); idempotent; book on success (as T031).
- [X] T034 [P] [US6] Create `supabase/functions/kashier-checkout/index.ts`: same contract using Kashier payment request + hash (env secrets).
- [X] T035 [P] [US6] Create `supabase/functions/kashier-webhook/index.ts`: verify Kashier **signature** (`KASHIER_SECRET`); idempotent; book on success (as T031).
- [X] T036 [US6] Extend `supabase/functions/ticket-checkout/index.ts` and `supabase/functions/space-checkout/index.ts` (Stripe): apply the **double-pay guard** and insert a `payments(pending)` row (provider `stripe`, currency `usd`, fx 1.0) keyed by the Stripe session id.
- [X] T037 [US6] Extend `supabase/functions/stripe-webhook/index.ts`: on `checkout.session.completed`, mark the matching `payments` row `paid` (idempotent) and set `tickets/space_purchases.provider='stripe'` + `payment_id` (+ `payments.ticket_id`). Keep existing booking behavior.
- [X] T038 [US6] Implement the **provider picker** in `ticket.js`: fetch enabled providers (`payment_providers` eq enabled, order sort_order); if none → "payments temporarily unavailable" (FR-027); else show "choose how to pay" with per-provider price (`round(base_usd×fx_rate)`); on pick → `POST {provider}-checkout` `{ kind:'ticket', scholarship_id }` → redirect to `url`. Keep bilingual EN/AR + RTL.
- [X] T039 [US6] Implement the **provider picker** for the **+1 space** purchase in `account.js`: same flow with `{ kind:'space' }` → `{provider}-checkout`.
- [X] T040 [US6] Implement the **result/return view** (in `ticket.js`/`account.js` as appropriate): read the `payments` row status (poll briefly); pending → "confirming…", paid → success+booking, failed/cancelled → "not completed — try again" re-offering the picker (FR-022/FR-040). Never mark booked from the redirect alone.
- [X] T041 **(owner-gated)** [US6] Owner sets provider **secrets** (`supabase secrets set …`) and **deploys** all checkout/webhook functions (`supabase functions deploy paypal-checkout paypal-webhook paymob-checkout paymob-webhook kashier-checkout kashier-webhook ticket-checkout space-checkout stripe-webhook`), then registers each provider's **webhook URL**. See `quickstart.md` → Owner setup (payments). MCP cannot deploy.
- [X] T042 [US6] Manual validation per `quickstart.md` US6 (sandbox pay via each enabled provider for ticket + space; webhook-only booking; disable hides provider / all-disabled state; replayed webhook = one booking; double-start across providers blocked; retry after fail; SC-008/009/010/015).

**Checkpoint**: Worldwide multi-provider checkout live for both paid flows.

---

## Phase 9: User Story 7 — Enable/disable & configure providers (Priority: P2)

**Goal**: Admin toggles providers and edits non-secret config from the Payments pane; no secret keys ever shown.

**Independent Test**: Toggle a provider off → gone from checkout; edit currency/fx → next checkout recomputes; no key field anywhere.

- [X] T043 [US7] Build the **Payments → Providers** section in `admin.js` (`renderPayments`, providers part): `client.from('payment_providers').select('*').order('sort_order')`; per row an enable/disable toggle → `client.rpc('admin_set_provider_enabled',{p_provider,p_enabled})` and editable display_name/currency/fx_rate with Save → `client.rpc('admin_set_provider_config',{...})`; map `bad_fx_rate`; **no secret-key field**; in-flight disable + success toast (FR-029/030/031).
- [X] T044 [P] [US7] Style the Payments providers section (toggles + config rows) in `admin.css`.
- [X] T045 [US7] Manual validation per `quickstart.md` US7 (toggle reflected at checkout within seconds; config edit applies; `fx_rate ≤ 0` rejected; non-admin RPC → `not authorized`; SC-011/SC-013/SC-014).

**Checkpoint**: Owner controls which providers are live and their pricing.

---

## Phase 10: User Story 8 — Monitor payments across providers (Priority: P2)

**Goal**: Read-only cross-provider ledger + per-provider totals.

**Independent Test**: After sandbox payments, the ledger lists each with provider/payer/amount/status/time; totals match; no mutating controls.

- [X] T046 [US8] Build the **Payments → Transactions** ledger in `admin.js` (`renderPayments`, ledger part): `client.from('payments').select('*').order('created_at',{ascending:false})`; columns when/provider/payer/amount+currency/status/kind; empty state; strictly read-only (no refund/cancel/edit) (FR-033/035).
- [X] T047 [US8] Build the **Payments → Totals** in `admin.js`: `client.rpc('admin_payments_overview')`; render per-provider paid count + sum (labelled with each currency) and grand "payments received" (FR-034).
- [X] T048 [P] [US8] Style the transactions ledger + totals in `admin.css`.
- [X] T049 [US8] Manual validation per `quickstart.md` US8 (ledger lists across providers; totals match; read-only; non-admin select on `payments` denied; SC-012/SC-014).

**Checkpoint**: All eight stories independently functional.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Security verification, accessibility, and full acceptance.

- [X] T050 [P] Re-run `get_advisors` (security + performance) after the SQL is applied; confirm every new object has RLS and `payments`/`admin_messages` have no client-write policy; `payment_providers` exposes only enabled rows publicly; resolve any finding.
- [X] T051 [P] Cross-account isolation probe: as a non-admin, call each `admin_*` RPC + `admin_set_provider_*` directly and read `payments`/`admin_messages`/all-profiles → expect `not authorized` / empty (SC-001/SC-007/SC-013/SC-014).
- [X] T052 [P] Payment-security probe: confirm no provider secret appears in any client response or `payment_providers` row; attempt a checkout with a tampered/client amount → server recomputes/ignores it (FR-021); attempt a forged webhook (bad signature) → ignored (FR-028).
- [X] T053 [P] Browser validation run via local Chromium/Node harness ([[browser-validation-setup]]) over `http`; exercise the five admin panes as admin + the checkout picker; clean up the throwaway script.
- [X] T054 Accessibility pass in `admin.html`/`admin.js`: labelled inputs, keyboard-navigable tabs/forms, focus states; consistent `BeaconAuth.toast`; confirm LTR/English-only for admin (checkout picker stays bilingual/RTL).
- [X] T055 Full `quickstart.md` run end-to-end (all stories incl. sandbox payments) and tick the acceptance checklist.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. T004+T005 (SQL) → T007 (owner paste) gates every story that calls a function/policy. T006 (router/error map) gates all panes. **BLOCKS all user stories.**
- **US1–US5 (Phases 3–7)**: each depends on Foundational. US1 is the MVP. US2–US5 depend only on Foundational (and the US1 shell in practice), not on each other.
- **US6 (Phase 8)**: depends on Foundational (payments schema) + T041 (owner deploy/secrets) for live testing. Edge functions (T030–T037) can be written in parallel (different files); the pickers (T038–T040) edit `ticket.js`/`account.js`.
- **US7 (Phase 9)** and **US8 (Phase 10)**: depend on Foundational; both build the shared **Payments** pane in `admin.js` → sequential w.r.t. each other. US8's data is most meaningful after US6 produces payments.
- **Polish (Phase 11)**: after the desired stories are complete.

### Within Each User Story

- Multiple `admin.js` tasks in the same story are **sequential** (same file); the matching `[P]` `admin.css` task parallels them (different file); manual validation is last.
- US6 edge functions (T030–T035) are **[P]** (separate function dirs); the Stripe extensions (T036/T037) touch existing files; the pickers touch `ticket.js` then `account.js`.

### Parallel Opportunities

- Setup: T002 (`admin.css`) + T003 (`admin.js`) after T001.
- US6: T030–T035 (six new edge functions) are fully parallel — different files.
- Within a story: the `[P]` styling task parallels that story's `admin.js` work.
- Polish: T050/T051/T052/T053 are independent.
- **Cross-story caution**: US2–US8 all edit shared `admin.js`/`admin.css`; logically independent but should not be edited literally simultaneously without coordination.

---

## Implementation Strategy

### MVP First

1. Phase 1 → Phase 2 (incl. T007 owner paste) → Phase 3 (US1).
2. **STOP and VALIDATE**: admin-only gate works both ways (T012). A shippable locked admin shell.

### Incremental Delivery

1. Foundation → US1 (locked shell) → demo.
2. + US2 (messaging) → demo.
3. + US6 (multi-provider checkout — the headline payment value; needs T041 deploy) → demo.
4. + US3 (contact reply), US7 (provider config), US8 (monitoring) → demo.
5. + US4 (overview), US5 (accounts) → demo.
6. Phase 11 polish + full quickstart acceptance.

### Owner-gated checkpoints

- T007 (paste `supabase-setup.sql` + seed admin + advisors) before any story validation.
- T041 (set secrets + deploy edge functions + register webhooks) before US6/US7/US8 live validation. Supabase MCP is read-only ([[sql-via-paste-ready-file]]) — it cannot apply SQL or deploy functions.

---

## Notes

- `[P]` = different file, no incomplete-task dependency.
- Commit after each task or logical group.
- **Security boundary is server-side**: admin actions via RLS + SECURITY DEFINER self-guards; money movement via service-role edge functions that verify signatures and hold secrets. The client gate and picker are convenience only — never weaken server checks.
- **Most sensitive code is the payment edge functions** (T030–T037): server-computed amounts, signature verification, idempotency, and webhook-only booking are non-negotiable (FR-021/022/024/028/039).
- `admin select all` on `profiles` and the `payments` ledger expose PII/financial data to admins (intended owner oversight, read-only). Flag if scope changes.
