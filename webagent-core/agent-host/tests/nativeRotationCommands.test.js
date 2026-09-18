'use strict';
// Run the real desktop extension activate() with only VS Code and HTTP transport replaced.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'native-rotation-'));

async function main() {
  const commands = new Map(), providers = new Map();
  const infos = [], warnings = [], errors = [], subscriptions = [];
  let confirmAnswer = '重置';
  const vscode = {
    workspace: {
      get workspaceFolders() { return [{ uri: { scheme: 'file', fsPath: tmp } }]; },
      isTrusted: true,
      getConfiguration: () => ({ get: () => 'http://127.0.0.1:48271' }),
      onDidChangeWorkspaceFolders: () => ({ dispose: () => {} })
    },
    window: {
      showInformationMessage: message => { infos.push(message); },
      showWarningMessage: (message, options) => { warnings.push({ message, options }); return Promise.resolve(confirmAnswer); },
      showErrorMessage: (message, options) => { errors.push({ message, options }); },
      createStatusBarItem: () => ({ show: () => {}, dispose: () => {} }),
      registerWebviewViewProvider: (id, provider) => { providers.set(id, provider); return { dispose: () => {} }; }
    },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return { dispose: () => {} }; }, executeCommand: async () => {} },
    chat: { createChatParticipant: () => ({ dispose: () => {} }) },
    env: { clipboard: { writeText: async () => {} } },
    Uri: { file: fsPath => ({ fsPath }) },
    StatusBarAlignment: { Right: 2 }
  };
  const context = vm.createContext({
    module: { exports: {} }, console, process, URL, Buffer, setTimeout, clearTimeout, setInterval, clearInterval,
    require: name => name === 'vscode' ? vscode
      : name === './workspaceMatch' ? require('../../extension/workspaceMatch')
      : name === './editorReview' ? { registerEditorReview: () => {} }
      : name === './ptyHost' ? { startPtyHost: () => ({ dispose: () => {} }) }
      : name === './modeFromChatRequest' ? { modeFromChatRequest: () => 'code' }
      : name.startsWith('./') ? {} : require(name)
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'webagent-core/extension/extension.js'), 'utf8')
    + '\nmodule.exports.activate = activate;', context);
  context.activate({ subscriptions, extensionPath: tmp });
  assert.ok(commands.has('webagent.resetSecret'), 'activate must register the rotation command');

  const oldSecret = 'a'.repeat(24), newSecret = 'b'.repeat(24);
  const statusBody = { status: 'online', workspaceRoot: tmp, bridgeRunning: true,
    identity: { hostInstanceId: 'instance' }, secretKey: oldSecret };
  const rotated = { success: true, secretKey: newSecret, mcpPath: '/mcp/' + newSecret,
    mcpUrl: 'https://host.test/mcp/' + newSecret, mcpCanonicalUrl: 'https://host.test/mcp' };
  let gets = 0, posts = [], statusReply, postReply, rejectPost = false;
  context.transport = async (method, url, body) => {
    if (method === 'GET') { gets++; return statusReply(); }
    posts.push({ url, body });
    if (rejectPost) throw new Error('本机API请求超时');
    return postReply;
  };
  vm.runInContext('requestJson = transport;', context);

  const bridge = providers.get('webagent.bridgeView');
  let refreshes = 0, receiver;
  bridge.refresh = async () => { refreshes++; };
  bridge.resolveWebviewView({ webview: { postMessage: () => {}, options: {}, onDidReceiveMessage: fn => { receiver = fn; } } });
  refreshes = 0; // resolveWebviewView refreshes once; only command-driven reads are counted below.
  const reset = () => commands.get('webagent.resetSecret')();
  const notices = () => [...infos, ...warnings.map(w => w.message), ...errors.map(e => e.message)];
  const leaked = () => notices().filter(m => m.includes(oldSecret) || m.includes(newSecret));
  function clear() { infos.length = 0; warnings.length = 0; errors.length = 0; posts.length = 0; gets = 0; refreshes = 0; confirmAnswer = '重置'; statusReply = () => ({ status: 200, json: statusBody }); postReply = { status: 200, json: rotated }; rejectPost = false; }

  // HTTP failure: bound CAS write is reported as unconfirmed, never as a completed rotation.
  clear(); postReply = { status: 500, json: { success: false } };
  assert.equal(await reset(), false);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].body.hostInstanceId, 'instance', 'rotation must bind the visible host');
  assert.equal(posts[0].body.workspaceRoot, tmp);
  assert.equal(posts[0].body.expectedSecret, oldSecret, 'rotation must compare the secret it read');
  assert.ok(notices().join('|').includes('未确认'));
  assert.equal(refreshes, 0, 'an unconfirmed write must not be refreshed as success');
  assert.deepStrictEqual(leaked(), []);

  // Explicit user confirmation is required, and dismissing it sends nothing.
  clear(); confirmAnswer = undefined;
  assert.equal(await reset(), false);
  assert.equal(posts.length, 0);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].options.modal, true);
  assert.ok(notices().join('|').includes('已取消，未发送'));

  // Unknown secret or a host/workspace that no longer matches must not send a write.
  clear(); statusReply = () => ({ status: 200, json: { ...statusBody, secretKey: 'rotated-by-someone-else' } });
  assert.equal(await reset(), false);
  assert.equal(posts.length, 0);
  assert.ok(errors.at(-1).message.startsWith('未发送密钥轮换'));
  clear(); statusReply = () => ({ status: 200, json: { ...statusBody, workspaceRoot: path.join(tmp, 'other') } });
  assert.equal(await reset(), false);
  assert.equal(posts.length, 0);
  assert.ok(errors.at(-1).message.includes('未发送密钥轮换'));

  // The host rejects a stale compare-and-set before writing: report refusal, not unknown.
  clear(); postReply = { status: 409, json: { success: false, error: 'Rotation state changed; read status first' } };
  assert.equal(await reset(), false);
  assert.ok(notices().join('|').includes('未轮换'));
  assert.equal(refreshes, 0);

  // Malformed or contradictory success payloads stay unconfirmed.
  for (const reply of [{ status: 200, json: null }, { status: 200, raw: 'not json', json: null },
    { status: 200, json: {} }, { status: 200, json: { success: 'true', secretKey: newSecret } },
    { status: 200, json: { ...rotated, success: false } }, { status: 200, json: { ...rotated, secretKey: oldSecret } },
    { status: 200, json: { ...rotated, mcpPath: '/mcp/wrong' } }, { status: 200, json: { ...rotated, mcpUrl: 'javascript:' + newSecret } },
    { status: 200, json: { ...rotated, mcpCanonicalUrl: 'https://other.test/mcp' } }, { status: 502, json: rotated }]) {
    clear(); postReply = reply;
    assert.equal(await reset(), false, JSON.stringify(reply));
    assert.ok(notices().join('|').includes('未确认'), JSON.stringify(reply));
    assert.equal(refreshes, 0);
    assert.deepStrictEqual(leaked(), []);
  }

  // A lost response after the write is unknown, not a failure and not a success.
  clear(); rejectPost = true;
  assert.equal(await reset(), false);
  assert.ok(notices().join('|').includes('结果未确认'));
  assert.equal(refreshes, 0);

  // Confirmed rotation plus a verified read.
  clear();
  let read = 0;
  statusReply = () => (++read === 1 ? { status: 200, json: statusBody } : { status: 200, json: { ...statusBody, secretKey: newSecret } });
  assert.equal(await reset(), true);
  assert.equal(read, 2);
  assert.equal(refreshes, 1);
  assert.ok(infos.at(-1).includes('已重置并核对'));
  assert.deepStrictEqual(leaked(), []);

  // Confirmed write, unreadable or mismatching status afterwards: keep the confirmation.
  for (const after of [() => ({ status: 500, json: null }), () => ({ status: 200, json: statusBody }),
    () => ({ status: 200, json: { ...statusBody, secretKey: 'c'.repeat(24) } }),
    () => ({ status: 200, json: { ...statusBody, secretKey: newSecret, identity: { hostInstanceId: 'other' } } })]) {
    clear(); read = 0;
    statusReply = () => (++read === 1 ? { status: 200, json: statusBody } : after());
    assert.equal(await reset(), true);
    assert.ok(warnings.at(-1).message.includes('已确认轮换，但当前地址未核对'));
    assert.equal(refreshes, 1, 'the operator still needs a refreshed view');
  }
  clear(); read = 0;
  statusReply = () => { if (++read === 1) return { status: 200, json: statusBody }; throw new Error('read failed'); };
  assert.equal(await reset(), true);
  assert.ok(warnings.at(-1).message.includes('已确认轮换，但当前地址未核对'));

  // Native stop: bound, strict, and honest about unknown results.
  const stop = () => receiver({ type: 'stop' });
  const stopError = () => errors.at(-1).message;
  clear();
  statusReply = () => ({ status: 200, json: statusBody });
  postReply = { status: 200, json: { success: true, running: false } };
  await stop();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url.endsWith('/api/bridge/stop'), true);
  assert.equal(posts[0].body.hostInstanceId, 'instance', 'stop must name the host it intends to stop');
  assert.equal(posts[0].body.workspaceRoot, tmp);
  assert.equal(refreshes, 1);
  for (const reply of [{ status: 200, json: { success: true } }, { status: 200, json: { success: true, running: true } },
    { status: 200, json: { success: 'true', running: false } }, { status: 500, json: { success: false } }, { status: 200, json: null }]) {
    clear(); postReply = reply;
    await stop();
    assert.ok(stopError().includes('停止结果未确认'), JSON.stringify(reply));
    assert.equal(refreshes, 0, 'a failed stop must not repaint as stopped');
  }
  clear(); postReply = { status: 409, json: { success: false, error: 'Stop binding changed; read status first' } };
  await stop();
  assert.ok(stopError().includes('未停止'));
  clear(); rejectPost = true;
  await stop();
  assert.ok(stopError().includes('停止结果未确认'));
  clear(); statusReply = () => ({ status: 200, json: { ...statusBody, workspaceRoot: path.join(tmp, 'other') } });
  await stop();
  assert.equal(posts.length, 0, 'a mismatching workspace must not stop another host');
  assert.ok(stopError().includes('工作区与主机不一致'));
  subscriptions.forEach(entry => { if (entry && typeof entry.dispose === 'function') entry.dispose(); });
  console.log('native rotation/stop command regressions passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
