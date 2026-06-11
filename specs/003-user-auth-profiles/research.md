# Research: User Accounts with Social Sign-In & Scholarship-Matching Profiles

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

All findings below were verified against live Supabase docs / changelog on 2026-06-11 (per Supabase skill: do not trust training data).

## R1. Backend choice

- **Decision**: Supabase cloud (Auth + Postgres + Storage) as the only backend; browser talks to it directly with the publishable key, RLS is the security boundary.
- **Rationale**: Already provisioned in this project (`.mcp.json` Supabase MCP, `supabase_pass.text`); natively supports all four required social providers, email/password, identity linking, file storage, and row-level privacy — with zero server code, which preserves the no-framework static-site architecture and the no-Python constraint (any tooling stays PowerShell).
- **Alternatives considered**: Custom Node backend (rejected: server to build/host/secure, far more scope); Firebase (rejected: equivalent capability but nothing provisioned, and Supabase MCP tooling is already wired into this workspace); localStorage-only accounts (rejected: fails cross-device sync FR-008 and real auth FR-001..007).

## R2. Social providers — keys and gotchas (verified)

- **Decision**: Use Supabase provider keys `google`, `facebook`, `linkedin_oidc`, `x` with `signInWithOAuth({ provider, options: { redirectTo } })`.
- **Verified facts**:
  - LinkedIn: the old `linkedin` provider was deprecated 2023-11-24; **`linkedin_oidc`** ("Sign In with LinkedIn using OpenID Connect" product) is current. Callback: `https://<project-ref>.supabase.co/auth/v1/callback`.
  - X/Twitter: provider key **`x`** with OAuth 2.0 (legacy `twitter` OAuth 1.0a is being deprecated). "Request email from users" must be **ON** in the X developer portal; even so, X may not return an email for some accounts.
  - Each provider needs an app registered in its developer console with the Supabase callback URL; client id/secret entered in the Supabase dashboard (manual one-time setup, documented in quickstart).
- **Rationale**: Matches FR-002 exactly; all four are first-class Supabase providers.
- **Alternatives considered**: Custom OIDC wiring per provider (rejected: Supabase ships these natively).

## R3. Missing-email edge case (X)

- **Decision**: If a social sign-in yields a user with no email (`user.email` empty), `account.html`/`auth.js` blocks gated features behind an "add your email" prompt that calls `auth.updateUser({ email })`, which sends a confirmation link to the new address (spec edge case: "provider does not return an email").
- **Rationale**: Keeps the account usable for sign-in while ensuring every account converges on a verified email, which identity linking depends on (R4).

## R4. Identity linking (verified)

- **Decision**: Rely on Supabase **automatic linking** — identities sharing the same *verified* email are linked to one user; Supabase refuses to auto-link unverified emails (anti-takeover). For the clarified "view + connect" settings UI, enable **manual linking** (beta toggle in Auth settings) and use `auth.linkIdentity({ provider })` + `auth.getUserIdentities()` to list linked methods. Unlinking (`unlinkIdentity`) exists but is **out of scope v1** per clarification.
- **Rationale**: FR-003 ("unverified MUST NOT auto-link") is enforced natively by Supabase — no custom logic. FR-003a maps 1:1 to `getUserIdentities` + `linkIdentity`.
- **Alternatives considered**: Custom email-matching merge logic (rejected: reimplements a security-critical native feature).

## R5. Soft email verification (clarification Q1)

