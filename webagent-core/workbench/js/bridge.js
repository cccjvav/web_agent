import { $, $$, state, SITES, ui } from './state.js';
import { escapeHtml } from './dom.js';

export function logBridgeTool(ev) {
  state.stats.calls += 1;
  if (ev.ok === false || ev.error) state.stats.fail += 1;
  if (ev.durationMs) state.stats.totalMs += ev.durationMs;
  ui.paintStats();
  const wait = $('#bridge-wait');
  if (wait) wait.classList.add('hidden');
  const log = $('#bridge-log');
  const row = document.createElement('div');
  const ok = ev.ok !== false && !ev.error;
  row.className = 'tool-card' + (ok ? '' : ' fail');
  const right = ok ? `${ev.durationMs || 0} ms` : 'Failed';
  row.innerHTML = `<header><span>${escapeHtml(ev.label || ev.name)}</span><span class="dur">${escapeHtml(right)}</span></header>`;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
  $('#sess-note').textContent = 'Remote MCP client is calling local tools.';
}

export function paintStats() {
  const s = state.stats;
  $('#stat-calls').textContent = String(s.calls);
  $('#stat-fail').textContent = String(s.fail);
  const ok = s.calls ? Math.round((1 - s.fail / s.calls) * 100) : 100;
  $('#stat-ok').textContent = ok + '%';
  $('#stat-avg').textContent = (s.calls ? Math.round(s.totalMs / s.calls) : 0) + ' ms';
}

export async function resetRound() {
  try {
    await fetch('/api/bridge/reset-round', { method: 'POST' });
  } catch (_) {}
  state.stats = { calls: 0, fail: 0, totalMs: 0 };
  ui.paintStats();
  const log = $('#bridge-log');
  if (log) log.innerHTML = '';
  const wait = $('#bridge-wait');
  if (wait) wait.classList.remove('hidden');
  await ui.refreshStatus();
  ui.toast('已清除本轮 MCP 统计');
}

export function selectedClientInfo() {
  const list = (state.status && state.status.clients) || [];
  return list.find((c) => c.id === state.selectedClient) || list.find((c) => c.id === 'arena') || null;
}

export function promptText() {
  const s = state.status || {};
  const c = ui.selectedClientInfo();
  if (c && c.prompt) return c.prompt;
  return s.prompt || `${s.mcpUrl || ''}\n\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。`;
}

export function paintClients() {
  const box = $('#client-cards');
  const detail = $('#client-detail');
  if (!box) return;
  const list = (state.status && state.status.clients) || [];
  box.innerHTML = list.map((c) => {
    const plus = c.needsPlus ? '<span class="badge warn">要 Plus</span>' : '<span class="badge ok">无需 Plus</span>';
    const on = c.id === state.selectedClient ? ' on' : '';
    return `<button type="button" class="client-card${on}" data-client="${escapeHtml(c.id)}">
      <strong>${escapeHtml(c.name)}${plus}</strong>
      <p>${escapeHtml(c.summary)}</p>
    </button>`;
  }).join('');
  box.querySelectorAll('[data-client]').forEach((b) => {
    b.onclick = () => {
      state.selectedClient = b.dataset.client;
      ui.paintClients();
    };
  });
  const c = ui.selectedClientInfo();
  if (detail && c) {
    detail.innerHTML = `<ol>${(c.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`;
  }
  const pair = state.status && state.status.pairing;
  const line = $('#pairing-line');
  if (line) {
    if (pair && pair.code && state.status.bridgeRunning) {
      line.textContent = `OAuth 配对码 ${pair.code}（约 ${pair.expiresInSec}s 有效，仅 ChatGPT Plus 连接器需要）`;
    } else {
      line.textContent = '配对码会在启动 Bridge 后出现，只给 ChatGPT Plus 连接器 OAuth 用。';
    }
  }
}

