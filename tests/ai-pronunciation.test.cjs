'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../web/js/ai-pronunciation');

function synthetic({ tone = 1, duration = .8, rate = 16000, base = 180, amplitude = .32, noise = .002, contour, silence = .12 } = {}) {
  const data = new Float32Array(Math.floor((duration + 2 * silence) * rate));
  let phase = 0, seed = 12345;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let i = 0; i < data.length; i++) {
    const t = i / rate - silence, x = t / duration;
    if (x >= 0 && x <= 1) {
      const semitones = contour ? contour(x) : tone === 1 ? 0 : tone === 2 ? -3 + 6 * x : tone === 3 ? x < .5 ? 1 - 10 * x : -4 + 14 * (x - .5) : 4 - 8 * x;
      phase += 2 * Math.PI * base * 2 ** (semitones / 12) / rate;
      const envelope = Math.min(1, t / .03, (duration - t) / .03);
      data[i] = amplitude * envelope * (Math.sin(phase) + .25 * Math.sin(2 * phase) + .1 * Math.sin(3 * phase)) + noise * random();
    }
  }
  return data;
}

test('measures four distinct tone contours from actual harmonic PCM at common microphone rates', () => {
  for (const rate of [8000, 16000, 44100, 48000]) for (const tone of [1, 2, 3, 4]) {
    const result = core.analyze(synthetic({ tone, rate }), rate, tone);
    assert.equal(result.status, 'similar_shape', `${rate} Hz, tone ${tone}: ${JSON.stringify(result)}`);
    assert.equal(result.detectedTone, tone);
    assert.ok(result.contour.length >= 20);
    assert.ok(Math.abs(result.contour[Math.floor(result.contour.length / 2)].semitones) < 6);
    assert.ok(result.periodicity >= .85 && result.periodicity <= 1);
    assert.equal(Object.hasOwn(result, 'score'), false);
  }
});

test('compares shape without forcing every voice into one pitch range or scaling tiny movements', () => {
  for (const base of [100, 160, 300]) for (const tone of [1, 2, 3, 4]) {
    const result = core.analyze(synthetic({ tone, base }), 16000, tone);
    assert.equal(result.detectedTone, tone, `base ${base}, tone ${tone}: ${result.reason}`);
    assert.ok(result.pitchMedianHz > base * .6 && result.pitchMedianHz < base * 1.5);
  }
  const smallRise = core.analyze(synthetic({ contour: x => -.2 + .4 * x }), 16000, 2);
  assert.equal(smallRise.status, 'different_shape');
  assert.equal(smallRise.detectedTone, 1);
});

test('a clear wrong contour is reported as different, never a correct tone from expected text', () => {
  const falling = synthetic({ tone: 4 });
  for (const expected of [1, 2, 3]) {
    const result = core.analyze(falling, 16000, expected);
    assert.equal(result.status, 'different_shape');
    assert.equal(result.detectedTone, 4);
    assert.match(core.feedback(result), /4-й тон/);
  }
});

test('silence, quiet sound, clipping, DC offset and broadband noise do not receive a tone judgment', () => {
  const silence = core.analyze(new Float32Array(16000), 16000, 1);
  assert.equal(silence.status, 'insufficient_evidence'); assert.equal(silence.reason, 'silence');
  const quiet = core.analyze(synthetic({ amplitude: .003, noise: 0 }), 16000, 1);
  assert.equal(quiet.status, 'insufficient_evidence');
  const clipped = core.analyze(new Float32Array(16000).fill(1), 16000, 1);
  assert.equal(clipped.reason, 'clipping');
  const dc = core.analyze(new Float32Array(16000).fill(.4), 16000, 1);
  assert.equal(dc.status, 'insufficient_evidence');
  let seed = 13;
  const noise = Float32Array.from({ length: 16000 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296 - .5) * .5; });
  assert.equal(core.analyze(noise, 16000, 1).status, 'insufficient_evidence');
});

test('ambiguous shapes, repeated syllables, long sounds and short fragments do not invent alignment', () => {
  const uncertain = core.analyze(synthetic({ contour: x => 3 * Math.sin(4 * Math.PI * x) }), 16000, 2);
  assert.equal(uncertain.status, 'insufficient_evidence');
  assert.equal(uncertain.detectedTone, null);
  const first = synthetic({ duration: .4, silence: .15 }), multiple = new Float32Array(first.length * 2);
  multiple.set(first); multiple.set(first, first.length);
  assert.equal(core.analyze(multiple, 16000, 1).status, 'insufficient_evidence');
  assert.equal(core.analyze(synthetic({ duration: 2.5 }), 16000, 1).reason, 'one_syllable_only');
  assert.equal(core.analyze(synthetic({ duration: .12 }), 16000, 1).status, 'insufficient_evidence');
});

