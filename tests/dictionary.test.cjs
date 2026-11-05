const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
let requests = [];
const context = vm.createContext({ TextDecoder, Uint8Array, ArrayBuffer, Response,
  fetch: async url => {
    requests.push(url);
    const file = path.join(root, url.split('?')[0]);
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  }
});
vm.runInContext(fs.readFileSync(path.join(root, 'vendor/fflate.min.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/dictionary.js'), 'utf8'), context);
const dict = vm.runInContext('Dictionary', context);

test('dictionary remains lazy at startup', () => assert.equal(requests.length, 0));
test('tone and umlaut search normalization', () => {
  for (const q of ['lǜ', 'lü4', 'lv4', 'lu:4']) assert.equal(dict.normalizePinyin(q), 'lv');
  assert.equal(dict.normalizePinyin('nǐ hǎo'), 'nihao');
});
test('full non-HSK Russian entry and source examples are available', async () => {
  const word = await dict.lookup('方便');
  assert.equal(word.hz, '方便');
  assert.match(word.ru, /[а-яё]/i);
  assert.ok(word.ru.length > 100);
  assert.ok(word.examples.length > 0);
  assert.equal(word.lv, 0);
  assert.ok(await dict.lookup('靠谱'));
});
test('exact Chinese result precedes prefix matches, results are bounded', async () => {
  const words = await dict.search('中国', 15);
  assert.equal(words[0].hz, '中国');
  assert.ok(words.length <= 15);
  assert.ok(words.every(w => w.hz.startsWith('中国')));
});
test('Russian multiword queries intersect all searchable tokens', async () => {
  const words = await dict.search('железная дорога', 8);
  assert.ok(words.length);
  for (const w of words) {
    const text = dict.normalizeRussian(w.ru);
    assert.match(text, /железная/); assert.match(text, /дорога/);
  }
});
test('pinyin retrieves real entries; no match and punctuation stay empty', async () => {
  const words = await dict.search('kaopu', 60);
  assert.ok(words.some(w => w.hz === '靠谱'));
  assert.equal((await dict.search('!!!')).length, 0);
  assert.equal(await dict.lookup('这是一个不存在的测试词条xyz'), null);
});
test('single-character metadata includes strokes, radicals, and supplementary Han', async () => {
  const han = await dict.character('汉');
  assert.equal(han.strokes.split(' ')[0], '5');
  assert.ok(han.radical); assert.ok(han.traditional.includes('漢'));
  assert.ok(await dict.character('𠀀'));
});
test('manifest truthfully records scope and every data file exists', async () => {
  const m = await dict.manifest();
  assert.ok(m.entries > 1000000);
  assert.equal(m.entries + m.excludedNonChineseOrNoRussian + m.mergedDuplicates, m.sourceRecords);
  assert.ok(m.charactersWithRussian > 10000);
  assert.ok(m.entriesWithExamples > 1000);
  for (const [name, info] of Object.entries(m.files)) {
    assert.equal(fs.statSync(path.join(root, 'data/dictionary', name)).size, info.bytes);
  }
});
