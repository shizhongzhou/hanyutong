#!/usr/bin/env node
/* Explicit, bounded smoke checks. No credentials, output content, retries, or file writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';

const require = createRequire(import.meta.url);
const { quoteAICost, DEFAULT_LIMITS } = require('../infra/yandex/function/ai-budget.js');
const { validateChat, validateReply, replyText, systemPrompt, MAX_OUTPUT_TOKENS } = require('../infra/yandex/function/ai-chat.js');
const { validateWav } = require('../infra/yandex/function/ai-speech.js');
const { validateAssessment, validateAssessmentResult, assessmentPrompt, MAX_ASSESSMENT_TOKENS } = require('../infra/yandex/function/ai-assessment.js');
const { validatePhoto, imageDimensions, MAX_IMAGE_BYTES } = require('../infra/yandex/function/translate.js');
const { visionCost, MAX_VISION_DIMENSION } = require('../infra/yandex/function/ai-vision.js');
const API = 'https://d5du0ehkavrgcuf0765l.3rspsmhh.apigw.yandexcloud.net';
const ORIGIN = 'https://shizhongzhou.github.io';
const FLAGS = ['enabled', 'visionEnabled', 'ttsEnabled', 'asrEnabled', 'assessmentEnabled', 'feedbackEnabled'];
// Only known application codes may reach diagnostics; never print arbitrary
// gateway/provider messages, request IDs, response bodies, or credentials.
const SAFE_ERROR_CODES = new Set(['request_timeout', 'assessment_incomplete', 'assessment_unavailable', 'assessment_disabled',
  'daily_limit', 'monthly_limit', 'rate_limit', 'provider_busy', 'usage_unavailable', 'credentials_unavailable',
  'origin_not_allowed', 'app_origin_required', 'ai_disabled', 'chat_disabled', 'tts_disabled', 'asr_disabled',
  'not_configured', 'vision_disabled', 'recognition_unavailable', 'invalid_input', 'invalid_task', 'body_too_large', 'method_not_allowed']);
const HAN = /\p{Script=Han}/u, CYRILLIC = /[а-яё]/iu, TONE = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u;
const CHAT = Object.freeze({ messages: [{ role: 'user', content: 'Коротко объясни 你好 и дай один пример.' }], mode: 'explain', level: 1 });
const ASSESSMENT = Object.freeze({ mode: 'writing', taskId: 'writing-hsk1-01', answer: '我叫小安。我来自俄罗斯。我喜欢中文，也喜欢喝茶。' });
const SPEECH = Object.freeze({ text: '你好' });
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

class VerificationError extends Error {
  constructor(code, operation = 'setup', status) { super(code); this.code = code; this.operation = operation; if (Number.isInteger(status)) this.status = status; }
}
const fail = (code, operation, status) => { throw new VerificationError(code, operation, status); };
export const HELP = `Bounded AI smoke checks; no response text, audio, secrets, or tokens are printed.
  node tools/verify-ai.mjs                         # offline plan; no network
  node tools/verify-ai.mjs --offline                # same offline checks
  node tools/verify-ai.mjs --run --only config      # read-only live configuration
  node tools/verify-ai.mjs --run                    # one chat, TTS, ASR roundtrip
  node tools/verify-ai.mjs --run --only chat
  node tools/verify-ai.mjs --run --only speech      # one TTS and one ASR
  node tools/verify-ai.mjs --run --only assessment  # one Pro assessment separately
  node tools/verify-ai.mjs --run --assessment      # add Pro only if the combined estimate fits
  node tools/verify-ai.mjs --run --only vision --vision /absolute/fixture.png
  node tools/verify-ai.mjs --run --vision /absolute/fixture.jpg

--run is required for network access. No provider key is read or accepted.
The script uses the app's real gateway identity; it does not change or spoof source IPs.
Reservations use the backend's conservative estimates, not actual billing. Existing daily/monthly
usage may still block the run. Every selected operation is attempted at most once. An uncertain
failure is never retried. Optional checks are best run separately after reviewing prior usage.`;

export function parseArguments(argv) {
  const options = { run: false, only: null, assessment: false, vision: null, help: false };
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!['--run', '--offline', '--only', '--assessment', '--vision', '--help'].includes(arg) || seen.has(arg)) fail('invalid_arguments');
    seen.add(arg);
    if (arg === '--run') options.run = true;
    else if (arg === '--assessment') options.assessment = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--only' || arg === '--vision') {
      if (typeof argv[i + 1] !== 'string' || !argv[i + 1] || argv[i + 1].startsWith('--')) fail('missing_argument');
      options[arg.slice(2)] = argv[++i];
    }
  }
  if (seen.has('--run') && seen.has('--offline') || options.only && !['config', 'chat', 'speech', 'assessment', 'vision'].includes(options.only) ||
      options.only && options.assessment && options.only !== 'assessment' || options.only === 'vision' && !options.vision ||
      options.only && options.vision && options.only !== 'vision') fail('invalid_arguments');
  return options;
}

function messagesCost(operation, body) {
  if (operation === 'chat') {
    const input = validateChat(body), messages = [{ role: 'system', content: systemPrompt(input) }, ...input.messages];
    return quoteAICost('chat', { inputBytes: Buffer.byteLength(JSON.stringify(messages)), outputTokens: MAX_OUTPUT_TOKENS });
  }
  const input = validateAssessment(body), messages = [{ role: 'system', content: assessmentPrompt(input.task) }, { role: 'user', content: input.answer }];
  return quoteAICost('assessment', { inputBytes: Buffer.byteLength(JSON.stringify(messages)), outputTokens: MAX_ASSESSMENT_TOKENS });
}
async function visionFixture(file) {
  let handle;
  try {
    handle = await fs.open(file, 'r'); const info = await handle.stat();
    if (!info.isFile() || info.size < 15 || info.size > MAX_IMAGE_BYTES) fail('invalid_vision_fixture', 'vision');
    const buffer = Buffer.alloc(MAX_IMAGE_BYTES + 1); let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > MAX_IMAGE_BYTES) fail('invalid_vision_fixture', 'vision');
    const bytes = buffer.subarray(0, length);
    const mimeType = bytes[0] === 137 ? 'image/png' : 'image/jpeg';
    const body = { image: bytes.toString('base64'), mimeType, language: 'zh' };
    validatePhoto(body);
    const dimensions = imageDimensions(bytes, mimeType);
    if (!dimensions || dimensions.width > MAX_VISION_DIMENSION || dimensions.height > MAX_VISION_DIMENSION) fail('invalid_vision_fixture', 'vision');
    return { body, metadata: { mimeType, bytes: bytes.length, width: dimensions.width, height: dimensions.height } };
  } catch (_) { fail('invalid_vision_fixture', 'vision'); }
  finally { await handle?.close(); }
}
export async function makePlan(options) {
  let selected = options.only === 'config' ? [] : options.only === 'speech' ? ['tts', 'asr']
    : options.only ? [options.only] : ['chat', 'tts', 'asr'];
  if (!options.only && options.assessment) selected.push('assessment');
  if (!options.only && options.vision) selected.push('vision');
  const fixture = options.vision ? await visionFixture(options.vision) : null;
  const costs = { chat: messagesCost('chat', CHAT), tts: quoteAICost('tts', { characters: [...SPEECH.text].length * 2 }),
    asr: quoteAICost('asr', { audioSeconds: 30 }), assessment: messagesCost('assessment', ASSESSMENT), vision: visionCost() };
  const estimate = selected.reduce((sum, operation) => sum + costs[operation], 0);
  if (!Number.isSafeInteger(estimate) || estimate > DEFAULT_LIMITS.identityDailyMicroRubles) fail('plan_exceeds_source_daily_budget');
  if (selected.length > DEFAULT_LIMITS.identityMinuteRequests) fail('plan_exceeds_source_minute_limit');
  return { selected, fixture, metadata: { mode: options.run ? 'live' : 'offline', operations: selected,
    estimatedReservationRubles: estimate / 1000000, sourceDailyLimitRubles: DEFAULT_LIMITS.identityDailyMicroRubles / 1000000,
    appDailyLimitRubles: DEFAULT_LIMITS.dailyMicroRubles / 1000000, appMonthlyLimitRubles: DEFAULT_LIMITS.monthlyMicroRubles / 1000000,
    maximumAttemptsPerOperation: 1, existingUsageUnknown: true,
    estimates: Object.fromEntries(selected.map(operation => [operation, costs[operation] / 1000000])),
    ...(fixture ? { visionFixture: fixture.metadata } : {}) } };
}

async function boundedJSON(response, maximum, signal, operation) {
  const length = response.headers?.get('content-length');
  if (length != null && (!/^\d+$/.test(length) || Number(length) > maximum) ||
      !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type') || '')) {
    response.body?.cancel?.().catch(() => {}); fail('invalid_response_envelope', operation);
  }
  const reader = response.body?.getReader?.(); if (!reader || signal.aborted) fail('invalid_response_envelope', operation);
  let onAbort;
  const aborted = new Promise((_, reject) => { onAbort = () => reject(new VerificationError('request_timeout', operation)); });
  signal.addEventListener('abort', onAbort, { once: true });
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), aborted]); if (done) break;
      size += value.byteLength; if (size > maximum) fail('response_too_large', operation);
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch (error) { reader.cancel().catch(() => {}); if (error instanceof VerificationError) throw error; fail('invalid_response_json', operation); }
  finally { signal.removeEventListener('abort', onAbort); reader.releaseLock(); }
}
function requester(fetcher, now) {
  const deadline = now() + 240000, attempted = new Set();
  return async (operation, route, body, maximum = 128 * 1024) => {
    if (attempted.has(operation)) fail('duplicate_attempt_blocked', operation);
    attempted.add(operation);
    const remaining = deadline - now(); if (!Number.isFinite(remaining) || remaining <= 0) fail('run_deadline', operation);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), Math.min(operation === 'config' ? 10000 : operation === 'assessment' ? 200000 : 45000, remaining));
    try {
      const response = await fetcher(API + route, { method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: controller.signal, headers: { Origin: ORIGIN, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (response.status !== 200) {
        const failure = new VerificationError('http_error', operation, response.status);
        try {
          const data = await boundedJSON(response, 4096, controller.signal, operation);
          if (plain(data) && SAFE_ERROR_CODES.has(data.error)) failure.serverCode = data.error;
        } catch (_) { /* An unknown/malformed error body must never enter diagnostics. */ }
        throw failure;
      }
      const result = await boundedJSON(response, maximum, controller.signal, operation);
      if (controller.signal.aborted) fail('request_timeout', operation);
      return result;
    } catch (error) {
      if (error instanceof VerificationError) throw error;
      fail(controller.signal.aborted ? 'request_timeout' : 'request_failed', operation);
    } finally { clearTimeout(timeout); }
  };
}
export function validateConfig(config) {
  if (!plain(config) || FLAGS.some(key => typeof config[key] !== 'boolean') || config.maxInputChars !== 2000 ||
      Object.keys(config).some(key => /secret|token|api.?key/i.test(key))) fail('invalid_configuration', 'config');
  return Object.fromEntries([...FLAGS.map(key => [key, config[key]]), ['maxInputChars', config.maxInputChars]]);
}
export function validateChatResponse(value) {
  if (!exact(value, ['text', 'reply'])) fail('invalid_structured_reply', 'chat');
  try { validateReply(value.reply); } catch (_) { fail('invalid_structured_reply', 'chat'); }
  if (value.text !== replyText(value.reply) || !HAN.test(value.reply.zh) || !CYRILLIC.test(value.reply.ru) ||
      !CYRILLIC.test(value.reply.explanationRu) || !TONE.test(value.reply.pinyin)) fail('missing_expected_language', 'chat');
  return { structured: true, hasChinese: true, hasRussian: true, hasPinyinTones: true,
    textCharacters: [...value.text].length, corrections: value.reply.corrections.length, newWords: value.reply.newWords.length };
}
export function parsePcmWav(bytes, rate, operation = 'tts') {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46 || bytes.length > 4 * 1024 * 1024 + 44 ||
      bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('latin1', 8, 12) !== 'WAVE' ||
      bytes.toString('latin1', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 ||
      bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== rate || bytes.readUInt32LE(28) !== rate * 2 ||
      bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('latin1', 36, 40) !== 'data' ||
      bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2) fail('invalid_pcm_wav', operation);
  const frames = (bytes.length - 44) / 2;
  if (frames < rate / 10 || frames > rate * 30) fail('invalid_audio_duration', operation);
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + i * 2)));
  if (peak < 16) fail('silent_audio', operation);
  return { bytes: bytes.length, sampleRate: rate, channels: 1, bitsPerSample: 16, seconds: Math.round(frames / rate * 1000) / 1000, frames };
}
export function downsampleTo16k(source) {
  const { frames } = parsePcmWav(source, 24000), outputFrames = Math.floor(frames * 2 / 3);
  const result = Buffer.alloc(44 + outputFrames * 2);
  result.write('RIFF', 0); result.writeUInt32LE(result.length - 8, 4); result.write('WAVEfmt ', 8); result.writeUInt32LE(16, 16);
  result.writeUInt16LE(1, 20); result.writeUInt16LE(1, 22); result.writeUInt32LE(16000, 24); result.writeUInt32LE(32000, 28);
  result.writeUInt16LE(2, 32); result.writeUInt16LE(16, 34); result.write('data', 36); result.writeUInt32LE(outputFrames * 2, 40);
  // Area averaging applies a short low-pass filter while resampling the 3:2 ratio.
  for (let i = 0; i < outputFrames; i++) {
    const start = i * 1.5, end = start + 1.5; let sum = 0;
    for (let j = Math.floor(start); j < end && j < frames; j++) sum += source.readInt16LE(44 + j * 2) * (Math.min(end, j + 1) - Math.max(start, j));
    result.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(sum / 1.5))), 44 + i * 2);
  }
  try { validateWav({ audio: result.toString('base64'), mimeType: 'audio/wav' }); }
  catch (_) { fail('invalid_asr_audio_fixture', 'asr'); }
  parsePcmWav(result, 16000, 'asr');
  return result;
}
function speechBytes(value) {
  if (!exact(value, ['audio', 'mimeType']) || value.mimeType !== 'audio/wav' || typeof value.audio !== 'string' || !value.audio ||
      value.audio.length > Math.ceil((4 * 1024 * 1024 + 44) / 3) * 4 || value.audio.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.audio)) fail('invalid_audio_response', 'tts');
  const bytes = Buffer.from(value.audio, 'base64'); if (bytes.toString('base64') !== value.audio) fail('invalid_audio_response', 'tts');
  parsePcmWav(bytes, 24000); return bytes;
}
function validateAssessmentResponse(value) {
  const { task } = validateAssessment(ASSESSMENT);
  if (!plain(value) || value.taskId !== task.id || value.mode !== task.mode || value.level !== task.level || value.maxScore !== task.maxScore ||
      value.assessmentScope !== 'written_text' || !Array.isArray(value.criteria) || typeof value.noticeRu !== 'string' || !CYRILLIC.test(value.noticeRu)) fail('invalid_assessment', 'assessment');
  let expected;
  try { expected = validateAssessmentResult({ score: value.score, criteria: value.criteria.map(({ id, score, feedbackRu }) => ({ id, score, feedbackRu })),
    feedbackRu: value.feedbackRu, rewrite: value.rewrite }, task); } catch (_) { fail('invalid_assessment', 'assessment'); }
  if (!isDeepStrictEqual(value, expected) || !HAN.test(value.rewrite.zh) || !CYRILLIC.test(value.rewrite.ru) ||
      !CYRILLIC.test(value.feedbackRu) || !TONE.test(value.rewrite.pinyin)) fail('invalid_assessment', 'assessment');
  return { rubricValid: true, score: value.score, maxScore: value.maxScore, criteria: value.criteria.length, hasChinese: true, hasRussian: true, scope: value.assessmentScope };
}

