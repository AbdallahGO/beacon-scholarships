# Feature Specification: Admin Dashboard & Multi-Provider Payments

**Feature Branch**: `006-admin-dashboard`  
**Created**: 2026-06-25  
**Status**: Draft  
**Input**: User description: "building dashborde for only admins users" + extension: "add Payment Gateway — multiple providers (PayPal, Paymob, Kashier) alongside the existing Stripe checkout, chosen by the user, managed and monitored from the admin dashboard."

## Overview

Feature 006 has two coherent parts, both built inside this feature:

1. **Admin dashboard** (US1–US5): an admin-only area to send messages, review contact submissions, see at-a-glance counts, and review accounts/bookings — the deferred compose surface from feature 005 plus read-only oversight.
2. **Multi-provider payments** (US6–US8): expand the site's paid flows (feature 004) from Stripe-only to **four providers** — Stripe (existing) + **PayPal**, **Paymob**, **Kashier** — so the site reaches users worldwide. This covers **both** paid flows: booking a ticket ($150–$300) and the "+1 ticket space" purchase (~$99), both priced in **USD** as the base. Users pick a provider at checkout; admins enable/disable and configure providers and monitor all payments (read-only) from a new dashboard **Payments** tab.

## Clarifications

### Session 2026-06-25

- Q: Should admins keep a record of what they sent (sent-message history/audit)? → A: Yes — keep a dedicated sent-message log (title, body, target, recipient count, timestamp) reviewable by admins; it survives recipients deleting their own copies and is the source for the overview "messages sent" count.
- Q: Can an admin reply to a contact submission from the dashboard? → A: Yes — a "reply" action on a submission pre-targets that user and delivers the reply to their inbox (reuses the single-user send); the reply is also recorded in the sent-message log.
- Q: Does message targeting need subset/segment options in v1? → A: No — v1 supports only "one user" (by email) and "all users" (broadcast); segment targeting (e.g., by booking status or degree) is deferred to a later feature.
- Q: What language is the admin dashboard interface? → A: English-only for v1 (admin audience is the owner + a few designees); recipient-facing messages and the public site stay bilingual EN/AR.
- Q: Does "all users" for a broadcast mean every account, or only users who completed a profile? → A: Every registered account (all auth users), regardless of whether they have a completed profile — so no account is silently excluded from a broadcast.
- Q: Is there a maximum message length? → A: Yes — title ≤ 200 characters, body ≤ 5000 characters; longer content is rejected with a clear message, never silently truncated.

### Session 2026-06-25 (multi-provider payments)

- Q: Which payment providers, and why? → A: Add PayPal, Paymob, and Kashier alongside the existing Stripe checkout (four total) to cover users worldwide instead of only Stripe-supported card-holders.
- Q: How does a user end up on a given provider at checkout? → A: The user picks the provider **manually** from the providers that are currently **enabled**.
- Q: What does the admin control per provider, and where do secret keys live? → A: The admin **enables/disables** each provider and edits **non-secret** config (display name, currency, fixed conversion rate); **secret API keys live only in the server's secret store** — never in the database or browser. Payment oversight is **read-only** (no refunds).
- Q: How is pricing handled across providers with different currencies? → A: **Per-provider currency** with a **fixed conversion the owner sets** — provider charge = base ticket price × `fx_rate`, in that provider's currency (1.0 for same-currency providers; e.g. 50.0 for USD→EGP). Existing per-tier pricing is untouched; the amount is computed server-side, never set by the client.
- Q: When is a ticket considered paid? → A: Only after the chosen provider's payment is **verified server-side via that provider's webhook**; the post-payment redirect is never treated as proof of payment.
- Q: Are refunds/disputes in scope? → A: No — refunds/disputes are **out of scope** (read-only oversight) for this version.
- Q: What is the base currency the fixed conversion (`fx_rate`) is applied to? → A: **USD** — existing ticket prices ($150–$300) and the +1 space purchase (~$99) are priced in USD; `fx_rate` converts that base into each provider's currency.
- Q: Which paid flows do the new providers cover — ticket booking only, or also the "+1 ticket space" purchase? → A: **Both** paid flows (ticket booking and the +1 space purchase) gain multi-provider checkout, so there is no Stripe-only dead end.
- Q: How should the system handle a user starting checkout twice (e.g., two providers) for the same ticket? → A: **Prevent double payment** — once a ticket/space is booked, or a payment is `pending`, for that user+item, further payment attempts for the same item are rejected at the server.
- Q: After a failed/cancelled/abandoned payment, what can the user do? → A: **Retry, including with a different enabled provider** — each attempt is its own ledger entry; the item is still booked at most once.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin-only access to the dashboard (Priority: P1)

