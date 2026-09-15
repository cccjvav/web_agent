'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const { EventEmitter } = require('events');
function harness() {
  const file = path.resolve(__dirname, '../src/tools/fileOps.js');
  const fromFile = createRequire(file), timers = new Map(), workers = [];
  let id = 0;
  class FakeWorker extends EventEmitter {
    constructor() { super(); this.sent = []; this.terminated = 0; workers.push(this); }
    postMessage(message) { this.sent.push(message.type); }
    terminate() { this.terminated++; return Promise.resolve(0); }
  }
  const scope = { module: { exports: {} }, __dirname: path.dirname(file),
    require(name) { return name === 'worker_threads' ? { Worker: FakeWorker } : fromFile(name); },
    setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; }, clearTimeout(timer) { timers.delete(timer); }
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), scope);
  return { search: scope.module.exports.grepSearch, timers, workers };
}
async function main() {
  const h = harness();
  let pending = h.search({ query: 'fixture' });
  assert.deepStrictEqual([...h.timers.values()].map(timer => timer.ms), [10000]);
  assert.deepStrictEqual(h.workers[0].sent, [], 'Must not scan during startup');
  h.workers[0].emit('message', { ready: true });
  assert.deepStrictEqual(h.workers[0].sent, ['start']);
  assert.deepStrictEqual([...h.timers.values()].map(timer => timer.ms), [2000]);
  const scanTimer = [...h.timers.values()][0];
  h.workers[0].emit('message', { ready: true }); assert.strictEqual([...h.timers.values()][0], scanTimer);
  h.workers[0].emit('message', { result: { totalMatches: 1 } });
  assert.strictEqual((await pending).totalMatches, 1); assert.strictEqual(h.timers.size, 0); assert.strictEqual(h.workers[0].terminated, 1);
  const cold = harness(); pending = cold.search({ query: 'fixture' });
  const rejectedCold = assert.rejects(pending, error => error.code === 'E_TIMEOUT' && error.detail.phase === 'startup');
  [...cold.timers.values()][0].fn(); await rejectedCold; assert.strictEqual(cold.timers.size, 0);
  const slow = harness(); pending = slow.search({ query: 'fixture' });
  slow.workers[0].emit('message', { ready: true });
  const rejectedScan = assert.rejects(pending, error => error.code === 'E_TIMEOUT' && error.detail.phase === 'scan');
  [...slow.timers.values()][0].fn(); await rejectedScan;
  slow.workers[0].emit('message', { result: { totalMatches: 99 } });
  assert.strictEqual(slow.workers[0].terminated, 1); assert.strictEqual(slow.timers.size, 0);
  console.log('Search lifecycle: bounded startup, unchanged scan budget, one start, duplicate ready/late result ignored and cleanup passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
