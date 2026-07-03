// admin.js — Beacon admin dashboard (specs/006-admin-dashboard).
// English-only, LTR. Reuses BeaconAuth (session) + the site theme tokens.
// Load order (admin.html): supabase-js CDN → supabase-config.js → auth.js → inbox.js → admin.js.
//
// The client gate (admins membership) is convenience only — the real boundary is
// server-side: every read is RLS-guarded and every write is a SECURITY DEFINER
// RPC that self-guards on public.admins. A non-admin who bypasses this UI still
// gets `not authorized` / empty from the server.
(function () {
  "use strict";

  const A = window.BeaconAuth;
  const root = document.getElementById("adminRoot");
  if (!root) return;

  // Degrade gracefully on file:// / missing SDK (auth.js already shows guidance).
  if (!A || !A.client) {
    root.innerHTML = notAuthorizedCard({ signedOut: true, unavailable: true });
    return;
  }
  const db = A.client;
  const toast = (m) => (A.toast ? A.toast(m) : void 0);

  // ---- helpers ---------------------------------------------------------------
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  const fmtWhen = (s) => {
    if (!s) return "";
    try { return new Date(s).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }); }
    catch (e) { return String(s); }
  };
  const fmtDate = (s) => {
    if (!s) return "";
    try { return new Date(s).toLocaleDateString("en", { dateStyle: "medium" }); }
    catch (e) { return String(s); }
  };
  const money = (cents, cur) =>
    (cur ? esc(cur) + " " : "") +
    (Number(cents || 0) / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const truncate = (s, n) => {
    s = String(s == null ? "" : s);
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };

  // central error mapper (admin RPCs + payment RPCs)
  function isNotAuthorized(err) {
    return /not authorized/i.test((err && (err.message || err.error)) || "");
  }
  function rpcError(err) {
    const m = (err && (err.message || err.error || err.error_description)) || "";
    if (/not authorized/i.test(m)) return "You don't have admin access.";
    if (/empty_body/i.test(m)) return "Please write a message body before sending.";
    if (/body_too_long/i.test(m)) return "Message body is too long (max 5000 characters).";
    if (/title_too_long/i.test(m)) return "Title is too long (max 200 characters).";
    if (/recipient_not_found/i.test(m)) return "No user found with that email.";
    if (/unknown_provider/i.test(m)) return "Unknown payment provider.";
    if (/bad_fx_rate/i.test(m)) return "Conversion rate must be greater than 0.";
    return "Something went wrong — please try again.";
  }

  function notAuthorizedCard(opts) {
    opts = opts || {};
    const msg = opts.signedOut
      ? (opts.unavailable
          ? "Sign-in is unavailable here. Serve the site over http and sign in as an admin."
          : "Please sign in with an admin account to open the dashboard.")
      : "You don't have admin access.";
    const btn = opts.signedOut && !opts.unavailable
      ? `<button class="apply-btn" id="adminSignIn" type="button">Sign in</button>`
      : `<a class="apply-btn" href="index.html#browse">Back to site</a>`;
    return `<div class="admin-denied">
        <div class="big">🔒</div>
        <h2>Admin only</h2>
        <p>${esc(msg)}</p>
        ${btn}
      </div>`;
  }

  // ---- gate state ------------------------------------------------------------
  const PANES = ["overview", "messages", "contact", "accounts", "payments"];
  const PANE_LABELS = {
    overview: "Overview", messages: "Messages", contact: "Contact",
    accounts: "Accounts", payments: "Payments",
  };
  let isAdmin = false;
  let shellReady = false;

  function activePane() {
    const h = (location.hash || "#overview").slice(1);
    return PANES.includes(h) ? h : "overview";
  }

  // ---- nav "Admin" link (admins only) ---------------------------------------
  // Mirrors how inbox.js augments the nav: inject an Admin entry into the account
  // menu. auth.js rebuilds the menu on auth changes, so re-inject via observer.
  let navObserver = null;
  function injectNavLink() {
    if (!isAdmin) return;
    const menu = document.querySelector("#navAccount .nav-menu");
    if (!menu || menu.querySelector(".nav-admin-link")) return;
    const link = document.createElement("a");
    link.href = "admin.html#overview";
    link.className = "nav-admin-link";
    link.textContent = "Admin";
    const signout = menu.querySelector(".nav-signout");
    if (signout) menu.insertBefore(link, signout);
    else menu.appendChild(link);
  }
  function watchNav() {
    if (navObserver) return;
    const slot = document.getElementById("navAccount");
    if (!slot) return;
    navObserver = new MutationObserver(() => injectNavLink());
    navObserver.observe(slot, { childList: true, subtree: true });
  }

  // ---- gate: decide whether to render the shell ------------------------------
  async function gate(user) {
    if (!user) {
      isAdmin = false; shellReady = false;
      root.innerHTML = notAuthorizedCard({ signedOut: true });
      const b = document.getElementById("adminSignIn");
      if (b) b.addEventListener("click", () => A.openModal("signin"));
      return;
    }
    let admin = false;
    try {
      const { data } = await db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
      admin = !!data;
    } catch (e) { admin = false; }
    isAdmin = admin;
    if (!admin) {
      shellReady = false;
      root.innerHTML = notAuthorizedCard({ signedOut: false });
      return;
    }
    renderShell();
    watchNav();
    injectNavLink();
  }

  // revert to the gate when the server says we're no longer an admin (revoked mid-session)
  function revokeToGate() {
    isAdmin = false; shellReady = false;
    root.innerHTML = notAuthorizedCard({ signedOut: false });
  }

  // ---- shell -----------------------------------------------------------------
  function renderShell() {
    shellReady = true;
    root.innerHTML = `
      <div class="admin-shell">
        <header class="admin-head">
          <div>
            <h1 class="admin-title">Admin dashboard</h1>
            <p class="admin-sub">Read-only oversight, outbound messaging, and payments.</p>
          </div>
          <button class="admin-refresh" id="adminRefresh" type="button">↻ Refresh</button>
        </header>
        <nav class="admin-tabs" id="adminTabs">
          ${PANES.map((p) => `<a href="#${p}" data-pane="${p}">${esc(PANE_LABELS[p])}</a>`).join("")}
        </nav>
        <section class="admin-pane" id="adminPane"></section>
      </div>`;
    document.getElementById("adminRefresh").addEventListener("click", () => loadPane(activePane()));
    loadPane(activePane());
  }

  function setActiveTab(pane) {
    const tabs = document.getElementById("adminTabs");
    if (!tabs) return;
    tabs.querySelectorAll("a").forEach((a) => a.classList.toggle("active", a.dataset.pane === pane));
  }

  function paneEl() { return document.getElementById("adminPane"); }
  function setLoading(msg) {
    const el = paneEl();
    if (el) el.innerHTML = `<div class="admin-loading">${esc(msg || "Loading…")}</div>`;
  }
  function setError(err) {
    const el = paneEl();
    if (!el) return;
    el.innerHTML = `<div class="admin-error"><p>${esc(rpcError(err))}</p>
      <button class="link-btn" id="adminRetry" type="button">Try again</button></div>`;
    const r = document.getElementById("adminRetry");
    if (r) r.addEventListener("click", () => loadPane(activePane()));
  }

  const LOADERS = {
    overview: renderOverview,
    messages: renderMessages,
    contact: renderContact,
    accounts: renderAccounts,
    payments: renderPayments,
  };
  function loadPane(pane) {
    if (!shellReady) return;
    setActiveTab(pane);
    (LOADERS[pane] || renderOverview)();
  }

  // ============================ OVERVIEW (US4) ================================
  async function renderOverview() {
    setLoading("Loading overview…");
    let o;
    try {
      const { data, error } = await db.rpc("admin_overview");
      if (error) throw error;
      o = data || {};
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      return setError(e);
    }
    const cards = [
      ["Registered users", o.users],
      ["Completed profiles", o.profiles],
      ["Tickets booked", o.tickets],
      ["Contact messages", o.contact_messages],
      ["Messages sent", o.messages_sent],
      ["Payments received", money(o.payments_received, "")],
    ];
    paneEl().innerHTML = `<div class="admin-cards">
      ${cards.map(([label, val]) => `<div class="admin-card">
          <span class="admin-card-val">${esc(val == null ? "—" : val)}</span>
          <span class="admin-card-label">${esc(label)}</span>
        </div>`).join("")}
    </div>
    <p class="admin-hint">Counts are read live each time you open or refresh this pane.</p>`;
  }

  // ============================ MESSAGES (US2) ================================
  let lastSentLog = null;
  async function renderMessages() {
    const el = paneEl();
    el.innerHTML = `
      <div class="admin-compose">
        <h2>Send a message</h2>
        <form id="adminMsgForm" class="admin-form" novalidate>
          <div class="admin-radio-row">
            <label><input type="radio" name="target" value="user" checked /> One user (by email)</label>
            <label><input type="radio" name="target" value="all" /> All users</label>
          </div>
          <label class="admin-field" id="emailField">Email
            <input type="email" name="email" placeholder="user@example.com" autocomplete="off" />
            <span class="admin-inline-err" id="emailErr" hidden></span>
          </label>
          <label class="admin-field">Title <span class="opt">(optional)</span>
            <input type="text" name="title" maxlength="200" placeholder="Short subject" />
          </label>
          <label class="admin-field">Message
            <textarea name="body" rows="5" maxlength="5000" placeholder="Write your message…" required></textarea>
          </label>
          <button class="apply-btn" type="submit" id="adminSend" disabled>Send message</button>
        </form>
      </div>
      <div class="admin-log">
        <h2>Sent messages</h2>
        <div id="adminLogList"><div class="admin-loading">Loading…</div></div>
      </div>`;

    const form = document.getElementById("adminMsgForm");
    const emailField = document.getElementById("emailField");
    const emailErr = document.getElementById("emailErr");
    const sendBtn = document.getElementById("adminSend");
    const bodyEl = form.body;

    function targetVal() { return form.querySelector("input[name=target]:checked").value; }
    function syncTarget() {
      emailField.hidden = targetVal() !== "user";
    }
    function syncSend() {
      sendBtn.disabled = !bodyEl.value.trim();
    }
    form.querySelectorAll("input[name=target]").forEach((r) => r.addEventListener("change", () => { syncTarget(); clearInlineErr(); }));
    bodyEl.addEventListener("input", syncSend);
    form.email.addEventListener("input", clearInlineErr);
    function clearInlineErr() { emailErr.hidden = true; emailErr.textContent = ""; }
    function showInlineErr(msg) { emailErr.textContent = msg; emailErr.hidden = false; }
    syncTarget();

    let busy = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const target = targetVal();
      const title = form.title.value.trim();
      const body = bodyEl.value.trim();
      if (!body) { toast("Please write a message body before sending."); return; }
      const email = form.email.value.trim();
      if (target === "user" && !email) { showInlineErr("Enter the recipient's email."); return; }

      if (target === "all") {
        if (!confirm("Send this message to all users? This can't be undone.")) return;
      }

      busy = true; sendBtn.disabled = true;
      const prevLabel = sendBtn.textContent;
      sendBtn.textContent = "Sending…";
      try {
        if (target === "all") {
          const { data, error } = await db.rpc("admin_broadcast", { p_title: title || null, p_body: body });
          if (error) throw error;
          toast("Sent to " + (data || 0) + " users.");
        } else {
          const { error } = await db.rpc("admin_send_to_email", { p_email: email, p_title: title || null, p_body: body });
          if (error) throw error;
          toast("Message sent.");
        }
        form.reset(); syncTarget(); syncSend(); clearInlineErr();
        loadSentLog();
      } catch (err) {
        if (isNotAuthorized(err)) return revokeToGate();
        if (/recipient_not_found/i.test((err && err.message) || "")) showInlineErr("No user found with that email.");
        else toast(rpcError(err));
      } finally {
        busy = false; sendBtn.textContent = prevLabel; syncSend();
      }
    });

    loadSentLog();
  }

  async function loadSentLog() {
    const box = document.getElementById("adminLogList");
    if (!box) return;
    let rows;
    try {
      const { data, error } = await db.from("admin_messages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      box.innerHTML = `<div class="admin-error"><p>${esc(rpcError(e))}</p></div>`;
      return;
    }
    lastSentLog = rows;
    if (!rows.length) {
      box.innerHTML = `<div class="admin-empty">No messages sent yet.</div>`;
      return;
    }
    box.innerHTML = `<ul class="admin-log-list">${rows.map(logRowHtml).join("")}</ul>`;
  }

  function logRowHtml(r) {
    const who = r.target_type === "all"
      ? "All users"
      : (r.target_email || r.target_user_id || "One user");
    return `<li class="admin-log-item">
      <div class="admin-log-top">
        <span class="admin-log-target">${esc(who)}</span>
        <span class="admin-log-when">${esc(fmtWhen(r.created_at))}</span>
      </div>
      ${r.title ? `<div class="admin-log-title">${esc(r.title)}</div>` : ""}
      <div class="admin-log-body">${esc(truncate(r.body, 160))}</div>
      <div class="admin-log-meta">${esc(r.recipient_count)} recipient${r.recipient_count === 1 ? "" : "s"}</div>
    </li>`;
  }

  // ============================ CONTACT (US3) =================================
  async function renderContact() {
    setLoading("Loading contact submissions…");
    let rows;
    try {
      const { data, error } = await db.from("contact_messages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      return setError(e);
    }
    if (!rows.length) {
      paneEl().innerHTML = `<div class="admin-empty">No contact messages.</div>`;
      return;
    }
    paneEl().innerHTML = `<ul class="admin-contact-list">${rows.map(contactRowHtml).join("")}</ul>`;
    paneEl().querySelectorAll(".admin-contact-item").forEach(wireContactItem);
  }

  function contactRowHtml(r) {
    const name = r.name || "(no name)";
    return `<li class="admin-contact-item" data-uid="${esc(r.user_id)}">
      <div class="admin-contact-head">
        <span class="admin-contact-from"><b>${esc(name)}</b> ${r.email ? `&lt;${esc(r.email)}&gt;` : ""}</span>
        <span class="admin-log-when">${esc(fmtWhen(r.created_at))}</span>
      </div>
      <div class="admin-contact-msg">${esc(r.message)}</div>
      <button type="button" class="link-btn admin-reply-toggle">Reply</button>
      <form class="admin-reply-form" hidden>
        <input type="text" name="title" maxlength="200" placeholder="Title (optional)" />
        <textarea name="body" rows="3" maxlength="5000" placeholder="Write your reply…" required></textarea>
        <button class="apply-btn" type="submit">Send reply</button>
      </form>
    </li>`;
  }

  function wireContactItem(li) {
    const uid = li.dataset.uid;
    const toggle = li.querySelector(".admin-reply-toggle");
    const form = li.querySelector(".admin-reply-form");
    toggle.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) form.body.focus(); });
    let busy = false;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (busy) return;
      const body = form.body.value.trim();
      const title = form.title.value.trim();
      if (!body) { toast("Please write a reply before sending."); return; }
      if (!uid) { toast("This submission has no linked account to reply to."); return; }
      busy = true;
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true; const prev = btn.textContent; btn.textContent = "Sending…";
      try {
        const { error } = await db.rpc("admin_send_to_user", { p_user_id: uid, p_title: title || null, p_body: body });
        if (error) throw error;
        toast("Reply sent.");
        form.reset(); form.hidden = true;
        if (lastSentLog !== null) loadSentLog(); // keep the Messages log fresh if already loaded
      } catch (err) {
        if (isNotAuthorized(err)) return revokeToGate();
        toast(rpcError(err));
      } finally {
        busy = false; btn.disabled = false; btn.textContent = prev;
      }
    });
  }

  // ============================ ACCOUNTS (US5) ================================
  async function renderAccounts() {
    setLoading("Loading accounts…");
    let rows;
    try {
      const { data, error } = await db
        .from("profiles")
        .select("user_id,first_name,last_name,full_name,country,degree,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      return setError(e);
    }
    if (!rows.length) {
      paneEl().innerHTML = `<div class="admin-empty">No accounts yet.</div>`;
      return;
    }
    paneEl().innerHTML = `
      <div class="admin-accounts">
        <ul class="admin-acct-list">
          ${rows.map((r) => {
            const name = r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "(no name)";
            return `<li class="admin-acct-item" data-uid="${esc(r.user_id)}">
              <span class="admin-acct-name">${esc(name)}</span>
              <span class="admin-acct-meta">${esc(r.country || "—")} · ${esc(r.degree || "—")}</span>
              <span class="admin-acct-when">Joined ${esc(fmtDate(r.created_at))}</span>
            </li>`;
          }).join("")}
        </ul>
        <div class="admin-acct-detail" id="acctDetail">
          <p class="admin-hint">Select a user to view their bookings.</p>
        </div>
      </div>`;
    paneEl().querySelectorAll(".admin-acct-item").forEach((li) =>
      li.addEventListener("click", () => {
        paneEl().querySelectorAll(".admin-acct-item").forEach((x) => x.classList.toggle("selected", x === li));
        loadBookings(li.dataset.uid);
      }));
  }

  async function loadBookings(uid) {
    const box = document.getElementById("acctDetail");
    if (!box) return;
    box.innerHTML = `<div class="admin-loading">Loading bookings…</div>`;
    let rows;
    try {
      const { data, error } = await db.from("tickets").select("*").eq("user_id", uid).order("booked_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      box.innerHTML = `<div class="admin-error"><p>${esc(rpcError(e))}</p></div>`;
      return;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="admin-empty">No bookings for this user.</div>`;
      return;
    }
    box.innerHTML = `<ul class="admin-booking-list">${rows.map(bookingHtml).join("")}</ul>`;
  }

  function bookingHtml(t) {
    return `<li class="admin-booking">
      <div class="admin-booking-top">
        <b>${esc(t.scholarship_title || "Scholarship")}</b>
        <span class="admin-pill">${esc(t.status || "—")}</span>
      </div>
      <div class="admin-booking-meta">${esc(t.institution || "—")} · ${esc(t.ranking_tier || "—")}</div>
      <div class="admin-booking-meta">${money(t.amount_cents, (t.currency || "").toUpperCase())} · via ${esc(t.provider || "—")}</div>
      <div class="admin-booking-meta">Booked ${esc(fmtWhen(t.booked_at))} · cooldown ends ${esc(fmtWhen(t.cooldown_end))}</div>
    </li>`;
  }

  // ============================ PAYMENTS (US7 + US8) ==========================
  async function renderPayments() {
    const el = paneEl();
    el.innerHTML = `
      <section class="admin-pay-section" id="paySectionProviders">
        <h2>Providers</h2>
        <p class="admin-hint">Secret API keys are configured server-side and never shown here.</p>
        <div id="payProviders"><div class="admin-loading">Loading providers…</div></div>
      </section>
      <section class="admin-pay-section" id="paySectionTotals">
        <h2>Totals</h2>
        <div id="payTotals"><div class="admin-loading">Loading totals…</div></div>
      </section>
      <section class="admin-pay-section" id="paySectionLedger">
        <h2>Transactions</h2>
        <div id="payLedger"><div class="admin-loading">Loading transactions…</div></div>
      </section>`;
    loadProviders();
    loadPayTotals();
    loadLedger();
  }

  async function loadProviders() {
    const box = document.getElementById("payProviders");
    if (!box) return;
    let rows;
    try {
      const { data, error } = await db.from("payment_providers").select("*").order("sort_order");
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      box.innerHTML = `<div class="admin-error"><p>${esc(rpcError(e))}</p></div>`;
      return;
    }
    box.innerHTML = `<div class="admin-provider-list">${rows.map(providerRowHtml).join("")}</div>`;
    box.querySelectorAll(".admin-provider").forEach(wireProviderRow);
  }

  function providerRowHtml(p) {
    return `<div class="admin-provider" data-provider="${esc(p.provider)}">
      <div class="admin-provider-head">
        <span class="admin-provider-name">${esc(p.display_name)} <code>${esc(p.provider)}</code></span>
        <label class="admin-switch">
          <input type="checkbox" class="admin-provider-enabled" ${p.enabled ? "checked" : ""} />
          <span>${p.enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
      <div class="admin-provider-config">
        <label>Display name<input type="text" class="cfg-display" value="${esc(p.display_name)}" /></label>
        <label>Currency<input type="text" class="cfg-currency" value="${esc(p.currency)}" maxlength="8" /></label>
        <label>FX rate (× USD)<input type="number" class="cfg-fx" value="${esc(p.fx_rate)}" min="0" step="0.0001" /></label>
        <button type="button" class="apply-btn admin-provider-save">Save</button>
      </div>
    </div>`;
  }

  function wireProviderRow(row) {
    const provider = row.dataset.provider;
    const toggle = row.querySelector(".admin-provider-enabled");
    const toggleLabel = row.querySelector(".admin-switch span");
    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      try {
        const { error } = await db.rpc("admin_set_provider_enabled", { p_provider: provider, p_enabled: toggle.checked });
        if (error) throw error;
        toggleLabel.textContent = toggle.checked ? "Enabled" : "Disabled";
        toast(toggle.checked ? "Provider enabled." : "Provider disabled.");
      } catch (err) {
        if (isNotAuthorized(err)) return revokeToGate();
        toggle.checked = !toggle.checked; // revert
        toast(rpcError(err));
      } finally {
        toggle.disabled = false;
      }
    });

    const saveBtn = row.querySelector(".admin-provider-save");
    saveBtn.addEventListener("click", async () => {
      const display = row.querySelector(".cfg-display").value.trim();
      const currency = row.querySelector(".cfg-currency").value.trim();
      const fx = parseFloat(row.querySelector(".cfg-fx").value);
      if (!(fx > 0)) { toast("Conversion rate must be greater than 0."); return; }
      saveBtn.disabled = true; const prev = saveBtn.textContent; saveBtn.textContent = "Saving…";
      try {
        const { error } = await db.rpc("admin_set_provider_config", {
          p_provider: provider, p_display_name: display, p_currency: currency, p_fx_rate: fx,
        });
        if (error) throw error;
        toast("Provider updated.");
        loadPayTotals();
      } catch (err) {
        if (isNotAuthorized(err)) return revokeToGate();
        toast(rpcError(err));
      } finally {
        saveBtn.disabled = false; saveBtn.textContent = prev;
      }
    });
  }

  async function loadPayTotals() {
    const box = document.getElementById("payTotals");
    if (!box) return;
    let o;
    try {
      const { data, error } = await db.rpc("admin_payments_overview");
      if (error) throw error;
      o = data || {};
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      box.innerHTML = `<div class="admin-error"><p>${esc(rpcError(e))}</p></div>`;
      return;
    }
    const byProvider = Array.isArray(o.by_provider) ? o.by_provider : [];
    box.innerHTML = `
      <div class="admin-totals-grand">Payments received: <b>${money(o.total_received_cents, "")}</b></div>
      <table class="admin-table">
        <thead><tr><th>Provider</th><th>Paid count</th><th>Paid total</th></tr></thead>
        <tbody>
          ${byProvider.map((p) => `<tr>
            <td>${esc(p.provider)}</td>
            <td>${esc(p.paid_count)}</td>
            <td>${money(p.paid_cents, (p.currency || "").toUpperCase())}</td>
          </tr>`).join("")}
        </tbody>
      </table>`;
  }

  async function loadLedger() {
    const box = document.getElementById("payLedger");
    if (!box) return;
    let rows;
    try {
      const { data, error } = await db.from("payments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      rows = data || [];
    } catch (e) {
      if (isNotAuthorized(e)) return revokeToGate();
      box.innerHTML = `<div class="admin-error"><p>${esc(rpcError(e))}</p></div>`;
      return;
    }
    if (!rows.length) {
      box.innerHTML = `<div class="admin-empty">No payments yet.</div>`;
      return;
    }
    box.innerHTML = `<table class="admin-table">
      <thead><tr><th>When</th><th>Provider</th><th>Payer</th><th>Amount</th><th>Status</th><th>Kind</th></tr></thead>
      <tbody>${rows.map(ledgerRowHtml).join("")}</tbody>
    </table>`;
  }

  function ledgerRowHtml(p) {
    return `<tr>
      <td>${esc(fmtWhen(p.created_at))}</td>
      <td>${esc(p.provider)}</td>
      <td><code>${esc(truncate(p.user_id || "—", 12))}</code></td>
      <td>${money(p.amount_cents, (p.currency || "").toUpperCase())}</td>
      <td><span class="admin-pill admin-pill-${esc(p.status)}">${esc(p.status)}</span></td>
      <td>${esc(p.kind)}</td>
    </tr>`;
  }

  // ---- wiring ----------------------------------------------------------------
  window.addEventListener("hashchange", () => { if (shellReady) loadPane(activePane()); });
  A.onChange((user) => gate(user));
})();
