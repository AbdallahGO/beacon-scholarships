# Implementation Plan: Admin Dashboard & Multi-Provider Payments

**Branch**: `006-admin-dashboard` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-admin-dashboard/spec.md`

## Summary

Feature 006 has two coherent halves built on the same Supabase backend:

**A. Admin dashboard (US1–US5)** — a single, English-only `admin.html` (+ `admin.js` + `admin.css`) reachable only by users in the existing `public.admins` registry. Gated two ways: the client checks membership in `admins` to decide whether to render, and — the real boundary — every read/write is enforced server-side by RLS and `SECURITY DEFINER` functions that self-guard on `admins`. Panes: **Overview**, **Messages** (compose → send to one user by email or broadcast, with a confirm + a sent-message log in `public.admin_messages`), **Contact** (read submissions + reply), **Accounts** (read-only profiles + a user's bookings). No Realtime; loads on open/refresh.

**B. Multi-provider payments (US6–US8)** — expand the site's **two paid flows** (ticket booking via `ticket-checkout`, and the "+1 ticket space" via `space-checkout`, both USD, both Stripe-only today) to **four providers**: Stripe (existing) + **PayPal**, **Paymob**, **Kashier**. At checkout the user **manually picks** an *enabled* provider; the amount is computed **server-side** as `base_usd × fx_rate` in the provider's currency. A new **`public.payments`** ledger records every attempt across all providers; a ticket/space is booked **only** after the provider's **webhook** verifies the payment (the redirect is never trusted). A **`public.payment_providers`** config table holds the enabled flag + non-secret config (display name, currency, fx_rate); **secret keys live only in Supabase edge-function secrets**. The admin dashboard gains a 5th **Payments** pane to toggle/configure providers (via self-guarding RPCs) and monitor the cross-provider ledger read-only. A **server-side double-pay guard** prevents a user being charged/booked twice for the same item across providers; failed/abandoned payments may be **retried**, including with a different provider.

**Scope note — edge functions return:** Part A adds **no** edge function. Part B **does** — payment integrations are inherently server-side (secrets, signature verification, webhooks), so this feature adds Deno/TypeScript edge functions per provider for both paid flows, and small additions to the existing Stripe functions so Stripe writes to the same ledger.

## Technical Context

**Language/Version**:
- *Client*: HTML5, CSS3, vanilla JavaScript (ES2020, browser) — `admin.html`/`admin.js`/`admin.css` plus small edits to `ticket.js`/`account.js` for the provider-picker.
- *Edge functions*: TypeScript on Deno (Supabase Edge Functions), matching the existing `ticket-checkout`/`space-checkout`/`stripe-webhook`.
- Windows PowerShell 5.1 for tooling. **No Python** (standing constraint).

**Primary Dependencies**:
- `@supabase/supabase-js` v2 (pinned CDN `2.108.1`) for client reads/RPCs and the existing `BeaconAuth` session.
- Edge functions use each provider's HTTP API directly (no heavy SDKs where avoidable): **Stripe** (existing), **PayPal** REST (Orders v2 + webhook verification), **Paymob** (Intention/Order + HMAC callback verification), **Kashier** (payment request + signature/HMAC verification). Supabase **service-role** client inside functions to write `payments`/`tickets`/`space_purchases` (bypassing RLS) and to read `payment_providers`.

**Storage**: Supabase Postgres. New: `public.payment_providers` (config) and `public.payments` (ledger). Altered: `public.tickets` (+`provider`, +`payment_id`), `public.space_purchases` (+`provider`, +`payment_id`). New functions: `admin_set_provider_enabled()`, `admin_set_provider_config()`, `admin_payments_overview()` (all `SECURITY DEFINER`, admin-guarded). Plus the existing admin-dashboard objects (`admin_messages`, `admin_broadcast` extended, `admin_send_to_user/email`, `admin_overview`, `admin select all` on `profiles`). Reuses `admins`, `notifications`, `contact_messages`, `tickets`, `space_purchases`, `profiles`, `scholarship_rankings`.

**Secrets**: New Supabase function secrets (set once by the owner via `supabase secrets set`, never in DB/client): `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`/`PAYPAL_WEBHOOK_ID`, `PAYMOB_API_KEY`/`PAYMOB_HMAC_SECRET` (+ integration/iframe ids), `KASHIER_API_KEY`/`KASHIER_SECRET` (+ merchant id). Existing `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` unchanged. Exact names finalized in `contracts/`.

**Testing**: Manual acceptance via `quickstart.md` (consistent with 001–005) + local Chromium/Node browser harness ([[browser-validation-setup]]). Each gateway tested in **sandbox/test mode** end-to-end (pick provider → pay in sandbox → webhook confirms → ticket/space appears → transaction shows in the admin Payments pane). Supabase `get_advisors` (security + performance) after schema changes. Cross-account probe: a non-admin cannot toggle/configure providers or read `payments`/`admin_*` (SC-007/SC-013/SC-014).

**Target Platform**: Modern evergreen browsers over **http(s)** (auth/session + redirect returns need a real origin). Admin page unavailable on `file://` and to non-admins. Webhooks are public HTTPS endpoints (no JWT) but signature-verified.

