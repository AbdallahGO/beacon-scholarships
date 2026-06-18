# Owner Setup — Feature 004 (Stripe + Supabase unblock)

These are the steps **only the owner** can do (Supabase MCP here is read-only and can't
deploy functions or paste SQL). Everything in the repo is already prepared; this is the
runbook to wire it to the live project. Stripe stays in **test mode**.

Project ref: `lnflmycqaxdfmtmdmhvx`
Functions base: `https://lnflmycqaxdfmtmdmhvx.supabase.co/functions/v1`

---

## 1. Apply the schema (idempotent)
Supabase dashboard → **SQL Editor** → paste the **whole** `supabase-setup.sql` → **Run**.
Safe to re-run. Then **Advisors** → confirm no new security lints.

This creates: `tickets`, `scholarship_rankings`, `admins`, `space_purchases`, the new
`profiles` columns, all RLS, and seeds the ranking prices.

## 2. Seed your admin id
Dashboard → **Authentication → Users** → copy your own user **UUID**.
In `supabase-setup.sql` near line 418, uncomment and fill the admin insert:
```sql
insert into public.admins (user_id) values ('PASTE-YOUR-UUID-HERE')
  on conflict (user_id) do nothing;
```
Run just that statement. (Gates `admin.html` / admin RLS on tickets.)

## 3. Set Edge Function secrets
Dashboard → **Edge Functions → Secrets** (Project Settings → Edge Functions). Add:

| Secret | Value | Needed for |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_…` (from gitignored `Strip-sandbox.text`) | ticket-checkout, space-checkout, webhook |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` — filled in **step 5** | webhook signature verify |
| `SPACE_PRICE_CENTS` | *(optional)* default `9900` ($99) | space-checkout price |
| `RESEND_API_KEY` | *(optional)* owner-email | webhook owner notify (US8, later) |
| `OWNER_EMAIL` | *(optional)* your email | webhook owner notify (US8, later) |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do **not** add them.

## 4. Deploy the 3 edge functions
Dashboard → **Edge Functions** → deploy each (paste each folder's `index.ts`, or CLI):
```bash
supabase functions deploy ticket-checkout
supabase functions deploy space-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
```
- `ticket-checkout` and `space-checkout`: default JWT verification ON (they read the caller's JWT).
- **`stripe-webhook`: JWT verification OFF** (Stripe signs the request; the function verifies the signature itself). In the dashboard, toggle **"Verify JWT" / "Enforce JWT verification" off** for this one.
  - ⚠️ **The dashboard paste-deploy defaults `verify_jwt` to TRUE.** If you leave it on, every Stripe delivery is rejected with **401 at the gateway before the function runs** — payment succeeds but no ticket is ever created, and the edge-function logs show `POST | 401` with no signature error. Verify after deploy: the function should report `verify_jwt: false`.
  - To replay without paying again: Stripe → Developers → Webhooks → the failed (401) delivery → **Resend** (the handler is idempotent).
- Each function is self-contained — no `_shared` import — so the paste-box deploy bundles cleanly.

## 5. Register the Stripe webhook
Stripe dashboard (**test mode**) → Developers → **Webhooks** → **Add endpoint**:
- **Endpoint URL:** `https://lnflmycqaxdfmtmdmhvx.supabase.co/functions/v1/stripe-webhook`
- **Event:** `checkout.session.completed`
- Save → copy the **Signing secret** (`whsec_…`) → put it in `STRIPE_WEBHOOK_SECRET` (step 3) → **re-deploy `stripe-webhook`** so it picks up the secret.

## 6. Confirm prices
- Ticket prices are server-authoritative from `scholarship_rankings` (seeded in step 1):
  high tier $300; out-of-rank default $150.
- +1 space add-on: `SPACE_PRICE_CENTS` (default $10). Keep `window.SPACE_PRICE_CENTS`
  in `supabase-config.js` in sync (display-only).

---

## Smoke test (after the above)
Serve over http (Stripe can't return to `file://`):
```powershell
npx http-server -p 8080   # open http://localhost:8080
```
1. Sign in → open a scholarship → **Book Ticket** → animation → Stripe Checkout.
2. Pay with `4242 4242 4242 4242`, any future expiry / any CVC.
3. Within seconds: Account → **Ticket** shows a live 3-day countdown; nav shows the cooldown ring.
4. Cancel a checkout instead → confirm **no** ticket is created.
5. Open `admin.html` as the seeded admin → the booking is listed.

## Notes / not-yet-wired
- `space-checkout` deploys fine but the **+1 buy button** (account.js) is **US3, still owed** —
  the function will work once that UI lands.
- Owner email (Resend) is **US8, still owed** — leave `RESEND_API_KEY`/`OWNER_EMAIL` unset for now;
  the webhook degrades gracefully.
- No Stripe key ships to the browser. If you ever see `sk_*` or `service_role` in a client file, stop.
