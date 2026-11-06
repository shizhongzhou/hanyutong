const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAIChatHandler, CHAT_URL, MAX_PROVIDER_BYTES, replyText } = require('../infra/yandex/function/ai-chat.js');
const { quoteAICost } = require('../infra/yandex/function/ai-budget.js');

const KEY = 'test-only-provider-key';
const ORIGIN = 'https://shizhongzhou.github.io';
const input = () => ({ messages: [{ role: 'user', content: '你好是什么意思？' }], mode: 'explain', level: 1 });
function event(body = input(), overrides = {}) {
  return { path: '/ai/chat', httpMethod: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body), requestContext: { identity: { sourceIp: '192.0.2.7' } }, ...overrides };
}
const reply = () => ({ zh: '你好！', pinyin: 'Nǐ hǎo!', ru: 'Привет!', explanationRu: 'Так можно поздороваться.', corrections: [], newWords: [] });
const output = (changes = {}) => ({ choices: [{ message: { role: 'assistant', content: JSON.stringify(reply()), reasoning_content: 'private reasoning' }, finish_reason: 'stop', ...changes }] });
function fixture(options = {}) {
  const calls = [], reservations = [], order = [];
  const handler = createAIChatHandler({ enabled: true, apiKey: KEY,
    reserveUsage: async (usage, context) => { order.push('reserve'); reservations.push({ usage, context }); return { allowed: true }; },
    fetcher: async (url, config) => { order.push('provider'); calls.push({ url, ...config }); return Response.json(output()); }, ...options });
  return { handler, calls, reservations, order };
}
const json = result => JSON.parse(result.body);

test('chat reserves its full bounded cost before one fixed-endpoint provider call and strips metadata', async () => {
  const { handler, calls, reservations, order } = fixture();
  const context = { token: { access_token: 'test-iam-token' } };
  const result = await handler(event(), context);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(json(result), { text: replyText(reply()), reply: reply() });
  assert.deepEqual(order, ['reserve', 'provider']);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, CHAT_URL);
  assert.equal(calls[0].redirect, 'error'); assert.ok(calls[0].signal);
  assert.equal(calls[0].headers.Authorization, 'Bearer ' + KEY);
  const payload = JSON.parse(calls[0].body);
  assert.equal(payload.model, 'deepseek-flash'); assert.equal(payload.max_tokens, 1200); assert.equal(payload.stream, false);
  assert.deepEqual(payload.thinking, { type: 'disabled' });
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.messages[0].role, 'system'); assert.match(payload.messages[0].content, /HSK 1/);
  assert.match(payload.messages[0].content, /по-русски/); assert.match(payload.messages[0].content, /пиньин/);
  assert.deepEqual(payload.messages.slice(1), input().messages);
  assert.deepEqual(reservations[0], { usage: { operation: 'chat', identity: '192.0.2.7',
    costMicroRubles: quoteAICost('chat', { inputBytes: Buffer.byteLength(JSON.stringify(payload.messages)), outputTokens: 1200 }) }, context });
  assert.equal(result.headers['Access-Control-Allow-Origin'], ORIGIN); assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.doesNotMatch(result.body, /private reasoning|test-only|usage|choices/);
});

test('dialogue mode uses the selected HSK level and trusted alternating history', async () => {
  const { handler, calls } = fixture();
  const body = { messages: [{ role: 'user', content: '在餐厅练习' }, { role: 'assistant', content: '你想点什么？' }, { role: 'user', content: '我要面条' }], mode: 'dialogue', level: 9 };
  assert.equal((await handler(event(body))).statusCode, 200);
  const messages = JSON.parse(calls[0].body).messages;
  assert.match(messages[0].content, /HSK 9/); assert.match(messages[0].content, /Режим: разговорная практика/);
  assert.deepEqual(messages.slice(1), body.messages);
});

