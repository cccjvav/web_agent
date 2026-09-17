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
    } catch (_) {
      activityVersion = '';
      if ($('#bridge-task-count')) $('#bridge-task-count').textContent = '任务同步失败，当前状态未知';
      const note = $('#sess-note');
      if (note) note.textContent = '工具统计同步失败：请确认已重启更新后的本机服务，且 MCP 与工作台属于同一个主机进程/工作区。';
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

export async function resetRound() {
  try {
    const response = await fetch('/api/bridge/reset-round', { method: 'POST' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await ui.refreshStatus();
    if (activityPending) await activityPending;
    await refreshBridgeActivity();
    ui.toast('已清除本轮 MCP 统计');
  } catch (_) { ui.toast('清除失败，请检查本机服务；未假装清零。'); }
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

export async function startBridge() {
  try {
  const expected = state.status;
  const provider = ($('input[name="tunnel"]:checked') || {}).value || 'cloudflare';
  const statusResponse = await fetch('/api/status', {cache:'no-store'});
  const binding = await statusResponse.json();
  if (!statusResponse.ok || !binding.workspaceRoot || !binding.identity?.hostInstanceId || expected?.workspaceRoot !== binding.workspaceRoot || expected?.identity?.hostInstanceId !== binding.identity.hostInstanceId) {
    window.alert('工作区尚未确认或主机已变化，不能启动 Bridge。请使用项目文件夹启动主机后刷新页面并核对工作区。'); return false;
  }
  const body = { tunnelProvider: provider, workspaceRoot:binding.workspaceRoot, hostInstanceId:binding.identity.hostInstanceId };
  if (provider === 'cloudflare-named' || provider === 'named') {
    body.namedDomain = ($('#named-domain') && $('#named-domain').value) || '';
    body.namedToken = ($('#named-token') && $('#named-token').value) || '';
  }
  if (provider === 'ngrok') {
    body.ngrokDomain = ($('#ngrok-domain') && $('#ngrok-domain').value) || '';
    body.ngrokToken = ($('#ngrok-token') && $('#ngrok-token').value) || '';
  }
  const res = await fetch('/api/bridge/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const message = String(data.error || data.tunnelError || data.note || '无法启动 Bridge');
    if (res.status === 409) window.alert(message);
    else ui.toast(message.slice(0, 180));
    await ui.refreshStatus();
    return false;
  }
  if (data.note) ui.toast(data.note.slice(0, 180));
  state.stats.healthLine = '';
  await ui.refreshStatus();
  $('#mcp-banner').classList.remove('hidden');
  try { await navigator.clipboard.writeText(state.status.mcpUrl); } catch (_) {}
  ui.setRight('bridge');
  $('#sess-dot').classList.add('on');
  return true;
  } catch (error) { window.alert(error.message || 'Bridge 启动失败，请检查主机和工作区。'); return false; }
}

export async function stopBridge() {
  try {
    const response = await fetch('/api/bridge/stop', { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.success) {
      ui.toast(String(data.error || data.note || 'Bridge 停止失败，请核对隧道进程').slice(0, 180));
      return false;
    }
    state.stats.healthLine = '';
    await ui.refreshStatus();
    $('#sess-dot').classList.remove('on');
    return true;
  } catch (error) {
    window.alert(error.message || 'Bridge 停止状态未知，请核对主机和隧道进程');
    return false;
  }
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
    const h = await fetch('/health');
    const hj = await h.json().catch(() => ({}));
    await ui.refreshStatus();
    const s = state.status || {};
    const bits = [];
    bits.push(hj.ok ? '工作台健康' : '工作台无响应');
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

export async function refreshStatus() {
  const res = await fetch('/api/status');
  state.status = await res.json();
  paintExecutionControl();
  ui.paintBridge();
  const sel = $('#model-select');
  const cur = sel.value;
  sel.innerHTML = (state.status.models || []).map((m) =>
    `<option value="${escapeHtml(m.id)}" ${m.id === state.status.activeModelId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
  ).join('');
  if (cur) sel.value = cur;
  const pb = $('#model-pick-btn');
  if (pb) pb.textContent = ((state.status.models || []).find((m) => m.id === state.status.activeModelId) || {}).name || '模型 ▾';
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
ui.checkBridgeHealth = checkBridgeHealth;
ui.refreshStatus = refreshStatus;

ui.refreshBridgeActivity = refreshBridgeActivity;
ui.paintBridgeActivity = paintBridgeActivity;

let currentDiagnostics = null;
export async function refreshDiagnostics() {
  currentDiagnostics = null;
  $('#host-comparison').textContent = '';
  try {
    const response = await fetch('/api/diagnostics');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    currentDiagnostics = await response.json();
    $('#diagnostic-identity').textContent = JSON.stringify(currentDiagnostics.identity, null, 2);
    $('#diagnostic-capabilities').innerHTML = currentDiagnostics.capabilities.map(cap =>
      `<article class="block"><strong>${escapeHtml(cap.id)} · ${escapeHtml(cap.status)}</strong><p>${escapeHtml(cap.reason)}</p></article>`
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

let controlDirty = false, controlRevision = '';
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
    try {
      const response = await fetch('/api/execution-control', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...value,workspaceRoot:state.status?.workspaceRoot,hostInstanceId:state.status?.identity?.hostInstanceId})});
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.error || '设置失败');
      controlDirty = false;
      await ui.refreshStatus();
      $('#execution-result').textContent = '已由主机应用；没有自动取消或重放任务';
    } catch(error) { $('#execution-result').textContent = error.message; }
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
