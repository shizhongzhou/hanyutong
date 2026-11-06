const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAISpeechHandler, validateSpeech, validateWav, normalizeApiHost, MAX_BODY_BYTES,
  MAX_PCM_BYTES, MAX_FRAME_BYTES } = require('../infra/yandex/function/ai-speech');
const { quoteAICost } = require('../infra/yandex/function/ai-budget');
const origin = 'https://shizhongzhou.github.io', context = { requestId: 'test-request' };
const event = (path = '/ai/speech', body = { text: '你好！' }, extra = {}) => ({ path, httpMethod: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  requestContext: { identity: { sourceIp: '192.0.2.5' } }, ...extra });
const json = result => JSON.parse(result.body);
function wav(seconds = 1) {
  const bytes = Buffer.alloc(44 + seconds * 32000);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24); bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40); return bytes;
}
const recording = (bytes = wav()) => ({ audio: bytes.toString('base64'), mimeType: 'audio/wav' });
const frame = item => 'data: ' + JSON.stringify(item) + '\n\n';
const pcm = Buffer.from([0, 0, 1, 0, 255, 127, 0, 128]);
const audioFrame = (bytes = pcm) => ({ output: { finish_reason: null, audio: { data: bytes.toString('base64') } } });
const finalFrame = { output: { finish_reason: 'stop', audio: { data: '', url: 'https://untrusted.example/never-fetch' } } };
const sse = (text = frame(audioFrame()) + frame(finalFrame), headers = {}) => new Response(text, { headers: { 'Content-Type': 'text/event-stream', ...headers } });
const transcript = (text = '你好！') => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } });
function configured(options = {}) {
  const calls = [], reservations = [];
  const handler = createAISpeechHandler({ ttsEnabled: true, asrEnabled: true, apiKey: 'test-private-key', apiHost: 'https://llm-demo.ap-southeast-1.maas.aliyuncs.com',
    reserveUsage: async (usage, ctx) => { reservations.push({ usage, ctx }); return { allowed: true }; },
    fetcher: async (url, init) => { calls.push({ url, init }); return url.endsWith('/chat/completions') ? transcript() : sse(); }, ...options });
  return { handler, calls, reservations };
}

