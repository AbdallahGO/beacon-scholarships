// Shared auth module for every Beacon page (contract: specs/003-user-auth-profiles/contracts/auth-flows.md).
// Load order: supabase-js (pinned CDN), supabase-config.js, auth.js.
// Exposes window.BeaconAuth = { client, getUser, onChange, requireAuth, openModal, signOut }.
(function () {
  "use strict";

  const PENDING_KEY = "beacon.pendingAction";
  const AVATAR_KEY = "beacon.avatarUrl";
  const PENDING_MAX_AGE = 60 * 60 * 1000; // 1 h — stale actions are dropped

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));

  // ---- environment guards ---------------------------------------------------
  // OAuth redirects cannot return to file:// — account features need http(s).
  const isFile = location.protocol === "file:";
  const sdkOk = typeof window.supabase !== "undefined" && window.SUPABASE_URL && window.SUPABASE_PUBLISHABLE_KEY;

  const slot = document.getElementById("navAccount");

  if (isFile || !sdkOk) {
    if (slot) {
      slot.innerHTML = `<button class="nav-cta nav-signin" type="button" title="${
        isFile
          ? "Sign-in needs the site served over http — run: npx http-server -p 8080"
          : "Sign-in is unavailable right now (connection script didn't load)."
      }" disabled>Sign in</button>`;
    }
    window.BeaconAuth = {
      client: null,
      getUser: () => null,
      onChange: (fn) => fn(null),
      requireAuth: () => {
        toast(isFile
          ? "Sign-in needs the site served over http. From the project folder run: npx http-server -p 8080"
          : "Sign-in is unavailable right now — please try again later.");
        return false;
      },
      openModal: () => {},
      signOut: () => {},
    };
    return;
  }

  // ---- client ----------------------------------------------------------------
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY, {
    auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  let currentUser = null;
  const listeners = [];

  function getUser() { return currentUser; }
  function onChange(fn) { listeners.push(fn); fn(currentUser); }
  function emit() { listeners.forEach((fn) => { try { fn(currentUser); } catch (e) { console.error(e); } }); }

  // ---- toast ------------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    let el = document.getElementById("beaconToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "beaconToast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 5000);
  }

  // ---- auth modal (FR-001/002/006/007) ----------------------------------------
  // Generic failure copy: never reveals whether an email is registered (FR-007).
  const GENERIC_SIGNIN_ERR = "That email and password didn't match. Please try again.";
  const GENERIC_ERR = "Something didn't work there — please try again.";

  const PROVIDERS = [
    { key: "google", name: "Google", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5L18.7 4.6A10 10 0 0 0 3.1 7.5L6.4 10c.8-2.3 3-4 5.6-4z"/></svg>` },
    { key: "facebook", name: "Facebook", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#1877F2" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"/></svg>` },
    { key: "linkedin_oidc", name: "LinkedIn", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#0A66C2" d="M20.4 3H3.6A.6.6 0 0 0 3 3.6v16.8a.6.6 0 0 0 .6.6h16.8a.6.6 0 0 0 .6-.6V3.6a.6.6 0 0 0-.6-.6zM8.3 18.4H5.7V9.7h2.6v8.7zM7 8.6a1.5 1.5 0 1 1 0-3.1 1.5 1.5 0 0 1 0 3.1zm11.4 9.8h-2.6v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3h-2.6V9.7h2.5v1.2h.1c.3-.7 1.2-1.4 2.5-1.4 2.6 0 3.1 1.7 3.1 4v4.9z"/></svg>` },
    { key: "x", name: "X", icon: `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.2 2.3h3.3l-7.3 8.3 8.6 11.1h-6.7l-5.3-6.8-6 6.8H1.5l7.8-8.9L1 2.3h6.9l4.8 6.2 5.5-6.2zm-1.2 17.5h1.8L7 4.1H5l12 15.7z"/></svg>` },
  ];

  let modal = null;
  function buildModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "authModal";
    modal.className = "auth-overlay";
    modal.innerHTML = `
      <div class="auth-card" role="dialog" aria-modal="true" aria-label="Sign in to Beacon">
        <button class="auth-close" type="button" aria-label="Close">×</button>
        <div class="auth-tabs">
          <button type="button" class="auth-tab active" data-mode="signin">Sign in</button>
          <button type="button" class="auth-tab" data-mode="signup">Create account</button>
        </div>
        <form class="auth-form" novalidate>
          <label>Email
            <input type="email" name="email" autocomplete="email" required placeholder="you@example.com" />
          </label>
          <label>Password
            <input type="password" name="password" autocomplete="current-password" required minlength="8" placeholder="At least 8 characters" />
          </label>
          <div class="auth-error" hidden></div>
          <button class="auth-submit" type="submit">Sign in</button>
          <button class="auth-forgot" type="button">Forgot password?</button>
        </form>
        <div class="auth-divider"><span>or continue with</span></div>
        <div class="auth-providers">
          ${PROVIDERS.map((p) =>
            `<button type="button" class="auth-provider" data-provider="${p.key}">${p.icon}<span>${p.name}</span></button>`
          ).join("")}
        </div>
      </div>`;
    document.body.appendChild(modal);

    const form = modal.querySelector(".auth-form");
    const errBox = modal.querySelector(".auth-error");
    const submit = modal.querySelector(".auth-submit");
    let mode = "signin";

    function setMode(m) {
      mode = m;
      modal.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
      submit.textContent = m === "signin" ? "Sign in" : "Create account";
      form.password.autocomplete = m === "signin" ? "current-password" : "new-password";
      showError("");
    }
    modal.__setMode = setMode;

    function showError(msg) {
      errBox.textContent = msg;
      errBox.hidden = !msg;
    }

    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector(".auth-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("open")) closeModal();
    });
    modal.querySelectorAll(".auth-tab").forEach((t) =>
      t.addEventListener("click", () => setMode(t.dataset.mode))
    );

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || password.length < 8) {
        showError(password.length < 8 ? "Password needs at least 8 characters." : "Please enter your email.");
        return;
      }
      submit.disabled = true;
      try {
        if (mode === "signup") {
          // "Confirm email" is OFF → session is returned immediately (soft verification, FR-007a)
          const { error } = await client.auth.signUp({ email, password });
          if (error) throw error;
        } else {
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) throw error;
        }
        closeModal();
      } catch (err) {
        console.error(err);
        showError(mode === "signin" ? GENERIC_SIGNIN_ERR : friendlySignupError(err));
      } finally {
        submit.disabled = false;
      }
    });

    modal.querySelector(".auth-forgot").addEventListener("click", async () => {
      const email = form.email.value.trim();
      if (!email) { showError("Enter your email above first, then tap “Forgot password?”."); return; }
      try {
        const base = location.origin + location.pathname.replace(/[^/]*$/, "");
        await client.auth.resetPasswordForEmail(email, { redirectTo: base + "account.html#reset" });
      } catch (e) { /* same message either way — no account enumeration */ }
      showError("");
      toast("If that email has an account, a reset link is on its way.");
    });

    modal.querySelectorAll(".auth-provider").forEach((btn) =>
      btn.addEventListener("click", () => signInWithProvider(btn.dataset.provider))
    );

    return modal;
  }

  function friendlySignupError(err) {
    const m = (err && err.message) || "";
    if (/password/i.test(m)) return "That password is too weak — try at least 8 characters.";
    if (/rate/i.test(m)) return "Too many tries — please wait a minute and try again.";
    // never reveal "already registered" (FR-007) — Supabase obfuscates this too
    return GENERIC_ERR;
  }

  async function signInWithProvider(provider) {
    try {
      const { error } = await client.auth.signInWithOAuth({
        provider,
        options: { redirectTo: location.href.split("#")[0] },
      });
      if (error) throw error;
    } catch (err) {
      console.error(err);
      toast("Sign-in was cancelled or didn't go through — you can try again.");
    }
  }

  function openModal(mode) {
    buildModal();
    modal.__setMode(mode === "signup" ? "signup" : "signin");
    modal.classList.add("open");
    setTimeout(() => modal.querySelector("input[name=email]").focus(), 50);
  }
  function closeModal() { if (modal) modal.classList.remove("open"); }

  // ---- pending action (FR-011, contract F7) ------------------------------------
  function setPendingAction(action) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...action, ts: Date.now() })); } catch (e) {}
  }
  function takePendingAction() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      localStorage.removeItem(PENDING_KEY);
      const a = JSON.parse(raw);
      if (!a || Date.now() - (a.ts || 0) > PENDING_MAX_AGE) return null;
      return a;
    } catch (e) { return null; }
  }
  async function replayPendingAction() {
    const a = takePendingAction();
    if (!a || !currentUser) return;
    if (a.type === "save" && a.id) {
      const { error } = await client.from("saved_scholarships")
        .upsert({ user_id: currentUser.id, scholarship_id: String(a.id) });
      if (!error) {
        toast("Saved to your list ♥");
        document.dispatchEvent(new CustomEvent("beacon:saved-changed", { detail: { id: String(a.id), saved: true } }));
      }
    } else if (a.type === "route" && a.href) {
      location.href = a.href;
    }
  }

  // Gate helper: returns true when signed in; otherwise stores the action,
  // opens the modal, and the action replays after sign-in (even via OAuth redirect).
  function requireAuth(pendingAction) {
    if (currentUser) return true;
    if (pendingAction) setPendingAction(pendingAction);
    openModal("signin");
    return false;
  }

  // ---- nav UI (FR-004/005) -------------------------------------------------------
  function avatarHtml(user) {
    let url = null;
    try { url = localStorage.getItem(AVATAR_KEY); } catch (e) {}
    if (!url) url = (user.user_metadata && (user.user_metadata.avatar_url || user.user_metadata.picture)) || null;
    if (url) return `<img class="nav-avatar-img" src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">`;
    const seed = user.email || (user.user_metadata && user.user_metadata.full_name) || "?";
    return `<span class="nav-avatar-letter">${esc(seed.charAt(0).toUpperCase())}</span>`;
  }

  function renderNav() {
    if (!slot) return;
    if (!currentUser) {
      slot.innerHTML = `<button class="nav-cta nav-signin" type="button">Sign in</button>`;
      slot.querySelector(".nav-signin").addEventListener("click", () => openModal("signin"));
      return;
    }
    slot.innerHTML = `
      <div class="nav-account">
        <button class="nav-avatar" type="button" aria-haspopup="true" aria-expanded="false" title="Your account">${avatarHtml(currentUser)}</button>
        <div class="nav-menu" hidden>
          <div class="nav-menu-id">${esc(currentUser.email || "Your account")}</div>
          <a href="account.html#profile">Account</a>
          <a href="account.html#saved">Saved</a>
          <a href="account.html#history">History</a>
          <button type="button" class="nav-signout">Sign out</button>
        </div>
      </div>`;
    const btn = slot.querySelector(".nav-avatar");
    const menu = slot.querySelector(".nav-menu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !menu.hidden;
      menu.hidden = open;
      btn.setAttribute("aria-expanded", String(!open));
    });
    document.addEventListener("click", () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); });
    slot.querySelector(".nav-signout").addEventListener("click", () => signOut());
  }

  async function signOut() {
    try { localStorage.removeItem(AVATAR_KEY); } catch (e) {}
    const { error } = await client.auth.signOut();
    if (error) { console.error(error); toast(GENERIC_ERR); }
  }

  // ---- banners: soft verification (F5) + missing email (F4) -----------------------
  function renderBanner() {
    let bar = document.getElementById("authBanner");
    const needEmail = currentUser && !currentUser.email;
    const needVerify = currentUser && currentUser.email && !currentUser.email_confirmed_at;
    if (!needEmail && !needVerify) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "authBanner";
      bar.className = "auth-banner";
      document.body.insertBefore(bar, document.body.firstChild.nextSibling);
    }
    if (needEmail) {
      bar.innerHTML = `
        <span>Add an email to finish setting up your account.</span>
        <form class="banner-email-form">
          <input type="email" required placeholder="you@example.com" />
          <button type="submit">Add email</button>
        </form>`;
      bar.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = bar.querySelector("input").value.trim();
        if (!email) return;
        const { error } = await client.auth.updateUser({ email });
        toast(error ? GENERIC_ERR : "Check your inbox to confirm your email.");
      });
    } else {
      bar.innerHTML = `
        <span>Please verify your email (${esc(currentUser.email)}) to unlock account linking.</span>
        <button type="button" class="banner-resend">Resend link</button>`;
      bar.querySelector(".banner-resend").addEventListener("click", async () => {
        const { error } = await client.auth.signInWithOtp({
          email: currentUser.email,
          options: { shouldCreateUser: false, emailRedirectTo: location.href.split("#")[0] },
        });
        toast(error ? GENERIC_ERR : "Verification link sent — check your inbox.");
      });
    }
  }

  // ---- auth state wiring -------------------------------------------------------
  client.auth.onAuthStateChange((event, session) => {
    const was = currentUser && currentUser.id;
    currentUser = (session && session.user) || null;
    renderNav();
    renderBanner();
    emit();
    if (event === "SIGNED_IN" && (!was || was !== currentUser.id)) replayPendingAction();
    if (event === "USER_UPDATED") renderBanner();
    // PASSWORD_RECOVERY is handled by account.js (#reset)
    if (event === "PASSWORD_RECOVERY" && !/account\.html/.test(location.pathname)) {
      location.href = "account.html#reset";
    }
  });

  // initial session restore (also completes OAuth redirects via detectSessionInUrl)
  client.auth.getSession().then(({ data }) => {
    currentUser = (data.session && data.session.user) || null;
    renderNav();
    renderBanner();
    emit();
    if (currentUser) replayPendingAction();
  });

  window.BeaconAuth = { client, getUser, onChange, requireAuth, openModal, signOut, toast };
})();
