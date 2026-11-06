'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/translate.js'), 'utf8');
const defaults = { enabled: true, ocrEnabled: true, maxTextChars: 2000, maxImageBytes: 1572864 };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });

function harness({ config = defaults, fetcher, canvasSizes = [400000], imageWidth = 3600, imageHeight = 2400 } = {}) {
  const ids = new Map(), requests = [], leaves = [], urls = [], revoked = [], spoken = [], copied = [], timers = new Map();
  let timerId = 0, cancels = 0, configFailure = false, canvasCalls = 0, bitmapCounter = 0;
  class Element {
    constructor(tag = 'div', attrs = '') {
      this.tagName = tag.toUpperCase(); this.value = ''; this.hidden = /\bhidden\b/.test(attrs); this.disabled = /\bdisabled\b/.test(attrs);
      this.textContent = ''; this.children = []; this.attributes = {}; this.className = ''; this.clicked = 0;
      for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) this.setAttribute(name, value);
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') { this.id = value; ids.set(value, this); } if (name === 'value') this.value = value; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    getAttribute(name) { return this.attributes[name]; }
    set innerHTML(html) {
      ids.clear(); this.html = html;
      for (const [, tag, attrs] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) if (/\bid="/.test(attrs)) this.children.push(new Element(tag, attrs));
      if (ids.has('tr-source')) ids.get('tr-source').value = 'zh';
      if (ids.has('tr-target')) ids.get('tr-target').value = 'ru';
    }
    get innerHTML() { return this.html || ''; }
    click() { this.clicked++; return this.onclick?.(); }
    focus() { this.focused = true; }
  }
  const app = new Element();
  const canvas = {width:0,height:0,getContext() { return {fillStyle:'',fillRect(){},drawImage(){}}; }, toBlob(callback, type, quality) {
    const size = canvasSizes[Math.min(canvasCalls++, canvasSizes.length - 1)];
    callback({ size, type, arrayBuffer: async () => new Uint8Array(size).buffer });
  }};
  class TestImage {
    constructor() { this.naturalWidth = imageWidth; this.naturalHeight = imageHeight; }
    set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
  }
  const window = { speechSynthesis: {cancel(){cancels++;},getVoices:()=>[{lang:'ru-RU',name:'Russian'},{lang:'zh-CN',name:'Chinese'}],speak: u=>spoken.push(u)} };
  const context = vm.createContext({ console, app, window,
    $: selector => ids.get(selector.replace(/^#/, '')),
    topbar: title => `<h1>${title}</h1>`, ic: name => `<svg data-icon="${name}"></svg>`, onLeave: fn => leaves.push(fn),
    navigator:{clipboard:{writeText:async text=>{copied.push(text);}}},
    document:{createElement: name => { assert.equal(name,'canvas'); return canvas; }},
    Image: TestImage, URL:{createObjectURL:blob=>{const url='blob:test-'+ ++bitmapCounter;urls.push(url);return url;},revokeObjectURL:url=>revoked.push(url)},
    SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
    AbortController, Uint8Array, btoa, queueMicrotask,
    setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    fetch:async (url,options)=>{
      requests.push({url,options});
      if (fetcher) return fetcher(url,options);
      if (url.endsWith('/config')) { if(configFailure) throw Error('offline');return response(config); }
      if (url.endsWith('/photo')) return response({text:'你好，世界！'});
      return response({text:'Привет, мир!',source:'zh',target:'ru'});
    }
  });
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context), one=id=>ids.get('tr-'+id);
  return {run,context,one,app,requests,urls,revoked,spoken,copied,timers,canvas,canvasCalls:()=>canvasCalls,cancels:()=>cancels,
    core:run('HanyuTranslate'),page: mode=>run(`pageTranslate(${JSON.stringify(mode)})`),
    leave(){for(const fn of leaves.splice(0))fn();},
    input(value){one('input').value=value;one('input').oninput();},
    failConfig(value){configFailure=value;},
    async until(predicate){for(let i=0;i<50&&!predicate();i++)await Promise.resolve();assert.ok(predicate(),'expected condition');}
  };
}

test('translation stays lazy until opened; config determines available actions', async () => {
  const h=harness(); assert.equal(h.requests.length,0); await h.page();
  assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/\/translate\/config$/);
  assert.equal(h.one('submit').disabled,true);h.input('你好');assert.equal(h.one('submit').disabled,false);
  assert.equal(h.one('recognize').disabled,true);assert.equal(h.one('service').hidden,true);
  assert.equal(h.timers.size,0);
});

test('text validation counts Unicode characters, enforces limits and never sends invalid input', async () => {
  const h=harness();assert.equal(h.core.count('你好𠀀'),3);
  for(const [text,from,to,code] of [[' ','auto','ru','empty_text'],['ab','en','ru','invalid_language'],['你好','zh','zh','invalid_language'],['𠀀𠀀𠀀','zh','ru','text_too_long']]){
    await assert.rejects(h.core.translate(text,from,to,undefined,2),e=>e.code===code);
  }
  assert.equal(h.requests.length,0);
});

test('successful text translation sends one explicit request and supports copy, speech and reverse direction', async () => {
  const h=harness();await h.page();h.input('  你好，世界！  ');await h.one('submit').onclick();
  assert.equal(h.requests.length,2);const request=h.requests[1];assert.equal(request.options.method,'POST');
  assert.deepEqual(JSON.parse(request.options.body),{text:'你好，世界！',source:'zh',target:'ru'});
  assert.equal(h.one('result-text').textContent,'Привет, мир!');assert.equal(h.one('result-panel').hidden,false);
  await h.one('copy').onclick();assert.deepEqual(h.copied,['Привет, мир!']);h.one('speak').onclick();
  assert.equal(h.spoken[0].lang,'ru-RU');assert.equal(h.spoken[0].voice.name,'Russian');
  h.one('swap').onclick();assert.equal(h.one('source').value,'ru');assert.equal(h.one('target').value,'zh');assert.equal(h.one('input').value,'Привет, мир!');assert.equal(h.one('result-panel').hidden,true);
});

test('editing or leaving invalidates late translations, aborts transport and keeps newer input', async () => {
  const gate=deferred();const h=harness({fetcher:(url)=>url.endsWith('/config')?response(defaults):gate.promise});
  await h.page();h.input('你好');const first=h.one('submit').onclick();await h.until(()=>h.requests.length===2);
  h.input('新文本');assert.equal(h.requests[1].options.signal.aborted,true);gate.resolve(response({text:'Old translation',source:'zh'}));await first;
  assert.equal(h.one('input').value,'新文本');assert.equal(h.one('result-panel').hidden,true);assert.equal(h.one('status').textContent,'');
  const gate2=deferred();h.context.fetch=async (url,options)=>{h.requests.push({url,options});return gate2.promise;};
  const second=h.one('submit').onclick();await h.until(()=>h.requests.length===3);h.leave();
  assert.equal(h.requests[2].options.signal.aborted,true);gate2.resolve(response({text:'Late'}));await second;assert.equal(h.one('result-panel').hidden,true);assert.equal(h.timers.size,0);
});

test('quota and provider errors preserve input, show Russian feedback, and never retry automatically', async () => {
  let calls=0;const h=harness({fetcher:url=>url.endsWith('/config')?response(defaults):response({error:++calls===1?'daily_limit':'translation_unavailable'},calls===1?429:502)});
  await h.page();h.input('你好');await h.one('submit').onclick();assert.match(h.one('status').textContent,/сегодня исчерпан/);assert.equal(calls,1);
  assert.equal(h.one('input').value,'你好');assert.equal(h.one('submit').disabled,false);
  await h.one('submit').onclick();assert.match(h.one('status').textContent,/не отвечает/);assert.equal(calls,2);
});

test('disabled OCR leaves text translation usable and failed configuration can be retried', async () => {
  const h=harness({config:{...defaults,ocrEnabled:false}});await h.page('photo');h.input('你好');assert.equal(h.one('submit').disabled,false);assert.equal(h.one('recognize').disabled,true);assert.match(h.one('service').textContent,/Распознавание/);
  h.failConfig(true);await h.one('reconnect').onclick();assert.equal(h.one('submit').disabled,true);assert.match(h.one('service').textContent,/Проверьте интернет/);
  h.failConfig(false);await h.one('reconnect').onclick();assert.equal(h.one('submit').disabled,false);
});

test('invalid image types and over-size files are rejected before image decoding or cloud upload', async () => {
  const h=harness();for(const [file,code] of [[{size:1,type:'image/svg+xml'},'image_format'],[{size:21*1024*1024,type:'image/jpeg'},'image_too_large'],[{size:0,type:'image/png'},'invalid_image']])await assert.rejects(h.core.preparePhoto(file),e=>e.code===code);
  assert.equal(h.urls.length,0);assert.equal(h.requests.length,0);
  assert.doesNotThrow(()=>h.core.validateFile({size:100,type:'',name:'camera.HEIC'}));
  assert.throws(()=>h.core.imageSize(10000,10000),e=>e.code==='image_dimensions');
  assert.deepEqual(JSON.parse(JSON.stringify(h.core.imageSize(4000,2000))),{width:1800,height:900});
});

test('photo preparation reencodes JPEG, strips source metadata, reduces size and releases temporary resources', async () => {
  const h=harness({canvasSizes:[2000000,1700000,600000]});const photo=await h.core.preparePhoto({size:3000000,type:'image/jpeg',name:'photo.jpg'});
  assert.equal(photo.width,1800);assert.equal(photo.height,1200);assert.equal(photo.mimeType,'image/jpeg');assert.equal(photo.bytes,600000);assert.equal(h.canvasCalls(),3);
  assert.equal(Buffer.from(photo.base64,'base64').length,600000);assert.equal(h.canvas.width,0);assert.equal(h.canvas.height,0);assert.deepEqual(h.revoked,h.urls);
  assert.equal(h.requests.length,0);
});

test('camera and gallery inputs are separate; selected photo is uploaded only after recognize and can be edited', async () => {
  const h=harness();await h.page('photo');h.one('camera').onclick();h.one('gallery').onclick();assert.equal(h.one('camera-file').clicked,1);assert.equal(h.one('gallery-file').clicked,1);
  assert.equal(h.one('camera-file').attributes.capture,'environment');assert.equal(h.one('gallery-file').attributes.capture,undefined);
  await h.one('gallery-file').onchange({target:{files:[{size:1000,type:'image/png'}]}});
  assert.equal(h.requests.length,1);assert.equal(h.one('photo-preview').hidden,false);assert.equal(h.one('recognize').disabled,false);
  await h.one('recognize').onclick();assert.equal(h.requests.length,2);assert.match(h.requests[1].url,/\/photo$/);
  const body=JSON.parse(h.requests[1].options.body);assert.equal(body.mimeType,'image/jpeg');assert.equal(body.language,'zh');assert.ok(body.image);assert.equal(h.one('input').value,'你好，世界！');
  h.input('你好，中国！');await h.one('submit').onclick();assert.equal(JSON.parse(h.requests[2].options.body).text,'你好，中国！');
  h.one('remove-photo').onclick();assert.equal(h.one('photo-preview').hidden,true);assert.equal(h.one('recognize').disabled,true);assert.deepEqual(h.revoked,h.urls);
});

test('long and truncated OCR remains editable and is never silently billed for a shortened translation', async () => {
  const long='汉'.repeat(2500);const h=harness({fetcher:url=>url.endsWith('/config')?response(defaults):response({text:long,truncated:true})});
  await h.page('photo');await h.one('gallery-file').onchange({target:{files:[{size:1000,type:'image/png'}]}});await h.one('recognize').onclick();
  assert.equal(h.one('input').value.length,2500);assert.equal(h.one('submit').disabled,true);assert.match(h.one('status').textContent,/первая часть/);assert.equal(h.requests.length,2);
  h.input('汉');assert.equal(h.one('submit').disabled,false);
});

test('mode changes and navigation cannot receive a stale prepared image or OCR result', async () => {
  const gate=deferred();const h=harness();await h.page('photo');h.core.preparePhoto=()=>gate.promise;
  const pending=h.one('gallery-file').onchange({target:{files:[{size:1000,type:'image/png'}]}});h.one('tab-text').onclick();
  gate.resolve({blob:{},base64:'AA==',mimeType:'image/jpeg',width:1,height:1});await pending;
  assert.equal(h.one('photo-preview').hidden,true);assert.equal(h.one('status').textContent,'');assert.equal(h.urls.length,0);
  const gate2=deferred();h.core.preparePhoto=async()=>({blob:{},base64:'AA==',mimeType:'image/jpeg',width:1,height:1});h.one('tab-photo').onclick();await h.one('gallery-file').onchange({target:{files:[{size:1000,type:'image/png'}]}});
  h.context.fetch=async(url,options)=>{h.requests.push({url,options});return gate2.promise;};const recognizing=h.one('recognize').onclick();h.leave();gate2.resolve(response({text:'Late image text'}));await recognizing;
  assert.equal(h.one('input').value,'');assert.deepEqual(h.revoked,h.urls);assert.equal(h.requests.at(-1).options.signal.aborted,true);
});

test('no text and malformed response have usable feedback without fabricating translations', async () => {
  const h=harness({fetcher:()=>response({text:' '})});await assert.rejects(h.core.recognize({base64:'AA==',mimeType:'image/jpeg'},'zh'),e=>e.code==='no_text');
  await assert.rejects(h.core.translate('你好','zh','ru'),e=>e.code==='invalid_response');
  h.context.fetch=async()=>response(null);await assert.rejects(h.core.request('/config'),e=>e.code==='invalid_response');
});

test('transport timeouts clean up timers and manual cancellation does not become a network error', async () => {
  const h=harness({fetcher:(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('AbortError'))))});
  const pending=h.core.request('/text',{text:'你好'});for(const fn of [...h.timers.values()])fn();await assert.rejects(pending,e=>e.code==='timeout');assert.equal(h.timers.size,0);
  const c=new AbortController(), next=h.core.request('/text',{text:'你好'},c.signal);c.abort();await assert.rejects(next,e=>e.code==='aborted');assert.equal(h.timers.size,0);
});

