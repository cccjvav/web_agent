const vscode = require('vscode');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { modeFromChatRequest } = require('./modeFromChatRequest');
const { sameWorkspace } = require('./workspaceMatch');
const { startPtyHost } = require('./ptyHost');
const { HostManager } = require('./hostManager');

let ptyHost = null;
let hostManager = null;

function dispatchPty(ev) {
  if (!ev || ev.type !== 'pty_request' || !ptyHost) return;
  if (typeof ptyHost.noteStream === 'function') ptyHost.noteStream();
  if (typeof ptyHost.handleIncoming === 'function') ptyHost.handleIncoming(ev);
}

// The host's /api answers only Host localhost/127.0.0.1/[::1] from a loopback socket (localControl.js), so no
// other URL can be a real Web Agent host. Refuse it before any request: this URL receives chat prompts, the
// workspace path (PTY hello) and hands out PTY command jobs, and a trusted workspace can set it (F71).
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
// A user/workspace value (not the package.json default) or the code-server launcher's env var
// means "connect to this host": the extension then never spawns one.
function explicitHostUrl() {
  const cfg = vscode.workspace.getConfiguration('webagent');
  let value;
  if (typeof cfg.inspect === 'function') {
    const info = cfg.inspect('agentHostUrl') || {};
    value = info.workspaceFolderValue ?? info.workspaceValue ?? info.globalValue;
  } else value = cfg.get('agentHostUrl');
  return String(value || process.env.WEBAGENT_AGENT_HOST_URL || '').trim();
}
function agentHostUrl() {
  const managed = hostManager && hostManager.currentUrl();
  const raw = String(explicitHostUrl() || managed || 'http://127.0.0.1:48271').trim();
  let url = null;
  try { url = new URL(raw); } catch { /* reported below */ }
  if (!url || !['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /[?#]/.test(raw)) {
    throw new Error('webagent.agentHostUrl 只能是本机主机根地址（http(s)://127.0.0.1、localhost 或 [::1] 加端口），已拒绝连接：' + raw.slice(0, 200));
  }
  return url.origin;
}

// URL.hostname keeps IPv6 brackets ("[::1]") and http.request would look that up as a DNS name.
function requestHost(u) {
  return u.hostname.replace(/^\[(.*)\]$/, '$1');
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const limit = 8 * 1024 * 1024;
    let settled = false, response, deadline, bytes = 0;
    const chunks = [];
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      chunks.length = 0;
      if (error) {
        reject(error);
        response?.destroy();
        req.destroy();
      } else resolve(value);
    };
    const req = lib.request({
      hostname: requestHost(u), port: u.port, path: u.pathname + u.search,
      method, timeout: 15000,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
    }, (res) => {
      response = res;
      res.on('error', error => finish(error));
      res.on('aborted', () => finish(new Error('本机API响应中断，结果未确认；没有自动重试')));
      res.on('close', () => { if (!settled) finish(new Error('本机API响应提前关闭，结果未确认；没有自动重试')); });
      if (settled) { res.destroy(); return; }
      if (res.statusCode >= 300 && res.statusCode < 400) {
        finish(new Error('本机API返回重定向，结果未确认；没有自动跳转或重试')); return;
      }
      if (String(method).toUpperCase() !== 'HEAD' && Number(res.headers['content-length']) > limit) {
        finish(new Error('本机API响应超过8MiB上限，结果未确认；没有自动重试')); return;
      }
      res.on('data', chunk => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > limit) {
          finish(new Error('本机API响应超过8MiB上限，结果未确认；没有自动重试')); return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (settled) return;
        if (!res.complete) { finish(new Error('本机API响应不完整，结果未确认；没有自动重试')); return; }
        const raw = Buffer.concat(chunks, bytes).toString('utf8');
        let json = null;
        try { json = raw ? JSON.parse(raw) : null; } catch { /* Keep bounded raw for existing callers. */ }
        // HTTP/JSON business success remains the caller's responsibility, including 409.
        finish(null, { status: res.statusCode, json, raw });
      });
    });
    deadline = setTimeout(() => finish(new Error('本机API请求超过15秒，结果未确认；没有自动重试')), 15000);
    req.on('timeout', () => finish(new Error('本机API请求超时，结果未确认；没有自动重试')));
    req.on('error', error => finish(error));
    req.end(payload);
  });
}

function workspacePaths() {
  if (vscode.workspace.isTrusted === false) throw new Error('请先信任当前工作区，再启动 Bridge 或工作区任务。');
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length && folders[0].uri?.scheme !== 'file') throw new Error('请将本地项目文件夹作为首工作区，不能用虚拟或远程文件夹绑定本机主机。');
  const paths = folders.filter(folder => folder.uri?.scheme === 'file' && folder.uri.fsPath).map(folder => folder.uri.fsPath);
  if (!paths.length) throw new Error('未打开工作区，已阻止启动 Bridge/任务。请先通过 文件 → 打开文件夹 选择项目根目录。');
  return paths;
}
async function workspaceSnapshot() {
  const before = workspacePaths();
  const response = await requestJson('GET', `${agentHostUrl()}/api/status`);
  const status = response.json;
  if (response.status !== 200 || !status?.workspaceRoot || !status.identity?.hostInstanceId) throw new Error('主机未就绪，请启动对应项目的 agent-host。');
  const after = workspacePaths();
  const matches = folder => sameWorkspace(folder, status.workspaceRoot);
  if (!matches(before[0]) || !matches(after[0])) throw new Error(`工作区与主机不一致，已阻止操作。主机工作区：${status.workspaceRoot}。请将该文件夹作为首工作区（建议单独打开），或为目标项目重新启动主机。`);
  return { status, binding: { workspaceRoot: status.workspaceRoot, hostInstanceId: status.identity.hostInstanceId } };
}
async function workspaceBinding() { return (await workspaceSnapshot()).binding; }

const SECRET_PATTERN = /^[a-f0-9]{24}$/;

