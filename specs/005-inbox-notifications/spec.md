# Feature Specification: User Inbox & Notifications

**Feature Branch**: `005-inbox-notifications`  
**Created**: 2026-06-25  
**Status**: Draft  
**Input**: User description: "i need to add inbox that notifay users when they do any actions like Congratulate for creat account or booking tiecket or they contact to us sending a massage and they can recieve any massage from me when i use a dashbord that we will make it later"

## Clarifications

### Session 2026-06-25

- Q: When an owner broadcast ("to all users") is sent, do users who register later also receive it? → A: No — broadcast is a point-in-time fan-out delivering one copy to each user existing at send time; new users do not receive prior broadcasts.
- Q: While a user is on the site, do new messages appear in real time or only on refresh/open? → A: Real time — a new message and the unread count update live (via a persistent connection) without a manual refresh.
- Q: On the bilingual (English/Arabic) site, what language should system-generated messages and inbox UI use? → A: Localized to each user's language preference — system message content and inbox labels render in the user's chosen language.
- Q: How do users reach the inbox and see new-message alerts? → A: A global notification indicator (bell + unread badge) in the site nav on every page, which opens the inbox.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read my inbox (Priority: P1)

A signed-in user opens their inbox and sees a list of messages addressed to them — newest first — each showing a title, a short preview, and a date. Unread messages are visually distinct, and a notification indicator (bell + unread badge) in the site navigation shows the count on every page so the user knows when something new has arrived. Opening a message shows its full content and marks it as read, which clears it from the unread count.

**Why this priority**: The inbox surface is the foundation everything else depends on. Without a place to read messages, no notification or admin message has anywhere to land. On its own it already delivers value the moment a single message exists, making it the minimum viable slice.

**Independent Test**: Seed one message for a test user, sign in, and confirm the inbox lists it, shows an unread indicator and count, displays full content on open, and that opening it clears the unread state and count.

**Acceptance Scenarios**:

1. **Given** a signed-in user with two unread messages, **When** they open the inbox, **Then** both messages appear newest-first, each marked unread, and the unread count shows "2".
2. **Given** a signed-in user viewing an unread message, **When** they open it, **Then** its full content is shown and it becomes marked as read, reducing the unread count by one.
3. **Given** a signed-in user with no messages, **When** they open the inbox, **Then** they see a friendly empty state rather than an error or blank screen.
4. **Given** a signed-out visitor, **When** they attempt to reach the inbox, **Then** they are prompted to sign in and no messages are shown.

---

### User Story 2 - Welcome message on account creation (Priority: P2)

When a person creates a new account, a congratulatory welcome message is automatically placed in their inbox so their first sign-in already contains a friendly greeting and a next-step nudge (e.g., complete your profile, browse scholarships).

**Why this priority**: It is the first notification every user receives and showcases the inbox immediately after sign-up, but it depends on the inbox surface (US1) existing first.

**Independent Test**: Create a brand-new account, open the inbox, and confirm exactly one unread welcome message is present with appropriate greeting content.

**Acceptance Scenarios**:

1. **Given** a newly created account, **When** the user first opens their inbox, **Then** a single unread welcome/congratulations message is present.
2. **Given** an existing account that already received a welcome message, **When** the user signs in again later, **Then** no duplicate welcome message is created.

---

### User Story 3 - Booking confirmation in inbox (Priority: P2)

When a user successfully books a ticket, a confirmation message is automatically added to their inbox summarizing the booking (e.g., scholarship name, ticket code, and when it becomes available), giving the user a durable record they can return to.

**Why this priority**: Booking is the core paid action of the product; a persistent confirmation reduces confusion and support requests. It depends on the inbox (US1) and on the existing booking flow.

**Independent Test**: Complete a successful booking for a test user and confirm an unread booking-confirmation message appears in their inbox referencing that booking's details.

**Acceptance Scenarios**:

1. **Given** a user who has just completed a successful ticket booking, **When** they open their inbox, **Then** an unread confirmation message referencing that booking is present.
2. **Given** a booking that was not completed (cancelled or payment failed), **When** the user opens their inbox, **Then** no booking-confirmation message is created for it.
3. **Given** a single completed booking, **When** the confirmation is generated, **Then** exactly one confirmation message exists for that booking (no duplicates on retries).

