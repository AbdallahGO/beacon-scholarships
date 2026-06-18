# Quickstart: Ticket Booking, Profiles & Cleanup

Manual setup + acceptance checklist (consistent with features 001–003). Stripe runs in **test mode**.

## Owner one-time setup

1. **Generate ranking data** (no Python): curate `ScholarShips_Data/rankings.csv` from a recognized world ranking (QS/THE), then run:
   ```powershell
   pwsh ScholarShips_Data/build_ranking_index.ps1
   ```
   This writes `ranking-index.js` and appends a `scholarship_rankings` seed block to `supabase-setup.sql`. Adjust band thresholds in the script's constant block if desired.
2. **Rebuild catalogue/details with For9a scrubbed**:
   ```powershell
   pwsh ScholarShips_Data/build_catalogue.ps1
   pwsh ScholarShips_Data/build_details.ps1
   ```
   (`.ps1` files with Arabic regex saved UTF-8 **with BOM**.)
3. **Apply the schema**: open the Supabase dashboard → SQL editor → paste the **whole** `supabase-setup.sql` and Run (idempotent). Then re-run **advisors** and confirm no new security lints.
4. **Seed your admin id**: Dashboard → Authentication → Users → copy your own user UUID → put it in the `admins` insert in `supabase-setup.sql` and re-run that statement.
5. **Set Stripe config**:
   - Put your `pk_test_…` in `supabase-config.js` (`window.STRIPE_PUBLISHABLE_KEY`).
   - Dashboard → Edge Functions → Secrets: set `STRIPE_SECRET_KEY` (`sk_test_…` from `Strip-sandbox.text`), later `STRIPE_WEBHOOK_SECRET`, optional `RESEND_API_KEY` + `OWNER_EMAIL`.
6. **Deploy the 3 edge functions** via the dashboard (or `supabase functions deploy ticket-checkout space-checkout stripe-webhook`): `ticket-checkout`, `space-checkout`, `stripe-webhook`.
7. **Add the Stripe webhook**: Stripe dashboard (test) → Developers → Webhooks → add endpoint = deployed `stripe-webhook` URL → event `checkout.session.completed` → copy signing secret into `STRIPE_WEBHOOK_SECRET`.
8. **Confirm the +1 space price** (default $99) in `space-checkout` + `supabase-config.js`.

## Serve & run

```powershell
npx http-server -p 8080
# open http://localhost:8080  (Stripe redirect + OAuth need http, not file://)
```
Register `http://localhost:8080` in Supabase Auth redirect allow-list (already done for feature 003) and as a Stripe success/cancel origin.

## Acceptance checklist

### Booking (US1)
- [ ] Detail page shows **Book Ticket** between the detail body and apply area; the outbound "Apply on official site" link is gone.
- [ ] Price shown matches the scholarship's tier ($150/$200/$250/$300) (SC-003).
- [ ] Anonymous click → sign-in modal → after sign-in the booking resumes.
- [ ] Click (signed in) → animation plays (words fall top→down; hand→hand→backpack+laptop+book; label → "Are You Ready!") → redirected to Stripe Checkout.
- [ ] Pay with `4242 4242 4242 4242`, any future expiry/CVC → returns to the site; within seconds a ticket exists with a 3-day cooldown (SC-001/002).
- [ ] Cancel/abandon checkout → **no** ticket created (SC-002).

### Ticket status & reveal (US2)
- [ ] Account → Ticket shows a live countdown; nav menu shows a Ticket item with a cooldown ring while active.
- [ ] Force `cooldown_end` into the past (or wait) → ticket **reveals** with a unique `ticket_code` (≠ user id), full name, country/nationality, degree, field of interest, scholarship+institution, booking date; address/GPA/second nationality absent (SC-005).
- [ ] `ticket_code` stable across reloads/devices; countdown on a 2nd device matches within seconds (SC-006).

### Capacity & +1 space (US3)
- [ ] With one active ticket, booking another is blocked with the wait/buy message (SC-004).
- [ ] Buy +1 space → capacity becomes 2 → a second concurrent booking succeeds.
- [ ] Booking the **same** scholarship twice is blocked (already-booked).
- [ ] Each ticket booking is charged its own $150–$300 (the +1 purchase did not waive it).
- [ ] A revealed ticket frees its slot (can book again at base capacity 1).

### Account creation & profile (US4)
- [ ] Create-account form collects all listed fields (optional ones marked); mismatched passwords and an unchecked agreement both block submit (SC-007).
- [ ] Successful sign-up creates a profile row + a unique user ID visible on the account page.

### Settings & cleanup (US5)
- [ ] `#acctGate` / `#acctReset` blocks are gone; account page renders for signed-in / signed-out / recovery (reset form now in Settings) (SC-010).
- [ ] Settings → change password works; reset-link email flow works.

### Filters (US6)
- [ ] Apply filters → open a card → back → filters/search/sort restored; reopening the list later restores them too (SC-008).

### Branding (US7)
- [ ] Repo-wide content scan over rendered pages/cards/detail bodies/footers finds **zero** visible "For9a"/"فرصة" (SC-009); Arabic text/RTL intact.

### Owner (US8)
- [ ] After a booking, the owner gets an email (if Resend configured) and the booking appears in `admin.html`.
- [ ] A non-admin (and anonymous) user cannot see the dashboard or other users' tickets (SC-011).

### Security re-check
- [ ] No `sk_*` / `service_role` in any client file.
- [ ] Supabase advisors clean after schema apply.
- [ ] Cross-account probe: user A cannot read user B's tickets via the Data API.

## Browser validation
Per project memory: Playwright MCP is unavailable here — use `npx playwright install chromium` + a throwaway Node script (`require("<repo>/node_modules/playwright")`), then delete `node_modules`/`package.json` (the repo is dependency-free by design).
