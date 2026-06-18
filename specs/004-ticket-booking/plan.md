# Implementation Plan: Scholarship Ticket Booking, Profiles & Catalogue Cleanup

**Branch**: `004-ticket-booking` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-ticket-booking/spec.md`

## Summary

Add a paid, server-trusted **ticket booking** flow to the existing Beacon static site, plus profile/UX cleanups. On a scholarship detail page a **Book Ticket** button (inserted between `#detailBody` and `#applyArea`, replacing the outbound apply link) plays a vanilla CSS/JS ticket animation and then sends the user to **Stripe Checkout** — created by a **Supabase Edge Function** so the secret key and the ranking-based price ($150/$200/$250/$300) stay server-side. A **Stripe webhook** edge function is the only thing that creates a `tickets` row (idempotent on the Stripe session id) and sets a server-anchored 3-day `cooldown_end`, satisfying "no ticket on failed/abandoned payment" and cross-device-consistent countdowns. The account page gains a **Ticket** tab (countdown → reveal with a unique ticket code + selected profile fields) and the nav avatar menu gains a **Ticket** item with a cooldown progress ring; capacity is 1, enforced server-side, with a paid **+1 space** add-on (permanent slot) and a one-ticket-per-scholarship rule. The owner is notified per booking (Resend email, with the dashboard as the durable record) and gets an **owner-only dashboard** (`admin.html`) backed by an `admins` table + admin RLS. The create-account form is expanded (first/last name, address, city, country, nationality, optional second nationality, highest degree, optional GPA, optional field of interest, password + confirm, agreement checkpoint) and writes a `profiles` row on sign-up; **reset password** moves into the Settings tab and the `acctGate`/`acctReset` blocks are removed. Scholarship filters persist in `localStorage`. All visible "For9a"/"فرصة" text is scrubbed at build time and verified absent. Ranking tiers are derived from a recognized world ranking via a **PowerShell** generator (no Python) that emits both a client `ranking-index.js` and an idempotent SQL seed appended to `supabase-setup.sql` (owner pastes; MCP is read-only).

## Technical Context

