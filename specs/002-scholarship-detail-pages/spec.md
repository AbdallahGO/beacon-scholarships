# Feature Specification: Own Scholarship Detail Pages

**Feature Branch**: `002-scholarship-detail-pages`
**Created**: 2026-06-11
**Status**: Draft
**Input**: User description: "in each scholarship card apply button linkes to for9a's pages wiches i don't want it. extract each scholarship's links 'for9a' to make our pages to our cards"

## Clarifications

### Session 2026-06-11

- Q: What language should the scholarship detail pages display? → A: Both Arabic & English (visitor can switch language).
- Q: How should the content extracted from for9a pages be presented on our detail pages? → A: Full text as-is — each source page's complete descriptive content is reproduced on our detail page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Scholarship Details on Our Own Page (Priority: P1)

A visitor browsing the scholarship listing clicks a scholarship card (or its apply/details button) and lands on a detail page that belongs to our site — not on for9a.com. The page shows the full information for that scholarship: title, provider organization, country, study levels, funding type, deadline, description, eligibility criteria, and benefits.

**Why this priority**: This is the core of the request — visitors must stay on our site instead of being sent to a third-party site. Without it, every card click leaks traffic to for9a and there is no product of our own.

**Independent Test**: Open the scholarship listing, click any card's button, and confirm the browser stays on our site and displays a detail page populated with that scholarship's information.

**Acceptance Scenarios**:

1. **Given** the scholarship listing is displayed, **When** the visitor clicks a scholarship card's button, **Then** an internal detail page for that exact scholarship opens (no navigation to for9a.com).
2. **Given** a scholarship detail page is open, **When** the visitor reviews it, **Then** they see the scholarship's title, organization, country, study levels, funding type, deadline status, and descriptive content (description, eligibility, benefits).
3. **Given** a detail page is open, **When** the visitor uses the back navigation, **Then** they return to the listing in its previous state.

---

### User Story 2 - Apply Through the Official Source (Priority: P2)

From a scholarship detail page, the visitor can take an "Apply" action that leads to the scholarship's official application destination (the provider's own application page), bypassing for9a entirely.

**Why this priority**: Viewing details is only useful if the visitor can still act on the opportunity. The apply path must exist, but it depends on the detail pages from Story 1 existing first.

**Independent Test**: Open any detail page that has an official application destination and confirm the apply action leads there directly, with no for9a address involved.

**Acceptance Scenarios**:

1. **Given** a detail page for a scholarship with a known official application destination, **When** the visitor activates the apply action, **Then** they are taken directly to the official provider destination (not for9a).
2. **Given** a scholarship whose official application destination could not be obtained, **When** the visitor views its detail page, **Then** the page presents the available guidance (e.g., application steps or provider name) without showing any link to for9a.

---

### User Story 3 - Complete Detail Content for the Whole Catalog (Priority: P3)

The detailed content for every scholarship in the catalog (across all countries) is collected from each scholarship's existing source link, so that every card in the catalog has its own populated detail page.

**Why this priority**: Stories 1 and 2 define the experience; this story extends it to full catalog coverage. A subset of populated pages already delivers value, so full coverage is the final increment.

**Independent Test**: Pick scholarships at random from several different country lists and verify each has a detail page with extracted content (not just the summary fields already shown on the card).

**Acceptance Scenarios**:

1. **Given** the full catalog across all country lists, **When** the extraction of detail content is complete, **Then** every scholarship record has detail content associated with it or is explicitly flagged as incomplete.
2. **Given** a scholarship whose source page is unavailable or removed, **When** extraction runs, **Then** the scholarship is flagged and its detail page still renders using the summary data already in the catalog.

---

### Edge Cases

