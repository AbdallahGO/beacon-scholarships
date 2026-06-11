# Contract: UI Behavior

**Feature**: 001-scholarships-data-integration

The existing Beacon page contracts, now driven by `window.SCHOLARSHIPS`.

## Startup
- On load, `index.js` reads `window.SCHOLARSHIPS`.
  - If it is a non-empty array → render the full catalogue.
  - If it is `undefined`/empty → show the friendly empty state (`#empty`) with a note to regenerate data; do not throw. (FR-014)
- Hero `#stat-count` = catalogue length; "countries" stat = count of distinct `country` values. (FR-008)
- Country `<select>` is populated with every distinct `country`, sorted, plus the "All countries" default. (FR-006)

## Card rendering (per opportunity) — FR-004, FR-013
Each card MUST show:
- Thumbnail `image` (lazy-loaded, fixed aspect ratio); placeholder when missing/failed.
- `flag`, `title`, `org`, `country`.
- Level tag(s) via the label map (incl. `varies → "All levels"`), `field` tag.
- Funding label (`full`/`partial`/`varies`).
- Deadline indicator with urgency class derived from `deadline_status`/`days`.
- "Apply" link → `url`, `target="_blank" rel="noopener"`. (FR-005)

## Filtering, search, sort — FR-007, FR-009, FR-015
- **Level chip**: `all` shows everything; a specific level shows only records whose `levels` include it.
- **Funding chip**: `all`, or exact `fund` match.
- **Country select**: `all`, or exact `country` match.
- **Search**: case-insensitive substring over `title + org + country + field + levels`.
- **Sort**: `deadline` = ascending `days` (treat `null` as last); `az` = title A→Z.
- Result count (`#resCount`) = number of currently visible cards.
- Empty filter combination → show `#empty`. (Edge case)
- **Reset filters** → all controls to defaults, full catalogue shown.

## Invariants
- No expired opportunity is ever shown (guaranteed upstream by the generator; UI does not re-add them).
- No opportunity appears twice (guaranteed upstream). (FR-010)
- Shortlist ("heart") selection is session-only, keyed by opportunity identity.
