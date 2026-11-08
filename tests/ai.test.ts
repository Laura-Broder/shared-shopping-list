import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.ts';
import { analyzeGroceries, validateAnalysis, AnalysisError, type Analysis } from '../src/ai.ts';

const testKey = 'test-only-key-never-sent-to-openai';
const analysis: Analysis = {
  kind: 'add',
  message: '',
  items: [
    { name: 'חלב 3%', quantity: 2, unit: 'יח׳', department: 'מוצרי חלב וביצים', explicit: true },
  ],
};
function result(value: unknown, status = 'completed') {
  return new Response(
    JSON.stringify({
      status,
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
      ],
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
const add = (f: ReturnType<typeof fixture>, text = 'צריך שני חלב 3%', id = crypto.randomUUID()) =>
  f.request('/api/items', 'POST', { text, operationId: id, mode: 'ai' });

test('AI request uses structured output, no storage, and only the submitted text', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://api.openai.com/v1/responses');
    assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer ' + testKey);
    const body = JSON.parse(init!.body as string);
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.equal(body.text.format.type, 'json_schema');
    assert.deepEqual(body.input, [{ role: 'user', content: 'צריך שני חלב 3%' }]);
    assert.equal(body.tools, undefined);
    assert.ok(body.max_output_tokens <= 4000);
    assert.ok(init!.signal);
    return result(analysis);
  };
  const parsed = await analyzeGroceries(
    'צריך שני חלב 3%',
    { OPENAI_API_KEY: testKey, AI_ENABLED: 'true' },
    fetcher,
  );
  assert.equal(calls, 1);
  assert.deepEqual(parsed, analysis);
});
test('Missing key never invokes a model', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    throw new Error('should not call');
  };
  await assert.rejects(analyzeGroceries('חלב', {}, fetcher), AnalysisError);
  assert.equal(calls, 0);
});
test('A configured key alone does not enable chargeable AI calls', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return result(analysis);
  });
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  assert.equal((await f.request('/api/items')).body.aiEnabled, false);
  assert.equal((await add(f)).status, 503);
  assert.equal(calls, 0);
});
test('Unexpected departments and invalid quantities never become additions', () => {
  for (const patch of [
    { department: 'arbitrary' },
    { quantity: 0 },
    { quantity: 10001 },
    { quantity: 2, explicit: false },
    { name: '' },
    { unit: 'unknown' },
  ])
    assert.throws(
      () => validateAnalysis({ ...analysis, items: [{ ...analysis.items[0], ...patch }] }),
      AnalysisError,
    );
  assert.throws(
    () => validateAnalysis({ kind: 'clarify', message: 'מה להוסיף?', items: analysis.items }),
    AnalysisError,
  );
  assert.throws(() => validateAnalysis({ kind: 'add', message: '', items: [] }), AnalysisError);
});
test('Refusals, truncated output, invalid JSON and HTTP failures are handled without exposing provider text', async () => {
  const responses = [
    result(analysis, 'incomplete'),
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [{ content: [{ type: 'refusal', refusal: 'no' }] }],
      }),
    ),
    new Response(
      JSON.stringify({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: 'invalid json' }] }],
      }),
    ),
    new Response('private provider error ' + testKey, { status: 401 }),
  ];
  for (const response of responses)
    await assert.rejects(
      analyzeGroceries(
        'חלב',
        { OPENAI_API_KEY: testKey, AI_ENABLED: 'true' },
        async () => response,
      ),
      (error) =>
        error instanceof AnalysisError &&
        !error.message.includes(testKey) &&
        !error.message.includes('private provider'),
    );
});
test('Oversized input and disabled configuration make no model requests', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls++;
    return result(analysis);
  };
  await assert.rejects(
    analyzeGroceries('x'.repeat(2001), { OPENAI_API_KEY: testKey, AI_ENABLED: 'true' }, fetcher),
  );
  await assert.rejects(
    analyzeGroceries('חלב', { OPENAI_API_KEY: testKey, AI_ENABLED: 'false' }, fetcher),
  );
  assert.equal(calls, 0);
});
test('The existing parser works with no AI key and does not claim AI is active', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('No external calls');
  });
  const f = fixture();
  assert.equal((await f.request('/api/items')).body.aiEnabled, false);
  assert.equal((await f.add('חלב')).status, 200);
  const unavailable = await add(f);
  assert.equal(unavailable.status, 503);
  assert.equal(calls, 0);
  assert.equal((await f.request('/api/items')).body.items.length, 1);
});
test('AI is authorized server-side and secrets are absent from browser assets and metadata', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return result(analysis);
  });
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  const unauthorized = await f.request(
    '/api/items',
    'POST',
    { text: 'חלב', operationId: crypto.randomUUID(), mode: 'ai' },
    '',
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(calls, 0);
  const meta = await f.request('/api/items');
  assert.equal(meta.body.aiEnabled, true);
  assert.ok(!JSON.stringify(meta.body).includes(testKey));
  const { handle } = await import('../src/worker.ts');
  const asset = await handle(new Request('https://grocery.test/app.js'), f.env);
  assert.ok(!(await asset.text()).includes(testKey));
});
test('An AI addition preserves fat percentages and uses inferred department', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    result({
      kind: 'add',
      message: '',
      items: [
        {
          name: 'מלח למדיח',
          quantity: 1,
          unit: 'יח׳',
          department: 'ניקיון וטיפוח',
          explicit: false,
        },
        analysis.items[0],
      ],
    }),
  );
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  const r = await add(f, 'תוסיף מלח למדיח וגם שני חלב 3%');
  assert.equal(r.status, 200);
  assert.equal(r.body.analysis, 'ai');
  assert.equal(r.body.items.find((x: any) => x.name === 'מלח למדיח').department, 'ניקיון וטיפוח');
  assert.equal(r.body.items.find((x: any) => x.name === 'חלב 3%').quantity, 2);
});
test('Retrying the same message uses its cached analysis and applies it only once', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return result(analysis);
  });
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  const id = crypto.randomUUID();
  assert.equal((await add(f, 'שני חלב 3%', id)).status, 200);
  assert.equal((await add(f, 'שני חלב 3%', id)).status, 200);
  assert.equal(calls, 1);
  assert.equal((await f.request('/api/items')).body.items[0].quantity, 2);
  assert.equal((await add(f, 'טקסט אחר', id)).status, 409);
  assert.equal(calls, 1);
});
test('Ambiguity and unsupported edits leave the whole existing list unchanged', async (t) => {
  let answer: Analysis = { kind: 'clarify', message: 'איזה מוצר להוסיף?', items: [] };
  t.mock.method(globalThis, 'fetch', async () => result(answer));
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  await f.add('לחם');
  const before = (await f.request('/api/items')).body.items;
  const ambiguous = await add(f, 'תוסיף עוד שניים');
  assert.equal(ambiguous.status, 422);
  assert.equal(ambiguous.body.clarification, true);
  answer = {
    kind: 'unsupported',
    message: 'לשינוי או למחיקה השתמשו בעיפרון ליד המוצר.',
    items: [],
  };
  assert.equal((await add(f, 'תוסיף חלב ותמחק את הלחם')).status, 422);
  assert.deepEqual((await f.request('/api/items')).body.items, before);
});
test('A failed AI service does not silently fall back or save a misinterpreted message', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('unavailable', { status: 503 }));
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  await f.add('לחם');
  assert.equal((await add(f, 'יש חלב בבית, צריך רק עגבניות')).status, 503);
  const items = (await f.request('/api/items')).body.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'לחם');
});
test('The shared AI quota stops calls without deleting products or blocking normal parsing', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return result(analysis);
  });
  const f = fixture();
  f.env.OPENAI_API_KEY = testKey;
  f.env.AI_ENABLED = 'true';
  f.env.AI_MONTHLY_LIMIT = '1';
  assert.equal((await add(f)).status, 200);
  const before = (await f.request('/api/items')).body.items;
  assert.equal((await add(f, 'עוד מוצר')).status, 429);
  assert.equal(calls, 1);
  assert.deepEqual((await f.request('/api/items')).body.items, before);
  assert.equal((await f.add('לחם')).status, 200);
  assert.equal(calls, 1);
  assert.equal((await f.request('/api/items')).body.items.length, 2);
});
