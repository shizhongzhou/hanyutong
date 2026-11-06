'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const content = fs.readFileSync(require.resolve('../web/js/content.js'), 'utf8');
const source = fs.readFileSync(require.resolve('../web/js/app.js'), 'utf8');
const examples = {
  a:['八','bā'], o:['波','bō'], e:['饿','è'], i:['一','yī'], u:['五','wǔ'], ü:['鱼','yú'],
  ai:['爱','ài'], ei:['杯','bēi'], ao:['猫','māo'], ou:['口','kǒu'], an:['安','ān'], en:['门','mén'],
  ang:['昂','áng'], eng:['灯','dēng'], ong:['东','dōng'], er:['二','èr'],
  ia:['家','jiā'], ie:['街','jiē'], iao:['桥','qiáo'], iu:['牛','niú'], ian:['天','tiān'], in:['心','xīn'],
  iang:['香','xiāng'], ing:['星','xīng'], iong:['熊','xióng'],
  ua:['花','huā'], uo:['火','huǒ'], uai:['快','kuài'], ui:['水','shuǐ'], uan:['关','guān'], un:['春','chūn'],
  uang:['光','guāng'], ueng:['翁','wēng'], üe:['月','yuè'], üan:['元','yuán'], ün:['云','yún']
};

function harness() {
  const nodes = new Map(), click = [], spoken = [];
  const node = selector => { if (!nodes.has(selector)) nodes.set(selector, { innerHTML:'', value:'', classList:{ add(){}, remove(){} } }); return nodes.get(selector); };
  const context = vm.createContext({ structuredClone, console, setTimeout, clearTimeout,
    localStorage: { getItem() { return null; }, setItem() {} },
    document: { querySelector:node, querySelectorAll:()=>[], addEventListener: (name,fn) => { if(name === 'click') click.push(fn); } },
    window: {}, location:{hash:'#/pinyin'}, spoken });
  vm.runInContext(content,context); vm.runInContext(source.slice(0,source.indexOf('window.addEventListener("hashchange", route)')),context);
  vm.runInContext('speak = text => { spoken.push(text); return Promise.resolve(true); };',context);
  return { run: code => vm.runInContext(code,context), node, spoken,
    async play(text) {
      let prevented=0; const button={dataset:{say:text}};
      for(const handler of click) await handler({target:{closest:selector=>selector==='[data-say]'?button:null},preventDefault(){prevented++;},stopPropagation(){}});
      assert.equal(prevented,1);
    }
  };
}

test('the complete final inventory includes all missing i/u/ü groups with reviewed Chinese and pinyin examples', () => {
  const h=harness(), rows=JSON.parse(JSON.stringify(h.run('FINALS')));
  assert.equal(rows.length,36); assert.equal(new Set(rows.map(row=>row[0])).size,36);
  assert.deepEqual(Object.fromEntries(rows.map(([final,hz,,py])=>[final,[hz,py]])),examples);
  for(const [final,hz,hint,py,ru] of rows) {
    assert.match(hz,/^\p{Script=Han}$/u,final); assert.match(py,/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u,final);
    assert.match(hint,/[а-яё]/i,final); assert.match(ru,/[а-яё]/i,final);
  }
});

test('every final visibly displays marked pinyin and exposes an accessible Chinese audio example', () => {
  const h=harness();h.run('pagePinyin()');const html=h.node('#app').innerHTML;
  const buttons=[...html.matchAll(/<button[^>]*data-final="([^"]+)"[^>]*>[\s\S]*?<\/button>/g)];
  assert.equal(buttons.length,36); assert.match(html,/36 примеров/);assert.equal(h.spoken.length,0);
  for(const match of buttons) {
    const [hz,py]=examples[match[1]],markup=match[0];
    assert.ok(markup.includes(`data-say="${hz}"`));assert.ok(markup.includes(`aria-label="Финаль ${match[1]}.`));
    assert.ok(markup.includes(`>${hz}</small>`));assert.ok(markup.includes(`lang="zh-Latn">${py}</small>`));
  }
});

test('ü spelling rules show j/q/x, n/l and y forms without replacing the actual ü sound by u', () => {
  const h=harness();h.run('pagePinyin()');const html=h.node('#app').innerHTML;
  for(const rule of ['j + ü → ju','q + ü → qu','x + ü → xu','jue / que / xue','juan / quan / xuan','jun / qun / xun',
    'nǚ','lǜ','lù','ü → yu, üe → yue, üan → yuan, ün → yun','iou → iu','uei → ui','uen → un']) assert.ok(html.includes(rule),rule);
  assert.match(html,/Звук остаётся ü, а не u/);assert.match(html,/После <b>n и l<\/b> точки сохраняются/);
  const umlaut=JSON.parse(JSON.stringify(h.run('UMLAUT_EXAMPLES')));
  assert.deepEqual(umlaut.map(([hz,py])=>[hz,py]),[['居','jū'],['去','qù'],['需','xū'],['学','xué'],['捐','juān'],['军','jūn'],
    ['女','nǚ'],['绿','lǜ'],['路','lù'],['鱼','yú'],['月','yuè'],['元','yuán'],['云','yún']]);
  for(const [hz,py] of umlaut) assert.ok(html.includes(`data-say="${hz}" aria-label="Прослушать ${hz}, ${py}`));
});

test('all pinyin-page playback buttons use Han text through the existing speech handler, never Latin ju/qu/xu', async () => {
  const h=harness();h.run('pagePinyin()');const html=h.node('#app').innerHTML;
  const audio=[...html.matchAll(/data-say="([^"]+)"/g)].map(match=>match[1]);assert.ok(audio.length>70);
  for(const text of audio) {assert.match(text,/^\p{Script=Han}+$/u);await h.play(text);}
  assert.deepEqual(h.spoken,audio);assert.doesNotMatch(h.spoken.join(''),/[a-z]/i);
  assert.ok(html.includes('<span class="mk">ā</span>'),'the theoretical tone symbols stay unchanged');
});
