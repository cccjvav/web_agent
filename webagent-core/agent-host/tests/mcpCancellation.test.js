'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { config } = require('../src/config');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-cancel-'));
config.workspaceRoot = tmp;
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
    return fetch(base + '/mcp', {method:'POST', headers:{'content-type':'application/json', ...(auth ? {authorization:'Bearer ' + config.secretKey} : {}), ...(session ? {'mcp-session-id':session} : {})}, body:JSON.stringify(body)});
  }
  const init = () => rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{clientInfo:{name:'same-display-name'}}});
  const a = (await init()).headers.get('mcp-session-id'), b = (await init()).headers.get('mcp-session-id');
  assert.ok(a && b && a !== b);
  const ready = new Promise(resolve => { started = resolve; });
  const pending = rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info',arguments:{wait:true}}}, a);
  await ready;
  const cancel = {jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:0}};
  assert.strictEqual((await rpc(cancel,b)).status,204);
  assert.strictEqual((await rpc(cancel,a,false)).status,401);
  assert.strictEqual(signal.aborted,false);
  const duplicate = await (await rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info'}},a)).json();
  assert.ok(duplicate.error.message.includes('Duplicate'));
  assert.strictEqual((await rpc(cancel,a)).status,204);
  const result = await (await pending).json();
  assert.strictEqual(result.id,0);
  assert.strictEqual(result.result.isError,true);
  assert.strictEqual(result.result._meta.trace.status,'cancelled');
  const events = [];
  const bus = require('../src/utils/eventBus');
  const observe = payload => events.push(payload);
  bus.on('tool_call_end', observe);
  const rest = await fetch(base + '/api/tool/call', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'workspace_info'})});
  assert.strictEqual(rest.status,200);
  const failure = await rest.json();
  bus.removeListener('tool_call_end', observe);
  assert.strictEqual(events.at(-1).success, false);
  assert.strictEqual(failure.success,false);
  assert.strictEqual(failure.result.detail,'fixture business failure');
  const done = await (await rpc({jsonrpc:'2.0',id:0,method:'tools/call',params:{name:'workspace_info'}},a)).json();
  assert.strictEqual(done.result.isError,true); // ID released, no duplicate error
  console.log('authenticated HTTP cancellation and direct API failure tests passed');
}
main().catch(err => {console.error(err); process.exitCode=1;}).finally(async () => {
  tool.handler=original;
  server.closeAllConnections?.();
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmp,{recursive:true,force:true});
});
