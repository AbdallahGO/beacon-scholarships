---
name: for9a-data-extractor
description: Convert for9a.com opportunity JSON exports (the Next.js "pageProps" shape, e.g. files like Australia.json, scholarships-Germany.json, an opportunity category dump) into clean, website-ready scholarship data. Use whenever the user uploads a for9a/Forsa opportunity JSON, a "pageProps" listing file, or any scholarship/opportunity dump with an opportunities.data array, and wants only the usable fields extracted, deadlines normalized, funding/study-level derived, or the data prepped for a website. Triggers include "clean this scholarship data", "extract usable data", "take only the usable fields", "for9a json", "pageProps", or a country-named opportunities JSON.
---

# for9a Data Extractor

This skill turns raw for9a.com / Forsa opportunity exports into a flat, clean JSON
array ready to drop into a scholarship website (such as the Beacon card schema).

## When to use

Trigger this when a user provides a JSON file shaped like a for9a export — the
listing array lives at `pageProps.opportunities.data` — and wants the *usable*
data extracted rather than the raw, noisy dump.

## What "usable" means here

The raw files contain a lot of noise: bilingual hashtag arrays, image objects,
slugs, epoch-placeholder deadlines (`1969-12-31` / `1970-01-01`), and listings
whose deadline has already passed. This skill keeps only the fields a site needs
and drops dead listings.

## The process

Run the bundled script — do **not** hand-rewrite the parsing each time:

```bash
python3 scripts/extract_scholarships.py INPUT.json -o OUTPUT.clean.json
```

Add `--keep-expired` if the user wants past-deadline listings retained.

The script outputs an array of objects with this schema, one per opportunity:

| field             | meaning                                                        |
|-------------------|----------------------------------------------------------------|
| `id`              | for9a opportunity id                                           |
| `title`           | opportunity title                                             |
| `org`             | organization name                                             |
| `country`         | country name (from `country.place.name`)                      |
| `flag`            | emoji flag derived from the ISO-2 country code                |
| `levels`          | derived study levels: `highschool` / `bachelor` / `master` / `phd` / `varies` |
| `fund`            | derived funding tier: `full` / `partial` / `varies`           |
| `field`           | category name (usually "Scholarships")                        |
| `deadline_status` | `open` / `rolling` / `expired`                                |
| `days`            | days until deadline (null when rolling)                       |
| `dtext`           | human label, e.g. "Closes in 26 days" / "Rolling / open"      |
| `url`             | live application URL                                          |
| `image`           | thumbnail URL (use only if you want to hotlink for9a images)  |

## Key derivation rules (encoded in the script)

- **Funding** is read from the title + tags. `partial`/`partly` wins first
  (because "Partially Funded" also contains "funded"), then fully-funded
  patterns, then a bare "funded".
- **Study level** is matched from title + tags via keyword/regex (English + a
  little Arabic). A listing can have several levels; none found → `["varies"]`.
- **Deadlines**: a real future ISO date → `open` with a day count; `no_deadline`
  true or an epoch placeholder (year < 2000) → `rolling`; a real past date →
  `expired` (dropped unless `--keep-expired`).
- **Flags** are generated from the 2-letter country code, so any country works
  without a lookup table.
- **Filtering**: `closed` listings, expired ones, and any missing a URL are
  skipped. The script prints a summary of what it kept and skipped.

## After extraction

The clean array maps 1:1 onto a scholarship card grid. If feeding the Beacon
site, the fields already line up (`title`, `org`, `country`, `flag`, `levels`,
`fund`, `field`, `days`, `dtext`, `url`). Multiple country files can each be run
and the resulting arrays concatenated into one dataset.

## Notes

- These files are usually a single page (e.g. 15 of 71). If the user needs the
  full set, they must export each page; this skill cleans whatever pages it is
  given.
- `image` URLs point at for9a's CDN — prefer generated card visuals over
  hotlinking unless the user explicitly wants the source thumbnails.
