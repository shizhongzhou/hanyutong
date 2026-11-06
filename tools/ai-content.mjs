#!/usr/bin/env node
/* Bounded editorial tooling. No provider credentials, retries or publishing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const API = 'https://d5du0ehkavrgcuf0765l.3rspsmhh.apigw.yandexcloud.net/ai';
export const ORIGIN = 'https://shizhongzhou.github.io';
const CASES = path.join(ROOT, 'data/ai-evaluation.json');
const EMPTY_PROFILE = Object.freeze({ knownWords: [], grammarErrors: [], toneErrors: [] });
const CATEGORIES = ['vocabulary', 'grammar', 'scenario', 'correction', 'ambiguity', 'injection', 'off_topic'];
const fail = message => { throw Error(message); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const count = value => [...value].length;
const text = (value, max, empty = false) => typeof value === 'string' && (empty || !!value.trim()) && count(value) <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
const idOK = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{2,79}$/.test(value);
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const iso = () => new Date().toISOString();

export function validateCases(data) {
  if (!plain(data) || data.version !== 1 || !Array.isArray(data.cases) || data.cases.length !== 50) fail('Evaluation bank must contain exactly 50 version-1 cases.');
  const ids = new Set(), levels = new Set(), categories = new Set();
  for (const item of data.cases) {
    if (!plain(item) || !idOK(item.id) || ids.has(item.id) || !Number.isInteger(item.level) || item.level < 1 || item.level > 9 || !CATEGORIES.includes(item.category) || !['dialogue', 'explain'].includes(item.mode) || !text(item.prompt, 2000) || !Array.isArray(item.expectedQualities) || item.expectedQualities.length < 2 || item.expectedQualities.length > 8 || item.expectedQualities.some(value => !text(value, 500))) fail('Invalid evaluation case: ' + (item?.id || 'unknown'));
    if (!plain(item.checks) || Object.keys(item.checks).some(key => !['requireRussian', 'requireChinese', 'requirePinyin', 'maxNewWords', 'forbiddenSubstrings'].includes(key)) || item.checks.requireRussian !== true || item.checks.requireChinese !== true || item.checks.requirePinyin !== true || item.checks.maxNewWords !== 2 || !Array.isArray(item.checks.forbiddenSubstrings) || item.checks.forbiddenSubstrings.length > 10 || item.checks.forbiddenSubstrings.some(value => !text(value, 200))) fail('Invalid automated checks: ' + item.id);
    ids.add(item.id); levels.add(item.level); categories.add(item.category);
  }
  if (levels.size !== 9 || CATEGORIES.some(category => !categories.has(category))) fail('Evaluation bank must cover levels 1–9 and all required categories.');
  return data;
}

export function validateReply(reply) {
  if (!plain(reply) || !text(reply.zh, 1200) || !text(reply.pinyin, 2400) || !text(reply.ru, 2400) || !text(reply.explanationRu, 3600, true) || !Array.isArray(reply.corrections) || reply.corrections.length > 4 || !Array.isArray(reply.newWords) || reply.newWords.length > 2) fail('Invalid structured answer.');
  for (const item of reply.corrections) if (!plain(item) || !['grammar', 'word'].includes(item.kind) || !text(item.original, 200) || !text(item.corrected, 200) || !text(item.explanationRu, 500)) fail('Invalid correction.');
  for (const word of reply.newWords) if (!plain(word) || !text(word.hz, 20) || !text(word.py, 100) || !text(word.ru, 240)) fail('Invalid new word.');
  return { zh: reply.zh, pinyin: reply.pinyin, ru: reply.ru, explanationRu: reply.explanationRu,
    corrections: reply.corrections.map(({ original, corrected, explanationRu, kind }) => ({ original, corrected, explanationRu, kind })),
    newWords: reply.newWords.map(({ hz, py, ru }) => ({ hz, py, ru })) };
}
function responseContent(value) {
  if (!plain(value) || !text(value.text, 12000) || value.truncated === true) fail('Incomplete structured answer; nothing may be approved.');
  return { text: value.text, reply: validateReply(value.reply) };
}
export function contentHash(entry) { return hash({ id: entry.id, level: entry.level, kind: entry.kind, topic: entry.topic, sourceWordId: entry.sourceWordId || null, content: responseContent(entry.content) }); }
export function validatePlan(data) {
  if (!plain(data) || data.version !== 1 || !Array.isArray(data.requests) || !data.requests.length || data.requests.length > 1000) fail('Plan must contain 1–1000 requests.');
  const ids = new Set();
  for (const item of data.requests) {
    if (!plain(item) || !idOK(item.id) || ids.has(item.id) || !Number.isInteger(item.level) || item.level < 1 || item.level > 9 || !['example', 'dialogue', 'explanation'].includes(item.kind) || !text(item.topic, 300) || item.sourceWordId !== undefined && !/^hsk3-\d{5}$/.test(item.sourceWordId)) fail('Invalid or duplicate generation request.');
    ids.add(item.id);
  }
  return data;
}
function generationPrompt(item) {
  const task = { example: 'Создай два коротких китайских примера употребления, пиньинь и русский перевод. В explanationRu объясни употребление.',
    dialogue: 'Создай короткий учебный диалог из двух реплик по ситуации. В zh запиши обе реплики, в pinyin и ru дай соответствующие строки. В explanationRu поясни употребление.',
    explanation: 'Объясни по-русски значение и употребление, важное ограничение и бытовую ситуацию. Дай один короткий китайский пример с пиньинем и переводом.' }[item.kind];
  return `${task}\nТема: ${item.topic}\nЭто редакционный черновик для HSK ${item.level}; не объявляй его официальным материалом. Введи не более двух новых слов.`;
}
function selection(items, limit, offset = 0) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) fail('An explicit --limit from 1 to 5 is required.');
  if (!Number.isInteger(offset) || offset < 0 || offset >= items.length) fail('Offset is outside the available entries.');
  return items.slice(offset, offset + limit);
}
async function readJSON(file, max = 20 * 1024 * 1024) {
  const stats = await fs.stat(file); if (!stats.isFile() || stats.size > max) fail('Input is not a bounded JSON file.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function existingJSON(file) { try { return await readJSON(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomicJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  try { if ((await fs.lstat(file)).isSymbolicLink()) fail('Refusing to overwrite a symbolic link.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(data, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }); }
}
function outputPath(output, root, workOnly = true) {
  if (!text(output, 4096)) fail('An explicit output path is required.');
  const resolved = path.resolve(root, output), work = path.join(root, 'work');
  if (workOnly && !resolved.startsWith(work + path.sep)) fail('Drafts, reports and audio caches must be written inside this repository’s work/ directory.');
  return resolved;
}
async function post(endpoint, body, fetcher = fetch, maxBytes = 256 * 1024) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 75000); timer.unref?.();
  try {
    const response = await fetcher(API + endpoint, { method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) { await response.body?.cancel?.(); fail(`Cloud request failed (HTTP ${response.status}); no automatic retry.`); }
    const length = response.headers?.get('content-length'); if (length != null && (!/^\d+$/.test(length) || +length > maxBytes)) { await response.body?.cancel?.(); fail('Cloud response exceeds its size bound.'); }
    const reader = response.body?.getReader?.(); if (!reader) fail('Cloud returned an unreadable response.');
    const chunks = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maxBytes) { await reader.cancel(); fail('Cloud response exceeds its size bound.'); } chunks.push(Buffer.from(value)); } }
    finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) { if (controller.signal.aborted) fail('Cloud request timed out; its budget reservation may remain charged.'); if (/^Cloud /.test(error.message)) throw error; fail('Cloud request or response failed; no automatic retry.'); }
  finally { clearTimeout(timer); }
}
function chatBody(prompt, level, mode) { return { messages: [{ role: 'user', content: prompt }], level, mode, profile: { ...EMPTY_PROFILE } }; }
function safeFailure(error) { return /^Cloud /.test(error.message) ? error.message : 'Response validation or local write failed; inspect before another request.'; }

export async function generateDrafts(plan, { output, limit, offset = 0, run = false, root = ROOT, fetcher = fetch } = {}) {
  validatePlan(plan); const chosen = selection(plan.requests, limit, offset), target = outputPath(output, root);
  if (!run) fail('Generation makes billed cloud calls. Add --run explicitly.');
  const data = await existingJSON(target) || { version: 1, type: 'ai-content-drafts', createdAt: iso(), entries: [] };
  if (data.type !== 'ai-content-drafts') fail('Generation cannot overwrite an approved content file.');
  validateDrafts(data); const report = { selected: chosen.length, attempted: 0, generated: 0, reused: 0, needsInspection: 0, output: target };
  for (const item of chosen) {
    const body = chatBody(generationPrompt(item), item.level, item.kind === 'dialogue' ? 'dialogue' : 'explain'), requestHash = hash({ endpoint: '/chat', body });
    const old = data.entries.find(entry => entry.id === item.id);
    if (old) { if (old.requestHash !== requestHash) fail('An existing ID has a different request. Use a new ID and review deliberately.'); if (old.status === 'draft') report.reused++; else report.needsInspection++; continue; }
    const entry = { id: item.id, level: item.level, kind: item.kind, topic: item.topic, ...(item.sourceWordId ? { sourceWordId: item.sourceWordId } : {}), requestHash,
      attemptedAt: iso(), status: 'pending', review: { reviewed: false, reviewedBy: '', decision: 'pending', contentHash: '' } };
    data.entries.push(entry); await atomicJSON(target, data); report.attempted++;
    try { entry.content = responseContent(await post('/chat', body, fetcher)); entry.status = 'draft'; entry.contentHash = contentHash(entry); entry.generatedAt = iso(); report.generated++; }
    catch (error) { entry.status = 'error'; entry.error = safeFailure(error); report.needsInspection++; }
    await atomicJSON(target, data);
    if (entry.status === 'error') break;
  }
  return report;
}

export function validateDrafts(data) {
  if (!plain(data) || data.version !== 1 || !['ai-content-drafts', 'ai-content-approved'].includes(data.type) || !Array.isArray(data.entries) || data.entries.length > 1000) fail('Invalid editorial content file.');
  const ids = new Set(); let approved = 0, pendingReview = 0, needsInspection = 0;
  for (const entry of data.entries) {
    if (!plain(entry) || !idOK(entry.id) || ids.has(entry.id) || !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 9 || !['example', 'dialogue', 'explanation'].includes(entry.kind) || !text(entry.topic, 300) || !/^[a-f0-9]{64}$/.test(entry.requestHash || '') || !['draft', 'pending', 'error'].includes(entry.status) || !plain(entry.review)) fail('Invalid editorial entry.');
    ids.add(entry.id);
    if (entry.status !== 'draft') { if (entry.review.reviewed === true) fail('Unfinished generation cannot be reviewed.'); needsInspection++; continue; }
    const digest = contentHash(entry); if (entry.contentHash !== digest) fail('Content changed without an updated contentHash. Run validate on the edited copy after recomputing its hash.');
    if (entry.review.reviewed === true) {
      if (!text(entry.review.reviewedBy, 100) || !['approve', 'reject'].includes(entry.review.decision) || entry.review.contentHash !== digest) fail('A review needs an explicit reviewer, decision and matching content hash.');
      if (entry.review.decision === 'approve') approved++;
    } else { if (entry.review.decision === 'approve') fail('Approval requires reviewed:true on that entry.'); pendingReview++; }
  }
  if (data.type === 'ai-content-approved' && (approved !== data.entries.length || !approved)) fail('An approved file must contain only explicitly reviewed and approved entries.');
  return { schemaValid: true, entries: data.entries.length, approved, pendingReview, needsInspection, humanReviewVerified: false };
}
export async function approveContent(data, { output, root = ROOT } = {}) {
  const summary = validateDrafts(data), target = outputPath(output, root, false);
  if (!summary.approved) fail('No explicitly reviewed entries are approved. No output was written.');
  const entries = data.entries.filter(entry => entry.status === 'draft' && entry.review.reviewed === true && entry.review.decision === 'approve');
  const approved = { version: 1, type: 'ai-content-approved', builtAt: iso(), reviewNotice: 'Review identities are explicit reviewer declarations, not independently verified by this tool.', entries };
  await atomicJSON(target, approved); return { output: target, approved: entries.length, omitted: data.entries.length - entries.length, published: false };
}
export async function prepareReview(data, { output, root = ROOT } = {}) {
  if (!plain(data) || data.type !== 'ai-content-drafts' || !Array.isArray(data.entries)) fail('Only draft entries can enter a new review queue.');
  const copy = structuredClone(data);
  for (const entry of copy.entries) {
    if (entry.status === 'draft') entry.contentHash = contentHash(entry);
    entry.review = { reviewed: false, reviewedBy: '', decision: 'pending', contentHash: '' };
  }
  const summary = validateDrafts(copy), target = outputPath(output, root); await atomicJSON(target, copy);
  return { output: target, ...summary, allPriorReviewDeclarationsReset: true };
}

export function checkReply(item, content) {
  const reply = validateReply(content.reply), combined = JSON.stringify(reply);
  const checks = { structured: true, chinesePresent: /\p{Script=Han}/u.test(reply.zh), russianPresent: /[А-Яа-яЁё]/u.test(reply.ru), pinyinPresent: /[A-Za-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u.test(reply.pinyin), newWordsBounded: reply.newWords.length <= item.checks.maxNewWords,
    forbiddenStringsAbsent: item.checks.forbiddenSubstrings.every(value => !combined.toLowerCase().includes(value.toLowerCase())) };
  return { checks, automatedChecksPassed: Object.values(checks).every(Boolean), semanticQuality: 'human_review_required', expectedQualities: item.expectedQualities };
}
export async function evaluate(data, { offline = false, run = false, limit, offset = 0, output, root = ROOT, fetcher = fetch } = {}) {
  validateCases(data); if (offline && run) fail('Choose --offline or --run, not both.');
  if (offline) return { status: 'offline_schema_validated', totalCases: 50, liveCalls: 0, modelQualityEvaluated: false, humanReviewRequired: true };
  if (!run) fail('Choose --offline for schema validation or --run for bounded billed checks.');
  const chosen = selection(data.cases, limit, offset), target = outputPath(output, root), report = await existingJSON(target) || { version: 1, type: 'ai-evaluation-report', totalCases: 50, results: [] };
  if (report.type !== 'ai-evaluation-report' || report.version !== 1 || !Array.isArray(report.results) || report.results.length > 50) fail('Invalid existing evaluation report.');
  let attempted = 0, reused = 0;
  for (const item of chosen) {
    const body = chatBody(item.prompt, item.level, item.mode), requestHash = hash({ case: item, body }), old = report.results.find(result => result.id === item.id);
    if (old) { if (old.requestHash !== requestHash) fail('Case changed. Choose a new report file deliberately.'); reused++; continue; }
    const result = { id: item.id, level: item.level, category: item.category, requestHash, status: 'pending', attemptedAt: iso(), semanticQuality: 'human_review_required' };
    report.results.push(result); await atomicJSON(target, report); attempted++;
    try { result.content = responseContent(await post('/chat', body, fetcher)); Object.assign(result, checkReply(item, result.content)); result.status = 'received'; }
    catch (error) { result.status = 'error'; result.error = safeFailure(error); }
    report.modelQualityEvaluated = false; report.humanReviewRequired = true; await atomicJSON(target, report);
    if (result.status === 'error') break;
  }
  return { output: target, totalCases: 50, selected: chosen.length, attempted, reused, recorded: report.results.length,
    automatedChecksPassed: report.results.filter(result => result.automatedChecksPassed).length, humanReviewRequired: true, all50QualityPassed: false };
}

export function speechSegments(value) {
  if (!text(value, 1200)) fail('Invalid approved speech text.');
  const segments = [], points = [...value];
  for (let start = 0; start < points.length; start += 300) { const part = points.slice(start, start + 300).join('').trim(); if (part && /\p{Script=Han}/u.test(part)) segments.push(part); }
  return segments;
}
function decodeWav(result) {
  if (!plain(result) || result.mimeType !== 'audio/wav' || typeof result.audio !== 'string' || !result.audio || result.audio.length > 6 * 1024 * 1024 || result.audio.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.audio)) fail('Invalid speech response.');
  const bytes = Buffer.from(result.audio, 'base64');
  if (bytes.toString('base64') !== result.audio || bytes.length < 46 || bytes.length > 4 * 1024 * 1024 + 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 24000 || bytes.readUInt32LE(28) !== 48000 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44 || (bytes.length - 44) % 2) fail('Invalid canonical course WAV.');
  return bytes;
}
export async function precomputeTTS(data, { outputDir, limit, offset = 0, run = false, root = ROOT, fetcher = fetch } = {}) {
  validateDrafts(data); if (data.type !== 'ai-content-approved') fail('TTS accepts only a built, explicitly reviewed approved file.');
  const directory = outputPath(outputDir, root), units = new Map();
  for (const entry of data.entries) for (const phrase of speechSegments(entry.content.reply.zh)) {
    const key = hash({ contract: 'qwen3-tts-flash/Cherry/Chinese/pcm24k/v1', text: phrase });
    if (!units.has(key)) units.set(key, { key, text: phrase, entryIds: [] }); units.get(key).entryIds.push(entry.id);
  }
  const chosen = selection([...units.values()], limit, offset), summary = { run, selected: chosen.length, uniquePhrases: units.size, attempted: 0, reused: 0, needsInspection: 0, outputDir: directory, published: false };
  for (const unit of chosen) {
    const metadataPath = path.join(directory, unit.key + '.json'), audioPath = path.join(directory, unit.key + '.wav'), existing = await existingJSON(metadataPath);
    if (existing) {
      if (existing.key !== unit.key || existing.text !== unit.text) fail('Audio cache metadata mismatch.');
      if (existing.status === 'complete') {
        let bytes; try { bytes = await fs.readFile(audioPath); } catch (_) { fail('Cached audio is missing; inspect it before another billed call.'); }
        if (hash(bytes) !== existing.audioHash) fail('Cached audio hash mismatch; no automatic regeneration.');
        summary.reused++;
      } else summary.needsInspection++;
      continue;
    }
    try { await fs.stat(audioPath); summary.needsInspection++; continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!run) continue;
    const metadata = { ...unit, status: 'pending', attemptedAt: iso() }; await atomicJSON(metadataPath, metadata); summary.attempted++;
    try {
      const bytes = decodeWav(await post('/speech', { text: unit.text }, fetcher, 8 * 1024 * 1024));
      await fs.writeFile(audioPath, bytes, { flag: 'wx', mode: 0o600 }); metadata.status = 'complete'; metadata.audioHash = hash(bytes); metadata.bytes = bytes.length; metadata.mimeType = 'audio/wav';
    } catch (error) { metadata.status = 'error'; metadata.error = safeFailure(error); summary.needsInspection++; }
    await atomicJSON(metadataPath, metadata); if (metadata.status === 'error') break;
  }
  return summary;
}

const HELP = `Editorial tools; no command publishes or installs content.
  evaluate --offline [--cases data/ai-evaluation.json]
  evaluate --run --limit 1..5 [--offset N] --output work/evaluation.json
  template --output work/content-plan.json
  generate --run --limit 1..5 [--offset N] --input work/content-plan.json --output work/drafts.json
  validate --input work/drafts.json
  prepare-review --input work/edited-drafts.json --output work/review-queue.json
  approve --input work/reviewed.json --output work/approved.json
  build --input work/reviewed.json --output web/data/ai-content.json
  tts --input work/approved.json --limit 1..5 --output-dir work/course-audio [--run] [--offset N]

Generate writes review.reviewed:false. A human must inspect each answer, set review.reviewed:true,
review.reviewedBy to their name, review.decision to approve or reject, and copy that entry's
contentHash into review.contentHash. The tool does not claim to verify the reviewer's identity.
If the content is edited, prepare-review recalculates hashes and resets every review declaration
before a human reviews it again. Approval/build excludes unfinished and unreviewed entries and refuses
an empty output. Billed attempts are journaled before calls; pending/error entries are never retried
automatically. To retry after inspection, deliberately use a new output/ID or remove only the reviewed
failed cache marker. --run may consume the app's existing cloud budget. Limit is per invocation.
Offline evaluation validates the 50-case bank, not the model's answers. Live checks still need human review.`;

export async function main(argv = process.argv.slice(2), { root = ROOT, fetcher = fetch } = {}) {
  const [command, ...args] = argv; if (!command || command === 'help' || command === '--help') return HELP;
  const flags = {}; const allowed = new Set(['input', 'output', 'output-dir', 'cases', 'limit', 'offset', 'run', 'offline']);
  for (let i = 0; i < args.length; i++) { const name = args[i].replace(/^--/, ''); if (!args[i].startsWith('--') || !allowed.has(name) || Object.hasOwn(flags, name)) fail('Unknown or duplicate flag.'); if (['run', 'offline'].includes(name)) flags[name] = true; else { if (!args[i + 1] || args[i + 1].startsWith('--')) fail('Flag needs a value: ' + name); flags[name] = args[++i]; } }
  const options = { root, fetcher, output: flags.output, outputDir: flags['output-dir'], run: flags.run === true, offline: flags.offline === true,
    limit: flags.limit === undefined ? undefined : Number(flags.limit), offset: flags.offset === undefined ? 0 : Number(flags.offset) };
  if (command === 'evaluate') return evaluate(await readJSON(path.resolve(root, flags.cases || CASES)), options);
  if (command === 'template') {
    const output = outputPath(flags.output, root), plan = { version: 1, requests: [
      { id: 'hsk1-hello-examples', level: 1, kind: 'example', topic: '你好：приветствие при знакомстве' },
      { id: 'hsk2-cafe-dialogue', level: 2, kind: 'dialogue', topic: 'Заказать чай в кафе: 请、要、一杯茶' },
      { id: 'hsk3-le-explanation', level: 3, kind: 'explanation', topic: 'Разница между 我吃了饭 и 我吃饭了' }
    ] }; if (await existingJSON(output)) fail('Template output exists; it will not be overwritten.'); await atomicJSON(output, plan); return { output, entries: 3, generated: false, reviewed: false };
  }
  if (!flags.input) fail('An explicit --input file is required.'); const inputPath = path.resolve(root, flags.input), input = await readJSON(inputPath);
  if (command === 'generate') return generateDrafts(input, options);
  if (command === 'validate') return validateDrafts(input);
  if (command === 'prepare-review') { if (flags.output && path.resolve(root, flags.output) === inputPath) fail('Choose a separate review-queue output.'); return prepareReview(input, options); }
  if (['approve', 'build'].includes(command)) { if (flags.output && path.resolve(root, flags.output) === inputPath) fail('Keep the human-reviewed input; choose a different output.'); return approveContent(input, options); }
  if (command === 'tts') return precomputeTTS(input, options);
  fail('Unknown command. Use help.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(result => process.stdout.write(typeof result === 'string' ? result + '\n' : JSON.stringify(result, null, 2) + '\n'))
    .catch(error => { process.stderr.write('ai-content: ' + error.message + '\n'); process.exitCode = 1; });
}
