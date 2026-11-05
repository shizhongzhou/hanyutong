const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const legacy = {
  v: 2, profile: { nick: 'Тест' }, settings: { level: 3 },
  book: { '爱': { lv: 1, t: 1 } }, srs: { '爱': { lv: 1, b: 3, d: 0, r: 2, w: 0 } },
  stats: { answered: 5, correct: 4, days: {} }, history: [{ t: 1, kind: 'Тест · HSK 1', score: '4/5' }]
};
const modern = [
  { id: 'hsk3:ai:1', hz: '爱', py: 'ài', ru: 'любить', pos: 'гл.', level: '1', lv: '1', curriculum: 'hsk3' },
  { id: 'hsk3:chang:1', hz: '长', py: 'cháng', ru: 'длинный', pos: 'прил.', level: '2', lv: '2', curriculum: 'hsk3' },
  { id: 'hsk3:zhang:1', hz: '长', py: 'zhǎng', ru: 'расти', pos: 'гл.', level: '2', lv: '2', curriculum: 'hsk3' },
  { id: 'hsk3:zhanshang:1', hz: '赞赏', py: 'zànshǎng', ru: 'высоко оценивать', pos: 'гл.', level: '7-9', lv: '7-9', curriculum: 'hsk3' }
];

function harness(initial = legacy, { realModern = false } = {}) {
  const storage = new Map(initial ? [['hanyutong-v2', JSON.stringify(initial)]] : []);
  const nodes = new Map(), listeners = new Map(), calls = [], requests = [];
  let callback, failModern = false, failFetch = false;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', isConnected: true,
      dataset: {}, value: '', classList: { add() {}, remove() {} },
      setAttribute() {}, toggleAttribute() {}, focus() {}, remove() {}, select() {} });
    return nodes.get(selector);
  };
  const dictionary = { lookup: async () => { throw Error('offline'); }, search: async () => [],
    normalizePinyin: text => text.toLowerCase().replace(/u:|[üǖǘǚǜ]/g, 'v').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '') };
  const context = vm.createContext({ console, structuredClone,
    setTimeout: fn => { callback = fn; return 1; }, clearTimeout() {},
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: node, querySelectorAll: () => [],
      addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
      createElement: () => ({ set innerHTML(value) { this.content = { firstElementChild: node('template') }; } }),
      body: { append() {} } },
    location: { hash: '#/home', replace(value) { this.hash = value; }, reload() {} },
    window: { scrollTo() {} }, Dictionary: dictionary,
    HSK3: {
      all: async () => { if (failModern) throw Error('offline'); return modern; },
      find: async key => { calls.push(key); if (failModern) throw Error('offline'); return modern.find(w => w.id === key) || null; },
      level: async lv => modern.filter(w => w.level === lv)
    },
    pageHSK3: async (...args) => { calls.push(args); },
    fetch: async url => { requests.push(url); if (failFetch) throw Error('offline'); return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url))) }; }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/content.js'), 'utf8'), context);
  if (realModern) vm.runInContext(fs.readFileSync(path.join(root, 'js/hsk3.js'), 'utf8'), context);
  // Run the real state and UI functions without registering routing or opening a page.
  vm.runInContext(source.slice(0, source.indexOf('window.addEventListener("hashchange", route)')), context);
  vm.runInContext('speak = async () => true', context);
  return { context, storage, node, calls, requests, dictionary,
    run: code => vm.runInContext(code, context), flush: () => callback?.(),
    offline: () => { failModern = true; failFetch = true; },
    modernOffline: () => { failModern = true; },
    async clickStar(key) {
      const button = { dataset: { star: key }, setAttribute() {} };
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: selector => selector === '[data-star]' ? button : null } });
    }
  };
}

test('existing HSK 2.0 progress, settings and history survive without rewriting legacy keys', async () => {
  const h = harness();
  assert.equal(h.run('S.settings.level'), 3);
  assert.equal(h.run('S.settings.goal'), 20);
  assert.equal(h.run('S.settings.curriculum'), 'hsk2');
  assert.equal(h.run('S.settings.hsk3Level'), '1');
  assert.equal(h.run('S.srs["爱"].b'), 3);
  assert.equal((await h.run('findWord("爱")')).lv, 1);
  assert.deepEqual(h.calls, [], 'Hanzi lookup must not depend on the new catalogue');
  h.run('save()'); h.flush();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.equal(saved.v, 2);
  for (const key of ['srs', 'book', 'stats', 'history']) assert.deepEqual(saved[key], legacy[key]);
});