// A resolved request is not a rotated credential: require the host's own new-key contract.
function validRotationResult(result, oldSecret) {
  const data = result?.json;
  if (result?.status !== 200 || data?.success !== true || typeof data.secretKey !== 'string'
    || !SECRET_PATTERN.test(data.secretKey) || data.secretKey === oldSecret
    || data.mcpPath !== '/mcp/' + data.secretKey) return false;
  try {
    const url = new URL(data.mcpUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === data.mcpPath && data.mcpCanonicalUrl === url.origin + '/mcp';
  } catch { return false; }
}

// Rotation invalidates credentials and OAuth, so it is confirmed, bound, and never replayed blindly.
async function resetSecretCommand({ refresh } = {}) {
  let sent = false;
  try {
    const { status, binding } = await workspaceSnapshot();
    const oldSecret = status.secretKey;
    if (!SECRET_PATTERN.test(oldSecret || '')) throw new Error('当前密钥状态未知，请先刷新状态，再决定是否重置。');
    const choice = await vscode.window.showWarningMessage(
      '确认重置 MCP 地址？旧密钥与 OAuth 授权立即失效，已接受的任务不会自动停止。结果丢失时不要重复重置，先读取状态。',
      { modal: true }, '重置');
    if (choice !== '重置') { vscode.window.showInformationMessage('已取消，未发送密钥轮换。'); return false; }
    sent = true;
    let result;
    try {
      result = await requestJson('POST', `${agentHostUrl()}/api/bridge/reset-secret`, { ...binding, expectedSecret: oldSecret });
    } catch {
      throw new Error('密钥轮换结果未确认，可能已生效；请刷新状态，不要重复重置。');
    }
    // The host rejects binding/CAS mismatches before writing; anything else stays unknown.
    if (result.status === 409) throw new Error('轮换被主机拒绝：绑定或密钥已变化，未轮换；请刷新状态后重试。');
    if (!validRotationResult(result, oldSecret)) throw new Error('密钥轮换结果未确认，可能已生效；请刷新状态，不要重复重置。');
    // A confirmed write and a later failed read are different outcomes; never auto-retry.
    let verified = false;
    try {
      const after = await workspaceSnapshot();
      verified = after.status.secretKey === result.json.secretKey
        && after.binding.workspaceRoot === binding.workspaceRoot
        && after.binding.hostInstanceId === binding.hostInstanceId;
    } catch { verified = false; }
    if (refresh) { try { await refresh(); } catch { /* status view stays stale, rotation is already confirmed */ } }
    if (verified) {
      vscode.window.showInformationMessage('Web Agent: MCP 地址已重置并核对，旧链接立即失效；请手动复制新地址。');
    } else {
      vscode.window.showWarningMessage('Web Agent: 原主机已确认轮换，但当前地址未核对；请刷新状态，不要重复重置。');
    }
    return true;
  } catch (e) {
    const message = sent ? e.message : `未发送密钥轮换：${e.message}`;
    if (sent) vscode.window.showWarningMessage(message, { modal: true });
    else vscode.window.showErrorMessage(message);
    return false;
  }
}

function postNdjson(url, body, onEvent, signal) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    let settled = false, response, deadline;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) {
        reject(error);
        response?.destroy();
        req.destroy();
      } else resolve();
    };
    const req = lib.request({
      hostname: requestHost(u), port: u.port, path: u.pathname + u.search,
      method: 'POST', signal, timeout: 300000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      response = res;
      res.on('error', finish);
      res.on('aborted', () => finish(new Error('对话连接中断，结果未确认；未自动重试')));
      res.on('close', () => { if (!settled) finish(new Error('对话连接关闭，结果未确认；未自动重试')); });
      if (settled) { res.destroy(); return; }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        finish(new Error('主机拒绝任务或返回重定向，请核对状态；未自动重试')); return;
      }
      if (!/^application\/x-ndjson(?:\s*;|$)/i.test(res.headers['content-type'] || '')) {
        finish(new Error('对话响应不是NDJSON事件流')); return;
      }
      let buf = '', bytes = 0, done = false;
      const consume = (line) => {
        if (!line.trim()) return;
        if (signal?.aborted) throw new Error('请求已停止，结果未确认；未自动重试');
        if (done) throw new Error('完成事件之后仍有数据，结果未确认');
        let event;
        try { event = JSON.parse(line); } catch { throw new Error('对话事件流包含无效JSON'); }
        if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string' || !event.type
          || event.type === 'message' && typeof event.text !== 'string') throw new Error('对话事件格式无效');
        onEvent(event); // Consumer failure must propagate, not become a successful response.
        if (signal?.aborted) throw new Error('请求已停止，结果未确认；未自动重试');
        if (event.type === 'error') throw new Error('主机报告任务失败，结果未确认；未自动重试');
        if (event.type === 'done') done = true;
      };
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (settled) return;
        try {
          bytes += Buffer.byteLength(chunk);
          if (bytes > 16 * 1024 * 1024) throw new Error('对话响应超过16MiB处理上限');
          buf += chunk;
          let index;
          while ((index = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, index); buf = buf.slice(index + 1);
            if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('对话事件超过1MiB处理上限');
            consume(line);
          }
          if (Buffer.byteLength(buf) > 1024 * 1024) throw new Error('对话事件超过1MiB处理上限');
        } catch (error) { finish(error); }
      });
      res.on('end', () => {
        if (settled) return;
        try {
          consume(buf);
          if (signal?.aborted) throw new Error('请求已停止，结果未确认；未自动重试');
          if (!done) throw new Error('对话连接提前结束，结果未确认；未自动重试');
          finish();
        } catch (error) { finish(error); }
      });
    });
    deadline = setTimeout(() => finish(new Error('Chat请求超时，结果未确认；未自动重试')), 300000);
    req.on('timeout', () => finish(new Error('Chat请求超时，结果未确认；未自动重试')));
    req.on('error', finish);
    req.end(payload);
  });
}

function historyFromChatContext(context) {
  const out = [];
  for (const turn of (context && context.history) || []) {
    if (turn.prompt) out.push({ role: 'user', content: String(turn.prompt) });
    if (turn.result?.metadata?.webagentCompleted === false) continue;
    const parts = turn.response || [];
    const text = parts
      .map((p) => {
        if (!p) return '';
        if (typeof p.value === 'string') return p.value;
        if (p.value && typeof p.value.value === 'string') return p.value.value;
        return '';
      })
      .join('');
    if (text) out.push({ role: 'assistant', content: text });
  }
  return out.slice(-12);
}

function revealWorkspaceFile(rel) {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder || !rel) return;
  const uri = vscode.Uri.joinPath(folder.uri, String(rel).replace(/\\/g, '/'));
  vscode.workspace.openTextDocument(uri).then(
    (doc) => vscode.window.showTextDocument(doc, { preview: true, preserveFocus: true }),
    () => {}
  );
}

