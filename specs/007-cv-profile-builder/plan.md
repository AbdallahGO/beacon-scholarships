# Implementation Plan: CV-Style Profile Builder

**Branch**: `007-cv-profile-builder` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-cv-profile-builder/spec.md` · Authoritative design detail: `themes/beacon-cv-profile-builder-spec.md`

## Summary

Replace the account **Profile** tab's formal form with a **CV/résumé builder**: a glassmorphic "Aurora Glass" edit **sidebar** (left) drives a **live CV preview** (right) that re-renders on every keystroke, in one of **8 themes** chosen from a picker. Behind the preview sits a **certificates backdrop carousel** (the one kept piece of the old form). The whole thing obeys one rule — **data and theme are fully decoupled**: sidebar inputs only write to a single `profile` state object; the preview and the carousel are two independent read-only consumers of it.

**Persistence (stakeholder-decided).** No new table. Add two columns to the existing `public.profiles` row: **`cv jsonb`** (the whole CV object) and **`cv_theme text`** (the chosen theme id). A debounced (~800 ms) upsert writes both, and in the **same upsert mirrors** the fields other flows depend on — `full_name` (from `contact.fullName`) plus `nationality` / `degree` / `field_of_interest` (from a small dedicated "For your scholarship ticket" sidebar card). This keeps `ticket-checkout` (the ticket reveal) and the admin Accounts pane working unchanged, because they read those flat columns.

**Scope.** All **8 themes** (`editorial, terracotta, neon, timeline, monolith, gridpop, starlight, signature`) across the **3 archetypes** (A side-column, B header-stack, C timeline). **Skills** is a single soft/personal-strengths chip list (scholarship CV, not work CV). **PDF** certificates show a themed placeholder slide in the backdrop (image certs render directly). The old **Languages** sub-form is dropped from the UI (data untouched). **Download-PDF export is out of scope.**

**No backend/edge-function code changes.** This feature is pure client + one additive SQL migration. `ticket-checkout` and `admin.js` are *unchanged* — the mirror keeps their inputs valid.

## Technical Context

**Language/Version**:
- *Client only*: HTML5, CSS3, vanilla JavaScript (ES2020, browser). New `cv-builder.js` + `cv-builder.css`; `account.js` `renderProfile()` becomes a thin delegate. No framework, no bundler, no build step — matches features 003–006.
- Windows PowerShell 5.1 / Node 24 for local tooling only. **No Python** ([[no-python-preference]]).

**Primary Dependencies**:
- `@supabase/supabase-js` v2 (already loaded on `account.html`, pinned CDN `2.108.1`) via the existing `window.BeaconAuth` (`auth.js`) — reused for load/save, photo upload, certificate reads. No new runtime dependency.
- Existing shared helpers reused: `A.toast()`, `esc()`, the `user-files` Storage bucket, `bumpProfileRev()` + `beacon.avatarUrl` (nav-avatar sync).
- Google Fonts (Poppins, Archivo Black/Anton, Playfair Display, Cormorant, Montserrat, Great Vibes, Inter) — one extra `<link>` on `account.html`, `display=swap`, non-blocking. Decorative shapes are inline SVG/CSS (no image assets shipped for themes).

**Storage**: Supabase Postgres. **Only change**: `alter table public.profiles add column if not exists cv jsonb;` and `add column if not exists cv_theme text;`. Mirror targets (`full_name`, `nationality`, `degree`, `field_of_interest`) already exist. Existing per-row RLS (`own select/insert/update/delete`, `auth.uid() = user_id`) and the feature-006 admin `select all` already cover the new columns — **no new policies**. The `profiles_touch` trigger keeps `updated_at` fresh. Certificates come from the existing `public.certificates` table + `user-files` bucket; photo stays at `user-files/{uid}/photo/…` via `profiles.photo_path`.

**Testing**: Manual acceptance via `quickstart.md` (consistent with 001–006) + the local Chromium/Node browser harness ([[browser-validation-setup]]). `node --check cv-builder.js` + `node --check account.js` for syntax. Supabase `get_advisors` (security + performance) after the migration. Regression probe: after using the builder, book a ticket and confirm the reveal still shows name/nationality/degree/field-of-interest (SC-004); confirm a second user cannot read another's `cv` (RLS, SC — `auth.uid()` scope).

**Target Platform**: Modern evergreen browsers over http(s) (auth/session needs a real origin; validated on the local http-server harness, not `file://`). Desktop 3-zone layout; phone (<~900px) Edit/Preview tabs.

