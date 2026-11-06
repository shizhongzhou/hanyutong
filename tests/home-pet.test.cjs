const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'web/js/home-pet.js'), 'utf8');

function fixture({ reduced = false, saveData = false, hidden = false, random = () => 0 } = {}) {
  const timers = new Map(), frames = new Map(), intersections = [], resizes = []; let id = 0, now = 1000;
  class Element extends EventTarget {
    constructor(tag = 'div') { super(); this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.attrs = {}; this.width = 344; this.hidden = false;
      if (tag === 'iframe') this.contentWindow = { messages: [], postMessage(value, origin) { this.messages.push({ value, origin }); } };
    }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    prepend(node) { node.parent = this; this.children.unshift(node); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getBoundingClientRect() { return { width: this.width, height: 110, left: 0, top: 0 }; }
  }
  const document = Object.assign(new EventTarget(), { hidden, currentScript: { src: 'https://app.test/hanyutong/js/home-pet.js' }, baseURI: 'https://app.test/hanyutong/', createElement: tag => new Element(tag) });
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  class IntersectionObserver { constructor(callback) { this.callback = callback; this.disconnected = false; intersections.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  class ResizeObserver { constructor(callback) { this.callback = callback; this.disconnected = false; resizes.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  const window = Object.assign(new EventTarget(), { matchMedia: () => motion, IntersectionObserver, ResizeObserver });
  const stableMath = Object.create(Math); stableMath.random = random;
  const context = { window, document, navigator: { connection: { saveData } }, URL, AbortController, IntersectionObserver, ResizeObserver, Math: stableMath,
    performance: { now: () => now }, setTimeout: (fn, ms) => { timers.set(++id, { fn, ms, due: now + ms }); return id; }, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { frames.set(++id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id), console };
  vm.runInNewContext(source, context);
  const container = new Element(), boundary = new Element('form'); boundary.value = 'keep my text';
  const mount = () => window.HomePet.mount({ container, boundary });
  const dispatch = (target, type, props = {}) => target.dispatchEvent(Object.assign(new Event(type), props));
  const visible = value => intersections.at(-1).callback([{ isIntersecting: value }]);
  const run = ms => { for (const [key, timer] of [...timers]) if (timer.ms === ms) { timers.delete(key); now = Math.max(now, timer.due); timer.fn(); } };
  const advance = ms => {
    const until = now + ms; let iterations = 0;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.due <= until).sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      assert.ok(++iterations < 1000, 'timer loop must be bounded');
      const [key, timer] = next; timers.delete(key); now = timer.due; timer.fn();
    }
    now = until;
  };
  const frame = () => container.children[0]?.children.find(node => node.tagName === 'iframe');
  const message = (data, overrides = {}) => dispatch(window, 'message', { data, origin: 'https://app.test', source: frame()?.contentWindow, ...overrides });
  const load = () => { visible(true); run(120); message(JSON.stringify({ type: 'ready' })); return frame(); };
  return { window, document, container, boundary, motion, mount, dispatch, visible, run, advance, frame, message, load, timers, frames, intersections, resizes };
}

test('3D resources load lazily only when the composer becomes visible and stay local with media permissions disabled', async () => {
  const f = fixture(), api = f.mount();
  assert.equal(f.frame(), undefined); assert.equal(f.container.dataset.petState, 'waiting');
  f.visible(true); assert.equal(f.frame(), undefined); f.run(120);
  const frame = f.frame(); assert.equal(frame.src, 'https://app.test/hanyutong/assets/red-panda/frame.html?v=6');
  assert.equal(new URL('red_panda.glb', frame.src).href, 'https://app.test/hanyutong/assets/red-panda/red_panda.glb');
  assert.match(frame.attrs.allow, /autoplay 'none'/); assert.match(frame.attrs.allow, /microphone 'none'/);
  assert.equal(frame.tabIndex, 0); assert.deepEqual(f.container.children[0].children.map(child => child.tagName), ['iframe']);
  f.message({ type: 'ready' }); assert.equal(await api.ready, true); assert.equal(f.container.dataset.petState, 'ready');
  assert.ok(frame.contentWindow.messages.some(message => message.value.type === 'resume'));
  assert.ok(frame.contentWindow.messages.every(message => message.origin === 'https://app.test'));
  assert.equal(f.boundary.value, 'keep my text'); assert.equal(f.boundary.children.length, 0); api.destroy();
});

test('reduced-motion and save-data show only a still model without activation buttons or automatic actions', async () => {
  for (const options of [{ reduced: true }, { saveData: true }]) {
    const f = fixture(options), api = f.mount(); f.visible(true); f.run(120); const frame = f.frame(); assert.ok(frame);
    f.message({ type: 'ready' }); assert.equal(await api.ready, true);
    assert.equal(api.play('Happy'), true);
    const action = frame.contentWindow.messages.find(message => message.value.type === 'play' && message.value.name === 'Happy');
    assert.equal(action.value.reduced, true);
    assert.ok(frame.contentWindow.messages.some(message => message.value.type === 'still')); assert.equal([...f.timers.values()].filter(timer => timer.ms >= 9000).length, 0);
    api.destroy();
  }
});

test('backgrounding, scrolling offscreen and manual pause stop rendering and automatic movement', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready;
  const last = () => frame.contentWindow.messages.at(-1).value.type;
  f.document.hidden = true; f.dispatch(f.document, 'visibilitychange'); assert.equal(last(), 'pause'); assert.equal(f.frames.size, 0);
  f.document.hidden = false; f.dispatch(f.document, 'visibilitychange'); assert.equal(last(), 'resume');
  f.visible(false); assert.equal(last(), 'pause'); f.visible(true); assert.equal(last(), 'resume');
  api.pause(); assert.equal(last(), 'pause'); api.resume(); assert.equal(last(), 'resume');
  f.dispatch(f.motion, 'change', { matches: true }); assert.equal(last(), 'still'); api.destroy();
});

test('iframe messages require both the expected source and exact origin', async () => {
  const f = fixture(), api = f.mount(); f.visible(true); f.run(120);
  f.message({ type: 'ready' }, { source: {} }); f.message({ type: 'ready' }, { origin: 'https://evil.test' });
  assert.equal(f.container.dataset.petState, 'loading');
  f.message('{broken'); f.message('x'.repeat(1001)); assert.equal(f.container.dataset.petState, 'loading');
  f.message({ type: 'ready' }); assert.equal(await api.ready, true); api.destroy();
});

test('BFCache suspension resumes the existing model without creating controls', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready;
  f.dispatch(f.window, 'pagehide', { persisted: true }); assert.equal(frame.contentWindow.messages.at(-1).value.type, 'pause');
  assert.equal(f.frame(), frame); assert.equal(f.intersections[0].disconnected, false);
  f.dispatch(f.window, 'pageshow', { persisted: true }); assert.equal(frame.contentWindow.messages.at(-1).value.type, 'resume');
  assert.deepEqual(f.container.children[0].children.map(child => child.tagName), ['iframe']);
  api.destroy();
});

test('loading failure and deadline remove the engine silently while preserving the input', async () => {
  for (const failure of ['message', 'timeout']) {
    const f = fixture(), api = f.mount(); f.visible(true); f.run(120);
    if (failure === 'message') f.message({ type: 'error' }); else f.run(25000);
    assert.equal(await api.ready, false); assert.equal(f.frame(), undefined); assert.equal(f.container.dataset.petState, 'unavailable');
    assert.equal(f.container.children[0].hidden, true);
    assert.equal(f.boundary.value, 'keep my text'); assert.equal(api.play('Happy'), false); assert.equal(f.frames.size, 0);
    api.destroy();
  }
});

test('mount replaces prior instance; unmount and pagehide clean up frames, timers, observers and listeners idempotently', async () => {
  const f = fixture(), first = f.mount(), old = f.load(); await first.ready;
  const second = f.mount(); assert.equal(old.parent, null); assert.equal(f.container.children.length, 1);
  assert.equal(old.contentWindow.messages.at(-1).value.type, 'destroy'); assert.equal(f.intersections[0].disconnected, true);
  f.window.HomePet.unmount(); f.window.HomePet.unmount(); assert.equal(await second.ready, false);
  assert.equal(f.container.children.length, 0); assert.equal(f.timers.size, 0); assert.equal(f.frames.size, 0);
  assert.ok(f.intersections.every(item => item.disconnected)); assert.ok(f.resizes.every(item => item.disconnected));
  f.mount(); f.load(); f.dispatch(f.window, 'pagehide'); assert.equal(f.container.children.length, 0);
});

test('resize clamps the pet within the input edge and unknown actions do not reach the frame', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready;
  assert.equal(f.container.children[0].style.transform, 'translateX(152px)');
  f.container.width = f.boundary.width = 170; f.dispatch(f.window, 'resize'); assert.equal(f.container.children[0].style.transform, 'translateX(0px)');
  const before = frame.contentWindow.messages.length; assert.equal(api.play('https://evil.test'), false); assert.equal(frame.contentWindow.messages.length, before);
  api.destroy();
});

test('horizontal travel follows only trusted animation-clock steps and ends exactly at its destination', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready;
  assert.equal(api.play('Walk'), true);
  assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Walk');
  assert.equal(f.container.children[0].style.transform, 'translateX(152px)', 'starting an animation does not independently slide the actor');
  for (const pixels of [-1, 100, NaN]) f.message({ type: 'walk-step', pixels });
  f.message({ type: 'walk-step', pixels: 5 }, { origin: 'https://evil.test' });
  assert.equal(f.container.children[0].style.transform, 'translateX(152px)');
  f.message({ type: 'walk-step', pixels: 5 }); assert.equal(f.container.children[0].style.transform, 'translateX(147px)');
  for (let i = 0; i < 10; i++) f.message({ type: 'walk-step', pixels: 5 });
  assert.equal(f.container.children[0].style.transform, 'translateX(112px)');
  assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Idle');
  api.destroy();
});