function registerChatParticipant(context) {
  if (!vscode.chat || typeof vscode.chat.createChatParticipant !== 'function') return;
  try {
  const handler = async (request, chatContext, stream, token) => {
    const controller = new AbortController();
    const subscription = token.onCancellationRequested(() => controller.abort());
    if (token.isCancellationRequested) controller.abort();
    const mode = modeFromChatRequest(request);
    const message = String(request.prompt || '').replace(/^\s*\/(ask|plan|code)\b/i, '').trim();
    if (!message) {
      stream.markdown(
        '当前是 **Agent** 模式（对应 Web Agent Code）：会对工作区搜、读、必要时打补丁并跑测试。\n\n' +
          '- `/ask` 只读\n- `/plan` 多模型分支（换模型后再发同一任务；没 Key 是本机草案）\n- `/code` 或直接发任务 = Agent\n\n描述要构建或修复的内容即可。'
      );
      subscription.dispose();
      return;
    }
    stream.progress(mode === 'code' ? 'Agent 正在搜-读-补丁-再测…' : `Web Agent ${mode}…`);
    try {
      const binding = await workspaceBinding();
      if (token.isCancellationRequested) return { metadata: { webagentCompleted: false } };
      await postNdjson(
        `${agentHostUrl()}/api/chat`,
        { mode, message, history: historyFromChatContext(chatContext), client: 'vscode-extension', ...binding },
        (ev) => {
          if (token.isCancellationRequested) return;
          dispatchPty(ev);
          if (ev.type === 'status' && ev.text) stream.progress(ev.text);
          else if (ev.type === 'tool') {
            const ok = ev.ok !== false && !ev.error;
            const right = ok ? `${ev.durationMs || 0} ms` : 'Failed';
            stream.markdown(`\n\n- **${ev.label || ev.name}** · ${right}\n`);
            if (ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
              revealWorkspaceFile(ev.result.filePath);
              const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
              if (folder && typeof stream.reference === 'function') {
                try { stream.reference(vscode.Uri.joinPath(folder.uri, ev.result.filePath)); } catch (_) {}
              }
            }
          } else if (ev.type === 'message' && ev.text) stream.markdown(ev.text);
          else if (ev.type === 'error') stream.markdown(`错误：${ev.message}`);
          else if (ev.type === 'consensus' && ev.result) {
            stream.markdown(`\n\n**多模型总结**${ev.result.simulated === false ? '' : '（本机拼接，未调合并主模型）'}\n\n${ev.result.canonical || ev.result.summary || ''}\n`);
          }
        }, controller.signal
      );
      return { metadata: { webagentCompleted: true } };
    } catch (err) {
      if (!controller.signal.aborted) vscode.window.showErrorMessage(err.message, {modal:true});
      stream.markdown(`任务未完成：${err.message}\n\n请核对主机状态及已发生的操作；未自动重试。`);
      return { metadata: { webagentCompleted: false } };
    } finally { subscription.dispose(); }
  };
  const participant = vscode.chat.createChatParticipant('webagent.agent', handler);
  participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icon.svg'));
  context.subscriptions.push(participant);
  } catch (err) {
    console.warn('Web Agent chat participant not registered:', err && err.message);
  }
}

// Only a machine-level (user settings) value is honoured: a workspace must not pick the executable.
function nodePathSetting() {
  const cfg = vscode.workspace.getConfiguration('webagent');
  const info = typeof cfg.inspect === 'function' ? (cfg.inspect('nodePath') || {}) : {};
  const value = String(info.globalValue || '').trim();
  if (!value) return 'node';
  if (!path.isAbsolute(value)) throw new Error('webagent.nodePath 必须是 node 可执行文件的完整路径，或留空使用系统 PATH 中的 node。');
  return value;
}

function hostErrorHint(err) {
  const code = err && (err.code || err.cause?.code);
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') return '主机未启动或已退出：请在侧栏“主机”卡片点【启动】（或命令“Web Agent: 启动主机”）。';
  return err && err.message ? err.message : String(err);
}

