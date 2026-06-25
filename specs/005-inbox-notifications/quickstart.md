# Quickstart: User Inbox & Notifications (feature 005)

Owner setup + acceptance checklist. Consistent with features 001–004: schema via the paste-ready `supabase-setup.sql`, one edge-function redeploy, manual + browser acceptance. Supabase MCP is read-only — schema and the webhook change are applied by the owner.

## Owner setup (one-time, gated steps)

1. **Apply schema** — open the Supabase SQL editor and paste the **entire** `supabase-setup.sql` (it is idempotent). This creates `notifications` + `contact_messages`, their RLS, the `notify_welcome` / `notify_contact` triggers, the `admin_broadcast()` helper, and adds `notifications` to the `supabase_realtime` publication. ([[sql-via-paste-ready-file]])
2. **Confirm Realtime** — in Database → Replication / Publications, verify `notifications` is part of `supabase_realtime` (the SQL adds it; just confirm).
3. **Redeploy `stripe-webhook`** — deploy the updated `supabase/functions/stripe-webhook/index.ts` (now also inserts the booking notification) **with JWT verification OFF** (feature-004 webhook gotcha — JWT-on returns 401 before the function runs). No other function changes.
4. **(Check) `ticket-checkout` metadata** — ensure the checkout session metadata includes `scholarship_title` so the booking message can name the scholarship; if missing, add it and redeploy `ticket-checkout`.
5. **Run advisors** — `get_advisors` (security + performance) after the schema change; expect clean (RLS on both new tables, no new warnings).

No new client keys or config: `supabase-config.js` is unchanged.

## Acceptance checklist (maps to spec Success Criteria)

> Use a real http(s) origin (Realtime + auth need it), not `file://`. Browser checks via the local Chromium/Node harness ([[browser-validation-setup]]); use the `msedge` channel.

- [ ] **US1 / SC-001** Signed-in, the nav **bell** is visible on index, scholarship, account, contact, faq pages; opening it shows the inbox within ~10s.
- [ ] **US1** Inbox lists messages newest-first; unread are visually distinct; **unread badge** matches actual unread count.
- [ ] **US1 / SC-004** Opening a message marks it read and the badge count drops by one; mark-unread restores it; delete removes it and recounts.
- [ ] **US1** With no messages, dropdown + account pane show the localized **empty state**, not an error.
- [ ] **US1 / FR-006** Signed-out: no bell; the inbox route prompts sign-in; no messages shown.
- [ ] **US2 / SC-002** Create a brand-new account → exactly **one** unread welcome message; signing out/in again creates **no duplicate**.
- [ ] **US3 / SC-003** Complete a successful test booking (card `4242 4242 4242 4242`) → exactly **one** unread booking-confirmation naming the scholarship + ticket code + availability. Cancel/abandon a checkout → **no** confirmation appears.
- [ ] **US3** Re-deliver the Stripe webhook event (Resend) → still only **one** booking message (idempotent).
- [ ] **US4** Signed-in, submit the contact form → an unread **acknowledgement** appears in the inbox; a stored row exists in `contact_messages`. Signed-out submit → on-page confirmation only, **no** inbox row.
- [ ] **US5 / SC-007** Insert a single `type='admin'` message for one user (manual SQL or future dashboard) → only that user sees it. Run `select admin_broadcast('Title','Body')` → every **existing** user gets it; a user created *after* the broadcast does **not**.
- [ ] **FR-013** Admin + system messages appear together, ordered by date, distinguishable by type/label.
- [ ] **SC-008 / FR-017** With the inbox open in tab A, trigger a message (booking webhook, or a broadcast) → it appears in tab A's badge/list within a few seconds **without refresh**.
- [ ] **SC-005 / FR-014** Cross-account isolation probe: user B never sees user A's messages, on both the initial query and the live Realtime channel.
- [ ] **FR-018** Set `beacon-lang` to `ar` → system messages (welcome/booking/contact) render in Arabic (RTL); admin messages render as authored. Switch back to `en` → same rows render in English.
- [ ] **FR-015** Delete a test account (existing `delete_account` flow) → that user's notifications and contact_messages are gone (cascade).

## Notes

- **No new edge function** — welcome/contact come from DB triggers, booking rides the existing webhook, owner messages use the admin RLS policy + `admin_broadcast()`.
- The `admin_broadcast()` helper and a manual single-row insert are the supported owner-send mechanisms **until** the admin dashboard (deferred) is built.
- Production reminder unrelated to this feature: feature-004's `COOLDOWN_MS` is still set to 2 min for testing — restore to 3 days before launch.
