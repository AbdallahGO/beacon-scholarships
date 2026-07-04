# Quickstart: CV-Style Profile Builder (Feature 007)

Owner setup + acceptance. Consistent with features 001–006 (manual acceptance + local browser harness). This feature adds **no** edge functions and needs **no** secrets.

---

## Owner setup (one step)

1. **Run the DB migration.** Open the Supabase dashboard → SQL editor → paste the **whole** updated `supabase-setup.sql` and Run. The new dated *feature 007* section adds two columns (`profiles.cv jsonb`, `profiles.cv_theme text`); it is idempotent (safe to re-run) and touches nothing else. ([[sql-via-paste-ready-file]] — never paste a hand-typed fragment; always the maintained file.)

   Verify (SQL editor):
   ```sql
   select column_name, data_type from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name in ('cv','cv_theme');   -- expect: cv|jsonb, cv_theme|text
   ```
   Then run **Advisors** (or `mcp__supabase__get_advisors` security + performance) — expect no new findings.

2. **Deploy the static files.** `account.html`, `cv-builder.js`, `cv-builder.css`, `supabase-setup.sql` ship with the normal Cloudflare Pages deploy. No env vars, no function deploy.

> Nothing else. Certificates/photo already use the `user-files` bucket + existing policies. `ticket-checkout` and `admin.js` are unchanged.

---

## Local validation

```powershell
node --check cv-builder.js
node --check account.js
npx http-server -p 8080 -c-1 --silent   # then open http://localhost:8080/account.html#profile
```
Use the Chromium/Node harness ([[browser-validation-setup]]) for the flows below (PS 5.1 BOM/JSON gotchas noted there). Sign in with a test account.

---

## Acceptance checklist (maps to spec FRs / SCs)

**Core loop (US1)**
- [ ] Profile tab shows the glass sidebar + live preview (default `editorial`), no old form. (FR-013)
- [ ] Typing name/objective/etc. updates the preview on each keystroke, no reload. (FR-002, SC-001)
- [ ] ~800 ms after typing, a "Saved ✓" indicator appears; reload restores all data + theme. (FR-006/007, SC-003)
- [ ] Brand-new account: empty builder, no error; first edit persists. (FR-007)
- [ ] Session expiry mid-edit → in-progress text restored next load. (FR-009)

**Decoupling & sections (US1/US4)**
- [ ] Inputs and CV share no DOM; reordering/theming never clears an input. (FR-001)
- [ ] All 7 sections editable; education/experience/honors/activities add + remove + reorder (↑/↓ work without drag); experience multi-bullet. (FR-003/004, SC-007)
- [ ] Empty sections render nothing (no empty headers). (FR-005)
- [ ] Skills is a single soft-strength chip list; bar/percent themes show decorative fills, no numbers. (FR-003a)

**Non-regression (US2)** — the critical one
- [ ] Set CV full name → `profiles.full_name` mirrors it. (FR-011)
- [ ] "For your scholarship ticket" card saves nationality/degree/field-of-interest to flat columns. (FR-012)
- [ ] Book a ticket after using the builder → reveal shows correct name/nationality/degree/field-of-interest, no regression. (FR-010, SC-004)
- [ ] Returning user with old-form data sees it seeded (name + the 3 ticket fields); nothing lost. (FR-013, SC-008)
- [ ] Admin Accounts pane still shows the student's profile. (FR-010)

**Themes (US3)**
- [ ] Picker shows 8 themes with a clear active state; choice persists. (FR-014)
- [ ] Switching any theme re-renders identical data, zero loss, no broken layout. (FR-015, SC-002)
- [ ] All 3 archetypes present & correct (A: monolith/editorial; B: gridpop/starlight/terracotta/neon; C: timeline/signature). (FR-016)
- [ ] Sidebar glass look is identical across all themes. (FR-017)
- [ ] No horizontal page overflow in any theme, desktop + phone width. (SC-006)

**Certificates backdrop (US5)**
- [ ] No certificates → plain theme background, no carousel/arrows. (FR-019)
- [ ] With certs → dimmed/scrimmed backdrop; CV text stays legible (contrast ≥ 4.5:1). (FR-018, SC-005)
- [ ] Desktop arrows + touch swipe change slides; swipe doesn't hijack CV scroll. (FR-019)
- [ ] Image cert → real slide; PDF cert → themed placeholder slide (icon + filename). (FR-021)
- [ ] Certificates never appear as themed CV content. (FR-020)

**Photo (US6)**
- [ ] No photo → neutral silhouette in the theme's photo shape; `--photo-shape:none` themes omit it. (FR-022)
- [ ] Upload → appears in the theme's shape AND the nav avatar updates. (FR-023)

**Responsive & a11y (US7)**
- [ ] < ~900px: single column, Edit/Preview sticky switch, theme sheet; never side-by-side. (FR-024)
- [ ] Fully keyboard operable incl. add/remove/reorder. (FR-025, SC-007)
- [ ] Builder paints immediately without waiting on photo/fonts. (FR-026)

**Scope guards**
- [ ] Languages sub-form gone from the UI; `profile_languages` data still intact in DB. (FR-027)
- [ ] No Download-PDF button (out of scope). (FR-028)

**Security**
- [ ] A second signed-in user cannot read/write another user's `cv` (RLS `auth.uid() = user_id`). (FR-008)
- [ ] `node --check` passes for `cv-builder.js` + `account.js`; `get_advisors` clean.
