# Contract: UI Behavior

Covers the nav bell + badge, the quick-view dropdown, the account Inbox pane, localization, and empty/RTL/anonymous states. All vanilla HTML/CSS/JS, loaded via `<script>` tags, mirroring the feature-003/004 module pattern.

---

## 1. Shared module `inbox.js` (loaded on every nav page, after `auth.js`)

Loaded on: `index.html`, `scholarship.html`, `account.html`, `contact.html`, `faq.html`, `how-to-apply.html`, `writing-your-essay.html` (every page that renders the nav). Degrades silently if `BeaconAuth`/Supabase didn't load or on `file://`.

Responsibilities:
1. **Inject the nav bell** next to `#navAccount` for signed-in users only (hidden when signed out). Bell shows an unread-count **badge** (`''` when 0; `N`; `9+` when >9). FR-002a.
2. On sign-in (`BeaconAuth.onChange`): fetch unread count + recent rows, render badge, **open a Realtime channel** (notifications-api.md). On sign-out: clear badge, remove channel, close dropdown.
3. **Quick-view dropdown** on bell click: recent messages (e.g. last 10), each row = type icon/label + localized title + relative time + unread dot. Clicking a row marks it read (FR-003), renders its body inline or follows `ref`. Footer "View all" → `account.html#inbox`. "Mark all read" action.
4. Apply Realtime deltas in place: INSERT → prepend + bump badge; UPDATE → restyle read/unread + recount; DELETE → remove + recount.
5. Expose a tiny API (e.g. `window.BeaconInbox = { render, localize }`) so `account.js` reuses the same row-rendering + localization for the full pane.

---

## 2. Account Inbox pane (`account.html` + `account.js`)

- `account.html`: add a tab `<a href="#inbox" data-tab="inbox">Inbox</a>` in `#acctTabs` (after Profile, before/after Ticket) and a `<section class="acct-pane" id="pane-inbox"></section>`.
- `account.js`: render the full list (up to 50, newest-first), unread visually distinct, per-row actions: **open→read**, **mark read/unread toggle**, **delete**. A header shows the unread count and a **Mark all read** button. **Empty state** when no rows: friendly message (FR-005), localized.
- Tab activation reuses the existing `data-tab`/`acct-pane` switching already used by `#profile`/`#ticket`/`#saved`/`#history`/`#settings`.

---

## 3. Localization (FR-018, R3)

`inbox.js` holds `I18N = { en: {…}, ar: {…} }` keyed by `type`; pick language from `localStorage['beacon-lang'] || 'en'` (the existing scholarship-detail toggle key).

| type | EN (title — body) | AR (title — body) |
|------|-------------------|-------------------|
| `welcome` | "Welcome to Beacon! 🎉" — "Your account is ready. Complete your profile to get matched with scholarships." | "مرحبًا بك في Beacon! 🎉" — "تم إنشاء حسابك. أكمل ملفك للحصول على منح مناسبة." |
| `booking` | "Ticket booked ✅" — "Your ticket for {scholarship_title} is confirmed. Code {ticket_code}. Available {available_at}." | "تم حجز التذكرة ✅" — "تم تأكيد تذكرتك لـ {scholarship_title}. الرمز {ticket_code}. متاحة {available_at}." |
| `contact` | "Message received 📨" — "Thanks for reaching out — we've received your message and will reply soon." | "تم استلام رسالتك 📨" — "شكرًا لتواصلك — استلمنا رسالتك وسنرد قريبًا." |
| `admin` | literal `title` / `body` (as authored by owner) | literal `title` / `body` |

- `payload` values are interpolated into the template; `available_at` formatted to a friendly local date.
- Arabic rendering sets `dir="rtl"` on the message text; `admin` text gets `dir="auto"`.
- Exact copy is finalizable at build; the **keys/placeholders** are the contract.

---

## 4. Contact form change (`contact.html`, FR-010)

On submit:
- **Signed-in** (`BeaconAuth.getUser()` resolves): `insert` into `public.contact_messages` `{ user_id, name, email, message }` → the `notify_contact` trigger creates the ack. Show on-page success ("Message sent — check your inbox"). The ack appears in the inbox via Realtime within seconds.
- **Anonymous**: keep the existing behavior (open Gmail compose / on-page confirmation). No inbox row.
- Network failure on insert → show the existing on-page error; do not block the user.

---

## 5. States & edge cases

| State | Behavior |
|-------|----------|
| Signed out | No bell, no dropdown; inbox routes prompt sign-in (account pane shows the existing sign-in prompt). FR-006 |
| Zero messages | Bell with no badge; dropdown + pane show localized empty state. FR-005 |
| Unread badge | Count of `is_read=false`; `9+` cap; clears as items are read/deleted. FR-002 |
| Same message opened twice | Marking read is idempotent; converges to read without error |
| Long list | Newest-first, capped at 50 in v1 (no paging needed per Assumptions) |
| Arabic viewer | Templated message text rendered RTL; nav/dropdown layout unaffected |
| `file://` / scripts missing | Inbox silently absent; rest of page works (matches 003/004) |

---

## 6. CSS additions (`index.css`)

- `.nav-bell` (button) + `.nav-bell-badge` (count pill) positioned by `#navAccount`.
- `.inbox-dropdown` panel: list rows `.inbox-item` (+ `.is-unread` dot/weight), footer actions; themed with existing vars (`--tang`, `--tang-deep`, `--ink`, `--ink-soft`, `--card`) for dark-mode parity.
- `#pane-inbox` list, per-row action buttons, header + "Mark all read", `.inbox-empty` state.
- `[dir="rtl"]` message-text handling for Arabic.

---

## Acceptance mapping

| Spec scenario | UI behavior |
|---------------|-------------|
| US1 list newest-first + unread count | bell badge + dropdown/pane list (1,2) |
| US1 open → read, count drops | row open → update is_read, badge recount (1,2) |
| US1 empty state | §5 zero-messages |
| US1 signed-out gated | §5 signed-out |
| US2 welcome present once | rendered `welcome` row (trigger) |
| US3 booking confirmation | rendered `booking` row from webhook payload |
| US4 contact ack (signed-in) / anon on-page | §4 |
| US5 admin single + broadcast distinguishable | `admin` rows interleaved by date, labeled by type (FR-013) |
| SC-008 real-time | Realtime deltas applied in place (1) |
