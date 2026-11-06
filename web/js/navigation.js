"use strict";
/* Per-history-entry navigation state. No learning data or conversation is stored. */
(function (root, factory) {
  const createNavigation = factory();
  if (typeof module === "object" && module.exports) module.exports = { createNavigation };
  if (root?.document && root?.history) root.HanyuNavigation = createNavigation(root);
})(typeof window === "undefined" ? null : window, function () {
  return function createNavigation(win) {
    const KEY = "hanyutong-navigation-v1", TAG = "hanyuNavigation", MAX = 60;
    const entries = new Map(); let active = null, replacement = null, serial = 0, interactedSerial = -1, frame = null, timer = null, observer = null;
    const validHash = value => typeof value === "string" && /^#\/[A-Za-z0-9%/_:.-]*$/.test(value) && value.length <= 1200;
    const cleanHash = value => validHash(value) ? value : "#/home";
    const validID = value => typeof value === "string" && /^[a-z0-9-]{1,90}$/.test(value);
    const validEntry = value => value && validID(value.id) && validHash(value.hash) &&
      Number.isFinite(value.y) && value.y >= 0 && value.y <= 10000000 && (value.previous === null || validID(value.previous));
    try {
      const stored = JSON.parse(win.sessionStorage.getItem(KEY));
      if (Array.isArray(stored) && stored.length <= MAX) for (const entry of stored) if (validEntry(entry)) entries.set(entry.id, entry);
    } catch (_) {}
    const persist = () => {
      while (entries.size > MAX) entries.delete(entries.keys().next().value);
      try { win.sessionStorage.setItem(KEY, JSON.stringify([...entries.values()])); } catch (_) {}
    };
    try { win.history.scrollRestoration = "manual"; } catch (_) {}
    const remember = () => {
      // Native traversal can change location before dispatching hashchange. Do
      // not overwrite the departing entry with the incoming page's position.
      if (!active || cleanHash(win.location.hash) !== active.hash) return;
      active.y = Math.min(10000000, Math.max(0, Number(win.scrollY) || 0)); persist();
    };
    const cancelRestore = () => {
      if (frame !== null) win.cancelAnimationFrame(frame);
      if (timer !== null) win.clearTimeout(timer);
      frame = timer = null; observer?.disconnect(); observer = null;
    };
    const current = token => !!token && token.serial === serial && token.id === active?.id && token.hash === cleanHash(win.location.hash);
    const begin = hash => {
      cancelRestore();
      const target = cleanHash(hash), saved = win.history.state?.[TAG];
      // Re-rendering the same history entry must not create a false parent.
      if (active && target === active.hash && saved?.id === active.id) remember();
      let entry = replacement?.hash === target && active?.id === replacement.id
        ? { ...active, hash: target, y: 0 } : validID(saved?.id) ? entries.get(saved.id) : null;
      replacement = null;
      if (!entry || entry.hash !== target) {
        const id = (win.crypto?.randomUUID?.() || Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)).toLowerCase();
        entry = { id, hash: target, y: 0, previous: active?.id || null };
        entries.set(id, entry);
      }
      entries.set(entry.id, entry);
      active = entry;
      try { win.history.replaceState({ ...(win.history.state || {}), [TAG]: { id: entry.id } }, ""); } catch (_) {}
      persist();
      return { id: entry.id, hash: target, y: entry.y, serial: ++serial };
    };
    const finish = (token, container) => {
      if (!current(token) || interactedSerial === token.serial) return;
      cancelRestore();
      let cancelled = false;
      const restore = () => {
        frame = null;
        if (cancelled || !current(token) || interactedSerial === token.serial) return;
        win.scrollTo({ left: 0, top: token.y, behavior: "instant" });
        // A short page may grow after fonts/images resolve. Retry only while
        // it cannot yet reach the saved position, never after user interaction.
        if (Math.abs((Number(win.scrollY) || 0) - token.y) < 2) { cancelled = true; cancelRestore(); }
      };
      const schedule = () => { if (frame === null && !cancelled && current(token) && interactedSerial !== token.serial) frame = win.requestAnimationFrame(restore); };
      if (typeof win.ResizeObserver === "function" && container) {
        observer = new win.ResizeObserver(schedule); observer.observe(container);
      }
      timer = win.setTimeout(() => { cancelled = true; if (current(token)) cancelRestore(); }, 2500);
      // Wait for the completed route's DOM/layout, including synchronous filters.
      frame = win.requestAnimationFrame(() => { frame = null; schedule(); });
    };
    const previous = () => active?.previous ? entries.get(active.previous) : null;
    const backHref = fallback => previous()?.hash || cleanHash(fallback);
    const back = fallback => {
      remember(); cancelRestore();
      if (previous()) win.history.back();
      else win.location.hash = cleanHash(fallback);
    };
    const replace = hash => {
      remember(); cancelRestore();
      replacement = { hash: cleanHash(hash), id: active?.id };
      win.location.replace(replacement.hash);
    };
    const isSameRouteTraversal = () => {
      const target = entries.get(win.history.state?.[TAG]?.id);
      return !!active && !!target && target.id !== active.id && target.hash === active.hash && target.hash === cleanHash(win.location.hash);
    };
    win.addEventListener("scroll", remember, { passive: true });
    win.addEventListener("pagehide", remember);
    // Remember before a link changes the hash, including a click at the end of
    // a fast swipe. Modified clicks keep native new-tab behaviour.
    win.document.addEventListener("click", remember, true);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"]) win.addEventListener(event, () => { interactedSerial = serial; cancelRestore(); }, { passive: true });
    return Object.freeze({ begin, finish, current, backHref, back, replace, remember, isSameRouteTraversal });
  };
});
