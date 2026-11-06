'use strict';
// Small host controller. The 3D engine and 5.3 MB model load only near the
// visible classic composer. Reduced-motion/save-data keeps the loaded model still.
window.HomePet = (() => {
  const scriptURL = document.currentScript?.src || new URL('js/home-pet.js', document.baseURI).href;
  const FRAME_URL = new URL('../assets/red-panda/frame.html?v=4', scriptURL).href;
  const ORIGIN = new URL(FRAME_URL).origin, WIDTH = 180;
  const actions = ['Tap', 'TailWag', 'Happy', 'Sleep'];
  let current = null;
  function mount({ container, boundary = container } = {}) {
    unmount();
    if (!container || typeof container.append !== 'function') return null;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const controller = new AbortController(), signal = controller.signal;
    let destroyed = false, loaded = false, failed = false, suspended = false, frame = null, visible = !window.IntersectionObserver;
    let userPaused = false, saveData = !!navigator.connection?.saveData, reduced = !!motion?.matches || saveData;
    let loadTimer = null, idleTimer = null, actionTimer = null, walk = null, lastInteraction = performance.now();
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
    function scheduleAction() {
      clearTimeout(actionTimer); actionTimer = null;
      if (!active() || reduced) return;
      actionTimer = setTimeout(() => {
        if (!active() || reduced) return;
        if (performance.now() - lastInteraction > 90000) { post('play', { name: 'Sleep' }); return; }
        if (maxX > 65 && Math.random() < .45) {
          const target = x > maxX / 2 ? Math.max(5, x - 40 - Math.random() * 35) : Math.min(maxX - 5, x + 40 + Math.random() * 35);
          stopWalk(); walk = { target };
          // The frame cancels the animated support paw's backward displacement.
          // Leg amplitude and screen travel therefore remain coupled.
          post('play', { name: 'Walk', direction: Math.sign(target - x), duration: 20000 });
          actionTimer = setTimeout(() => { stopWalk(); post('play', { name: 'Idle' }); scheduleAction(); }, 20000);
        } else { post('play', { name: Math.random() < .7 ? 'TailWag' : 'Happy' }); scheduleAction(); }
      }, 9000 + Math.random() * 6000);
    }
    function sync() {
      clearTimeout(actionTimer); actionTimer = null;
      post('look-reset');
      if (!active()) { stopWalk(); post('pause'); }
      else if (reduced) { stopWalk(); post('still'); }
      else { post('play', { name: 'Idle' }); post('resume'); scheduleAction(); }
      if (!loaded && !failed && !suspended && visible && !document.hidden) deferLoad();
    }
    function fail() {
      if (destroyed || failed) return;
      failed = true; loaded = false; clearTimeout(loadTimer); clearTimeout(actionTimer); stopWalk(); post('destroy');
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
      if (destroyed || failed || !['Idle', 'Tap', 'TailWag', 'Happy', 'Sleep'].includes(name)) return false;
      lastInteraction = performance.now();
      if (!loaded) { pendingAction = name; deferLoad(); return true; }
      if (!visible || document.hidden) return false;
      stopWalk(); clearTimeout(actionTimer); actionTimer = null;
      post('play', { name, reduced: reduced || userPaused });
      if (!reduced && !userPaused && name !== 'Sleep') scheduleAction();
      return true;
    }
    function pause() { userPaused = true; sync(); }
    function resume() { userPaused = false; sync(); }
    function destroy() {
      if (destroyed) return;
      post('destroy'); destroyed = true; controller.abort(); clearTimeout(loadTimer); clearTimeout(idleTimer); clearTimeout(actionTimer); stopWalk();
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
        if (Math.abs(walk.target - x) < .05) { stopWalk(); clearTimeout(actionTimer); post('play', { name: 'Idle' }); scheduleAction(); }
      }
      if (['tap', 'doubleTap', 'interact'].includes(value.type)) {
        lastInteraction = performance.now(); stopWalk(); clearTimeout(actionTimer); scheduleAction();
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