export async function main(argv = process.argv.slice(2), { fetcher = fetch, emit = value => process.stdout.write(JSON.stringify(value) + '\n'), now = () => performance.now() } = {}) {
  const options = parseArguments(argv);
  if (options.help) { emit({ help: HELP }); return; }
  const plan = await makePlan(options); emit({ check: 'plan', ...plan.metadata });
  if (!options.run) { emit({ check: 'offline', passed: true, networkRequests: 0, note: 'Live availability and model quality have not been tested.' }); return; }
  const request = requester(fetcher, now), config = validateConfig(await request('config', '/ai/config', undefined, 16 * 1024));
  emit({ check: 'config', passed: true, ...config });
  const required = { chat: 'enabled', tts: 'ttsEnabled', asr: 'asrEnabled', assessment: 'assessmentEnabled', vision: 'visionEnabled' };
  for (const operation of plan.selected) if (!config[required[operation]]) fail('feature_unavailable', operation);
  let audio16k;
  for (const operation of plan.selected) {
    if (operation === 'chat') emit({ check: 'chat', passed: true, ...validateChatResponse(await request('chat', '/ai/chat', CHAT)) });
    else if (operation === 'tts') {
      const bytes = speechBytes(await request('tts', '/ai/speech', SPEECH, 6 * 1024 * 1024)); audio16k = downsampleTo16k(bytes);
      const { frames, ...audio } = parsePcmWav(bytes, 24000);
      emit({ check: 'tts', passed: true, ...audio, asrInputBytes: audio16k.length, asrSampleRate: 16000 });
    } else if (operation === 'asr') {
      if (!audio16k) fail('missing_speech_fixture', 'asr');
      const value = await request('asr', '/ai/transcribe', { audio: audio16k.toString('base64'), mimeType: 'audio/wav' }, 32 * 1024);
      if (!exact(value, ['text']) || typeof value.text !== 'string' || [...value.text].length > 3000 ||
          value.text.replace(/[^\p{Script=Han}]/gu, '') !== SPEECH.text) fail('transcript_mismatch', 'asr');
      emit({ check: 'asr', passed: true, hasChinese: true, matchesGreeting: true, characters: [...value.text].length });
    } else if (operation === 'assessment') emit({ check: 'assessment', passed: true, ...validateAssessmentResponse(await request('assessment', '/ai/assess', ASSESSMENT)) });
    else if (operation === 'vision') {
      const value = await request('vision', '/translate/photo', plan.fixture.body);
      if (!plain(value) || typeof value.text !== 'string' || !value.text.trim() || [...value.text].length > 20000 || value.truncated === true ||
          !HAN.test(value.text) && !CYRILLIC.test(value.text)) fail('invalid_vision_result', 'vision');
      emit({ check: 'vision', passed: true, characters: [...value.text].length, hasChinese: HAN.test(value.text), hasRussian: CYRILLIC.test(value.text) });
    }
  }
  emit({ check: 'complete', passed: true, attemptedOperations: plan.selected.length, noAutomaticRetries: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const failure = error instanceof VerificationError ? { operation: error.operation, error: error.code, ...(error.status ? { status: error.status } : {}),
      ...(SAFE_ERROR_CODES.has(error.serverCode) ? { serverCode: error.serverCode } : {}) }
      : { operation: 'setup', error: 'verification_failed' };
    const mayHaveCharged = !['setup', 'config'].includes(failure.operation) && !['feature_unavailable', 'invalid_vision_fixture'].includes(failure.error);
    process.stderr.write(JSON.stringify({ check: 'failed', ...failure, noAutomaticRetry: true, reservationMayRemainCharged: mayHaveCharged }) + '\n'); process.exitCode = 1;
  });
}
