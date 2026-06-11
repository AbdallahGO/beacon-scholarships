// Catalogue is loaded from scholarships.js (window.SCHOLARSHIPS), which is
// generated from ScholarShips_Data/*.clean.json by build_catalogue.ps1.
// Account features (saved hearts, search history, recommendations) come from
// BeaconAuth (auth.js) + BeaconMatch (match.js) — anonymous browsing works
// exactly as before without them.
const data = Array.isArray(window.SCHOLARSHIPS) ? window.SCHOLARSHIPS.slice() : [];
const dataLoaded = Array.isArray(window.SCHOLARSHIPS);

const fundLabel = { full: "Fully funded", partial: "Partial", varies: "Varies" };
const levelLabel = {
  highschool: "High school",
  bachelor: "Bachelor",
  master: "Master's",
  phd: "PhD",
  varies: "All levels",
};

// saved scholarships are keyed by catalogue id and synced with Supabase (FR-008)
const savedIds = new Set();
let matchOn = false; // signed-in user with a matchable profile (FR-019/020)

let state = { q: "", level: "all", fund: "all", country: "all", sort: "deadline" };

// re-run a search from account history: index.html?q=...#browse
const initialQ = new URLSearchParams(location.search).get("q");
if (initialQ) state.q = initialQ;

// escape user-facing text before injecting into innerHTML
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// ---- hero statistics + country dropdown (derived from data) ----
const countries = [...new Set(data.map((d) => d.country))].sort();
const csel = document.getElementById("countrySel");
countries.forEach((c) => {
  const o = document.createElement("option");
  o.value = c;
  o.textContent = c;
  csel.appendChild(o);
});

document.getElementById("stat-count").textContent = data.length;
const countriesStat = document.getElementById("stat-countries");
if (countriesStat) countriesStat.textContent = countries.length;
document.getElementById("resCount").textContent = data.length;

const pin = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
const clock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const heart = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3.98389 11.6106L9.11798 18.5107C10.5955 20.4964 13.4045 20.4964 14.882 18.5107L20.0161 11.6106C21.328 9.84746 21.328 7.34218 20.0161 5.57906C18.0957 2.9981 13.6571 3.76465 12 6.54855C10.3429 3.76465 5.90428 2.9981 3.9839 5.57906C2.67204 7.34218 2.67203 9.84746 3.98389 11.6106Z"/></svg>`;

function deadlineClass(d) {
  const txt = d.dtext || "Open";
  // rolling / always-open (no day count) reads as a friendly open state
  if (d.deadline_status === "rolling" || d.days == null) return ["d-open", clock, txt];
  if (d.days <= 10) return ["d-soon", clock, txt];
  if (d.days <= 40) return ["d-mid", clock, txt];
  return ["d-ok", clock, txt];
}

// text used for searching: includes friendly level labels as well as raw codes
function searchBlob(d) {
  const levelText = (d.levels || [])
    .map((l) => `${l} ${levelLabel[l] || ""}`)
    .join(" ");
  return `${d.title || ""} ${d.org || ""} ${d.country || ""} ${d.field || ""} ${levelText}`.toLowerCase();
}

function matchOf(d) {
  return matchOn && window.BeaconMatch ? window.BeaconMatch.compute(d) : { score: 0, badge: "none" };
}

