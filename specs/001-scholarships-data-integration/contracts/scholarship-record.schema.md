# Contract: Scholarship Record & Generated Catalogue

**Feature**: 001-scholarships-data-integration

## Input contract — a `*.clean.json` record

Each `ScholarShips_Data/*.clean.json` file is a JSON array of objects with this shape:

```json
{
  "id": "30278",
  "title": "Fully Funded Scholarship in Canada 2026 for Global Development",
  "org": "Global Affairs Canada",
  "country": "Canada",
  "flag": "🇨🇦",
  "levels": ["varies"],
  "fund": "full",
  "field": "Scholarships",
  "deadline_status": "open",
  "days": 16,
  "dtext": "Closes in 16 days",
  "url": "https://www.for9a.com/en/opportunity/...",
  "image": "https://images.for9a.com/thumb/.../woman-writing-at-laptop.jpg"
}
```

**Constraints the consumer must tolerate:**
- `days` MAY be `null` (rolling/always-open).
- `image` MAY be missing or unreachable ⇒ placeholder.
- `levels` MAY contain `"varies"`.
- `fund` ∈ { `full`, `partial`, `varies` }.
- `deadline_status` ∈ { `open`, `rolling` } (consumer must not assume others break it).

## Output contract — generated `scholarships.js`

The generator MUST produce a file that, when loaded via `<script src="scholarships.js"></script>`, defines a single global:

```js
window.SCHOLARSHIPS = [ /* array of records as above */ ];
```

**Guarantees the generated array MUST satisfy:**
1. Union of all `*.clean.json` records found in `ScholarShips_Data/`.
2. De-duplicated by `id` (fallback `url`); no duplicate identities.
3. Excludes any record whose `days` is a number `<= 0`.
4. Preserves every field of each retained record unchanged.
5. Valid JavaScript/JSON-compatible array (UTF-8, emoji preserved).

## Generator command contract — `build_catalogue.ps1`

- **Location**: `ScholarShips_Data/build_catalogue.ps1` (PowerShell, no Python).
- **Invocation**: `powershell -ExecutionPolicy Bypass -File ScholarShips_Data\build_catalogue.ps1` (run from repo root); it resolves paths relative to its own location.
- **Reads**: all `*.clean.json` in its own directory.
- **Writes**: `scholarships.js` at the repository root (the page's directory), UTF-8 without BOM.
- **Output**: a short summary — files read, raw record count, unique count, expired dropped, final count.
- **Exit code**: `0` on success; non-zero if no `*.clean.json` files are found.