- **Decision**: Disable "Confirm email" in Supabase Auth settings → email/password sign-up returns a session immediately (FR-007a "immediate use"). `auth.js` shows a non-blocking banner while `user.email_confirmed_at` is null, with a "Verify email" action that sends a magic-link/OTP to the address (`signInWithOtp` with `shouldCreateUser: false`); completing it sets `email_confirmed_at`. Social sign-ins arrive provider-verified.
- **Rationale**: This is the standard Supabase pattern for soft verification; with "Confirm email" ON the user could not sign in at all before clicking the link, violating the clarified UX. Auto-linking stays safe regardless (R4: Supabase won't link unverified emails).
- **Alternatives considered**: "Confirm email" ON (rejected: hard-blocks first sign-in); no verification at all (rejected: breaks safe auto-linking and clarification Q1).

## R6. supabase-js delivery & session handling on a static site

- **Decision**: Load pinned `@supabase/supabase-js@2.x.y` (exact version chosen and pinned at implementation time) from jsDelivr via `<script>`; it exposes `window.supabase.createClient`. Create one client in `auth.js` with `auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true }`. URL + **publishable key** live in committed `supabase-config.js` (publishable keys are designed to be public; never the service_role/secret key).
- **Rationale**: No package manager exists in this project; CDN + pinned version satisfies the skill's supply-chain rule. PKCE is the recommended browser flow; `detectSessionInUrl` completes the OAuth redirect on any page.
- **Alternatives considered**: npm + bundler (rejected: introduces a build system the project deliberately avoids); legacy implicit flow (rejected: PKCE is current guidance).

## R7. Serving constraint — OAuth vs `file://`

- **Decision**: Account features require the site to be served over http(s). Dev: `npx http-server` (Node, no Python) at `http://localhost:8080`, added to Supabase Auth **redirect allow-list** along with the eventual production origin; `redirectTo` always `location.origin + location.pathname`-based. On `file://`, `auth.js` detects the protocol and renders the account UI disabled with a short notice; anonymous browsing (features 001/002) keeps working from `file://` unchanged.
- **Rationale**: OAuth redirects cannot return to `file://` URLs; this is a hard platform constraint, so the 001/002 "`file://`-compatible" rule is relaxed *only* for account features, gracefully.
- **Alternatives considered**: Keeping full `file://` parity (impossible for OAuth); popup-window auth flows (rejected: same origin requirements, more fragile).

## R8. Data API exposure & RLS (verified — changelog 2026-04-28)

- **Decision**: Every new table gets: `ENABLE ROW LEVEL SECURITY`, owner-only policies `TO authenticated USING ((select auth.uid()) = user_id)` (UPDATE also `WITH CHECK`), **and explicit `GRANT` to `authenticated`** — since 2026-04-28 new tables in `public` are no longer auto-exposed to the Data API. No grants to `anon` (all account data is owner-only). After applying schema: run Supabase advisors and fix findings.
- **Rationale**: Direct consequence of the changelog breaking change + skill security checklist (SC-007: zero cross-account exposure).

## R9. Storage for uploads

- **Decision**: One **private** bucket `user-files`; object paths `<auth.uid()>/photo/<file>`, `<auth.uid()>/certificates/<uuid>-<name>`. RLS policies on `storage.objects` for INSERT + SELECT + UPDATE + DELETE, each checking bucket and `(storage.foldername(name))[1] = (select auth.uid())::text` (all three of INSERT/SELECT/UPDATE are required for upsert to work). Files served to the owner via short-lived signed URLs. Client-side validation + policy limits: photos JPG/PNG/WebP ≤ 5 MB; certificates PDF/JPG/PNG ≤ 10 MB (per spec assumptions).
- **Rationale**: Folder-per-user with owner-only policies is the canonical Supabase pattern for private user files (FR-014/015/017/022).
- **Alternatives considered**: Public bucket with obscure paths (rejected: violates FR-022); base64 in Postgres rows (rejected: size, cost, no streaming).

## R10. Matching data & algorithm (clarification Q2)

- **Decision**: Client-side rule-based matching over the static catalogue. Inputs: structured `levels` from `scholarships.js` (matches profile degree) + a new **generated** `match-index.js` produced by `ScholarShips_Data/build_match_index.ps1`, which heuristically parses the already-extracted EN detail sections (`ScholarShips_Data/details/<id>.json` — verified: they contain only `{header, body}` text sections, no structured eligibility fields) for nationality/language signals (section headers like "eligibility", "nationalit…", "language"). Scoring: degree-level match (strong), nationality/language signals (boost or "may not be eligible" caution only when the text is unambiguous), unknown → **neutral** (never a negative badge). Surfaces per clarification: "Recommended for you" strip (top-N by score) + per-card/detail badges + a "Best match" sort option.
- **Rationale**: Zero new network dependencies, honest about data quality (text-derived signals are heuristic, so unknowns stay neutral), satisfies FR-019/020/21 and SC-006 with deterministic, testable rules.
- **Alternatives considered**: Re-scraping for9a `__NEXT_DATA__` for structured eligibility fields (deferred: extraction script is resumable and could be extended later, but current raw files already dropped those fields and a re-scrape is not needed for v1); ML/embedding matching (out of scope per spec assumptions); server-side matching (no server exists).

## R11. Pending-action resume after sign-in (FR-011)

- **Decision**: Before opening the auth modal / OAuth redirect, the triggering action (e.g., `{type:'save', id:'…'}`) is written to `localStorage` (`beacon.pendingAction`); after the session is established (including back from OAuth on any page), `auth.js` replays and clears it.
- **Rationale**: Survives the full-page OAuth redirect; trivially testable; implements "after signing in the action they attempted completes".

## R12. Schema application workflow (MCP is read-only)

- **Decision**: `.mcp.json` pins the Supabase MCP to `read_only=true`. Schema (contracts/db-schema.md) is applied via the Supabase dashboard SQL editor (or by temporarily removing `read_only` during implementation with user consent); verification (advisors, table listing) uses the read-only MCP tools. No migration files are kept in-repo (no CLI/local stack in this project) — `contracts/db-schema.md` is the canonical schema record.
- **Rationale**: Respects the configured read-only safety while keeping a single auditable SQL contract in the repo.
