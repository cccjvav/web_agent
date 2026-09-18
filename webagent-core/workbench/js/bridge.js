import { $, $$, state, SITES, ui } from './state.js';
import { escapeHtml } from './dom.js';

function formatClock(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

let activityPending = null;
let activityVersion = '';
let activityInfo = null;

export function logBridgeTool() {
  return refreshBridgeActivity();
}

export function paintBridgeActivity(snapshot) {
  if (!snapshot || typeof snapshot.epoch !== 'string' || !Number.isSafeInteger(snapshot.revision) || !snapshot.stats || !Array.isArray(snapshot.logs)
    || !Number.isSafeInteger(snapshot.stats.calls) || snapshot.stats.calls < 0
    || !Number.isSafeInteger(snapshot.stats.fail) || snapshot.stats.fail < 0 || snapshot.stats.fail > snapshot.stats.calls
    || !Number.isFinite(snapshot.stats.totalMs) || snapshot.stats.totalMs < 0) throw new Error('Invalid activity snapshot');
  if ($('#bridge-host') && snapshot.identity) $('#bridge-host').textContent = `${snapshot.identity.hostInstanceId} · ${snapshot.identity.workspaceRoot} · v${snapshot.identity.version}`;
  if ($('#btn-operations')) $('#btn-operations').textContent = `工具接入与审批（待批 ${snapshot.pendingApprovals || 0}）`;
  if (ui.paintBridgeTasks) ui.paintBridgeTasks(snapshot.taskStates);
  const version = `${snapshot.epoch}:${snapshot.revision}`;
  if (version === activityVersion) return;
  activityInfo = { identity: snapshot.identity, resetAt: snapshot.resetAt, resetReason: snapshot.resetReason };
  state.stats = { ...snapshot.stats };
  ui.paintStats();
  const log = $('#bridge-log');
  const entries = Array.isArray(snapshot.executions) ? snapshot.executions : snapshot.logs;
  if (log) log.innerHTML = entries.slice().reverse().map(record =>
    `<div class="tool-card${record.status === 'failed' || record.success === false ? ' fail' : ''}"><header><span>${escapeHtml(record.tool)}</span>`
    + `<span class="dur">${escapeHtml(record.status || (record.success ? 'succeeded' : 'failed'))} · ${escapeHtml(String(record.durationMs ?? '—'))} ms</span></header>`
    + `<div class="tiny trace-detail">${escapeHtml(record.callId || '')}<br>任务 ${escapeHtml(record.taskId || '—')} · 会话 ${escapeHtml(record.sessionId || '—')}<br>核验 ${escapeHtml(record.verification || 'not-applicable')}${record.execId ? ` · 命令 ${escapeHtml(record.execId)}` : ''}</div></div>`
  ).join('');
  if (log) log.scrollTop = log.scrollHeight;
  const wait = $('#bridge-wait');
  if (wait) wait.classList.toggle('hidden', snapshot.stats.calls > 0);
  const note = $('#sess-note');
  if (note) note.textContent = `本轮已完成 ${snapshot.stats.calls} 次 MCP 工具调用；显示最近 ${snapshot.logs.length} 条。刷新页面不清零；重启主机或清除本轮会重置。不是实时连接证明。`;
  activityVersion = version; // Only mark rendered after all UI updates succeed.
}

export function refreshBridgeActivity() {
  if (activityPending) return activityPending;
  activityPending = Promise.resolve().then(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/bridge/activity', { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      paintBridgeActivity(await response.json());
      return true;
    } catch (_) {
      activityVersion = '';
      if ($('#bridge-task-count')) $('#bridge-task-count').textContent = '任务同步失败，当前状态未知';
      const note = $('#sess-note');
      if (note) note.textContent = '工具统计同步失败：请确认已重启更新后的本机服务，且 MCP 与工作台属于同一个主机进程/工作区。';
      return false;
    } finally { clearTimeout(timer); activityPending = null; }
  });
  return activityPending;
}

