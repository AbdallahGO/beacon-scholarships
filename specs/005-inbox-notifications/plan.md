# Implementation Plan: User Inbox & Notifications

**Branch**: `005-inbox-notifications` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-inbox-notifications/spec.md`

## Summary

Add a per-user **in-app inbox** to the existing Beacon static site. A shared client module (`inbox.js`, loaded on every page like `auth.js`) injects a **notification bell + unread-count badge** into the nav for signed-in users (FR-002a), subscribes to **Supabase Realtime** so new messages and the badge update live without a refresh (FR-017), and opens a dropdown for quick reading; the account page gains a full **Inbox tab/pane** for browsing, mark read/unread, and delete. All inbox messages live in one new `notifications` table whose rows are **only created through trusted paths** — never by arbitrary client inserts: a `welcome` message is created by an `AFTER INSERT ON profiles` **SECURITY DEFINER trigger** (one-time per account, FR-007); a `booking` confirmation is inserted by the **existing `stripe-webhook`** edge function in the same idempotent step that creates the ticket (FR-008/009, no new edge function); a `contact` acknowledgement is created by an `AFTER INSERT ON contact_messages` trigger when a **signed-in** user submits the contact form (FR-010, anonymous keeps the current mailto/on-page confirmation); and **owner/admin** messages are delivered by an admin-only RLS insert policy plus an `admin_broadcast()` SECURITY DEFINER helper that fans a broadcast out to one row per existing user (FR-011, point-in-time per the Q1 clarification). System messages are stored as a `type` + structured `payload` (jsonb) and rendered into the viewer's language (EN/AR, FR-018) from client-side templates keyed off the existing `beacon-lang` preference; owner messages carry literal `title`/`body`. RLS keeps each inbox private (FR-006/014) and `ON DELETE CASCADE` removes a user's messages when their account is deleted (FR-015). The only owner-gated steps are re-pasting `supabase-setup.sql` and redeploying the existing `stripe-webhook`.

## Technical Context

**Language/Version**: HTML5, CSS3, vanilla JavaScript (ES2020, browser); Supabase Edge Function in **TypeScript/Deno** (only the *existing* `stripe-webhook` is touched); Windows PowerShell 5.1 for any tooling (**no Python**, standing constraint).
**Primary Dependencies**: `@supabase/supabase-js` v2 (pinned CDN `2.108.1`, already loaded site-wide) — its **Realtime** (`channel().on('postgres_changes', …)`) and Postgres client are the only new capabilities exercised. No new third-party libraries, no bundler, no framework.
**Storage**: Supabase Postgres — new `public.notifications` table (the inbox) and new `public.contact_messages` table (signed-in contact submissions + future-dashboard record). New SECURITY DEFINER trigger functions (`notify_welcome`, `notify_contact`) and an `admin_broadcast(title, body)` helper. `notifications` added to the `supabase_realtime` publication. No client-writable inserts on `notifications`.
**Testing**: Manual acceptance via `quickstart.md` (consistent with features 001–004) + browser validation via local Chromium/Node harness (Playwright MCP unavailable per project memory — `npx playwright install chromium` then a throwaway Node script using the `msedge` channel, clean up after). Supabase advisors (`get_advisors`) after schema changes. Cross-account isolation probe for SC-005.
**Target Platform**: Modern evergreen browsers over **http(s)** (Realtime websockets + auth need a real origin); anonymous browsing still works on `file://` with the inbox simply absent, matching features 003/004.
**Project Type**: Static multi-page web app + backend-as-a-service (Supabase). No new custom server, **no new edge function**.
**Performance Goals**: Nav bell + unread count resolve async without blocking first paint (< 500 ms typical). A message that arrives while a page is open shows in the badge/list within a few seconds via Realtime (SC-008). Inbox open and message read feel immediate (SC-006).
**Constraints**: Only the publishable (anon) Supabase key ships to the client; RLS is the security boundary. `notifications` has **no client INSERT policy** — system rows come only from SECURITY DEFINER triggers and the service-role webhook; owner rows come from an admin-scoped insert policy. Supabase MCP is **read-only** and cannot `deploy_edge_function`: schema/triggers/publication go through `supabase-setup.sql` (owner pastes; [[sql-via-paste-ready-file]]) and the `stripe-webhook` change is deployed by the owner via the dashboard with **JWT verification OFF** (the feature-004 webhook gotcha). Realtime respects RLS, so the client subscribes filtered to its own `user_id`.
**Scale/Scope**: Low-thousands of users, tens of messages per user (no paging/search required, per spec Assumptions). New: 1 shared client module (`inbox.js`), 1 account Inbox pane, nav bell injection, 2 tables + 2 triggers + 1 helper function + 1 realtime publication entry, a 4-line addition to `stripe-webhook`, a signed-in branch in the contact form, and CSS (bell/badge/dropdown/pane incl. RTL).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) remains an unpopulated template with no ratified principles — no concrete gates to enforce. The design preserves the implicit simplicity standard of features 001–004: no frameworks, no bundler, static pages, persistence straight from browser to Supabase behind RLS. This feature is deliberately the **minimal** addition: it adds **zero new edge functions** (reusing the existing webhook and pushing one-time/derived creation into DB triggers), and the only new client moving part is one shared module mirroring the established `auth.js` pattern.

