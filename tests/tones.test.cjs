'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../web/js/app.js'), 'utf8');
const content = fs.readFileSync(require.resolve('../web/js/content.js'), 'utf8');
const toneCode = source.slice(source.indexOf('const PINYIN_TONE_MARKS'), source.indexOf('/* ---------- грамматика, диалоги, чтение ---------- */'));
const groups = [
  [['mā', 'má', 'mǎ', 'mà'], ['妈', '麻', '马', '骂']],
  [['bā', 'bá', 'bǎ', 'bà'], ['八', '拔', '把', '爸']],
  [['shī', 'shí', 'shǐ', 'shì'], ['诗', '十', '使', '是']],
  [['tāng', 'táng', 'tǎng', 'tàng'], ['汤', '糖', '躺', '烫']],
  [['yī', 'yí', 'yǐ', 'yì'], ['一', '姨', '椅', '亿']],
  [['wū', 'wú', 'wǔ', 'wù'], ['屋', '无', '五', '雾']],
  [['mī', 'mí', 'mǐ', 'mì'], ['眯', '迷', '米', '密']],
  [['fēi', 'féi', 'fěi', 'fèi'], ['飞', '肥', '匪', '费']]
];

function harness(first = '飞') {
  const nodes = new Map(), speech = [], answers = []; let buttons = [], html = '';
  const node = key => { if (!nodes.has(key)) nodes.set(key, { innerHTML: '', dataset: {}, classList: { add() {} } }); return nodes.get(key); };
  const app = { get innerHTML() { return html; }, set innerHTML(value) {
    html = value; nodes.clear(); buttons = [...value.matchAll(/<button class="opt" data-t="(\d)" aria-label="([^"]+)"[^>]*><b[^>]*>([^<]+)<\/b>/g)]
      .map(match => ({ dataset: { t: match[1] }, label: match[2], pinyin: match[3], classes: new Set(),
        classList: { add(name) { this.owner.classes.add(name); } } }));
    buttons.forEach(button => { button.classList.owner = button; });
    const recording = node('.rec'); recording.dataset.say = /class="rec" data-say="([^"]+)"/.exec(value)?.[1];
  } };
  const context = vm.createContext({ app,
    topbar: title => `<h1>${title}</h1>`, ic: () => '', esc: value => String(value).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    shuffle: values => [...values.filter(value => value.hanzi === first), ...values.filter(value => value.hanzi !== first)],
    speak: text => { speech.push(text); return Promise.resolve(true); }, record: correct => answers.push(correct),
    $: selector => selector === '.opt.right' ? buttons.find(button => button.classes.has('right')) || null
      : selector.startsWith('.opt[data-t=') ? buttons.find(button => button.dataset.t === /"(\d)"/.exec(selector)?.[1]) : node(selector),
    $$: selector => selector === '.opt' ? buttons : [] });
  vm.runInContext(content, context); vm.runInContext(toneCode, context);
  return { run: code => vm.runInContext(code, context), app, speech, answers, node, buttons: () => buttons };
}

test('every source question displays its own four syllables and uses the matching character, answer and feedback', () => {
  const bank = harness().run('TONE_DRILL');
  const expectedBank = groups.flatMap(([pinyin, hanzi]) => pinyin.map((py, i) => [py, hanzi[i]]));
  assert.deepEqual(JSON.parse(JSON.stringify(bank)), expectedBank, 'all current source examples have an explicitly reviewed pronunciation');
  for (const [options, hanzi] of groups) for (let i = 0; i < 4; i++) {
    const h = harness(hanzi[i]); h.run('pageTones()'); const prepared = h.run(`toneDrillQuestion(${JSON.stringify([options[i], hanzi[i]])})`);
    assert.equal(prepared.tone, i + 1); assert.equal(prepared.pinyin, options[i]);
    assert.deepEqual(h.buttons().map(button => button.pinyin), options);
    assert.equal(h.node('.rec').dataset.say, hanzi[i]); assert.deepEqual(h.speech, [hanzi[i]]);
    h.buttons().forEach((button, n) => { assert.equal(button.dataset.t, String(n + 1)); assert.ok(button.label.startsWith(options[n] + ' — ')); });
    h.buttons()[i].onclick(); assert.deepEqual(h.answers, [true]);
    assert.ok(h.node('#fb').innerHTML.includes(hanzi[i])); assert.ok(h.node('#fb').innerHTML.includes(options[i]));
    h.buttons()[(i + 1) % 4].onclick(); assert.deepEqual(h.answers, [true], 'a second tap cannot change the score');
  }
});

