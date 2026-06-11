# Feature Specification: User Accounts with Social Sign-In & Scholarship-Matching Profiles

**Feature Branch**: `003-user-auth-profiles`
**Created**: 2026-06-11
**Status**: Draft
**Input**: User description: "add sign in sign up feature and linked with ( google , facebook , linkedin , X ) that will helps users unlock the website features like save list history search; add information of user's account that will match there scholarships that they looking for like ( name , adress , city , country , Nationality , email , phone , degree , certificates upload , photo upload , Language level with any certificates of learning this Languages )"

## Clarifications

### Session 2026-06-11

- Q: Should email/password sign-ups require email verification? → A: Soft verification — immediate site use, verification email sent; unverified accounts are not auto-linked with social logins and see a reminder banner.
- Q: Where should scholarship matching appear? → A: Both a dedicated "Recommended for you" section and match indicators (badges + match-aware sorting) on regular listing/detail pages.
- Q: Which language proficiency scale? → A: CEFR (A1–C2, plus Native) stored canonically, displayed with friendly labels (e.g., "B2 – Upper Intermediate").
- Q: Can users manage linked sign-in methods? → A: View linked methods and connect additional providers in account settings; disconnecting providers is out of scope for v1.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign Up & Sign In (Priority: P1)

A visitor to the scholarship website creates an account — either with their email and a password, or with one click using their existing Google, Facebook, LinkedIn, or X account — and can sign back in later from any device. Once signed in, their identity persists across pages until they sign out.

**Why this priority**: Authentication is the foundation every other capability in this feature depends on. Without an account, there is nothing to attach saved lists, history, or profile data to.

**Independent Test**: Can be fully tested by creating an account through each method (email/password and each of the four social providers), signing out, and signing back in. Delivers value on its own as a recognized, returning-user experience.

**Acceptance Scenarios**:

1. **Given** a visitor with no account, **When** they choose "Sign up" and complete registration with email and password, **Then** an account is created and they are signed in immediately.
2. **Given** a visitor with no account, **When** they choose to continue with Google, Facebook, LinkedIn, or X and approve the provider's consent screen, **Then** an account is created using the identity (name, email) returned by the provider and they are signed in.
3. **Given** an existing user who registered with a social provider, **When** they return and sign in with that same provider, **Then** they are signed in to their existing account (no duplicate account is created).
4. **Given** a signed-in user, **When** they navigate between pages of the site or close and reopen the browser within the session lifetime, **Then** they remain signed in.
5. **Given** a signed-in user, **When** they choose "Sign out", **Then** their session ends and account-only features become locked again.
6. **Given** a user entering a wrong password or an unregistered email, **When** they attempt to sign in, **Then** they see a clear, friendly error message without revealing which part was wrong.

---

### User Story 2 - Unlock Account Features: Saved List, History & Search (Priority: P2)

A signed-in user can save scholarships to a personal list, see a history of scholarships they have viewed, and have their searches remembered — features that are visible but locked for anonymous visitors, with a prompt to sign in.

**Why this priority**: This is the user-facing payoff of having an account and the stated motivation for the feature. It depends on User Story 1 but delivers the core engagement value.

**Independent Test**: Can be tested by signing in, saving several scholarships, viewing a few detail pages, running searches, then signing out and back in to confirm the saved list, viewing history, and search history persisted.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing any scholarship, **When** they tap "Save", **Then** the scholarship is added to their saved list and shows as saved everywhere it appears.
2. **Given** a signed-in user with saved scholarships, **When** they open their saved list, **Then** they see all saved scholarships and can remove any of them.
3. **Given** a signed-in user, **When** they open a scholarship detail page, **Then** that scholarship is recorded in their viewing history with the date viewed.
4. **Given** a signed-in user, **When** they run a search, **Then** the search is recorded and recent searches are offered to them next time they search.
5. **Given** an anonymous visitor, **When** they try to save a scholarship or open the saved-list / history pages, **Then** they are invited to sign in or create an account, and after signing in the action they attempted completes.
6. **Given** an anonymous visitor, **When** they browse or search scholarships, **Then** browsing and searching still work without an account (only persistence features are locked).

---

### User Story 3 - Complete Account Profile (Priority: P2)

A signed-in user fills out their profile with personal and academic information — full name, address, city, country, nationality, email, phone, highest degree, uploaded certificates, a profile photo, and language proficiencies each optionally backed by an uploaded language certificate — so the site knows who they are and what they qualify for.

**Why this priority**: The profile is the data source for scholarship matching (User Story 4) and represents the second half of the user's request. It is independently valuable as a stored applicant profile even before matching exists.

**Independent Test**: Can be tested by signing in, filling every profile field, uploading a photo, a degree certificate, and a language certificate, saving, then reloading the page to confirm everything persisted and displays correctly.

**Acceptance Scenarios**:

1. **Given** a newly registered user, **When** they open their account page, **Then** they see a profile form pre-filled with whatever the sign-up method already provided (e.g., name and email from a social provider) and empty fields for the rest.
2. **Given** a signed-in user on their profile page, **When** they enter name, address, city, country, nationality, phone, and highest degree and save, **Then** the data is stored and shown on their next visit.
3. **Given** a signed-in user, **When** they upload a profile photo in a supported image format within the size limit, **Then** the photo is stored and displayed on their account.
4. **Given** a signed-in user, **When** they upload one or more degree/qualification certificates, **Then** each upload is listed on their profile and can be viewed or removed.
5. **Given** a signed-in user, **When** they add a language with a proficiency level and optionally attach a certificate for that language, **Then** the language entry appears on their profile; they can add multiple languages.
6. **Given** a user uploading an unsupported file type or an oversized file, **When** the upload is attempted, **Then** it is rejected with a clear message stating the allowed types and size limit.
7. **Given** a user who leaves optional fields empty, **When** they save, **Then** the profile saves successfully — only fields essential to the account (name, email) are required.

---

### User Story 4 - Profile-Based Scholarship Matching (Priority: P3)

A user with a completed profile sees scholarships that match their situation — degree level, nationality/country, and languages — in two places: a dedicated "Recommended for you" section, and match indicators (badges plus match-aware sorting) on the regular listing and detail pages, so they spend less time filtering manually.

**Why this priority**: This is the stated purpose of collecting profile data, but it requires Stories 1 and 3 to exist first and the site remains useful without it.

**Independent Test**: Can be tested by creating two accounts with different profiles (e.g., different degree levels and nationalities) and confirming each sees recommendations consistent with their own profile.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose profile includes a degree level, **When** they open the "Recommended for you" section, **Then** scholarships targeting that degree level are prioritized.
2. **Given** a signed-in user whose profile includes nationality and languages, **When** they browse regular listing or detail pages, **Then** scholarships show a match badge (e.g., "Matches your profile" / "Not eligible") and listings can be sorted by match, with scholarships restricted to other nationalities or requiring unlisted languages ranked lower or flagged.
3. **Given** a user with an empty or minimal profile, **When** they view recommendations, **Then** they see a prompt explaining that completing their profile improves matches.
4. **Given** a user who updates their profile (e.g., changes degree level), **When** they next view recommendations, **Then** the recommendations reflect the updated profile.

---

### Edge Cases

- A user signs up with email/password and later uses a social provider with the same email address — the system links to the existing account rather than creating a duplicate, after confirming ownership.
- A social provider does not return an email address (possible with X) — the user is prompted to add and confirm an email address; the account remains usable meanwhile, but features that depend on a verified email (such as account linking) wait until it is confirmed.
- A social provider's consent screen is cancelled or fails mid-flow — the user is returned to the site with a non-technical message and can retry.
- A user forgets their password — they can request a password reset via email.
- A signed-in session expires while the user is filling the profile form — their input is not silently lost; they are prompted to sign in again and their entered data is preserved or recoverable.
- A user uploads a certificate, then deletes it — the file is no longer accessible to anyone.
- Two browser tabs are signed in and the user signs out in one — the other tab stops allowing account actions.
- A user asks to delete their account — the account, profile data, and uploaded files are removed.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication**

- **FR-001**: System MUST allow visitors to create an account with an email address and password.
- **FR-002**: System MUST allow visitors to sign up and sign in using Google, Facebook, LinkedIn, and X accounts.
- **FR-003**: System MUST treat a returning social sign-in as the same account (one account per person per verified email), and MUST NOT create duplicate accounts when the same verified email is used across methods. Accounts with an unverified email MUST NOT be auto-linked with social sign-ins until the email is verified.
- **FR-003a**: Signed-in users MUST be able to view their linked sign-in methods in account settings and connect additional providers (Google, Facebook, LinkedIn, X) to their account. Disconnecting a provider is out of scope for v1.
- **FR-004**: System MUST keep users signed in across pages and visits until they sign out or the session expires.
- **FR-005**: Users MUST be able to sign out from any page.
- **FR-006**: System MUST provide a password-reset flow via email for email/password accounts.
- **FR-007**: System MUST show clear, non-technical error messages for failed sign-in, cancelled social flows, and provider errors, without disclosing whether an email is registered.
- **FR-007a**: Email/password sign-ups MUST use soft email verification: the user can use the site immediately, a verification email is sent at sign-up, and unverified accounts see a non-blocking reminder banner until verified. Social sign-ins count as verified by the provider.

**Account-Gated Features**

- **FR-008**: Signed-in users MUST be able to save and unsave scholarships to a personal saved list, persisted across sessions and devices.
- **FR-009**: System MUST record a signed-in user's scholarship viewing history (scholarship and date viewed) and let the user view and clear it.
- **FR-010**: System MUST record a signed-in user's searches and offer recent searches on return; users MUST be able to clear search history.
- **FR-011**: Anonymous visitors MUST still be able to browse and search scholarships; when they attempt an account-only action, the system MUST prompt them to sign in and complete the attempted action after sign-in.

