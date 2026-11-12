'use strict';
// F132: saved HTTP registrations of external MCP servers (workspace .webagent/config.json, token included),
// restored when the host starts; the token never appears in a list or status reply; stdio is never saved.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { config } = require('../src/config');

const workspaceBefore = config.workspaceRoot;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'external-saved-'));
config.workspaceRoot = tmp;
const external = require('../src/mcp/externalClient');
const configFile = path.join(tmp, '.webagent', 'config.json');
const TOKEN = 'saved-SECRET-token';
const readConfig = () => JSON.parse(fs.readFileSync(configFile, 'utf8'));

async function main() {
  let mode = 'ok';
  const authorizations = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    authorizations.push(req.headers.authorization);
    if (mode === 'down') { res.writeHead(500); res.end('down'); return; }
    const message = JSON.parse(body);
    if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); return; }
    const result = message.method === 'initialize' ? { protocolVersion: '2025-03-26', capabilities: {} }
      : { tools: [{ name: 'echo', inputSchema: { type: 'object' } }] };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  try {
    // 1. A successful registration is saved with its token; no list reply carries the token.
    const added = await external.add({ name: 'fixture', url, token: TOKEN });
    assert.strictEqual(added.saved, true); assert.strictEqual(added.status, 'discovered');
    assert.ok(!JSON.stringify(added).includes(TOKEN), 'the registration reply has no token');
    const saved = readConfig().externalServers;
    assert.deepStrictEqual(saved, [{ id: added.serverId, name: 'fixture', url, token: TOKEN, publicHttps: false }]);
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(configFile).mode & 0o777, 0o600, 'config.json stays owner-only');
    const listed = external.list(true)[0];
    assert.deepStrictEqual([listed.saved, listed.hasToken, listed.endpoint], [true, true, url]);
    assert.ok(!JSON.stringify(external.list(true)).includes(TOKEN) && !JSON.stringify(external.list()).includes(TOKEN), 'the token is never listed');
    assert.strictEqual(external.list()[0].hasToken, undefined, 'the model-facing list has no endpoint details');
    // 2. The same endpoint cannot be registered twice (a restored copy would otherwise pile up).
    await assert.rejects(() => external.add({ name: 'again', url, token: 'other' }), /already registered/);
    assert.strictEqual(readConfig().externalServers.length, 1);
    // 3. Shutdown disconnects but keeps the saved entry; a restart restores it under the same id with the token.
    await external.closeAll();
    assert.strictEqual(external.list().length, 0); assert.strictEqual(readConfig().externalServers.length, 1);
    authorizations.length = 0;
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 1, skipped: 0 });
    let restored = external.list(true)[0];
    assert.deepStrictEqual([restored.serverId, restored.status, restored.saved, restored.tools.map(tool => tool.name)], [added.serverId, 'discovered', true, ['echo']]);
    assert.ok(authorizations.length >= 3 && authorizations.every(value => value === `Bearer ${TOKEN}`), 'the saved token is sent again');
    assert.strictEqual(external.request({ serverId: added.serverId, tool: 'echo', arguments: {}, requestKey: 'saved-call-0001' }).status, 'waiting-approval', 'a restored server still needs approval per call');
    // 4. Server down at start: listed as unavailable with a fixed category, not callable, reconnect after it is back.
    await external.closeAll(); mode = 'down';
    await external.restoreSaved();
    restored = external.list(true)[0];
    assert.deepStrictEqual([restored.status, restored.category, restored.tools.length], ['unavailable', 'http', 0]);
    assert.throws(() => external.request({ serverId: added.serverId, tool: 'echo', arguments: {}, requestKey: 'saved-call-0002' }), /Unknown external/);
    await assert.rejects(() => external.reconnect(added.serverId), error => error.category === 'http');
    assert.strictEqual(external.list(true)[0].status, 'unavailable', 'a failed reconnect stays listed');
    mode = 'ok';
    const back = await external.reconnect(added.serverId);
    assert.deepStrictEqual([back.status, back.category], ['discovered', undefined]);
    await assert.rejects(() => external.reconnect(added.serverId), /not connected/, 'a connected server is not reconnected');
    await assert.rejects(() => external.reconnect('0b2e0c1a-1111-4222-8333-444455556666'), /not connected/);
    // 5. Remove forgets the saved entry; the next start restores nothing.
    assert.deepStrictEqual(external.remove(added.serverId), { removed: true, forgotten: true });
    assert.deepStrictEqual(readConfig().externalServers, []);
    await external.closeAll();
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 0, skipped: 0 });

    // 6. A saved public HTTPS server is listed but does not connect until a confirmed, workspace-bound reconnect.
    const publicId = '1b2e0c1a-1111-4222-8333-444455556666';
    const cfg = readConfig();
    cfg.externalServers = [{ id: publicId, name: 'remote', url: 'https://mcp.example.test/mcp', token: TOKEN, publicHttps: true }];
    fs.writeFileSync(configFile, JSON.stringify(cfg));
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 1, skipped: 0 });
    assert.deepStrictEqual([external.list(true)[0].status, external.list(true)[0].publicHttps], ['saved', true]);
    await assert.rejects(() => external.reconnect(publicId, {}), /confirmation/);
    await assert.rejects(() => external.reconnect(publicId, { confirmedPublic: true, workspaceRoot: path.join(tmp, 'other'), hostInstanceId: config.hostInstanceId }));
    assert.strictEqual(external.list(true)[0].status, 'saved', 'a refused reconnect does not change the state');
    assert.deepStrictEqual(external.remove(publicId), { removed: true, forgotten: true });
    await external.closeAll();

    // 7. Invalid or duplicate entries are skipped and the file is left exactly as it was.
    const valid = { id: '2b2e0c1a-1111-4222-8333-444455556666', name: 'ok', url, token: '', publicHttps: false };
    // Each invalid entry has its own address, so it is rejected for its own reason rather than as a duplicate.
    cfg.externalServers = [valid, { ...valid, id: '3b2e0c1a-1111-4222-8333-444455556666' }, { ...valid, id: 'not-a-uuid', url: `${url}-a` },
      { ...valid, id: '4b2e0c1a-1111-4222-8333-444455556666', url: 'http://example.test/mcp' }, { ...valid, id: '5b2e0c1a-1111-4222-8333-444455556666', token: 'a\nb', url: `${url}-b` },
      { ...valid, id: '9b2e0c1a-1111-4222-8333-444455556666', token: 'a\u0000b', url: `${url}-c` }, { ...valid, id: 'ab2e0c1a-1111-4222-8333-444455556666', name: 'n'.repeat(121), url: `${url}-d` },
      { ...valid, id: '6b2e0c1a-1111-4222-8333-444455556666', publicHttps: 'no', url: `${url}-e` }, null, 'text',
      { ...valid, id: '7b2e0c1a-1111-4222-8333-444455556666', url: `http://127.0.0.1:${config.port}/mcp` }];
    fs.writeFileSync(configFile, JSON.stringify(cfg));
    const before = fs.readFileSync(configFile);
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 1, skipped: 10 });
    assert.deepStrictEqual(external.lastRestore(), { restored: 1, skipped: 10 });
    assert.ok(fs.readFileSync(configFile).equals(before), 'restoring never rewrites the file');
    assert.strictEqual(external.list(true)[0].hasToken, false);
    await external.closeAll();
    // At most eight servers, saved ones included.
    cfg.externalServers = Array.from({ length: 9 }, (_, i) => ({ ...valid, id: `8b2e0c1a-1111-4222-8333-44445555666${i}`, url: `${url}${i}` }));
    fs.writeFileSync(configFile, JSON.stringify(cfg));
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 8, skipped: 1 });
    await external.closeAll();

    // 8. An unreadable config: nothing restored, nothing thrown; a new registration works but says it is not saved.
    fs.writeFileSync(configFile, '{ broken');
    assert.deepStrictEqual(await external.restoreSaved(), { restored: 0, skipped: 0, unreadable: true });
    const unsaved = await external.add({ name: 'fixture', url, token: TOKEN });
    assert.strictEqual(unsaved.saved, false);
    assert.strictEqual(fs.readFileSync(configFile, 'utf8'), '{ broken', 'a corrupt config is never overwritten');
    assert.deepStrictEqual(external.remove(unsaved.serverId), { removed: true });
    await external.closeAll();
    console.log('external saved registrations: save with token, never listed, restore on start, unavailable/reconnect, public waits for confirmation, invalid entries skipped, corrupt config untouched passed');
  } finally {
    await external.closeAll();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    config.workspaceRoot = workspaceBefore; fs.rmSync(tmp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exit(1); });
