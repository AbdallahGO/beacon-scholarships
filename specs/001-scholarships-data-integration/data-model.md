# Phase 1 Data Model: Scholarships Data Integration

**Feature**: 001-scholarships-data-integration | **Date**: 2026-06-09

## Entity: Scholarship Opportunity

One funded opportunity a student can apply to. Sourced from a single object in a `*.clean.json` array.

| Field | Type | Required | Notes / Validation |
|-------|------|----------|--------------------|
| `id` | string | Yes (dedup key) | Stable identifier; used to de-duplicate. If absent, `url` is the identity fallback. |
| `title` | string | Yes | Display heading on the card. |
| `org` | string | Yes | Sponsoring organization. |
| `country` | string | Yes | Country name; drives the country filter and the countries statistic. |
| `flag` | string (emoji) | Yes | Rendered next to country/at card top. |
| `levels` | string[] | Yes | Values observed: `highschool`, `bachelor`, `master`, `phd`, `varies`. Drives the study-level filter; `varies` shows under "All levels" only. |
| `fund` | string enum | Yes | One of `full` \| `partial` \| `varies`. Drives the funding filter and label. |
| `field` | string | Yes | Currently uniformly `"Scholarships"`. Rendered as a tag. |
| `deadline_status` | string enum | Yes | Observed: `open` \| `rolling`. Informs the deadline indicator. |
| `days` | integer \| null | No | Days until deadline. `null` = rolling/always-open. `<= 0` ⇒ expired ⇒ excluded. |
| `dtext` | string | Yes | Human-readable deadline label (e.g., "Closes in 16 days", "Rolling / open"). |
| `url` | string (URL) | Yes | Application page; opens in a new tab. Identity fallback when `id` missing. |
| `image` | string (URL) | No | Card thumbnail. Missing/failed ⇒ placeholder. |

### Derived / computed at render time

- **Deadline class** (urgency styling): `rolling` or always-open ⇒ neutral/open; numeric `days <= 10` ⇒ urgent; `<= 40` ⇒ mid; else ⇒ ok. (Extends existing `deadlineClass` logic to the cleaned data's `deadline_status`/`days`.)
- **Funding label**: `full → "Fully funded"`, `partial → "Partial"`, `varies → "Varies"`.
- **Level labels**: `highschool → "High school"`, `bachelor → "Bachelor"`, `master → "Master's"`, `phd → "PhD"`, `varies → "All levels"`.

## Entity: Catalogue

The aggregated, de-duplicated, non-expired collection consumed by the UI.

- **Construction**: union of all `*.clean.json` arrays → de-duplicate by `id` (fallback `url`) → drop records with numeric `days <= 0`.
- **Exposure**: emitted as `window.SCHOLARSHIPS` (array) in generated `scholarships.js`.
- **Invariants**:
  - No two entries share the same `id`.
  - No entry has numeric `days <= 0`.
  - Count and country set are the basis for hero statistics and the country dropdown.
- **Observed size**: 22 source files, 174 raw records, 170 unique → catalogue ≈ 170 (minus any future expired).

## Entity: Country (grouping)

- Distinct `country` values across the Catalogue.
- Populates the country `<select>` (sorted) and the "countries" statistic (count of distinct countries).

## Filter / View State (client-side, session only)

| Field | Values | Default |
|-------|--------|---------|
| `q` (search) | free text matched against title/org/country/field/levels | `""` |
| `level` | `all` \| `highschool` \| `bachelor` \| `master` \| `phd` | `all` |
| `fund` | `all` \| `full` \| `partial` \| `varies` | `all` |
| `country` | `all` \| any country in data | `all` |
| `sort` | `deadline` (closing soonest) \| `az` | `deadline` |
| `saved` | set of selected opportunity ids (shortlist, in-memory) | empty |

State transitions: any control change → recompute filtered+sorted list → re-render grid, result count, and empty state. "Reset filters" returns all fields to defaults.