test('every random bag uses all six original actions once without starving any action', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready;
  const expected = ['Happy', 'Idle', 'Sleep', 'TailWag', 'Tap', 'Walk'];
  const rounds = [];
  for (let round = 0; round < 3; round++) {
    const bag = [];
    for (let i = 0; i < 6; i++) {
      f.run(9000);
      const action = frame.contentWindow.messages.at(-1).value.name; bag.push(action);
      assert.ok(expected.includes(action));
      if (action === 'Walk') f.run(20000);
      if (action === 'Sleep') {
        assert.equal([...f.timers.values()].length, 1);
        assert.equal([...f.timers.values()][0].ms, 60000);
        f.run(60000);
        assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Tap');
      }
    }
    assert.deepEqual([...bag].sort(), expected); rounds.push(bag);
  }
  for (let i = 1; i < rounds.length; i++) assert.notEqual(rounds[i][0], rounds[i - 1].at(-1));
  assert.equal(f.timers.size, 1); api.destroy(); assert.equal(f.timers.size, 0);
});

test('sleep lasts 60 to 120 seconds then wakes once using the native Tap reaction', async () => {
  for (const random of [() => 0, () => 0.999999]) {
    const f = fixture({ random }), api = f.mount(), frame = f.load(); await api.ready;
    api.play('Sleep');
    const delay = [...f.timers.values()][0].ms;
    assert.ok(delay >= 60000 && delay <= 120000);
    const before = frame.contentWindow.messages.length;
    f.advance(delay - 1); assert.equal(frame.contentWindow.messages.length, before);
    f.advance(1);
    assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Tap');
    assert.equal(frame.contentWindow.messages.filter(message => message.value.type === 'play' && message.value.name === 'Tap').length, 1);
    assert.equal(f.timers.size, 1); api.destroy();
  }
});

