/* Word wall: local rigid rectangles, pointer interaction, optional device tilt. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WordWall = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const mounted = new WeakMap();
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const axes = b => [{ x: Math.cos(b.angle), y: Math.sin(b.angle) }, { x: -Math.sin(b.angle), y: Math.cos(b.angle) }];
  const inverseMass = b => b.fixed ? 0 : 1 / Math.max(1, b.width * b.height / 2000);
  const inverseInertia = b => 12 * inverseMass(b) / Math.max(1, b.width * b.width + b.height * b.height);

  function extents(b) {
    const c = Math.abs(Math.cos(b.angle)), s = Math.abs(Math.sin(b.angle));
    return { x: (b.width * c + b.height * s) / 2, y: (b.width * s + b.height * c) / 2 };
  }

  // Separating-axis test uses the rotated rectangles, not their enclosing boxes.
  function overlap(a, b) {
    const aa = axes(a), ba = axes(b), dx = b.x - a.x, dy = b.y - a.y;
    let depth = Infinity, normal;
    for (const axis of aa.concat(ba)) {
      const dot = (u, v) => Math.abs(u.x * v.x + u.y * v.y);
      const ar = a.width / 2 * dot(aa[0], axis) + a.height / 2 * dot(aa[1], axis);
      const br = b.width / 2 * dot(ba[0], axis) + b.height / 2 * dot(ba[1], axis);
      const distance = dx * axis.x + dy * axis.y, penetration = ar + br - Math.abs(distance);
      if (penetration <= 0) return null;
      if (penetration < depth) {
        depth = penetration;
        const sign = distance < 0 ? -1 : 1;
        normal = { x: axis.x * sign, y: axis.y * sign };
      }
    }
    return { depth, normal };
  }

  function support(b, n) {
    const basis = axes(b), p = { x: b.x, y: b.y };
    for (let i = 0; i < 2; i++) {
      const dot = basis[i].x * n.x + basis[i].y * n.y;
      const distance = (i ? b.height : b.width) / 2 * (Math.abs(dot) < 0.001 ? 0 : Math.sign(dot));
      p.x += basis[i].x * distance; p.y += basis[i].y * distance;
    }
    return p;
  }

  function collide(a, b) {
    const hit = overlap(a, b), imA = inverseMass(a), imB = inverseMass(b), sum = imA + imB;
    if (!hit || !sum) return false;
    const n = hit.normal, correction = Math.max(0, hit.depth - 0.15) * 0.85 / sum;
    a.x -= n.x * correction * imA; a.y -= n.y * correction * imA;
    b.x += n.x * correction * imB; b.y += n.y * correction * imB;
    const pa = support(a, n), pb = support(b, { x: -n.x, y: -n.y });
    const p = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const ra = { x: p.x - a.x, y: p.y - a.y }, rb = { x: p.x - b.x, y: p.y - b.y };
    const iiA = inverseInertia(a), iiB = inverseInertia(b);
    const velocity = () => ({ x: b.vx - b.omega * rb.y - a.vx + a.omega * ra.y, y: b.vy + b.omega * rb.x - a.vy - a.omega * ra.x });
    const effective = axis => sum + cross(ra, axis) ** 2 * iiA + cross(rb, axis) ** 2 * iiB;
    const apply = (axis, amount) => {
      const impulse = { x: axis.x * amount, y: axis.y * amount };
      a.vx -= impulse.x * imA; a.vy -= impulse.y * imA; a.omega -= cross(ra, impulse) * iiA;
      b.vx += impulse.x * imB; b.vy += impulse.y * imB; b.omega += cross(rb, impulse) * iiB;
    };
    const relative = velocity(), closing = relative.x * n.x + relative.y * n.y;
    if (closing < 0) {
      // Little bounce at rest prevents a stationary pile from continually vibrating.
      const impulse = -(1 + (closing < -35 ? 0.24 : 0)) * closing / effective(n);
      apply(n, impulse);
      const tangent = { x: -n.y, y: n.x }, after = velocity();
      const friction = -(after.x * tangent.x + after.y * tangent.y) / effective(tangent);
      apply(tangent, clamp(friction, -impulse * 0.45, impulse * 0.45));
    }
    a.omega = clamp(a.omega, -8, 8); b.omega = clamp(b.omega, -8, 8);
    return true;
  }

  function contain(b, width, height, bounce = 0.32) {
    let edge = extents(b);
    if (edge.x * 2 > width || edge.y * 2 > height) { b.angle = 0; b.omega = 0; edge = extents(b); }
    const contact = (axis, extent, limit) => {
      const speed = axis === 'x' ? 'vx' : 'vy';
      if (extent * 2 >= limit) { b[axis] = limit / 2; b[speed] = 0; return; }
      if (b[axis] < extent) {
        b[axis] = extent;
        if (b[speed] < 0) b[speed] = Math.abs(b[speed]) < 22 ? 0 : -b[speed] * bounce;
        b.omega *= 0.88;
      } else if (b[axis] > limit - extent) {
        b[axis] = limit - extent;
        if (b[speed] > 0) b[speed] = Math.abs(b[speed]) < 22 ? 0 : -b[speed] * bounce;
        b.omega *= 0.88;
      }
    };
    contact('x', edge.x, width); contact('y', edge.y, height);
  }

  function step(bodies, width, height, elapsed, gravity = { x: 0, y: 720 }) {
    const dt = clamp(Number(elapsed) || 0, 0, 1 / 20);
    if (!dt || width <= 0 || height <= 0) return;
    const count = Math.ceil(dt / (1 / 120)), h = dt / count;
    for (let sub = 0; sub < count; sub++) {
      for (const b of bodies) if (!b.fixed) {
        const damp = Math.exp(-0.42 * h);
        b.vx = clamp((b.vx + gravity.x * h) * damp, -1600, 1600);
        b.vy = clamp((b.vy + gravity.y * h) * damp, -1600, 1600);
        b.omega *= Math.exp(-0.9 * h);
        b.x += b.vx * h; b.y += b.vy * h; b.angle = (b.angle + b.omega * h) % TAU;
      }
      for (let iteration = 0; iteration < 4; iteration++) {
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) collide(bodies[i], bodies[j]);
        for (const b of bodies) contain(b, width, height);
      }
    }
  }

  function tiltGravity(beta, gamma, screenAngle = 0) {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
    const radians = Math.PI / 180, angle = screenAngle * radians;
    const x = Math.sin(gamma * radians) * Math.cos(beta * radians) * 850;
    const y = Math.sin(beta * radians) * 850;
    return { x: x * Math.cos(angle) + y * Math.sin(angle), y: y * Math.cos(angle) - x * Math.sin(angle) };
  }

  // Place the measured, rotated labels once. No simulation is needed for stickers.
  // The extra three pixels around each label also leave room for its white outline.
  function placeStickers(bodies, width, height, flat = false) {
    if (!bodies.length || width <= 0 || height <= 0) return 0;
    const gap = 6, columns = Math.max(2, Math.round(Math.sqrt(bodies.length * width / Math.max(height * 0.7, 1))));
    const rows = Math.ceil(bodies.length / columns), anchors = bodies.map((b, i) => ({
      x: width * ((i % columns + 0.5) / columns + (i % 2 ? 0.035 : -0.035)),
      y: height * (0.28 + (Math.floor(i / columns) + 0.5) / rows * 0.6)
    }));
    const order = bodies.map((b, i) => ({ b, i })).sort((a, b) => b.b.width * b.b.height - a.b.width * a.b.height);
    let best = null, bestCost = Infinity;
    for (const [top, angleScale] of [[0.28, 1], [0.16, 0.8], [0.04, 0.55]]) {
      const placed = [];
      for (const { b, i } of order) {
        b.angle = flat ? 0 : ((i * 7 % 11) - 5) * 0.045 * angleScale;
        const padded = { ...b, width: b.width + gap, height: b.height + gap };
        if (extents(padded).x * 2 > width || extents(padded).y * 2 > height) b.angle = padded.angle = 0;
        const e = extents(padded), minX = Math.min(width / 2, e.x), maxX = Math.max(width / 2, width - e.x);
        const minY = Math.min(height - e.y, Math.max(e.y, height * top + e.y)), maxY = Math.max(minY, height - e.y);
        const anchor = { x: clamp(anchors[i].x, minX, maxX), y: clamp(anchors[i].y, minY, maxY) };
        const candidates = [anchor], stride = Math.max(4, Math.min(9, b.height / 4));
        const nx = Math.max(1, Math.ceil((maxX - minX) / stride)), ny = Math.max(1, Math.ceil((maxY - minY) / stride));
        for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) candidates.push({ x: minX + (maxX - minX) * x / nx, y: minY + (maxY - minY) * y / ny });
        const distance = p => (p.x - anchor.x) ** 2 + (p.y - anchor.y) ** 2;
        candidates.sort((a, b) => distance(a) - distance(b));
        let chosen = anchor, penalty = Infinity;
        for (const p of candidates) {
          padded.x = p.x; padded.y = p.y;
          let cost = 0;
          for (const other of placed) { const hit = overlap(padded, other); if (hit) cost += hit.depth ** 2; }
          if (cost < penalty) { penalty = cost; chosen = p; }
          if (cost === 0) break;
        }
        b.x = chosen.x; b.y = chosen.y; b.vx = b.vy = b.omega = 0;
        contain(b, width, height, 0);
        placed.push({ ...b, width: b.width + gap, height: b.height + gap });
      }
      let cost = 0;
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const hit = overlap(bodies[i], bodies[j]); if (hit) cost += hit.depth ** 2;
      }
      if (cost < bestCost) { bestCost = cost; best = bodies.map(b => ({ x: b.x, y: b.y, angle: b.angle })); }
      if (cost === 0) break;
    }
    bodies.forEach((b, i) => Object.assign(b, best[i]));
    return bestCost;
  }

  function mount({ container, words = [], mode = 'cloud', label, onSelect, onMotionStatus } = {}) {
    if (!container || !container.ownerDocument) throw new TypeError('WordWall.mount needs a container element');
    mounted.get(container)?.destroy();
    const doc = container.ownerDocument, win = doc.defaultView;
    const listeners = [], bodies = [], currentMode = mode === 'stickers' ? 'stickers' : 'cloud';
    const mq = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduced = !!mq?.matches, alive = true, width = 0, height = 0, frame = null, lastTime = null;
    let pointer = null, observer = null, gravity = { x: 0, y: 720 }, status = '', userArranged = false, stickerFit = 1;
    let tiltPromise = null, tiltResolve = null, tiltTimer = null, tiltListener = null, tiltEnabled = false, tiltEpoch = 0;
    const now = () => win.performance?.now?.() ?? Date.now();
    const emit = value => { if (alive && status !== value) { status = value; onMotionStatus?.(value); } };
    const listen = (target, name, handler, options) => {
      target.addEventListener(name, handler, options);
      listeners.push(() => target.removeEventListener(name, handler, options));
    };
    const originalStyle = { position: container.style.position, overflow: container.style.overflow };
    const addedPosition = !win.getComputedStyle || win.getComputedStyle(container).position === 'static';
    if (addedPosition) container.style.position = 'relative';
    container.style.overflow = 'hidden';
    const hadClass = container.classList.contains('wordwall-stage');
    container.classList.add('wordwall-stage');

    function render() {
      for (const b of bodies) {
        b.element.style.left = `${(b.x - b.width / 2).toFixed(2)}px`;
        b.element.style.top = `${(b.y - b.height / 2).toFixed(2)}px`;
        b.element.style.transform = `rotate(${b.angle.toFixed(4)}rad)`;
      }
    }
    function pause() {
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null; lastTime = null;
    }
    function run(time) {
      frame = null;
      if (!alive || reduced || currentMode !== 'cloud' || doc.hidden || !width || !height || !bodies.length) return;
      step(bodies, width, height, lastTime === null ? 1 / 60 : (time - lastTime) / 1000, gravity);
      lastTime = time; render();
      frame = win.requestAnimationFrame(run);
    }
    function wake() {
      if (alive && !reduced && currentMode === 'cloud' && !doc.hidden && width && height && bodies.length && frame === null) frame = win.requestAnimationFrame(run);
    }
    function place(initial) {
      const count = bodies.length;
      if (currentMode === 'stickers' || reduced) return placeStickers(bodies, width, height, reduced);
      for (let i = 0; i < count; i++) {
        const b = bodies[i];
        if (initial) {
          b.x = (0.08 + Math.random() * 0.84) * width;
          b.y = (0.04 + (i / Math.max(count, 1)) * 0.55) * height;
          b.angle = (Math.random() - 0.5) * 1.5;
          b.vx = (Math.random() - 0.5) * 75; b.vy = 0; b.omega = (Math.random() - 0.5) * 1.1;
        }
        contain(b, width, height, 0);
      }
    }
    function resize() {
      if (!alive) return;
      if (pointer) release(null, true);
      const rect = container.getBoundingClientRect(), oldWidth = width, oldHeight = height;
      width = Math.max(0, container.clientWidth || rect.width || 0);
      height = Math.max(0, container.clientHeight || rect.height || 0);
      if (!width || !height) { pause(); return; }
      const staticLayout = currentMode === 'stickers' || reduced;
      if (!userArranged) stickerFit = 1;
      for (const b of bodies) {
        // Absolute auto-width labels otherwise measure against the space left at their old x position.
        b.element.style.left = '0px';
        b.element.style.fontSize = `${Math.max(12, b.baseSize * clamp(width / 390, 0.65, 1.4) * (staticLayout ? stickerFit : 1))}px`;
        b.element.style.maxWidth = `${Math.max(1, Math.min(176, width * .46))}px`;
        b.element.style.maxHeight = `${Math.max(1, height - 8)}px`;
      }
      const measure = () => {
        for (const b of bodies) {
          b.width = Math.max(1, Math.min(width, b.element.offsetWidth));
          b.height = Math.max(1, Math.min(height, b.element.offsetHeight));
        }
      };
      measure();
      const area = bodies.reduce((n, b) => n + b.width * b.height, 0), ratio = Math.min(1, Math.sqrt(width * height * 0.58 / Math.max(1, area)));
      if (ratio < 1) {
        if (staticLayout) stickerFit *= ratio;
        for (const b of bodies) b.element.style.fontSize = `${Math.max(12, parseFloat(b.element.style.fontSize) * ratio)}px`; measure();
      }
      if (!oldWidth || !oldHeight || (!userArranged && staticLayout)) {
        let cost = place(true);
        // Very long translations may need a little less type to fit without covering a neighbour.
        for (let attempt = 0; cost > 0.01 && attempt < 4; attempt++) {
          stickerFit *= 0.88;
          for (const b of bodies) b.element.style.fontSize = `${Math.max(12, parseFloat(b.element.style.fontSize) * 0.88)}px`;
          measure(); cost = place(true);
        }
      }
      else for (const b of bodies) { b.x *= width / oldWidth; b.y *= height / oldHeight; contain(b, width, height, 0); }
      render(); wake();
    }
    function point(event) {
      const rect = container.getBoundingClientRect();
      return { x: event.clientX - rect.left - (container.clientLeft || 0), y: event.clientY - rect.top - (container.clientTop || 0) };
    }
    function down(event, body) {
      if (!alive || pointer || (event.button !== undefined && event.button !== 0)) return;
      const p = point(event);
      pointer = { id: event.pointerId, body, startX: p.x, startY: p.y, dx: p.x - body.x, dy: p.y - body.y, x: body.x, y: body.y, time: now(), moved: false, vx: 0, vy: 0 };
      body.fixed = true; body.vx = body.vy = body.omega = 0;
      try { body.element.setPointerCapture(event.pointerId); } catch (_) { /* Window listeners also handle uncaptured pointers. */ }
    }
    function move(event) {
      if (!pointer || event.pointerId !== pointer.id) return;
      const p = point(event), drag = pointer, b = drag.body;
      if (!drag.moved && Math.hypot(p.x - drag.startX, p.y - drag.startY) < 6) return;
      drag.moved = true; userArranged = true; b.element.classList.add('is-dragging'); b.element.style.zIndex = '3';
      if (event.cancelable) event.preventDefault();
      const time = now(), elapsed = Math.max(8, time - drag.time) / 1000;
      b.x = p.x - drag.dx; b.y = p.y - drag.dy; contain(b, width, height, 0);
      drag.vx = clamp((b.x - drag.x) / elapsed * 0.65 + drag.vx * 0.35, -1250, 1250);
      drag.vy = clamp((b.y - drag.y) / elapsed * 0.65 + drag.vy * 0.35, -1250, 1250);
      drag.x = b.x; drag.y = b.y; drag.time = time;
      render(); wake();
    }
    function release(event, cancelled = false) {
      if (!pointer || (event && event.pointerId !== pointer.id)) return;
      const drag = pointer, b = drag.body; pointer = null;
      b.fixed = false; b.element.classList.remove('is-dragging'); b.element.style.zIndex = '';
      if (drag.moved || cancelled) b.suppressClickUntil = now() + 500;
      if (!cancelled && drag.moved && now() - drag.time < 120 && currentMode === 'cloud' && !reduced) {
        b.vx = drag.vx; b.vy = drag.vy; b.omega = clamp(drag.vx / 300, -4, 4);
      } else b.vx = b.vy = b.omega = 0;
      try { if (b.element.hasPointerCapture?.(drag.id)) b.element.releasePointerCapture(drag.id); } catch (_) { /* A cancelled pointer may already have lost capture. */ }
      wake();
    }

    const selected = Array.isArray(words) ? words.slice(0, 18) : [];
    for (let i = 0; i < selected.length; i++) {
      const word = selected[i], value = label ? label(word, i) : typeof word === 'string' ? word : word?.hz || word?.word || '';
      const text = value == null ? '' : String(value);
      if (!text.trim()) continue;
      const button = doc.createElement('button'); button.type = 'button'; button.className = 'wordwall-token';
      const characters = [...text];
      button.textContent = characters.length > 12 ? characters.slice(0, 11).join('').trimEnd() + '…' : text;
      button.setAttribute('aria-label', text); button.title = text; button.draggable = false;
      Object.assign(button.style, { position: 'absolute', left: '0px', top: '0px', touchAction: 'none', userSelect: 'none', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', boxSizing: 'border-box', transformOrigin: 'center center' });
      const body = { word, element: button, baseSize: currentMode === 'stickers' ? (i === 2 ? 48 : 23 + i % 4 * 2) : 23 + i % 3 * 2, x: 0, y: 0, width: 1, height: 1, angle: 0, vx: 0, vy: 0, omega: 0, fixed: false, suppressClickUntil: -1 };
      bodies.push(body); container.appendChild(button);
      listen(button, 'pointerdown', e => down(e, body));
      listen(button, 'click', e => {
        if (!alive) return;
        if (e.detail !== 0 && now() < body.suppressClickUntil) { e.preventDefault(); return; }
        onSelect?.(word);
      });
      listen(button, 'dragstart', e => e.preventDefault());
      listen(button, 'contextmenu', e => { if (pointer?.body === body) e.preventDefault(); });
    }
    listen(win, 'pointermove', move, { passive: false });
    listen(win, 'pointerup', e => release(e));
    listen(win, 'pointercancel', e => release(e, true));
    listen(win, 'blur', () => release(null, true));
    listen(win, 'resize', resize);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) { release(null, true); pause(); } else wake(); });
    if (win.ResizeObserver) { observer = new win.ResizeObserver(resize); observer.observe(container); }

    function removeTilt() {
      tiltEpoch++;
      if (tiltTimer !== null) win.clearTimeout(tiltTimer);
      tiltTimer = null;
      if (tiltListener) win.removeEventListener('deviceorientation', tiltListener);
      tiltListener = null; tiltEnabled = false;
      gravity = { x: 0, y: 720 };
    }
    function finishTilt(value, newStatus) {
      if (!value) removeTilt();
      if (newStatus) emit(newStatus);
      const resolve = tiltResolve; tiltResolve = null; tiltPromise = null; resolve?.(value);
    }
    function enableTilt() {
      if (!alive) return Promise.resolve(false);
      if (reduced) { emit('reduced-motion'); return Promise.resolve(false); }
      if (currentMode !== 'cloud' || !win.DeviceOrientationEvent || win.isSecureContext === false) { emit('unavailable'); return Promise.resolve(false); }
      if (tiltEnabled) return Promise.resolve(true);
      if (tiltPromise) return tiltPromise;
      const pending = new Promise(resolve => { tiltResolve = resolve; }); tiltPromise = pending;
      const requestEpoch = ++tiltEpoch;
      emit('requesting');
      const start = permission => {
        if (!alive || reduced || !tiltResolve || requestEpoch !== tiltEpoch) return;
        if (permission !== 'granted') { finishTilt(false, 'denied'); return; }
        tiltListener = e => {
          if (!alive || reduced || requestEpoch !== tiltEpoch) return;
          const angle = win.screen?.orientation?.angle ?? win.orientation ?? 0;
          const next = tiltGravity(e.beta, e.gamma, typeof angle === 'number' ? angle : 0);
          if (!next) return;
          gravity = { x: gravity.x * 0.65 + next.x * 0.35, y: gravity.y * 0.65 + next.y * 0.35 };
          if (!tiltEnabled) {
            tiltEnabled = true;
            if (tiltTimer !== null) win.clearTimeout(tiltTimer); tiltTimer = null;
            finishTilt(true, 'enabled');
          }
          wake();
        };
        win.addEventListener('deviceorientation', tiltListener);
        tiltTimer = win.setTimeout(() => finishTilt(false, 'unavailable'), 1500);
      };
      // requestPermission is called synchronously in this user-triggered method.
      try {
        const Ctor = win.DeviceOrientationEvent;
        if (typeof Ctor.requestPermission === 'function') Promise.resolve(Ctor.requestPermission()).then(start, () => { if (requestEpoch === tiltEpoch) finishTilt(false, 'denied'); });
        else start('granted');
      } catch (_) { finishTilt(false, 'denied'); }
      return pending;
    }
    function motionPreference(event) {
      if (!alive) return;
      reduced = !!event.matches; release(null, true); pause();
      if (reduced) { finishTilt(false, 'reduced-motion'); if (!userArranged) place(false); render(); }
      else { emit('idle'); wake(); }
    }
    if (mq?.addEventListener) listen(mq, 'change', motionPreference);
    else if (mq?.addListener) { mq.addListener(motionPreference); listeners.push(() => mq.removeListener(motionPreference)); }
    function destroy() {
      if (!alive) return;
      alive = false; release(null, true); pause(); removeTilt(); finishTilt(false);
      observer?.disconnect(); listeners.splice(0).forEach(remove => remove());
      for (const b of bodies) b.element.remove();
      if (addedPosition && container.style.position === 'relative') container.style.position = originalStyle.position;
      if (container.style.overflow === 'hidden') container.style.overflow = originalStyle.overflow;
      if (!hadClass) container.classList.remove('wordwall-stage');
      if (mounted.get(container) === controller) mounted.delete(container);
    }
    const controller = { destroy, enableTilt };
    mounted.set(container, controller);
    resize(); emit(reduced ? 'reduced-motion' : 'idle');
    // Font loading can change collision dimensions after the first layout.
    doc.fonts?.ready?.then(() => { if (alive) resize(); });
    return controller;
  }
  return { mount, physics: Object.freeze({ overlap, collide, contain, step, extents, tiltGravity, placeStickers }) };
});