function activate(context) {
  require('./editorReview').registerEditorReview(vscode, context);
  const hostOutput = vscode.window.createOutputChannel('Web Agent Host');
  context.subscriptions.push(hostOutput);
  ptyHost = startPtyHost(context, { agentHostUrl, requestJson });
  const chat = new ChatView();
  const bridge = new BridgeView(context);
  hostManager = new HostManager({
    extensionDir: context.extensionPath || __dirname,
    log: (line) => hostOutput.appendLine(line),
    workspaceMatches: sameWorkspace,
    nodePath: nodePathSetting,
    onChange: () => { refreshBar(); bridge.refresh(); }
  });
  hostManager.checkSource().then((info) => {
    if (info.error) hostOutput.appendLine('[host] ' + info.error);
    else hostOutput.appendLine(`[host] 插件来源提交 ${info.commit || '未知'}；主机仓库当前提交 ${info.repoCommit || '未知'}`);
    if (info.warning) vscode.window.showWarningMessage(info.warning);
  });
  bridge.hostCommands = { start: () => startHost(), stop: () => stopHost(), log: () => hostOutput.show(true) };
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('webagent.chatView', chat),
    vscode.window.registerWebviewViewProvider('webagent.bridgeView', bridge)
  );

  registerChatParticipant(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'webagent.openAgentChat';
  statusBar.show();
  context.subscriptions.push(statusBar);

  async function startHost({ quiet = false } = {}) {
    try {
      if (explicitHostUrl()) throw new Error('已手工设置 webagent.agentHostUrl（或环境变量 WEBAGENT_AGENT_HOST_URL），插件只连接该地址、不会自己启动主机。清除该设置后即可一键启动。');
      const folder = workspacePaths()[0];
      const snap = await hostManager.start(folder);
      if (snap.state === 'external' && !quiet) vscode.window.showInformationMessage('已接管同一文件夹上正在运行的主机（外部启动，插件停止时不会关闭它）。');
      if (context.globalState?.get('webagent.startBridgeWithHost') === true) {
        const status = await requestJson('GET', `${agentHostUrl()}/api/status`);
        if (status.json && !status.json.bridgeRunning) await bridge.startBridge(status.json.tunnelProvider || 'cloudflare');
      }
      return snap;
    } catch (error) {
      if (!error.cancelled) {
        hostOutput.appendLine('[host] ' + error.message);
        if (!quiet) vscode.window.showErrorMessage(error.message, '查看日志').then((pick) => { if (pick) hostOutput.show(true); });
      }
      return null;
    } finally { refreshBar(); bridge.refresh(); }
  }

  async function stopHost() {
    const snap = hostManager.snapshot();
    if (snap.state === 'starting' && !snap.owned) { await hostManager.stop(); refreshBar(); bridge.refresh(); return; }
    if (!snap.owned) {
      if (snap.state === 'external') vscode.window.showInformationMessage('这个主机不是插件启动的（例如由 run-webagent.cmd 启动），插件不会关闭它；请在启动它的窗口按 Ctrl+C。');
      return;
    }
    if (snap.state === 'running') {
      let bridgeOn = false;
      try { bridgeOn = Boolean((await requestJson('GET', `${agentHostUrl()}/api/status`)).json?.bridgeRunning); } catch { /* unknown: still ask */ bridgeOn = true; }
      if (bridgeOn) {
        const ok = await vscode.window.showWarningMessage('停止主机会同时停止 Bridge 隧道和正在运行的命令，Arena 等远程连接会断开。确定停止？', { modal: true }, '停止');
        if (ok !== '停止') return;
      }
    }
    await hostManager.stop();
    refreshBar(); bridge.refresh();
  }

  async function refreshBar() {
    const snap = hostManager ? hostManager.snapshot() : { state: 'idle' };
    if (snap.state === 'starting') {
      statusBar.text = '$(sync~spin) Web Agent 启动中…';
      statusBar.tooltip = '正在准备并启动主机（首次需安装依赖）。点击查看日志。';
      statusBar.command = 'webagent.showHostLog';
      return;
    }
    statusBar.command = 'webagent.openAgentChat';
    try {
      const r = await requestJson('GET', `${agentHostUrl()}/api/status`);
      if (!r.json || r.status >= 400) throw new Error('http ' + r.status);
      let folders;
      try { folders = workspacePaths(); }
      catch(error) {
        statusBar.text = '$(warning) Web Agent 工作区未就绪';
        statusBar.tooltip = error.message;
        return;
      }
      if (!r.json.workspaceRoot || !sameWorkspace(folders[0], r.json.workspaceRoot)) {
        statusBar.text = '$(warning) Web Agent 工作区不一致';
        statusBar.tooltip = `请打开主机对应文件夹 ${r.json.workspaceRoot || '（未指定）'}，或为目标项目重新启动主机。`;
        return;
      }
      // Connected through the default address while the manager knows no host (e.g. run-webagent.cmd
      // was started after this window opened): attach so the card and stop button tell the truth.
      if (hostManager && (snap.state === 'idle' || snap.state === 'error')) hostManager.attachExisting(folders[0]).catch(() => {});
      const running = r.json.bridgeRunning;
      statusBar.text = running ? '$(zap) Web Agent Bridge 运行中' : '$(hubot) Web Agent';
      const origin = snap.owned ? '由插件启动' : snap.state === 'external' ? '外部启动（插件不会关闭它）' : '';
      statusBar.tooltip = [r.json.workspaceRoot ? `工作区 ${r.json.workspaceRoot}` : '已连接 agent-host', origin, snap.warning].filter(Boolean).join('\n');
    } catch (error) {
      const badUrl = /webagent\.agentHostUrl/.test(String(error && error.message));
      if (!badUrl && hostManager) hostManager.markLost();
      const manual = !badUrl && explicitHostUrl();
      statusBar.text = badUrl ? '$(warning) Web Agent 主机地址无效'
        : manual ? '$(warning) Web Agent 未连接' : '$(debug-start) Web Agent 未启动';
      statusBar.tooltip = badUrl ? error.message
        : manual ? `已手工设置主机地址 ${manual}，但它没有回答。请先启动那个主机，或清除 webagent.agentHostUrl 改用一键启动。`
        : [snap.error, '点击启动主机（以当前文件夹为工作区，不需要 CMD 或浏览器）。'].filter(Boolean).join('\n');
      if (!badUrl && !manual) statusBar.command = 'webagent.startHost';
    }
  }
  refreshBar();
  if (vscode.workspace.onDidChangeWorkspaceFolders) context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(refreshBar));
  const timer = setInterval(refreshBar, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  context.subscriptions.push(
    vscode.commands.registerCommand('webagent.openBridge', () => {
      vscode.commands.executeCommand('workbench.view.extension.webagent-sidebar');
    }),
    vscode.commands.registerCommand('webagent.openAgentChat', async () => {
      try {
        await vscode.commands.executeCommand('workbench.action.chat.open', {
          query: '@webagent ',
          isPartialQuery: true
        });
      } catch {
        vscode.commands.executeCommand('workbench.view.extension.webagent-sidebar');
      }
    }),
    vscode.commands.registerCommand('webagent.resetSecret', () => resetSecretCommand({ refresh: () => bridge.refresh() })),
    vscode.commands.registerCommand('webagent.startHost', () => startHost()),
    vscode.commands.registerCommand('webagent.stopHost', () => stopHost()),
    vscode.commands.registerCommand('webagent.showHostLog', () => hostOutput.show(true))
  );

  const canManage = vscode.workspace.isTrusted !== false && !explicitHostUrl() && (vscode.workspace.workspaceFolders || []).length;
  if (canManage && vscode.workspace.getConfiguration('webagent').get('autoStartHost') === true) startHost({ quiet: true });
  else if (canManage) {
    try { hostManager.attachExisting(workspacePaths()[0]).catch(() => {}); } catch { /* no usable folder yet */ }
  }
}

// Webview messages are untrusted input, even with a restrictive page CSP.
function validWebviewMessage(msg, surface) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') return false;
  if (surface === 'chat') {
    if (msg.type === 'openNative' || msg.type === 'cancel') return true;
    return msg.type === 'send' && ['ask', 'plan', 'code'].includes(msg.mode)
      && typeof msg.text === 'string' && msg.text.trim().length > 0 && msg.text.length <= 128000;
  }
  if (surface !== 'bridge') return false;
  if (msg.type === 'control') return Boolean(['chat','bridge'].includes(msg.workMode) || (typeof msg.revision === 'string' && /^[a-f0-9]{64}$/.test(msg.revision) && msg.permissions && Object.keys(msg.permissions).length === 4 && ['read','edit','execute','capture'].every(k => typeof msg.permissions[k] === 'boolean')));
  if (msg.type === 'copy') return typeof msg.text === 'string' && msg.text.length <= 128000;
  if (msg.type === 'start') return msg.tunnelProvider === undefined || ['cloudflare', 'cloudflare-named', 'ngrok'].includes(msg.tunnelProvider);
  if (msg.type === 'autoBridge') return typeof msg.value === 'boolean';
  return ['refresh', 'stop', 'reset', 'hostStart', 'hostStop', 'hostLog'].includes(msg.type);
}

