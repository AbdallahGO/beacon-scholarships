# Feature Specification: Scholarship Ticket Booking, Profiles & Catalogue Cleanup

**Feature Branch**: `004-ticket-booking`  
**Created**: 2026-06-13  
**Status**: Draft  
**Input**: User description: "Add a user ID and a paid 'ticket' booking flow that starts a direct action between the user and the site owner. On a scholarship detail page the user cannot apply directly — instead a 'Book Ticket' button (between the detail body and the apply area) plays a ticket animation, charges a ranking-based fee via Stripe, and starts a 3-day cooldown. The ticket appears in the account page and account nav-menu with a loading animation that runs for the cooldown; the user may hold only one ticket unless they buy extra ticket space (+1 service). After the cooldown the ticket is revealed with its own unique ID and the user's information in a distinctive design. Expand the create-account form (first/last name, address, city, country, nationality, optional second nationality, highest degree, optional GPA, optional field of interest, password + confirm password, agreement checkpoint). Add reset-password to the settings page and remove the acct-gate / acct-reset elements from the account page. Persist scholarship filters across navigation. Remove every visible 'For9a' / 'فرصة' word from all pages."

## Clarifications

### Session 2026-06-13

- Q: After a ticket's cooldown ends and it is revealed, does it keep occupying a capacity slot? → A: It frees the slot and remains visible as a permanent record; the user can book again at base capacity (1).
- Q: What happens to the existing "Apply on official site" external link in the detail apply area? → A: Remove it; the apply area becomes ticket-focused guidance only, so booking a ticket is the single path.
- Q: Which user information does a revealed ticket display? → A: Full name, country/nationality, highest degree, field of interest, the scholarship + institution, the unique ticket ID, and the booking date (no address, GPA, or second nationality).
- Q: Can a user book a second ticket for the same scholarship they already ticketed? → A: No — one ticket per scholarship per user (in cooldown or revealed); the button shows as already-booked for that scholarship.
- Q: How are refunds/chargebacks handled for a ticket payment? → A: Refunds are not offered; all ticket and +1-space payments are final/non-refundable, so there is no refund/void flow.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Book a ticket for a scholarship (Priority: P1)

A signed-in user is reading a scholarship they're interested in. Because applications aren't handled on the site, they press **Book Ticket** (shown between the detail body and the apply area). A short ticket animation plays — the button's words fall away top‑to‑bottom and a hand passes a ticket to a second hand that tucks it into a backpack alongside a laptop and a book — and the button settles on **"Are You Ready!"**. The user is taken to a secure payment step priced by the institution's ranking ($150–$300), pays, and a 3‑day cooldown begins. This is framed as the first step toward their exam, interview, and ultimately the scholarship.

**Why this priority**: This is the core monetized action and the entire reason the feature exists — it converts interest into a paid, tracked engagement between the user and the owner. Without it nothing else in the feature has purpose.

**Independent Test**: Sign in, open a scholarship detail page, confirm the Book Ticket button appears between the detail body and apply area, click it, observe the animation and label change, complete a (test-mode) payment, and confirm a single active ticket with a 3-day cooldown is created.

**Acceptance Scenarios**:

1. **Given** a signed-in user with no active ticket viewing a scholarship, **When** they click **Book Ticket**, **Then** the ticket animation plays, the label changes to "Are You Ready!", and they are directed to a payment step.
2. **Given** the user completes payment successfully, **When** they return to the site, **Then** exactly one active ticket exists, its 3‑day cooldown is counting down, and the booking is tied to that specific scholarship.
3. **Given** the user abandons or fails payment, **When** they return, **Then** no ticket is created, no cooldown starts, and the button returns to its bookable state.
4. **Given** an anonymous (signed-out) visitor on a detail page, **When** they click **Book Ticket**, **Then** they are prompted to sign in or create an account before any payment, and the intended booking resumes after they authenticate.
5. **Given** the institution's ranking tier, **When** the payment step opens, **Then** the fee shown matches the tier ($150 out-of-rank, $200 lowest, $250 medium, $300 high).