The site owner (and any teammate the owner has designated as an admin) signs in with their normal account and reaches a dedicated dashboard area that ordinary users never see. Anyone who is not an admin — whether signed out or signed in as a regular user — is denied entry and shown nothing of the admin tools or data.

**Why this priority**: Access control is the foundation of the whole feature. Without a reliable admin-only gate, every other capability (sending messages, reading private contact submissions, reviewing accounts) would leak privileged data to ordinary users. This story alone delivers value: a trustworthy, locked admin area the owner can build on.

**Independent Test**: Sign in as a designated admin and confirm the dashboard opens; then sign in as a regular user (and visit while signed out) and confirm the dashboard is inaccessible and exposes no admin data or actions.

**Acceptance Scenarios**:

1. **Given** a signed-in user who is a designated admin, **When** they open the dashboard, **Then** the admin tools and data are shown.
2. **Given** a signed-in user who is NOT an admin, **When** they navigate to the dashboard location, **Then** they are denied access and shown a clear "not authorized" state with no admin data or controls.
3. **Given** a signed-out visitor, **When** they navigate to the dashboard location, **Then** they are prompted to sign in and, unless they are an admin, cannot reach any admin functionality.
4. **Given** a non-admin who attempts an admin action directly (bypassing the interface), **When** the action is processed, **Then** it is rejected.

---

### User Story 2 - Send messages to users (single or broadcast) (Priority: P1)

An admin composes a message (a title and a body) and sends it either to one specific user (identified by their email) or to every existing user at once. The message lands in each recipient's in-app inbox. This is the authoring/compose capability that was deliberately deferred when the inbox feature was built ("the dashboard we will make later").

**Why this priority**: This is the concrete reason the dashboard was requested — the inbox delivery mechanism already exists, but there has been no way for the owner to actually write and send a message. It turns the inbox from a system-only channel into a real owner-to-user communication tool.

**Independent Test**: As an admin, send a broadcast and confirm it appears in multiple test users' inboxes; send a single message to one user's email and confirm only that user receives it.

**Acceptance Scenarios**:

1. **Given** an admin on the dashboard, **When** they compose a title and body and choose "send to all users" and confirm, **Then** the message is delivered to every existing user's inbox and the admin sees how many recipients it reached.
2. **Given** an admin on the dashboard, **When** they enter a recipient's email, compose a message, and send, **Then** only that user receives it in their inbox.
3. **Given** an admin composing a message, **When** the body is empty, **Then** the system prevents sending and explains what is missing.
4. **Given** an admin about to send to all users, **When** they trigger the send, **Then** they must pass an explicit confirmation step before the broadcast goes out.
5. **Given** a delivered admin message, **When** a recipient opens their inbox, **Then** they see the exact title and body the admin wrote.

---

### User Story 3 - Review contact-form submissions (Priority: P2)

An admin opens a list of messages that signed-in users have submitted through the site's contact form, newest first, so the owner can read and follow up on them in one place instead of relying only on email.

**Why this priority**: Signed-in contact submissions are already recorded but, until now, there has been no in-product place for the owner to read them. It is valuable but secondary to access control and outbound messaging.

**Independent Test**: Submit a contact-form message as a signed-in user, then open the dashboard as an admin and confirm the submission appears with its sender, content, and time.

**Acceptance Scenarios**:

1. **Given** contact submissions exist, **When** an admin opens the contact view, **Then** they see each submission's sender identity, message text, and submission time, ordered newest first.
2. **Given** no contact submissions exist, **When** an admin opens the contact view, **Then** they see a clear empty state.
3. **Given** an admin reading a contact submission, **When** they use the "reply" action and send a response, **Then** the reply is delivered to that user's inbox and recorded in the sent-message log.

