'use strict';

// Paid provider calls are reachable only after a durable usage reservation.
// The caller supplies that reservation; memory-only throttling is not a budget.
const TEXT_URL = 'https://translate.api.cloud.yandex.net/translate/v2/translate';
const OCR_URL = 'https://ai.api.cloud.yandex.net/ocr/v1/recognizeText';
const MAX_TEXT_CHARS = 2000;
const MAX_IMAGE_BYTES = 1572864;
const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 1024;
const MAX_PROVIDER_BYTES = 2 * 1024 * 1024;
const MAX_OCR_CHARS = 20000;
const MAX_PIXELS = 20000000;
const ORIGINS = new Set(['https://shizhongzhou.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765']);
const LANGUAGES = new Set(['auto', 'zh', 'ru']);

class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const invalid = () => { throw new RequestError(400, 'invalid_input'); };
const switchValue = value => typeof value === 'function' ? value() === true : value === true;

function decodeBase64(value, limit, code = 'invalid_input') {
  if (typeof value === 'string' && value.length > Math.ceil(limit / 3) * 4) throw new RequestError(413, code === 'invalid_image' ? 'image_too_large' : 'body_too_large');
  if (typeof value !== 'string' || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new RequestError(code === 'invalid_image' ? 415 : 400, code);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > limit) throw new RequestError(413, code === 'invalid_image' ? 'image_too_large' : 'body_too_large');
  if (bytes.toString('base64') !== value) throw new RequestError(code === 'invalid_image' ? 415 : 400, code);
  return bytes;
}

