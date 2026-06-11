// Profile-based matching (specs/003-user-auth-profiles/contracts/ui-behavior.md).
// Rule-based and honest: heuristic text signals (match-index.js) never produce a
// hard "Not eligible" — unknown data stays neutral.
// Depends on BeaconAuth (auth.js); window.MATCH_INDEX is optional (generated file).
(function () {
  "use strict";

  const INDEX = window.MATCH_INDEX || {};
  const CACHE_KEY = "beacon.matchProfile";

  let state = null; // { profile, languages: [lowercased names], rev } | null when anonymous/unavailable

  function profileRev() {
    try { return localStorage.getItem("beacon.profileRev") || "0"; } catch (e) { return "0"; }
  }

  // Load (and cache) the signed-in user's matching inputs. Resolves null for
  // anonymous users or when the backend isn't reachable.
  async function load() {
    const A = window.BeaconAuth;
    const user = A && A.getUser();
    if (!user || !A.client) { state = null; return null; }

    const rev = profileRev();
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
      if (cached && cached.rev === rev && cached.uid === user.id) {
        state = cached;
        return state;
      }
    } catch (e) {}

    try {
      const [p, l] = await Promise.all([
        A.client.from("profiles").select("degree,nationality,country").eq("user_id", user.id).maybeSingle(),
        A.client.from("profile_languages").select("language").eq("user_id", user.id),
      ]);
      if (p.error || l.error) throw p.error || l.error;
      state = {
        uid: user.id,
        rev,
        profile: p.data || {},
        languages: (l.data || []).map((r) => String(r.language).toLowerCase()),
      };
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch (e) {}
      return state;
    } catch (e) {
      console.error(e);
      state = null;
      return null;
    }
  }

  // "matchable" = profile has at least one matching input (FR-020 gate)
  function matchable() {
    return !!(state && (state.profile.degree || state.profile.nationality || state.languages.length));
  }

  function natMatches(nationality, countryName) {
    const a = nationality.toLowerCase();
    const b = countryName.toLowerCase();
    return a.includes(b) || b.includes(a);
  }

  // Scoring per contract (ui-behavior.md): level ±3, nationality +2/-1/caution,
  // languages +1 each (cap +2), open deadline +1.
  function compute(d) {
    if (!state) return { score: 0, badge: "none" };
    let score = 0;
    let badge = "none";
    let caution = false;

    const levels = d.levels || [];
    const deg = state.profile.degree;
    if (deg && levels.includes(deg)) { score += 3; badge = "match"; }
    else if (!levels.length || levels.includes("varies")) { score += 1; }
    else if (deg) { score -= 3; caution = true; }

    const entry = INDEX[String(d.id)] || {};
    const nat = state.profile.nationality;
    if (nat) {
      const inc = (entry.nationality_signals && entry.nationality_signals.include) || [];
      const exc = (entry.nationality_signals && entry.nationality_signals.exclude) || [];
      if (exc.some((c) => natMatches(nat, c))) caution = true;
      else if (inc.some((c) => natMatches(nat, c))) { score += 2; if (badge === "none") badge = "match"; }
      else if (inc.length) score -= 1; // listed nationalities don't seem to include the user — rank lower, no hard flag
    }

    const sigs = (entry.language_signals || []).map((s) => String(s).toLowerCase());
    if (sigs.length && state.languages.length) {
      const hits = sigs.filter((s) => state.languages.some((ul) => ul.includes(s) || s.includes(ul)));
      score += Math.min(hits.length, 2);
    }

    if (d.deadline_status === "rolling" || d.days == null || d.days > 0) score += 1;

    if (caution) badge = "caution";
    else if (badge !== "match" && score >= 4) badge = "match";
    return { score, badge };
  }

  // Top recommendations: strong positive matches only (score >= 3, no caution).
  function recommend(list, n) {
    if (!matchable()) return [];
    return list
      .map((d) => ({ d, m: compute(d) }))
      .filter((x) => x.m.score >= 3 && x.m.badge !== "caution")
      .sort((a, b) => b.m.score - a.m.score || ((a.d.days == null ? 9999 : a.d.days) - (b.d.days == null ? 9999 : b.d.days)))
      .slice(0, n || 6)
      .map((x) => x.d);
  }

  // Copy for badges: caution is soft by design (heuristic data only).
  function badgeHtml(badge) {
    if (badge === "match") return `<span class="match-badge match">Matches your profile</span>`;
    if (badge === "caution") return `<span class="match-badge caution">May not be eligible — check details</span>`;
    return "";
  }

  window.BeaconMatch = { load, matchable, compute, recommend, badgeHtml };
})();