test('sleep preserves remaining visible time across background, manual pause and BFCache', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready; api.play('Sleep');
  f.advance(20000);
  f.document.hidden = true; f.dispatch(f.document, 'visibilitychange');
  assert.equal(f.timers.size, 0); f.advance(300000);
  f.document.hidden = false; f.dispatch(f.document, 'visibilitychange');
  assert.equal([...f.timers.values()][0].ms, 40000);
  f.advance(10000); api.pause(); assert.equal(f.timers.size, 0); f.advance(100000); api.resume();
  assert.equal([...f.timers.values()][0].ms, 30000);
  f.advance(5000); f.dispatch(f.window, 'pagehide', { persisted: true }); f.advance(100000);
  f.dispatch(f.window, 'pageshow', { persisted: true });
  assert.equal([...f.timers.values()][0].ms, 25000);
  assert.equal(frame.contentWindow.messages.filter(message => message.value.type === 'play' && message.value.name === 'Sleep').length, 1, 'resume must not restart sleep animation');
  f.advance(24999); assert.equal(frame.contentWindow.messages.at(-1).value.type, 'resume');
  f.advance(1); assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Tap'); api.destroy();
});

test('a native click wakes sleep early, cancels its old deadline and keeps one future action', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready; api.play('Sleep');
  f.advance(10000); const before = frame.contentWindow.messages.length;
  f.message({ type: 'wake' }); f.message({ type: 'tap' });
  assert.equal(frame.contentWindow.messages.length, before, 'native frame owns the immediate tap animation');
  assert.equal(f.timers.size, 1); assert.equal([...f.timers.values()][0].ms, 9000);
  f.advance(9000); assert.equal(frame.contentWindow.messages.at(-1).value.name, 'TailWag');
  api.destroy(); f.advance(200000); assert.equal(f.timers.size, 0);
});

