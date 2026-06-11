# Quickstart: User Accounts with Social Sign-In & Scholarship-Matching Profiles

## One-time setup (before/while implementing)

1. **Supabase project** (existing account — see `.mcp.json` / dashboard):
   - Apply [contracts/db-schema.md](./contracts/db-schema.md) in the SQL editor (tables → grants → RLS → storage). Run advisors (MCP `get_advisors`) — must be clean.
   - Auth settings: email provider ON with **Confirm email OFF**; **manual linking ON** (beta); redirect allow-list: `http://localhost:8080/**` (+ production origin later).
   - Configure providers (each dev console → callback `https://<project-ref>.supabase.co/auth/v1/callback`, then client id/secret into Supabase):
     - Google (Cloud Console OAuth client)
     - Facebook (Meta for Developers app)
     - LinkedIn — product "Sign In with LinkedIn using OpenID Connect" (provider key `linkedin_oidc`)
     - X — OAuth 2.0 app with **"Request email from users" ON** (provider key `x`)
2. **Client config**: create `supabase-config.js` with the project URL + **publishable** key (dashboard → API keys). Never the secret/service_role key.
3. **Match index**: `powershell -File ScholarShips_Data\build_match_index.ps1` → generates `match-index.js` (check the coverage summary it prints).
4. **Serve over http** (OAuth can't return to `file://`): from repo root run `npx http-server -p 8080` → http://localhost:8080.

## Acceptance checklist

### US1 — Sign up & sign in (P1)
- [ ] Create account with email+password → signed in immediately; verification banner visible; verify link works and banner disappears (FR-001/007a)
- [ ] Sign up + sign back in with each of Google, Facebook, LinkedIn, X (FR-002, SC-002)
- [ ] Social returning user → same account, no duplicate (FR-003)
- [ ] Wrong password / unknown email → same generic error (FR-007)
- [ ] Refresh + navigate between pages → still signed in; Sign out → locked again, second tab follows (FR-004/005)
- [ ] Password reset email flow works (FR-006)
- [ ] On `file://`, account UI shows the "serve over http" notice and nothing breaks

### US2 — Saved list, history, search (P2)
- [ ] Anonymous: browse/search work; heart click prompts sign-in; after signing in, that scholarship IS saved (FR-011)
- [ ] Save/unsave from card and from detail page; state consistent everywhere; persists across sign-out/in and a second browser (FR-008, SC-003)
- [ ] Detail page visits appear in History with dates; Clear works (FR-009)
- [ ] Searches recorded (signed-in only); recent searches offered and re-runnable; Clear works (FR-010)

### US3 — Profile (P2)
- [ ] New social user sees name/email pre-filled (FR-013)
- [ ] Save all text fields + degree → persists after reload (FR-012)
- [ ] Photo upload (JPG ≤ 5 MB) shows in nav avatar; oversized/wrong type rejected with clear message (FR-014/017)
- [ ] Degree certificate upload/list/view (signed URL)/remove (FR-015)
- [ ] Add 2 languages with CEFR levels (friendly labels), one with certificate; remove one (FR-016)
- [ ] Partial saves OK — only name/email required (FR-018)
- [ ] Signed-out user CANNOT fetch another user's rows or files (test with second account + REST call) (FR-022, SC-007)

### US4 — Matching (P3)
- [ ] Profile with degree=Master's → "Recommended for you" strip shows master's-targeting scholarships; badges on cards; "Best match" sort (FR-019, clarification Q2)
- [ ] Two accounts with different degrees see different recommendations (SC-006)
- [ ] Empty profile → "complete your profile" prompt instead of strip (FR-020)
- [ ] Change degree → recommendations differ on next view (FR-021)
- [ ] No scholarship shows a hard "Not eligible" from text heuristics alone — caution copy only (research R10)

### Cross-cutting
- [ ] X account without email → "add your email" prompt flow works (edge case)
- [ ] Cancel provider consent mid-flow → friendly message, retry works (edge case)
- [ ] Settings shows linked methods; Connect adds a provider; no unlink UI (FR-003a)
- [ ] Delete account: owned rows + files gone, auth user removed via `delete_account` Edge Function, signed out; deleted email can sign up fresh (FR-023, contract F9)
- [ ] Supabase advisors clean; no service_role/secret key anywhere in repo
