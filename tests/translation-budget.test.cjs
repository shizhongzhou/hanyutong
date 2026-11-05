const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createBudgetGuard, DEFAULT_LIMITS } = require('../infra/yandex/function/translation-budget.js');

const BUCKET = 'hanyutong-test-private';
const SALT = 'test-only-identity-salt-32-characters';
const TOKEN = 'test-only-IAM-token';
const START = Date.parse('2026-11-05T12:00:00+03:00');
function storage() {
  const entries = new Map(), calls = [];
  let interceptor = null;
  const fetcher = async (url, options = {}) => {
    calls.push({ url, ...options });
    if (interceptor) { const reply = await interceptor(url, options); if (reply) return reply; }
    const current = entries.get(url);
    if (options.method !== 'PUT') return current ? new Response(current.body, { status: 200, headers: { ETag: current.etag } }) : new Response('', { status: 404 });
    const headers = options.headers;
    if ((headers['If-None-Match'] === '*' && current) || (headers['If-Match'] && headers['If-Match'] !== current?.etag)) return new Response('', { status: 412 });
    const body = options.body, etag = '"' + createHash('md5').update(body).digest('hex') + '"';
    entries.set(url, { body, etag }); return new Response('', { status: 200, headers: { ETag: etag } });
  };
  const state = () => JSON.parse([...entries.values()].at(-1).body);
  return { entries, calls, fetcher, state, intercept: fn => { interceptor = fn; } };
}
function fixture(options = {}) {
  const store = storage(); let clock = START;
  const reserve = createBudgetGuard({ fetcher: store.fetcher, token: () => TOKEN, bucket: BUCKET, secret: SALT,
    now: () => clock, pause: async () => {}, ...options });
  return { store, reserve, time: value => { clock = value; } };
}
const usageUnavailable = error => error.statusCode === 503 && error.error === 'usage_unavailable' && !error.message.includes(TOKEN);

test('usage reservations persist across handlers and contain only salted identities and counters', async () => {
  const { store, reserve } = fixture();
  assert.deepEqual(await reserve({ chars: 123, identity: '192.0.2.17' }), { allowed: true });
  const another = createBudgetGuard({ fetcher: store.fetcher, token: () => TOKEN, bucket: BUCKET, secret: SALT, now: () => START });
  assert.deepEqual(await another({ images: 1, identity: '192.0.2.17' }), { allowed: true });
  const value = store.state();
  assert.deepEqual(value.total, { chars: 123, images: 1, requests: 2 });
  assert.equal(Object.keys(value.day.identities).length, 1);
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, /192\.0\.2\.17|test-only|imageBase64|inputText/);
  assert.match(Object.keys(value.day.identities)[0], /^[a-f0-9]{64}$/);
  for (const call of store.calls) {
    assert.equal(call.headers.Authorization, 'Bearer ' + TOKEN);
    assert.equal(call.redirect, 'error'); assert.ok(call.signal);
    assert.equal(new URL(call.url).host, 'storage.yandexcloud.net');
  }
  const writes = store.calls.filter(call => call.method === 'PUT');
  assert.equal(writes[0].headers['If-None-Match'], '*');
  assert.match(writes[1].headers['If-Match'], /^"[a-f0-9]{32}"$/);
  assert.notEqual(JSON.parse(writes[0].body).revision, JSON.parse(writes[1].body).revision);
});

test('S3 reads request identity encoding for strong CAS validators and still reject weak ETags', async () => {
  const { store, reserve } = fixture();
  let forceWeak = false;
  store.intercept((url, options) => {
    if (options.method === 'PUT') return;
    const current = store.entries.get(url);
    // Yandex's compressed representation returns W/"..." instead of the
    // stored object's strong ETag. Model that negotiation, then a bad server.
    if (current && (forceWeak || options.headers['Accept-Encoding'] !== 'identity')) {
      return new Response(current.body, { headers: { ETag: 'W/' + current.etag } });
    }
  });
  assert.equal((await reserve({ chars: 10, identity: 'a' })).allowed, true);
  assert.equal((await reserve({ chars: 5, identity: 'a' })).allowed, true);
  assert.equal(store.state().total.chars, 15);
  for (const call of store.calls.filter(call => call.method !== 'PUT')) {
    assert.equal(call.headers['Accept-Encoding'], 'identity');
  }
  forceWeak = true;
  await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
  assert.equal(store.calls.filter(call => call.method === 'PUT').length, 2);
  assert.equal(store.state().total.chars, 15);
});

