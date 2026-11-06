'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createNavigation } = require('../web/js/navigation.js');

function harness(initial = '#/learn', stored = null) {
  const listeners = new Map(), documentListeners = new Map(), storage = new Map(), frames = new Map(), timers = new Map(), observers = [], scrolls = [];
  const stack = [{ hash: initial, state: { unrelated: 'preserved' } }];
  let index = 0, sequence = 0, maxScroll = 10000, backCalls = 0;
  if (stored) storage.set('hanyutong-navigation-v1', JSON.stringify(stored));
  const on = (collection, name, fn) => { if (!collection.has(name)) collection.set(name, []); collection.get(name).push(fn); };
  const emit = (name, event = {}) => { for (const fn of listeners.get(name) || []) fn(event); };
  const win = {
    location: { hash: initial, replace(hash) { this.hash = hash; stack[index] = { hash, state: null }; } }, crypto: { randomUUID: () => 'entry-' + (++sequence) },
    sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    history: { get state() { return stack[index].state; }, replaceState(state) { stack[index].state = state; },
      back() { backCalls++; if (index > 0) { index--; win.location.hash = stack[index].hash; } } },
    document: { addEventListener: (name, fn) => on(documentListeners, name, fn) },
    addEventListener: (name, fn) => on(listeners, name, fn), scrollY: 0,
    scrollTo(value) { this.scrollY = Math.min(maxScroll, value.top); scrolls.push(this.scrollY); emit('scroll'); },
    requestAnimationFrame(fn) { const id = ++sequence; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
    ResizeObserver: class { constructor(fn) { this.fn = fn; this.disconnected = false; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  };
  let nav = createNavigation(win);
  const begin = () => nav.begin(win.location.hash);
  return { win, stack, storage, frames, timers, observers, scrolls, emit, begin, nav,
    flush() { for (let i = 0; i < 4 && frames.size; i++) { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); } },
    scroll(y) { win.scrollY = y; emit('scroll'); }, max(y) { maxScroll = y; },
    go(hash) { for (const fn of documentListeners.get('click') || []) fn({}); stack.splice(index + 1); stack.push({ hash, state: null }); index++; win.location.hash = hash; return begin(); },
    forward() { index++; win.location.hash = stack[index].hash; return begin(); },
    back() { win.history.back(); return begin(); }, backCalls: () => backCalls,
    jump(target) { index = target; win.location.hash = stack[index].hash; },
    reload() { listeners.clear(); documentListeners.clear(); nav = createNavigation(win); this.nav = nav; return begin(); }
  };
}

test('back from language practice returns to the same learning scroll position and forward restores the child', () => {
  const h = harness(); let visit = h.begin(); h.nav.finish(visit, {}); h.flush(); h.scroll(1260);
  visit = h.go('#/grammar'); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 0); h.scroll(340);
  assert.equal(h.nav.backHref('#/home'), '#/learn'); h.nav.back('#/home');
  visit = h.begin(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 1260);
  visit = h.forward(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 340);
  assert.equal(h.win.history.scrollRestoration, 'manual'); assert.equal(h.stack[0].state.unrelated, 'preserved');
});

test('actual entry source overrides a hardcoded back target; direct deep links have a safe fallback', () => {
  const h = harness('#/home'); h.begin(); h.go('#/translate');
  assert.equal(h.nav.backHref('#/learn'), '#/home'); h.nav.back('#/learn');
  assert.equal(h.win.location.hash, '#/home'); assert.equal(h.backCalls(), 1);
  const direct = harness('#/translate/photo'); direct.begin();
  assert.equal(direct.nav.backHref('#/learn'), '#/learn'); direct.nav.back('#/learn');
  assert.equal(direct.backCalls(), 0); assert.equal(direct.win.location.hash, '#/learn');
});

test('separate visits to the same route retain separate scroll entries across back and forward', () => {
  const h = harness(); h.begin(); h.scroll(1100); h.go('#/grammar'); h.scroll(200);
  const second = h.go('#/learn'); h.nav.finish(second, {}); h.flush(); h.scroll(600);
  let visit = h.back(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 200);
  visit = h.back(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 1100);
  h.forward(); visit = h.forward(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 600);
});

test('replacing a legacy route preserves the actual parent and never creates a phantom back entry', () => {
  const direct = harness('#/level/1'); const first = direct.begin(); direct.nav.replace('#/hsk3/1/vocab');
  const redirected = direct.begin(); assert.equal(redirected.id, first.id);
  assert.equal(direct.nav.backHref('#/stages'), '#/stages'); direct.nav.back('#/stages');
  assert.equal(direct.backCalls(), 0, 'a direct legacy link must not navigate outside the app');
  const h = harness('#/learn'); h.begin(); h.scroll(700); h.go('#/level/1');
  h.nav.replace('#/hsk3/1/vocab'); h.begin(); assert.equal(h.nav.backHref('#/stages'), '#/learn');
  const visit = h.back(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 700);
  assert.equal(h.stack.length, 2);
});

test('reload preserves the current history entry and its source without duplicating it', () => {
  const h = harness(); h.begin(); h.scroll(800); h.go('#/reading'); h.scroll(420);
  const id = h.win.history.state.hanyuNavigation.id, visit = h.reload();
  assert.equal(visit.id, id); assert.equal(h.nav.backHref('#/home'), '#/learn');
  h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 420);
  assert.equal(JSON.parse(h.storage.get('hanyutong-navigation-v1')).length, 2);
});

