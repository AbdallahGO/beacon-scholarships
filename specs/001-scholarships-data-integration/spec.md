# Feature Specification: Scholarships Data Integration

**Feature Branch**: `001-scholarships-data-integration`  
**Created**: 2026-06-09  
**Status**: Draft  
**Input**: User description: "at ' ScholarShips_Data' Folder there is scholarships data from each countries add to my website. take data from '*.clean.json' files only"

## Clarifications

### Session 2026-06-09

- Q: How should opportunities whose deadline has passed be handled? → A: Exclude expired opportunities entirely — only open/upcoming ones are shown.
- Q: How should the large catalogue be rendered? → A: Render all matching opportunities at once (no pagination or load-more).
- Q: Should the per-opportunity thumbnail image be shown on cards? → A: Yes — show the thumbnail on each card, with a placeholder when the image is missing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse all real scholarships from every country (Priority: P1)

A student visits the Beacon website and sees the full catalogue of real, current scholarship opportunities drawn from every country file in the collection, instead of the small hardcoded sample. Each opportunity shows its title, sponsoring organization, country (with flag), study levels, funding type, field, and deadline, with a working link to apply.

**Why this priority**: This is the core of the request — the site is currently limited to ~15 hardcoded examples. Loading the real data from all country files is what makes the site useful and is the foundation every other story builds on.

**Independent Test**: Open the site with the data files present and confirm the grid is populated with opportunities sourced from the country data files (clearly more than the previous 15), each card showing complete information and a working "Apply" link.

**Acceptance Scenarios**:

1. **Given** the data collection contains scholarship files for many countries, **When** a visitor opens the homepage, **Then** the grid displays scholarship cards aggregated from all available country files.
2. **Given** a scholarship card is displayed, **When** the visitor reads it, **Then** it shows a thumbnail image (or placeholder), title, organization, country with flag, study level(s), funding type, field, and a deadline indicator.
3. **Given** a scholarship card is displayed, **When** the visitor clicks "Apply", **Then** the correct opportunity page opens in a new browser tab.
4. **Given** the homepage statistics (live opportunities count and number of countries), **When** the page loads, **Then** the displayed counts reflect the actual aggregated data rather than fixed placeholder numbers.

---

### User Story 2 - Filter, search, and sort the full catalogue (Priority: P2)

A student narrows down the larger catalogue using the existing controls: searching by name/country/field, filtering by study level, filtering by funding type, choosing a specific country, and sorting by closing date or name.

**Why this priority**: With many opportunities now loaded, the existing filtering and search controls become essential for the catalogue to remain usable. The controls already exist; they must continue working correctly against the full dataset.

**Independent Test**: With the full data loaded, apply each filter/search/sort control individually and confirm the visible results update correctly and the result count matches.

**Acceptance Scenarios**:

1. **Given** the full catalogue is loaded, **When** the visitor selects a specific country from the country dropdown, **Then** only opportunities for that country are shown and the country dropdown lists every country present in the data.
2. **Given** the full catalogue is loaded, **When** the visitor selects a study level or funding filter, **Then** only matching opportunities remain visible and the result count updates.
3. **Given** the full catalogue is loaded, **When** the visitor types a query in the search box, **Then** the list narrows to opportunities whose title, organization, country, field, or level matches the query.
4. **Given** active filters that match nothing, **When** the result set is empty, **Then** the friendly empty state is shown.
5. **Given** the visitor has applied filters, **When** they choose "Reset filters", **Then** all controls return to defaults and the full catalogue is shown again.

---

### User Story 3 - Trust the freshness and accuracy of each listing (Priority: P3)

A student relies on the deadline indicator and funding label to judge which opportunities are still open and worth pursuing, so the catalogue feels current and trustworthy.

**Why this priority**: Accuracy of deadline and funding presentation drives student trust and conversion, but it depends on Stories 1 and 2 already being in place.

**Independent Test**: Inspect a sample of cards across countries and confirm the deadline label (open / closing soon / days remaining) and funding label correctly reflect each record's data.

**Acceptance Scenarios**:

1. **Given** an opportunity that is still open, **When** its card renders, **Then** the deadline indicator reflects its remaining time or open status with appropriate urgency styling.
2. **Given** an opportunity with a known funding type, **When** its card renders, **Then** the correct funding label (Fully funded / Partial / Varies) is shown.
3. **Given** the catalogue is sorted by "Closing soonest", **When** the list renders, **Then** opportunities closing sooner appear before those closing later or always-open ones.

---

### Edge Cases

