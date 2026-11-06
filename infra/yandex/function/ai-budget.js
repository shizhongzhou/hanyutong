'use strict';

const { createHmac, randomUUID } = require('node:crypto');

// These are conservative reservations, not billing reports. Provider failures
// and uncertain writes remain charged; no retry/refund can exceed the cap.
const DEFAULT_LIMITS = Object.freeze({
  monthlyMicroRubles: 70000000, dailyMicroRubles: 10000000, identityDailyMicroRubles: 6000000,
  monthlyRequests: 1000, dailyRequests: 100, identityDailyRequests: 30, identityMinuteRequests: 4,
  monthlyChat: 500, monthlyVision: 100, monthlyTts: 200, monthlyAsr: 100, monthlyAssessment: 20
});
const OPERATIONS = Object.freeze(['chat', 'vision', 'tts', 'asr', 'assessment']);
const KEYS = Object.freeze(['microRubles', 'requests', ...OPERATIONS]);
const MAX_IDENTITIES = 256, MAX_OBJECT_BYTES = 65536, MAX_ATTEMPTS = 5;
const PREFIX = 'app-private/ai-budget/';
const counts = () => Object.fromEntries(KEYS.map(key => [key, 0]));
const counter = value => Number.isSafeInteger(value) && value >= 0;
const plainObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const unavailable = () => Object.assign(new Error('AI usage unavailable'), { statusCode: 503, error: 'usage_unavailable' });

// Prices checked 2026-11-06: DeepSeek Flash peak $0.30/$1.20 per 1M
// input/output tokens; DeepSeek V4 Pro peak $1.32/$3.96 per 1M;
// Yandex Qwen 3.6 35B 0.2/0.3 RUB per 1K tokens;
// Qwen TTS up to $0.114682/10K characters; ASR up to $0.000035/second.
// USD reservations use 200 RUB/USD plus 10% headroom. Recheck these assumptions
// when changing models/prices. Token input bounds must include image tokens.
function quoteAICost(operation, units = {}) {
  const positive = (value, maximum) => Number.isSafeInteger(value) && value > 0 && value <= maximum;
  let cost;
  if (operation === 'chat' && positive(units.inputBytes, 65536) && positive(units.outputTokens, 1200)) {
    // A UTF-8 byte bound plus message/special-token overhead is conservative;
    // never estimate Chinese or Russian token counts by dividing characters.
    cost = (units.inputBytes + 1024) * 60 + units.outputTokens * 240;
  } else if (operation === 'assessment' && positive(units.inputBytes, 65536) && positive(units.outputTokens, 2000)) {
    // Thinking and visible output share this maximum generated-token bound.
    cost = (units.inputBytes + 1024) * 264 + units.outputTokens * 792;
  } else if (operation === 'vision' && positive(units.inputTokens, 100000) && positive(units.outputTokens, 20000)) {
    cost = units.inputTokens * 200 + units.outputTokens * 300;
  } else if (operation === 'tts' && positive(units.characters, 1000)) {
    // Billable characters: Han characters count twice. The handler separately
    // limits the submitted text to 300 code points.
    cost = units.characters * 2300;
  } else if (operation === 'asr' && positive(units.audioSeconds, 30)) {
    cost = units.audioSeconds * 7000;
  } else throw unavailable();
  return Math.ceil(cost * 11 / 10);
}

