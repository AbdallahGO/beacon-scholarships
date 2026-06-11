# Implementation Plan: User Accounts with Social Sign-In & Scholarship-Matching Profiles

**Branch**: `003-user-auth-profiles` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-user-auth-profiles/spec.md`

## Summary

Add accounts to the Beacon static site using **Supabase** (already provisioned: `.mcp.json` + `supabase_pass.text`) as the backend — Auth for email/password + social sign-in (`google`, `facebook`, `linkedin_oidc`, `x`), Postgres for profile/saved/history data behind owner-only RLS, and a private Storage bucket for photo/certificate uploads. The site stays a no-framework static multi-page app: a new shared `auth.js` (pinned supabase-js v2 from CDN) manages the session and nav account UI on every page; a new `account.html` hosts Profile / Saved / History / Settings tabs; `index.js` and `scholarship.js` gain save buttons, history recording, search-history capture, a "Recommended for you" strip, and match badges driven by a PowerShell-generated `match-index.js` derived from the existing extracted detail text. Email verification is soft (Supabase "Confirm email" off + verification banner), and Supabase's native identity linking (auto by verified email, manual `linkIdentity()` for view+connect) implements the clarified account-linking rules.

## Technical Context

**Language/Version**: HTML5, CSS3, vanilla JavaScript (ES2020, browser); Windows PowerShell 5.1 for build/tooling scripts (**no Python**, standing user constraint)
**Primary Dependencies**: `@supabase/supabase-js` v2 via CDN `<script>` (jsDelivr, pinned to an exact version at implementation time per Supabase skill guidance; exposes `window.supabase.createClient`). Supabase cloud project: Auth (PKCE flow), Postgres (Data API), Storage. No other runtime dependencies, no package manager.
**Storage**: Supabase Postgres — `profiles`, `profile_languages`, `certificates`, `saved_scholarships`, `view_history`, `search_history` (all RLS owner-only + explicit grants, since Apr 2026 new tables are NOT auto-exposed to the Data API). Supabase Storage — private `user-files` bucket, paths namespaced `<user_id>/...`. Static catalogue (`scholarships.js`, `details/*.js`) unchanged; new generated `match-index.js`.
**Testing**: Manual acceptance via `quickstart.md` checklist (consistent with features 001/002) + browser validation via local Chromium/Node harness (Playwright MCP unavailable per project memory). Security verification via Supabase advisors (`get_advisors` MCP) after schema changes.
**Target Platform**: Modern evergreen browsers served over **http(s)** — OAuth redirects cannot return to `file://`, so account features require serving (dev: `npx http-server` on localhost, registered in Supabase redirect allow-list). On `file://` the site still works anonymously; account UI degrades to a "serve over http" notice.
**Project Type**: Static multi-page web application + backend-as-a-service (no custom server code).
**Performance Goals**: Session restore + nav account UI render without blocking first paint (auth state resolved asynchronously, < 500 ms typical). Saved/badge state on listing renders in one batch query per page load. Matching is client-side over ~170 items (instant).
**Constraints**: No frameworks/build system; only the publishable (anon) key ships in the client — never service_role; every table RLS-enabled with `TO authenticated` + `(select auth.uid()) = user_id` (UPDATE policies need USING **and** WITH CHECK; storage upsert needs INSERT+SELECT+UPDATE); `user_metadata` never used for authorization. Supabase MCP is configured **read-only** — schema applied via dashboard SQL editor (or temporarily lifting read-only), captured in `contracts/db-schema.md`.
**Scale/Scope**: ~170 scholarships (static), low-thousands of users. 1 new HTML page, 1 shared auth module, 2 page-script updates, CSS additions, 1 PowerShell build script, ~6 tables + 1 bucket.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) remains an unpopulated template with no ratified principles — no concrete gates to enforce. The design keeps the implicit simplicity standard from features 001/002: no frameworks, no bundler, static pages; the only addition is a hosted BaaS reached via one pinned CDN script, which is the minimal way to satisfy accounts/uploads/cross-device sync (FR-001..023) without running a server.

**Result**: PASS (pre-research and post-design; Complexity Tracking not required).

## Project Structure

### Documentation (this feature)

```text
specs/003-user-auth-profiles/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── db-schema.md     # Tables, RLS, grants, storage bucket + policies (SQL)
│   ├── auth-flows.md    # Sign-up/in, OAuth, linking, verification, sign-out, action-resume
│   └── ui-behavior.md   # Gating, saved/history/search UX, account tabs, matching surfaces
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html                          # + nav account slot (Sign in button / avatar menu), "Recommended for you" strip container, auth modal include
index.js                            # Save hearts → Supabase-backed (id-keyed, was index-keyed Set); search-history capture (debounced, signed-in only); match badges + recommended strip render
index.css                           # + auth modal, nav account menu, account page, badges, banner, recommended strip styles
scholarship.html                    # + nav account slot + auth/config scripts
scholarship.js                      # + record view_history on load (signed-in); save button; match badge on detail header
account.html                        # NEW: account page shell — tabs: Profile | Saved | History | Settings
account.js                          # NEW: profile form (fields, photo, certificates, languages+CEFR), saved list, view/search history, linked sign-in methods (view + connect), account deletion request, sign-out
auth.js                             # NEW shared module (every page): createClient, session state, nav UI, auth modal (email+password, 4 social buttons), soft-verification banner, pending-action resume, gating helper
match.js                            # NEW shared: computeMatch() scoring + cached profile fetch (used by index.js, scholarship.js)
supabase-config.js                  # NEW: window.SUPABASE_URL + window.SUPABASE_PUBLISHABLE_KEY (publishable key only — safe to commit)
match-index.js                      # NEW, GENERATED: window.MATCH_INDEX = { <id>: { levels, countries?, languages?, nationality_note? } }
theme.js / scholarships.js / details/  # Unchanged
ScholarShips_Data/
├── build_match_index.ps1           # NEW: parse details/<id>.json EN sections (headers like "Eligible nationalities", "Language of study") → ../match-index.js; unknown → neutral
└── (existing scripts/data unchanged)
```

**Structure Decision**: Keep the flat static-site layout; accounts are added as one shared module (`auth.js`) included on all three pages plus one new `account.html` page with tabs (Profile/Saved/History/Settings) rather than four separate pages — one nav integration point, one place to gate. All persistence goes straight from the browser to Supabase (RLS is the security boundary; no server of our own). Matching stays client-side: structured level/country data from the catalogue plus a **generated** `match-index.js` built by PowerShell from already-extracted detail text — no new scraping, and unknown eligibility renders as neutral (positive badges only), never a false "Not eligible".

## Complexity Tracking

> No constitution violations; no entries required.
