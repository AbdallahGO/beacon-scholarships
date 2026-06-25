# Contract: Notification Creation, Read & Realtime

No new edge function. The client talks to Supabase directly via the already-loaded `@supabase/supabase-js` client (`window.BeaconAuth.client`). This fixes the read/subscribe/act surface and the trusted creation paths.

---

## Creation paths (write side — all trusted)

| Source | Trigger / caller | Row written | Idempotency |
|--------|------------------|-------------|-------------|
| Welcome (FR-007) | `AFTER INSERT ON profiles` → `notify_welcome()` (definer) | `type='welcome'`, `dedupe_key='welcome'`, `ref='account.html#profile'` | partial unique `(user_id,'welcome')` |
| Booking (FR-008/009) | `stripe-webhook` `kind='ticket'` branch, service role | `type='booking'`, `dedupe_key='booking:'+session.id`, `payload={scholarship_title,ticket_code,available_at}`, `ref='account.html#ticket'` | partial unique + only on `checkout.session.completed` |
| Contact ack (FR-010) | `AFTER INSERT ON contact_messages` → `notify_contact()` (definer) | `type='contact'` | none (each submission acked) |
| Owner single (FR-011) | authenticated admin insert (dashboard/manual) under `admin insert` policy | `type='admin'`, literal `title`/`body`, target `user_id` | none |
| Owner broadcast (FR-011) | `select admin_broadcast('<title>','<body>')` | one `type='admin'` row per existing profile | point-in-time (no future users) |

### stripe-webhook addition (reference)

Inside the existing `kind === "ticket"` branch, after the `tickets` insert succeeds (and using the same `admin` service-role client):

```ts
// booking confirmation in the user's inbox (feature 005)
await admin.from("notifications").insert({
  user_id: m.user_id,
  type: "booking",
  dedupe_key: "booking:" + session.id,
  ref: "account.html#ticket",
  payload: {
    scholarship_title: m.scholarship_title ?? m.reveal_full_name ?? null, // title from checkout metadata
    ticket_code: ticketCode,            // the BCN-XXXX-XXXX generated for the ticket
    available_at: cooldownEnd,          // ISO; when the reveal unlocks
  },
}); // ignore duplicate-key errors (idempotent re-delivery)
```

> Requires the checkout `session.metadata` to carry the scholarship title (add `scholarship_title` to the metadata set by `ticket-checkout` if not already present). Redeploy `stripe-webhook` with **JWT verification OFF**.

---

## Read side (client queries)

```js
const c = window.BeaconAuth.client;

// initial list (account pane + dropdown), newest first
const { data: rows } = await c
  .from("notifications")
  .select("id,type,payload,title,body,ref,is_read,created_at")
  .order("created_at", { ascending: false })
  .limit(50);

// unread count for the nav badge
const { count } = await c
  .from("notifications")
  .select("id", { count: "exact", head: true })
  .eq("is_read", false);
```

RLS scopes both to the signed-in user automatically (no explicit `user_id` filter needed; the policy enforces it).

---

## Act side (user actions)

```js
// mark one read (on open) — FR-003
await c.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id);

// mark unread — FR-004
await c.from("notifications").update({ is_read: false }).eq("id", id);

// mark all read
await c.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("is_read", false);

// delete one — FR-004
await c.from("notifications").delete().eq("id", id);
```

All are constrained by `own update` / `own delete` RLS — a user can only affect their own rows.

---

## Realtime subscription (FR-017 / SC-008)

```js
const uid = (await c.auth.getUser()).data.user.id;
const channel = c
  .channel("inbox:" + uid)
  .on("postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + uid },
      (payload) => {
        // payload.eventType ∈ INSERT | UPDATE | DELETE
        // → update unread badge + any open list/dropdown in place
      })
  .subscribe();
// tear down on sign-out / page hide: c.removeChannel(channel)
```

- One channel per signed-in session, re-created on `BeaconAuth.onChange` sign-in, removed on sign-out.
- The `filter` plus RLS guarantee only the user's own changes arrive (SC-005 holds on the live channel too).
- Requires `notifications` in the `supabase_realtime` publication (db-schema.md).

---

## Contract guarantees

- Read/act calls never need a manual `user_id` — RLS supplies isolation (FR-006/014).
- The badge count and any open list reflect server state within a few seconds of any change, with no manual refresh (FR-017/SC-008).
- Booking confirmations appear once per completed booking and never for failed/abandoned payments (FR-009), because the only writer is the success-only, idempotent webhook.
