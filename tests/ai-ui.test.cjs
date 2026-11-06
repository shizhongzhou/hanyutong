'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/js/ai.js'), 'utf8');
const defaults = { enabled: true, visionEnabled: false, ttsEnabled: true, asrEnabled: true, maxInputChars: 2000 };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const plain = value => JSON.parse(JSON.stringify(value));
const sampleBuffer = (duration = 1, channels = 1, rate = 16000) => ({ duration, numberOfChannels: channels, sampleRate: rate, getChannelData: () => new Float32Array(Math.ceil(duration * rate)).fill(.25) });
const wavHeader = Buffer.from('RIFF0000WAVEtest').toString('base64');

function harness({ config = defaults, fetcher, microphone, decode, stopDeferred = false } = {}) {
  const ids = new Map(), requests = [], leaves = [], urls = [], revoked = [], timers = new Map(), audios = [], tracks = [], recorders = [], decoders = [];
  let timerId = 0, urlId = 0;
  class Element {
    constructor(tag = 'div', attrs = '') {
      this.tagName = tag.toUpperCase(); this.value = ''; this.hidden = /\bhidden\b/.test(attrs); this.disabled = /\bdisabled\b/.test(attrs);
      this.textContent = ''; this.children = []; this.attributes = {}; this.className = ''; this.paused = false;
      for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) this.setAttribute(name, value);
    }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') { this.id = value; ids.set(value, this); } if (name === 'value') this.value = value; }
    getAttribute(name) { return this.attributes[name]; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
    set innerHTML(html) {
      this.html = html; this.children = []; ids.clear();
      for (const [, tag, attrs] of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*)>/gi)) if (/\bid="/.test(attrs)) this.children.push(new Element(tag, attrs));
      if (ids.has('ai-level')) ids.get('ai-level').value = '1';
    }
    get innerHTML() { return this.html || ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { this.focused = true; }
    pause() { this.paused = true; }
    load() {}
  }
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, options) { this.stream = stream; this.mimeType = options?.mimeType || 'audio/webm'; this.state = 'inactive'; recorders.push(this); }
    start(slice) { this.state = 'recording'; this.slice = slice; }
    chunk(size = 100) { this.ondataavailable?.({ data: new Blob([new Uint8Array(size)], { type: this.mimeType }) }); }
    stop() { this.state = 'inactive'; this.stopCalled = true; if (!stopDeferred) { this.chunk(); this.stopped = this.onstop?.(); } }
    finish() { this.stopped = this.onstop?.(); return this.stopped; }
  }
  class Decoder {
    constructor() { this.closed = false; decoders.push(this); }
    async decodeAudioData(data) { this.input = data; return decode ? decode(data) : sampleBuffer(); }
    async close() { this.closed = true; }
  }
  class Audio extends Element {
    constructor(url) { super('audio'); this.src = url; this.played = 0; audios.push(this); }
    async play() { this.played++; }
  }
  const stream = () => { const track = { stops: 0, stop() { this.stops++; } }; tracks.push(track); return { getTracks: () => [track] }; };
  const app = new Element();
  const context = vm.createContext({ console, app, window: { AudioContext: Decoder },
    $: selector => ids.get(selector.replace(/^#/, '')), topbar: title => `<h1>${title}</h1>`, ic: name => `<svg data-icon="${name}"></svg>`, onLeave: fn => leaves.push(fn),
    navigator: { mediaDevices: { getUserMedia: microphone || (async () => stream()) } },
    document: { createElement: name => new Element(name) }, MediaRecorder: Recorder, Audio,
    URL: { createObjectURL: blob => { const url = 'blob:ai-' + ++urlId; urls.push(url); return url; }, revokeObjectURL: url => revoked.push(url) },
    AbortController, Blob, Uint8Array, Float32Array, ArrayBuffer, DataView, btoa, atob, Date,
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, interval: false }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms, interval: true }); return id; }, clearInterval: id => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, options }); if (fetcher) return fetcher(url, options);
      if (url.endsWith('/config')) return response(config);
      if (url.endsWith('/speech')) return response({ audio: wavHeader, mimeType: 'audio/wav' });
      if (url.endsWith('/transcribe')) return response({ text: '你好，我想喝茶。' });
      return response({ text: '你好！\nNǐ hǎo!\nПривет! Давай познакомимся.' });
    }
  });
  vm.runInContext(source, context); const run = code => vm.runInContext(code, context), one = id => ids.get('ai-' + id);
  const all = (root, predicate) => root.children.flatMap(child => [...(predicate(child) ? [child] : []), ...all(child, predicate)]);
  return { run, context, one, app, requests, urls, revoked, timers, audios, tracks, recorders, decoders, stream,
    core: run('HanyuAI'), page: mode => run(`pageAI(${JSON.stringify(mode)})`),
    leave() { for (const fn of leaves.splice(0)) fn(); }, input(value) { one('input').value = value; one('input').oninput(); },
    messages() { return one('messages').children.map(article => article.children.find(child => child.className === 'ai-message-text').textContent); },
    playButtons() { return all(one('messages'), child => child.className === 'ai-speech-line'); },
    notices() { return all(one('messages'), child => child.className === 'hint').map(child => child.textContent); },
    elements(className, root = one('messages')) { return all(root, child => child.className.split(/\s+/).includes(className)); },
    text(root = one('messages')) { const content = node => [node.textContent, ...node.children.map(content)].join('\n'); return content(root); },
    fire(ms) { for (const timer of [...timers.values()]) if (timer.ms === ms) timer.fn(); },
    async until(predicate) { for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setImmediate(resolve)); assert.ok(predicate(), 'expected condition'); }
  };
}

