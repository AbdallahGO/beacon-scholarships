# Contract: Detail Page & Card Behavior

**Scope**: user-facing behavior of the listing card change and the new `scholarship.html` page.

## Card (listing page) changes

| # | Behavior |
|---|----------|
| C1 | The card footer link navigates to `scholarship.html?id=<id>` in the **same tab** (back button returns to the listing, Story 1 scenario 3). No `target="_blank"`, no `d.url` href anywhere in the rendered listing (FR-001, FR-005) |
| C2 | Link label changes from "Apply →" to "View details →" (the card no longer applies anywhere; applying happens from the detail page) |
| C3 | Everything else on the card (thumbnail, save heart, tags, deadline pill, filters, sort, search) is unchanged |

## Detail page — `scholarship.html?id=<id>`

### Load & resolution

| # | Behavior |
|---|----------|
| D1 | Valid id → summary header renders immediately from `window.SCHOLARSHIPS`: flag, title, org, country, level tags, funding pill, deadline pill, thumbnail (when present) |
| D2 | Unknown/missing id → "Scholarship not found" state with a "← Back to all scholarships" link to `index.html#browse` (FR-006). No blank/broken page (SC-005) |
| D3 | `details/<id>.js` is injected after first paint; on load, full sections render below the summary header |
| D4 | Detail file missing or fails to load → summary stays, plus a quiet note ("Full details aren't available for this one yet") and the standard apply-fallback block (FR-007) |

### Language toggle

| # | Behavior |
|---|----------|
| L1 | Toggle with two options: **English** / **العربية**. Default: English; last choice persisted in `localStorage` and applied on next detail-page visit |
| L2 | Arabic pane renders with `dir="rtl" lang="ar"` (text alignment, list bullets, punctuation flow correctly) |
| L3 | If one language is `null` (status `partial`), its toggle option is disabled with a tooltip/label "(not available)"; the available language shows (FR-009, edge case) |
| L4 | Toggling re-renders sections only; summary header, address, and scroll context are preserved; no page reload |

### Apply action

| # | Behavior |
|---|----------|
| A1 | `official_link` present → prominent "Apply on official site →" button, `target="_blank" rel="noopener"`, pointing at the non-for9a destination (FR-004) |
| A2 | `official_link` absent → no external apply button. Instead an "How to apply" note directs the visitor to the provider (org name + `org_about` block when present) (Story 2 scenario 2) |
| A3 | No element on the page links to any `for9a.com` address (FR-005). Card thumbnails from for9a's image CDN are allowed (spec assumption) |

### Content rendering

| # | Behavior |
|---|----------|
| R1 | Sections render in source order with their headers; empty/missing sections are omitted (no blank headings) |
| R2 | Section body HTML renders as sanitized at build time (lists, paragraphs, bold preserved — "full text as-is") |
| R3 | Expired/rolling deadlines display exactly as on cards (same `dtext`/status pill); expired scholarships still render (edge case) |
| R4 | Page is responsive at the same breakpoints as the listing; visual language (fonts, colors, card styling) matches `index.css` |

## Acceptance mapping

- SC-001 → C1, C2 (grep rendered listing for `for9a.com` hrefs: zero)
- SC-003 → D1/D3 (summary at first paint; detail file ≤ ~10 KB)
- SC-004 → A1/A3
- SC-005 → D2/D4
- FR-009/SC-002 → L1–L3 + manifest totals
