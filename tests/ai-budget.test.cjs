const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createAIBudgetGuard, quoteAICost, DEFAULT_LIMITS, OPERATIONS } = require('../infra/yandex/function/ai-budget.js');
const BUCKET = 'hanyutong-test-private', SALT = 'test-only-identity-salt-32-characters', TOKEN = 'test-only-IAM-token';
const START = Date.parse('2026-11-06T12:00:00+03:00');
const usage = (operation = 'chat', costMicroRubles = 100, identity = '192.0.2.17') => ({ operation, costMicroRubles, identity });
const usageUnavailable = error => error.statusCode === 503 && error.error === 'usage_unavailable' && !error.message.includes(TOKEN);
function storage() {
  const entries = new Map(), calls = []; let interceptor = null;
  const fetcher = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (interceptor) { const reply = await interceptor(url, options); if (reply) return reply; }
    const current = entries.get(url);
    if (options.method !== 'PUT') return current ? new Response(current.body, { headers: { ETag: current.etag } }) : new Response('', { status: 404 });
    if ((options.headers['If-None-Match'] === '*' && current) || (options.headers['If-Match'] && options.headers['If-Match'] !== current?.etag)) return new Response('', { status: 412 });
    const body = options.body, etag = '"' + createHash('md5').update(body).digest('hex') + '"';
    entries.set(url, { body, etag }); return new Response('', { status: 200 });
  };
  return { entries, calls, fetcher, state: () => JSON.parse([...entries.values()].at(-1).body), intercept: fn => { interceptor = fn; } };
}
function fixture(options = {}) {
  const store = storage(); let clock = START;
  const reserve = createAIBudgetGuard({ fetcher: store.fetcher, token: () => TOKEN, bucket: BUCKET, secret: SALT, now: () => clock, pause: async () => {}, ...options });
  return { store, reserve, time: value => { clock = value; } };
}

test('all AI operations share durable monetary caps across cold starts without storing content or raw identities', async () => {
  const { store, reserve } = fixture();
  await reserve(usage());
  for (const operation of ['vision', 'tts', 'asr']) {
    const another = createAIBudgetGuard({ fetcher: store.fetcher, token: () => TOKEN, bucket: BUCKET, secret: SALT, now: () => START });
    assert.deepEqual(await another(usage(operation)), { allowed: true });
  }
  const value = store.state();
  assert.deepEqual(value.total, { microRubles: 400, requests: 4, chat: 1, vision: 1, tts: 1, asr: 1, assessment: 0 });
  assert.equal(Object.keys(value.day.identities).length, 1);
  assert.doesNotMatch(JSON.stringify(value), /192\.0\.2\.17|test-only|messages|inputText|imageBase64|audio/);
  assert.match(Object.keys(value.day.identities)[0], /^[a-f0-9]{64}$/);
  const writes = store.calls.filter(call => call.method === 'PUT');
  assert.equal(writes[0].headers['If-None-Match'], '*');
  assert.match(writes[1].headers['If-Match'], /^"[a-f0-9]{32}"$/);
  assert.notEqual(JSON.parse(writes[0].body).revision, JSON.parse(writes[1].body).revision);
  for (const call of store.calls) {
    assert.equal(call.headers.Authorization, 'Bearer ' + TOKEN); assert.equal(call.redirect, 'error'); assert.ok(call.signal);
    assert.equal(new URL(call.url).pathname, '/' + BUCKET + '/app-private/ai-budget/2026-11.json');
  }
});

test('reservations use checked model ceilings, UTF-8 input bounds, Han billing units and conservative exchange overhead', () => {
  assert.equal(quoteAICost('chat', { inputBytes: 1000, outputTokens: 700 }), Math.ceil(((1000 + 1024) * 60 + 700 * 240) * 1.1));
  assert.equal(quoteAICost('vision', { inputTokens: 11000, outputTokens: 1200 }), 2816000);
  assert.equal(quoteAICost('tts', { characters: 1000 }), 2530000);
  assert.equal(quoteAICost('asr', { audioSeconds: 30 }), 231000);
  assert.equal(quoteAICost('assessment', { inputBytes: 1000, outputTokens: 2000 }), Math.ceil(((1000 + 1024) * 264 + 2000 * 792) * 1.1));
  for (const [operation, units] of [['chat', { inputBytes: 0, outputTokens: 700 }], ['chat', { inputBytes: 65537, outputTokens: 700 }],
    ['chat', { inputBytes: 100, outputTokens: 1201 }], ['assessment', { inputBytes: 100, outputTokens: 2001 }],
    ['assessment', { inputBytes: 65537, outputTokens: 2000 }], ['vision', { inputTokens: 100001, outputTokens: 1 }], ['vision', { inputTokens: 1, outputTokens: 20001 }],
    ['tts', { characters: 1001 }], ['asr', { audioSeconds: 30.5 }], ['asr', { audioSeconds: 31 }], ['unknown', {}]]) {
    assert.throws(() => quoteAICost(operation, units), usageUnavailable);
  }
});

