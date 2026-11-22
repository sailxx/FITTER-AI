import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDayChanges, diaryRequest } from '../day-storage.js';

test('parallel food and water updates retain both writes', () => {
  const base = { meals: [], water: 0 };
  const food = { meals: [{ id: 'a', title: 'Lunch' }], water: 0 };
  const water = { meals: [], water: 250 };
  const first = mergeDayChanges(base, base, food);
  assert.deepEqual(mergeDayChanges(first, base, water), { ...food, water: 250 });
  assert.equal(mergeDayChanges(mergeDayChanges(base, base, water), base, water).water, 500);
});
test('independent meal edits, deletes and pill marks do not replace the entire day', () => {
  const base = { meals: [{ id: 'a' }, { id: 'b' }], pills: {} };
  const first = mergeDayChanges(base, base, { meals: [{ id: 'a', title: 'Edited' }, { id: 'b' }], pills: { x: { s: 'taken' } } });
  const result = mergeDayChanges(first, base, { meals: [{ id: 'a' }], pills: { y: { s: 'skip' } } });
  assert.deepEqual(result.meals, [{ id: 'a', title: 'Edited' }]);
  assert.deepEqual(result.pills, { x: { s: 'taken' }, y: { s: 'skip' } });
});
test('legacy import, storage requests and deletion use durable storage', async () => {
  const values = new Map();
  const storage = { get: async k => Array.isArray(k) ? new Map(k.filter(key => values.has(key)).map(key => [key, structuredClone(values.get(key))])) : structuredClone(values.get(k)), put: async (k,v) => values.set(k,structuredClone(v)),
    transaction: async fn => fn(storage), list: async () => new Map(values), delete: async keys => keys.forEach(k => values.delete(k)) };
  const env = { DB: { get: async keys => new Map(keys.map(key => [key, { meals: [{ id: 'legacy' }] }])), put: async () => {} } };
  const url = 'https://live/day?uid=42&date=2026-11-07';
  const read = async () => (await diaryRequest({ storage }, env, new Request(url))).json();
  const base = await read();
  await diaryRequest({ storage }, env, new Request(url, { method: 'POST', body: JSON.stringify({ base, day: { ...base, water: 250 } }) }));
  assert.equal((await read()).water, 250);
  assert.equal(values.size, 1);
  await diaryRequest({ storage }, env, new Request('https://live/erase-days', { method: 'POST' }));
  assert.equal(values.size, 0);
});
