const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/manifest.json')));
const bridge = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/legacy-bridge.json')));
const exams = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/exams.json')));
const source = fs.readFileSync(path.join(root, 'js/hsk3.js'), 'utf8');
const fileOf = id => { const meta = manifest.levels.find(x => x.id === id); return 'data/hsk3/' + (meta.files?.[0]?.file || meta.file); };

function harness() {
  const elements = new Set(), ids = new Map(), requests = [], failures = new Map(), gates = new Map();
  const intervals = new Map(), leaves = [], records = [], graded = [], sessions = [];
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
    wordProgress: w => state.srs[w.id] || state.srs[w.hz],
    runStudySession: options => { sessions.push(options); return options; },
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
  return { context, app, state, day, sessions, records, graded, requests, intervals, one, many,
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

test('unified course contains all 11000 official entries and 295 supplemental cards', async () => {
  const h = harness(), words = await h.run('HSK3.cumulative("7-9")');
  assert.equal(words.length, 11295); assert.equal(new Set(words.map(w => w.id)).size, 11295);
  assert.equal(words.filter(w => !w.isSupplement).length, 11000);
  assert.equal(words.filter(w => w.isSupplement).length, 295);
  assert.equal(words[0].number, 1); assert.equal(words.at(-1).number, 11000);
  assert.ok(words.every(w => w.ru && w.hz && w.py && w.lv === w.level && w.curriculum === 'hsk3'));
  for (const level of bridge.levels) assert.equal(words.filter(w => w.level === level.id).length, level.totalCount);
});

test('unified manifest preserves official counts and adds per-stage supplements without mutating the source', async () => {
  const h = harness(), unified = await h.run('HSK3.manifest()');
  assert.equal(unified.totalEntries, 11295); assert.equal(unified.officialEntries, 11000);
  assert.equal(unified.supplementEntries, 295);
  assert.deepEqual(Array.from(unified.levels, l => l.count), [309, 207, 524, 1027, 1652, 1976, 5600]);
  assert.deepEqual(Array.from(unified.levels, l => l.cumulativeCount), [309, 516, 1040, 2067, 3719, 5695, 11295]);
  assert.deepEqual(Array.from(unified.levels, l => l.officialCumulativeCount), [300, 500, 1000, 2000, 3600, 5400, 11000]);
  assert.deepEqual(Array.from(unified.levels, l => l.officialCount), manifest.levels.map(l => l.count));
  assert.equal(manifest.totalEntries, 11000);
  await h.run('HSK3.manifest()'); await h.run('HSK3.bridge()');
  assert.equal(h.requests.filter(url => url === 'data/hsk3/legacy-bridge.json').length, 1);
});

test('supplement lookup validates the bridge and retains every original reading and definition', async () => {
  const h = harness(), additions = bridge.rows.filter(row => ['reading', 'extra'].includes(row[3]));
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const group = additions.filter(row => row[1] === level);
    for (const row of [group[0], group.at(-1)]) {
      const key = `hsk3-extra-${level}-${String(row[2] + 1).padStart(4, '0')}`;
      const word = await h.run(`HSK3.find(${JSON.stringify(key)})`);
      const original = JSON.parse(fs.readFileSync(path.join(root, `data/hsk${level}.json`)))[row[2]];
      assert.equal(word.id, key); assert.equal(word.hz, original[0]); assert.equal(word.py, original[1]);
      assert.equal(word.ru, original[2]); assert.equal(word.pos, original[3]);
      assert.equal(word.isSupplement, true); assert.equal(word.curriculum, 'hsk3');
      assert.equal(word.level, String(level)); assert.equal(word.number, null);
      assert.equal(Object.hasOwn(word, 'source'), false);
      const details = await h.run(`HSK3.legacyDetails(${JSON.stringify(key)})`);
      assert.equal(details.length, 1); assert.equal(details[0].ru, original[2]);
      assert.equal(details[0].legacyIndex, row[2]);
    }
  }
  const exact = bridge.rows.find(row => row[3] === 'exact');
  const excludedId = `hsk3-extra-${exact[1]}-${String(exact[2] + 1).padStart(4, '0')}`;
  for (const key of [excludedId, 'hsk3-extra-1-0000', 'hsk3-extra-6-9999', 'hsk3-extra-7-0001', 'hsk3-extra-1-1']) {
    assert.equal(await h.run(`HSK3.find(${JSON.stringify(key)})`), null);
  }
  const officialId = `hsk3-${String(exact[4][0]).padStart(5, '0')}`;
  const details = await h.run(`HSK3.legacyDetails(${JSON.stringify(officialId)})`);
  assert.equal(details[0].hz, exact[0]); assert.equal(details[0].kind, 'exact');
  assert.deepEqual(Array.from(await h.run('HSK3.legacyDetails("bad-id")')), []);
});

test('overview and supplementary vocabulary explain one course without presenting extra words as official', async () => {
  const h = harness(); await h.run('pageHSK3()');
  assert.match(h.app.innerHTML, /11 295/); assert.match(h.app.innerHTML, /295 дополнительных/);
  assert.doesNotMatch(h.app.innerHTML, /Предыдущий курс|href="#\/levels"/);
  h.context.location.hash = '#/hsk3/1/vocab'; await h.run('pageHSK3("1", "vocab")');
  assert.match(h.app.innerHTML, /300 слов официальной программы \+ 9 дополнительных/);
  h.one('#h3-search').value = '北京'; h.one('#h3-search').oninput();
  assert.match(h.one('#h3-words').innerHTML, /Дополнительное слово/);
  assert.doesNotMatch(h.one('#h3-words').innerHTML, /№ null|№ undefined/);
});

test('failed vocabulary requests can retry and concurrent reads share their download', async () => {
  const h = harness(), file = fileOf('1'); h.failOnce(file);
  await assert.rejects(h.run('HSK3.level("1")'), /offline/);
  const [a, b] = await Promise.all([h.run('HSK3.level("1")'), h.run('HSK3.level("1")')]);
  assert.equal(a.length, 309); assert.equal(b.length, 309);
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
  assert.equal(h.many('[data-h3-word]').length, 29);
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
  assert.match(h.one('#h3-count').textContent, /Найдено: 207/);
});

test('pinyin search preserves umlauts when stripping tones', () => {
  const h = harness();
  assert.equal(h.run('h3Norm("lǜ")'), h.run('h3Norm("lv")'));
  assert.equal(h.run('h3Norm("nǚ")'), h.run('h3Norm("nü")'));
});

test('study adapter selects due and fresh words through canonical progress and delegates the session', async () => {
  const h = harness(), words = await h.run('HSK3.level("1")');
  h.context.wordsForTest = words.slice(0, 6);
  h.state.srs[words[0].hz] = { b: 1, d: 0 }; // Previously stored Hanzi progress.
  h.state.srs[words[1].id] = { b: 1, d: 1000 }; // Existing card, not due yet.
  h.state.srs[words[2].id] = { b: 0, d: -1 };
  h.state.settings.newPerDay = 3; h.day.learned = 2;
  h.run('h3Study("1", wordsForTest)');
  assert.equal(h.sessions.length, 1);
  const session = h.sessions[0];
  assert.deepEqual(Array.from(session.queue, w => w.id), [words[0].id, words[2].id, words[3].id]);
  assert.equal(session.words.length, 6);
  assert.equal(session.curriculum, 'hsk3'); assert.equal(session.level, '1');
  assert.equal(session.backHref, '#/stages'); assert.equal(session.quizHref, '#/hsk3/1/quiz');
  assert.equal(session.title, 'HSK · 1'); assert.equal(session.mode, 'learn');
  assert.equal(h.records.length, 0); assert.equal(h.graded.length, 0);
  h.state.srs = Object.fromEntries(words.slice(0, 25).map(w => [w.id, { d: 0 }]));
  h.context.wordsForTest = words; h.day.learned = 0; h.state.settings.newPerDay = 2;
  h.run('h3Study("1", wordsForTest)');
  assert.equal(h.sessions[1].queue.length, 22); // Twenty due cards, two fresh cards.
});

test('word quizzes count each submitted answer once', async () => {
  const h = harness(); h.context.wordsForTest = await h.run('HSK3.level("1")');
  h.run('h3Quiz("1", wordsForTest)');
  const choice = h.many('[data-h3-answer]')[0].onclick;
  choice(); choice(); assert.equal(h.records.length, 1); assert.equal(h.graded.length, 1);
  h.leave(); choice(); assert.equal(h.records.length, 1);
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
