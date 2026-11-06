'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');
const privateCatalog = require('./catalog.json');
const { createTranslationHandler } = require('./translate.js');
const { createBudgetGuard } = require('./translation-budget.js');
const { createAIBudgetGuard } = require('./ai-budget.js');
const { createAIChatHandler } = require('./ai-chat.js');
const { createAIAssessmentHandler, DEFAULT_ASSESSMENT_MODEL } = require('./ai-assessment.js');
const { createFeedbackHandler } = require('./ai-feedback.js');
const { createAISpeechHandler, normalizeApiHost } = require('./ai-speech.js');
const { createVisionRecognizer, visionCost, MAX_VISION_DIMENSION } = require('./ai-vision.js');
const BUCKET = 'https://storage.yandexcloud.net/hanyutong-dev-media-b1gsi4nj/';
const MAX_RANGE = 1024 * 1024;
const ORIGINS = new Set(['https://shizhongzhou.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765']);
function publicCatalog(catalog) {
  const { source, ...result } = catalog;
  result.files = catalog.files.map(({key, sha256, preview, ...file}) => file);
  return result;
}
function requestedRange(header, size) {
  if (!header) return [0, Math.min(size, MAX_RANGE) - 1];
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count <= 0) return null;
    start = Math.max(0, size - count); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] ? Number(match[2]) : size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null;
  return [start, Math.min(end, size - 1, start + MAX_RANGE - 1)];
}
function createHandler({catalog = privateCatalog, secret = () => process.env.LIBRARY_SESSION_SECRET, fetcher = fetch, now = () => Date.now()} = {}) {
  const entries = new Map(catalog.files.map(f => [f.id, f]));
  const catalogBody = JSON.stringify(publicCatalog(catalog));
  const sign = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');
  return async (event, context = {}) => {
    const method = event.httpMethod || 'GET', path = event.path || '/health';
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(),v]));
    const origin = incoming.origin;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges', 'Vary': 'Origin'
    };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const response = (statusCode, data = {}, extra = {}) => ({statusCode, headers: {...headers, ...extra}, body: method === 'HEAD' || statusCode === 204 ? '' : JSON.stringify(data)});
    if (origin && !ORIGINS.has(origin)) return response(403, {error:'origin_not_allowed'});
    if (method === 'OPTIONS') return response(204);
    if (path === '/health' && ['GET','HEAD'].includes(method)) return response(200, {status:'ok',service:'hanyutong',environment:'development',libraryFiles:catalog.totalFiles});
    if (path === '/library/catalog') {
      if (!['GET','HEAD'].includes(method)) return response(405, {error:'method_not_allowed'});
      return {...response(200), body: method === 'HEAD' ? '' : catalogBody};
    }
    const match = /^\/library\/(access|media)\/(rts-[a-f0-9]{24})$/.exec(path);
    const file = match && entries.get(match[2]);
    if (!file) return response(404, {error:'not_found'});
    const key = secret();
    if (!key || key.length < 32) return response(503, {error:'reader_not_configured'});
    const view = file.preview || (['pdf','audio'].includes(file.kind) ? file : null);
    if (!view || !/^library\/(road-to-success|previews)\/[a-f0-9]{64}\.(pdf|mp3)$/.test(view.key)) return response(409, {error:'preview_unavailable'});
    if (match[1] === 'access') {
      if (method !== 'POST') return response(405, {error:'method_not_allowed'});
      if (!ORIGINS.has(origin)) return response(403, {error:'app_origin_required'});
      const expires = Math.floor(now() / 1000) + 3600;
      const payload = Buffer.from(JSON.stringify({id:file.id,exp:expires})).toString('base64url');
      return response(200, {token: payload + '.' + sign(payload, key), expires});
    }
    if (!['GET','HEAD'].includes(method)) return response(405, {error:'method_not_allowed'});
    const token = event.queryStringParameters?.ticket;
    if (typeof token !== 'string' || token.length > 512) return response(401, {error:'reading_session_required'});
    const [payload, signature, extra] = token.split('.');
    try {
      const expected = Buffer.from(sign(payload, key));
      const actual = Buffer.from(signature || '');
      if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (claims.id !== file.id || !Number.isSafeInteger(claims.exp) || claims.exp <= Math.floor(now()/1000)) throw Error();
    } catch (_) { return response(401, {error:'reading_session_expired'}); }
    const mediaHeaders = {'Content-Type':file.kind === 'audio' ? 'audio/mpeg' : 'application/pdf','Accept-Ranges':'bytes','Content-Disposition':'inline'};
    if (method === 'HEAD') return response(200, {}, {...mediaHeaders, 'Content-Length':String(view.size)});
    const range = requestedRange(incoming.range, view.size);
    if (!range) return response(416, {error:'invalid_range'}, {'Content-Range':`bytes */${view.size}`});
    const [start,end] = range;
    if (!context.token?.access_token) return response(503, {error:'reader_credentials_unavailable'});
    try {
      const upstream = await fetcher(BUCKET + view.key, {
        headers:{Authorization:'Bearer ' + context.token.access_token,Range:`bytes=${start}-${end}`},
        signal:AbortSignal.timeout(8000), redirect:'error'
      });
      if (upstream.status !== 206 || upstream.headers.get('content-range') !== `bytes ${start}-${end}/${view.size}`) return response(502, {error:'reading_source_unavailable'});
      const content = Buffer.from(await upstream.arrayBuffer());
      if (content.length !== end-start+1) return response(502, {error:'incomplete_reading_range'});
      return {statusCode:206, headers:{...headers,...mediaHeaders,'Content-Range':`bytes ${start}-${end}/${view.size}`,'Content-Length':String(content.length)}, isBase64Encoded:true, body:content.toString('base64')};
    } catch (_) { return response(502, {error:'reading_source_unavailable'}); }
  };
}
const readerHandler = createHandler();
const reserveAI = (usage, context = {}) => createAIBudgetGuard({ token: () => context.token?.access_token })(usage);
function aiConfiguration(env = process.env) {
  const keyOK = key => typeof key === 'string' && key.length > 0 && key.length <= 4096 && !/[\s\x00-\x1f\x7f]/.test(key);
  const storageReady = (bucket, salt) => typeof bucket === 'string' && /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) &&
    !bucket.includes('..') && typeof salt === 'string' && salt.length >= 32;
  const budget = storageReady(env.AI_BUDGET_BUCKET || env.TRANSLATION_BUDGET_BUCKET, env.AI_IDENTITY_SALT || env.TRANSLATION_IDENTITY_SALT);
  const speech = budget && keyOK(env.QWEN_API_KEY) && !env.QWEN_API_KEY.startsWith('sk-sp') && !!normalizeApiHost(env.QWEN_API_HOST);
  return {
    enabled: budget && env.AI_CHAT_ENABLED === 'true' && keyOK(env.DEEPSEEK_API_KEY) && ['deepseek-flash', 'deepseek-v4-flash'].includes(env.DEEPSEEK_MODEL || 'deepseek-flash'),
    visionEnabled: budget && env.AI_VISION_ENABLED === 'true' && /^[a-z0-9]{10,32}$/.test(env.YANDEX_FOLDER_ID || ''),
    assessmentEnabled: budget && env.AI_ASSESSMENT_ENABLED === 'true' && keyOK(env.DEEPSEEK_API_KEY) &&
      (env.DEEPSEEK_ASSESSMENT_MODEL || DEFAULT_ASSESSMENT_MODEL) === DEFAULT_ASSESSMENT_MODEL,
    feedbackEnabled: env.AI_FEEDBACK_ENABLED === 'true' && storageReady(env.AI_BUDGET_BUCKET, env.AI_IDENTITY_SALT),
    ttsEnabled: speech && env.QWEN_TTS_ENABLED === 'true',
    asrEnabled: speech && env.QWEN_ASR_ENABLED === 'true', maxInputChars: 2000
  };
}
const translationHandler = createTranslationHandler({
  ocrEnabled: () => aiConfiguration().visionEnabled,
  maxImageDimension: MAX_VISION_DIMENSION,
  recognizeImage: createVisionRecognizer(),
  reserveUsage: (usage, context = {}) => usage.images
    ? reserveAI({ operation: 'vision', costMicroRubles: visionCost(), identity: usage.identity }, context)
    : createBudgetGuard({ token: () => context.token?.access_token })(usage)
});
const chatHandler = createAIChatHandler({ enabled: () => aiConfiguration().enabled, reserveUsage: reserveAI });
const assessmentHandler = createAIAssessmentHandler({ enabled: () => aiConfiguration().assessmentEnabled, reserveUsage: reserveAI });
const feedbackHandler = createFeedbackHandler({ enabled: () => aiConfiguration().feedbackEnabled });
const speechHandler = createAISpeechHandler({ ttsEnabled: () => aiConfiguration().ttsEnabled, asrEnabled: () => aiConfiguration().asrEnabled, reserveUsage: reserveAI });
exports.handler = async (event, context = {}) => {
  if ((event.path || '').startsWith('/translate/')) return translationHandler(event, context);
  if (event.path === '/ai/chat') return chatHandler(event, context);
  if (['/ai/tasks', '/ai/assess'].includes(event.path)) return assessmentHandler(event, context);
  if (event.path === '/ai/feedback') return feedbackHandler(event, context);
  if (['/ai/speech', '/ai/transcribe'].includes(event.path)) return speechHandler(event, context);
  if ((event.path || '').startsWith('/ai/')) {
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = incoming.origin, method = String(event.httpMethod || 'GET').toUpperCase();
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const statusCode = origin && !ORIGINS.has(origin) ? 403 : event.path !== '/ai/config' ? 404 : method === 'OPTIONS' ? 204 : method !== 'GET' ? 405 : 200;
    const error = { 403: 'origin_not_allowed', 404: 'not_found', 405: 'method_not_allowed' }[statusCode];
    return { statusCode, headers, body: statusCode === 204 ? '' : JSON.stringify(error ? { error } : aiConfiguration()) };
  }
  return readerHandler(event, context);
};
exports.aiConfiguration = aiConfiguration;
exports.createHandler = createHandler;
exports.publicCatalog = publicCatalog;
exports.requestedRange = requestedRange;
