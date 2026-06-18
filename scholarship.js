// Detail page for a single scholarship (scholarship.html?id=<id>).
// Summary renders immediately from the generated catalogue (scholarships.js);
// full bilingual content loads on demand from details/<id>.js via script
// injection (works on file:// where fetch() of local JSON is blocked).

const data = Array.isArray(window.SCHOLARSHIPS) ? window.SCHOLARSHIPS : [];

const fundLabel = { full: "Fully funded", partial: "Partial", varies: "Varies" };
const levelLabel = {
  highschool: "High school",
  bachelor: "Bachelor",
  master: "Master's",
  phd: "PhD",
  varies: "All levels",
};

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// US7 / FR-027-028: light secondary sanitizer. The build scripts already scrub the
// brand out of the generated data; this is a render-time safety net that strips any
// residual visible "For9a" (English) or Arabic brand word "Forsa". Arabic is built
// from code points so this source stays ASCII-clean. Removes only the brand token
// (with any attached connector/article) plus any inline tag it leaves empty.
const BRAND_RE = (function () {
  const w = String.fromCharCode(0x0641, 0x0631, 0x0635, 0x0629); // Forsa (brand word)
  const on = String.fromCharCode(0x0639, 0x0644, 0x0649); // "on"
  const al = String.fromCharCode(0x0627, 0x0644); // "the" article
  const pre = String.fromCharCode(0x0648, 0x0641, 0x0628, 0x0643, 0x0644); // w f b k l
  return new RegExp(
    "(?:on|via|at|through|from|with)\\s+for9a|for9a|" +
      on + "\\s+" + w + "|[" + pre + "]*(?:" + al + ")?" + w,
    "gi"
  );
})();
function scrubBrand(s) {
  if (s == null) return s;
  return String(s)
    .replace(BRAND_RE, "")
    .replace(/<(strong|em|b|i|span|a)\b[^>]*>\s*<\/\1>/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const pin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
const clock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;

function deadlineClass(d) {
  const txt = d.dtext || "Open";
  if (d.deadline_status === "rolling" || d.days == null) return ["d-open", txt];
  if (d.days <= 10) return ["d-soon", txt];
  if (d.days <= 40) return ["d-mid", txt];
  return ["d-ok", txt];
}

// language preference (localStorage can throw on some file:// setups — degrade to default)
function getLangPref() {
  try { return localStorage.getItem("beacon-lang") || "en"; } catch (e) { return "en"; }
}
function setLangPref(lang) {
  try { localStorage.setItem("beacon-lang", lang); } catch (e) { /* default-only */ }
}

const params = new URLSearchParams(location.search);
const id = params.get("id");
const rec = id ? data.find((d) => String(d.id) === String(id)) : null;

const card = document.getElementById("detailCard");
const notFound = document.getElementById("notFound");

if (!rec) {
  notFound.classList.add("show");
} else {
  renderSummary(rec);
  card.style.display = "";
  loadDetail(String(rec.id));
}

function renderSummary(d) {
  document.title = `${d.title} — Beacon`;

  const media = document.getElementById("detailMedia");
  document.getElementById("detailFlag").textContent = d.flag || "🎓";
  if (d.image) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = d.image;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.onerror = () => img.remove();
    media.appendChild(img);
  }

  document.getElementById("detailTitle").textContent = d.title || "";
  document.getElementById("detailOrg").textContent = d.org || "";
  document.getElementById("detailLoc").innerHTML = `${pin}${esc(d.country || "")}`;

  const fundCls = fundLabel[d.fund] ? d.fund : "varies";
  const pills =
    `<span class="fund ${fundCls}">${fundLabel[d.fund] || "Varies"}</span>` +
    (d.levels || []).map((l) => `<span class="tag">${esc(levelLabel[l] || l)}</span>`).join("") +
    (d.field ? `<span class="tag">${esc(d.field)}</span>` : "");
  document.getElementById("detailPills").innerHTML = pills;

  const [dcls, dtxt] = deadlineClass(d);
  document.getElementById("detailDeadline").innerHTML = `${clock}${esc(dtxt)}`;
  document.getElementById("detailDeadline").classList.add(dcls);
}

// ---- on-demand detail content ----
let detail = null;
let currentLang = getLangPref();
let detailSettled = false;

window.__SCHOLARSHIP_DETAIL_CB = function (payload) {
  if (!payload || String(payload.id) !== String(id)) return;
  detailSettled = true;
  detail = payload;
  if (!detail[currentLang]) currentLang = detail.en ? "en" : "ar";
  setupLangToggle();
  renderSections();
  renderApplyArea();
};

function loadDetail(sid) {
  const s = document.createElement("script");
  s.src = "details/" + encodeURIComponent(sid) + ".js";
  s.onerror = () => detailUnavailable();
  document.body.appendChild(s);
  setTimeout(() => { if (!detailSettled) detailUnavailable(); }, 4000);
}

function detailUnavailable() {
  if (detailSettled) return;
  detailSettled = true;
  document.getElementById("detailBody").innerHTML =
    `<div class="detail-note">Full details aren't available for this one yet — the summary above is everything we have. New content is added all the time.</div>`;
  renderApplyArea();
}

function setupLangToggle() {
  const toggle = document.getElementById("langToggle");
  toggle.style.display = "";
  toggle.querySelectorAll("button").forEach((btn) => {
    const lang = btn.dataset.lang;
    if (!detail[lang]) {
      btn.disabled = true;
      btn.title = "Not available";
      btn.textContent += " (not available)";
    } else {
      btn.addEventListener("click", () => {
        if (currentLang === lang) return;
        currentLang = lang;
        setLangPref(lang);
        setActiveLangButton();
        renderSections();
      });
    }
  });
  setActiveLangButton();
}

function setActiveLangButton() {
  document.querySelectorAll("#langToggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === currentLang)
  );
}

function renderSections() {
  const body = document.getElementById("detailBody");
  const content = detail[currentLang];
  if (!content) return;

  // heading follows the selected language (falls back to the catalogue title)
  const h1 = document.getElementById("detailTitle");
  h1.textContent = scrubBrand(content.title || rec.title || "");
  if (currentLang === "ar") { h1.setAttribute("dir", "rtl"); h1.setAttribute("lang", "ar"); }
  else { h1.removeAttribute("dir"); h1.removeAttribute("lang"); }

  if (currentLang === "ar") {
    body.setAttribute("dir", "rtl");
    body.setAttribute("lang", "ar");
  } else {
    body.removeAttribute("dir");
    body.removeAttribute("lang");
  }

  // bodies are sanitized at build time (build_details.ps1): no scripts,
  // no event handlers, no for9a links — safe to render as HTML
  body.innerHTML = (content.sections || [])
    .filter((s) => s && s.body && s.body.trim())
    .map((s) => {
      const header = scrubBrand(s.header || "");
      return (
        `<section class="detail-section">` +
        (header.trim() ? `<h2>${esc(header)}</h2>` : "") +
        scrubBrand(s.body) +
        `</section>`
      );
    })
    .join("");
}

function renderApplyArea() {
  const area = document.getElementById("applyArea");
  // FR-004/004a: applications are NOT handled on Beacon and there is no outbound
  // apply link — booking a ticket (the Book Ticket area above, injected by
  // ticket.js) is the user's single path forward. Keep guidance + about-org only.
  let html =
    `<div class="apply-box">` +
    `<div class="apply-text"><b>How to move forward:</b> Applications for this scholarship aren't submitted on Beacon. ` +
    `Book your ticket above to take the first step toward your exam and interview with <b>${esc(rec.org)}</b>.</div>` +
    `</div>`;

  if (detail && detail.org_about) {
    html +=
      `<div class="about-org"><h2>About ${esc(scrubBrand(rec.org))}</h2><p>${esc(scrubBrand(detail.org_about))}</p></div>`;
  }

  area.innerHTML = html;
}

// ---- account features (specs/003-user-auth-profiles): save, history, match badge ----
(function () {
  if (!window.BeaconAuth || !rec) return;
  const A = window.BeaconAuth;
  const saveBtn = document.getElementById("detailSave");
  const id = String(rec.id);
  let isSaved = false;
  let viewRecorded = false;

  function paintSave() {
    if (!saveBtn) return;
    saveBtn.hidden = false;
    saveBtn.classList.toggle("on", isSaved);
    saveBtn.title = isSaved ? "Remove from your list" : "Save to your list";
  }

  if (saveBtn) {
    paintSave();
    saveBtn.addEventListener("click", async () => {
      const user = A.getUser();
      if (!user) { A.requireAuth({ type: "save", id }); return; }
      const was = isSaved;
      isSaved = !was; // optimistic, rolled back on error
      paintSave();
      const q = was
        ? A.client.from("saved_scholarships").delete().eq("user_id", user.id).eq("scholarship_id", id)
        : A.client.from("saved_scholarships").upsert({ user_id: user.id, scholarship_id: id });
      const { error } = await q;
      if (error) {
        console.error(error);
        isSaved = was;
        paintSave();
        A.toast("Couldn't update your saved list — please try again.");
      }
    });
  }

  // saves replayed after sign-in (pending action) update this button live
  document.addEventListener("beacon:saved-changed", (e) => {
    if (String(e.detail.id) === id) { isSaved = e.detail.saved; paintSave(); }
  });

  // record one view per visit, deduped server-side data stays simple:
  // skip if this same scholarship was recorded in the last 30 minutes (FR-009)
  async function recordView(user) {
    if (viewRecorded) return;
    viewRecorded = true;
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recent } = await A.client
      .from("view_history")
      .select("id")
      .eq("user_id", user.id)
      .eq("scholarship_id", id)
      .gte("viewed_at", since)
      .limit(1);
    if (recent && recent.length) return;
    await A.client.from("view_history").insert({ user_id: user.id, scholarship_id: id });
  }

  async function refreshAccountUI(user) {
    if (!user || !A.client) { isSaved = false; paintSave(); return; }
    const { data: rows } = await A.client
      .from("saved_scholarships")
      .select("scholarship_id")
      .eq("user_id", user.id)
      .eq("scholarship_id", id)
      .limit(1);
    isSaved = !!(rows && rows.length);
    paintSave();
    recordView(user);

    // match badge next to the title (neutral when unknown — FR-019)
    if (window.BeaconMatch) {
      await window.BeaconMatch.load();
      const slot = document.getElementById("detailMatch");
      if (slot && window.BeaconMatch.matchable()) {
        const html = window.BeaconMatch.badgeHtml(window.BeaconMatch.compute(rec).badge);
        slot.outerHTML = html || `<span id="detailMatch" hidden></span>`;
      }
    }
  }

  A.onChange((user) => { refreshAccountUI(user); });
})();