test('editing while configuration loads keeps one lookup, and late configuration cannot update another page', async () => {
  const gate=deferred(), h=harness({fetcher:()=>gate.promise});const page=h.page();
  h.input('你');h.input('你好');h.one('tab-photo').onclick();assert.equal(h.requests.length,1);
  gate.resolve(response(defaults));await page;assert.equal(h.one('submit').disabled,false);assert.equal(h.one('photo-panel').hidden,false);
  const gate2=deferred(), other=harness({fetcher:()=>gate2.promise});const departed=other.page();other.leave();
  assert.equal(other.requests[0].options.signal.aborted,true);gate2.resolve(response(defaults));await departed;assert.equal(other.one('submit').disabled,true);
});

test('changing source language prevents equal-language requests and selects Chinese speech after reversal', async () => {
  const h=harness({fetcher:url=>url.endsWith('/config')?response(defaults):response({text:'你好！',source:'ru',target:'zh'})});
  await h.page();h.one('source').value='ru';h.one('source').onchange();assert.equal(h.one('target').value,'zh');h.input('Привет!');await h.one('submit').onclick();h.one('speak').onclick();
  assert.equal(h.spoken[0].lang,'zh-CN');assert.equal(h.spoken[0].voice.name,'Chinese');
  h.one('target').value='ru';h.one('target').onchange();assert.equal(h.one('source').value,'zh');
});