**Language/Version**: HTML5, CSS3, vanilla JavaScript (ES2020, browser); Supabase Edge Functions in **TypeScript/Deno**; Windows PowerShell 5.1 for build/tooling (**no Python**, standing user constraint).
**Primary Dependencies**: `@supabase/supabase-js` v2 (pinned CDN `2.108.1`, already used); **Stripe** (hosted Checkout + webhooks; secret key server-side only; test keys in gitignored `Strip-sandbox.text`); Stripe SDK + Supabase client inside edge functions (Deno imports); **Resend** HTTP API for owner email (optional, degrades gracefully). No client-side Stripe.js required (redirect to `session.url`).
**Storage**: Supabase Postgres — new `tickets`, `scholarship_rankings`, `admins` tables; `profiles` extended with `first_name`, `last_name`, `second_nationality`, `gpa`, `field_of_interest`, `ticket_capacity`. All owner-only RLS except `scholarship_rankings` (public read) and admin-scoped read on `tickets`. Writes to `tickets`/capacity happen only via the webhook edge function using the service role. Filter state is `localStorage` only (no table).
**Testing**: Manual acceptance via `quickstart.md` (consistent with features 001–003) + browser validation via local Chromium/Node harness (Playwright MCP unavailable per project memory; `npx playwright install chromium` then a throwaway Node script, clean up `node_modules`). Stripe in **test mode** (card `4242 4242 4242 4242`). Supabase advisors (`get_advisors`) after schema changes.
**Target Platform**: Modern evergreen browsers over **http(s)** (Stripe redirect + OAuth cannot return to `file://`); anonymous browsing still works on `file://` with account/ticket UI degraded, matching feature 003.
**Project Type**: Static multi-page web app + backend-as-a-service (Supabase) + 3 serverless edge functions. No custom server.
**Performance Goals**: Account/nav ticket state resolves async without blocking first paint (< 500 ms typical). Book→checkout redirect initiated within ~2 s of click (after the ~1.8 s animation). Booking→ticket creation is webhook-driven (near-instant after Stripe confirmation).
**Constraints**: No frameworks/bundler; only the publishable (anon) Supabase key and (optionally) the Stripe *publishable* key ship to the client — never `service_role` or `sk_*`. Price is computed **server-side** from `scholarship_rankings`; the client price is display-only. Every new table RLS-enabled; ticket inserts/capacity changes are service-role-only. Supabase MCP is **read-only** and cannot `deploy_edge_function` — schema goes through `supabase-setup.sql` (owner pastes; [[sql-via-paste-ready-file]]) and edge functions are deployed by the owner via the dashboard (as with feature 003's `delete_account`). Payments are **non-refundable** (no refund flow). PowerShell `.ps1` with Arabic regex must be saved UTF-8 **with BOM**.
**Scale/Scope**: ~170 scholarships (static), low-thousands of users. New: 1 detail-page module, 1 account Ticket area, 1 owner dashboard page, 3 edge functions, 3 tables + profile columns, 1 PowerShell ranking generator + curated ranking CSV, CSS additions, build-time For9a scrub, filter persistence.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is still an unpopulated template with no ratified principles — no concrete gates to enforce. The design preserves the implicit simplicity standard of features 001–003: no frameworks, no bundler, static pages, persistence straight from browser to Supabase behind RLS. The only new moving parts are 3 small edge functions, which are the **minimal** way to (a) keep the Stripe secret off the client, (b) make price authoritative, and (c) anchor the cooldown and capacity server-side — none of which can be done safely in client-only code.

**Result**: PASS (pre-research and post-design). Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/004-ticket-booking/
├── plan.md              # This file
├── research.md          # Phase 0 output — decisions R1..R8
├── data-model.md        # Phase 1 output — tables, columns, RLS, state machine
├── quickstart.md        # Phase 1 output — owner setup + acceptance checklist
├── contracts/           # Phase 1 output
│   ├── db-schema.md      # DDL/RLS/grants/seed appended to supabase-setup.sql
│   ├── edge-functions.md # ticket-checkout / space-checkout / stripe-webhook contracts + Stripe events
│   └── ui-behavior.md    # Book Ticket states + animation, ticket area, nav ring, admin, signup, settings, filters, For9a
├── checklists/
│   └── requirements.md   # From /speckit-specify (passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html                 # (no structural change) — filter persistence is JS-only
index.js                   # + persist/restore filter state to localStorage (beacon.filters); For9a-safe (data scrubbed)
index.css                  # + Book Ticket button + animation scene, ticket area, nav ticket ring, admin dashboard, expanded signup form styles
scholarship.html           # unchanged structure (#detailBody / #applyArea already present); + ticket.js script tag
scholarship.js             # apply area becomes ticket-focused (remove outbound apply link, FR-004a); hand off to ticket.js
ticket.js                  # NEW: renders Book Ticket between #detailBody and #applyArea; animation; already-booked/capacity states; calls ticket-checkout
account.html               # remove #acctGate and #acctReset blocks; add Ticket tab + pane; reset-password lives in Settings
account.js                 # NEW Ticket pane (countdown → reveal, +1 space buy); expanded Profile fields; Settings reset-password; recovery (#reset) relocated into Settings; gate replaced by modal/inline prompt
auth.js                    # expanded create-account form (new fields, confirm password, agreement checkpoint) → writes profiles row; nav menu gains Ticket item + cooldown ring
admin.html                 # NEW: owner-only dashboard shell
admin.js                   # NEW: lists/manages all tickets (admin RLS); access-gated
supabase-config.js         # + window.STRIPE_PUBLISHABLE_KEY (publishable only) and function base URL
ranking-index.js           # NEW, GENERATED: window.RANKING_INDEX = { <id>: { tier, price, institution } } (display only)
supabase-setup.sql         # + dated idempotent section: new tables, columns, RLS, grants, admins seed, scholarship_rankings seed
supabase/functions/
├── ticket-checkout/index.ts   # NEW: validates user+scholarship, server price, capacity & one-per-scholarship, creates Stripe Checkout Session
├── space-checkout/index.ts    # NEW: creates Checkout Session for a +1 space add-on
└── stripe-webhook/index.ts    # NEW: verifies signature; on checkout.session.completed creates ticket / increments capacity (idempotent); emails owner
ScholarShips_Data/
├── build_ranking_index.ps1    # NEW: rankings.csv (+ overrides) × catalogue → ranking-index.js + SQL seed block
├── rankings.csv               # NEW: curated institution → rank/tier (recognized world ranking)
├── rankings-overrides.csv     # NEW: manual name-match fixes
├── build_details.ps1          # + scrub visible "For9a"/"فرصة" from generated detail content (UTF-8 BOM)
└── build_catalogue.ps1        # + scrub visible "For9a"/"فرصة" from titles/orgs
details/*.js, scholarships.js  # REGENERATED after scrub
Scene.gif                      # optional one-shot flourish; animation does not depend on it
```

**Structure Decision**: Keep the flat static-site layout and the feature-003 module pattern. Add one detail-page module (`ticket.js`), extend the three existing page scripts, add one owner page (`admin.html`/`admin.js`), and add three edge functions under `supabase/functions/`. Pricing, ticket creation, capacity, and cooldown are pushed server-side (edge functions + service-role writes + RLS) because they are security/integrity boundaries that cannot live in client JS. Everything user-facing remains vanilla HTML/CSS/JS loaded via `<script>` tags. Ranking data is generated by PowerShell into both a client display file and an idempotent SQL seed (owner-pasted), keeping the server the single source of truth for price.

## Complexity Tracking

> No constitution violations; no entries required.