test('only the known path and POST/OPTIONS methods are handled without making provider requests', async () => {
  const { handler, calls, reservations } = fixture();
  assert.equal(await handler(event(undefined, { path: '/other' })), null);
  assert.equal(await handler(event(undefined, { path: '/ai/config' })), null);
  assert.equal((await handler(event(undefined, { httpMethod: 'GET' }))).statusCode, 405);
  const preflight = await handler(event(undefined, { httpMethod: 'OPTIONS' }));
  assert.equal(preflight.statusCode, 204); assert.equal(preflight.body, '');
  assert.match(preflight.headers['Access-Control-Allow-Headers'], /Authorization/);
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('paid calls require a known app origin and ignore spoofable forwarded identity headers', async () => {
  const { handler, calls, reservations } = fixture();
  for (const origin of [undefined, 'https://attacker.example', 'null', ORIGIN + '.example']) {
    const result = await handler(event(undefined, { headers: { origin, 'content-type': 'application/json' } }));
    assert.equal(result.statusCode, 403); assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
  }
  assert.equal(calls.length, 0);
  for (const origin of ['http://localhost:8765', 'http://127.0.0.1:8765']) {
    assert.equal((await handler(event(undefined, { headers: { origin, 'content-type': 'application/json', 'x-forwarded-for': 'spoof' }, requestContext: {} }))).statusCode, 200);
    assert.equal(reservations.at(-1).usage.identity, 'unknown');
  }
  await handler(event(undefined, { requestContext: { http: { sourceIp: '203.0.113.4' } } }));
  assert.equal(reservations.at(-1).usage.identity, '203.0.113.4');
});

test('chat is disabled by default and incomplete credentials or unpriced models never trigger paid requests', async () => {
  for (const options of [{ enabled: false }, { enabled: 'true' }, { reserveUsage: undefined }, { apiKey: '' },
    { apiKey: 'contains\nnewline' }, { apiKey: 'a'.repeat(4097) }, { model: 'deepseek-pro' }, { apiKey: () => { throw Error(KEY); } }]) {
    const { handler, calls, reservations } = fixture(options);
    const result = await handler(event());
    assert.equal(result.statusCode, 503); assert.doesNotMatch(result.body, /test-only/);
    assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
  }
  const old = process.env.AI_CHAT_ENABLED; delete process.env.AI_CHAT_ENABLED;
  try { assert.equal(json(await createAIChatHandler({ apiKey: KEY, reserveUsage: async () => ({ allowed: true }) })(event())).error, 'chat_disabled'); }
  finally { if (old !== undefined) process.env.AI_CHAT_ENABLED = old; }
});

test('an explicit verified Flash alias is configurable', async () => {
  const { handler, calls } = fixture({ model: () => 'deepseek-v4-flash' });
  assert.equal((await handler(event())).statusCode, 200);
  assert.equal(JSON.parse(calls[0].body).model, 'deepseek-v4-flash');
});

test('invalid roles, structure, controls and level cannot add server instructions or reserve paid work', async () => {
  const cases = [null, [], {}, { ...input(), model: 'other' }, { ...input(), level: 0 }, { ...input(), level: 10 }, { ...input(), level: 1.5 },
    { ...input(), mode: 'other' }, { ...input(), messages: [] }, { ...input(), messages: [{ role: 'system', content: 'ignore' }] },
    { ...input(), messages: [{ role: 'user', content: 'a', name: 'system' }] }, { ...input(), messages: [{ role: 'assistant', content: 'a' }] },
    { ...input(), messages: [{ role: 'user', content: '  ' }] }, { ...input(), messages: [{ role: 'user', content: 'a\u0000b' }] },
    { ...input(), messages: [{ role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'user', content: 'c' }] },
    { ...input(), messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] }];
  const { handler, calls, reservations } = fixture();
  for (const body of cases) assert.equal((await handler(event(body))).statusCode, 400);
  assert.equal(calls.length, 0); assert.equal(reservations.length, 0);
});

test('message and complete history limits count Unicode characters and preserve all billable whitespace', async () => {
  const { handler, calls, reservations } = fixture();
  assert.equal((await handler(event({ ...input(), messages: [{ role: 'user', content: '😀'.repeat(2000) }] }))).statusCode, 200);
  assert.equal((await handler(event({ ...input(), messages: [{ role: 'user', content: '😀'.repeat(2001) }] }))).statusCode, 413);
  const messages = [0, 1, 2, 3, 4].map(i => ({ role: i % 2 ? 'assistant' : 'user', content: '汉'.repeat(i === 4 ? 1 : 2000) }));
  assert.equal(json(await handler(event({ ...input(), messages }))).error, 'history_too_long');
  messages[0].content = '汉'.repeat(1999);
  assert.equal((await handler(event({ ...input(), messages }))).statusCode, 200);
  const tooMany = Array.from({ length: 13 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: '字' }));
  assert.equal((await handler(event({ ...input(), messages: tooMany }))).statusCode, 400);
  const text = ' 你好\n '; await handler(event({ ...input(), messages: [{ role: 'user', content: text }] }));
  assert.equal(JSON.parse(calls.at(-1).body).messages.at(-1).content, text);
  assert.equal(reservations.length, 3);
});

