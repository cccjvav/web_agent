// F71: sessionless remote calls must be owned by the authenticated credential, not only by "<client>@<ip>".
// Through cloudflared/ngrok every request arrives from 127.0.0.1, so two different credentials (the URL
// secret and an OAuth client) used to share one caller: B could read A's command output and A's call log.
// The real host is loaded and spoken to over real HTTP from 127.0.0.1 — exactly the tunnel situation.
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-mcp-caller-'));
config.workspaceRoot = tmp;
config.host = '127.0.0.1';
config.port = 0;
config.workbenchPort = 0;

async function main() {
  const { uiServer, mcpServer } = require('../src/index');
  const tracker = require('../src/usage/tracker');
  const oauth = require('../src/mcp/oauth');
  const sessions = require('../src/mcp/session');
  try {
    await Promise.all([uiServer, mcpServer].map(s => s.listening ? null : new Promise(resolve => s.once('listening', resolve))));
    const base = `http://127.0.0.1:${mcpServer.address().port}`;
    let nextId = 1;
    // No Mcp-Session-Id anywhere: every call below is a sessionless remote call.
    const call = async (target, name, args) => {
      const res = await fetch(target.url, { method: 'POST', headers: {
        ...target.headers, 'Content-Type': 'application/json', Accept: 'application/json'
      }, body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name, arguments: args || {} } }) });
      assert.strictEqual(res.status, 200, `${name}: HTTP ${res.status}`);
      assert.strictEqual(res.headers.get('mcp-session-id'), null, 'sessionless calls must not be handed a session');
      const body = await res.json();
      return JSON.parse(body.result.content[0].text);
    };
    const authorize = () => {
      const client = oauth.registerClient({ redirect_uris: ['http://localhost/cb'] });
      const verifier = 'w'.repeat(43);
      const location = oauth.completeAuthorize({ client_id: client.client_id, redirect_uri: client.redirect_uris[0],
        code_challenge: oauth.s256(verifier), pairing_code: oauth.issuePairing().code });
      return oauth.handleToken({ grant_type: 'authorization_code', client_id: client.client_id,
        redirect_uri: client.redirect_uris[0], code: new URL(location).searchParams.get('code'), code_verifier: verifier });
    };

    // A: the URL-secret form (/mcp/<secret>). B and C: two separately paired OAuth clients.
    const A = { url: `${base}/mcp/${config.secretKey}`, headers: {} };
    const tokB = authorize(), tokC = authorize();
    const B = { url: `${base}/mcp`, headers: { Authorization: `Bearer ${tokB.access_token}` } };
    const C = { url: `${base}/mcp`, headers: { Authorization: `Bearer ${tokC.access_token}` } };

    const marker = 'A-PRIVATE-' + crypto.randomBytes(6).toString('hex');
    const ran = await call(A, 'run_command', { command: `node -e "process.stdout.write('${marker}')"` });
    assert.ok(String(ran.stdout || '').includes(marker), 'A ran its command');
    assert.ok(/^[a-f0-9]{16}$/.test(ran.execId), 'A got an execId');

    // 1. "Latest command" lookup without execId: B must not fall onto A's record.
    const bLatest = await call(B, 'get_command_output', {});
    assert.ok(!JSON.stringify(bLatest).includes(marker), 'OAuth client B read the URL-secret caller A\'s latest output');
    assert.strictEqual(bLatest.found, false);
    // 2. Even with A's execId in hand (e.g. leaked through a shared transcript) B is not the owner.
    const bById = await call(B, 'get_command_output', { execId: ran.execId });
    assert.strictEqual(bById.found, false, 'a different credential must not own A\'s execId');
    assert.ok(!JSON.stringify(bById).includes(marker));
    // 3. Two different OAuth clients are two callers as well.
    await call(B, 'run_command', { command: 'node -e "process.stdout.write(\'B-OWN\')"' });
    const cLatest = await call(C, 'get_command_output', {});
    assert.strictEqual(cLatest.found, false, 'OAuth client C read OAuth client B\'s output');

    // 4. get_logs for a remote caller returns only that caller's own tool executions.
    const bLogs = await call(B, 'get_logs', { maxLines: 200 });
    const cLogs = await call(C, 'get_logs', { maxLines: 200 });
    const aLogs = await call(A, 'get_logs', { maxLines: 200 });
    // Count only run_command executions: B's own get_command_output call above echoes the execId B supplied,
    // which is B's own log line, not A's execution.
    const execIds = logs => new Set(logs.logs.filter(e => e.payload && e.payload.tool === 'run_command')
      .map(e => e.payload.execId).filter(Boolean));
    assert.ok(execIds(aLogs).has(ran.execId), 'A still sees its own execution in get_logs');
    assert.ok(!execIds(bLogs).has(ran.execId), 'B\'s get_logs listed A\'s execution');
    assert.ok(!execIds(cLogs).has(ran.execId), 'C\'s get_logs listed A\'s execution');
    const sessionIds = logs => new Set(logs.logs.map(e => e.payload && e.payload.sessionId).filter(Boolean));
    for (const id of sessionIds(bLogs)) assert.ok(!sessionIds(aLogs).has(id), 'A and B must not share a trace sessionId');

    // 5. Continuity is kept for the same credential: A's own latest-output lookup still works.
    const aLatest = await call(A, 'get_command_output', {});
    assert.strictEqual(aLatest.execId, ran.execId);
    assert.ok(String(aLatest.stdout || '').includes(marker), 'same credential keeps its sessionless continuity');
    // The same OAuth client keeps its identity across a refresh (refresh keeps the registered client).
    const refreshedB = oauth.handleToken({ grant_type: 'refresh_token', client_id: oauth.verifyAccessToken(tokB.access_token).clientId,
      refresh_token: tokB.refresh_token });
    const B2 = { url: `${base}/mcp`, headers: { Authorization: `Bearer ${refreshedB.access_token}` } };
    const b2Latest = await call(B2, 'get_command_output', {});
    assert.ok(String(b2Latest.stdout || '').includes('B-OWN'), 'OAuth refresh keeps the same sessionless caller');

    // 6. Public caller labels (peers_list, status snapshot) must not disclose the credential or its digest.
    const principalOf = parts => crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
    const secretDigest = principalOf(['secret', config.secretKey]);
    const rawSecretDigest = crypto.createHash('sha256').update(config.secretKey).digest('hex');
    const peers = await call(C, 'peers_list', {});
    const publicText = JSON.stringify([peers, sessions.snapshot(), sessions.allSessions()]);
    for (const secret of [config.secretKey, secretDigest, rawSecretDigest, tokB.access_token, refreshedB.access_token, tokC.access_token]) {
      assert.ok(!publicText.includes(secret), 'public caller labels must not contain a credential');
      assert.ok(!publicText.includes(secret.slice(0, 16)), 'public caller labels must not contain a credential/digest prefix');
    }
    const keys = sessions.allSessions().map(s => s.key);
    assert.ok(keys.length >= 3, `three credentials must be three caller rows, got ${JSON.stringify(keys)}`);
    assert.ok(keys.every(k => !k.startsWith('peer:')), 'sessionless callers never look like initialized peers');
  } finally {
    tracker.stopReporter();
    oauth.revokeAll();
    await Promise.all([uiServer, mcpServer].map(s => new Promise(resolve => s.close(() => resolve()))));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('sessionless caller isolation passed: URL secret and OAuth clients are separate callers behind one IP');
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
