# Implementation Plan: Scholarships Data Integration

**Branch**: `001-scholarships-data-integration` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-scholarships-data-integration/spec.md`

## Summary

Replace the Beacon site's hardcoded 15-item sample list with the real catalogue aggregated from all `ScholarShips_Data/*.clean.json` country files (22 files, 174 records, 170 unique). A small generation step aggregates, de-duplicates, and filters out expired opportunities, emitting a single browser-loadable data file. The existing single-page UI (search, level/funding/country filters, sort, empty state, shortlist) is reused unchanged in structure; the card now also shows the per-opportunity thumbnail (with placeholder), and the level label map gains a `varies` entry. Homepage statistics and the country dropdown are derived from the loaded data.

## Technical Context

**Language/Version**: HTML5, CSS3, vanilla JavaScript (ES2020, browser); Windows PowerShell for the data-aggregation step (**no Python**, per user request)
**Primary Dependencies**: None at runtime (no frameworks, no package manager). Google Fonts via CDN (already used). PowerShell built-in cmdlets only for the build step.
**Storage**: Static JSON files (`ScholarShips_Data/*.clean.json`) as the source of truth; a generated `scholarships.js` data file consumed by the page. No database.
**Testing**: Manual acceptance via `quickstart.md` checklist (no automated test harness exists in the repo). Optional: a lightweight assertion in the aggregation script verifying record count and uniqueness.
**Target Platform**: Modern evergreen browsers (Chrome, Edge, Firefox, Safari) on desktop and mobile, served over `http(s)` (e.g., VS Code Live Server) and also functional when `index.html` is opened via `file://`.
**Project Type**: Static single-page web application (frontend only)
**Performance Goals**: Page interactive within 3 s on broadband (SC-007); any filter/search/sort re-render under 1 s (SC-004) for ~170 cards rendered at once.
**Constraints**: Must work on `file://` (no CORS-dependent runtime fetch of many files); no build toolchain beyond a single Python script; preserve existing visual design and interaction patterns.
**Scale/Scope**: ~170 opportunities across 22 countries, all rendered at once (no pagination, per clarification). Single HTML page, one CSS file, one JS file, one generated data file, one generator script.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unpopulated template with no ratified principles. There are therefore no concrete gates to enforce. The design nonetheless honors the implicit spirit of simplicity (YAGNI): no new frameworks, no runtime dependencies, minimal new files, and reuse of the existing page structure.

**Result**: PASS (no violations; Complexity Tracking not required).

## Project Structure

### Documentation (this feature)

```text
specs/001-scholarships-data-integration/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── scholarship-record.schema.md
│   └── ui-behavior.md
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html                        # Existing page; add <script> for generated data; card markup adds thumbnail
index.css                         # Existing styles; add card thumbnail + placeholder styles
index.js                          # Existing app; consume generated catalogue instead of inline array; add 'varies' label; derive stats/countries from data; graceful empty/error state
scholarships.js                   # GENERATED: assigns window.SCHOLARSHIPS = [ ...aggregated, deduped, non-expired records... ]
ScholarShips_Data/
├── *.clean.json                  # Source of truth (input; unchanged)
└── build_catalogue.ps1           # NEW generator (PowerShell): reads *.clean.json → writes ../scholarships.js
```

**Structure Decision**: Retain the existing flat, root-level static-site layout (`index.html`, `index.css`, `index.js`). Introduce exactly two new files: a generated `scholarships.js` (browser-global data, loaded via `<script>` before `index.js`) and a PowerShell generator `ScholarShips_Data/build_catalogue.ps1` (no Python, per user request). This keeps the runtime dependency-free and `file://`-compatible while preserving the source `*.clean.json` files as the single source of truth.

## Complexity Tracking

> No constitution violations; no entries required.
