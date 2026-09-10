// 第六阶段：多 Agent 任务板经真 MCP 协议的端到端锁——两个模拟网页客户端同连，
// 会话身份（clientName@ip）必须穿进板子归属；peers_list 必须互见。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-mcpboard-'));
config.workspaceRoot = tmp;

const { handleRpc } = require('../src/mcp/server');

function req(method, params, ip) {
  return { ip, body: { jsonrpc: '2.0', id: 1, method, params: params || {} } };
}

async function call(ip, name, args) {
  const res = await handleRpc(req('tools/call', { name, arguments: args || {} }, ip));
  const text = res.content[0].text;
  return JSON.parse(text);
}

async function main() {
  await handleRpc(req('initialize', { clientInfo: { name: 'ArenaSim' } }, '10.0.0.1'));
  await handleRpc(req('initialize', { clientInfo: { name: 'ChatPlusSim' } }, '10.0.0.2'));

  const listed = await handleRpc(req('tools/list', {}, '10.0.0.1'));
  const names = listed.tools.map((t) => t.name);
  for (const n of ['peers_list', 'board_list', 'board_create', 'board_claim', 'board_update']) {
    assert.ok(names.includes(n), `tools/list missing ${n}`);
  }

  // 互见：从 B 看得到 A 和 B
  const peers = await call('10.0.0.2', 'peers_list');
  assert.strictEqual(peers.ok, true);
  assert.ok(peers.count >= 2);
  const keys = peers.peers.map((p) => p.key);
  assert.ok(keys.includes('ArenaSim@10.0.0.1'));
  assert.ok(keys.includes('ChatPlusSim@10.0.0.2'));

  // 归属穿会话身份：A 建、B 认领、A 再认领被拒
  const created = await call('10.0.0.1', 'board_create', { title: 'port the picker docs' });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.task.createdBy, 'ArenaSim@10.0.0.1');
  const claimed = await call('10.0.0.2', 'board_claim', { id: created.task.id });
  assert.strictEqual(claimed.ok, true);
  assert.strictEqual(claimed.task.owner, 'ChatPlusSim@10.0.0.2');
  const taken = await call('10.0.0.1', 'board_claim', { id: created.task.id });
  assert.strictEqual(taken.ok, false);
  assert.strictEqual(taken.error, 'E_TAKEN');

  // 板子落在工作区 .webagent/board.json
  assert.ok(fs.existsSync(path.join(tmp, '.webagent', 'board.json')));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('mcpBoard.test ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
