const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAIAssessmentHandler, validateTaskBank, validateAssessment, validateAssessmentResult, assessmentPrompt,
  publicTasks, DEFAULT_ASSESSMENT_MODEL, MAX_ASSESSMENT_TOKENS } = require('../infra/yandex/function/ai-assessment.js');
const { quoteAICost } = require('../infra/yandex/function/ai-budget.js');
const bank = require('../infra/yandex/function/assessment-tasks.json');
const KEY = 'test-only-provider-key', ORIGIN = 'https://shizhongzhou.github.io';
const input = (mode = 'writing', level = 1) => ({ mode, taskId: `${mode}-hsk${level}-01`, answer: '我叫小安。我来自俄罗斯。我喜欢中文。' });
function event(body = input(), overrides = {}) {
  return { path: '/ai/assess', httpMethod: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body), requestContext: { identity: { sourceIp: '192.0.2.4' } }, ...overrides };
}
const task = id => bank.tasks.find(item => item.id === id);
const assessment = (id = 'writing-hsk1-01') => ({ score: 10, criteria: task(id).criteria.map(item => ({ id: item.id, score: item.maxScore, feedbackRu: 'Задание выполнено корректно.' })),
  feedbackRu: 'Ответ понятен. Продолжайте практиковаться.', rewrite: { zh: '我喜欢中文。', pinyin: 'Wǒ xǐhuan Zhōngwén.', ru: 'Мне нравится китайский язык.' } });
const provider = value => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify(value), reasoning_content: 'private model reasoning' }, finish_reason: 'stop' }], usage: { total_tokens: 100 } });
function fixture(options = {}) {
  const calls = [], reservations = [], order = [];
  const handler = createAIAssessmentHandler({ enabled: true, apiKey: KEY,
    reserveUsage: async (usage, context) => { order.push('reserve'); reservations.push({ usage, context }); return { allowed: true }; },
    fetcher: async (url, config) => { order.push('provider'); calls.push({ url, ...config }); return Response.json(provider(assessment())); }, ...options });
  return { handler, calls, reservations, order };
}
const json = result => JSON.parse(result.body);