export function paintStats() {
  const s = state.stats;
  if (!activityInfo) {
    for (const id of ['#stat-calls', '#stat-fail', '#stat-ok', '#stat-avg']) if ($(id)) $(id).textContent = '—';
    if ($('#bridge-sub') && state.status?.bridgeRunning) $('#bridge-sub').textContent = '远程端点已开启 · 工具统计尚未同步';
    return;
  }
  if ($('#bridge-sub') && state.status?.bridgeRunning) $('#bridge-sub').textContent = `远程端点已开启 · 本轮完成 ${s.calls} 次工具调用（非活动请求数）`;
  const identity = activityInfo.identity;
  if ($('#activity-origin')) $('#activity-origin').textContent = `主机 ${identity?.hostInstanceId || '未知'} · 启动 ${identity?.startedAt || '未知'} · 本轮起点 ${activityInfo.resetAt || '未知'}（${activityInfo.resetReason === 'operator-cleared' ? '操作者清除本轮' : '主机启动'}）`;
  if ($('#stat-calls')) $('#stat-calls').textContent = String(s.calls);
  if ($('#stat-fail')) $('#stat-fail').textContent = String(s.fail);
  const rate = s.calls ? (1 - s.fail / s.calls) * 100 : 100;
  if ($('#stat-ok')) $('#stat-ok').textContent = rate.toFixed(1) + '%';
  const avgMs = s.calls ? s.totalMs / s.calls : 0;
  if ($('#stat-avg')) $('#stat-avg').textContent = (avgMs / 1000).toFixed(1) + ' s';
  if ($('#sess-meta') && s.healthLine) {
    $('#sess-meta').textContent = s.healthLine;
    return;
  }
  const sess = state.status && state.status.mcpSession;
  const active = sess
    ? (sess.httpSessions || (sess.alive ? 1 : 0) || sess.clients || 0)
    : (s.calls ? 1 : 0);
  const parts = ['Streamable HTTP', `${active} sessions (≤24h)`];
  if (s.lastTool) {
    parts.push(`Last tool: ${s.lastTool}`);
    const clock = formatClock(s.lastToolAt);
    if (clock) parts.push(clock);
  }
  if ($('#sess-meta')) $('#sess-meta').textContent = parts.join(' · ');
}

let resetRoundPending = false;
export async function resetRound() {
  if (resetRoundPending) return false;
  resetRoundPending = true;
  try {
    const response = await fetch('/api/bridge/reset-round', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data || data.success !== true) throw new Error(data && data.error || `HTTP ${response.status}`);
    let refreshed = true;
    try {
      if (await ui.refreshStatus() === false) refreshed = false;
      if (activityPending) await activityPending;
      if (await refreshBridgeActivity() === false) refreshed = false;
    } catch (_) { refreshed = false; }
    ui.toast(refreshed ? '已清除本轮 MCP 统计' : '本轮统计清除已确认，但状态刷新失败；请手动核对');
    return true;
  } catch (_) {
    ui.toast('清除结果未确认，请检查本机服务；未假装清零，也未自动重试。');
    return false;
  } finally {
    resetRoundPending = false;
  }
}

export function selectedClientInfo() {
  const list = (state.status && state.status.clients) || [];
  return list.find((c) => c.id === state.selectedClient) || list.find((c) => c.id === 'arena') || null;
}

export function promptText() {
  const s = state.status || {};
  const c = ui.selectedClientInfo();
  if (c) return c.prompt || '';
  return s.prompt || `${s.mcpUrl || ''}\n\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。`;
}

