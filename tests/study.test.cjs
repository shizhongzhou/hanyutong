'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/study.js'), 'utf8');
const DAY = 86400000;
const words = [
  { id: 'hsk3-1', hz: '女儿', py: 'nǚ’ér', ru: 'дочь', lv: '1', curriculum: 'hsk3' },
  { id: 'hsk3-2', hz: '绿色', py: 'lǜsè', ru: 'зелёный цвет', lv: '1', curriculum: 'hsk3' },
  { id: 'hsk3-3', hz: '学习', py: 'xuéxí', ru: 'учиться; изучать', lv: '1', curriculum: 'hsk3' }
];
const event = values => ({ preventDefault() { this.defaultPrevented = true; }, button: 0, pointerId: 1, clientX: 100, clientY: 200, ...values });

class Target {
  constructor() { this.events = new Map(); }
  addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, new Set()); this.events.get(type).add(fn); }
  removeEventListener(type, fn) { this.events.get(type)?.delete(fn); }
  emit(type, values = {}) { const e = event({ target: this, ...values }); for (const fn of [...(this.events.get(type) || [])]) fn(e); this['on' + type]?.(e); return e; }
  listenerCount() { return [...this.events.values()].reduce((n, handlers) => n + handlers.size, 0); }
}
class Element extends Target {
  constructor(tag = 'div', attrs = '') {
    super(); this.tagName = tag.toUpperCase(); this.children = []; this.parent = null; this.attributes = {}; this.dataset = {}; this.value = ''; this.hidden = false;
    this.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
    this.classes = new Set();
    this.classList = { add: (...xs) => xs.forEach(x => this.classes.add(x)), remove: (...xs) => xs.forEach(x => this.classes.delete(x)), contains: x => this.classes.has(x), toggle: (x, force) => {
      const next = force === undefined ? !this.classes.has(x) : force;
      if (next) this.classes.add(x); else this.classes.delete(x); return next;
    } };
    for (const [, key, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) this.setAttribute(key, value ?? '');
  }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'class') this.className = value;
    if (key === 'id') this.id = value;
    if (key === 'disabled') this.disabled = true;
    if (key === 'checked') this.checked = true;
    if (key === 'value') this.value = value;
    if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  append(...children) { for (const child of children) { child.remove(); this.children.push(child); child.parent = this; } }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; }
  get isConnected() { return this.tagName === 'BODY' || !!this.parent?.isConnected; }
  set innerHTML(html) {
    this.children.forEach(child => { child.parent = null; }); this.children = []; this.html = String(html);
    const stack = [this];
    for (const match of this.html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
      const [, closing, tag, attrs] = match;
      if (closing) {
        const index = stack.findLastIndex(el => el.tagName === tag.toUpperCase());
        if (index > 0) { stack[index].html = this.html.slice(stack[index].contentStart, match.index); stack.length = index; }
      } else {
        const el = new Element(tag, attrs); stack.at(-1).append(el);
        el.contentStart = match.index + match[0].length;
        if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag) && !attrs.endsWith('/')) stack.push(el);
      }
    }
  }
  get innerHTML() { return this.html || ''; }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classes.has(selector.slice(1));
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) return Object.hasOwn(this.attributes, attr[1]) && (attr[2] === undefined || this.attributes[attr[1]] === attr[2]);
    return this.tagName.toLowerCase() === selector;
  }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
  focus() { this.focused = true; } blur() { this.focused = false; } setPointerCapture() {}
}

