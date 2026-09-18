// 第六阶段：多 Agent 任务板经真 MCP 协议的端到端锁——两个模拟网页客户端同连，
// 初始化后的独立peer身份必须穿进板子归属；peers_list 必须互见。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-mcpboard-'));
config.workspaceRoot = tmp;

const { handleRpc } = require('../src/mcp/server');

const session = require('../src/mcp/session');
const ids = new Map();
function req(method, params, ip) {
  if (!ids.has(ip)) ids.set(ip, session.createHttpSession());
  return { ip, headers: { 'mcp-session-id': ids.get(ip) }, mcpSessionId: ids.get(ip), body: { jsonrpc: '2.0', id: 1, method, params: params || {} } };
}

async function call(ip, name, args) {
  const res = await handleRpc(req('tools/call', { name, arguments: args || {} }, ip));
  const text = res.content[0].text;
  return JSON.parse(text);
}

async function httpOwnership() {
  config.host = '127.0.0.1'; config.port = 0; config.workbenchPort = 0;
  const { uiServer, mcpServer } = require('../src/index');
  const tracker = require('../src/usage/tracker');
  try {
    await Promise.all([uiServer, mcpServer].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
    const endpoint = `http://127.0.0.1:${mcpServer.address().port}/mcp`;
    const rpc = async (method, params, sid, token = config.secretKey, verb = 'POST') => {
      const res = await fetch(endpoint, { method: verb, headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${token}`,
        ...(sid ? { 'Mcp-Session-Id': sid } : {})
      }, ...(verb === 'POST' ? { body: JSON.stringify({ jsonrpc: '2.0', id: 40, method, params }) } : {}) });
      return { status: res.status, sid: res.headers.get('mcp-session-id'), body: res.status === 204 ? null : await res.json() };
    };
    const init = (name, token, sid) => rpc('initialize', { clientInfo: { name } }, sid, token);
    const tools = (sid, name, args, token) => rpc('tools/call', { name, arguments: args || {} }, sid, token);
    const content = response => JSON.parse(response.body.result.content[0].text);
    const victim = await init('http-victim');
    const other = await init('http-other');
    const created = content(await tools(victim.sid, 'board_create', { title: 'session ownership regression' }));
    const claimed = content(await tools(victim.sid, 'board_claim', { id: created.task.id }));
    assert.strictEqual(claimed.ok, true);
    assert.strictEqual(content(await tools(other.sid, 'board_update', { id: created.task.id, status: 'done' })).error, 'E_NOT_OWNER');
    // Learn the public peer label through the protocol, not from private fixture state.
    const peers = content(await tools(other.sid, 'peers_list'));
    const publicKey = peers.peers.find(p => p.client === 'http-victim').key;
    const forged = await tools(publicKey.replace(/^peer:/, ''), 'board_update', { id: created.task.id, status: 'done' });
    const disk = JSON.parse(fs.readFileSync(path.join(tmp, '.webagent/board.json'), 'utf8'));
    assert.strictEqual(disk.tasks.find(t => t.id === created.task.id).status, 'claimed', 'public peer label must not grant the owner session');
    assert.strictEqual(forged.status, 404);
    assert.notStrictEqual(publicKey, 'peer:' + victim.sid);
    assert.strictEqual(content(await tools(victim.sid, 'board_update', { id: created.task.id, status: 'doing' })).ok, true);
    const oauth = require('../src/mcp/oauth');
    const authorize = () => {
      const client = oauth.registerClient({ redirect_uris: ['http://localhost/cb'] });
      const verifier = 'v'.repeat(43);
      const location = oauth.completeAuthorize({ client_id: client.client_id, redirect_uri: client.redirect_uris[0],
        code_challenge: oauth.s256(verifier), pairing_code: oauth.issuePairing().code });
      const tokens = oauth.handleToken({ grant_type: 'authorization_code', client_id: client.client_id,
        redirect_uri: client.redirect_uris[0], code: new URL(location).searchParams.get('code'), code_verifier: verifier });
      return { client, tokens };
    };
    const owner = authorize(), foreign = authorize();
    const ownerInit = await init('oauth-owner', owner.tokens.access_token);
    const cross = await rpc('ping', {}, ownerInit.sid, foreign.tokens.access_token);
    assert.strictEqual(cross.status, 404, 'a different authenticated OAuth client must not reuse a known private session ID');
    assert.strictEqual((await tools(ownerInit.sid, 'board_create', { title: 'must not be created' }, foreign.tokens.access_token)).status, 404);
    assert.strictEqual((await rpc(null, null, ownerInit.sid, foreign.tokens.access_token, 'GET')).status, 404);
    assert.strictEqual((await rpc(null, null, ownerInit.sid, foreign.tokens.access_token, 'DELETE')).status, 204);
    assert.strictEqual((await rpc('ping', {}, ownerInit.sid, owner.tokens.access_token)).status, 200, 'foreign DELETE must not delete the owner session');
    const fresh = await init('foreign-reinitialized', foreign.tokens.access_token, ownerInit.sid);
    assert.strictEqual(fresh.status, 200);
    assert.ok(fresh.sid && fresh.sid !== ownerInit.sid, 'initialize may replace, never adopt a foreign session');
    const task = content(await tools(ownerInit.sid, 'board_create', { title: 'retain ownership across OAuth refresh' }, owner.tokens.access_token)).task;
    assert.strictEqual(content(await tools(ownerInit.sid, 'board_claim', { id: task.id }, owner.tokens.access_token)).ok, true);
    const refreshed = oauth.handleToken({ grant_type: 'refresh_token', client_id: owner.client.client_id, refresh_token: owner.tokens.refresh_token });
    assert.strictEqual((await rpc('ping', {}, ownerInit.sid, owner.tokens.access_token)).status, 401);
    assert.strictEqual((await rpc('ping', {}, ownerInit.sid, refreshed.access_token)).status, 200);
    const reinit = await init('oauth-owner-renamed', refreshed.access_token, ownerInit.sid);
    assert.strictEqual(reinit.sid, ownerInit.sid);
    const updated = content(await tools(ownerInit.sid, 'board_update', { id: task.id, status: 'done' }, refreshed.access_token));
    assert.strictEqual(updated.ok, true);
    assert.strictEqual(updated.task.owner, task.createdBy, 'refresh and reinitialize preserve the public peer identity');
    for (const response of [await rpc('ping', {}, other.sid), await tools(other.sid, 'peers_list'), await tools(other.sid, 'board_list')]) {
      for (const privateId of [victim.sid, ownerInit.sid, fresh.sid]) {
        assert.ok(!JSON.stringify(response.body).includes(privateId), 'public snapshots must not disclose private HTTP session IDs');
      }
    }
    assert.strictEqual((await rpc(null, null, publicKey.replace(/^peer:/, ''), config.secretKey, 'DELETE')).status, 204);
    assert.strictEqual((await rpc('ping', {}, victim.sid)).status, 200);
    assert.strictEqual((await rpc(null, null, ownerInit.sid, refreshed.access_token, 'DELETE')).status, 204);
    assert.strictEqual((await rpc('ping', {}, ownerInit.sid, refreshed.access_token)).status, 404);
    const savedSecret = config.secretKey;
    try {
      config.secretKey = 'test-rotated-secret';
      assert.strictEqual((await rpc('ping', {}, victim.sid, savedSecret)).status, 401);
      assert.strictEqual((await rpc('ping', {}, victim.sid)).status, 404, 'a new URL secret does not inherit old sessions');
      assert.strictEqual((await init('after-secret-rotation')).status, 200);
    } finally { config.secretKey = savedSecret; }


  } finally {
    tracker.stopReporter();
    require('../src/mcp/oauth').revokeAll();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(resolve))));
  }
}

async function main() {
  await handleRpc(req('initialize', { clientInfo: { name: 'ArenaSim' } }, '10.0.0.1'));
  await handleRpc(req('initialize', { clientInfo: { name: 'ChatPlusSim' } }, '10.0.0.2'));

  const keyA = session.keyForReq(req('ping', {}, '10.0.0.1'));
  const keyB = session.keyForReq(req('ping', {}, '10.0.0.2'));
  assert.ok(keyA && keyB && keyA !== keyB);
  assert.notStrictEqual(keyA, 'peer:' + ids.get('10.0.0.1'));
  assert.notStrictEqual(keyB, 'peer:' + ids.get('10.0.0.2'));
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
  assert.ok(keys.includes(keyA));
  assert.ok(keys.includes(keyB));

  // 归属穿会话身份：A 建、B 认领、A 再认领被拒
  const created = await call('10.0.0.1', 'board_create', { title: 'port the picker docs' });
  assert.strictEqual(created.ok, true);
  assert.strictEqual(created.task.createdBy, keyA);
  const claimed = await call('10.0.0.2', 'board_claim', { id: created.task.id });
  assert.strictEqual(claimed.ok, true);
  assert.strictEqual(claimed.task.owner, keyB);
  const taken = await call('10.0.0.1', 'board_claim', { id: created.task.id });
  assert.strictEqual(taken.ok, false);
  assert.strictEqual(taken.error, 'E_TAKEN');

  // 板子落在工作区 .webagent/board.json
  assert.ok(fs.existsSync(path.join(tmp, '.webagent', 'board.json')));

  await httpOwnership();
  console.log('mcpBoard.test ok');
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
