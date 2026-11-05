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
  const nodes = new Map(), lists = new Map(), listeners = new Map(), calls = [], requests = [], sessions = [];
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
    document: { querySelector: node, querySelectorAll: selector => lists.get(selector) || [],
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
    runStudySession: options => { sessions.push(options); },
    fetch: async url => { requests.push(url); if (failFetch) throw Error('offline'); return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url))) }; }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/content.js'), 'utf8'), context);
  if (realModern) vm.runInContext(fs.readFileSync(path.join(root, 'js/hsk3.js'), 'utf8'), context);
  // Run the real state and UI functions without registering routing or opening a page.
  vm.runInContext(source.slice(0, source.indexOf('window.addEventListener("hashchange", route)')), context);
  vm.runInContext('speak = async () => true', context);
  return { context, storage, node, lists, calls, requests, sessions, dictionary,
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
  assert.ok(markup.includes('HSK · 2'));
  await h.clickStar(word.id);
  assert.equal(h.run(`S.book[${key}].word.py`), 'cháng');
  h.run(`grade(${JSON.stringify(word)}, false); S.srs[${key}].d = 0; S.srs["爱"].d = Date.now() + DAY`);
  await h.clickStar(word.id);
  assert.equal(h.run(`S.book[${key}]`), undefined);
  h.offline();
  await h.run('pageStudy("review")');
  assert.equal(h.sessions[0].mode, 'review');
  assert.equal(h.sessions[0].queue[0].py, 'cháng');
  assert.equal(h.sessions[0].queue[0].id, word.id);
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
  assert.ok(h.run(`wordRow(${JSON.stringify(rows.find(w => !w.curriculum))})`).includes('Учебное слово'));
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

test('new registrations and public entry points use the unified HSK stages', async () => {
  const h = harness(null);
  h.run('pageWelcome()');
  assert.ok(h.node('#app').innerHTML.includes('7–9'));
  h.node('#nick').value = 'Анна'; h.node('#go').onclick();
  assert.equal(h.run('S.settings.curriculum'), 'hsk3');
  assert.equal(h.run('S.settings.hsk3Level'), '1');
  h.run('S.settings.hsk3Level = "7-9"');
  await h.run('pageHome()');
  assert.ok(h.node('#app').innerHTML.includes('#/hsk3/7-9/study'));
  assert.ok(h.node('#app').innerHTML.includes('HSK · 7–9'));
  assert.ok(h.node('#app').innerHTML.includes('#/stages'));
  h.run('pageMe()');
  assert.ok(h.node('#app').innerHTML.includes('HSK · 7–9'));
  assert.ok(!h.node('#app').innerHTML.includes('HSK 2.0'));
  h.run('pageLearn()');
  assert.ok(h.node('#app').innerHTML.includes('#/hsk3/7-9/exam'));
  assert.ok(h.node('#app').innerHTML.includes('#/grammar'));
  assert.ok(h.node('#app').innerHTML.includes('#/dialogues'));
  assert.ok(h.node('#app').innerHTML.includes('#/reading'));
  assert.ok(!h.node('#app').innerHTML.includes('HSK 2.0'));
});

test('one stage picker preserves progress and the advanced group stays combined', async () => {
  const h = harness(legacy, { realModern: true });
  const button = h.node('#advanced-stage'); button.dataset.stage = '7-9';
  h.lists.set('[data-stage]', [button]);
  h.context.location.hash = '#/stages';
  await h.run('pageStages()');
  const html = h.node('#app').innerHTML;
  assert.equal((html.match(/data-stage=/g) || []).length, 7);
  assert.ok(html.includes('data-stage="7-9"'));
  assert.ok(!html.includes('data-stage="8"'));
  assert.ok(!html.includes('HSK 2.0'));
  button.onclick();
  assert.equal(h.context.location.hash, '#/hsk3/7-9/study');
  assert.equal(h.run('S.settings.hsk3Level'), '7-9');
  assert.equal(h.run('S.settings.level'), 3);
  assert.equal(h.run('S.srs["爱"].b'), 3);
  assert.equal(h.run('S.stats.answered'), 5);
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
  assert.ok(h.node('#app').innerHTML.includes('HSK · 7–9'));
  assert.ok(h.node('#h3-words').innerHTML.includes('hsk3-05401'));
});

test('dictionary text is escaped before entering the UI', () => {
  assert.equal(harness().run('esc("<img src=x onerror=alert(1)>")'), '&lt;img src=x onerror=alert(1)&gt;');
});

const bridge = JSON.parse(fs.readFileSync(path.join(root, 'data/hsk3/legacy-bridge.json')));
function mappedId(hz) {
  const [, level, index, kind, numbers] = bridge.rows.find(row => row[0] === hz);
  return kind === 'exact' || kind === 'senses' ? `hsk3-${String(numbers[0]).padStart(5, '0')}` : `hsk3-extra-${level}-${String(index + 1).padStart(4, '0')}`;
}
function migrationState() {
  const initial = structuredClone(legacy);
  for (const hz of ['和', '谁', '没']) {
    initial.srs[hz] = { lv: 1, b: 2, d: 0, r: 3, w: 1, first: 1234 };
    initial.book[hz] = { lv: 1, t: 23, why: 'ошибка' };
  }
  return initial;
}

test('real bridge migration backs up old records, preserves existing new progress and deduplicates visible cards', async () => {
  const initial = migrationState(), h = harness(initial, { realModern: true });
  const ai = mappedId('爱'), existingWord = JSON.parse(JSON.stringify(await h.run(`HSK3.find(${JSON.stringify(ai)})`)));
  const existing = { lv: existingWord.lv, b: 1, d: Date.now() + 864e5, r: 7, w: 4, word: existingWord, curriculum: 'hsk3' };
  h.run(`S.srs[${JSON.stringify(ai)}] = ${JSON.stringify(existing)}`);
  assert.equal(await h.run('ensureUnifiedCourse()'), true);
  h.run('save()'); h.flush();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.deepEqual(saved.legacyProgressBackup.srs, initial.srs);
  assert.deepEqual(saved.legacyProgressBackup.book, initial.book);
  assert.deepEqual(saved.srs[ai], existing, 'an existing canonical answer history is authoritative');
  for (const [old, record] of Object.entries(initial.srs)) assert.deepEqual(saved.srs[old], record);
  assert.deepEqual(saved.stats, initial.stats); assert.deepEqual(saved.history, initial.history);
  assert.equal(saved.settings.level, 3); assert.equal(saved.settings.hsk3Level, '3');
  assert.equal(saved.settings.curriculum, 'hsk3');
  assert.equal(h.run('progressEntries().length'), 4);
  assert.equal(h.run('bookmarkKeys().length'), 4);
  assert.equal(h.run('dueList().length'), 3, 'old due state cannot override the already scheduled canonical card');
  const senses = bridge.rows.find(row => row[0] === '和')[4];
  assert.ok(saved.srs[mappedId('和')].word.ru);
  for (const number of senses.slice(1)) assert.equal(saved.srs[`hsk3-${String(number).padStart(5, '0')}`], undefined);
  for (const hz of ['谁', '没']) assert.equal(saved.srs[mappedId(hz)].word.isSupplement, true);
  assert.equal((await h.run('findWord("和")')).id, mappedId('和'));
  const serialized = JSON.stringify(saved);
  await h.run('ensureUnifiedCourse()'); h.run('save()'); h.flush();
  assert.equal(h.storage.get('hanyutong-v2'), serialized, 'repeating migration is a no-op');
});

test('migrated aliases and word snapshots work after reload without any cloud or vocabulary request', async () => {
  const h = harness(migrationState(), { realModern: true });
  await h.run('ensureUnifiedCourse()'); h.run('save()'); h.flush();
  const restored = harness(JSON.parse(h.storage.get('hanyutong-v2')), { realModern: true }); restored.offline();
  assert.equal(await restored.run('ensureUnifiedCourse()'), false);
  assert.equal(restored.run('progressEntries().length'), 4);
  assert.equal(restored.run('bookmarkKeys().length'), 4);
  for (const hz of ['爱', '和', '谁', '没']) {
    const word = await restored.run(`findWord(${JSON.stringify(hz)})`);
    assert.equal(word.id, mappedId(hz)); assert.ok(word.ru);
  }
  await restored.run('pageStudy("review")');
  assert.equal(restored.sessions[0].queue.length, 4);
  assert.equal(new Set(restored.sessions[0].queue.map(word => word.id)).size, 4);
});

test('removing a migrated bookmark removes all aliases and a completed migration does not restore it', async () => {
  const h = harness(migrationState(), { realModern: true });
  await h.run('ensureUnifiedCourse()');
  await h.clickStar('和');
  assert.equal(h.run('S.book["和"]'), undefined);
  assert.equal(h.run(`S.book[${JSON.stringify(mappedId('和'))}]`), undefined);
  assert.equal(h.run('bookmarkKeys().length'), 3);
  assert.ok(h.run('S.legacyProgressBackup.book["和"]'));
  h.run('save()'); h.flush();
  const restored = harness(JSON.parse(h.storage.get('hanyutong-v2')), { realModern: true });
  await restored.run('ensureUnifiedCourse()');
  assert.equal(restored.run('bookmarkKeys().length'), 3);
});

test('a failed new snapshot fetch leaves old review usable and migration can finish later', async () => {
  const h = harness();
  h.context.HSK3.bridge = async () => bridge;
  h.context.HSK3.find = async () => { throw Error('offline'); };
  assert.equal(await h.run('ensureUnifiedCourse()'), false);
  assert.equal(h.run('S.srs["爱"].b'), 3);
  assert.equal(h.run('S.unifiedCourseVersion'), undefined);
  await h.run('pageStudy("review")');
  assert.equal(h.sessions[0].queue[0].id, mappedId('爱'));
  assert.ok(h.sessions[0].queue[0].ru);
  assert.equal(h.run(`wordProgress(${JSON.stringify(h.sessions[0].queue[0])}).b`), 3);
  const snapshot = { ...h.sessions[0].queue[0], ru: 'любить; любовь' };
  h.context.HSK3.find = async key => key === snapshot.id ? snapshot : null;
  assert.equal(await h.run('ensureUnifiedCourse()'), true);
  assert.equal(h.run(`S.srs[${JSON.stringify(snapshot.id)}].word.ru`), snapshot.ru);
});

test('unified dictionary search shows the mapped card once while keeping numbered senses distinct', async () => {
  const h = harness(legacy, { realModern: true });
  await h.run('ensureUnifiedCourse()');
  const love = await h.run('searchWords("爱")');
  assert.equal(love.words.filter(word => word.hz === '爱').length, 1);
  assert.equal(love.words.find(word => word.hz === '爱').id, mappedId('爱'));
  const senses = bridge.rows.find(row => row[0] === '和')[4];
  const result = await h.run('searchWords("和")');
  for (const number of senses) assert.ok(result.words.some(word => word.id === `hsk3-${String(number).padStart(5, '0')}`));
  assert.equal(new Set(result.words.map(word => word.id || word.hz)).size, result.words.length);
});
