# Scholarships.com — UI/UX Specification
> Extracted from [https://www.scholarships.com](https://www.scholarships.com)  
> Purpose: Complete reference for rebuilding this website from scratch

---

## 1. Site Overview

| Property | Value |
|---|---|
| **Site Name** | Scholarships.com |
| **Tagline** | "Find Scholarships for College" |
| **Value Props** | Free • Vetted • Personalized matches • 26M+ students helped |
| **Target Users** | Students, Parents, Educators, Scholarship Providers |
| **Core Action** | Sign up → Get matched → Apply → Win |
| **Trust Indicators** | 26M+ users, $19B in scholarships, 25+ years in business, BBB accredited |

---

## 2. Global Navigation (Header)

### Desktop Nav
```
[Logo]   [Students ▼]  [Parents ▼]  [Educators ▼]  [Scholarship Providers ▼]   [Log In]  [Sign Up →]
```

### Mega Dropdown — Students
```
SEARCH & FIND                      COLLEGE TOOLS
+ Scholarship Search               + College Search
  College scholarships you           Find the college that's right
  qualify for.                       for you.
+ Scholarship Directory            + College Matches
  Find scholarships by category.    Personalized list of colleges.
+ Student Resources                + Calculators
  Top resources for your journey.   Calculate your cost to attend.
+ Student Loans
  Explore loan options.
```

### Mega Dropdown — Parents
_Identical structure to Students with copy adjusted (e.g., "your child qualifies for")_

### Mega Dropdown — Educators
```
+ Educators Home        + Educator Log In       + Educator Resources
  Learn how we help.     Log in to account.      Free resources.
```

### Mega Dropdown — Scholarship Providers
```
+ Submit a Scholarship       + Provider Log In       + Guidelines
  Share with eligible          Log in to account.     Submission rules.
  students.
```

### Auth Buttons
- **Log In** — text button (opens modal)
- **Sign Up** — filled/accent button → links to `app.scholarships.com`

### Mobile Nav
- Hamburger icon (3 lines SVG) top-right
- Collapsible accordion-style menu
- Same items as desktop, stacked vertically

---

## 3. Login Modal

```
┌─────────────────────────────────────┐
│  [Google Sign In Button]            │
│  ────────── or ──────────           │
│  [✉ Email input field]              │
│  [🔒 Password field  👁 show/hide]  │
│  [Forgot your password?]            │
│  ─────────────────────────          │
│  New to Scholarships.com?           │
│  [Start Your Free Scholarship Search]│
└─────────────────────────────────────┘
```
- OAuth: Google
- Email + password form
- Forgot password link → `/support/password-request`
- Sign-up prompt for new users

---

## 4. Hero Section

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Find Scholarships for College          [Student Photo] │
│                                                          │
│   ✓ Scholarships for every type of student  [Quote]     │
│   ✓ 100% free                               [Name]      │
│   ✓ Vetted scholarship opportunities        [Award]     │
│                                                          │
│          [ Find Scholarships Now → ]                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Heading:** `Find Scholarships for College` (H1)  
**Bullet list** (3 items, each with a **bolded** key phrase):
- Scholarships for **every type** of student
- **100%** free
- **Vetted** scholarship opportunities

**Primary CTA:** `Find Scholarships Now` → `app.scholarships.com`

**Inline Testimonial** (right side or below):
- Short quote from a winner
- Circular student photo
- Winner's name (linked to full story)
- Scholarship won + dollar amount

---

## 5. Winner Testimonials Carousel

### Section Header
```
Real Scholarship Winners
Scholarships.com has helped over 26 million students and families find college
scholarships. Will you be our next winner?

[See More Winners]    [Winner Interviews]
```

### Testimonial Card Component
```
┌──────────────────────────────────┐
│  ⭐⭐⭐⭐⭐                         │
│                                  │
│  "Quote from winner..."          │
│                                  │
│  [Circular photo]                │
│  Name Lastname                   │
│  Scholarship Name - $XX,XXX      │
└──────────────────────────────────┘
```

**Fields per card:**
- 5-star rating image
- Quote (1–3 sentences)
- Student circular photo (`.webp`)
- Student name (linked to success story page)
- Scholarship won + dollar amount (linked)

**Carousel Behavior:**
- Auto-scrolls horizontally
- Multiple cards visible at once
- Winner cards featured: Nour S., Leslie N., Micah W., Daisha J., Dakota P., Nate Z., Elaine T., Veda K., Cameron P., Gella H., Nour I., Abigail M., Matteo P., Ayira A., Andrew N., Agneya T., Imanga L.

---

## 6. Featured Scholarships Section

### Section Header
```
Featured Scholarships
Here are some of the best college scholarships with approaching deadlines.

                                           [See All Scholarships →]
```

### Scholarship Card Component
```
┌─────────────────────────────────────────────────────┐
│  [Scholarship Title]                                │
│                                                     │
│  💰 Amount:   $XX,XXX                               │
│  📅 Deadline: Month DD, YYYY                        │
│                                                     │
│  [Short description paragraph]                      │
│                                                     │
│  Scholarship Details                                │
│  • Bullet 1                                         │
│  • Bullet 2                                         │
│                                                     │
│  Eligibility Criteria                               │
│  • Bullet 1                                         │
│  • Bullet 2                                         │
│                                                     │
│  Application Process                                │
│  • Step 1                                           │
│  • Step 2                                           │
│                                                     │
│  [Tag: Selected Major]   [Tag: Year in School]      │
│                                                     │
│                               [♥ Save]  [✓ Won]    │
└─────────────────────────────────────────────────────┘
```

**Card Data Fields:**
- Title
- Amount (dollar value)
- Deadline (date)
- Description (1 paragraph)
- Scholarship Details (bulleted list)
- Eligibility Criteria (bulleted list)
- Application Process (bulleted list)
- Tags (eligibility attributes): Major, Year in School, GPA, Gender, Race, Personal Interest
- Action icons: Favorite (heart) + Mark as Won (checkmark)

**Sample Scholarships Listed:**
| Title | Amount | Deadline |
|---|---|---|
| Children's Heart Foundation Scholarship | $10,000 | June 8, 2026 |
| Potato LEAF Scholarship | $10,000 | June 12, 2026 |
| Good Work College & Vocational Scholarships | $2,000 | June 12, 2026 |
| Whitaker Foundation Scholarships | $2,000 | June 15, 2026 |
| FITBODY Pink Breast Cancer Family Scholarship | $1,000 | June 15, 2026 |
| Women in Aerospace Foundation Scholarship | $5,000 | June 16, 2026 |
| Navigate Your Future Scholarship | $2,500 | June 26, 2026 |

---

## 7. Browse Scholarships By (Directory Grid)

### Section Header
```
Browse Scholarships By
```

### Category Tags (grid/flex layout, 24 items)
```
Academic Major       ACT Score           Age
Artistic Ability     Athletic Ability    Deadline
Employer             Ethnicity           Financial Need
Gender               Grade Point Average Honors Organization
Military Affiliation # of Scholarships  Physical Disabilities
Race                 Religion            Residence State
SAT Score            Scholarship Amount  School Attendance State
School Year          Special Attributes  Student Organization
```
Each tag links to a `/financial-aid/college-scholarships/scholarship-directory/[category]` URL.

---

## 8. How It Works (3-Step Process)

### Section Header
```
How Scholarships.com Works
Scholarships.com is a free college scholarship search platform that matches
you to college scholarships you qualify for.

[Find Scholarships Now →]
```

### Step Cards (numbered, horizontal row)

**Step 1: Find College Scholarships**
> Get matched to college scholarships tailored to you! Complete your profile, and we will instantly search millions of scholarships to match you with the best opportunities, saving you time and maximizing your chances of success.

**Step 2: Organize Your Matches**
> Filter your scholarship matches by due date or award amount. Keep track of your favorite scholarships, those you've applied to, and those you've won. With Scholarships.com, you'll never miss an opportunity or scholarship deadline!

**Step 3: Apply and Win**
> We've created a personalized list of college scholarships just for you! Now's the time to apply for the scholarships you've been matched with. Start your applications today and make college more affordable!

---

## 9. How To Win Scholarships (Article Grid)

### Section Header
```
How To Win Scholarships
We provide expert scholarship advice to help you pay for college.

[Get Started Now →]
```

### Article Card Component
```
┌──────────────────────────┐
│  [Full-width image]      │
│                          │
│  ### Article Title       │
│                          │
│  Short description       │
│  paragraph               │
│                          │
│  [Browse Scholarships →] │
└──────────────────────────┘
```

**Articles / Categories (carousel, repeating):**
| Title | Description Snippet | URL Path |
|---|---|---|
| Scholarships for High School Seniors | Start early in your senior year | `/scholarships-by-grade-level/high-school-seniors` |
| Scholarships for High School Juniors | Don't wait until senior year | `/scholarships-by-grade-level/high-school-juniors` |
| Scholarships for Women | Women have surpassed men in degrees... | `/scholarships-by-type/scholarships-for-women` |
| Texas Scholarships | Enormous financial aid for TX students | `/scholarships-by-state/texas-scholarships` |
| California Scholarships | Multitude of opportunities for CA students | `/scholarships-by-state/california-scholarships` |
| Florida Scholarships | Third largest state... | `/scholarships-by-state/florida-scholarships` |
| Merit Scholarships | Based on grades, extracurriculars, skills | `/scholarships-by-type/merit-scholarships` |
| Scholarships for Black Students | Overcome financial barriers | `/scholarships-by-type/african-american-scholarships` |
| Hispanic Scholarships | Support & empower Hispanics | `/scholarships-by-type/hispanic-scholarships` |

---

## 10. Press / Media Logos Bar

**"As Seen In" scrolling carousel (auto-scroll, no pause):**
- USA Today
- MSN
- NBC
- ABC
- The New York Times
- Chicago Tribune
- Washington Post
- Money Magazine
- Yahoo! Finance
- Wall Street Journal

Rendered as grayscale logos in a horizontal scrolling ticker (duplicated for infinite loop effect).

---

## 11. FAQ Section (Accordion)

```
▼ What is Scholarships.com?
▼ How does Scholarships.com stand out from other scholarship platforms?
▼ Do I need to create an account to view scholarships?
▼ Is Scholarships.com completely free?
▼ Are the scholarships on Scholarships.com legitimate?
▼ How can I get help with a scholarship question?
```

**Interaction:** Click chevron/arrow to expand/collapse each answer.

**Key FAQ answers (summarized):**
- Free scholarship search platform, helped 26M+ students
- 3.7M scholarships totaling ~$19B; new added daily; 50% location-based
- Can browse directory without account; account needed for personalized matches
- 100% free, no fees ever
- All listings vetted, updated daily, 25+ year trusted resource
- Check listing first; contact provider; reach out via contact form

---

## 12. Footer

### Logo
White version of Scholarships.com logo (left aligned)

### Column 1 — Explore
```
Home | Scholarship Search | Scholarship Directory | Scholarship Winners
College Search | Financial Aid | FAFSA | Student Loans
Calculators | Student Resources | Educators | Scholarship Providers | Press
```

### Column 2 — Scholarships (by type/category)
```
High School Seniors | High School Juniors | High School Sophomores
Graduate School | Adult Students | California | Texas | Florida | Illinois | New York
Minority Scholarships | Hispanic Scholarships | Scholarships for Women
Scholarships for Moms | Single Moms | First Generation | Merit Scholarships
Full Ride | Essay | No Essay | Unusual | Summer | Art | Engineering | Aviation
```

### Column 3 — Scholarship Directory
```
HS Senior | HS Junior | HS Sophomore | HS Freshman | Texas | California | Florida
New York | Illinois | Georgia | Pennsylvania | Ohio | Minnesota
By Deadline | By Academic Major | By Religion | Small Scholarships
Child of Single Parent
```

### Column 4 — Company
```
About Us | FAQ | Contact Us | Partnerships | Career Opportunities
Linking | Site Map | Privacy Policy | Terms of Use
```

### App Badges
- Apple App Store badge → `apps.apple.com`
- Google Play badge → `play.google.com`

### Social Media Icons
| Platform | Handle |
|---|---|
| TikTok | @scholarshipscom |
| Instagram | @scholarshipscom |
| YouTube | @scholarshipscom |
| Facebook | scholarships.com.info |
| Twitter/X | @Scholarshipscom |
| LinkedIn | company/scholarships-com |

### Trust Badges
- BBB (Better Business Bureau) accredited badge

### Copyright
```
Copyright © 1998–2026 Scholarships.com, LLC. All rights reserved.
[Do Not Sell or Share My Personal Information]
```

---

## 13. Page-Level SEO Metadata

```html
<title>Find Scholarships for College</title>
<meta name="description" content="Scholarships.com is a free college scholarship search platform that matches you to college scholarships you qualify for." />
<meta name="robots" content="all, index, follow" />
<meta name="author" content="Scholarships.com" />
<meta property="og:title" content="Scholarships.com" />
<meta property="og:description" content="Find Scholarships for College" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://www.scholarships.com" />
<link rel="canonical" href="https://www.scholarships.com" />
```

---

## 14. URL Structure / Site Map

```
/                                          → Homepage
/financial-aid/college-scholarships/
  scholarship-directory/                   → Browse all categories
  scholarship-directory/[category]/        → By category (major, race, etc.)
  scholarships-by-grade-level/
    high-school-scholarships/
      scholarships-for-high-school-seniors/
      scholarships-for-high-school-juniors/
  scholarships-by-type/
    scholarships-for-women/
    minority-scholarships/
    merit-scholarships/
    full-tuition-scholarships/
    essay-scholarships/
    no-essay-scholarships/
    unusual-scholarships/
    scholarships-for-summer/
    aviation-scholarships/
    scholarships-for-moms/
    scholarships-for-adult-students/
    first-in-family-scholarships/
  scholarships-by-state/
    california-scholarships/
    texas-scholarships/
    florida-scholarships/
    new-york-scholarships/
    illinois-scholarships/
  success-stories/                         → Winner stories
/scholarship-winners/                      → Winner interviews
/college-search/                           → College finder
/financial-aid/
  student-loans/
  calculators/
/fafsa/
/student-resources/
/educators/
  login/
  guidance-resources/
/scholarship-providers-resources/
  list-your-scholarship/
    login/
  scholarship-provider-guidelines/
/about-us/
  contact-us/
  in-the-news/
  career-opportunities/
  linking/
  privacy-policy/
  terms-of-use/
  scholarships-com-marketing-partnerships/
/support/
  frequently-asked-questions/
  password-request/
/scholarships/[scholarship-slug]/          → Individual scholarship pages
/Site-Map/
/do-not-sell-my-personal-information/
app.scholarships.com                       → Authenticated scholarship search app
```

---

## 15. Component Library Summary

| Component | Description |
|---|---|
| **MegaNav** | Desktop dropdown with grouped links + icons |
| **HamburgerMenu** | Mobile accordion navigation |
| **LoginModal** | OAuth + email/password overlay |
| **HeroSection** | H1 + bullets + CTA + inline testimonial |
| **TestimonialCard** | Star rating + quote + photo + name + award |
| **TestimonialCarousel** | Horizontal auto-scrolling cards |
| **ScholarshipCard** | Title + amount + deadline + details + tags + actions |
| **ScholarshipGrid** | Grid/list layout of scholarship cards |
| **CategoryTagGrid** | Flex grid of linked category tags |
| **StepCard** | Numbered step with title + description |
| **ArticleCard** | Image + title + description + CTA link |
| **ArticleCarousel** | Scrolling grid of article cards |
| **MediaLogoBar** | Infinite-scroll press logo ticker |
| **AccordionFAQ** | Expandable Q&A accordion |
| **Footer** | Multi-column links + socials + legal |
| **AppStoreBadges** | Apple + Google Play download buttons |
| **SocialIconRow** | Row of platform icon links |

---

## 16. Interaction & UX Patterns

- **Personalization First:** Primary CTA everywhere is "Find Scholarships Now" → leads to profile-building signup
- **Social Proof:** Testimonials with real names, photos, and dollar amounts throughout
- **Urgency Cues:** Scholarship cards show deadlines prominently
- **Trust Signals:** BBB badge, media logos, "26M+ students", "25 years", "100% free"
- **Progressive Disclosure:** Scholarship cards show summary first; details expand below
- **Persistent Navigation:** Sticky header across all pages
- **Accessibility:** Semantic headings (H1 → H4), alt text on all images
- **Mobile Responsive:** Hamburger nav, stacked cards, full-width CTAs on mobile
- **Infinite Carousels:** Both testimonials and articles loop/scroll
- **Bookmark/Save State:** Heart icon on scholarship cards for logged-in users
- **Won Tracking:** Checkmark/trophy icon to mark scholarships as won

---

## 17. Content Tone & Voice

- **Encouraging & Approachable** — "Will you be our next winner?"
- **Empowering** — Positions student as the hero
- **Clear & Direct** — Action-oriented CTAs ("Find Scholarships Now", "Apply and Win")
- **Credibility-Driven** — Specific numbers everywhere ($19B, 26M, 3.7M, 25 years)
- **Inclusive** — Addresses all student types: by grade, gender, ethnicity, state, major

---

## 18. Key Statistics to Display

| Stat | Value |
|---|---|
| Students & Families Helped | 26 million+ |
| Total Scholarship Listings | 3.7 million+ |
| Total Financial Aid Available | ~$19 billion |
| Years in Operation | 25+ (since 1998) |
| Location-Based Scholarships | 50% of database |

---

*End of UI/UX Specification — Scholarships.com*