test('monthly monetary cap is shared across different operations under competing concurrent requests', async () => {
  const { store, reserve } = fixture({ limits: { monthlyMicroRubles: 150 } });
  let seen = 0, release; const bothRead = new Promise(resolve => { release = resolve; });
  store.intercept(async (_url, options) => {
    if (options.method !== 'PUT' && seen < 2) { seen++; if (seen === 2) release(); await bothRead; return new Response('', { status: 404 }); }
  });
  const results = await Promise.all([reserve(usage('chat', 100, 'a')), reserve(usage('vision', 100, 'b'))]);
  assert.equal(results.filter(r => r.allowed).length, 1); assert.equal(results.filter(r => r.error === 'monthly_limit').length, 1);
  assert.equal(store.state().total.microRubles, 100); assert.equal(store.state().total.requests, 1);
  assert.equal(store.calls.filter(c => c.method === 'PUT').length, 2);
});

test('default identity budget allows a photo followed by chat and stops exactly at six rubles while the global day cap stays ten', async () => {
  const { store, reserve } = fixture();
  assert.equal(DEFAULT_LIMITS.identityDailyMicroRubles, 6000000);
  assert.equal(DEFAULT_LIMITS.dailyMicroRubles, 10000000);
  assert.equal(DEFAULT_LIMITS.monthlyMicroRubles, 70000000);
  const photo = quoteAICost('vision', { inputTokens: 11000, outputTokens: 1200 });
  const chat = quoteAICost('chat', { inputBytes: 1000, outputTokens: 700 });
  assert.equal((await reserve(usage('vision', photo, 'a'))).allowed, true);
  assert.equal((await reserve(usage('chat', chat, 'a'))).allowed, true);
  assert.equal((await reserve(usage('chat', 6000000 - photo - chat, 'a'))).allowed, true);
  assert.equal(store.state().total.microRubles, 6000000);
  assert.equal((await reserve(usage('chat', 1, 'a'))).error, 'daily_limit');
  assert.equal((await reserve(usage('chat', 4000000, 'b'))).allowed, true);
  assert.equal(store.state().total.microRubles, 10000000);
  assert.equal((await reserve(usage('chat', 1, 'b'))).error, 'daily_limit');
  assert.equal(store.state().total.microRubles, 10000000);
});

test('monetary, count and per-operation caps deny before storing another reservation', async () => {
  const cases = [[{ monthlyMicroRubles: 100 }, 'monthly_limit'], [{ dailyMicroRubles: 100 }, 'daily_limit'], [{ identityDailyMicroRubles: 100 }, 'daily_limit'],
    [{ monthlyRequests: 1 }, 'monthly_limit'], [{ dailyRequests: 1 }, 'daily_limit'], [{ identityDailyRequests: 1 }, 'daily_limit'],
    [{ monthlyChat: 1 }, 'monthly_limit'], [{ monthlyVision: 1 }, 'monthly_limit', 'vision'], [{ monthlyTts: 1 }, 'monthly_limit', 'tts'],
    [{ monthlyAsr: 1 }, 'monthly_limit', 'asr'], [{ monthlyAssessment: 1 }, 'monthly_limit', 'assessment']];
  for (const [limits, expected, operation = 'chat'] of cases) {
    const { store, reserve } = fixture({ limits }); await reserve(usage(operation)); const snapshot = store.state();
    const result = await reserve(usage(operation));
    assert.equal(result.error, expected); assert.equal(result.allowed, false); assert.ok(result.retryAfter > 0);
    assert.deepEqual(store.state(), snapshot);
  }
});