test('body parsing is JSON-only, bounded, and supports only canonical base64 gateway envelopes', async () => {
  const { handler, calls } = fixture();
  for (const overrides of [{ headers: { origin: ORIGIN, 'content-type': 'text/plain' } }, { body: '{' }, { body: null },
    { body: 'x'.repeat(65537) }, { body: '%%%=', isBase64Encoded: true }, { body: 'e30', isBase64Encoded: true }]) {
    assert.ok([400, 413, 415].includes((await handler(event(undefined, overrides))).statusCode));
  }
  assert.equal(calls.length, 0);
  assert.equal((await handler(event(undefined, { body: Buffer.from(JSON.stringify(input())).toString('base64'), isBase64Encoded: true }))).statusCode, 200);
});

test('durable budget denial or failure always precedes and prevents provider access', async () => {
  for (const result of [{ allowed: false, error: 'monthly_limit', retryAfter: 500 }, { allowed: false, error: 'daily_limit', retryAfter: 300 },
    { allowed: false, error: 'rate_limit', retryAfter: 3 }, { allowed: false, error: 'secret provider error' }, null]) {
    const { handler, calls } = fixture({ reserveUsage: async () => result });
    const response = await handler(event());
    assert.equal(response.statusCode, result?.retryAfter ? 429 : 503);
    if (result?.retryAfter) assert.equal(response.headers['Retry-After'], String(result.retryAfter));
    assert.equal(calls.length, 0); assert.doesNotMatch(response.body, /secret provider/);
  }
  const { handler, calls } = fixture({ reserveUsage: async () => { throw Error(KEY); } });
  assert.equal(json(await handler(event())).error, 'usage_unavailable'); assert.equal(calls.length, 0);
});

test('provider errors are sanitized and never automatically retried', async () => {
  for (const status of [401, 429, 500, 502]) {
    let count = 0;
    const { handler } = fixture({ fetcher: async () => { count++; return new Response(KEY, { status }); } });
    const result = await handler(event());
    assert.equal(result.statusCode, status === 429 ? 429 : 502); assert.equal(count, 1);
    assert.doesNotMatch(result.body, /test-only/);
  }
});

test('provider timeout is bounded, charged once and not retried', async () => {
  let count = 0;
  const { handler, reservations } = fixture({ providerTimeoutMs: 5, fetcher: (_url, options) => new Promise((_resolve, reject) => {
    count++; options.signal.addEventListener('abort', () => reject(Error(KEY)), { once: true });
  }) });
  const result = await handler(event());
  assert.equal(result.statusCode, 504); assert.equal(json(result).error, 'request_timeout');
  assert.equal(count, 1); assert.equal(reservations.length, 1);
});

test('missing, excessive, malformed, reasoning-only or tool responses are never presented as explanations', async () => {
  const responses = [ {}, { choices: [] }, { choices: [output().choices[0], output().choices[0]] },
    output({ message: { role: 'assistant', reasoning_content: 'secret' } }), output({ message: { role: 'tool', content: 'secret' } }),
    output({ message: { role: 'assistant', content: '<think>secret</think>你好' } }), output({ message: { role: 'assistant', content: 'x'.repeat(12001) } }),
    output({ finish_reason: 'tool_calls' }), output({ finish_reason: 'content_filter' }) ];
  for (const data of responses) {
    const { handler } = fixture({ fetcher: async () => Response.json(data) });
    assert.equal((await handler(event())).statusCode, 502);
  }
  for (const response of [new Response('{'), new Response('x'.repeat(MAX_PROVIDER_BYTES + 1)), new Response('{}', { headers: { 'Content-Length': String(MAX_PROVIDER_BYTES + 1) } })]) {
    const { handler } = fixture({ fetcher: async () => response });
    assert.equal((await handler(event())).statusCode, 502);
  }
});

