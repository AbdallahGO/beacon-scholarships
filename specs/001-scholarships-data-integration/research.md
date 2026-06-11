# Phase 0 Research: Scholarships Data Integration

**Feature**: 001-scholarships-data-integration | **Date**: 2026-06-09

This document resolves the open technical questions, including the data-loading mechanism deferred from `/speckit-clarify`.

## R1. Data-loading mechanism (deferred from clarification)

**Decision**: Aggregate all `*.clean.json` files at build time into a single generated `scholarships.js` that assigns a browser global (`window.SCHOLARSHIPS = [...]`), loaded via a `<script>` tag before `index.js`.

**Rationale**:
- Must work both when served over `http(s)` (VS Code Live Server — `.vscode/` is present) **and** when `index.html` is opened directly via `file://`. A runtime `fetch()` of JSON is blocked by the browser's same-origin/CORS policy under `file://`, so it would break the "just open the file" workflow.
- A `<script>`-loaded global has no CORS restriction, loads synchronously before the app, and needs zero runtime dependencies — aligning with the existing no-framework, no-bundler site.
- Aggregating once at build time also lets us de-duplicate and drop expired records in one place, so `index.js` consumes a clean, ready-to-render array.

**Alternatives considered**:
- *Runtime `fetch()` of 22 individual files*: rejected — 22 round-trips, fails on `file://`, more error handling, slower first paint.
- *Runtime `fetch()` of one combined `scholarships.json`*: rejected — still fails on `file://`; only marginally simpler than the chosen approach.
- *Manually inlining the array into `index.js`*: rejected — 170+ records make hand-maintenance error-prone; the source of truth must stay the `*.clean.json` files.

## R2. Source of truth and the generation step

**Decision**: The `*.clean.json` files remain the authoritative source. A PowerShell script `ScholarShips_Data/build_catalogue.ps1` reads every `*.clean.json`, performs aggregation/dedup/expiry-filter, and writes `../scholarships.js`. **No Python is used (user request).** PowerShell is native to the user's Windows machine and needs no install.

**Rationale**: Keeps a single regeneration command with zero external toolchain. `ConvertFrom-Json`/`ConvertTo-Json` handle the data; output is written UTF-8 (no BOM) so emoji flags survive. Re-running the script after data updates regenerates the catalogue.

**Alternatives considered**: Python (rejected — user explicitly excluded it); a Node script (rejected — avoids adding a JS toolchain dependency); runtime `fetch()` (rejected per R1 — breaks on `file://`).

## R3. De-duplication key

**Decision**: De-duplicate by `id`. When two records share an `id`, keep the first encountered; if a record lacks an `id`, fall back to its `url` as the identity key.

**Rationale**: Survey shows 174 total records but 170 unique `id`s — exactly the duplicate case FR-010 anticipates. `id` is the natural stable identifier; `url` is the documented fallback (spec Assumptions).

## R4. Expired-opportunity exclusion

**Decision**: Exclude a record when it has a numeric `days` value `<= 0`. Records with `deadline_status` of `open` (numeric `days` countdown) or `rolling`/always-open (`days: null`) are retained.

**Rationale**: The cleaned data currently contains only `deadline_status` values `open` (50) and `rolling` (124); none are pre-marked closed. The `days <= 0` guard implements FR-016 as a forward-safe filter so that if a future regeneration includes a passed deadline, it is dropped automatically. A `null` `days` means rolling/always-open and is kept.

## R5. Study-level values and labels

**Decision**: Add a `varies` entry to the level label map (e.g., `varies: "All levels"`) so cards render correctly. The level **filter** chips remain `highschool / bachelor / master / phd`; a `varies`-only record simply does not match a specific-level filter but appears under "All levels".

**Rationale**: Survey shows `levels` values of `bachelor, master, phd, highschool, varies`, with 76 records carrying only `varies`. The current `levelLabel` map omits `varies`, which would render `undefined`. No new filter chip is added (keeps UI unchanged per Assumptions); "All levels" still shows everything.

## R6. Field value uniformity

**Decision**: Display the `field` value as-is on the card. No field-based filter is added.

**Rationale**: Survey shows `field` is uniformly `"Scholarships"` across the cleaned data. The existing UI has no field filter, so uniformity is harmless; the tag still renders.

## R7. Thumbnail image and placeholder

**Decision**: Render the record's `image` as the card thumbnail. If `image` is absent or fails to load, show a CSS/gradient placeholder (reusing the existing card accent colors). Images are lazy-loaded (`loading="lazy"`) and constrained to a fixed aspect ratio to prevent layout shift.

**Rationale**: All sampled records include an `image` URL (remote, on `images.for9a.com`), but FR-013/FR-004 require graceful handling when missing. Lazy loading and fixed aspect ratio protect SC-007 (load time) and scroll responsiveness with ~170 cards.

## R8. Statistics and country dropdown derivation

**Decision**: Compute the hero "live opportunities" count, the "countries" count, and the country `<select>` options from the loaded `window.SCHOLARSHIPS` array at startup, replacing the hardcoded `15`/`12` values.

**Rationale**: FR-006 and FR-008 require these to reflect actual data. Deriving them keeps them correct automatically after every regeneration.

## R9. Graceful failure

**Decision**: If `window.SCHOLARSHIPS` is undefined or empty at startup, `index.js` renders the existing friendly empty state (and a short note to regenerate the data) instead of throwing.

**Rationale**: Satisfies FR-014 without new UI — reuses the existing `#empty` block.

## R10. Performance with all cards rendered at once

**Decision**: Build the result list with a single `DocumentFragment` insert per render, keep per-card markup lightweight, lazy-load images, and cap the entrance-animation stagger so it does not scale with list length.

**Rationale**: ~170 nodes is well within browser capacity; the main risks are reflow thrash and image load. Batched insertion + lazy images keep re-render under the 1 s target (SC-004).
