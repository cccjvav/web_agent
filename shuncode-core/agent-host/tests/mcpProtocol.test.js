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
  assert.ok(init.capabilities.resources);
  assert.ok(init.capabilities.prompts);
  assert.ok(init.serverInfo.name);

  const ping = await handleRpc(req('ping'));
  assert.strictEqual(ping.ok, true);

  const listed = await handleRpc(req('resources/list'));
  const uris = listed.resources.map((r) => r.uri);
  assert.ok(uris.includes('shuncode://protocol'));
  assert.ok(uris.includes('shuncode://memory'));

  const proto = await handleRpc(req('resources/read', { uri: 'shuncode://protocol' }));
  assert.ok(proto.contents[0].text.includes('Streamable HTTP'));

  const tools = getToolList().map((t) => t.name);
  assert.ok(tools.includes('ping'));
  assert.ok(tools.includes('remember'));
  assert.ok(tools.includes('get_task_status'));

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
  assert.ok(Array.isArray(promptList.prompts));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('mcp protocol tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
