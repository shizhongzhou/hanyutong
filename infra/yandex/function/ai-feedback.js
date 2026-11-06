'use strict';

const { createHmac, randomUUID } = require('node:crypto');
const MAX_BODY_BYTES = 48 * 1024, MAX_OBJECT_BYTES = 350 * 1024, MAX_RECORDS = 20, MAX_DAILY_IDENTITY = 3;
const MAX_ATTEMPTS = 5, PREFIX = 'app-private/ai-feedback/';
const REASONS = new Set(['incorrect', 'unclear', 'wrong_level', 'other']);
const ORIGINS = new Set(['https://shizhongzhou.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765']);
const readOption = value => typeof value === 'function' ? value() : value;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const text = (value, maximum) => typeof value === 'string' && !!value.trim() && [...value].length <= maximum &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
class RequestError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
const unavailable = () => Error('feedback_unavailable');
function period(timestamp) {
  if (!Number.isFinite(timestamp) || timestamp < 0) throw unavailable();
  const date = new Date(timestamp + 3 * 3600000).toISOString().slice(0, 10);
  return { month: date.slice(0, 7), date };
}
function retryAfter(timestamp, monthly) {
  const p = period(timestamp), [year, month] = p.month.split('-').map(Number);
  const end = monthly ? Date.UTC(year, month, 1) - 3 * 3600000 : Date.parse(p.date + 'T00:00:00+03:00') + 86400000;
  return Math.max(1, Math.ceil((end - timestamp) / 1000));
}
function validateFeedback(body) {
  if (!plain(body) || body.consent !== true) throw new RequestError(400, 'consent_required');
  if (!exact(body, ['prompt', 'answer', 'reason', 'consent']) || !text(body.prompt, 2000) || !text(body.answer, 12000) ||
      !REASONS.has(body.reason)) throw new RequestError(400, 'invalid_input');
  return { prompt: body.prompt, answer: body.answer, reason: body.reason, consent: true };
}
function readBody(event, headers) {
  if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] || '')) throw new RequestError(415, 'json_required');
  let value = event.body;
  if (typeof value !== 'string') throw new RequestError(400, 'invalid_input');
  if (event.isBase64Encoded === true) {
    if (value.length > Math.ceil(MAX_BODY_BYTES / 3) * 4) throw new RequestError(413, 'body_too_large');
    if (value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new RequestError(400, 'invalid_input');
    const decoded = Buffer.from(value, 'base64');
    if (decoded.toString('base64') !== value) throw new RequestError(400, 'invalid_input');
    value = decoded.toString('utf8');
  }
  if (Buffer.byteLength(value) > MAX_BODY_BYTES) throw new RequestError(413, 'body_too_large');
  try { return JSON.parse(value); } catch (_) { throw new RequestError(400, 'invalid_input'); }
}
async function readLedger(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_OBJECT_BYTES)) {
    await response.body?.cancel?.(); throw unavailable();
  }
  const reader = response.body?.getReader?.(); if (!reader) throw unavailable();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > MAX_OBJECT_BYTES) throw unavailable();
      chunks.push(Buffer.from(value));
    }
  } catch (error) { try { await reader.cancel(); } catch (_) {} throw error; }
  finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}
function validateLedger(ledger, timestamp) {
  const p = period(timestamp);
  if (!exact(ledger, ['version', 'month', 'revision', 'records']) || ledger.version !== 1 || ledger.month !== p.month || !uuid(ledger.revision) ||
      !Array.isArray(ledger.records) || ledger.records.length > MAX_RECORDS) throw unavailable();
  const ids = new Set(), counts = new Map();
  for (const record of ledger.records) {
    if (!exact(record, ['id', 'createdAt', 'identity', 'prompt', 'answer', 'reason', 'consent']) || !uuid(record.id) || ids.has(record.id) ||
        typeof record.createdAt !== 'string' || typeof record.identity !== 'string' || !/^[a-f0-9]{64}$/.test(record.identity)) throw unavailable();
    const created = Date.parse(record.createdAt);
    if (!Number.isFinite(created) || created > timestamp || new Date(created).toISOString() !== record.createdAt || period(created).month !== p.month) throw unavailable();
    validateFeedback({ prompt: record.prompt, answer: record.answer, reason: record.reason, consent: record.consent });
    const key = record.identity + ':' + period(created).date;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (counts.get(key) > MAX_DAILY_IDENTITY) throw unavailable();
    ids.add(record.id);
  }
  return ledger;
}

