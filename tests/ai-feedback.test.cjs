const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createFeedbackHandler, MAX_BODY_BYTES, MAX_OBJECT_BYTES } = require('../infra/yandex/function/ai-feedback.js');
const ORIGIN = 'https://shizhongzhou.github.io', BUCKET = 'hanyutong-test-private';
const TOKEN = 'test-only-IAM-token', SALT = 'test-only-identity-salt-32-characters';
const START = Date.parse('2026-11-06T12:00:00+03:00');
const input = () => ({ prompt: '解释一下这个词。', answer: 'Пояснение, которое пользователь решил отправить.', reason: 'unclear', consent: true });
const context = () => ({ token: { access_token: TOKEN } });
function event(body = input(), identity = '192.0.2.7', overrides = {}) {
  return { path: '/ai/feedback', httpMethod: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify(body),
    requestContext: { identity: { sourceIp: identity } }, ...overrides };
}
function storage() {
  const entries = new Map(), calls = []; let interceptor = null;
  const fetcher = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (interceptor) { const response = await interceptor(url, options); if (response) return response; }
    const current = entries.get(url);
    if (options.method !== 'PUT') return current ? new Response(current.body, { headers: { ETag: current.etag } }) : new Response('', { status: 404 });
    if (options.headers['If-None-Match'] === '*' && current || options.headers['If-Match'] && options.headers['If-Match'] !== current?.etag) return new Response('', { status: 412 });
    const body = options.body, etag = '"' + createHash('md5').update(body).digest('hex') + '"';
    entries.set(url, { body, etag }); return new Response('', { status: 200 });
  };
  return { entries, calls, fetcher, state: () => JSON.parse([...entries.values()].at(-1).body), intercept: fn => { interceptor = fn; } };
}
function fixture(options = {}) {
  const store = storage(); let clock = START;
  const handler = createFeedbackHandler({ fetcher: store.fetcher, enabled: true, bucket: BUCKET, secret: SALT, now: () => clock, pause: async () => {}, ...options });
  return { store, handler, time: value => { clock = value; } };
}
const json = result => JSON.parse(result.body);

test('explicitly consented feedback stores only the selected excerpt and salted identity in private storage', async () => {
  const { handler, store } = fixture();
  const body = { ...input(), prompt: '  请解释\n这个词。 ', answer: '<script>literal selected text</script>' };
  const result = await handler(event(body), context());
  assert.equal(result.statusCode, 200); assert.deepEqual(json(result), { saved: true });
  assert.equal(result.headers['Cache-Control'], 'private, no-store'); assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(store.state().records.length, 1);
  const record = store.state().records[0];
  assert.equal(record.prompt, body.prompt); assert.equal(record.answer, body.answer); assert.equal(record.reason, body.reason); assert.equal(record.consent, true);
  assert.equal(record.createdAt, new Date(START).toISOString()); assert.match(record.identity, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(store.state()), /192\.0\.2\.7|test-only|sourceIp|authorization/i);
  assert.doesNotMatch(result.body, /script|literal selected/);
  for (const call of store.calls) {
    assert.equal(new URL(call.url).host, 'storage.yandexcloud.net');
    assert.equal(new URL(call.url).pathname, '/' + BUCKET + '/app-private/ai-feedback/2026-11.json');
    assert.equal(call.headers.Authorization, 'Bearer ' + TOKEN); assert.equal(call.redirect, 'error'); assert.ok(call.signal);
  }
  assert.equal(store.calls.find(call => call.method === 'PUT').headers['If-None-Match'], '*');
});

test('consent must be boolean true and rejected consent never contacts storage', async () => {
  const { handler, store } = fixture();
  for (const consent of [undefined, false, 'true', 1, {}, null]) {
    const result = await handler(event({ ...input(), consent }), context());
    assert.equal(result.statusCode, 400); assert.equal(json(result).error, 'consent_required');
  }
  assert.equal(store.calls.length, 0);
});

test('feedback input rejects extra fields, invalid reasons, controls, oversize text and oversized UTF-8 envelopes', async () => {
  const { handler, store } = fixture();
  for (const body of [{ ...input(), email: 'student@example.com' }, { ...input(), reason: 'other-reason' }, { ...input(), prompt: '' },
    { ...input(), answer: ' ' }, { ...input(), prompt: 'x\0y' }, { ...input(), answer: 'x\u007fy' },
    { ...input(), prompt: '字'.repeat(2001) }, { ...input(), answer: '字'.repeat(12001) }]) {
    assert.equal((await handler(event(body), context())).statusCode, 400);
  }
  // Both individual character limits pass, but the combined emoji payload exceeds 48 KiB.
  assert.equal((await handler(event({ ...input(), prompt: '😀'.repeat(2000), answer: '😀'.repeat(12000) }), context())).statusCode, 413);
  for (const overrides of [{ body: 'x'.repeat(MAX_BODY_BYTES + 1) }, { body: '%%%=', isBase64Encoded: true },
    { body: '{' }, { headers: { origin: ORIGIN, 'content-type': 'text/plain' } }]) {
    assert.ok([400, 413, 415].includes((await handler(event(undefined, undefined, overrides), context())).statusCode));
  }
  assert.equal(store.calls.length, 0);
});

