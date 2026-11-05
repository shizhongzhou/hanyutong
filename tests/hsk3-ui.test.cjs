const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/manifest.json')));
const exams = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/exams.json')));
const source = fs.readFileSync(path.join(root, 'js/hsk3.js'), 'utf8');
const fileOf = id => { const meta = manifest.levels.find(x => x.id === id); return 'data/hsk3/' + (meta.files?.[0]?.file || meta.file); };

function harness() {
  const elements = new Set(), ids = new Map(), requests = [], failures = new Map(), gates = new Map();
  const intervals = new Map(), leaves = [], records = [], graded = [];
  let clock = 0, timerId = 0, marked = 0;
  class Element {
    constructor(attrs = '') {
      this.children = []; this.dataset = {}; this.value = ''; this.textContent = ''; this.disabled = /\sdisabled(?:\s|$)/.test(attrs);
      this.classList = { add() {}, remove() {} }; this.hidden = false;
      for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) {
        if (name === 'id') { this.id = value; ids.set(value, this); }
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      }
      elements.add(this);
    }
    clear() { for (const child of this.children) { child.clear(); elements.delete(child); if (child.id && ids.get(child.id) === child) ids.delete(child.id); } this.children = []; }
    set innerHTML(html) {
      this.clear(); this.html = html;
      for (const [, attrs] of html.matchAll(/<[a-z][a-z0-9]*\b([^>]*)>/gi)) {
        if (/\b(?:id|data-h3-[\w-]+)="/.test(attrs)) this.children.push(new Element(attrs));
      }
    }
    get innerHTML() { return this.html || ''; }
    focus() {} scrollIntoView() {} setAttribute() {}
  }
  const app = new Element();
  const one = selector => selector === '#app' ? app : ids.get(selector.slice(1)) || null;
  const many = selector => { const attr = selector.slice(1, -1).replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase()); return [...elements].filter(e => Object.hasOwn(e.dataset, attr)); };
  const state = { settings: { curriculum: 'hsk2', hsk3Level: '1', newPerDay: 10, pinyin: true }, srs: {}, history: [] };
  const day = { learned: 0, reviewed: 0 };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  class TestDate extends Date { static now() { return clock; } }
  const context = vm.createContext({ console, app, $: one, $$: many, S: state, D: () => day,
    esc, topbar: title => `<h1>${esc(title)}</h1>`, ic: () => '',
    wordRow: w => `<article data-h3-word="${esc(w.id)}">${esc(w.hz)} ${esc(w.py)} ${esc(w.ru)}</article>`,
    starBtn: () => '', sayBtn: hz => `<button data-say="${esc(hz)}">Звук</button>`,
    short: ru => ru.split(/[;\n]/)[0].trim(), shuffle: values => values.slice(),
    plural: (n, one, few, many) => ({ one, few, many, other: many })[new Intl.PluralRules('ru').select(n)],
    save() {}, markStudy: () => { marked++; }, record: (...args) => records.push(args),
    grade: (w, ok) => { graded.push([w.id, ok]); state.srs[w.id] = { b: ok ? 1 : 0, d: clock + 1000, word: w }; },
    onLeave: fn => leaves.push(fn), Date: TestDate,
    location: { hash: '#/hsk3' }, window: { scrollTo() {} },
    setInterval: fn => { const id = ++timerId; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
    fetch: async url => {
      requests.push(url);
      if (failures.get(url)) { failures.set(url, failures.get(url) - 1); throw Error('offline'); }
      if (gates.has(url)) await gates.get(url).promise;
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url))) };
    }
  });
  vm.runInContext(source, context);
  return { context, app, state, records, graded, requests, intervals, one, many,
    run: code => vm.runInContext(code, context), marked: () => marked,
    failOnce: url => failures.set(url, 1),
    defer(url) { let release; const promise = new Promise(resolve => { release = resolve; }); gates.set(url, { promise }); return () => { gates.delete(url); release(); }; },
    advance(ms) { clock += ms; for (const callback of intervals.values()) callback(); },
    leave() { for (const fn of leaves.splice(0)) fn(); },
    async settleUntil(predicate) { for (let i = 0; i < 30 && !predicate(); i++) await Promise.resolve(); assert.ok(predicate(), 'expected async request to start'); }
  };
}

