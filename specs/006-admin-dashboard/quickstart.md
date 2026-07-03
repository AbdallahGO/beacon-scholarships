# Quickstart: Admin Dashboard (Feature 006)

Owner setup + acceptance checklist. Consistent with features 001–005: schema goes through the paste-ready `supabase-setup.sql` ([[sql-via-paste-ready-file]]); browser checks via the local Chromium/Node harness ([[browser-validation-setup]]).

## Owner setup (one-time)

1. **Confirm you are an admin.** In `supabase-setup.sql`, find the **ADMIN SEED** block and ensure your own auth user id is inserted into `public.admins` (uncomment/replace the example id). Without this you will see "not authorized" on the dashboard.
   - To find your id: sign in on the site, or look it up in Supabase dashboard → Authentication → Users.
2. **Paste the whole `supabase-setup.sql`** into Supabase → SQL Editor → Run. It is idempotent; the new Feature-006 section creates `admin_messages`, the `admin select all` policy on `profiles`, and the `admin_*` functions. (Re-pasting the whole file also keeps the feature-005 welcome-trigger fix in place.)
3. **Run advisors**: Supabase MCP `get_advisors` (security + performance). Expect no new findings; every new table has RLS and `admin_messages` intentionally has no client-write policy.
4. **Serve the site over http(s)** (e.g. `npx http-server -p 8080`) — the dashboard needs a real origin/session and is not available on `file://`.

## Acceptance checklist (per user story)

> Use at least two test accounts: one **admin** (seeded) and one **regular** user. Several extra users make the broadcast count meaningful.

### US1 — Admin-only access (P1)
- [ ] Signed in as the **admin**, open `admin.html` → dashboard renders (Overview/Messages/Contact/Accounts). (SC-001)
- [ ] Signed in as a **regular** user, open `admin.html` → "not authorized"; no admin data loads. (SC-001)
- [ ] **Signed out**, open `admin.html` → prompted to sign in; no admin functionality. 
- [ ] As a regular user, call an admin RPC directly (e.g. in console `BeaconAuth.client.rpc('admin_broadcast',{p_title:'x',p_body:'y'})`) → returns `not authorized`, nothing sent. (SC-007)

### US2 — Send messages (P1)
- [ ] Compose + **broadcast to all** → confirm dialog appears (SC-006); on confirm, toast shows "Sent to N users" with N = number of profiles. (FR-010/011)
- [ ] Each test user's **inbox** shows the message with the exact title/body. (FR-008, SC-003)
- [ ] **Single send by email** to one user → only that user receives it. (FR-007)
- [ ] Single send to a **non-existent email** → "No user found with that email." (FR-012)
- [ ] Try to send with an **empty body** → blocked with an explanation. (FR-009)
- [ ] **Sent-message log** lists each send newest-first with target + recipient count. (FR-011b)
- [ ] Have a recipient **delete** the message from their inbox → the sent-log entry and the "messages sent" count are unchanged. (FR-011a)

### US3 — Contact submissions (P2)
- [ ] As a signed-in user, submit the contact form; as admin, open **Contact** → the submission appears newest-first with sender/content/time. (FR-014, SC-004)
- [ ] With no submissions, the pane shows an empty state. (FR-015)
- [ ] **Reply** to a submission → the reply lands in that user's inbox and a new row appears in the sent-message log. (FR-015a)

### US4 — Overview (P3)
- [ ] Overview counts (registered users, completed profiles, tickets, contact messages, messages sent) match the real totals. (FR-016, SC-005)

### US5 — Accounts & bookings (P3)
- [ ] **Accounts** lists registered profiles; selecting a user with bookings shows their tickets (title, status, booked-at, **provider**, etc.). (FR-017/FR-037)
- [ ] Confirm there are **no** edit/delete/refund controls anywhere. (FR-018)

## Owner setup — payments (one-time, after the SQL above)

> The SQL above already creates `payment_providers` (4 seeded rows; only **stripe** enabled), `payments`, the `tickets`/`space_purchases` columns, and the admin payment RPCs.