test('fei regression: wrong selection reveals the current answer and next question replaces audio and options together', () => {
  const h = harness('费'); h.run('pageTones()');
  assert.match(h.app.innerHTML, /слога «fei»/); assert.match(h.app.innerHTML, /aria-label="Прослушать слог fei"/);
  assert.doesNotMatch(h.app.innerHTML, /<b[^>]*>[āáǎà]<\/b>/);
  h.buttons()[0].onclick(); assert.deepEqual(h.answers, [false]);
  assert.equal(h.buttons()[3].classes.has('right'), true); assert.match(h.node('#fb').innerHTML, /费<\/b> fèi/);
  h.node('#next').onclick(); assert.deepEqual(h.speech, ['费', '妈']);
  assert.deepEqual(h.buttons().map(button => button.pinyin), ['mā', 'má', 'mǎ', 'mà']);
});

test('tone placement follows a/e priority, ou, final vowel in iu/ui, and preserves ü spellings', () => {
  const h = harness();
  const cases = [
    ['fei', ['fēi','féi','fěi','fèi']], ['xiao', ['xiāo','xiáo','xiǎo','xiào']],
    ['shui', ['shuī','shuí','shuǐ','shuì']], ['liu', ['liū','liú','liǔ','liù']],
    ['ou', ['ōu','óu','ǒu','òu']], ['you', ['yōu','yóu','yǒu','yòu']],
    ['guo', ['guō','guó','guǒ','guò']], ['nüe', ['nüē','nüé','nüě','nüè']],
    ['lü', ['lǖ','lǘ','lǚ','lǜ']], ['lv4', ['lǖ','lǘ','lǚ','lǜ']],
    ['lu:3', ['lǖ','lǘ','lǚ','lǜ']], ['lǘ', ['lǖ','lǘ','lǚ','lǜ']],
    ['LÜ', ['LǕ','LǗ','LǙ','LǛ']], ['nu:e', ['nüē','nüé','nüě','nüè']]
  ];
  for (const [input, expected] of cases) assert.deepEqual(JSON.parse(JSON.stringify(h.run(`[1,2,3,4].map(tone => toneSyllable(${JSON.stringify(input)}, tone))`))), expected, input);
  assert.equal(h.run('toneSyllableBase("nǚ")'), 'nü', 'removing a tone must not turn ü into u');
});

test('syllabic m/n/ng and decomposed accents remain valid while unanswerable questions are rejected', () => {
  const h = harness();
  for (const base of ['m', 'n', 'ng', 'hm', 'hng']) for (let tone = 1; tone <= 4; tone++) {
    const nucleus = /m/.test(base) ? 'm' : 'n', expected = base.replace(nucleus, nucleus + ['\u0304','\u0301','\u030c','\u0300'][tone - 1]).normalize('NFC');
    assert.equal(h.run(`toneSyllable(${JSON.stringify(base)},${tone})`), expected);
    assert.equal(h.run(`toneDrillQuestion(${JSON.stringify([expected, '嗯'])}).tone`), tone);
  }
  assert.equal(h.run(`toneDrillQuestion(${JSON.stringify(['lǚ', '吕'])}).pinyin`), 'lǚ');
  for (const invalid of ['ma', 'ma0', 'ma5', 'ma6', 'nǐ hǎo', 'hǎo2', 'mǎ́', '<img>', 'sh4']) {
    assert.throws(() => h.run(`toneDrillQuestion(${JSON.stringify([invalid, '吗'])})`), /invalid_tone/);
  }
  assert.throws(() => h.run('toneSyllable("ma", 0)'), /invalid_tone_number/);
});