test('HSK 3.0 cards use their IDs and never overwrite legacy or alternative readings', async () => {
  const h = harness();
  h.run(`grade(${JSON.stringify(modern[0])}, true); grade(${JSON.stringify(modern[1])}, true); grade(${JSON.stringify(modern[2])}, false)`);
  h.flush();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.deepEqual(saved.srs['爱'], legacy.srs['爱']);
  assert.equal(saved.srs[modern[0].id].word.ru, 'любить');
  assert.equal(saved.srs[modern[1].id].b, 1);
  assert.equal(saved.srs[modern[2].id].b, 0);
  assert.equal(h.run('known(1)'), 1);
  h.offline();
  assert.equal((await h.run(`findWord(${JSON.stringify(modern[1].id)})`)).py, 'cháng');
  assert.equal((await h.run(`findWord(${JSON.stringify(modern[2].id)})`)).py, 'zhǎng');
  assert.deepEqual(h.calls, [], 'snapshots should be usable without any catalogue request');
});

test('errors preserve HSK 3.0 snapshots and due entries carry IDs separately from Hanzi', async () => {
  const h = harness(), word = modern[3];
  h.run(`record(false, ${JSON.stringify(word.id)}, "7-9", ${JSON.stringify(word)}); grade(${JSON.stringify(word)}, false); S.srs[${JSON.stringify(word.id)}].d = 0; record(false, ${JSON.stringify(word.id)}, "7-9")`);
  h.flush(); h.offline();
  assert.equal((await h.run(`findWord(${JSON.stringify(word.id)})`)).ru, word.ru);
  const due = h.run('dueList()').find(x => x.key === word.id);
  assert.equal(due.hz, word.hz);
  assert.equal(due.lv, '7-9');
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.equal(saved.book[word.id].word.id, word.id);
  assert.equal(saved.srs[word.id].word.id, word.id);
});

test('bookmark buttons, word links and the shared review page preserve HSK 3.0 identity', async () => {
  const h = harness(), word = modern[1], key = JSON.stringify(word.id);
  const markup = h.run(`wordRow(${JSON.stringify(word)})`);
  assert.ok(markup.includes(`data-star="${word.id}"`));
  assert.ok(markup.includes(`#/word/${encodeURIComponent(word.id)}`));
  assert.ok(markup.includes('HSK 3.0'));
  await h.clickStar(word.id);
  assert.equal(h.run(`S.book[${key}].word.py`), 'cháng');
  h.run(`grade(${JSON.stringify(word)}, false); S.srs[${key}].d = 0; S.srs["爱"].d = Date.now() + DAY`);
  await h.clickStar(word.id);
  assert.equal(h.run(`S.book[${key}]`), undefined);
  h.offline();
  await h.run('pageStudy("review")');
  assert.ok(h.node('#app').innerHTML.includes('cháng'));
  assert.ok(h.node('#app').innerHTML.includes('HSK 3.0'));
  assert.ok(h.node('#app').innerHTML.includes(word.id));
});

test('extended dictionary cards persist for offline review after removing the bookmark', async () => {
  const h = harness();
  h.run('grade({hz:"靠谱",py:"kàopǔ",ru:"надёжный",lv:0,source:"bkrs",examples:[]}, true)');
  h.flush(); h.offline();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.equal(saved.srs['靠谱'].word.ru, 'надёжный');
  const word = await h.run('findWord("靠谱")');
  assert.equal(word.hz, '靠谱'); assert.equal(word.lv, 0);
});

