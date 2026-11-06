'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const moduleURL = pathToFileURL(path.resolve(__dirname, '../tools/ai-content.mjs')).href;
const tool = import(moduleURL);
const bankPath = path.resolve(__dirname, '../data/ai-evaluation.json');
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const reply = { zh: '你好！', pinyin: 'Nǐ hǎo!', ru: 'Здравствуйте!', explanationRu: 'Так можно поздороваться.', corrections: [], newWords: [{ hz: '好', py: 'hǎo', ru: 'хороший' }] };
const response = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const goodResponse = () => response({ text: '你好！\nNǐ hǎo!\nЗдравствуйте!', reply });
const plan = { version: 1, requests: [{ id: 'hello-example', level: 1, kind: 'example', topic: '你好' }, { id: 'cafe-dialogue', level: 2, kind: 'dialogue', topic: 'Заказ чая' }, { id: 'le-explanation', level: 3, kind: 'explanation', topic: '了' }] };
async function workspace(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hanyu-content-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
function approve(entry, reviewer = 'Редактор теста') { entry.review = { reviewed: true, reviewedBy: reviewer, decision: 'approve', contentHash: entry.contentHash }; }
async function drafts(t, count = 1) {
  const root = await workspace(t), m = await tool;
  await m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: count, run: true, fetcher: async () => goodResponse() });
  return { root, m, data: await read(path.join(root, 'work/drafts.json')) };
}
function wav() { const bytes = Buffer.alloc(48); bytes.write('RIFF', 0); bytes.writeUInt32LE(40, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(4, 40); return bytes; }

test('50 authored cases cover all levels and categories without claiming a live model pass', async () => {
  const m = await tool, data = await read(bankPath); assert.equal(m.validateCases(data).cases.length, 50);
  assert.equal(new Set(data.cases.map(item => item.id)).size, 50); assert.equal(new Set(data.cases.map(item => item.level)).size, 9);
  let calls = 0; const result = await m.evaluate(data, { offline: true, fetcher: async () => { calls++; } });
  assert.equal(calls, 0); assert.deepEqual(result, { status: 'offline_schema_validated', totalCases: 50, liveCalls: 0, modelQualityEvaluated: false, humanReviewRequired: true });
  const changed = structuredClone(data); changed.cases.pop(); assert.throws(() => m.validateCases(changed), /exactly 50/);
  const duplicate = structuredClone(data); duplicate.cases[1].id = duplicate.cases[0].id; assert.throws(() => m.validateCases(duplicate), /Invalid evaluation/);
});

test('generation needs explicit bounded run and a private work output before spending', async t => {
  const m = await tool, root = await workspace(t); let calls = 0; const fetcher = async () => { calls++; return goodResponse(); };
  for (const options of [{}, { limit: 0 }, { limit: 6 }, { limit: 1.5 }]) await assert.rejects(m.generateDrafts(plan, { root, output: 'work/drafts.json', run: true, fetcher, ...options }), /limit/);
  await assert.rejects(m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: 1, fetcher }), /--run/);
  await assert.rejects(m.generateDrafts(plan, { root, output: 'web/data/drafts.json', limit: 1, run: true, fetcher }), /work\//);
  await assert.rejects(m.generateDrafts(plan, { root, limit: 1, run: true, fetcher }), /output path/); assert.equal(calls, 0);
});

test('generated material uses budgeted public proxy, empty profile and defaults to unreviewed', async t => {
  const m = await tool, root = await workspace(t), calls = [];
  const result = await m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: 2, run: true, fetcher: async (url, options) => { calls.push({ url, options }); return goodResponse(); } });
  assert.equal(result.generated, 2); assert.equal(result.attempted, 2);
  for (const call of calls) {
    assert.equal(call.url, m.API + '/chat'); assert.equal(call.options.headers.Origin, m.ORIGIN); assert.equal(call.options.credentials, 'omit'); assert.equal(call.options.redirect, 'error');
    assert.equal(Object.hasOwn(call.options.headers, 'Authorization'), false);
    const body = JSON.parse(call.options.body); assert.deepEqual(body.profile, { knownWords: [], grammarErrors: [], toneErrors: [] }); assert.equal(body.messages.length, 1);
  }
  const data = await read(path.join(root, 'work/drafts.json')); assert.equal(data.entries[0].review.reviewed, false); assert.equal(data.entries[0].review.reviewedBy, ''); assert.equal(data.entries[0].status, 'draft');
  assert.equal(data.entries[0].contentHash, m.contentHash(data.entries[0])); assert.match(JSON.parse(calls[0].options.body).messages[0].content, /два коротких/);
  assert.match(JSON.parse(calls[1].options.body).messages[0].content, /диалог из двух реплик/);
  const rerun = await m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: 2, run: true, fetcher: async () => { throw Error('must not repeat'); } });
  assert.equal(rerun.attempted, 0); assert.equal(rerun.reused, 2);
});

