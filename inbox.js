// Shared inbox module for every Beacon page (specs/005-inbox-notifications).
// Load order: supabase-js (pinned CDN), supabase-config.js, auth.js, inbox.js.
// Injects a nav bell + unread badge, fetches the inbox, subscribes to Supabase
// Realtime for live updates, renders a quick-view dropdown, and exposes
// window.BeaconInbox = { localize, fmtWhen, fmtAgo, typeMeta, refresh, getLang }
// which account.js reuses for the full Inbox pane.
(function () {
  "use strict";

  const A = window.BeaconAuth;
  // Degrade silently when auth/Supabase is unavailable (file://, SDK missing, signed-out shell).
  if (!A || !A.client) {
    window.BeaconInbox = {
      localize: (r) => ({ title: r && r.title ? r.title : "", body: r && r.body ? r.body : "", dir: "auto" }),
      fmtWhen: (s) => String(s || ""),
      fmtAgo: () => "",
      typeMeta: () => ({ icon: "📬", label: "" }),
      refresh: () => {},
      getLang: () => "en",
    };
    return;
  }

  const db = A.client;
  const LANG_KEY = "beacon-lang"; // shared with scholarship.js language toggle
  const RECENT_LIMIT = 10;

  const esc = (s) =>
    String(s == null ? "" : s).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );

  function getLang() {
    try {
      return localStorage.getItem(LANG_KEY) === "ar" ? "ar" : "en";
    } catch (e) {
      return "en";
    }
  }

  // ---- localization templates (FR-018) --------------------------------------
  const I18N = {
    en: {
      ui: { title: "Inbox", empty: "No messages yet.", viewAll: "View all", markAll: "Mark all read", signin: "Sign in to see your messages." },
      labels: { welcome: "Welcome", booking: "Booking", contact: "Message", admin: "From Beacon" },
      welcome: {
        title: "Welcome to Beacon! 🎉",
        body: "Your account is ready. Complete your profile to get matched with scholarships.",
      },
      booking: {
        title: "Ticket booked ✅",
        body: "Your ticket for {scholarship_title} is confirmed. Code {ticket_code}. Available {available_at}.",
      },
      contact: {
        title: "Message received 📨",
        body: "Thanks for reaching out — we've received your message and will reply soon.",
      },
    },
    ar: {
      ui: { title: "البريد", empty: "لا توجد رسائل بعد.", viewAll: "عرض الكل", markAll: "تحديد الكل كمقروء", signin: "سجّل الدخول لرؤية رسائلك." },
      labels: { welcome: "ترحيب", booking: "حجز", contact: "رسالة", admin: "من Beacon" },
      welcome: {
        title: "مرحبًا بك في Beacon! 🎉",
        body: "تم إنشاء حسابك. أكمل ملفك الشخصي للحصول على منح مناسبة.",
      },
      booking: {
        title: "تم حجز التذكرة ✅",
        body: "تم تأكيد تذكرتك لـ {scholarship_title}. الرمز {ticket_code}. متاحة {available_at}.",
      },
      contact: {
        title: "تم استلام رسالتك 📨",
        body: "شكرًا لتواصلك معنا — استلمنا رسالتك وسنرد قريبًا.",
      },
    },
  };

  const TYPE_ICON = { welcome: "🎉", booking: "🎫", contact: "📨", admin: "📢" };

  function fmtWhen(iso) {
    if (!iso) return getLang() === "ar" ? "قريبًا" : "soon";
    try {
      return new Date(iso).toLocaleString(getLang() === "ar" ? "ar" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return String(iso);
    }
  }

  function fmtAgo(iso) {
    const ar = getLang() === "ar";
    try {
      const diff = Date.now() - new Date(iso).getTime();
      const m = Math.round(diff / 60000);
      if (m < 1) return ar ? "الآن" : "just now";
      if (m < 60) return ar ? `منذ ${m} د` : `${m}m ago`;
      const h = Math.round(m / 60);
      if (h < 24) return ar ? `منذ ${h} س` : `${h}h ago`;
      const d = Math.round(h / 24);
      if (d < 7) return ar ? `منذ ${d} ي` : `${d}d ago`;
      return new Date(iso).toLocaleDateString(ar ? "ar" : "en", { month: "short", day: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function interp(s, p) {
    const ar = getLang() === "ar";
    return String(s).replace(/\{(\w+)\}/g, (_, k) => {
      let v = p ? p[k] : null;
      if (k === "available_at") return fmtWhen(v);
      if (v == null || v === "") {
        if (k === "scholarship_title") return ar ? "منحتك" : "your scholarship";
        if (k === "ticket_code") return "—";
        return "";
      }
      return String(v);
    });
  }

  // Render any notification row → { title, body, dir } in the viewer's language.
  function localize(row) {
    const lang = getLang();
    const t = I18N[lang] || I18N.en;
    if (!row || row.type === "admin") {
      return { title: (row && row.title) || "", body: (row && row.body) || "", dir: "auto" };
    }
    const tpl = t[row.type] || I18N.en[row.type] || { title: "", body: "" };
    return {
      title: interp(tpl.title, row.payload),
      body: interp(tpl.body, row.payload),
      dir: lang === "ar" ? "rtl" : "ltr",
    };
  }

  function typeMeta(type) {
    const t = I18N[getLang()] || I18N.en;
    return { icon: TYPE_ICON[type] || "📬", label: (t.labels && t.labels[type]) || "" };
  }

  function ui(key) {
    const t = I18N[getLang()] || I18N.en;
    return (t.ui && t.ui[key]) || I18N.en.ui[key];
  }

  // ---- nav bell + dropdown ---------------------------------------------------
  const slot = document.getElementById("navAccount");
  let wrap = null, bell, badge, dropdown, recent = [], unread = 0, channel = null, open = false;

  function ensureBell() {
    if (wrap || !slot || !slot.parentNode) return;
    wrap = document.createElement("div");
    wrap.className = "nav-inbox";
    wrap.hidden = true;
    wrap.innerHTML = `
      <button class="nav-bell" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Inbox" title="Inbox">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.3 2.6A1 1 0 0 0 5.6 17h12.8a1 1 0 0 0 .9-1.8L18 12.6V9a6 6 0 0 0-6-6zM9.5 19a2.5 2.5 0 0 0 5 0z" fill="currentColor"/></svg>
        <span class="nav-bell-badge" hidden></span>
      </button>
      <div class="inbox-dropdown" hidden></div>`;
    slot.parentNode.insertBefore(wrap, slot);
    bell = wrap.querySelector(".nav-bell");
    badge = wrap.querySelector(".nav-bell-badge");
    dropdown = wrap.querySelector(".inbox-dropdown");

    bell.addEventListener("click", (e) => {
      e.stopPropagation();
      open ? closeDropdown() : openDropdown();
    });
    dropdown.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", closeDropdown);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDropdown();
    });
  }

  function setBadge(n) {
    unread = n;
    if (!badge) return;
    if (n > 0) {
      badge.textContent = n > 9 ? "9+" : String(n);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function openDropdown() {
    if (!dropdown) return;
    open = true;
    bell.setAttribute("aria-expanded", "true");
    renderDropdown();
    dropdown.hidden = false;
  }
  function closeDropdown() {
    if (!dropdown || !open) return;
    open = false;
    bell.setAttribute("aria-expanded", "false");
    dropdown.hidden = true;
  }

  function rowHtml(row) {
    const m = typeMeta(row.type);
    const loc = localize(row);
    const dirAttr = loc.dir && loc.dir !== "ltr" ? ` dir="${loc.dir}"` : "";
    return `<button type="button" class="inbox-item${row.is_read ? "" : " is-unread"}" data-id="${esc(row.id)}"${row.ref ? ` data-ref="${esc(row.ref)}"` : ""}>
        <span class="inbox-ic" aria-hidden="true">${m.icon}</span>
        <span class="inbox-body"${dirAttr}>
          <span class="inbox-row1"><b class="inbox-title">${esc(loc.title)}</b><span class="inbox-when">${esc(fmtAgo(row.created_at))}</span></span>
          <span class="inbox-text">${esc(loc.body)}</span>
        </span>
      </button>`;
  }

  function renderDropdown() {
    if (!dropdown) return;
    const items = recent.length
      ? recent.map(rowHtml).join("")
      : `<div class="inbox-empty">${esc(ui("empty"))}</div>`;
    dropdown.innerHTML = `
      <div class="inbox-dd-head">
        <strong>${esc(ui("title"))}</strong>
        ${recent.some((r) => !r.is_read) ? `<button type="button" class="inbox-markall">${esc(ui("markAll"))}</button>` : ""}
      </div>
      <div class="inbox-dd-list">${items}</div>
      <a class="inbox-dd-foot" href="account.html#inbox">${esc(ui("viewAll"))}</a>`;
    dropdown.querySelectorAll(".inbox-item").forEach((el) =>
      el.addEventListener("click", async () => {
        const id = el.dataset.id, ref = el.dataset.ref;
        await markRead(id);
        if (ref) location.href = ref;
      }),
    );
    const ma = dropdown.querySelector(".inbox-markall");
    if (ma) ma.addEventListener("click", markAllRead);
  }

  async function markRead(id) {
    try {
      await db.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id).eq("is_read", false);
    } catch (e) {}
    refresh();
  }
  async function markAllRead() {
    try {
      await db.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("is_read", false);
    } catch (e) {}
    refresh();
  }

  // ---- data + realtime -------------------------------------------------------
  let refreshing = false;
  async function refresh() {
    if (!A.getUser || !A.getUser()) return;
    if (refreshing) return;
    refreshing = true;
    try {
      const [{ count }, { data }] = await Promise.all([
        db.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false),
        db
          .from("notifications")
          .select("id,type,payload,title,body,ref,is_read,created_at")
          .order("created_at", { ascending: false })
          .limit(RECENT_LIMIT),
      ]);
      recent = data || [];
      setBadge(count || 0);
      if (open) renderDropdown();
      document.dispatchEvent(new CustomEvent("beacon:inbox-changed"));
    } catch (e) {
      /* best-effort */
    } finally {
      refreshing = false;
    }
  }

  let debounce = null;
  function onRealtime() {
    clearTimeout(debounce);
    debounce = setTimeout(refresh, 250);
  }

  function subscribe(uid) {
    unsubscribe();
    channel = db
      .channel("inbox:" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + uid }, onRealtime)
      .subscribe();
  }
  function unsubscribe() {
    if (channel) {
      try { db.removeChannel(channel); } catch (e) {}
      channel = null;
    }
  }

  // ---- auth wiring -----------------------------------------------------------
  A.onChange((u) => {
    if (u) {
      ensureBell();
      if (wrap) wrap.hidden = false;
      refresh();
      subscribe(u.id);
    } else {
      if (wrap) wrap.hidden = true;
      closeDropdown();
      unsubscribe();
      recent = [];
      setBadge(0);
    }
  });

  // re-render the open dropdown if the language preference changes in another tab
  window.addEventListener("storage", (e) => {
    if (e.key === LANG_KEY && open) renderDropdown();
  });

  window.BeaconInbox = { localize, fmtWhen, fmtAgo, typeMeta, refresh, getLang };
})();
