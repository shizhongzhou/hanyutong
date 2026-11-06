'use strict';
// Fixed local asset; this frame accepts only bounded actions from its own host.
window.PET_CONFIG = Object.freeze({ modelUrl: 'red_panda.glb', sleepAfter: 90, walk: false, scale: 1, manualAnimations: true });
(() => {
  const names = new Set(['Idle', 'Tap', 'TailWag', 'Happy', 'Walk', 'Sleep']);
  let timer = null, paused = true, reduced = false, destroyed = false;
  const canvas = document.getElementById('pet-canvas');
  const report = type => { try { window.parent.postMessage(JSON.stringify({ type }), location.origin); } catch (_) {} };
  window.addEventListener('error', () => report('error'));
  window.addEventListener('unhandledrejection', () => report('error'));
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (!destroyed) report('error'); });
  function interact() {
    if (destroyed || document.hidden || !window.pet) return;
    clearTimeout(timer); window.pet.setPaused(false);
    if (reduced || paused) timer = setTimeout(() => { window.pet.play('Idle', true); window.pet.setPaused(true); window.pet.renderOnce(); }, 1450);
  }
  canvas.addEventListener('pointerup', interact);
  for (const type of ['pointercancel', 'pointerleave']) canvas.addEventListener(type, () => { window.pet?.cancelPointer?.(); window.pet?.lookAt(null); });
  canvas.addEventListener('pointerdown', () => canvas.blur());
  canvas.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && window.pet) { event.preventDefault(); window.pet.happy(); interact(); report('interact'); }
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin || destroyed || !event.data || event.data.source !== 'hanyu-home-pet') return;
    const pet = window.pet, message = event.data;
    if (!pet) return;
    if (message.type === 'destroy') { destroyed = true; clearTimeout(timer); pet.destroy(); return; }
    if (message.type === 'pause') { paused = true; clearTimeout(timer); pet.setPaused(true); return; }
    if (message.type === 'resume') { paused = false; reduced = false; pet.setPaused(false); return; }
    if (message.type === 'still') { paused = true; reduced = true; clearTimeout(timer); pet.play('Idle', true); pet.setPaused(true); pet.renderOnce(); return; }
    if (message.type === 'look-reset') { pet.lookAt(null); return; }
    if (message.type === 'look' && Number.isFinite(message.x) && Number.isFinite(message.y)) {
      if (!paused) pet.lookAt(Math.max(0, Math.min(1, message.x)), Math.max(0, Math.min(1, message.y)));
      return;
    }
    if (message.type === 'play' && names.has(message.name)) {
      clearTimeout(timer);
      const limited = message.reduced === true;
      if (message.name === 'Walk') pet.setFacing(Math.sign(message.direction || 0));
      if (message.name === 'Sleep') pet.sleep();
      else pet.play(message.name, ['Idle', 'Walk'].includes(message.name));
      pet.setPaused(false);
      if (limited || message.name === 'Walk') {
        const duration = limited ? 1450 : Math.max(300, Math.min(20000, Number(message.duration) || 1200));
        timer = setTimeout(() => { pet.play('Idle', true); pet.setPaused(paused || limited); pet.renderOnce(); }, duration);
      }
    }
  });
  window.addEventListener('pagehide', event => {
    clearTimeout(timer);
    if (event.persisted) { window.pet?.setPaused(true); return; }
    destroyed = true; window.pet?.destroy();
  });
})();
