const vscode = require('vscode');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { modeFromChatRequest } = require('./modeFromChatRequest');
const { sameWorkspace } = require('./workspaceMatch');
const { startPtyHost } = require('./ptyHost');

let ptyHost = null;

function dispatchPty(ev) {
  if (!ev || ev.type !== 'pty_request' || !ptyHost) return;
  if (typeof ptyHost.noteStream === 'function') ptyHost.noteStream();
  if (typeof ptyHost.handleIncoming === 'function') ptyHost.handleIncoming(ev);
}

function agentHostUrl() {
  const fromCfg = vscode.workspace.getConfiguration('webagent').get('agentHostUrl');
  return String(fromCfg || process.env.WEBAGENT_AGENT_HOST_URL || 'http://127.0.0.1:48271').replace(/\/$/, '');
}

function requestJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        timeout: 15000,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode, json: raw ? JSON.parse(raw) : null, raw });
          } catch {
            resolve({ status: res.statusCode, json: null, raw });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('本机API请求超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
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
async function workspaceBinding() {
  const before = workspacePaths();
  const response = await requestJson('GET', `${agentHostUrl()}/api/status`);
  const status = response.json;
  if (response.status !== 200 || !status?.workspaceRoot || !status.identity?.hostInstanceId) throw new Error('主机未就绪，请启动对应项目的 agent-host。');
  const after = workspacePaths();
  const matches = folder => sameWorkspace(folder, status.workspaceRoot);
  if (!matches(before[0]) || !matches(after[0])) throw new Error(`工作区与主机不一致，已阻止操作。主机工作区：${status.workspaceRoot}。请将该文件夹作为首工作区（建议单独打开），或为目标项目重新启动主机。`);
  return {workspaceRoot:status.workspaceRoot, hostInstanceId:status.identity.hostInstanceId};
}

function postNdjson(url, body, onEvent, signal) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        signal,
        timeout: 300000,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      (res) => {
        if (res.statusCode >= 400) { res.resume(); reject(new Error('主机拒绝任务，请刷新并重新核对工作区、主机状态及授权。')); return; }
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buf += chunk;
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              onEvent(JSON.parse(line));
            } catch (_) {}
          }
        });
        res.on('end', () => {
          if (buf.trim()) {
            try {
              onEvent(JSON.parse(buf));
            } catch (_) {}
          }
          resolve();
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Chat请求超时')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function historyFromChatContext(context) {
  const out = [];
  for (const turn of (context && context.history) || []) {
    if (turn.prompt) out.push({ role: 'user', content: String(turn.prompt) });
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
      if (token.isCancellationRequested) return;
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
    } catch (err) {
      vscode.window.showErrorMessage(err.message, {modal:true});
      stream.markdown(`任务未完成：${err.message}\n\n确认 run-webagent.cmd 或 run-webagent-vscode.cmd 已启动 agent-host（:48271）。`);
    } finally { subscription.dispose(); }
  };
  const participant = vscode.chat.createChatParticipant('webagent.agent', handler);
  participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icon.svg'));
  context.subscriptions.push(participant);
  } catch (err) {
    console.warn('Web Agent chat participant not registered:', err && err.message);
  }
}

function activate(context) {
  ptyHost = startPtyHost(context, { agentHostUrl, requestJson });
  const chat = new ChatView();
  const bridge = new BridgeView();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('webagent.chatView', chat),
    vscode.window.registerWebviewViewProvider('webagent.bridgeView', bridge)
  );

  registerChatParticipant(context);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'webagent.openAgentChat';
  statusBar.show();
  context.subscriptions.push(statusBar);

  async function refreshBar() {
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
      const running = r.json.bridgeRunning;
      statusBar.text = running ? '$(zap) Web Agent Bridge 运行中' : '$(hubot) Web Agent';
      statusBar.tooltip = r.json.workspaceRoot ? `工作区 ${r.json.workspaceRoot}` : '已连接 agent-host';
    } catch {
      statusBar.text = '$(warning) Web Agent 未连接 48271';
      statusBar.tooltip = '先运行 run-webagent.cmd（或 run-webagent-vscode.cmd）让 agent-host 听 48271。';
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
    vscode.commands.registerCommand('webagent.resetSecret', async () => {
      try {
        await requestJson('POST', `${agentHostUrl()}/api/bridge/reset-secret`, {});
        vscode.window.showInformationMessage('Web Agent: MCP Secret 已重置，旧链接立即失效。');
        bridge.refresh();
      } catch (e) {
        vscode.window.showErrorMessage(`重置失败: ${e.message}`);
      }
    })
  );
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
  if (msg.type === 'copy') return typeof msg.text === 'string' && msg.text.length <= 128000;
  return ['refresh', 'start', 'stop', 'reset'].includes(msg.type);
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
        vscode.window.showErrorMessage(err.message, {modal:true});
        this._view.webview.postMessage({
          type: 'event',
          ev: { type: 'error', message: err.message + '（确认 run-webagent.cmd 或 run-webagent-vscode.cmd 已启动 agent-host :48271）' }
        });
      } finally {
        this.controller = null;
        this._view.webview.postMessage({ type: 'finished' });
      }
    });
  }
}

class BridgeView {
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = bridgeHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (!validWebviewMessage(msg, 'bridge')) return;
      try {
        if (msg.type === 'refresh') return this.refresh();
        if (msg.type === 'start') {
          const binding = await workspaceBinding();
          const result = await requestJson('POST', `${agentHostUrl()}/api/bridge/start`, { tunnelProvider: 'cloudflare', ...binding });
          if(result.status >= 400 || !result.json?.success) throw new Error(result.json?.error || 'Bridge 启动被拒绝');
          return this.refresh();
        }
        if (msg.type === 'stop') {
          await requestJson('POST', `${agentHostUrl()}/api/bridge/stop`, {});
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
      try {
        const r = await requestJson('GET', `${agentHostUrl()}/api/status`);
        if (r.status !== 200 || !r.json) throw new Error('HTTP ' + r.status);
        this._view.webview.postMessage({ type: 'status', status: r.json });
      } catch (e) {
        this._view.webview.postMessage({ type: 'status', status: { error: e.message } });
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
  <p>在本产品源码中按 Ctrl+P 打开「内置探索Agent使用指南.md」或「借鉴优化说明（新手版）.md」，Ctrl+Shift+V预览。若打开的是自己的项目，请到产品源码目录找。</p>
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
<div class="card">
  <div>MCP 地址</div>
  <div class="url" id="url">—</div>
  <button id="start">启动 Bridge</button>
  <button id="stop">停止</button>
  <button id="copy">复制提示词</button>
  <button id="reset">重置密钥</button>
</div>
<div class="card" id="tasks">
  <h4><span>Tasks</span><span id="task-count">0/0</span></h4>
  <ul id="task-list"></ul>
</div>
<div class="card" id="stream"></div>
<p class="hint" id="hint">启动后等 trycloudflare.com。Arena：把提示词整段当第一句。ChatGPT：不要贴进聊天栏，走设置里的自制 MCP 插件。</p>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let status = {};
const CONNECT = '快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。';
document.getElementById('start').onclick = () => vscode.postMessage({ type:'start' });
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
  if (!e.data || e.data.type !== 'status') return;
  status = e.data.status && typeof e.data.status === 'object' ? e.data.status : {};
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

module.exports = { activate, deactivate: () => {}, modeFromChatRequest };
