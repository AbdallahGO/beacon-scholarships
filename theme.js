// Light/dark theme: applies the saved (or system) theme immediately to avoid a
// flash of the wrong theme — load this synchronously in <head> on every page.
// The toggle animates with a circular reveal via the View Transitions API where
// supported (Chromium/Edge); other browsers fall back to plain CSS transitions.
(function () {
  function getPref() {
    try { return localStorage.getItem("beacon-theme"); } catch (e) { return null; }
  }
  function setPref(t) {
    try { localStorage.setItem("beacon-theme", t); } catch (e) { /* default-only */ }
  }

  const systemDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  let theme = getPref() || (systemDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);

  function applyTheme(next, x, y) {
    const swap = () => document.documentElement.setAttribute("data-theme", next);
    if (document.startViewTransition) {
      const vt = document.startViewTransition(swap);
      vt.ready.then(() => {
        const r = Math.hypot(
          Math.max(x, innerWidth - x),
          Math.max(y, innerHeight - y)
        );
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
          { duration: 650, easing: "cubic-bezier(.2,.7,.3,1)", pseudoElement: "::view-transition-new(root)" }
        );
      });
    } else {
      swap();
    }
    theme = next;
    setPref(next);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("themeToggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const rect = btn.getBoundingClientRect();
      applyTheme(
        theme === "dark" ? "light" : "dark",
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
    });
  });
})();
