'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { config } = require('../src/config');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cancel-'));
config.workspaceRoot = tmp;
require('../src/mcp/oauth').setOauthEnabled(true); // OAuth pairing is opt-in (2026-09-25); this test exercises it.
const { currentSignal } = require('../src/utils/requestScope');
const { TOOLS } = require('../src/tools');
const tool = TOOLS.find(t => t.name === 'workspace_info');
const original = tool.handler;
let started, signal;
tool.handler = async args => {
  if (!args.wait) return { ok: false, status: 'failed', detail: 'fixture business failure' };
  signal = currentSignal();
  started();
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
  return { ok: false, status: 'cancelled' };
};
const app = express();
app.use(express.json());
app.use('/mcp', require('../src/mcp/server'));
app.use('/api', require('../src/api/routes'));
const server = app.listen(0, '127.0.0.1');
async function main() {
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function rpc(body, session, auth = true) {
    return fetch(base + '/mcp', {method:'POST', headers:{'content-type':'application/json', ...(auth ? {authorization:'Bearer ' + (typeof auth === 'string' ? auth : config.secretKey)} : {}), ...(session ? {'mcp-session-id':session} : {})}, body:JSON.stringify(body)});
  }
  const init = () => rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{clientInfo:{name:'same-display-name'}}});
  const a = (await init()).headers.get('mcp-session-id'), b = (await init()).headers.get('mcp-session-id');
  assert.ok(a && b && a !== b);
  const ready = new Promise(resolve => { started = resolve; });
  const pending = rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info',arguments:{wait:true}}}, a);
  await ready;
  const visible = await (await rpc({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'peers_list'}},b)).json();
  for (const peer of JSON.parse(visible.result.content[0].text).peers) {
    const rejected = await rpc({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:0}},peer.key.replace(/^peer:/,''));
    assert.strictEqual(rejected.status,404,'a public peer key cannot cancel a call sharing the URL secret');
    await rejected.json();
  }
  assert.strictEqual(signal.aborted,false);

  const cancel = {jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:0}};
  assert.strictEqual((await rpc(cancel,b)).status,202);
  assert.strictEqual((await rpc(cancel,a,false)).status,401);
  assert.strictEqual(signal.aborted,false);
  const duplicate = await (await rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info'}},a)).json();
  assert.ok(duplicate.error.message.includes('Duplicate'));
  assert.strictEqual((await rpc(cancel,a)).status,202);
  const result = await (await pending).json();
  assert.strictEqual(result.id,0);
  assert.strictEqual(result.result.isError,true);
  assert.strictEqual(result.result._meta.trace.status,'cancelled');
  // Two concurrently valid access tokens for one OAuth client share session identity,
  // but cancellation must still require the exact credential used by the call.
  const oauth = require('../src/mcp/oauth');
  const client = oauth.registerClient({redirect_uris:['http://localhost/cb']});
  const mint = () => {
    const verifier = 'v'.repeat(43);
    const loc = oauth.completeAuthorize({client_id:client.client_id,redirect_uri:client.redirect_uris[0],
      pairing_code:oauth.issuePairing().code,code_challenge:oauth.s256(verifier)});
    return oauth.handleToken({grant_type:'authorization_code',client_id:client.client_id,redirect_uri:client.redirect_uris[0],
      code:new URL(loc).searchParams.get('code'),code_verifier:verifier}).access_token;
  };
  const first = mint(), second = mint();
  const initialized = await rpc({jsonrpc:'2.0',id:1,method:'initialize'},null,first);
  const oauthSid = initialized.headers.get('mcp-session-id'); await initialized.json();
  const readyOAuth = new Promise(resolve => { started = resolve; });
  const waitingOAuth = rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info',arguments:{wait:true}}},oauthSid,first);
  await readyOAuth;
  assert.strictEqual((await rpc(cancel,oauthSid,second)).status,202);
  assert.strictEqual(signal.aborted,false,'same OAuth client with another valid token must not cancel the original credential call');
  assert.strictEqual((await rpc(cancel,oauthSid,first)).status,202);
  assert.strictEqual((await (await waitingOAuth).json()).result._meta.trace.status,'cancelled');
  const events = [];
  const bus = require('../src/utils/eventBus');
  const observe = payload => events.push(payload);
  bus.on('tool_call_end', observe);
  require('../src/utils/executionControl').selectMode('chat');
  const rest = await fetch(base + '/api/tool/call', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'workspace_info'})});
  assert.strictEqual(rest.status,200);
  const failure = await rest.json();
  bus.removeListener('tool_call_end', observe);
  assert.strictEqual(events.at(-1).success, false);
  assert.strictEqual(failure.success,false);
  assert.strictEqual(failure.result.detail,'fixture business failure');
  require('../src/utils/executionControl').selectMode('bridge');
  const done = await (await rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info'}},a)).json();
  assert.strictEqual(done.result.isError,true); // ID released, no duplicate error
  // Real authenticated HTTP: busy ownership survives deterministic capacity churn.
  const sessions = require('../src/mcp/session');
  const busyInit = await init(), busySid = busyInit.headers.get('mcp-session-id'); await busyInit.json();
  const busyReady = new Promise(resolve => { started = resolve; });
  const busyCall = rpc({jsonrpc:'2.0',id:77,method:'tools/call',params:{name:'workspace_info',arguments:{wait:true}}},busySid);
  await busyReady;
  const clock = Date.now;
  try {
    let tick = 1; Date.now = () => clock() + tick++;
    for (let i = 0; i < 205; i++) sessions.createHttpSession();
  } finally { Date.now = clock; }
  const busyCancel = await rpc({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:77}},busySid);
  assert.strictEqual(busyCancel.status,202);
  assert.strictEqual((await (await busyCall).json()).result._meta.trace.status,'cancelled');
  assert.strictEqual(sessions.touchHttpSession(busySid).active,0);
  // Response headers contain duplicate raw fields, not just a mocked merged string.
  async function rawSession(method, value) {
    return new Promise((resolve,reject) => {
      const body = JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize'});
      const req = require('http').request(base+'/mcp',{method,headers:{authorization:'Bearer '+config.secretKey,
        'content-type':'application/json','mcp-session-id':value}},res => {
        res.resume();res.on('end',()=>resolve(res.statusCode));
      });
      req.on('error',reject);req.end(method==='POST'?body:undefined);
    });
  }
  for (const method of ['POST','GET','DELETE']) {
    const before = sessions.snapshot().httpSessions;
    assert.strictEqual(await rawSession(method,[busySid,busySid]),400);
    assert.strictEqual(await rawSession(method,''),400);
    assert.strictEqual(sessions.snapshot().httpSessions,before);
  }
  // SSE retains its pin until response close, then releases exactly once.
  const streamInit = await init(), streamSid = streamInit.headers.get('mcp-session-id'); await streamInit.json();
  const controller = new AbortController();
  const stream = await fetch(base+'/mcp',{signal:controller.signal,headers:{authorization:'Bearer '+config.secretKey,
    'mcp-session-id':streamSid,accept:'text/event-stream'}});
  assert.strictEqual(stream.status,200);
  const reader = stream.body.getReader();await reader.read();
  const record = sessions.touchHttpSession(streamSid);
  assert.strictEqual(record.active,1);
  for (let i=0;i<205;i++) sessions.createHttpSession();
  assert.strictEqual(sessions.touchHttpSession(streamSid),record);
  controller.abort(); await reader.cancel().catch(()=>{});
  for (let i=0;record.active && i<100;i++) await new Promise(resolve=>setTimeout(resolve,10));
  assert.strictEqual(record.active,0);
  // Registry-only pin setup; HTTP admission must reject without evicting busy work.
  sessions.reset();const ids=[],releases=[];
  for(let i=0;i<200;i++){const id=sessions.createHttpSession();ids.push(id);releases.push(sessions.beginHttpSessionWork(id));}
  const full = await init();assert.strictEqual(full.status,503);await full.json();
  // A GET stream never allocates a session (sessionless GET is the unsupported legacy handshake: 405), so the
  // full registry is observed through POST initialize above; the GET must not evict busy work either way.
  const fullStream = await fetch(base+'/mcp',{headers:{authorization:'Bearer '+config.secretKey,accept:'text/event-stream'}});
  assert.strictEqual(fullStream.status,405);await fullStream.json();
  assert.ok(ids.every(id=>sessions.touchHttpSession(id)));
  releases.forEach(release=>release());sessions.reset();
  console.log('authenticated HTTP cancellation and direct API failure tests passed');
}
main().catch(err => {console.error(err); process.exitCode=1;}).finally(async () => {
  tool.handler=original;
  server.closeAllConnections?.();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmp,{recursive:true,force:true});
});
