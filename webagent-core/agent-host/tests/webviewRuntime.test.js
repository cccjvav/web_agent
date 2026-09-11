'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  const commands = [], clipboard = [];
  const source = fs.readFileSync(path.resolve(__dirname, '../../extension/extension.js'), 'utf8');
  const host = vm.createContext({
    module: { exports: {} }, process, console,
    require(name) {
      if (name === 'vscode') return {
        commands: { executeCommand: async name => { commands.push(name); } },
        env: { clipboard: { writeText: async text => { clipboard.push(text); } } },
        window: { showInformationMessage() {}, showErrorMessage() {} }
      };
      if (name.startsWith('./')) return {};
      return require(name);
    }
  });
  vm.runInContext(source + '\nmodule.exports.test = { chatHtml, bridgeHtml, validWebviewMessage, ChatView, BridgeView };', host);
  const { chatHtml, bridgeHtml, validWebviewMessage, ChatView, BridgeView } = host.module.exports.test;
  for (const msg of [null, undefined, [], 'send', {}, { type: 'unknown' }, { type: 'send', text: 'task', mode: 'admin' }, { type: 'send', mode: 'code', text: {} }]) {
    assert.strictEqual(validWebviewMessage(msg, 'chat'), false);
  }
  for (const mode of ['ask', 'plan', 'code']) assert.ok(validWebviewMessage({ type: 'send', mode, text: 'normal task' }, 'chat'));
  assert.strictEqual(validWebviewMessage({ type: 'send', mode: 'code', text: ' '.repeat(10) }, 'chat'), false);
  assert.strictEqual(validWebviewMessage({ type: 'send', mode: 'code', text: 'a'.repeat(128001) }, 'chat'), false);
  assert.strictEqual(validWebviewMessage({ type: 'copy', text: {} }, 'bridge'), false);
  assert.strictEqual(validWebviewMessage({ type: 'copy', text: 'a'.repeat(128001) }, 'bridge'), false);
  for (const type of ['refresh', 'start', 'stop', 'reset']) assert.ok(validWebviewMessage({ type }, 'bridge'));

  let receiver;
  const view = { webview: { postMessage() {}, onDidReceiveMessage(fn) { receiver = fn; } } };
  new ChatView().resolveWebviewView(view);
  await receiver(null);
  await receiver({ type: 'send', mode: 'invalid', text: 'task' });
  assert.strictEqual(commands.length, 0);
  await receiver({ type: 'openNative' });
  assert.deepStrictEqual(commands, ['webagent.openAgentChat']);
  const bridge = new BridgeView();
  let refreshes = 0;
  bridge.refresh = async () => { refreshes++; };
  bridge.resolveWebviewView(view);
  await receiver(null);
  await receiver({ type: 'unknown' });
  assert.strictEqual(refreshes, 1);
  await receiver({ type: 'refresh' });
  assert.strictEqual(refreshes, 2);
  await receiver({ type: 'copy', text: {} });
  assert.strictEqual(clipboard.length, 0);
  await receiver({ type: 'copy', text: 'normal prompt' });
  assert.deepStrictEqual(clipboard, ['normal prompt']);

  function runPage(html) {
    const nonce = /<script nonce="([A-Za-z0-9+/=]+)">/.exec(html)[1];
    assert.ok(html.includes("script-src 'nonce-" + nonce + "'"));
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes("base-uri 'none'"));
    assert.ok(html.includes("form-action 'none'"));
    assert.ok(!/script-src[^;]*unsafe/.test(html));
    function element(tag) {
      return { tag, children: [], style: {}, classList: { toggle() {}, remove() {} },
        set innerHTML(_) { throw new Error('HTML assignment not permitted in dynamic rendering'); },
        appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
        querySelector() { return null; }, querySelectorAll() { return []; } };
    }
    const nodes = new Map(), listeners = {};
    const node = id => { if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id); };
    const context = vm.createContext({
      document: { getElementById: node, createElement: element, addEventListener() {} },
      window: { addEventListener(event, fn) { listeners[event] = fn; } },
      acquireVsCodeApi: () => ({ postMessage() {} }), setInterval() {}
    });
    const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)[1];
    vm.runInContext(script, context);
    listeners.message({ data: null });
    context.paintTasks([{ title: '<b>Task & label</b>', status: 'in_progress' }, null]);
    assert.strictEqual(node('task-list').children.length, 1);
    const item = node('task-list').children[0];
    assert.strictEqual(item.tag, 'li');
    assert.strictEqual(item.textContent, '▶ <b>Task & label</b>');
    assert.strictEqual(item.children.length, 0);
    context.paintTasks({ invalid: true });
    assert.strictEqual(node('task-list').children.length, 0);
    return { context, node, nonce };
  }
  const first = runPage(chatHtml());
  assert.notStrictEqual(first.nonce, runPage(chatHtml()).nonce, 'fresh nonce per generated page');
  const { context, node } = runPage(bridgeHtml());
  context.paintLogs([{ type: 'tool_call_end', payload: { tool: '<b>tool & label</b>', durationMs: 12 } }, null]);
  assert.strictEqual(node('stream').children[0].children[0].textContent, '<b>tool & label</b>');
  assert.strictEqual(node('stream').children[0].children[1].textContent, '12 ms');
  context.paintLogs([{ type: 'tool_call_end', payload: { tool: 'read', success: false } }]);
  assert.strictEqual(node('stream').children[0].children[1].textContent, 'Failed');
  context.paintLogs({ invalid: true });
  assert.strictEqual(node('stream').children[0].textContent, 'Waiting for the remote Agent');
  console.log('webview runtime regressions passed (host/DOM fixtures, not real VS Code CSP enforcement)');
})().catch(err => { console.error(err); process.exitCode = 1; });