test('canonical base64 envelopes are supported without weakening consent checks', async () => {
  const { handler, store } = fixture();
  const result = await handler(event(undefined, undefined, { body: Buffer.from(JSON.stringify(input())).toString('base64'), isBase64Encoded: true }), context());
  assert.equal(result.statusCode, 200); assert.equal(store.state().records.length, 1);
});

test('the endpoint has no public listing and enforces known app origins', async () => {
  const { handler, store } = fixture();
  assert.equal(await handler(event(undefined, undefined, { path: '/other' }), context()), null);
  assert.equal((await handler(event(undefined, undefined, { httpMethod: 'GET' }), context())).statusCode, 405);
  assert.equal((await handler(event(undefined, undefined, { httpMethod: 'OPTIONS' }), context())).statusCode, 204);
  for (const origin of [undefined, 'null', 'https://attacker.example']) {
    assert.equal((await handler(event(undefined, undefined, { headers: { origin, 'content-type': 'application/json' } }), context())).statusCode, 403);
  }
  assert.equal(store.calls.length, 0);
});

test('feature flags, private bucket configuration, identity salt and IAM token are required before storage access', async () => {
  for (const options of [{ enabled: false }, { enabled: 'true' }, { bucket: '../other' }, { bucket: 'bad..bucket' }, { secret: 'short' }]) {
    const { handler, store } = fixture(options); const result = await handler(event(), context());
    assert.equal(result.statusCode, 503); assert.equal(store.calls.length, 0); assert.doesNotMatch(result.body, /test-only/);
  }
  const { handler, store } = fixture();
  for (const ctx of [{}, { token: { access_token: 'bad\n' } }, { token: { access_token: 'a'.repeat(16385) } }]) {
    assert.equal((await handler(event(), ctx)).statusCode, 503);
  }
  assert.equal(store.calls.length, 0);
  assert.equal(json(await createFeedbackHandler({ enabled: false })(event(), context())).error, 'feedback_disabled');
});

test('three records per source per Moscow day survive cold starts and ignore forwarded headers', async () => {
  const { handler, store, time } = fixture();
  for (let i = 0; i < 3; i++) assert.equal((await handler(event(), context())).statusCode, 200);
  const cold = createFeedbackHandler({ fetcher: store.fetcher, enabled: true, bucket: BUCKET, secret: SALT, now: () => START });
  const denied = await cold(event(), context()); assert.equal(denied.statusCode, 429); assert.equal(json(denied).error, 'feedback_limit');
  assert.equal(denied.headers['Retry-After'], '43200'); assert.equal(store.state().records.length, 3);
  time(Date.parse('2026-11-06T21:00:00Z'));
  assert.equal((await handler(event(), context())).statusCode, 200); assert.equal(store.state().records.length, 4);
  const noGateway = event(undefined, undefined, { requestContext: {}, headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': 'spoof-1' } });
  await handler(noGateway, context());
  noGateway.headers['x-forwarded-for'] = 'spoof-2'; await handler(noGateway, context());
  const records = store.state().records; assert.equal(records.at(-1).identity, records.at(-2).identity);
});

test('concurrent callers cannot overrun the monthly record cap and retain every accepted excerpt', async () => {
  const { handler, store } = fixture();
  for (let i = 0; i < 19; i++) assert.equal((await handler(event({ ...input(), prompt: 'saved-' + i }, 'identity-' + i), context())).statusCode, 200);
  let seen = 0, release; const bothRead = new Promise(resolve => { release = resolve; });
  store.intercept(async (url, options) => {
    if (options.method !== 'PUT' && seen < 2) {
      const current = { ...store.entries.get(url) }; seen++; if (seen === 2) release(); await bothRead;
      return new Response(current.body, { headers: { ETag: current.etag } });
    }
  });
  const results = await Promise.all([handler(event({ ...input(), prompt: 'candidate-a' }, 'a'), context()), handler(event({ ...input(), prompt: 'candidate-b' }, 'b'), context())]);
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 429]); assert.equal(store.state().records.length, 20);
  for (let i = 0; i < 19; i++) assert.ok(store.state().records.some(record => record.prompt === 'saved-' + i));
});

test('the object byte cap rejects an additional record without truncating existing or accepted text', async () => {
  const { handler, store } = fixture();
  const body = { ...input(), prompt: '字'.repeat(2000), answer: '文'.repeat(12000) };
  let accepted = 0;
  for (let i = 0; i < 20; i++) {
    const result = await handler(event(body, 'identity-' + i), context());
    if (result.statusCode === 429) break;
    assert.equal(result.statusCode, 200); accepted++;
  }
  assert.ok(accepted > 0 && accepted < 20); assert.equal(store.state().records.length, accepted);
  assert.ok(Buffer.byteLength(JSON.stringify(store.state())) <= MAX_OBJECT_BYTES);
  for (const record of store.state().records) { assert.equal(record.prompt, body.prompt); assert.equal(record.answer, body.answer); }
});