test('AI screen loads only configuration, respects independent capabilities and keeps conversation ephemeral', async () => {
  const h = harness({ config: { ...defaults, asrEnabled: false, ttsEnabled: false } });
  assert.equal(h.requests.length, 0); await h.page(); assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /\/ai\/config$/); assert.equal(h.one('send').disabled, true);
  for (const route of ['#/assess/writing', '#/assess/speaking', '#/pronunciation']) assert.ok(h.app.innerHTML.includes(`href="${route}"`));
  h.input('你好'); assert.equal(h.one('send').disabled, false); assert.equal(h.one('mic-panel').hidden, true);
  assert.equal(h.one('voice-note').hidden, false); assert.equal(h.one('speech-note').hidden, true);
  await h.one('send').onclick(); assert.equal(h.playButtons().length, 0); assert.equal(h.audios.length, 0);
  h.leave(); await h.page(); assert.deepEqual(h.messages(), []); assert.equal(h.one('input').value, '');
  assert.equal(h.timers.size, 0); assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
});

test('home AI sends the actual input inline, retains dialogue history, and uses no draft redirect', async () => {
  const h = harness();
  await h.page('home');
  assert.match(h.one('tutor').className, /\bai-home\b/);
  assert.ok(h.app.innerHTML.includes('href="#/home"'));
  assert.ok(h.app.innerHTML.includes('href="#/home/ai" aria-current="page"'));
  assert.doesNotMatch(h.app.innerHTML, /<h1>|panda|熊猫|Купить|Подписаться/);
  assert.equal(h.requests.length, 1); assert.match(h.requests[0].url, /\/ai\/config$/);
  h.input('请用俄语解释：我想学好中文。');
  assert.equal(h.requests.length, 1);
  await h.one('send').onclick();
  assert.match(h.requests[1].url, /\/ai\/chat$/);
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { messages: [{ role: 'user', content: '请用俄语解释：我想学好中文。' }], mode: 'dialogue', level: 1 });
  assert.equal(h.messages()[0], '请用俄语解释：我想学好中文。');
  assert.equal(h.one('features').hidden, true); assert.equal(h.one('empty').hidden, true);
  assert.match(h.one('tutor').className, /\bai-home\b.*\bhas-history\b/);
  assert.equal(h.elements('ai-feedback-toggle').length, 1);
  h.input('请再举一个例子。'); await h.one('send').onclick();
  assert.equal(JSON.parse(h.requests[2].options.body).messages.length, 3);
  assert.equal(h.messages().length, 4);
  h.leave(); await h.page('home'); assert.deepEqual(h.messages(), []);
});

test('home AI explanation and HSK controls use the same service only after explicit Send', async () => {
  const h = harness(); await h.page('home');
  h.one('explain').onclick(); h.one('level').value = '6'; h.one('level').onchange();
  assert.equal(h.one('options-label').textContent, 'Объяснение · HSK 6');
  h.one('starter-1').onclick(); assert.equal(h.requests.length, 1);
  const draft = h.one('input').value; await h.one('send').onclick();
  const body = JSON.parse(h.requests[1].options.body);
  assert.equal(body.mode, 'explain'); assert.equal(body.level, 6); assert.equal(body.messages[0].content, draft);
  assert.match(h.one('tutor').className, /\bai-home\b/);
  h.one('reset').onclick(); assert.equal(h.one('empty').hidden, false); assert.equal(h.one('features').hidden, false);
  assert.equal(h.one('options-label').textContent, 'Объяснение · HSK 6');
});

test('home AI voice stays on the page and requires separate recognition and Send actions', async () => {
  const h = harness(); await h.page('home');
  assert.equal(h.one('mic-controls').hidden, false); assert.equal(h.one('mic-panel').hidden, true);
  await h.one('record').onclick();
  assert.equal(h.requests.length, 1); assert.equal(h.one('mic-panel').hidden, false);
  assert.match(h.one('tutor').className, /\bis-capturing\b/);
  h.one('stop').onclick(); await h.until(() => !h.one('recording').hidden);
  assert.equal(h.requests.length, 1);
  await h.one('recognize').onclick(); assert.match(h.requests[1].url, /\/ai\/transcribe$/);
  assert.equal(h.one('input').value, '你好，我想喝茶。'); assert.equal(h.messages().length, 0);
  h.input('你好，我想喝咖啡。'); await h.one('send').onclick();
  assert.match(h.requests[2].url, /\/ai\/chat$/);
  assert.equal(JSON.parse(h.requests[2].options.body).messages[0].content, '你好，我想喝咖啡。');
  await h.playButtons()[0].onclick(); assert.match(h.requests[3].url, /\/ai\/speech$/);
  h.leave(); assert.ok(h.tracks.every(track => track.stops > 0)); assert.equal(h.timers.size, 0);
});

test('home AI reserves the measured floating composer height and stops observing on navigation', async () => {
  const h = harness(); let observer, observed, disconnected = false, callback;
  h.context.ResizeObserver = class { constructor(fn) { callback = fn; observer = this; } observe(node) { observed = node; } disconnect() { disconnected = true; } };
  await h.page('home'); assert.ok(observer); assert.equal(observed, h.one('compose-dock'));
  const values = {}; h.one('tutor').style = { setProperty: (key, value) => { values[key] = value; } };
  callback([{ target: { getBoundingClientRect: () => ({ height: 168.4 }) } }]);
  assert.equal(values['--ai-dock-height'], '169px');
  h.leave(); assert.equal(disconnected, true);
  callback([{ target: { getBoundingClientRect: () => ({ height: 300 }) } }]);
  assert.equal(values['--ai-dock-height'], '169px');
});

