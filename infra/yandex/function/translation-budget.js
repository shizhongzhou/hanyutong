'use strict';

const { createHmac, randomUUID } = require('node:crypto');

// Reserve before calling a billable service. Failed/uncertain requests are never
// refunded, so a timeout or process restart cannot accidentally exceed the cap.
const DEFAULT_LIMITS = Object.freeze({
  monthlyChars: 100000, monthlyImages: 300, monthlyRequests: 5000,
  dailyChars: 20000, dailyImages: 30, dailyRequests: 300,
  identityDailyChars: 5000, identityDailyImages: 10, identityDailyRequests: 30,
  identityMinuteRequests: 6
});
const MAX_IDENTITIES = 256, MAX_OBJECT_BYTES = 65536, MAX_ATTEMPTS = 5, RESERVATION_TIMEOUT_MS = 10000;
const PREFIX = 'app-private/translation-budget/';
const counts = () => ({ chars: 0, images: 0, requests: 0 });
const unavailable = () => Object.assign(new Error('Translation usage unavailable'), { statusCode: 503, error: 'usage_unavailable' });
const counter = value => Number.isSafeInteger(value) && value >= 0;
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

function period(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp < 0) throw unavailable();
  const date = new Date(timestamp + 3 * 3600000).toISOString().slice(0, 10); // Europe/Moscow
  return { month: date.slice(0, 7), date, minute: Math.floor(timestamp / 60000) };
}
function retryAt(timestamp, kind) {
  const { date, month } = period(timestamp);
  let end;
  if (kind === 'monthly_limit') {
    const [year, m] = month.split('-').map(Number);
    end = Date.UTC(year, m, 1) - 3 * 3600000;
  } else if (kind === 'daily_limit') end = Date.parse(date + 'T00:00:00+03:00') + 86400000;
  else end = (Math.floor(timestamp / 60000) + 1) * 60000;
  return Math.max(1, Math.ceil((end - timestamp) / 1000));
}
function validCounts(value) {
  return plainObject(value) && ['chars', 'images', 'requests'].every(k => counter(value[k]));
}
function validateState(state, p) {
  if (!plainObject(state) || state.version !== 1 || state.month !== p.month ||
      typeof state.revision !== 'string' || state.revision.length > 80 || !validCounts(state.total) ||
      !plainObject(state.day) || !/^\d{4}-\d{2}-\d{2}$/.test(state.day.date) ||
      !state.day.date.startsWith(p.month + '-') || state.day.date > p.date ||
      !validCounts(state.day) || !plainObject(state.day.identities)) throw unavailable();
  const entries = Object.entries(state.day.identities);
  if (entries.length > MAX_IDENTITIES) throw unavailable();
  const identityTotals = counts();
  for (const [id, item] of entries) {
    if (!/^[a-f0-9]{64}$/.test(id) || !validCounts(item) || !counter(item.minute) ||
        !counter(item.minuteRequests) || item.minuteRequests > item.requests) throw unavailable();
    for (const key of ['chars', 'images', 'requests']) {
      identityTotals[key] += item[key];
      if (!counter(identityTotals[key])) throw unavailable();
    }
  }
  for (const key of ['chars', 'images', 'requests']) {
    if (identityTotals[key] !== state.day[key] || state.total[key] < state.day[key]) throw unavailable();
  }
  return state;
}
async function readStateBody(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_OBJECT_BYTES)) {
    await response.body?.cancel?.(); throw unavailable();
  }
  const chunks = []; let bytes = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_OBJECT_BYTES) { await reader.cancel(); throw unavailable(); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  } else {
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > MAX_OBJECT_BYTES) throw unavailable();
    chunks.push(body);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw unavailable(); }
}

