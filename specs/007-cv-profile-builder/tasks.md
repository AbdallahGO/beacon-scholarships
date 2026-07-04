---
description: "Task list for Feature 007 — CV-style profile builder"
---

# Tasks: CV-Style Profile Builder

**Input**: Design documents from `/specs/007-cv-profile-builder/`
**Prerequisites**: plan.md, spec.md, research.md (R1–R14), data-model.md, contracts/{db-schema, cv-contract, ui-behavior}.md, quickstart.md

**Tests**: No automated test tasks — this project validates manually via `quickstart.md` + the local Chromium/Node harness ([[browser-validation-setup]]), consistent with features 001–006. Each story ends with a manual validation checkpoint; `node --check` + Supabase `get_advisors` run in Polish.

**Organization**: Grouped by user story (US1–US7) in priority order. **File-sharing reality**: almost all implementation lands in two new files — `cv-builder.js` and `cv-builder.css` — so genuine parallelism (`[P]`) exists only across the distinct files in Setup/Polish. Within a story, tasks touch the same file and run sequentially.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different file, no dependency on an incomplete task
- **[Story]**: US1–US7 (setup/foundational/polish carry no story label)
- Paths are repository-root relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Files, migration, and page wiring so the module has somewhere to mount.

- [ ] T001 [P] Append the dated, idempotent **feature-007** section to `supabase-setup.sql` exactly per `specs/007-cv-profile-builder/contracts/db-schema.md` (`alter table public.profiles add column if not exists cv jsonb;` + `add column if not exists cv_theme text;` + the two `comment on column` lines). No policies/tables.
- [ ] T002 [P] Edit `account.html`: add the Google-Fonts `<link>` (Poppins, Archivo Black/Anton, Playfair Display, Cormorant, Montserrat, Great Vibes, Inter; `display=swap`), and add `<link rel="stylesheet" href="cv-builder.css">` + `<script src="cv-builder.js"></script>` (after `account.js` deps). Give `#pane-profile` a full-bleed capability hook (e.g. class `acct-pane--cv`) for the wide builder.
- [ ] T003 [P] Create `cv-builder.js` as an IIFE exposing `window.BeaconCV = { mount(paneEl, ctx) }` (stub returning a `teardown()`), and create `cv-builder.css` with a base 3-zone layout scaffold (picker strip / ~380px sidebar / fluid preview) + the `acct-pane--cv` full-bleed rule.

**Checkpoint**: page loads with the two new files; `BeaconCV.mount` is callable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: State, mount/teardown, load/save plumbing, the pure render skeleton, and the Aurora-Glass base — every story needs these. All in `cv-builder.js` / `cv-builder.css` / `account.js` (sequential).

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [ ] T004 In `cv-builder.js`: state core — `defaultProfile()` factory (data-model §2, incl. `skills: []`), `getByPath`/`setByPath` (dotted keys + numeric array indices, auto-create intermediates), `normalizeLoaded(cv)` (coerce old/absent shapes; ensure arrays), and a static `THEMES` registry (8 ids + name + accent(s) + archetype, default `editorial`).
- [ ] T005 In `cv-builder.js` + `account.js`: `mount(pane, ctx)` builds the shell (theme-picker container, glass sidebar container, preview container with back/front layers) and returns `teardown()` (clear debounce timer, remove listeners, revoke object URLs). In `account.js`, rewrite `renderProfile()` to clear `#pane-profile` and call `BeaconCV.mount(pane, { db, user, A, esc, BUCKET:'user-files', bumpProfileRev, fmtDate, uuid })`; store the teardown and invoke it when leaving the Profile tab (in `render()`, mirroring the ticket-countdown cleanup).
- [ ] T006 In `cv-builder.js`: **load** — fetch the `profiles` row (`select *`, `eq user_id`, `maybeSingle`); if `cv` present → `normalizeLoaded`; else **seed** from flat columns (R14: `contact.fullName ← full_name`|`first_name last_name`); populate the ticket-card `flat` state from `nationality`/`degree`/`field_of_interest`; default `contact.email` to `user.email` if blank; resolve theme from `cv_theme`||`cv.theme`||`editorial`.
- [ ] T007 In `cv-builder.js`: **save** — `scheduleSave()` debounced ~800 ms → `upsert profiles { user_id, cv, cv_theme, full_name (mirror), nationality, degree, field_of_interest }` (degree `''`→`null`); a subtle "Saved ✓" indicator; write a `sessionStorage` draft (`beacon.cvDraft`) on every change, restore it on mount with a gentle `A.toast`, and clear it after a successful save.
- [ ] T008 In `cv-builder.js`: **`renderPreview(profile)`** — pure builder of the `.cv` skeleton per `contracts/cv-contract.md §2` (header + 7 sections, stable classes + data hooks, `data-theme` + `cv--arch-*` class); every interpolation via `esc()`; `dir="auto"` on content text; **omit empty sections/entries** entirely (FR-005); photo slot = img|silhouette|omitted by `--photo-shape`.
- [ ] T009 In `cv-builder.css`: Aurora-Glass base + preview base — glass card/input/button/chip/tab tokens (spec §5), the **fixed aurora gradient** sidebar backdrop, `backdrop-filter` feature-fallback (higher-opacity solid, contrast ≥ 4.5:1), and base `.cv` typography/spacing + preview back/front layer stacking.

