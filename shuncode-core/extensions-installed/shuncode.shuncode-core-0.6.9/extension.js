const vscode = require('vscode');
const http = require('http');
const https = require('https');

function agentHostUrl() {
  const fromCfg = vscode.workspace.getConfiguration('shuncode').get('agentHostUrl');
  return String(fromCfg || process.env.SHUNCODE_AGENT_HOST_URL || 'http://127.0.0.1:48271').replace(/\/$/, '');
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

function activate(context) {
  const chat = new ChatView();
  const bridge = new BridgeView();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shuncode.chatView', chat),
    vscode.window.registerWebviewViewProvider('shuncode.bridgeView', bridge)
  );

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'shuncode.openBridge';
  statusBar.show();
  context.subscriptions.push(statusBar);

  async function refreshBar() {
    try {
      const r = await requestJson('GET', `${agentHostUrl()}/api/status`);
      const running = r.json && r.json.bridgeRunning;
      statusBar.text = running ? '$(zap) ShunCode Bridge 运行中' : '$(zap) ShunCode 已连接';
    } catch {
      statusBar.text = '$(warning) ShunCode 未连接 48271';
    }
  }
  refreshBar();
  const timer = setInterval(refreshBar, 5000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });

  context.subscriptions.push(
    vscode.commands.registerCommand('shuncode.openBridge', () => {
      vscode.commands.executeCommand('workbench.view.extension.shuncode-sidebar');
    }),
    vscode.commands.registerCommand('shuncode.resetSecret', async () => {
      try {
        await requestJson('POST', `${agentHostUrl()}/api/bridge/reset-secret`, {});
        vscode.window.showInformationMessage('ShunCode: MCP Secret 已重置，旧链接立即失效。');
        bridge.refresh();
      } catch (e) {
        vscode.window.showErrorMessage(`重置失败: ${e.message}`);
      }
    })
  );
}

class ChatView {
  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = chatHtml();
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type !== 'send') return;
      const { mode, text } = msg;
      this._view.webview.postMessage({ type: 'user', text });
      try {
        await postNdjson(
          `${agentHostUrl()}/api/chat`,
          { mode, message: text, history: [] },
          (ev) => this._view.webview.postMessage({ type: 'event', ev })
        );
      } catch (err) {
        this._view.webview.postMessage({
          type: 'event',
          ev: { type: 'error', message: err.message + '（确认 run-shuncode-vscode 已启动 agent-host :48271）' }
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
          await vscode.commands.executeCommand('shuncode.resetSecret');
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
body{margin:0;font:12px/1.45 system-ui;background:#1e1e2e;color:#f0f0f8;height:100vh;display:flex;flex-direction:column}
.modes{display:flex;gap:4px;padding:8px;background:#181824}
.modes button{flex:1;border:0;background:#28283d;color:#9898b0;padding:6px;border-radius:4px;cursor:pointer}
.modes button.on{background:#6366f1;color:#fff}
#log{flex:1;overflow:auto;padding:10px}
.msg{margin:0 0 8px;padding:8px 10px;border-radius:8px;white-space:pre-wrap}
.user{background:#3b3b54;margin-left:18%}
.bot{background:#28283d;border:1px solid #3f3f5a}
.tool{font-family:ui-monospace,monospace;font-size:11px;color:#34d399;border:1px solid #10b981;padding:6px;border-radius:4px;margin:0 0 8px}
.foot{padding:8px;background:#181824;display:flex;gap:6px}
input{flex:1;background:#28283d;border:1px solid #3f3f5a;color:#fff;padding:8px;border-radius:6px}
button.send{background:#6366f1;color:#fff;border:0;padding:0 12px;border-radius:6px;cursor:pointer}
</style></head><body>
<div class="modes">
  <button data-m="ask">ASK 只读</button>
  <button data-m="plan" class="on">PLAN</button>
  <button data-m="code">CODE 可写</button>
</div>
<div id="log"><div class="msg bot">ShunCode 侧栏已接到本机 agent-host。Ask 只读，Code 可 apply_patch / 跑命令。</div></div>
<div class="foot">
  <input id="q" placeholder="描述要构建的内容">
  <button class="send" id="go">发送</button>
</div>
<script>
const vscode = acquireVsCodeApi();
let mode = 'plan';
document.querySelectorAll('.modes button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.modes button').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); mode = b.dataset.m;
});
const log = document.getElementById('log');
function add(cls, text){ const d=document.createElement('div'); d.className=cls; d.textContent=text; log.appendChild(d); log.scrollTop=log.scrollHeight; }
document.getElementById('go').onclick = () => {
  const t = document.getElementById('q').value.trim(); if(!t) return;
  document.getElementById('q').value='';
  vscode.postMessage({ type:'send', mode, text:t });
};
document.getElementById('q').onkeydown = e => { if(e.key==='Enter') document.getElementById('go').click(); };
window.addEventListener('message', e => {
  const m = e.data;
  if (m.type==='user') add('msg user', m.text);
  if (m.type==='event') {
    const ev = m.ev || {};
    if (ev.type==='status') add('msg bot', ev.text || '');
    else if (ev.type==='tool') add('tool', '工具 ' + (ev.name||'') + (ev.ok===false?' 失败':' ok'));
    else if (ev.type==='message') add('msg bot', ev.text || '');
    else if (ev.type==='error') add('msg bot', '错误: ' + (ev.message||''));
    else if (ev.type==='consensus') add('msg bot', (ev.result && (ev.result.summary||ev.result.canonical)) || '多模型博弈完成');
  }
});
</script></body></html>`;
}

function bridgeHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
body{margin:0;padding:12px;font:12px/1.4 system-ui;background:#1e1e2e;color:#f0f0f8}
.pill{display:inline-block;padding:3px 10px;border-radius:12px;margin-bottom:10px;border:1px solid #10b981;color:#10b981}
.card{background:#28283d;border:1px solid #3f3f5a;border-radius:8px;padding:10px;margin-bottom:10px}
.url{word-break:break-all;font-family:ui-monospace,monospace;color:#818cf8;background:#141420;padding:8px;border-radius:4px}
button{background:#6366f1;color:#fff;border:0;padding:7px 10px;border-radius:4px;cursor:pointer;margin:4px 4px 0 0}
.hint{color:#9898b0}
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
window.addEventListener('message', e => {
  if (e.data.type !== 'status') return;
  status = e.data.status || {};
  document.getElementById('url').textContent = status.mcpUrl || status.error || '—';
  document.getElementById('pill').textContent = status.error ? ('离线 ' + status.error) : (status.bridgeRunning ? 'Bridge 运行中' : '已连接 agent-host');
});
setInterval(() => vscode.postMessage({ type:'refresh' }), 4000);
vscode.postMessage({ type:'refresh' });
</script></body></html>`;
}

module.exports = { activate, deactivate: () => {} };
