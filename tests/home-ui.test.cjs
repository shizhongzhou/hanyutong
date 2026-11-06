'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../web');
const source = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function harness(settings = {}, nick = 'Анна') {
  const initial = { v: 2, profile: { nick }, settings: { level: 2, curriculum: 'hsk3', hsk3Level: '7-9', ...settings },
    book: { 爱: { lv: 1, t: 123 } }, srs: { 爱: { lv: 1, b: 2, d: 0 } },
    stats: { answered: 7, correct: 5, days: {} }, history: [{ kind: 'existing', score: '5/7' }] };
  const storage = new Map([['hanyutong-v2', JSON.stringify(initial)]]), nodes = new Map(), drafts = [], aiCalls = [], timers = new Map();
  let requests = 0, nextTimer = 0, focusedSelector = null, petUnmounts = 0;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
      dataset: {}, attributes: {}, classList: { add() {}, remove() {} }, focused: false,
      setAttribute(key, value) { this.attributes[key] = value; }, removeAttribute(key) { delete this.attributes[key]; }, toggleAttribute() {},
      focus() { if (!this.disabled) { this.focused = true; focusedSelector = selector; } }, remove() {} });
    return nodes.get(selector);
  };
  const navigation = ['home', 'translate', 'learn', 'me', 'search'].map(tab => { const link = node('#nav-' + tab); link.dataset.tab = tab; return link; });
  const context = vm.createContext({ console, structuredClone,
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: node, querySelectorAll: selector => selector === '#tabbar a' ? navigation : [],
      addEventListener() {}, createElement: () => ({ set innerHTML(_) { this.content = { firstElementChild: node('template') }; } }), body: { append() {} } },
    window: { scrollTo() {} }, location: { hash: '#/home', replace(value) { this.hash = value; } },
    Dictionary: {}, HSK3: {},
    HanyuTranslate: { setDraft: text => drafts.push({ target: 'translate', text }) },
    HanyuAI: { setDraft: (text, mode) => drafts.push({ target: 'ai', text, mode }) },
    pageAI: mode => { aiCalls.push(mode); node('#app').innerHTML = '<section class="ai-home">Direct AI conversation</section>'; return 'AI_HOME_RENDERED'; },
    HomePet: { unmount() { petUnmounts++; } },
    fetch: async () => { requests++; throw Error('Home must not contact a provider'); }
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/content.js'), 'utf8'), context);
  vm.runInContext(source.slice(0, source.indexOf('window.addEventListener("hashchange", route)')), context);
  const run = code => vm.runInContext(code, context);
  return { run, node, context, storage, initial, drafts, aiCalls, navigation, requests: () => requests, focused: () => focusedSelector, petUnmounts: () => petUnmounts,
    flush() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    toggle(id, fromFavorites = false) { const button = { dataset: { featureToggle: id } }; node('#features-page').onclick({ target: { closest: selector => selector === '[data-feature-toggle]' ? button : selector === '.feature-favorites-list' && fromFavorites ? {} : null } }); },
    move(id, direction) { const button = { dataset: { featureMove: id, direction } }; node('#features-page').onclick({ target: { closest: selector => selector === '[data-feature-move]' ? button : null } }); },
    submit(text) { node('#home-input').value = text; node('#home-composer').onsubmit({ preventDefault() {} }); }
  };
}