**Checkpoint**: an empty builder renders; editing state in the console re-renders the preview; a manual `scheduleSave` writes the row.

---

## Phase 3: User Story 1 — Build a profile as a live, auto-saving CV (Priority: P1) 🎯 MVP

**Goal**: Student edits all 7 sections and sees the preview update every keystroke; work auto-saves and restores on reload (default theme).

**Independent Test**: Type into each section → preview updates live → "Saved ✓" → reload → data restored; new account shows empty builder with no error.

- [ ] T010 [US1] In `cv-builder.js`: render the sidebar **section cards** (Contact, Objective, Education, Experience, Honors, Skills & Strengths, Activities) as Aurora-Glass cards with real `<label>`s and `data-path` inputs; single existing/seed entry for repeatables (add/remove comes in US4); Objective as a textarea; Skills as a chip input (Enter/`+` add, `×` remove → `skills[]`).
- [ ] T011 [US1] In `cv-builder.js`: one **delegated** `input`/`change` listener on the sidebar → `setByPath(profile, path, value)` → `renderPreview(profile)` → `scheduleSave()`; ensure inputs and preview share no DOM (FR-001). Verify keystroke→preview (SC-001), autosave + "Saved", reload restore (SC-003), and empty sections render nothing.
- [ ] T012 [US1] In `cv-builder.js` + `cv-builder.css`: first-run empty state (no error, no dangling controls) + email default + draft-restore notice; minimal `editorial` styling good enough to read the CV (full theming in US3).

**Checkpoint**: US1 is a usable MVP — fill a CV, it renders and persists.

---

## Phase 4: User Story 2 — Keep scholarship-ticket & admin data correct (Priority: P1)

**Goal**: The fields ticket-checkout + admin depend on stay captured and correct after the form is replaced.

**Independent Test**: Fill name + the 3 ticket fields → `profiles` row holds mirrored `full_name` + `nationality`/`degree`/`field_of_interest`; book a ticket → reveal is correct.

