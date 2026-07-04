# Feature Specification: CV-Style Profile Builder

**Feature Branch**: `007-cv-profile-builder`
**Created**: 2026-07-05
**Status**: Draft
**Input**: User description: "CV-style profile builder for the Beacon account Profile tab. Replace the current formal profile form with a résumé/CV builder: a glassmorphic Aurora Glass edit sidebar on the left and a live CV preview on the right that re-renders on every keystroke, in one of 8 user-selectable themes." Authoritative source of requirements: `themes/beacon-cv-profile-builder-spec.md` (sections 1–11).

## Overview

The Profile tab of a signed-in student's account currently shows a plain, formal data-entry form. This feature replaces that form with a **CV/résumé builder**: the student edits their information in a glassmorphic left sidebar and watches a **live CV preview** update on the right, styled in one of **8 themes** they pick from a gallery. The information Beacon needs for scholarship matching (contact, objective, education, experience, honors, skills, activities) is the same information a scholarship CV contains — so instead of filling a cold form, the student builds something that feels like their own effort toward a scholarship, which raises completion and perceived value.

The single most important architectural rule (spec §2) is that **data and theme are fully decoupled**: there is one data object the inputs only ever write to, and one preview that only ever reads from it. Switching themes never loses or corrupts data because inputs and the rendered CV are separate layers linked only by shared state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a profile as a live, auto-saving CV (Priority: P1)

A signed-in student opens the **Profile** tab and sees a glassmorphic edit sidebar beside a live CV preview (in a default theme). As they type their name, objective, education and other details, the CV on the right updates on **every keystroke**. Their work **auto-saves** without a Save button; when they leave and return, everything is exactly as they left it.

**Why this priority**: This is the core value and the MVP. Even with a single theme, a student who can fill a CV and have it persist has received the whole point of the feature. Every other story builds on this edit→preview→save loop.

**Independent Test**: Sign in, open Profile, type into each section, confirm the preview reflects each change live, wait for the autosave indicator, reload the page, and confirm all data is restored.

**Acceptance Scenarios**:

1. **Given** a signed-in student on the Profile tab, **When** they type into the "Full name" and "Objective" fields, **Then** the CV preview updates to show that name and objective within a fraction of a second, with no page reload.
2. **Given** the student has stopped typing, **When** roughly one second passes, **Then** their data is saved to their account and a subtle "Saved" indicator appears.
3. **Given** the student previously entered data, **When** they reload the Profile tab, **Then** the sidebar and preview are re-populated with the saved data.
4. **Given** a brand-new student who has never saved a profile, **When** they open the Profile tab, **Then** they see an empty builder (no error) that becomes their profile on first edit.

---

### User Story 2 - Keep scholarship-ticket and admin data correct (Priority: P1)

Because the CV builder replaces the old profile form, the specific fields that other parts of Beacon rely on must keep being captured. When a student later books a scholarship ticket, the ticket must still reveal their correct **name, nationality, highest degree and field of interest**; the admin oversight view must still see meaningful profile data. A small **"For your scholarship ticket"** card in the sidebar collects the three items the CV itself does not naturally carry (nationality, highest-degree level, field of interest), and the student's name flows from the CV into the shared profile.

**Why this priority**: This is a non-regression guarantee. Shipping the builder without it would silently blank the ticket reveal and admin view — an unacceptable break of an existing paid flow. It is P1 alongside the core loop.

**Independent Test**: Fill the CV name plus the three ticket-detail fields, then (in a test) confirm the shared profile record holds the mirrored name and the three values, so a subsequent ticket booking reveals them correctly.

**Acceptance Scenarios**:

1. **Given** a student sets their full name in the CV contact section, **When** the profile saves, **Then** the shared profile's name field holds that same name.
2. **Given** a student fills nationality, highest degree and field of interest in the "For your scholarship ticket" card, **When** the profile saves, **Then** those three values are stored on the shared profile and are available to the ticket-booking flow and the admin view.
3. **Given** a student who books a ticket after using the builder, **When** the ticket is revealed, **Then** name, nationality, degree and field of interest match what they entered — with no regression from prior behavior.