test('monthly, day and identity ceilings reject before any additional reservation is stored', async () => {
  for (const [limits, request, expected] of [
    [{ monthlyChars: 2000 }, { chars: 2000 }, 'monthly_limit'],
    [{ monthlyImages: 1 }, { images: 1 }, 'monthly_limit'],
    [{ monthlyRequests: 1 }, { chars: 1 }, 'monthly_limit'],
    [{ dailyChars: 2000 }, { chars: 2000 }, 'daily_limit'],
    [{ dailyImages: 1 }, { images: 1 }, 'daily_limit'],
    [{ dailyRequests: 1 }, { chars: 1 }, 'daily_limit'],
    [{ identityDailyChars: 2000 }, { chars: 2000 }, 'daily_limit'],
    [{ identityDailyImages: 1 }, { images: 1 }, 'daily_limit'],
    [{ identityDailyRequests: 1 }, { chars: 1 }, 'daily_limit']
  ]) {
    const { store, reserve } = fixture({ limits });
    assert.equal((await reserve({ ...request, identity: 'user' })).allowed, true);
    const snapshot = store.state();
    const denied = await reserve({ ...request, identity: 'user' });
    assert.equal(denied.allowed, false); assert.equal(denied.error, expected); assert.ok(denied.retryAfter > 0);
    assert.deepEqual(store.state(), snapshot);
  }
});

test('per-identity minute limit resets on the next minute without losing daily charges', async () => {
  const { store, reserve, time } = fixture();
  for (let i = 0; i < DEFAULT_LIMITS.identityMinuteRequests; i++) assert.equal((await reserve({ chars: 1, identity: 'a' })).allowed, true);
  const blocked = await reserve({ chars: 1, identity: 'a' });
  assert.equal(blocked.error, 'rate_limit'); assert.equal(blocked.retryAfter, 60);
  assert.equal((await reserve({ chars: 1, identity: 'b' })).allowed, true);
  time(START + 60000);
  assert.equal((await reserve({ chars: 1, identity: 'a' })).allowed, true);
  assert.equal(store.state().total.chars, 8);
});

test('compare-and-swap handles concurrent readers without exceeding a global cap', async () => {
  const { store, reserve } = fixture({ limits: { monthlyChars: 3000 } });
  let seen = 0, release; const bothRead = new Promise(resolve => { release = resolve; });
  store.intercept(async (_url, options) => {
    if (options.method !== 'PUT' && seen < 2) {
      seen++; if (seen === 2) release(); await bothRead;
      return new Response('', { status: 404 });
    }
  });
  const results = await Promise.all([reserve({ chars: 2000, identity: 'a' }), reserve({ chars: 2000, identity: 'b' })]);
  assert.equal(results.filter(r => r.allowed).length, 1);
  assert.equal(results.filter(r => r.error === 'monthly_limit').length, 1);
  assert.equal(store.state().total.chars, 2000);
  assert.equal(store.state().total.requests, 1);
  assert.equal(store.calls.filter(c => c.method === 'PUT').length, 2);
});

test('repeated write conflicts stop after five attempts and fail closed', async () => {
  const { store, reserve } = fixture();
  store.intercept((_url, options) => options.method === 'PUT' ? new Response('', { status: 409 }) : null);
  await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
  assert.equal(store.calls.filter(c => c.method === 'PUT').length, 5);
  assert.equal(store.entries.size, 0);
});

test('a single ten-second deadline bounds all retry attempts and prevents late writes', async () => {
  let elapsed = 0;
  const { store, reserve } = fixture({ monotonicNow: () => elapsed });
  store.intercept((_url, options) => {
    elapsed += 3000;
    if (options.method === 'PUT') return new Response('', { status: 412 });
    return new Response('', { status: 404 });
  });
  await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
  // Four operations reached the deadline; the remaining three attempts do not run.
  assert.equal(store.calls.length, 4);
  assert.equal(store.entries.size, 0);

  let readTime = 0;
  const slowRead = fixture({ monotonicNow: () => readTime });
  slowRead.store.intercept(() => { readTime = 10000; return new Response('', { status: 404 }); });
  await assert.rejects(slowRead.reserve({ chars: 1, identity: 'a' }), usageUnavailable);
  assert.equal(slowRead.store.calls.filter(call => call.method === 'PUT').length, 0);
});

test('a committed reservation arriving after its deadline stays charged but is not allowed or retried', async () => {
  const store = storage(); let elapsed = 0;
  const fetcher = async (url, options) => {
    const result = await store.fetcher(url, options);
    if (options.method === 'PUT') elapsed = 10000;
    return result;
  };
  const reserve = createBudgetGuard({ fetcher, bucket: BUCKET, token: () => TOKEN, secret: SALT,
    now: () => START, monotonicNow: () => elapsed });
  await assert.rejects(reserve({ images: 1, identity: 'a' }), usageUnavailable);
  assert.equal(store.state().total.images, 1);
  assert.equal(store.calls.filter(call => call.method === 'PUT').length, 1);
});