---

### User Story 4 - Contact message acknowledgement (Priority: P3)

When a signed-in user sends a message through the contact form, an acknowledgement is automatically added to their inbox confirming the message was received, so the user has reassurance and a record that their outreach went through.

**Why this priority**: It improves trust in the contact channel but is the least critical of the automatic notifications and depends on the inbox surface.

**Independent Test**: Submit the contact form as a signed-in user and confirm an unread acknowledgement message appears in their inbox.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they submit the contact form, **Then** an unread acknowledgement message appears in their inbox.
2. **Given** a signed-out visitor, **When** they submit the contact form, **Then** they receive an on-page confirmation but no inbox message is created (they have no inbox).

---

### User Story 5 - Receive messages sent by the admin (Priority: P3)

The system supports placing a personal or broadcast message from the site owner into a user's inbox, so that messages composed later from an admin dashboard are delivered to and readable by the targeted user(s) exactly like any other inbox message.

**Why this priority**: It is the user's stated long-term goal ("receive any message from me when I use a dashboard"), but the admin authoring dashboard itself is explicitly deferred. This story delivers the receiving half so the future dashboard has a working delivery target.

**Independent Test**: Insert an admin-authored message for a specific user (and separately a broadcast to all users) using the supported mechanism, then confirm each targeted user sees it as an unread inbox message.

**Acceptance Scenarios**:

1. **Given** an admin-authored message targeted at one user, **When** that user opens their inbox, **Then** the message appears as unread and only that user receives it.
2. **Given** an admin-authored broadcast sent at a point in time, **When** a user who existed at send time opens their inbox, **Then** the broadcast appears; a user who registered after the broadcast was sent does not receive it.
3. **Given** an admin message and a system notification in the same inbox, **When** the user views the list, **Then** both are shown together, ordered by date, and are individually distinguishable by type.

---

### Edge Cases

- What happens when many messages accumulate? The inbox remains usable (e.g., newest-first ordering and reasonable list length / paging) without slowing noticeably.
- How does the system handle a user opening the same message in two tabs? Read state converges to "read" without errors.
- What happens if a notification-generating action partially fails (e.g., booking succeeds but message creation is delayed)? The user's primary action still succeeds; the message appears once the system catches up, and is never duplicated.
- How are messages isolated between users? A user can only ever see messages addressed to them; no message leaks across accounts.
- What happens to a user's messages if they delete their account? Their messages are removed along with the account.
- Can a user remove clutter? A user can mark messages read/unread and delete messages from their own inbox.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide each signed-in user a personal inbox listing messages addressed to them, ordered newest-first.
- **FR-002**: System MUST visually distinguish unread from read messages and display a count of unread messages.
- **FR-002a**: System MUST present a global notification indicator (a bell with an unread-count badge) in the site navigation on every main page for signed-in users, which opens the inbox.
- **FR-003**: System MUST mark a message as read when the user opens it, and update the unread count accordingly.
- **FR-004**: Users MUST be able to manually mark messages as read or unread and delete messages from their own inbox.
- **FR-005**: System MUST show a friendly empty state when a user has no messages.
- **FR-006**: System MUST restrict inbox access to authenticated users and ensure a user can only see messages addressed to them.
- **FR-007**: System MUST automatically create a one-time welcome/congratulations message in a user's inbox when their account is created, without creating duplicates on subsequent sign-ins.
- **FR-008**: System MUST automatically create a booking-confirmation message in the booking user's inbox when a ticket booking completes successfully, referencing that booking's key details (e.g., scholarship name, ticket code, availability time).
- **FR-009**: System MUST NOT create a booking-confirmation message for bookings that are cancelled or fail, and MUST create at most one confirmation per completed booking even if the completion is retried.
- **FR-010**: System MUST automatically create an acknowledgement message in a signed-in user's inbox when they submit the contact form; anonymous submissions receive on-page confirmation only.
- **FR-011**: System MUST support delivering an owner-authored message into either a single targeted user's inbox or to all users (broadcast), so a future admin dashboard can use this delivery mechanism. A broadcast is a point-in-time fan-out: it delivers one copy to each user that exists at send time and does NOT reach users who register afterward.
- **FR-012**: System MUST record, for each message, at minimum a title, body, message type/category, recipient, creation timestamp, and read state.
- **FR-013**: System MUST allow system notifications and owner-authored messages to coexist in the same inbox, visually distinguishable by type and unified in ordering.
- **FR-014**: System MUST prevent one user's actions or messages from affecting or being visible in another user's inbox.
- **FR-015**: System MUST remove a user's messages when their account is deleted.
- **FR-016**: System MUST keep the user's primary action (account creation, booking, contact submission) successful even if its associated message cannot be created immediately, and avoid creating duplicate messages when catching up.
- **FR-017**: System MUST update a signed-in user's inbox and unread count in real time — a newly arriving message appears without the user manually refreshing or reopening the page.
- **FR-018**: System MUST render system-generated message content (welcome, booking confirmation, contact acknowledgement) and inbox UI labels in the user's preferred language (English or Arabic), with layout direction matching that language. Owner-authored messages are shown in the language the owner wrote them.

