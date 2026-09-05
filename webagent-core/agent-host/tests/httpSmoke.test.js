const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-smoke-'));
const hostDir = path.resolve(__dirname, '..');
const workbenchPort = 18000 + Math.floor(Math.random() * 2000);
const mcpPort = 20000 + Math.floor(Math.random() * 2000);

function request(method, url, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const headers = { ...(extraHeaders || {}) };
    if (payload) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, raw, json });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function waitHealth(url, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error(`health HTTP ${res.statusCode}`));
        setTimeout(tick, 120);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('health timeout'));
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}

function stop(proc) {
  if (!proc || proc.killed) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try {
      proc.kill('SIGTERM');
    } catch (_) {}
  }
}

async function main() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: hostDir,
    env: {
      ...process.env,
      WORKSPACE_ROOT: tmp,
      WORKBENCH_PORT: String(workbenchPort),
      AGENT_HOST_PORT: String(mcpPort)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let log = '';
  child.stdout.on('data', (c) => {
    log += c.toString();
  });
  child.stderr.on('data', (c) => {
    log += c.toString();
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && !log.includes('httpSmoke finished')) {
      // leftover log inspected in catch
    }
  });

  try {
    await waitHealth(`http://127.0.0.1:${workbenchPort}/health`, 12000);

    const health = await request('GET', `http://127.0.0.1:${workbenchPort}/health`);
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.json.ok, true);
    assert.strictEqual(health.json.product, 'Web Agent');

    const page = await request('GET', `http://127.0.0.1:${workbenchPort}/`);
    assert.strictEqual(page.status, 200);
    assert.ok(page.raw.includes('Web Agent'));
    assert.ok(page.raw.includes('编辑进化') || page.raw.includes('CHAT'));
    assert.ok(page.raw.includes('Add API'));
    assert.ok(page.raw.includes('btn-agent-pick'));
    assert.ok(page.raw.includes('agent-pick-menu'));
    assert.ok(page.raw.includes('Web Agent Code'));
    assert.ok(page.raw.includes('环境偏好'));
    assert.ok(page.raw.includes('技术栈'));
    assert.ok(page.raw.includes('技能引导'));
    assert.ok(page.raw.includes('怎么连到本机仓库'));
    assert.ok(page.raw.includes('无需 Plus') || page.raw.includes('不需要 Plus'));
    assert.ok(page.raw.includes('打开 DeepSeek'));
    assert.ok(page.raw.includes('data-site="deepseek"'));
    assert.ok(page.raw.includes('清除本轮统计'));
    assert.ok(page.raw.includes('id="page-env"'));
    assert.ok(page.raw.includes('id="btn-detect-env"'));
    assert.ok(page.raw.includes('id="page-stack"'));
    assert.ok(page.raw.includes('id="btn-detect-stack"'));
    assert.ok(page.raw.includes('本机演示授权'));
    assert.ok(page.raw.includes('不是 GitHub'));
    assert.ok(page.raw.includes('GitHub 验证'));
    assert.ok(page.raw.includes('验证令牌'));
    assert.ok(page.raw.includes('没有接 OpenAI Codex'));
    assert.ok(page.raw.includes('不会自动执行'));
    assert.ok(page.raw.includes('没有插件市场'));
    assert.ok(page.raw.includes('Named Tunnel'));
    assert.ok(page.raw.includes('未实现'));
    assert.ok(page.raw.includes('.webagent/config.json'));
    assert.ok(page.raw.includes('多模型博弈'));
    assert.ok(page.raw.includes('btn-plan-merge'));
    assert.ok(page.raw.includes('think-select'));
    assert.ok(!page.raw.includes('永久顺'));
    assert.ok(!page.raw.includes('使用 GitHub 登录'));
    assert.ok(page.raw.includes('type="module"') && page.raw.includes('/app.js'));

    const appJs = await request('GET', `http://127.0.0.1:${workbenchPort}/app.js`);
    assert.strictEqual(appJs.status, 200);
    assert.ok(appJs.raw.includes("from './js/state.js'"));
    const stateJs = await request('GET', `http://127.0.0.1:${workbenchPort}/js/state.js`);
    assert.strictEqual(stateJs.status, 200);
    assert.ok(stateJs.raw.includes('export const state'));

    const status = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`);
    assert.strictEqual(status.status, 200);
    assert.ok(status.json.secretKey);
    assert.ok(status.json.prompt.includes('快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。'));
    assert.ok(Array.isArray(status.json.tools) && status.json.tools.length === 25);
    assert.ok(Array.isArray(status.json.clients) && status.json.clients.some((c) => c.id === 'arena' && !c.needsPlus));
    assert.ok(status.json.clients.some((c) => c.id === 'deepseek' && c.connectMode === 'extension-http' && !c.needsPlus && c.supportsMcp));
    assert.ok(status.json.clients.some((c) => c.id === 'chat-plus' && c.connectMode === 'extension-http' && !c.needsPlus && c.supportsMcp && c.repoUrl === 'https://github.com/aiguicai/Chat-Plus'));
    assert.ok(status.json.mcpCanonicalUrl && status.json.mcpCanonicalUrl.endsWith('/mcp'));
    assert.strictEqual(status.json.bridgeAccount.loggedIn, true);
    assert.strictEqual(status.json.bridgeAccount.provider, 'local-demo');
    assert.strictEqual(status.json.bridgeAccount.license, 'local-demo');
    assert.ok(status.json.planRound && status.json.planRound.active === false);
    assert.ok(status.json.multiModel);
    assert.strictEqual(status.json.multiModel.maxBranches, 4);

    const secret = status.json.secretKey;
    const denied = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/not-a-real-secret`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {}
    });
    assert.strictEqual(denied.status, 401);

    const init = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { clientInfo: { name: 'http-smoke' } }
    });
    assert.strictEqual(init.status, 200);
    assert.ok(init.json.result.instructions.includes('Web Agent Bridge MCP'));
    assert.ok(init.json.result.instructions.includes('webagent://instructions'));

    const listed = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    assert.strictEqual(listed.status, 200);
    const names = listed.json.result.tools.map((t) => t.name);
    assert.ok(names.includes('apply_patch'));
    assert.ok(names.includes('start_command'));
    assert.ok(names.includes('workspace_info'));
    assert.strictEqual(names.length, 25);

    const bare = await request('POST', `http://127.0.0.1:${mcpPort}/mcp`, {
      jsonrpc: '2.0',
      id: 9,
      method: 'initialize',
      params: {}
    });
    assert.strictEqual(bare.status, 401);

    const meta = await request('GET', `http://127.0.0.1:${mcpPort}/.well-known/oauth-authorization-server`);
    assert.strictEqual(meta.status, 200);
    assert.ok(meta.json.authorization_endpoint);

    const ping = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'ping', arguments: {} }
    });
    assert.strictEqual(ping.status, 200);
    assert.strictEqual(ping.json.result.isError, false);
    assert.ok(ping.json.result.content[0].text.includes('"ok": true') || ping.json.result.content[0].text.includes('"ok":true'));

    const usagePath = path.join(tmp, '.webagent', 'usage.json');
    assert.ok(fs.existsSync(usagePath));
    const usageBefore = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
    assert.ok(usageBefore.toolCalls >= 1);

    const badToken = await request('POST', `http://127.0.0.1:${mcpPort}/api/bridge/token`, { token: '' });
    assert.strictEqual(badToken.status, 400);

    const resetRound = await request('POST', `http://127.0.0.1:${mcpPort}/api/bridge/reset-round`, {});
    assert.strictEqual(resetRound.status, 200);
    assert.strictEqual(resetRound.json.success, true);
    assert.ok(resetRound.json.mcpSession);
    assert.strictEqual(resetRound.json.mcpSession.clients, 0);
    const usageAfter = JSON.parse(fs.readFileSync(usagePath, 'utf8'));
    assert.ok(usageAfter.toolCalls >= usageBefore.toolCalls);

    const tunnelHeaders = { 'cf-ray': 'smoke-test', 'cf-connecting-ip': '203.0.113.8' };
    const blockedStatus = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`, undefined, tunnelHeaders);
    assert.strictEqual(blockedStatus.status, 404);
    assert.ok(!String(blockedStatus.raw || '').includes(secret));
    const blockedChat = await request('POST', `http://127.0.0.1:${mcpPort}/api/chat`, { mode: 'ask', message: 'hi' }, tunnelHeaders);
    assert.strictEqual(blockedChat.status, 404);
    const blockedTool = await request('POST', `http://127.0.0.1:${mcpPort}/api/tool/call`, { name: 'ping', arguments: {} }, tunnelHeaders);
    assert.strictEqual(blockedTool.status, 404);
    const blockedHost = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`, undefined, { Host: 'random-words.trycloudflare.com' });
    assert.strictEqual(blockedHost.status, 404);

    const tunneledInit = await request('POST', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, {
      jsonrpc: '2.0',
      id: 11,
      method: 'initialize',
      params: { clientInfo: { name: 'tunnel-smoke' } }
    }, tunnelHeaders);
    assert.strictEqual(tunneledInit.status, 200);

    const evilApi = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`, undefined, {
      Origin: 'https://evil.example'
    });
    assert.strictEqual(evilApi.status, 404);
    assert.ok(!String(evilApi.raw || '').includes(secret));

    const localOriginApi = await request('GET', `http://127.0.0.1:${mcpPort}/api/status`, undefined, {
      Origin: 'http://127.0.0.1:3000'
    });
    assert.strictEqual(localOriginApi.status, 200);
    assert.ok(localOriginApi.json.secretKey);

    const evilUi = await request('POST', `http://127.0.0.1:${workbenchPort}/api/bridge/reset-round`, {}, {
      Origin: 'https://evil.example'
    });
    assert.strictEqual(evilUi.status, 404);

    const preflightBad = await request('OPTIONS', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, undefined, {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'POST'
    });
    assert.ok(!preflightBad.headers['access-control-allow-origin']);

    const preflightPage = await request('OPTIONS', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, undefined, {
      Origin: 'https://chat.deepseek.com',
      'Access-Control-Request-Method': 'POST'
    });
    assert.strictEqual(preflightPage.headers['access-control-allow-origin'], 'https://chat.deepseek.com');

    const preflightExt = await request('OPTIONS', `http://127.0.0.1:${mcpPort}/mcp/${secret}`, undefined, {
      Origin: 'chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf',
      'Access-Control-Request-Method': 'POST'
    });
    assert.strictEqual(
      preflightExt.headers['access-control-allow-origin'],
      'chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf'
    );

    const mcpRoot = await request('GET', `http://127.0.0.1:${mcpPort}/`);
    assert.ok(!(mcpRoot.raw || '').includes('btn-agent-pick'));

    const chat = await request('POST', `http://127.0.0.1:${workbenchPort}/api/chat`, {
      mode: 'ask',
      message: '分析当前项目实现了什么功能'
    });
    assert.strictEqual(chat.status, 200);
    const events = String(chat.raw || '')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
    assert.ok(events.some((e) => e.type === 'tool' && e.name === 'list_directory'));
    assert.ok(events.some((e) => e.type === 'message' && e.text));
    assert.ok(events.some((e) => e.type === 'done'));

    function ndjson(raw) {
      return String(raw || '')
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    }

    const planStart = await request('POST', `http://127.0.0.1:${workbenchPort}/api/chat`, {
      mode: 'plan',
      message: '针对当前工作区制定修改计划',
      thinkLevel: 'low'
    });
    assert.strictEqual(planStart.status, 200);
    const planStartEv = ndjson(planStart.raw);
    assert.ok(!planStartEv.some((e) => e.type === 'consensus'));
    const started = planStartEv.find((e) => e.type === 'planRound');
    assert.ok(started && started.round && started.round.branches.length === 1);

    const planBranch = await request('POST', `http://127.0.0.1:${workbenchPort}/api/chat`, {
      mode: 'plan',
      message: '',
      planAction: 'branch',
      thinkLevel: 'low'
    });
    const planBranchEv = ndjson(planBranch.raw);
    const branched = planBranchEv.find((e) => e.type === 'planRound');
    assert.ok(branched && branched.round.branches.length === 2);
    assert.ok(branched.round.canMerge);
    assert.ok(!planBranchEv.some((e) => e.type === 'consensus'));

    const planMerge = await request('POST', `http://127.0.0.1:${workbenchPort}/api/chat`, {
      mode: 'plan',
      message: '',
      planAction: 'merge'
    });
    const planMergeEv = ndjson(planMerge.raw);
    const consensus = planMergeEv.find((e) => e.type === 'consensus');
    assert.ok(consensus && consensus.result && consensus.result.simulated === true);
    assert.ok(consensus.result.agreementRate == null);

    log += 'httpSmoke finished\n';
    console.log('http smoke tests passed');
  } catch (err) {
    console.error('server log:\n', log);
    throw err;
  } finally {
    stop(child);
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