5. **Set provider secrets** (never in DB/client) via the Supabase CLI — for each provider you intend to enable:
   ```sh
   supabase secrets set PAYPAL_CLIENT_ID=... PAYPAL_SECRET=... PAYPAL_WEBHOOK_ID=...
   supabase secrets set PAYMOB_API_KEY=... PAYMOB_HMAC_SECRET=... PAYMOB_INTEGRATION_ID=... PAYMOB_IFRAME_ID=...
   supabase secrets set KASHIER_API_KEY=... KASHIER_SECRET=... KASHIER_MERCHANT_ID=...
   ```
   (Existing `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` stay as-is.) Use **sandbox/test** credentials first.
6. **Deploy the edge functions** (MCP cannot deploy — use the CLI):
   ```sh
   supabase functions deploy paypal-checkout paypal-webhook paymob-checkout paymob-webhook kashier-checkout kashier-webhook
   # and redeploy the extended Stripe functions:
   supabase functions deploy ticket-checkout space-checkout stripe-webhook
   ```
7. **Register each provider's webhook URL** in that provider's dashboard, pointing to the deployed `{provider}-webhook` function URL.
8. **Enable providers** from the admin **Payments** tab (or by setting `enabled=true`) once their secrets + webhooks are in place. Set each provider's **currency** and **fx_rate** there (USD base; e.g. Paymob/Kashier `EGP` with your fixed rate).

### US6 — Multi-provider checkout (P1)
- [ ] With ≥2 providers enabled, start a **ticket** purchase → a "choose how to pay" step lists each enabled provider with the price in its currency. (FR-019/FR-021)
- [ ] Pay via each provider in **sandbox** → the ticket is booked **only after** the provider's webhook confirms; the return redirect alone never books. (FR-022/SC-009)
- [ ] Repeat for the **+1 ticket space** purchase. (both paid flows)
- [ ] Disable a provider → it disappears from checkout; disable all → "payments temporarily unavailable." (FR-020/FR-026/FR-027)
- [ ] Replay a webhook (or trigger it twice) → exactly one ticket + one ledger row (idempotent). (FR-024/SC-010)
- [ ] Start checkout for the same item via two providers/tabs → second attempt rejected; no double charge/booking. (FR-039/SC-015)
- [ ] After a cancelled/failed sandbox payment, retry (incl. a different provider) → succeeds; item booked once. (FR-040)

### US7 — Provider config (P2)
- [ ] In **Payments → Providers**, toggle a provider off/on → reflected at checkout within seconds. (FR-029/SC-011)
- [ ] Edit a provider's display name / currency / fx_rate → next checkout reflects it; `fx_rate ≤ 0` is rejected. (FR-030)
- [ ] Confirm **no secret-key field** exists on the pane. (FR-031/SC-013)
- [ ] As a non-admin, call `admin_set_provider_enabled`/`admin_set_provider_config` directly → `not authorized`. (FR-032/SC-014)

### US8 — Payment monitoring (P2)
- [ ] **Payments → Transactions** lists every payment across providers, newest first (provider, payer, amount/currency, status, kind). (FR-033)
- [ ] **Totals** show per-provider paid count + sum and a grand "payments received" figure; Overview shows the same total. (FR-034/FR-038)
- [ ] Confirm the ledger view is **read-only** (no refund/cancel/edit). (FR-035)
- [ ] As a non-admin, select from `payments` directly → denied/empty. (FR-036/SC-014)

## Notes
- Supabase MCP is read-only here — it cannot apply the SQL or deploy functions. The owner pastes `supabase-setup.sql` **and** deploys the edge functions + sets secrets via the Supabase CLI (steps 5–7). The admin-dashboard half adds no edge function; the **payments** half does (per provider).
- Test all gateways in **sandbox/test mode** before enabling live; keep a provider disabled until its secrets + webhook are verified end-to-end.
- Reminder from prior features still pending where noted: feature-004 `COOLDOWN_MS` may still hold a test value; unrelated to this feature.