function cardHtml(d, i, opts) {
  const [dcls, dico, dtxt] = deadlineClass(d);
  const id = String(d.id);
  const isOn = savedIds.has(id);
  const tags =
    (d.levels || []).map((l) => `<span class="tag">${esc(levelLabel[l] || l)}</span>`).join("") +
    (d.field ? `<span class="tag">${esc(d.field)}</span>` : "");
  const fundCls = fundLabel[d.fund] ? d.fund : "varies";
  const badge = opts && opts.noBadge ? "" : window.BeaconMatch ? window.BeaconMatch.badgeHtml(matchOf(d).badge) : "";
  const card = document.createElement("article");
  card.className = "card c" + (i % 4);
  // cap the entrance-animation stagger so it doesn't scale with list length
  card.style.animationDelay = Math.min(i, 12) * 45 + "ms";
  card.innerHTML = `
    <div class="card-media">
      ${d.image ? `<img class="thumb" src="${esc(d.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ``}
      <div class="card-top">
        <span class="flag">${d.flag || "🎓"}</span>
        <div class="top-right">
          <button class="save ${isOn ? "on" : ""}" data-id="${esc(id)}" title="Save to your list">${heart}</button>
          <span class="fund ${fundCls}">${fundLabel[d.fund] || "Varies"}</span>
        </div>
      </div>
    </div>
    <div class="card-body">
      <h3>${esc(d.title)}</h3>
      <div class="org">${esc(d.org)}</div>
      <div class="loc">${pin}${esc(d.country)}</div>
      <div class="tags">${tags}</div>
      ${badge}
      <div class="card-foot">
        <span class="deadline ${dcls}">${dico}${esc(dtxt)}</span>
        <a class="apply" href="scholarship.html?id=${encodeURIComponent(d.id)}">View details →</a>
      </div>
    </div>`;
  return card;
}

// ---- saving (FR-008/011): optimistic toggle, sign-in gate with action resume ----
async function toggleSave(btn) {
  const id = btn.dataset.id;
  const A = window.BeaconAuth;
  const user = A && A.getUser();
  if (!user) {
    if (A) A.requireAuth({ type: "save", id });
    return;
  }
  const wasOn = savedIds.has(id);
  // optimistic flip, rolled back on error
  setSavedUI(id, !wasOn);
  const q = wasOn
    ? A.client.from("saved_scholarships").delete().eq("user_id", user.id).eq("scholarship_id", id)
    : A.client.from("saved_scholarships").upsert({ user_id: user.id, scholarship_id: id });
  const { error } = await q;
  if (error) {
    console.error(error);
    setSavedUI(id, wasOn);
    A.toast("Couldn't update your saved list — please try again.");
  }
}

function setSavedUI(id, on) {
  if (on) savedIds.add(id); else savedIds.delete(id);
  document.querySelectorAll(`.save[data-id="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle("on", on));
}

function wireCardButtons(rootEl) {
  rootEl.querySelectorAll(".save").forEach((btn) => {
    btn.addEventListener("click", () => toggleSave(btn));
  });
}

function render() {
  let list = data.filter((d) => {
    if (state.level !== "all" && !(d.levels || []).includes(state.level)) return false;
    if (state.fund !== "all" && d.fund !== state.fund) return false;
    if (state.country !== "all" && d.country !== state.country) return false;
    if (state.q && !searchBlob(d).includes(state.q.toLowerCase())) return false;
    return true;
  });

  list.sort((a, b) => {
    if (state.sort === "az") return (a.title || "").localeCompare(b.title || "");
    if (state.sort === "match" && matchOn) {
      const diff = matchOf(b).score - matchOf(a).score;
      if (diff) return diff;
    }
    const av = a.days == null ? 9999 : a.days;
    const bv = b.days == null ? 9999 : b.days;
    return av - bv;
  });

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  document.getElementById("empty").classList.toggle("show", list.length === 0);
  document.getElementById("resCount").textContent = list.length;

  const frag = document.createDocumentFragment();
  list.forEach((d, i) => frag.appendChild(cardHtml(d, i)));
  grid.appendChild(frag);
  wireCardButtons(grid);
}

// ---- "Recommended for you" strip (FR-019/020, clarification Q2) ----
function renderReco() {
  const section = document.getElementById("recoSection");
  const grid = document.getElementById("recoGrid");
  if (!section || !grid) return;
  const A = window.BeaconAuth;
  const user = A && A.getUser();
  if (!user || !window.BeaconMatch) { section.hidden = true; return; }

  if (!window.BeaconMatch.matchable()) {
    section.hidden = false;
    grid.innerHTML = `
      <div class="reco-prompt">
        <b>See scholarships picked for you.</b>
        <span>Tell us your degree, nationality or languages and we'll highlight what fits.</span>
        <a class="apply-btn" href="account.html#profile">Complete your profile →</a>
      </div>`;
    return;
  }
  const recos = window.BeaconMatch.recommend(data, 6);
  if (!recos.length) { section.hidden = true; return; }
  section.hidden = false;
  grid.innerHTML = "";
  recos.forEach((d, i) => grid.appendChild(cardHtml(d, i)));
  wireCardButtons(grid);
}

// "Best match" sort appears only when matching is possible
function updateSortOptions() {
  const sel = document.getElementById("sortSel");
  const existing = sel.querySelector('option[value="match"]');
  if (matchOn && !existing) {
    const o = document.createElement("option");
    o.value = "match";
    o.textContent = "Best match";
    sel.appendChild(o);
  } else if (!matchOn && existing) {
    if (state.sort === "match") { state.sort = "deadline"; sel.value = "deadline"; }
    existing.remove();
  }
}

// chip handlers
function chipGroup(id, key) {
  document.getElementById(id).addEventListener("click", (e) => {
    if (!e.target.classList.contains("chip")) return;
    document.querySelectorAll("#" + id + " .chip").forEach((c) => c.classList.remove("active"));
    e.target.classList.add("active");
    state[key] = e.target.dataset[key];
    render();
    recordSearchSoon();
  });
}
chipGroup("levelChips", "level");
chipGroup("fundChips", "fund");

document.getElementById("countrySel").addEventListener("change", (e) => {
  state.country = e.target.value;
  render();
  recordSearchSoon();
});
document.getElementById("sortSel").addEventListener("change", (e) => {
  state.sort = e.target.value;
  render();
});
const searchInput = document.getElementById("search");
searchInput.addEventListener("input", (e) => {
  state.q = e.target.value;
  render();
  hideRecent();
  recordSearchSoon();
});
if (initialQ) searchInput.value = initialQ;

document.getElementById("clearBtn").addEventListener("click", () => {
  state = { q: "", level: "all", fund: "all", country: "all", sort: "deadline" };
  searchInput.value = "";
  document.getElementById("countrySel").value = "all";
  document.getElementById("sortSel").value = "deadline";
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  document.querySelector('[data-level="all"]').classList.add("active");
  document.querySelector('[data-fund="all"]').classList.add("active");
  render();
});

// ---- search history (FR-010): recorded for signed-in users, 1.5 s settle ----
let searchTimer = null;
let lastRecorded = "";
function recordSearchSoon() {
  const A = window.BeaconAuth;
  const user = A && A.getUser();
  if (!user || !A.client) return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = state.q.trim();
    if (!q || q === lastRecorded) return;
    lastRecorded = q;
    const filters = {};
    if (state.level !== "all") filters.level = state.level;
    if (state.fund !== "all") filters.fund = state.fund;
    if (state.country !== "all") filters.country = state.country;
    await A.client.from("search_history").insert({
      user_id: user.id,
      query: q,
      filters: Object.keys(filters).length ? filters : null,
    });
  }, 1500);
}