---

### User Story 2 - Track an active ticket and its cooldown (Priority: P1)

After booking, the user wants to see the status of their ticket. The account nav-menu shows a **Ticket** item with a loading/progress animation that begins at booking and completes when the 3‑day cooldown ends. The account page has a **Ticket** area showing the live countdown. When the cooldown finishes, the ticket is "revealed" — displayed in a distinctive design with its own unique ticket ID (different from the account/user ID) and the user's submitted information.

**Why this priority**: A paid action with a 3-day wait is meaningless to the user if they can't see its status; the reveal is the tangible deliverable they paid for.

**Independent Test**: With an active ticket, confirm the nav-menu Ticket item shows the running animation and the account Ticket area shows a countdown; fast-forward/end the cooldown and confirm the ticket is revealed with a unique ticket ID and the user's details.

**Acceptance Scenarios**:

1. **Given** an active ticket mid-cooldown, **When** the user opens any page, **Then** the account nav-menu shows a Ticket item with a loading animation reflecting the cooldown is in progress.
2. **Given** an active ticket, **When** the user opens the account page Ticket area, **Then** they see a live countdown of the remaining time (out of 3 days).
3. **Given** the cooldown has elapsed, **When** the user views the Ticket area, **Then** the loading animation completes and the ticket is revealed with a unique ticket ID (not equal to the account/user ID) plus the user's information, in the distinctive ticket design.
4. **Given** a revealed ticket, **When** the user views its ID, **Then** the ID is unique per ticket and stable (does not change on reload).

---

### User Story 3 - One ticket at a time, with paid extra space (Priority: P2)

The user's basic ticket capacity is **1**. While they hold an active (or revealed but still-occupying) ticket, they cannot book or add another. To hold more than one at a time, they purchase a **+1 ticket space** add-on; each purchase raises capacity by one slot.

**Why this priority**: This rule protects the owner's workflow and creates the upsell, but the product is usable for an MVP with just the single-ticket limit even before the +1 purchase path exists.

**Independent Test**: With one active ticket, attempt to book a second and confirm it is blocked with a clear explanation; purchase one +1 space and confirm a second concurrent booking becomes possible.

**Acceptance Scenarios**:

1. **Given** a user already holding a ticket and capacity of 1, **When** they try to Book Ticket again, **Then** the action is blocked and they are told they must wait for the cooldown to finish or buy extra ticket space.
2. **Given** a user at capacity, **When** they purchase a +1 ticket space, **Then** their capacity increases by one and they may immediately book one more ticket.
3. **Given** a user whose only ticket's cooldown has finished and which no longer occupies a slot, **When** they try to Book Ticket, **Then** they are allowed to book again within their capacity.

---

### User Story 4 - Richer account creation (Priority: P2)

A new user creating an account provides their identity and scholarship-relevant details: first name, last name, address, city, country, nationality, optional second nationality, highest degree, optional GPA, optional field of interest, and a password they confirm by typing twice, plus an agreement checkpoint they must accept. On success they receive a unique account/user ID.

**Why this priority**: The expanded profile feeds the ticket reveal (user information) and matching, and the user ID underpins the whole feature; but the existing minimal sign-up already lets people in, so this is an enhancement rather than a blocker.

**Independent Test**: Open the create-account form, confirm all listed fields are present (with the right ones marked optional), confirm password mismatch and an unchecked agreement both block submission, and confirm a successful submission creates an account with a unique user ID and stored profile.

**Acceptance Scenarios**:

1. **Given** the create-account form, **When** the user views it, **Then** it collects first name, last name, address, city, country, nationality, second nationality (optional), highest degree, GPA (optional), field of interest (optional), password, confirm password, and an agreement checkpoint.
2. **Given** the password and confirm-password fields differ, **When** the user submits, **Then** submission is blocked with a clear message.
3. **Given** the agreement checkpoint is unchecked, **When** the user submits, **Then** submission is blocked until it is accepted.
4. **Given** valid input, **When** the user submits, **Then** an account is created with a unique user ID and the profile data is saved to their account.