**Result**: PASS (pre-research). Re-evaluated post-design below — still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/005-inbox-notifications/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions R1..R10
├── data-model.md        # Phase 1 output — notifications + contact_messages, RLS, triggers, state
├── quickstart.md        # Phase 1 output — owner setup + acceptance checklist
├── contracts/           # Phase 1 output
│   ├── db-schema.md         # DDL/RLS/indexes/triggers/publication/helper appended to supabase-setup.sql
│   ├── notifications-api.md # Trusted creation paths, realtime subscription contract, admin/broadcast delivery
│   └── ui-behavior.md       # Nav bell+badge, dropdown, account Inbox pane, localization templates, empty/RTL states
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
inbox.js                   # NEW: shared module (loaded on every nav page like auth.js) — injects nav bell + unread badge,
                           #      fetches unread count, subscribes to Realtime (postgres_changes on notifications, own user_id),
                           #      renders the quick-view dropdown, mark-read/delete actions, EN/AR localization templates (beacon-lang)
account.html               # + Inbox tab (#inbox) and pane (#pane-inbox)
account.js                 # + render Inbox pane: full list newest-first, unread styling, open→read, mark read/unread, delete, empty state
auth.js                    # (no behavior change) — inbox.js consumes the existing BeaconAuth.onChange/getUser; bell sits beside #navAccount
contact.html               # contact submit: signed-in → insert contact_messages row (ack via trigger) + on-page confirm; anon → existing mailto/on-page confirm
index.html, scholarship.html, faq.html, how-to-apply.html, writing-your-essay.html, account.html
                           # + <script src="inbox.js"> after auth.js (every page that renders the nav)
index.css                  # + nav bell + unread badge, quick-view dropdown panel, account Inbox pane, unread/empty styles, RTL message direction
supabase-config.js         # (no change — FUNCTIONS_BASE already present; no new function/key needed)
supabase/functions/
└── stripe-webhook/index.ts # + in the kind="ticket" branch, after the ticket insert, insert a type='booking' notification
                           #   (service role, idempotent dedupe_key 'booking:'+session.id, payload = scholarship title/code/available_at)
supabase-setup.sql         # + dated idempotent feature-005 section:
                           #   - public.notifications (+ RLS: own select/update/delete, admin insert; partial unique dedupe index)
                           #   - public.contact_messages (+ RLS: own insert/select, admin select all)
                           #   - notify_welcome() trigger fn + AFTER INSERT ON profiles trigger
                           #   - notify_contact() trigger fn + AFTER INSERT ON contact_messages trigger
                           #   - admin_broadcast(title, body) SECURITY DEFINER helper (one row per profile)
                           #   - alter publication supabase_realtime add table notifications
```

**Structure Decision**: Keep the flat static-site layout and the feature-003/004 module pattern. Add exactly one shared client module (`inbox.js`) that mirrors `auth.js` (injects nav UI, listens to auth state), extend the account page with one tab/pane, and add a signed-in branch to the contact form. All message **creation** is server-trusted: one-time `welcome` and `contact` acks come from SECURITY DEFINER **DB triggers**, the `booking` confirmation rides inside the **existing** `stripe-webhook` (so it is idempotent with the ticket and needs no new function), and owner messages use an **admin-scoped RLS insert** + a broadcast helper. This keeps the security boundary in Postgres/RLS, adds no new edge function, and limits the owner's deploy burden to a SQL paste plus a single webhook redeploy.

## Complexity Tracking

> No constitution violations; no entries required.
