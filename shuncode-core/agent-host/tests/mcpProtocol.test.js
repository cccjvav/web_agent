const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shuncode-mcp-'));
config.workspaceRoot = tmp;

const { clipJson } = require('../src/mcp/budget');
const { handleRpc } = require('../src/mcp/server');
const { callTool, getToolList } = require('../src/tools');
const { publicError, ProtocolError } = require('../src/mcp/errors');
const { getBootstrapPrompt, CONNECT_LINE } = require('../src/mcp/instructions');

function req(method, params, extra = {}) {
  return {
    ip: '127.0.0.1',
    body: { jsonrpc: '2.0', id: 1, method, params: params || {} },
    ...extra
  };
}

async function main() {
  const init = await handleRpc(req('initialize', { clientInfo: { name: 'test-client' } }));
  assert.ok(init.instructions && init.instructions.includes('ShunCode Bridge MCP'));
  assert.ok(init.instructions.includes('shuncode://instructions'));
  assert.ok(init.capabilities.resources);
  assert.ok(init.capabilities.prompts);
  assert.ok(init.serverInfo.name);

  const ping = await handleRpc(req('ping'));
  assert.strictEqual(ping.ok, true);

  const listed = await handleRpc(req('resources/list'));
  const uris = listed.resources.map((r) => r.uri);
  assert.ok(uris.includes('shuncode://protocol'));
  assert.ok(uris.includes('shuncode://memory'));
  assert.ok(uris.includes('shuncode://profile'));
  assert.ok(uris.includes('shuncode://clients'));

  const proto = await handleRpc(req('resources/read', { uri: 'shuncode://protocol' }));
  assert.ok(proto.contents[0].text.includes('Streamable HTTP'));

  assert.strictEqual(
    CONNECT_LINE,
    '快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。'
  );
  assert.strictEqual(
    getBootstrapPrompt('https://example.trycloudflare.com/mcp/abc'),
    `https://example.trycloudflare.com/mcp/abc\n\n${CONNECT_LINE}`
  );

  const tools = getToolList().map((t) => t.name);
  assert.strictEqual(tools.length, 25);
  assert.ok(tools.includes('ping'));
  assert.ok(tools.includes('workspace_info'));
  assert.ok(tools.includes('remember'));
  assert.ok(tools.includes('get_task_status'));
  assert.ok(tools.includes('git_status'));
  assert.ok(tools.includes('start_command'));
  assert.ok(!tools.includes('lsp'));

  const clipped = clipJson({ stdout: 'x'.repeat(20000), ok: true });
  assert.ok(clipped._truncated || clipped.stdout.length < 20000);

  let blocked = false;
  try {
    await callTool('run_command', { command: 'rm -rf /tmp/nope' }, 'code');
  } catch (err) {
    const info = publicError(err);
    blocked = info.code === 'E_BAD_ARGS' && /confirm_dangerous/.test(info.msg);
  }
  assert.ok(blocked, 'destructive command must require confirm_dangerous');

  let unknown = false;
  try {
    await callTool('not_a_tool', {});
  } catch (err) {
    unknown = err instanceof ProtocolError && err.code === 'E_UNKNOWN_CMD';
  }
  assert.ok(unknown);

  const mem = await callTool('remember', { text: 'calculator divide throws on zero' });
  assert.ok(mem.ok);
  const recalled = await callTool('recall', { limit: 20 });
  assert.ok(recalled.text.includes('calculator divide'));

  const promptList = await handleRpc(req('prompts/list'));
  assert.ok(promptList.prompts.some((p) => p.name === 'connect'));
  const connect = await handleRpc(req('prompts/get', { name: 'connect' }));
  assert.ok(connect.messages[0].content.text.includes('快速连接这个 MCP'));

  const clientsDoc = await handleRpc(req('resources/read', { uri: 'shuncode://clients' }));
  assert.ok(clientsDoc.contents[0].text.includes('无需') || clientsDoc.contents[0].text.includes('Plus=no') || clientsDoc.contents[0].text.includes('not ChatGPT-only'));

  const { listClients } = require('../src/mcp/clients');
  const catalog = listClients({ mcpUrl: 'https://x.trycloudflare.com/mcp/abc', mcpCanonicalUrl: 'https://x.trycloudflare.com/mcp' });
  assert.ok(catalog.some((c) => c.id === 'chat' && c.needsPlus === false && c.needsTunnel === false));
  assert.ok(catalog.some((c) => c.id === 'arena' && c.supportsMcp && !c.needsPlus));
  const deepseek = catalog.find((c) => c.id === 'deepseek');
  assert.ok(deepseek && deepseek.connectMode === 'extension-http' && deepseek.supportsMcp && !deepseek.needsPlus);
  assert.strictEqual(deepseek.prompt, 'https://x.trycloudflare.com/mcp/abc');
  assert.strictEqual(deepseek.extensionId, 'kdmpkkahkhdmdhfkdihkopikgcocbpbf');
  assert.ok(deepseek.steps.some((s) => /不要装 deepseek-pp-shell-host/.test(s)));
  assert.ok(catalog.some((c) => c.id === 'chatgpt-free' && c.connectMode === 'unsupported-mcp'));
  assert.ok(catalog.some((c) => c.id === 'chatgpt-plus' && c.needsPlus));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('mcp protocol tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