export function renderBrowser(tab) {
  $('#br-url').value = tab.url || '';
  const page = $('#browser-page');
  const prompt = ui.promptText();
  if (tab.site === 'arena') {
    page.innerHTML = `<div class="arena">
      <div class="arena-top"><span>✶ Agent Mode ▾</span><span></span></div>
      <h1>What would you like to do?</h1>
      <div class="arena-card">
        <textarea id="arena-input">${escapeHtml(prompt)}</textarea>
        <div class="arena-tools">
          <span>Add files ▾</span>
          <button type="button" class="arena-send" id="arena-send">→</button>
        </div>
      </div>
      <div class="arena-gh"><span>Connect your GitHub <small style="color:#3b6fd4">NEW</small></span><button type="button">Connect</button></div>
    </div>`;
    $('#arena-send').onclick = () => ui.arenaConnect($('#arena-input').value);
  } else if (tab.site === 'chatgpt') {
    page.innerHTML = `<div class="gpt">
      <div class="gpt-top">ChatGPT</div>
      <h1>有什么可以帮忙的？</h1>
      <div class="gpt-card">
        <textarea id="gpt-input">${escapeHtml(prompt)}</textarea>
        <div style="display:flex"><button type="button" class="gpt-send" id="gpt-send">↑</button></div>
      </div>
    </div>`;
    $('#gpt-send').onclick = () => ui.arenaConnect($('#gpt-input').value);
  } else if (tab.site === 'deepseek') {
    const mcp = (state.status && state.status.mcpUrl) || prompt || '';
    const store = 'https://chromewebstore.google.com/detail/deepseek++/kdmpkkahkhdmdhfkdihkopikgcocbpbf';
    page.innerHTML = `<div class="generic-site">
      <h2>DeepSeek 网页要用 DeepSeek++ 当手</h2>
      <p>chat.deepseek.com 自己调不了 MCP。工作台内置浏览器也跑不了扩展。请用本机 <strong>Chrome 或 Edge</strong> 装 DeepSeek++，把下面这一行填进扩展侧边栏 MCP（传输选 Streamable HTTP）。</p>
      <p>扩展不是 DeepSeek 官方产品。改磁盘走本机 agent-host，<strong>不要</strong>再装 <code>deepseek-pp-shell-host</code>。</p>
      <p><a href="${escapeHtml(store)}" target="_blank" rel="noopener">Chrome 网上应用店安装 DeepSeek++</a>
        · <a href="https://chat.deepseek.com/" target="_blank" rel="noopener">在本机浏览器打开 chat.deepseek.com</a></p>
      <p class="hint">MCP 地址（带密钥，只填进扩展，不要发到公开地方）：</p>
      <div class="prompt-box">${escapeHtml(mcp)}</div>
    </div>`;
  } else {
    page.innerHTML = `<div class="generic-site">
      <h2>在 Web Agent 内置浏览器中打开 ${escapeHtml(tab.title)}</h2>
      <p>官方站点若禁止被嵌入，会在此展示已复制的第一句提示词。把它整段贴进新对话发出去。</p>
      <p><a href="${escapeHtml(tab.url)}" target="_blank" rel="noopener">${escapeHtml(tab.url)}</a></p>
      <div class="prompt-box">${escapeHtml(prompt)}</div>
    </div>`;
  }
}

