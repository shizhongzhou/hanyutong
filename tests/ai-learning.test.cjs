'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const appSource = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const learningSource = fs.readFileSync(path.join(root, 'js/ai-learning.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const fresh = () => ({ v: 2, profile: { nick: 'PRIVATE_NAME' }, settings: { level: 2, curriculum: 'hsk3', hsk3Level: '2' },
  book: {}, srs: {}, stats: { answered: 12, correct: 8, days: {} }, history: [{ kind: 'existing', score: '8/12' }] });

function harness(initial = fresh()) {
  const store = new Map([['hanyutong-v2', JSON.stringify(initial)]]), nodes = new Map(), listeners = new Map(), sessions = [];
  let saveCallback = null, requests = 0;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', isConnected: true, dataset: {}, value: '',
      classList: { add() {}, remove() {} }, setAttribute() {}, toggleAttribute() {}, focus() {}, remove() {} });
    return nodes.get(selector);
  };
  const context = vm.createContext({ console, structuredClone,
    setTimeout: fn => { saveCallback = fn; return 1; }, clearTimeout() {},
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    document: { querySelector: node, querySelectorAll: () => [],
      addEventListener: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
      createElement: () => ({ set innerHTML(_) { this.content = { firstElementChild: node('template') }; } }), body: { append() {} } },
    window: { scrollTo() {} }, location: { hash: '#/ai-profile', replace(value) { this.hash = value; } },
    Dictionary: { lookup: async () => { requests++; throw Error('unexpected dictionary request'); }, normalizePinyin: value => value },
    HSK3: { find: async () => { requests++; throw Error('unexpected HSK request'); } },
    pageHSK3() {}, pageAIPronunciation() {}, pageAIAssessment() {}, pageAIExam() {},
    runStudySession: value => sessions.push(value),
    fetch: async () => { requests++; throw Error('learning integration must work locally'); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/content.js'), 'utf8'), context);
  vm.runInContext(learningSource, context);
  vm.runInContext(appSource.slice(0, appSource.indexOf('window.addEventListener("hashchange", route)')), context);
  const run = source => vm.runInContext(source, context);
  return { run, context, nodes, node, store, sessions, requests: () => requests,
    learning: run('HanyuLearning'), state: () => run('S'), flush: () => saveCallback?.(),
    async clickStar(key) { const button = { dataset: { star: key }, setAttribute() {} };
      for (const fn of listeners.get('click') || []) await fn({ target: { closest: selector => selector === '[data-star]' ? button : null } }); }
  };
}

const modern = { id: 'hsk3-00001', hz: '爱', py: 'ài', ru: 'любить', curriculum: 'hsk3', lv: '1', level: '1' };

test('context uses real current learned progress, deduplicates migrated cards, and never a requested HSK level', () => {
  const initial = fresh();
  initial.srs = { 爱: { b: 5, lv: 1 }, 'hsk3-00001': { b: 1, lv: '1', curriculum: 'hsk3', word: modern },
    forgotten: { b: 0, lv: '1', word: { ...modern, id: 'forgotten', hz: '忘' } },
    savedOnly: { b: 0, lv: '2', word: { hz: '新', py: 'xīn' } } };
  initial.book['新'] = { word: { hz: '新', py: 'xīn', ru: 'новый' } };
  const h = harness(initial); h.run('legacyAliases.set("爱", "hsk3-00001")');
  const result = clone(h.learning.context());
  assert.deepEqual(result.knownWords, ['爱']); assert.deepEqual(result.grammarErrors, []); assert.deepEqual(result.toneErrors, []);
  assert.equal(h.learning.summary().learnedHskCount, 1); assert.equal(h.requests(), 0);
  assert.equal(Object.hasOwn(h.state(), 'aiLearning'), false, 'reading a fresh profile has no storage mutation');
});

test('known word context is bounded to 40 learned words and excludes control strings and IDs', () => {
  const initial = fresh();
  for (let i = 0; i < 65; i++) initial.srs['hsk3-' + i] = { b: 1, curriculum: 'hsk3', first: i, word: { hz: String.fromCodePoint(0x4e00 + i), curriculum: 'hsk3' } };
  initial.srs['bad'] = { b: 8, lv: 1, word: { hz: 'person@example.com' } };
  const h = harness(initial), result = h.learning.context();
  assert.equal(result.knownWords.length, 40); assert.equal(h.learning.summary().learnedHskCount, 65);
  assert.ok(result.knownWords.every(value => /^\p{Script=Han}+$/u.test(value)));
});

test('corrections persist only whitelisted category counts, not sentences, names or contact details', () => {
  const h = harness();
  const correction = { kind: 'grammar', original: 'SECRET Иван private@example.com 我很好是', corrected: 'SECRET Иван +79991234567 我很好', explanationRu: 'Исправьте порядок слов. SECRET Иван остаётся в примере.' };
  assert.equal(h.learning.recordCorrections([correction, correction]), 2);
  h.learning.recordCorrections([{ kind: 'word', original: '做朋友', corrected: '交朋友', explanationRu: 'Здесь нужна другая сочетаемость слов.' }]);
  const stored = JSON.stringify(h.state().aiLearning), result = clone(h.learning.context());
  assert.doesNotMatch(stored, /SECRET|Иван|private|example|7999|我|交|做|PRIVATE_NAME/);
  assert.equal(h.state().aiLearning.corrections[0].count, 2);
  assert.match(result.grammarErrors[0], /порядок слов · 2/); assert.match(result.grammarErrors[1], /сочетаемость/);
  assert.equal(result.grammarErrors.length, 2);
  assert.equal(h.learning.recordCorrections([{ ...correction, kind: 'arbitrary' }, { ...correction, corrected: correction.original }]), 0);
  h.flush(); assert.ok(JSON.parse(h.store.get('hanyutong-v2')).aiLearning);
});

test('only clear mismatched contours count; uncertain, neutral and matching tones do not', () => {
  const h = harness(), base = { expectedTone: 2, detectedTone: 4, durationSeconds: .8 };
  for (const status of ['insufficient_evidence', 'similar_shape', 'not_assessed', 'whatever']) assert.equal(h.learning.recordTone({ ...base, status }), false);
  assert.equal(h.learning.recordTone({ ...base, expectedTone: 5, status: 'different_shape' }), false);
  assert.equal(h.learning.recordTone({ ...base, detectedTone: 2, status: 'different_shape' }), false);
  assert.equal(Object.hasOwn(h.state(), 'aiLearning'), false);
  h.learning.recordTone({ ...base, status: 'different_shape', audio: 'SECRET_AUDIO' }); h.learning.recordTone({ ...base, status: 'different_shape' });
  assert.equal(h.state().aiLearning.tones[0].count, 2);
  assert.equal(h.learning.context().toneErrors.length, 1);
  assert.ok([...h.learning.context().toneErrors[0]].length <= 60);
  assert.doesNotMatch(JSON.stringify(h.state().aiLearning), /audio|durationSeconds|SECRET/);
});

test('multiline corrections are classified without retaining their raw text', () => {
  const h = harness();
  assert.equal(h.learning.recordCorrections([{ kind: 'grammar', original: '我\n很好是', corrected: '我很好\n', explanationRu: 'Перед\tприлагательным\nне нужна связка 是.' }]), 1);
  assert.equal(h.state().aiLearning.corrections[0].category, 'grammar:copula');
  assert.doesNotMatch(JSON.stringify(h.state().aiLearning), /我|перед|прилагательным|связка/iu);
});

test('malformed imported aggregate state is sanitized and counts and contexts remain bounded', () => {
  const initial = fresh(); initial.aiLearning = { version: 1, rawConversation: 'SECRET',
    corrections: [...Array.from({ length: 70 }, () => ({ category: 'grammar:order', count: 9999999999, lastAt: Date.now() })), { category: '__proto__', count: 1 }, { category: 'grammar:general', count: -2 }],
    tones: [{ expectedTone: 1, detectedTone: 4, count: 9999999999 }, { expectedTone: 1, detectedTone: 1, count: 30 }] };
  const h = harness(initial); h.learning.recordTone({ expectedTone: 2, detectedTone: 4, status: 'different_shape' });
  const profile = h.state().aiLearning;
  assert.ok(profile.corrections.length + profile.tones.length <= 50);
  assert.equal(profile.corrections[0].count, 100000); assert.equal(profile.tones[0].count, 100000);
  assert.doesNotMatch(JSON.stringify(profile), /SECRET|rawConversation|__proto__/);
  assert.ok(h.learning.context().grammarErrors.length <= 10); assert.ok(h.learning.context().toneErrors.length <= 10);
});

test('AI word is saved in the existing book, works in wordbook and review, and survives bookmark removal', async () => {
  const h = harness(), result = h.learning.addWord({ hz: '蓝鲸', py: 'lán jīng', ru: 'синий кит', id: 'hsk3-malicious', curriculum: 'hsk3' });
  assert.equal(result.added, true); assert.match(result.key, /^ai:蓝鲸:/); assert.equal(result.word.source, 'ai');
  assert.equal(result.word.curriculum, undefined); assert.equal(h.state().srs[result.key], undefined);
  assert.equal(h.learning.context().knownWords.length, 0, 'saving is not learning');
  assert.equal(h.learning.addWord({ hz: '蓝鲸', py: 'lánjīng', ru: 'подменённый перевод' }).added, false);
  assert.equal(h.state().book[result.key].word.ru, 'синий кит');
  await h.run('pageBook()'); assert.match(h.node('#wl').innerHTML, /蓝鲸/); assert.match(h.node('#wl').innerHTML, /ai%3A/);
  const key = JSON.stringify(result.key);
  const restored = await h.run(`findWord(${key})`); assert.equal(restored.hz, '蓝鲸');
  h.run(`grade(S.book[${key}].word, true)`); assert.equal(h.state().srs[result.key].b, 1);
  assert.equal(h.state().srs[result.key].word.id, result.key);
  await h.clickStar(result.key); assert.equal(h.state().book[result.key], undefined);
  assert.equal((await h.run(`findWord(${key})`)).ru, 'синий кит');
  assert.equal(h.requests(), 0, 'AI snapshots use no dictionary/catalogue call');
});

test('adding an already cached HSK reading reuses its canonical identity and trusted definition', () => {
  const h = harness(); h.run(`canonicalWords.set(${JSON.stringify(modern.id)}, ${JSON.stringify(modern)}); legacyAliases.set("爱", ${JSON.stringify(modern.id)})`);
  const saved = h.learning.addWord({ hz: '爱', py: 'ai4', ru: 'случайный перевод AI' });
  assert.equal(saved.key, modern.id); assert.equal(saved.word.ru, modern.ru); assert.equal(saved.word.curriculum, 'hsk3');
  assert.equal(Object.keys(h.state().book).length, 1); assert.equal(h.requests(), 0);
});

test('alternate pronunciations and AI words do not overwrite HSK cards during canonicalization or migration', () => {
  const official = { ...modern, id: 'hsk3-00100', hz: '行', py: 'xíng', ru: 'можно' }, initial = fresh();
  initial.book[official.id] = { lv: '1', t: 5, why: 'добавлено', word: official }; initial.srs[official.id] = { b: 4, word: official, curriculum: 'hsk3' };
  const h = harness(initial); h.run(`canonicalWords.set(${JSON.stringify(official.id)}, ${JSON.stringify(official)}); legacyAliases.set("行", ${JSON.stringify(official.id)})`);
  const before = JSON.stringify(h.state().book[official.id]);
  const alternate = h.learning.addWord({ hz: '行', py: 'háng', ru: 'ряд; профессия' });
  assert.notEqual(alternate.key, official.id); assert.match(alternate.key, /^ai:/);
  assert.equal(h.run(`wordKey(studyWord(S.book[${JSON.stringify(alternate.key)}].word))`), alternate.key);
  assert.equal(JSON.stringify(h.state().book[official.id]), before); assert.equal(h.state().srs[official.id].b, 4);
  assert.notEqual(h.learning.addWord({ hz: '行', py: 'xìng', ru: 'пример другого тона' }).key, official.id);
  assert.equal(h.requests(), 0);
});

test('invalid vocabulary cannot create arbitrary state keys or unbounded entries', () => {
  const h = harness();
  for (const word of [null, { hz: '__proto__', py: 'x', ru: 'пример' }, { hz: '好', py: '<script>', ru: 'пример' },
    { hz: '好', py: 'hao3', ru: 'x'.repeat(1000) }, { hz: '好', py: 'hao3', ru: 'Contact me a@b.com' }, { hz: '好', py: 'hao3', ru: 'English only' }]) {
    assert.throws(() => h.learning.addWord(word));
  }
  assert.deepEqual(Object.keys(h.state().book), []); assert.equal(h.requests(), 0);
});

test('profile clear button deletes only AI aggregates and preserves words, HSK progress, name and settings', async () => {
  const initial = fresh(); initial.srs[modern.id] = { b: 2, word: modern, curriculum: 'hsk3' }; initial.book[modern.id] = { word: modern, t: 1 };
  const h = harness(initial); h.learning.recordTone({ expectedTone: 1, detectedTone: 2, status: 'different_shape' });
  const before = clone(h.state()); delete before.aiLearning;
  await h.run('pageAILearning()');
  assert.match(h.node('#app').innerHTML, /Закреплено карточек HSK: 1/); assert.match(h.node('#app').innerHTML, /Очистить подсказки AI/);
  assert.equal(h.learning.context().toneErrors.length, 1, 'render does not delete aggregates');
  h.node('#ai-profile-clear').onclick();
  assert.equal(h.learning.context().toneErrors.length, 0); assert.equal(h.learning.context().knownWords[0], '爱');
  const after = clone(h.state()); delete after.aiLearning;
  assert.deepEqual(after, before); assert.match(h.node('#ai-profile-status').textContent, /прогресс сохранены/);
  assert.equal(h.requests(), 0);
});
