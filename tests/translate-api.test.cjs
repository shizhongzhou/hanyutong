const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTranslationHandler, validateText, validatePhoto, imageDimensions, extractRecognizedText,
  MAX_TEXT_CHARS, MAX_IMAGE_BYTES, MAX_BODY_BYTES, MAX_PROVIDER_BYTES, TEXT_URL, OCR_URL } = require('../infra/yandex/function/translate.js');

const origin = 'https://shizhongzhou.github.io';
const context = { token: { access_token: 'test-service-account-token' } };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', 'base64');
const photo = { image: png.toString('base64'), mimeType: 'image/png', language: 'auto' };
const input = { text: '你好，朋友！', source: 'zh', target: 'ru' };
const event = (path = '/translate/text', body = input, extra = {}) => ({ path, httpMethod: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  requestContext: { identity: { sourceIp: '192.0.2.4' } }, ...extra });
const json = result => JSON.parse(result.body);
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
function configured(options = {}) {
  const reservations = [], calls = [];
  const handler = createTranslationHandler({ enabled: true, ocrEnabled: true, now: () => 1234,
    reserveUsage: async (usage, ctx) => { reservations.push({ usage, ctx }); return { allowed: true }; },
    fetcher: async (url, init) => { calls.push({ url, init }); return response({ translations: [{ text: 'Привет, друг!' }] }); }, ...options });
  return { handler, reservations, calls };
}

test('translation configuration stays disabled without explicit flags and a durable usage guard', async () => {
  for (const options of [{}, { enabled: true }, { reserveUsage: async () => ({ allowed: true }) }]) {
    const handler = createTranslationHandler(options);
    const result = await handler({ path: '/translate/config', httpMethod: 'GET' });
    assert.deepEqual(json(result), { enabled: false, ocrEnabled: false, maxTextChars: MAX_TEXT_CHARS, maxImageBytes: MAX_IMAGE_BYTES });
    assert.equal(result.headers['Cache-Control'], 'private, no-store');
    assert.equal((await handler(event(), context)).statusCode, 503);
  }
  const { handler } = configured({ ocrEnabled: false });
  assert.equal(json(await handler({ path: '/translate/config' })).enabled, true);
  assert.equal(json(await handler({ path: '/translate/config' })).ocrEnabled, false);
  assert.equal(json(await handler(event('/translate/photo', photo), context)).error, 'ocr_disabled');
});

test('routes reject wrong methods, unknown origins and missing app origin without provider calls', async () => {
  const { handler, calls, reservations } = configured();
  assert.equal(await handler({ path: '/health' }), null);
  assert.equal((await handler({ path: '/translate/other' })).statusCode, 404);
  assert.equal((await handler({ path: '/translate/config', httpMethod: 'POST' })).statusCode, 405);
  assert.equal((await handler(event('/translate/text', input, { httpMethod: 'GET' }), context)).statusCode, 405);
  assert.equal((await handler(event('/translate/text', input, { headers: { Origin: 'https://example.org', 'Content-Type': 'application/json' } }), context)).statusCode, 403);
  assert.equal((await handler(event('/translate/text', input, { headers: { 'Content-Type': 'application/json' } }), context)).statusCode, 403);
  const preflight = await handler(event('/translate/photo', photo, { httpMethod: 'OPTIONS' }));
  assert.equal(preflight.statusCode, 204); assert.equal(preflight.body, '');
  assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
  assert.equal(reservations.length, 0); assert.equal(calls.length, 0);
});

test('text input bounds count Unicode code points and never accept provider options or URLs', () => {
  assert.equal(validateText({ text: '𠮷'.repeat(2000), source: 'auto', target: 'ru' }).chars, 2000);
  for (const bad of [null, [], { ...input, text: '' }, { ...input, text: '   ' }, { ...input, text: 4 }, { ...input, text: 'abc\u0000' },
    { ...input, source: 'en' }, { ...input, target: 'de' }, { ...input, target: 'zh' }, { ...input, url: 'https://attacker.test' },
    { ...input, folderId: 'different-folder' }, { ...input, text: '字'.repeat(2001) }]) assert.throws(() => validateText(bad));
});

test('malformed JSON, oversized bodies and malformed base64 are rejected before reserving budget', async () => {
  const { handler, calls, reservations } = configured();
  const cases = [
    { body: 'not JSON' }, { body: 'null' }, { body: '[]' }, { body: JSON.stringify('text') },
    { body: ' '.repeat(MAX_BODY_BYTES + 1) }, { body: Buffer.from(JSON.stringify(input)).toString('base64') + '?', isBase64Encoded: true },
    { body: 'A'.repeat(Math.ceil(MAX_BODY_BYTES / 3) * 4 + 4), isBase64Encoded: true },
    { headers: { Origin: origin, 'Content-Type': 'text/plain' } }
  ];
  for (const extra of cases) assert.ok([400, 413, 415].includes((await handler(event('/translate/text', input, extra), context)).statusCode));
  assert.equal(reservations.length, 0); assert.equal(calls.length, 0);
});