**Project Type**: Static multi-page web app + backend-as-a-service (Supabase). One existing page (`account.html`) gains two files and one `<link>`; **no edge functions**.

**Performance Goals**: Live preview re-render is a pure function of `profile` — cheap full re-render on each keystroke is acceptable at this scale (one CV, <~50 entries); if a keystroke ever feels heavy, the render is idempotent and can be diffed later. Autosave debounced ~800 ms. First paint shows the empty builder immediately; saved data + photo + fonts hydrate asynchronously (FR-026).

**Constraints**:
- **Decoupling is the security-of-correctness boundary** (FR-001/020): inputs write only to `profile`; the theme renderer reads `profile` (never `certificates`); the backdrop carousel reads only `profile.certificates`. Inputs and CV never share DOM.
- Only the publishable (anon) Supabase key ships to the client; **RLS is the data boundary** — every read/write of `cv`/`cv_theme` is `auth.uid() = user_id`.
- **No inline ad-hoc SQL to the owner** ([[sql-via-paste-ready-file]]): the migration is a dated, idempotent block appended to `supabase-setup.sql`; Supabase MCP stays read-only (advisors only). The owner pastes the file.
- **No regression to paid flows**: `ticket-checkout` and `admin.js` are not edited; the mirror preserves their inputs. Removing the old form must not drop existing `profiles` data (FR-013/SC-008).
- Bilingual/RTL: the account page is bilingual elsewhere, but the CV builder ships **English-first** UI labels for this pass (the CV content itself is whatever the student types, any language/dir). (Assumption; see research R12.)
- Accessibility: real `<label>`s (visually-hidden allowed), full keyboard operation incl. non-drag reorder, contrast ≥ 4.5:1 on glass and on dark/neon themes and over backdrops (FR-025).

**Scale/Scope**: New client surface: `cv-builder.js` (state + sidebar + live-sync + persistence + theme picker + certificates carousel + `renderPreview`), `cv-builder.css` (Aurora Glass sidebar system + preview engine + 8 theme token blocks + 3 archetype layouts + responsive + a11y). Edited: `account.js` (`renderProfile` → delegate; remove old form/photo/cert/language handlers that move into the builder), `account.html` (load 2 files + fonts link). One SQL migration section. Zero backend functions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unpopulated template — no ratified principles, no concrete gates. The design preserves the implicit standard of features 001–006: **no framework, no bundler, static pages, persistence behind RLS, privileged/secret logic server-side.** This feature is strictly *less* complex than 006 — it adds **no** edge functions, **no** new tables, **no** new RLS policies; only two additive columns and two client files.

**Simplicity notes:**
- Reuses the existing profile row, certificate store, photo pipeline, auth module, and toast — additive only.
- One markup skeleton + CSS token themes (not 8 hand-built documents) keeps the theme surface small (FR-016).
- The one genuine subtlety — keeping the shared `profiles` contract valid after replacing the form — is handled by the smallest possible mechanism (mirror on save + a 3-field card), not by touching `ticket-checkout`/`admin.js`.