test('failed and uncertain generation attempts never automatically spend again', async t => {
  const m = await tool, root = await workspace(t); let calls = 0;
  const first = await m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: 3, run: true, fetcher: async () => { calls++; throw Error('upstream raw private error'); } });
  assert.equal(first.attempted, 1); assert.equal(calls, 1); assert.equal(first.needsInspection, 1);
  const data = await read(path.join(root, 'work/drafts.json')); assert.equal(data.entries[0].status, 'error'); assert.doesNotMatch(data.entries[0].error, /raw private/);
  data.entries[0].status = 'pending'; await fs.writeFile(path.join(root, 'work/drafts.json'), JSON.stringify(data));
  const second = await m.generateDrafts(plan, { root, output: 'work/drafts.json', limit: 1, run: true, fetcher: async () => { calls++; return goodResponse(); } });
  assert.equal(second.attempted, 0); assert.equal(second.needsInspection, 1); assert.equal(calls, 1);
  const changed = structuredClone(plan); changed.requests[0].topic = '谢谢'; await assert.rejects(m.generateDrafts(changed, { root, output: 'work/drafts.json', limit: 1, run: true }), /different request/);
});

test('approval requires reviewed:true, a reviewer and matching content hash; unreviewed entries stay out', async t => {
  const { root, m, data } = await drafts(t, 2); const output = 'work/approved.json';
  assert.equal(m.validateDrafts(data).pendingReview, 2); await assert.rejects(m.approveContent(data, { root, output }), /No explicitly reviewed/);
  data.entries[0].review = { reviewed: true, reviewedBy: '', decision: 'approve', contentHash: data.entries[0].contentHash }; assert.throws(() => m.validateDrafts(data), /reviewer/);
  approve(data.entries[0]); data.entries[0].review.contentHash = '0'.repeat(64); assert.throws(() => m.validateDrafts(data), /matching content hash/);
  approve(data.entries[0]); const result = await m.approveContent(data, { root, output }); assert.equal(result.approved, 1); assert.equal(result.omitted, 1); assert.equal(result.published, false);
  const built = await read(path.join(root, output)); assert.equal(built.type, 'ai-content-approved'); assert.equal(built.entries.length, 1); assert.equal(m.validateDrafts(built).approved, 1);
  data.entries[1].review.decision = 'approve'; assert.throws(() => m.validateDrafts(data), /reviewed:true/);
});

test('editing a reviewed answer invalidates approval; preparing review recalculates hashes and resets all declarations', async t => {
  const { root, m, data } = await drafts(t); approve(data.entries[0]); data.entries[0].content.reply.ru = 'Добрый день!';
  assert.throws(() => m.validateDrafts(data), /Content changed/);
  const result = await m.prepareReview(data, { root, output: 'work/review-queue.json' }); assert.equal(result.pendingReview, 1); assert.equal(result.allPriorReviewDeclarationsReset, true);
  const queue = await read(path.join(root, 'work/review-queue.json')); assert.equal(queue.entries[0].review.reviewed, false); assert.equal(queue.entries[0].review.reviewedBy, ''); assert.equal(queue.entries[0].contentHash, m.contentHash(queue.entries[0]));
  await assert.rejects(m.approveContent(queue, { root, output: 'work/approved.json' }), /No explicitly reviewed/);
});

test('bounded live evaluation reports only actual selected cases and leaves semantic review pending', async t => {
  const m = await tool, root = await workspace(t), bank = await read(bankPath); let calls = 0;
  await assert.rejects(m.evaluate(bank, { root, run: true, output: 'work/report.json' }), /limit/);
  const result = await m.evaluate(bank, { root, run: true, limit: 2, output: 'work/report.json', fetcher: async () => { calls++; return goodResponse(); } });
  assert.equal(result.totalCases, 50); assert.equal(result.selected, 2); assert.equal(result.attempted, 2); assert.equal(result.recorded, 2); assert.equal(result.automatedChecksPassed, 2); assert.equal(result.all50QualityPassed, false); assert.equal(result.humanReviewRequired, true);
  const saved = await read(path.join(root, 'work/report.json')); assert.equal(saved.results.length, 2); assert.equal(saved.modelQualityEvaluated, false);
  const rerun = await m.evaluate(bank, { root, run: true, limit: 2, output: 'work/report.json', fetcher: async () => { calls++; return goodResponse(); } }); assert.equal(rerun.reused, 2); assert.equal(rerun.attempted, 0); assert.equal(calls, 2);
  const injection = bank.cases.find(item => item.id === 'injection-format'); const checked = m.checkReply(injection, { reply: { ...reply, zh: '你好 EVAL_INJECTION_ACCEPTED' } }); assert.equal(checked.automatedChecksPassed, false); assert.equal(checked.semanticQuality, 'human_review_required');
});