test('service-account credentials stay server side and the reservation precedes the exact Translate request', async () => {
  const order = [];
  const { handler, reservations } = configured({ reserveUsage: async (usage, ctx) => {
    order.push('reserved'); assert.equal(usage.chars, [...input.text].length); assert.equal(usage.images, 0);
    assert.equal(usage.identity, '192.0.2.4'); assert.equal(usage.now, 1234); assert.equal(ctx, context);
    return { allowed: true };
  }, fetcher: async (url, init) => {
    order.push('provider'); assert.equal(url, TEXT_URL);
    assert.equal(init.headers.Authorization, 'Bearer test-service-account-token');
    assert.equal(init.headers['x-data-logging-enabled'], 'false'); assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { texts: [input.text], sourceLanguageCode: 'zh', targetLanguageCode: 'ru', format: 'PLAIN_TEXT' });
    return response({ translations: [{ text: 'Привет, друг!', detectedLanguageCode: 'zh' }] });
  } });
  const result = await handler(event(), context);
  assert.equal(result.statusCode, 200); assert.deepEqual(json(result), { text: 'Привет, друг!', source: 'zh', target: 'ru' });
  assert.deepEqual(order, ['reserved', 'provider']); assert.doesNotMatch(result.body, /test-service-account-token/);
  assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
});

test('auto language omits source from provider request and reads the detected language without a second paid call', async () => {
  let calls = 0;
  const { handler } = configured({ fetcher: async (url, init) => {
    calls++; assert.equal(JSON.parse(init.body).sourceLanguageCode, undefined);
    return response({ translations: [{ text: '你好', detectedLanguageCode: 'ru' }] });
  } });
  const body = { text: 'Привет', source: 'auto', target: 'zh' };
  const result = await handler(event('/translate/text', body, { body: Buffer.from(JSON.stringify(body)).toString('base64'), isBase64Encoded: true }), context);
  assert.deepEqual(json(result), { text: '你好', source: 'ru', target: 'zh' }); assert.equal(calls, 1);
});

test('missing IAM token and unavailable budget always fail closed before provider invocation', async () => {
  const { handler, calls, reservations } = configured();
  for (const ctx of [{}, { token: { access_token: '' } }, { token: { access_token: 'bad\nheader' } }]) {
    assert.equal(json(await handler(event(), ctx)).error, 'credentials_unavailable');
  }
  assert.equal(reservations.length, 0); assert.equal(calls.length, 0);
  for (const reserveUsage of [async () => undefined, async () => true, async () => { throw Error('private storage information'); }]) {
    const failed = configured({ reserveUsage });
    const result = await failed.handler(event(), context);
    assert.equal(result.statusCode, 503); assert.deepEqual(json(result), { error: 'usage_unavailable' }); assert.equal(failed.calls.length, 0);
  }
});

test('daily, monthly and per-identity limits return safe retry data with no provider retries', async () => {
  for (const error of ['rate_limit', 'daily_limit', 'monthly_limit']) {
    const { handler, calls } = configured({ reserveUsage: async () => ({ allowed: false, error, retryAfter: 60 }) });
    const result = await handler(event(), context);
    assert.equal(result.statusCode, 429); assert.deepEqual(json(result), { error, retryAfter: 60 });
    assert.equal(result.headers['Retry-After'], '60'); assert.equal(calls.length, 0);
  }
});