test('dictionary search retains different readings and clearly labels both curricula', async () => {
  const h = harness();
  h.dictionary.search = async () => [{ hz: '长', py: 'cháng', ru: 'полная статья', lv: 0, source: 'bkrs' }];
  const result = await h.run('searchWords("长")');
  const rows = result.words.filter(w => w.hz === '长');
  assert.equal(rows.filter(w => w.curriculum === 'hsk3').length, 2);
  assert.equal(new Set(rows.map(w => w.id || w.hz)).size, rows.length);
  assert.equal(rows.filter(w => w.source === 'bkrs').length, 0);
  assert.ok(rows.some(w => !w.curriculum));
  assert.ok(h.run(`wordRow(${JSON.stringify(rows.find(w => !w.curriculum))})`).includes('HSK 2.0'));
  h.run('S.settings.curriculum = "hsk3"');
  assert.equal((await h.run('searchWords("长")')).words[0].curriculum, 'hsk3');
  assert.ok((await h.run('searchHskWords("расти")')).some(w => w.id === modern[2].id));
  assert.ok((await h.run('searchHskWords("zhǎng")')).some(w => w.id === modern[2].id));
});

test('an unavailable new catalogue does not break old dictionary searches', async () => {
  const h = harness(); h.modernOffline();
  const words = await h.run('searchHskWords("爱")');
  assert.ok(words.some(w => w.hz === '爱' && !w.curriculum));
});

test('new registrations select HSK 3.0 and profile, home and study links use that course', async () => {
  const h = harness(null);
  h.run('pageWelcome()');
  assert.ok(h.node('#app').innerHTML.includes('7–9'));
  h.node('#nick').value = 'Анна'; h.node('#go').onclick();
  assert.equal(h.run('S.settings.curriculum'), 'hsk3');
  assert.equal(h.run('S.settings.hsk3Level'), '1');
  h.run('S.settings.hsk3Level = "7-9"');
  await h.run('pageHome()');
  assert.ok(h.node('#app').innerHTML.includes('#/hsk3/7-9/study'));
  assert.ok(h.node('#app').innerHTML.includes('HSK 3.0 · 7–9'));
  h.run('pageMe()');
  assert.ok(h.node('#app').innerHTML.includes('HSK 3.0 · 7–9'));
  h.run('pageLearn()');
  assert.ok(h.node('#app').innerHTML.includes('#/hsk3/7-9/exam'));
  assert.ok(h.node('#app').innerHTML.includes('прежнего курса HSK 2.0'));
});

test('HSK 3.0 routing passes the combined upper-level ID and hides the floating button in practice', async () => {
  const h = harness();
  h.context.location.hash = '#/hsk3/7-9/quiz';
  await h.run('route()');
  assert.deepEqual(h.calls[0], ['7-9', 'quiz']);
  assert.equal(h.node('#fab').hidden, true);
});

test('v2 state roundtrip retains both course IDs and the old level', async () => {
  const h = harness();
  h.run(`S.settings.curriculum = "hsk3"; S.settings.hsk3Level = "7-9"; grade(${JSON.stringify(modern[3])}, true)`);
  h.flush();
  const restored = harness(JSON.parse(h.storage.get('hanyutong-v2')));
  assert.equal(restored.run('S.settings.level'), 3);
  assert.equal(restored.run('S.settings.hsk3Level'), '7-9');
  assert.equal(restored.run('S.settings.curriculum'), 'hsk3');
  assert.equal(restored.run('S.srs["爱"].b'), 3);
  assert.equal((await restored.run(`findWord(${JSON.stringify(modern[3].id)})`)).py, modern[3].py);
});

test('the real HSK 3.0 module resolves IDs and opens the advanced group through app routing', async () => {
  const h = harness(legacy, { realModern: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/manifest.json')));
  const first = manifest.levels.find(level => level.id === '1');
  const original = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3', first.files?.[0]?.file || first.file)))[0];
  const word = await h.run(`findWord(${JSON.stringify(original.id)})`);
  assert.equal(word.hz, original.hz);
  assert.equal(word.curriculum, 'hsk3');
  assert.equal(h.run(`wordKey(${JSON.stringify(word)})`), original.id);
  h.context.location.hash = '#/hsk3/7-9/vocab';
  await h.run('route()');
  assert.equal(h.run('S.settings.curriculum'), 'hsk3');
  assert.equal(h.run('S.settings.hsk3Level'), '7-9');
  assert.ok(h.node('#app').innerHTML.includes('HSK 3.0 · 7–9'));
  assert.ok(h.node('#h3-words').innerHTML.includes('hsk3-05401'));
});

test('dictionary text is escaped before entering the UI', () => {
  assert.equal(harness().run('esc("<img src=x onerror=alert(1)>")'), '&lt;img src=x onerror=alert(1)&gt;');
});
