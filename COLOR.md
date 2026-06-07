# Scholarships Platform Website PRD + Design System

Version: 1.0

---

# Project Overview

Build a modern scholarship discovery platform that helps students:

- Search scholarships
- Match with opportunities
- Track applications
- Save favorites
- Receive recommendations
- Learn about financial aid

The experience should feel:

- Trustworthy
- Modern
- Friendly
- Academic
- Professional
- Mobile-first

---

# Brand Identity

## Personality

- Helpful
- Optimistic
- Educational
- Reliable
- Accessible

## Visual Style

- Clean layouts
- Large whitespace
- Rounded corners
- Soft shadows
- Strong CTAs
- Minimal clutter

---

# Color System

## Primary

```css
#30cebb
```

Purpose:

- Primary buttons
- Links
- Active states
- Icons
- Highlights

---

## Secondary

```css
#ef622f
```

Purpose:

- Secondary CTAs
- Promotional content
- Featured scholarships

---

## Accent

```css
#0f7771
```

Purpose:

- Headers
- Navigation
- Hover states
- Footer

---

## Support Colors

```css
#e95924
#e85621
```

Purpose:

- Hover effects
- Urgent notifications
- Emphasis blocks

---

# CSS Variables

```css
:root {
  --primary: #30cebb;
  --secondary: #ef622f;
  --accent: #0f7771;

  --orange-1: #e95924;
  --orange-2: #e85621;

  --text-primary: #1f2937;
  --text-secondary: #6b7280;
  --text-muted: #9ca3af;

  --bg-primary: #ffffff;
  --bg-secondary: #f7fafb;
  --bg-tertiary: #eef4f5;

  --border: #e5e7eb;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-xl: 24px;

  --shadow-sm: 0 2px 8px rgba(0,0,0,0.05);
  --shadow-md: 0 6px 18px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 30px rgba(0,0,0,0.12);
}
```

---

# Typography

## Font Family

Preferred:

```text
Inter
```

Fallback:

```css
font-family:
Inter,
system-ui,
sans-serif;
```

---

## Headings

### H1

```css
48px
700
#0f7771
```

### H2

```css
36px
700
#0f7771
```

### H3

```css
28px
600
#1f2937
```

### H4

```css
22px
600
#1f2937
```

---

## Body

```css
16px
line-height: 1.7
```

---

# Layout

## Container

Desktop:

```css
max-width: 1280px;
margin: auto;
padding: 0 24px;
```

---

## Grid

Desktop:

```text
12 columns
```

Tablet:

```text
6 columns
```

Mobile:

```text
1 column
```

---

# Website Structure

## 1. Homepage

### Sections

Hero

Features

Scholarship Categories

Featured Scholarships

Statistics

Testimonials

FAQ

CTA

Footer

---

# Hero Section

Layout:

Left:
- Headline
- Description
- CTA

Right:
- Student illustration
- Search widget

Headline:

```text
Find Scholarships That Match Your Future
```

Subheadline:

```text
Discover thousands of scholarships tailored to your goals, interests, and academic achievements.
```

Buttons:

Primary:
- Find Scholarships

Secondary:
- Create Free Account

Background:

```css
linear-gradient(
180deg,
#ffffff,
#eefaf8
);
```

---

# Search Component

Fields:

- Keyword
- Education Level
- Major
- State

Button:

```css
background: #30cebb;
```

---

# Scholarship Card

Fields:

- Scholarship Name
- Award Amount
- Deadline
- Provider
- Category
- Match Score

Actions:

- Save
- View Details

Style:

```css
background: white;
border-radius: 16px;
box-shadow: var(--shadow-sm);
```

Hover:

```css
transform: translateY(-4px);
```

---

# Categories Section

Display:

8 category cards

Examples:

- STEM
- Arts
- Business
- Healthcare
- Community Service
- Women
- Minority
- Sports

Card Colors:

Use alternating:

```text
Primary
Secondary
Accent
```

---

# Featured Scholarships

Grid:

```text
3 columns desktop
1 column mobile
```

Card Fields:

- Name
- Amount
- Deadline
- Quick Summary

---

# Statistics Section

Background:

```css
#f7fafb
```

Metrics:

- Scholarships Listed
- Students Helped
- Dollars Awarded
- Success Stories

Number Color:

```css
#ef622f
```

---

# Testimonials

Cards:

Student photo

Quote

University

Scholarship won

---

# Dashboard Pages

## Student Dashboard

Widgets:

- Profile Completion
- Recommended Scholarships
- Saved Scholarships
- Application Tracker
- Upcoming Deadlines

---

# Scholarship Detail Page

Sections:

Overview

Eligibility

Requirements

Award Details

Deadline

Application Process

Provider Information

Related Scholarships

Sticky Apply Button

---

# User Profile

Fields:

- Name
- GPA
- School
- Major
- Graduation Year
- Interests
- Demographics
- Activities

Purpose:

Generate recommendation engine

---

# Application Tracker

Statuses:

```text
Not Started
In Progress
Submitted
Awarded
Closed
```

Colors:

```css
Not Started = #9ca3af
In Progress = #30cebb
Submitted = #0f7771
Awarded = #22c55e
Closed = #ef622f
```

---

# Navigation

Desktop:

Logo

Links:

- Scholarships
- Matches
- Resources
- Dashboard
- About

CTA:

```text
Sign Up
```

Sticky navigation

---

# Footer

Columns:

Company

Resources

Students

Legal

Social

Background:

```css
#0f7771
```

Text:

```css
white
```

Links:

```css
#30cebb
```

---

# Forms

Inputs

```css
height: 48px;
border-radius: 12px;
```

Focus:

```css
border-color: #30cebb;
```

---

# Buttons

## Primary

```css
background: #30cebb;
color: white;
```

Hover:

```css
background: #0f7771;
```

---

## Secondary

```css
background: #ef622f;
color: white;
```

Hover:

```css
background: #e85621;
```

---

## Ghost

```css
border: 1px solid #30cebb;
color: #30cebb;
```

Hover:

```css
background: #30cebb;
color: white;
```

---

# Accessibility

Requirements:

- WCAG AA
- Keyboard navigation
- Visible focus states
- Alt text on all images
- Proper heading hierarchy

---

# Animations

Duration:

```css
200ms
```

Use for:

- Button hover
- Card hover
- Dropdowns
- Search results

Avoid:

- Large motion
- Auto-playing animations

---

# SEO Requirements

Pages must include:

- Unique title
- Meta description
- Open Graph tags
- Structured data

Schema Types:

- Organization
- Scholarship
- FAQ

---

Requirements:

- Lighthouse score above 90
- Mobile-first
- Accessibility compliant
- SEO optimized
- Fast loading

Visual Direction:

"Create a modern scholarship discovery platform similar to a blend of LinkedIn, Coursera, and modern SaaS dashboards using the provided color palette. Emphasize trust, education, and usability with clean cards, soft shadows, rounded corners, and prominent search functionality."