---

### User Story 4 - At-a-glance overview (Priority: P3)

When an admin opens the dashboard, they see a small set of headline numbers — such as how many users are registered, how many tickets have been booked, and the total number of contact submissions — so they can gauge the state of the site at a glance.

**Why this priority**: Useful situational awareness, but not required for the dashboard to be valuable. It complements the actionable stories above.

**Independent Test**: Open the dashboard as an admin and confirm the displayed counts match the actual totals in the system.

**Acceptance Scenarios**:

1. **Given** an admin opens the dashboard, **When** the overview loads, **Then** it shows current totals (registered users, tickets booked, contact submissions, messages sent) that match the underlying data.

---

### User Story 5 - Review accounts and their bookings (Priority: P3)

An admin browses the list of registered accounts and, for any account, can see that user's ticket-booking activity, giving the owner support context (for example, when a user asks about a booking).

**Why this priority**: Helpful for support and oversight, but read-only and the least urgent of the set.

**Independent Test**: As an admin, open the accounts view and confirm registered users are listed and that selecting one shows that user's bookings.

**Acceptance Scenarios**:

1. **Given** registered users exist, **When** an admin opens the accounts view, **Then** the users are listed.
2. **Given** a selected user who has booked tickets, **When** the admin views that user, **Then** that user's bookings are shown.

---

### User Story 6 - Choose a payment provider at checkout (Priority: P1)

When a user pays for a ticket, they are offered the payment providers that are currently enabled (Stripe, PayPal, Paymob, Kashier) and pick the one they prefer. They are taken to that provider to pay, and the ticket is confirmed only once the provider verifies the payment.

**Why this priority**: The whole reason for the payments work — relying on Stripe alone excludes users who can't pay through it (no supported card, region, or method). Offering multiple providers is what unlocks worldwide reach, so it is the headline payment capability.

**Independent Test**: With at least two providers enabled, start a ticket purchase, choose each provider in turn, complete a sandbox payment, and confirm the ticket appears only after the provider confirms — and never from the return redirect alone.

**Acceptance Scenarios**:

1. **Given** more than one provider is enabled, **When** a user begins a ticket purchase, **Then** they see a "choose how to pay" step listing each enabled provider with the price shown in that provider's currency.
2. **Given** a user selects a provider and completes payment, **When** that provider confirms the payment to the system, **Then** the ticket is booked and recorded as funded by that provider.
3. **Given** a user is returned to the site after paying, **When** the provider has not yet confirmed the payment, **Then** the ticket is NOT treated as paid on the strength of the redirect alone.
4. **Given** a provider is disabled, **When** a user reaches checkout, **Then** that provider is not offered.
5. **Given** no providers are enabled, **When** a user reaches checkout, **Then** they see a clear "payments temporarily unavailable" state instead of a broken flow.

---

### User Story 7 - Enable/disable and configure payment providers (Priority: P2)

An admin uses the dashboard's Payments tab to turn each provider on or off and to edit each provider's non-secret settings (display name, currency, and the fixed conversion rate). Secret API keys are never entered or shown here — they live only in the server's secret store.

**Why this priority**: Control over which providers are live, and their pricing/currency, is what makes the multi-provider checkout safe to operate — but it depends on the checkout (US6) existing first.

**Independent Test**: As an admin, disable a provider and confirm it disappears from checkout; change a provider's currency/conversion and confirm the next checkout charges the recomputed amount; confirm no field ever asks for or reveals a secret key.

**Acceptance Scenarios**:

1. **Given** an admin on the Payments tab, **When** they toggle a provider off, **Then** that provider stops appearing at checkout for new payments.
2. **Given** an admin on the Payments tab, **When** they edit a provider's display name, currency, or conversion rate and save, **Then** subsequent checkouts reflect the new settings.
3. **Given** an admin on the Payments tab, **When** they view provider configuration, **Then** no secret API key is displayed or editable there.
4. **Given** a non-admin, **When** they attempt to toggle or configure a provider by any means, **Then** the action is rejected at the server.

