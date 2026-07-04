# Phase 1 Data Model: CV-Style Profile Builder

Additive only. **One** table changes (`public.profiles`, +2 columns). No new tables, no new policies. Certificates and photo reuse existing storage. Canonical SQL: [`contracts/db-schema.md`](./contracts/db-schema.md).

---

## 1. `public.profiles` — two new columns

| Column | Type | Notes |
|---|---|---|
| `cv` | `jsonb` (nullable) | The whole CV object (§2). `null` until first save (lazy create, like the old form). |
| `cv_theme` | `text` (nullable) | Selected theme id (§4). One of the 8 ids; also mirrored inside `cv.theme`. |

**Unchanged, reused as mirror targets** (already on the row): `full_name`, `nationality`, `degree` (`check in ('highschool','bachelor','master','phd')`), `field_of_interest`, `photo_path`. **Unchanged trigger**: `profiles_touch` refreshes `updated_at` on update. **Unchanged RLS**: `own select/insert/update/delete` (`auth.uid() = user_id`) + feature-006 admin `select all` — these row policies already govern the new columns; **no policy work needed**.

Validation of `cv_theme` and `cv` shape is enforced **client-side** (theme id ∈ the known 8; object shape normalized on load). We deliberately do **not** add a DB CHECK on `cv_theme` so a future theme addition needs no migration.

---

## 2. The `profile` (CV) object — stored in `profiles.cv`

Single object per user; the contract between the sidebar and every theme. Repeatable sections are arrays (add/remove/reorder). **Skills is a single soft-strength array** (clarified — scholarship CV).

```js
const profile = {
  theme: "editorial",              // one of the 8 ids (mirrored to profiles.cv_theme)

  contact: {
    fullName: "",                  // → mirrored to profiles.full_name on save
    headline: "",                  // aspiration/field, fills each theme's "role" slot
                                   //   e.g. "Prospective Computer Science Undergraduate"
    email:    "",                  // defaults to the account email on first mount if blank
    phone:    "",
    location: "",                  // "City, Country"
    photoUrl: ""                   // CACHE of the current signed URL only; durable pointer is profiles.photo_path
  },

  objective: "",                   // 2–3 sentence academic goals + top accomplishments ("About Me" in some themes)

  education: [                     // repeatable
    { institution:"", degree:"", field:"", startYear:"", endYear:"", gpa:"", location:"" }
  ],

  experience: [                    // repeatable — work / internship / volunteer / research
    { organization:"", role:"", type:"work", startDate:"", endDate:"", location:"", bullets:[""] }
  ],

  honors: [                        // repeatable — scholarships, Dean's List, awards, competitions
    { title:"", issuer:"", year:"", description:"" }
  ],

  skills: [],                      // single list of short soft/personal-strength strings (chips)

  activities: [                    // repeatable — clubs, sports, community service, leadership
    { name:"", role:"", organization:"", period:"", description:"" }
  ]
  // NOTE: certificates are NOT in this object. They live in public.certificates and are read
  // ONLY by the backdrop carousel (FR-020) — never by the theme renderer.
};
```

### Section → CV mapping (canonical labels; themes may restyle typographically)

| `profile` key | CV section label | Theme notes |
|---|---|---|
| `contact` | Contact Information | name + headline are the CV header; email/phone/location in a contact block |
| `objective` | Profile / Objective | some themes title this "About Me"; mapping stays fixed |
| `education` | Education | institution, degree in field, dates, GPA |
| `experience` | Experience | show `type` as a small tag (Work/Internship/Volunteer/Research); bullets as list |
| `honors` | Honors & Awards | give visual weight — the scholarship-CV highlight |
| `skills` | Skills & Strengths | single chip list; bar/percent/dot themes render decoratively (no %) |
| `activities` | Activities & Affiliations | clubs, sports, community service |

Empty sections render **nothing** (no empty headers) — FR-005.

---

## 3. Mirror-on-save contract (keeps ticket + admin correct)

Every debounced save is one upsert to `profiles` for `user_id = auth.uid()`:

```
upsert profiles {
  user_id,
  cv:              <profile>,                 // whole object
  cv_theme:        <profile.theme>,
  full_name:       <profile.contact.fullName || null>,   // MIRROR (ticket reveal + admin)
  // --- from the "For your scholarship ticket" sidebar card (flat columns, read/written directly) ---
  nationality:       <card.nationality || null>,
  degree:            <card.degree || null>,               // '' → null; else one of the enum values
  field_of_interest: <card.fieldOfInterest || null>
}
```

- `full_name` mirrors `contact.fullName` (cleanly mappable).
- `nationality` / `degree` / `field_of_interest` have **no clean CV equivalent**, so they come from the dedicated card and are stored **only** as flat columns (not duplicated into `cv`).
- `degree` must stay within the DB enum; the card is a `<select>` over `('' , highschool, bachelor, master, phd)` — empty saves `null`.
- Consumers unchanged: `ticket-checkout` reads `full_name`/`first_name`/`last_name`/`nationality`/`degree`/`field_of_interest`; `admin.js` reads `profiles`. Neither is edited.

---

## 4. Theme token contract (each theme sets these CSS custom properties)

```css
[data-theme="editorial"]{
  --bg: …; --surface: …; --ink: …; --muted: …; --accent: …; --accent-2: …;
  --font-display: …; --font-body: …;
  --label-style: …;   /* pill | block | underline | plain */
  --photo-shape: …;   /* circle | arch | diamond | rounded-rect | none */
  --skill-style: …;   /* bar | percent | chips | dots  (decorative; no rated %) */
  --archetype: …;     /* A | B | C — informational; the layout class cv--arch-{a,b,c} drives structure */
}
```

### The 8 themes (id · name · archetype · key tokens) — from source spec §7

| id | Name | Arch | Palette / mood | Photo | Labels | Skills | Display font |
|---|---|---|---|---|---|---|---|
| `monolith` | Monolith | A | charcoal `#2b2b2b` on gray `#ececec`, corporate B&W | arch, grayscale | pill | chips | Poppins SemiBold |
| `editorial` | Editorial | A | hard split black/white, high-contrast | rounded-rect, grayscale | block | bar (decorative) | Montserrat Black |
| `gridpop` | Grid Pop | B | lavender/violet on cream, grid paper | rounded-rect | pill + icon | bar (decorative) | Archivo Black / Anton |
| `starlight` | Starlight | B | rose→cream gradient, sparkles | arch | underline | percent (decorative) | Playfair Display |
| `terracotta` | Terracotta | B | beige/tan, brown block headers, blobs | circle | block | bar (decorative) | Poppins |
| `neon` | Neon Glow | B | near-black `#181818` + neon-green glow `#b6ff2e` | circle, grayscale | block + icon | bar (decorative) | Poppins/Inter |
| `timeline` | Timeline | C | cream/brown, vertical timeline | circle | blob | bar (decorative) | Cormorant |
| `signature` | Signature | C | dark textured, green `#3ec46d`, script name | diamond | plain | dots + badges | Great Vibes (name) + Inter |

`editorial` is the **default** theme (source spec: "Good default").

---

## 5. External data read (not owned here)

- **`public.certificates`** (existing): `{ id, user_id, file_path, file_name, mime_type, size_bytes, created_at }`. Read for the backdrop carousel + the sidebar "Certificates & qualifications" list; written by the re-homed upload (insert/delete), scoped by existing RLS. Images → real slide (signed URL); PDFs → placeholder slide.
- **`user-files` Storage bucket** (existing): photo at `{uid}/photo/photo.<ext>`; certificates at `{uid}/certificates/<uuid>-<name>`. Existing own-object storage policies apply.
- **`profile_languages`** (existing): **not read or written** by this feature; left intact (FR-027).

---

## 6. State transitions

- **No profile yet** (`cv` null) → mount shows empty builder seeded from flat columns (R14) → first debounced save creates `cv`/`cv_theme` and mirrors flat fields (lazy create).
- **Editing** → each input mutates `profile`, re-renders preview, schedules save; `sessionStorage` draft written on input.
- **Saved** → "Saved ✓"; draft cleared.
- **Theme change** → `profile.theme` set, preview re-rendered from the same data, save scheduled (writes `cv_theme`).
- **Session expiry mid-edit** → next mount restores the `sessionStorage` draft with a gentle notice.
