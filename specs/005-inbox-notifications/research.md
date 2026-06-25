# Phase 0 Research: User Inbox & Notifications

Feature: `005-inbox-notifications` · Date: 2026-06-25

All four spec clarifications (broadcast = point-in-time fan-out; real-time updates; per-user EN/AR localization; global nav bell entry point) are already resolved in `spec.md`. The decisions below resolve the remaining technical unknowns for implementation. No open `NEEDS CLARIFICATION` items remain.

---

## R1 — Delivery channel: Supabase Realtime vs polling

**Decision**: Use **Supabase Realtime Postgres Changes** on the `notifications` table, subscribed client-side with a filter on `user_id = <auth uid>`. `inbox.js` opens one channel per signed-in session and updates the nav badge and any open inbox view on INSERT/UPDATE/DELETE.

**Rationale**: FR-017/SC-008 require live updates with no manual refresh. supabase-js v2 (already loaded site-wide) ships Realtime; no new dependency. Realtime **respects RLS** for `authenticated` subscribers, so a user only receives change events for their own rows — the same isolation guarantee as the read path. Initial unread count + list still come from a normal `select` on load; Realtime only carries deltas.

**Alternatives considered**: (a) Refresh-on-load only — rejected, fails FR-017. (b) setInterval polling of the count — rejected: wasteful, laggy, and still needs a query per tick; Realtime is simpler and instant. (c) Browser push notifications — out of scope (in-app channel only per Assumptions).

**Owner step**: `notifications` must be in the `supabase_realtime` publication (added by `supabase-setup.sql`); confirm Realtime is enabled for the table in the dashboard.

---

## R2 — Write-trust model: no client inserts

**Decision**: `notifications` has **own select / own update / own delete** policies but **no INSERT policy for users**. Rows are created only by: (1) SECURITY DEFINER DB triggers (welcome, contact), (2) the service-role `stripe-webhook` (booking), (3) an **admin-scoped INSERT policy** + `admin_broadcast()` helper (owner messages).

**Rationale**: If users could insert their own notifications they could fabricate "booking confirmations" or spoof admin messages in their own inbox — misleading and undermines trust. Restricting creation to trusted paths keeps message provenance authoritative while still letting users mark-read/delete their own rows (own update/delete). This mirrors feature 004, where only the webhook (service role) may write `tickets`.

**Alternatives considered**: A permissive "own insert" policy scoped by a `type='contact'` check — rejected as fragile (a user could still craft arbitrary payloads/titles) and unnecessary once triggers exist.

---

## R3 — Localization: type + payload templates vs stored literal text

**Decision**: System messages store a `type` and a structured `payload` (jsonb) **instead of** literal localized text. `inbox.js` holds an `I18N` map (`en` / `ar`) of title/body templates keyed by `type`, and renders each notification in the **viewer's** current language using the existing `beacon-lang` localStorage preference (default `en`). Owner/admin messages store literal `title`/`body` and render as-authored.

**Rationale**: FR-018 wants system messages in the user's language; templating means the *same* row renders EN or AR depending on the viewer and never needs translating at write time. It also keeps the trigger/webhook write paths language-agnostic (they only know `type` + facts). `beacon-lang` is the established preference (set by the scholarship-detail language toggle, `scholarship.js`), so no new preference store is required. Arabic messages get `dir="rtl"` on the rendered text.

**Alternatives considered**: (a) Store fully-rendered text per message — rejected: locks language at write time, can't follow a user who switches languages, and would force triggers/webhook to know locale. (b) Store both EN+AR strings per row — rejected as redundant for templated system copy. Owner messages legitimately need literal storage (free-form), hence the hybrid.

---

## R4 — Welcome message creation: AFTER INSERT ON profiles trigger

**Decision**: A SECURITY DEFINER function `notify_welcome()` fired by `AFTER INSERT ON public.profiles` inserts one `type='welcome'` notification with `dedupe_key='welcome'`.

**Rationale**: A `profiles` row is created exactly once, at signup (auth.js upserts it after `signUp`), so the trigger is naturally one-time and server-side — no reliance on a client insert that could be skipped or duplicated. The partial unique index on `(user_id, dedupe_key)` makes it idempotent even if a profile row were ever re-created. FR-007 ("no duplicates on subsequent sign-ins") holds because sign-in never re-inserts a profile.

**Alternatives considered**: (a) Client insert right after `signUp` — rejected: skippable (social sign-in paths), and needs a client insert policy (see R2). (b) Trigger on `auth.users` — rejected: writing triggers in the `auth` schema is more invasive and harder to keep idempotent than `public.profiles`.

**Edge note**: If a future sign-in path created an account without a `profiles` row, the welcome would not fire; current signup always upserts a profile, so this is covered. Documented as an assumption.

---

## R5 — Booking confirmation: inside the existing stripe-webhook

**Decision**: Extend the `kind="ticket"` branch of `supabase/functions/stripe-webhook/index.ts` so that, right after the idempotent `tickets` insert, it inserts a `type='booking'` notification (service role) with `dedupe_key = 'booking:' + session.id` and `payload = { scholarship_title, ticket_code, available_at }`.

**Rationale**: The webhook is already the single trusted writer of a ticket and is already idempotent on the Stripe session id; co-locating the confirmation there guarantees FR-008 (created on success) and FR-009 (exactly one, none on failed/abandoned payment) for free, with **no new edge function** and no extra owner deploy beyond redeploying this one function. The notification's own `dedupe_key` adds a second idempotency guard if the webhook is re-delivered.