test('HSK 3.0 is lazy and ID lookup respects every level boundary', async () => {
  const h = harness(); assert.equal(h.requests.length, 0);
  for (const [number, level] of [[1, '1'], [300, '1'], [301, '2'], [500, '2'], [501, '3'], [1000, '3'], [1001, '4'], [2000, '4'], [2001, '5'], [3600, '5'], [3601, '6'], [5400, '6'], [5401, '7-9'], [11000, '7-9']]) {
    const id = `hsk3-${String(number).padStart(5, '0')}`;
    const word = await h.run(`HSK3.find(${JSON.stringify(id)})`);
    assert.equal(word.id, id); assert.equal(word.level, level); assert.equal(word.curriculum, 'hsk3');
  }
  const count = h.requests.length;
  for (const key of ['hsk3-00000', 'hsk3-11001', 'hsk3-1', 'hsk3-abcde', '你好', '../manifest.json']) assert.equal(await h.run(`HSK3.find(${JSON.stringify(key)})`), null);
  assert.equal(h.requests.length, count);
});

test('cumulative advanced vocabulary contains all 11000 distinct syllabus entries', async () => {
  const h = harness(), words = await h.run('HSK3.cumulative("7-9")');
  assert.equal(words.length, 11000); assert.equal(new Set(words.map(w => w.id)).size, 11000);
  assert.equal(words[0].number, 1); assert.equal(words.at(-1).number, 11000);
  assert.ok(words.every(w => w.ru && w.hz && w.py && w.lv === w.level && w.curriculum === 'hsk3'));
  for (const level of manifest.levels) assert.equal(words.filter(w => w.level === level.id).length, level.count);
});

test('failed vocabulary requests can retry and concurrent reads share their download', async () => {
  const h = harness(), file = fileOf('1'); h.failOnce(file);
  await assert.rejects(h.run('HSK3.level("1")'), /offline/);
  const [a, b] = await Promise.all([h.run('HSK3.level("1")'), h.run('HSK3.level("1")')]);
  assert.equal(a.length, 300); assert.equal(b.length, 300);
  assert.equal(h.requests.filter(url => url === file).length, 2);
});

test('late manifest and vocabulary results do not overwrite another page', async () => {
  for (const file of ['data/hsk3/manifest.json', fileOf('2')]) {
    const h = harness(), release = h.defer(file);
    h.context.location.hash = '#/hsk3/2/vocab';
    const loading = h.run('pageHSK3("2", "vocab")');
    await h.settleUntil(() => h.requests.includes(file));
    h.context.location.hash = '#/home'; h.leave(); h.app.innerHTML = '<p>Another page</p>';
    release(); await loading;
    assert.equal(h.app.innerHTML, '<p>Another page</p>');
  }
});

test('vocabulary pagination is bounded and searching resets the current page', async () => {
  const h = harness(); h.context.location.hash = '#/hsk3/1/vocab'; await h.run('pageHSK3("1", "vocab")');
  assert.equal(h.many('[data-h3-word]').length, 40);
  assert.equal(h.many('[data-h3-word]')[0].dataset.h3Word, 'hsk3-00001');
  for (let i = 0; i < 7; i++) h.one('#h3-next').onclick();
  assert.equal(h.many('[data-h3-word]').length, 20);
  assert.equal(h.one('#h3-next').disabled, true);
  h.one('#h3-search').value = 'unfindablequery12345'; h.one('#h3-search').oninput();
  assert.equal(h.many('[data-h3-word]').length, 0);
  assert.match(h.one('#h3-count').textContent, /страница 1 \/ 1/);
  h.one('#h3-search').value = ''; h.one('#h3-search').oninput();
  assert.equal(h.many('[data-h3-word]')[0].dataset.h3Word, 'hsk3-00001');
});

test('a superseded cumulative request cannot replace the selected new-words list', async () => {
  const h = harness(); h.context.location.hash = '#/hsk3/2/vocab'; await h.run('pageHSK3("2", "vocab")');
  const release = h.defer(fileOf('1')), scope = h.one('#h3-scope');
  scope.value = 'all'; const pending = scope.onchange();
  await h.settleUntil(() => h.requests.includes(fileOf('1')));
  scope.value = 'new'; await scope.onchange(); release(); await pending;
  assert.equal(h.many('[data-h3-word]')[0].dataset.h3Word, 'hsk3-00301');
  assert.match(h.one('#h3-count').textContent, /Найдено: 200/);
});

