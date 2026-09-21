'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');
const LIMIT = 8 * 1024 * 1024;

async function main() {
  let scenario = 'oversized', requests = 0, mutations = 0, receiver;
  const responseClosed = [];
  const notices = [], root = path.resolve(__dirname);
  const server = http.createServer((req, res) => {
    requests++;
    responseClosed.push(new Promise(resolve => res.once('close', resolve)));
    if (scenario === 'noheaders' && req.url !== '/api/status') return;
    if (req.url === '/api/status') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({workspaceRoot:root,identity:{hostInstanceId:'fixture-host'},secretKey:'a'.repeat(24),bridgeRunning:true}));
    }
    if (req.url.startsWith('/api/bridge/')) mutations++;
    if (scenario === 'redirect') {
      res.writeHead(302, {Location:'/redirect-target','Content-Type':'application/json'});
      return res.end('{"success":true,"running":false}');
    }
    if (scenario === 'head') { res.writeHead(200, {'Content-Length':LIMIT + 1}); return res.end(); }
    if (scenario === 'declared') { res.writeHead(200, {'Content-Length':LIMIT + 1}); res.flushHeaders(); return; }
    if (scenario === 'empty204') {res.writeHead(204);return res.end();}
    res.writeHead(scenario === 'conflict' ? 409 : scenario === 'serverError' ? 500 : 200, {'Content-Type':'application/json'});
    if (scenario === 'disconnect') { res.write('{"success":true'); return setImmediate(() => res.destroy()); }
    if (scenario === 'deadline') {
      res.write(' ');
      const drip = setInterval(() => res.write(' '), 5);
      res.on('close', () => clearInterval(drip)); return;
    }
    if (scenario === 'unicodeOversized') { res.write('"'); return res.end('界'.repeat(Math.floor(LIMIT / 3) + 1) + '"'); }
    if (scenario === 'oversized') { res.write('"'); return res.end('x'.repeat(LIMIT) + '"'); }
    if (scenario === 'exact') { res.write('"'); return res.end('x'.repeat(LIMIT - 2) + '"'); }
    if (scenario === 'bad') return res.end('not json');
    if (scenario === 'empty') return res.end();
    const data = Buffer.from(JSON.stringify(scenario === 'conflict' ? {success:false,error:'binding changed'} : {success:true,message:'中文往返'}));
    const split = Math.max(1, data.indexOf(Buffer.from('中')) + 1);
    res.write(data.subarray(0, split)); res.end(data.subarray(split));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const vscode = {
    workspace: {isTrusted:true,workspaceFolders:[{uri:{scheme:'file',fsPath:root}}],getConfiguration: () => ({get: () => base})},
    window: {showWarningMessage: async message => {notices.push(message); return '重置';},showErrorMessage: message => notices.push(message),showInformationMessage: message => notices.push(message)},
    commands: {}, env: {}
  };
  const timers = new Set();
  const context = vm.createContext({module:{exports:{}}, console, process, Buffer, URL,
    setTimeout: (fn, ms) => {const id = setTimeout(() => {timers.delete(id);fn();}, ['deadline','noheaders'].includes(scenario) && ms === 15000 ? 100 : ms);timers.add(id);return id;},
    clearTimeout: id => {timers.delete(id);clearTimeout(id);}, setInterval, clearInterval,
    require: name => name === 'vscode' ? vscode : name === './workspaceMatch' ? require('../../extension/workspaceMatch') : name.startsWith('./') ? {} : require(name)});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../extension/extension.js'), 'utf8') + '\nmodule.exports={requestJson,resetSecretCommand,BridgeView};', context);
  const {requestJson,resetSecretCommand,BridgeView} = context.module.exports;
  try {
    for (const name of ['oversized','unicodeOversized','declared','redirect','disconnect','deadline','noheaders']) {
      scenario = name; const before = requests;
      await assert.rejects(requestJson('POST', base+'/api/test', {test:true}), undefined, name);
      assert.ok(requests <= before + 1, 'failure must not retry or follow a redirect');
      assert.equal(timers.size, 0, 'failure releases the total deadline');
    }
    scenario = 'head'; const head = await requestJson('HEAD', base+'/api/test');
    assert.equal(head.status, 200); assert.equal(head.raw, '');
    scenario = 'exact'; const exact = await requestJson('GET', base+'/api/test');
    assert.equal(Buffer.byteLength(exact.raw), LIMIT); assert.equal(exact.json.length, LIMIT - 2);
    scenario = 'ok'; assert.equal((await requestJson('GET', base+'/api/test')).json.message, '中文往返');
    scenario = 'conflict'; const conflict = await requestJson('POST', base+'/api/test', {});
    assert.equal(conflict.status, 409); assert.equal(conflict.json.success, false);
    scenario = 'serverError'; assert.equal((await requestJson('GET', base+'/api/test')).status, 500);
    scenario = 'empty204'; const empty204 = await requestJson('GET', base+'/api/test');
    assert.equal(empty204.status, 204); assert.equal(empty204.json, null);
    scenario = 'bad'; const bad = await requestJson('GET', base+'/api/test');
    assert.equal(bad.json, null); assert.equal(bad.raw, 'not json');
    scenario = 'empty'; assert.equal((await requestJson('GET', base+'/api/test')).json, null);
    assert.equal(timers.size, 0, 'successful responses release deadlines too');
    for (const name of ['oversized','disconnect','redirect','deadline']) {
      scenario = name; notices.length = 0; const before = mutations;
      let refreshed = false;
      assert.equal(await resetSecretCommand({refresh: () => {refreshed=true;}}), false);
      assert.equal(mutations, before + 1, 'unknown rotation is sent once');
      assert.equal(refreshed, false);
      assert.ok(notices.some(text => text.includes('结果未确认')));
      assert.ok(!notices.some(text => text.includes('已重置') || text.includes('a'.repeat(24))));
    }
    const bridge = new BridgeView();
    scenario = 'ok'; bridge.resolveWebviewView({webview:{options:{},postMessage(){},onDidReceiveMessage: fn => {receiver=fn;}}});
    await bridge.refresh();
    let refreshes = 0; bridge.refresh = async () => {refreshes++;};
    for (const name of ['oversized','disconnect','redirect','deadline']) {
      scenario = name; notices.length = 0; const before = mutations;
      await receiver({type:'stop'});
      assert.equal(mutations, before + 1); assert.equal(refreshes, 0);
      assert.ok(notices.some(text => text.includes('停止结果未确认')));
    }
    scenario = 'conflict'; notices.length = 0;
    await receiver({type:'stop'});
    assert.ok(notices.some(text => text.includes('停止被主机拒绝')));
    assert.equal(refreshes, 0);
    assert.equal(timers.size, 0);
    let cleanupTimer;
    try {
      await Promise.race([Promise.all(responseClosed), new Promise((_, reject) => {cleanupTimer=setTimeout(() => reject(Error('response not closed after completion or failure')), 2000);})]);
    } finally {clearTimeout(cleanupTimer);}
  } finally {
    for (const timer of timers) clearTimeout(timer);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  console.log('native requestJson: byte/deadline bounds, disconnect, redirect and unknown rotation/stop passed');
}
main().catch(error => {console.error(error);process.exitCode=1;});
