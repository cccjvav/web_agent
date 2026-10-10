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
// Every Quick Tunnel start writes <home>/.webagent/cloudflared-quick-tunnel.yml; keep all of them in tmp, never the real home.
const oldHome = process.env.HOME, oldProfile = process.env.USERPROFILE;
const home = path.join(tmp, 'home'); fs.mkdirSync(home);
process.env.HOME = home; process.env.USERPROFILE = home;
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
  const spawnCalls = [];
  cp.spawn = (cmd, args, options) => { const proc = fake(); spawned.push(proc); spawnCalls.push({ cmd, args, options }); return proc; };
  cp.spawnSync = () => ({ status: 1, stdout: '' });
  const tunnel = require('../src/tunnel/cloudflared');
  const { config } = require('../src/config');
  // Quick Tunnel isolation: own --config under <home>/.webagent and --protocol auto (QUIC falls back to HTTP/2).
  const first = tunnel.startQuickTunnel(); await tick();
  const ownConfig = path.join(fs.realpathSync(home), '.webagent', 'cloudflared-quick-tunnel.yml');
  assert.deepStrictEqual(spawnCalls[0].args, ['tunnel', '--config', ownConfig, '--no-autoupdate', '--protocol', 'auto', '--url', `http://127.0.0.1:${config.port}`],
    'quick tunnel passes its own config file and --protocol auto');
  assert.strictEqual(fs.readFileSync(ownConfig, 'utf8'), tunnel.QUICK_TUNNEL_CONFIG_TEXT);
  assert.ok(!/ingress|tunnel:|protocol:/.test(tunnel.QUICK_TUNNEL_CONFIG_TEXT.split('\n').filter(line => !line.startsWith('#')).join('\n')), 'own config sets nothing but no-autoupdate');
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(ownConfig).mode & 0o077, 0, 'own config is private to the user');
  assert.ok(!fs.readdirSync(path.dirname(ownConfig)).some(name => name.endsWith('.tmp')), 'no scratch file left behind');
  // A symlink planted where the file goes is replaced, never followed.
  if (process.platform !== 'win32') {
    const victim = path.join(tmp, 'victim.txt'); fs.writeFileSync(victim, 'keep');
    const planted = path.join(tmp, 'planted'); fs.mkdirSync(path.join(planted, '.webagent'), { recursive: true });
    fs.symlinkSync(victim, path.join(planted, '.webagent', 'cloudflared-quick-tunnel.yml'));
    const written = tunnel.writeQuickTunnelConfig(planted);
    assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'keep', 'symlink target untouched');
    assert.ok(!fs.lstatSync(written.file).isSymbolicLink());
  }
  const blocked = path.join(tmp, 'not-a-dir'); fs.writeFileSync(blocked, 'x');
  const failed = tunnel.writeQuickTunnelConfig(blocked);
  assert.strictEqual(failed.file, null); assert.ok(failed.reason, 'an unwritable home reports a reason instead of throwing');
  assert.deepStrictEqual(tunnel.quickTunnelArgs('http://127.0.0.1:1', null), ['tunnel', '--no-autoupdate', '--protocol', 'auto', '--url', 'http://127.0.0.1:1']);
  assert.deepStrictEqual(tunnel.quickTunnelArgs('t', 'C:\\Users\\Some One\\.webagent\\q.yml', { needShell: true }).slice(1, 3), ['--config', '"C:\\Users\\Some One\\.webagent\\q.yml"'], 'cmd.exe wrapper gets a quoted path');
  for (const unsafe of ['C:\\Users\\a&b\\q.yml', 'C:\\Users\\100%\\q.yml', 'C:\\Users\\x^y\\q.yml', 'C:\\Users\\w!\\q.yml']) {
    assert.ok(!tunnel.quickTunnelArgs('t', unsafe, { needShell: true }).includes('--config'), 'cmd metacharacters are never passed: ' + unsafe);
  }
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
      // F100: neither helper receives its credential on the command line; both read it from the environment.
      const call = spawnCalls.at(-1);
      assert.ok(!JSON.stringify(call.args).includes(token), `${provider}: token must not be an argv item`);
      assert.strictEqual(call.options.env[provider === 'named' ? 'TUNNEL_TOKEN' : 'NGROK_AUTHTOKEN'], token, `${provider}: token is passed through the environment`);
      if (provider === 'named') assert.deepStrictEqual(call.args, ['tunnel', '--no-autoupdate', 'run']);
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
    // F129: an ngrok error code rejects at once with what to do, not after 25 s or with an install hint.
    {
      const token = 'fixture-secret-busy';
      const start = ngrok.startNgrokTunnel({ token }); const outcome = start.catch(error => error); await tick();
      const proc = spawned.at(-1);
      proc.stderr.emit('data', Buffer.from(`t=1 lvl=eror msg="failed to start tunnel" err="authtoken ${token} ... The endpoint is already online. ERR_NGROK_334"\n`));
      proc.emit('exit', 1);
      const error = await outcome;
      assert.ok(error instanceof Error && error.code === 'ERR_NGROK_334' && error.retryable === false, 'busy endpoint is a non-retryable ngrok failure');
      assert.strictEqual(error.message, ngrok.NGROK_FAILURES.ERR_NGROK_334);
      assert.ok(!error.message.includes(token), 'the ngrok output is never copied into the error');
      assert.ok(proc.signals.length > 0, 'the agent is stopped as soon as the code is seen');
      const unknown = ngrok.startNgrokTunnel({ token }); const unknownOutcome = unknown.catch(error => error); await tick();
      spawned.at(-1).stderr.emit('data', Buffer.from('ERROR: something new ERR_NGROK_8012\n'));
      spawned.at(-1).emit('exit', 1);
      const other = await unknownOutcome;
      assert.strictEqual(other.code, 'ERR_NGROK_8012');
      assert.ok(other.message.includes('https://ngrok.com/docs/errors/err_ngrok_8012') && !other.message.includes(ngrok.installHint()), 'an unknown code on exit points at the ngrok docs, not at installing');
    }
    assert.strictEqual(ngrok.ngrokFailure('The endpoint "https://a.ngrok.app" is already online').code, 'ERR_NGROK_334', 'the plain-text form is recognised too');
    assert.strictEqual(ngrok.ngrokFailure('err_ngrok_108').message, ngrok.NGROK_FAILURES.ERR_NGROK_108);
    assert.strictEqual(ngrok.ngrokFailure('started tunnel url=https://x.ngrok.app'), null);
    // Own config cannot be written: start anyway without --config and say so in the Bridge log.
    {
      const blockedHome = path.join(tmp, 'home-is-a-file'); fs.writeFileSync(blockedHome, 'x');
      process.env.HOME = blockedHome; process.env.USERPROFILE = blockedHome;
      const beforeWarn = logs.length;
      const start = tunnel.startQuickTunnel(); const outcome = start.catch(error => error); await tick();
      process.env.HOME = home; process.env.USERPROFILE = home;
      assert.ok(!spawnCalls.at(-1).args.includes('--config'), 'no --config when the file could not be written');
      assert.deepStrictEqual(spawnCalls.at(-1).args.slice(-5), ['--no-autoupdate', '--protocol', 'auto', '--url', `http://127.0.0.1:${config.port}`]);
      assert.ok(logs.slice(beforeWarn).some(chunk => chunk.includes('Quick Tunnel') && chunk.includes('~/.cloudflared/config.yml')), 'the fallback is announced in the tunnel log');
      const stopped = tunnel.stopTunnel(); spawned.at(-1).emit('exit', 0); await stopped; await outcome;
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
  if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
  if (oldProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldProfile;
  fs.rmSync(tmp, { recursive: true, force: true });
});
