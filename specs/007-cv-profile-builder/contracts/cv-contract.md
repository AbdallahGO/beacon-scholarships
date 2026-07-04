# Contract: CV data & render interface

The stable interface between the three layers (sidebar → state → {preview | carousel}). `data-model.md` defines the object *shape*; this defines the *behavioral* contract the code must honor.

---

## 1. State access — `data-path` grammar

Every sidebar input carries `data-path` pointing into `profile`. One delegated `input`/`change` listener resolves it.

- Dotted keys and numeric array indices: `contact.email`, `objective`, `education.2.gpa`, `experience.0.bullets.1`, `skills.3`, `activities.1.role`.
- `setByPath(obj, path, value)` writes; `getByPath(obj, path)` reads. Numeric segments index arrays; missing intermediate objects/arrays are created on write.
- Contract rules:
  - Inputs **only** call `setByPath` (never touch preview/carousel DOM).
  - After any state mutation: `renderPreview(profile)` then `scheduleSave()`.
  - Repeatable ops mutate the array directly (`push` blank / `splice` remove / swap for move) then re-render — indices in `data-path` are re-derived on render, so no stale bindings.

**Ticket-card inputs are the exception**: the three "For your scholarship ticket" fields use `data-flat="nationality|degree|field_of_interest"` (not `data-path`) and write to a small `flat` state mirrored to the flat columns — they are **not** part of `profile`/`cv`.

---

## 2. `renderPreview(profile)` — output skeleton (stable hooks)

Pure function → sets `.cv` innerHTML (or a diffed subtree). Stable class names + data hooks so themes/tests can target them. Empty sections emit **nothing**.

```html
<article class="cv" data-theme="editorial" >   <!-- + class cv--arch-a|b|c -->
  <header class="cv-head">
    <div class="cv-photo" data-shape="…">…img|silhouette|omitted…</div>
    <div class="cv-id">
      <h1 class="cv-name">{contact.fullName}</h1>
      <p class="cv-headline">{contact.headline}</p>
    </div>
    <ul class="cv-contact">
      <li data-k="email">…</li><li data-k="phone">…</li><li data-k="location">…</li>
    </ul>
  </header>

  <section class="cv-sec cv-sec--objective"><h2>Profile</h2><p>{objective}</p></section>

  <section class="cv-sec cv-sec--education"><h2>Education</h2>
    <div class="cv-entry cv-edu">…institution / degree in field / dates / gpa / location…</div>
  </section>

  <section class="cv-sec cv-sec--experience"><h2>Experience</h2>
    <div class="cv-entry cv-exp">
      <span class="cv-tag">{type}</span> …role @ organization / dates / location…
      <ul class="cv-bullets"><li>…</li></ul>
    </div>
  </section>

  <section class="cv-sec cv-sec--honors"><h2>Honors &amp; Awards</h2>
    <div class="cv-entry cv-honor">…title / issuer / year / description…</div>
  </section>

  <section class="cv-sec cv-sec--skills"><h2>Skills &amp; Strengths</h2>
    <ul class="cv-skills" data-style="bar|percent|chips|dots">
      <li class="cv-skill">{skill}</li>            <!-- bar/percent/dots are DECORATIVE via CSS; no number -->
    </ul>
  </section>

  <section class="cv-sec cv-sec--activities"><h2>Activities &amp; Affiliations</h2>
    <div class="cv-entry cv-act">…name / role / organization / period / description…</div>
  </section>
</article>
```

**Rules**:
- All interpolated text goes through `esc()` (XSS-safe; CV content may be any language — add `dir="auto"` on text blocks).
- Photo: `contact.photoUrl` if present → `<img referrerpolicy="no-referrer">`; else neutral silhouette; theme `--photo-shape:none` → omit `.cv-photo` entirely.
- The renderer **must not** read `certificates` (FR-020).
- Section order is fixed (contact → objective → education → experience → honors → skills → activities); themes reposition via CSS/archetype, not by reordering markup (keeps a11y reading order sane).

---

## 3. Archetype layout contract

`.cv` gets exactly one archetype class; CSS lays out the same markup three ways:

- **`cv--arch-a` (Side Column)**: a colored vertical column (photo/contact/skills/education) beside a main column (objective/experience/honors/activities). Themes: `monolith`, `editorial`.
- **`cv--arch-b` (Header Stack)**: full-width header band (name/headline/photo/objective) then a 1–2 column body. Themes: `gridpop`, `starlight`, `terracotta`, `neon`.
- **`cv--arch-c` (Timeline)**: experience/education entries strung on a vertical connector with node dots. Themes: `timeline`, `signature`.

Which sections sit in the side column vs main (arch A), or which are the connector entries (arch C), is CSS-driven off the stable section classes above.

---

## 4. Theme token contract

Each theme is a CSS block `[data-theme="id"]{ … }` setting the custom properties in `data-model.md §4`. Switching theme = set `data-theme` + swap the archetype class; **no data touched**. The picker persists the choice (`cv_theme` + `cv.theme`). Adding a theme = new token block (+ optional decor) + entry in the picker list + (if new) an archetype class — no renderer change.

**Skill styles are decorative**: `--skill-style: bar|percent|dots` renders a full/uniform bar, a fixed-width meter, or a filled dot row behind the skill label — never a student-entered percentage (clarified, FR-003a).

---

## 5. Certificates carousel contract (independent reader)

- Input: the student's `public.certificates` rows (fetched on mount + after add/remove). **Not** from `profile`/`cv`.
- Output: back-layer slides behind `.cv`. Image mime → `<img>` via signed URL; PDF mime → themed placeholder slide (`file_name` + doc glyph).
- Dim/scrim: `filter: blur(2px) brightness(.55)` + a theme-tuned scrim var so `.cv` text keeps contrast ≥ 4.5:1.
- Controls: desktop edge arrows (narrow gutters, don't overlap CV scroll); touch swipe bound to the Preview region only. Empty set → no layer, no controls.
- This reader **never** writes state and **never** feeds the theme renderer (FR-020) — preserving §2 decoupling with two independent consumers of `profile`/its siblings.

---

## 6. Persistence contract (see data-model §3)

`scheduleSave()` debounces ~800 ms then upserts `profiles { user_id, cv, cv_theme, full_name(mirror), nationality, degree, field_of_interest }`. Shows "Saved ✓". Writes a `sessionStorage` draft on every input; clears it after a successful save; restores it on next mount if present.