**Result**: PASS (pre-research). Re-evaluated post-design (below) — still PASS; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/007-cv-profile-builder/
├── plan.md              # This file
├── research.md          # Phase 0 — R1..R14 decisions (storage, decoupling, theme engine, glass, carousel, photo, skills, reorder, fonts, autosave, responsive, layout breakout, account.js integration, i18n)
├── data-model.md        # Phase 1 — profiles +cv/+cv_theme, the `profile` (cv) JSON object, section→CV mapping, mirror map, theme token contract
├── quickstart.md        # Phase 1 — owner setup (paste SQL section) + full acceptance checklist mapped to FRs/SCs
├── contracts/           # Phase 1
│   ├── db-schema.md         # Idempotent SQL appended to supabase-setup.sql (2 columns; no new policies) + verification queries
│   ├── cv-contract.md       # The `profile` data object, canonical section→CV mapping, mirror-on-save contract, theme token contract, 8-theme table
│   └── ui-behavior.md       # Zones/layout, Aurora Glass sidebar cards, live-sync (data-path), theme picker, certificates backdrop, responsive tabs, a11y, empty states
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
account.html               # CHANGED: add Google-Fonts <link>; load cv-builder.css + cv-builder.js; pane-profile becomes the builder mount point (may gain a full-bleed wrapper).
account.js                 # CHANGED: renderProfile() → thin delegate that mounts window.BeaconCV into #pane-profile and tears it down on tab-away. REMOVE the old profile form, photo card, certificate card, and Languages sub-form + their handlers (logic migrates into cv-builder.js). Keep all other panes (inbox/ticket/saved/history/settings) untouched. Keep deleteAccount()'s cleanup list (still removes profile_languages/certificates rows) unchanged.
cv-builder.js              # NEW: IIFE exposing window.BeaconCV.mount(paneEl, ctx). Holds: profile state + setByPath/getByPath; load (hydrate cv, seed from flat columns on first run) + debounced save (cv + cv_theme + mirror) + "Saved" toast + draft preservation; sidebar render (Aurora Glass cards, incl. the "For your scholarship ticket" card) + input live-sync; repeatable add/remove/reorder (+move up/down); theme picker (8) + persistence; renderPreview(profile) (skeleton + [data-theme] + archetype class); certificates backdrop carousel (arrows/swipe, PDF placeholder, scrim); photo upload (reuse photo_path pipeline + nav-avatar sync).
cv-builder.css             # NEW: Aurora Glass sidebar token system; preview engine (semantic CV skeleton) + 3 archetype layout classes (A/B/C); 8 [data-theme] token blocks + decor; backdrop-carousel + scrim; responsive Edit/Preview tabs + theme sheet; print-safe-ish base (no PDF export this pass); a11y (focus rings, sr-only labels, contrast).
supabase-setup.sql         # CHANGED: append dated idempotent "feature 007" section — alter profiles add cv jsonb, add cv_theme text (+ short comment). No new policies (existing own-scoped + admin select-all cover new columns).
CLAUDE.md                  # CHANGED: SPECKIT marker repointed to specs/007-cv-profile-builder/plan.md.
themes/                    # REFERENCE ONLY (not shipped): beacon-cv-profile-builder-spec.md (authoritative design), AI.jpg (Aurora Glass ref), 8 sample-résumé images (design-language refs, never copied as content).
```

**Structure Decision**: Keep the flat static-site layout and the feature-003/004/005 client module pattern (an IIFE that hangs one `window.Beacon*` namespace and is loaded by `account.html`). The builder is **one JS module + one CSS file**, mounted into the existing `#pane-profile` by `account.js` — the same delegation style `account.js` already uses for other panes. The theme engine is **one skeleton + CSS custom-property token blocks** scoped by `[data-theme="…"]`, with three layout-archetype classes, so adding/adjusting a theme is a token edit, not new markup. All privileged state stays in the single `profile` object; persistence is a single owner-scoped upsert. No server code is introduced.

## Complexity Tracking

> No Constitution violations — table intentionally empty. (This feature removes complexity relative to 006: no edge functions, no new tables, no new policies.)
