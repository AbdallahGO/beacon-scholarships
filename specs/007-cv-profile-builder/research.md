# Phase 0 Research: CV-Style Profile Builder

All decisions below feed `plan.md`, `data-model.md`, and `contracts/`. Nothing is left as NEEDS CLARIFICATION. Format per item: **Decision / Rationale / Alternatives considered.**

---

## R1 — Persistence shape: extend `profiles`, don't add a table

**Decision**: Add `cv jsonb` (whole CV object) and `cv_theme text` (theme id) to `public.profiles`. On every save, one upsert writes `{ cv, cv_theme, full_name, nationality, degree, field_of_interest, updated_at(auto) }` for `user_id = auth.uid()`.

**Rationale**: `profiles` is a **shared contract**. `supabase/functions/ticket-checkout/index.ts:53` reads `profiles.*` (`full_name`/`first_name`/`last_name`, `nationality`, `degree`, `field_of_interest`) for the ticket reveal; `admin.js` reads `profiles` for the Accounts pane. A separate `student_profiles` table would silently blank those. Extending the existing row + mirroring keeps both flows correct with **zero** backend/edge-function edits. Matches the source spec §11 "reuse rather than duplicate."

**Alternatives**: (a) New `student_profiles` table + edit `ticket-checkout` + `admin.js` — more surface, needs an edge-function redeploy, higher regression risk. (b) New table, leave backend as-is — guaranteed stale ticket/admin data. Both rejected by stakeholder in favor of extend+mirror.

**Note on theme storage**: `cv_theme` is a first-class column *and* `cv.theme` lives inside the JSON. They are written in the **same upsert** from the same value, so they never drift; `cv.theme` is the source the client reads, `cv_theme` is the queryable column. (Source spec §8 allowed either; we keep both consistently.)

---

## R2 — The decoupling architecture (the core rule, FR-001)

**Decision**: One in-memory `profile` object. Sidebar inputs carry `data-path` (e.g. `contact.email`, `education.2.gpa`, `skills.1`) and on `input` call `setByPath(profile, path, value)` → `renderPreview(profile)` → `scheduleSave()`. `renderPreview` is a **pure** function that rebuilds the CV markup from `profile` + `profile.theme`. The certificates backdrop is a **separate** consumer that reads only `profile.certificates`.

**Rationale**: Inputs and CV never share DOM, so switching themes or reordering never "crushes" input (spec §2). One event-delegated listener on the sidebar handles all fields (no per-input wiring), which keeps repeatable add/remove/reorder trivial (mutate the array, re-render).

**Alternatives**: Two-way binding libraries / framework state — rejected (no framework, no build step). Per-field listeners — rejected (brittle with dynamic repeatable entries).

---

## R3 — Theme engine: one skeleton + `[data-theme]` CSS tokens + 3 archetype classes

**Decision**: `renderPreview` builds **one** semantic skeleton (`.cv` root with header + sections + entries, stable class names + data hooks). The active theme sets `data-theme="<id>"` on `.cv` and an archetype class (`cv--arch-a|b|c`). All 8 themes' CSS ships together, each block scoped `[data-theme="id"]` setting custom properties (`--bg --surface --ink --muted --accent --accent-2 --font-display --font-body --label-style --photo-shape --skill-style`). Layout differences beyond tokens come from the 3 archetype classes (A side-column, B header-stack, C timeline).

**Rationale**: Avoids 8 hand-built documents (FR-016); a new theme is a token block + optional decor. Archetypes capture the only real structural differences.

**Alternatives**: Separate template per theme — rejected (duplication, drift). Pure-token (no archetype class) — rejected: side-column vs timeline are structural, not just color.

**Archetype assignment** (from source spec §7): A → `monolith`, `editorial`; B → `gridpop`, `starlight`, `terracotta`, `neon`; C → `timeline`, `signature`. Build order to validate all three early: `editorial` (A) → `terracotta` (B) → `timeline` (C) → `neon` (B/dark) → then `monolith`, `gridpop`, `starlight`, `signature`.

---