// recent searches dropdown: shown when the empty search box gains focus
let recentBox = null;
function hideRecent() { if (recentBox) recentBox.hidden = true; }
searchInput.addEventListener("focus", async () => {
  const A = window.BeaconAuth;
  const user = A && A.getUser();
  if (!user || !A.client || searchInput.value.trim()) return;
  const { data: rows, error } = await A.client
    .from("search_history")
    .select("query")
    .eq("user_id", user.id)
    .order("searched_at", { ascending: false })
    .limit(24);
  if (error || !rows || !rows.length) return;
  const distinct = [...new Set(rows.map((r) => r.query))].slice(0, 8);
  if (!recentBox) {
    recentBox = document.createElement("div");
    recentBox.className = "recent-box";
    searchInput.closest(".searchwrap").appendChild(recentBox);
  }
  recentBox.innerHTML =
    `<div class="recent-title">Recent searches</div>` +
    distinct.map((q) => `<button type="button" class="recent-item">${esc(q)}</button>`).join("");
  recentBox.hidden = false;
  recentBox.querySelectorAll(".recent-item").forEach((b) =>
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      searchInput.value = b.textContent;
      state.q = b.textContent;
      hideRecent();
      render();
      document.getElementById("browse").scrollIntoView();
    })
  );
});
searchInput.addEventListener("blur", () => setTimeout(hideRecent, 150));

// ---- account wiring: saved set + matching state follow the session ----
if (window.BeaconAuth) {
  window.BeaconAuth.onChange(async (user) => {
    savedIds.clear();
    matchOn = false;
    if (user && window.BeaconAuth.client) {
      const { data: rows } = await window.BeaconAuth.client
        .from("saved_scholarships")
        .select("scholarship_id")
        .eq("user_id", user.id);
      (rows || []).forEach((r) => savedIds.add(String(r.scholarship_id)));
      if (window.BeaconMatch) {
        await window.BeaconMatch.load();
        matchOn = window.BeaconMatch.matchable();
      }
    }
    updateSortOptions();
    render();
    renderReco();
  });
  // saves made elsewhere (pending-action replay, account page) update this page live
  document.addEventListener("beacon:saved-changed", (e) => {
    setSavedUI(String(e.detail.id), e.detail.saved);
  });
}

// graceful failure: if the generated catalogue is missing/empty, explain it
if (!dataLoaded || data.length === 0) {
  const empty = document.getElementById("empty");
  const h3 = empty.querySelector("h3");
  const p = empty.querySelector("p");
  if (!dataLoaded) {
    if (h3) h3.textContent = "We couldn't load the scholarships";
    if (p) p.textContent = "The catalogue data (scholarships.js) didn't load. Regenerate it by running ScholarShips_Data/build_catalogue.ps1, then refresh.";
  }
}

render();
