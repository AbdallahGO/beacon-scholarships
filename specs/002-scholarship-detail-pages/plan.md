# Implementation Plan: Own Scholarship Detail Pages

**Branch**: `002-scholarship-detail-pages` | **Date**: 2026-06-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-scholarship-detail-pages/spec.md`

## Summary

Stop sending visitors to for9a.com: each card's "Apply →" link (currently `d.url`, `index.js:116`) becomes an internal link to a new detail page (`scholarship.html?id=<id>`). A one-time PowerShell extraction script fetches every scholarship's stored for9a URL (English) plus its Arabic counterpart, parses the embedded `__NEXT_DATA__` JSON (verified live: full content lives at `props.pageProps.data.opportunity.descriptions[]` as `{header, body-HTML}` sections), and stores the bilingual content per scholarship. A build step emits one small browser-loadable `details/<id>.js` file per scholarship plus a coverage manifest. The detail page renders the summary fields + full extracted sections with an English/Arabic toggle (RTL for Arabic), shows an official apply link only when one was obtained (verified: for9a usually exposes none — apply is gated behind their popup), and degrades gracefully to summary-only or a "not found" state.

## Technical Context

**Language/Version**: HTML5, CSS3, vanilla JavaScript (ES2020, browser); Windows PowerShell 5.1 for extraction + build steps (**no Python**, per standing user constraint)
**Primary Dependencies**: None at runtime. Extraction uses PowerShell built-ins (`Invoke-WebRequest`, `ConvertFrom-Json`) against for9a's public pages.
**Storage**: Static files. Source of truth: `ScholarShips_Data/*.clean.json` (unchanged) + new `ScholarShips_Data/details/<id>.json` (raw bilingual extraction) + `ScholarShips_Data/details-manifest.json` (extraction status). Generated for the browser: `details/<id>.js` (one per scholarship) alongside the existing generated `scholarships.js`.
**Testing**: Manual acceptance via `quickstart.md` checklist (consistent with feature 001; no automated harness in repo). Extraction script self-reports a coverage summary (ok/partial/failed counts) that is checked against SC-002.
**Target Platform**: Modern evergreen browsers, served over `http(s)` or opened via `file://` (same constraint as feature 001 — this forbids runtime `fetch()` of JSON; detail content loads via injected `<script>` tags instead).
**Project Type**: Static multi-page web application (listing page + one dynamic detail page), frontend only.
**Performance Goals**: Detail page visible within 2 s (SC-003): summary renders immediately from `scholarships.js`; the per-id detail file (~5–10 KB) loads asynchronously. Listing page unchanged.
**Constraints**: `file://`-compatible (no fetch/CORS); no frameworks or package manager; extraction must be polite (rate-limited ~500 ms/request, resumable) across ~170 unique ids × 2 languages ≈ 340 requests; Arabic rendering requires `dir="rtl"`.
**Scale/Scope**: ~170 unique scholarships (22+ country files, duplicates de-duplicated by id). One new HTML page, one new page script, CSS additions, two PowerShell scripts (extract + build-details), ~170 generated detail files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution (`.specify/memory/constitution.md`) is an unpopulated template with no ratified principles, so there are no concrete gates to enforce. The design follows the implicit simplicity standard set by feature 001: no new frameworks, no runtime dependencies, static generated artifacts, PowerShell-only tooling.

**Result**: PASS (pre-research and post-design; Complexity Tracking not required).

## Project Structure

### Documentation (this feature)

```text
specs/002-scholarship-detail-pages/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── detail-content.schema.md
│   └── detail-page-behavior.md
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
index.html                          # Unchanged structure; card "Apply →" becomes internal "View details →" link (index.js renders it)
index.js                            # Card link: scholarship.html?id=<id> instead of d.url (same tab, no target=_blank)
index.css                           # + detail-page styles (header, sections, language toggle, RTL, not-found state)
scholarship.html                    # NEW: detail page shell (reads ?id=, loads scholarships.js + details/<id>.js + scholarship.js)
scholarship.js                      # NEW: detail page logic — resolve id, render summary + sections, EN/AR toggle, apply link, fallbacks
scholarships.js                     # Existing generated catalogue (unchanged format)
details/                            # NEW, GENERATED: one browser-loadable file per scholarship
│   └── <id>.js                     #   window.__SCHOLARSHIP_DETAIL_CB({ id, en:{...}, ar:{...}, official_link, status })
ScholarShips_Data/
├── *.clean.json                    # Source of truth for summaries (unchanged)
├── build_catalogue.ps1             # Existing (unchanged)
├── extract_details.ps1             # NEW: fetch EN url + AR transUrl per id, parse __NEXT_DATA__, write details/<id>.json + manifest (rate-limited, resumable)
├── build_details.ps1               # NEW: details/<id>.json → ../details/<id>.js (browser wrapper)
├── details/                        # NEW: raw extracted bilingual JSON per id (committed; source for build)
│   └── <id>.json
└── details-manifest.json           # NEW: per-id extraction status (ok | partial | failed) + fetch timestamps + error notes
```

**Structure Decision**: Keep the flat root-level static-site layout. The detail experience is one dynamic page (`scholarship.html?id=<id>`) rather than ~170 generated HTML files — this gives every scholarship a stable shareable address (FR-006) with a single template to maintain, and a graceful "not found" state for unknown ids. Detail content ships as per-id generated JS files loaded by `<script>` injection, which works on `file://` (where `fetch()` of local JSON is CORS-blocked) and keeps the initial page light. Raw extraction output is kept separate from browser artifacts so re-builds never require re-fetching.

## Complexity Tracking

> No constitution violations; no entries required.