- What happens when a scholarship's source page no longer exists (removed or expired on for9a)? The detail page must still render from existing summary data, and no broken external link is shown.
- What happens when extracted content is partial (e.g., description present but eligibility missing)? The page shows the sections that exist and omits empty sections rather than showing blanks.
- What happens when a visitor opens a detail page address for a scholarship ID that doesn't exist? A friendly "not found" state is shown with a way back to the listing.
- What happens with scholarships whose deadline has already passed? The detail page still displays, with its deadline status clearly shown.
- What happens when only one language version (Arabic or English) of a scholarship's content could be extracted? The detail page shows the available language, the language switch indicates the other is unavailable, and the record is flagged as partial.
- Duplicate scholarships appearing in multiple country lists must each resolve to a consistent detail page.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every scholarship card's button MUST navigate to an internal detail page for that scholarship instead of any for9a.com page.
- **FR-002**: Each scholarship MUST have a detail page presenting at minimum: title, organization, country, study levels, funding type, and deadline status, plus extracted content (description, eligibility criteria, benefits, application guidance) when available.
- **FR-003**: Detail content for each scholarship MUST be collected from that scholarship's existing source link (the for9a opportunity address currently stored with each record) and stored with our catalog data, so that pages render without depending on for9a at view time. The full descriptive text of the source page is captured as-is (not summarized or rewritten), preserving its section structure (description, eligibility, benefits, application steps).
- **FR-004**: The apply action on a detail page MUST lead to the scholarship's official application destination (the provider's page) when one was obtained; for9a addresses MUST never be used as the apply destination.
- **FR-005**: No user-facing navigation link on cards or detail pages may point to the for9a domain.
- **FR-006**: Each detail page MUST be reachable at a stable, shareable address tied to the scholarship's identity, and opening an address for an unknown scholarship MUST show a "not found" state with a path back to the listing.
- **FR-007**: When extracted content is missing or partial for a scholarship, its detail page MUST still render gracefully from the summary data, omitting empty sections.
- **FR-008**: Scholarships whose source pages could not be extracted MUST be identifiable (flagged) so coverage gaps can be reviewed and re-attempted.
- **FR-009**: Detail content MUST be available in both Arabic and English: extraction collects both language versions of each scholarship's content, and the detail page lets the visitor switch between the two languages. If only one language version could be obtained, the page shows that language and the scholarship is flagged as partially extracted.

### Key Entities

- **Scholarship**: An opportunity already in the catalog — identity (ID), title, organization, country, flag, study levels, funding type, field, deadline status/date text, source link, image.
- **Scholarship Detail Content**: The extended content collected from a scholarship's source page — description, eligibility criteria, benefits, application steps/guidance, official application destination, and an extraction status (complete / partial / failed). Stored in two language variants (Arabic and English) per scholarship.
- **Detail Page**: The user-facing page joining a Scholarship with its Detail Content at a stable address.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of scholarship cards navigate to an internal detail page; zero cards link to for9a.
- **SC-002**: At least 95% of scholarships in the catalog have extracted detail content beyond the summary fields in both Arabic and English; scholarships missing one or both languages are explicitly flagged.
- **SC-003**: A visitor can go from the listing to a scholarship's full details in a single click, and the detail page displays within 2 seconds on a typical connection.
- **SC-004**: For every scholarship with an obtained official application destination, the apply action reaches the provider's page directly — zero apply actions route through for9a.
- **SC-005**: Detail pages for unknown or failed-extraction scholarships never show a broken page: 100% render either content, a graceful partial view, or a "not found" state.

## Assumptions

- The existing source links stored with each scholarship record (for9a opportunity addresses) are usable as the source for a one-time/batch content extraction; for9a is used only as a data source during extraction, never as a user-facing destination.
- for9a opportunity pages typically include an official "apply" destination pointing to the provider; that destination is what the apply action should use. Where it cannot be obtained, the detail page shows available guidance without an external apply link.
- Scholarship images currently hosted on for9a's image service remain in use for now; replacing image hosting is out of scope for this feature (only navigation links are in scope).
- Extraction is a content-collection effort over the existing catalog (~26 country lists); keeping detail content continuously synchronized with for9a over time is out of scope.
- The existing card summary fields (title, org, country, levels, fund, deadline) remain the source of truth for listing display; extracted content augments rather than replaces them.
- Reproducing the source pages' full descriptive text on our pages is accepted by the project owner (chosen over summarizing or rewriting); any content-attribution concerns are the owner's responsibility and out of scope for this feature.