- **Missing data source**: If the data files cannot be loaded (e.g., opened directly from the file system with browser restrictions, or a file is missing), the site shows a clear message or gracefully falls back rather than rendering a blank page.
- **Duplicate opportunities across files**: The same scholarship may appear in more than one country file; duplicates should not appear twice in the catalogue.
- **Records with missing fields**: A record missing an optional field (e.g., no image, no day count, "varies" level) still renders without breaking the card layout.
- **Closed or expired opportunities**: Opportunities whose deadline has passed are excluded from the catalogue entirely, so students are never shown or able to apply to a dead opportunity.
- **Large catalogue performance**: All matching opportunities are rendered at once (no pagination or load-more); with hundreds of opportunities aggregated across all countries, the page must remain responsive when scrolling, filtering, and searching.
- **Empty filter combination**: A filter combination yielding no matches shows the friendly empty state, not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The website MUST source its scholarship catalogue from the `*.clean.json` files in the `ScholarShips_Data` folder, and MUST NOT use any other data files in that folder as a source.
- **FR-002**: The website MUST aggregate opportunities from all available country `*.clean.json` files into a single browsable catalogue.
- **FR-003**: The website MUST replace the previous hardcoded sample list so that the displayed catalogue reflects the aggregated country data.
- **FR-004**: Each opportunity card MUST display the thumbnail image, title, sponsoring organization, country with its flag, study level(s), funding type, field, and a deadline indicator. When a record has no image, a visual placeholder MUST be shown instead.
- **FR-005**: Each opportunity card MUST provide an "Apply" action that opens the opportunity's source URL in a new browser tab.
- **FR-006**: The country filter dropdown MUST be populated with every distinct country present in the loaded data.
- **FR-007**: The study-level, funding, country, search, and sort controls MUST operate correctly against the full aggregated catalogue.
- **FR-008**: The homepage statistics (live opportunities count and number of countries) MUST reflect the actual loaded data.
- **FR-009**: The result counter MUST reflect the number of opportunities matching the currently active filters and search.
- **FR-010**: The system MUST remove duplicate opportunities so that the same scholarship is not listed more than once.
- **FR-011**: The deadline indicator MUST convey each opportunity's urgency/status (e.g., open, closing soon, days remaining) based on the record's deadline data.
- **FR-012**: The funding label MUST display the correct funding category (fully funded, partial, varies) for each opportunity.
- **FR-013**: The system MUST render each opportunity without visual breakage even when optional fields are absent from a record.
- **FR-014**: The system MUST handle a failure to load the data source gracefully, showing an understandable state rather than a blank or broken page.
- **FR-015**: The "Reset filters" action MUST restore all controls to their defaults and re-display the full catalogue.
- **FR-016**: The system MUST exclude opportunities whose application deadline has already passed, so that only open or upcoming opportunities appear in the catalogue, statistics, and result counts.
- **FR-017**: The system MUST render all opportunities matching the current filters at once, without pagination or a load-more control, while keeping scrolling, filtering, and searching responsive.

### Key Entities *(include if feature involves data)*

- **Scholarship Opportunity**: A single funded opportunity a student can apply to. Key attributes: title, sponsoring organization, country, country flag, study level(s), funding type (full/partial/varies), field of study, deadline status and remaining time, source application URL, and an optional thumbnail image. Uniquely identifiable so duplicates can be detected.
- **Country**: A grouping of opportunities by the country in which the scholarship is offered. Used to populate the country filter and the "number of countries" statistic.
- **Catalogue**: The aggregated, de-duplicated collection of all Scholarship Opportunities loaded from the country data files; the source for browsing, filtering, searching, and sorting.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The catalogue displays opportunities from every country data file available, covering all 20+ countries in the collection rather than the previous single-digit country count.
- **SC-002**: 100% of displayed cards show complete, correct information (title, organization, country, level, funding, deadline) and a working "Apply" link for a sampled set across countries.
- **SC-003**: Selecting any country in the filter shows only that country's opportunities, and the dropdown offers every country present in the data.
- **SC-004**: Applying any single filter, search term, or sort updates the visible results and the result count correctly in under 1 second on a typical laptop.
- **SC-005**: The homepage "live opportunities" and "countries" statistics match the actual loaded, de-duplicated data.
- **SC-006**: No opportunity appears more than once in the catalogue.
- **SC-007**: The page loads and becomes interactive within 3 seconds on a typical broadband connection with the full catalogue.

## Assumptions

- Only the `*.clean.json` files are an authoritative source; the larger raw per-country JSON files (e.g., `Canada.json`) and the extractor script are ignored for display purposes, per the user's instruction.
- The `*.clean.json` record shape observed (fields: `id`, `title`, `org`, `country`, `flag`, `levels`, `fund`, `field`, `deadline_status`, `days`, `dtext`, `url`, `image`) is representative of all country files.
- The existing Beacon visual design, layout, filter controls, and interaction patterns are retained; this feature changes the data source feeding them, not the overall look and feel.
- "Add to my website" means surfacing the data in the existing single-page Beacon site, not building a separate page or backend service.
- Opportunities are read-only listings; there is no user account, saving-to-server, or application submission within the site (the existing in-page "shortlist/heart" behavior, if retained, is session-only).
- The site remains a static front-end with no server-side database; data is loaded from the JSON files at page load.
- Where a record's `id` is present it is used to detect duplicates; otherwise the source URL identifies a unique opportunity.
