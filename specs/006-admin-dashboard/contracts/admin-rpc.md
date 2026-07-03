# Contract: Admin RPC & Read Surface

How `admin.js` talks to Supabase. All calls use the existing `BeaconAuth.client` (supabase-js v2). Sends are PostgREST RPCs (`client.rpc(...)`); reads are RLS-guarded selects. There is **no edge function** in this feature.

## Authorization model

- **Client gate** (convenience): `client.from('admins').select('user_id').eq('user_id', uid).maybeSingle()` → truthy means render the dashboard, falsy means show "not authorized". Driven by the existing `admins self select` policy.
- **Server enforcement** (the boundary): each function re-checks `admins` membership and raises `not authorized`; each read is behind an `admin select all` RLS policy. A non-admin calling any RPC directly receives the `not authorized` error and writes nothing (SC-007).

## RPC: sends

### `admin_broadcast(p_title, p_body) → integer`
- **Use**: US2 broadcast to all users.
- **Call**: `client.rpc('admin_broadcast', { p_title, p_body })`.
- **Returns**: integer `recipient_count` (rows delivered; the value to show per FR-011).
- **Errors**: `not authorized` (non-admin), `empty_body` (blank body), `body_too_long`/`title_too_long` (over limit). Point-in-time over **`auth.users`** — every registered account (FR-006/FR-013).
- **Side effects**: one `notifications` row per registered account + one `admin_messages` log row (`target_type='all'`).

### `admin_send_to_email(p_email, p_title, p_body) → integer`
- **Use**: US2 single send when the admin typed an email.
- **Call**: `client.rpc('admin_send_to_email', { p_email, p_title, p_body })`.
- **Returns**: integer `1` on success.
- **Errors**: `not authorized`, `empty_body`, `recipient_not_found` (no matching email → surface "No user found with that email." per FR-012).
- **Side effects**: one `notifications` row for the resolved user + one `admin_messages` row (`target_type='user'`, `target_email` recorded).

### `admin_send_to_user(p_user_id, p_title, p_body) → integer`
- **Use**: FR-015a contact reply (and any compose where the user id is already known).
- **Call**: `client.rpc('admin_send_to_user', { p_user_id, p_title, p_body })`.
- **Returns**: integer `1`.
- **Errors**: `not authorized`, `empty_body`, `recipient_not_found`.
- **Side effects**: one `notifications` row + one `admin_messages` row (`target_type='user'`, `target_user_id`).

## RPC: overview

### `admin_overview() → json`
- **Use**: US4 headline counts.
- **Call**: `client.rpc('admin_overview')`.
- **Returns**: `{ users, profiles, tickets, contact_messages, messages_sent }` (all integers). Show `users` as "registered users" and optionally `profiles` as "completed profiles" so the gap is visible. `contact_messages` is the **total** count (there is no "unread/waiting" status in v1).
- **Errors**: `not authorized`.

## Reads (RLS-guarded selects)

| View | Query | Policy relied on |
|------|-------|------------------|
| Sent-message log (FR-011b) | `client.from('admin_messages').select('*').order('created_at',{ascending:false})` | `admin_messages` → `admin select all` |
| Contact submissions (FR-014) | `client.from('contact_messages').select('*').order('created_at',{ascending:false})` | `contact_messages` → `admin select all` (existing) |
| Accounts list (FR-017) | `client.from('profiles').select('user_id,first_name,last_name,full_name,country,degree,created_at').order('created_at',{ascending:false})` | `profiles` → `admin select all` (new) |
| Per-user bookings (FR-017) | `client.from('tickets').select('*').eq('user_id', uid).order('booked_at',{ascending:false})` | `tickets` → `admin select all` (existing) |

## Error-to-message mapping (client)

| Server error | Admin-facing message |
|--------------|----------------------|
| `not authorized` | "You don't have admin access." → fall back to the "not authorized" state |
| `empty_body` | "Please write a message body before sending." |
| `body_too_long` | "Message body is too long (max 5000 characters)." |
| `title_too_long` | "Title is too long (max 200 characters)." |
| `recipient_not_found` | "No user found with that email." |
| network/other | "Something went wrong — please try again." |

## Behavioral guarantees

- **Confirm before broadcast** (FR-010): the UI must require an explicit confirm before calling `admin_broadcast`; the RPC itself does not confirm.
- **In-flight guard** (edge case): disable the send control until the RPC resolves to avoid accidental double-send.
- **Literal content** (FR-008): `title`/`body` are stored and delivered exactly as typed; recipients render them as an `admin`-type inbox message (feature 005 already renders `admin` messages with literal title/body).
- **No client writes** to `admin_messages` or `notifications` for admin sends — only via these RPCs.