test('shared minute rate limit resets without resetting daily costs', async () => {
  const { store, reserve, time } = fixture();
  for (const operation of OPERATIONS.slice(0, DEFAULT_LIMITS.identityMinuteRequests)) assert.equal((await reserve(usage(operation))).allowed, true);
  assert.equal(DEFAULT_LIMITS.identityMinuteRequests, 4);
  const result = await reserve(usage()); assert.equal(result.error, 'rate_limit'); assert.equal(result.retryAfter, 60);
  assert.equal((await reserve(usage('chat', 100, 'another'))).allowed, true);
  time(START + 60000); assert.equal((await reserve(usage())).allowed, true);
  assert.equal(store.state().total.microRubles, 600); assert.equal(store.state().total.requests, 6);
});

test('Moscow day rollover clears per-day charges and month rollover creates a separate durable object', async () => {
  const { store, reserve, time } = fixture({ limits: { identityDailyMicroRubles: 100 } });
  await reserve(usage()); assert.equal((await reserve(usage())).error, 'daily_limit');
  time(Date.parse('2026-11-06T21:00:00Z')); assert.equal((await reserve(usage())).allowed, true);
  assert.equal(store.state().day.date, '2026-11-07'); assert.equal(store.state().day.microRubles, 100); assert.equal(store.state().total.microRubles, 200);
  time(Date.parse('2026-11-30T21:00:00Z')); assert.equal((await reserve(usage())).allowed, true);
  assert.equal(store.entries.size, 2); assert.equal(store.state().month, '2026-12'); assert.equal(store.state().total.microRubles, 100);
});

test('strong CAS reads explicitly request identity encoding and reject weak ETags', async () => {
  const { store, reserve } = fixture(); let weak = false;
  store.intercept((url, options) => {
    const current = store.entries.get(url);
    if (options.method !== 'PUT' && current && (weak || options.headers['Accept-Encoding'] !== 'identity')) return new Response(current.body, { headers: { ETag: 'W/' + current.etag } });
  });
  await reserve(usage()); await reserve(usage());
  weak = true; await assert.rejects(reserve(usage()), usageUnavailable);
  assert.equal(store.state().total.requests, 2);
  for (const call of store.calls.filter(c => c.method !== 'PUT')) assert.equal(call.headers['Accept-Encoding'], 'identity');
});

test('repeated conflicts stop after five attempts without making usage available', async () => {
  const { store, reserve } = fixture(); store.intercept((_url, options) => options.method === 'PUT' ? new Response('', { status: 409 }) : null);
  await assert.rejects(reserve(usage()), usageUnavailable);
  assert.equal(store.calls.filter(c => c.method === 'PUT').length, 5); assert.equal(store.entries.size, 0);
});

test('all retry attempts share one ten-second deadline and never write after a late read', async () => {
  let elapsed = 0;
  const { store, reserve } = fixture({ monotonicNow: () => elapsed });
  store.intercept((_url, options) => { elapsed += 3000; return new Response('', { status: options.method === 'PUT' ? 412 : 404 }); });
  await assert.rejects(reserve(usage()), usageUnavailable); assert.equal(store.calls.length, 4); assert.equal(store.entries.size, 0);
  let late = 0; const slow = fixture({ monotonicNow: () => late });
  slow.store.intercept(() => { late = 10000; return new Response('', { status: 404 }); });
  await assert.rejects(slow.reserve(usage()), usageUnavailable); assert.equal(slow.store.calls.filter(c => c.method === 'PUT').length, 0);
});

test('a committed write arriving late stays charged but does not authorize a provider call or retry', async () => {
  const store = storage(); let elapsed = 0;
  const reserve = createAIBudgetGuard({ bucket: BUCKET, secret: SALT, token: () => TOKEN, now: () => START, monotonicNow: () => elapsed,
    fetcher: async (url, options) => { const response = await store.fetcher(url, options); if (options.method === 'PUT') elapsed = 10001; return response; } });
  await assert.rejects(reserve(usage()), usageUnavailable);
  assert.equal(store.state().total.microRubles, 100); assert.equal(store.calls.filter(c => c.method === 'PUT').length, 1);
});

test('an uncertain committed network write remains charged and is not retried', async () => {
  const store = storage();
  const reserve = createAIBudgetGuard({ bucket: BUCKET, secret: SALT, token: () => TOKEN, now: () => START,
    fetcher: async (url, options) => { const response = await store.fetcher(url, options); if (options.method === 'PUT') throw Error(TOKEN); return response; } });
  await assert.rejects(reserve(usage()), usageUnavailable);
  assert.equal(store.state().total.requests, 1); assert.equal(store.calls.filter(c => c.method === 'PUT').length, 1);
});