function readBody(event, headers) {
  if (!/^application\/json(?:\s*;|$)/i.test(headers['content-type'] || '')) throw new RequestError(415, 'json_required');
  if (typeof event.body !== 'string') invalid();
  const text = event.isBase64Encoded === true
    ? decodeBase64(event.body, MAX_BODY_BYTES).toString('utf8') : event.body;
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new RequestError(413, 'body_too_large');
  let body;
  try { body = JSON.parse(text); } catch (_) { invalid(); }
  if (!body || Array.isArray(body) || typeof body !== 'object') invalid();
  return body;
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === 'image/png') {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR' || bytes.readUInt32BE(8) !== 13) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType !== 'image/jpeg' || bytes.length < 15 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) return null;
  const frameMarkers = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 255) return null;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 218 || marker === 217) return null;
    if (marker === 1 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (frameMarkers.has(marker)) {
      if (length < 8) return null;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function validatePhoto(body) {
  if (Object.keys(body).some(key => !['image', 'mimeType', 'language'].includes(key)) || !LANGUAGES.has(body.language)) invalid();
  if (!['image/jpeg', 'image/png'].includes(body.mimeType)) throw new RequestError(415, 'invalid_image');
  const image = decodeBase64(body.image, MAX_IMAGE_BYTES, 'invalid_image');
  const size = imageDimensions(image, body.mimeType);
  if (!size || !size.width || !size.height) throw new RequestError(415, 'invalid_image');
  if (size.width * size.height > MAX_PIXELS) throw new RequestError(413, 'image_too_large');
  return { image: image.toString('base64'), mimeType: body.mimeType, language: body.language };
}

function validateText(body) {
  if (Object.keys(body).some(key => !['text', 'source', 'target'].includes(key)) || typeof body.text !== 'string' || !LANGUAGES.has(body.source) || !['zh', 'ru'].includes(body.target)) invalid();
  if (!body.text.trim() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(body.text)) invalid();
  // Count Unicode code points, preserving all spaces and punctuation sent for billing.
  const chars = [...body.text].length;
  if (chars > MAX_TEXT_CHARS) throw new RequestError(413, 'text_too_long');
  if (body.source === body.target) invalid();
  return { text: body.text, source: body.source, target: body.target, chars };
}

async function boundedJSON(response) {
  const length = Number(response.headers?.get('content-length'));
  if (Number.isFinite(length) && length > MAX_PROVIDER_BYTES) {
    try { await response.body?.cancel(); } catch (_) {}
    throw Error('provider_response_too_large');
  }
  const reader = response.body?.getReader?.();
  if (!reader) throw Error('provider_response_unreadable');
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BYTES) throw Error('provider_response_too_large');
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    try { await reader.cancel(); } catch (_) {}
    throw error;
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

function extractRecognizedText(data) {
  // The OCR REST streaming gateway can wrap its one-page result in `result`.
  const annotation = data?.textAnnotation || data?.result?.textAnnotation;
  if (!annotation || typeof annotation !== 'object') throw Error('invalid_provider_result');
  let text = typeof annotation.fullText === 'string' ? annotation.fullText : null;
  if (text === null && Array.isArray(annotation.blocks)) {
    text = annotation.blocks.flatMap(block => Array.isArray(block.lines) ? block.lines.map(line => typeof line.text === 'string' ? line.text : '') : []).filter(Boolean).join('\n');
  }
  if (text === null) throw Error('invalid_provider_result');
  text = text.trim();
  if (!text) throw new RequestError(422, 'no_text');
  const chars = [...text];
  return { text: chars.slice(0, MAX_OCR_CHARS).join(''), ...(chars.length > MAX_OCR_CHARS ? { truncated: true } : {}) };
}

function createTranslationHandler({
  fetcher = fetch,
  enabled = () => process.env.TRANSLATION_ENABLED === 'true',
  ocrEnabled = () => process.env.OCR_ENABLED === 'true',
  recognizeImage,
  maxImageDimension = 0,
  reserveUsage,
  now = () => Date.now(),
  providerTimeoutMs = 25000
} = {}) {
  const canReserve = typeof reserveUsage === 'function';
  const timeoutMs = Number.isInteger(providerTimeoutMs) && providerTimeoutMs > 0 ? Math.min(providerTimeoutMs, 25000) : 25000;
  return async (event, context = {}) => {
    const path = event.path || '', method = String(event.httpMethod || 'GET').toUpperCase();
    if (!path.startsWith('/translate/')) return null;
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = incoming.origin;
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Retry-After', 'Vary': 'Origin'
    };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const response = (statusCode, data = {}, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body: statusCode === 204 ? '' : JSON.stringify(data) });
    if (origin && !ORIGINS.has(origin)) return response(403, { error: 'origin_not_allowed' });
    if (!['/translate/config', '/translate/text', '/translate/photo'].includes(path)) return response(404, { error: 'not_found' });
    if (method === 'OPTIONS') return response(204);
    const isEnabled = canReserve && switchValue(enabled), hasOCR = isEnabled && switchValue(ocrEnabled);
    if (path === '/translate/config') {
      if (method !== 'GET') return response(405, { error: 'method_not_allowed' });
      return response(200, { enabled: isEnabled, ocrEnabled: hasOCR, maxTextChars: MAX_TEXT_CHARS, maxImageBytes: MAX_IMAGE_BYTES });
    }
    if (method !== 'POST') return response(405, { error: 'method_not_allowed' });
    if (!ORIGINS.has(origin)) return response(403, { error: 'app_origin_required' });
    const photo = path === '/translate/photo';
    if (!isEnabled) return response(503, { error: 'translation_disabled' });
    if (photo && !hasOCR) return response(503, { error: 'ocr_disabled' });
    let input;
    try {
      const body = readBody(event, incoming);
      input = photo ? validatePhoto(body) : validateText(body);
      if (photo && maxImageDimension > 0) {
        const size = imageDimensions(Buffer.from(input.image, 'base64'), input.mimeType);
        if (Math.max(size.width, size.height) > maxImageDimension) throw new RequestError(413, 'image_too_large');
      }
    } catch (error) {
      return response(error instanceof RequestError ? error.status : 400, { error: error instanceof RequestError ? error.code : 'invalid_input' });
    }
    const token = context.token?.access_token;
    if (typeof token !== 'string' || !token || token.length > 16384 || /[\r\n]/.test(token)) return response(503, { error: 'credentials_unavailable' });
    const rawIdentity = event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp;
    const identity = typeof rawIdentity === 'string' && rawIdentity.length <= 64 ? rawIdentity : 'unknown';
    let reservation;
    try { reservation = await reserveUsage({ chars: photo ? 0 : input.chars, images: photo ? 1 : 0, identity, now: now() }, context); }
    catch (_) { return response(503, { error: 'usage_unavailable' }); }
    if (reservation?.allowed !== true) {
      const error = ['rate_limit', 'daily_limit', 'monthly_limit'].includes(reservation?.error) ? reservation.error : 'usage_unavailable';
      const retryAfter = Number.isInteger(reservation?.retryAfter) && reservation.retryAfter > 0 ? Math.min(reservation.retryAfter, 31 * 86400) : null;
      return response(error === 'usage_unavailable' ? 503 : 429, { error, ...(retryAfter ? { retryAfter } : {}) }, retryAfter ? { 'Retry-After': String(retryAfter) } : {});
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (photo && typeof recognizeImage === 'function') {
        return response(200, await recognizeImage(input, { token, signal: controller.signal }));
      }
      const payload = photo
        ? { content: input.image, mimeType: input.mimeType === 'image/jpeg' ? 'JPEG' : 'PNG', languageCodes: input.language === 'ru' ? ['ru'] : ['zh', 'en', 'ru'], model: 'page' }
        : { texts: [input.text], targetLanguageCode: input.target, format: 'PLAIN_TEXT', ...(input.source === 'auto' ? {} : { sourceLanguageCode: input.source }) };
      const result = await fetcher(photo ? OCR_URL : TEXT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'x-data-logging-enabled': 'false' },
        body: JSON.stringify(payload), signal: controller.signal, redirect: 'error'
      });
      if (!result.ok) {
        try { await result.body?.cancel(); } catch (_) {}
        return response(result.status === 429 ? 429 : 502, { error: result.status === 429 ? 'provider_busy' : photo ? 'recognition_unavailable' : 'translation_unavailable' });
      }
      const data = await boundedJSON(result);
      if (photo) return response(200, extractRecognizedText(data));
      const output = data?.translations;
      if (!Array.isArray(output) || output.length !== 1 || typeof output[0].text !== 'string' || !output[0].text.trim() || [...output[0].text].length > 20000) throw Error('invalid_provider_result');
      const detected = output[0].detectedLanguageCode;
      const source = input.source === 'auto' && typeof detected === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(detected) ? detected : input.source;
      return response(200, { text: output[0].text, source, target: input.target });
    } catch (error) {
      if (error instanceof RequestError) return response(error.status, { error: error.code });
      return response(controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'request_timeout' : photo ? 'recognition_unavailable' : 'translation_unavailable' });
    } finally { clearTimeout(timeout); }
  };
}

module.exports = { createTranslationHandler, validateText, validatePhoto, imageDimensions, extractRecognizedText,
  boundedJSON, RequestError, MAX_TEXT_CHARS, MAX_IMAGE_BYTES, MAX_BODY_BYTES, MAX_PROVIDER_BYTES, TEXT_URL, OCR_URL };