test('home keeps the selected unified HSK stage and exposes only working shortcut routes', () => {
  const h = harness(); h.run('pageHome()');
  const html = h.node('#app').innerHTML;
  assert.match(html, /#\/hsk3\/7-9\/study/);
  assert.equal((html.match(/class="home-shortcut(?: home-all-features)?"/g) || []).length, 10);
  assert.match(html, /#\/features/); assert.match(html, /#\/home\/ai/);
  const routeChecks = clone(h.run('HOME_FEATURES.map(feature => ({ href: homeFeatureHref(feature), exists: !!ROUTES[homeFeatureHref(feature).split("/")[1]] }))'));
  assert.ok(routeChecks.length >= 30); assert.ok(routeChecks.every(route => route.exists && route.href.startsWith('#/')));
  assert.equal(h.requests(), 0);
});

test('classic home keeps only brand, pet slot, composer and shortcuts; catalog retains customization', () => {
  const h = harness();
  h.run('pageHome()');
  assert.doesNotMatch(h.node('#app').innerHTML, /home-continue|home-daily|Продолжить учёбу|Фраза дня|home-suggestions|Под рукой|Настроить/);
  assert.match(h.node('#app').innerHTML, /home-all-features/);
  assert.match(h.node('#app').innerHTML, /class="home-composer-shell"><div id="home-pet"/);
  h.run('pageLearn()');
  assert.match(h.node('#app').innerHTML, /Выучено карточек:/);
  assert.match(h.node('#app').innerHTML, /#\/hsk3\/7-9\/study/);
  h.run('pageFeatures()'); assert.match(h.node('#app').innerHTML, /#\/stages/); assert.match(h.node('#app').innerHTML, /#\/features\/edit/);
});

test('saved favorites reject unknown IDs, deduplicate, cap at nine, and preserve intentionally empty lists', () => {
  const h = harness({ homeFeatures: ['photo', 'photo', 'javascript:alert(1)', '<img src=x>', 'dict', 'study', 'stages', 'ai-chat', 'writing', 'speaking', 'library', 'stats', 'plan'] });
  assert.deepEqual(clone(h.run('homeFeatureIDs()')), ['photo', 'dict', 'study', 'stages', 'ai-chat', 'writing', 'speaking', 'library', 'stats']);
  h.run('pageHome()'); assert.doesNotMatch(h.node('#app').innerHTML, /javascript:|<img src=x>/);
  h.run('S.settings.homeFeatures = []; pageHome()');
  assert.deepEqual(clone(h.run('homeFeatureIDs()')), []);
  assert.equal((h.node('#app').innerHTML.match(/class="home-shortcut(?: home-all-features)?"/g) || []).length, 1, 'the all-functions link remains reachable');
  assert.match(h.node('#app').innerHTML, /home-all-features/);
});

test('classic composer transfers an editable draft without a provider call or persistent conversation', () => {
  const h = harness(); h.run('pageHome()'); h.submit('  你好，世界！  ');
  assert.deepEqual(h.drafts[0], { target: 'translate', text: '你好，世界！' }); assert.equal(h.context.location.hash, '#/translate');
  assert.equal(h.requests(), 0); assert.doesNotMatch(JSON.stringify(h.run('S')), /你好，世界/);
  assert.doesNotMatch(h.storage.get('hanyutong-v2'), /你好，世界/);
});

test('only classic home mounts the pet and an unavailable renderer cannot break draft submission', () => {
  const h = harness(), mounts = [];
  h.context.HomePet.mount = options => mounts.push(options);
  h.run('pageHome()'); assert.equal(mounts.length, 1);
  assert.equal(mounts[0].container, h.node('#home-pet')); assert.equal(mounts[0].boundary, h.node('#home-composer'));
  h.run('pageHome("ai")'); assert.equal(mounts.length, 1);
  h.context.HomePet.mount = () => { throw Error('WebGL unavailable'); };
  h.run('pageHome()'); h.submit('你好');
  assert.deepEqual(h.drafts[0], { target: 'translate', text: '你好' });
});

test('AI home delegates directly to the real chat page instead of rendering a draft launcher', () => {
  const h = harness(); assert.equal(h.run('pageHome("ai")'), 'AI_HOME_RENDERED');
  assert.deepEqual(h.aiCalls, ['home']); assert.equal(h.drafts.length, 0);
  assert.doesNotMatch(h.node('#app').innerHTML, /home-composer|home-input|home-shortcuts/);
});

test('composer validates Unicode length without cutting off text', () => {
  const h = harness(); h.run('pageHome()'); h.submit('   ');
  assert.equal(h.drafts.length, 0); assert.match(h.node('#home-input-error').textContent, /Сначала/);
  h.submit('𠮷'.repeat(2001)); assert.equal(h.drafts.length, 0); assert.equal([...h.node('#home-input').value].length, 2001);
  assert.match(h.node('#home-input-error').textContent, /2000/);
  h.submit('𠮷'.repeat(2000)); assert.equal([...h.drafts[0].text].length, 2000);
});

test('classic home does not inject profile data and camera or microphone controls do not automatically record', () => {
  const h = harness({}, '<img src=x onerror=alert(1)>'); h.run('pageHome()');
  const html = h.node('#app').innerHTML;
  assert.doesNotMatch(html, /<img|onerror/);
  assert.match(html, /href="#\/translate\/photo" aria-label="Перевести по фото"/);
  assert.match(html, /href="#\/ai" aria-label="Открыть диалог с записью голоса"/);
  assert.doesNotMatch(html, /autoplay|type="file"|getUserMedia/); assert.equal(h.requests(), 0);
});

test('favorite editor enforces the limit and keeps selections uncommitted until Done', () => {
  const h = harness(); h.run('pageFeatures("edit")');
  const original = clone(h.run('homeFeatureIDs()'));
  h.toggle('stats'); assert.match(h.node('#feature-edit-message').textContent, /до 9/);
  assert.deepEqual(clone(h.run('homeFeatureIDs()')), original);
  h.toggle('photo'); h.toggle('stats'); h.move('stats', 'up');
  assert.deepEqual(clone(h.run('homeFeatureIDs()')), original, 'editing is a draft');
  h.node('#features-done').onclick(); h.flush();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.equal(saved.settings.homeFeatures.length, 9); assert.equal(saved.settings.homeFeatures.includes('photo'), false);
  assert.deepEqual(saved.settings.homeFeatures.slice(-2), ['stats', 'library']);
  for (const key of ['book', 'srs', 'stats', 'history']) assert.deepEqual(saved[key], h.initial[key]);
  assert.equal(h.context.location.hash, '#/features');
  h.run('pageHome()'); assert.match(h.node('#app').innerHTML, /href="#\/stats"/);
});

test('leaving the favorite editor discards changes and saved empty favorites survive a reload', () => {
  const h = harness({ homeFeatures: ['photo'] }); h.run('pageFeatures("edit")'); h.toggle('photo');
  h.run('pageFeatures()'); assert.deepEqual(clone(h.run('homeFeatureIDs()')), ['photo']);
  h.run('pageFeatures("edit")'); h.toggle('photo'); h.node('#features-done').onclick(); h.flush();
  const saved = JSON.parse(h.storage.get('hanyutong-v2'));
  assert.deepEqual(saved.settings.homeFeatures, []);
  const reload = harness(saved.settings); reload.run('pageHome()'); assert.deepEqual(clone(reload.run('homeFeatureIDs()')), []);
});

test('new routes keep the correct bottom tab and the retired floating button stays hidden', async () => {
  const h = harness(); h.context.location.hash = '#/home/ai'; await h.run('route()');
  assert.match(h.node('#app').innerHTML, /ai-home/); assert.deepEqual(h.aiCalls, ['home']); assert.equal(h.node('#fab').hidden, true);
  assert.equal(h.node('#appbar').hidden, true, 'home has one centered brand instead of a duplicate header');
  h.context.location.hash = '#/features'; await h.run('route()');
  assert.match(h.node('#app').innerHTML, /Все функции/); assert.equal(h.node('#fab').hidden, true);
  assert.equal(h.node('#appbar').hidden, false);
  assert.equal(h.run('TAB.features'), 'home'); assert.equal(h.run('TAB.translate'), 'translate'); assert.equal(h.run('TAB.dict'), 'search');
  for (const route of ['review', 'book', 'study', 'pairs', 'cloud']) assert.equal(h.run(`TAB.${route}`), 'learn');
});

test('each route transition releases the home pet, including switching to AI home', async () => {
  const h = harness();
  for (const hash of ['#/home', '#/features', '#/home/ai']) { h.context.location.hash = hash; await h.run('route()'); }
  assert.equal(h.petUnmounts(), 3); assert.deepEqual(h.aiCalls, ['home']);
  delete h.context.HomePet; h.context.location.hash = '#/home'; await h.run('route()');
  assert.match(h.node('#app').innerHTML, /home-composer-shell/);
});

test('brand is 汉语熊 and the home, profile, and about pages contain no panda avatar', () => {
  const h = harness();
  h.run('pageHome()'); assert.match(h.node('#app').innerHTML, />汉语熊<\/h1>/);
  for (const page of ['pageHome()', 'pageHome("ai")', 'pageMe()', 'pageAbout()']) {
    h.run(page); assert.doesNotMatch(h.node('#app').innerHTML, /汉语熊猫|home-panda|viewBox="0 0 64 64"/);
  }
  assert.doesNotMatch(source, /const PANDA|\$\{PANDA|pandaSheet|Спросить панду/);
});

test('active navigation declares a real current page and removes the prior declaration', async () => {
  const h = harness(); await h.run('route()');
  assert.equal(h.node('#nav-home').attributes['aria-current'], 'page');
  h.context.location.hash = '#/me'; await h.run('route()');
  assert.equal(h.node('#nav-me').attributes['aria-current'], 'page');
  assert.equal(h.node('#nav-home').attributes['aria-current'], undefined);
  assert.equal(h.navigation.filter(link => link.attributes['aria-current'] === 'page').length, 1);
  assert.equal(h.node('#fab').hidden, true, 'the button is also hidden outside the new home');
  assert.match(h.context.document.title, /汉语熊$/); assert.doesNotMatch(h.context.document.title, /熊猫/);
});

test('reordering to either boundary focuses an enabled control for the moved favorite', () => {
  const h = harness({ homeFeatures: ['photo', 'dict'] }); h.run('pageFeatures("edit")');
  h.move('dict', 'up');
  assert.equal(h.focused(), '[data-feature-move="dict"][data-direction="down"]');
  h.move('dict', 'down');
  assert.equal(h.focused(), '[data-feature-move="dict"][data-direction="up"]');
});

test('removing a top favorite keeps focus nearby and removing the final one focuses Done', () => {
  const h = harness({ homeFeatures: ['photo', 'dict'] }); h.run('pageFeatures("edit")');
  h.toggle('photo', true); assert.equal(h.focused(), '#feature-favorite-dict [data-feature-toggle]');
  h.toggle('dict', true); assert.equal(h.focused(), '#features-done');
  h.toggle('photo'); assert.equal(h.focused(), '.feature-catalog-card[data-feature-toggle="photo"]');
});