---

### User Story 3 - Choose from a gallery of 8 themes without losing data (Priority: P2)

The student picks a theme from a gallery of **8 visually distinct designs**. Selecting a theme instantly re-renders the **same** data in the new design; nothing is lost or reflowed incorrectly. Their choice persists across visits. The edit sidebar itself keeps one consistent glassmorphic look regardless of the chosen theme.

**Why this priority**: Theming is the feature's signature delight and personalization, but it depends on the P1 edit/preview/save loop existing first. A student can get value from one theme; the gallery multiplies it.

**Independent Test**: Enter data, then cycle through all 8 themes one by one, confirming each renders the same content correctly and that switching never empties or corrupts a field; reload and confirm the last chosen theme is still selected.

**Acceptance Scenarios**:

1. **Given** a student with data entered, **When** they select any of the 8 themes, **Then** the preview re-renders the identical data in that theme's design with no data loss and no broken layout.
2. **Given** a selected theme, **When** the student reloads, **Then** the same theme is still active.
3. **Given** any theme is active, **When** the student looks at the edit sidebar, **Then** its glassmorphic appearance is unchanged (the sidebar look never changes with the theme).
4. **Given** the 8 themes, **When** each is rendered, **Then** all three layout archetypes (side-column, header-stack, timeline) are represented and correct for their assigned themes.

---

### User Story 4 - Manage repeatable sections (Priority: P2)

The student adds multiple entries to Education, Experience, Honors & Awards, and Activities; removes entries; and reorders them. Experience entries support multiple bullet points. Empty sections show nothing in the preview (no dangling headers).

**Why this priority**: A real CV needs multiple schools, jobs and awards. Important for completeness, but the single-entry core loop (US1) is usable without reordering.

**Independent Test**: Add several education and experience entries, add/remove bullets on an experience entry, reorder entries, delete one, and confirm the preview matches the resulting order and contents at each step; clear a whole section and confirm its header disappears from the preview.

**Acceptance Scenarios**:

1. **Given** the Education section, **When** the student clicks "Add", **Then** a new blank entry appears in the sidebar and (once filled) in the preview.
2. **Given** multiple entries in a section, **When** the student reorders them, **Then** the preview reflects the new order immediately.
3. **Given** an entry, **When** the student removes it, **Then** it disappears from both sidebar and preview.
4. **Given** an Experience entry, **When** the student adds or removes bullet lines, **Then** the preview's bullet list updates accordingly.
5. **Given** a section with no entries, **When** the preview renders, **Then** that section's heading is absent.

---

### User Story 5 - Show uploaded certificates as a backdrop behind the CV (Priority: P2)

The student uploads their degree and qualification certificates in a sidebar card. Those uploads appear as a **full-bleed carousel behind** the live CV preview, dimmed and softened so the CV text stays readable. Desktop shows left/right arrows; touch devices swipe. With no certificates uploaded, the backdrop is simply the theme's own background (no broken/empty carousel).

**Why this priority**: This re-homes the one kept piece of the old form and adds a distinctive, motivating backdrop. Valuable but not required for the core CV to function.

**Independent Test**: With no certificates, confirm a clean theme background and no stray arrows; upload two image certificates and one PDF, confirm each becomes a legible dimmed backdrop slide navigable by arrow/swipe, and confirm CV text remains readable over every slide.

**Acceptance Scenarios**:

