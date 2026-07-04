# Contract: UI behavior — CV builder

Mounted by `account.js` into `#pane-profile` via `window.BeaconCV.mount(pane, ctx)`. English-first UI labels; CV content is whatever the student types (`dir="auto"`).

---

## 1. Zones (desktop ≥ ~900px)

```
┌───────────────────────────────────────────────────────────────┐
│  THEME PICKER  (horizontal strip / rail of 8 thumbnail cards)  │
├──────────────┬────────────────────────────────────────────────┤
│  EDIT         │           LIVE CV PREVIEW                       │
│  SIDEBAR      │   [ certificates backdrop carousel (behind) ]   │
│  ~380px       │   [ themed .cv (front) ]      ◄ ►  (arrows)     │
│  glass, fixed │                                                 │
│  aurora bg,   │                                                 │
│  scrollable   │                                                 │
└──────────────┴────────────────────────────────────────────────┘
```

- **Theme picker**: 8 cards, each a mini CSS swatch (accent colors + theme name + tiny archetype glyph) — **not** the sample-résumé images. Active card has a clear selected state. Click → set theme, re-render, persist.
- **Edit sidebar**: fixed ~380px, independently scrollable, on a **constant** fixed aurora gradient (never changes with theme). Holds the section cards (below).
- **Preview**: fills remaining width; backdrop carousel behind, themed `.cv` in front. The profile pane is **full-bleed** (escapes the centered `.account-wrap` width) so the preview is roomy.

---

## 2. Sidebar cards (Aurora Glass), in `profile` order

Each canonical section is a collapsible glass card with a section icon + name:

1. **Contact** — fullName, headline, email (default from account email), phone, location, + **Photo** upload (reuses `photo_path` pipeline; preview shows current/silhouette).
2. **Objective** — one textarea.
3. **Education** *(repeatable)* — sub-cards: institution, degree, field, startYear, endYear, gpa, location. `+ Add education`, `×` remove, ↑/↓ move.
4. **Experience** *(repeatable)* — sub-cards: organization, role, type (`work|internship|volunteer|research`), startDate, endDate, location, and a **bullets** mini-list (`+ Add bullet` / `×`). `+ Add experience`, `×`, ↑/↓.
5. **Honors & Awards** *(repeatable)* — title, issuer, year, description. `+ Add honor`, `×`, ↑/↓.
6. **Skills & Strengths** — one chip input: type + Enter/`+` to add a chip, `×` to remove. Single soft-strength list (no levels).
7. **Activities & Affiliations** *(repeatable)* — name, role, organization, period, description. `+ Add activity`, `×`, ↑/↓.
8. **Certificates & qualifications** — the re-homed multi-file upload (PDF/JPG/PNG ≤ 10 MB) + a list with view/remove; drives the backdrop carousel. (Reuses `account.js` cert logic.)
9. **For your scholarship ticket** *(distinct styling, footer of sidebar)* — a short note + 3 controls: **Nationality** (text/datalist), **Highest degree** (`<select>`: — / High school / Bachelor / Master's / PhD), **Field of interest** (text). Writes straight to the flat `profiles` columns (not into `cv`). Copy makes clear this feeds ticket booking, not the CV design.

**Live-sync**: one delegated listener; on input → `setByPath`/flat write → `renderPreview` → `scheduleSave`. A subtle **"Saved ✓"** indicator appears after each successful save. Draft preserved to `sessionStorage` on input; restored on next mount with a gentle notice.

---

## 3. Theme picker behavior

- Renders 8 cards from a static theme registry (id, name, accent(s), archetype).
- Selecting: set `profile.theme`, set `.cv` `data-theme` + archetype class, re-render, `scheduleSave` (writes `cv_theme`). Active state moves. Persists across reloads.
- On mount: apply saved `cv_theme` (fallback `editorial`).

---

## 4. Certificates backdrop

- On mount and after any cert add/remove: fetch `certificates` rows → build slides (image = signed URL `<img>`; PDF = placeholder). Dim + theme scrim so `.cv` stays legible.
- **Desktop**: left/right arrows in narrow edge gutters (don't fight CV scroll). Optional dot indicators. Clamp or wrap at ends (consistent).
- **Touch**: horizontal swipe on the Preview region advances slides (Preview tab only; never the Edit tab).
- **Empty**: no slides, no arrows, no dots — just the theme background.

---

## 5. Responsive (< ~900px)

- Single column. Sticky **bottom switch**: **Edit** ⇆ **Preview** (only one visible at a time; never side-by-side).
- A compact **theme button** opens the 8-card picker as a **bottom sheet**.
- Backdrop swipe active only on the Preview tab.
- Sidebar cards stack; sub-card ↑/↓ and chip inputs remain fully operable by touch + keyboard.

---

## 6. Accessibility & quality

- Every control has a real `<label>` (visually-hidden where the design hides it); section cards use `<fieldset>`/`aria` grouping where natural.
- Full keyboard path: tab order through cards; Enter adds a chip / submits an add; entry reorder available via ↑/↓ **buttons** (not drag-only).
- Contrast ≥ 4.5:1 on glass surfaces (feature-detect `backdrop-filter`; fall back to higher-opacity solid) and on dark/neon themes and over the backdrop (per-theme scrim). Add a subtle text scrim behind CV text on `neon`/`signature` if a glow reduces contrast.
- First paint: builder shell + empty inputs render immediately; saved `cv`, photo signed URL, and fonts hydrate asynchronously (`font-display: swap`) — never block on them.
- Uploads validate type/size with a friendly `A.toast()`; an invalid file is rejected without mutating state.
- No horizontal page overflow in any theme; long content scrolls within the preview.

---

## 7. `account.js` integration & teardown

- `renderProfile()` → clear pane → `BeaconCV.mount(pane, { db, user, A, esc, BUCKET:'user-files', bumpProfileRev, fmtDate, uuid })`.
- `mount` returns a teardown (clear debounce timer, remove listeners, revoke object URLs); `render()` calls it when leaving the Profile tab (parallel to `renderTicket`'s countdown cleanup).
- Old profile form / photo card / certificate card / Languages sub-form and their handlers are **removed** from `account.js`. `deleteAccount()`'s row-cleanup list (still deletes `certificates` + `profile_languages`) is **unchanged**.