---

### User Story 8 - Monitor payments across providers (Priority: P2)

An admin opens the Payments tab and sees a single ledger of every payment across all four providers, newest first, plus per-provider totals — so the owner can reconcile revenue and spot failed or pending payments in one place. The view is read-only.

**Why this priority**: Oversight of money is important for trust and reconciliation, but it is observation only and depends on payments actually flowing (US6).

**Independent Test**: After completing sandbox payments through different providers, open the Payments tab and confirm each transaction appears with its provider, user, amount/currency, status, and time, and that per-provider totals match.

**Acceptance Scenarios**:

1. **Given** payments exist across providers, **When** an admin opens the Payments tab, **Then** they see each payment's provider, payer, amount and currency, status, and time, ordered newest first.
2. **Given** payments exist, **When** an admin views the totals, **Then** they see the count and summed amount of completed (paid) payments per provider.
3. **Given** an admin viewing the payments ledger, **When** they look for ways to change a payment, **Then** there are none — the view is strictly read-only (no refund, cancel, or edit).
4. **Given** a non-admin, **When** they attempt to read the payments ledger by any means, **Then** they are denied.

---

### Edge Cases

- **Broadcast with zero users**: Sending to "all users" when there are no eligible recipients completes safely and reports zero recipients reached.
- **Recipient account deleted after delivery**: When a user account is removed, their copies of admin messages are removed with it; the admin's send record/count is unaffected.
- **Admin status revoked mid-session**: A user who is removed from the admin registry loses access on their next admin action even if their dashboard is still open.
- **Unknown recipient email** for a single send: The system reports that no matching user was found instead of silently doing nothing.
- **Accidental double-send**: Triggering a broadcast twice in quick succession does not multiply the message in each inbox beyond the intended one delivery per send.
- **Very long message body**: Content exceeding the limit (title 200 / body 5000 characters) is rejected with a clear message — never truncated silently (FR-009a).
- **Direct action by a non-admin**: An attempt to perform a send or read privileged data without admin rights is rejected by the system, not merely hidden in the interface.
- **Provider disabled mid-checkout**: If a provider is disabled after a user has started but before they pay, the payment attempt is rejected rather than completing through a now-disabled provider.
- **Duplicate/replayed payment confirmation**: A provider's confirmation that arrives more than once (retry or replay) results in exactly one booked ticket and one ledger entry — never duplicates (idempotent on the provider's payment reference).
- **Abandoned payment**: A user who starts a payment and never completes it leaves a `pending` ledger entry and no ticket; nothing is charged-as-booked. The user may retry later, including with a different enabled provider (a new ledger entry); the item is still booked at most once.
- **Double-start across providers**: A user who starts checkout for the same item through two providers (or two sessions) cannot end up charged/booked twice — once one payment is `pending` or the item is booked, the other attempt is rejected (FR-039).
- **Forged confirmation**: A confirmation that fails the provider's signature verification is ignored — it cannot fake or force a booking.
- **No providers enabled**: With every provider disabled, checkout shows "payments temporarily unavailable" rather than offering a broken or empty payment step.
- **Non-admin touches payments**: An attempt by a non-admin to toggle/configure a provider or read the payments ledger is rejected by the system, not merely hidden.

## Requirements *(mandatory)*

### Functional Requirements

**Access & authorization**

- **FR-001**: System MUST restrict the entire admin dashboard to users designated as admins; all non-admin users (signed-in or anonymous) MUST be denied access.
- **FR-002**: System MUST enforce admin authorization on every admin action at the trusted/server layer, so that hiding controls in the interface is not the only protection and a non-admin cannot perform an admin action by other means.
- **FR-003**: System MUST present a clear "not authorized" state to non-admins who reach the dashboard location, exposing no admin data or controls.
- **FR-004**: System MUST require an authenticated admin session for all dashboard functionality (the dashboard is unavailable to anonymous visitors and outside a real signed-in session).

**Outbound messaging**