test('reduced motion suspends sleep without timer buildup and resumes its remaining duration', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready; api.play('Sleep'); f.advance(10000);
  f.dispatch(f.motion, 'change', { matches: true });
  assert.equal(f.timers.size, 0); assert.equal(frame.contentWindow.messages.at(-1).value.type, 'still');
  // The real v4 frame implements still with pet.play('Idle'), whose native
  // wake() emits this notification even though the user did not click.
  f.message({ type: 'wake' });
  f.advance(200000);
  for (let i = 0; i < 5; i++) { f.visible(false); f.visible(true); }
  assert.equal(f.timers.size, 0);
  f.dispatch(f.motion, 'change', { matches: false });
  assert.equal([...f.timers.values()][0].ms, 50000);
  assert.equal(frame.contentWindow.messages.at(-2).value.name, 'Sleep');
  f.message({ type: 'wake' }); // A delayed programmatic message is harmless too.
  assert.equal([...f.timers.values()][0].ms, 50000);
  f.advance(50000); assert.equal(frame.contentWindow.messages.at(-1).value.name, 'Tap'); api.destroy();
});

test('pausing a walk preserves its destination and rejects queued movement until resumed', async () => {
  const f = fixture(), api = f.mount(), frame = f.load(); await api.ready; api.play('Walk');
  f.message({ type: 'walk-step', pixels: 5 }); const position = f.container.children[0].style.transform;
  f.advance(5000); api.pause(); f.message({ type: 'walk-step', pixels: 5 });
  assert.equal(f.container.children[0].style.transform, position); assert.equal(f.timers.size, 0);
  f.advance(100000); api.resume(); assert.equal([...f.timers.values()][0].ms, 15000);
  assert.equal(frame.contentWindow.messages.filter(message => message.value.name === 'Walk').length, 1);
  f.message({ type: 'walk-step', pixels: 5 }); assert.notEqual(f.container.children[0].style.transform, position);
  api.destroy(); assert.equal(f.timers.size, 0);
});

test('direct canvas interaction stays bounded in reduced motion and resets a cancelled drag', () => {
  const canvas = new EventTarget(), window = new EventTarget(), parent = {}, calls = [], timers = new Map(); let id = 0;
  let blurred = false; canvas.blur = () => { blurred = true; };
  Object.assign(window, { parent, pet: { setPaused(value) { calls.push(['paused', value]); }, play(name) { calls.push(['play', name]); }, resetToBase() { calls.push(['base']); }, renderOnce() {},
    lookAt(value) { calls.push(['look', value]); }, setFacing(value) { calls.push(['facing', value]); }, happy() { calls.push(['happy']); } } });
  parent.postMessage = () => {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/frame.js'), 'utf8'), {
    window, document: { hidden: false, getElementById: () => canvas }, location: { origin: 'https://app.test' },
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimeout(key) { timers.delete(key); }, console });
  window.dispatchEvent(Object.assign(new Event('message'), { source: parent, origin: 'https://app.test', data: { source: 'hanyu-home-pet', type: 'still' } }));
  canvas.dispatchEvent(new Event('pointerup')); assert.deepEqual(calls.at(-1), ['paused', false]);
  assert.equal([...timers.values()][0].ms, 1450); [...timers.values()][0].fn(); assert.deepEqual(calls.at(-1), ['paused', true]);
  canvas.dispatchEvent(new Event('pointercancel')); assert.deepEqual(calls.at(-1), ['look', null]);
  canvas.dispatchEvent(new Event('pointerleave')); assert.deepEqual(calls.at(-1), ['look', null]);
  canvas.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' })); assert.ok(calls.some(call => call[0] === 'happy'));
  canvas.dispatchEvent(new Event('pointerdown')); assert.equal(blurred, true);
});