## R4 — Aurora Glass sidebar (from AI.jpg), constant across themes

**Decision**: Recreate the "Liquid Glass Kit" language for **inputs only**. Tokens: card `rgba(255,255,255,.14)` + `backdrop-filter: blur(20px) saturate(140%)` + `1px solid rgba(255,255,255,.35)` + radius 22 + `0 8px 32px rgba(31,38,135,.15)`; inputs translucent white pill (radius 14–18) with focus violet `#8b7cf6` ring; primary violet / secondary teal `#4dd0b1` glossy pills; round `+` add buttons; chips with `×`; tabs with animated underline. The sidebar sits on a **fixed soft aurora gradient** (violet→pink→teal) so blur always has color, **regardless of the CV theme** (FR-017).

**Rationale**: Matches the reference and the spec §5; a fixed backdrop guarantees the glass reads on every theme. Feature-detect `backdrop-filter` and fall back to a higher-opacity solid for unsupported browsers (contrast ≥ 4.5:1 either way).

**Alternatives**: Sidebar inherits the CV theme — rejected by spec (sidebar must never change with theme). Real image blur backdrop — unnecessary; a CSS gradient suffices and is cheap.

---

## R5 — Certificates backdrop carousel (reuse existing store; PDF placeholder)

**Decision**: Read the student's existing `public.certificates` rows (already populated by the old form) → for each, a backdrop slide. **Images** (`mime_type image/*`) render via a short-lived signed URL (`createSignedUrl`, matching `account.js`). **PDFs** render a **themed placeholder slide** (document glyph + `file_name`) — no PDF rasterization this pass (clarified). Back layer is dimmed/scrimmed (`filter: blur(2px) brightness(.55)` + a theme-tuned scrim) so CV text stays ≥ 4.5:1. Desktop: edge-gutter left/right arrows; touch: swipe bound to the Preview region only. **Empty** (no certs): back layer is just the theme background — no carousel, no arrows (FR-019).

**Rationale**: Reuses uploads with no migration; the PDF placeholder honors "no build step / no ~1MB PDF.js dep" while images still shine. Separation of concerns: only the carousel reads `certificates` (FR-020) — the theme renderer never sees them.

**Alternatives**: PDF.js CDN to rasterize page 1 — deferred (heavy dep). Exclude PDFs entirely — rejected (PDF-only students would get a blank backdrop with a cert uploaded).

**Upload**: the "Certificates & qualifications" sidebar card reuses `account.js`'s existing `onCertUpload`/`renderCertList` logic (validate type/size, upload to `user-files/{uid}/certificates/…`, insert `certificates` row), moved into `cv-builder.js`; the carousel refreshes on add/remove.

---

## R6 — Photo: reuse the existing `photo_path` pipeline (nav-avatar stays in sync)

**Decision**: Photo uploads reuse `account.js`'s pipeline: upload to `user-files/{uid}/photo/photo.<ext>` with `upsert`, set `profiles.photo_path`, render via `createSignedUrl(1h)`, cache to `localStorage beacon.avatarUrl`, and call `bumpProfileRev()` so the nav avatar refreshes. `cv.contact.photoUrl` only **caches** the current display URL for the preview; the durable pointer is `profiles.photo_path`. On load, if `photoUrl` is empty/expired, re-sign from `photo_path`. Themes with `--photo-shape: none` omit the photo; empty photo → neutral silhouette in the theme's shape (FR-022/023).

**Rationale**: One source of truth for the student's face; keeps the existing nav-avatar contract intact. Signed URLs expire, so we never treat `cv.contact.photoUrl` as authoritative.

**Alternatives**: Store a public URL in `cv` — rejected (bucket is private/user-scoped; signed URLs expire; would desync the nav avatar).

---

## R7 — Skills = single soft/personal-strengths chip list (scholarship CV)

**Decision** (clarified): `skills` is a flat array of short strings (personal strengths: leadership, communication, resilience, teamwork…). One chip input (add via `+`/Enter, remove via `×`). Themes whose design shows "bars/percent/dots" render each skill **decoratively** (uniform full bar / label / dot) — **no** self-rated percentage.