---

### User Story 5 - Reset password from settings; cleaner account page (Priority: P3)

A signed-in user can reset/change their password from the **Settings** area of their account. The standalone account-gate and account-reset blocks are removed from the account page.

**Why this priority**: Useful account hygiene and cleanup, but independent of the headline ticket flow.

**Independent Test**: From the account Settings tab, initiate a password reset and confirm the flow works; confirm the former acct-gate and acct-reset blocks no longer appear on the account page.

**Acceptance Scenarios**:

1. **Given** a signed-in user on the Settings tab, **When** they choose reset password and complete the flow, **Then** their password is updated and they can sign in with the new one.
2. **Given** the account page, **When** it is rendered for any visitor state, **Then** the previous acct-gate and acct-reset elements are absent.

---

### User Story 6 - Filters persist across navigation (Priority: P3)

A user filters the scholarship list (level, funding, country, search text, sort), opens a card to read it, then returns to the list — and finds their filters still applied rather than reset.

**Why this priority**: A real usability annoyance, but the catalogue is fully usable without persistence.

**Independent Test**: Apply several filters, open a scholarship, navigate back, and confirm the same filters and result set are restored.

**Acceptance Scenarios**:

1. **Given** a user has applied one or more filters/search/sort, **When** they open a scholarship and then return to the list, **Then** the same filters, search text, and sort are still applied and the same filtered results are shown.
2. **Given** a returning user, **When** they reopen the list later in the same browser, **Then** their last-used filters are restored.

---

### User Story 7 - Remove all "For9a" branding (Priority: P3)

Anywhere a user can see it, the word **"For9a"** (English) or **"فرصة"** (Arabic) must not appear on any page.

**Why this priority**: A branding/cleanliness requirement, independent of functionality.

**Independent Test**: Visit every user-facing page and view scholarship cards and detail content; confirm no visible "For9a" or "فرصة" text appears anywhere.

**Acceptance Scenarios**:

1. **Given** any page of the site, **When** a user views rendered content (cards, detail text, links shown as text, labels), **Then** no "For9a" or "فرصة" word is visible.
2. **Given** scholarship detail content that originally referenced the source brand, **When** it is displayed, **Then** the brand word is removed or replaced without breaking the surrounding text.

---

### User Story 8 - Owner is notified and manages tickets (Priority: P2)

When a user books a ticket, the site owner is notified and can see and manage that booking from an owner-only dashboard, so the owner can follow up with the user for the exam and interview steps.

**Why this priority**: This is the owner's half of the "action between user and me." It's essential to operating the service, but the user-facing booking/cooldown/reveal can be demonstrated independently before the dashboard exists.

**Independent Test**: Book a ticket as a user; confirm the owner receives a notification for it and that it appears in the owner-only dashboard with the user, scholarship, fee/tier, booking time, and status — and that a non-owner cannot open the dashboard or see others' tickets.

**Acceptance Scenarios**:

1. **Given** a user completes a booking, **When** the payment is confirmed, **Then** the owner receives a notification identifying the user, the scholarship, and the ticket.
2. **Given** the owner opens the dashboard, **When** it loads, **Then** every ticket is listed with user, scholarship, fee/tier paid, booking time, cooldown status, and ticket ID.
3. **Given** a regular (non-owner) signed-in user, **When** they attempt to reach the owner dashboard, **Then** access is denied and no other users' tickets are visible to them.

---

### Edge Cases

- **Payment succeeds but the user closes the tab before returning**: the ticket and cooldown must still be created from the confirmed payment, not lost.
- **Payment is duplicated / double-clicked**: only one ticket and one charge result per booking attempt.
- **User refunds/disputes or the charge is reversed**: payments are non-refundable and the product offers no refund flow; the user is told this before paying.
- **Clock/timezone differences**: the 3-day cooldown is measured from the confirmed booking time on the server side, not the device clock, so the countdown is consistent across devices.
- **User signs in on a second device mid-cooldown**: the same active ticket, countdown, and nav animation appear there too.
- **Anonymous user on `file://`**: account/ticket features require being served over http(s) and signed in; the page degrades gracefully (consistent with existing account behavior).
- **A scholarship with no known ranking**: it must still be bookable at a defined default price tier.
- **Capacity edge**: a user who bought +1 space then lets all cooldowns finish — capacity stays increased for future bookings.
- **Removing the brand word**: replacement must not leave dangling punctuation, empty links, or broken Arabic right-to-left text.

