const assert = require('assert');
const eventBus = require('../src/utils/eventBus');

eventBus.broadcast('tool_result', {
  apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
  token: 'ghp_abcdefghijklmnopqrstuvwxyz0123',
  oldSecret: 'should-not-leak',
  note: 'plain',
  chunk: `Bearer abcdefghijklmnop ${'x'.repeat(2000)}`
});

const logs = eventBus.getRecentLogs(5);
const blob = JSON.stringify(logs);
assert.ok(blob.includes('[redacted]'), 'secrets must be redacted in logs');
assert.ok(!blob.includes('sk-abcdefghijklmnopqrstuvwxyz'));
assert.ok(!blob.includes('ghp_abcdefghijklmnopqrstuvwxyz0123'));
assert.ok(!/Bearer abcdefghijklmnop/.test(blob));
assert.ok(!blob.includes('x'.repeat(600)), 'long chunks must be clipped');
const latest = logs.find((e) => e.type === 'tool_result');
assert.ok(latest);
assert.strictEqual(latest.payload.note, 'plain');
assert.strictEqual(latest.payload.apiKey, '[redacted]');
assert.strictEqual(latest.payload.oldSecret, '[redacted]');
assert.ok(!blob.includes('should-not-leak'));

console.log('eventBus tests passed');
