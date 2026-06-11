# Data Model: Own Scholarship Detail Pages

**Date**: 2026-06-11 | **Plan**: [plan.md](./plan.md)

## Entity overview

```text
Scholarship (existing, scholarships.js / *.clean.json)
    1 ──── 0..1 ScholarshipDetail (ScholarShips_Data/details/<id>.json → details/<id>.js)
                    └── 2 × LanguageContent (en, ar)
ExtractionManifest (ScholarShips_Data/details-manifest.json)
    1 entry per unique scholarship id
```

The join key everywhere is the for9a opportunity **`id`** (string of digits, e.g. `"29536"`), which is already unique in the catalogue after feature 001's de-duplication. Duplicate listings across country files share an id and therefore resolve to the same detail page (spec edge case).

## Scholarship (existing — unchanged)

Defined by feature 001 (`contracts/scholarship-record.schema.md` there). Fields used by this feature:

| Field | Type | Use here |
|-------|------|----------|
| `id` | string | Detail page lookup key (`scholarship.html?id=<id>`) and detail file name |
| `title`, `org`, `country`, `flag`, `levels`, `fund`, `field`, `deadline_status`, `days`, `dtext`, `image` | as in 001 | Summary header of the detail page; fallback content when no detail file exists |
| `url` | string (for9a EN page) | **Extraction input only.** No longer rendered as the card's apply href (FR-001/FR-005); kept in the data as the extraction source link (FR-003) |

## ScholarshipDetail

Raw form: `ScholarShips_Data/details/<id>.json`. Browser form: `details/<id>.js` wrapping the same object in `window.__SCHOLARSHIP_DETAIL_CB(...)`.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Must equal the catalogue id; file is named `<id>.json` / `<id>.js` |
| `en` | LanguageContent \| null | English content; null only if the English fetch failed |
| `ar` | LanguageContent \| null | Arabic content (fetched via `transUrl`); null when unavailable → status `partial` |
| `official_link` | string \| null | First found of: `redirect_url`, `organization.uni_url`, outbound non-for9a href in section bodies (research R3). **Must never contain `for9a.com`** (FR-004) |
| `org_about` | string \| null | `organization.about` blurb (plain text), shown in an "About the provider" block when present |
| `status` | `"ok"` \| `"partial"` | `ok` = both languages extracted; `partial` = one language missing (FR-009). (Fully failed ids get no detail file at all — only a manifest entry) |
| `fetched_at` | ISO-8601 string | When extraction ran |

### LanguageContent

| Field | Type | Rules |
|-------|------|-------|
| `lang` | `"en"` \| `"ar"` | Arabic content rendered with `dir="rtl" lang="ar"` |
| `title` | string | Localized title from the source page |
| `sections` | Section[] | ≥ 1; source-page order preserved (full text as-is, per clarification) |

### Section

| Field | Type | Rules |
|-------|------|-------|
| `header` | string | e.g. "Opportunity description", "Benefits", "Eligibility criteria" / Arabic equivalents; may be empty → page renders body without a heading |
| `body` | string (HTML) | Sanitized at build time: no `<script>`/`<style>`, no event-handler attributes, no `for9a.com` hrefs (links to for9a are unwrapped to plain text), no `<img>` tags. Structural tags (`p`, `h3`, `ul`, `li`, `strong`, `a` to non-for9a hosts) preserved |

## ExtractionManifest

`ScholarShips_Data/details-manifest.json` — one entry per unique catalogue id; the extraction script's source of truth for resumability, and the reviewer's source of truth for coverage (SC-002, FR-008).

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Catalogue id |
| `title` | string | For human review of gaps |
| `status` | `"ok"` \| `"partial"` \| `"failed"` | `failed` = no usable content in either language |
| `en_url` | string | The stored for9a source link (extraction input) |
| `ar_url` | string \| null | `transUrl` discovered on the English page |
| `error` | string \| null | Last error message (HTTP status, parse failure, …) for `partial`/`failed` |
| `fetched_at` | ISO-8601 string \| null | Last attempt time |

## State transitions

```text
(absent) ──extract ok──────────▶ ok        (both languages stored)
(absent) ──one language ok─────▶ partial   (detail file with en or ar null)
(absent) ──both fetches fail───▶ failed    (manifest entry only, no detail file)
partial/failed ──re-run──────────▶ may upgrade to ok/partial (script retries non-ok ids by default; -Force retries all)
```

## Detail page resolution logic (runtime)

```text
?id= param ─▶ lookup in window.SCHOLARSHIPS
   ├─ not found ─────────────▶ "not found" state + link back to listing (FR-006)
   └─ found ─▶ render summary header immediately
        └─ inject details/<id>.js
             ├─ loads ─▶ render sections in chosen language; toggle enabled per available languages;
             │           apply button only if official_link present (FR-004)
             └─ error/missing ─▶ keep summary view + "full details unavailable" note (FR-007)
```

## Validation rules (build-time assertions in build_details.ps1)

- Every `details/<id>.json` id matches its filename and exists in the aggregated catalogue.
- No generated `details/<id>.js` contains the string `for9a.com` in any `href` (FR-005 gate; grep-verifiable).
- `official_link`, when present, parses as an absolute http(s) URL on a non-for9a host.
- Every catalogue id appears in the manifest; script prints `ok / partial / failed` totals (SC-002 check: ok ≥ 95%).
