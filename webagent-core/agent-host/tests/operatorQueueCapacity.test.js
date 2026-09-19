'use strict';
const assert = require('assert');
const queue = require('../src/utils/operatorQueue');

async function main() {
  const originalNow = Date.now;
  let now = originalNow();
  let executions = 0;
  try {
    Date.now = () => now;
    queue.register('capacity-fixture', async input => {
      executions++;
      return { ok: true, status: 'succeeded', value: input.value };
    });

    let first;
    for (let index = 0; index < 40; index++) {
      const pending = queue.submit('capacity-fixture', { value: index }, {}, `capacity-${String(index).padStart(3, '0')}`);
      if (index === 0) first = pending;
      await queue.approve(pending.requestId, true);
    }
    assert.strictEqual(executions, 40);
    assert.strictEqual(queue.inspect(first.requestId).result.value, 0,
      'capacity pressure must not evict an unexpired terminal result');

    const duplicate = queue.submit('capacity-fixture', { value: 0 }, {}, 'capacity-000');
    assert.strictEqual(duplicate.requestId, first.requestId,
      'the stable key remains idempotent for the complete retention window');
    await queue.approve(duplicate.requestId, true);
    assert.strictEqual(executions, 40);

    assert.throws(() => queue.submit('capacity-fixture', { value: 40 }, {}, 'capacity-040'),
      /history.*full|capacity/i,
      'a new request is rejected rather than deleting queryable/idempotency evidence early');

    now += 15 * 60 * 1000 + 1;
    const afterExpiry = queue.submit('capacity-fixture', { value: 40 }, {}, 'capacity-040');
    await queue.approve(afterExpiry.requestId, true);
    assert.strictEqual(executions, 41);
  } finally {
    Date.now = originalNow;
  }
  console.log('operator queue capacity: full-window results and request-key idempotency passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