## Requirements *(mandatory)*

### Functional Requirements

#### User identity
- **FR-001**: Each account MUST have a unique user ID, assigned at account creation and visible to the user on their account page.
- **FR-002**: The user ID MUST be distinct in value and format from the ticket ID (FR-016) so the two are never confused.

#### Booking a ticket
- **FR-003**: The system MUST present a **Book Ticket** action on the scholarship detail page, positioned between the element containing the detail body and the element containing the apply area.
- **FR-004**: The site MUST NOT offer a direct "apply" submission for scholarships; the Book Ticket flow is the user's path forward, framed as the first step toward an exam, interview, and the scholarship.
- **FR-004a**: The existing outbound "Apply on official site" link/button MUST be removed from the detail apply area; the apply area MUST present only ticket-focused guidance (an optional "About the organization" blurb may remain), making Book Ticket the single path forward.
- **FR-005**: When the user activates Book Ticket, the system MUST play a ticket animation in which the button's text disappears with the words moving from top to bottom, and a ticket motif moves from a left hand to a right hand and into a backpack containing items such as a laptop and a book; the button label MUST change to "Are You Ready!".
- **FR-006**: An anonymous visitor who activates Book Ticket MUST be prompted to sign in or create an account first, and the booking intent MUST resume after successful authentication.
- **FR-007**: Booking a ticket MUST require a successful payment before the ticket is created and the cooldown starts; payment MUST be processed through Stripe.
- **FR-007a**: All payments (ticket booking fees and +1 ticket-space add-ons) MUST be treated as final and non-refundable; the system does NOT provide a refund flow, and the user MUST be informed that the purchase is non-refundable before paying.
- **FR-008**: The booking fee MUST be determined by the institution's ranking tier: out-of-rank = $150, lowest rank = $200, medium rank = $250, high rank = $300. The tier MUST be derived from a recognized world-ranking source: top-band institutions = high ($300), mid-band = medium ($250), lower ranked-but-listed = lowest ($200), and any institution not present on the ranking list = out-of-rank ($150).
- **FR-009**: On confirmed payment the system MUST create exactly one ticket for the user, tied to the specific scholarship, and start a cooldown lasting exactly 3 days from the confirmed booking time.
- **FR-010**: The system MUST ensure a single booking attempt results in at most one ticket and one charge, even on duplicate submissions or page reloads.
- **FR-011**: The cooldown duration MUST be measured server-side from the confirmed booking time so the countdown is consistent across devices and resistant to local clock changes.

#### Ticket status, capacity & reveal
- **FR-012**: The account page MUST include a Ticket area that shows each ticket and, while in cooldown, a live countdown of remaining time out of 3 days.
- **FR-013**: The account nav-menu MUST include a Ticket item that shows a loading/progress animation which starts when a ticket is booked and completes when that ticket's cooldown ends.
- **FR-014**: A user's default ticket capacity MUST be 1; while they hold a ticket that is still in cooldown (occupying a slot), the system MUST prevent booking or adding another ticket and MUST explain that they must wait for the cooldown or buy extra space.
- **FR-014a**: A ticket whose cooldown has ended (revealed) MUST free its slot — it stays visible in the account as a permanent record but no longer counts against capacity, so the user may book another ticket within base capacity (1).
- **FR-014b**: A user MUST be limited to one ticket per scholarship (whether in cooldown or revealed); the Book Ticket action for a scholarship the user has already ticketed MUST show an already-booked state instead of allowing a duplicate booking.
- **FR-015**: The system MUST offer a paid **+1 ticket space** add-on; each successful purchase MUST **permanently** increase the user's concurrent-ticket capacity by one slot (capacity never decreases afterward), allowing an additional concurrent booking.
- **FR-015a**: Every ticket booking MUST be charged its own ranking-based fee ($150–$300) regardless of available capacity; the +1 space add-on only unlocks a slot and does NOT include or waive a ticket's booking fee. Booking a ticket is the required paid step that unlocks the user's path to the exam and interview.
- **FR-016**: When a ticket's cooldown finishes, the system MUST reveal the ticket in a distinctive design showing: its own unique ticket ID (not equal to the account/user ID), the user's full name, country/nationality, highest degree, field of interest, the scholarship and its institution, and the booking date. Sensitive profile details (address, GPA, second nationality) MUST NOT appear on the revealed ticket.
- **FR-017**: A revealed ticket's ID MUST be unique across all tickets and stable across reloads and devices.