function createBudgetGuard({
  fetcher = fetch, token = () => '', bucket = process.env.TRANSLATION_BUDGET_BUCKET,
  secret = process.env.TRANSLATION_IDENTITY_SALT, now = () => Date.now(), monotonicNow = () => performance.now(),
  limits: configuredLimits = {}, pause = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const limits = { ...DEFAULT_LIMITS, ...configuredLimits };
  const validConfiguration = typeof bucket === 'string' && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
    !bucket.includes('..') && typeof token === 'function' && typeof now === 'function' && typeof monotonicNow === 'function' &&
    typeof fetcher === 'function' && typeof pause === 'function' &&
    Object.keys(limits).every(k => Object.hasOwn(DEFAULT_LIMITS, k) && Number.isSafeInteger(limits[k]) && limits[k] > 0 && limits[k] <= 10000000);
  return async function reserveUsage({ chars = 0, images = 0, identity = '' } = {}) {
    try {
      const deadline = monotonicNow() + RESERVATION_TIMEOUT_MS;
      const remaining = () => {
        const milliseconds = Math.ceil(deadline - monotonicNow());
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw unavailable();
        return milliseconds;
      };
      const salt = typeof secret === 'function' ? secret() : secret;
      if (!validConfiguration || typeof salt !== 'string' || salt.length < 32 ||
          !counter(chars) || !counter(images) || chars + images === 0 || chars > 2000 || images > 1 ||
          typeof identity !== 'string' || !identity || identity.length > 256) throw unavailable();
      const accessToken = await token();
      if (typeof accessToken !== 'string' || !accessToken || /[\r\n]/.test(accessToken)) throw unavailable();
      const hash = createHmac('sha256', salt).update(identity).digest('hex');
      const cost = { chars, images, requests: 1 };
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const timestamp = now(), p = period(timestamp);
        const url = `https://storage.yandexcloud.net/${bucket}/${PREFIX}${p.month}.json`;
        const auth = { Authorization: `Bearer ${accessToken}` };
        const loaded = await fetcher(url, { headers: auth, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        let state, etag;
        if (loaded.status === 404) {
          await loaded.body?.cancel?.();
          state = { version: 1, month: p.month, revision: '', total: counts(), day: { date: p.date, ...counts(), identities: {} } };
        } else {
          if (loaded.status !== 200) { await loaded.body?.cancel?.(); throw unavailable(); }
          etag = loaded.headers.get('etag');
          if (typeof etag !== 'string' || !/^"[a-fA-F0-9-]{1,96}"$/.test(etag)) { await loaded.body?.cancel?.(); throw unavailable(); }
          state = validateState(await readStateBody(loaded), p);
        }
        remaining();
        if (state.day.date < p.date) state.day = { date: p.date, ...counts(), identities: {} };
        let item = state.day.identities[hash];
        if (!item) {
          if (Object.keys(state.day.identities).length >= MAX_IDENTITIES) return { allowed: false, error: 'daily_limit', retryAfter: retryAt(timestamp, 'daily_limit') };
          item = { ...counts(), minute: p.minute, minuteRequests: 0 };
        }
        if (item.minute > p.minute) throw unavailable();
        if (item.minute < p.minute) { item.minute = p.minute; item.minuteRequests = 0; }
        const deny = error => ({ allowed: false, error, retryAfter: retryAt(timestamp, error) });
        if (item.minuteRequests >= limits.identityMinuteRequests) return deny('rate_limit');
        for (const key of ['chars', 'images', 'requests']) {
          const suffix = key[0].toUpperCase() + key.slice(1);
          if (state.total[key] + cost[key] > limits['monthly' + suffix]) return deny('monthly_limit');
          if (state.day[key] + cost[key] > limits['daily' + suffix] || item[key] + cost[key] > limits['identityDaily' + suffix]) return deny('daily_limit');
          state.total[key] += cost[key]; state.day[key] += cost[key]; item[key] += cost[key];
        }
        item.minuteRequests++; state.day.identities[hash] = item; state.revision = randomUUID();
        const body = JSON.stringify(state);
        if (Buffer.byteLength(body) > MAX_OBJECT_BYTES) throw unavailable();
        const saved = await fetcher(url, { method: 'PUT', headers: { ...auth,
          'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
          ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' })
        }, body, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        await saved.body?.cancel?.();
        remaining();
        if (saved.status === 200) return { allowed: true };
        if (![409, 412].includes(saved.status)) throw unavailable();
        if (attempt + 1 < MAX_ATTEMPTS) await pause(Math.min(15 + Math.floor(Math.random() * 25) + attempt * 20, remaining()));
      }
      throw unavailable();
    } catch (_) { throw unavailable(); }
  };
}

exports.createBudgetGuard = createBudgetGuard;
exports.DEFAULT_LIMITS = DEFAULT_LIMITS;