test('history trims whole old pairs by character and message limits, never truncating current Unicode input', () => {
  const h = harness(), history = Array.from({ length: 9 }, (_, i) => [{ role: 'user', content: String(i) }, { role: 'assistant', content: '回' }]).flat();
  const latest = h.core.contextMessages(history, '  𠀀你好  '); assert.equal(latest.length, 11);
  assert.deepEqual(plain(latest[0]), { role: 'user', content: '4' }); assert.equal(latest.at(-1).content, '𠀀你好');
  const longHistory = Array.from({ length: 5 }, () => [{ role: 'user', content: '学'.repeat(1500) }, { role: 'assistant', content: '文'.repeat(1500) }]).flat();
  const bounded = h.core.contextMessages(longHistory, '𠀀'.repeat(2000));
  assert.equal(bounded.length, 5); assert.equal(bounded.reduce((sum, m) => sum + [...m.content].length, 0), 8000);
  const oversized = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b'.repeat(2001) }];
  const retained = h.core.contextMessages(oversized, 'c'); assert.equal(retained.length, 3);
  assert.equal(retained[0].content, 'a'); assert.ok([...retained[1].content].length <= 2000);
  assert.match(retained[1].content, /Часть предыдущего ответа опущена/); assert.equal(retained.at(-1).content, 'c');
  assert.throws(() => h.core.contextMessages([], '𠀀'.repeat(2001)), e => e.code === 'text_too_long');
  assert.throws(() => h.core.contextMessages([], '  '), e => e.code === 'empty_text');
});

test('scenario selection requires Send, sends selected HSK/mode, and treats model markup as text', async () => {
  const answer = '<img src=x onerror=alert(1)>\n你好！';
  const h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : response({ text: answer, truncated: true }) });
  await h.page('explain'); h.one('level').value = '7'; h.one('level').onchange(); h.one('starter-0').onclick();
  assert.equal(h.requests.length, 1); assert.match(h.one('input').value, /Объясни по-русски/);
  const sent = h.one('input').value; await h.one('send').onclick();
  assert.deepEqual(JSON.parse(h.requests[1].options.body), { messages: [{ role: 'user', content: sent }], mode: 'explain', level: 7 });
  assert.deepEqual(h.messages(), [sent, answer]); assert.deepEqual(h.notices(), ['Ответ сокращён. Попросите продолжить.']);
  assert.equal(h.one('messages').children[1].children[1].children.length, 0);
  assert.equal(h.requests[1].options.credentials, 'omit'); assert.equal(h.requests[1].options.cache, 'no-store');
  assert.equal(h.audios.length, 0); assert.equal(h.requests.filter(r => r.url.endsWith('/speech')).length, 0);
  h.input('继续'); await h.one('send').onclick(); assert.equal(JSON.parse(h.requests[2].options.body).messages.length, 3);
  h.one('dialogue').onclick(); assert.deepEqual(h.messages(), []); assert.equal(h.one('input').value, '');
  assert.equal(h.one('dialogue').getAttribute('aria-pressed'), 'true');
});

test('one explicit request is in flight; editing cancels stale replies and preserves the new draft', async () => {
  const gate = deferred(), h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : gate.promise });
  await h.page(); h.input('你好'); const send = h.one('send').onclick(); await h.one('send').onclick();
  assert.equal(h.requests.length, 2); assert.equal(h.one('empty').hidden, true); assert.equal(h.one('starters').hidden, true);
  h.input('再见'); assert.equal(h.requests[1].options.signal.aborted, true); gate.resolve(response({ text: '旧回答' })); await send;
  assert.equal(h.one('input').value, '再见'); assert.deepEqual(h.messages(), []); assert.equal(h.one('status').textContent, '');
  assert.equal(h.timers.size, 0);
});

test('changing mode or leaving aborts late responses without populating another conversation', async () => {
  for (const leave of [false, true]) {
    const gate = deferred(), h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : gate.promise });
    await h.page(); h.input('你好'); const send = h.one('send').onclick();
    if (leave) h.leave(); else h.one('explain').onclick();
    assert.equal(h.requests[1].options.signal.aborted, true); gate.resolve(response({ text: 'late' })); await send;
    assert.equal(h.messages().includes('late'), false); assert.equal(h.timers.size, 0);
  }
});

test('quota failure preserves draft, reports Russian reason and never retries automatically', async () => {
  const h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : response({ error: 'monthly_limit' }, 429) });
  await h.page(); h.input('你好'); await h.one('send').onclick();
  assert.equal(h.requests.length, 2); assert.equal(h.one('input').value, '你好'); assert.match(h.one('status').textContent, /месяц исчерпан/);
  assert.deepEqual(h.messages(), []); assert.equal(h.one('send').disabled, false);
  h.input('𠀀'.repeat(2001)); assert.equal(h.one('send').disabled, true); await h.one('send').onclick(); assert.equal(h.requests.length, 2);
});

test('configuration retry and late navigation are safe, and strict flags reject truthy strings', async () => {
  let working = false;
  const h = harness({ fetcher: () => { if (!working) throw Error('offline'); return response({ ...defaults, asrEnabled: 'true', ttsEnabled: 'true', maxInputChars: 3000 }); } });
  await h.page(); h.input('你好'); assert.equal(h.one('send').disabled, true); assert.equal(h.one('reconnect').hidden, false);
  working = true; await h.one('reconnect').onclick(); assert.equal(h.one('send').disabled, false); assert.equal(h.one('mic-panel').hidden, true);
  const gate = deferred(), other = harness({ fetcher: () => gate.promise }); const pending = other.page(); other.input('你好'); other.leave();
  gate.resolve(response(defaults)); await pending; assert.equal(other.one('send').disabled, true); assert.equal(other.requests[0].options.signal.aborted, true);
});

