# Research: Own Scholarship Detail Pages

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

All findings below were verified live against for9a.com on 2026-06-11 (HTTP 200 responses; three different opportunity pages sampled plus one Arabic counterpart).

## R1. Where the full detail content lives on a for9a opportunity page

**Decision**: Parse the `__NEXT_DATA__` JSON embedded in each opportunity page (`<script id="__NEXT_DATA__" type="application/json">`). The opportunity object sits at `props.pageProps.data.opportunity` and contains everything the detail page needs:

| Field | Verified content |
|-------|------------------|
| `descriptions[]` | Array of `{header, body}` sections; `body` is HTML. Sampled pages consistently had 3 sections: "Opportunity description", "Benefits", "Eligibility criteria" (~600–1,600 chars each) |
| `title`, `id` | Match the ids already stored in `*.clean.json` (verified: id 29536 = University of Sydney record) |
| `transUrl` | URL of the same opportunity in the other language (see R2) |
| `organization` | `{name, about, type, uni_url, image, url}` — `about` is a usable org blurb; `url` points back to for9a (never user-facing) |
| `applicant_criteria`, `education_requirements`, `opportunity_criteria`, `fundingType`, `deadline`, `closing_date` | Structured metadata, available if wanted later |
| `redirect_url`, `redirection`, `action_type` | Apply-destination fields (see R3) |

**Rationale**: Structured JSON is far more reliable than scraping rendered HTML, and one GET per page per language yields the complete content in one shot.

**Alternatives considered**: (a) Scraping rendered DOM — fragile against markup changes, harder to split into sections; (b) for9a's `_next/data/<buildId>/...json` endpoints — fewer bytes per request but the `buildId` rotates with each deployment, adding a failure mode for no real gain at ~340 total requests; (c) raw `pageProps` listing dumps (what produced `*.clean.json`) — they only carry listing summaries, not the full description sections.

## R2. Getting the Arabic version of each opportunity

**Decision**: Use the `transUrl` field from the English page's opportunity object. Verified: fetching `transUrl` for id 29536 returned the Arabic page (`__lang: "ar"`), same id, with the same three sections translated ("وصف الفرصة", "المنافع والفوائد", "معايير التقديم"). Arabic URLs contain Arabic slugs and must be URI-escaped before requesting.

**Rationale**: `transUrl` is authoritative — no slug guessing. Deriving the Arabic URL by inserting `/ar/` into the English path is not safe because Arabic pages use different (Arabic-script) slugs.

**Alternatives considered**: Slug substitution (rejected — wrong slugs); extracting Arabic only (rejected — clarification chose bilingual).

**Fallback**: If `transUrl` is missing or its fetch fails, store the English content only and mark the record `partial` (FR-009).

## R3. The "official application destination" (apply link)

**Decision**: Treat the official apply link as *usually unavailable*. Verified on all three sampled opportunities: `redirect_url` and `redirection` are empty and `action_type` is `POPUP` — for9a gates applying behind its own login popup and does not expose the provider's application URL in page data. Extraction will still capture, in priority order, the first available of: (1) a non-empty `redirect_url`, (2) `organization.uni_url` when non-empty, (3) any outbound non-for9a `href` found inside the `descriptions[]` HTML (sampled pages contained only internal for9a category links, but some opportunities do link out). Whatever is found is stored as `official_link`; when nothing is found the detail page renders the "How to apply" guidance without an external apply button — exactly the fallback FR-004 / Story 2 scenario 2 specifies.

**Rationale**: This honors "never link to for9a" strictly while capturing a real provider link whenever one exists in the data.

**Alternatives considered**: Web-searching each provider to find application pages manually/automatically — out of scope for this feature (could be a follow-up enrichment pass); linking to a search-engine query as a pseudo-apply button — rejected as misleading for an "Apply" action.

## R4. Extraction tooling

**Decision**: A PowerShell 5.1 script, `ScholarShips_Data/extract_details.ps1`, using `Invoke-WebRequest -UseBasicParsing` + regex extraction of the `__NEXT_DATA__` block + `ConvertFrom-Json`. Behavior: iterate the unique ids/urls from `*.clean.json`; ~500 ms delay between requests; per-id output written immediately (`details/<id>.json`); a manifest records `ok | partial | failed` with timestamps and error notes; re-runs skip ids already `ok` (resumable) unless `-Force`. UTF-8 output encoding throughout (Arabic text; PS 5.1 defaults to UTF-16 otherwise).

**Rationale**: The standing project constraint is **no Python** (user instruction; feature 001 set the precedent of PowerShell-only tooling). The whole approach was already proven in this session using exactly these built-ins. ~340 requests at 500 ms ≈ 3–4 minutes runtime.

**Alternatives considered**: Node.js script (allowed by the user constraint but introduces a runtime the repo doesn't currently require); reusing the `for9a-data-extractor` skill's Python script (rejected — Python, and it handles listing dumps, not detail pages).

## R5. Storing and loading detail content in the browser (file:// constraint)

**Decision**: Two-layer storage. Raw layer: `ScholarShips_Data/details/<id>.json` — one bilingual JSON per scholarship (committed, never re-fetched on rebuild). Browser layer: generated `details/<id>.js` files that call a global callback: `window.__SCHOLARSHIP_DETAIL_CB({...})`. The detail page injects `<script src="details/<id>.js">` on demand; `onerror`/timeout triggers the summary-only fallback (FR-007).

**Rationale**: The site must keep working from `file://` (feature 001 constraint), where `fetch()` of local files is CORS-blocked — script injection is the established workaround and is exactly how `scholarships.js` already loads. Per-id files keep the detail page payload at ~5–10 KB instead of shipping a ~1 MB monolith to every visitor.

**Alternatives considered**: One combined `scholarship-details.js` (~1 MB+ with bilingual HTML for ~170 records — slows every page for content of which a visitor reads one record); Supabase-hosted content (the repo has Supabase credentials staged, but feature 001 deliberately chose static files; a database adds a network dependency, breaks `file://`, and isn't needed at this scale).

## R6. Detail page architecture, bilingual display, and sanitization

**Decision**: One dynamic page, `scholarship.html?id=<id>`: stable shareable address per scholarship (FR-006), single template, graceful "not found" for unknown ids. Language toggle EN/AR; the Arabic pane renders inside a container with `dir="rtl"` and `lang="ar"` (the existing fonts cover Arabic via system fallback; no new font dependency). The extracted `body` HTML is sanitized at **build time** (`build_details.ps1`): strip `<script>`/`<style>`/event-handler attributes/`data-*` clutter, and rewrite or drop all `for9a.com` hrefs (FR-005 — sampled bodies contained for9a category links). Images inside bodies are dropped (only for9a CDN assets; card thumbnails remain per the spec's image assumption). Default language: English (matches site UI), with the toggle state remembered via `localStorage`.

**Rationale**: Build-time sanitization keeps the runtime dependency-free and means the shipped artifacts already satisfy "no user-facing for9a links" — verifiable by grepping the generated `details/` folder (SC-001/FR-005 check).

**Alternatives considered**: ~170 pre-rendered static HTML pages (better SEO but 170 files to regenerate for any template change; SEO isn't a stated requirement); runtime sanitization in JS (ships dirty content and repeats work on every view); converting HTML to plain text (loses the headings/lists structure the "full text as-is" clarification asked to preserve).

## Resolved clarifications from Technical Context

No NEEDS CLARIFICATION markers remain. The two spec clarifications (bilingual content; full text as-is) are honored by R2/R6.
