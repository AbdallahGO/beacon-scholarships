// ticket.js — Book Ticket flow on the scholarship detail page (specs/004-ticket-booking, US1).
// Inserts #bookTicketArea between #detailBody and #applyArea (FR-003), plays the
// booking animation (FR-005), and starts Stripe Checkout via the ticket-checkout
// edge function. Server decides price/capacity; this is UI only.
// Load order (scholarship.html): scholarships.js, auth.js, ranking-index.js, scholarship.js, ticket.js.
(function () {
  "use strict";

  const A = window.BeaconAuth;
  const data = Array.isArray(window.SCHOLARSHIPS) ? window.SCHOLARSHIPS : [];
  const id = new URLSearchParams(location.search).get("id");
  const rec = id ? data.find((d) => String(d.id) === String(id)) : null;
  if (!rec) return;

  const applyArea = document.getElementById("applyArea");
  if (!applyArea || !applyArea.parentNode) return;

  const RI = (window.RANKING_INDEX && window.RANKING_INDEX[String(rec.id)]) || { tier: "out_of_rank", price: 15000 };
  const priceText = "$" + Math.round(RI.price / 100);
  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  // ---- multi-provider payments (feature 006) — bilingual EN/AR + RTL ----------
  const LANG_KEY = "beacon-lang";
  const getLang = () => {
    try { return localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en"; } catch (e) { return "en"; }
  };
  const PAYI18N = {
    en: {
      choose: "Choose how to pay",
      unavailable: "Payments are temporarily unavailable. Please try again later.",
      received: "Payment received — confirming your ticket ♥",
      notDone: "Payment not completed — you can try again.",
      inProgress: "You already have a payment in progress for this ticket.",
    },
    ar: {
      choose: "اختر طريقة الدفع",
      unavailable: "المدفوعات غير متاحة مؤقتًا. حاول مرة أخرى لاحقًا.",
      received: "تم استلام الدفع — جارٍ تأكيد تذكرتك ♥",
      notDone: "لم تكتمل العملية — يمكنك المحاولة مرة أخرى.",
      inProgress: "لديك عملية دفع قيد التنفيذ لهذه التذكرة بالفعل.",
    },
  };
  const payT = (k) => (PAYI18N[getLang()] || PAYI18N.en)[k];

  async function fetchProviders() {
    if (!A || !A.client) return [];
    try {
      const { data } = await A.client
        .from("payment_providers")
        .select("provider,display_name,currency,fx_rate,sort_order")
        .eq("enabled", true)
        .order("sort_order");
      return data || [];
    } catch (e) { return []; }
  }
  function providerPrice(p) {
    const cents = Math.round((RI.price || 15000) * (Number(p.fx_rate) || 1));
    return esc(p.currency) + " " + (cents / 100).toLocaleString(getLang() === "ar" ? "ar" : "en");
  }

  // area between #detailBody and #applyArea (FR-003)
  const area = document.createElement("section");
  area.id = "bookTicketArea";
  area.className = "ticket-cta";
  applyArea.parentNode.insertBefore(area, applyArea);

  let myTicket = null; // existing non-void ticket for THIS scholarship
  let busy = false;

  function paintBookable() {
    area.innerHTML =
      `<div class="tc-inner">
        <div class="tc-head">
          <span class="tc-emote" aria-hidden="true">🎫</span>
          <div class="tc-copy">
            <h2>Ready for your next step?</h2>
            <p>Book your ticket and our team gets to work — your CV, your essay, your documents, and your exam or interview prep, delivered within three days.</p>
          </div>
        </div>
        <p class="tc-terms">By booking, you agree to the <a href="/terms.html">Terms of Service</a>.</p>
        <button class="tc-btn" id="bookTicketBtn" type="button"><span class="tc-btn-label">Book your ticket — ${esc(priceText)}</span><span class="tc-btn-arrow" aria-hidden="true">→</span></button>
        <div class="tc-note">One-time payment for three days of preparation work. The price reflects how demanding this application is.</div>
      </div>`;
    const btn = area.querySelector("#bookTicketBtn");
    if (btn) btn.addEventListener("click", onBook);
  }

  function paintBooked() {
    area.innerHTML =
      `<div class="tc-inner tc-booked">
        <div class="tc-head">
          <span class="tc-emote" aria-hidden="true">✅</span>
          <div class="tc-copy"><h2>Your ticket is booked</h2><p>Our team is preparing your package — track its progress in your account.</p></div>
        </div>
        <a class="tc-btn tc-btn-ghost" href="account.html#ticket">View your ticket →</a>
      </div>`;
  }

  function paintAtCapacity() {
    area.innerHTML =
      `<div class="tc-inner tc-capacity">
        <div class="tc-head">
          <span class="tc-emote" aria-hidden="true">⏳</span>
          <div class="tc-copy"><h2>You already have a ticket in progress</h2><p>Wait for its three days of preparation to finish, or add ticket space to run another at the same time.</p></div>
        </div>
        <a class="tc-btn tc-btn-ghost" href="account.html#ticket">Manage tickets / add space →</a>
      </div>`;
  }

  function onBook() {
    if (busy || myTicket) return;
    const user = A && A.getUser && A.getUser();
    if (!user) {
      if (A && A.requireAuth) A.requireAuth({ type: "route", href: location.href.split("#")[0] + "#book" });
      return;
    }
    beginPayment(user);
  }

  // Provider-picker step (FR-020/027): list enabled providers; if one, go straight
  // to checkout; if several, let the user choose; if none, show unavailable.
  async function beginPayment(user) {
    if (busy || myTicket) return;
    busy = true;
    const providers = await fetchProviders();
    if (!providers.length) { busy = false; paintUnavailable(); return; }
    if (providers.length === 1) { playAnimation(() => startCheckout(user, providers[0].provider)); return; }
    busy = false;
    renderPicker(user, providers);
  }

  function paintUnavailable() {
    const ar = getLang() === "ar";
    area.innerHTML =
      `<div class="tc-inner"${ar ? ' dir="rtl"' : ""}>
        <div class="tc-head">
          <span class="tc-emote" aria-hidden="true">😶</span>
          <div class="tc-copy"><h2>${esc(payT("unavailable"))}</h2></div>
        </div>
      </div>`;
  }

  function renderPicker(user, providers) {
    const ar = getLang() === "ar";
    area.innerHTML =
      `<div class="tc-inner tc-picker"${ar ? ' dir="rtl"' : ""}>
        <div class="tc-head">
          <span class="tc-emote" aria-hidden="true">💳</span>
          <div class="tc-copy"><h2>${esc(payT("choose"))}</h2></div>
        </div>
        <div class="tc-prov-list">
          ${providers.map((p) =>
            `<button type="button" class="tc-btn tc-prov" data-provider="${esc(p.provider)}">
               <span class="tc-btn-label">${esc(p.display_name)} — ${providerPrice(p)}</span>
               <span class="tc-btn-arrow" aria-hidden="true">→</span>
             </button>`).join("")}
        </div>
      </div>`;
    area.querySelectorAll(".tc-prov").forEach((b) =>
      b.addEventListener("click", () => {
        if (busy) return;
        busy = true;
        const provider = b.dataset.provider;
        playAnimation(() => startCheckout(user, provider));
      }));
  }

  // Confetti burst (Claude Design): 26 particles spread radially, biased upward,
  // mixed brand colours/shapes. Each gets a randomised duration/delay so the burst
  // feels organic. Positions/animation read CSS custom props (see .ta-confetti / kConfetti).
  function buildConfetti() {
    const cols = ["var(--tang)", "#F2B33D", "#5FB07E", "#FFD9A8", "var(--tang-deep)", "#FFFFFF"];
    const N = 26;
    let html = "";
    for (let i = 0; i < N; i++) {
      const ang = (Math.PI * 2 * i) / N + (Math.random() - 0.5) * 0.5;
      const dist = 60 + Math.random() * 60;
      const dx = (Math.cos(ang) * dist).toFixed(1);
      const dy = (Math.sin(ang) * dist - 18).toFixed(1); // bias upward
      const rot = (Math.random() * 720 - 360).toFixed(0) + "deg";
      const dur = (0.85 + Math.random() * 0.45).toFixed(2);
      const delay = (1.5 + Math.random() * 0.12).toFixed(2);
      const col = cols[i % cols.length];
      const round = Math.random() > 0.5;
      const w = (5 + Math.random() * 5).toFixed(1);
      const h = round ? w : (8 + Math.random() * 6).toFixed(1);
      html +=
        `<i class="ta-confetti" style="--dx:${dx}px;--dy:${dy}px;--rot:${rot};` +
        `width:${w}px;height:${h}px;background:${col};border-radius:${round ? "50%" : "2px"};` +
        `animation:kConfetti ${dur}s cubic-bezier(.2,.6,.35,1) ${delay}s both"></i>`;
    }
    return html;
  }

  function playAnimation(done) {
    const inner = area.querySelector(".tc-inner");
    const btn = area.querySelector("#bookTicketBtn");
    if (btn) btn.disabled = true;
    const stage = document.createElement("div");
    stage.className = "tc-anim";
    const words = "Book your ticket".split(" ")
      .map((w, i) => `<span style="--i:${i}">${esc(w)}</span>`).join("");
    const confetti = reduceMotion ? "" : buildConfetti();
    // Scene: words lift away with motion-blur while the ticket arcs in (overshoot)
    // and tucks into the backpack, which rises with squash/stretch + a hop; the
    // laptop & book drop in; a soft glow + confetti burst; then "Are You Ready!"
    // springs in blur-to-sharp with a "Preparing checkout…" status. (Book Ticket Animation.dc.html)
    stage.innerHTML =
      `<div class="ta-scene" aria-hidden="true">
         <div class="ta-words">${words}</div>
         <div class="ta-glow"></div>
         ${confetti}
         <span class="ta-emoji ta-ticket">🎫</span>
         <span class="ta-emoji ta-laptop">💻</span>
         <span class="ta-emoji ta-book">📖</span>
         <span class="ta-emoji ta-bag">🎒</span>
       </div>
       <div class="ta-final">Are You Ready!</div>
       <div class="ta-sub" aria-hidden="true">Preparing checkout…</div>`;
    if (inner) inner.appendChild(stage);
    requestAnimationFrame(() => stage.classList.add(reduceMotion ? "instant" : "playing"));
    // Real checkout fires after the celebration peaks (~2s, per the upload's
    // "won't delay checkout" constraint); startCheckout's fetch+redirect latency
    // covers the final beat. Reduced-motion: short hold on the final text.
    setTimeout(done, reduceMotion ? 800 : 2000);
  }

  // Stripe keeps its dedicated endpoint name; the new providers follow the same
  // {provider}-checkout convention. All take { kind:'ticket', scholarship_id }.
  async function startCheckout(user, provider) {
    provider = provider || "stripe";
    const endpoint = provider === "stripe" ? "ticket-checkout" : provider + "-checkout";
    try {
      const sess = A.client && (await A.client.auth.getSession());
      const token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (!token) throw new Error("no session");
      const res = await fetch(window.FUNCTIONS_BASE + "/" + endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          kind: "ticket",
          scholarship_id: String(rec.id),
          scholarship_title: rec.title || "",
          institution: rec.org || "",
          country: rec.country || "", // scholarship's country → ticket reveal "Country"
          origin: location.href,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (res.status === 401) {
        busy = false;
        if (A.requireAuth) A.requireAuth({ type: "route", href: location.href.split("#")[0] + "#book" });
        return;
      }
      if (!res.ok) {
        busy = false;
        if (out.error === "profile_incomplete") {
          A.toast("Add your name to your profile first, then book your ticket.");
          setTimeout(() => { location.href = "account.html#profile"; }, 1300);
        } else if (out.error === "already_booked") {
          myTicket = {}; paintBooked();
        } else if (out.error === "already_in_progress") {
          A.toast(payT("inProgress")); paintBookable();
        } else if (out.error === "at_capacity") {
          paintAtCapacity();
        } else if (out.error === "provider_disabled") {
          A.toast(payT("unavailable")); paintBookable();
        } else {
          A.toast("Couldn't start checkout — please try again."); paintBookable();
        }
        return;
      }
      if (out.url) { location.href = out.url; return; }
      throw new Error("no checkout url");
    } catch (e) {
      console.error(e);
      busy = false;
      if (A && A.toast) A.toast("Couldn't start checkout — please try again.");
      paintBookable();
    }
  }

  function maybeAutoBook(user) {
    if (location.hash === "#book" && user && !myTicket) {
      history.replaceState(null, "", location.pathname + location.search);
      onBook();
    }
  }

  async function refresh(user) {
    if (!user || !A.client) { myTicket = null; paintBookable(); return; } // anonymous → CTA (click signs in)
    // pre-check (T026): mirror ticket-checkout's server rules so the UI explains
    // already-booked / at-capacity up front instead of only after a 409.
    const [{ data: rows }, { count: spaceCount }] = await Promise.all([
      A.client.from("tickets").select("scholarship_id,cooldown_end,status")
        .eq("user_id", user.id).neq("status", "void"),
      A.client.from("space_purchases").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    const list = rows || [];
    const mine = list.find((r) => String(r.scholarship_id) === String(rec.id));
    if (mine) { myTicket = mine; paintBooked(); return; } // one-per-scholarship (FR-014b)
    myTicket = null;
    const now = Date.now();
    const activeCount = list.filter((r) => new Date(r.cooldown_end).getTime() > now).length;
    const capacity = 1 + (spaceCount || 0);
    if (activeCount >= capacity) { paintAtCapacity(); return; } // concurrent capacity (SC-004)
    paintBookable();
    maybeAutoBook(user);
  }

  function handleReturn() {
    // Stripe success → #ticket-booked; the new providers redirect to #pay-return
    // (and #pay-cancel on abort). Booking is confirmed only when the webhook has
    // created the ticket — we poll our own tickets (payments is admin-read-only).
    if (location.hash === "#ticket-booked" || location.hash === "#pay-return") {
      if (A && A.toast) A.toast(payT("received"));
      history.replaceState(null, "", location.pathname + location.search);
      [2500, 6000, 10000].forEach((ms) => setTimeout(() => {
        const u = A && A.getUser && A.getUser();
        if (u) refresh(u);
      }, ms));
    } else if (location.hash === "#pay-cancel") {
      if (A && A.toast) A.toast(payT("notDone"));
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  // wire up
  if (!A || !A.onChange) { paintBookable(); }     // file:// / SDK missing → CTA (click shows guidance)
  else { A.onChange((user) => refresh(user)); }
  window.addEventListener("hashchange", () => {
    const u = A && A.getUser && A.getUser();
    if (u) maybeAutoBook(u);
  });
  handleReturn();
})();