test('Chinese speech extracts Chinese lines only, deduplicates and bounds each explicit request', async () => {
  const h = harness();
  assert.deepEqual(plain(h.core.chineseLines('你好！\nNǐ hǎo!\nПривет!\n你好！\n中文：我喜欢茶。 — Я люблю чай.')), ['你好！', '中文：我喜欢茶。']);
  assert.equal(h.core.chineseLines('汉'.repeat(300)).length, 1);
  assert.equal(h.core.chineseLines('汉'.repeat(301)).length, 0);
  assert.equal(h.core.chineseLines(Array.from({ length: 10 }, (_, i) => '你好' + i).join('\n')).length, 8);
  await assert.rejects(h.core.speech('汉'.repeat(301)), e => e.code === 'text_too_long'); assert.equal(h.requests.length, 0);
  await h.page(); h.input('你好'); await h.one('send').onclick(); const play = h.playButtons()[0];
  assert.equal(h.audios.length, 0); await play.onclick(); assert.equal(h.audios[0].played, 1);
  assert.deepEqual(JSON.parse(h.requests.at(-1).options.body), { text: '你好！' });
  h.input('下一句'); assert.equal(h.audios[0].paused, true); assert.deepEqual(h.revoked, h.urls);
});

test('stale speech never plays after reset, and malformed audio fails safely', async () => {
  const gate = deferred(), h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : url.endsWith('/speech') ? gate.promise : response({ text: '你好！' }) });
  await h.page(); h.input('你好'); await h.one('send').onclick(); const sound = h.playButtons()[0].onclick(); h.one('reset').onclick();
  gate.resolve(response({ audio: wavHeader, mimeType: 'audio/wav' })); await sound; assert.equal(h.audios.length, 0); assert.equal(h.urls.length, 0);
  h.context.fetch = async () => response({ audio: Buffer.from('<html>bad</html>').toString('base64'), mimeType: 'audio/wav' });
  await assert.rejects(h.core.speech('你好'), e => e.code === 'invalid_response');
});

test('maximum provider WAV fits linear Base64 validation without stack overflow', async () => {
  const data = Buffer.alloc(4 * 1024 * 1024 + 44); data.write('RIFF', 0); data.write('WAVE', 8);
  const h = harness({ fetcher: () => response({ audio: data.toString('base64'), mimeType: 'audio/wav' }) });
  const audio = await h.core.speech('你好'); assert.equal(audio.size, data.length);
  for (const invalid of ['AB==', 'A===', 'AAA', 'AA!A']) {
    h.context.fetch = async () => response({ audio: invalid, mimeType: 'audio/wav' });
    await assert.rejects(h.core.speech('你好'), error => error.code === 'invalid_response');
  }
});

test('voice conversion produces bounded mono 16 kHz PCM WAV and always closes its decoder', async () => {
  const h = harness(), converted = await h.core.prepareRecording(new Blob(['test'], { type: 'audio/webm' }));
  assert.equal(converted.mimeType, 'audio/wav'); const data = Buffer.from(converted.audio, 'base64');
  assert.equal(data.toString('ascii', 0, 4), 'RIFF'); assert.equal(data.toString('ascii', 8, 12), 'WAVE');
  assert.equal(data.readUInt16LE(22), 1); assert.equal(data.readUInt32LE(24), 16000); assert.equal(data.readUInt16LE(34), 16);
  assert.equal(data.length, 32044); assert.equal(h.decoders[0].closed, true); assert.equal(h.requests.length, 0);
  const long = h.core.wavFromBuffer(sampleBuffer(31, 2, 48000)); assert.equal(long.length, 960044);
  const stereo = h.core.wavFromBuffer({ ...sampleBuffer(1, 2), getChannelData: i => new Float32Array(16000).fill(i ? -1 : 1) });
  assert.equal(new DataView(stereo.buffer).getInt16(44, true), 0);
  await assert.rejects(h.core.prepareRecording(new Blob([new Uint8Array(3 * 1024 * 1024 + 1)])), e => e.code === 'audio_too_large');
  const failed = harness({ decode: () => { throw Error('decode failed'); } });
  await assert.rejects(failed.core.prepareRecording(new Blob(['bad'])), e => e.code === 'invalid_audio'); assert.equal(failed.decoders[0].closed, true);
});

test('recording stays local until explicit recognition; transcript is editable and never auto-sent', async () => {
  const h = harness(); await h.page(); await h.one('record').onclick();
  assert.equal(h.recorders[0].state, 'recording'); assert.equal(h.one('stop').hidden, false); assert.equal(h.requests.length, 1);
  h.one('stop').onclick(); await h.recorders[0].stopped;
  assert.equal(h.tracks[0].stops, 1); assert.equal(h.one('recording').hidden, false); assert.equal(h.one('recognize').disabled, false);
  assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0); await h.one('recognize').onclick();
  assert.equal(h.requests.length, 2); assert.match(h.requests[1].url, /\/transcribe$/); assert.equal(JSON.parse(h.requests[1].options.body).mimeType, 'audio/wav');
  assert.equal(h.one('input').value, '你好，我想喝茶。'); assert.deepEqual(h.messages(), []);
  h.input('你好，我想喝咖啡。'); await h.one('send').onclick(); assert.equal(JSON.parse(h.requests[2].options.body).messages[0].content, '你好，我想喝咖啡。');
  h.one('discard').onclick(); assert.equal(h.one('recording').hidden, true); assert.deepEqual(h.revoked, h.urls);
});

test('voice capture stops after 30 seconds and rejects over-size chunks without any upload', async () => {
  const h = harness(); await h.page(); await h.one('record').onclick(); h.fire(30000); await h.recorders[0].stopped;
  assert.equal(h.recorders[0].state, 'inactive'); assert.equal(h.one('recording').hidden, false); assert.equal(h.requests.length, 1);
  await h.one('record').onclick(); h.recorders[1].chunk(3 * 1024 * 1024 + 1); await h.recorders[1].stopped;
  assert.equal(h.one('recording').hidden, true); assert.match(h.one('status').textContent, /слишком большая/); assert.equal(h.requests.length, 1); assert.equal(h.timers.size, 0);
});

