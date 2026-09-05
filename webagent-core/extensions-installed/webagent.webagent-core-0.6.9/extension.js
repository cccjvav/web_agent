const vscode = require('vscode');
const http = require('http');
const https = require('https');
const path = require('path');

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
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function postNdjson(url, body, onEvent) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      },
      (res) => {
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
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function modeFromChatRequest(request) {
  const cmd = String((request && request.command) || '').toLowerCase();
  if (cmd === 'ask' || cmd === 'plan' || cmd === 'code') return cmd;
  const prompt = String((request && request.prompt) || '');
  if (/^\s*\/ask\b/i.test(prompt)) return 'ask';
  if (/^\s*\/plan\b/i.test(prompt)) return 'plan';
  if (/^\s*\/code\b/i.test(prompt)) return 'code';
  return 'code';
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
    const mode = modeFromChatRequest(request);
    const message = String(request.prompt || '').replace(/^\s*\/(ask|plan|code)\b/i, '').trim();
    if (!message) {
      stream.markdown(
        '当前是 **Agent** 模式（对应 Web Agent Code）：会对工作区搜、读、必要时打补丁并跑测试。\n\n' +
          '- `/ask` 只读\n- `/plan` 多模型分支（换模型后再发同一任务；没 Key 是本机草案）\n- `/code` 或直接发任务 = Agent\n\n描述要构建或修复的内容即可。'
      );
      return;
    }
    stream.progress(mode === 'code' ? 'Agent 正在搜-读-补丁-再测…' : `Web Agent ${mode}…`);
    try {
      await postNdjson(
        `${agentHostUrl()}/api/chat`,
        { mode, message, history: historyFromChatContext(chatContext) },
        (ev) => {
          if (token.isCancellationRequested) return;
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
        }
      );
    } catch (err) {
      stream.markdown(`连不上 agent-host：${err.message}\n\n确认 \`run-webagent-vscode\` 已启动 :48271。`);
    }
  };
  const participant = vscode.chat.createChatParticipant('webagent.agent', handler);
  participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'resources', 'icon.svg'));
  context.subscriptions.push(participant);
  } catch (err) {
    console.warn('Web Agent chat participant not registered:', err && err.message);
  }
}

function activate(context) {
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
      const running = r.json && r.json.bridgeRunning;
      statusBar.text = running ? '$(zap) Web Agent Bridge 运行中' : '$(hubot) Web Agent';
    } catch {
      statusBar.text = '$(warning) Web Agent 未连接 48271';
    }
  }
  refreshBar();
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

class ChatView {
  constructor() {
    this.history = [];
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = chatHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === 'openNative') {
        vscode.commands.executeCommand('webagent.openAgentChat');
        return;
      }
      if (msg.type !== 'send') return;
      const { mode, text } = msg;
      this._view.webview.postMessage({ type: 'user', text });
      const history = this.history.slice(-12);
      this.history.push({ role: 'user', content: text });
      let assistantText = '';
      try {
        await postNdjson(
          `${agentHostUrl()}/api/chat`,
          { mode, message: text, history },
          (ev) => {
            this._view.webview.postMessage({ type: 'event', ev });
            if (ev && ev.type === 'message' && ev.text) assistantText += ev.text;
            if (ev && ev.type === 'tool' && ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
              revealWorkspaceFile(ev.result.filePath);
            }
          }
        );
        if (assistantText) this.history.push({ role: 'assistant', content: assistantText });
      } catch (err) {
        this._view.webview.postMessage({
          type: 'event',
          ev: { type: 'error', message: err.message + '（确认 run-webagent-vscode 已启动 agent-host :48271）' }
        });
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
      try {
        if (msg.type === 'refresh') return this.refresh();
        if (msg.type === 'start') {
          await requestJson('POST', `${agentHostUrl()}/api/bridge/start`, { tunnelProvider: 'cloudflare' });
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
        vscode.window.showErrorMessage(e.message);
      }
    });
    this.refresh();
  }

  async refresh() {
    if (!this._view) return;
    try {
      const r = await requestJson('GET', `${agentHostUrl()}/api/status`);
      this._view.webview.postMessage({ type: 'status', status: r.json });
    } catch (e) {
      this._view.webview.postMessage({ type: 'status', status: { error: e.message } });
    }
  }
}

function chatHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
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
    <textarea id="q" rows="2" placeholder="描述要构建的内容"></textarea>
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
<script>
const vscode = acquireVsCodeApi();
let mode = 'code';
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
  const list = todos || [];
  document.getElementById('tasks').style.display = list.length ? 'block' : 'none';
  const done = list.filter(t => t.status === 'completed').length;
  document.getElementById('task-count').textContent = done + '/' + list.length;
  document.getElementById('task-list').innerHTML = list.map(t => '<li>' + (t.status==='completed'?'☑ ':t.status==='in_progress'?'▶ ':'☐ ') + (t.title||'') + '</li>').join('');
}
document.getElementById('go').onclick = () => {
  const t = document.getElementById('q').value.trim(); if(!t) return;
  document.getElementById('q').value='';
  vscode.postMessage({ type:'send', mode, text:t });
};
document.getElementById('q').onkeydown = e => { if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); document.getElementById('go').click(); } };
document.getElementById('open-native').onclick = () => vscode.postMessage({ type:'openNative' });
window.addEventListener('message', e => {
  const m = e.data;
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
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{margin:0;padding:12px;font:12px/1.4 system-ui;background:#1e1e1e;color:#ccc}
.pill{display:inline-block;padding:3px 10px;border-radius:12px;margin-bottom:10px;border:1px solid #4fc1ff;color:#4fc1ff}
.card{background:#252526;border:1px solid #333;border-radius:8px;padding:10px;margin-bottom:10px}
.url{word-break:break-all;font-family:ui-monospace,monospace;color:#9cdcfe;background:#111;padding:8px;border-radius:4px}
button{background:#0e639c;color:#fff;border:0;padding:7px 10px;border-radius:4px;cursor:pointer;margin:4px 4px 0 0}
.hint{color:#6e6e6e}
.tool{font-family:ui-monospace,monospace;font-size:11px;color:#9cdcfe;border:1px solid #333;padding:6px 8px;border-radius:6px;margin:0 0 6px;display:flex;justify-content:space-between}
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
<div class="card" id="tasks" style="display:none">
  <h4><span>Tasks</span><span id="task-count">0/0</span></h4>
  <ul id="task-list"></ul>
</div>
<div class="card" id="stream"></div>
<p class="hint" id="hint">启动后等 trycloudflare.com，再把提示词整段贴进 ChatGPT / Arena 第一句。</p>
<script>
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
  const list = todos || [];
  document.getElementById('tasks').style.display = list.length ? 'block' : 'none';
  const done = list.filter(t => t.status === 'completed').length;
  document.getElementById('task-count').textContent = done + '/' + list.length;
  document.getElementById('task-list').innerHTML = list.map(t => '<li>' + (t.status==='completed'?'☑ ':'☐ ') + (t.title||'') + '</li>').join('');
}
function paintLogs(logs){
  const box = document.getElementById('stream');
  const tools = (logs || []).filter(l => l.type === 'tool_call_end').slice(0, 12);
  box.innerHTML = tools.map(l => {
    const p = l.payload || {};
    const ok = p.success !== false;
    return '<div class="tool"><span>' + (p.tool||'') + '</span><span>' + (ok ? ((p.durationMs||0)+' ms') : 'Failed') + '</span></div>';
  }).join('') || '<p class="hint">Waiting for the remote Agent</p>';
}
window.addEventListener('message', e => {
  if (e.data.type !== 'status') return;
  status = e.data.status || {};
  document.getElementById('url').textContent = status.mcpUrl || status.error || '—';
  document.getElementById('pill').textContent = status.error ? ('离线 ' + status.error) : (status.bridgeRunning ? 'Bridge 运行中' : '已连接 agent-host');
  paintTasks(status.taskState && status.taskState.todos);
  paintLogs(status.recentLogs);
});
setInterval(() => vscode.postMessage({ type:'refresh' }), 4000);
vscode.postMessage({ type:'refresh' });
</script></body></html>`;
}

module.exports = { activate, deactivate: () => {}, modeFromChatRequest };