- **FR-005**: Admins MUST be able to compose a message consisting of a title and a body.
- **FR-006**: Admins MUST be able to send a composed message to every existing user at once (broadcast), delivered to each user's in-app inbox. "Every existing user" means **every registered account**, including accounts that have not completed a profile — no account is silently excluded.
- **FR-007**: Admins MUST be able to send a composed message to a single specific user identified by their email address.
- **FR-008**: System MUST deliver admin-sent messages to recipients' inboxes showing the exact title and body the admin entered (literal content, not transformed).
- **FR-009**: System MUST prevent sending a message with an empty body and explain what is required.
- **FR-009a**: System MUST enforce a maximum message length (title ≤ 200 characters, body ≤ 5000 characters) and reject longer content with a clear message rather than truncating it silently.
- **FR-010**: System MUST require an explicit confirmation step before a broadcast to all users is sent.
- **FR-011**: System MUST report to the admin how many recipients a broadcast reached.
- **FR-011a**: System MUST record every admin send (single or broadcast) in a sent-message log capturing the title, body, target (single recipient or "all users"), recipient count, and time sent; this log MUST persist independently of recipients' inbox copies (it is not lost when a recipient deletes their message).
- **FR-011b**: Admins MUST be able to review the sent-message log, newest first.
- **FR-012**: System MUST report when a single-send recipient email does not match any existing user, rather than silently completing.
- **FR-013**: A broadcast MUST target the set of existing registered accounts at the moment of sending (point-in-time); users created afterward MUST NOT retroactively receive it.

**Contact submissions**

- **FR-014**: Admins MUST be able to view all signed-in users' contact-form submissions, ordered newest first, each showing sender identity, message text, and submission time.
- **FR-015**: System MUST show a clear empty state when there are no contact submissions.
- **FR-015a**: Admins MUST be able to reply to a contact submission from the dashboard; the reply is delivered to that submitter's inbox (reusing single-user send) and recorded in the sent-message log (FR-011a).

**Overview & review**

- **FR-016**: System MUST show admins an at-a-glance overview of current totals, including at least registered users, tickets booked, and contact submissions.
- **FR-017**: Admins MUST be able to view the list of registered accounts and, for a selected account, that user's ticket-booking activity (read-only).

**Boundaries**

- **FR-018**: The dashboard MUST be read-only with respect to user accounts and bookings in this version — it MUST NOT delete accounts, cancel or refund bookings, or edit users' personal data.

**Multi-provider payments — checkout (user-facing)**

- **FR-019**: System MUST support four payment providers — Stripe (existing), PayPal, Paymob, and Kashier — for **both** paid flows (booking a ticket and the "+1 ticket space" purchase), and MUST let the user **manually choose** among the providers that are currently **enabled**.
- **FR-020**: System MUST present only **enabled** providers at checkout; a disabled provider MUST NOT be offered.
- **FR-021**: System MUST compute the amount charged **server-side** as the base price (in **USD** — the ticket tier price or the +1 space price) × the chosen provider's **fixed conversion rate (`fx_rate`)**, expressed in that provider's currency; the client MUST NOT be able to set or alter the amount. Existing per-tier ticket pricing MUST remain unchanged.
- **FR-022**: System MUST confirm a ticket booking **only after** the chosen provider verifies the payment server-side (provider webhook); the post-payment return/redirect MUST NOT be treated as proof of payment.
- **FR-023**: System MUST record every payment attempt in a **payments ledger** capturing provider, amount, currency, status, the provider's payment reference, the paying user, and timestamps; status MUST progress `pending → paid | failed | cancelled`.
- **FR-024**: System MUST be **idempotent** on each provider's payment reference, so a repeated or replayed confirmation cannot create duplicate ticket bookings or duplicate ledger entries.
- **FR-025**: System MUST keep an abandoned/incomplete payment as `pending` and MUST NOT create a ticket for it.
- **FR-026**: System MUST reject a checkout attempt for a provider that has been **disabled**, even if the user began before it was disabled.
- **FR-027**: When **no** providers are enabled, checkout MUST present a clear "payments temporarily unavailable" state rather than a broken or empty payment step.
- **FR-028**: System MUST ignore any provider confirmation that fails the provider's **signature verification** (a forged confirmation cannot create a booking).
- **FR-039**: System MUST prevent **double payment for the same item**: once a ticket (or +1 space) is booked, or a payment for it is `pending`, for that user+item, the system MUST reject further payment attempts for the same item — so a user cannot be charged/booked twice by starting checkout through two providers (or two sessions). This guard is enforced server-side, independent of any per-provider idempotency.
- **FR-040**: After a `failed`, `cancelled`, or abandoned payment, the user MUST be able to **retry** — including choosing a **different enabled provider**; each attempt is its own ledger entry and the item MUST still be booked at most once.