**Profile**

- **FR-012**: Signed-in users MUST be able to view and edit a profile containing: full name, address, city, country, nationality, email, phone number, and highest degree.
- **FR-013**: System MUST pre-fill profile fields from data the sign-up method provided (e.g., name, email, photo from a social provider).
- **FR-014**: Users MUST be able to upload, view, and remove a profile photo (common image formats, with a stated size limit).
- **FR-015**: Users MUST be able to upload, view, and remove one or more degree/qualification certificate files (common document/image formats, with a stated size limit).
- **FR-016**: Users MUST be able to add multiple language entries, each with a proficiency level on the CEFR scale (A1, A2, B1, B2, C1, C2, plus Native) displayed with friendly labels (e.g., "B2 – Upper Intermediate"), and optionally attach a certificate file per language.
- **FR-017**: System MUST validate uploads by type and size and reject invalid files with a message stating the allowed types and limits.
- **FR-018**: Only name and email MUST be required; all other profile fields MUST be optional and savable incrementally.

**Matching**

- **FR-019**: System MUST use profile data (at minimum degree level, nationality/country, and languages) to rank and flag scholarships as matching the user, surfaced in both: (a) a dedicated "Recommended for you" section for signed-in users, and (b) match indicators (badge and match-aware sorting) on regular listing and detail pages.
- **FR-020**: System MUST prompt users with incomplete profiles that completing the profile improves their matches.
- **FR-021**: Recommendations MUST update when the profile changes.

**Privacy & Account Control**

- **FR-022**: Uploaded files and profile data MUST be accessible only to the account owner (and not to other users or anonymous visitors).
- **FR-023**: Users MUST be able to delete their account, which removes their profile data, saved list, history, and uploaded files.

### Key Entities

- **User Account**: A person's identity on the site — email, display name, sign-in methods linked (email/password and/or Google, Facebook, LinkedIn, X), creation date, session state.
- **User Profile**: Extended information attached to one account — full name, address, city, country, nationality, phone, highest degree, profile photo, list of certificate uploads, list of language entries.
- **Language Entry**: A language the user speaks — language name, CEFR proficiency level (A1–C2 or Native), optional attached certificate file.
- **Certificate Upload**: A file the user uploaded — file, type (degree certificate / language certificate), upload date, the profile or language entry it belongs to.
- **Saved Scholarship**: Link between an account and a scholarship the user saved, with the date saved.
- **View History Entry**: Link between an account and a scholarship the user viewed, with the date viewed.
- **Search History Entry**: A search a signed-in user performed — query/filters used and date.
- **Scholarship Match**: The relationship between a user's profile attributes and a scholarship's eligibility attributes (degree level, eligible nationalities, required languages) used for ranking/flagging.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new visitor can complete sign-up (any method) and reach a signed-in state in under 2 minutes; social sign-up in under 30 seconds.
- **SC-002**: 100% of the four named social providers (Google, Facebook, LinkedIn, X) work for both first sign-up and returning sign-in.
- **SC-003**: A returning signed-in user finds their saved list, viewing history, and recent searches intact across sessions and devices in 100% of cases.
- **SC-004**: A user can complete the full profile — all fields plus photo, one degree certificate, and one language certificate — in under 10 minutes in a single sitting.
- **SC-005**: 95% of file uploads within the stated type/size limits succeed on first attempt, and 100% of invalid uploads receive an explanatory message.
- **SC-006**: Users with a completed profile see recommendations consistent with their degree level, nationality, and languages in 100% of tested profile combinations.
- **SC-007**: No user can access another user's profile data, uploads, saved list, or history (0 cross-account data exposures).
- **SC-008**: At least 90% of users who start sign-up complete it without abandoning due to errors.

## Assumptions

- Email/password registration is included alongside the four social providers, as the standard baseline sign-up method.
- Browsing and searching scholarships remain free for anonymous visitors; an account only gates persistence features (saved list, history, remembered searches) and profile/matching.
- "Search" in the user's request ("save list history search") is interpreted as remembered/saved search history for signed-in users, not a new search engine — search itself already exists on the site.
- Scholarship matching is rule-based on profile attributes the site already stores per scholarship (degree level, eligible countries/nationalities, languages); no machine-learning recommendation system is implied.
- Accounts are deduplicated by verified email address across sign-in methods.
- Standard file limits apply: images (JPG/PNG/WebP) up to ~5 MB for photos; documents (PDF/JPG/PNG) up to ~10 MB for certificates. Exact limits to be finalized in planning.
- Language proficiency uses the CEFR scale (A1–C2, plus Native), stored canonically and displayed with friendly labels.
- Data retention follows standard practice: data is kept while the account exists and removed upon account deletion.
- One user profile per account; profiles are private to their owner (no public profile pages in this feature).
- Out of scope for v1: disconnecting/unlinking a sign-in provider from an account, public profiles, and machine-learning-based recommendations.