test('uncertain successful writes remain charged and are never retried or refunded', async () => {
  const store = storage(); let failAfterWrite = true;
  const fetcher = async (url, options) => {
    const result = await store.fetcher(url, options);
    if (options.method === 'PUT' && failAfterWrite) { failAfterWrite = false; throw Error('connection lost after server committed'); }
    return result;
  };
  const reserve = createBudgetGuard({ fetcher, bucket: BUCKET, token: () => TOKEN, secret: SALT, now: () => START, limits: { monthlyImages: 1 } });
  await assert.rejects(reserve({ images: 1, identity: 'a' }), usageUnavailable);
  assert.equal(store.state().total.images, 1);
  const second = await reserve({ images: 1, identity: 'a' });
  assert.equal(second.error, 'monthly_limit');
  assert.equal(store.calls.filter(c => c.method === 'PUT').length, 1);
});

test('Moscow midnight resets daily counters while preserving month totals, and month rollover uses a separate object', async () => {
  const { store, reserve, time } = fixture({ limits: { identityDailyImages: 1 } });
  time(Date.parse('2026-11-30T20:59:30Z'));
  assert.equal((await reserve({ images: 1, identity: 'a' })).allowed, true);
  assert.equal(store.state().day.date, '2026-11-30');
  time(Date.parse('2026-11-30T21:00:00Z'));
  assert.equal((await reserve({ images: 1, identity: 'a' })).allowed, true);
  assert.equal(store.entries.size, 2); assert.equal(store.state().day.date, '2026-12-01');
  assert.equal(store.state().total.images, 1);
  time(Date.parse('2026-12-01T21:00:00Z'));
  assert.equal((await reserve({ images: 1, identity: 'a' })).allowed, true);
  assert.equal(store.state().total.images, 2); assert.equal(store.state().day.images, 1);
});

test('corrupt state, missing ETag, server errors, oversized bodies and backwards clocks fail closed', async () => {
  for (const badResponse of [
    () => new Response('not JSON', { headers: { etag: '"abc"' } }),
    () => new Response('{}'),
    () => new Response('{}', { status: 403 }),
    () => new Response('{}', { status: 500 }),
    () => new Response('{}', { headers: { etag: '"abc"', 'content-length': '999999' } }),
    () => new Response(' '.repeat(70000), { headers: { etag: '"abc"' } })
  ]) {
    const { store, reserve } = fixture(); store.intercept(badResponse);
    await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
    assert.equal(store.calls.filter(c => c.method === 'PUT').length, 0);
  }
  const { store, reserve, time } = fixture();
  await reserve({ chars: 1, identity: 'a' });
  time(START - 86400000);
  await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
  assert.equal(store.state().total.chars, 1);
});

test('invalid configuration or usage never reaches storage', async () => {
  for (const options of [{ bucket: '../other' }, { bucket: 'x/evil' }, { secret: 'short' }, { token: () => '' }, { limits: { monthlyChars: 0 } }, { limits: { unknown: 1 } }, { limits: { monthlyImages: '300' } }]) {
    const { store, reserve } = fixture(options);
    await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
    assert.equal(store.calls.length, 0);
  }
  for (const usage of [{}, { chars: -1, identity: 'a' }, { chars: 1.5, identity: 'a' }, { chars: 2001, identity: 'a' }, { images: 2, identity: 'a' }, { chars: 1 }, { chars: 1, identity: 'a'.repeat(257) }]) {
    const { store, reserve } = fixture();
    await assert.rejects(reserve(usage), usageUnavailable); assert.equal(store.calls.length, 0);
  }
});

test('a bounded identity set rejects excess callers without unbounded object growth', async () => {
  const { store, reserve } = fixture();
  for (let i = 0; i < 256; i++) assert.equal((await reserve({ chars: 1, identity: 'caller-' + i })).allowed, true);
  assert.equal((await reserve({ chars: 1, identity: 'caller-256' })).error, 'daily_limit');
  assert.equal(Object.keys(store.state().day.identities).length, 256);
  assert.ok(Buffer.byteLength([...store.entries.values()][0].body) < 65536);
  assert.equal((await reserve({ chars: 1, identity: 'caller-0' })).allowed, true);
});

test('inconsistent counters and unsafe numeric values are not silently reset', async () => {
  for (const damage of [
    state => { state.total.chars = -1; },
    state => { state.total.chars = Number.MAX_SAFE_INTEGER + 1; },
    state => { state.day.chars = 0; },
    state => { state.month = '2026-10'; },
    state => { state.day.identities = []; },
    state => { const item = Object.values(state.day.identities)[0]; item.minuteRequests = 99; }
  ]) {
    const { store, reserve } = fixture(); await reserve({ chars: 1, identity: 'a' });
    const [url, current] = [...store.entries.entries()][0], broken = JSON.parse(current.body); damage(broken);
    store.entries.set(url, { ...current, body: JSON.stringify(broken) });
    await assert.rejects(reserve({ chars: 1, identity: 'a' }), usageUnavailable);
    assert.equal(store.calls.filter(c => c.method === 'PUT').length, 1);
  }
});