test('the original practice bank covers all nine levels and three modes with consistent internal rubrics', () => {
  assert.equal(bank.tasks.length, 27);
  assert.equal(validateTaskBank(bank), bank);
  for (const mode of ['writing', 'speaking', 'grammar']) {
    assert.deepEqual(bank.tasks.filter(item => item.mode === mode).map(item => item.level), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  assert.match(bank.noticeRu, /не являются результатом официального экзамена/);
  for (const item of bank.tasks) {
    assert.equal(item.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0), item.maxScore);
    assert.ok(item.sample.zh && item.sample.pinyin && item.sample.ru);
  }
});

test('invalid task banks fail instead of silently changing answer keys or rubric totals', () => {
  const mutations = [value => { value.tasks[0].maxScore = 11; }, value => { value.tasks[0].sample.pinyin = ''; },
    value => { value.tasks[0].level = 10; }, value => { value.tasks[0].criteria[1].id = value.tasks[0].criteria[0].id; },
    value => { value.tasks[1].id = value.tasks[0].id; }, value => { value.kind = 'official_hsk'; }];
  for (const mutate of mutations) { const value = JSON.parse(JSON.stringify(bank)); mutate(value); assert.throws(() => validateTaskBank(value), /invalid_task_bank/); }
});

test('public task discovery works while assessments are disabled and does not disclose answer samples', async () => {
  const { handler, calls, reservations } = fixture({ enabled: false });
  const response = await handler(event(undefined, { path: '/ai/tasks', httpMethod: 'GET', headers: {} }));
  assert.equal(response.statusCode, 200); assert.deepEqual(json(response), publicTasks());
  assert.equal(json(response).tasks.length, 27);
  assert.doesNotMatch(response.body, /"sample"|"descriptorRu"|test-only/);
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('enabled assessments require durable reservation before one Pro thinking call without a membership gate', async () => {
  const { handler, calls, reservations, order } = fixture(); const context = { requestId: 'server-value' };
  const request = event(); const result = await handler(request, context);
  assert.equal(result.statusCode, 200); assert.deepEqual(order, ['reserve', 'provider']);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer ' + KEY); assert.equal(calls[0].redirect, 'error');
  const payload = JSON.parse(calls[0].body);
  assert.equal(DEFAULT_ASSESSMENT_MODEL, 'deepseek-v4-pro'); assert.equal(payload.model, DEFAULT_ASSESSMENT_MODEL);
  assert.deepEqual(payload.thinking, { type: 'enabled' }); assert.equal(payload.reasoning_effort, 'low');
  assert.equal(payload.max_tokens, 2000); assert.equal(payload.stream, false); assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.messages[0].role, 'system'); assert.match(payload.messages[0].content, /тренировочная рубрика/);
  assert.deepEqual(payload.messages[1], { role: 'user', content: input().answer });
  assert.deepEqual(reservations[0], { usage: { operation: 'assessment', identity: '192.0.2.4',
    costMicroRubles: quoteAICost('assessment', { inputBytes: Buffer.byteLength(JSON.stringify(payload.messages)), outputTokens: MAX_ASSESSMENT_TOKENS }) }, context });
  const data = json(result);
  assert.equal(data.taskId, input().taskId); assert.equal(data.level, 1); assert.equal(data.mode, 'writing');
  assert.equal(data.score, 10); assert.equal(data.maxScore, 10);
  assert.equal(data.criteria.reduce((sum, item) => sum + item.score, 0), data.score);
  assert.deepEqual(data.sample, task(input().taskId).sample); assert.equal(data.assessmentScope, 'written_text');
  assert.doesNotMatch(result.body, /private model reasoning|test-only|total_tokens|requestId|premium/);
});

test('default or incomplete paid configuration cannot invoke the Pro provider', async () => {
  for (const options of [{ enabled: false }, { enabled: 'true' }, { apiKey: '' }, { apiKey: 'bad\nkey' },
    { model: 'deepseek-pro' }, { model: 'deepseek-flash' }, { reserveUsage: undefined }]) {
    const { handler, calls, reservations } = fixture(options);
    assert.equal((await handler(event())).statusCode, 503); assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
  }
  assert.equal(json(await createAIAssessmentHandler({ enabled: false })(event())).error, 'assessment_disabled');
});

test('clients cannot change server task, rubric, difficulty, premium status, transcript measurements or provider configuration', async () => {
  const { handler, calls, reservations } = fixture();
  const bad = [null, [], {}, { ...input(), taskId: 'missing' }, { ...input(), mode: 'speaking' }, { ...input(), level: 9 },
    { ...input(), paid: true }, { ...input(), premium: true }, { ...input(), score: 10 }, { ...input(), reference: 'my answer' },
    { ...input(), durationSeconds: 10 }, { ...input(), pauses: [] }, { ...input(), messages: [] }, { ...input(), answer: '' },
    { ...input(), answer: 'a\u0000b' }, { ...input(), answer: '字'.repeat(2001) }];
  for (const body of bad) assert.equal((await handler(event(body))).statusCode, 400);
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
  assert.equal(validateAssessment({ ...input(), answer: '😀'.repeat(2000) }).answer.length, 4000);
});

test('speaking assessment scores only transcript content and supplies an explicit server-owned limitation', async () => {
  const request = input('speaking', 3);
  const { handler, calls } = fixture({ fetcher: async () => Response.json(provider(assessment(request.taskId))) });
  const result = await handler(event(request)), data = json(result);
  assert.equal(result.statusCode, 200); assert.equal(data.assessmentScope, 'text_content_only');
  assert.match(data.noticeRu, /произношение, тоны, темп и беглость речи не оценивались/);
  assert.deepEqual(data.criteria.map(item => item.id), ['content', 'grammar', 'vocabulary']);
  assert.match(assessmentPrompt(task(request.taskId)), /Аудио, длительность и паузы не предоставлены/);
  assert.equal(calls.length, 0); // The injected test provider returns no actual network calls.
});

test('grammar scoring uses only its own two server criteria and returns canonical criterion order', async () => {
  const selected = task('grammar-hsk4-01'), value = assessment(selected.id);
  value.criteria.reverse(); value.criteria[0].score--; value.score--;
  const result = validateAssessmentResult(value, selected);
  assert.equal(result.level, 4); assert.equal(result.maxScore, 10); assert.equal(result.score, 9);
  assert.deepEqual(result.criteria.map(item => item.id), ['accuracy', 'meaning']);
});

test('provider totals, duplicate/unknown criteria, bad scores and extra pronunciation dimensions are rejected', async () => {
  const mutations = [data => { data.score = 9; }, data => { data.score = 10.5; }, data => { data.criteria[0].score = 5; },
    data => { data.criteria[0].score = -1; }, data => { data.criteria[0].score = 0.5; }, data => { data.criteria[0].id = 'pronunciation'; },
    data => { data.criteria[1].id = data.criteria[0].id; }, data => { data.criteria[0].maxScore = 4; },
    data => { data.criteria.pop(); }, data => { data.officialHSKScore = 100; }, data => { data.rewrite.ru = ''; },
    data => { data.rewrite.reasoning = 'hidden'; }, data => { data.feedbackRu = 'x'.repeat(1501); }, data => { data.criteria[0].feedbackRu = ''; }];
  for (const mutate of mutations) {
    const value = assessment(); mutate(value); let calls = 0;
    const { handler } = fixture({ fetcher: async () => { calls++; return Response.json(provider(value)); } });
    assert.equal((await handler(event())).statusCode, 502); assert.equal(calls, 1);
  }
});

test('assessment enforces known origins and methods before budget or provider calls', async () => {
  const { handler, calls, reservations } = fixture();
  assert.equal(await handler(event(undefined, { path: '/other' })), null);
  for (const origin of [undefined, 'null', 'https://attacker.example']) {
    assert.equal((await handler(event(undefined, { headers: { origin, 'content-type': 'application/json' } }))).statusCode, 403);
  }
  assert.equal((await handler(event(undefined, { httpMethod: 'GET' }))).statusCode, 405);
  assert.equal((await handler(event(undefined, { path: '/ai/tasks' }))).statusCode, 405);
  assert.equal((await handler(event(undefined, { httpMethod: 'OPTIONS' }))).statusCode, 204);
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('budget denials or failures cannot invoke paid Pro and identities ignore forwarding headers', async () => {
  for (const result of [{ allowed: false, error: 'monthly_limit', retryAfter: 120 }, { allowed: false, error: 'daily_limit', retryAfter: 60 },
    { allowed: false, error: 'rate_limit', retryAfter: 5 }, { allowed: false, error: KEY }, null]) {
    const { handler, calls } = fixture({ reserveUsage: async () => result });
    const response = await handler(event()); assert.equal(response.statusCode, result?.retryAfter ? 429 : 503); assert.equal(calls.length, 0);
    assert.doesNotMatch(response.body, /test-only/);
  }
  const { handler, reservations } = fixture();
  await handler(event(undefined, { requestContext: {}, headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': 'spoof' } }));
  assert.equal(reservations[0].usage.identity, 'unknown');
});

test('timeout and provider failures never automatically retry and never expose reasoning or credentials', async () => {
  let count = 0;
  const timeout = fixture({ providerTimeoutMs: 5, fetcher: (_url, options) => new Promise((_resolve, reject) => {
    count++; options.signal.addEventListener('abort', () => reject(Error(KEY)), { once: true });
  }) });
  assert.equal((await timeout.handler(event())).statusCode, 504); assert.equal(count, 1); assert.equal(timeout.reservations.length, 1);
  for (const status of [401, 429, 500]) {
    count = 0; const { handler } = fixture({ fetcher: async () => { count++; return new Response(KEY, { status }); } });
    const result = await handler(event()); assert.equal(result.statusCode, status === 429 ? 429 : 502); assert.equal(count, 1);
    assert.doesNotMatch(result.body, /test-only/);
  }
});

test('incomplete, blank, malformed JSON or reasoning-only provider responses do not produce scores', async () => {
  const incomplete = provider(assessment()); incomplete.choices[0].finish_reason = 'length';
  const blank = provider(assessment()); blank.choices[0].message.content = '   ';
  const onlyReasoning = provider(assessment()); delete onlyReasoning.choices[0].message.content;
  const extraChoice = provider(assessment()); extraChoice.choices.push(extraChoice.choices[0]);
  for (const value of [incomplete, blank, onlyReasoning, extraChoice, { choices: [] }]) {
    const { handler } = fixture({ fetcher: async () => Response.json(value) });
    assert.equal((await handler(event())).statusCode, 502);
  }
  for (const content of ['not JSON', '```json\n{}\n```', '{"score":', '<think>hidden</think>{}']) {
    const value = provider(assessment()); value.choices[0].message.content = content;
    const { handler } = fixture({ fetcher: async () => Response.json(value) });
    assert.equal((await handler(event())).statusCode, 502);
  }
});
