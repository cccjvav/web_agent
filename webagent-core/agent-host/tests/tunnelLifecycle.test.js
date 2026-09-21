'use strict';
const assert = require('assert');
const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { stopProcess } = require('../src/tunnel/stopProcess');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-tunnel-life-'));
const receipts = require('../src/tunnel/tunnelRegistry');
const oldObserve = receipts.observeTunnel, observed = [];
receipts.observeTunnel = (proc, provider, bin) => observed.push({ proc, provider, bin });
const oldSpawn = cp.spawn, oldFind = cp.spawnSync, oldPath = process.env.CLOUDFLARED_PATH, oldNgrokPath = process.env.NGROK_PATH;
function fake() {
  const proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
  proc.exitCode = null; proc.signalCode = null; proc.signals = [];
  proc.kill = signal => { proc.signals.push(signal); proc.killed = true; };
  return proc;
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const stubborn = fake();
  const keep = setTimeout(() => {}, 1000);
  stubborn.kill = signal => { stubborn.signals.push(signal); stubborn.killed = true; if (signal === 'SIGKILL') stubborn.emit('exit', 0); };
  await stopProcess(stubborn, 10); clearTimeout(keep);
  assert.deepStrictEqual(stubborn.signals, ['SIGTERM', 'SIGKILL'], 'killed flag is not proof of process exit');
  const failedSignal = fake(); failedSignal.pid = 123; failedSignal.kill = () => { throw new Error('signal failed'); };
  const keepFailure = setTimeout(() => {}, 1000);
  await assert.rejects(stopProcess(failedSignal, 10), /did not exit/); clearTimeout(keepFailure);
  const bin = path.join(tmp, 'cloudflared'); fs.writeFileSync(bin, 'fixture'); process.env.CLOUDFLARED_PATH = bin;
  const spawned = [];
  cp.spawn = () => { const proc = fake(); spawned.push(proc); return proc; };
  cp.spawnSync = () => ({ status: 1, stdout: '' });
  const tunnel = require('../src/tunnel/cloudflared');
  const { config } = require('../src/config');
  const first = tunnel.startQuickTunnel(); await tick();
  spawned[0].stdout.emit('data', Buffer.from('https://first.trycloudflare.com'));
  await first; assert.ok(config.publicTunnelUrl.includes('first'));
  const second = tunnel.startQuickTunnel(); await tick();
  assert.strictEqual(spawned.length, 1, 'replacement waits for old process exit');
  spawned[0].stdout.emit('data', Buffer.from('https://stale.trycloudflare.com'));
  assert.strictEqual(config.publicTunnelUrl, null);
  spawned[0].emit('exit', 0); await tick();
  assert.strictEqual(spawned.length, 2);
  spawned[1].stdout.emit('data', Buffer.from('https://second.trycloudflare.com')); await second;
  spawned[0].emit('exit', 0);
  assert.ok(config.publicTunnelUrl.includes('second'), 'late old exit cannot clear new URL');
  config.bridgeRunning = true;
  spawned[1].emit('exit', 1);
  assert.strictEqual(config.publicTunnelUrl, null); assert.strictEqual(config.bridgeRunning, false);
  const third = tunnel.startQuickTunnel(); const rejected = assert.rejects(third, /cancelled/); await tick();
  const stopping = tunnel.stopTunnel(); spawned[2].emit('exit', 0);
  await stopping; await rejected;
  // Exercise actual provider callbacks, including interleaved stdout/stderr.
  const bus = require('../src/utils/eventBus');
  const logs = [];
  const collect = event => logs.push(event.chunk);
  bus.on('tunnel_log', collect);
  try {
    assert.equal(observed[0].provider, 'cloudflare');
    assert.strictEqual(observed[0].proc, spawned[0]);
    process.env.NGROK_PATH = bin;
    const ngrok = require('../src/tunnel/ngrok');
    for (const provider of ['named', 'ngrok']) {
      const token = 'fixture-secret-' + provider;
      const start = provider === 'named'
        ? tunnel.startNamedTunnel({hostname:'mcp.example.test',token})
        : ngrok.startNgrokTunnel({token});
      await tick();
      const proc = spawned.at(-1);
      const beginning = logs.length;
      proc.stdout.emit('data', Buffer.from('OUT: ' + token.slice(0, 10)));
      proc.stderr.emit('data', Buffer.from('ERR: ' + token.slice(0, 7)));
      assert.strictEqual(logs.slice(beginning).join(''), 'OUT: ERR: ');
      proc.stdout.emit('data', Buffer.from(token.slice(10) + '!'));
      proc.stderr.emit('data', Buffer.from(token.slice(7) + '!'));
      assert.strictEqual(logs.slice(beginning).join(''), 'OUT: ERR: [token]![token]!');
      proc.stdout.emit('data', Buffer.from(provider === 'named' ? ' Registered tunnel connection' : ' url=https://fixture.ngrok.app'));
      await start;
      const beforePartial = logs.length;
      proc.stderr.emit('data', Buffer.from(token.slice(0, 8)));
      assert.strictEqual(logs.length, beforePartial, 'unfinished token prefix is withheld');
      const stopped = tunnel.stopTunnel();
      proc.stdout.emit('data', Buffer.from(token));
      proc.emit('exit', 0);
      await stopped;
      assert.ok(!logs.slice(beginning).join('').includes(token));
      assert.ok(!JSON.stringify(bus.getRecentLogs(500)).includes(token), 'stored event history is also redacted');
    }
  } finally { bus.removeListener('tunnel_log', collect); }
  assert(observed.some(item => item.provider === 'cloudflare-named'));
  assert(observed.some(item => item.provider === 'ngrok'));
  assert.equal(observed.length, spawned.length, 'exactly one receipt observation per provider spawn');
  console.log('tunnel process reference/generation/start-stop regressions passed');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  receipts.observeTunnel = oldObserve;
  cp.spawn = oldSpawn; cp.spawnSync = oldFind;
  if (oldPath === undefined) delete process.env.CLOUDFLARED_PATH; else process.env.CLOUDFLARED_PATH = oldPath;
  if (oldNgrokPath === undefined) delete process.env.NGROK_PATH; else process.env.NGROK_PATH = oldNgrokPath;
  fs.rmSync(tmp, { recursive: true, force: true });
});