1. **Given** no uploaded certificates, **When** the preview renders, **Then** the backdrop is the plain theme background with no carousel controls.
2. **Given** one or more uploaded certificates, **When** the preview renders, **Then** they appear as a dimmed/scrimmed carousel behind the CV, and the CV text remains legible (contrast maintained).
3. **Given** multiple certificate slides on desktop, **When** the student clicks the edge arrows, **Then** the backdrop advances/retreats between slides.
4. **Given** multiple certificate slides on a touch device, **When** the student swipes the preview, **Then** the backdrop changes slides without interfering with scrolling the CV.
5. **Given** a PDF certificate, **When** it is shown as a slide, **Then** its first page renders as an image.

---

### User Story 6 - Personalize with a photo (Priority: P3)

The student uploads a personal photo, which replaces the theme's placeholder face in whatever photo shape the current theme uses (circle, arch, diamond, etc.). Themes that use no photo omit it gracefully. The photo stays consistent with the small avatar shown in the site's navigation.

**Why this priority**: A nice personalization touch that increases ownership, but the CV is fully usable with the neutral placeholder.

**Independent Test**: With no photo, confirm a neutral placeholder silhouette in the theme's photo shape; upload a photo and confirm it appears in the correct shape across themes and matches the nav avatar; switch to a no-photo theme and confirm the photo area is cleanly omitted.

**Acceptance Scenarios**:

1. **Given** no uploaded photo, **When** a theme with a photo shape renders, **Then** a neutral placeholder silhouette appears in that shape.
2. **Given** an uploaded photo, **When** any photo-bearing theme renders, **Then** the student's photo fills the theme's photo shape and the site navigation avatar reflects the same photo.
3. **Given** a theme that uses no photo, **When** it renders, **Then** no photo or empty photo frame appears.

---

### User Story 7 - Use the builder on a phone (Priority: P3)

On a small screen the builder stacks into two toggleable tabs — **Edit** and **Preview** — with a sticky bottom switch, plus a compact theme control that opens the gallery as a sheet. The desktop side-by-side layout is never forced onto phones.

**Why this priority**: Mobile support broadens reach, but the primary editing experience is validated on desktop first.

**Independent Test**: On a narrow viewport, confirm the layout is a single column with an Edit/Preview toggle and a theme sheet, that both tabs are fully usable, and that backdrop swipe is bound only to the Preview tab.

**Acceptance Scenarios**:

1. **Given** a viewport narrower than ~900px, **When** the Profile tab loads, **Then** the builder shows a single-column layout with an Edit/Preview tab switch and a theme button.
2. **Given** the mobile layout, **When** the student switches between Edit and Preview, **Then** each shows the corresponding full-width surface without the other.

---

### Edge Cases

