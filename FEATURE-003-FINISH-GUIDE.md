# Feature 003 (User Accounts) — COMPLETE ✅

> Final update 2026-06-11. Branch: `003-user-auth-profiles`. Supabase project: `lnflmycqaxdfmtmdmhvx`.

## Everything verified

- **28/28 automated acceptance checks** (sign-up/sign-in, generic errors, session persistence, two-tab sign-out, saved list + pending-action replay, history, search recording, profile, matching with two accounts, RLS isolation, settings, `file://` notice).
- **Google sign-in configured and verified** — Supabase redirects to Google's real sign-in page (the `redirect_uri_mismatch` is fixed).
- **Account deletion fully self-service** — the `delete_account` Edge Function removes the auth user; verified three times (deleted accounts can no longer sign in). The app now calls the function by its deployed name (`delete_account`, underscore).
- **Security clean** — `rls_auto_enable` revoke applied and verified; RLS probes return nothing cross-account or signed-out; no secrets committed (`Strip-sandbox.text` with your Stripe test keys is gitignored); `supabase-setup.sql` is now fully idempotent — always safe to paste whole.

## Small things you can do anytime

1. **One live Google sign-in** at http://localhost:8080 (serve with `npx http-server -p 8080`) — final smoke test with a real Google account.
2. **Leaked-password protection** (last advisor note, 1 click): dashboard → Authentication → look for *Password security* → enable "Prevent use of leaked passwords".
3. **Manual once:** click a password-reset email link; upload a photo / certificate / language certificate from the Profile page.
4. Delete any old `beacon.e2e.*` / `beacon.iso.*` test users in dashboard → Authentication → Users.

## Deferred by choice (not blocking)

- Facebook / LinkedIn / X provider apps (tasks T004–T006) — same pattern as Google when you want them; X needs "Request email from users" ON.
- **Before a real public launch:** revisit email verification (with Confirm email OFF, sign-ups are auto-confirmed — no "unverified" state; weaker email-based account linking). Options: turn Confirm email ON or add OTP verification.