**Project Type**: Static multi-page web app + backend-as-a-service (Supabase) + Edge Functions. One new admin page; **new edge functions for payments** (per provider × {ticket, space} checkout + per-provider webhook).

**Performance Goals**: Admin gate resolves and first pane paints < 500 ms typical. Checkout: provider list + session creation is one round-trip per attempt; webhook confirmation is near-instant server-side. Low-thousands users, tens–hundreds of payments (no paging/search required, per spec Assumptions).

**Constraints**:
- Only the publishable (anon) Supabase key ships to the client; **RLS + SECURITY DEFINER self-guards are the security boundary** for admin actions.
- **Payment secret keys never leave the server** (edge-function secrets only). The browser never sees them and never sets an amount — `amount = base_usd × fx_rate` is computed in the edge function.
- `payments` has **no client write policy** — only edge functions (service role) write it; admins read via `admin select all`.
- `payment_providers` exposes **only enabled rows** to the public (a column-safe SELECT policy or a read RPC); admin writes go only through self-guarding RPCs.
- **Booking happens only on webhook confirmation** (redirect never trusted) and is **idempotent on `provider_ref`**; a **server-side double-pay guard** rejects a second attempt for an already-pending/booked item.
- Supabase MCP is **read-only** here: all DDL/policies/functions go through `supabase-setup.sql` (owner pastes; [[sql-via-paste-ready-file]]); edge functions are deployed by the owner (`supabase functions deploy`) since MCP cannot deploy.
- Admin UI English-only, LTR. Public checkout/provider-picker stays bilingual EN/AR + RTL (it lives on the public ticket/account pages).

**Scale/Scope**: New client surface: 1 page (`admin.html`) + `admin.js` + `admin.css`, a provider-picker added to the existing `ticket.js`/`account.js` paid flows, and a conditional "Admin" nav entry. New backend: 2 tables + 4 table alterations/columns, 3 new admin RPCs (+ the admin-dashboard RPCs), and **edge functions**: `paypal-checkout`, `paymob-checkout`, `kashier-checkout` (each handling both ticket & space via a `kind` param), `paypal-webhook`, `paymob-webhook`, `kashier-webhook`, plus additions to `ticket-checkout`/`space-checkout`/`stripe-webhook` to write the ledger.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) remains an unpopulated template with no ratified principles — no concrete gates to enforce. The design preserves the implicit simplicity standard of features 001–005: no frameworks, no bundler, static pages, persistence behind RLS.

**Notable deviation from the original 006 scope** (admin-dashboard-only): the multi-provider payment work **adds edge functions**, which the admin-dashboard half deliberately avoided. This is unavoidable and justified — payment provider integrations require server-side secret handling, signature verification, and webhook receipt that **cannot** be done safely from the browser or from RLS/RPC alone. The design keeps each provider isolated (one checkout + one webhook function per provider, mirroring the existing `ticket-checkout`/`stripe-webhook` pattern) rather than introducing a framework or a custom server, so it stays within the established BaaS + edge-function model already used by feature 004.

**Result**: PASS (pre-research) — deviation documented in Complexity Tracking. Re-evaluated post-design below — still PASS.

## Project Structure

### Documentation (this feature)