export async function arenaConnect(text) {
  ui.setRight('bridge');
  $('#sess-dot').classList.add('on');
  $('#sess-note').textContent = 'MCP session connected from the built-in browser.';
  ui.toast('已用提示词连接本机 MCP');
  try {
    const secret = state.status && state.status.secretKey;
    await fetch(`/mcp/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'Arena' } } })
    });
    await fetch(`/mcp/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
    });
    await fetch(`/mcp/${secret}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'webagent://instructions' } })
    });
    ui.logBridgeTool({ name: 'tools/list', ok: true, result: { tools: (state.status.tools || []).map((t) => t.name) } });
    ui.logBridgeTool({ name: 'resources/read', ok: true, result: { uri: 'webagent://instructions' } });
  } catch (e) { ui.toast(e.message); }
  const extra = (text || '').replace(ui.promptText(), '').trim();
  const task = extra || '搜相关文件、读源码、必要时打补丁，再跑测试';
  ui.setAgentMode('code');
  ui.sendChat(task, { stayOnBridge: true });
}

export async function openSite(key) {
  const site = SITES[key];
  if (!site) return;
  if (!(state.status && state.status.bridgeRunning)) {
    await ui.startBridge();
  }
  try { await navigator.clipboard.writeText(ui.promptText()); } catch (_) {}
  $('#mcp-banner').classList.remove('hidden');
  const id = 'browser:' + key;
  let tab = state.tabs.find((t) => t.id === id);
  if (!tab) {
    tab = { id, title: site.name, kind: 'browser', site: key, url: site.url };
    state.tabs.push(tab);
  }
  ui.closeModal();
  ui.setRight('bridge');
  ui.activateTab(id);
  ui.toast(`在 Web Agent 内置浏览器中打开 ${site.url.replace(/^https?:\/\//, '')}`);
}

export async function startBridge() {
  const provider = ($('input[name="tunnel"]:checked') || {}).value || 'cloudflare';
  const res = await fetch('/api/bridge/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tunnelProvider: provider })
  });
  const data = await res.json();
  if (!data.success) { ui.toast(data.error || '无法启动'); return false; }
  if (data.note) ui.toast(data.note.slice(0, 180));
  await ui.refreshStatus();
  $('#mcp-banner').classList.remove('hidden');
  try { await navigator.clipboard.writeText(state.status.mcpUrl); } catch (_) {}
  ui.setRight('bridge');
  $('#sess-dot').classList.add('on');
  return true;
}

export async function stopBridge() {
  await fetch('/api/bridge/stop', { method: 'POST' });
  await ui.refreshStatus();
  $('#sess-dot').classList.remove('on');
}

export function paintBridge() {
  const s = state.status || {};
  const running = !!s.bridgeRunning;
  $('#bridge-pill').textContent = running ? '运行中' : '已停止';
  $('#bridge-pill').className = 'status-pill ' + (running ? 'run' : 'stop');
  $('#btn-bridge-toggle').textContent = running ? '停止 Bridge' : '启动 Bridge';
  $('#mcp-block').classList.toggle('hidden', !running);
  $('#mcp-url').textContent = s.mcpUrl || '—';
  $('#bridge-sub').textContent = running
    ? `远程端点已开启 · ${state.stats.calls} 个活动请求`
    : '启动 Bridge 后将自动生成 Cloudflare 临时 MCP 地址。';
  $('#sb-bridge').textContent = running ? 'Bridge 运行中' : 'Bridge 已停止';
  $('#install-id').textContent = s.installId || '—';
  ui.paintClients();
  const tun = s.tunnel || {};
  $('#conn-label').textContent = running
    ? (tun.url
      ? `Cloudflare Quick Tunnel 已就绪 · ${String(tun.url).replace(/^https?:\/\//, '')}`
      : '未找到 cloudflared 时，MCP 走当前页面源（仅本预览可用）')
    : '正在检查隧道设置…';
  $('#conn-pill').textContent = running ? '已就绪' : '检查中';
  $('#conn-pill').className = 'status-pill ' + (running ? 'ok' : '');
  const acct = s.bridgeAccount || {};
  if (typeof acct.loggedIn === 'boolean') state.loggedIn = acct.loggedIn;
  if (acct.provider === 'github' && acct.username) {
    $('#acct-label').textContent = 'GitHub @' + String(acct.username).replace(/^@/, '');
    $('#acct-pill').textContent = 'GitHub';
    $('#acct-pill').className = 'status-pill ok';
  } else if (state.loggedIn) {
    $('#acct-label').textContent = '本机演示授权（不是 GitHub 登录）';
    $('#acct-pill').textContent = '演示';
    $('#acct-pill').className = 'status-pill ok';
  } else {
    $('#acct-label').textContent = '尚未完成本机演示授权';
    $('#acct-pill').textContent = '未授权';
    $('#acct-pill').className = 'status-pill stop';
  }
  const gh = s.githubAuth || {};
  if ($('#btn-gh-device')) $('#btn-gh-device').disabled = !gh.deviceAvailable;
  if ($('#gh-device-hint') && !gh.deviceAvailable) {
    $('#gh-device-hint').textContent = '未设置 WEBAGENT_GITHUB_CLIENT_ID 时设备码不可用，请用令牌。';
  }
  if ($('#usage-line') && s.usage) {
    const u = s.usage;
    const rate = u.successRate == null ? '—' : (u.successRate + '%');
    $('#usage-line').textContent = `今日 Bridge 工具调用 ${u.toolCalls || 0}，成功率 ${rate}`
      + (u.telemetryConfigured ? '（已配置上报）' : '（未配置 WEBAGENT_TELEMETRY_URL，不上报）');
  }
  const sess = s.mcpSession;
  if (sess && sess.latest) {
    $('#sess-note').textContent = sess.alive
      ? `MCP client ${sess.latest.key} · ${sess.latest.calls} calls · last seen ${sess.ageMs}ms ago`
      : 'Last MCP client went quiet (>10s). Call ping or retry initialize.';
  } else {
    $('#sess-note').textContent = running
      ? 'Bridge is running and waiting for the external MCP client.'
      : 'Start the Bridge here, then connect the configured MCP URL from the external client.';
  }
}

export async function refreshStatus() {
  const res = await fetch('/api/status');
  state.status = await res.json();
  ui.paintBridge();
  const sel = $('#model-select');
  const cur = sel.value;
  sel.innerHTML = (state.status.models || []).map((m) =>
    `<option value="${escapeHtml(m.id)}" ${m.id === state.status.activeModelId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
  ).join('');
  if (cur) sel.value = cur;
  if (state.status.planRound) state.planRound = state.status.planRound;
  if (ui.paintPlanComposer) ui.paintPlanComposer();
  const think = $('#think-select');
  const mm = state.status.multiModel || {};
  if (think && mm.thinkLevel && !think.dataset.touched) think.value = mm.thinkLevel;
  ui.paintProviderTable();
  if (state.status && state.status.taskState) ui.paintTodos(state.status.taskState.todos || []);
}

ui.logBridgeTool = logBridgeTool;
ui.paintStats = paintStats;
ui.resetRound = resetRound;
ui.selectedClientInfo = selectedClientInfo;
ui.promptText = promptText;
ui.paintClients = paintClients;
ui.renderBrowser = renderBrowser;
ui.arenaConnect = arenaConnect;
ui.openSite = openSite;
ui.startBridge = startBridge;
ui.stopBridge = stopBridge;
ui.paintBridge = paintBridge;
ui.refreshStatus = refreshStatus;