**Rationale**: A scholarship CV values character/soft skills, not a work-style technical/soft split or self-scored bars (unverifiable, discouraged). Keeps the data model and the input UI minimal and honest.

**Alternatives**: `{technical, soft}` split (source §4) — dropped per stakeholder. Per-skill 1–5 level — rejected (awkward self-rating; adds a control to every chip).

**Data-model impact**: `skills` changes from `{ technical:[], soft:[] }` to `[]` (array of strings). The CV "Skills" section renders the single list.

---

## R8 — Repeatable sections: add / remove / reorder without requiring drag

**Decision**: education / experience / honors / activities are arrays; each entry is a glass sub-card with a round `+ Add`, an `×` remove, and **move ↑ / ↓** buttons (array splice). Drag-to-reorder is a progressive enhancement on top of the same array ops (pointer events; no lib). `experience.bullets` is a mini add/remove list inside the entry. Any op mutates the array then `renderPreview` + `scheduleSave`.

**Rationale**: Keyboard/non-drag users must be able to reorder (FR-025). Move-buttons are the accessible baseline; drag is optional polish.

**Alternatives**: HTML5 drag-and-drop only — rejected (poor a11y/mobile). A DnD library — rejected (dependency/build step).

---

## R9 — Fonts & decorative assets

**Decision**: One extra Google-Fonts `<link>` on `account.html` (Poppins, Archivo Black or Anton, Playfair Display, Cormorant, Montserrat, Great Vibes, Inter), `display=swap`, `preconnect` already present. Per-theme `--font-display`/`--font-body` pick from these. Decor (sparkles, blobs, hexagons, grid, diamond frame, timeline connector, neon glow) is **inline SVG / CSS gradients** — no shipped image files. First paint never blocks on fonts (FR-026).

**Rationale**: Free fonts match the reference design languages closely; inline SVG/CSS keeps the repo asset-free and offline-safe on Cloudflare Pages.

**Alternatives**: Self-hosted font files — heavier repo, no clear benefit here. Raster décor — rejected (scaling, weight).

---

## R10 — Autosave, draft preservation, "Saved" indicator

