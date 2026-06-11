# Quickstart: Own Scholarship Detail Pages

Manual acceptance checklist. Run after implementation (`/speckit-implement`).

## 0. Generate the data (once)

```powershell
# from repo root — fetches ~170 ids × 2 languages from for9a (~3–4 min, resumable)
.\ScholarShips_Data\extract_details.ps1

# build browser files; fails loudly on any for9a link surviving sanitization
.\ScholarShips_Data\build_details.ps1
```

- [ ] Extraction summary prints totals; `ok` count ≥ 95% of unique ids (SC-002)
- [ ] `ScholarShips_Data/details-manifest.json` lists every catalogue id with a status (FR-008)
- [ ] `details/` contains one `<id>.js` per non-failed id
- [ ] `Select-String -Path details\*.js -Pattern 'href=\\"[^"]*for9a'` → no matches (FR-005)

## 1. Listing page

Open `index.html` (try both Live Server and double-click `file://`).

- [ ] Cards render as before (thumbnails, filters, search, save hearts intact)
- [ ] Card button reads "View details →" and stays in the same tab
- [ ] No card links to for9a (inspect a few: href is `scholarship.html?id=...`) (SC-001)

## 2. Detail page — happy path

Click any card.

- [ ] Lands on `scholarship.html?id=<id>` with summary header (flag, title, org, country, tags, funding, deadline) visible immediately
- [ ] Full sections appear (description / benefits / eligibility), formatted with headings and lists (SC-003: visible well under 2 s)
- [ ] Browser back returns to the listing with filters/scroll intact (Story 1 scenario 3)
- [ ] Address bar URL is shareable: paste it into a new tab → same page renders (FR-006)

## 3. Language toggle

- [ ] Toggle shows **English / العربية**; default English
- [ ] Arabic view: text right-aligned, RTL flow correct, Arabic section headers shown
- [ ] Choice persists: open another scholarship → last language still selected
- [ ] Pick a `partial` id from the manifest (if any): missing language disabled with "(not available)" (FR-009)

## 4. Apply behavior

- [ ] For an id whose detail file has `official_link`: "Apply on official site →" opens the provider site in a new tab; host is not for9a (SC-004)
- [ ] For an id without `official_link` (most): no external apply button; "How to apply" guidance + provider info shown instead
- [ ] Search page source for `for9a.com` in any `href` → none (FR-005)

## 5. Failure states

- [ ] `scholarship.html?id=999999` → friendly "not found" + back link (SC-005)
- [ ] `scholarship.html` (no id) → same "not found" state
- [ ] Temporarily rename one `details/<id>.js`, open that scholarship → summary renders + "details unavailable" note, no console-visible broken layout (FR-007); restore the file after
- [ ] An `expired`/`rolling` scholarship's detail page renders with its status pill (edge case)

## 6. Regression

- [ ] Hero stats, country dropdown, filters, sort, search, shortlist hearts all still work
- [ ] `build_catalogue.ps1` still regenerates `scholarships.js` without errors
