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

// F94 resource bounds. terminate() only marks the fake: a real socket emits 'close' later, and the slot must be
// freed at once regardless.
function boundedWs({ canTerminate = true } = {}) {
  const handlers = {};
  const ws = {
    readyState: 1, bufferedAmount: 0, sent: [], pings: 0, terminated: false, closeCode: null, pingThrows: false,
    send(msg) { this.sent.push(msg); },
    ping() { if (this.pingThrows) throw new Error('socket gone'); this.pings++; },
    close(code) { this.closeCode = code; this.readyState = 2; },
    on(ev, fn) { handlers[ev] = fn; },
    emit(ev) { if (handlers[ev]) handlers[ev](); }
  };
  if (canTerminate) ws.terminate = function () { this.terminated = true; this.readyState = 3; };
  return ws;
}
const realInterval = setInterval;
const realClearInterval = clearInterval;
const intervals = new Map();
global.setTimeout = () => nextId++;
global.clearTimeout = () => {};
global.setInterval = (fn, ms) => { const id = { fn, ms, unref() { this.unrefed = true; } }; intervals.set(id, true); return id; };
global.clearInterval = (id) => { intervals.delete(id); };
try {
  assert.strictEqual(eventBus.wsClients.size, 0);
  assert.strictEqual(eventBus.heartbeat, null, 'no heartbeat while no client is connected');
  const a = boundedWs(); const b = boundedWs();
  eventBus.addWsClient(a); eventBus.addWsClient(b);
  assert.strictEqual(intervals.size, 1, 'one shared heartbeat interval');
  const beat = [...intervals.keys()][0];
  assert.strictEqual(beat.ms, eventBus.WS_HEARTBEAT_MS);
  assert.strictEqual(beat.ms, 30 * 1000);
  assert.ok(beat.unrefed, 'the heartbeat does not keep the process alive');

  // Heartbeat: a answers the first ping, b does not; b is dropped on the next round, a is pinged again.
  beat.fn();
  assert.deepStrictEqual([a.pings, b.pings], [1, 1]);
  a.emit('pong');
  beat.fn();
  assert.ok(b.terminated && !eventBus.wsClients.has(b), 'a silent peer is terminated and loses its slot');
  assert.strictEqual(b.pings, 1, 'a dropped peer is not pinged again');
  assert.ok(!a.terminated && a.pings === 2 && eventBus.wsClients.has(a));
  b.emit('close'); // the late real 'close' is harmless
  assert.strictEqual(eventBus.wsClients.size, 1);

  // A closing socket is neither pinged nor dropped (its own 'close' removes it); a throwing ping drops.
  const closing = boundedWs(); eventBus.addWsClient(closing); closing.readyState = 2;
  const broken = boundedWs(); eventBus.addWsClient(broken); broken.pingThrows = true;
  a.emit('pong'); beat.fn();
  assert.ok(broken.terminated && !eventBus.wsClients.has(broken), 'a failed ping drops in the same round');
  a.emit('pong'); beat.fn();
  assert.ok(eventBus.wsClients.has(a), 'a client that keeps answering stays across rounds');
  assert.ok(eventBus.wsClients.has(closing) && closing.pings === 0 && !closing.terminated);
  assert.ok(broken.terminated && !eventBus.wsClients.has(broken), 'ping failure drops the client');
  closing.emit('close');

  // Backpressure: at the cap the event is still sent; above it the client is dropped without sending.
  const reader = boundedWs(); const stalled = boundedWs(); const legacy = boundedWs({ canTerminate: false });
  [reader, stalled, legacy].forEach(ws => eventBus.addWsClient(ws));
  stalled.bufferedAmount = eventBus.WS_MAX_BUFFERED;
  eventBus.broadcast('tool_call_end', { tool: 'x', success: true });
  assert.strictEqual(stalled.sent.length, 1, 'exactly at the cap is still sent');
  assert.strictEqual(eventBus.WS_MAX_BUFFERED, 1024 * 1024);
  stalled.bufferedAmount = eventBus.WS_MAX_BUFFERED + 1;
  legacy.bufferedAmount = eventBus.WS_MAX_BUFFERED + 1;
  eventBus.broadcast('tool_call_end', { tool: 'y', success: true });
  assert.strictEqual(stalled.sent.length, 1, 'over the cap: nothing more is queued');
  assert.ok(stalled.terminated && !eventBus.wsClients.has(stalled));
  assert.strictEqual(legacy.closeCode, 1001, 'without terminate() the socket is closed with 1001');
  assert.ok(!eventBus.wsClients.has(legacy));
  assert.strictEqual(reader.sent.length, 2, 'other clients still get the event after a drop in the same loop');
  assert.strictEqual(a.sent.length, 2);

  // The interval stops when the last client leaves, and a new one starts with the next client.
  a.emit('close'); reader.emit('close');
  assert.strictEqual(eventBus.wsClients.size, 0);
  assert.strictEqual(intervals.size, 0, 'heartbeat cleared once no client remains');
  assert.strictEqual(eventBus.heartbeat, null);
  const again = boundedWs(); eventBus.addWsClient(again);
  assert.strictEqual(intervals.size, 1);
  again.emit('close');
  assert.strictEqual(intervals.size, 0);
} finally {
  global.setTimeout = realSet;
  global.clearTimeout = realClear;
  global.setInterval = realInterval;
  global.clearInterval = realClearInterval;
}

console.log('eventBus tests passed');

// Authoritative per-process Bridge activity survives browser reload; local Chat is excluded.
eventBus.broadcast('bridge_round_reset');
eventBus.broadcast('tool_call_end', { tool: 'local-tool', success: true });
assert.strictEqual(eventBus.getBridgeActivity().stats.calls, 0);
for (let i = 0; i < 105; i++) eventBus.broadcast('tool_call_end', {
  source: 'Bridge-Remote', tool: 'ping', success: i !== 0, durationMs: 2,
  result: 'private result must not enter activity', args: { token: 'private-token' }
});
const activity = eventBus.getBridgeActivity();
assert.strictEqual(activity.stats.calls, 105);
assert.strictEqual(activity.stats.fail, 1);
assert.strictEqual(activity.stats.totalMs, 210);
assert.strictEqual(activity.logs.length, 100);
assert.ok(!JSON.stringify(activity).includes('private'));
assert.deepStrictEqual(eventBus.getBridgeActivity(), activity, 'reading a snapshot does not recount');
eventBus.broadcast('bridge_round_reset');
const cleared = eventBus.getBridgeActivity();
assert.strictEqual(cleared.epoch, activity.epoch);
assert.ok(cleared.revision > activity.revision);
assert.strictEqual(cleared.stats.calls, 0);
assert.strictEqual(cleared.logs.length, 0);