export function paintClients() {
  const box = $('#client-cards');
  const detail = $('#client-detail');
  if (!box) return;
  const list = (state.status && state.status.clients) || [];
  box.innerHTML = list.map((c) => {
    const plus = c.needsPlus === true ? '<span class="badge warn">要 Plus</span>' : c.needsPlus === false ? '<span class="badge ok">无需 Plus</span>' : '<span class="badge warn">订阅条件待核对</span>';
    const verification = c.verification === 'unverified' ? '<span class="badge warn">兼容性未验证</span>' : '';
    const on = c.id === state.selectedClient ? ' on' : '';
    return `<button type="button" class="client-card${on}" data-client="${escapeHtml(c.id)}">
      <strong>${escapeHtml(c.name)}${plus}${verification}</strong>
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
  const copyRules = $('#btn-copy-rules');
  if (copyRules) {
    copyRules.classList.toggle('hidden', !(c && c.connectMode === 'extension-http' && c.rulesText));
  }
  const pair = state.status && state.status.pairing;
  const line = $('#pairing-line');
  if (line) {
    if (pair && pair.code && state.status.bridgeRunning) {
      line.textContent = `OAuth 配对码 ${pair.code}（约 ${pair.expiresInSec}s 有效，供兼容OAuth客户端授权使用）`;
    } else {
      line.textContent = '配对码会在启动 Bridge 后出现，供兼容OAuth客户端授权使用。';
    }
  }
}

export function renderBrowser(tab) {
  $('#br-url').value = tab.url || '';
  const page = $('#browser-page');
  const prompt = ui.promptText();
  if (tab.site === 'deepseek') {
    const mcp = (state.status && state.status.mcpUrl) || prompt || '';
    page.innerHTML = `<div class="generic-site">
      <h2>DeepSeek 第三方扩展候选 · 兼容性未验证</h2>
      <p>这里不会嵌入网站或安装扩展。先核对实际版本、来源、许可证、订阅和权限；没有经过验证的固定商店ID或安装命令。</p>
      <p>是否需要隧道取决于扩展本机请求还是云端请求。确认支持Streamable HTTP及实际认证后，再配置地址；不要关闭鉴权或额外安装Shell Native Host。</p>
      <p><a href="https://github.com/zhu1090093659/deepseek-pp" target="_blank" rel="noopener noreferrer">历史参考来源（非安装保证）</a>
        · <a href="https://chat.deepseek.com/" target="_blank" rel="noopener noreferrer">在浏览器打开网站</a></p>
      <p>先认证、列工具，再只读核对workspace_info和已知文件；复制规则不建立连接或扩大授权。详见产品docs/guides/网页DeepSeek使用指南.md。</p>
      <p class="hint">MCP 地址（带密钥，只填进扩展，不要发到公开地方）：</p>
      <div class="prompt-box">${escapeHtml(mcp)}</div>
    </div>`;
  } else {
    let externalUrl = '';
    try {
      const parsed = new URL(tab.url);
      if (['https:', 'http:'].includes(parsed.protocol)) externalUrl = parsed.href;
    } catch (_) { /* Invalid addresses are not made clickable. */ }
    page.innerHTML = `<div class="generic-site">
      <h2>${escapeHtml(tab.title)} · 外部客户端连接指引</h2>
      <p>这里不会嵌入网站、代你登录或发送任务。请在真实客户端配置 MCP；若只用本机 Chat，不需要此步骤。</p>
      <p>${externalUrl ? `<a href="${escapeHtml(externalUrl)}" target="_blank" rel="noopener noreferrer">在浏览器打开 ${escapeHtml(tab.title)}</a>` : '地址无效，仅支持 HTTP/HTTPS'}</p>
      <div class="prompt-box">${escapeHtml(prompt)}</div>
    </div>`;
  }
}

export async function arenaConnect() {
  // This built-in page is guidance, not an external Arena session or an agent runner.
  ui.setRight('bridge');
  $('#sess-dot').classList.remove('on');
  $('#sess-note').textContent = '此处仅为连接指引，尚未建立外部MCP会话。请在真实Arena客户端配置Bridge的MCP地址。';
  ui.toast('请到真实Arena客户端连接；此操作不会启动本机Code任务。');
}

export async function openSite(key) {
  const site = SITES[key];
  if (!site) return;
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
  ui.toast(`已打开 ${site.name} 连接指引，尚未建立外部会话`);
}

let bridgeAction = 0, bridgeStartTicket = 0, bridgeStopTicket = 0;

export function bridgeStartPending() { return Boolean(bridgeStartTicket); }

function paintBridgeAction() {
  const toggle = $('#btn-bridge-toggle'), stop = $('#btn-stop-bridge-rb');
  if (toggle) {
    toggle.disabled = Boolean(bridgeStopTicket);
    toggle.textContent = bridgeStopTicket ? '正在请求停止…' : bridgeStartTicket ? '停止启动' : state.status?.bridgeRunning ? '停止 Bridge' : '启动 Bridge';
  }
  if (stop) stop.disabled = Boolean(bridgeStopTicket);
  if (bridgeStartTicket || bridgeStopTicket) $('#mcp-banner')?.classList.add('hidden');
}

function bridgeOutcome(message) {
  for (const id of ['#bridge-result', '#bridge-result-rb']) if ($(id)) $(id).textContent = message;
}

async function bridgeRequest(path, body, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {cache:'no-store', signal:controller.signal,
      ...(body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {})});
    const data = await response.json();
    if (controller.signal.aborted) throw new Error('deadline');
    return {response, data};
  } finally { clearTimeout(timer); }
}

export async function startBridge() {
  if (bridgeStartTicket || bridgeStopTicket) return false;
  const ticket = ++bridgeAction; bridgeStartTicket = ticket;
  const expected = {workspaceRoot:state.status?.workspaceRoot, hostInstanceId:state.status?.identity?.hostInstanceId};
  // Capture provider AND credentials before the preflight await; never mix drafts.
  const provider = ($('input[name="tunnel"]:checked') || {}).value || 'cloudflare';
  const body = {tunnelProvider:provider, ...expected};
  if (provider === 'cloudflare-named' || provider === 'named') {
    body.namedDomain = $('#named-domain')?.value || ''; body.namedToken = $('#named-token')?.value || '';
  }
  if (provider === 'ngrok') {
    body.ngrokDomain = $('#ngrok-domain')?.value || ''; body.ngrokToken = $('#ngrok-token')?.value || '';
  }
  let sent = false;
  paintBridgeAction();
  bridgeOutcome('正在核对启动目标；可点击停止启动。');
  try {
    if (!expected.workspaceRoot || !expected.hostInstanceId) throw new Error('binding');
    const current = await bridgeRequest('/api/status');
    if (ticket !== bridgeAction) return false;
    if (!current.response.ok || !isStatusSnapshot(current.data) || current.data.bridgeRunning !== false || !sameSecretBinding(current.data, expected)
      || !sameSecretBinding(state.status, expected)) throw new Error('binding');
    sent = true;
    bridgeOutcome('启动请求已发送，等待主机确认；停止仍可用。');
    const {response, data} = await bridgeRequest('/api/bridge/start', body, 45000);
    if (ticket !== bridgeAction) return false;
    if (!response.ok || data?.success !== true || data.running !== true || data.provider !== provider
      || !validRotatedSecret(data, '')) throw new Error('unconfirmed');
    state.stats.healthLine = '';
    bridgeOutcome('原主机已确认启动；正在核对当前状态。');
    try {
      if (!sameSecretBinding(state.status, expected)) throw new Error('binding');
      const refreshed = await ui.refreshStatus();
      if (ticket !== bridgeAction) return true;
      if (refreshed === false || !sameSecretBinding(state.status, expected) || state.status.bridgeRunning !== true
        || state.status.mcpUrl !== data.mcpUrl || state.status.secretKey !== data.secretKey) throw new Error('read');
      $('#sess-dot').classList.add('on');
      ui.setRight('bridge');
      bridgeOutcome('启动已确认，当前地址已核对；请按需手动复制。隧道开启不代表第三方已连接。');
    } catch (_) {
      if (ticket === bridgeAction) bridgeOutcome('原主机启动已确认，但当前状态或地址未核对；请重新读取状态，不要再次启动。');
    }
    return true;
  } catch (_) {
    if (ticket === bridgeAction) {
      bridgeOutcome(sent ? '启动结果未确认，可能已生效；请读取状态或显式停止。没有自动重试或复制地址。'
        : '主机、工作区或停止状态未确认，未发送启动；请刷新并核对工作区。');
      if (sent && sameSecretBinding(state.status, expected)) { try { await ui.refreshStatus(); } catch (_) {} }
    }
    return false;
  } finally {
    if (bridgeStartTicket === ticket) bridgeStartTicket = 0;
    paintBridgeAction();
  }
}
ui.bridgeStartPending = bridgeStartPending;

let secretRotating = false;

async function secretRequest(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (controller.signal.aborted || !response.ok || !data || data.success === false) throw new Error('unconfirmed');
    return data;
  } finally { clearTimeout(timer); }
}

function sameSecretBinding(snapshot, expected) {
  return snapshot?.workspaceRoot === expected.workspaceRoot
    && snapshot?.identity?.hostInstanceId === expected.hostInstanceId;
}

function validRotatedSecret(data, oldSecret) {
  if (data?.success !== true || typeof data.secretKey !== 'string'
    || !/^[a-f0-9]{24}$/.test(data.secretKey) || data.secretKey === oldSecret
    || data.mcpPath !== '/mcp/' + data.secretKey) return false;
  try {
    const url = new URL(data.mcpUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === data.mcpPath && data.mcpCanonicalUrl === url.origin + '/mcp';
  } catch (_) { return false; }
}

export async function resetSecret() {
  if (secretRotating) return false;
  secretRotating = true;
  const button = $('#btn-reset-secret');
  const result = $('#secret-result');
  if (button) button.disabled = true;
  const expected = { workspaceRoot: state.status?.workspaceRoot,
    hostInstanceId: state.status?.identity?.hostInstanceId, expectedSecret: state.status?.secretKey };
  let sent = false;
  try {
    if (!expected.workspaceRoot || !expected.hostInstanceId || !/^[a-f0-9]{24}$/.test(expected.expectedSecret || '')) throw new Error('binding');
    result.textContent = '正在核对当前主机与连接密钥；尚未发送轮换。';
    const current = await secretRequest('/api/status');
    if (!isStatusSnapshot(current) || !sameSecretBinding(current, expected) || current.secretKey !== expected.expectedSecret
      || !sameSecretBinding(state.status, expected) || state.status.secretKey !== expected.expectedSecret) throw new Error('binding');
    if (!window.confirm('确认重置 MCP 地址？旧密钥及 OAuth 授权将失效，但不会停止已接受的任务或隧道。结果丢失时不要再次重置，应先读取状态。')) {
      result.textContent = '已取消，未发送密钥轮换。'; return false;
    }
    if (!sameSecretBinding(state.status, expected) || state.status.secretKey !== expected.expectedSecret) throw new Error('binding');
    sent = true;
    result.textContent = '密钥轮换已发送，等待确认；不要重复重置。';
    const data = await secretRequest('/api/bridge/reset-secret', expected);
    if (!validRotatedSecret(data, expected.expectedSecret)) throw new Error('contract');
    // A confirmed write and a subsequent failed read are different outcomes.
    result.textContent = '原主机已确认密钥轮换；正在重新读取当前地址。';
    try {
      if (!sameSecretBinding(state.status, expected)) throw new Error('binding');
      const refreshed = await ui.refreshStatus();
      if (refreshed === false || !sameSecretBinding(state.status, expected) || state.status.secretKey !== data.secretKey) throw new Error('read');
      result.textContent = '密钥轮换已确认，当前地址已重新读取；旧凭据不再接受新请求，已有任务未被自动停止。';
    } catch (_) {
      result.textContent = '原主机密钥轮换已确认，但当前地址或主机未核对；请重新读取状态，不要再次重置。';
    }
    return true;
  } catch (_) {
    result.textContent = sent
      ? '密钥轮换结果未确认，可能已生效；旧显示地址可能过期。请重新读取状态，不要重复重置；没有自动重试。'
      : '主机或密钥状态未确认，未发送轮换；请刷新页面并核对工作区。';
    return false;
  } finally {
    secretRotating = false;
    if (button) button.disabled = false;
  }
}
ui.resetSecret = resetSecret;

export async function stopBridge() {
  if (bridgeStopTicket) return false;
  const ticket = ++bridgeAction; bridgeStopTicket = ticket;
  // Supersede the local start, including a preflight which has not sent a POST.
  // This does not recall an already transmitted request or prove process exit.
  bridgeStartTicket = 0;
  const expected = {workspaceRoot:state.status?.workspaceRoot, hostInstanceId:state.status?.identity?.hostInstanceId};
  let sent = false;
  paintBridgeAction();
  bridgeOutcome('正在请求停止；不会自动取消已接受的工具任务。');
  try {
    if (!expected.workspaceRoot || !expected.hostInstanceId) throw new Error('binding');
    sent = true;
    const {response, data} = await bridgeRequest('/api/bridge/stop', expected, 15000);
    if (!response.ok || data?.success !== true || data.running !== false) throw new Error('unconfirmed');
    state.stats.healthLine = '';
    bridgeOutcome('原主机已确认停止；正在核对当前状态。');
    try {
      if (!sameSecretBinding(state.status, expected)) throw new Error('binding');
      const refreshed = await ui.refreshStatus();
      if (refreshed === false || !sameSecretBinding(state.status, expected) || state.status.bridgeRunning !== false) throw new Error('read');
      $('#sess-dot').classList.remove('on');
      bridgeOutcome('停止已确认，当前状态已核对；已接受的任务未被自动取消，其他启动仍可能改变状态。');
    } catch (_) {
      bridgeOutcome('原主机停止已确认，但当前状态未核对；请重新读取状态，不要将此当作所有进程已退出。');
    }
    return true;
  } catch (_) {
    bridgeOutcome(sent ? '停止结果未确认；请读取状态并核对隧道进程。请求失败不证明未执行，没有自动重试。'
      : '主机或工作区未确认，未发送停止；请刷新并核对目标。');
    return false;
  } finally {
    bridgeStopTicket = 0;
    paintBridgeAction();
  }
}

export function paintBridge() {
  const s = state.status || {};
  const running = !!s.bridgeRunning;
  $('#bridge-pill').textContent = running ? '运行中' : '已停止';
  $('#bridge-pill').className = 'status-pill ' + (running ? 'run' : 'stop');
  paintBridgeAction();
  $('#mcp-block').classList.toggle('hidden', !running);
  $('#mcp-url').textContent = s.mcpUrl || '—';
  $('#bridge-sub').textContent = running
    ? '远程端点已开启 · 工具统计尚未同步'
    : '启动 Bridge 后：Quick Tunnel 给临时 trycloudflare 地址；Named Tunnel / ngrok 用你填的主机名。';
  $('#sb-bridge').textContent = running ? 'Bridge 运行中' : 'Bridge 已停止';
  $('#install-id').textContent = s.installId || '—';
  const nd = $('#named-domain');
  if (nd && s.namedDomain && !nd.value) nd.value = s.namedDomain;
  const ngd = $('#ngrok-domain');
  if (ngd && s.ngrokDomain && !ngd.value) ngd.value = s.ngrokDomain;
  const radios = $$('input[name="tunnel"]');
  const tp = s.tunnelProvider === 'named' ? 'cloudflare-named' : s.tunnelProvider;
  if (radios && tp) radios.forEach((r) => { r.checked = r.value === tp; });
  ui.paintClients();
  const tun = s.tunnel || {};
  const host = tun.url ? String(tun.url).replace(/^https?:\/\//, '') : '';
  const urlText = String(tun.url || '');
  let kind = 'Cloudflare Quick Tunnel';
  if (tp === 'ngrok' || /\.ngrok/i.test(urlText)) kind = 'ngrok';
  else if (tp === 'cloudflare-named' || tp === 'named' || (urlText && !urlText.includes('trycloudflare.com'))) kind = 'Named Tunnel';
  $('#conn-label').textContent = running
    ? (tun.url
      ? `${kind} 已就绪 · ${host}`
      : '未找到隧道程序或隧道未就绪时，MCP 走当前页面源（仅本预览可用）')
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
  ui.paintStats();
}

export async function checkBridgeHealth() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    const health = await response.json().catch(() => ({}));
    if (!response.ok || health.ok !== true) throw new Error(`健康端点未确认（HTTP ${response.status || '错误'}）`);
    if (await ui.refreshStatus() === false) throw new Error('状态读取已被更新请求取代');
    const s = state.status || {};
    const bits = [];
    bits.push('工作台健康');
    bits.push(s.bridgeRunning ? 'Bridge 运行中' : 'Bridge 已停止');
    const tun = s.tunnel || {};
    if (tun.url) bits.push(String(tun.url).replace(/^https?:\/\//, ''));
    state.stats.healthLine = bits.join(' · ');
    ui.paintStats();
  } catch (e) {
    state.stats.healthLine = '健康检查失败：' + (e.message || e);
    ui.paintStats();
  }
}

let statusRequest = 0, statusController = null;

function isStatusSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.status !== 'online' || value.success === false
    || typeof value.bridgeRunning !== 'boolean' || typeof value.activeModelId !== 'string'
    || !Array.isArray(value.models)) return false;
  const ids = new Set();
  return value.models.every(model => {
    if (!model || typeof model !== 'object' || Array.isArray(model)
      || typeof model.id !== 'string' || !model.id || ids.has(model.id)
      || (model.name != null && typeof model.name !== 'string')
      || (model.caps != null && !Array.isArray(model.caps))) return false;
    ids.add(model.id);
    return true;
  });
}

export async function refreshStatus() {
  const ticket = ++statusRequest;
  if (statusController) statusController.abort();
  const controller = new AbortController(); statusController = controller;
  const timer = setTimeout(() => controller.abort(), 10000);
  let published = false;
  try {
    const res = await fetch('/api/status', { cache: 'no-store', signal: controller.signal });
    if (ticket !== statusRequest) return false;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snapshot = await res.json();
    // Abort alone is not an ordering guarantee, especially during body decoding.
    if (ticket !== statusRequest) return false;
    if (controller.signal.aborted) throw new Error('状态读取超时');
    if (!isStatusSnapshot(snapshot)) throw new Error('状态响应格式无效');
    state.status = snapshot;
    published = true;
    paintExecutionControl();
    ui.paintBridge();
    const sel = $('#model-select');
    sel.innerHTML = snapshot.models.map((m) =>
      `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.id)}</option>`
    ).join('');
    const active = snapshot.models.find(m => m.id === snapshot.activeModelId);
    // This select feeds Chat requests: never restore an obsolete local choice.
    sel.value = active ? active.id : '';
    const pb = $('#model-pick-btn');
    if (pb) pb.textContent = active ? (active.name || active.id) : '模型不可用 ▾';
    if (snapshot.planRound) state.planRound = snapshot.planRound;
    if (ui.paintPlanComposer) ui.paintPlanComposer();
    const think = $('#think-select');
    const mm = snapshot.multiModel || {};
    if (think && mm.thinkLevel && !think.dataset.touched) think.value = mm.thinkLevel;
    ui.paintProviderTable();
    if (snapshot.taskState) ui.paintTodos(snapshot.taskState.todos || []);
    return true;
  } catch (error) {
    if (ticket !== statusRequest) return false;
    if ($('#sb-bridge')) $('#sb-bridge').textContent = published
      ? '状态显示失败，请重新读取' : '状态同步失败（保留旧快照，请重新读取）';
    throw error;
  } finally {
    clearTimeout(timer);
    if (ticket === statusRequest) statusController = null;
  }
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
ui.checkBridgeHealth = checkBridgeHealth;
ui.refreshStatus = refreshStatus;

ui.refreshBridgeActivity = refreshBridgeActivity;
ui.paintBridgeActivity = paintBridgeActivity;

let currentDiagnostics = null;
export async function refreshDiagnostics() {
  currentDiagnostics = null;
  $('#host-comparison').textContent = '';
  try {
    const response = await fetch('/api/diagnostics', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const diagnostics = await response.json();
    if (!diagnostics || typeof diagnostics !== 'object' || !diagnostics.identity ||
        typeof diagnostics.identity.hostInstanceId !== 'string' || typeof diagnostics.identity.workspaceRoot !== 'string' ||
        !Array.isArray(diagnostics.capabilities) || diagnostics.capabilities.some(capability => !capability ||
          typeof capability.id !== 'string' || typeof capability.status !== 'string' || typeof capability.reason !== 'string')) {
      throw new Error('诊断响应格式无效');
    }
    currentDiagnostics = diagnostics;
    $('#diagnostic-identity').textContent = JSON.stringify(diagnostics.identity, null, 2);
    $('#diagnostic-capabilities').innerHTML = diagnostics.capabilities.map(capability =>
      `<article class="block"><strong>${escapeHtml(capability.id)} · ${escapeHtml(capability.status)}</strong><p>${escapeHtml(capability.reason)}</p></article>`
    ).join('');
  } catch (_) {
    $('#diagnostic-identity').textContent = '诊断读取失败；无法确认当前主机。';
    $('#diagnostic-capabilities').textContent = '';
  }
}
export function compareHost() {
  const expected = $('#expected-host').value.trim();
  $('#host-comparison').textContent = !currentDiagnostics ? '请先成功读取诊断。'
    : !/^[a-f0-9-]{36}$/i.test(expected) ? '请填写工具返回的主机UUID，不要填写凭据。'
      : expected === currentDiagnostics.identity.hostInstanceId ? '匹配：外部工具和此页面属于同一个主机进程。'
        : '不匹配：可能连接到另一实例，或主机已经重启。先停止修改任务并核对工作区。';
}
ui.refreshDiagnostics = refreshDiagnostics;
ui.compareHost = compareHost;

let controlDirty = false, controlRevision = '', controlChangePending = false;
export function paintExecutionControl() {
  const current = state.status?.executionControl;
  if (!$('#execution-mode')) return;
  $('#execution-mode').textContent = current ? `主机模式：${current.mode}；Chat在途${current.active.chat}，Bridge在途${current.active.bridge}` : '主机尚未提供模式/权限，请更新后重启';
  if (!current || controlDirty) return;
  controlRevision = current.revision;
  for (const key of ['read','edit','execute','capture']) $('#access-' + key).checked = current.permissions[key];
}
export function initExecutionControl() {
  if (!$('#execution-save')) return;
  async function change(value) {
    if (controlChangePending) {
      $('#execution-result').textContent = '已有权限设置请求进行中；未重复发送。';
      return false;
    }
    controlChangePending = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/execution-control', {method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,workspaceRoot:state.status?.workspaceRoot,hostInstanceId:state.status?.identity?.hostInstanceId})});
      const data = await response.json();
      if (!response.ok || !data || data.success !== true) throw Error(data && data.error || '主机未确认设置');
      controlDirty = false;
      try {
        if (await ui.refreshStatus() === false) throw Error('读取被更新请求取代');
        $('#execution-result').textContent = '已由主机应用；没有自动取消或重放任务';
      } catch (_) {
        $('#execution-result').textContent = '主机已确认应用，但状态刷新失败；请手动核对，不要重复保存。';
      }
      return true;
    } catch(error) {
      $('#execution-result').textContent = ('设置结果未确认：' + (error.message || '请核对主机状态') + '；未自动重试。').slice(0, 220);
      return false;
    } finally {
      clearTimeout(timer);
      controlChangePending = false;
    }
  }
  $('#execution-chat').onclick = () => change({workMode:'chat'});
  $('#execution-bridge').onclick = () => change({workMode:'bridge'});
  $('#execution-save').onclick = () => change({revision:controlRevision,permissions:Object.fromEntries(['read','edit','execute','capture'].map(key => [key,$('#access-'+key).checked]))});
  $('#execution-refresh').onclick = () => {controlDirty=false;ui.refreshStatus().catch(error=>{$('#execution-result').textContent=error.message;});};
  for (const key of ['read','edit','execute','capture']) $('#access-'+key).onchange = () => {
    controlDirty=true;
    if (!$('#access-read').checked) $('#access-edit').checked=false;
    if (!$('#access-read').checked || !$('#access-edit').checked || !$('#access-capture').checked) {
      $('#access-execute').checked=false;
      $('#execution-result').textContent='Execute要求同时允许Read/Edit/Capture；未自动扩大权限。点击保存才生效。';
    }
  };
}
ui.initExecutionControl = initExecutionControl;
