// Account page: Profile | Saved | History | Settings (specs/003-user-auth-profiles).
// Depends on BeaconAuth (auth.js) and the static catalogue (scholarships.js).
(function () {
  "use strict";

  const A = window.BeaconAuth;
  const db = A.client;
  const catalogue = Array.isArray(window.SCHOLARSHIPS) ? window.SCHOLARSHIPS : [];
  const byId = new Map(catalogue.map((d) => [String(d.id), d]));

  const BUCKET = "user-files";
  const PHOTO_MAX = 5 * 1024 * 1024;
  const DOC_MAX = 10 * 1024 * 1024;
  const PHOTO_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  const DOC_TYPES = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
  const DRAFT_KEY = "beacon.profileDraft";

  const CEFR = [
    ["A1", "A1 – Beginner"], ["A2", "A2 – Elementary"], ["B1", "B1 – Intermediate"],
    ["B2", "B2 – Upper Intermediate"], ["C1", "C1 – Advanced"], ["C2", "C2 – Proficient"],
    ["native", "Native"],
  ];
  const cefrLabel = Object.fromEntries(CEFR);
  const DEGREES = [
    ["", "— choose —"], ["highschool", "High school"], ["bachelor", "Bachelor"],
    ["master", "Master's"], ["phd", "PhD"],
  ];
  const PROVIDER_NAMES = { email: "Email & password", google: "Google", facebook: "Facebook", linkedin_oidc: "LinkedIn", x: "X", twitter: "X" };
  const CONNECTABLE = ["google", "facebook", "linkedin_oidc", "x"];

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  const fmtDate = (s) => { try { return new Date(s).toLocaleDateString(); } catch (e) { return ""; } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
  const bumpProfileRev = () => { try { localStorage.setItem("beacon.profileRev", String(Date.now())); } catch (e) {} };

  const gate = document.getElementById("acctGate");
  const resetBox = document.getElementById("acctReset");
  const acct = document.getElementById("acct");

  let user = null;
  let profile = null; // cached profiles row
  let recovering = false;

  // ---- password recovery (contract F2) --------------------------------------
  if (db) {
    db.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        gate.hidden = true; acct.hidden = true; resetBox.hidden = false;
      }
    });
  }
  document.getElementById("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = e.target.password.value;
    if (pw.length < 8) { A.toast("Password needs at least 8 characters."); return; }
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) { A.toast("Couldn't save that password — please try again."); return; }
    recovering = false;
    resetBox.hidden = true;
    A.toast("Password updated ✓");
    location.hash = "#profile";
    render();
  });

  document.getElementById("gateSignIn").addEventListener("click", () =>
    A.requireAuth({ type: "route", href: "account.html" + (location.hash || "#profile") })
  );

  // ---- router -----------------------------------------------------------------
  const TABS = ["profile", "saved", "history", "settings"];
  function activeTab() {
    const h = (location.hash || "#profile").slice(1);
    return TABS.includes(h) ? h : h === "reset" ? "reset" : "profile";
  }

  window.addEventListener("hashchange", render);
  A.onChange((u) => { user = u; render(); });

  function render() {
    if (recovering || activeTab() === "reset") {
      gate.hidden = true; acct.hidden = true; resetBox.hidden = false; return;
    }
    resetBox.hidden = true;
    if (!user) { gate.hidden = false; acct.hidden = true; return; }
    gate.hidden = true; acct.hidden = false;

    const tab = activeTab();
    document.querySelectorAll("#acctTabs a").forEach((a) =>
      a.classList.toggle("active", a.dataset.tab === tab)
    );
    TABS.forEach((t) => { document.getElementById("pane-" + t).hidden = t !== tab; });
    ({ profile: renderProfile, saved: renderSaved, history: renderHistory, settings: renderSettings })[tab]();
  }

  // ============================ PROFILE (FR-012..018) ============================
  async function loadProfile() {
    const { data, error } = await db.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    profile = data; // null until first save (lazy create)
    return data;
  }

  async function renderProfile() {
    const pane = document.getElementById("pane-profile");
    pane.innerHTML = `<div class="acct-loading">Loading your profile…</div>`;
    let langs = [];
    try {
      await loadProfile();
      const r = await db.from("profile_languages").select("*").eq("user_id", user.id).order("created_at");
      if (r.error) throw r.error;
      langs = r.data || [];
    } catch (e) {
      console.error(e);
      pane.innerHTML = `<div class="acct-loading">We couldn't load your profile — please refresh. (If this keeps happening, the database may not be set up yet.)</div>`;
      return;
    }

    const meta = user.user_metadata || {};
    const p = profile || {};
    const countries = [...new Set(catalogue.map((d) => d.country))].sort();
    const val = (k, fallback) => esc(p[k] != null ? p[k] : (fallback || ""));

    pane.innerHTML = `
      <form id="profileForm" class="acct-form" novalidate>
        <div class="acct-grid">
          <label>Full name *
            <input name="full_name" required value="${val("full_name", meta.full_name || meta.name)}" placeholder="Your full name" />
          </label>
          <label>Phone
            <input name="phone" value="${val("phone")}" placeholder="+20 100 000 0000" />
          </label>
          <label>Address
            <input name="address" value="${val("address")}" placeholder="Street address" />
          </label>
          <label>City
            <input name="city" value="${val("city")}" placeholder="City" />
          </label>
          <label>Country of residence
            <input name="country" list="countryList" value="${val("country")}" placeholder="Where you live" />
          </label>
          <label>Nationality
            <input name="nationality" list="countryList" value="${val("nationality")}" placeholder="Your nationality" />
          </label>
          <label>Highest degree
            <select name="degree">
              ${DEGREES.map(([v, l]) => `<option value="${v}" ${p.degree === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </label>
        </div>
        <datalist id="countryList">${countries.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
        <div class="acct-actions">
          <button class="apply-btn" type="submit">Save profile</button>
          <span class="acct-hint">Only your name is required — save any time, complete it whenever you like.</span>
        </div>
      </form>

      <div class="acct-block">
        <h2>Profile photo</h2>
        <div class="photo-row">
          <span class="photo-preview" id="photoPreview"></span>
          <label class="upload-btn">Upload photo
            <input type="file" id="photoInput" accept="image/jpeg,image/png,image/webp" hidden />
          </label>
          <span class="acct-hint">JPG, PNG or WebP — up to 5 MB.</span>
        </div>
      </div>

      <div class="acct-block">
        <h2>Degree & qualification certificates</h2>
        <ul class="file-list" id="certList"><li class="acct-loading">Loading…</li></ul>
        <label class="upload-btn">Upload certificate
          <input type="file" id="certInput" accept="application/pdf,image/jpeg,image/png" hidden />
        </label>
        <span class="acct-hint">PDF, JPG or PNG — up to 10 MB.</span>
      </div>

      <div class="acct-block">
        <h2>Languages</h2>
        <ul class="lang-list" id="langList"></ul>
        <form id="langForm" class="lang-add" novalidate>
          <input name="language" required placeholder="Language (e.g. English)" />
          <select name="cefr_level">
            ${CEFR.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
          </select>
          <label class="upload-btn small">Certificate (optional)
            <input type="file" name="cert" accept="application/pdf,image/jpeg,image/png" hidden />
          </label>
          <span class="lang-file-name" id="langFileName"></span>
          <button class="apply-btn" type="submit">Add language</button>
        </form>
      </div>`;

    // -- draft preservation: a mid-edit session expiry never loses input (spec edge case)
    const form = document.getElementById("profileForm");
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || "null");
      if (draft) {
        Object.entries(draft).forEach(([k, v]) => { if (form[k] != null) form[k].value = v; });
        A.toast("We restored what you were typing earlier.");
      }
    } catch (e) {}
    form.addEventListener("input", () => {
      const d = {};
      ["full_name", "phone", "address", "city", "country", "nationality", "degree"].forEach((k) => (d[k] = form[k].value));
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const row = { user_id: user.id };
      ["full_name", "phone", "address", "city", "country", "nationality", "degree"].forEach((k) => {
        row[k] = form[k].value.trim() || null;
      });
      if (!row.full_name) { A.toast("Please add your name — it's the only required field."); return; }
      if (row.phone && !/^[+0-9][0-9 ()-]{6,19}$/.test(row.phone)) {
        A.toast("That phone number doesn't look right — digits, spaces and + only."); return;
      }
      const { error } = await db.from("profiles").upsert(row);
      if (error) { console.error(error); A.toast("Couldn't save your profile — please try again."); return; }
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (err) {}
      profile = Object.assign(profile || {}, row);
      bumpProfileRev();
      A.toast("Profile saved ✓");
    });

    renderPhoto(p.photo_path, meta);
    document.getElementById("photoInput").addEventListener("change", onPhotoUpload);
    renderCertList();
    document.getElementById("certInput").addEventListener("change", onCertUpload);
    renderLangList(langs);

    const langForm = document.getElementById("langForm");
    langForm.cert.addEventListener("change", () => {
      document.getElementById("langFileName").textContent = langForm.cert.files[0] ? langForm.cert.files[0].name : "";
    });
    langForm.addEventListener("submit", onLangAdd);
  }

  function validateFile(file, types, max, what) {
    if (!file) return null;
    if (!types[file.type]) {
      A.toast(`That file type isn't supported for ${what}. Allowed: ${Object.values(types).map((t) => t.toUpperCase()).join(", ")}.`);
      return null;
    }
    if (file.size > max) {
      A.toast(`That file is too big for ${what} — the limit is ${Math.round(max / 1048576)} MB.`);
      return null;
    }
    return file;
  }

  // -- photo (FR-014)
  async function renderPhoto(path, meta) {
    const box = document.getElementById("photoPreview");
    if (!box) return;
    let url = null;
    if (path) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      url = data && data.signedUrl;
      if (url) { try { localStorage.setItem("beacon.avatarUrl", url); } catch (e) {} }
    } else if (meta && (meta.avatar_url || meta.picture)) {
      url = meta.avatar_url || meta.picture;
    }
    box.innerHTML = url
      ? `<img src="${esc(url)}" alt="Profile photo" referrerpolicy="no-referrer">`
      : `<span class="photo-empty">🙂</span>`;
  }

  async function onPhotoUpload(e) {
    const file = validateFile(e.target.files[0], PHOTO_TYPES, PHOTO_MAX, "photos");
    e.target.value = "";
    if (!file) return;
    const path = `${user.id}/photo/photo.${PHOTO_TYPES[file.type]}`;
    const up = await db.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (up.error) { console.error(up.error); A.toast("Upload didn't work — please try again."); return; }
    const { error } = await db.from("profiles").upsert({ user_id: user.id, photo_path: path });
    if (error) { console.error(error); A.toast("Upload saved but the profile didn't update — try again."); return; }
    profile = Object.assign(profile || {}, { photo_path: path });
    await renderPhoto(path, null);
    bumpProfileRev();
    A.toast("Photo updated ✓ (it may take a moment to show in the menu)");
  }

  // -- degree certificates (FR-015)
  async function renderCertList() {
    const ul = document.getElementById("certList");
    if (!ul) return;
    const { data, error } = await db.from("certificates").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) { ul.innerHTML = `<li class="acct-loading">Couldn't load certificates.</li>`; return; }
    if (!data.length) { ul.innerHTML = `<li class="file-empty">No certificates uploaded yet.</li>`; return; }
    ul.innerHTML = data.map((c) => `
      <li data-id="${c.id}" data-path="${esc(c.file_path)}">
        <span class="file-name">${esc(c.file_name)}</span>
        <span class="file-date">${fmtDate(c.created_at)}</span>
        <button type="button" class="file-view">View</button>
        <button type="button" class="file-remove">Remove</button>
      </li>`).join("");
    ul.querySelectorAll(".file-view").forEach((b) =>
      b.addEventListener("click", async () => {
        const path = b.closest("li").dataset.path;
        const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
        if (s && s.signedUrl) window.open(s.signedUrl, "_blank", "noopener");
      })
    );
    ul.querySelectorAll(".file-remove").forEach((b) =>
      b.addEventListener("click", async () => {
        const li = b.closest("li");
        if (!confirm("Remove this certificate? The file will be deleted.")) return;
        await db.storage.from(BUCKET).remove([li.dataset.path]);
        await db.from("certificates").delete().eq("id", li.dataset.id);
        renderCertList();
      })
    );
  }

  async function onCertUpload(e) {
    const file = validateFile(e.target.files[0], DOC_TYPES, DOC_MAX, "certificates");
    e.target.value = "";
    if (!file) return;
    const path = `${user.id}/certificates/${uuid()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { console.error(up.error); A.toast("Upload didn't work — please try again."); return; }
    const { error } = await db.from("certificates").insert({
      user_id: user.id, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size,
    });
    if (error) { console.error(error); A.toast("Upload saved but couldn't be recorded — try again."); return; }
    A.toast("Certificate uploaded ✓");
    renderCertList();
  }

  // -- languages (FR-016)
  function renderLangList(langs) {
    const ul = document.getElementById("langList");
    if (!ul) return;
    if (!langs.length) { ul.innerHTML = `<li class="file-empty">No languages added yet.</li>`; return; }
    ul.innerHTML = langs.map((l) => `
      <li data-id="${l.id}" data-path="${esc(l.certificate_path || "")}">
        <span class="file-name">${esc(l.language)}</span>
        <span class="lang-level">${esc(cefrLabel[l.cefr_level] || l.cefr_level)}</span>
        ${l.certificate_path ? `<button type="button" class="file-view">Certificate</button>` : ""}
        <button type="button" class="file-remove">Remove</button>
      </li>`).join("");
    ul.querySelectorAll(".file-view").forEach((b) =>
      b.addEventListener("click", async () => {
        const path = b.closest("li").dataset.path;
        const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
        if (s && s.signedUrl) window.open(s.signedUrl, "_blank", "noopener");
      })
    );
    ul.querySelectorAll(".file-remove").forEach((b) =>
      b.addEventListener("click", async () => {
        const li = b.closest("li");
        if (li.dataset.path) await db.storage.from(BUCKET).remove([li.dataset.path]);
        await db.from("profile_languages").delete().eq("id", li.dataset.id);
        bumpProfileRev();
        refreshLangs();
      })
    );
  }

  async function refreshLangs() {
    const { data } = await db.from("profile_languages").select("*").eq("user_id", user.id).order("created_at");
    renderLangList(data || []);
  }

  async function onLangAdd(e) {
    e.preventDefault();
    const f = e.target;
    const language = f.language.value.trim();
    if (!language) { A.toast("Which language? Type its name first."); return; }
    let certPath = null;
    const file = f.cert.files[0] ? validateFile(f.cert.files[0], DOC_TYPES, DOC_MAX, "certificates") : null;
    if (f.cert.files[0] && !file) return; // invalid file already toasted
    if (file) {
      certPath = `${user.id}/certificates/lang-${uuid()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const up = await db.storage.from(BUCKET).upload(certPath, file, { contentType: file.type });
      if (up.error) { console.error(up.error); A.toast("Certificate upload didn't work — please try again."); return; }
    }
    const { error } = await db.from("profile_languages").insert({
      user_id: user.id, language, cefr_level: f.cefr_level.value, certificate_path: certPath,
    });
    if (error) {
      console.error(error);
      A.toast(/duplicate|unique/i.test(error.message || "") ? "You already added that language." : "Couldn't add the language — try again.");
      return;
    }
    f.reset();
    document.getElementById("langFileName").textContent = "";
    bumpProfileRev();
    A.toast("Language added ✓");
    refreshLangs();
  }

  // ============================ SAVED (FR-008) ====================================
  async function renderSaved() {
    const pane = document.getElementById("pane-saved");
    pane.innerHTML = `<div class="acct-loading">Loading your saved list…</div>`;
    const { data, error } = await db.from("saved_scholarships").select("*").eq("user_id", user.id).order("saved_at", { ascending: false });
    if (error) { pane.innerHTML = `<div class="acct-loading">Couldn't load your saved list — please refresh.</div>`; return; }
    if (!data.length) {
      pane.innerHTML = `<div class="acct-empty"><div class="big">🌱</div><h3>Nothing saved yet</h3>
        <p>Tap the heart on any scholarship to keep it here.</p>
        <a class="apply-btn" href="index.html#browse">Browse scholarships</a></div>`;
      return;
    }
    pane.innerHTML = `<ul class="saved-list">` + data.map((row) => {
      const d = byId.get(String(row.scholarship_id));
      if (!d) return `<li class="saved-item gone" data-id="${esc(row.scholarship_id)}">
          <span class="file-name">This scholarship is no longer listed.</span>
          <button type="button" class="file-remove">Remove</button></li>`;
      return `<li class="saved-item" data-id="${esc(String(d.id))}">
          <span class="flag">${d.flag || "🎓"}</span>
          <a class="saved-info" href="scholarship.html?id=${encodeURIComponent(d.id)}">
            <b>${esc(d.title)}</b><span>${esc(d.org)} — ${esc(d.country)}</span>
          </a>
          <span class="file-date">saved ${fmtDate(row.saved_at)}</span>
          <button type="button" class="file-remove">Unsave</button>
        </li>`;
    }).join("") + `</ul>`;
    pane.querySelectorAll(".file-remove").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.closest("li").dataset.id;
        await db.from("saved_scholarships").delete().eq("user_id", user.id).eq("scholarship_id", id);
        document.dispatchEvent(new CustomEvent("beacon:saved-changed", { detail: { id, saved: false } }));
        renderSaved();
      })
    );
  }

  // ============================ HISTORY (FR-009/010) ==============================
  async function renderHistory() {
    const pane = document.getElementById("pane-history");
    pane.innerHTML = `<div class="acct-loading">Loading your history…</div>`;
    const [views, searches] = await Promise.all([
      db.from("view_history").select("*").eq("user_id", user.id).order("viewed_at", { ascending: false }).limit(50),
      db.from("search_history").select("*").eq("user_id", user.id).order("searched_at", { ascending: false }).limit(50),
    ]);
    if (views.error || searches.error) {
      pane.innerHTML = `<div class="acct-loading">Couldn't load your history — please refresh.</div>`;
      return;
    }
    const vhtml = (views.data || []).map((v) => {
      const d = byId.get(String(v.scholarship_id));
      const title = d ? d.title : "A scholarship that's no longer listed";
      const link = d ? `scholarship.html?id=${encodeURIComponent(d.id)}` : null;
      return `<li>${link ? `<a href="${link}">${esc(title)}</a>` : esc(title)}<span class="file-date">${fmtDate(v.viewed_at)}</span></li>`;
    }).join("");
    const shtml = (searches.data || []).map((s) => {
      const q = encodeURIComponent(s.query);
      return `<li><a href="index.html?q=${q}#browse">“${esc(s.query)}”</a><span class="file-date">${fmtDate(s.searched_at)}</span></li>`;
    }).join("");
    pane.innerHTML = `
      <div class="acct-block">
        <div class="block-head"><h2>Viewed scholarships</h2>
          <button type="button" class="clear" id="clearViews" ${views.data.length ? "" : "disabled"}>Clear</button></div>
        <ul class="hist-list">${vhtml || `<li class="file-empty">Nothing viewed yet.</li>`}</ul>
      </div>
      <div class="acct-block">
        <div class="block-head"><h2>Recent searches</h2>
          <button type="button" class="clear" id="clearSearches" ${searches.data.length ? "" : "disabled"}>Clear</button></div>
        <ul class="hist-list">${shtml || `<li class="file-empty">No searches recorded yet.</li>`}</ul>
      </div>`;
    document.getElementById("clearViews").addEventListener("click", async () => {
      if (!confirm("Clear your whole viewing history?")) return;
      await db.from("view_history").delete().eq("user_id", user.id);
      renderHistory();
    });
    document.getElementById("clearSearches").addEventListener("click", async () => {
      if (!confirm("Clear your search history?")) return;
      await db.from("search_history").delete().eq("user_id", user.id);
      renderHistory();
    });
  }

  // ============================ SETTINGS (FR-003a/023) ============================
  async function renderSettings() {
    const pane = document.getElementById("pane-settings");
    pane.innerHTML = `<div class="acct-loading">Loading settings…</div>`;
    let identities = [];
    try {
      const r = await db.auth.getUserIdentities();
      identities = (r.data && r.data.identities) || [];
    } catch (e) { console.error(e); }
    const linked = new Set(identities.map((i) => (i.provider === "twitter" ? "x" : i.provider)));
    const verified = !!user.email_confirmed_at;
    const hasEmailIdentity = linked.has("email");

    pane.innerHTML = `
      <div class="acct-block">
        <h2>Email</h2>
        <p class="settings-email">${esc(user.email || "No email yet")}
          <span class="verify-pill ${verified ? "ok" : "warn"}">${verified ? "Verified ✓" : "Not verified"}</span>
          ${!verified && user.email ? `<button type="button" class="clear" id="resendVerify">Resend link</button>` : ""}
        </p>
      </div>
      <div class="acct-block">
        <h2>Linked sign-in methods</h2>
        <ul class="provider-list">
          ${[...linked].map((p) => `<li class="provider-chip on">${esc(PROVIDER_NAMES[p] || p)} ✓</li>`).join("")}
        </ul>
        <div class="provider-connect">
          ${CONNECTABLE.filter((p) => !linked.has(p)).map((p) =>
            `<button type="button" class="provider-link" data-provider="${p}">Connect ${PROVIDER_NAMES[p]}</button>`
          ).join("") || `<span class="acct-hint">All providers connected.</span>`}
        </div>
      </div>
      ${hasEmailIdentity ? `
      <div class="acct-block">
        <h2>Change password</h2>
        <form id="pwForm" class="acct-form inline" novalidate>
          <input type="password" name="password" autocomplete="new-password" minlength="8" required placeholder="New password (8+ characters)" />
          <button class="apply-btn" type="submit">Update password</button>
        </form>
      </div>` : ""}
      <div class="acct-block danger">
        <h2>Delete account</h2>
        <p class="acct-hint">Removes your profile, saved list, history and every uploaded file. This cannot be undone.</p>
        <button type="button" class="danger-btn" id="deleteAccount">Delete my account</button>
      </div>`;

    const resend = document.getElementById("resendVerify");
    if (resend) resend.addEventListener("click", async () => {
      const { error } = await db.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } });
      A.toast(error ? "Couldn't send the link — try again shortly." : "Verification link sent — check your inbox.");
    });

    pane.querySelectorAll(".provider-link").forEach((b) =>
      b.addEventListener("click", async () => {
        try {
          const { error } = await db.auth.linkIdentity({
            provider: b.dataset.provider,
            options: { redirectTo: location.origin + location.pathname + "#settings" },
          });
          if (error) throw error;
        } catch (err) {
          console.error(err);
          A.toast("Couldn't start connecting that account — make sure manual linking is enabled, then try again.");
        }
      })
    );

    const pwForm = document.getElementById("pwForm");
    if (pwForm) pwForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = pwForm.password.value;
      if (pw.length < 8) { A.toast("Password needs at least 8 characters."); return; }
      const { error } = await db.auth.updateUser({ password: pw });
      A.toast(error ? "Couldn't update the password — try again." : "Password updated ✓");
      if (!error) pwForm.reset();
    });

    document.getElementById("deleteAccount").addEventListener("click", deleteAccount);
  }

  // contract F9: delete owned rows + files, then the delete_account Edge Function
  // removes the auth user (service role key lives only server-side).
  async function deleteAccount() {
    if (!confirm("Delete your account and everything in it? This cannot be undone.")) return;
    if (!confirm("Last check — really delete your account?")) return;
    try {
      // storage: list and remove all owned objects
      for (const folder of ["photo", "certificates"]) {
        const { data: files } = await db.storage.from(BUCKET).list(`${user.id}/${folder}`, { limit: 1000 });
        if (files && files.length) {
          await db.storage.from(BUCKET).remove(files.map((f) => `${user.id}/${folder}/${f.name}`));
        }
      }
      // rows (auth-user cascade would cover these, but we clean up regardless)
      for (const t of ["profile_languages", "certificates", "saved_scholarships", "view_history", "search_history", "profiles"]) {
        await db.from(t).delete().eq("user_id", user.id);
      }
      // final step: remove the auth user itself
      const { error } = await db.functions.invoke("delete_account");
      if (error) {
        console.error(error);
        A.toast("Your data was removed, but the final account deletion couldn't complete — please contact support.");
      } else {
        A.toast("Your account has been deleted. Take care 👋");
      }
    } catch (e) {
      console.error(e);
      A.toast("Something went wrong during deletion — please try again.");
    } finally {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      await A.signOut();
      location.href = "index.html";
    }
  }
})();