test('embedded original textures are permitted by CSP without opening external network destinations', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/frame.html'), 'utf8');
  const connect = html.match(/connect-src ([^;]+)/)[1];
  assert.equal(connect, "'self' blob:");
  assert.doesNotMatch(html, /<button|<audio|<video/);
  const bundle = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/pet.bundle.js'), 'utf8');
  assert.match(bundle, /texture_missing/); assert.match(bundle, /m\.map\.image/);
});

test('the original model and animation loader remain unchanged, with no custom bone deformations or visible focus controls', () => {
  const data = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/red_panda.glb'));
  const crypto = require('node:crypto');
  const gitBlob = crypto.createHash('sha1').update(Buffer.from('blob ' + data.length + '\0')).update(data).digest('hex');
  assert.equal(gitBlob, '8aeb766f7ceb3218cd1358e6adaa2769c6e84b2c');
  const bundle = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/pet.bundle.js'), 'utf8');
  const controller = bundle.slice(bundle.indexOf('var __homePetPaused='));
  assert.doesNotMatch(controller, /__homePetEnhanceWalk|__homePetHead|zs\.quaternion|slerpQuaternions/);
  assert.match(controller, /s\.animations\.forEach\(t=>\{ah\[t\.name\]=Gs\.clipAction\(t\)\}\)/);
  assert.match(controller, /Vs\.background=null;si\.setClearAlpha\(0\);Vs\.remove\(ex\)/);
  const html = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/frame.html'), 'utf8');
  assert.doesNotMatch(html, /dashed|keyboard-focus|<button/);
  assert.match(html, /outline:none!important;border:0!important;box-shadow:none!important/);
});

test('the GLB contains six real embedded animation clips and no external buffer or image URLs', () => {
  const data = fs.readFileSync(path.join(ROOT, 'web/assets/red-panda/red_panda.glb'));
  assert.equal(data.toString('ascii', 0, 4), 'glTF'); assert.equal(data.readUInt32LE(4), 2); assert.equal(data.readUInt32LE(8), data.length);
  const size = data.readUInt32LE(12), model = JSON.parse(data.toString('utf8', 20, 20 + size));
  assert.deepEqual(model.animations.map(item => item.name).sort(), ['Happy', 'Idle', 'Sleep', 'TailWag', 'Tap', 'Walk']);
  assert.equal(model.skins[0].joints.length, 187); assert.ok(model.buffers.every(item => !item.uri)); assert.ok(model.images.every(item => !item.uri));
  const binStart = 20 + size + 8;
  for (const animation of model.animations) {
    const varying = animation.samplers.some(sampler => {
      const accessor = model.accessors[sampler.output], view = model.bufferViews[accessor.bufferView];
      const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
      assert.equal(accessor.componentType, 5126);
      const start = binStart + (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || width * 4;
      for (let i = 1; i < accessor.count; i++) for (let component = 0; component < width; component++) {
        if (Math.abs(data.readFloatLE(start + i * stride + component * 4) - data.readFloatLE(start + component * 4)) > 1e-5) return true;
      }
      return false;
    });
    assert.ok(varying, animation.name + ' must contain changing keyframes');
  }
});

test('offline pet frames never fall back to the main app, and large model resources stay out of precache', async () => {
  for (const cached of [null, new Response('<canvas></canvas>', { headers: { 'Content-Type': 'text/html' } })]) {
    const handlers = {}, matches = [];
    const context = vm.createContext({ URL, Response,
      self: { registration: { scope: 'https://app.test/hanyutong/' }, addEventListener(type, fn) { handlers[type] = fn; } },
      caches: { async match(request) { matches.push(request); return cached; } }, fetch: async () => { throw Error('offline'); } });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'web/sw.js'), 'utf8'), context);
    const core = vm.runInContext('CORE', context);
    assert.ok(core.some(url => url.startsWith('js/home-pet.js'))); assert.ok(core.some(url => url.startsWith('css/home-pet.css')));
    assert.equal(core.some(url => url.includes('red-panda/') || url.endsWith('.glb')), false);
    const request = { method: 'GET', mode: 'navigate', url: 'https://app.test/hanyutong/assets/red-panda/frame.html' }; let response;
    handlers.fetch({ request, respondWith(promise) { response = promise; } });
    const result = await response;
    if (cached) assert.equal(result, cached); else assert.equal(result.type, 'error');
    assert.deepEqual(matches, [request]);
  }
});