**Alternatives considered**: (a) A DB trigger on `tickets` insert — viable, but keeps the payload assembly (scholarship title) in SQL where it is more awkward than in the webhook that already has the metadata; either works, webhook chosen for payload richness and locality. (b) Client insert on return from Stripe — rejected: not trusted, racy with the webhook, violates R2.

**Owner step**: redeploy `stripe-webhook` with **JWT verification OFF** (feature-004 webhook gotcha — JWT-on returns 401 before the function runs).

---

## R6 — Contact acknowledgement: contact_messages table + trigger

**Decision**: Add `public.contact_messages` (own insert / own select for the author, admin select-all). When a **signed-in** user submits the contact form, the page inserts a row here; an `AFTER INSERT ON contact_messages` SECURITY DEFINER trigger `notify_contact()` creates the `type='contact'` ack notification. Anonymous submissions keep the current mailto/on-page-confirmation behavior and create no inbox row (FR-010).

**Rationale**: The contact form currently has no backend (it opens a Gmail compose window). Persisting signed-in submissions (a) gives the trusted server-side path for the ack (R2), and (b) gives the future admin dashboard an actual record of contact messages to display — directly serving the user's stated end goal ("messages from me… when I use a dashboard"). Anonymous users have no account/inbox, so on-page confirmation is the correct terminal state.

**Alternatives considered**: (a) Insert the ack from the client — rejected per R2. (b) A new `contact` edge function — rejected: adds an owner deploy and a moving part when a table + trigger suffices. (c) Keep mailto for everyone and skip persistence — rejected: leaves no server path for the ack and nothing for the future dashboard.

---

## R7 — Admin/broadcast delivery (point-in-time fan-out)

**Decision**: Add an **admin-scoped INSERT policy** on `notifications` (insert allowed when the caller is in `public.admins`) so a future dashboard, acting as the authenticated owner, can deliver a `type='admin'` message to any single `user_id`. For broadcasts, add `admin_broadcast(p_title text, p_body text)` — a SECURITY DEFINER function that (after verifying the caller is an admin) inserts **one row per existing `profiles` user**. New users who register later receive nothing (Q1 point-in-time decision, FR-011).

**Rationale**: Delivers the "receiving" half now while the authoring dashboard is deferred. Per-recipient rows keep unread counts, per-user delete, and isolation trivial (R1/R2) and match the broadcast-snapshot semantics chosen in clarification. The owner can also invoke `admin_broadcast()` or insert single rows manually via the SQL editor today, before any dashboard exists — that is the "supported delivery mechanism" US5 requires.

**Alternatives considered**: (a) A shared `broadcasts` table joined at read time so future users also see past announcements — rejected by the Q1 clarification (point-in-time only) and it complicates unread/delete semantics. (b) Service-role-only admin sends — rejected: a browser dashboard can't safely hold the service key; an admin-scoped RLS policy lets the owner's normal authenticated session send.

---

## R8 — Entry point & surfaces

**Decision**: `inbox.js` (loaded on every nav page, after `auth.js`) injects a **bell button with an unread-count badge** next to `#navAccount` for signed-in users (hidden when signed out). Clicking opens a **quick-view dropdown** (recent messages, open→read, "View all" link). The **account page** gains a full **Inbox tab/pane** (`#inbox` / `#pane-inbox`) for the complete list with mark read/unread and delete. Both surfaces share `inbox.js` rendering + localization.

**Rationale**: A global bell satisfies SC-001 ("open from any main page within 10s") and pairs with the real-time badge (R1). The dropdown gives instant reading without navigation; the account pane provides full management, consistent with the existing tab pattern (`#profile`/`#ticket`/`#saved`/`#history`/`#settings`).

**Alternatives considered**: (a) Bell links straight to `account.html#inbox` with no dropdown — simpler but a worse "from any page" experience and an extra navigation just to read one line. (b) Account-pane only, no nav bell — rejected by the Q4 clarification (global indicator).

---

## R9 — Idempotency & dedupe

**Decision**: Add a nullable `dedupe_key text` column and a **partial unique index** `(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`. Welcome uses `'welcome'`; booking uses `'booking:'+session.id`; contact acks and admin messages leave it NULL (duplicates are meaningful/allowed there).

**Rationale**: Gives FR-007 (one welcome) and FR-009 (one booking confirmation per completed booking, safe under webhook re-delivery) a single declarative guard, while still allowing a user to receive many contact acks or admin messages.

---

## R10 — Account-deletion cleanup

**Decision**: `notifications.user_id` and `contact_messages.user_id` are `uuid not null references auth.users(id) ON DELETE CASCADE`, matching the existing feature-003/004 tables.

**Rationale**: FR-015 — when the `delete_account` flow removes the auth user, both the user's notifications and their contact messages are removed automatically, with no extra cleanup code.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---------|------------|
| Live updates mechanism | Supabase Realtime postgres_changes, RLS-filtered (R1) |
| Who may create notifications | Triggers + webhook + admin RLS only; no client insert (R2) |
| How EN/AR localization works | type+payload templates rendered from `beacon-lang` (R3) |
| Welcome creation point | AFTER INSERT ON profiles trigger, dedupe 'welcome' (R4) |
| Booking creation point | existing stripe-webhook, dedupe 'booking:'+session (R5) |
| Contact ack creation point | contact_messages table + trigger; anon stays mailto (R6) |
| Owner single + broadcast delivery | admin RLS insert + admin_broadcast() fan-out (R7) |
| Inbox UI surfaces | nav bell+badge dropdown + account Inbox pane (R8) |
| Duplicate prevention | partial unique (user_id, dedupe_key) (R9) |
| Delete-account cleanup | ON DELETE CASCADE on user_id (R10) |
