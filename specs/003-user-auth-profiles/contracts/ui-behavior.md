# Contract: UI Behavior — Gating, Account Page, Matching Surfaces

## Nav (all pages: index.html, scholarship.html, account.html)

- Anonymous: `Sign in` button in `.nav-actions` → opens auth modal. Theme toggle unchanged.
- Signed-in: avatar (profile photo or initial) → menu: **Account · Saved · History · Sign out** (deep links `account.html#profile|#saved|#history`).
- Auth modal: tabs Sign in / Create account; email+password form; divider; 4 provider buttons; "Forgot password?". Closable; ESC/backdrop dismiss.

## Listing page (index.js)

- **Save hearts** (existing UI, today an in-memory index-keyed `Set`): become id-keyed and Supabase-backed. Signed-in: load all saved ids once (`select scholarship_id from saved_scholarships`), heart toggles upsert/delete (optimistic, rollback on error). Anonymous: heart click → `requireAuth({type:'save', id})` (FR-011); after sign-in the save completes.
- **Search history**: signed-in only; record query+filters after 1.5 s settle (non-empty, changed). Focusing the empty search input shows up to 8 recent searches (click → re-run). Anonymous: no recording, no dropdown (browsing/search itself stays free — FR-011).
- **Recommended for you strip** (clarification Q2): section above the grid, rendered only when signed-in AND profile is matchable (has degree, nationality, or a language). Top 6 by match score, same card markup + `match` badge. Signed-in with non-matchable profile → slim prompt card: "Complete your profile to see scholarships picked for you →" (FR-020). Anonymous → section absent.
- **Match badges + sort**: signed-in matchable users see badges on cards (`Matches your profile` / `May not be eligible` — caution only on unambiguous negative signals, research R10) and a new sort option `Best match` appended to `#sortSel`. Anonymous users see today's behavior unchanged.

## Detail page (scholarship.js)

- On load, signed-in: insert `view_history` row (skip if same id within 30 min — data-model rule).
- Save button in the detail header (same contract as hearts).
- Match badge next to the title for signed-in matchable users; neutral when unknown.

## Account page (account.html / account.js) — tabs via location.hash

- **#profile** (default): form — full name*, address, city, country, nationality, phone, degree (select: High school/Bachelor/Master's/PhD); photo upload (preview, replace); degree certificates (list: name+date, view via signed URL, remove); languages (add row: language, CEFR select rendered "B2 – Upper Intermediate" style, optional certificate per row, remove row). Incremental save (FR-018): only name/email required; saves show success/failure feedback; pre-filled from provider metadata on first visit (FR-013). Upload validation per data-model limits with explicit error text (FR-017).
- **#saved**: saved scholarships as cards (catalogue lookup by id) with unsave; ids missing from the catalogue render a "no longer listed" row. Empty state links to browsing.
- **#history**: two lists — viewed scholarships (with dates, newest first) and recent searches (query + filters, click to re-run on index); each list has "Clear" with confirm (FR-009/010).
- **#settings**: email + verification status (+ resend); linked sign-in methods with Connect buttons (contract F6); change password (email accounts); Delete account (contract F9).
- Anonymous visit to account.html → gate screen with sign-in prompt (FR-011); completes navigation after sign-in.

## Matching algorithm (shared `computeMatch(profile, scholarship, indexEntry)` — research R10)

```
score = 0; badge = none
level:   profile.degree set AND (levels includes degree)            → +3, badge=match
         levels == ['varies'] or empty                              → +1 (neutral)
         profile.degree set AND levels exclude it (and not varies)  → score -3, badge=caution
nationality: indexEntry.nationality_signals unambiguously include
         profile.nationality → +2 | unambiguously exclude → caution | unknown → 0
language: profile languages intersect indexEntry.language_signals   → +1 each (cap +2)
deadline: open / days != null and > 0                               → +1
```

- `caution` never renders as "Not eligible" from heuristic text alone — copy is "May not be eligible — check details".
- "Recommended" = top 6 with score ≥ 3 and no caution. "Best match" sort = score desc, then deadline.
- Recompute on profile change: account.js broadcasts `localStorage['beacon.profileRev']`; pages re-read profile on next load (FR-021 — recommendations reflect updates on next view).

## Generated match index (`ScholarShips_Data/build_match_index.ps1` → `match-index.js`)

- Input: `ScholarShips_Data/details/<id>.json` EN sections (`{header, body}` text).
- Heuristics: sections whose header matches `eligib|nationalit|who can apply|criteria` → scan body for country/nationality names (from a fixed list incl. catalogue countries); headers matching `language` → scan for language names (English, French, German, …). Unmatched → field absent (neutral).
- Output: `window.MATCH_INDEX = { "<id>": { nationality_signals: { include: [...], exclude: [...] }, language_signals: [...] }, ... }` — UTF-8, no BOM (PS 5.1: write via `[IO.File]::WriteAllText`, per project memory).
- Idempotent, re-runnable; logs a coverage summary (ids with signals / total).

## CSS additions (index.css)

Auth modal, nav avatar/menu, verification banner, recommended strip, match badges (`match` teal / `caution` amber), account page layout + tabs + upload rows, gate screen, empty states — all themed with the existing custom-property palette (light/dark via `theme.js`, RTL-safe where reused on detail pages).
