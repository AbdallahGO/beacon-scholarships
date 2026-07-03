# Contract: UI Behavior (`admin.html` + `admin.js` + `admin.css`)

English-only, LTR. Reuses `BeaconAuth` (session) and the site theme tokens from `index.css`. Loaded scripts (in order): supabase-js CDN → `supabase-config.js` → `auth.js` → `inbox.js` → `admin.js`.

## Page gate (US1 / FR-001..004)

1. On load, `admin.js` waits for `BeaconAuth` and the current user via `BeaconAuth.onChange`.
2. **Anonymous / file://**: show the "not authorized" card with a "Sign in" affordance (reuse `BeaconAuth.openModal('signin')`); render no panes.
3. **Signed-in, not admin**: client gate query returns empty → show the "not authorized" card ("You don't have admin access."). No admin data is fetched.
4. **Signed-in admin**: render the dashboard shell (tabs + panes) and inject an **"Admin"** link into the nav account menu (mirrors how `inbox.js` augments the nav; shown only to admins).
5. If admin status changes (sign out / row removed) mid-session, the next action returns `not authorized` and the page reverts to the gate state (edge case: revoked mid-session).

The gate is cosmetic; every pane's data is independently protected by RLS / definer self-guards.

## Shell & navigation

- A simple top nav (logo + `#navAccount` slot so `auth.js`/`inbox.js` render normally) and a tab strip: **Overview · Messages · Contact · Accounts · Payments**.
- Tabs map to hash routes (`#overview`, `#messages`, `#contact`, `#accounts`, `#payments`) so refresh/deep-link preserves the active pane (consistent with `account.html`).
- A "Refresh" control re-fetches the active pane (no Realtime; R7).

## Overview pane (US4 / FR-016)

- Calls `admin_overview()` once on open; renders headline cards: **Registered users** (`users`), **Completed profiles** (`profiles`), **Tickets booked** (`tickets`), **Contact messages** (`contact_messages`), **Messages sent** (`messages_sent`).
- Loading state while the RPC is in flight; error state shows the mapped message with a retry.

## Messages pane (US2 / FR-005..013, FR-011a/b)

**Compose**
- Fields: **Target** (radio: "One user (by email)" | "All users"), **Email** (shown only for single; type=email), **Title** (optional), **Body** (required, textarea).
- Client validation: body non-empty (FR-009); for single, email present. Send control disabled while empty or in-flight.
- **Single send** → `admin_send_to_email(email, title, body)`; on success toast "Message sent." On `recipient_not_found` show "No user found with that email." inline on the email field.
- **Broadcast** → an explicit **confirm dialog** ("Send this message to all users? This can't be undone.") (FR-010). On confirm → `admin_broadcast(title, body)`; on success toast "Sent to N users." (FR-011).
- After any successful send, clear the form and refresh the sent-message log.

**Sent-message log (FR-011b)**
- Below compose: list from `admin_messages` newest-first. Each row shows: when (`created_at`), target ("All users" or the recipient email/name), title, a truncated body, and recipient count.
- Empty state: "No messages sent yet."

## Contact pane (US3 / FR-014/015/015a)

- List from `contact_messages` newest-first: sender (name/email), message text, submitted-at.
- Empty state: "No contact messages."
- Each item has a **Reply** action → opens a small compose (title optional, body required) → `admin_send_to_user(item.user_id, title, body)` (R9). On success toast "Reply sent." and the reply appears in the sent-message log. Reply is disabled while in-flight.

## Accounts pane (US5 / FR-017/018)

- List from `profiles` newest-first: name (`full_name`/first+last), country, degree, joined (`created_at`).
- Selecting a row reveals that user's **bookings** from `tickets` (eq `user_id`): scholarship title, institution, ranking tier, amount/currency, status, booked-at, cooldown-end.
- Read-only: no edit/delete/refund controls anywhere (FR-018). Empty states for "no accounts" and "no bookings for this user." Each booking also shows which **provider** funded it (`tickets.provider`, FR-037).

## Payments pane (US7/US8 / FR-029..038)

Three sections (see [payments-rpc.md](./payments-rpc.md)):

**Providers (US7)**
- Reads all rows: `payment_providers.select('*').order('sort_order')`.
- Each provider is a row with: an **enable/disable** toggle → `admin_set_provider_enabled(provider, enabled)`; editable **display name**, **currency**, **fx_rate** with a Save → `admin_set_provider_config(provider, display_name, currency, fx_rate)`.
- **No secret-key field exists** anywhere on this pane (FR-031); a short note says keys are configured server-side.
- Validation: `fx_rate > 0` (maps `bad_fx_rate`); toast on success; in-flight disable.

**Transactions ledger (US8 / FR-033)**
- `payments.select('*').order('created_at',{desc})`; columns: when, provider, payer (`user_id`), amount + currency, status (pending/paid/failed/cancelled), kind (ticket/space).
- Empty state "No payments yet." **Read-only** — no refund/cancel/edit controls anywhere (FR-035).

**Totals (US8 / FR-034)**
- `admin_payments_overview()` → per-provider paid count + paid sum (labelled with each provider's currency) and a grand "payments received" figure.

## Checkout provider picker (public pages — `ticket.js` / `account.js`, US6)

Not on `admin.html` — this is the user-facing half, on the existing ticket and "+1 space" flows (bilingual EN/AR + RTL, unlike the admin page).

1. When the user initiates a paid action, fetch enabled providers: `payment_providers.select('provider,display_name,currency,fx_rate,sort_order').eq('enabled',true).order('sort_order')`.
2. **No providers enabled** → show "Payments are temporarily unavailable." and no pay button (FR-027).
3. Otherwise show a **"choose how to pay"** step listing each enabled provider with the price in that provider's currency (`round(base_usd × fx_rate)`).
4. On pick → `POST {provider}-checkout` with `{ kind, scholarship_id? }` → redirect to the returned `url`.
5. **Result return page**: read the `payments` status (poll briefly). Pending → "Confirming your payment…"; paid → success + booking shown; failed/cancelled → "Payment not completed — you can try again," re-offering the picker (FR-040).
6. Booking is never shown as complete on the strength of the redirect alone — only once the ledger row is `paid` (FR-022).

## States, errors, accessibility

- Every pane has explicit **loading / empty / error** states. Errors use the client error-to-message map (see [admin-rpc.md](./admin-rpc.md)).
- Toasts reuse `BeaconAuth.toast` for consistency.
- Buttons show a disabled/in-flight state during any RPC to prevent double submission.
- Inputs are properly labelled; the dashboard is keyboard-navigable. LTR only (no RTL handling needed — English-only per clarification Q4).

## Out of scope (v1)

- No segment targeting (single + all only), no admin self-management (promote/demote), no role tiers, no destructive account/booking actions, no Realtime alerting, no paging/search — all per spec Assumptions.
- **Payments**: no refunds/cancellations/disputes from the dashboard (read-only oversight, FR-035); no in-dashboard secret-key entry (keys are server-side, FR-031); no live FX (owner-set `fx_rate`).