**Multi-provider payments — admin management**

- **FR-029**: Admins MUST be able to **enable or disable** each payment provider from the dashboard; the change applies to new checkouts.
- **FR-030**: Admins MUST be able to edit each provider's **non-secret** configuration — display name, currency, and fixed conversion rate; subsequent checkouts MUST reflect the change.
- **FR-031**: Provider **secret API keys** MUST reside only in the server's secret store; they MUST NEVER be entered, stored, or displayed in the dashboard or database, and MUST NEVER be sent to the browser.
- **FR-032**: System MUST enforce all provider enable/disable and configuration changes at the trusted/server layer; a non-admin MUST NOT be able to toggle or configure a provider by any means.

**Multi-provider payments — admin monitoring**

- **FR-033**: Admins MUST be able to view the **cross-provider payments ledger**, newest first, each entry showing provider, paying user, amount and currency, status, and time.
- **FR-034**: Admins MUST be able to see **per-provider totals** — the count and summed amount of completed (`paid`) payments.
- **FR-035**: The payments oversight MUST be **read-only** — admins MUST NOT refund, cancel, or edit payments in this version (consistent with FR-018).
- **FR-036**: The payments ledger MUST NOT be writable by clients — only the trusted server-side payment functions may write it; admins may read it and non-admins MUST be denied.
- **FR-037**: The Accounts → bookings view (FR-017) MUST show **which provider funded** each ticket.
- **FR-038**: The at-a-glance overview (FR-016) MUST additionally show **total payments received** (the summed amount of completed payments).

### Key Entities *(include if feature involves data)*

