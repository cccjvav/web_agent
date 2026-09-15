'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const { createLifecycle } = require('../src/mcp/requestLifecycle');
const { currentSignal, checkCancelled } = require('../src/utils/requestScope');
const { isToolFailure } = require('../src/utils/toolTrace');

async function main() {
  const life = createLifecycle({ timeoutMs: 1000, limit: 2 });
  const a = life.owner('session-a', 'credential-a');
  const b = life.owner('session-b', 'credential-a');
  const c = life.owner('session-a', 'credential-b');
  function wait() {
    const signal = currentSignal();
    return new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  }
  let signal;
  const pending = life.run(a, 0, null, () => { signal = currentSignal(); return wait(); });
  life.cancel(b, 0); life.cancel(c, 0); life.cancel(a, '0');
  assert.strictEqual(signal.aborted, false);
  await assert.rejects(life.run(a, 0, null, async () => {}), /Duplicate/);
  life.cancel(a, 0); await pending;
  await life.run(a, 0, null, async () => assert.strictEqual(currentSignal().aborted, false));
  life.cancel(a, 0); // late cancellation must not be cached for future calls
  const response = new EventEmitter();
  const disconnected = life.run(a, 1, response, wait);
  response.emit('close'); await disconnected;
  assert.strictEqual(response.listenerCount('close'), 0);
  await assert.rejects(life.run(a, 2, response, async () => { throw new Error('fixture'); }), /fixture/);
  assert.strictEqual(response.listenerCount('close'), 0);
  const x = life.run(a, 3, null, wait), y = life.run(b, 3, null, wait);
  await assert.rejects(life.run(a, 4, null, async () => {}), /Too many/);
  life.cancel(a, 3); life.cancel(b, 3); await Promise.all([x, y]);
  const deadline = createLifecycle({ timeoutMs: 10 });
  // A referenced watchdog prevents an unref timer from ending the test early.
  const watchdog = setTimeout(() => { throw new Error('deadline did not fire'); }, 1000);
  try {
    await deadline.run(a, 'timeout', null, async () => { await wait(); assert.throws(checkCancelled, e => e.code === 'E_CANCELLED'); });
  } finally { clearTimeout(watchdog); }
  for (const result of [{ok:false}, {success:false}, {isError:true}, {isTimeout:true}, {exitCode:2}, {status:'cancelled'}, {trace:{status:'unknown'}}, {verification:{state:'unknown'}}]) assert.strictEqual(isToolFailure(result), true);
  for (const result of [{ok:true}, {status:'running'}, {status:'waiting-approval'}, {exitCode:0}, {available:false}]) assert.strictEqual(isToolFailure(result), false);
  console.log('request lifecycle ownership, cleanup, deadline and outcome tests passed');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