class ChatView {
  constructor() {
    this.history = [];
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = chatHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!validWebviewMessage(msg, 'chat')) return;
      if (msg.type === 'openNative') {
        vscode.commands.executeCommand('webagent.openAgentChat');
        return;
      }
      if (msg.type === 'cancel') { if (this.controller) this.controller.abort(); return; }
      if (msg.type !== 'send' || this.controller) return;
      this.controller = new AbortController();
      const { mode, text } = msg;
      this._view.webview.postMessage({ type: 'user', text });
      const history = this.history.slice(-12);
      let assistantText = '';
      try {
        const binding = await workspaceBinding();
        if (this.controller.signal.aborted) return;
        this.history.push({ role: 'user', content: text });
        await postNdjson(
          `${agentHostUrl()}/api/chat`,
          { mode, message: text, history, client: 'vscode-extension', ...binding },
          (ev) => {
            dispatchPty(ev);
            this._view.webview.postMessage({ type: 'event', ev });
            if (ev && ev.type === 'message' && ev.text) assistantText += ev.text;
            if (ev && ev.type === 'tool' && ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
              revealWorkspaceFile(ev.result.filePath);
            }
          }, this.controller.signal
        );
        if (assistantText) this.history.push({ role: 'assistant', content: assistantText });
      } catch (err) {
        const message = hostErrorHint(err);
        if (!this.controller.signal.aborted) vscode.window.showErrorMessage(message, {modal:true});
        this._view.webview.postMessage({
          type: 'event',
          ev: { type: 'error', message: message + '（请核对主机状态及已发生的操作；未自动重试）' }
        });
      } finally {
        this.controller = null;
        this._view.webview.postMessage({ type: 'finished' });
      }
    });
  }
}

class BridgeView {
  constructor(context) { this.context = context; this.hostCommands = null; }

  async startBridge(tunnelProvider) {
    const binding = await workspaceBinding();
    const result = await requestJson('POST', `${agentHostUrl()}/api/bridge/start`, { tunnelProvider: tunnelProvider || 'cloudflare', ...binding });
    if(result.status >= 400 || !result.json?.success) throw new Error(result.json?.error || 'Bridge 启动被拒绝');
    return this.refresh();
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = bridgeHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!validWebviewMessage(msg, 'bridge')) return;
      try {
        if (msg.type === 'refresh') return this.refresh();
        if (msg.type === 'control') {
          const binding = await workspaceBinding();
          const data = ['chat','bridge'].includes(msg.workMode) ? {workMode:msg.workMode} : {permissions:msg.permissions,revision:msg.revision};
          const result = await requestJson('POST', `${agentHostUrl()}/api/execution-control`, {...binding,...data});
          if (result.status >= 400 || !result.json?.success) throw Error(result.json?.error || '设置失败');
          this._view.webview.postMessage({type:'controlSaved'});
          return this.refresh();
        }
        // await inside the try: a rejected start must reach the modal error below, not escape.
        if (msg.type === 'start') { await this.startBridge(msg.tunnelProvider); return; }
        if (msg.type === 'hostStart') { await this.hostCommands?.start(); return; }
        if (msg.type === 'hostStop') { await this.hostCommands?.stop(); return; }
        if (msg.type === 'hostLog') { this.hostCommands?.log(); return; }
        if (msg.type === 'autoBridge') {
          await this.context?.globalState?.update('webagent.startBridgeWithHost', msg.value);
          await this.refresh();
          return;
        }
        if (msg.type === 'stop') {
          const binding = await workspaceBinding();
          let result;
          try {
            result = await requestJson('POST', `${agentHostUrl()}/api/bridge/stop`, binding);
          } catch {
            throw new Error('停止结果未确认；请刷新状态并核对隧道进程。请求失败不证明未执行，没有自动重试。');
          }
          if (result.status === 409) throw new Error('停止被主机拒绝：绑定已变化，未停止；请刷新状态后重试。');
          if (result.status >= 400 || result.json?.success !== true || result.json.running !== false) {
            throw new Error('停止结果未确认；请刷新状态并核对隧道进程。');
          }
          return this.refresh();
        }
        if (msg.type === 'copy') {
          await vscode.env.clipboard.writeText(msg.text || '');
          vscode.window.showInformationMessage('已复制到剪贴板');
        }
        if (msg.type === 'reset') {
          await vscode.commands.executeCommand('webagent.resetSecret');
        }
      } catch (e) {
        vscode.window.showErrorMessage(e.message, {modal:true});
      }
    });
    this.refresh();
  }

  async refresh() {
    if (!this._view) return;
    if (this.refreshPending) return this.refreshPending;
    this.refreshPending = (async () => {
      const host = hostManager ? hostManager.snapshot() : { state: 'idle' };
      const autoBridge = this.context?.globalState?.get('webagent.startBridgeWithHost') === true;
      let manual = '';
      try { manual = explicitHostUrl(); } catch { /* shown via status error */ }
      const hostInfo = { state: host.state, owned: host.owned, url: host.url, error: host.error, warning: host.warning, commit: host.commit, manual: Boolean(manual), autoBridge };
      try {
        const r = await requestJson('GET', `${agentHostUrl()}/api/status`);
        if (r.status !== 200 || !r.json) throw new Error('HTTP ' + r.status);
        this._view.webview.postMessage({ type: 'status', status: r.json, host: hostInfo });
      } catch (e) {
        this._view.webview.postMessage({ type: 'status', status: { error: hostErrorHint(e) }, host: hostInfo });
      }
    })();
    try { await this.refreshPending; } finally { this.refreshPending = null; }
  }

}