### Key Entities *(include if feature involves data)*

- **Message**: A single item in a user's inbox. Key attributes: recipient (the owning user), type/category (e.g., welcome, booking confirmation, contact acknowledgement, admin message), title, body content, optional reference/link to a related item (e.g., a booking), creation timestamp, read/unread state. Belongs to exactly one user.
- **Inbox**: The per-user collection of Messages addressed to that user, together with derived state such as the unread count. Conceptually one inbox per user account.
- **Message type/category**: A classification that distinguishes automatic system notifications from owner-authored messages and drives how each is labeled or styled.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in user can locate and open their inbox from any main page within 10 seconds via the global nav notification indicator, which also shows the current unread count.
- **SC-002**: 100% of newly created accounts have exactly one welcome message in their inbox at first sign-in (no missing, no duplicates).
- **SC-003**: 100% of successfully completed bookings produce exactly one booking-confirmation message; 0% of cancelled/failed bookings produce one.
- **SC-004**: The unread count shown in the account area matches the actual number of unread messages 100% of the time after opening, marking, or deleting a message.
- **SC-005**: In testing, no user can view a message addressed to another user (0 cross-account leaks across isolation probes).
- **SC-006**: Opening the inbox and reading a message feels immediate — the list and message content appear without a perceptible wait under normal use.
- **SC-008**: A message that arrives while the user is on a page (e.g., a booking confirmation or an owner message) appears in their inbox and unread count within a few seconds, with no manual refresh.
- **SC-007**: An owner-authored message (single or broadcast) inserted via the supported delivery mechanism is visible to its intended recipient(s) and to no one else, 100% of the time.

## Assumptions

- **Channel**: "Inbox" means an in-app message center within the user's account area; email or push delivery is out of scope for this feature (the product already sends transactional emails separately).
- **Admin dashboard deferred**: The user explicitly stated the sending dashboard will be built later. This feature delivers the user-facing inbox, the automatic system notifications, and the delivery mechanism for owner-authored messages — but not an admin authoring/compose UI. Until that dashboard exists, owner messages are inserted through the supported back-end mechanism.
- **Reuses existing systems**: The feature builds on the existing user accounts (Feature 003) and ticket-booking (Feature 004) flows; account creation, booking completion, and contact submission are the existing trigger points.
- **Anonymous contact**: The existing contact form may be used by signed-out visitors; those submissions get on-page confirmation only, since there is no inbox to write to without an account.
- **Welcome content**: The welcome message is a friendly congratulations plus a light next-step nudge; exact copy will be finalized during design.
- **Localization source**: Per-user language preference (English/Arabic) drives system message and inbox-label localization. If the existing account system does not already store a language preference, one will be derived from the user's current site language selection; localized copy for system messages is maintained as templates per language rather than translated on the fly.
- **Retention**: Messages persist until the user deletes them or their account is deleted; no automatic expiry in this version.
- **Volume**: Per-user message volume is expected to be modest (tens, not thousands); large-scale paging/search is not required for v1.

## Dependencies

- Existing authenticated user accounts and profile/account area (Feature 003).
- Existing ticket-booking completion flow as the trigger for booking confirmations (Feature 004).
- Existing contact form as the trigger for contact acknowledgements.
- A future admin dashboard (out of scope here) will consume the owner-message delivery mechanism defined by this feature.
