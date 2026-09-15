'use strict';
const assert = require('assert');
const {createHistory, compare} = require('../../probe-extension/history');
function state() {
  const data = new Map();
  return {get: key => data.get(key), async update(key, value) { if (this.fail) throw new Error('disk failed'); value === undefined ? data.delete(key) : data.set(key, structuredClone(value)); }};
}
async function main() {
  const storage = state(), history = createHistory(storage), other = createHistory(state());
  const report = {schema: 'webagent-model-analysis/v1', requestId: 'fixture', candidate: {modelId: 'model-a', family: 'fixture', heuristicScore: 0.5}, text: 'PRIVATE_RAW', token: 'PRIVATE_TOKEN'};
  await Promise.all([history.save(report), history.save({...report, candidate: {...report.candidate, modelId: 'model-b'}})]);
  const entries = await createHistory(storage).list();
  assert.strictEqual(entries.length, 2); assert.strictEqual((await other.list()).length, 0);
  assert.ok(!JSON.stringify(entries).includes('PRIVATE_'));
  assert.deepStrictEqual(compare(entries[0], entries[1]).onlyLeft, ['model-a']);
  storage.fail = true; await assert.rejects(history.save(report), /disk failed/); storage.fail = false;
  assert.strictEqual((await history.list()).length, 2);
  await history.remove(entries[0].id); assert.strictEqual((await history.list()).length, 1);
  for (let i = 1; i < 50; i++) await history.save(report);
  await assert.rejects(history.save(report), /full/); assert.strictEqual((await history.list()).length, 50);
  const corrupt = createHistory({get: () => ({version: 2}), update: () => {throw Error('must not overwrite');}});
  await assert.rejects(corrupt.list(), /invalid/);
  console.log('Reference history: workspace isolation, restart, concurrency, projection, quotas, failed writes and explicit deletion passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