test('pinyin search preserves umlauts when stripping tones', () => {
  const h = harness();
  assert.equal(h.run('h3Norm("lǜ")'), h.run('h3Norm("lv")'));
  assert.equal(h.run('h3Norm("nǚ")'), h.run('h3Norm("nü")'));
});

test('flashcards and word quizzes count each submitted answer once', async () => {
  const h = harness(), words = await h.run('HSK3.level("1")');
  h.context.wordsForTest = words;
  h.run('h3Study("1", wordsForTest.slice(0, 1))');
  h.one('#h3-show').onclick(); const answer = h.one('#h3-yes').onclick;
  answer(); answer(); assert.equal(h.records.length, 1); assert.equal(h.graded.length, 1);
  h.leave(); h.run('h3Quiz("1", wordsForTest)');
  const choice = h.many('[data-h3-answer]')[0].onclick;
  choice(); choice(); assert.equal(h.records.length, 2); assert.equal(h.graded.length, 2);
  h.leave(); choice(); assert.equal(h.records.length, 2);
});

function exampleLocation(kind) {
  for (const exam of exams.levels) for (let si = 0; si < exam.sections.length; si++) for (let ti = 0; ti < exam.sections[si].types.length; ti++) {
    const example = exam.sections[si].types[ti].examples[0];
    if (example.kind === kind) return { exam, si, ti, example };
  }
  throw Error(`No ${kind} example`);
}

test('subjective tasks use self-checks, never award points, and stop the timer on reveal and exit', async () => {
  const h = harness(), { exam, si, ti } = exampleLocation('self-assess');
  h.context.location.hash = `#/hsk3/${exam.id}/exam`; await h.run(`h3Exam(${JSON.stringify(exam.id)})`);
  const open = h.many('[data-h3-type]').find(e => e.dataset.h3Type === `${si}:${ti}`).onclick;
  open(); h.one('#h3-clock').onclick(); h.advance(1500);
  assert.equal(h.one('#h3-time').textContent, '0:01');
  const reveal = h.one('#h3-check').onclick; reveal(); reveal();
  assert.equal(h.records.length, 0); assert.equal(h.marked(), 1); assert.equal(h.intervals.size, 0);
  assert.match(h.one('#h3-result').innerHTML, /не оценивается автоматически/);
  assert.doesNotMatch(h.one('#h3-result').innerHTML, /Верно!/);
  h.one('#h3-back-types').onclick();
  h.many('[data-h3-type]').find(e => e.dataset.h3Type === `${si}:${ti}`).onclick();
  h.one('#h3-clock').onclick(); assert.equal(h.intervals.size, 1);
  h.leave(); assert.equal(h.intervals.size, 0); reveal(); assert.equal(h.marked(), 1);
});

test('objective exercise choices reject duplicate and post-navigation submissions', async () => {
  const h = harness(), { exam, si, ti, example } = exampleLocation('choice');
  await h.run(`h3Exam(${JSON.stringify(exam.id)})`);
  h.many('[data-h3-type]').find(e => e.dataset.h3Type === `${si}:${ti}`).onclick();
  const answer = h.many('[data-h3-choice]').find(e => Number(e.dataset.h3Choice) === example.answerIndex).onclick;
  answer(); answer(); assert.equal(h.records.length, 1); assert.equal(h.records[0][0], true);
  h.leave(); answer(); assert.equal(h.records.length, 1);
});

test('all shipped exercise schemas render without missing fields', async () => {
  const h = harness();
  for (const exam of exams.levels) for (let si = 0; si < exam.sections.length; si++) for (let ti = 0; ti < exam.sections[si].types.length; ti++) {
    const type = exam.sections[si].types[ti];
    assert.ok(type.examples.length, type.id);
    h.leave(); await h.run(`h3Exam(${JSON.stringify(exam.id)})`);
    h.many('[data-h3-type]').find(e => e.dataset.h3Type === `${si}:${ti}`).onclick();
    assert.doesNotMatch(h.app.innerHTML, /\bundefined\b|\bNaN\b/, type.id);
    assert.ok(h.app.innerHTML.includes(type.titleRu));
  }
});
