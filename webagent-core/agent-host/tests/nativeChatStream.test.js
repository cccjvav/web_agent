'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

async function main() {
  let scenario = 'ok', calls = 0, handler;
  const server = http.createServer((req, res) => {
    calls++;
    if (scenario === 'redirect') { res.writeHead(302, {Location:'/again'}); return res.end(); }
    res.writeHead(200, {'Content-Type': scenario === 'mime' ? 'text/html' : 'application/x-ndjson'});
    const frames = {
      mime: '{}', total: (JSON.stringify({type:'status',text:'x'.repeat(1000000)})+'\n').repeat(17),
      ok: '{"type":"message","text":"完整回答"}\n{"type":"done"}',
      partial: '{"type":"message","text":"partial"}\n',
      bad: '{bad}\n', shape: '[]\n', text: '{"type":"message","text":{}}\n',
      error: '{"type":"message","text":"partial"}\n{"type":"error","message":"failed"}\n',
      after: '{"type":"done"}\n{"type":"message","text":"late"}\n',
      duplicate: '{"type":"done"}\n{"type":"done"}\n',
      oversized: 'x'.repeat(1024 * 1024 + 1),
      abort: '{"type":"status","text":"waiting"}\n'
    };
    if (scenario === 'disconnect') { res.write('{"type":"message","text":"partial"}\n'); return setImmediate(() => res.destroy()); }
    if (scenario === 'abort' || scenario === 'deadline') return res.write(frames.abort);
    // Real HTTP and split UTF-8 bytes, including a final line without newline.
    const data = Buffer.from(frames[scenario]);
    const split = scenario === 'ok' ? data.indexOf(Buffer.from('完')) + 1 : 29;
    res.write(data.subarray(0, split)); res.end(data.subarray(split));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const vscode = {
    workspace: {getConfiguration: () => ({get: () => url})},
    window: {showErrorMessage: () => {}},
    chat: {createChatParticipant: (_, fn) => {handler = fn; return {}; }},
    Uri: {file: value => value}
  };
  const context = vm.createContext({module:{exports:{}}, console, process, Buffer, URL, AbortController,
    setTimeout: (fn, ms) => setTimeout(fn, scenario === 'deadline' && ms === 300000 ? 25 : ms), clearTimeout, setInterval, clearInterval,
    require: name => name === 'vscode' ? vscode : name === './modeFromChatRequest' ? {modeFromChatRequest: () => 'code'} : name.startsWith('./') ? {} : require(name)});
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../extension/extension.js'), 'utf8') +
    '\nmodule.exports = {postNdjson, ChatView, registerChatParticipant, historyFromChatContext};' +
    '\nworkspaceBinding = async () => ({workspaceRoot:"fixture",hostInstanceId:"fixture"});', context);
  const api = context.module.exports;
  try {
    for (const name of ['redirect','mime','partial','bad','shape','text','error','after','duplicate','oversized','total','disconnect','deadline']) {
      scenario = name; const before = calls;
      await assert.rejects(api.postNdjson(url, {}, () => {}), undefined, name);
      assert.equal(calls, before + 1, 'failure must not replay or follow redirects');
    }
    scenario = 'ok'; const events = [];
    await api.postNdjson(url, {}, event => events.push(event));
    assert.equal(events[0].text, '完整回答');
    await assert.rejects(api.postNdjson(url, {}, () => {throw Error('consumer failed');}), /consumer failed/);
    scenario = 'ok'; const atDone = new AbortController();
    await assert.rejects(api.postNdjson(url, {}, event => {if (event.type === 'done') atDone.abort();}, atDone.signal));
    scenario = 'abort'; const controller = new AbortController();
    await assert.rejects(api.postNdjson(url, {}, () => controller.abort(), controller.signal));
    let receiver; const messages = [], view = new api.ChatView();
    view.resolveWebviewView({webview:{options:{},postMessage: m => messages.push(m),onDidReceiveMessage: fn => {receiver=fn;}}});
    for (const name of ['partial','error','ok']) {
      scenario = name; await receiver({type:'send',mode:'code',text:'hello'});
      assert.equal(view.controller, null);
    }
    assert.equal(view.history.filter(turn => turn.role === 'assistant').length, 1);
    assert.equal(view.history.at(-1).content, '完整回答');
    assert.equal(messages.filter(m => m.type === 'finished').length, 3);
    api.registerChatParticipant({subscriptions:[],extensionPath:__dirname});
    const token = {isCancellationRequested:false,onCancellationRequested: () => ({dispose(){}})};
    const stream = {progress(){},markdown(){}};
    // Replace the mode helper only; the actual registered handler/transport remain real.
    for (const name of ['partial','error','ok']) {
      scenario = name;
      const result = await handler({prompt:'hello'}, {history:[]}, stream, token);
      assert.equal(result.metadata.webagentCompleted, name === 'ok');
      const history = api.historyFromChatContext({history:[{response:[{value:'partial'}],result}]});
      assert.equal(history.length, name === 'ok' ? 1 : 0);
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
  console.log('native chat stream: HTTP failures, framing, cancellation, consumers and history passed');
}
main().catch(error => {console.error(error);process.exitCode=1;});
