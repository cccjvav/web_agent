'use strict';
// Real browser + real local MCP. Not part of the DOM-fixture test runner.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-browser-'));
  fs.writeFileSync(path.join(workspace, 'acceptance.txt'), 'REAL-BROWSER-EVIDENCE\n');
  const skillDir = path.join(workspace, '.webagent/skills/browser-review');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'scripts'));
  const skillBody = '---\ndescription: Browser skill fixture <img src=x onerror=alert(1)>\n---\n# Review\n' + '正文'.repeat(4500) + '\nEND-SKILL';
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillBody);
  fs.writeFileSync(path.join(skillDir, 'references/check.md'), 'REFERENCE-EVIDENCE');
  fs.writeFileSync(path.join(skillDir, 'scripts/run.js'), `require("fs").writeFileSync(${JSON.stringify(path.join(workspace, 'UNAUTHORIZED-SKILL'))}, "bad")`);
  fs.writeFileSync(path.join(skillDir, 'workflow.json'), JSON.stringify({ steps: [{ id: 'write', tool: 'write_file', arguments: { filePath: 'skill-produced.txt', content: 'REQUIRES-APPROVAL' } }] }));
  const uiPort = await freePort(), mcpPort = await freePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, WORKSPACE_ROOT: workspace, WORKBENCH_PORT: String(uiPort), AGENT_HOST_PORT: String(mcpPort) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '', browser;
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Host startup timeout: ' + output)), 15000);
      const receive = chunk => {
        output += chunk;
        if (output.includes(`MCP listening on 127.0.0.1:${mcpPort}`)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', receive); child.stderr.on('data', receive);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Host exited: ' + output)); });
    });
    const base = `http://127.0.0.1:${uiPort}`;
    const status = await (await fetch(base + '/api/status')).json();
    const rpc = async (name, args = {}) => {
      const response = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      });
      assert.strictEqual(response.status, 200);
      return (await response.json()).result;
    };
    await rpc('ping'); // History exists before the page opens.
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.routeWebSocket('**/ws', ws => ws.close()); // Polling must work without WS.
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '1');
    await page.click('#menu-help'); await page.locator('#page-help').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#builtin-guide').textContent()).includes('读取 `README.md`'));
    assert.ok((await page.locator('#adoption-guide').textContent()).includes('不是全部候选已完成'));
    await page.click('#modal-close');
    await page.click('#walk-start'); await page.locator('#page-help').waitFor({ state: 'visible' }); await page.click('#modal-close');
    await page.click('#rb-bridge-tab'); await page.click('#btn-host-diagnostics');
    await page.waitForFunction(() => document.querySelector('#diagnostic-identity').textContent.includes('hostInstanceId'));
    const ping = JSON.parse((await rpc('ping')).content[0].text);
    assert.deepStrictEqual(ping.identity, status.identity);
    await page.fill('#expected-host', ping.identity.hostInstanceId); await page.click('#btn-compare-host');
    assert.ok((await page.locator('#host-comparison').textContent()).startsWith('匹配'));
    await page.fill('#expected-host', '00000000-0000-0000-0000-000000000000'); await page.click('#btn-compare-host');
    assert.ok((await page.locator('#host-comparison').textContent()).startsWith('不匹配'));
    await page.click('#modal-close');
    await page.click('#btn-operations');
    await page.fill('#ops-workflow', JSON.stringify({ steps: [{ id: 'write', tool: 'write_file', arguments: { filePath: 'approved-browser.txt', content: 'OPERATOR-APPROVED' } }] }));
    await page.click('#btn-ops-preview');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('requiresApproval'));
    assert.ok(!fs.existsSync(path.join(workspace, 'approved-browser.txt')));
    await page.click('#btn-ops-submit');
    await page.locator('#ops-controls button').first().waitFor({ state: 'visible' });
    assert.ok(!fs.existsSync(path.join(workspace, 'approved-browser.txt')));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('succeeded'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'approved-browser.txt'), 'utf8'), 'OPERATOR-APPROVED');
    await page.click('#modal-close');
    const write = await rpc('write_file', { filePath: 'remote-proof.txt', content: 'WRITTEN-AND-VERIFIED' });
    const written = JSON.parse(write.content[0].text);
    assert.strictEqual(written.verification.state, 'verified');
    assert.strictEqual(write._meta.trace.hostInstanceId, status.identity.hostInstanceId);
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'remote-proof.txt'), 'utf8'), 'WRITTEN-AND-VERIFIED');
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    assert.ok((await page.locator('#bridge-log').textContent()).includes(write._meta.trace.callId));
    assert.ok((await page.locator('#bridge-log').textContent()).includes('verified'));
    const activityBefore = await (await fetch(base + '/api/bridge/activity')).json();
    await page.route('**/api/bridge/activity', route => route.fulfill({ status: 503, body: 'temporary failure' }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sess-note').textContent.includes('同步失败'));
    assert.strictEqual(await page.locator('#stat-calls').textContent(), '—', 'not loaded is not zero');
    await page.unroute('**/api/bridge/activity');
    await page.click('#rb-bridge-tab'); await page.click('#btn-refresh-activity');
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    const activityAfter = await (await fetch(base + '/api/bridge/activity')).json();
    assert.strictEqual(activityAfter.epoch, activityBefore.epoch);
    assert.strictEqual(activityAfter.resetAt, activityBefore.resetAt);
    assert.strictEqual(activityAfter.stats.calls, 3);
    assert.ok((await page.locator('#bridge-log').textContent()).includes(write._meta.trace.callId));
    await page.reload(); await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    await page.click('[data-left="explorer"]'); await page.click('.tree-item[data-path="acceptance.txt"]');
    await page.locator('#editor-fallback').waitFor({ state: 'visible' });
    await page.fill('#editor-fallback', 'REAL-BROWSER-EVIDENCE\nSAVED-FROM-BROWSER\n');
    const saved = page.waitForResponse(response => response.url().includes('/api/files/content') && response.request().method() === 'PUT');
    await page.keyboard.press('Control+s'); assert.strictEqual((await saved).status(), 200);
    assert.ok(fs.readFileSync(path.join(workspace, 'acceptance.txt'), 'utf8').includes('SAVED-FROM-BROWSER'));
    await page.click('#model-pick-btn'); await page.locator('.mp-row').filter({ hasText: '内置探索' }).click();
    await page.click('#btn-agent-pick'); await page.click('#agent-pick-menu [data-mode="ask"]');
    await page.fill('#chat-input', '只读取 `acceptance.txt`');
    const chat = page.waitForResponse(response => response.url().endsWith('/api/chat'));
    await page.click('#btn-send');
    assert.ok((await (await chat).text()).includes('SAVED-FROM-BROWSER'));
    await page.waitForFunction(() => document.querySelector('#btn-send').textContent === '↑');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async value => (await import('/js/dom.js')).applyTheme(value), theme);
      for (const viewport of [{ width: 1024, height: 600 }, { width: 640, height: 360 }]) {
        await page.setViewportSize(viewport); await page.click('#btn-agent-pick');
        const rect = await page.locator('#agent-pick-menu').boundingBox();
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
        await page.keyboard.press('Escape');
      }
    }
    await page.setViewportSize({ width: 1280, height: 900 }); await page.click('#rb-bridge-tab');
    await rpc('unknown-fixture-tool'); await page.waitForFunction(() => document.querySelector('#stat-fail').textContent === '1');
    await page.click('#btn-reset-round'); await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '0');
    assert.strictEqual((await (await fetch(base + '/api/bridge/activity')).json()).resetReason, 'operator-cleared');
    const endpoint = `http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`;
    const initialized = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'browser-approval-fixture', version: '1' } } }) });
    const session = initialized.headers.get('mcp-session-id'); assert.ok(session); await initialized.json();
    const queued = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': session }, body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'workflow_request', arguments: { requestKey: 'browser-remote-approval', definition: { steps: [{ id: 'remote', tool: 'write_file', arguments: { filePath: 'remote-approved.txt', content: 'REMOTE-APPROVED' } }] } } } }) });
    const pending = JSON.parse((await queued.json()).result.content[0].text);
    assert.strictEqual(pending.status, 'waiting-approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'remote-approved.txt')));
    await page.click('#btn-operations');
    await page.locator('#ops-requests button').filter({ hasText: pending.requestId }).click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('succeeded'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'remote-approved.txt'), 'utf8'), 'REMOTE-APPROVED');
    await page.click('#modal-close'); await page.click('#rb-chat-tab');
    await page.fill('#chat-input', 'KEEP-DRAFT');
    await page.click('#menu-help'); await page.click('.modal-nav [data-page="skills"]');
    await page.fill('#skill-search', 'browser-review');
    assert.strictEqual(await page.locator('#skills-list img').count(), 0);
    await page.click('[data-skill-id="workspace:browser-review"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-note').textContent.includes('SHA256'));
    await page.click('#btn-skill-more');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent.endsWith('END-SKILL'));
    assert.strictEqual(await page.locator('#skill-reader-content').textContent(), skillBody);
    await page.click('[data-resource="references/check.md"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent === 'REFERENCE-EVIDENCE');
    await page.click('[data-resource="SKILL.md"]');
    await page.click('[data-resource="scripts/run.js"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent.includes('UNAUTHORIZED-SKILL'));
    assert.ok(!fs.existsSync(path.join(workspace, 'UNAUTHORIZED-SKILL')));
    let skillChatRequests = 0;
    page.on('request', request => { if (request.url().endsWith('/api/chat')) skillChatRequests++; });
    await page.click('#btn-skill-use');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    assert.ok((await page.locator('#chat-input').inputValue()).includes('KEEP-DRAFT'));
    assert.ok((await page.locator('#chat-input').inputValue()).includes('workspace:browser-review'));
    assert.strictEqual(await page.locator('#mode-select').inputValue(), 'ask');
    assert.strictEqual(skillChatRequests, 0);
    await page.click('#menu-help'); await page.click('.modal-nav [data-page="skills"]');
    await page.click('[data-skill-id="workspace:browser-review"]');
    await page.click('[data-resource="workflow.json"]');
    await page.click('#btn-skill-workflow');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('requiresApproval'));
    assert.ok(!fs.existsSync(path.join(workspace, 'skill-produced.txt')), 'Skill workflow preview never executes');
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=missing-skill`)).status(), 404);
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=workspace%3Abrowser-review&limit=9000`)).status(), 400);
    const skillPage = JSON.parse((await rpc('load_skill', { name: 'workspace:browser-review', limit: 1111 })).content[0].text);
    assert.strictEqual(skillPage.content, skillBody.slice(0, 1111));
    const skillNext = JSON.parse((await rpc('load_skill', { name: skillPage.id, offset: skillPage.nextOffset, expectedHash: skillPage.hash, limit: 1111 })).content[0].text);
    assert.strictEqual(skillNext.content, skillBody.slice(1111, 2222));
    fs.appendFileSync(path.join(skillDir, 'SKILL.md'), '\nNEW-REVISION');
    assert.strictEqual((await rpc('load_skill', { name: skillPage.id, offset: skillPage.nextOffset, expectedHash: skillPage.hash })).isError, true);
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=workspace%3Abrowser-review&offset=1111&expectedHash=${skillPage.hash}`)).status(), 409);
    await page.fill('#ops-workflow', JSON.stringify({ steps: [{ id: 'create', tool: 'write_file',
      arguments: { filePath: 'guard-target.txt', content: 'must not overwrite', confirm_overwrite: true },
      before: { path: 'guard-target.txt', exists: false } }] }));
    await page.click('#btn-ops-preview');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('explicit-precondition'));
    assert.ok(!fs.existsSync(path.join(workspace, 'guard-target.txt')));
    await page.click('#btn-ops-submit');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('waiting-approval'));
    fs.writeFileSync(path.join(workspace, 'guard-target.txt'), 'created by another program');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('E_PRECONDITION'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'guard-target.txt'), 'utf8'), 'created by another program');
    fs.copyFileSync(path.join(__dirname, 'stdioServerFixture.js'), path.join(workspace, 'stdio-ui-server.js'));
    const launchConfig = { program: process.execPath, args: [path.join(workspace, 'stdio-ui-server.js'), 'normal'], reviewFiles: ['stdio-ui-server.js'], env: { FIXTURE_TOKEN: 'browser-private-stdio' } };
    const deniedLaunch = await page.request.post(base + '/api/external/stdio/preview', { headers: { Origin: 'https://untrusted.example' }, data: launchConfig });
    assert.ok([403, 404].includes(deniedLaunch.status()));
    await page.fill('#ops-stdio-config', JSON.stringify(launchConfig));
    await page.click('#btn-stdio-preview');
    await page.waitForFunction(() => !document.querySelector('#btn-stdio-start').disabled);
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-started.json')));
    assert.ok(!(await page.locator('#ops-stdio-review').textContent()).includes('browser-private-stdio'));
    assert.ok(!(await page.locator('#ops-stdio-config').inputValue()).includes('browser-private-stdio'));
    page.once('dialog', dialog => dialog.dismiss()); await page.click('#btn-stdio-start');
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-started.json')));
    page.once('dialog', dialog => dialog.accept()); await page.click('#btn-stdio-start');
    await page.waitForFunction(() => document.querySelector('#ops-servers').textContent.includes('discovered'));
    const registeredStdio = (await (await page.request.get(base + '/api/operations')).json()).servers.find(server => server.transport === 'stdio');
    assert.ok(registeredStdio); assert.ok(fs.existsSync(path.join(workspace, 'stdio-started.json')));
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-calls.txt')));
    const stdioRequest = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': session }, body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'external_request', arguments: { serverId: registeredStdio.serverId, tool: 'echo', arguments: { text: 'STDIO-APPROVED' }, requestKey: 'browser-stdio-approval' } } }) });
    const stdioPending = JSON.parse((await stdioRequest.json()).result.content[0].text);
    assert.strictEqual(stdioPending.status, 'waiting-approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-calls.txt')));
    await page.click('#btn-ops-refresh');
    await page.locator('#ops-requests button').filter({ hasText: stdioPending.requestId }).click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('STDIO-APPROVED'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'stdio-calls.txt'), 'utf8'), 'call\n');
    assert.ok(!(await page.locator('#ops-review').textContent()).includes('browser-private-stdio'));
    await page.locator('#ops-servers button').first().click();
    await page.waitForFunction(() => !document.querySelector('#ops-servers').textContent);
    assert.deepStrictEqual(errors, []);
    // Minimal browser observation + authenticated MCP echo, without visiting Arena or collecting credentials.
    await page.click('#modal-close');
    await page.click('#rb-bridge-tab'); await page.click('#btn-host-diagnostics');
    const observation = { schema: 'webagent-browser-observation/v1', origin: 'https://arena.ai', observedAt: new Date().toISOString(), pageKind: 'agent', pageDigest: 'b'.repeat(64) };
    await page.fill('#connection-observation', JSON.stringify(observation));
    await page.click('#btn-create-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('toolRequest'));
    const check = JSON.parse(await page.locator('#connection-check-result').textContent());
    const spoof = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'spoof', method: 'tools/call', params: { ...check.toolRequest, clientInfo: { name: 'peer:forged' } } }) });
    assert.strictEqual((await spoof.json()).result.isError, true);
    const initResponse = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'connection-init', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'connection-browser-fixture', version: '1' } } }) });
    const sessionId = initResponse.headers.get('mcp-session-id'); assert.ok(sessionId);
    const echoResponse = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', id: 'connection-echo', method: 'tools/call', params: check.toolRequest }) });
    const echo = JSON.parse((await echoResponse.json()).result.content[0].text);
    assert.strictEqual(echo.observationHash, check.observationHash);
    assert.strictEqual(echo.modelIdentityVerified, false);
    await page.click('#btn-refresh-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('echo-confirmed'));
    assert.ok(!(await page.locator('#connection-check-result').textContent()).includes(check.challenge));
    const crossOrigin = await fetch(base + '/api/connection-checks', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(observation) });
    assert.strictEqual(crossOrigin.status, 403);
    await page.click('#btn-clear-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('已清除核对记录'));
    await page.click('#modal-close');
    assert.deepStrictEqual(errors, []);
    console.log('Browser PASS: minimal page observation + authenticated connection echo/forged session rejection/clear, help, host match/mismatch, real MCP write verification, trace, WS loss/reload, file save, builtin evidence, themes/popovers, failure/reset, local + authenticated remote workflow approval; Skill paging/resources/draft/no script execution/workflow preview/hash change; approval-time file precondition refuses drift; stdio preview/start/remote request/local approval/removal');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill();
    await exited;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