- **Admin**: A registered user designated with elevated privileges; admin status determines who may access the dashboard and perform admin actions. Designated by the owner.
- **Admin Message**: An admin-authored message (title + body) delivered to one user or to all users, appearing in recipients' in-app inboxes as owner/admin messages.
- **Sent-Message Log Entry**: A persistent record of one admin send — title, body, target (single recipient or "all users"), recipient count, and time sent — retained independently of recipients' inbox copies; the source for the overview "messages sent" count and the admin's send history.
- **Contact Submission**: A message submitted by a signed-in user via the contact form, with sender identity, content, and timestamp; reviewable only by admins.
- **User Account**: A registered user record (basic profile/identity) that admins may review for oversight and support.
- **Ticket Booking**: A user's booking record that admins may review (read-only) to support users and gauge activity. Now also records **which payment provider funded it** and links to its payment ledger entry.
- **Payment Provider**: A configurable payment option (Stripe, PayPal, Paymob, Kashier) with an enabled flag, a display name, a currency, a fixed conversion rate (`fx_rate`), and a sort order. Holds **no secret keys**. The public site may read only **enabled** providers (to offer them at checkout); admins read all and change them only through trusted server-side actions.
- **Payment**: A ledger entry for one payment attempt — the paying user, the provider, **what is being paid for** (a ticket booking or a +1 space purchase), the amount and currency (in the provider's currency), the status (`pending → paid | failed | cancelled`), the provider's payment reference (used to prevent duplicates), the resulting ticket/space once confirmed, and timestamps. Multiple attempts may exist for the same item over time (retries), but at most one results in a booking (FR-039/FR-040). Written only by trusted server-side payment functions; readable by admins, never by ordinary users; never client-writable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of non-admin access attempts (signed-out or regular users) are denied, exposing zero admin data or actions.
- **SC-002**: An admin can compose and send a broadcast to all users in under 2 minutes from opening the dashboard.
- **SC-003**: An admin-sent message appears in every targeted recipient's inbox within a few seconds of sending.
- **SC-004**: An admin can locate and read any contact submission within 3 interactions (e.g., open dashboard → open contact view → open the item).
- **SC-005**: Overview totals match the actual underlying counts at the time the dashboard is viewed.
- **SC-006**: Zero accidental mass-sends — every broadcast requires an explicit confirmation before delivery.
- **SC-007**: A non-admin attempting an admin action directly (outside the interface) succeeds 0% of the time.
- **SC-008**: With two or more providers enabled, a user can choose any enabled provider and complete a ticket payment end-to-end; the ticket appears only after server-side confirmation.
- **SC-009**: 100% of confirmed ticket bookings correspond to a server-verified (webhook) payment — a return/redirect alone never produces a confirmed ticket.
- **SC-010**: A repeated or replayed provider confirmation yields exactly one confirmed ticket and one ledger entry (0 duplicates).
- **SC-011**: Disabling a provider removes it from checkout for all new payments, and enabling one makes it available, taking effect within seconds.
- **SC-012**: An admin can see every payment across all four providers in one ledger, newest first, with per-provider paid totals that match the underlying data.
- **SC-013**: 0% of payment provider secret keys are exposed to the browser or stored in the database.
- **SC-014**: A non-admin attempting to toggle/configure a provider or read the payments ledger succeeds 0% of the time.
- **SC-015**: A user who attempts to pay for the same item through two providers/sessions ends up charged-and-booked at most once (0 double bookings), and can still retry after a failed/abandoned attempt.

## Assumptions

- **Admin designation is manual**: Admins are appointed by the owner directly in the system's admin registry; self-service promotion/demotion of admins from within the dashboard is out of scope for this version.
- **Builds on existing systems**: The dashboard reuses the existing account/sign-in system and the existing in-app inbox delivery and trusted-send mechanisms; no new sign-in method, payment channel, or email channel is introduced.
- **Environment**: The dashboard requires the site served over http(s) and an authenticated admin session, consistent with the rest of the account area; it is not available offline / on the local-file fallback.
- **Literal admin content**: Admin-authored message titles/bodies are shown to recipients exactly as written and are not auto-translated; system-generated messages keep their existing localization behavior.
- **English-only admin interface**: The dashboard's own interface is English-only for this version (the admin audience is the owner plus a few designees); the public site and recipient-facing messages remain bilingual EN/AR with RTL.
- **Point-in-time broadcast**: "Send to all users" reaches the users that exist at send time only (consistent with the established inbox broadcast behavior).
- **Read-only oversight**: Reviewing accounts, bookings, and contact submissions is read-only; destructive or corrective actions (deleting accounts, refunding/cancelling tickets, editing personal data) are deferred to a later feature.
- **Scale**: Designed for the site's current low-thousands user base and tens of contact submissions; large-scale search, paging, and analytics beyond simple totals are out of scope for this version.
- **Single owner-led use**: The expected admin population is the owner plus a small number of trusted designees, not a large admin team with differentiated roles (role tiers are out of scope for this version).
- **No segment targeting**: Sends target either one user (by email) or all users; targeting a filtered subset/segment (e.g., by booking status or degree level) is out of scope for this version.
- **Payments build on the existing Stripe checkout**: The current Stripe ticket checkout continues to work; PayPal, Paymob, and Kashier are added alongside it, and Stripe is brought into the same payments ledger. No existing payment behaviour is removed.
- **Owner sets pricing/conversion**: The base currency and each provider's fixed conversion rate (`fx_rate`) and currency are configured by the owner/admin; the system does not fetch live exchange rates.
- **Provider credentials are owner-managed secrets**: Each provider's API keys and sandbox/live credentials, and the exact webhook signature scheme per provider, are provided/configured by the owner in the server's secret store and confirmed during planning; they are out of the dashboard's scope.
- **Read-only payment oversight**: Refunds, chargebacks/disputes, and partial captures are out of scope for this version; the dashboard observes payments but does not act on them.
- **Provider availability**: Whether a given provider can charge a user depends on that provider's own coverage and the user's account/method; the system offers the enabled providers and lets the user choose, but does not guarantee any single provider works for every user.