function createFeedbackHandler({ fetcher = fetch, enabled = () => process.env.AI_FEEDBACK_ENABLED === 'true',
  bucket = () => process.env.AI_BUDGET_BUCKET, secret = () => process.env.AI_IDENTITY_SALT,
  now = () => Date.now(), monotonicNow = () => performance.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  return async (event, context = {}) => {
    if (event.path !== '/ai/feedback') return null;
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = incoming.origin, method = String(event.httpMethod || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Expose-Headers': 'Retry-After', Vary: 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (statusCode, data = {}, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body: statusCode === 204 ? '' : JSON.stringify(data) });
    if (origin && !ORIGINS.has(origin)) return respond(403, { error: 'origin_not_allowed' });
    if (method === 'OPTIONS') return respond(204);
    if (method !== 'POST') return respond(405, { error: 'method_not_allowed' });
    if (!ORIGINS.has(origin)) return respond(403, { error: 'app_origin_required' });
    let selectedBucket, salt;
    try {
      if (readOption(enabled) !== true) return respond(503, { error: 'feedback_disabled' });
      selectedBucket = readOption(bucket); salt = readOption(secret);
    } catch (_) { return respond(503, { error: 'feedback_unavailable' }); }
    const token = context.token?.access_token;
    if (typeof selectedBucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(selectedBucket) || selectedBucket.includes('..') ||
        typeof salt !== 'string' || salt.length < 32 || typeof token !== 'string' || !token || token.length > 16384 || /[\r\n]/.test(token)) {
      return respond(503, { error: 'feedback_unavailable' });
    }
    let input;
    try { input = validateFeedback(readBody(event, incoming)); }
    catch (error) { return respond(error instanceof RequestError ? error.status : 400, { error: error instanceof RequestError ? error.code : 'invalid_input' }); }
    const rawIdentity = event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp;
    const identity = typeof rawIdentity === 'string' && rawIdentity.length > 0 && rawIdentity.length <= 64 ? rawIdentity : 'unknown';
    const hash = createHmac('sha256', salt).update('ai-feedback:' + identity).digest('hex');
    try {
      const deadline = monotonicNow() + 10000, id = randomUUID();
      const remaining = () => {
        const ms = Math.ceil(deadline - monotonicNow());
        if (!Number.isFinite(ms) || ms <= 0) throw unavailable();
        return ms;
      };
      const auth = { Authorization: 'Bearer ' + token };
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const timestamp = now(), p = period(timestamp), url = `https://storage.yandexcloud.net/${selectedBucket}/${PREFIX}${p.month}.json`;
        const loaded = await fetcher(url, { headers: { ...auth, 'Accept-Encoding': 'identity' }, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        let ledger, etag;
        if (loaded.status === 404) {
          await loaded.body?.cancel?.(); ledger = { version: 1, month: p.month, revision: randomUUID(), records: [] };
        } else {
          if (loaded.status !== 200) { await loaded.body?.cancel?.(); throw unavailable(); }
          etag = loaded.headers.get('etag');
          if (typeof etag !== 'string' || !/^"[a-fA-F0-9-]{1,96}"$/.test(etag)) { await loaded.body?.cancel?.(); throw unavailable(); }
          ledger = validateLedger(await readLedger(loaded), timestamp);
        }
        remaining();
        const deny = monthly => {
          const seconds = retryAfter(timestamp, monthly);
          return respond(429, { error: 'feedback_limit', retryAfter: seconds }, { 'Retry-After': String(seconds) });
        };
        if (ledger.records.length >= MAX_RECORDS) return deny(true);
        if (ledger.records.filter(record => record.identity === hash && period(Date.parse(record.createdAt)).date === p.date).length >= MAX_DAILY_IDENTITY) return deny(false);
        ledger.records.push({ id, createdAt: new Date(timestamp).toISOString(), identity: hash, ...input }); ledger.revision = randomUUID();
        const body = JSON.stringify(ledger);
        if (Buffer.byteLength(body) > MAX_OBJECT_BYTES) return deny(true);
        const saved = await fetcher(url, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
          ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' }) }, body, redirect: 'error', signal: AbortSignal.timeout(Math.min(3500, remaining())) });
        await saved.body?.cancel?.(); remaining();
        if (saved.status === 200) return respond(200, { saved: true });
        if (![409, 412].includes(saved.status)) throw unavailable();
        if (attempt + 1 < MAX_ATTEMPTS) await pause(Math.min(15 + Math.floor(Math.random() * 25) + attempt * 20, remaining()));
      }
      throw unavailable();
    } catch (_) { return respond(503, { error: 'feedback_unavailable' }); }
  };
}
module.exports = { createFeedbackHandler, validateFeedback, validateLedger, MAX_BODY_BYTES, MAX_OBJECT_BYTES, MAX_RECORDS, MAX_DAILY_IDENTITY };