test('permission arriving after navigation is released and denied permission leaves text usable', async () => {
  const gate = deferred(), h = harness({ microphone: () => gate.promise }); await h.page(); const record = h.one('record').onclick(); h.leave();
  gate.resolve(h.stream()); await record; assert.equal(h.tracks[0].stops, 1); assert.equal(h.recorders.length, 0);
  const denied = harness({ microphone: async () => { throw Object.assign(Error('denied'), { name: 'NotAllowedError' }); } });
  await denied.page(); await denied.one('record').onclick(); assert.match(denied.one('status').textContent, /Разрешите доступ/);
  denied.input('你好'); assert.equal(denied.one('send').disabled, false);
});

test('old recorder stop callbacks cannot release a newer stream; leaving stops every live resource', async () => {
  const h = harness({ stopDeferred: true }); await h.page(); await h.one('record').onclick(); h.one('reset').onclick();
  await h.one('record').onclick(); await h.recorders[0].finish();
  assert.equal(h.tracks[0].stops, 1); assert.equal(h.tracks[1].stops, 0); assert.equal(h.recorders[1].state, 'recording');
  h.leave(); assert.equal(h.tracks[1].stops, 1); assert.equal(h.recorders[1].state, 'inactive'); assert.equal(h.timers.size, 0);
});

test('stale local preparation and recognition cannot overwrite edited text or create abandoned audio URLs', async () => {
  const prepared = deferred(), h = harness(); await h.page(); h.core.prepareRecording = () => prepared.promise;
  await h.one('record').onclick(); h.one('stop').onclick(); h.one('reset').onclick();
  prepared.resolve({ blob: new Blob(['wav']), audio: 'AA==', mimeType: 'audio/wav' }); await h.recorders[0].stopped;
  assert.equal(h.urls.length, 0); assert.equal(h.one('recording').hidden, true);
  h.core.prepareRecording = async () => ({ blob: new Blob(['wav']), audio: 'AA==', mimeType: 'audio/wav' });
  await h.one('record').onclick(); h.one('stop').onclick(); await h.recorders[1].stopped;
  const gate = deferred(); h.context.fetch = async (url, options) => { h.requests.push({ url, options }); return gate.promise; };
  const recognizing = h.one('recognize').onclick(); h.input('мой текст'); gate.resolve(response({ text: '旧转写' })); await recognizing;
  assert.equal(h.one('input').value, 'мой текст'); assert.equal(h.requests.at(-1).options.signal.aborted, true);
  h.leave(); assert.deepEqual(h.revoked, h.urls);
});

test('request timeouts and manual cancellation clean timers without treating cancellation as an outage', async () => {
  const h = harness({ fetcher: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('AbortError')))) });
  const timed = h.core.request('/chat', {}); h.fire(75000); await assert.rejects(timed, e => e.code === 'timeout'); assert.equal(h.timers.size, 0);
  const c = new AbortController(), manual = h.core.request('/chat', {}, c.signal); c.abort(); await assert.rejects(manual, e => e.code === 'aborted'); assert.equal(h.timers.size, 0);
});

test('assessment alone waits 200 seconds and manual cancellation still cleans its request', async () => {
  const h = harness({ fetcher: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Error('AbortError')))) });
  const pending = h.core.request('/assess', {});
  assert.equal([...h.timers.values()][0].ms, 200000);
  h.fire(75000); assert.equal(h.requests[0].options.signal.aborted, false);
  h.fire(200000); await assert.rejects(pending, e => e.code === 'timeout'); assert.equal(h.timers.size, 0);
  const controller = new AbortController(), cancelled = h.core.request('/assess', {}, controller.signal);
  controller.abort(); await assert.rejects(cancelled, e => e.code === 'aborted'); assert.equal(h.timers.size, 0);
  const config = h.core.request('/config');
  assert.equal([...h.timers.values()][0].ms, 10000);
  h.fire(10000); await assert.rejects(config, e => e.code === 'timeout'); assert.equal(h.timers.size, 0);
});

const richReply = {
  zh: '我在学习汉语。你呢？', pinyin: 'Wǒ zài xuéxí Hànyǔ. Nǐ ne?', ru: 'Я изучаю китайский. А ты?',
  explanationRu: '在 показывает действие, которое происходит сейчас.',
  corrections: [{ original: '我是学习汉语', corrected: '我在学习汉语', explanationRu: 'Здесь нужен 在, а не 是.', kind: 'grammar' }],
  newWords: [{ hz: '学习', py: 'xuéxí', ru: 'учиться' }, { hz: '现在', py: 'xiànzài', ru: 'сейчас' }]
};

test('structured replies separate languages and corrections; words save only by explicit choice', async () => {
  const saved = [], corrected = [], reply = structuredClone(richReply);
  reply.explanationRu = '<img src=x onerror=alert(1)> Здесь нужен 在.';
  const h = harness({ fetcher: url => url.endsWith('/config') ? response(defaults) : response({ text: 'Полный ответ', reply }) });
  h.context.HanyuLearning = { context: () => ({}), addWord: word => saved.push(plain(word)), recordCorrections: values => corrected.push(plain(values)) };
  await h.page(); h.input('我是学习汉语'); await h.one('send').onclick();
  assert.equal(h.elements('ai-reply-section').length, 4);
  assert.match(h.text(), /Пиньинь/); assert.match(h.text(), /Почему так/); assert.match(h.text(), /Разберём ошибки/);
  assert.equal(h.elements('ai-reply-section')[3].children[1].textContent, reply.explanationRu);
  assert.equal(h.elements('ai-reply-section')[3].children[1].children.length, 0);
  assert.deepEqual(corrected, [richReply.corrections]); assert.deepEqual(saved, []);
  assert.deepEqual(h.playButtons().map(button => button.textContent), ['▶ ' + richReply.zh]);
  const add = h.elements('ai-add-word')[0]; await add.onclick(); await add.onclick();
  assert.deepEqual(saved, [richReply.newWords[0]]); assert.equal(add.disabled, true); assert.equal(add.textContent, 'В словарике');
  h.input('А что значит сейчас?'); assert.equal(corrected.length, 1, 'rerender does not record corrections twice');
  assert.equal(h.elements('ai-add-word')[0].disabled, true);
});

