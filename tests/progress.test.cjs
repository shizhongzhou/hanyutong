const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const storage = new Map([['hanyutong-v2', JSON.stringify({
  v: 2, profile: { nick: 'Тест' }, settings: { level: 3 },
  book: { '爱': { lv: 1, t: 1 } }, srs: { '爱': { lv: 1, b: 3, d: 0, r: 2, w: 0 } },
  stats: { answered: 5, correct: 4, days: {} }, history: []
})]]);
let callback;
const context = vm.createContext({ console, structuredClone,
  setTimeout: fn => { callback = fn; return 1; }, clearTimeout: () => {},
  localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  document: { querySelector: () => ({}), querySelectorAll: () => [], addEventListener: () => {} },
  window: {}, Dictionary: { lookup: async () => { throw Error('offline'); } },
  fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, url))) })
});
// Load the real state and learning functions without starting UI routing.
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
vm.runInContext(source.slice(0, source.indexOf('window.addEventListener("hashchange", route)')), context);

test('existing HSK progress and defaults survive the update', async () => {
  assert.equal(vm.runInContext('S.settings.level', context), 3);
  assert.equal(vm.runInContext('S.settings.goal', context), 20);
  assert.equal(vm.runInContext('S.srs["爱"].b', context), 3);
  assert.equal((await vm.runInContext('findWord("爱")', context)).lv, 1);
});
test('extended cards persist for offline review even after removing the bookmark', async () => {
  vm.runInContext('grade({hz:"靠谱",py:"kàopǔ",ru:"надёжный",lv:0,source:"bkrs",examples:[]}, true)', context);
  callback();
  const saved = JSON.parse(storage.get('hanyutong-v2'));
  assert.equal(saved.srs['靠谱'].word.ru, 'надёжный');
  const word = await vm.runInContext('findWord("靠谱")', context);
  assert.equal(word.hz, '靠谱'); assert.equal(word.lv, 0);
  assert.equal(vm.runInContext('known(1)', context), 1);
});
test('dictionary text is escaped before entering the UI', () => {
  assert.equal(vm.runInContext('esc("<img src=x onerror=alert(1)>")', context), '&lt;img src=x onerror=alert(1)&gt;');
});