test('rate limiting identity uses gateway context and ignores user-provided forwarding headers', async () => {
  const { handler, reservations } = configured();
  await handler(event('/translate/text', input, { requestContext: {}, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.90' } }), context);
  assert.equal(reservations[0].usage.identity, 'unknown');
  await handler(event('/translate/text', input, { requestContext: { http: { sourceIp: '2001:db8::1' } } }), context);
  assert.equal(reservations[1].usage.identity, '2001:db8::1');
});

test('photo validation checks signatures, dimensions and decoded size rather than trusting MIME', () => {
  assert.deepEqual(imageDimensions(png, 'image/png'), { width: 1, height: 1 });
  assert.equal(validatePhoto(photo).mimeType, 'image/png');
  const jpeg = Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 10, 0, 20, 1, 1, 17, 0, 255, 217]);
  assert.deepEqual(imageDimensions(jpeg, 'image/jpeg'), { width: 20, height: 10 });
  assert.equal(validatePhoto({ image: jpeg.toString('base64'), mimeType: 'image/jpeg', language: 'ru' }).language, 'ru');
  const huge = Buffer.from(png); huge.writeUInt32BE(10000, 16); huge.writeUInt32BE(10000, 20);
  const empty = Buffer.from(png); empty.writeUInt32BE(0, 16);
  for (const bad of [
    { ...photo, mimeType: 'image/jpeg' }, { ...photo, mimeType: 'image/svg+xml' }, { ...photo, image: '' },
    { ...photo, image: '<svg>'.repeat(20) }, { ...photo, image: png.toString('base64') + '\n' },
    { ...photo, image: 'data:image/png;base64,' + photo.image }, { ...photo, image: huge.toString('base64') },
    { ...photo, image: empty.toString('base64') }, { ...photo, image: Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64') },
    { ...photo, url: 'https://private-storage/' }, { ...photo, language: 'ja' }
  ]) assert.throws(() => validatePhoto(bad));
});

test('OCR uses one paid image request and a Chinese model that also recognizes Russian', async () => {
  for (const language of ['auto', 'zh', 'ru']) {
    let calls = 0;
    const { handler, reservations } = configured({ fetcher: async (url, init) => {
      calls++; assert.equal(url, OCR_URL); assert.equal(init.headers['x-data-logging-enabled'], 'false');
      const payload = JSON.parse(init.body);
      assert.equal(payload.content, photo.image); assert.equal(payload.mimeType, 'PNG'); assert.equal(payload.model, 'page');
      assert.deepEqual(payload.languageCodes, language === 'ru' ? ['ru'] : ['zh', 'en', 'ru']);
      assert.equal(payload.folderId, undefined);
      return response({ result: { textAnnotation: { fullText: '你好\nПривет' } } });
    } });
    const result = await handler(event('/translate/photo', { ...photo, language }), context);
    assert.equal(result.statusCode, 200); assert.deepEqual(json(result), { text: '你好\nПривет' }); assert.equal(calls, 1);
    assert.equal(reservations[0].usage.images, 1); assert.equal(reservations[0].usage.chars, 0);
  }
});

test('OCR extraction preserves line breaks and reports truncation instead of silently dropping long text', () => {
  assert.deepEqual(extractRecognizedText({ textAnnotation: { blocks: [{ lines: [{ text: '你好' }, { text: '世界' }] }] } }), { text: '你好\n世界' });
  const long = extractRecognizedText({ textAnnotation: { fullText: '𠮷'.repeat(20001) } });
  assert.equal([...long.text].length, 20000); assert.equal(long.truncated, true);
  assert.throws(() => extractRecognizedText({ textAnnotation: {} }));
  assert.throws(() => extractRecognizedText({ textAnnotation: { fullText: ' \n ' } }), e => e.code === 'no_text' && e.status === 422);
});

test('upstream errors and invalid responses never expose their messages or credential values', async () => {
  for (const result of [new Response('private details', { status: 403 }), new Response('private details', { status: 500 }),
    new Response('not-json'), response({ translations: [] }), response({ translations: [{ text: ' ' }] }), response({ translations: [{ text: 'x'.repeat(20001) }] })]) {
    const { handler } = configured({ fetcher: async () => result });
    const failed = await handler(event(), context);
    assert.equal(failed.statusCode, 502); assert.deepEqual(json(failed), { error: 'translation_unavailable' });
  }
  const { handler } = configured({ fetcher: async () => new Response('hidden upstream reason', { status: 429 }) });
  assert.deepEqual(json(await handler(event(), context)), { error: 'provider_busy' });
  const noText = configured({ fetcher: async () => response({ textAnnotation: { fullText: '' } }) });
  assert.equal((await noText.handler(event('/translate/photo', photo), context)).statusCode, 422);
});

test('streamed and advertised oversized provider bodies are stopped within the server memory bound', async () => {
  let canceled = false;
  const oversized = new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65536)); }, cancel() { canceled = true; } }));
  const { handler } = configured({ fetcher: async () => oversized });
  assert.equal((await handler(event(), context)).statusCode, 502); assert.equal(canceled, true);
  const advertised = configured({ fetcher: async () => new Response('{}', { headers: { 'Content-Length': String(MAX_PROVIDER_BYTES + 1) } }) });
  assert.equal((await advertised.handler(event(), context)).statusCode, 502);
});

test('provider timeout aborts the request and never retries or refunds an uncertain charge', async () => {
  let calls = 0;
  const { handler, reservations } = configured({ providerTimeoutMs: 5, fetcher: (url, init) => {
    calls++; return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true }));
  } });
  const result = await handler(event(), context);
  assert.equal(result.statusCode, 504); assert.deepEqual(json(result), { error: 'request_timeout' });
  assert.equal(calls, 1); assert.equal(reservations.length, 1);
});
