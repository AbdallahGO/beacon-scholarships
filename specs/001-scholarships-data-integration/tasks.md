---
description: "Task list for Scholarships Data Integration"
---

# Tasks: Scholarships Data Integration

**Input**: Design documents from `/specs/001-scholarships-data-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested in the spec. Acceptance is manual via `quickstart.md`; no automated test tasks are generated.

**Organization**: Tasks are grouped by user story (US1=P1, US2=P2, US3=P3) for independent implementation and testing.

> **Implementation note (deviation):** Per user request, **no Python** is used. The catalogue generator is a **PowerShell** script (`build_catalogue.ps1`, native to Windows) instead of Python; the rest is plain HTML/CSS/JS. Everything else matches the plan.

## Path Conventions

Static single-page site at repository root: `index.html`, `index.css`, `index.js`, generated `scholarships.js`, and generator `ScholarShips_Data/build_catalogue.ps1`. All paths are repo-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Build the data pipeline that produces the browser-loadable catalogue.

- [X] T001 Create the catalogue generator `ScholarShips_Data/build_catalogue.ps1`: read every `*.clean.json` in its own directory, aggregate all records, de-duplicate by `id` (fallback `url`), drop records where `days` is a number `<= 0`, and write `window.SCHOLARSHIPS = [...]` to `scholarships.js` at the repo root (UTF-8 no BOM, emoji preserved). Print a summary line and exit non-zero if no `*.clean.json` files are found (per `contracts/scholarship-record.schema.md`).
- [X] T002 Run `powershell -ExecutionPolicy Bypass -File ScholarShips_Data\build_catalogue.ps1` from the repo root to generate `scholarships.js`; confirmed summary: 22 files, 174 raw, 170 unique, final 170.
- [X] T003 [P] In `index.html`, add `<script src="scholarships.js"></script>` immediately before `<script src="index.js"></script>` so the catalogue global loads first.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire the page to the generated catalogue and normalize field mappings. **All user stories depend on this.**

- [X] T004 In `index.js`, removed the inline `data` array and sourced the catalogue from `window.SCHOLARSHIPS`; missing/empty catalogue renders the `#empty` state with a "regenerate data" note instead of throwing (FR-014).
- [X] T005 In `index.js`, extended field mappings for the cleaned data: added `varies: "All levels"` to `levelLabel`, and updated `deadlineClass()` to read `deadline_status`/`days`/`dtext` (rolling or `days == null` → open; `days <= 10` urgent, `<= 40` mid, else ok).

**Checkpoint**: Page loads the full real catalogue; cards render with correct labels. ✅

---

## Phase 3: User Story 1 - Browse all real scholarships from every country (Priority: P1) 🎯 MVP

**Goal**: Show the full aggregated catalogue with complete, accurate cards (incl. thumbnail) and live statistics, each with a working Apply link.

**Independent Test**: Open the site with `scholarships.js` present; the grid shows opportunities from many countries (≫15), each card shows thumbnail/placeholder + full info + working Apply link, and the hero stats reflect real counts.

- [X] T006 [P] [US1] In `index.js` `render()`, added a `.card-media` banner with an `<img class="thumb">` for `d.image` (`loading="lazy"`, `onerror="this.remove()"` revealing the CSS gradient/🎓 placeholder); flag/funding/save overlay the media (FR-004, FR-013).
- [X] T007 [P] [US1] In `index.css`, added `.card-media`/`.thumb` styles (16:9 aspect ratio, `object-fit: cover`, per-card gradient placeholder with 🎓, overlay scrim for legibility) preserving the existing card look.
- [X] T008 [US1] In `index.js`, derived hero statistics from the catalogue: `#stat-count` = catalogue length and `#stat-countries` = distinct `country` count, replacing the hardcoded `15`/`12`; initial `#resCount` set to catalogue length (FR-008).
- [X] T009 [US1] In `index.js`, each card renders title, org, country+flag, level tag(s), field tag, funding label, and an Apply link to `d.url` with `target="_blank" rel="noopener"` from the catalogue (FR-004, FR-005). Text fields are HTML-escaped.

**Checkpoint**: User Story 1 functional — real catalogue browsable with complete cards. MVP. ✅

---

## Phase 4: User Story 2 - Filter, search, and sort the full catalogue (Priority: P2)

**Goal**: All existing controls work correctly against the full dataset.

**Independent Test**: With the full catalogue loaded, each filter/search/sort updates the visible results and the result count correctly; reset restores everything.

- [X] T010 [US2] In `index.js`, the country `<select>` is populated from distinct `country` values of the loaded catalogue, sorted, with the "All countries" default (FR-006).
- [X] T011 [US2] In `index.js`, the filter/search/sort pipeline runs against the full dataset: level chip, funding chip, country select, search over `title+org+country+field+levels` (raw codes **and** friendly labels), sort (`deadline` ascending with `null` days last; `az`), `#resCount` reflects visible matches; `#empty` shows when no matches (FR-007, FR-009).
- [X] T012 [US2] In `index.js`, "Reset filters" returns all controls to defaults and re-displays the full catalogue (FR-015).

**Checkpoint**: User Stories 1 and 2 both work independently. ✅

---

## Phase 5: User Story 3 - Trust the freshness and accuracy of each listing (Priority: P3)

**Goal**: Deadline and funding presentation are accurate and trustworthy across the catalogue.

**Independent Test**: Inspect cards across countries — funding labels and deadline urgency/status are correct, and "Closing soonest" orders sensibly.

- [X] T013 [US3] In `index.js`, funding labels render correctly for every record (`full → "Fully funded"`, `partial → "Partial"`, `varies → "Varies"`) with funding CSS classes applied; unknown values fall back to "Varies" (FR-012).
- [X] T014 [US3] In `index.js`, "Closing soonest" sort orders by ascending `days` with rolling/always-open (`null` days) placed last, and deadline urgency styling reflects each record's `days`/`deadline_status` (FR-011).

**Checkpoint**: All three user stories independently functional. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, and end-to-end validation.

- [X] T015 [P] `index.js` was fully rewritten to the catalogue model; no leftover inline-data/dead code remains. Added DocumentFragment batch rendering and capped the entrance-animation stagger for ~170 cards (FR-017 responsiveness).
- [X] T016 [P] Documented the regeneration workflow: header comment in `ScholarShips_Data/build_catalogue.ps1` and a note near the data `<script>` in `index.html` stating `scholarships.js` is generated and must be regenerated when `*.clean.json` changes.
- [~] T017 Automated checks done: JS syntax (`node --check`) for `index.js`/`scholarships.js` pass; data integrity verified (170 unique, 25 countries, 0 expired, 0 missing required fields). **Manual browser pass of `quickstart.md` items 1–10 is pending user verification.**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies. T002 depends on T001; T003 independent.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational.
- **Polish (Phase 6)**: Depends on user stories.

### Implementation summary

- Generator: `ScholarShips_Data/build_catalogue.ps1` (PowerShell, no Python).
- Generated data: `scholarships.js` (`window.SCHOLARSHIPS`, 170 records).
- UI: `index.html` (script tag + stat IDs), `index.css` (media/thumbnail styles), `index.js` (catalogue model, rendering, filters, stats, graceful failure).

---

## Notes

- Re-run `ScholarShips_Data/build_catalogue.ps1` whenever `*.clean.json` changes; commit the regenerated `scholarships.js`.
- [P] = different files. Most UI logic lives in `index.js` (rewritten once).
- Remaining open item: manual browser walkthrough of `quickstart.md` (T017).