- [ ] T013 [US2] In `cv-builder.js` + `cv-builder.css`: render the **"For your scholarship ticket"** glass card at the sidebar footer (distinct styling + explanatory copy) — Nationality (text + `countryList` datalist), Highest degree (`<select>`: —/High school/Bachelor/Master's/PhD), Field of interest (text). Inputs use `data-flat`; writes update the `flat` state (not `cv`) and seed from the loaded flat columns.
- [ ] T014 [US2] In `cv-builder.js`: fold the flat fields into the save upsert (mirror `full_name` from `contact.fullName`; write `nationality`/`degree`/`field_of_interest`; `''`→`null`; keep `degree` within the enum). Confirm `ticket-checkout` (unchanged) reveal + admin Accounts pane read correct values (SC-004); confirm removing the old form dropped no prior data (SC-008).

**Checkpoint**: booking a ticket after using the builder reveals correct name/nationality/degree/field-of-interest (no backend edits).

---

## Phase 5: User Story 3 — 8 themes without data loss (Priority: P2)

**Goal**: Pick any of 8 themes; identical data re-renders in the new design; choice persists; sidebar look never changes.

**Independent Test**: Enter data → cycle all 8 themes → every one renders the same data correctly, no loss, no overflow → reload keeps the last theme.

- [ ] T015 [US3] In `cv-builder.js`: **theme picker** — render 8 swatch cards from `THEMES` (accent colors + name + archetype glyph; **not** the sample images), clear active state; select → set `profile.theme`, set `.cv` `data-theme` + `cv--arch-*`, `renderPreview`, `scheduleSave` (writes `cv_theme`); apply saved theme on mount.
- [ ] T016 [US3] In `cv-builder.css`: the **3 archetype** layout classes `cv--arch-a` (side-column: monolith/editorial), `cv--arch-b` (header-stack: gridpop/starlight/terracotta/neon), `cv--arch-c` (timeline connector + node dots: timeline/signature) — laying out the same skeleton three ways off the stable section classes.
- [ ] T017 [US3] In `cv-builder.css`: **8 `[data-theme]` token blocks** + decor per `data-model.md §4` table (colors, `--font-*`, `--label-style`, `--photo-shape`, `--skill-style`) with inline-SVG/CSS decor (sparkles/blobs/hexagons/grid/diamond/timeline/neon-glow). Verify contrast on each, especially `neon`/`signature` (add a text scrim if a glow reduces legibility).
- [ ] T018 [US3] In `cv-builder.js`/`cv-builder.css`: **decorative** skill-style rendering driven by `.cv-skills[data-style]` (bar/percent/chips/dots) — full/uniform fills, never a student-entered number (FR-003a).

**Checkpoint**: all 8 themes switch with zero data loss (SC-002), all 3 archetypes correct (FR-016), sidebar unchanged (FR-017), no horizontal overflow (SC-006).

---

## Phase 6: User Story 4 — Manage repeatable sections (Priority: P2)

**Goal**: Add/remove/reorder Education, Experience, Honors, Activities; multi-bullet Experience; empty sections vanish.

**Independent Test**: Add several entries, add/remove bullets, reorder, delete one → preview matches at each step; clear a section → its header disappears.

- [ ] T019 [US4] In `cv-builder.js`: per-section **repeatable controls** — round `+ Add [entry]` (push blank to the array), `×` remove (splice), and **↑/↓ move** (swap) for education/experience/honors/activities; each op mutates the array → `renderPreview` (indices re-derived) → `scheduleSave`; empty array → section omitted.
- [ ] T020 [US4] In `cv-builder.js`: Experience **bullets** mini-list — `+ Add bullet` / `×` on `experience[i].bullets[]`, live-synced like any `data-path`.
- [ ] T021 [US4] In `cv-builder.js` + `cv-builder.css`: optional **drag-to-reorder** progressive enhancement (pointer events, drag handle) on top of the ↑/↓ buttons — buttons remain the accessible baseline (FR-025).

**Checkpoint**: repeatable sections fully manageable by keyboard and (optionally) drag.

---

## Phase 7: User Story 5 — Certificates backdrop carousel (Priority: P2)

**Goal**: Uploaded certificates form a dimmed backdrop behind the CV; empty → plain theme bg; certs never themed content.

**Independent Test**: No certs → clean bg, no arrows; upload 2 images + 1 PDF → dimmed slides, arrows/swipe work, CV stays legible, PDF shows a placeholder slide.

- [ ] T022 [US5] In `cv-builder.js`: re-home the **certificates sidebar card** — reuse `account.js` cert logic (validate PDF/JPG/PNG ≤10 MB, upload to `user-files/{uid}/certificates/…`, insert/delete `certificates` rows, list with view/remove); refresh the carousel on add/remove.
- [ ] T023 [US5] In `cv-builder.js` + `cv-builder.css`: **backdrop carousel** (independent reader of `certificates` only, FR-020) — image slides via `createSignedUrl`, **PDF → themed placeholder slide** (doc glyph + `file_name`); dim (`blur(2px) brightness(.55)`) + theme scrim; desktop edge-gutter arrows; touch swipe on the Preview region only; empty → no layer/controls (FR-019).
- [ ] T024 [US5] In `cv-builder.css`: per-theme **scrim variables** tuned so `.cv` text stays contrast ≥ 4.5:1 over any slide (darker scrim on light themes, lighter on dark; extra care on `neon`) (SC-005).

**Checkpoint**: backdrop legible on all themes; PDFs placeholdered; images real; separation of concerns intact.

---

## Phase 8: User Story 6 — Personal photo (Priority: P3)

**Goal**: Uploaded photo fills the theme's photo shape and stays in sync with the nav avatar; no-photo shapes handled gracefully.

**Independent Test**: No photo → silhouette in shape; upload → shows in shape + nav avatar updates; `--photo-shape:none` theme omits it.

- [ ] T025 [US6] In `cv-builder.js`: **photo** in the Contact card — reuse the existing pipeline (upload to `user-files/{uid}/photo/photo.<ext>` `upsert`; set `profiles.photo_path`; `createSignedUrl(1h)`; cache `localStorage beacon.avatarUrl`; call `bumpProfileRev()` for nav sync); cache the URL in `cv.contact.photoUrl` and re-sign from `photo_path` on load if empty/expired; neutral silhouette when absent; `--photo-shape:none` omits the slot (FR-022/023).

**Checkpoint**: photo consistent across themes and with the nav avatar.

---

## Phase 9: User Story 7 — Mobile & accessibility (Priority: P3)

**Goal**: Phone layout is Edit/Preview tabs + theme sheet; the builder is fully keyboard-operable and contrast-safe.

**Independent Test**: <~900px shows single column with sticky Edit/Preview switch + theme sheet; whole builder usable by keyboard; no horizontal overflow anywhere.

- [ ] T026 [US7] In `cv-builder.css` + `cv-builder.js`: **responsive** — under ~900px collapse to a single column with a sticky bottom **Edit ⇆ Preview** switch and a compact theme button opening the picker as a **bottom sheet**; bind backdrop swipe to the Preview tab only (FR-024).
- [ ] T027 [US7] Cross-cutting **a11y pass** in `cv-builder.js`/`cv-builder.css`: real/sr-only labels on every control, keyboard reorder via ↑/↓, visible focus rings (violet), and a contrast audit on glass + dark/neon themes + over the backdrop (FR-025); confirm no horizontal page overflow in any theme (SC-006).

**Checkpoint**: all 7 stories independently functional.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T028 In `account.js`: remove the now-dead old profile handlers (`loadProfile`, `renderPhoto`, `onPhotoUpload`, `renderCertList`, `onCertUpload`, `renderLangList`, `refreshLangs`, `onLangAdd`, the old `renderProfile` body) and any now-unused constants; **keep** `deleteAccount()`'s row-cleanup list (still deletes `certificates` + `profile_languages`) and shared helpers still used elsewhere. Confirm `profile_languages` is untouched (FR-027) and there is no Download-PDF control (FR-028).
- [ ] T029 Run the full `quickstart.md` acceptance checklist via the browser harness ([[browser-validation-setup]]); fix any gaps. Include the RLS cross-user probe (a second user cannot read another's `cv`, FR-008) and the ticket regression (SC-004).
- [ ] T030 Syntax + advisors: `node --check cv-builder.js` and `node --check account.js`; after the owner applies the migration, run `mcp__supabase__get_advisors` (security + performance) and confirm no new findings.
- [ ] T031 [P] Docs/memory: tick `spec.md`/`quickstart.md` acceptance boxes as verified, refresh the feature-007 memory note, and note `themes/` is reference-only (not shipped).

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** blocks everything → **US1..US7 (P3–P9)** → **Polish (P10)**.
- **US1 (P1)** is the MVP. **US2 (P1)** is the non-regression guarantee — do it immediately after US1 (both are P1). US3–US7 build on the US1 loop.
- Story order is also a natural build sequence here because they share `cv-builder.js`/`cv-builder.css`.

### Within-story order
Sidebar render → live-sync → save/mirror → theme/CSS → validation checkpoint.

### Parallel opportunities (limited by shared files)
- **Setup**: T001 (`supabase-setup.sql`), T002 (`account.html`), T003 (new files) are `[P]` — distinct files.
- **Polish**: T031 (docs) is `[P]`.
- Everything else edits `cv-builder.js`/`cv-builder.css` (and some `account.js`) → **sequential**. The 8 theme token blocks (T017) are logically independent but live in one file — do them as one task, not parallel.

---

## Implementation Strategy

1. **Setup + Foundational** → shell renders, load/save plumbing works.
2. **US1** → fill/preview/save loop (MVP) → validate → (demo-able).
3. **US2** → mirror + ticket card → **book a test ticket to confirm no regression** (highest-risk check).
4. **US3** → all 8 themes + archetypes → validate zero-loss switching.
5. **US4 → US5 → US6 → US7** → repeatables, certificates backdrop, photo, responsive/a11y — each validated at its checkpoint.
6. **Polish** → strip old code, run quickstart + advisors, docs.

## Notes
- `[P]` = different file, no dependency. Most tasks here are not `[P]` (two shared files).
- Commit after each task or logical group.
- Each story has a manual validation checkpoint (no automated tests per project convention).
- Keep the section-2 decoupling invariant at every step: inputs write only to `profile`/`flat`; preview reads only `profile`; carousel reads only `certificates`.
