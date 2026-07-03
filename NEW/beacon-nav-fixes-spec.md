# Beacon — Navigation & Trust Fixes: Implementation Spec

**Target:** https://beacon-scholarships.pages.dev/ — a fully static site (plain HTML/CSS/JS, no build step) deployed on Cloudflare Pages. Scholarship data is loaded client-side (Supabase).

**For the implementing agent:** Apply the tasks below exactly. Preserve the site's existing CSS classes, design system, and visual style — these are content/structure/behavior changes, not a redesign. Do not rename any existing files or break existing anchors.

---

## Problem summary

1. Header nav has three links ("Browse", "Fully funded", "By country") that all point to the same `#browse` anchor with no filter applied — fake variety.
2. The conversion-critical pages (FAQ, Contact) are missing from the header entirely.
3. The same page is labeled "How it works" in the header and "How to apply" in the footer.
4. Footer has no Legal section; Terms of Service and Privacy Policy pages are being added to the site.
5. Hero stat claims "100% free to use" — no longer accurate since the site now offers a paid preparation service (browsing is free, the ticket service is not).
6. Stats counters render "0 live opportunities / 0 countries" in the initial HTML before JS hydrates — this is what crawlers and slow connections see.

---

## Task 1 — Header navigation

Replace the current header nav links with exactly these, in this order:

| Label | href |
|---|---|
| Scholarships | `/#browse` |
| How it works | `/how-to-apply.html` |
| FAQ | `/faq.html` |
| Contact | `/contact.html` |

Keep the existing CTA button ("Find a scholarship" → `/#browse`) as the final element, styled as it is now.

Apply the same header on **every page** (index, how-to-apply, faq, writing-your-essay, contact, and the new legal pages). On subpages, the `Scholarships` link and CTA must point to `/#browse` (absolute), not a bare `#browse`.

Mark the current page's nav link with the existing active-link style if one exists; otherwise skip.

## Task 2 — Footer structure

Rebuild the footer link lists into three columns (keep existing footer styling/markup patterns):

**Explore**
- Fully funded → `/?funding=fully-funded#browse`
- Master's → `/?level=masters#browse`
- PhD → `/?level=phd#browse`
- By country → `/#browse`

**Support**
- How it works → `/how-to-apply.html`
- Writing your essay → `/writing-your-essay.html`
- FAQ → `/faq.html`
- Contact → `/contact.html`

**Legal**
- Terms of Service → `/terms.html`
- Privacy Policy → `/privacy.html`

Apply the same footer on every page.

## Task 3 — Naming consistency

The page `how-to-apply.html` is labeled **"How it works"** everywhere: header, footer, page `<title>`, on-page `<h1>`, and any in-content links. Remove every remaining "How to apply" label. **Do not rename the file** — keep `how-to-apply.html` so existing URLs don't break.

Similarly: `writing-your-essay.html` is labeled **"Writing your essay"** everywhere. Remove any references calling it an "interview-prep guide."

## Task 4 — Make filter quick-links functional

The Explore links above pass filter state via query params. On the homepage, read those params on load and apply them to the existing filter controls **before** the scholarship cards first render, so the user lands on an already-filtered list.

```js
// Run on DOMContentLoaded, before/at initial card render.
// Map param values to the site's existing filter controls —
// inspect the current filter <select>/<input> elements and use
// their real IDs and option values.
const params = new URLSearchParams(location.search);

const funding = params.get('funding'); // e.g. "fully-funded"
const level   = params.get('level');   // e.g. "masters" | "phd"
const country = params.get('country'); // optional, for future links

if (funding) fundingControl.value = mapToOptionValue(fundingControl, funding);
if (level)   levelControl.value   = mapToOptionValue(levelControl, level);
if (country) countryControl.value = mapToOptionValue(countryControl, country);

applyFilters(); // the site's existing filter routine
```

Implementation notes:
- If a param value doesn't match any option in the control, ignore it silently (no errors, no broken UI).
- The `#browse` hash must still scroll to the browse section after filters apply.
- Do not introduce any framework or dependency — vanilla JS only, consistent with the codebase.

## Task 5 — Hero copy fix

Find the hero stat/badge that says **"100% free to use"** and change it to **"Free to browse"**. Do not change surrounding styling. Rationale (do not include in the page): browsing is free, but the site sells a paid application-preparation service, so "100% free to use" is no longer an honest claim.

## Task 6 — Stats fallback (pre-JS state)

The stats counters currently show `0` for "live opportunities" and "countries" in the raw HTML. Fix using **one** of these approaches, preferring A:

- **A.** Hide the stats block by default (CSS) and reveal it only after the real numbers are loaded and injected.
- **B.** Hardcode the current true numbers as static fallback text in the HTML, then let JS update them on load (numbers must be kept current if data changes materially).

Also verify the browse section's no-JS/pre-JS state: the "Nothing here yet" empty-state message must not flash before data loads — show a neutral loading state instead if one doesn't exist.

## Task 7 — Create the legal pages

Create `terms.html` and `privacy.html` using the site's existing subpage template (same header, footer, typography, and content-page layout as `faq.html`). Their content is provided separately as `terms-of-service.md` and `privacy-policy.md` — convert the markdown structure to the site's existing heading/section markup. Leave all `[bracketed placeholders]` visibly intact for the owner to fill; do not invent values for them.

Add one line to the checkout/booking flow, immediately before the payment action:
> By booking, you agree to the [Terms of Service](/terms.html).

---

## Acceptance checklist

- [ ] Header on every page: Scholarships / How it works / FAQ / Contact + CTA, links correct from subpages
- [ ] Footer on every page: Explore / Support / Legal columns as specified
- [ ] Zero remaining instances of the label "How to apply" or "interview-prep guide" anywhere
- [ ] `/?funding=fully-funded#browse` lands on a filtered, scrolled-to list; same for `level=masters` and `level=phd`
- [ ] Unknown/invalid query params are ignored without errors
- [ ] Hero reads "Free to browse"; "100% free to use" appears nowhere
- [ ] Raw HTML never displays "0 live opportunities" (view-source check)
- [ ] `terms.html` and `privacy.html` exist, match site styling, placeholders intact
- [ ] Checkout shows the Terms agreement line with a working link
- [ ] No file renames, no new dependencies, no visual redesign