#### Owner-side action
- **FR-018**: A booked ticket MUST represent a tracked action between the user and the site owner, recorded so the owner can act on it (reach out for the exam/interview step).
- **FR-018a**: The owner MUST be notified of each new confirmed booking (e.g., via email or an equivalent alert) including enough context to identify the user, the scholarship, and the ticket.
- **FR-018b**: The owner MUST have an owner-only dashboard that lists all tickets with their key details (user, scholarship, fee/tier paid, booking time, cooldown status active/revealed, ticket ID) and lets the owner review and manage them.
- **FR-018c**: The owner dashboard MUST be accessible only to the owner (owner-only access control); regular users MUST NOT be able to reach it or see other users' tickets.

#### Account creation & profile
- **FR-019**: The create-account form MUST collect: first name, last name, address, city, country, nationality, second nationality (optional), highest degree, GPA (optional), field of interest (optional), password, and confirm password.
- **FR-020**: The create-account form MUST include an agreement "checkpoint" that the user must accept before the account can be created.
- **FR-021**: The system MUST block account creation when password and confirm-password do not match, with a clear message.
- **FR-022**: On successful account creation, the system MUST persist the profile fields to the user's account and make them available to the ticket reveal (FR-016) and existing profile/matching features.

#### Settings & account page cleanup
- **FR-023**: The account Settings area MUST allow a signed-in user to reset/change their password.
- **FR-024**: The account page MUST no longer display the account-gate block (`acctGate` / "acc-gate") or the account-reset block (`acctReset` / "acc-reset").

#### Filter persistence
- **FR-025**: The scholarship list MUST persist the user's active filters (level, funding, country, search text, and sort) so that returning to the list after viewing a scholarship restores the same filters and result set.
- **FR-026**: Restored filters MUST also apply when the user reopens the list later in the same browser.

#### Brand removal
- **FR-027**: The word "For9a" (English) and "فرصة" (Arabic) MUST NOT be visible to users on any page, including scholarship cards and detail content.
- **FR-028**: Where brand text is removed from displayed content, the surrounding text, links, and right-to-left formatting MUST remain intact and free of dangling punctuation or empty links.

### Key Entities *(include if feature involves data)*