function chatHtml() {
  const nonce = crypto.randomBytes(18).toString('base64');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';">
<style>
body{margin:0;font:12px/1.45 system-ui;background:#1e1e1e;color:#ccc;height:100vh;display:flex;flex-direction:column}
#log{flex:1;overflow:auto;padding:12px}
.empty{text-align:center;padding:36px 16px 8px;color:#bbb}
.empty h3{margin:0 0 8px;font-size:14px;color:#ddd}
.empty p{margin:0;color:#6e6e6e;font-size:12px;line-height:1.5}
.empty a{color:#3794ff;cursor:pointer}
.msg{margin:0 0 8px;padding:8px 10px;border-radius:8px;white-space:pre-wrap}
.user{background:#2a2a2a;margin-left:8%}
.bot{background:#222;border:1px solid #333}
.tool{font-family:ui-monospace,monospace;font-size:11px;color:#9cdcfe;border:1px solid #333;padding:6px 8px;border-radius:6px;margin:0 0 8px;display:flex;justify-content:space-between}
.tool.fail{color:#f14c4c;border-color:#5a2d2d}
#tasks{display:none;border-top:1px solid #333;padding:8px 10px;background:#1a1a1a}
#tasks h4{margin:0 0 6px;font-size:11px;letter-spacing:.06em;color:#bbb;display:flex;justify-content:space-between}
#task-list{margin:0;padding:0;list-style:none}
.foot{padding:8px;background:#181818;border-top:1px solid #2b2b2b}
.composer{border:1px solid #3c3c3c;border-radius:8px;padding:8px;background:#1f1f1f}
textarea{width:100%;background:transparent;border:0;color:#fff;padding:4px 0;outline:none;resize:none;min-height:40px;font:13px/1.4 system-ui}
.row{display:flex;gap:6px;align-items:center;margin-top:6px;position:relative}
.agent-btn{background:#2d2d2d;border:1px solid #3c3c3c;color:#ddd;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer}
.menu{display:none;position:absolute;bottom:32px;left:28px;background:#252526;border:1px solid #333;border-radius:6px;min-width:200px;z-index:5;padding:4px}
.menu.on{display:block}
.menu button{display:block;width:100%;text-align:left;background:none;border:0;color:#ccc;padding:7px 10px;font-size:12px;border-radius:4px;cursor:pointer}
.menu button:hover,.menu button.on{background:#04395e;color:#fff}
.menu .hint{padding:4px 10px;font-size:10px;color:#6e6e6e}
button.send{margin-left:auto;background:#0e639c;color:#fff;border:0;width:28px;height:28px;border-radius:6px;cursor:pointer}
</style></head><body>
<details style="padding:8px 12px;max-height:40vh;overflow:auto;color:#ddd;border-bottom:1px solid #555">
  <summary>内置探索 Agent 使用帮助</summary>
  <p>新手先在 Agent 菜单切 Web Agent Ask。本页使用 agent-host 当前选择的模型，默认是内置探索；切 Ask 不等于切换模型。</p>
  <p>内置模式不需要 API Key，但不是大模型。试着要求读取 README.md（文件须在当前工作区），核对工具结果；它仍会扫描/搜索，读取有上限。Code会修改文件或执行测试，不当只读模式用。</p>
  <p>在本产品源码中按 Ctrl+P 打开「docs/guides/内置探索Agent使用指南.md」或「docs/development/借鉴优化说明（新手版）.md」，Ctrl+Shift+V预览。若打开的是自己的项目，请到产品源码目录找。</p>
</details>
<div id="log">
  <div class="empty">
    <h3>使用智能体构建</h3>
    <p>当前是 <b>Agent</b>（Web Agent Code）：直接对工作区搜、读、改、测。</p>
    <p style="margin-top:8px">也可点 Agent 切到 Ask / Plan。或打开 <a id="open-native">VS Code Chat · @webagent</a></p>
  </div>
</div>
<div id="tasks"><h4><span>Tasks</span><span id="task-count">0/0</span></h4><ul id="task-list"></ul></div>
<div class="foot">
  <div class="composer">
    <textarea id="q" rows="2" maxlength="128000" placeholder="描述要构建的内容"></textarea>
    <div class="row">
      <span>+</span>
      <button type="button" class="agent-btn" id="agent">Agent · Web Agent Code ▾</button>
      <div class="menu" id="menu">
        <div class="hint">和 Copilot 侧栏一样，先选模式再发任务</div>
        <button data-m="ask">Web Agent Ask · 只读</button>
        <button data-m="plan">Web Agent Plan · 分支</button>
        <button data-m="code" class="on">Web Agent Code · Agent</button>
      </div>
      <button class="send" id="go">↑</button>
    </div>
  </div>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let mode = 'code';
let sending = false;
const labels = { ask: 'Agent · Web Agent Ask ▾', plan: 'Agent · Web Agent Plan ▾', code: 'Agent · Web Agent Code ▾' };
const menu = document.getElementById('menu');
document.getElementById('agent').onclick = (e) => { e.stopPropagation(); menu.classList.toggle('on'); };
document.addEventListener('click', () => menu.classList.remove('on'));
menu.onclick = (e) => {
  e.stopPropagation();
  const b = e.target.closest('[data-m]');
  if (!b) return;
  mode = b.dataset.m;
  menu.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.m === mode));
  document.getElementById('agent').textContent = labels[mode];
  menu.classList.remove('on');
};
const log = document.getElementById('log');
function add(cls, text){
  const empty = log.querySelector('.empty');
  if (empty) empty.remove();
  const d=document.createElement('div'); d.className=cls; d.textContent=text; log.appendChild(d); log.scrollTop=log.scrollHeight;
}
function paintTasks(todos){
  const list = Array.isArray(todos) ? todos.filter(t => t && typeof t === 'object').slice(0, 500) : [];
  document.getElementById('tasks').style.display = list.length ? 'block' : 'none';
  const done = list.filter(t => t.status === 'completed').length;
  document.getElementById('task-count').textContent = done + '/' + list.length;
  const box = document.getElementById('task-list');
  box.replaceChildren();
  list.forEach(t => {
    const item = document.createElement('li');
    item.textContent = (t.status === 'completed' ? '☑ ' : t.status === 'in_progress' ? '▶ ' : '☐ ')
      + (typeof t.title === 'string' ? t.title : '');
    box.appendChild(item);
  });
}
document.getElementById('go').onclick = () => {
  if (sending) { vscode.postMessage({ type: 'cancel' }); return; }
  const t = document.getElementById('q').value.trim(); if(!t) return;
  document.getElementById('q').value='';
  sending = true; document.getElementById('go').textContent = '■';
  vscode.postMessage({ type:'send', mode, text:t });
};
document.getElementById('q').onkeydown = e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); document.getElementById('go').click(); } };
document.getElementById('open-native').onclick = () => vscode.postMessage({ type:'openNative' });
window.addEventListener('message', e => {
  const m = e.data;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return;
  if (m.type === 'finished') { sending = false; document.getElementById('go').textContent = '↑'; }
  if (m.type==='user') add('msg user', m.text);
  if (m.type==='event') {
    const ev = m.ev || {};
    if (ev.type==='status') add('msg bot', ev.text || '');
    else if (ev.type==='tool') {
      const ok = ev.ok !== false && !ev.error;
      add('tool' + (ok ? '' : ' fail'), (ev.label || ev.name || 'tool') + '   ' + (ok ? ((ev.durationMs||0) + ' ms') : 'Failed'));
      if (ev.name === 'set_todos' && ev.result && ev.result.todos) paintTasks(ev.result.todos);
    }
    else if (ev.type==='message') add('msg bot', ev.text || '');
    else if (ev.type==='error') add('msg bot', '错误: ' + (ev.message||''));
    else if (ev.type==='consensus') add('msg bot', (ev.result && (ev.result.summary||ev.result.canonical)) || '多模型总结');
  }
});
</script></body></html>`;
}

function bridgeHtml() {
  const nonce = crypto.randomBytes(18).toString('base64');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';">
<style>
body{margin:0;padding:12px;font:12px/1.4 system-ui;background:var(--vscode-sideBar-background,#1e1e1e);color:var(--vscode-foreground,#ccc)}
.pill{display:inline-block;padding:3px 10px;border-radius:12px;margin-bottom:10px;border:1px solid #4fc1ff;color:#4fc1ff}
.card{background:var(--vscode-editor-background,#252526);border:1px solid var(--vscode-panel-border,#555);border-radius:8px;padding:10px;margin-bottom:10px}
.url{word-break:break-all;font-family:ui-monospace,monospace;color:#9cdcfe;background:#111;padding:8px;border-radius:4px}
button{background:#0e639c;color:#fff;border:0;padding:7px 10px;border-radius:4px;cursor:pointer;margin:4px 4px 0 0}
.hint{color:var(--vscode-descriptionForeground,#b0b0b0)}
.tool{font-family:ui-monospace,monospace;font-size:11px;color:#9cdcfe;border:1px solid #333;padding:6px 8px;border-radius:6px;margin:0 0 6px;display:flex;justify-content:space-between}
#tasks{max-height:35vh;overflow:auto;overflow-wrap:anywhere}
#tasks h4{margin:0 0 6px;font-size:11px;display:flex;justify-content:space-between}
#task-list{margin:0;padding:0;list-style:none}
</style></head><body>
<div class="pill" id="pill">检查中…</div>
<div class="card" id="host-card">
  <strong>主机</strong> <span id="host-state">检查中…</span>
  <div><button id="host-start">启动</button><button id="host-stop">停止</button><button id="host-log">日志</button></div>
  <label><input id="auto-bridge" type="checkbox">启动主机后同时开启 Bridge</label>
  <p class="hint" id="host-hint">以当前打开的文件夹为工作区启动，不需要 CMD 或浏览器。关闭 VS Code 窗口时，插件启动的主机与隧道会一起停止。</p>
</div>
<div class="card">
  <div>MCP 地址</div>
  <div class="url" id="url">—</div>
  <label>隧道 <select id="tunnel"><option value="cloudflare">Cloudflare Quick Tunnel</option><option value="cloudflare-named">Cloudflare Named Tunnel</option><option value="ngrok">ngrok</option></select></label>
  <p class="hint">Named Tunnel 与 ngrok 的域名/Token 仍在网页工作台的 Bridge 页保存（下一期搬进 VS Code）；Quick Tunnel 无需配置。</p>
  <button id="start">启动 Bridge</button>
  <button id="stop">停止</button>
  <button id="copy">复制提示词</button>
  <button id="reset">重置密钥</button>
</div>
<div class="card">
  <strong>工作模式与 Bridge 权限</strong><p id="execution-mode">待同步</p>
  <button id="mode-chat">切换 Chat</button><button id="mode-bridge">切换 Bridge</button>
  <fieldset style="display:flex;flex-wrap:wrap;gap:8px"><legend>仅限制远端Bridge</legend>
    <label><input id="access-read" type="checkbox">Read</label><label><input id="access-edit" type="checkbox">Edit</label>
    <label><input id="access-execute" type="checkbox">Execute</label><label><input id="access-capture" type="checkbox">Capture</label>
  </fieldset>
  <p class="hint">Edit需要Read；任意Execute可读写/截图，须同时允许四项。不是OS沙箱。切换前先结束任务及后台程序、停止隧道。</p>
  <button id="save-access">保存权限</button><button id="refresh-access">重新读取</button><p id="access-result" role="status"></p>
</div>
<div class="card" id="tasks">
  <h4><span>Tasks</span><span id="task-count">0/0</span></h4>
  <ul id="task-list"></ul>
</div>
<div class="card" id="stream"></div>
<p class="hint" id="hint">启动后等 trycloudflare.com。Arena：把提示词整段当第一句。ChatGPT：不要贴进聊天栏，走设置里的自制 MCP 插件。</p>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let status = {}, policyDirty = false, policyRevision = '';
document.getElementById('mode-chat').onclick = () => vscode.postMessage({type:'control',workMode:'chat'});
document.getElementById('mode-bridge').onclick = () => vscode.postMessage({type:'control',workMode:'bridge'});
document.getElementById('refresh-access').onclick = () => {policyDirty=false;vscode.postMessage({type:'refresh'});};
document.getElementById('save-access').onclick = () => vscode.postMessage({type:'control',revision:policyRevision,permissions:Object.fromEntries(['read','edit','execute','capture'].map(k=>[k,document.getElementById('access-'+k).checked]))});
for (const k of ['read','edit','execute','capture']) document.getElementById('access-'+k).onchange = () => {
  policyDirty=true;
  if (!document.getElementById('access-read').checked) document.getElementById('access-edit').checked=false;
  if (['read','edit','capture'].some(key=>!document.getElementById('access-'+key).checked)) {
    document.getElementById('access-execute').checked=false;
    document.getElementById('access-result').textContent='Execute要求Read/Edit/Capture全开；未自动扩大权限。保存后才生效。';
  }
};
const CONNECT = '快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。';
document.getElementById('start').onclick = () => vscode.postMessage({ type:'start', tunnelProvider: document.getElementById('tunnel').value });
document.getElementById('host-start').onclick = () => vscode.postMessage({ type:'hostStart' });
document.getElementById('host-stop').onclick = () => vscode.postMessage({ type:'hostStop' });
document.getElementById('host-log').onclick = () => vscode.postMessage({ type:'hostLog' });
document.getElementById('auto-bridge').onchange = (e) => vscode.postMessage({ type:'autoBridge', value: e.target.checked });
let tunnelTouched = false;
document.getElementById('tunnel').onchange = () => { tunnelTouched = true; };
const HOST_TEXT = { idle:'未启动', starting:'启动中…（首次需安装依赖）', running:'运行中（由插件启动）', external:'已连接（外部启动，插件不会关闭它）', error:'启动失败' };
function paintHost(host){
  host = host && typeof host === 'object' ? host : {};
  const connected = !status.error;
  let text = HOST_TEXT[host.state] || '未知';
  if (host.manual) text = connected ? '已连接（手工设置的主机地址）' : '未连接（手工设置的主机地址）';
  else if (host.state === 'idle' && connected) text = '默认端口上有主机（可能属于其他文件夹）；点【启动】核对并接管，或另起一个';
  document.getElementById('host-state').textContent = text;
  document.getElementById('host-start').disabled = Boolean(host.manual) || host.state === 'starting' || host.state === 'running' || host.state === 'external';
  document.getElementById('host-stop').disabled = !(host.owned || host.state === 'starting');
  document.getElementById('auto-bridge').checked = host.autoBridge === true;
  document.getElementById('host-hint').textContent = [host.error, host.warning].filter(Boolean).join(' ')
    || (host.manual ? '已手工设置 webagent.agentHostUrl：插件只连接该地址，不自己启动主机。' : '以当前打开的文件夹为工作区启动，不需要 CMD 或浏览器。关闭 VS Code 窗口时，插件启动的主机与隧道会一起停止。');
}
document.getElementById('stop').onclick = () => vscode.postMessage({ type:'stop' });
document.getElementById('copy').onclick = () => {
  const url = status.prompt || ((status.mcpUrl||'') + '\\n\\n' + CONNECT);
  vscode.postMessage({ type:'copy', text: url });
};
document.getElementById('reset').onclick = () => vscode.postMessage({ type:'reset' });
function paintTasks(todos){
  const list = Array.isArray(todos) ? todos.filter(t => t && typeof t === 'object').slice(0, 800) : [];
  document.getElementById('tasks').style.display = 'block';
  const done = list.filter(t => t.status === 'completed').length;
  document.getElementById('task-count').textContent = done + '/' + list.length;
  const box = document.getElementById('task-list');
  box.replaceChildren();
  list.forEach(t => {
    const item = document.createElement('li');
    item.textContent = (t.status === 'completed' ? '☑ ' : t.status === 'in_progress' ? '▶ ' : '☐ ')
      + (typeof t.title === 'string' ? t.title : '');
    box.appendChild(item);
  });
}
function paintBridgeTasks(groups){
  const states = (Array.isArray(groups) ? groups : []).filter(g => g && typeof g === 'object').slice(0,16);
  const todos = states.flatMap(g => (Array.isArray(g.todos) ? g.todos : []).filter(t => t && typeof t === 'object').slice(0,50).map(t => ({...t, title: '会话 '+g.sessionId+' · '+t.title+' · '+t.status})));
  paintTasks(todos);
  const box = document.getElementById('task-list');
  states.filter(g => g.lastMessage).forEach(g => {
    const item = document.createElement('li'); item.textContent = '会话 '+g.sessionId+' · '+g.lastMessage+'（Agent报告 '+g.progress+'%）'; box.appendChild(item);
  });
  const note = document.createElement('li'); note.className = 'hint';
  note.textContent = states.length ? 'Agent上报计划，不是工具执行或测试通过的自动证明。' : '尚未收到任务计划；外部Agent需调用 set_todos / report_progress，工具调用不会自动生成任务。';
  box.appendChild(note);
}
function paintLogs(logs){
  const box = document.getElementById('stream');
  const tools = (Array.isArray(logs) ? logs : []).filter(l => l && l.type === 'tool_call_end').slice(0, 12);
  box.replaceChildren();
  tools.forEach(l => {
    const p = l.payload && typeof l.payload === 'object' ? l.payload : {};
    const row = document.createElement('div');
    row.className = 'tool';
    const name = document.createElement('span');
    name.textContent = typeof p.tool === 'string' ? p.tool : '';
    const result = document.createElement('span');
    result.textContent = p.success === false ? 'Failed'
      : ((typeof p.durationMs === 'number' && Number.isFinite(p.durationMs) ? p.durationMs : 0) + ' ms');
    row.appendChild(name);
    row.appendChild(result);
    box.appendChild(row);
  });
  if (!tools.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Waiting for the remote Agent';
    box.appendChild(empty);
  }
}
window.addEventListener('message', e => {
  if (e.data?.type === 'controlSaved') {policyDirty=false;document.getElementById('access-result').textContent='已由主机应用';return;}
  if (!e.data || e.data.type !== 'status') return;
  status = e.data.status && typeof e.data.status === 'object' ? e.data.status : {};
  paintHost(e.data.host);
  if (!tunnelTouched && ['cloudflare','cloudflare-named','ngrok'].includes(status.tunnelProvider)) document.getElementById('tunnel').value = status.tunnelProvider;
  else if (!tunnelTouched && status.tunnelProvider === 'named') document.getElementById('tunnel').value = 'cloudflare-named';
  const ctl = status.executionControl;
  document.getElementById('execution-mode').textContent=ctl ? ('主机模式：'+ctl.mode+'；Chat在途'+ctl.active.chat+'，Bridge在途'+ctl.active.bridge) : '模式/权限未知，请更新主机';
  if (ctl && !policyDirty) {policyRevision=ctl.revision;for(const key of ['read','edit','execute','capture']) document.getElementById('access-'+key).checked=ctl.permissions[key];}
  document.getElementById('url').textContent = status.mcpUrl || status.error || '—';
  document.getElementById('pill').textContent = status.error ? ('离线 ' + status.error) : (status.bridgeRunning ? 'Bridge 运行中' : '已连接 agent-host');
  if (!status.error) paintBridgeTasks(status.bridgeTaskStates);
  else document.getElementById('task-count').textContent = '同步失败，当前状态未知';
  paintLogs(status.recentLogs);
});
setInterval(() => vscode.postMessage({ type:'refresh' }), 4000);
vscode.postMessage({ type:'refresh' });
</script></body></html>`;
}

// VS Code awaits this promise briefly on window close; the stdin lifeline covers the rest.
function deactivate() { return hostManager ? hostManager.dispose() : undefined; }

module.exports = { activate, deactivate, modeFromChatRequest };