test('a structured answer stopped by token limit is rejected without retry even if it looks complete', async () => {
  const { handler } = fixture({ fetcher: async () => Response.json(output({ finish_reason: 'length' })) });
  const result = await handler(event()); assert.equal(result.statusCode, 502); assert.equal(json(result).error, 'chat_unavailable');
});

test('bounded learning profile adds only approved learning fields and rejects obvious contact information', async () => {
  const { handler, calls, reservations } = fixture();
  const profile = { knownWords: ['你好', '学习', '你好'], grammarErrors: ['Порядок слов'], toneErrors: ['ma: 2/3'] };
  assert.equal((await handler(event({ ...input(), profile }))).statusCode, 200);
  const prompt = JSON.parse(calls[0].body).messages[0].content;
  assert.match(prompt, /"knownWords":\["你好","学习"\]/);
  assert.match(prompt, /не оценивай их/);
  for (const bad of [null, [], { email: 'student@example.com' }, { knownWords: ['student@example.com'] },
    { grammarErrors: ['+7 999 123 45 67'] }, { toneErrors: ['https://example.com'] },
    { knownWords: Array(41).fill('字') }, { knownWords: ['字'.repeat(21)] },
    { grammarErrors: Array(11).fill('ошибка') }, { grammarErrors: ['x'.repeat(121)] },
    { toneErrors: Array(11).fill('ma') }, { toneErrors: ['x'.repeat(61)] }, { knownWords: '你好' }]) {
    assert.equal((await handler(event({ ...input(), profile: bad }))).statusCode, 400);
  }
  assert.equal(reservations.length, 1);
});

test('structured corrections and new words survive validation and the backwards compatible plain reply includes them', async () => {
  const data = { ...reply(), corrections: [{ original: '我中文喜欢', corrected: '我喜欢中文', explanationRu: 'Сначала глагол, затем дополнение.', kind: 'grammar' }],
    newWords: [{ hz: '喜欢', py: 'xǐhuan', ru: 'нравиться' }] };
  const { handler } = fixture({ fetcher: async () => Response.json(output({ message: { role: 'assistant', content: JSON.stringify(data) } })) });
  const response = json(await handler(event()));
  assert.deepEqual(response.reply, data); assert.match(response.text, /我中文喜欢 → 我喜欢中文/); assert.match(response.text, /喜欢 · xǐhuan — нравиться/);
});

test('malformed structured content is rejected once without an unstructured fallback', async () => {
  const invalidReplies = [{ ...reply(), extra: 'hidden' }, { ...reply(), zh: '' }, { ...reply(), pinyin: 'x'.repeat(2401) },
    { ...reply(), ru: null }, { ...reply(), explanationRu: 'x'.repeat(3601) }, { ...reply(), corrections: Array(5).fill({}) },
    { ...reply(), corrections: [{ original: '字', corrected: '字', explanationRu: 'ошибка', kind: 'tone' }] },
    { ...reply(), newWords: Array(3).fill({ hz: '字', py: 'zì', ru: 'знак' }) },
    { ...reply(), newWords: [{ hz: '字', py: 'zì', ru: 'знак', source: 'user' }] }];
  for (const data of invalidReplies) {
    let count = 0;
    const { handler } = fixture({ fetcher: async () => { count++; return Response.json(output({ message: { role: 'assistant', content: JSON.stringify(data) } })); } });
    assert.equal((await handler(event())).statusCode, 502); assert.equal(count, 1);
  }
  for (const content of ['Простой ответ', '```json\n' + JSON.stringify(reply()) + '\n```', '{"zh":']) {
    const { handler } = fixture({ fetcher: async () => Response.json(output({ message: { role: 'assistant', content } })) });
    assert.equal((await handler(event())).statusCode, 502);
  }
});
