"use strict";

/* Bounded, local learning aggregates. Store category IDs, never conversation
 * fragments or a copy of the user's name/profile. Vocabulary uses S.book.
 */
const HanyuLearning = (() => {
  const MAX_AGGREGATES = 50, MAX_COUNT = 100000;
  const CATEGORIES = Object.freeze({
    'grammar:order': 'Грамматика: порядок слов',
    'grammar:classifier': 'Грамматика: счётные слова',
    'grammar:negation': 'Грамматика: отрицание',
    'grammar:question': 'Грамматика: вопросы',
    'grammar:comparison': 'Грамматика: сравнение',
    'grammar:aspect': 'Грамматика: время и вид действия',
    'grammar:particles': 'Грамматика: структурные частицы',
    'grammar:copula': 'Грамматика: связка 是 и прилагательные',
    'grammar:preposition': 'Грамматика: предлоги',
    'grammar:modality': 'Грамматика: модальные глаголы',
    'grammar:adverb': 'Грамматика: наречия',
    'grammar:conjunction': 'Грамматика: связь предложений',
    'grammar:general': 'Грамматика: построение фразы',
    'word:collocation': 'Лексика: сочетаемость слов',
    'word:context': 'Лексика: выбор слова по ситуации',
    'word:similar': 'Лексика: слова с близким значением',
    'word:meaning': 'Лексика: значение слова',
    'word:general': 'Лексика: выбор слова'
  });
  const RULES = Object.freeze({
    grammar: [
      ['order', /поряд(?:ок|ка|ке)\s+слов|словопоряд|语序|词序/iu],
      ['classifier', /сч[её]тн[а-яё]*\s+слов|量词/iu],
      ['negation', /отрицан|否定/iu],
      ['question', /вопрос|疑问/iu],
      ['comparison', /сравнен|比较/iu],
      ['aspect', /аспект|вид\s+действ|заверш[её]н|прошедш|частиц.{0,25}[了过着]|体标记/iu],
      ['particles', /притяжат|структурн.{0,20}частиц|的[、,， ]*地[、,， ]*得/iu],
      ['copula', /связк|перед.{0,30}прилагатель|系词/iu],
      ['preposition', /предлог|介词/iu],
      ['modality', /модальн|能愿/iu],
      ['adverb', /нареч|副词/iu],
      ['conjunction', /союз|связ.{0,20}предложен|连词/iu]
    ],
    word: [
      ['collocation', /сочетаем|коллокац|搭配/iu],
      ['context', /контекст|ситуаци|умест|语境|得体/iu],
      ['similar', /синоним|похож|близк.{0,20}знач|近义/iu],
      ['meaning', /значени|смысл|词义/iu]
    ]
  });
  const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const text = (value, limit) => typeof value === 'string' && [...value].length <= limit &&
    !/[\u0000-\u001f\u007f]/u.test(value) ? value.trim().normalize('NFC') : '';
  const correctionText = (value, limit) => typeof value === 'string' && [...value].length <= limit
    ? text(value.replace(/[\t\r\n]+/g, ' '), limit) : '';
  const contact = /(?:https?:\/\/|www\.|[^\s@]+@[^\s@]+\.[^\s@]+|\+?\d[\d ().-]{7,}\d)/iu;
  const validCount = count => Number.isSafeInteger(count) && count > 0 ? Math.min(MAX_COUNT, count) : 0;
  const validTime = value => Number.isSafeInteger(value) && value >= 0 && value <= Date.now() + 60000 ? value : 0;
  const emptyProfile = () => ({ version: 1, corrections: [], tones: [] });
  const state = () => { if (typeof S === 'undefined' || !plainObject(S)) throw Error('Учебный профиль пока недоступен.'); return S; };
  const persist = profile => { state().aiLearning = profile; if (typeof save === 'function') save(); };

  function profile() {
    const value = state().aiLearning, result = emptyProfile();
    if (!plainObject(value) || value.version !== 1) return result;
    const corrections = new Map(), tones = new Map();
    for (const item of (Array.isArray(value.corrections) ? value.corrections : []).slice(0, 100)) {
      if (!plainObject(item) || !own(CATEGORIES, item.category) || !validCount(item.count)) continue;
      const previous = corrections.get(item.category);
      corrections.set(item.category, { category: item.category, count: Math.min(MAX_COUNT, (previous?.count || 0) + validCount(item.count)), lastAt: Math.max(previous?.lastAt || 0, validTime(item.lastAt)) });
    }
    for (const item of (Array.isArray(value.tones) ? value.tones : []).slice(0, 100)) {
      if (!plainObject(item) || ![1, 2, 3, 4].includes(item.expectedTone) || ![1, 2, 3, 4].includes(item.detectedTone) || item.expectedTone === item.detectedTone || !validCount(item.count)) continue;
      const key = `${item.expectedTone}:${item.detectedTone}`, previous = tones.get(key);
      tones.set(key, { expectedTone: item.expectedTone, detectedTone: item.detectedTone,
        count: Math.min(MAX_COUNT, (previous?.count || 0) + validCount(item.count)), lastAt: Math.max(previous?.lastAt || 0, validTime(item.lastAt)) });
    }
    result.corrections = [...corrections.values()].sort(ranking).slice(0, MAX_AGGREGATES);
    result.tones = [...tones.values()].sort(ranking).slice(0, MAX_AGGREGATES - result.corrections.length);
    return result;
  }
  function ranking(a, b) { return b.count - a.count || b.lastAt - a.lastAt; }

  function learned() {
    const values = typeof progressEntries === 'function' ? progressEntries() : [];
    if (!Array.isArray(values)) return [];
    return values.filter(item => plainObject(item) && Number.isFinite(item.b) && item.b >= 1).map(item => {
      const hz = text(item.word?.hz || item.hz, 20);
      const hsk = item.curriculum === 'hsk3' || item.word?.curriculum === 'hsk3' ||
        (!item.word?.source && Number.isInteger(Number(item.lv)) && Number(item.lv) >= 1 && Number(item.lv) <= 6);
      return { hz: /^\p{Script=Han}{1,20}$/u.test(hz) ? hz : '', hsk, key: item.key, first: Number(item.first) || 0, b: item.b };
    }).filter(item => item.hz).sort((a, b) => b.first - a.first || b.b - a.b);
  }
  function context() {
    const value = profile(), knownWords = [...new Set(learned().map(item => item.hz))].slice(0, 40);
    return { knownWords,
      grammarErrors: value.corrections.slice(0, 10).map(item => `${CATEGORIES[item.category]} · ${item.count}`),
      toneErrors: value.tones.slice(0, 10).map(item => `Контур ${item.expectedTone}-го тона похож на ${item.detectedTone}-й · ${item.count}`)
    };
  }

  function recordCorrections(items) {
    if (!Array.isArray(items)) return 0;
    const value = profile(), aggregates = new Map(value.corrections.map(item => [item.category, item]));
    let accepted = 0;
    for (const item of items.slice(0, 8)) {
      if (!plainObject(item) || !['grammar', 'word'].includes(item.kind)) continue;
      const explanation = correctionText(item.explanationRu, 1500), original = correctionText(item.original, 500), corrected = correctionText(item.corrected, 500);
      if (!explanation || !original || !corrected || original === corrected) continue;
      const category = `${item.kind}:${RULES[item.kind].find(([, rule]) => rule.test(explanation))?.[0] || 'general'}`;
      const aggregate = aggregates.get(category) || { category, count: 0, lastAt: 0 };
      aggregate.count = Math.min(MAX_COUNT, aggregate.count + 1); aggregate.lastAt = Date.now(); aggregates.set(category, aggregate); accepted++;
    }
    if (accepted) { value.corrections = [...aggregates.values()].sort(ranking).slice(0, MAX_AGGREGATES - value.tones.length); persist(value); }
    return accepted;
  }
  function recordTone(item) {
    if (!plainObject(item) || item.status !== 'different_shape' || ![1, 2, 3, 4].includes(item.expectedTone) ||
        ![1, 2, 3, 4].includes(item.detectedTone) || item.expectedTone === item.detectedTone) return false;
    const value = profile();
    const existing = value.tones.find(entry => entry.expectedTone === item.expectedTone && entry.detectedTone === item.detectedTone);
    if (existing) { existing.count = Math.min(MAX_COUNT, existing.count + 1); existing.lastAt = Date.now(); }
    else value.tones.push({ expectedTone: item.expectedTone, detectedTone: item.detectedTone, count: 1, lastAt: Date.now() });
    value.tones.sort(ranking); value.tones = value.tones.slice(0, MAX_AGGREGATES - value.corrections.length); persist(value); return true;
  }

  // Retain tones: hao3 and hǎo are equivalent, but xíng and xìng are not.
  function pinyinKey(value) {
    let py = value.normalize('NFC').toLowerCase().replace(/u:|v/g, 'ü');
    const marks = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
    py = py.replace(/([a-zü]+)([1-5])/g, (_, syllable, rawTone) => {
      const tone = +rawTone;
      if (tone === 5) return syllable;
      let at = syllable.indexOf('a');
      if (at < 0) at = syllable.indexOf('e');
      if (at < 0 && syllable.includes('ou')) at = syllable.indexOf('o');
      if (at < 0) for (let i = syllable.length - 1; i >= 0; i--) if (marks[syllable[i]]) { at = i; break; }
      return at < 0 ? syllable : syllable.slice(0, at) + marks[syllable[at]][tone - 1] + syllable.slice(at + 1);
    });
    return py.replace(/[\s'’.-]/g, '');
  }
  function validateWord(input) {
    if (!plainObject(input)) throw Error('Не удалось добавить слово.');
    const hz = text(input.hz, 20), py = text(input.py, 100), ru = text(input.ru, 240);
    if (!/^\p{Script=Han}{1,20}$/u.test(hz) || !py || !/^[a-züǖǘǚǜāáǎàēéěèīíǐìōóǒòūúǔùńňǹḿê\s'’:.1-5-]+$/iu.test(py) ||
        !ru || !/[а-яё]/iu.test(ru) || contact.test(ru)) throw Error('Проверьте иероглифы, пиньинь и русский перевод.');
    return { hz, py, ru };
  }
  function addWord(input) {
    const incoming = validateWord(input), current = state();
    if (!plainObject(current.book) || typeof wordKey !== 'function' || typeof studyWord !== 'function' || typeof bookmarkRecord !== 'function') throw Error('Словарик пока недоступен.');
    const reading = pinyinKey(incoming.py), candidates = [];
    if (typeof canonicalWords !== 'undefined' && canonicalWords instanceof Map) candidates.push(...canonicalWords.values());
    for (const collection of [current.book, current.srs]) if (plainObject(collection)) for (const item of Object.values(collection)) if (item?.word) candidates.push(item.word);
    const matches = candidates.filter(candidate => candidate?.hz === incoming.hz && typeof candidate.py === 'string' && pinyinKey(candidate.py) === reading)
      .sort((a, b) => Number(b.curriculum === 'hsk3') - Number(a.curriculum === 'hsk3'));
    let word = null;
    for (const candidate of matches) {
      const normalized = studyWord(candidate);
      if (normalized?.hz === incoming.hz && typeof normalized.py === 'string' && pinyinKey(normalized.py) === reading) { word = normalized; break; }
    }
    if (!word) word = { ...incoming, id: `ai:${incoming.hz}:${reading}`, source: 'ai', lv: 0 };
    const key = wordKey(word);
    // The existing app helpers must preserve namespaced AI identities; fail
    // closed rather than overwrite an HSK or another-reading bookmark.
    if (word.source === 'ai' && key !== word.id) throw Error('Обновите приложение, чтобы добавить слово в словарик.');
    if (typeof key !== 'string' || !key || key.length > 250) throw Error('Не удалось сохранить это слово.');
    if (bookmarkRecord(key)) return { added: false, key, word: bookmarkRecord(key).word || word };
    current.book[key] = { lv: word.lv || 0, t: Date.now(), why: 'добавлено', word };
    if (typeof save === 'function') save();
    return { added: true, key, word };
  }
  function summary() {
    const value = profile(), words = learned();
    return { learnedHskCount: words.filter(item => item.hsk).length, knownWords: [...new Set(words.map(item => item.hz))].slice(0, 40),
      corrections: value.corrections.map(item => ({ label: CATEGORIES[item.category], count: item.count })),
      tones: value.tones.map(item => ({ label: `Тон ${item.expectedTone}: контур похож на ${item.detectedTone}-й`, count: item.count, expectedTone: item.expectedTone })) };
  }
  function clearAggregates() { persist(emptyProfile()); }
  return { context, recordCorrections, recordTone, addWord, summary, clearAggregates };
})();

async function pageAILearning() {
  const data = HanyuLearning.summary(), count = items => items.reduce((sum, item) => sum + item.count, 0);
  const list = (items, tone = false) => items.length ? `<ul>${items.map(item => `<li>${tone ? `<a href="#/pronunciation/${item.expectedTone}">${esc(item.label)}</a>` : esc(item.label)} <b>· ${item.count}</b></li>`).join('')}</ul>` : '<p class="hint">Пока нет подсказок для повторения.</p>';
  app.innerHTML = `${topbar('Мой учебный профиль', '#/learn')}
    <p class="sub">Слова из вашего прогресса и темы, которые стоит повторить.</p>
    <div class="box"><h2>Закреплено карточек HSK: ${data.learnedHskCount}</h2><p class="hint">Здесь учитываются карточки с успешным повторением, которые сейчас имеют ступень запоминания не ниже 1. Добавление слова в словарик само по себе не делает его выученным.</p>
      ${data.knownWords.length ? `<div class="chips">${data.knownWords.map(word => `<span class="chip zh">${esc(word)}</span>`).join('')}</div><p class="hint">До 40 слов из текущего прогресса.</p>` : '<p class="hint">Повторите первые слова — они появятся здесь.</p>'}</div>
    <div class="box"><h2>Грамматика и выбор слов</h2>${list(data.corrections)}<p class="hint">Категории подсказок из диалогов. AI может ошибаться; это рекомендации для практики.</p></div>
    <div class="box"><h2>Контуры тонов</h2>${list(data.tones, true)}<p class="hint">Приблизительные сравнения одного слога. Неуверенные результаты не учитываются; баллы за произношение не выставляются.</p></div>
    <div class="two"><a class="btn ghost" href="#/book">Мой словарик</a><a class="btn ghost" href="#/ai">Практиковать диалог</a></div>
    <div class="box"><h3>Хранение и управление</h3><p class="hint">На этом устройстве сохраняются только категории подсказок и их количество. Тексты разговоров, записи голоса и имя в этот профиль не копируются. При отправке сообщения собеседнику передаётся краткий список изученных слов и тем для повторения.</p>
      <button class="btn ghost" id="ai-profile-clear" ${count(data.corrections) + count(data.tones) ? '' : 'disabled'}>Очистить подсказки AI</button><p class="hint">Удаляются только подсказки по грамматике, словам и тонам. Ваш словарик и учебный прогресс сохраняются.</p><p id="ai-profile-status" role="status" aria-live="polite"></p></div>`;
  $('#ai-profile-clear').onclick = () => { HanyuLearning.clearAggregates(); pageAILearning(); $('#ai-profile-status').textContent = 'Подсказки AI очищены. Словарик и прогресс сохранены.'; };
}
