# Quickstart: Scholarships Data Integration

**Feature**: 001-scholarships-data-integration

## Prerequisites
- Windows PowerShell (built in — used for the data-generation step). **No Python required.**
- A modern browser. Optionally the VS Code "Live Server" extension (`.vscode/` already present).

## Generate the catalogue data
From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File ScholarShips_Data\build_catalogue.ps1
```

Expected output (approximate):

```
Read 22 *.clean.json files
Raw records: 174 | Unique: 170 | Expired dropped: 0 | Final: 170
Wrote scholarships.js (window.SCHOLARSHIPS, 170 records)
```

This regenerates `scholarships.js` at the repo root. Re-run it whenever any `*.clean.json` changes.

## Run the site
- **Easiest**: open `index.html` directly in a browser (works because data is a `<script>` global, not a fetch).
- **Or** serve it: VS Code → "Open with Live Server".

## Acceptance checklist (maps to spec)
1. **Full catalogue loads (US1 / SC-001)**: Grid shows opportunities from many countries; hero "live opportunities" ≈ 170 and "countries" reflects ~22, not the old 15/12.
2. **Card completeness (SC-002)**: Pick several cards across countries — each shows thumbnail (or placeholder), title, org, country+flag, level tag(s), funding label, deadline, and a working "Apply" link opening in a new tab.
3. **Country filter (SC-003 / FR-006)**: The country dropdown lists every country in the data; selecting one shows only that country's cards.
4. **Filters/search/sort (US2 / SC-004)**: Each level/funding chip, the search box, and both sort orders update the visible cards and the result count in well under 1 second.
5. **Reset (FR-015)**: "Reset filters" restores defaults and the full catalogue.
6. **No expired (FR-016)**: No card shows a passed/negative deadline.
7. **No duplicates (FR-010 / SC-006)**: The same scholarship never appears twice.
8. **Thumbnail placeholder (FR-013)**: A record with a missing/broken image still renders cleanly with a placeholder.
9. **Graceful failure (FR-014)**: Temporarily rename `scholarships.js`; reload — the page shows the friendly empty state, not a blank/broken page.
10. **Performance (SC-007)**: Page becomes interactive within ~3 s; scrolling the full grid stays smooth.

## Files changed/added
- `scholarships.js` (generated) — `window.SCHOLARSHIPS` data.
- `ScholarShips_Data/build_catalogue.ps1` (new) — PowerShell generator (no Python).
- `index.html` — adds `<script src="scholarships.js">` before `index.js`; card markup adds thumbnail.
- `index.css` — thumbnail + placeholder styles.
- `index.js` — consumes `window.SCHOLARSHIPS`; adds `varies` level label; derives stats/countries; graceful empty/error state.
