'use strict';

const { quoteAICost } = require('./ai-budget');
const ORIGINS = new Set(['https://shizhongzhou.github.io', 'http://127.0.0.1:8765', 'http://localhost:8765']);
const MAX_TEXT_CHARS = 300, MAX_AUDIO_BYTES = 1024 * 1024, MAX_AUDIO_SECONDS = 30;
const MAX_BODY_BYTES = 1400000, MAX_PCM_BYTES = 4 * 1024 * 1024;
const MAX_SSE_BYTES = 8 * 1024 * 1024, MAX_FRAME_BYTES = 256 * 1024;
const readOption = value => typeof value === 'function' ? value() : value;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\uD800-\uDFFF]/u;
class RequestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const invalid = () => { throw new RequestError(400, 'invalid_input'); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
function decodeBase64(text, maximum, request = false) {
  const fail = () => { if (request) invalid(); throw Error('invalid_provider_result'); };
  if (typeof text !== 'string' || !text || text.length > Math.ceil(maximum / 3) * 4 ||
      text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) fail();
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length > maximum || bytes.toString('base64') !== text) fail();
  return bytes;
}
function readBody(event, headers) {
  if (typeof headers['content-type'] !== 'string' || !/^application\/json(?:\s*;|$)/i.test(headers['content-type'])) throw new RequestError(415, 'json_required');
  let text = event.body;
  if (typeof text !== 'string') invalid();
  if (event.isBase64Encoded === true) {
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64(text, MAX_BODY_BYTES, true)); }
    catch (_) { invalid(); }
  }
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new RequestError(413, 'body_too_large');
  try { return JSON.parse(text); } catch (_) { invalid(); }
}
function validateSpeech(body) {
  if (!plain(body) || Object.keys(body).some(key => key !== 'text') || typeof body.text !== 'string') invalid();
  const text = body.text.trim(), characters = [...text].length;
  if (!characters || controls.test(text) || !/\p{Script=Han}/u.test(text)) invalid();
  if (characters > MAX_TEXT_CHARS) throw new RequestError(413, 'text_too_long');
  return { text, characters };
}
function validateWav(body) {
  if (!plain(body) || Object.keys(body).some(key => !['audio', 'mimeType'].includes(key)) || body.mimeType !== 'audio/wav') invalid();
  const bytes = decodeBase64(body.audio, MAX_AUDIO_BYTES, true);
  // The app records this canonical PCM format. Reject container extensions,
  // compressed codecs and trailing bytes so duration cannot be misreported.
  if (bytes.length < 46 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 ||
      bytes.toString('latin1', 8, 12) !== 'WAVE' || bytes.toString('latin1', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 ||
      bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 16000 ||
      bytes.readUInt32LE(28) !== 32000 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 ||
      bytes.toString('latin1', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44 ||
      (bytes.length - 44) % 2 || bytes.length - 44 > MAX_AUDIO_SECONDS * 32000) invalid();
  return bytes;
}
function normalizeApiHost(value) {
  if (typeof value !== 'string' || !value || value.length > 180) return null;
  // Accept the console's API Host, not an arbitrary URL or user-supplied path.
  const host = value.startsWith('https://') ? value.slice(8) : value;
  if (host !== host.toLowerCase()) return null;
  if (['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com'].includes(host) ||
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com$/.test(host) &&
      !host.startsWith('trial.') && !host.startsWith('token-plan.')) return 'https://' + host;
  return null;
}
function pcmToWav(pcm) {
  if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2 || pcm.length > MAX_PCM_BYTES) throw Error('invalid_provider_result');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
async function readBounded(response, maximum, signal, onChunk) {
  const length = response.headers?.get('content-length');
  if (length != null && (!/^\d+$/.test(length) || Number(length) > maximum)) {
    response.body?.cancel?.().catch(() => {}); throw Error('invalid_provider_result');
  }
  const reader = response.body?.getReader?.();
  if (!reader || signal.aborted) throw Error('invalid_provider_result');
  let rejectAbort;
  const abort = new Promise((_, reject) => { rejectAbort = () => reject(Error('timeout')); });
  signal.addEventListener('abort', rejectAbort, { once: true });
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), abort]); if (done) break;
      size += value.byteLength;
      if (size > maximum) throw Error('invalid_provider_result');
      onChunk(Buffer.from(value));
    }
  } catch (error) { reader.cancel().catch(() => {}); throw error; }
  finally { signal.removeEventListener('abort', rejectAbort); reader.releaseLock(); }
}
async function readSpeech(response, signal) {
  if (!/^text\/event-stream(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw Error('invalid_provider_result');
  let pending = '', total = 0, finished = false;
  const chunks = [], decoder = new TextDecoder('utf-8', { fatal: true });
  function frame(raw) {
    const data = raw.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    if (data === '[DONE]') { if (!finished) throw Error('invalid_provider_result'); return; }
    if (finished) throw Error('invalid_provider_result');
    const item = JSON.parse(data);
    if (!plain(item) || (item.status_code != null && item.status_code !== 200) || (item.code != null && item.code !== '') || !plain(item.output)) throw Error('invalid_provider_result');
    const output = item.output;
    if (![null, undefined, 'null', 'stop'].includes(output.finish_reason)) throw Error('invalid_provider_result');
    if (output.audio?.data) {
      const pcm = decodeBase64(output.audio.data, MAX_PCM_BYTES - total);
      if (pcm.length % 2) throw Error('invalid_provider_result');
      total += pcm.length; chunks.push(pcm);
    }
    // Audio URLs are intentionally ignored; no provider response can cause a
    // second network request or expose a signed storage URL to an app user.
    if (output.finish_reason === 'stop') finished = true;
  }
  function consume(chunk) {
    pending += decoder.decode(chunk, { stream: true });
    let match;
    while ((match = /\r?\n\r?\n/.exec(pending))) {
      if (Buffer.byteLength(pending.slice(0, match.index)) > MAX_FRAME_BYTES) throw Error('invalid_provider_result');
      frame(pending.slice(0, match.index)); pending = pending.slice(match.index + match[0].length);
    }
    if (Buffer.byteLength(pending) > MAX_FRAME_BYTES) throw Error('invalid_provider_result');
  }
  await readBounded(response, MAX_SSE_BYTES, signal, consume);
  pending += decoder.decode();
  if (pending.trim()) throw Error('invalid_provider_result');
  if (!finished || !total) throw Error('invalid_provider_result');
  return pcmToWav(Buffer.concat(chunks, total));
}
async function readTranscript(response, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) throw Error('invalid_provider_result');
  const chunks = [];
  await readBounded(response, 65536, signal, chunk => chunks.push(chunk));
  const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
  const choice = data?.choices?.[0], text = choice?.message?.content;
  if (!Array.isArray(data?.choices) || data.choices.length !== 1 || choice.message?.role !== 'assistant' ||
      choice.finish_reason !== 'stop' || typeof text !== 'string' || [...text].length > 3000 || controls.test(text)) throw Error('invalid_provider_result');
  return text.trim();
}
function createAISpeechHandler({ fetcher = fetch,
  ttsEnabled = () => process.env.QWEN_TTS_ENABLED === 'true', asrEnabled = () => process.env.QWEN_ASR_ENABLED === 'true',
  apiKey = () => process.env.QWEN_API_KEY, apiHost = () => process.env.QWEN_API_HOST,
  reserveUsage, providerTimeoutMs = 30000 } = {}) {
  const timeoutMs = Number.isInteger(providerTimeoutMs) && providerTimeoutMs > 0 ? Math.min(providerTimeoutMs, 30000) : 30000;
  return async (event, context = {}) => {
    if (!['/ai/speech', '/ai/transcribe'].includes(event.path)) return null;
    const tts = event.path === '/ai/speech', operation = tts ? 'tts' : 'asr';
    const method = String(event.httpMethod || 'GET').toUpperCase();
    const incoming = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const origin = incoming.origin;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'Retry-After', Vary: 'Origin' };
    if (ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    const respond = (statusCode, data = {}, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body: statusCode === 204 ? '' : JSON.stringify(data) });
    if (origin && !ORIGINS.has(origin)) return respond(403, { error: 'origin_not_allowed' });
    if (method === 'OPTIONS') return respond(204);
    if (method !== 'POST') return respond(405, { error: 'method_not_allowed' });
    if (!ORIGINS.has(origin)) return respond(403, { error: 'app_origin_required' });
    let key, host;
    try {
      if (readOption(tts ? ttsEnabled : asrEnabled) !== true || typeof reserveUsage !== 'function') return respond(503, { error: tts ? 'tts_disabled' : 'asr_disabled' });
      key = readOption(apiKey); host = normalizeApiHost(readOption(apiHost));
    } catch (_) { return respond(503, { error: 'credentials_unavailable' }); }
    if (typeof key !== 'string' || !key || key.startsWith('sk-sp') || key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key) || !host) return respond(503, { error: 'credentials_unavailable' });
    let input;
    try { const body = readBody(event, incoming); input = tts ? validateSpeech(body) : validateWav(body); }
    catch (error) { return respond(error instanceof RequestError ? error.status : 400, { error: error instanceof RequestError ? error.code : 'invalid_input' }); }
    const rawIdentity = event.requestContext?.identity?.sourceIp || event.requestContext?.http?.sourceIp;
    const identity = typeof rawIdentity === 'string' && rawIdentity.length > 0 && rawIdentity.length <= 64 ? rawIdentity : 'unknown';
    let reservation;
    try {
      reservation = await reserveUsage({ operation, identity, costMicroRubles: quoteAICost(operation,
        tts ? { characters: input.characters * 2 } : { audioSeconds: MAX_AUDIO_SECONDS }) }, context);
    } catch (_) { return respond(503, { error: 'usage_unavailable' }); }
    if (reservation?.allowed !== true) {
      const error = ['rate_limit', 'daily_limit', 'monthly_limit'].includes(reservation?.error) ? reservation.error : 'usage_unavailable';
      const retryAfter = Number.isInteger(reservation?.retryAfter) && reservation.retryAfter > 0 ? Math.min(reservation.retryAfter, 31 * 86400) : null;
      return respond(error === 'usage_unavailable' ? 503 : 429, { error, ...(retryAfter ? { retryAfter } : {}) }, retryAfter ? { 'Retry-After': String(retryAfter) } : {});
    }
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(Error('timeout')); }, timeoutMs); });
    const unavailable = tts ? 'speech_unavailable' : 'transcription_unavailable';
    try {
      return await Promise.race([deadline, (async () => {
        const url = host + (tts ? '/api/v1/services/aigc/multimodal-generation/generation' : '/compatible-mode/v1/chat/completions');
        const body = tts ? { model: 'qwen3-tts-flash', input: { text: input.text, voice: 'Cherry', language_type: 'Chinese' } }
          : { model: 'qwen3-asr-flash', messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + input.toString('base64') } }] }], asr_options: { language: 'zh', enable_itn: false }, stream: false };
        const result = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key,
          ...(tts ? { 'X-DashScope-SSE': 'enable' } : {}) }, body: JSON.stringify(body), signal: controller.signal, redirect: 'error' });
        if (!result.ok) {
          result.body?.cancel?.().catch(() => {});
          return respond(result.status === 429 ? 429 : 502, { error: result.status === 429 ? 'provider_busy' : unavailable });
        }
        if (tts) {
          const audio = await readSpeech(result, controller.signal);
          return respond(200, { audio: audio.toString('base64'), mimeType: 'audio/wav' });
        }
        const text = await readTranscript(result, controller.signal);
        return text ? respond(200, { text }) : respond(422, { error: 'no_speech' });
      })()]);
    } catch (_) { return respond(controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? 'request_timeout' : unavailable }); }
    finally { clearTimeout(timeout); }
  };
}
module.exports = { createAISpeechHandler, validateSpeech, validateWav, normalizeApiHost, pcmToWav, readSpeech,
  MAX_TEXT_CHARS, MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, MAX_BODY_BYTES, MAX_PCM_BYTES, MAX_SSE_BYTES, MAX_FRAME_BYTES };