function period(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp < 0) throw unavailable();
  const date = new Date(timestamp + 3 * 3600000).toISOString().slice(0, 10);
  return { month: date.slice(0, 7), date, minute: Math.floor(timestamp / 60000) };
}
function retryAt(timestamp, kind) {
  const p = period(timestamp);
  const [year, month] = p.month.split('-').map(Number);
  const end = kind === 'monthly_limit' ? Date.UTC(year, month, 1) - 3 * 3600000
    : kind === 'daily_limit' ? Date.parse(p.date + 'T00:00:00+03:00') + 86400000
      : (p.minute + 1) * 60000;
  return Math.max(1, Math.ceil((end - timestamp) / 1000));
}
function validCounts(value) {
  if (!plainObject(value) || !KEYS.every(key => counter(value[key]))) return false;
  const requests = OPERATIONS.reduce((sum, op) => sum + value[op], 0);
  return counter(requests) && requests === value.requests &&
    (value.requests === 0 ? value.microRubles === 0 : value.microRubles >= value.requests);
}
function validateState(state, p) {
  if (!plainObject(state)) throw unavailable();
  if (state.version === 1) {
    // Preserve existing money and counts when introducing assessment. A mixed
    // or partially migrated legacy object is corrupt; never reset its budget.
    if (!plainObject(state.day) || !plainObject(state.day.identities)) throw unavailable();
    for (const item of [state.total, state.day, ...Object.values(state.day.identities)]) {
      if (!plainObject(item) || Object.hasOwn(item, 'assessment')) throw unavailable();
      item.assessment = 0;
    }
    state.version = 2;
  }
  if (state.version !== 2 || state.month !== p.month ||
      typeof state.revision !== 'string' || state.revision.length > 80 || !validCounts(state.total) ||
      !plainObject(state.day) || !/^\d{4}-\d{2}-\d{2}$/.test(state.day.date) ||
      !state.day.date.startsWith(p.month + '-') || state.day.date > p.date ||
      !validCounts(state.day) || !plainObject(state.day.identities)) throw unavailable();
  const dayTime = Date.parse(state.day.date + 'T00:00:00Z');
  if (!Number.isFinite(dayTime) || new Date(dayTime).toISOString().slice(0, 10) !== state.day.date) throw unavailable();
  const entries = Object.entries(state.day.identities), sums = counts();
  if (entries.length > MAX_IDENTITIES) throw unavailable();
  for (const [identity, item] of entries) {
    if (!/^[a-f0-9]{64}$/.test(identity) || !validCounts(item) || !counter(item.minute) || item.minute > p.minute ||
        !counter(item.minuteRequests) || item.minuteRequests > item.requests) throw unavailable();
    for (const key of KEYS) {
      sums[key] += item[key];
      if (!counter(sums[key])) throw unavailable();
    }
  }
  for (const key of KEYS) if (sums[key] !== state.day[key] || state.total[key] < state.day[key]) throw unavailable();
  return state;
}
async function readState(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_OBJECT_BYTES)) {
    await response.body?.cancel?.(); throw unavailable();
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw unavailable();
  const chunks = []; let lengthRead = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      lengthRead += value.byteLength;
      if (lengthRead > MAX_OBJECT_BYTES) { await reader.cancel(); throw unavailable(); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw unavailable(); }
}