test('invalid configuration and untrusted reservation units fail closed before storage access', async () => {
  for (const options of [{ bucket: '../other' }, { secret: 'short' }, { token: () => '' }, { token: () => 'bad\n' }, { limits: { monthlyMicroRubles: -1 } }, { limits: { unknown: 10 } }]) {
    const { reserve, store } = fixture(options); await assert.rejects(reserve(usage()), usageUnavailable); assert.equal(store.calls.length, 0);
  }
  const { reserve, store } = fixture();
  for (const bad of [undefined, {}, usage('unknown'), usage('chat', 0), usage('chat', -1), usage('chat', 0.5), usage('chat', 30000001), usage('chat', 100, ''), usage('chat', 100, 'x'.repeat(257))]) {
    await assert.rejects(reserve(bad), usageUnavailable);
  }
  assert.equal(store.calls.length, 0);
});

test('malformed or inconsistent persisted counters fail closed without overwriting usage', async () => {
  const mutations = [s => { s.version = 3; }, s => { s.month = '2026-12'; }, s => { s.total.microRubles = -1; },
    s => { s.total.requests++; }, s => { s.day.microRubles++; }, s => { s.total.chat = 0; }, s => { s.day.date = '2026-11-31'; }, s => { s.day.date = '2026-11-00'; },
    s => { s.day.identities.bad = {}; }, s => { Object.values(s.day.identities)[0].minuteRequests = 9; },
    s => { Object.values(s.day.identities)[0].minute += 1; }, s => { Object.values(s.day.identities)[0].microRubles = 0; }];
  for (const mutate of mutations) {
    const { store, reserve } = fixture(); await reserve(usage());
    const current = [...store.entries.values()][0], altered = JSON.parse(current.body); mutate(altered); current.body = JSON.stringify(altered);
    await assert.rejects(reserve(usage()), usageUnavailable);
    assert.equal(store.calls.filter(c => c.method === 'PUT').length, 1); assert.equal(current.body, JSON.stringify(altered));
  }
});

test('legacy v1 ledgers migrate atomically without resetting spent money, request counts or rate limits', async () => {
  const { store, reserve } = fixture(); await reserve(usage('chat', 100));
  const stored = [...store.entries.values()][0], legacy = JSON.parse(stored.body);
  legacy.version = 1;
  for (const counters of [legacy.total, legacy.day, ...Object.values(legacy.day.identities)]) delete counters.assessment;
  stored.body = JSON.stringify(legacy);
  assert.equal((await reserve(usage('assessment', 250))).allowed, true);
  const state = store.state();
  assert.equal(state.version, 2);
  assert.deepEqual(state.total, { microRubles: 350, requests: 2, chat: 1, vision: 0, tts: 0, asr: 0, assessment: 1 });
  assert.equal(Object.values(state.day.identities)[0].minuteRequests, 2);
  const current = [...store.entries.values()][0], invalid = JSON.parse(current.body); invalid.version = 1;
  current.body = JSON.stringify(invalid);
  await assert.rejects(reserve(usage()), usageUnavailable);
});

test('storage failures, missing ETags and oversized objects cannot reset a budget', async () => {
  for (const response of [new Response('denied', { status: 403 }), new Response('{}'), new Response('{}', { headers: { ETag: '"bad"', 'Content-Length': '65537' } }),
    new Response('x'.repeat(65537), { headers: { ETag: '"bad"' } }), new Response('{', { headers: { ETag: '"bad"' } })]) {
    const { store, reserve } = fixture(); store.intercept(() => response);
    await assert.rejects(reserve(usage()), usageUnavailable); assert.equal(store.calls.filter(c => c.method === 'PUT').length, 0);
  }
});

test('the durable identity set remains bounded without replacing existing callers or losing charges', async () => {
  const { store, reserve } = fixture({ limits: { dailyRequests: 300 } });
  for (let i = 0; i < 256; i++) assert.equal((await reserve(usage('chat', 1, 'identity-' + i))).allowed, true);
  const snapshot = store.state();
  assert.equal(Object.keys(snapshot.day.identities).length, 256);
  assert.equal((await reserve(usage('chat', 1, 'another-identity'))).error, 'daily_limit');
  assert.deepEqual(store.state(), snapshot);
  assert.equal((await reserve(usage('chat', 1, 'identity-0'))).allowed, true);
  assert.equal(store.state().total.microRubles, 257);
});