test('learning profile is sent only with explicit chat, bounded and limited to supported fields', async () => {
  let reads = 0;
  const profile = { knownWords: Array.from({ length: 50 }, (_, i) => '词' + i), grammarErrors: Array(12).fill('Ошибки с 是').concat('x'.repeat(121), 'test@example.com', '+7 999 123 45 67', 'https://example.com'), toneErrors: ['третий тон', 'x'.repeat(61)], privateNotes: 'never send' };
  const h = harness(); h.context.HanyuLearning = { context: () => { reads++; return profile; } };
  await h.page(); h.input('你好'); assert.equal(reads, 0); assert.equal(h.requests.length, 1);
  await h.one('send').onclick(); const sent = JSON.parse(h.requests[1].options.body);
  assert.equal(reads, 1); assert.equal(sent.profile.knownWords.length, 40);
  assert.deepEqual(sent.profile.grammarErrors, ['Ошибки с 是']); assert.deepEqual(sent.profile.toneErrors, ['третий тон']);
  assert.equal(Object.hasOwn(sent.profile, 'privateNotes'), false);
});

test('a stale pending learning profile cannot trigger a chat after editing', async () => {
  const gate = deferred(), h = harness(); h.context.HanyuLearning = { context: () => gate.promise };
  await h.page(); h.input('你好'); const send = h.one('send').onclick(); h.input('再见');
  gate.resolve({ knownWords: ['你'] }); await send; assert.equal(h.requests.length, 1); assert.equal(h.one('input').value, '再见');
});

test('malformed structured fields cannot inject markup, extra words or unsupported corrections', () => {
  const h = harness(), reply = h.core.structuredReply({ ...richReply, corrections: [{ original: {}, corrected: '对', explanationRu: 'пояснение', kind: 'word' }, { ...richReply.corrections[0], kind: 'tone' }], newWords: [...richReply.newWords, { hz: '多', py: 'duō', ru: 'много' }], private: 'ignore' });
  assert.equal(reply.corrections.length, 0); assert.equal(reply.newWords.length, 2); assert.equal(Object.hasOwn(reply, 'private'), false);
  assert.equal(h.core.structuredReply({ zh: {}, ru: [], explanationRu: 123 }), null);
});

test('photo text handoff is in memory, editable, one-use and never automatically sent or shortened', async () => {
  const h = harness(); assert.equal(h.core.setDraft('文字'.repeat(1100), 'explain'), true); await h.page();
  assert.equal(h.one('input').value.length, 2200); assert.equal(h.one('send').disabled, true);
  assert.equal(h.one('explain').getAttribute('aria-pressed'), 'true'); assert.equal(h.requests.length, 1);
  h.input('解释一下：你好'); await h.one('send').onclick(); assert.equal(JSON.parse(h.requests[1].options.body).messages[0].content, '解释一下：你好');
  h.leave(); await h.page(); assert.equal(h.one('input').value, ''); assert.equal(h.core.setDraft(''), false);
});

test('feedback requires separate opt-in, previews the exact excerpt and persists only once explicitly', async () => {
  const h = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, feedbackEnabled: true }) : url.endsWith('/feedback') ? response({ ok: true }) : response({ text: '<b>Неправильный ответ</b>', reply: richReply }) });
  await h.page(); h.input('解释你好'); await h.one('send').onclick(); assert.equal(h.requests.length, 2);
  h.elements('ai-feedback-toggle')[0].onclick(); const form = h.elements('ai-feedback-form')[0];
  assert.match(h.text(form), /解释你好/); assert.match(h.text(form), /<b>Неправильный ответ<\/b>/);
  let send = h.elements('ai-feedback-send')[0]; assert.equal(send.disabled, true); await send.onclick(); assert.equal(h.requests.length, 2);
  const reason = h.elements('ai-feedback-reason')[0]; reason.value = 'unclear'; reason.onchange();
  const consent = h.elements('ai-feedback-consent')[0].children[0]; assert.equal(consent.checked, false); consent.checked = true; consent.onchange();
  assert.equal(send.disabled, false); await send.onclick();
  assert.deepEqual(JSON.parse(h.requests.at(-1).options.body), { prompt: '解释你好', answer: '<b>Неправильный ответ</b>', reason: 'unclear', consent: true });
  assert.equal(h.elements('ai-feedback-toggle')[0].textContent, 'Замечание отправлено'); assert.equal(h.elements('ai-feedback-toggle')[0].disabled, true);
  assert.equal(h.requests.length, 3); assert.equal(h.elements('ai-feedback-form').length, 0);
});

test('feedback cannot outlive navigation or silently retry after a service error', async () => {
  const gate = deferred(), h = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, feedbackEnabled: true }) : url.endsWith('/feedback') ? gate.promise : response({ text: 'Ответ' }) });
  await h.page(); h.input('你好'); await h.one('send').onclick(); h.elements('ai-feedback-toggle')[0].onclick();
  const consent = h.elements('ai-feedback-consent')[0].children[0]; consent.checked = true; consent.onchange();
  const sending = h.elements('ai-feedback-send')[0].onclick(); h.leave(); gate.resolve(response({ ok: true })); await sending;
  assert.equal(h.requests.at(-1).options.signal.aborted, true); assert.equal(h.elements('ai-feedback-toggle')[0].textContent, 'Сообщить об ошибке ответа'); assert.equal(h.requests.length, 3);
});