```text
specs/006-admin-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R9 (admin dashboard) + R10..R17 (payments)
├── data-model.md        # Phase 1 — admin_messages + payment_providers + payments + tickets/space changes, RLS, functions
├── quickstart.md        # Phase 1 — owner setup (SQL + secrets + function deploy) + acceptance checklist
├── contracts/           # Phase 1
│   ├── db-schema.md         # DDL/RLS/functions appended to supabase-setup.sql (admin + payments)
│   ├── admin-rpc.md         # Admin dashboard RPC contract (messaging/overview/accounts)
│   ├── ui-behavior.md       # admin.html panes incl. the new Payments pane + the checkout provider-picker
│   ├── payments-rpc.md       # Provider config/monitoring RPCs + the enabled-providers read contract
│   └── payment-functions.md  # Edge-function contracts: per-provider checkout + webhook (inputs/authz/signature/idempotency/errors)
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
├── payments-design.md   # (optional) brainstormed design notes feeding this plan
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
admin.html                 # NEW: admin dashboard page (English-only, LTR). Panes: Overview / Messages / Contact / Accounts / Payments.
admin.js                   # NEW: gate on admins; render panes; messaging RPCs; Payments pane (provider toggles/config + ledger monitor).
admin.css                  # NEW: dashboard layout/styles (reuses index.css theme vars; LTR).
ticket.js                  # CHANGED: provider-picker before redirect — list enabled providers, call the chosen provider's ticket checkout.
account.js                 # CHANGED: same provider-picker for the "+1 ticket space" purchase (space-checkout path).
auth.js                    # (no behavior change) — admin.js consumes BeaconAuth.client/getUser/onChange.
supabase-config.js         # (maybe) expose FUNCTIONS_BASE entries for the new checkout endpoints (already a base for ticket/space).
supabase-setup.sql         # + dated idempotent Feature-006 section:
                           #   - admin dashboard objects (admin_messages, admin_* funcs, admin select all on profiles)
                           #   - payment_providers (config, seed 4 rows) + RLS (public reads enabled; admin write via RPC)
                           #   - payments (ledger) + indexes + RLS (admin select all; NO client write)
                           #   - alter tickets / space_purchases: add provider, payment_id
                           #   - admin_set_provider_enabled(), admin_set_provider_config(), admin_payments_overview()
                           #   - extend admin_overview() to include payments-received total
supabase/functions/
├── ticket-checkout/       # CHANGED (Stripe): also create a payments(pending) row + enforce double-pay guard
├── space-checkout/        # CHANGED (Stripe): same as above for the +1 space
├── stripe-webhook/        # CHANGED: on success, mark payments paid (idempotent) + set tickets/space provider+payment_id
├── paypal-checkout/       # NEW: kind=ticket|space → compute amount, create PayPal order, payments(pending), return approve URL
├── paypal-webhook/        # NEW: verify PayPal webhook sig → mark paid (idempotent) → book ticket/space
├── paymob-checkout/       # NEW: PayPal-equivalent for Paymob (intention/order)
├── paymob-webhook/        # NEW: verify Paymob HMAC → mark paid → book
├── kashier-checkout/      # NEW: Kashier payment request
└── kashier-webhook/       # NEW: verify Kashier signature → mark paid → book
CLAUDE.md                  # SPECKIT marker repointed to specs/006-admin-dashboard/plan.md
```

**Structure Decision**: Keep the flat static-site layout and the feature-003/004/005 module pattern for the client. The admin dashboard remains a single isolated English-only page. Payments follow feature 004's existing edge-function pattern — **one checkout + one webhook function per provider**, each self-contained, rather than a unified branching function or a new framework. A single shared **`payments` ledger** plus the **`payment_providers`** config table give the admin a clean cross-provider view and keep all privileged logic server-side (RLS + `SECURITY DEFINER` for admin actions; service-role edge functions for money movement, with secrets confined to the function runtime).

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected |
|-----------|------------|------------------------------|
| Adds edge functions (Part B) — the 006 admin half deliberately added none | Payment provider integration requires server-side secret handling, amount computation, signature verification, and webhook receipt; none can be done safely in the browser or via RLS/RPC | "No edge function" (admin-only approach) — impossible for real gateways: secrets would leak to the client and bookings couldn't be verified server-side |
| One checkout + one webhook function **per provider** (×2 paid flows via a `kind` param) | Each gateway has a different API and signature/verification scheme; isolation keeps money-handling code readable and testable | A single unified checkout/webhook function — rejected: mixes four gateways' quirks in one file, harder to verify and riskier for payments |
| New `payments` ledger + `payment_providers` config tables | A cross-provider ledger is the source of truth for monitoring (US8), idempotency, and the double-pay guard; config table drives the enabled-provider checkout list and owner-set currency/fx | Provider columns on `tickets` only (no ledger) — rejected in spec (weak history/monitoring, harder idempotency) |