**Decision**: Debounce ~800 ms after the last change, then upsert (R1). Show a subtle "Saved ✓" toast/indicator (reuse `A.toast()` or a small inline pill). Preserve in-progress edits across a mid-edit session expiry by writing the `profile` object to `sessionStorage` on input (mirrors `account.js`'s `beacon.profileDraft`), restored on next mount with a gentle notice; cleared after a successful save (FR-009).

**Rationale**: Matches existing account behavior and the spec §8; protects against lost work.

**Alternatives**: Explicit Save button — rejected (spec wants auto-save). Per-field PATCH — rejected (the whole object is small; one upsert is simpler and atomic with the mirror).

---

## R11 — Responsive: Edit/Preview tabs + theme sheet (<~900px)

**Decision**: Desktop = 3 zones (theme picker rail/strip + ~380px glass sidebar + fluid preview). Under ~900px, collapse to two toggleable tabs (**Edit** / **Preview**) with a sticky bottom switch, plus a compact theme button that opens the picker as a bottom sheet. Backdrop swipe binds only to the Preview tab (FR-024).

**Rationale**: Sidebar + preview can't coexist on a phone; tabs keep each usable full-width. Prevents swipe/scroll conflicts.

**Alternatives**: Squeeze both side-by-side responsively — rejected (unusable narrow widths).

---

## R12 — Full-width breakout inside the account layout; English-first labels

**Decision**: `#pane-profile` currently lives inside the centered `.account-wrap`. The builder needs near-full width, so the profile pane (only) gets a **full-bleed wrapper** (escape the max-width via a wrapper that spans the viewport / uses `width:100vw` centering, or the pane is styled `.acct-pane--cv` to widen). The builder's own **UI labels** ("Add education", "For your scholarship ticket", etc.) ship **English-first** this pass; the CV **content** is whatever the student types (any language/dir, `dir="auto"` on rendered content blocks).

**Rationale**: The 3-zone builder is cramped in the standard account column. English-first UI keeps the first delivery focused; the rest of the account page's bilingual chrome (nav/footer) is unaffected. `dir="auto"` keeps Arabic CV content readable in the preview.

**Alternatives**: Keep the pane inside the narrow column — rejected (preview too small). Full EN/AR localization of the builder UI now — deferred (larger scope; not a spec requirement).

---

## R13 — Integration with `account.js` (mount / teardown)

**Decision**: `renderProfile()` in `account.js` becomes: clear `#pane-profile`, then `window.BeaconCV.mount(pane, { db, user, A, esc, BUCKET:'user-files', bumpProfileRev })`. `BeaconCV` owns everything inside the pane. On tab-away or re-render, `mount` returns/register a teardown (cancel the debounce timer, remove listeners) so switching tabs doesn't leak timers (parallel to how `renderTicket` clears its countdown interval). The old form/photo/cert/language handlers are **removed** from `account.js`; `deleteAccount()`'s row-cleanup list (which still deletes `certificates`/`profile_languages`) is **kept** unchanged.

**Rationale**: Mirrors the existing pane-delegation pattern; keeps `account.js` lean and the builder self-contained/testable. Reusing `ctx` avoids `cv-builder.js` re-discovering globals.

**Alternatives**: Build the CV inside `account.js` — rejected (that file is already large; the builder is big enough to own its module, per brainstorming's isolation guidance).

---

## R14 — Seeding returning users from existing flat columns (no data loss, SC-008)

**Decision**: On first mount with no `cv` yet but an existing `profiles` row, **seed** the CV from flat columns: `contact.fullName ← full_name` (or `first_name last_name`), and the "For your scholarship ticket" card fields **read/write the flat columns directly** (`nationality`, `degree`, `field_of_interest`), so a returning student immediately sees their prior data. Certificates already show (they read `certificates`). Languages are intentionally not surfaced (data retained). After first save, `cv` is authoritative for CV content; the three ticket-card fields always live in the flat columns.

**Rationale**: Satisfies FR-013/SC-008 ("no previously saved data lost") and gives returning users continuity without a migration script.

**Alternatives**: Start blank — rejected (looks like data loss). A one-time backfill of `cv` from flat columns via SQL — unnecessary; client-side seeding on first mount is simpler and idempotent.

---

## Resolved unknowns summary

| # | Topic | Outcome |
|---|-------|---------|
| R1 | Storage | `profiles + cv jsonb + cv_theme`; mirror name/nationality/degree/field-of-interest |
| R2 | Decoupling | single `profile`, `data-path` inputs, pure `renderPreview`, separate carousel reader |
| R3 | Theme engine | 1 skeleton + `[data-theme]` tokens + 3 archetype classes; build order editorial→terracotta→timeline→neon→rest |
| R4 | Glass sidebar | fixed aurora backdrop; kit tokens; `backdrop-filter` fallback |
| R5 | Certificates | reuse `certificates`; images via signed URL; **PDF = themed placeholder**; scrim per theme; empty→plain bg |
| R6 | Photo | reuse `photo_path` + nav-avatar sync; `cv.contact.photoUrl` is a cache only |
| R7 | Skills | single soft-strength chip array; decorative bars |
| R8 | Reorder | move ↑/↓ buttons (a11y baseline) + optional drag |
| R9 | Fonts/décor | Google Fonts `<link>`; inline SVG/CSS décor |
| R10 | Autosave | ~800ms debounce upsert; sessionStorage draft; "Saved" indicator |
| R11 | Responsive | Edit/Preview tabs + theme sheet < ~900px |
| R12 | Layout/i18n | full-bleed profile pane; English-first UI, `dir="auto"` content |
| R13 | Integration | `BeaconCV.mount(pane, ctx)` + teardown; strip old handlers from `account.js` |
| R14 | Migration | seed CV from flat columns on first mount; ticket-card fields read/write flat columns |