test('month rollover writes a separate private ledger and preserves the preceding month', async () => {
  const { handler, store, time } = fixture(); await handler(event(), context());
  time(Date.parse('2026-11-30T21:00:00Z')); assert.equal((await handler(event(), context())).statusCode, 200);
  assert.equal(store.entries.size, 2); assert.equal(store.state().month, '2026-12'); assert.equal(store.state().records.length, 1);
});

test('reads require identity encoding and weak ETags never allow an unconditional rewrite', async () => {
  const { handler, store } = fixture(); await handler(event(), context());
  let weak = false;
  store.intercept((url, options) => {
    const current = store.entries.get(url);
    if (options.method !== 'PUT' && current && (weak || options.headers['Accept-Encoding'] !== 'identity')) return new Response(current.body, { headers: { ETag: 'W/' + current.etag } });
  });
  assert.equal((await handler(event(), context())).statusCode, 200); weak = true;
  assert.equal((await handler(event(), context())).statusCode, 503); assert.equal(store.state().records.length, 2);
  for (const call of store.calls.filter(call => call.method !== 'PUT')) assert.equal(call.headers['Accept-Encoding'], 'identity');
});

test('permission failures, corrupt ledgers and oversized responses fail closed without returning private excerpts', async () => {
  for (const response of [new Response('denied ' + TOKEN, { status: 403 }), new Response('{}'),
    new Response('{}', { headers: { ETag: '"bad"', 'Content-Length': String(MAX_OBJECT_BYTES + 1) } }),
    new Response('x'.repeat(MAX_OBJECT_BYTES + 1), { headers: { ETag: '"bad"' } }), new Response('{', { headers: { ETag: '"bad"' } })]) {
    const { handler, store } = fixture(); store.intercept(() => response);
    const result = await handler(event(), context()); assert.equal(result.statusCode, 503); assert.equal(json(result).error, 'feedback_unavailable');
    assert.doesNotMatch(result.body, /test-only|Пояснение/); assert.equal(store.calls.filter(call => call.method === 'PUT').length, 0);
  }
  for (const mutate of [ledger => { ledger.records[0].consent = false; }, ledger => { ledger.records[0].identity = '192.0.2.7'; },
    ledger => { ledger.records[0].createdAt = '2026-12-01T00:00:00.000Z'; }, ledger => { ledger.records.push(ledger.records[0]); },
    ledger => { ledger.extra = 'value'; }]) {
    const { handler, store } = fixture(); await handler(event(), context());
    const current = [...store.entries.values()][0], altered = JSON.parse(current.body); mutate(altered); current.body = JSON.stringify(altered);
    assert.equal((await handler(event(), context())).statusCode, 503); assert.equal(store.calls.filter(call => call.method === 'PUT').length, 1);
  }
});

test('repeated CAS conflicts stop after five attempts within the shared deadline', async () => {
  const { handler, store } = fixture(); store.intercept((_url, options) => options.method === 'PUT' ? new Response('', { status: 412 }) : null);
  assert.equal((await handler(event(), context())).statusCode, 503); assert.equal(store.calls.filter(call => call.method === 'PUT').length, 5);
  let elapsed = 0; const slow = fixture({ monotonicNow: () => elapsed });
  slow.store.intercept((_url, options) => { elapsed += 3000; return new Response('', { status: options.method === 'PUT' ? 412 : 404 }); });
  assert.equal((await slow.handler(event(), context())).statusCode, 503); assert.equal(slow.store.calls.length, 4);
});

test('late reads cannot write and uncertain committed writes are not retried or reported as saved', async () => {
  let elapsed = 0; const late = fixture({ monotonicNow: () => elapsed });
  late.store.intercept(() => { elapsed = 10000; return new Response('', { status: 404 }); });
  assert.equal((await late.handler(event(), context())).statusCode, 503); assert.equal(late.store.calls.filter(call => call.method === 'PUT').length, 0);
  for (const lateSuccess of [false, true]) {
    const store = storage(); elapsed = 0;
    const handler = createFeedbackHandler({ enabled: true, bucket: BUCKET, secret: SALT, now: () => START, monotonicNow: () => elapsed,
      fetcher: async (url, options) => {
        const response = await store.fetcher(url, options);
        if (options.method === 'PUT') { if (lateSuccess) elapsed = 10001; else throw Error(TOKEN); }
        return response;
      } });
    const result = await handler(event(), context()); assert.equal(result.statusCode, 503); assert.equal(json(result).error, 'feedback_unavailable');
    assert.equal(store.state().records.length, 1); assert.equal(store.calls.filter(call => call.method === 'PUT').length, 1);
  }
});