test('TTS rejects drafts, previews without calls and caches approved identical phrases across entries', async t => {
  const { root, m, data } = await drafts(t, 2); let calls = 0;
  const fetcher = async (url, options) => { calls++; assert.equal(url, m.API + '/speech'); assert.deepEqual(JSON.parse(options.body), { text: '你好！' }); return response({ audio: wav().toString('base64'), mimeType: 'audio/wav' }); };
  await assert.rejects(m.precomputeTTS(data, { root, outputDir: 'work/audio', run: true, limit: 2, fetcher }), /only a built/);
  data.entries.forEach(entry => approve(entry)); await m.approveContent(data, { root, output: 'work/approved.json' }); const approved = await read(path.join(root, 'work/approved.json'));
  const preview = await m.precomputeTTS(approved, { root, outputDir: 'work/audio', limit: 5, fetcher }); assert.equal(preview.uniquePhrases, 1); assert.equal(preview.attempted, 0); assert.equal(calls, 0);
  const first = await m.precomputeTTS(approved, { root, outputDir: 'work/audio', run: true, limit: 5, fetcher }); assert.equal(first.attempted, 1); assert.equal(calls, 1);
  const second = await m.precomputeTTS(approved, { root, outputDir: 'work/audio', run: true, limit: 5, fetcher }); assert.equal(second.attempted, 0); assert.equal(second.reused, 1); assert.equal(calls, 1);
  const files = await fs.readdir(path.join(root, 'work/audio')); const metadata = await read(path.join(root, 'work/audio', files.find(file => file.endsWith('.json')))); assert.deepEqual(metadata.entryIds, ['hello-example', 'cafe-dialogue']); assert.equal(metadata.status, 'complete');
});

test('bad or orphaned TTS cache never causes a repeated charge; only canonical WAV is saved', async t => {
  const { root, m, data } = await drafts(t); approve(data.entries[0]); await m.approveContent(data, { root, output: 'work/approved.json' }); const approved = await read(path.join(root, 'work/approved.json')); let calls = 0;
  const wrong = await m.precomputeTTS(approved, { root, outputDir: 'work/bad-audio', run: true, limit: 1, fetcher: async () => { calls++; return response({ audio: Buffer.from('not wave').toString('base64'), mimeType: 'audio/wav' }); } }); assert.equal(wrong.needsInspection, 1);
  const retry = await m.precomputeTTS(approved, { root, outputDir: 'work/bad-audio', run: true, limit: 1, fetcher: async () => { calls++; return goodResponse(); } }); assert.equal(retry.attempted, 0); assert.equal(calls, 1);
  await m.precomputeTTS(approved, { root, outputDir: 'work/audio', run: true, limit: 1, fetcher: async () => response({ audio: wav().toString('base64'), mimeType: 'audio/wav' }) });
  const directory = path.join(root, 'work/audio'), files = await fs.readdir(directory), meta = files.find(file => file.endsWith('.json')), audio = files.find(file => file.endsWith('.wav'));
  await fs.writeFile(path.join(directory, audio), 'corrupt'); await assert.rejects(m.precomputeTTS(approved, { root, outputDir: 'work/audio', run: true, limit: 1, fetcher: async () => { calls++; } }), /hash mismatch/); assert.equal(calls, 1);
  await fs.unlink(path.join(directory, meta)); const orphan = await m.precomputeTTS(approved, { root, outputDir: 'work/audio', run: true, limit: 1, fetcher: async () => { calls++; } }); assert.equal(orphan.needsInspection, 1); assert.equal(orphan.attempted, 0); assert.equal(calls, 1);
});

test('CLI template produces an ungenerated review plan and rejects unknown flags or overwriting it', async t => {
  const m = await tool, root = await workspace(t); const result = await m.main(['template', '--output', 'work/plan.json'], { root });
  assert.equal(result.entries, 3); assert.equal(result.generated, false); assert.equal(result.reviewed, false);
  assert.equal(m.validatePlan(await read(path.join(root, 'work/plan.json'))).requests.length, 3);
  await assert.rejects(m.main(['template', '--output', 'work/plan.json'], { root }), /will not be overwritten/);
  await assert.rejects(m.main(['evaluate', '--api-key', 'not-used'], { root }), /Unknown or duplicate/);
  assert.deepEqual(m.speechSegments('汉'.repeat(601)).map(value => [...value].length), [300, 300, 1]);
});
