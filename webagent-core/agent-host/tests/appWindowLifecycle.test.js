'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const vm = require('vm');
const { EventEmitter } = require('events');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '../../..');
const modulePath = path.join(root, 'installer/appWindow.js');
const originalPath = path.join(root, 'installer/launch.js');
// The baseline lives in launch.js; after extraction test the real owning module.
const filename = fs.existsSync(modulePath) ? modulePath : originalPath;
const source = fs.readFileSync(filename, 'utf8');
const load = createRequire(filename);
const version = require('../../extension/package.json').version;
const hostId = '12345678-1234-4123-8123-123456789abc';

function bounded(promise, ms = 1500) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('fixture guard: pending app launch')), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function fakeClock() {
  let now = 0, nextId = 0;
  const timers = new Map();
  return { timers, get now() { return now; },
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, {fn, at:now+ms, ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers].filter(([,t]) => t.at <= until).sort((a,b) => a[1].at-b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn();
      }
      now = until;
    }, elapse(ms) { now += ms; }
  };
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
async function drive(promise, clock, maximum = 135000) {
  let settled = false, failure, value;
  promise.then(result => { settled = true; value = result; }, error => { settled = true; failure = error; });
  for (let elapsed = 0; !settled && elapsed <= maximum; elapsed += 50) { await nextTurn(); clock.advance(50); }
  await nextTurn(); assert.ok(settled, 'fixture clock could not settle startup');
  if (failure) throw failure;
  return value;
}

function harness(options = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-app-window-'));
  const workspace = path.join(home, 'project #一 & two'); fs.mkdirSync(workspace);
  const calls = [], requests = [], logs = [], proc = new EventEmitter();
  let available = !options.cold, diagnostics = 0;
  Object.assign(proc, { env: {}, platform: process.platform, execPath: process.execPath });
  const env = { CODE_SERVER_PORT: '51212', AGENT_HOST_PORT: '51211', CODE_SERVER_PASSWORD: 'fixture-key-not-for-probes' };
  const transport = { get(url, ...args) {
    requests.push({ url: String(url), options: args.length > 1 ? args[0] : {} });
    const callback = args.at(-1), req = new EventEmitter(), res = new EventEmitter();
    req.destroy = () => { req.destroyed = true; };
    res.destroy = () => { res.destroyed = true; };
    res.resume = () => {};
    res.statusCode = 200; res.headers = { 'content-type': 'application/json' };
    const body = String(url).endsWith('/healthz') ? { status: 'alive', lastHeartbeat: 1 } : {
      identity: { hostInstanceId: hostId, workspaceRoot: options.wrongWorkspace ? home : workspace, mcpPort: 51211,
        workbenchPort: 3000, version, startedAt: '2026-09-21T00:00:00.000Z' }, capabilities: []
    };
    if (body.identity) {
      diagnostics++;
      if (options.changedInstance && diagnostics > 1) body.identity.hostInstanceId = '87654321-1234-4123-8123-123456789abc';
      if (options.badIdentity) options.badIdentity(body.identity);
    }
    if (options.badHealth && !body.identity) Object.assign(body, options.badHealth);
    queueMicrotask(() => {
      if (!available || options.missingHost && body.identity || options.missingEditor && !body.identity) { req.emit('error', Object.assign(new Error('fixture refused'), {code:'ECONNREFUSED'})); return; }
      callback(res); if (!res.destroyed) { res.emit('data', Buffer.from(JSON.stringify(body))); res.emit('end'); }
    });
    return req;
  } };
  const childProcess = { spawn(command, args, opts) {
    const runner = command === proc.execPath && args[0]?.endsWith('run-code-oss.js');
    if (runner && options.realRunner) {
      const child = require('child_process').spawn(proc.execPath, [options.realRunner, workspace], { ...opts, env: {...process.env,...opts.env} });
      child.on('message', message => { if (message.type === 'webagent-app-prepared') available = true; });
      calls.push({ command, args, opts, child, runner }); return child;
    }
    if (options.throwSpawn && (runner || !options.cold)) throw new Error('fixture spawn threw');
    const child = new EventEmitter();
    Object.assign(child, { pid: 10000 + calls.length, exitCode: null, signalCode: null, connected: true, messages: [], kills: [], unrefs: 0 });
    child.unref = () => { child.unrefs++; };
    child.kill = signal => { child.kills.push(signal); child.signalCode = signal; child.emit('exit', null, signal); return true; };
    child.disconnect = () => { child.connected = false; child.emit('disconnect'); };
    child.send = (message, callback) => {
      child.messages.push(message);
      queueMicrotask(() => {
        if (callback && !(message.type === 'webagent-app-release' && options.hangReleaseCallback)) callback(null);
        if (message.type === 'webagent-app-stop' && !options.hangStop) {
          child.exitCode = options.stopExit || 0; child.emit('exit', child.exitCode, null);
        }
        if (message.type === 'webagent-app-release' && !options.noReleaseAck) child.emit('message', {type:'webagent-app-released'});
      });
    };
    calls.push({ command, args, opts, child, runner });
    queueMicrotask(() => {
      if (runner && options.runnerFailure || !runner && options.browserFailure) {
        child.pid = undefined; child.emit('error', new Error('fixture executable missing'));
      } else {
        child.emit('spawn');
        if (runner && !options.noPrepared) {
          available = true;
          child.emit('message', options.badPrepared || {type:'webagent-app-prepared',workspaceRoot:workspace,codePort:51212,mcpPort:51211});
        }
      }
    });
    return child;
  } };
  const context = { module: { exports: {} }, __dirname: path.join(root, 'installer'), process: proc, URL, Buffer, TextDecoder,
    setTimeout: options.clock?.setTimeout || setTimeout, clearTimeout: options.clock?.clearTimeout || clearTimeout, AbortController, console: { error: (...args) => logs.push(args.join(' ')) },
    require(name) {
      if (name === 'http') return options.http || transport;
      if (name === 'child_process') return childProcess;
      if (name === 'perf_hooks' && options.clock) return {performance:{now:()=>options.clock.now}};
      return load(name);
    }
  };
  vm.runInNewContext(source + '\nmodule.exports.appWindow = appWindow;', context, { filename });
  return { api: context.module.exports, context, home, workspace, env, proc, requests, calls, logs,
    close() { fs.rmSync(home, { recursive: true, force: true }); }
  };
}

