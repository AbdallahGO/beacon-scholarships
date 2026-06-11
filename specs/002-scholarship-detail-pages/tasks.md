# Tasks: Own Scholarship Detail Pages

**Input**: Design documents from `/specs/002-scholarship-detail-pages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested — the repo has no automated harness; acceptance is manual via `quickstart.md` (consistent with feature 001). No test tasks generated.

**Organization**: Tasks are grouped by user story so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 = own detail pages, US2 = apply via official source, US3 = full catalog coverage

## Path Conventions

Flat static-site layout at repository root (per plan.md): `index.html`, `index.js`, `index.css`, `scholarship.html`, `scholarship.js`, generated `details/`, tooling in `ScholarShips_Data/`.

---

## Phase 1: Setup

**Purpose**: Project structure for the new artifacts

- [X] T001 Create the two output directories with placeholder `.gitkeep` files: `details/` (browser artifacts, repo root) and `ScholarShips_Data/details/` (raw extraction output)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The data pipeline every story consumes — extraction and build scripts per `contracts/detail-content.schema.md`

**⚠️ CRITICAL**: US1–US3 all render or validate content produced here

- [X] T002 Implement `ScholarShips_Data/extract_details.ps1`: read unique `{id, url}` pairs from `ScholarShips_Data/*.clean.json`; for each id fetch the EN page (`Invoke-WebRequest -UseBasicParsing`), regex out the `__NEXT_DATA__` JSON, take `props.pageProps.data.opportunity`; capture `descriptions[]` (header/body), `title`, `transUrl`, `organization.about`, `official_link` candidates in priority order (`redirect_url` → `organization.uni_url` → first outbound non-for9a href in section bodies); fetch the URI-escaped `transUrl` for Arabic the same way; write `ScholarShips_Data/details/<id>.json` (schema §1) and update `ScholarShips_Data/details-manifest.json` (schema §4) after every id; support `-Force`, `-Ids`, `-DelayMs` (default 500), skip ids already `ok` (resumable); UTF-8 output; print ok/partial/failed summary table
- [X] T003 Implement `ScholarShips_Data/build_details.ps1`: for each `ScholarShips_Data/details/<id>.json`, sanitize every section body per schema §3 (strip script/style/iframe/img, strip `on*`/`style`/`data-*` attributes, unwrap `for9a.com` anchors to text, force `target="_blank" rel="noopener"` on kept anchors, unwrap disallowed elements); emit `details/<id>.js` containing `window.__SCHOLARSHIP_DETAIL_CB && window.__SCHOLARSHIP_DETAIL_CB({...});` with non-ASCII escaped as `\uXXXX`; validate id-vs-filename and id-exists-in-catalogue; exit 1 if any generated file still contains a `for9a.com` href (FR-005 gate); print per-file and total counts
- [X] T004 Pipeline smoke test: run `extract_details.ps1 -Ids` with ~10 ids spanning several countries (include one rolling-deadline and, if findable in `details-manifest.json` afterwards, one partial), then run `build_details.ps1`; verify the generated `details/<id>.js` files match schema §2, contain both languages, and contain no for9a hrefs

**Checkpoint**: Real bilingual detail files exist for a sample of scholarships — UI stories can now render them

---

## Phase 3: User Story 1 — View Scholarship Details on Our Own Page (Priority: P1) 🎯 MVP

**Goal**: Card click lands on our own bilingual detail page instead of for9a.com

**Independent Test**: Open `index.html`, click a sample-extracted card → internal `scholarship.html?id=<id>` shows summary + full sections, EN/AR toggle works, back returns to the listing; unknown id shows "not found"

### Implementation for User Story 1

- [X] T005 [P] [US1] Add detail-page styles to `index.css`: page header (flag, title, org, country, tags, funding + deadline pills, thumbnail), content sections (headings, paragraphs, lists), language toggle control, `[dir="rtl"]` adjustments (text-align, list padding), "not found" and "details unavailable" states, responsive behavior matching existing breakpoints (contract R4)
- [X] T006 [P] [US1] Create `scholarship.html`: same nav/footer/fonts as `index.html`; a header region, language-toggle region, sections container, hidden not-found block with "← Back to all scholarships" link to `index.html#browse`; loads `scholarships.js` then `scholarship.js` via `<script>` (no fetch — must work on `file://`)
- [X] T007 [US1] Implement core of `scholarship.js`: parse `?id=` (missing/unknown → not-found state, contract D2); look up the record in `window.SCHOLARSHIPS`; render the summary header immediately from catalogue fields (contract D1) reusing the card's escaping helper and label maps
- [X] T008 [US1] Implement detail loading in `scholarship.js`: define `window.__SCHOLARSHIP_DETAIL_CB`, inject `<script src="details/<id>.js">` after first paint; on callback render sections (header + sanitized body HTML, omit empty sections, contract R1/R2); on script `onerror` or 4 s timeout show the summary-only fallback note (contract D4, FR-007)
- [X] T009 [US1] Implement the language toggle in `scholarship.js` + `scholarship.html`: English/العربية options, default English, persist choice in `localStorage`, re-render sections only on switch (contract L4); Arabic pane wrapped in `dir="rtl" lang="ar"` (L2); disable a language whose content is `null` with "(not available)" (L3, FR-009)
- [X] T010 [US1] Update the card link in `index.js`: replace the `d.url` apply anchor (index.js:116) with `<a class="apply" href="scholarship.html?id=<id>">View details →</a>` — same tab, no `target="_blank"`, no remaining `d.url` href in the rendered listing (contract C1/C2, FR-001/FR-005)
- [X] T011 [US1] Validate Story 1 against `quickstart.md` sections 1, 2, 3, 5 using the Phase-2 sample ids, on both Live Server and `file://`

**Checkpoint**: MVP — visitors browse and read scholarships entirely on our site

---

## Phase 4: User Story 2 — Apply Through the Official Source (Priority: P2)

**Goal**: The detail page's apply path leads to the provider's official destination — never for9a

**Independent Test**: A detail file with `official_link` shows "Apply on official site →" opening the provider's site; one without shows the "How to apply" guidance block instead; no for9a href anywhere on the page

### Implementation for User Story 2

- [X] T012 [US2] Add the apply block to `scholarship.js` + `scholarship.html`: when `official_link` is present render a prominent "Apply on official site →" button (`target="_blank" rel="noopener"`, contract A1); when absent render a "How to apply" note naming the provider organization and pointing the visitor to its official channels (contract A2, Story 2 scenario 2); never render `d.url` or any for9a address (A3)
- [X] T013 [P] [US2] Add the "About the provider" block to `scholarship.js` rendering `org_about` (plain text) when present, with matching styles in `index.css`
- [X] T014 [US2] Validate Story 2 against `quickstart.md` section 4: find an id with `official_link` in `ScholarShips_Data/details/` (if the sample has none, extract a few more ids until one is found or document that none exist in the catalog); verify both apply states and grep the rendered page for `for9a.com` hrefs (zero)

**Checkpoint**: Both apply states work; for9a fully absent from user-facing navigation

---

## Phase 5: User Story 3 — Complete Detail Content for the Whole Catalog (Priority: P3)

**Goal**: Every scholarship across all country files has extracted bilingual content or an explicit flag

**Independent Test**: Manifest covers every unique catalogue id; `ok` ≥ 95% (SC-002); random spot-checks across several countries render full pages

### Implementation for User Story 3

- [X] T015 [US3] Run the full extraction: `ScholarShips_Data/extract_details.ps1` over all unique ids (~170 × 2 languages, ~3–4 min at 500 ms delay); confirm the manifest gains an entry for every catalogue id (FR-008)
- [X] T016 [US3] Review `ScholarShips_Data/details-manifest.json`: re-run the script (default mode retries non-ok ids) for `partial`/`failed` entries; for ids that stay failed (e.g., page removed), confirm their detail pages fall back to summary-only correctly and record the ids in the manifest `error` notes
- [X] T017 [US3] Run `ScholarShips_Data/build_details.ps1` over the full set: zero FR-005 gate failures; compute coverage from manifest totals (`ok / all ≥ 95%`, SC-002); spot-check 5+ scholarships from different countries in the browser, including at least one `partial` (disabled language option) and one `expired`/`rolling` (status pill renders, contract R3)

**Checkpoint**: Full catalog served from our own pages with measured coverage

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T018 [P] Site-wide FR-005 sweep: `Select-String` across `index.html`, `index.js`, `scholarship.html`, `scholarship.js`, `details/*.js` for `for9a.com` inside `href=` — zero matches (image `src` on for9a CDN is allowed per spec assumption)
- [X] T019 Run the complete `quickstart.md` checklist end-to-end (sections 0–6) on Live Server and `file://`; fix anything that fails and re-run
- [X] T020 Regression pass on the listing: filters, search, sort, country dropdown, hero stats, shortlist hearts, empty state, and `build_catalogue.ps1` regeneration all behave exactly as before (contract C3)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: none
- **Phase 2 (Foundational)**: needs T001. T002 → T004; T003 → T004 (T002 and T003 are different files but T003's sanitizer is easiest to verify against T002's real output — build sequentially or in parallel with fixture JSON)
- **Phase 3 (US1)**: needs Phase 2 checkpoint (sample detail files)
- **Phase 4 (US2)**: needs T006–T008 (page + detail loading) from US1; independent of T009/T010
- **Phase 5 (US3)**: needs only Phase 2 scripts — can run in parallel with Phases 3–4 (it's a data run, not code)
- **Phase 6 (Polish)**: needs all desired stories complete

### Within stories

- US1: T005 ∥ T006 first → T007 → T008 → T009; T010 anytime after T006 exists; T011 last
- US2: T012 → T014; T013 parallel with T012
- US3: T015 → T016 → T017

### Parallel Opportunities

```text
# After Phase 2 checkpoint:
T005 (index.css)  ∥  T006 (scholarship.html)        — different files
T015 (full extraction run)  ∥  all of Phase 3/4     — long-running data job alongside UI work
T012 (apply block)  ∥  T013 (provider block)        — different page regions
T018 ∥ T019 prep                                     — sweep is read-only
```

---

## Implementation Strategy

**MVP first (US1)**: T001–T011 deliver the entire core request — cards stop linking to for9a and open our own bilingual pages — validated with ~10 real scholarships before touching the rest.

**Incremental delivery**: kick off T015 (full extraction, ~4 min unattended) right after Phase 2 while building US1; add the apply block (US2); finish with the coverage pass (US3) and polish. Each checkpoint is independently demoable.

**Totals**: 20 tasks — Setup 1, Foundational 3, US1 7, US2 3, US3 3, Polish 3.
