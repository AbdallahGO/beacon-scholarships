// Feature 007 — CV-style profile builder (specs/007-cv-profile-builder).
// Decoupled by design (spec §2): one `profile` object; the sidebar only WRITES
// to it, the preview only READS it, and the certificates carousel is a separate
// reader of public.certificates. Mounted by account.js into #pane-profile via
// window.BeaconCV.mount(pane, ctx). Vanilla JS, no build step.
(function () {
  "use strict";

  // ---- theme registry (id, name, archetype A|B|C, accents) --------------------
  // Archetypes: A side-column, B header-stack, C timeline.
  const THEMES = [
    { id: "editorial", name: "Editorial", arch: "a", a: "#111111", b: "#8a8a8a", dark: false },
    { id: "monolith",  name: "Monolith",  arch: "a", a: "#2b2b2b", b: "#6a6a6a", dark: false },
    { id: "terracotta",name: "Terracotta",arch: "b", a: "#9c5b3b", b: "#c9a08a", dark: false },
    { id: "gridpop",   name: "Grid Pop",  arch: "b", a: "#6d3f8f", b: "#c9a3d8", dark: false },
    { id: "starlight", name: "Starlight", arch: "b", a: "#c56d92", b: "#f0c9d6", dark: false },
    { id: "neon",      name: "Neon Glow", arch: "b", a: "#b6ff2e", b: "#7bd600", dark: true },
    { id: "timeline",  name: "Timeline",  arch: "c", a: "#8a5a3c", b: "#c8a888", dark: false },
    { id: "signature", name: "Signature", arch: "c", a: "#3ec46d", b: "#2a9d55", dark: true },
  ];
  const THEME_IDS = THEMES.map((t) => t.id);
  const archOf = (id) => (THEMES.find((t) => t.id === id) || THEMES[0]).arch;
  const DEFAULT_THEME = "editorial";

  const DEGREES = [
    ["", "— choose —"],
    ["highschool", "High school"],
    ["bachelor", "Bachelor"],
    ["master", "Master's"],
    ["phd", "PhD"],
  ];
  const EXP_TYPES = [
    ["work", "Work"],
    ["internship", "Internship"],
    ["volunteer", "Volunteer"],
    ["research", "Research"],
  ];

  // field metadata for the repeatable sub-cards
  const EDU_FIELDS = [
    ["institution", "Institution", "University / School"],
    ["degree", "Degree", "e.g. Bachelor of Science"],
    ["field", "Field of study", "e.g. Computer Science"],
    ["startYear", "Start year", "2023"],
    ["endYear", "End year", "2027 / Present"],
    ["gpa", "GPA", "e.g. 3.8 / 4.0"],
    ["location", "Location", "City, Country"],
  ];
  const HON_FIELDS = [
    ["title", "Title", "e.g. Dean's List"],
    ["issuer", "Issuer", "Awarding body"],
    ["year", "Year", "2025"],
    ["description", "Description", "One line on why it matters", true],
  ];
  const ACT_FIELDS = [
    ["name", "Name", "e.g. Debate Club"],
    ["role", "Role", "e.g. President"],
    ["organization", "Organization", "Where"],
    ["period", "Period", "2023–2025"],
    ["description", "Description", "What you did / impact", true],
  ];

  const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const DOC_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
  const PHOTO_MAX = 5 * 1024 * 1024;
  const DOC_MAX = 10 * 1024 * 1024;
  const DRAFT_KEY = "beacon.cvDraft";
  const SAVE_MS = 800;

  function defaultProfile() {
    return {
      theme: DEFAULT_THEME,
      contact: { fullName: "", headline: "", email: "", phone: "", location: "", photoUrl: "" },
      objective: "",
      education: [],
      experience: [],
      honors: [],
      skills: [],
      activities: [],
    };
  }

  // ---- path helpers (contract: cv-contract §1) --------------------------------
  function getByPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setByPath(obj, path, val) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const nextIsIndex = /^\d+$/.test(keys[i + 1]);
      if (o[k] == null) o[k] = nextIsIndex ? [] : {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = val;
  }

  // normalize a loaded cv into the current shape (defensive; skills may be legacy)
  function normalize(cv) {
    const p = defaultProfile();
    if (!cv || typeof cv !== "object") return p;
    p.theme = THEME_IDS.includes(cv.theme) ? cv.theme : DEFAULT_THEME;
    if (cv.contact && typeof cv.contact === "object") Object.assign(p.contact, cv.contact);
    p.objective = typeof cv.objective === "string" ? cv.objective : "";
    ["education", "experience", "honors", "activities"].forEach((k) => {
      if (Array.isArray(cv[k])) p[k] = cv[k];
    });
    // skills: current = array of strings; legacy = {technical:[],soft:[]}
    if (Array.isArray(cv.skills)) p.skills = cv.skills.filter((s) => typeof s === "string");
    else if (cv.skills && typeof cv.skills === "object")
      p.skills = [].concat(cv.skills.soft || [], cv.skills.technical || []).filter(Boolean);
    // ensure experience bullets arrays
    p.experience.forEach((e) => { if (!Array.isArray(e.bullets)) e.bullets = e.bullets ? [String(e.bullets)] : [""]; });
    return p;
  }

  const isBlankEntry = (o) =>
    !o || Object.keys(o).every((k) => {
      const v = o[k];
      if (Array.isArray(v)) return v.every((x) => !String(x || "").trim());
      return !String(v == null ? "" : v).trim();
    });

  // ============================================================================
  // MOUNT
  // ============================================================================
  function mount(pane, ctx) {
    const { db, user, A, esc, fmtDate, uuid, BUCKET, bumpProfileRev } = ctx;
    const H = esc; // local alias

    let profile = defaultProfile();
    // flat ticket-only fields — NOT part of the CV/cv object (data-model §3)
    let flat = { nationality: "", degree: "", field_of_interest: "" };
    let certs = []; // public.certificates rows
    let slideIx = 0;
    let saveTimer = null;
    let alive = true;
    let objectUrls = [];

    // ---------- shell -----------------------------------------------------------
    pane.innerHTML = `
      <div class="cvb" data-tab="edit">
        <div class="cvb-picker" data-picker aria-label="Choose a CV theme"></div>
        <div class="cvb-main">
          <aside class="cvb-side" data-side aria-label="Edit your CV"></aside>
          <div class="cvb-preview" data-preview aria-label="CV preview">
            <div class="cvb-backdrop" data-backdrop aria-hidden="true"></div>
            <button type="button" class="cvb-arrow cvb-arrow--prev" data-arrow="-1" aria-label="Previous certificate" hidden>‹</button>
            <button type="button" class="cvb-arrow cvb-arrow--next" data-arrow="1" aria-label="Next certificate" hidden>›</button>
            <div class="cvb-stage"><article class="cv" data-cv></article></div>
          </div>
        </div>
        <div class="cvb-tabbar" role="tablist">
          <button type="button" class="cvb-tabbtn is-on" data-go="edit" role="tab">Edit</button>
          <button type="button" class="cvb-tabbtn" data-go="preview" role="tab">Preview</button>
          <button type="button" class="cvb-tabbtn cvb-tabbtn--theme" data-go="theme" role="tab">🎨 Theme</button>
        </div>
        <span class="cvb-saved" data-saved hidden>Saved ✓</span>
      </div>`;

    const $ = (sel) => pane.querySelector(sel);
    const side = $("[data-side]");
    const picker = $("[data-picker]");
    const cvRoot = $("[data-cv]");
    const backdrop = $("[data-backdrop]");
    const savedPill = $("[data-saved]");
    const cvb = $(".cvb");

    // ---------- load ------------------------------------------------------------
    (async function load() {
      let row = null;
      try {
        const r = await db.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
        if (r.error) throw r.error;
        row = r.data;
      } catch (e) {
        console.error(e);
        if (alive) side.innerHTML = `<div class="cvb-err">We couldn't load your profile — please refresh. (If this keeps happening, the database may not be set up yet.)</div>`;
        return;
      }
      if (!alive) return;

      if (row && row.cv) {
        profile = normalize(row.cv);
      } else {
        // seed from existing flat columns so returning users lose nothing (R14)
        profile = defaultProfile();
        const name = (row && (row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" "))) || "";
        profile.contact.fullName = name;
      }
      if (row) {
        flat.nationality = row.nationality || "";
        flat.degree = row.degree || "";
        flat.field_of_interest = row.field_of_interest || "";
      }
      if (!profile.contact.email) profile.contact.email = user.email || "";
      profile.theme = THEME_IDS.includes(row && row.cv_theme) ? row.cv_theme
        : THEME_IDS.includes(profile.theme) ? profile.theme : DEFAULT_THEME;

      // restore an in-progress draft (mid-edit session expiry — FR-009)
      try {
        const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
        if (draft && draft.profile) {
          profile = normalize(draft.profile);
          if (draft.flat) flat = Object.assign(flat, draft.flat);
          A.toast("We restored what you were editing earlier.");
        }
      } catch (e) {}

      renderPicker();
      renderSidebar();
      renderPreview();
      // photo signed URL (don't block) + certificates
      hydratePhoto(row && row.photo_path);
      loadCerts();
    })();

    // ---------- save (debounced upsert + mirror) --------------------------------
    function writeDraft() {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ profile, flat })); } catch (e) {}
    }
    function scheduleSave() {
      writeDraft();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, SAVE_MS);
    }
    async function save() {
      if (!alive) return;
      const row = {
        user_id: user.id,
        cv: profile,
        cv_theme: profile.theme,
        // mirror the one cleanly-mappable field + the ticket-card flat fields
        full_name: (profile.contact.fullName || "").trim() || null,
        nationality: (flat.nationality || "").trim() || null,
        degree: flat.degree || null,
        field_of_interest: (flat.field_of_interest || "").trim() || null,
      };
      const { error } = await db.from("profiles").upsert(row);
      if (error) { console.error(error); A.toast("Couldn't save your CV — please try again."); return; }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      bumpProfileRev();
      flashSaved();
    }
    let savedTimer = null;
    function flashSaved() {
      if (!savedPill) return;
      savedPill.hidden = false;
      savedPill.classList.add("is-show");
      clearTimeout(savedTimer);
      savedTimer = setTimeout(() => { savedPill.classList.remove("is-show"); }, 1600);
    }

    // ---------- theme picker ----------------------------------------------------
    function renderPicker() {
      picker.innerHTML = THEMES.map((t) => `
        <button type="button" class="cvb-swatch${t.id === profile.theme ? " is-active" : ""}" data-theme-id="${t.id}"
                aria-pressed="${t.id === profile.theme}" title="${H(t.name)} — layout ${t.arch.toUpperCase()}">
          <span class="cvb-swatch-colors"><i style="background:${t.a}"></i><i style="background:${t.b}"></i></span>
          <span class="cvb-swatch-name">${H(t.name)}</span>
          <span class="cvb-swatch-arch">${t.arch.toUpperCase()}</span>
        </button>`).join("");
    }
    function setTheme(id) {
      if (!THEME_IDS.includes(id)) return;
      profile.theme = id;
      renderPicker();
      renderPreview();
      renderBackdrop(); // scrim is theme-tuned
      scheduleSave();
    }

    // ---------- sidebar ---------------------------------------------------------
    function inputRow(label, path, val, ph, type) {
      const t = type === "textarea"
        ? `<textarea class="cvb-in cvb-ta" data-path="${path}" rows="3" placeholder="${H(ph || "")}" dir="auto">${H(val || "")}</textarea>`
        : `<input class="cvb-in" data-path="${path}" value="${H(val || "")}" placeholder="${H(ph || "")}" dir="auto">`;
      return `<label class="cvb-f"><span class="cvb-f-l">${H(label)}</span>${t}</label>`;
    }
    function selectRow(label, path, val, options) {
      return `<label class="cvb-f"><span class="cvb-f-l">${H(label)}</span>
        <select class="cvb-in cvb-sel" data-path="${path}">
          ${options.map(([v, l]) => `<option value="${H(v)}"${String(val || "") === v ? " selected" : ""}>${H(l)}</option>`).join("")}
        </select></label>`;
    }
    function flatSelectRow(label, key, val, options) {
      return `<label class="cvb-f"><span class="cvb-f-l">${H(label)}</span>
        <select class="cvb-in cvb-sel" data-flat="${key}">
          ${options.map(([v, l]) => `<option value="${H(v)}"${String(val || "") === v ? " selected" : ""}>${H(l)}</option>`).join("")}
        </select></label>`;
    }
    function flatInputRow(label, key, val, ph) {
      return `<label class="cvb-f"><span class="cvb-f-l">${H(label)}</span>
        <input class="cvb-in" data-flat="${key}" value="${H(val || "")}" placeholder="${H(ph || "")}"></label>`;
    }
    function entryHead(sec, i, title) {
      return `<div class="cvb-entry-top">
        <b class="cvb-entry-title">${H(title)}</b>
        <span class="cvb-entry-tools">
          <button type="button" class="cvb-mini" data-act="move" data-sec="${sec}" data-i="${i}" data-dir="-1" aria-label="Move up">↑</button>
          <button type="button" class="cvb-mini" data-act="move" data-sec="${sec}" data-i="${i}" data-dir="1" aria-label="Move down">↓</button>
          <button type="button" class="cvb-mini cvb-mini--x" data-act="remove" data-sec="${sec}" data-i="${i}" aria-label="Remove">✕</button>
        </span></div>`;
    }
    function repeatFields(sec, i, entry, fields) {
      return fields.map(([k, label, ph, ta]) =>
        inputRow(label, `${sec}.${i}.${k}`, entry[k], ph, ta ? "textarea" : "")).join("");
    }

    function card(id, icon, title, bodyHtml, extraClass) {
      return `<section class="cvb-card${extraClass ? " " + extraClass : ""}" data-card="${id}">
        <header class="cvb-card-h"><span class="cvb-card-ic" aria-hidden="true">${icon}</span><h3>${H(title)}</h3></header>
        <div class="cvb-card-b" data-body="${id}">${bodyHtml}</div>
      </section>`;
    }

    function contactBody() {
      const c = profile.contact;
      return `
        <div class="cvb-photo-row">
          <span class="cvb-photo-prev" data-photo>${c.photoUrl ? `<img src="${H(c.photoUrl)}" alt="Your photo" referrerpolicy="no-referrer">` : `<span class="cvb-photo-empty">🙂</span>`}</span>
          <label class="cvb-btn cvb-btn--ghost">Upload photo
            <input type="file" data-photo-input accept="image/jpeg,image/png,image/webp" hidden>
          </label>
          <span class="cvb-hint">JPG/PNG/WebP · up to 5 MB. Replaces the theme placeholder.</span>
        </div>
        ${inputRow("Full name", "contact.fullName", c.fullName, "Your full name")}
        ${inputRow("Headline", "contact.headline", c.headline, "e.g. Prospective Computer Science Undergraduate")}
        ${inputRow("Email", "contact.email", c.email, "you@example.com")}
        ${inputRow("Phone", "contact.phone", c.phone, "+20 100 000 0000")}
        ${inputRow("Location", "contact.location", c.location, "City, Country")}`;
    }
    function eduBody() {
      return (profile.education.map((e, i) =>
        `<div class="cvb-entry">${entryHead("education", i, e.institution || `Education ${i + 1}`)}${repeatFields("education", i, e, EDU_FIELDS)}</div>`).join("")
        || `<p class="cvb-empty">No education yet.</p>`)
        + `<button type="button" class="cvb-add" data-act="add" data-sec="education"><span>＋</span> Add education</button>`;
    }
    function expBody() {
      return (profile.experience.map((e, i) => {
        const bullets = (e.bullets || []).map((b, bi) =>
          `<div class="cvb-bullet"><input class="cvb-in" data-path="experience.${i}.bullets.${bi}" value="${H(b || "")}" placeholder="Achievement / responsibility" dir="auto"><button type="button" class="cvb-mini cvb-mini--x" data-act="rmbullet" data-i="${i}" data-b="${bi}" aria-label="Remove bullet">✕</button></div>`).join("");
        return `<div class="cvb-entry">${entryHead("experience", i, e.organization || e.role || `Experience ${i + 1}`)}
          ${selectRow("Type", `experience.${i}.type`, e.type || "work", EXP_TYPES)}
          ${inputRow("Organization", `experience.${i}.organization`, e.organization, "Company / org")}
          ${inputRow("Role", `experience.${i}.role`, e.role, "Your role")}
          ${inputRow("Start", `experience.${i}.startDate`, e.startDate, "Jun 2024")}
          ${inputRow("End", `experience.${i}.endDate`, e.endDate, "Present")}
          ${inputRow("Location", `experience.${i}.location`, e.location, "City / Remote")}
          <div class="cvb-sub-l">Highlights</div>${bullets}
          <button type="button" class="cvb-add cvb-add--sm" data-act="addbullet" data-i="${i}"><span>＋</span> Add highlight</button>
        </div>`;
      }).join("") || `<p class="cvb-empty">No experience yet.</p>`)
        + `<button type="button" class="cvb-add" data-act="add" data-sec="experience"><span>＋</span> Add experience</button>`;
    }
    function honorsBody() {
      return (profile.honors.map((e, i) =>
        `<div class="cvb-entry">${entryHead("honors", i, e.title || `Honor ${i + 1}`)}${repeatFields("honors", i, e, HON_FIELDS)}</div>`).join("")
        || `<p class="cvb-empty">No honors yet.</p>`)
        + `<button type="button" class="cvb-add" data-act="add" data-sec="honors"><span>＋</span> Add honor</button>`;
    }
    function activitiesBody() {
      return (profile.activities.map((e, i) =>
        `<div class="cvb-entry">${entryHead("activities", i, e.name || `Activity ${i + 1}`)}${repeatFields("activities", i, e, ACT_FIELDS)}</div>`).join("")
        || `<p class="cvb-empty">No activities yet.</p>`)
        + `<button type="button" class="cvb-add" data-act="add" data-sec="activities"><span>＋</span> Add activity</button>`;
    }
    function skillsBody() {
      return `<div class="cvb-chips" data-chips>
          ${profile.skills.map((s, i) => `<span class="cvb-chip">${H(s)}<button type="button" class="cvb-chip-x" data-act="rmskill" data-i="${i}" aria-label="Remove ${H(s)}">✕</button></span>`).join("")}
        </div>
        <div class="cvb-chip-add">
          <input class="cvb-in" data-skill-input placeholder="Add a strength, then Enter (e.g. Leadership)" aria-label="Add a skill">
          <button type="button" class="cvb-btn cvb-btn--sm" data-act="addskill">Add</button>
        </div>
        <span class="cvb-hint">Soft skills &amp; personal strengths — what a scholarship values.</span>`;
    }
    function certsBody() {
      return `<ul class="cvb-certlist" data-certlist>${certListHtml()}</ul>
        <label class="cvb-btn cvb-btn--ghost">Upload certificate
          <input type="file" data-cert-input accept="application/pdf,image/jpeg,image/png" hidden>
        </label>
        <span class="cvb-hint">PDF/JPG/PNG · up to 10 MB. Shown as a soft backdrop behind your CV.</span>`;
    }
    function ticketBody() {
      return `<p class="cvb-note">These aren't shown on your CV — they help us prepare your scholarship <b>ticket</b> and keep your account accurate.</p>
        ${flatInputRow("Nationality", "nationality", flat.nationality, "Your nationality")}
        ${flatSelectRow("Highest degree", "degree", flat.degree, DEGREES)}
        ${flatInputRow("Field of interest", "field_of_interest", flat.field_of_interest, "e.g. Computer Science")}`;
    }

    function renderSidebar() {
      side.innerHTML =
        card("contact", "👤", "Contact", contactBody()) +
        card("objective", "🎯", "Objective", inputRow("About you", "objective", profile.objective, "2–3 sentences on your goals and top achievements", "textarea")) +
        card("education", "🎓", "Education", eduBody()) +
        card("experience", "💼", "Experience", expBody()) +
        card("honors", "🏅", "Honors & Awards", honorsBody()) +
        card("skills", "✨", "Skills & Strengths", skillsBody()) +
        card("activities", "🤝", "Activities & Affiliations", activitiesBody()) +
        card("certs", "📎", "Certificates & qualifications", certsBody()) +
        card("ticket", "🎫", "For your scholarship ticket", ticketBody(), "cvb-card--ticket");
    }
    function rerenderCard(id, bodyFn) {
      const b = side.querySelector(`[data-body="${id}"]`);
      if (b) b.innerHTML = bodyFn();
    }

    // ---------- preview (pure render of profile) --------------------------------
    function contactLines() {
      const c = profile.contact;
      const items = [];
      if (c.email) items.push(`<li data-k="email">${H(c.email)}</li>`);
      if (c.phone) items.push(`<li data-k="phone">${H(c.phone)}</li>`);
      if (c.location) items.push(`<li data-k="location">${H(c.location)}</li>`);
      return items.length ? `<ul class="cv-contact">${items.join("")}</ul>` : "";
    }
    function sec(cls, title, inner) {
      return inner ? `<section class="cv-sec cv-sec--${cls}"><h2>${H(title)}</h2>${inner}</section>` : "";
    }
    function objectiveHtml() {
      return profile.objective.trim() ? `<p class="cv-obj" dir="auto">${H(profile.objective)}</p>` : "";
    }
    function eduHtml() {
      const rows = profile.education.filter((e) => !isBlankEntry(e)).map((e) => `
        <div class="cv-entry cv-edu">
          <div class="cv-entry-h"><b>${H(e.degree || "")}${e.degree && e.field ? " · " : ""}${H(e.field || "")}</b>
            <span class="cv-when">${H([e.startYear, e.endYear].filter(Boolean).join(" – "))}</span></div>
          <div class="cv-entry-s">${H([e.institution, e.location].filter(Boolean).join(" · "))}${e.gpa ? ` <span class="cv-gpa">GPA ${H(e.gpa)}</span>` : ""}</div>
        </div>`).join("");
      return sec("education", "Education", rows);
    }
    function expHtml() {
      const rows = profile.experience.filter((e) => !isBlankEntry(e)).map((e) => {
        const b = (e.bullets || []).filter((x) => String(x || "").trim());
        const tag = (EXP_TYPES.find((t) => t[0] === e.type) || ["", ""])[1];
        return `<div class="cv-entry cv-exp">
          <div class="cv-entry-h"><b>${H(e.role || "")}${e.role && e.organization ? " · " : ""}${H(e.organization || "")}</b>
            <span class="cv-when">${H([e.startDate, e.endDate].filter(Boolean).join(" – "))}</span></div>
          <div class="cv-entry-s">${tag ? `<span class="cv-tag">${H(tag)}</span>` : ""}${H(e.location || "")}</div>
          ${b.length ? `<ul class="cv-bullets" dir="auto">${b.map((x) => `<li>${H(x)}</li>`).join("")}</ul>` : ""}
        </div>`;
      }).join("");
      return sec("experience", "Experience", rows);
    }
    function honorsHtml() {
      const rows = profile.honors.filter((e) => !isBlankEntry(e)).map((e) => `
        <div class="cv-entry cv-honor">
          <div class="cv-entry-h"><b>${H(e.title || "")}</b><span class="cv-when">${H(e.year || "")}</span></div>
          <div class="cv-entry-s">${H(e.issuer || "")}</div>
          ${e.description ? `<p class="cv-desc" dir="auto">${H(e.description)}</p>` : ""}
        </div>`).join("");
      return sec("honors", "Honors & Awards", rows);
    }
    function activitiesHtml() {
      const rows = profile.activities.filter((e) => !isBlankEntry(e)).map((e) => `
        <div class="cv-entry cv-act">
          <div class="cv-entry-h"><b>${H(e.name || "")}${e.name && e.role ? " · " : ""}${H(e.role || "")}</b><span class="cv-when">${H(e.period || "")}</span></div>
          <div class="cv-entry-s">${H(e.organization || "")}</div>
          ${e.description ? `<p class="cv-desc" dir="auto">${H(e.description)}</p>` : ""}
        </div>`).join("");
      return sec("activities", "Activities & Affiliations", rows);
    }
    function skillsHtml() {
      const s = profile.skills.filter((x) => String(x || "").trim());
      if (!s.length) return "";
      return `<section class="cv-sec cv-sec--skills"><h2>Skills &amp; Strengths</h2>
        <ul class="cv-skills">${s.map((x) => `<li class="cv-skill"><span>${H(x)}</span></li>`).join("")}</ul></section>`;
    }
    function photoHtml() {
      const c = profile.contact;
      const inner = c.photoUrl
        ? `<img src="${H(c.photoUrl)}" alt="${H(c.fullName || "Photo")}" referrerpolicy="no-referrer">`
        : `<svg viewBox="0 0 100 100" class="cv-silh" aria-hidden="true"><circle cx="50" cy="36" r="20"/><path d="M14 92c0-22 16-34 36-34s36 12 36 34z"/></svg>`;
      return `<div class="cv-photo">${inner}</div>`;
    }
    function renderPreview() {
      const arch = archOf(profile.theme);
      const c = profile.contact;
      const head = `<header class="cv-head">
        ${photoHtml()}
        <div class="cv-id">
          <h1 class="cv-name" dir="auto">${H(c.fullName || "Your Name")}</h1>
          ${c.headline ? `<p class="cv-headline" dir="auto">${H(c.headline)}</p>` : ""}
          ${arch !== "a" ? contactLines() : ""}
        </div>
      </header>`;

      const objective = sec("objective", "Profile", objectiveHtml());
      const education = eduHtml();
      const experience = expHtml();
      const honors = honorsHtml();
      const skills = skillsHtml();
      const activities = activitiesHtml();
      const contactBlock = arch === "a"
        ? sec("contact", "Contact", contactLines()) : "";

      let body;
      if (arch === "a") {
        body = `<div class="cv-body cv-2col">
          <div class="cv-col cv-rail">${contactBlock}${skills}${education}</div>
          <div class="cv-col cv-main">${objective}${experience}${honors}${activities}</div>
        </div>`;
      } else if (arch === "c") {
        body = `<div class="cv-body cv-timeline">${objective}${experience}${education}${honors}${skills}${activities}</div>`;
      } else {
        body = `<div class="cv-body cv-stack">${objective}${education}${experience}${honors}${skills}${activities}</div>`;
      }

      cvRoot.className = "cv cv--arch-" + arch;
      cvRoot.setAttribute("data-theme", profile.theme);
      cvRoot.innerHTML = head + body;
    }

    // ---------- certificates backdrop (independent reader) ----------------------
    function certListHtml() {
      if (!certs.length) return `<li class="cvb-empty">No certificates uploaded yet.</li>`;
      return certs.map((c) => `<li data-id="${H(c.id)}" data-path="${H(c.file_path)}">
        <span class="cvb-cert-n">${H(c.file_name)}</span>
        <span class="cvb-cert-d">${H(fmtDate(c.created_at))}</span>
        <button type="button" class="cvb-link" data-act="viewcert">View</button>
        <button type="button" class="cvb-link cvb-link--x" data-act="rmcert">Remove</button>
      </li>`).join("");
    }
    async function loadCerts() {
      try {
        const { data, error } = await db.from("certificates").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
        if (error) throw error;
        certs = data || [];
      } catch (e) { console.error(e); certs = []; }
      if (!alive) return;
      rerenderCard("certs", certsBody);
      if (slideIx >= certs.length) slideIx = 0;
      renderBackdrop();
    }
    async function renderBackdrop() {
      const prev = pane.querySelector('[data-arrow="-1"]');
      const next = pane.querySelector('[data-arrow="1"]');
      if (!certs.length) {
        backdrop.innerHTML = "";
        backdrop.classList.remove("has-slides");
        if (prev) prev.hidden = true;
        if (next) next.hidden = true;
        return;
      }
      backdrop.classList.add("has-slides");
      const c = certs[Math.max(0, Math.min(slideIx, certs.length - 1))];
      const isImg = /^image\//.test(c.mime_type || "");
      if (isImg) {
        let url = "";
        try {
          const { data } = await db.storage.from(BUCKET).createSignedUrl(c.file_path, 60 * 60);
          url = (data && data.signedUrl) || "";
        } catch (e) {}
        if (!alive) return;
        backdrop.innerHTML = url
          ? `<div class="cvb-slide" style="background-image:url('${H(url)}')"></div>`
          : placeholderSlide(c);
      } else {
        backdrop.innerHTML = placeholderSlide(c);
      }
      const many = certs.length > 1;
      if (prev) prev.hidden = !many;
      if (next) next.hidden = !many;
    }
    function placeholderSlide(c) {
      return `<div class="cvb-slide cvb-slide--doc"><div class="cvb-doc"><span class="cvb-doc-ic">📄</span><span class="cvb-doc-n">${H(c.file_name || "Document")}</span></div></div>`;
    }
    function moveSlide(dir) {
      if (certs.length < 2) return;
      slideIx = (slideIx + dir + certs.length) % certs.length;
      renderBackdrop();
    }

    // ---------- photo -----------------------------------------------------------
    async function hydratePhoto(path) {
      if (!path) return;
      try {
        const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
        const url = data && data.signedUrl;
        if (url && alive) {
          profile.contact.photoUrl = url;
          try { localStorage.setItem("beacon.avatarUrl", url); } catch (e) {}
          const box = side.querySelector("[data-photo]");
          if (box) box.innerHTML = `<img src="${H(url)}" alt="Your photo" referrerpolicy="no-referrer">`;
          renderPreview();
        }
      } catch (e) {}
    }
    function validateFile(file, types, max, what) {
      if (!file) return null;
      if (!types[file.type]) { A.toast(`That file type isn't supported for ${what}.`); return null; }
      if (file.size > max) { A.toast(`That file is too big for ${what} — limit ${Math.round(max / 1048576)} MB.`); return null; }
      return file;
    }
    async function onPhoto(input) {
      const file = validateFile(input.files[0], PHOTO_TYPES, PHOTO_MAX, "photos");
      input.value = "";
      if (!file) return;
      const path = `${user.id}/photo/photo.${PHOTO_TYPES[file.type]}`;
      const up = await db.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) { console.error(up.error); A.toast("Upload didn't work — please try again."); return; }
      const { error } = await db.from("profiles").upsert({ user_id: user.id, photo_path: path });
      if (error) { console.error(error); A.toast("Upload saved but the profile didn't update — try again."); return; }
      bumpProfileRev();
      await hydratePhoto(path);
      A.toast("Photo updated ✓ (it may take a moment to show in the menu)");
    }
    async function onCert(input) {
      const file = validateFile(input.files[0], DOC_TYPES, DOC_MAX, "certificates");
      input.value = "";
      if (!file) return;
      const path = `${user.id}/certificates/${uuid()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (up.error) { console.error(up.error); A.toast("Upload didn't work — please try again."); return; }
      const { error } = await db.from("certificates").insert({
        user_id: user.id, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
      });
      if (error) { console.error(error); A.toast("Upload saved but couldn't be recorded — try again."); return; }
      A.toast("Certificate uploaded ✓");
      loadCerts();
    }
    async function viewCert(li) {
      try {
        const { data } = await db.storage.from(BUCKET).createSignedUrl(li.dataset.path, 300);
        if (data && data.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
      } catch (e) {}
    }
    async function rmCert(li) {
      if (!confirm("Remove this certificate? The file will be deleted.")) return;
      try {
        await db.storage.from(BUCKET).remove([li.dataset.path]);
        await db.from("certificates").delete().eq("id", li.dataset.id);
      } catch (e) { console.error(e); }
      loadCerts();
    }

    // ---------- events (delegated) ---------------------------------------------
    function onInput(e) {
      const el = e.target;
      if (el.dataset && el.dataset.path != null) {
        setByPath(profile, el.dataset.path, el.value);
        renderPreview();
        scheduleSave();
      } else if (el.dataset && el.dataset.flat != null) {
        flat[el.dataset.flat] = el.value;
        scheduleSave();
      }
    }
    function onKeydown(e) {
      if (e.target.matches("[data-skill-input]") && e.key === "Enter") {
        e.preventDefault();
        addSkill();
      }
    }
    function addSkill() {
      const inp = side.querySelector("[data-skill-input]");
      if (!inp) return;
      const v = inp.value.trim();
      if (!v) return;
      profile.skills.push(v);
      rerenderCard("skills", skillsBody);
      const again = side.querySelector("[data-skill-input]");
      if (again) again.focus();
      renderPreview();
      scheduleSave();
    }
    function onClick(e) {
      const t = e.target.closest("[data-act], [data-theme-id], [data-arrow], [data-go]");
      if (!t) return;
      if (t.dataset.themeId) { setTheme(t.dataset.themeId); return; }
      if (t.dataset.arrow) { moveSlide(parseInt(t.dataset.arrow, 10)); return; }
      if (t.dataset.go) { switchTab(t.dataset.go); return; }
      const act = t.dataset.act;
      const secName = t.dataset.sec;
      const i = t.dataset.i != null ? parseInt(t.dataset.i, 10) : -1;
      const bodyFor = { education: eduBody, experience: expBody, honors: honorsBody, activities: activitiesBody };
      const blank = {
        education: () => ({ institution: "", degree: "", field: "", startYear: "", endYear: "", gpa: "", location: "" }),
        experience: () => ({ organization: "", role: "", type: "work", startDate: "", endDate: "", location: "", bullets: [""] }),
        honors: () => ({ title: "", issuer: "", year: "", description: "" }),
        activities: () => ({ name: "", role: "", organization: "", period: "", description: "" }),
      };
      if (act === "add") {
        profile[secName].push(blank[secName]());
        rerenderCard(secName, bodyFor[secName]);
        renderPreview(); scheduleSave();
      } else if (act === "remove") {
        profile[secName].splice(i, 1);
        rerenderCard(secName, bodyFor[secName]);
        renderPreview(); scheduleSave();
      } else if (act === "move") {
        const dir = parseInt(t.dataset.dir, 10);
        const j = i + dir;
        const arr = profile[secName];
        if (j < 0 || j >= arr.length) return;
        const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        rerenderCard(secName, bodyFor[secName]);
        renderPreview(); scheduleSave();
      } else if (act === "addbullet") {
        (profile.experience[i].bullets = profile.experience[i].bullets || []).push("");
        rerenderCard("experience", expBody);
        renderPreview(); scheduleSave();
      } else if (act === "rmbullet") {
        const b = parseInt(t.dataset.b, 10);
        profile.experience[i].bullets.splice(b, 1);
        rerenderCard("experience", expBody);
        renderPreview(); scheduleSave();
      } else if (act === "addskill") {
        addSkill();
      } else if (act === "rmskill") {
        profile.skills.splice(i, 1);
        rerenderCard("skills", skillsBody);
        renderPreview(); scheduleSave();
      } else if (act === "viewcert") {
        viewCert(t.closest("li"));
      } else if (act === "rmcert") {
        rmCert(t.closest("li"));
      }
    }
    function onChange(e) {
      if (e.target.matches("[data-photo-input]")) onPhoto(e.target);
      else if (e.target.matches("[data-cert-input]")) onCert(e.target);
    }

    // ---------- responsive tabs + swipe ----------------------------------------
    function switchTab(go) {
      if (go === "theme") { cvb.classList.toggle("show-theme"); return; }
      cvb.dataset.tab = go;
      cvb.classList.remove("show-theme");
      pane.querySelectorAll(".cvb-tabbtn").forEach((b) => b.classList.toggle("is-on", b.dataset.go === go));
    }
    let touchX = null;
    function onTouchStart(e) { touchX = e.changedTouches[0].clientX; }
    function onTouchEnd(e) {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 45) moveSlide(dx < 0 ? 1 : -1);
      touchX = null;
    }

    // wire up
    side.addEventListener("input", onInput);
    side.addEventListener("change", onChange);
    side.addEventListener("keydown", onKeydown);
    pane.addEventListener("click", onClick);
    const preview = $("[data-preview]");
    preview.addEventListener("touchstart", onTouchStart, { passive: true });
    preview.addEventListener("touchend", onTouchEnd, { passive: true });

    // ---------- teardown --------------------------------------------------------
    return function teardown() {
      alive = false;
      clearTimeout(saveTimer);
      clearTimeout(savedTimer);
      side.removeEventListener("input", onInput);
      side.removeEventListener("change", onChange);
      side.removeEventListener("keydown", onKeydown);
      pane.removeEventListener("click", onClick);
      preview.removeEventListener("touchstart", onTouchStart);
      preview.removeEventListener("touchend", onTouchEnd);
      objectUrls.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) {} });
    };
  }

  window.BeaconCV = { mount: mount };
})();