- **Session expires mid-edit**: Unsaved keystrokes should not be silently lost; the in-progress data is preserved and restored on the next load (matching the existing form's draft-preservation behavior).
- **Very long content**: Long objectives, many bullets, or many entries must not break any theme's layout; the preview scrolls rather than overflowing the page horizontally.
- **Legibility on dark/neon themes and over certificate backdrops**: Text contrast must stay ≥ 4.5:1, including translucent glass surfaces and text over glows or backdrops (scrim tuned per theme).
- **Unsupported or oversized uploads**: Photo and certificate uploads enforce the existing type/size limits with a friendly message; an invalid file is rejected without corrupting state.
- **Migration from old form**: A student who previously filled the old formal form still has their existing name/nationality/degree/field-of-interest available (the shared profile record is preserved), so nothing they entered before is lost.
- **Reorder for keyboard/non-drag users**: Reordering entries must be possible without drag-and-drop (e.g., move up/down controls).
- **Empty profile first paint**: The builder appears immediately with empty inputs and hydrates saved data when it arrives, never blocking on photo or fonts.

## Requirements *(mandatory)*

### Functional Requirements

**Core decoupling & data**
- **FR-001**: The system MUST maintain a single profile data object that the sidebar inputs only ever write to and the preview only ever reads from; inputs and the rendered CV MUST NOT share DOM.
- **FR-002**: The system MUST update the live CV preview on every input change (each keystroke) as a pure render of the profile data plus the selected theme.
- **FR-003**: The system MUST support all seven profile sections — Contact, Objective, Education, Experience, Honors & Awards, Skills (technical + soft), Activities — as editable content, using canonical section-to-CV mappings.
- **FR-004**: Education, Experience, Honors & Awards, and Activities MUST support adding, removing, and reordering entries; Experience entries MUST support multiple bullet lines.
- **FR-005**: Empty sections MUST render nothing in the preview (no empty section headers).

**Persistence**
- **FR-006**: The system MUST auto-save the whole profile object and the chosen theme to the signed-in student's account, debounced to shortly after the last change (~800 ms), and MUST show a subtle "Saved" confirmation.
- **FR-007**: On load, the system MUST restore the student's saved profile and theme; a student with no saved profile MUST get an empty builder that is created on first save.
- **FR-008**: All persisted profile data MUST be scoped so that a student can only read and write their own record.
- **FR-009**: If a session expires mid-edit, in-progress input MUST be preserved and offered back on the next load.

**Non-regression with existing flows (US2)**
- **FR-010**: The system MUST continue to capture the student's full name, nationality, highest-degree level (from the fixed set: high school, bachelor, master, PhD), and field of interest, and MUST keep the shared profile record populated with these so that ticket booking and admin oversight continue to work unchanged.
- **FR-011**: The system MUST mirror the student's CV full name into the shared profile name field on every save.
- **FR-012**: The system MUST provide a dedicated, clearly-labeled "For your scholarship ticket" area in the sidebar for nationality, highest-degree level, and field of interest, which are not part of the themed CV content.
- **FR-013**: The old formal profile form MUST be removed except for the certificates upload, which is re-homed into the builder; removing the form MUST NOT delete or orphan previously saved shared-profile data.

**Theming (US3)**
- **FR-014**: The system MUST offer a theme picker with 8 distinct themes and a clear active-selection state, and MUST persist the selection.
- **FR-015**: Switching themes MUST re-render the identical data with zero data loss and MUST NOT break layout.
- **FR-016**: The 8 themes MUST collectively implement three layout archetypes — side-column, header-stack, and timeline — each theme rendering correctly for its assigned archetype.
- **FR-017**: The edit sidebar MUST use one consistent glassmorphic ("Aurora Glass") input system across all themes; the sidebar's appearance MUST NOT change when the CV theme changes.

**Certificates backdrop (US5)**
- **FR-018**: Uploaded certificates MUST be presented as a full-bleed carousel behind the CV preview, dimmed/scrimmed so CV text stays legible (contrast ≥ 4.5:1), reusing the student's existing certificate uploads.
- **FR-019**: The backdrop carousel MUST be navigable by edge arrows on desktop and swipe on touch, and MUST show a plain theme background with no controls when there are no certificates.
- **FR-020**: Certificates MUST be treated as presentation-only and MUST NOT be read by the theme/CV renderer (only by the backdrop carousel), preserving the data/theme decoupling.
- **FR-021**: Image certificates MUST render directly as slides and PDF certificates MUST render their first page as an image.

**Photo (US6)**
- **FR-022**: An uploaded photo MUST fill the current theme's photo shape; with no photo, a neutral placeholder silhouette MUST appear in that shape; themes that use no photo MUST omit it cleanly.
- **FR-023**: The photo MUST stay consistent with the site navigation avatar (single source of truth for the student's photo).

**Responsive & accessibility (US7)**
- **FR-024**: On viewports narrower than ~900px, the system MUST present a single-column layout with an Edit/Preview tab switch and a theme control that opens the gallery as a sheet; it MUST NOT force the side-by-side desktop layout on phones.
- **FR-025**: All inputs MUST have real labels (visually hidden if the design hides them), MUST be fully keyboard operable (including a non-drag way to reorder entries), and MUST maintain text contrast ≥ 4.5:1 on all surfaces and themes.
- **FR-026**: The builder MUST render immediately without blocking first paint on photos or fonts.

**Scope guards**
- **FR-027**: The Languages sub-form of the old profile is removed from this UI; existing language data MUST be left untouched in storage (not surfaced, not deleted).
- **FR-028**: A "Download PDF" export is OUT OF SCOPE for this feature and MUST NOT block delivery of the builder.

### Key Entities *(include if feature involves data)*

- **Student CV profile**: The single per-student data object holding contact (name, headline, email, phone, location, photo reference), objective, and the repeatable sections education, experience, honors, skills (technical/soft), and activities, plus the chosen theme id. This is the contract between the sidebar and every theme. Stored on the student's existing shared profile record (added alongside the flat fields, not as a separate record).
- **Shared profile flat fields**: The pre-existing per-student fields consumed by other flows — name, nationality, highest-degree level, field of interest, photo reference — which the builder keeps populated for ticket booking and admin oversight.
- **Certificate**: A student-uploaded file (image or PDF) with a name and type, already captured today; read only by the backdrop carousel in this feature.
- **Theme**: One of 8 named designs, each mapping to a layout archetype and a set of visual tokens (colors, fonts, label/photo/skill styles, decorative elements). Themes store no student data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student can fill in their name and objective and see the live preview reflect it in under 1 second, with no page reload, on first use.
- **SC-002**: Switching between any of the 8 themes preserves 100% of entered data — zero fields lost or corrupted across all themes.
- **SC-003**: A student's profile and theme choice persist across sessions: after reload, 100% of previously saved fields and the selected theme are restored.
- **SC-004**: After a student uses the builder (including the ticket-detail fields), a subsequent scholarship-ticket booking reveals the correct name, nationality, degree, and field of interest with zero regression versus the previous form.
- **SC-005**: With certificates uploaded, CV text remains legible over every backdrop slide (measured contrast ≥ 4.5:1); with no certificates, no empty carousel or stray controls appear.
- **SC-006**: All 8 themes render the same student's data without any horizontal page overflow or broken layout, across desktop and a phone-width viewport.
- **SC-007**: The builder is fully operable by keyboard alone, including adding, removing, and reordering entries.
- **SC-008**: No previously saved profile data (name, nationality, degree, field of interest, certificates, languages) is lost when the old form is replaced.

## Assumptions

- **Reuse existing account/auth**: The feature lives in the existing signed-in account Profile tab and reuses the existing authentication, the existing per-student profile record, the existing certificate store, and the existing photo pipeline (so the nav avatar stays in sync). Only additive storage is introduced for the CV object and theme.
- **Storage shape (stakeholder-decided)**: The full CV object and the theme are stored on the existing shared profile record (adding a CV field and a theme field), not in a new separate record — because that record is a shared contract other flows already read. The cleanly-mappable name is mirrored to the flat name field on save.
- **Ticket-detail reconciliation (stakeholder-decided)**: Nationality, highest-degree level, and field of interest have no clean CV equivalent, so they are collected in a small dedicated sidebar card that writes straight to the flat profile fields.
- **Scope (stakeholder-decided)**: All 8 themes (editorial, terracotta, neon, timeline, monolith, gridpop, starlight, signature) across the 3 archetypes are in scope for this feature; PDF export is deferred; the Languages sub-form is dropped from the UI (data retained).
- **Platform conventions**: Implemented as static client-side pages backed by the existing hosted data/auth service, with no new framework or build step, matching the existing site's conventions and file organization.
- **Certificates already populated**: Many students already have certificate uploads; those existing files feed the backdrop carousel without re-upload.
- **Fonts and decorative assets**: Theme typography uses freely available web fonts and inline decorative graphics; nothing blocks first paint.
- **Authoritative detail**: `themes/beacon-cv-profile-builder-spec.md` remains the detailed design reference for archetypes, tokens, per-theme design language, and the acceptance checklist; this spec governs scope and outcomes.
