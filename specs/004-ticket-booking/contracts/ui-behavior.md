# Contract: UI Behavior

Maps each user story / FR to concrete UI behavior. Vanilla HTML/CSS/JS; reuses `BeaconAuth` (auth.js).

## A. Book Ticket button — detail page (US1, FR-003/004/004a/005/006)

- **Placement**: `ticket.js` inserts a `#bookTicketArea` **between `#detailBody` and `#applyArea`** on `scholarship.html`.
- **Apply area change (FR-004a)**: `scholarship.js` `renderApplyArea()` no longer renders the outbound "Apply on official site" link/button. The apply area keeps only ticket-focused guidance and the optional "About the organization" blurb.
- **States**:
  - *Loading*: hidden until catalogue + auth resolve.
  - *Bookable*: button "Book Ticket" with a ticket glyph; shows the display price for this scholarship's tier (from `RANKING_INDEX`, e.g., "Book your ticket — $250") and a small "non-refundable" note.
  - *Anonymous click*: `BeaconAuth.requireAuth({ type: "route", href: location.href + "#book" })` opens the sign-in modal; after sign-in the page returns and auto-resumes the booking (FR-006).
  - *Already booked this scholarship* (FR-014b): button replaced by "Ticket booked ✓ — view in your account" linking to `account.html#ticket`.
  - *At capacity* (FR-014): button disabled with "You already have a ticket in progress. Wait for the cooldown to finish or add ticket space." + a link to buy +1 space.
- **Animation (FR-005)**: on a valid click → play ~1.8 s sequence: label words fall top→bottom; inline-SVG hand→hand→backpack(+laptop+book); label becomes **"Are You Ready!"**. `prefers-reduced-motion` jumps to the end state. On animation end, `fetch FUNCTIONS_BASE/ticket-checkout` with the access token and `window.location = url`. On `409` show the matching message (profile_incomplete → route to `account.html#profile`; already_booked / at_capacity → update button state).
- **Return**: `success_url` lands on `scholarship.html?id=…#ticket-booked` → show a toast "Payment received — your ticket is booking. See it in your account." (the row appears once the webhook fires; the page polls `tickets` briefly or links to the account).

## B. Account Ticket area (US2/US3, FR-012/014a/015/016/017)

- **Tab**: add `Ticket` to `account.html` tabs and a `#pane-ticket`; add `ticket` to the `TABS` array and router in `account.js`.
- **Active ticket (in cooldown)**: card with scholarship title, tier/price paid, and a **live countdown** to `cooldown_end` (updates each second; out of 3 days). The reveal details are masked ("Your ticket unlocks in 2d 04h 11m").
- **Revealed ticket** (`now() >= cooldown_end`): distinct ticket design showing `ticket_code`, full name, country/nationality, highest degree, field of interest, scholarship + institution, booking date (FR-016). Address/GPA/second nationality are **not** shown. Stays as a permanent record; frees its slot (FR-014a).
- **+1 space (FR-015)**: a "Add ticket space (+$99)" button → `fetch space-checkout` → redirect. After purchase (webhook bumps `ticket_capacity`), the area shows "Ticket space: N".
- **Empty**: "You haven't booked a ticket yet" with a link to browse.

## C. Nav account menu Ticket item (FR-013)

- `auth.js` `renderNav()` menu gains a **Ticket** entry linking to `account.html#ticket`.
- When the signed-in user has an **active** ticket (`cooldown_end > now()`), show a **cooldown progress ring** next to the item: a CSS conic/stroke ring whose fill = elapsed/total (0→100% over 3 days), animating while open. When no active ticket (none or all revealed), show a plain item / static ticket glyph. The nav fetches the user's most-recent active ticket once on auth change.

## D. Owner dashboard (US8, FR-018a/b/c)

- `admin.html` + `admin.js`: on load, check membership (`select 1 from admins where user_id = auth.uid()` — really enforced by RLS returning rows). Non-admins (or anonymous) see "Not authorized" and a link home.
- Admin view: a table of **all tickets** (admin RLS) — ticket_code, user (email/name), scholarship + institution, tier/price, booked_at, status (active/revealed) with remaining cooldown, payment intent. Sortable/filterable client-side; newest first. (Read-only management for MVP; "manage" = review + open Stripe/user.)
- Reachable from the nav menu only when the user is an admin.

## E. Create-account form (US4, FR-001/019/020/021/022)

- `auth.js` signup form (mode `signup`) expands to collect: **first name, last name, address, city, country, nationality, second nationality (optional), highest degree (select), GPA (optional), field of interest (optional), email, password, confirm password, agreement checkpoint (checkbox)**. Sign-in mode stays minimal (email + password).
- **Validation**: required fields non-empty; `password.length >= 8`; `password === confirm` (else inline error, FR-021); agreement checkbox checked (else blocked, FR-020).
- **On submit**: `signUp({ email, password })` (soft-verification unchanged); on success, immediately `upsert profiles` with the collected fields (`first_name`, `last_name`, composed `full_name`, `address`, `city`, `country`, `nationality`, `second_nationality`, `degree`, `gpa`, `field_of_interest`). The Supabase user id is the unique user ID (FR-001); surfaced on the account page and distinct from `ticket_code` (FR-002).

## F. Settings reset password + account-page cleanup (US5, FR-023/024)

- **Remove** `#acctGate` and `#acctReset` blocks from `account.html` (FR-024).
  - *Anonymous visitor*: `account.js` opens the sign-in modal (or shows a slim inline "Sign in to view your account" prompt) instead of the removed gate block.
  - *Password recovery (`#reset` / `PASSWORD_RECOVERY`)*: relocate the "choose a new password" form into the **Settings** pane (rendered in recovery mode), instead of the removed `#acctReset` block. `account.js` routes `PASSWORD_RECOVERY`/`#reset` to Settings.
- **Settings → Reset password (FR-023)**: a "Change password" form in Settings (new password + confirm) calling `auth.updateUser({ password })`, plus a "Send reset link to my email" action (`resetPasswordForEmail`). Account page renders correctly for signed-in / signed-out / recovery states (SC-010).

## G. Filter persistence (US6, FR-025/026)

- `index.js`: on every filter/search/sort change, write `state` to `localStorage["beacon.filters"]`. On load, read it (if present) **before** the first `render()`, apply to `state`, and reflect into the search input, chips, country select, sort select. `?q=` deep-link still overrides `q`. "Clear" wipes the stored filters too.

## H. For9a removal (US7, FR-027/028)

- Generated data (`scholarships.js`, `details/*.js`) is rebuilt with visible "For9a"/"فرصة" tokens removed (build-time scrub). `scholarship.js` section render keeps a light secondary sanitizer. After rebuild, a content scan across all pages/cards/detail bodies/footers shows **zero** visible occurrences (SC-009); RTL/punctuation stays intact (FR-028).

## Accessibility / degradation
- Animation respects `prefers-reduced-motion`.
- On `file://` or when the SDK/config is missing, the Book Ticket and ticket UIs show the same "serve over http" guidance the rest of the account UI uses; anonymous browsing/filtering still works.