- **User / Account**: A registered person. Key attributes: unique user ID, identity (first/last name, address, city, country, nationality, optional second nationality), academic info (highest degree, optional GPA, optional field of interest), credentials, ticket capacity (default 1).
- **Ticket**: A booked engagement tied to one user and one scholarship. Key attributes: unique ticket ID (distinct from user ID), associated scholarship, booking timestamp, cooldown end (booking + 3 days), status (active/in-cooldown → revealed; revealed tickets no longer occupy a slot), the fee paid and its ranking tier, and a snapshot of the reveal information (full name, country/nationality, highest degree, field of interest, scholarship + institution, booking date).
- **Ticket Space / Capacity**: The number of concurrent ticket slots a user holds; starts at 1 and increases by one per purchased +1 space add-on.
- **Payment**: A Stripe transaction for either a ticket booking (ranking-priced $150–$300) or a +1 ticket-space add-on; outcome (succeeded/failed) gates ticket creation or capacity increase.
- **Scholarship**: An existing catalogue item; gains an associated ranking tier used to price its ticket.
- **Filter State**: The user's last-used list filters (level, funding, country, search text, sort) retained across navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can go from a scholarship detail page to a confirmed, paid booking with an active 3-day cooldown in under 2 minutes.
- **SC-002**: 100% of confirmed payments result in exactly one ticket with a correctly running cooldown, and 0% of failed/abandoned payments create a ticket.
- **SC-003**: The displayed booking fee matches the scholarship's ranking tier in 100% of cases ($150/$200/$250/$300).
- **SC-004**: A user holding a ticket at capacity is prevented from creating a second ticket 100% of the time until the cooldown ends or extra space is purchased.
- **SC-005**: After the 3-day cooldown, the ticket is revealed with a unique ticket ID that is never duplicated across tickets and never equal to any account/user ID.
- **SC-006**: The cooldown remaining time shown on a second device differs from the first by no more than a few seconds (server-anchored).
- **SC-007**: Account creation rejects 100% of mismatched-password and unaccepted-agreement submissions and succeeds for valid input, assigning a unique user ID each time.
- **SC-008**: After applying filters and viewing a scholarship, returning to the list restores the exact prior filter/search/sort state in 100% of attempts.
- **SC-009**: A full crawl of all user-facing pages and rendered scholarship content finds zero visible occurrences of "For9a" or "فرصة".
- **SC-010**: The account page renders correctly for signed-in, signed-out, and password-recovery states without the removed acct-gate / acct-reset blocks.
- **SC-011**: 100% of confirmed bookings produce an owner notification and appear in the owner dashboard; 0% of the owner dashboard is reachable by non-owner accounts.

## Assumptions

- The feature builds on the existing Beacon static multi-page site and its already-live account system (feature 003: Supabase Auth/Postgres/Storage, shared `auth.js`, `account.html` tabs). Persistence and identity reuse that backend; "user ID" maps to the account's existing unique identifier surfaced to the user.
- All payments use Stripe in test mode during development; the booking fee is charged at booking time and the +1 space is a separate purchase.
- The 3-day cooldown is exactly 72 hours from the server-confirmed booking time.
- The detail-page DOM ids referenced by the user as "detal-body"/"applyArea" correspond to the existing `detailBody` and `applyArea` containers; the Book Ticket action is inserted between them.
- The animation is inspired by the project's `Scene.gif` but reinterpreted so the words travel top-to-bottom; exact visual styling is a design detail and the spec only fixes the described beats (hand → hand → backpack with laptop/book) and the final "Are You Ready!" label.
- "Ettimad"/"Etimad" in the request is interpreted as "depends on" — the fee depends on (is determined by) the institution's ranking tier.
- The ranking source is a recognized world university ranking (e.g., QS / Times Higher Education). The exact numeric band thresholds that split high/medium/lowest are a configurable mapping to be finalized during planning; the confirmed rule is high→$300, medium→$250, lowest(ranked)→$200, not-listed→$150. Institutions in the catalogue are matched to the ranking by name/country.
- The "+1 ticket space" add-on has its own price set by the owner; it is separate from and additional to the per-ticket booking fee. Each ticket booking is always charged $150–$300; extra slots are permanent.
- The owner is identified as a designated owner account; the owner dashboard and notifications are gated to that account only. The notification channel (e.g., email) is an implementation detail to be chosen during planning.
- Removing "For9a"/"فرصة" targets *user-visible* text only; underlying source data URLs (e.g., `for9a.com` links never shown as visible brand text) are out of scope unless they surface as visible words.
- Payments are final and non-refundable; the product intentionally has no refund flow.
- Email verification remains "soft" as in feature 003; this feature does not change verification rules.

## Dependencies

- Existing account/auth backend (feature 003) for identity, sessions, and profile storage.
- Stripe account and keys for processing booking and add-on payments, with server-side confirmation of payment before ticket creation.
- A recognized world-ranking dataset to map each institution to its tier (FR-008).
- A notification channel for owner alerts and an owner-only access mechanism for the dashboard (FR-018a/b/c).