test('failed feedback keeps the selected reason and requires another explicit submit', async () => {
  const h = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, feedbackEnabled: true }) : url.endsWith('/feedback') ? response({ error: 'feedback_unavailable' }, 503) : response({ text: 'Ответ' }) });
  await h.page(); h.input('你好'); await h.one('send').onclick(); h.elements('ai-feedback-toggle')[0].onclick();
  const reason = h.elements('ai-feedback-reason')[0]; reason.value = 'wrong_level'; reason.onchange();
  const consent = h.elements('ai-feedback-consent')[0].children[0]; consent.checked = true; consent.onchange();
  await h.elements('ai-feedback-send')[0].onclick(); assert.equal(h.requests.length, 3);
  assert.equal(h.elements('ai-feedback-reason')[0].value, 'wrong_level'); assert.match(h.text(), /Не удалось отправить замечание/);
  assert.equal(h.elements('ai-feedback-toggle')[0].disabled, false); assert.equal(h.elements('ai-feedback-send')[0].disabled, false);
});

const writingTask = { id: 'writing-1-greeting', mode: 'writing', level: 1, titleRu: 'Знакомство', promptZh: '请介绍你自己。', promptRu: 'Представьтесь в двух предложениях.', maxScore: 10, criteria: [{ id: 'task', labelRu: 'Выполнение задания', maxScore: 5 }, { id: 'language', labelRu: 'Язык', maxScore: 5 }] };
const speakingTask = { ...writingTask, id: 'speaking-1-greeting', mode: 'speaking', titleRu: 'Устное знакомство' };
const assessment = (task = writingTask) => ({ taskId: task.id, mode: task.mode, level: task.level, score: 7, maxScore: 10, criteria: task.criteria.map((item, i) => ({ ...item, score: i ? 3 : 4, feedbackRu: i ? 'Проверьте порядок слов.' : 'Основная задача выполнена.' })), feedbackRu: 'Добавьте одну подробность.', rewrite: { zh: '我叫安娜。我学习汉语。', pinyin: 'Wǒ jiào Ānnà. Wǒ xuéxí Hànyǔ.', ru: 'Меня зовут Анна. Я учу китайский.' }, sample: { zh: '我叫安娜。我是学生。', pinyin: 'Wǒ jiào Ānnà. Wǒ shì xuésheng.', ru: 'Меня зовут Анна. Я студентка.' }, noticeRu: 'Учебная оценка.', assessmentScope: task.mode === 'speaking' ? 'text_content_only' : 'written_text' });

test('assessment lists real tasks but cannot submit when assessment service is unconfigured', async () => {
  const h = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, assessmentEnabled: false }) : response({ tasks: [writingTask, speakingTask] }) });
  await h.run('pageAIAssessment("writing")'); h.input('我叫安娜。');
  assert.equal(h.one('task').value, writingTask.id); assert.match(h.text(h.one('task-details')), /Выполнение задания/);
  assert.equal(h.one('send').disabled, true); assert.match(h.one('service').textContent, /Проверка пока недоступна. Попробуйте позже/);
  await h.one('send').onclick(); assert.equal(h.requests.length, 2); assert.doesNotMatch(h.app.innerHTML, /Купить|Оплатить|Подписаться/); assert.doesNotMatch(h.one('service').textContent, /аккаунт|оплат|подписк/i);
});

test('assessment submits only a server task ID, renders rubric and revised/sample answers without tone scores', async () => {
  const h = harness({ fetcher: (url, options) => url.endsWith('/config') ? response({ ...defaults, assessmentEnabled: true }) : url.endsWith('/tasks') ? response({ tasks: [writingTask, speakingTask] }) : response(assessment(JSON.parse(options.body).mode === 'speaking' ? speakingTask : writingTask)) });
  await h.run('pageAIAssessment("writing")'); h.input('我叫安娜。'); await h.one('send').onclick();
  assert.deepEqual(JSON.parse(h.requests.at(-1).options.body), { mode: 'writing', taskId: writingTask.id, answer: '我叫安娜。' });
  assert.match(h.text(), /7 \/ 10/); assert.match(h.text(), /Исправленный вариант/); assert.match(h.text(), /Пример ответа/);
  assert.equal(h.elements('ai-assessment-criterion').length, 2);
  h.one('assess-speaking').onclick(); assert.equal(h.one('task').value, speakingTask.id); h.input('我叫安娜。'); await h.one('send').onclick();
  assert.match(h.text(), /Произношение, беглость и тоны не оценивались/);
  assert.equal(h.elements('ai-assessment-score').length, 1); assert.equal(h.elements('ai-feedback-form').length, 0);
});

test('assessment rejects forged/mismatched totals or tasks and cancels stale task changes', async () => {
  const h = harness({ fetcher: () => response({ ...assessment(), score: 10 }) });
  await assert.rejects(h.core.assess(writingTask, '你好'), e => e.code === 'invalid_response');
  h.context.fetch = async () => response({ ...assessment(), taskId: 'different' }); await assert.rejects(h.core.assess(writingTask, '你好'), e => e.code === 'invalid_response');
  const gate = deferred(), other = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, assessmentEnabled: true }) : url.endsWith('/tasks') ? response({ tasks: [writingTask, speakingTask] }) : gate.promise });
  await other.run('pageAIAssessment("writing")'); other.input('你好'); const pending = other.one('send').onclick(); other.one('assess-speaking').onclick();
  gate.resolve(response(assessment())); await pending; assert.equal(other.elements('ai-assessment-score').length, 0); assert.equal(other.requests.at(-1).options.signal.aborted, true);
});