test('only matching routes are handled and origin/method checks precede paid work', async () => {
  const { handler, calls, reservations } = configured();
  assert.equal(await handler({ path: '/ai/chat' }), null);
  for (const path of ['/ai/speech', '/ai/transcribe']) {
    assert.equal((await handler(event(path, {}, { httpMethod: 'GET' }))).statusCode, 405);
    assert.equal((await handler(event(path, {}, { headers: { Origin: 'https://bad.example' } }))).statusCode, 403);
    assert.equal((await handler(event(path, {}, { headers: {} }))).statusCode, 403);
    const result = await handler(event(path, {}, { httpMethod: 'OPTIONS' }));
    assert.equal(result.statusCode, 204); assert.equal(result.body, '');
    assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
  }
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('independent speech flags and required budget guard fail closed', async () => {
  for (const options of [{ ttsEnabled: false }, { ttsEnabled: 'true' }, { reserveUsage: undefined }]) {
    const { handler, calls } = configured(options);
    assert.equal((await handler(event())).statusCode, 503); assert.equal(calls.length, 0);
  }
  const { handler } = configured({ asrEnabled: false });
  assert.equal(json(await handler(event('/ai/transcribe', recording()))).error, 'asr_disabled');
  assert.equal((await handler(event())).statusCode, 200);
});

test('API hosts accept only exact supported regional hosts without arbitrary URL parts', () => {
  for (const host of ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'llm-123.cn-beijing.maas.aliyuncs.com', 'llm-123.ap-southeast-1.maas.aliyuncs.com']) {
    assert.equal(normalizeApiHost(host), 'https://' + host);
    assert.equal(normalizeApiHost('https://' + host), 'https://' + host);
  }
  for (const bad of ['', null, 'http://dashscope.aliyuncs.com', 'dashscope.aliyuncs.com/', 'dashscope.aliyuncs.com:443',
    'dashscope.aliyuncs.com?query', 'dashscope.aliyuncs.com#fragment', 'evil@dashscope.aliyuncs.com', 'dashscope.aliyuncs.com.evil.example',
    'trial.ap-southeast-1.maas.aliyuncs.com', 'token-plan.ap-southeast-1.maas.aliyuncs.com', 'x.us-east-1.maas.aliyuncs.com',
    'x.y.cn-beijing.maas.aliyuncs.com', '127.0.0.1', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'DASHSCOPE.aliyuncs.com']) assert.equal(normalizeApiHost(bad), null);
});

test('invalid credentials and host never reserve or call a provider', async () => {
  for (const options of [{ apiHost: 'https://attacker.example' }, { apiKey: '' }, { apiKey: 'sk-sp-test-plan-key' }, { apiKey: 'key\nsecret' }, { apiKey: () => { throw Error('private'); } }]) {
    const { handler, calls, reservations } = configured(options);
    assert.deepEqual(json(await handler(event())), { error: 'credentials_unavailable' });
    assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
  }
});

test('TTS validates Chinese content, Unicode code point limits, and disallows provider options', () => {
  assert.deepEqual(validateSpeech({ text: '  你好！  ' }), { text: '你好！', characters: 3 });
  assert.equal(validateSpeech({ text: '𠮷'.repeat(300) }).characters, 300);
  for (const bad of [null, [], {}, { text: '' }, { text: 'English only' }, { text: '中文\u0000' }, { text: '中文\ud800' },
    { text: '字'.repeat(301) }, { text: '中文', voice: 'injected' }, { text: '中文', apiHost: 'http://metadata/' }]) assert.throws(() => validateSpeech(bad));
});

test('canonical WAV validation bounds actual duration and codec, not reported fields', () => {
  assert.equal(validateWav(recording(wav(30))).length, 960044);
  const invalid = [Buffer.alloc(4), wav(31), Buffer.concat([wav(), Buffer.from('hidden')])];
  const maskedSignature = wav(); maskedSignature[0] |= 0x80; invalid.push(maskedSignature);
  for (const [offset, value, bytes] of [[4, 1, 4], [16, 18, 4], [20, 3, 2], [22, 2, 2], [24, 44100, 4], [28, 1, 4], [32, 1, 2], [34, 8, 2], [40, 1, 4]]) {
    const corrupt = wav(); bytes === 2 ? corrupt.writeUInt16LE(value, offset) : corrupt.writeUInt32LE(value, offset); invalid.push(corrupt);
  }
  for (const buffer of invalid) assert.throws(() => validateWav(recording(buffer)));
  for (const bad of [{ ...recording(), mimeType: 'audio/mp3' }, { ...recording(), duration: 1 }, { audio: 'data:audio/wav;base64,' + recording().audio, mimeType: 'audio/wav' },
    { ...recording(), audio: recording().audio + '\n' }, { ...recording(), audio: 'AAAA====' }]) assert.throws(() => validateWav(bad));
});

test('malformed JSON, oversize requests, and unsafe text fail before reservation', async () => {
  const { handler, calls, reservations } = configured();
  for (const extra of [{ body: '{' }, { body: 'null' }, { body: '[]' }, { body: ' '.repeat(MAX_BODY_BYTES + 1) },
    { body: 'AA?=', isBase64Encoded: true }, { headers: { Origin: origin, 'Content-Type': 'text/plain' } }]) {
    assert.ok([400, 413, 415].includes((await handler(event('/ai/speech', {}, extra))).statusCode));
  }
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('TTS reserves conservative character cost first, collects PCM, and ignores audio URLs', async () => {
  const order = [], { handler, calls } = configured({ reserveUsage: async (usage, ctx) => {
    order.push('reserved'); assert.deepEqual(usage, { operation: 'tts', identity: '192.0.2.5', costMicroRubles: quoteAICost('tts', { characters: 6 }) });
    assert.equal(ctx, context); return { allowed: true };
  }, fetcher: async (url, init) => {
    order.push('called'); assert.equal(url, 'https://llm-demo.ap-southeast-1.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation');
    assert.equal(init.redirect, 'error'); assert.equal(init.headers.Authorization, 'Bearer test-private-key'); assert.equal(init.headers['X-DashScope-SSE'], 'enable');
    assert.deepEqual(JSON.parse(init.body), { model: 'qwen3-tts-flash', input: { text: '你好！', voice: 'Cherry', language_type: 'Chinese' } });
    return sse();
  } });
  const result = await handler(event(), context), data = json(result), output = Buffer.from(data.audio, 'base64');
  assert.equal(result.statusCode, 200); assert.equal(data.mimeType, 'audio/wav');
  assert.equal(output.toString('ascii', 0, 4), 'RIFF'); assert.equal(output.readUInt32LE(24), 24000); assert.equal(output.readUInt16LE(22), 1);
  assert.deepEqual(output.subarray(44), pcm); assert.deepEqual(order, ['reserved', 'called']);
  assert.equal(result.headers['Cache-Control'], 'private, no-store'); assert.doesNotMatch(result.body, /private-key|untrusted\.example/);
});

test('ASR forwards bounded WAV as a Data URI and reserves a full thirty seconds', async () => {
  const { handler, reservations, calls } = configured();
  const body = recording(), result = await handler(event('/ai/transcribe', body, { body: Buffer.from(JSON.stringify(body)).toString('base64'), isBase64Encoded: true }), context);
  assert.equal(result.statusCode, 200); assert.deepEqual(json(result), { text: '你好！' });
  assert.equal(reservations[0].usage.costMicroRubles, quoteAICost('asr', { audioSeconds: 30 }));
  assert.equal(reservations[0].usage.operation, 'asr'); assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://llm-demo.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.messages[0].content[0].input_audio.data, 'data:audio/wav;base64,' + body.audio);
  assert.deepEqual(sent.asr_options, { language: 'zh', enable_itn: false }); assert.equal(sent.model, 'qwen3-asr-flash');
  assert.equal(calls[0].init.redirect, 'error');
});

test('budget denial and budget failures never call providers; identity ignores forwarding headers', async () => {
  for (const error of ['rate_limit', 'daily_limit', 'monthly_limit']) {
    const { handler, calls } = configured({ reserveUsage: async () => ({ allowed: false, error, retryAfter: 60 }) });
    const result = await handler(event()); assert.equal(result.statusCode, 429);
    assert.deepEqual(json(result), { error, retryAfter: 60 }); assert.equal(result.headers['Retry-After'], '60'); assert.equal(calls.length, 0);
  }
  for (const reserveUsage of [async () => true, async () => undefined, async () => { throw Error('private'); }]) {
    const { handler, calls } = configured({ reserveUsage });
    assert.deepEqual(json(await handler(event())), { error: 'usage_unavailable' }); assert.equal(calls.length, 0);
  }
  const { handler, reservations } = configured();
  await handler(event('/ai/speech', { text: '你好' }, { requestContext: {}, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': 'spoofed' } }));
  assert.equal(reservations[0].usage.identity, 'unknown');
});

test('TTS SSE parser handles split frames, CRLF, and UTF-8 chunk boundaries', async () => {
  const text = ': 中文注释\r\n\r\n' + (frame(audioFrame()) + frame(finalFrame)).replaceAll('\n', '\r\n');
  const raw = Buffer.from(text), stream = new ReadableStream({ start(controller) {
    for (let i = 0; i < raw.length; i += 3) controller.enqueue(raw.subarray(i, i + 3)); controller.close();
  } });
  const { handler } = configured({ fetcher: async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }) });
  const result = await handler(event()); assert.equal(result.statusCode, 200);
  assert.deepEqual(Buffer.from(json(result).audio, 'base64').subarray(44), pcm);
});

test('malicious, truncated, invalid and oversized SSE never exposes provider data', async () => {
  const cases = [frame(audioFrame()), frame(finalFrame), 'data: {private}\n\n', frame({ code: 'ProviderPrivateError', message: 'private details' }),
    frame({ output: { audio: { data: 'not base64' } } }) + frame(finalFrame), frame(audioFrame(Buffer.from([1]))) + frame(finalFrame),
    frame(audioFrame()) + frame({ output: { finish_reason: 'length' } }), frame(audioFrame()) + frame(finalFrame) + frame(audioFrame()),
    frame(audioFrame()) + frame(finalFrame).trimEnd(), 'data: ' + 'x'.repeat(MAX_FRAME_BYTES + 1)];
  for (const content of cases) {
    const { handler } = configured({ fetcher: async () => sse(content) });
    assert.deepEqual(json(await handler(event())), { error: 'speech_unavailable' });
  }
  for (const fetcher of [async () => sse(undefined, { 'Content-Length': '99999999' }), async () => new Response('not sse'),
    async () => new Response('private details', { status: 403 }), async () => { throw Error('secret key'); }]) {
    const { handler } = configured({ fetcher }); assert.deepEqual(json(await handler(event())), { error: 'speech_unavailable' });
  }
});

test('SSE aggregate PCM size is bounded across individually valid frames', async () => {
  const part = frame(audioFrame(Buffer.alloc(64000))), content = part.repeat(Math.ceil(MAX_PCM_BYTES / 64000) + 1) + frame(finalFrame);
  const { handler } = configured({ fetcher: async () => sse(content) });
  assert.equal((await handler(event())).statusCode, 502);
});

test('ASR validates provider JSON, suppresses internals, and reports silence', async () => {
  const cases = [new Response('private'), new Response('not json', { headers: { 'Content-Type': 'application/json' } }),
    transcript('x'.repeat(3001)), transcript('bad\u0000'), new Response('{}', { headers: { 'Content-Type': 'application/json' } })];
  for (const response of cases) {
    const { handler } = configured({ fetcher: async () => response });
    assert.deepEqual(json(await handler(event('/ai/transcribe', recording()))), { error: 'transcription_unavailable' });
  }
  const { handler } = configured({ fetcher: async () => transcript(' ') });
  assert.deepEqual(json(await handler(event('/ai/transcribe', recording()))), { error: 'no_speech' });
});

test('timeouts cover stalled fetch and stalled body without retries or refunds', async () => {
  for (const fetcher of [async () => new Promise(() => {}), async () => new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'text/event-stream' } })]) {
    const { handler, reservations } = configured({ providerTimeoutMs: 5, fetcher });
    const result = await handler(event()); assert.equal(result.statusCode, 504); assert.deepEqual(json(result), { error: 'request_timeout' });
    assert.equal(reservations.length, 1);
  }
  const { handler } = configured({ fetcher: async () => new Response('private', { status: 429 }) });
  const result = await handler(event()); assert.equal(result.statusCode, 429); assert.deepEqual(json(result), { error: 'provider_busy' });
});