function harness({ mode = 'cards', reduced = false, progress = {}, all = async () => words } = {}) {
  const doc = new Target(), win = new Target(), viewport = new Target(), app = new Element('main', 'id="app"');
  const leaves = [], timers = new Map(), records = [], graded = [], walls = [], spoken = [];
  let clock = Date.UTC(2026, 10, 5, 9), timerId = 0, saved = 0, marked = 0, speechCancels = 0, searches = 0;
  doc.body = new Element('body'); doc.body.append(new Element('header', 'id="appbar"'), app, new Element('nav', 'id="tabbar"'), new Element('button', 'id="fab"'));
  doc.querySelector = selector => doc.body.querySelector(selector);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  const one = (selector, scope = doc) => scope.querySelector(selector), many = (selector, scope = doc) => scope.querySelectorAll(selector);
  viewport.height = 700; win.visualViewport = viewport; win.innerHeight = 800; win.matchMedia = () => ({ matches: reduced });
  win.speechSynthesis = { cancel() { speechCancels++; } };
  win.WordWall = { mount(options) {
    const wall = { options, destroyed: 0, tiltCalls: 0, destroy() { this.destroyed++; }, async enableTilt() { this.tiltCalls++; return false; } };
    walls.push(wall); return wall;
  } };
  const state = { settings: { studyView: mode, studyFont: 0, newPerDay: 10, hsk3Level: '1' }, srs: { ...progress }, stats: { days: {} } };
  const day = { learned: 0, reviewed: 0 };
  const key = word => word.id || word.hz;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  const context = vm.createContext({ console, app, window: win, document: doc, speechSynthesis: win.speechSynthesis,
    S: state, D: () => day, DAY, Date: ClockDate, location: { hash: '#/hsk3/1/learn' },
    $: one, $$: many, esc, wordKey: key, wordProgress: word => state.srs[key(word)] || state.srs[word.hz],
    today: (ms = clock) => new Date(ms).toISOString().slice(0, 10), plural: (n, one, few, many) => n === 1 ? one : n < 5 ? few : many,
    h: html => { const holder = new Element(); holder.innerHTML = html; const el = holder.children[0]; el.remove(); return el; },
    ic: () => '', starBtn: () => '', shuffle: list => list.slice(), onLeave: fn => leaves.push(fn),
    save: () => saved++, markStudy: () => marked++, speak: (...args) => spoken.push(args),
    grade: (word, ok) => { graded.push([key(word), ok]); state.srs[key(word)] = { b: ok ? 1 : 0, d: clock + DAY, word }; },
    record: (...args) => records.push(args), HSK3: { all: () => { searches++; return all(); } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; }, clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(source + '\nglobalThis.testStudyDeck = StudyDeck;', context);
  return { doc, win, viewport, app, state, day, records, graded, walls, spoken, timers, one, many, deck: context.testStudyDeck,
    start(options = {}) { return context.runStudySession({ mode: 'learn', level: '1', words, queue: words, ...options }); },
    click(selector, values = {}) { const el = one(selector); assert.ok(el, `missing element ${selector}`); return el.emit('click', values); },
    mode(value) { const el = many('[data-study-mode]').find(x => x.dataset.studyMode === value); assert.ok(el, `missing study mode ${value}`); el.emit('click'); },
    leave() { leaves.splice(0).forEach(fn => fn()); },
    advance(ms = 180) {
      const target = clock + ms;
      for (let run = 0; run < 100; run++) {
        const next = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break; timers.delete(next[0]); clock = next[1].at; next[1].fn();
      }
      clock = target;
    },
    submit(text) { const input = one('#study-answer'); input.value = text; input.emit('input'); one('#study-recall-form').emit('submit'); },
    effects: () => ({ saved, marked, speechCancels, searches })
  };
}
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('pinyin accepts accented, numeric and umlaut keyboard spellings without confusing u with ü', () => {
  const { deck } = harness();
  for (const answer of ['女儿', ' 女 儿！ ', 'nǚ’ér', "nu:3'er2", 'NÜ3 ER2', 'nv3-er2', 'nǚ·ér']) assert.equal(deck.matches(words[0], answer), true, answer);
  for (const answer of ['绿色', 'lü4 se4', 'lu:4se4', 'LV4 SE4', 'lǜsè']) assert.equal(deck.matches(words[1], answer), true, answer);
  for (const answer of ['', ' ', 'nu3 er2', 'lu4 se4', 'дочь', '女', '学习', 'lv6se4']) assert.equal(deck.matches(words[1], answer), false, answer);
  assert.equal(deck.normalizePinyin('LǛ · SÈ'), 'lvse');
  assert.equal(deck.matches({ hz: '你好', py: '' }, 'ni hao'), false);
});

test('each official alternate pronunciation is accepted without merging the readings', () => {
  const { deck } = harness();
  for (const [word, accepted, rejected] of [
    [{ hz: '谁', py: 'shéi/shuí' }, ['谁', 'shéi', 'shuí', 'shei2', 'shui2'], ['sheishui', 'shéi/shuí', 'shui6', 'shue']],
    [{ hz: '熟', py: 'shú/shóu' }, ['熟', 'shú', 'shóu', 'shu2', 'shou2'], ['shushou', 'shou6', 'xou']]
  ]) {
    for (const answer of accepted) assert.equal(deck.matches(word, answer), true, answer);
    for (const answer of rejected) assert.equal(deck.matches(word, answer), false, answer);
  }
  const numbered = { hz: '本', officialLabel: '本1', py: 'běn' };
  assert.equal(deck.matches(numbered, '本'), true, 'syllabus sense numbers are not part of the answer');
  assert.equal(deck.matches(numbered, '本1'), false);
});

test('recall clues omit dictionary headings and answers while full definitions remain available', () => {
  const word = { ...words[0], hz: '本', py: 'běn', ru: 'I сущ. /счетное слово\n1) корень; ствол; стебель\n树的本很粗 у дерева толстый корень\n本 běn — исходный смысл' };
  const h = harness();
  assert.equal(h.deck.clue(word), 'корень; ствол; стебель');
  assert.equal(h.deck.clue({ ru: '1) слово 本 (běn) означает начало' }), 'слово означает начало');
  assert.equal(h.deck.clue({ ru: 'I сущ.\n树的本很粗 у дерева толстый корень\n2) основание; фундамент' }), 'основание; фундамент');
  const session = h.start({ words: [word], queue: [word] });
  h.click('#study-card'); assert.ok(h.one('#study-card-copy').innerHTML.includes('树的本很粗'), 'new word flip keeps the complete article');
  session.recall(word);
  assert.equal(h.one('.study-recall-clue').innerHTML, 'корень; ствол; стебель');
  h.submit('ben3');
  assert.ok(h.one('#study-recall-feedback').innerHTML.includes('树的本很粗'), 'answer exposes the complete article');
  assert.ok(h.one('.study-answer-definition')); h.leave();
  const review = harness({ progress: { [word.id]: { b: 1, d: 0 } } });
  review.start({ words: [word], queue: [word] });
  assert.equal(review.one('#study-card-copy').innerHTML, 'корень; ствол; стебель'); review.leave();
});

test('every official dictionary article yields a bounded Russian recall clue with no Hanzi or pinyin', () => {
  const { deck } = harness(), data = path.join(__dirname, '../web/data/hsk3');
  const manifest = JSON.parse(fs.readFileSync(path.join(data, 'manifest.json'), 'utf8'));
  let checked = 0;
  for (const level of manifest.levels) for (const part of level.files) {
    for (const word of JSON.parse(fs.readFileSync(path.join(data, part.file), 'utf8'))) {
      const clue = deck.clue(word);
      assert.match(clue, /[а-яё]/iu, word.id);
      assert.doesNotMatch(clue, /[\p{Script=Han}\p{Script=Latin}]/u, word.id);
      assert.ok(clue.length <= 220, word.id);
      assert.notEqual(clue, 'Русское значение пока недоступно.', word.id);
      checked++;
    }
  }
  assert.equal(checked, 11000);
});

test('deck deduplicates by stable key, skips without removal, and retries a word only once', () => {
  const { deck } = harness(), replacement = { ...words[0], ru: 'обновлённое значение' };
  const d = deck.create([words[0], words[1], replacement, words[2]], word => word.id);
  assert.equal(d.length, 3); assert.equal(d.current, replacement);
  const copied = d.list(); copied.pop(); assert.equal(d.length, 3);
  d.skip(); assert.deepEqual(Array.from(d.list(), w => w.id), [words[1].id, words[2].id, words[0].id]);
  d.retry(words[1]); d.retry(words[1]); assert.deepEqual(Array.from(d.list(), w => w.id), [words[2].id, words[0].id, words[1].id]);
  d.remove({ ...words[0] }); assert.equal(d.length, 2);
  d.reset([words[1], words[1]]); d.skip(); assert.equal(d.current, words[1]); assert.equal(d.length, 1);
  d.remove(words[1]); d.skip(); assert.equal(d.current, null); assert.deepEqual(Array.from(d.list()), []);
  const polyphonic = deck.create([{ ...words[0], id: 'first-reading' }, { ...words[0], id: 'other-reading' }], w => w.id);
  assert.equal(polyphonic.length, 2, 'same Hanzi with different entry IDs must remain separate cards');
});

test('new cards reveal a definition and advance as introductions, never as correct answers', () => {
  const h = harness(), session = h.start();
  assert.equal(h.one('#study-card-copy').innerHTML, words[0].hz);
  h.click('#study-card'); assert.match(h.one('#study-card-copy').innerHTML, /дочь/);
  assert.equal(h.day.learned, 0); assert.equal(Object.keys(h.state.srs).length, 0); assert.equal(h.records.length, 0);
  h.click('#study-next'); h.click('#study-next'); assert.equal(h.timers.size, 1);
  h.advance();
  assert.equal(session.getCurrent(), words[1]); assert.equal(h.day.learned, 1); assert.equal(h.day.reviewed, 0);
  assert.equal(h.state.srs[words[0].id].introduced, true); assert.equal(h.state.srs[words[0].id].b, 0);
  assert.equal(h.state.srs[words[0].id].r, 0); assert.equal(h.state.srs[words[0].id].w, 0);
  assert.equal(h.state.srs[words[0].id].curriculum, 'hsk3'); assert.equal(h.effects().marked, 1);
  assert.equal(h.graded.length, 0); assert.equal(h.records.length, 0);
  h.leave();
});

test('unrevealed cards are rotated, and a cancelled swipe cannot reveal or learn a word', () => {
  const h = harness(), session = h.start();
  h.click('#study-next'); h.advance(); assert.equal(session.getCurrent(), words[1]);
  assert.equal(h.day.learned, 0); assert.deepEqual(h.state.srs, {}); assert.equal(h.records.length, 0);
  const card = h.one('#study-card');
  card.emit('pointerdown'); card.emit('pointermove', { clientY: 20 }); card.emit('pointercancel', { clientY: 20 }); card.emit('click');
  assert.equal(h.timers.size, 0); assert.equal(session.getCurrent(), words[1]); assert.equal(card.classList.contains('is-flipped'), false);
  card.emit('keydown', { key: 'Enter' }); assert.equal(card.classList.contains('is-flipped'), true);
  card.emit('keydown', { key: 'ArrowUp' }); h.advance();
  assert.equal(h.day.learned, 1); assert.equal(session.getCurrent(), words[2]); assert.equal(h.records.length, 0);
  assert.equal(card.onclick, null); assert.equal(card.onpointermove, null); h.leave();
});

test('repeated submissions and forgotten-answer taps grade a recall only once', () => {
  const h = harness({ progress: { [words[0].id]: { b: 1, d: 0 } } }), session = h.start();
  assert.equal(h.one('#study-card-copy').innerHTML, words[0].ru); h.click('#study-card');
  assert.equal(h.one('#study-submit').disabled, true);
  const oldForm = h.one('#study-recall-form'), oldForgot = h.one('#study-forgot');
  h.submit('nu:3 er2'); oldForm.emit('submit'); oldForgot.emit('click');
  assert.deepEqual(h.graded, [[words[0].id, true]]); assert.equal(h.records.length, 1); assert.equal(h.records[0][1], words[0].id);
  assert.equal(h.day.reviewed, 1); assert.equal(h.day.learned, 0); assert.equal(session.getCurrent(), words[1]);
  assert.match(h.one('#study-recall-feedback').innerHTML, /Верно!/);
  h.click('#study-recall-next'); assert.ok(h.one('#study-card')); h.leave();
});

test('an incorrect fresh recall is retried and its later success counts as a review', () => {
  const h = harness(), session = h.start(); session.recall(words[0]);
  h.submit('  '); assert.equal(h.graded.length, 0);
  h.click('#study-forgot'); assert.deepEqual(h.graded, [[words[0].id, false]]);
  assert.equal(h.day.learned, 1); assert.equal(h.day.reviewed, 0); assert.equal(session.getCurrent(), words[1]);
  assert.match(h.one('#study-recall-feedback').innerHTML, /ещё раз появится/);
  h.click('#study-recall-next'); session.recall(words[0]); h.submit('女儿');
  assert.deepEqual(h.graded, [[words[0].id, false], [words[0].id, true]]);
  assert.equal(h.day.learned, 1); assert.equal(h.day.reviewed, 1); assert.equal(h.records.length, 2); h.leave();
});

test('superseded card animations and recall handlers cannot change a new surface', () => {
  const h = harness(), session = h.start(); h.click('#study-card'); h.click('#study-next');
  h.mode('cloud'); h.advance(); assert.equal(session.getCurrent(), words[0]); assert.equal(h.day.learned, 0);
  assert.equal(h.walls.length, 1); session.recall(words[0]); assert.equal(h.walls[0].destroyed, 1);
  const oldInput = h.one('#study-answer'), oldSubmit = h.one('#study-recall-form').onsubmit, oldForgot = h.one('#study-forgot').onclick;
  oldInput.value = words[0].hz; h.click('#study-back'); session.recall(words[1]);
  oldSubmit(event()); oldForgot(); assert.equal(h.graded.length, 0); assert.match(h.app.innerHTML, /зелёный цвет/);
  h.submit('lv4se4'); assert.deepEqual(h.graded, [[words[1].id, true]]); h.leave();
});

test('navigation cancels work, removes global handlers and styles, and stops audio once', () => {
  const h = harness(), session = h.start(); const card = h.one('#study-card');
  assert.equal(h.app.style['--study-viewport-height'], '700px'); h.viewport.height = 500; h.viewport.emit('resize');
  assert.equal(h.app.style['--study-viewport-height'], '500px');
  h.click('#study-card'); h.click('#study-next'); assert.equal(h.timers.size, 1);
  assert.ok(h.win.listenerCount() + h.doc.listenerCount() + h.viewport.listenerCount() > 0);
  h.leave(); session.destroy(); assert.equal(h.timers.size, 0); h.advance(1000);
  assert.equal(h.day.learned, 0); assert.equal(h.records.length, 0); assert.equal(h.effects().speechCancels, 1);
  assert.equal(h.win.listenerCount() + h.doc.listenerCount() + h.viewport.listenerCount(), 0);
  assert.equal(h.doc.body.classList.contains('study-immersive'), false); assert.equal(h.app.classList.contains('study-app'), false);
  assert.equal(h.app.style['--study-viewport-height'], undefined); assert.equal(h.app.style['--study-font-scale'], undefined);
  assert.equal(card.onclick, null); assert.equal(card.onkeydown, null); assert.equal(card.onpointercancel, null);
  h.app.innerHTML = '<p>Another page</p>'; session.recall(words[1]); h.doc.emit('keydown', { key: 'Escape' });
  assert.equal(h.app.innerHTML, '<p>Another page</p>');
});

test('wall modes clean up their engine on changes, recall and navigation without requesting tilt automatically', async () => {
  const h = harness({ mode: 'cloud' }), session = h.start();
  assert.equal(h.walls[0].tiltCalls, 0); await h.click('#study-tilt'); assert.equal(h.walls[0].tiltCalls, 1);
  h.mode('stickers'); assert.equal(h.walls[0].destroyed, 1); assert.equal(h.walls[1].options.mode, 'stickers');
  h.walls[1].options.onSelect(words[1]); assert.equal(h.walls[1].destroyed, 1); assert.ok(h.one('#study-answer'));
  h.click('#study-back'); assert.equal(h.walls.length, 3); h.leave(); session.destroy(); assert.equal(h.walls[2].destroyed, 1);
  assert.equal(h.walls.every(w => w.destroyed === 1), true);
});

test('empty queues can restart a bounded round, and reduced motion advances without an animation delay', () => {
  const h = harness({ reduced: true }), session = h.start({ queue: [] });
  assert.equal(session.getCurrent(), null); assert.match(h.one('#study-surface').innerHTML, /Можно продолжить/);
  h.click('#study-extra'); assert.equal(session.getCurrent(), words[0]); h.click('#study-card'); h.click('#study-next'); h.advance(0);
  assert.equal(session.getCurrent(), words[1]); assert.equal(h.day.learned, 1); assert.equal(h.records.length, 0); h.leave();
});

test('full-course search debounces input and ignores a result superseded by a new query', async () => {
  const gates = [deferred(), deferred()]; let i = 0;
  const h = harness({ all: () => gates[i++].promise }); h.start(); h.click('#study-search');
  const input = h.one('#study-lookup'), output = h.one('#study-lookup-results');
  input.value = 'nv'; input.emit('input'); h.advance(90); input.value = 'nv3'; input.emit('input'); h.advance(90);
  assert.equal(h.effects().searches, 0); h.advance(90); assert.equal(h.effects().searches, 1);
  input.value = 'зелёный'; input.emit('input'); h.advance(); assert.equal(h.effects().searches, 2);
  gates[0].resolve(words); await flush(); assert.match(output.innerHTML, /Ищем/); assert.doesNotMatch(output.innerHTML, /女儿/);
  gates[1].resolve(words); await flush(); assert.match(output.innerHTML, /绿色/); assert.doesNotMatch(output.innerHTML, /女儿/);
  output.querySelector('[data-study-result]').emit('click'); assert.equal(h.doc.querySelector('.study-overlay'), null);
  assert.match(h.app.innerHTML, /зелёный цвет/); h.leave();
});

test('closed search and navigation ignore late search successes and failures', async () => {
  for (const kind of ['close', 'leave', 'failure']) {
    const gate = deferred(), h = harness({ all: () => gate.promise }); h.start(); h.click('#study-search');
    const input = h.one('#study-lookup'), output = h.one('#study-lookup-results');
    input.value = 'nv'; input.emit('input'); h.advance(); const waiting = output.innerHTML;
    if (kind === 'close') h.click('#study-close-sheet'); else { h.leave(); h.app.innerHTML = '<p>Another page</p>'; }
    if (kind === 'failure') gate.reject(Error('offline')); else gate.resolve(words);
    await flush(); assert.equal(output.innerHTML, waiting); assert.equal(h.doc.querySelector('.study-overlay'), null);
    if (kind !== 'close') assert.equal(h.app.innerHTML, '<p>Another page</p>'); h.leave();
  }
});

test('leaving a recall makes captured answer callbacks inert', () => {
  const h = harness(), session = h.start(); session.recall(words[0]);
  const input = h.one('#study-answer'), submit = h.one('#study-recall-form').onsubmit, forgot = h.one('#study-forgot').onclick;
  input.value = words[0].hz; h.leave(); h.app.innerHTML = '<p>Another page</p>'; submit(event()); forgot();
  assert.equal(h.graded.length, 0); assert.equal(h.records.length, 0); assert.equal(h.day.learned, 0);
  assert.equal(h.app.innerHTML, '<p>Another page</p>');
});
