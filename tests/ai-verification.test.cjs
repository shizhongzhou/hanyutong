'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const verifier = import(pathToFileURL(path.join(__dirname, '../tools/verify-ai.mjs')).href);
const { validateAssessmentResult } = require('../infra/yandex/function/ai-assessment');
const bank = require('../infra/yandex/function/assessment-tasks.json');
const config = { enabled: true, visionEnabled: true, ttsEnabled: true, asrEnabled: true,
  assessmentEnabled: true, feedbackEnabled: true, maxInputChars: 2000 };
function assessment() {
  const task = bank.tasks.find(item => item.id === 'writing-hsk1-01');
  return validateAssessmentResult({ score: task.maxScore,
    criteria: task.criteria.map(item => ({ id: item.id, score: item.maxScore, feedbackRu: 'Задание выполнено.' })),
    feedbackRu: 'Ответ понятен.', rewrite: { zh: '我喜欢中文。', pinyin: 'Wǒ xǐhuan Zhōngwén.', ru: 'Мне нравится китайский язык.' } }, task);
}

test('verification is offline unless explicitly requested and the Pro estimate remains bounded', async () => {
  const { main } = await verifier; const output = []; let calls = 0;
  await main(['--offline', '--only', 'assessment'], { emit: value => output.push(value), fetcher: () => { calls++; throw Error('network must stay unused'); } });
  assert.equal(calls, 0); assert.equal(output.at(-1).networkRequests, 0);
  assert.ok(output[0].estimatedReservationRubles > 0 && output[0].estimatedReservationRubles <= 6);
  assert.equal(output[0].appDailyLimitRubles, 10); assert.equal(output[0].appMonthlyLimitRubles, 70);
});

test('verification allows a 200 second assessment and still clamps it to a 240 second run', async t => {
  const { main } = await verifier; const scheduled = [];
  t.mock.method(global, 'setTimeout', (_fn, ms) => { scheduled.push(ms); return 1; });
  t.mock.method(global, 'clearTimeout', () => {});
  for (const [elapsedBeforeAssessment, expected] of [[10000, 200000], [60000, 180000]]) {
    const times = [0, 0, elapsedBeforeAssessment], output = []; let calls = 0;
    await main(['--run', '--only', 'assessment'], { now: () => times.shift(), emit: value => output.push(value),
      fetcher: async url => { calls++; return Response.json(url.endsWith('/config') ? config : assessment()); } });
    assert.equal(calls, 2); assert.equal(output.at(-1).noAutomaticRetries, true);
    assert.deepEqual(scheduled.splice(0), [10000, expected]);
  }
  const times = [0, 0, 240001]; let calls = 0;
  await assert.rejects(main(['--run', '--only', 'assessment'], { now: () => times.shift(), emit: () => {},
    fetcher: async () => { calls++; return Response.json(config); } }), error => error.code === 'run_deadline' && error.operation === 'assessment');
  assert.equal(calls, 1, 'an expired run never starts another paid operation');
});

test('verification reports only allowlisted failure codes and never retries uncertain HTTP errors', async () => {
  const { main } = await verifier;
  for (const [body, expected] of [[{ error: 'request_timeout', detail: 'secret-provider-body' }, 'request_timeout'],
    [{ error: 'daily_limit', credential: 'secret-provider-body' }, 'daily_limit'],
    [{ error: 'assessment_incomplete' }, 'assessment_incomplete'], [{ error: 'secret-provider-body' }, undefined],
    [{ error: { message: 'secret-provider-body' } }, undefined]]) {
    let calls = 0; const output = [];
    await assert.rejects(main(['--run', '--only', 'assessment'], { emit: value => output.push(value), fetcher: async url => {
      calls++; return url.endsWith('/config') ? Response.json(config) : Response.json(body, { status: 504 });
    } }), error => {
      assert.equal(error.code, 'http_error'); assert.equal(error.status, 504); assert.equal(error.serverCode, expected);
      assert.doesNotMatch(String(error) + JSON.stringify(error), /secret-provider-body/); return true;
    });
    assert.equal(calls, 2); assert.doesNotMatch(JSON.stringify(output), /secret-provider-body/);
  }
});

test('verification bounds malformed, HTML, oversized and stalled error responses without logging their bodies', async t => {
  const { main } = await verifier;
  let timeout;
  t.mock.method(global, 'setTimeout', fn => { timeout = fn; return 1; });
  t.mock.method(global, 'clearTimeout', () => {});
  for (const makeError of [
    () => new Response('<html>secret-provider-body</html>', { status: 504, headers: { 'Content-Type': 'text/html' } }),
    () => new Response('secret-provider-body', { status: 502, headers: { 'Content-Type': 'application/json' } }),
    () => Response.json({ error: 'request_timeout', detail: 'secret-provider-body'.repeat(500) }, { status: 504 }),
    () => new Response(new ReadableStream({ start(controller) { controller.enqueue(Buffer.from('{"error":"request_timeout"')); } }),
      { status: 504, headers: { 'Content-Type': 'application/json' } })
  ]) {
    let calls = 0;
    const pending = main(['--run', '--only', 'assessment'], { emit: () => {}, fetcher: async url => {
      calls++; return url.endsWith('/config') ? Response.json(config) : makeError();
    } });
    const rejected = assert.rejects(pending, error => error.code === 'http_error' && error.serverCode === undefined && !/secret-provider-body/.test(String(error)));
    for (let i = 0; i < 50 && calls < 2; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 2);
    // A stalled error body is still governed by the original operation deadline.
    timeout();
    await rejected;
    assert.equal(calls, 2);
  }
});