function createAIBudgetGuard({
  fetcher = fetch, token = () => '', bucket = process.env.AI_BUDGET_BUCKET || process.env.TRANSLATION_BUDGET_BUCKET,
  secret = process.env.AI_IDENTITY_SALT || process.env.TRANSLATION_IDENTITY_SALT,
  now = () => Date.now(), monotonicNow = () => performance.now(), limits: configuredLimits = {},
  pause = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  const limits = { ...DEFAULT_LIMITS, ...configuredLimits };
  const validConfiguration = typeof bucket === 'string' && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) && !bucket.includes('..') &&
    [token, fetcher, now, monotonicNow, pause].every(value => typeof value === 'function') &&
    Object.keys(limits).every(key => Object.hasOwn(DEFAULT_LIMITS, key) && Number.isSafeInteger(limits[key]) && limits[key] > 0 && limits[key] <= 1000000000);
  return async ({ operation, costMicroRubles, identity } = {}) => {
    try {
      const deadline = monotonicNow() + 10000;
      const remaining = () => {
        const ms = Math.ceil(deadline - monotonicNow());
        if (!Number.isFinite(ms) || ms <= 0) throw unavailable();
        return ms;
      };
      const salt = typeof secret === 'function' ? secret() : secret;
      if (!validConfiguration || typeof salt !== 'string' || salt.length < 32 || !OPERATIONS.includes(operation) ||
          !Number.isSafeInteger(costMicroRubles) || costMicroRubles <= 0 || costMicroRubles > 30000000 ||
          typeof identity !== 'string' || !identity || identity.length > 256) throw unavailable();
      const accessToken = await token();
      if (typeof accessToken !== 'string' || !accessToken || /[\r\n]/.test(accessToken)) throw unavailable();
      const hash = createHmac('sha256', salt).update('ai:' + identity).digest('hex');
      const cost = { ...counts(), microRubles: costMicroRubles, requests: 1, [operation]: 1 };
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const timestamp = now(), p = period(timestamp), url = `https://storage.yandexcloud.net/${bucket}/${PREFIX}${p.month}.json`;
        const auth = { Authorization: 'Bearer ' + accessToken };
        const loaded = await fetcher(url, { headers: { ...auth, 'Accept-Encoding': 'identity' }, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        let state, etag;
        if (loaded.status === 404) {
          await loaded.body?.cancel?.();
          state = { version: 2, month: p.month, revision: '', total: counts(), day: { date: p.date, ...counts(), identities: {} } };
        } else {
          if (loaded.status !== 200) { await loaded.body?.cancel?.(); throw unavailable(); }
          etag = loaded.headers.get('etag');
          if (typeof etag !== 'string' || !/^"[a-fA-F0-9-]{1,96}"$/.test(etag)) { await loaded.body?.cancel?.(); throw unavailable(); }
          state = validateState(await readState(loaded), p);
        }
        remaining();
        if (state.day.date < p.date) state.day = { date: p.date, ...counts(), identities: {} };
        const deny = error => ({ allowed: false, error, retryAfter: retryAt(timestamp, error) });
        let item = state.day.identities[hash];
        if (!item) {
          if (Object.keys(state.day.identities).length >= MAX_IDENTITIES) return deny('daily_limit');
          item = { ...counts(), minute: p.minute, minuteRequests: 0 };
        }
        if (item.minute > p.minute) throw unavailable();
        if (item.minute < p.minute) { item.minute = p.minute; item.minuteRequests = 0; }
        if (item.minuteRequests >= limits.identityMinuteRequests) return deny('rate_limit');
        for (const key of ['microRubles', 'requests']) {
          const suffix = key[0].toUpperCase() + key.slice(1);
          if (state.total[key] + cost[key] > limits['monthly' + suffix]) return deny('monthly_limit');
          if (state.day[key] + cost[key] > limits['daily' + suffix] || item[key] + cost[key] > limits['identityDaily' + suffix]) return deny('daily_limit');
        }
        const opLimit = 'monthly' + operation[0].toUpperCase() + operation.slice(1);
        if (state.total[operation] + 1 > limits[opLimit]) return deny('monthly_limit');
        for (const key of KEYS) { state.total[key] += cost[key]; state.day[key] += cost[key]; item[key] += cost[key]; }
        item.minuteRequests++; state.day.identities[hash] = item; state.revision = randomUUID();
        const body = JSON.stringify(state);
        if (Buffer.byteLength(body) > MAX_OBJECT_BYTES) throw unavailable();
        const saved = await fetcher(url, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
          ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) }, body, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        await saved.body?.cancel?.(); remaining();
        if (saved.status === 200) return { allowed: true };
        if (![409, 412].includes(saved.status)) throw unavailable();
        if (attempt + 1 < MAX_ATTEMPTS) await pause(Math.min(15 + Math.floor(Math.random() * 25) + attempt * 20, remaining()));
      }
      throw unavailable();
    } catch (_) { throw unavailable(); }
  };
}

module.exports = { createAIBudgetGuard, quoteAICost, DEFAULT_LIMITS, OPERATIONS };