test('neutral tone is not graded and invalid or overlong PCM is rejected', () => {
  const neutral = core.analyze(synthetic(), 16000, 5);
  assert.equal(neutral.status, 'not_assessed'); assert.equal(neutral.detectedTone, null);
  assert.deepEqual(core.expectedContour(5), []); assert.equal(Object.hasOwn(neutral, 'score'), false);
  for (const [samples, rate, tone] of [[synthetic(), 16000, 7], [synthetic(), 0, 1], [new Float32Array(96001), 16000, 1], [Float32Array.of(NaN), 16000, 1], [Array(4000).fill(Infinity), 16000, 1]]) {
    assert.equal(core.analyze(samples, rate, tone).status, 'insufficient_evidence');
  }
});

function harness({ microphone, decode } = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../web/js/ai-pronunciation.js'), 'utf8');
  const elements = new Map(), leaves = [], tracks = [], recorders = [], contexts = [], timers = new Map(), urls = [], revoked = [], stats = [];
  let timerId = 0, micCalls = 0;
  class Element {
    constructor() { this.hidden = false; this.disabled = false; this.dataset = {}; this.attributes = {}; this.textContent = ''; }
    setAttribute(k, v) { this.attributes[k] = v; }
    removeAttribute(k) { delete this.attributes[k]; }
    pause() {} load() {}
    set innerHTML(value) {
      this.html = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) if (!elements.has(match[1])) elements.set(match[1], new Element());
    }
  }
  const stream = () => { const track = { stopped: false, stop() { this.stopped = true; } }; tracks.push(track); return { getTracks: () => [track] }; };
  class Recorder {
    constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.done = this.onstop?.(); }
  }
  class Decoder {
    constructor() { this.closed = false; contexts.push(this); }
    async resume() {}
    async close() { this.closed = true; }
    async decodeAudioData() { if (decode) return decode(); const pcm = synthetic(); return { sampleRate: 16000, duration: pcm.length / 16000, length: pcm.length, numberOfChannels: 1, getChannelData: () => pcm }; }
  }
  const context = vm.createContext({ app: new Element(), $: id => elements.get(id.slice(1)), window: { AudioContext: Decoder },
    document: {}, topbar: title => `<h1>${title}</h1>`, ic: () => '', onLeave: f => leaves.push(f),
    navigator: { mediaDevices: { getUserMedia: async options => { micCalls++; assert.equal(options.video, false); return microphone ? microphone() : stream(); } } },
    MediaRecorder: Recorder, Blob, Float32Array, Float64Array, Math, Date,
    HanyuLearning: { recordTone: value => stats.push(value) },
    URL: { createObjectURL: () => { const url = 'blob:local-' + urls.length; urls.push(url); return url; }, revokeObjectURL: value => revoked.push(value) },
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearInterval: id => timers.delete(id),
    fetch: () => { throw Error('Local pronunciation must never upload or call an API'); }
  });
  vm.runInContext(source, context);
  return { elements, tracks, recorders, contexts, timers, urls, revoked, stats, stream, context, source,
    el: name => elements.get('pron-' + name), page: tone => vm.runInContext(`pageAIPronunciation(${JSON.stringify(tone)})`, context),
    leave: () => leaves.splice(0).forEach(fn => fn()), micCalls: () => micCalls,
    fire: ms => { for (const timer of [...timers.values()]) if (timer.ms === ms) timer.fn(); }
  };
}

test('page requests microphone only on explicit record, analyzes locally, and releases audio on leave', async () => {
  const h = harness(); await h.page(1); assert.equal(h.micCalls(), 0);
  await h.el('record').onclick(); assert.equal(h.micCalls(), 1); assert.equal(h.el('stop').hidden, false);
  h.fire(5000); await h.recorders[0].done;
  assert.equal(h.tracks[0].stopped, true); assert.equal(h.contexts[0].closed, true);
  assert.equal(h.el('result').dataset.state, 'similar_shape'); assert.equal(h.urls.length, 1);
  assert.equal(h.stats.length, 1); assert.equal(Object.hasOwn(h.stats[0], 'score'), false);
  assert.match(h.el('plot').html, /pron-actual/); assert.equal(h.timers.size, 0);
  h.leave(); assert.deepEqual(h.revoked, h.urls);
  assert.doesNotMatch(h.source, /localStorage|sessionStorage|indexedDB|\.transcribe\(/);
});

test('late microphone permission after leaving is stopped and cannot start capture', async () => {
  let resolve; const permission = new Promise(done => { resolve = done; });
  const h = harness({ microphone: () => permission }); await h.page(2);
  const pending = h.el('record').onclick(); await new Promise(done => setImmediate(done)); h.leave(); resolve(h.stream()); await pending;
  assert.equal(h.recorders.length, 0); assert.equal(h.tracks[0].stopped, true); assert.equal(h.timers.size, 0);
});

test('neutral tone is explanatory only and cancellation releases mic without analysis', async () => {
  const h = harness(); await h.page(5); assert.equal(h.el('record').disabled, true);
  await h.el('record').onclick(); assert.equal(h.micCalls(), 0);
  h.el('tone-3').onclick(); await h.el('record').onclick(); h.el('cancel').onclick();
  assert.equal(h.tracks[0].stopped, true); assert.equal(h.timers.size, 0); assert.equal(h.urls.length, 0); assert.equal(h.stats.length, 0);
});
