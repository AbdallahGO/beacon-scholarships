# Contract: Detail Content Files

**Scope**: the artifacts produced by `extract_details.ps1` and `build_details.ps1` and consumed by `scholarship.js`.

## 1. Raw extraction file — `ScholarShips_Data/details/<id>.json`

UTF-8 (no BOM preferred), one JSON object:

```json
{
  "id": "29536",
  "status": "ok",
  "fetched_at": "2026-06-11T12:00:00Z",
  "official_link": null,
  "org_about": "The University of Sydney ... leading universities.",
  "en": {
    "lang": "en",
    "title": "University of Sydney Scholarship for International Students",
    "sections": [
      { "header": "Opportunity description", "body": "<p>The <strong>University of Sydney</strong> ...</p>" },
      { "header": "Benefits", "body": "<ul><li>...</li></ul>" },
      { "header": "Eligibility criteria", "body": "<p>...</p>" }
    ]
  },
  "ar": {
    "lang": "ar",
    "title": "منحة جامعة سيدني للطلاب الدوليين",
    "sections": [
      { "header": "وصف الفرصة", "body": "<p>...</p>" },
      { "header": "المنافع والفوائد", "body": "<ul><li>...</li></ul>" },
      { "header": "معايير التقديم", "body": "<p>...</p>" }
    ]
  }
}
```

Constraints:

- `status` ∈ `ok | partial`. A wholly failed extraction writes **no** file (manifest only).
- `en` or `ar` may be `null` only when `status` is `partial`.
- `sections[].body` is sanitized HTML (see §3). `sections` preserves source order and full text (no summarization).
- `official_link` is `null` or an absolute `http(s)` URL whose host is **not** `*.for9a.com`.

## 2. Browser detail file — `details/<id>.js`

Generated 1:1 from the raw file; identical object passed to a fixed global callback:

```js
window.__SCHOLARSHIP_DETAIL_CB && window.__SCHOLARSHIP_DETAIL_CB({ /* same object as <id>.json */ });
```

Constraints:

- Loadable via plain `<script src="details/<id>.js">` from `file://` and `http(s)`.
- Must not define any global other than calling `__SCHOLARSHIP_DETAIL_CB`.
- ASCII-safe encoding of the payload (non-ASCII escaped as `\uXXXX`) so the file renders correctly regardless of server charset headers.

## 3. Sanitization rules (applied at build time)

| Rule | Action |
|------|--------|
| `<script>`, `<style>`, `<iframe>`, `<img>` elements | removed entirely (`<img>`: for9a CDN only — dropped) |
| `on*=` event attributes, `style=`, `data-*` attributes | stripped |
| `<a href>` to any `for9a.com` host | unwrapped — keep inner text, drop the link (FR-005) |
| `<a href>` to other hosts | kept, forced `target="_blank" rel="noopener"` |
| Allowed elements | `p, h1–h4, ul, ol, li, strong, em, b, i, a, br, div, span, table, tr, td, th, blockquote` — anything else unwrapped to its text content |

## 4. Manifest — `ScholarShips_Data/details-manifest.json`

```json
{
  "generated_at": "2026-06-11T12:05:00Z",
  "totals": { "ok": 165, "partial": 3, "failed": 2 },
  "entries": [
    {
      "id": "29536",
      "title": "University of Sydney Scholarship for International Students",
      "status": "ok",
      "en_url": "https://www.for9a.com/en/opportunity/university-of-sydney-scholarship-for-international-students",
      "ar_url": "https://www.for9a.com/opportunity/منحة-جامعة-سيدني-للطلاب-الدوليين",
      "error": null,
      "fetched_at": "2026-06-11T12:00:00Z"
    }
  ]
}
```

- `entries` contains exactly one entry per unique catalogue id (FR-008).
- `totals.ok / (ok+partial+failed)` is the SC-002 coverage figure.

## 5. Script interfaces

```text
extract_details.ps1 [-Force] [-Ids <string[]>] [-DelayMs 500]
  reads  ScholarShips_Data/*.clean.json (unique ids + urls)
  writes ScholarShips_Data/details/<id>.json, ScholarShips_Data/details-manifest.json
  exit 0 with printed summary table; non-ok ids listed
  default: skips ids already "ok" in manifest (resumable); -Force refetches all

build_details.ps1
  reads  ScholarShips_Data/details/*.json (+ scholarships.js catalogue for id validation)
  writes details/<id>.js (one per raw file)
  fails (exit 1) if any FR-005 gate violation (for9a href surviving sanitization) or id mismatch
```
