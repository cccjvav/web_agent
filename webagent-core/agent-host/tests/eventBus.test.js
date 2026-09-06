const assert = require('assert');
const fs = require('fs');
const path = require('path');
const eventBus = require('../src/utils/eventBus');

const busSrc = fs.readFileSync(path.join(__dirname, '../src/utils/eventBus.js'), 'utf8');
const appSrc = fs.readFileSync(path.resolve(__dirname, '../../workbench/app.js'), 'utf8');

assert.ok(/ws\.onclose\s*=/.test(appSrc), 'app.js must reconnect on ws.onclose');
assert.ok(appSrc.includes('事件流重连中'), 'app.js must show 事件流重连中 while reconnecting');
assert.ok(appSrc.includes('connectWs()'), 'app.js reconnect must call connectWs');
assert.ok(/setTimeout\(/.test(appSrc) && appSrc.includes('30000'), 'app.js backoff must cap at 30000ms');
assert.ok(/Math\.min\(/.test(appSrc), 'app.js backoff uses Math.min');

assert.ok(
  (busSrc.match(/this\._touchIdle\(ws\)/g) || []).length >= 2,
  'eventBus addWsClient and broadcast must both _touchIdle'
);
assert.ok(
  /ws\.send\(message\);\s*this\._touchIdle\(ws\)/.test(busSrc.replace(/\s+/g, ' ')),
  'broadcast must touch idle timer after a successful send'
);

eventBus.broadcast('tool_result', {
  apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
  token: 'ghp_abcdefghijklmnopqrstuvwxyz0123',
  namedToken: 'eyJnamed-tunnel-token-must-hide',
  ngrokToken: 'ngrok_authtoken_must_hide',
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
assert.strictEqual(latest.payload.namedToken, '[redacted]');
assert.strictEqual(latest.payload.ngrokToken, '[redacted]');
assert.strictEqual(latest.payload.oldSecret, '[redacted]');
assert.ok(!blob.includes('should-not-leak'));
assert.ok(!blob.includes('eyJnamed-tunnel-token-must-hide'));
assert.ok(!blob.includes('ngrok_authtoken_must_hide'));

function fakeWs() {
  const handlers = {};
  return {
    readyState: 1,
    sent: [],
    closeCode: null,
    send(msg) { this.sent.push(msg); },
    close(code) {
      this.closeCode = code;
      this.readyState = 3;
      if (handlers.close) handlers.close();
    },
    on(ev, fn) { handlers[ev] = fn; }
  };
}

const realSet = setTimeout;
const realClear = clearTimeout;
const timers = new Map();
let nextId = 1;
global.setTimeout = (fn, ms) => {
  const id = nextId++;
  timers.set(id, { fn, ms });
  return id;
};
global.clearTimeout = (id) => { timers.delete(id); };

try {
  const ws = fakeWs();
  assert.strictEqual(eventBus.addWsClient(ws), true);
  assert.strictEqual(timers.size, 1);
  const firstId = [...timers.keys()][0];
  assert.strictEqual(timers.get(firstId).ms, 30 * 60 * 1000);

  eventBus.broadcast('tool_call_end', { tool: 'ping', success: true, durationMs: 1 });
  assert.strictEqual(ws.sent.length, 1);
  assert.ok(!timers.has(firstId), 'broadcast must clear the previous idle timer');
  assert.strictEqual(timers.size, 1, 'broadcast must arm a fresh idle timer');
  const secondId = [...timers.keys()][0];
  assert.notStrictEqual(secondId, firstId);
  assert.strictEqual(timers.get(secondId).ms, 30 * 60 * 1000);

  const idleFn = timers.get(secondId).fn;
  idleFn();
  assert.strictEqual(ws.closeCode, 1001);
  assert.strictEqual(timers.size, 0, 'close must clear idle timer');

  const extra = [];
  for (let i = 0; i < 32; i += 1) extra.push(fakeWs());
  extra.forEach((sock) => assert.strictEqual(eventBus.addWsClient(sock), true));
  const overflow = fakeWs();
  assert.strictEqual(eventBus.addWsClient(overflow), false);
  assert.strictEqual(overflow.closeCode, 1013);
  extra.forEach((sock) => sock.close(1000));
} finally {
  global.setTimeout = realSet;
  global.clearTimeout = realClear;
}

console.log('eventBus tests passed');
