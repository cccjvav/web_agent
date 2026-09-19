const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-bridge-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const tunnel = require('../src/tunnel/cloudflared');
const ngrok = require('../src/tunnel/ngrok');
const apiRouter = require('../src/api/routes');
const store = require('../src/models/store');

function request(server, method, urlPath, body, bind = true) {
  if(bind && urlPath==='/api/bridge/start') body={workspaceRoot:config.workspaceRoot,hostInstanceId:config.hostInstanceId,...body};
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
          resolve({ status: res.statusCode, json: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const origStart = tunnel.startQuickTunnel;
  const origNamed = tunnel.startNamedTunnel;
  const origStop = tunnel.stopTunnel;
  const origNgrok = ngrok.startNgrokTunnel;
  let startCalls = 0;
  let namedCalls = 0;
  let ngrokCalls = 0;
  let stopCalls = 0;
  let lastNamed = null;
  let lastNgrok = null;

  tunnel.startQuickTunnel = async () => {
    startCalls += 1;
    config.publicTunnelUrl = 'https://random-words-ab12.trycloudflare.com';
    return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}` };
  };
  tunnel.startNamedTunnel = async (opts) => {
    namedCalls += 1;
    lastNamed = opts;
    return origNamed(opts);
  };
  tunnel.stopTunnel = () => {
    stopCalls += 1;
    config.publicTunnelUrl = null;
  };
  ngrok.startNgrokTunnel = async (opts) => {
    ngrokCalls += 1;
    lastNgrok = opts;
    return origNgrok(opts);
  };

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    store.patch({ bridge: { loggedIn: true, deviceAuthorized: true } });

    const beforeBinding = JSON.stringify(store.load());
    for(const body of [{},{workspaceRoot:tmp,hostInstanceId:'stale'},{workspaceRoot:os.tmpdir(),hostInstanceId:config.hostInstanceId},{workspaceRoot:'.',hostInstanceId:config.hostInstanceId}]) {
      const rejected=await request(server,'POST','/api/bridge/start',body,false);
      assert.equal(rejected.status,409);assert.equal(rejected.json.success,false);
    }
    const chatRejected=await request(server,'POST','/api/chat',{client:'vscode-extension',mode:'code',message:'must not execute'});
    assert.equal(chatRejected.status,409);
    assert.equal(startCalls+namedCalls+ngrokCalls+stopCalls,0,'binding rejection must not start or stop tunnels');
    assert.equal(JSON.stringify(store.load()),beforeBinding,'binding rejection must not mutate authorization/config');

    const beforeInvalidStart = JSON.stringify(store.load());
    const privateMarker = 'private-bridge-input-must-not-leak';
    for (const body of [
      {tunnelProvider:'cloudflare',unexpected:privateMarker},
      {tunnelProvider:{provider:'cloudflare'}},
      {tunnelProvider:'unsupported-provider'},
      {tunnelProvider:'cloudflare',namedToken:privateMarker},
      {tunnelProvider:'named',namedToken:'x'.repeat(4097)}
    ]) {
      const rejected = await request(server,'POST','/api/bridge/start',body);
      assert.equal(rejected.status,400,'invalid Bridge start wrapper must fail before persistence or tunnel I/O');
      assert.equal(rejected.json.success,false);
      assert.equal(rejected.json.code,'E_BAD_BRIDGE_REQUEST');
      assert.ok(!JSON.stringify(rejected.json).includes(privateMarker));
    }
    assert.equal(startCalls+namedCalls+ngrokCalls+stopCalls,0,'invalid Bridge input must not start or stop tunnels');
    assert.equal(JSON.stringify(store.load()),beforeInvalidStart,'invalid Bridge input must not mutate config');
    const beforeInvalidLifecycle = JSON.stringify(store.load()), beforeInvalidLifecycleStops = stopCalls;
    for (const route of ['/api/bridge/reset-round','/api/bridge/login','/api/bridge/device/poll','/api/bridge/github/clear','/api/bridge/logout']) {
      const rejected = await request(server,'POST',route,{unexpected:privateMarker});
      assert.equal(rejected.status,400,route + ' must reject unknown wrapper fields');
      assert.equal(rejected.json.success,false);
      assert.equal(rejected.json.code,'E_BAD_BRIDGE_REQUEST');
      assert.ok(!JSON.stringify(rejected.json).includes(privateMarker));
    }
    assert.equal(stopCalls,beforeInvalidLifecycleStops,'invalid lifecycle wrappers must not stop tunnels');
    assert.equal(JSON.stringify(store.load()),beforeInvalidLifecycle,'invalid lifecycle wrappers must not mutate identity/config');
    const github = require('../src/auth/github');
    const originalDeviceLogin = github.startDeviceLogin, originalTokenLogin = github.loginWithToken;
    let deviceStarts = 0, tokenLogins = 0;
    try {
      github.startDeviceLogin = async () => { deviceStarts++; return {userCode:'FIXTURE',verificationUri:'https://github.com/login/device'}; };
      github.loginWithToken = async () => { tokenLogins++; return {success:true,provider:'github',username:'fixture'}; };
      for (const [route, body] of [
        ['/api/bridge/device',{unexpected:privateMarker}],
        ['/api/bridge/token',{token:privateMarker,unexpected:'field'}],
        ['/api/bridge/token',{token:'x'.repeat(4097)}],
        ['/api/bridge/token',{token:privateMarker + '\n'}]
      ]) {
        const rejected = await request(server,'POST',route,body);
        assert.equal(rejected.status,400,route + ' must reject unknown fields before outbound authentication');
        assert.equal(rejected.json.success,false);
        assert.equal(rejected.json.code,'E_BAD_BRIDGE_REQUEST');
        assert.ok(!JSON.stringify(rejected.json).includes(privateMarker));
      }
    } finally {
      github.startDeviceLogin = originalDeviceLogin;
      github.loginWithToken = originalTokenLogin;
    }
    assert.equal(deviceStarts,0); assert.equal(tokenLogins,0);

    const historicalBridge = store.load().bridge;
    store.patch({bridge:{
      tunnelProvider:{authorization:privateMarker}, namedDomain:{authorization:privateMarker}, ngrokDomain:[privateMarker],
      loggedIn:{authorization:privateMarker}, provider:{authorization:privateMarker}, username:{authorization:privateMarker},
      githubId:{authorization:privateMarker}, license:{authorization:privateMarker}, deviceAuthorized:{authorization:privateMarker}
    }});
    const projectedStatus = await request(server,'GET','/api/status');
    assert.equal(projectedStatus.status,200);
    assert.ok(!JSON.stringify(projectedStatus.json).includes(privateMarker),'historical nested Bridge values must not cross the public status projection');
    assert.equal(typeof projectedStatus.json.tunnelProvider,'string');
    assert.equal(typeof projectedStatus.json.namedDomain,'string');
    assert.equal(typeof projectedStatus.json.ngrokDomain,'string');
    assert.equal(typeof projectedStatus.json.bridgeAccount.loggedIn,'boolean');
    assert.equal(typeof projectedStatus.json.bridgeAccount.deviceAuthorized,'boolean');
    for (const key of ['provider','username','githubId','license']) assert.equal(typeof projectedStatus.json.bridgeAccount[key],'string');
    const beforeMalformedAuthCalls = startCalls + namedCalls + ngrokCalls + stopCalls;
    const deniedMalformedAuth = await request(server,'POST','/api/bridge/start',{tunnelProvider:'cloudflare'});
    assert.equal(deniedMalformedAuth.status,403,'truthy legacy objects must not satisfy Bridge authorization booleans');
    assert.ok(!JSON.stringify(deniedMalformedAuth.json).includes(privateMarker));
    assert.equal(startCalls + namedCalls + ngrokCalls + stopCalls,beforeMalformedAuthCalls);
    store.patch({bridge:historicalBridge});

    const beforeInvalidStoredBridge = store.load().bridge;
    store.patch({bridge:{tunnelProvider:'named',namedToken:'x'.repeat(4097)}});
    const invalidStoredSnapshot = JSON.stringify(store.load());
    const beforeInvalidStoredCalls = startCalls + namedCalls + ngrokCalls + stopCalls;
    const rejectedStoredCredential = await request(server,'POST','/api/bridge/start',{});
    assert.equal(rejectedStoredCredential.status,400,'historical stored credentials must not bypass the active provider budget');
    assert.equal(rejectedStoredCredential.json.code,'E_BAD_BRIDGE_REQUEST');
    assert.equal(startCalls + namedCalls + ngrokCalls + stopCalls,beforeInvalidStoredCalls);
    assert.equal(JSON.stringify(store.load()),invalidStoredSnapshot,'invalid stored credentials must fail without rewriting configuration');
    store.patch({bridge:beforeInvalidStoredBridge});

    const started = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(started.status, 200);
    assert.strictEqual(started.json.success, true);
    assert.strictEqual(startCalls, 1);
    assert.ok(String(started.json.mcpUrl).includes('random-words-ab12.trycloudflare.com'));
    assert.ok(String(started.json.note).includes('Quick Tunnel 已就绪'));
    assert.strictEqual(started.json.tunnelError, null);

    const status = await request(server, 'GET', '/api/status');
    assert.ok(String(status.json.mcpUrl).includes('trycloudflare.com'));
    assert.strictEqual(status.json.bridgeRunning, true);

    const stopped = await request(server, 'POST', '/api/bridge/stop');
    assert.strictEqual(stopped.status, 200);
    assert.ok(stopCalls >= 1);
    assert.strictEqual(config.publicTunnelUrl, null);

    startCalls = 0;
    tunnel.startQuickTunnel = async () => {
      startCalls += 1;
      const err = new Error('未找到 cloudflared。');
      err.code = 'E_NO_CLOUDFLARED';
      throw err;
    };
    const fallback = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(fallback.status, 200);
    assert.strictEqual(fallback.json.success, false);
    assert.strictEqual(fallback.json.running, false);
    assert.ok(fallback.json.mcpUrl.startsWith(`http://127.0.0.1:${config.port}/mcp/`));
    assert.strictEqual(startCalls, 1);
    assert.ok(fallback.json.tunnelError);
    assert.ok(String(fallback.json.note).includes('MCP仅可通过本机'));
    assert.ok(!String(fallback.json.mcpUrl).includes('trycloudflare.com'));

    startCalls = 0;
    namedCalls = 0;
    const namedMissing = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'named' });
    assert.strictEqual(namedMissing.status, 200);
    assert.strictEqual(startCalls, 0);
    assert.ok(namedCalls >= 1);
    assert.ok(namedMissing.json.tunnelError);
    assert.ok(/主机名|Token|Named/.test(String(namedMissing.json.tunnelError)));
    assert.ok(!String(namedMissing.json.mcpUrl).includes('trycloudflare.com'));

    namedCalls = 0;
    lastNamed = null;
    tunnel.startNamedTunnel = async (opts) => {
      namedCalls += 1;
      lastNamed = opts;
      config.publicTunnelUrl = 'https://mcp.example.com';
      return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}`, named: true };
    };
    const namedOk = await request(server, 'POST', '/api/bridge/start', {
      tunnelProvider: 'cloudflare-named',
      namedDomain: 'mcp.example.com',
      namedToken: 'eyJtest-token-not-for-logs'
    });
    assert.strictEqual(namedOk.status, 200);
    assert.strictEqual(namedCalls, 1);
    assert.strictEqual(lastNamed.hostname, 'mcp.example.com');
    assert.strictEqual(lastNamed.token, 'eyJtest-token-not-for-logs');
    assert.ok(String(namedOk.json.mcpUrl).includes('mcp.example.com'));
    assert.ok(String(namedOk.json.note).includes('Named Tunnel 已就绪'));
    assert.ok(!String(JSON.stringify(namedOk.json)).includes('eyJtest-token-not-for-logs'));
    assert.strictEqual(namedOk.json.tunnelError, null);
    const namedStatus = await request(server, 'GET', '/api/status');
    assert.strictEqual(namedStatus.json.namedDomain, 'mcp.example.com');
    assert.ok(!JSON.stringify(namedStatus.json).includes('eyJtest-token-not-for-logs'));

    startCalls = 0;
    namedCalls = 0;
    ngrokCalls = 0;
    const ngrokMissing = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'ngrok' });
    assert.strictEqual(ngrokMissing.status, 200);
    assert.strictEqual(startCalls, 0);
    assert.strictEqual(namedCalls, 0);
    assert.ok(ngrokCalls >= 1);
    assert.ok(ngrokMissing.json.tunnelError);
    assert.ok(/Authtoken|ngrok|Token/i.test(String(ngrokMissing.json.tunnelError)));
    assert.ok(!String(ngrokMissing.json.mcpUrl).includes('trycloudflare.com'));

    ngrokCalls = 0;
    lastNgrok = null;
    ngrok.startNgrokTunnel = async (opts) => {
      ngrokCalls += 1;
      lastNgrok = opts;
      config.publicTunnelUrl = 'https://mcp.ngrok-free.app';
      return { url: config.publicTunnelUrl, binary: 'stub', target: `http://127.0.0.1:${config.port}`, ngrok: true };
    };
    const ngrokOk = await request(server, 'POST', '/api/bridge/start', {
      tunnelProvider: 'ngrok',
      ngrokDomain: 'mcp.ngrok-free.app',
      ngrokToken: 'ngrok_test_token_must_hide'
    });
    assert.strictEqual(ngrokOk.status, 200);
    assert.strictEqual(ngrokCalls, 1);
    assert.strictEqual(lastNgrok.hostname, 'mcp.ngrok-free.app');
    assert.strictEqual(lastNgrok.token, 'ngrok_test_token_must_hide');
    assert.ok(String(ngrokOk.json.mcpUrl).includes('mcp.ngrok-free.app'));
    assert.ok(String(ngrokOk.json.note).includes('ngrok 已就绪'));
    assert.ok(!String(JSON.stringify(ngrokOk.json)).includes('ngrok_test_token_must_hide'));
    assert.strictEqual(ngrokOk.json.tunnelError, null);
    const ngrokStatus = await request(server, 'GET', '/api/status');
    assert.strictEqual(ngrokStatus.json.ngrokDomain, 'mcp.ngrok-free.app');
    assert.ok(!JSON.stringify(ngrokStatus.json).includes('ngrok_test_token_must_hide'));

    // Bound stop rejects before touching generation, config, or the tunnel.
    const stopBinding = {workspaceRoot:config.workspaceRoot,hostInstanceId:config.hostInstanceId};
    const beforeStopCalls = stopCalls, beforeStopConfig = JSON.stringify(store.load());
    const invalidStop = await request(server,'POST','/api/bridge/stop',{unexpected:privateMarker});
    assert.equal(invalidStop.status,400);
    assert.equal(invalidStop.json.success,false);
    assert.equal(invalidStop.json.code,'E_BAD_BRIDGE_REQUEST');
    assert.ok(!JSON.stringify(invalidStop.json).includes(privateMarker));
    assert.equal(stopCalls,beforeStopCalls,'invalid stop wrapper must not stop a tunnel');
    assert.equal(config.bridgeRunning,true);
    assert.equal(JSON.stringify(store.load()),beforeStopConfig);
    for(const body of [{workspaceRoot:tmp},{...stopBinding,hostInstanceId:'stale'},{...stopBinding,workspaceRoot:os.tmpdir()}]) {
      const rejectedStop = await request(server,'POST','/api/bridge/stop',body);
      assert.equal(rejectedStop.status,409);assert.equal(rejectedStop.json.success,false);
      assert.equal(stopCalls,beforeStopCalls);assert.equal(config.bridgeRunning,true);
    }
    assert.equal(JSON.stringify(store.load()),beforeStopConfig);
    {
      let reached, release;
      const waiting = new Promise(resolve=>{reached=resolve;});
      tunnel.startQuickTunnel = () => new Promise(resolve=>{release=resolve;reached();});
      const starting = request(server,'POST','/api/bridge/start',{tunnelProvider:'cloudflare'});
      await waiting;
      assert.equal((await request(server,'POST','/api/bridge/stop',{...stopBinding,hostInstanceId:'stale'})).status,409);
      config.publicTunnelUrl='https://bound.fixture.test';release({url:config.publicTunnelUrl});
      assert.equal((await starting).json.success,true,'rejected stop must not invalidate a pending start');
    }
    {
      let reached, release;
      const waiting = new Promise(resolve=>{reached=resolve;});
      tunnel.startQuickTunnel = () => new Promise(resolve=>{release=resolve;reached();});
      const starting = request(server,'POST','/api/bridge/start',{tunnelProvider:'cloudflare'});
      await waiting;
      assert.equal((await request(server,'POST','/api/bridge/start',{tunnelProvider:'cloudflare'})).status,409,'backend already rejects duplicate active starts');
      const stopDuringStart = await request(server,'POST','/api/bridge/stop',stopBinding);
      assert.equal(stopDuringStart.json.success,true);assert.equal(stopDuringStart.json.running,false);
      release({url:'https://obsolete.fixture.test'});
      assert.equal((await starting).status,409,'bound stop supersedes an accepted pending start');
      assert.equal(config.bridgeRunning,false);assert.equal(config.publicTunnelUrl,null);
    }
    const stopStub = tunnel.stopTunnel;
    try {
      config.bridgeRunning=true;
      tunnel.stopTunnel = async()=>{throw new Error('fixture stop failed');};
      assert.equal((await request(server,'POST','/api/bridge/stop',stopBinding)).status,500);
      assert.equal(config.bridgeRunning,true,'a rejected tunnel stop does not publish stopped');
    } finally {tunnel.stopTunnel=stopStub;}
    const stopBus = require('../src/utils/eventBus'), originalBroadcast = stopBus.broadcast;
    try {
      stopBus.broadcast = (type,data)=>{if(type==='bridge_stopped') throw new Error('fixture lost stop acknowledgement');return originalBroadcast(type,data);};
      assert.equal((await request(server,'POST','/api/bridge/stop',stopBinding)).status,500);
      assert.equal(config.bridgeRunning,false,'HTTP failure may follow completed stop');
    } finally {stopBus.broadcast=originalBroadcast;}
    assert.equal((await request(server,'POST','/api/bridge/stop')).json.running,false,'legacy empty stop remains compatible');

    let readyStart, finishStart;
    const entered = new Promise(resolve => { readyStart = resolve; });
    tunnel.startQuickTunnel = () => new Promise(resolve => { finishStart = resolve; readyStart(); });
    const pendingStart = request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    await entered;
    const loggedOut = await request(server, 'POST', '/api/bridge/logout', {});
    assert.strictEqual(loggedOut.status, 200);
    finishStart({ url: 'https://obsolete.trycloudflare.com' });
    const staleStart = await pendingStart;
    assert.strictEqual(staleStart.status, 409, 'logout supersedes pending start');
    assert.strictEqual(config.bridgeRunning, false);

    store.patch({ bridge: { loggedIn: false, deviceAuthorized: false } });
    const denied = await request(server, 'POST', '/api/bridge/start', { tunnelProvider: 'cloudflare' });
    assert.strictEqual(denied.status, 403);
    const oauth = require('../src/mcp/oauth');
    const originalSecret = config.secretKey;
    const pairing = oauth.issuePairing();
    const boundRotation = {workspaceRoot:config.workspaceRoot,hostInstanceId:config.hostInstanceId,expectedSecret:originalSecret};
    const invalidRotation = await request(server,'POST','/api/bridge/reset-secret',{unexpected:privateMarker});
    assert.equal(invalidRotation.status,400);
    assert.equal(invalidRotation.json.success,false);
    assert.equal(invalidRotation.json.code,'E_BAD_BRIDGE_REQUEST');
    assert.ok(!JSON.stringify(invalidRotation.json).includes(privateMarker));
    assert.equal(config.secretKey,originalSecret,'invalid rotation wrapper must not rotate the secret');
    assert.equal(oauth.snapshotPairing().code,pairing.code,'invalid rotation wrapper must not revoke pairing');
    for (const body of [{expectedSecret:originalSecret}, {...boundRotation,hostInstanceId:'stale'}, {...boundRotation,expectedSecret:'stale'}]) {
      const reject = await request(server,'POST','/api/bridge/reset-secret',body);
      assert.strictEqual(reject.status,409);
      assert.strictEqual(config.secretKey,originalSecret);
      assert.strictEqual(oauth.snapshotPairing().code,pairing.code);
    }
    const oldPatch = store.patch;
    try {
      store.patch = () => { throw new Error('fixture persistence rejected'); };
      const failed = await request(server,'POST','/api/bridge/reset-secret',boundRotation);
      assert.strictEqual(failed.status,500);
      assert.strictEqual(config.secretKey,originalSecret);
      assert.strictEqual(oauth.snapshotPairing().code,pairing.code,'failed save must not revoke OAuth');
    } finally { store.patch = oldPatch; }
    const results = await Promise.all([request(server,'POST','/api/bridge/reset-secret',boundRotation),request(server,'POST','/api/bridge/reset-secret',boundRotation)]);
    assert.deepStrictEqual(results.map(result=>result.status).sort(),[200,409]);
    const successful = results.find(result=>result.status===200).json;
    assert.strictEqual(successful.success,true);
    assert.notStrictEqual(config.secretKey,originalSecret);
    assert.strictEqual(successful.secretKey,config.secretKey);
    assert.strictEqual(successful.mcpPath,'/mcp/'+config.secretKey);
    assert.strictEqual(store.load().secretKey,config.secretKey);
    assert.strictEqual(oauth.verifyAccessToken(originalSecret),null);
    assert.strictEqual(oauth.snapshotPairing().code,null);
    const bus = require('../src/utils/eventBus');
    const broadcast = bus.broadcast;
    const lostAck = {...boundRotation,expectedSecret:config.secretKey};
    try {
      bus.broadcast = (type, data) => { if(type === 'secret_rotated') throw new Error('fixture after-save failure'); return broadcast(type,data); };
      assert.strictEqual((await request(server,'POST','/api/bridge/reset-secret',lostAck)).status,500);
      assert.notStrictEqual(config.secretKey,lostAck.expectedSecret,'an HTTP failure may follow a completed rotation');
      assert.strictEqual(store.load().secretKey,config.secretKey);
      const afterWrite = config.secretKey;
      assert.strictEqual((await request(server,'POST','/api/bridge/reset-secret',lostAck)).status,409);
      assert.strictEqual(config.secretKey,afterWrite,'old compare-and-set must not rotate again after lost acknowledgement');
    } finally { bus.broadcast = broadcast; }
    const beforeLegacy = config.secretKey;
    assert.strictEqual((await request(server,'POST','/api/bridge/reset-secret',{})).status,200,'legacy extension calls stay compatible');
    assert.notStrictEqual(config.secretKey,beforeLegacy);
  } finally {
    tunnel.startQuickTunnel = origStart;
    tunnel.startNamedTunnel = origNamed;
    tunnel.stopTunnel = origStop;
    ngrok.startNgrokTunnel = origNgrok;
    config.publicTunnelUrl = null;
    config.bridgeRunning = false;
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('bridge tunnel tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