(async () => {
  const failures = [];
  const test = async (name, fn) => {
    try { await fn(); console.log('PASS ' + name); }
    catch (error) { failures.push(name); console.error('FAIL ' + name + '\n' + error.stack); }
  };
  await test('HTTP 200 from an unrelated HTML service is not code-server readiness', async () => {
    const server = http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>unrelated service</h1>'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const h = harness({ http });
    try { assert.equal(await bounded(h.api.ready(`http://127.0.0.1:${server.address().port}`)), false); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); h.close(); }
  });
  await test('an existing service for a different workspace cannot open a browser', async () => {
    const h = harness({ wrongWorkspace: true });
    try {
      await assert.rejects(bounded(h.api.appWindow(root, h.workspace, h.env, h.home)), /工作区|身份|已占用/);
      assert.equal(h.calls.length, 0, 'do not start or terminate anything belonging to another workspace');
    } finally { h.close(); }
  });
  await test('browser spawn failure rejects instead of reporting app launch success', async () => {
    const h = harness({ browserFailure: true });
    try {
      await assert.rejects(bounded(h.api.appWindow(root, h.workspace, h.env, h.home)), /浏览器|browser/);
      assert.equal(h.calls.length, 1, 'do not replay the browser launch or stop a reused service');
    } finally { h.close(); }
  });
  await test('reuse pins host identity and explicitly selects the requested folder', async () => {
    const h = harness();
    try {
      await bounded(h.api.appWindow(root, h.workspace, h.env, h.home));
      assert.equal(h.calls.length, 1); assert.equal(h.calls[0].runner, false);
      const url = new URL(h.calls[0].args.at(-1));
      assert.equal(url.origin, 'http://127.0.0.1:51212'); assert.equal(url.searchParams.get('folder'), h.workspace);
      assert.equal(url.hash, ''); assert.equal(h.calls[0].opts.shell, false);
      assert.equal(h.requests.filter(r => r.url.endsWith('/api/diagnostics')).length, 2);
      assert.ok(!JSON.stringify(h.requests).includes(h.env.CODE_SERVER_PASSWORD), 'never send credentials to a readiness endpoint');
      assert.equal(h.proc.listenerCount('SIGINT'), 0); assert.equal(h.proc.listenerCount('SIGTERM'), 0);
    } finally { h.close(); }
  });
  await test('a host restart between reads refuses the browser side effect', async () => {
    const h = harness({ changedInstance: true });
    try { await assert.rejects(bounded(h.api.appWindow(root, h.workspace, h.env, h.home)), /实例.*变化/); assert.equal(h.calls.length, 0); }
    finally { h.close(); }
  });
  for (const [name, options] of [
    ['wrong version', {badIdentity: id => { id.version = '0.0.0'; }}],
    ['wrong MCP port', {badIdentity: id => { id.mcpPort = 1234; }}],
    ['invalid instance', {badIdentity: id => { id.hostInstanceId = {}; }}],
    ['invalid startedAt', {badIdentity: id => { id.startedAt = 'not-a-date'; }}],
    ['remote path', {badIdentity: id => { id.workspaceRoot = '\\untrusted.invalid\share'; }}],
    ['wrong editor shape', {badHealth:{status:'ok'}}],
    ['partial host', {missingHost:true}], ['partial editor', {missingEditor:true}]
  ]) {
    await test(`${name} is not reusable and cannot start or kill another service`, async () => {
      const h = harness(options);
      try { await assert.rejects(bounded(h.api.appWindow(root,h.workspace,h.env,h.home))); assert.equal(h.calls.length,0); }
      finally { h.close(); }
    });
  }
  await test('invalid/same ports and non-loopback probe URLs do no network work', async () => {
    const h = harness();
    try {
      for (const env of [{CODE_SERVER_PORT:'0'}, {AGENT_HOST_PORT:'bad'}, {CODE_SERVER_PORT:'3000',AGENT_HOST_PORT:'3000'}]) {
        await assert.rejects(h.api.appWindow(root,h.workspace,env,h.home));
      }
      for (const url of ['https://127.0.0.1/healthz','http://example.test/healthz','http://user:pass@127.0.0.1/healthz','http://127.0.0.1/api/other','http://127.0.0.1/healthz?token=secret']) {
        assert.throws(() => h.api.probeJson(url));
      }
      assert.equal(h.calls.length,0); assert.equal(h.requests.length,0);
    } finally { h.close(); }
  });
  for (const [label, options, errorPattern] of [
    ['runner spawn error',{runnerFailure:true},/后台启动失败/],
    ['runner synchronous spawn throw',{throwSpawn:true},/spawn threw/],
    ['invalid prepared message',{badPrepared:{type:'webagent-app-prepared',workspaceRoot:'/wrong',codePort:51212,mcpPort:51211}},/阶段信息/],
    ['no prepared message',{noPrepared:true},/120秒/],
    ['new browser spawn failure',{browserFailure:true},/浏览器/],
    ['release callback never settles',{hangReleaseCallback:true},/120秒/],
    ['release acknowledgement missing',{noReleaseAck:true},/120秒/]
  ]) {
    await test(`${label} fails without replay and requests only its own supervisor to stop`, async () => {
      const clock = fakeClock(), h = harness({clock,cold:true,...options});
      try {
        await assert.rejects(drive(h.api.appWindow(root,h.workspace,h.env,h.home),clock),errorPattern);
        assert.ok(h.calls.filter(c=>c.runner).length <= 1); assert.ok(h.calls.filter(c=>!c.runner).length <= 1);
        const runner = h.calls.find(c=>c.runner)?.child;
        if (runner?.pid) assert.ok(runner.messages.some(m=>m.type==='webagent-app-stop'));
        for (const call of h.calls) assert.deepStrictEqual(call.child.kills,[],'no PID/name/port/tree kill');
        assert.equal(clock.timers.size,0); assert.equal(h.proc.listenerCount('SIGINT'),0);
      } finally { h.close(); }
    });
  }
  await test('cold start waits for preparation, pins probes, and detaches only after release acknowledgement', async () => {
    const clock = fakeClock(), h = harness({clock,cold:true});
    try {
      await drive(h.api.appWindow(root,h.workspace,h.env,h.home),clock);
      assert.equal(h.calls.length,2);
      const owned = h.calls[0]; assert.equal(owned.runner,true); assert.equal(owned.opts.stdio[3],'ipc');
      assert.equal(owned.opts.env.WEBAGENT_APP_BOOTSTRAP,'1'); assert.equal(owned.args.at(-1),h.workspace);
      assert.deepStrictEqual(owned.child.messages.map(m=>m.type),['webagent-app-release']);
      assert.equal(owned.child.connected,false); assert.equal(owned.child.unrefs,1); assert.equal(owned.child.exitCode,null);
      assert.deepStrictEqual(owned.child.kills,[]); assert.equal(clock.timers.size,0);
      const url = new URL(h.calls[1].args.at(-1)); assert.equal(url.searchParams.get('folder'),h.workspace);
    } finally { h.close(); }
  });
  await test('stop during startup cancels polling, rejects late preparation and never opens a browser', async () => {
    const clock = fakeClock(), h = harness({clock,cold:true,noPrepared:true});
    try {
      const pending=h.api.appWindow(root,h.workspace,h.env,h.home); await nextTurn();
      const owned=h.calls[0].child; h.proc.emit('SIGINT'); h.proc.emit('SIGTERM');
      owned.emit('message',{type:'webagent-app-prepared',workspaceRoot:h.workspace,codePort:51212,mcpPort:51211});
      await assert.rejects(drive(pending,clock),/停止/);
      assert.equal(h.calls.length,1); assert.deepStrictEqual(owned.messages.map(m=>m.type),['webagent-app-stop']);
      assert.equal(clock.timers.size,0); assert.equal(h.proc.listenerCount('SIGTERM'),0);
    } finally { h.close(); }
  });
  await test('an early supervisor exit fails promptly instead of waiting 120 seconds', async () => {
    const clock=fakeClock(),h=harness({clock,cold:true,noPrepared:true});
    try {
      const pending=h.api.appWindow(root,h.workspace,h.env,h.home); await nextTurn();
      const child=h.calls[0].child; child.exitCode=1; child.emit('exit',1,null);
      await assert.rejects(drive(pending,clock),/后台.*退出/); assert.ok(clock.now<120000);
      assert.equal(h.calls.length,1); assert.deepStrictEqual(child.kills,[]); assert.equal(clock.timers.size,0);
    } finally { h.close(); }
  });
  await test('missing cleanup confirmation is bounded and reported, never replaced by force-killing a supervisor tree', async () => {
    const clock=fakeClock(),h=harness({clock,cold:true,noPrepared:true,hangStop:true});
    try {
      const pending=h.api.appWindow(root,h.workspace,h.env,h.home); await nextTurn(); h.proc.emit('SIGTERM');
      await assert.rejects(drive(pending,clock),/清理结果未确认/);
      const child=h.calls[0].child; assert.equal(child.exitCode,null); assert.deepStrictEqual(child.kills,[]);
      assert.equal(child.unrefs,1); assert.equal(child.connected,false); assert.equal(clock.timers.size,0);
    } finally { h.close(); }
  });
  await test('real HTTP probes bound body/UTF-8/status, refuse redirects and accept the pinned code-server health shape', async () => {
    let mode='valid',redirectHits=0;
    const server=http.createServer((req,res)=>{
      if(req.url==='/redirect-target')redirectHits++;
      if(mode==='redirect'){res.writeHead(302,{Location:'/redirect-target'}).end();return;}
      res.writeHead(200,{'Content-Type':'application/json'});
      if(mode==='large')res.end(' '.repeat(65537));
      else if(mode==='utf8')res.end(Buffer.from([0xc3,0x28]));
      else if(mode==='shape')res.end('{"status":"ok"}');
      else res.end('{"status":"expired","lastHeartbeat":0}');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const h=harness({http}),origin=`http://127.0.0.1:${server.address().port}`;
    try {
      assert.equal(await h.api.ready(origin),true);
      for(mode of ['large','utf8','shape','redirect'])assert.equal(await h.api.ready(origin),false,mode);
      assert.equal(redirectHits,0);
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.close();}
  });
  await test('real HTTP body stalls and in-flight cancellation release their sockets', async () => {
    let closed=0;const controllers=[];
    const server=http.createServer((req,res)=>{
      req.socket.once('close',()=>closed++);res.writeHead(200,{'Content-Type':'application/json'});res.write('{');
      if(controllers.length)controllers.shift().abort();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const h=harness({http}),url=`http://127.0.0.1:${server.address().port}/healthz`;
    const waitClosed = async (expected, ms = 2000) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (closed >= expected) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(closed, expected);
    };
    try {
      assert.equal((await bounded(h.api.probeJson(url,{timeoutMs:100}))).state,'unknown');
      await waitClosed(1);
      const controller=new AbortController();controllers.push(controller);
      await assert.rejects(bounded(h.api.probeJson(url,{signal:controller.signal})),/abort|停止/i);
      await waitClosed(2);
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));h.close();}
  });
  await test('real Node IPC supports preparation/release while the fixture supervisor remains alive', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'webagent-app-ipc-'));
    const script=path.join(dir,'supervisor.js');
    fs.writeFileSync(script, `let released=false;setTimeout(()=>process.exit(0),10000);process.send({type:'webagent-app-prepared',workspaceRoot:process.argv[2],codePort:Number(process.env.CODE_SERVER_PORT),mcpPort:Number(process.env.AGENT_HOST_PORT)});process.on('message',m=>{if(m.type==='webagent-app-stop')process.exit(0);if(m.type==='webagent-app-release'){released=true;process.send({type:'webagent-app-released'});}});process.on('disconnect',()=>{if(!released)process.exit(0);});`);
    const h=harness({cold:true,realRunner:script});
    try {
      await bounded(h.api.appWindow(root,h.workspace,h.env,h.home),6000);
      const child=h.calls[0].child;assert.equal(child.exitCode,null);assert.equal(child.connected,false);assert.equal(h.calls.length,2);
    } finally {
      const child=h.calls[0]?.child;
      if(child&&child.exitCode===null&&child.signalCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await bounded(exit,5000);}
      h.close();fs.rmSync(dir,{recursive:true,force:true});
    }
  });
  assert.deepStrictEqual(failures, [], 'app-window contracts');
})().catch(error => { console.error(error); process.exitCode = 1; });
