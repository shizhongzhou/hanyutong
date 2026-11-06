'use strict';
// Small host controller. The 3D engine and 5.3 MB model load only near the
// visible classic composer. Reduced-motion/save-data keeps the loaded model still.
window.HomePet = (() => {
  const scriptURL = document.currentScript?.src || new URL('js/home-pet.js', document.baseURI).href;
  const FRAME_URL = new URL('../assets/red-panda/frame.html?v=6', scriptURL).href;
  const ORIGIN = new URL(FRAME_URL).origin, WIDTH = 180;
  const actions = ['Tap', 'TailWag', 'Happy', 'Sleep'];
  const automaticActions = ['Idle', 'TailWag', 'Walk', 'Happy', 'Tap', 'Sleep'];
  let current = null;
  function mount({ container, boundary = container } = {}) {
    unmount();
    if (!container || typeof container.append !== 'function') return null;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const controller = new AbortController(), signal = controller.signal;
    let destroyed = false, loaded = false, failed = false, suspended = false, frame = null, visible = !window.IntersectionObserver;
    let userPaused = false, saveData = !!navigator.connection?.saveData, reduced = !!motion?.matches || saveData;
    let loadTimer = null, idleTimer = null, actionTimer = null, scheduled = null, walk = null;
    let actionBag = [], lastAutomatic = null, currentAction = 'Idle', restorePose = false;
    let x = 0, maxX = 0, positioned = false, clickCount = 0, pendingAction = null, observer = null, resizeObserver = null;
    let resolveReady;
    const ready = new Promise(resolve => { resolveReady = resolve; });
    const actor = document.createElement('div'); actor.className = 'home-pet-actor';
    container.append(actor); container.dataset.petState = 'waiting';
    const post = (type, data = {}) => { if (!destroyed && frame?.contentWindow) try { frame.contentWindow.postMessage({ source: 'hanyu-home-pet', type, ...data }, ORIGIN); } catch (_) {} };
    const active = () => !destroyed && !suspended && loaded && visible && !document.hidden && !userPaused;
    const setPosition = () => { actor.style.transform = `translateX(${Math.round(x * 10) / 10}px)`; };
    function measure() {
      maxX = Math.max(0, Math.min(container.getBoundingClientRect().width, boundary?.getBoundingClientRect?.().width || Infinity) - WIDTH);
      x = positioned ? Math.min(maxX, Math.max(0, x)) : Math.max(0, maxX - 12); positioned = true;
      if (walk) walk.target = Math.max(0, Math.min(maxX, walk.target));
      setPosition();
    }
    function stopWalk() { walk = null; }
    function clearSchedule() { clearTimeout(actionTimer); actionTimer = null; scheduled = null; }
    function suspendSchedule() {
      if (actionTimer !== null) {
        clearTimeout(actionTimer); actionTimer = null;
        if (scheduled) scheduled.remaining = Math.max(0, scheduled.deadline - performance.now());
      }
    }
    function armSchedule() {
      if (!scheduled || actionTimer !== null || !active() || reduced) return;
      scheduled.deadline = performance.now() + scheduled.remaining;
      actionTimer = setTimeout(() => {
        actionTimer = null;
        if (!scheduled) return;
        if (!active() || reduced) { scheduled.remaining = 0; return; }
        const kind = scheduled.kind; scheduled = null;
        if (kind === 'wake') perform('Tap');
        else if (kind === 'walk-end') finishWalk();
        else perform(nextAutomatic());
      }, scheduled.remaining);
    }
    function schedule(kind, delay) {
      clearSchedule(); scheduled = { kind, remaining: delay }; armSchedule();
    }
    function scheduleAction() { schedule('next', 9000 + Math.random() * 6000); }
    function nextAutomatic() {
      if (!actionBag.length) {
        actionBag = [...automaticActions];
        for (let i = actionBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [actionBag[i], actionBag[j]] = [actionBag[j], actionBag[i]];
        }
        if (actionBag[0] === lastAutomatic) [actionBag[0], actionBag[1]] = [actionBag[1], actionBag[0]];
      }
      lastAutomatic = actionBag.shift(); return lastAutomatic;
    }
    function finishWalk() {
      stopWalk(); clearSchedule(); currentAction = 'Idle';
      post('play', { name: 'Idle' }); scheduleAction();
    }
    function perform(name) {
      stopWalk(); clearSchedule(); currentAction = name;
      if (name === 'Walk' && maxX > 10 && !reduced && !userPaused) {
        const padding = Math.min(5, maxX / 4);
        const target = x > maxX / 2 ? Math.max(padding, x - 40 - Math.random() * 35) : Math.min(maxX - padding, x + 40 + Math.random() * 35);
        walk = { target };
        // The frame's planted-paw motion is the only source of horizontal travel.
        post('play', { name: 'Walk', direction: Math.sign(target - x), duration: 20000 });
        schedule('walk-end', 20000);
      } else {
        if (name === 'Walk') currentAction = name = 'Idle'; // Too little edge space: no sliding in place.
        post('play', { name, reduced: reduced || userPaused });
        if (name === 'Sleep') schedule('wake', 60000 + Math.floor(Math.random() * 60001));
        else scheduleAction();
      }
    }
    function sync() {
      post('look-reset');
      if (!active()) { suspendSchedule(); post('pause'); }
      else if (reduced) { suspendSchedule(); restorePose = true; post('still'); }
      else {
        if (restorePose) {
          restorePose = false;
          if (walk) post('play', { name: 'Walk', direction: Math.sign(walk.target - x), duration: 20000 });
          else post('play', { name: currentAction });
        }
        post('resume');
        if (scheduled) armSchedule(); else scheduleAction();
      }
      if (!loaded && !failed && !suspended && visible && !document.hidden) deferLoad();
    }
    function fail() {
      if (destroyed || failed) return;
      failed = true; loaded = false; clearTimeout(loadTimer); clearSchedule(); stopWalk(); post('destroy');
      frame?.remove(); frame = null; container.dataset.petState = 'unavailable';
      actor.hidden = true;
      resolveReady(false);
    }
    function load() {
      idleTimer = null;
      if (destroyed || frame || failed || suspended || document.hidden || !visible) return;
      container.dataset.petState = 'loading';
      frame = document.createElement('iframe'); frame.className = 'home-pet-frame'; frame.title = 'Красная панда';
      frame.tabIndex = 0; frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; autoplay 'none'"); frame.referrerPolicy = 'no-referrer';
      frame.src = FRAME_URL; frame.addEventListener('error', fail, { signal }); actor.prepend(frame);
      loadTimer = setTimeout(fail, 25000);
    }
    function deferLoad() { if (idleTimer !== null || frame || failed || destroyed) return; idleTimer = setTimeout(load, 120); }
    function play(name = actions[clickCount++ % actions.length]) {
      if (destroyed || failed || !automaticActions.includes(name)) return false;
      if (!loaded) { pendingAction = name; deferLoad(); return true; }
      if (!visible || document.hidden) return false;
      perform(name);
      return true;
    }
    function pause() { userPaused = true; sync(); }
    function resume() { userPaused = false; sync(); }
    function destroy() {
      if (destroyed) return;
      post('destroy'); destroyed = true; controller.abort(); clearTimeout(loadTimer); clearTimeout(idleTimer); clearSchedule(); stopWalk();
      observer?.disconnect(); resizeObserver?.disconnect(); motion?.removeEventListener?.('change', onMotion);
      frame?.remove(); frame = null; actor.remove(); delete container.dataset.petState; resolveReady(false);
      if (current === api) current = null;
    }
    function onMotion(event) { reduced = !!event.matches || saveData; sync(); }
    window.addEventListener('message', event => {
      if (destroyed || !frame || event.source !== frame.contentWindow || event.origin !== ORIGIN) return;
      let value = event.data; if (typeof value === 'string') { if (value.length > 1000) return; try { value = JSON.parse(value); } catch (_) { return; } }
      if (!value || typeof value !== 'object') return;
      if (value.type === 'error') { fail(); return; }
      if (value.type === 'walk-step' && walk && active() && !reduced && Number.isFinite(value.pixels) && value.pixels > 0 && value.pixels <= 5) {
        const distance = walk.target - x;
        x = Math.max(0, Math.min(maxX, x + Math.sign(distance) * Math.min(Math.abs(distance), value.pixels))); setPosition();
        if (Math.abs(walk.target - x) < .05) finishWalk();
      }
      if (['tap', 'doubleTap', 'interact'].includes(value.type)) {
        // The original frame already plays the native tap/wake reaction.
        // Standalone wake also comes from programmatic still/Idle changes, so
        // only explicit input messages cancel a saved sleep deadline.
        currentAction = value.type === 'doubleTap' || value.type === 'interact' ? 'Happy' : 'Tap';
        stopWalk(); clearSchedule(); scheduleAction();
      }
      if (value.type === 'ready' && !loaded) {
        clearTimeout(loadTimer); loaded = true; container.dataset.petState = 'ready'; resolveReady(true); sync();
        if (pendingAction) { const name = pendingAction; pendingAction = null; play(name); }
      }
    }, { signal });
    document.addEventListener('visibilitychange', sync, { signal });
    window.addEventListener('pagehide', event => { if (event.persisted) { suspended = true; sync(); } else destroy(); }, { signal });
    window.addEventListener('pageshow', event => { if (event.persisted) { suspended = false; sync(); } }, { signal });
    window.addEventListener('resize', measure, { signal });
    motion?.addEventListener?.('change', onMotion);
    if (window.ResizeObserver) { resizeObserver = new ResizeObserver(measure); resizeObserver.observe(container); if (boundary && boundary !== container) resizeObserver.observe(boundary); }
    if (window.IntersectionObserver) { observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); }, { rootMargin: '60px' }); observer.observe(container); }
    const api = { ready, play, pause, resume, destroy }; current = api; measure(); sync(); return api;
  }
  function unmount() { current?.destroy(); }
  return Object.freeze({ mount, unmount });
})();