test('oral practice recognizes only on request and checks only the edited transcript after explicit submission', async () => {
  const h = harness({ fetcher: url => url.endsWith('/config') ? response({ ...defaults, assessmentEnabled: true }) : url.endsWith('/tasks') ? response({ tasks: [speakingTask] }) : url.endsWith('/transcribe') ? response({ text: '我叫安娜。' }) : response(assessment(speakingTask)) });
  await h.run('pageAIAssessment("oral")'); await h.one('record').onclick(); h.one('stop').onclick(); await h.recorders[0].stopped;
  assert.equal(h.requests.length, 2); await h.one('recognize').onclick(); assert.equal(h.requests.length, 3);
  assert.equal(h.elements('ai-assessment-score').length, 0); h.input('我叫安娜。我是学生。'); await h.one('send').onclick();
  assert.deepEqual(JSON.parse(h.requests.at(-1).options.body), { mode: 'speaking', taskId: speakingTask.id, answer: '我叫安娜。我是学生。' });
  assert.match(h.text(), /Оценено только содержание текста/); assert.equal(h.requests.filter(request => request.url.endsWith('/assess')).length, 1);
});

test('only stateless explanations reuse exact bounded request context and return independent clones', async () => {
  const h = harness({ fetcher: () => response({ text: 'Объяснение', reply: richReply }) });
  const profile = { knownWords: ['你'], grammarErrors: [], toneErrors: [] };
  const first = await h.core.chat([], '你好', 'explain', 1, undefined, 2000, profile);
  first.reply.newWords[0].ru = 'changed by caller';
  const second = await h.core.chat([], '你好', 'explain', 1, undefined, 2000, profile);
  assert.equal(h.requests.length, 1); assert.equal(second.reply.newWords[0].ru, richReply.newWords[0].ru);
  second.text = 'mutated'; assert.equal((await h.core.chat([], '你好', 'explain', 1, undefined, 2000, profile)).text, 'Объяснение');
  await h.core.chat([], '你好', 'explain', 2, undefined, 2000, profile);
  await h.core.chat([], '你好', 'explain', 1, undefined, 2000, { ...profile, knownWords: ['你', '好'] });
  await h.core.chat([], '你好', 'explain', 1, undefined, 2000, { ...profile, grammarErrors: ['Порядок слов'] });
  await h.core.chat([], '你好', 'explain', 1, undefined, 2000, { ...profile, toneErrors: ['Третий тон'] });
  await h.core.chat([], '谢谢', 'explain', 1, undefined, 2000, profile); assert.equal(h.requests.length, 6);
  await h.core.chat([], '你好', 'dialogue', 1); await h.core.chat([], '你好', 'dialogue', 1);
  const history = [{ role: 'user', content: '你好' }, { role: 'assistant', content: 'Здравствуйте' }];
  await h.core.chat(history, '你好', 'explain', 1); await h.core.chat(history, '你好', 'explain', 1);
  assert.equal(h.requests.length, 10, 'dialogues and follow-ups always call the service');
});

test('explanation memory cache expires after 15 minutes and cannot retain more than 20 entries', async () => {
  const h = harness(); let now = 1000; h.context.Date = class extends Date { static now() { return now; } };
  await h.core.chat([], '你好', 'explain', 1); now += 15 * 60 * 1000 - 1;
  await h.core.chat([], '你好', 'explain', 1); assert.equal(h.requests.length, 1);
  now++; await h.core.chat([], '你好', 'explain', 1); assert.equal(h.requests.length, 2);
  for (let i = 0; i < 20; i++) await h.core.chat([], '词' + i, 'explain', 1);
  await h.core.chat([], '词0', 'explain', 1); assert.equal(h.requests.length, 22);
  await h.core.chat([], '你好', 'explain', 1); assert.equal(h.requests.length, 23, 'the oldest entry was evicted');
  await h.core.chat([], '词0', 'explain', 1); assert.equal(h.requests.length, 23, 'recently used entry remains in memory');
  assert.equal(h.timers.size, 20, 'there is at most one expiry timer per bounded entry');
  h.fire(15 * 60 * 1000); assert.equal(h.timers.size, 0);
  await h.core.chat([], '词0', 'explain', 1); assert.equal(h.requests.length, 24, 'expiry also releases idle cached data');
});

test('failed, truncated and aborted explanation requests are not cached; an aborted cache hit is rejected', async () => {
  let result = response({ error: 'chat_unavailable' }, 502);
  const h = harness({ fetcher: () => result });
  await assert.rejects(h.core.chat([], '你好', 'explain', 1), error => error.code === 'chat_unavailable');
  result = response({ text: 'Обрезано', truncated: true }); await h.core.chat([], '你好', 'explain', 1); await h.core.chat([], '你好', 'explain', 1); assert.equal(h.requests.length, 3);
  result = response({ text: 'Готово' }); await h.core.chat([], '你好', 'explain', 1);
  const c = new AbortController(); c.abort(); await assert.rejects(h.core.chat([], '你好', 'explain', 1, c.signal), error => error.code === 'aborted'); assert.equal(h.requests.length, 4);
  const gate = deferred(), other = harness({ fetcher: () => gate.promise }), cancel = new AbortController();
  const pending = other.core.chat([], '你好', 'explain', 1, cancel.signal); cancel.abort(); gate.resolve(response({ text: 'late' })); await assert.rejects(pending, error => error.code === 'aborted');
  other.context.fetch = async (url, options) => { other.requests.push({ url, options }); return response({ text: 'fresh' }); };
  assert.equal((await other.core.chat([], '你好', 'explain', 1)).text, 'fresh'); assert.equal(other.requests.length, 2);
});
