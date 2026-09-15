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
    await page.click('#menu-help'); await page.locator('#page-help').waitFor({ state: 'visible' }); await page.click('#modal-close');
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
    assert.deepStrictEqual(errors, []);
    console.log('Browser PASS: help, host match/mismatch, real MCP write verification, trace, WS loss/reload, file save, builtin evidence, themes/popovers, failure/reset');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill();
    await exited;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