test('history-menu traversal between two identical hashes is handled by popstate without duplicate hash rendering', () => {
  const h = harness(); h.begin(); h.scroll(1100); h.go('#/grammar'); h.scroll(80); h.go('#/learn'); h.scroll(500);
  h.jump(0); assert.equal(h.nav.isSameRouteTraversal(), true);
  const visit = h.begin(); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 1100);
  assert.equal(h.nav.isSameRouteTraversal(), false);
  h.jump(1); assert.equal(h.nav.isSameRouteTraversal(), false, 'a changed hash is handled by hashchange instead');
});

test('a delayed render or resize callback from an old route cannot scroll a newer page', () => {
  const h = harness(); h.begin(); h.scroll(1200); h.go('#/grammar');
  const old = h.back(); h.max(400); h.nav.finish(old, {}); h.flush(); assert.equal(h.win.scrollY, 400);
  const lateResize = h.observers.at(-1).fn; const current = h.go('#/home'); h.nav.finish(current, {}); h.flush();
  const count = h.scrolls.length; h.nav.finish(old, {}); lateResize(); h.flush();
  assert.equal(h.scrolls.length, count); assert.equal(h.win.scrollY, 0); assert.equal(h.nav.current(old), false);
});

test('restoration waits for sufficient layout and stops immediately after user interaction', () => {
  const h = harness(); h.begin(); h.scroll(1500); h.go('#/grammar');
  let visit = h.back(); h.max(400); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 400);
  h.max(2000); h.observers.at(-1).fn(); h.flush(); assert.equal(h.win.scrollY, 1500);
  h.go('#/reading'); visit = h.back(); h.max(300); h.nav.finish(visit, {}); h.flush();
  const delayedResize = h.observers.at(-1).fn; h.emit('touchstart'); h.scroll(240); h.max(2000); delayedResize(); h.flush();
  assert.equal(h.win.scrollY, 240);
});

test('interaction during asynchronous rendering cancels a future restoration', () => {
  const h = harness(); h.begin(); h.scroll(900); h.go('#/grammar'); const visit = h.back();
  h.emit('pointerdown'); h.scroll(100); h.nav.finish(visit, {}); h.flush(); assert.equal(h.win.scrollY, 100);
});

test('stored route state is bounded and rejects invalid/external navigation entries', () => {
  const h = harness('#/learn', [{ id: 'bad', hash: 'https://attacker.example', y: 20, previous: null },
    { id: 'other', hash: '#/learn', y: Infinity, previous: null }]);
  h.begin(); assert.equal(h.nav.backHref('javascript:alert(1)'), '#/home');
  for (let i = 0; i < 80; i++) h.go('#/word/test-' + i);
  assert.equal(JSON.parse(h.storage.get('hanyutong-navigation-v1')).length, 60);
});
