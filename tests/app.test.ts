import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, owner, partner } from './fixture.ts';
import { parseGroceries, departmentFor } from '../src/parser.ts';

test('Hebrew bulk input parses conjunctions, quantities, units and departments', () => {
  const r = parseGroceries('צריך שתי קופסאות טונה, חצי קילו עגבניות ולחם');
  assert.deepEqual(
    r.items.map(({ name, quantity, unit, department }) => ({ name, quantity, unit, department })),
    [
      { name: 'טונה', quantity: 2, unit: 'קופסה', department: 'מזווה' },
      { name: 'עגבניות', quantity: 0.5, unit: 'ק״ג', department: 'ירקות ופירות' },
      { name: 'לחם', quantity: 1, unit: 'יח׳', department: 'לחם ומאפים' },
    ],
  );
});
test('Percentages and multiword product attributes remain part of names', () => {
  const r = parseGroceries('2 חלב 3%, גבינה לבנה 5%, תפוחי אדמה');
  assert.deepEqual(
    r.items.map((x) => [x.name, x.quantity]),
    [
      ['חלב 3%', 2],
      ['גבינה לבנה 5%', 1],
      ['תפוחי אדמה', 1],
    ],
  );
});
test('Unknown phrases and a known compound name are preserved', () => {
  assert.equal(parseGroceries('מלח ופלפל').items[0].name, 'מלח ופלפל');
  assert.equal(parseGroceries('מוצר מיוחד וחדש').items[0].name, 'מוצר מיוחד וחדש');
  assert.equal(departmentFor('מוצר מיוחד'), 'אחר');
  assert.equal(departmentFor('חלב שיבולת שועל'), 'משקאות');
});
test('Fractions and trailing numeric quantities work; destructive text is rejected', () => {
  assert.equal(parseGroceries('1/2 קילו גזר').items[0].quantity, 0.5);
  assert.equal(parseGroceries('חלב 2').items[0].quantity, 2);
  const r = parseGroceries('תמחק חלב');
  assert.equal(r.items.length, 0);
  assert.equal(r.warnings.length, 1);
});
test('Invalid and excessive input is bounded', () => {
  assert.throws(() => parseGroceries('x'.repeat(2001)));
  assert.throws(() => parseGroceries(Array(42).fill('חלב').join(',')));
  assert.equal(parseGroceries('0 חלב').items.length, 0);
});
test('Both household keys see one shared list; unauthorized and forged access fails', async () => {
  const f = fixture();
  assert.equal((await f.request('/api/items', 'GET', undefined, '')).status, 401);
  assert.equal(
    (await f.request('/api/items', 'GET', undefined, '', { 'oai-authenticated-user-id': 'fake' }))
      .status,
    401,
  );
  await f.add('2 חלב, לחם');
  const r = await f.request('/api/items', 'GET', undefined, partner);
  assert.equal(r.body.items.length, 2);
  assert.equal((await f.request('/api/access', 'GET', undefined, partner)).status, 403);
  assert.match((await f.request('/api/access')).body.url, /#key=/);
});
test('Repeating an add operation after an uncertain response never adds twice', async () => {
  const f = fixture();
  const id = crypto.randomUUID();
  await f.add('2 חלב', id);
  await f.add('2 חלב', id);
  const r = await f.request('/api/items');
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].quantity, 2);
});
test('Bare duplicates keep their quantity; explicit new quantities increment', async () => {
  const f = fixture();
  await f.add('2 חלב');
  await f.add('חלב');
  let r = await f.request('/api/items');
  assert.equal(r.body.items[0].quantity, 2);
  await f.add('3 חלב');
  r = await f.request('/api/items');
  assert.equal(r.body.items[0].quantity, 5);
});
test('Different milk percentages and units remain separate', async () => {
  const f = fixture();
  await f.add('חלב 3%, חלב 1%, חצי קילו עגבניות, 2 עגבניות');
  assert.equal((await f.request('/api/items')).body.items.length, 4);
});
test('Stale item writes return conflict and preserve the newer edit', async () => {
  const f = fixture();
  const item = (await f.add('חלב')).body.items[0];
  assert.equal(
    (await f.request('/api/items/' + item.id, 'PATCH', { revision: item.revision, checked: true }))
      .status,
    200,
  );
  assert.equal(
    (
      await f.request(
        '/api/items/' + item.id,
        'PATCH',
        { revision: item.revision, checked: false },
        partner,
      )
    ).status,
    409,
  );
  assert.equal((await f.request('/api/items')).body.items[0].checked, 1);
});
test('Clearing a snapshot preserves items changed on the other phone', async () => {
  const f = fixture();
  let item = (await f.add('חלב')).body.items[0];
  item = (
    await f.request('/api/items/' + item.id, 'PATCH', { revision: item.revision, checked: true })
  ).body.items[0];
  await f.request(
    '/api/items/' + item.id,
    'PATCH',
    { revision: item.revision, checked: false },
    partner,
  );
  const r = await f.request('/api/clear', 'POST', {
    items: [{ id: item.id, revision: item.revision }],
  });
  assert.equal(r.body.changed, 0);
  assert.equal(r.body.items.length, 1);
});
test('Purchased clearing and undo retain unpurchased items', async () => {
  const f = fixture();
  let items = (await f.add('חלב, לחם')).body.items;
  const item = items[0];
  items = (
    await f.request('/api/items/' + item.id, 'PATCH', { revision: item.revision, checked: true })
  ).body.items;
  const checked = items.filter((x: any) => x.checked);
  const cleared = await f.request('/api/clear', 'POST', {
    items: checked.map(({ id, revision }: any) => ({ id, revision })),
  });
  assert.equal(cleared.body.items.length, 1);
  assert.equal(cleared.body.undo.length, 1);
  const restored = await f.request('/api/restore', 'POST', { items: cleared.body.undo });
  assert.equal(restored.body.items.length, 2);
});
test('Undo does not overwrite an item re-added after clearing', async () => {
  const f = fixture();
  const item = (await f.add('2 חלב')).body.items[0];
  const removed = await f.request('/api/items/' + item.id, 'DELETE', { revision: item.revision });
  await f.add('3 חלב');
  const restored = await f.request('/api/restore', 'POST', { items: removed.body.undo });
  assert.equal(restored.body.changed, 0);
  assert.equal(restored.body.items[0].quantity, 3);
});
test('Renaming into an existing product conflicts without losing either item', async () => {
  const f = fixture();
  const items = (await f.add('חלב, לחם')).body.items;
  const item = items.find((x: any) => x.name === 'חלב');
  const r = await f.request('/api/items/' + item.id, 'PATCH', {
    revision: item.revision,
    name: 'לחם',
    quantity: 1,
    unit: 'יח׳',
    department: 'לחם ומאפים',
  });
  assert.equal(r.status, 409);
  assert.equal((await f.request('/api/items')).body.items.length, 2);
});
test('Writes reject foreign origins and invalid quantities', async () => {
  const f = fixture();
  const item = (await f.add('חלב')).body.items[0];
  assert.equal(
    (
      await f.request(
        '/api/items/' + item.id,
        'PATCH',
        { revision: item.revision, checked: true },
        owner,
        { Origin: 'https://evil.test' },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/api/items/' + item.id, 'PATCH', {
        revision: item.revision,
        name: 'חלב',
        quantity: -1,
        unit: 'יח׳',
        department: 'מוצרי חלב וביצים',
      })
    ).status,
    400,
  );
});
test('Site mode requires platform identity and retains one household list', async () => {
  const f = fixture();
  f.env.AUTH_MODE = 'sites';
  const unsigned = await f.request('/api/items');
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.body.authMode, 'sites');
  const r = await f.request('/api/items', 'GET', undefined, '', {
    'oai-authenticated-user-id': 'local-test-owner',
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.authMode, 'sites');
});
test('A 120-item cleanup and undo fit D1 Free query and parameter limits', async () => {
  const f = fixture();
  const insert = f.sqlite.prepare(
    'INSERT INTO items(id,item_key,name,quantity,unit,department,checked) VALUES(?,?,?,1,?,?,1)',
  );
  for (let i = 0; i < 120; i++)
    insert.run(crypto.randomUUID(), 'bulk-' + i, 'מוצר ' + i, 'יח׳', 'אחר');
  const snapshot = (await f.request('/api/items')).body.items.map(({ id, revision }: any) => ({
    id,
    revision,
  }));
  const cleared = await f.request('/api/clear', 'POST', { items: snapshot });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.changed, 120);
  assert.equal(cleared.body.items.length, 0);
  const restored = await f.request('/api/restore', 'POST', { items: cleared.body.undo });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.items.length, 120);
});
