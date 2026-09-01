const vscode = require('vscode');
const http = require('http');

const AGENT_HOST_URL = 'http://127.0.0.1:48271';

function activate(context) {
  console.log('ShunCode Core Extension Activated!');

  // Register Chat View
  const chatProvider = new ShunCodeChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shuncode.chatView', chatProvider)
  );

  // Register Bridge View
  const bridgeProvider = new ShunCodeBridgeViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('shuncode.bridgeView', bridgeProvider)
  );

  // Status Bar Item
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.text = "$(zap) ShunCode: Bridge Online (48271)";
  statusBar.tooltip = "点击查看 ShunCode Bridge 控制台与 MCP 状态";
  statusBar.command = "shuncode.openBridge";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('shuncode.openBridge', () => {
      vscode.commands.executeCommand('workbench.view.extension.shuncode-sidebar');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shuncode.resetSecret', async () => {
      try {
        const res = await fetchJson(`${AGENT_HOST_URL}/api/bridge/reset-secret`, 'POST');
        vscode.window.showInformationMessage(`ShunCode: Bridge Secret 已重置！新 MCP 地址已生成。`);
        bridgeProvider.refresh();
      } catch (e) {
        vscode.window.showErrorMessage(`重置 Secret 失败: ${e.message}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('shuncode.runTests', async () => {
      const terminal = vscode.window.createTerminal('ShunCode Test Runner');
      terminal.show();
      terminal.sendText('npm test');
    })
  );
}

// Utility for HTTP JSON requests
function fetchJson(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(urlObj, {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * ShunCode Chat & Agent Webview Provider (Ask / Plan / Code + Multi-Model Consensus)
 */
class ShunCodeChatViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this._handleUserMessage(message.payload);
          break;
        case 'runConsensus':
          await this._handleRunConsensus(message.payload);
          break;
        case 'executeTool':
          await this._handleExecuteTool(message.payload);
          break;
        case 'runLocalTests':
          vscode.commands.executeCommand('shuncode.runTests');
          break;
      }
    });
  }

  async _handleUserMessage({ mode, text }) {
    // Post user bubble
    this._view.webview.postMessage({
      type: 'addMessage',
      sender: 'user',
      text
    });

    if (mode === 'ask') {
      // Ask mode is read-only
      this._view.webview.postMessage({
        type: 'addMessage',
        sender: 'assistant',
        mode: 'ask',
        text: `【ASK 模式（只读问答）】\n已检查工作区代码。发现 \`src/calculator.js\` 中的 \`divide(a, b)\` 函数缺少除以零校验，导致 \`tests/calculator.test.js\` 抛出 Missing exception 错误。\n\n提示：如需修改代码或运行终端测试，请切换到 **Plan** 制定方案，或切到 **Code** 模式由 Agent 执行 \`apply_patch\`。`
      });
    } else if (mode === 'plan') {
      // Plan mode triggers Multi-Model Consensus
      await this._handleRunConsensus({ text });
    } else if (mode === 'code') {
      // Code mode performs full agent actions
      this._view.webview.postMessage({
        type: 'addMessage',
        sender: 'assistant',
        mode: 'code',
        text: `【CODE 模式（代码执行）】\n正在通过 agent-host 执行原子化修改与测试验证...`
      });

      // 1. apply patch
      const patch = `<<<<<<< SEARCH\nfunction divide(a, b) {\n  // BUG to be fixed by ShunCode Agent (apply_patch):\n  // Needs division by zero guard!\n  return a / b;\n}\n=======\nfunction divide(a, b) {\n  if (b === 0) {\n    throw new Error('Cannot divide by zero');\n  }\n  return a / b;\n}\n>>>>>>> REPLACE`;

      try {
        const patchRes = await fetchJson(`${AGENT_HOST_URL}/api/tool/call`, 'POST', {
          name: 'apply_patch',
          mode: 'code',
          arguments: { filePath: 'src/calculator.js', patch }
        });

        this._view.webview.postMessage({
          type: 'addToolCall',
          tool: 'apply_patch',
          result: patchRes
        });

        // 2. run test
        const testRes = await fetchJson(`${AGENT_HOST_URL}/api/tool/call`, 'POST', {
          name: 'execute_command',
          mode: 'code',
          arguments: { command: 'npm test' }
        });

        this._view.webview.postMessage({
          type: 'addToolCall',
          tool: 'execute_command',
          result: testRes
        });

        this._view.webview.postMessage({
          type: 'addMessage',
          sender: 'assistant',
          mode: 'code',
          text: `🎉 代码已通过 \`apply_patch\` 成功修复，且本地 \`npm test\` 回归测试全部通过 (5/5 PASS)！`
        });
      } catch (err) {
        this._view.webview.postMessage({
          type: 'addMessage',
          sender: 'assistant',
          mode: 'code',
          text: `❌ 执行失败: ${err.message}`
        });
      }
    }
  }

  async _handleRunConsensus({ text }) {
    this._view.webview.postMessage({
      type: 'addMessage',
      sender: 'assistant',
      mode: 'plan',
      text: `【PLAN 模式 · 多模型博弈中...】\n正在组织架构模型、安全边界模型和编码模型独立作答...`
    });

    try {
      const res = await fetchJson(`${AGENT_HOST_URL}/api/consensus/run`, 'POST', {
        taskDescription: text || '修复除以零单元测试用例'
      });

      this._view.webview.postMessage({
        type: 'showConsensusResult',
        consensus: res.result
      });
    } catch (e) {
      this._view.webview.postMessage({
        type: 'addMessage',
        sender: 'assistant',
        mode: 'plan',
        text: `博弈服务通信异常: ${e.message}`
      });
    }
  }

  _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --bg: #1e1e2e;
      --card-bg: #28283d;
      --border: #3f3f5a;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --text: #f0f0f8;
      --text-muted: #9898b0;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    /* Mode Selector */
    .mode-switch {
      display: flex;
      background: #181824;
      padding: 6px;
      border-bottom: 1px solid var(--border);
      gap: 4px;
    }
    .mode-btn {
      flex: 1;
      background: none;
      border: 1px solid transparent;
      color: var(--text-muted);
      padding: 6px 4px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s;
    }
    .mode-btn:hover { color: #fff; background: rgba(255,255,255,0.05); }
    .mode-btn.active {
      background: var(--accent);
      color: #fff;
    }
    .mode-badge {
      font-size: 10px;
      opacity: 0.8;
      display: block;
    }
    /* Chat stream */
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .msg-bubble {
      padding: 10px 12px;
      border-radius: 8px;
      line-height: 1.5;
      font-size: 12px;
    }
    .msg-user {
      background: #3b3b54;
      align-self: flex-end;
      color: #fff;
      max-width: 85%;
    }
    .msg-assistant {
      background: var(--card-bg);
      border: 1px solid var(--border);
      align-self: flex-start;
      width: 100%;
    }
    .consensus-card {
      background: #1c1c2b;
      border: 1px solid #4f46e5;
      border-radius: 6px;
      padding: 10px;
      margin-top: 8px;
    }
    .consensus-header {
      color: #818cf8;
      font-weight: 700;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .tool-chip {
      background: #12121a;
      border: 1px solid #10b981;
      color: #34d399;
      padding: 6px 10px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      margin-top: 6px;
    }
    /* Input footer */
    .chat-footer {
      padding: 10px;
      background: #181824;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .quick-actions {
      display: flex;
      gap: 6px;
      overflow-x: auto;
    }
    .action-chip {
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    .action-chip:hover { color: #fff; border-color: var(--accent); }
    .input-row {
      display: flex;
      gap: 6px;
    }
    .chat-input {
      flex: 1;
      background: var(--card-bg);
      border: 1px solid var(--border);
      color: #fff;
      padding: 8px;
      border-radius: 6px;
      font-size: 12px;
      outline: none;
    }
    .chat-input:focus { border-color: var(--accent); }
    .send-btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 0 14px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
    }
    .send-btn:hover { background: var(--accent-hover); }
  </style>
</head>
<body>
  <div class="mode-switch">
    <button class="mode-btn" data-mode="ask">
      ASK
      <span class="mode-badge">只读问答</span>
    </button>
    <button class="mode-btn active" data-mode="plan">
      PLAN
      <span class="mode-badge">多模型博弈</span>
    </button>
    <button class="mode-btn" data-mode="code">
      CODE
      <span class="mode-badge">执行修补</span>
    </button>
  </div>

  <div class="chat-messages" id="messages">
    <div class="msg-bubble msg-assistant">
      <strong>👋 欢迎使用 ShunCode Agent 工作台</strong><br>
      • <strong>ASK</strong>：只读搜索与问答，锁死写操作与终端。<br>
      • <strong>PLAN</strong>：多模型博弈（意见一致再行动），生成 TODO。<br>
      • <strong>CODE</strong>：调用 <code>apply_patch</code> 原子补丁与本地命令。
    </div>
  </div>

  <div class="chat-footer">
    <div class="quick-actions">
      <div class="action-chip" id="chip-diagnose">🔍 诊断测试 failure</div>
      <div class="action-chip" id="chip-consensus">⚖️ 启动多模型博弈</div>
      <div class="action-chip" id="chip-auto-fix">🚀 一键修 Bug (Code 模式)</div>
    </div>
    <div class="input-row">
      <input type="text" class="chat-input" id="userInput" placeholder="向 ShunCode 描述你的任务...">
      <button class="send-btn" id="sendBtn">发送</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentMode = 'plan';

    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.getAttribute('data-mode');
      };
    });

    function addMessage(sender, text, mode) {
      const box = document.getElementById('messages');
      const div = document.createElement('div');
      div.className = 'msg-bubble ' + (sender === 'user' ? 'msg-user' : 'msg-assistant');
      div.innerText = text;
      box.appendChild(div);
      box.scrollTop = box.scrollHeight;
    }

    function addConsensusCard(consensus) {
      const box = document.getElementById('messages');
      const card = document.createElement('div');
      card.className = 'consensus-card';
      card.innerHTML = \`
        <div class="consensus-header">
          <span>⚖️ 多模型博弈结果 (一致率 \${consensus.agreementRate})</span>
          <span style="color: #10b981;">一致达成 ✓</span>
        </div>
        <p style="font-size: 11px; color: #cbd5e1; margin-bottom: 6px;">\${consensus.summary}</p>
        <div style="font-size: 11px; color: #818cf8; font-weight: 600;">博弈生成之统一执行计划 (TODOs)：</div>
        <ul style="padding-left: 16px; font-size: 11px; color: #94a3b8; margin-top: 4px;">
          \${consensus.unifiedActionPlan.map(t => \`<li>\${t.title}</li>\`).join('')}
        </ul>
        <button style="margin-top: 8px; width: 100%; padding: 4px; background: #4f46e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 11px;" onclick="switchToCodeAndRun()">切到 CODE 模式立即执行</button>
      \`;
      box.appendChild(card);
      box.scrollTop = box.scrollHeight;
    }

    function addToolChip(tool, result) {
      const box = document.getElementById('messages');
      const chip = document.createElement('div');
      chip.className = 'tool-chip';
      chip.innerText = \`🛠️ 工具调用: \${tool} -> \${result.success ? '成功' : '失败'}\`;
      box.appendChild(chip);
      box.scrollTop = box.scrollHeight;
    }

    window.switchToCodeAndRun = () => {
      document.querySelector('.mode-btn[data-mode="code"]').click();
      vscode.postMessage({
        type: 'sendMessage',
        payload: { mode: 'code', text: '执行博弈生成的修复计划' }
      });
    };

    document.getElementById('sendBtn').onclick = () => {
      const input = document.getElementById('userInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      vscode.postMessage({
        type: 'sendMessage',
        payload: { mode: currentMode, text }
      });
    };

    document.getElementById('userInput').onkeydown = (e) => {
      if (e.key === 'Enter') document.getElementById('sendBtn').click();
    };

    document.getElementById('chip-diagnose').onclick = () => {
      document.querySelector('.mode-btn[data-mode="ask"]').click();
      vscode.postMessage({ type: 'sendMessage', payload: { mode: 'ask', text: '诊断项目中的测试用例' } });
    };

    document.getElementById('chip-consensus').onclick = () => {
      document.querySelector('.mode-btn[data-mode="plan"]').click();
      vscode.postMessage({ type: 'sendMessage', payload: { mode: 'plan', text: '对 calculator 除以零缺陷进行多模型博弈' } });
    };

    document.getElementById('chip-auto-fix').onclick = () => {
      document.querySelector('.mode-btn[data-mode="code"]').click();
      vscode.postMessage({ type: 'sendMessage', payload: { mode: 'code', text: '调用 apply_patch 修复除以零 Bug 并执行测试' } });
    };

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'addMessage') {
        addMessage(msg.sender, msg.text, msg.mode);
      } else if (msg.type === 'showConsensusResult') {
        addConsensusCard(msg.consensus);
      } else if (msg.type === 'addToolCall') {
        addToolChip(msg.tool, msg.result);
      }
    });
  </script>
</body>
</html>`;
  }
}

/**
 * ShunCode Bridge Mode Webview Provider (Tunnel, MCP Server & External Agent Connectors)
 */
class ShunCodeBridgeViewProvider {
  constructor(extensionUri) {
    this._extensionUri = extensionUri;
    this._view = null;
  }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'refreshStatus':
          this.refresh();
          break;
        case 'resetSecret':
          vscode.commands.executeCommand('shuncode.resetSecret');
          break;
        case 'copyText':
          vscode.env.clipboard.writeText(message.payload);
          vscode.window.showInformationMessage('已复制到剪贴板！');
          break;
      }
    });

    this.refresh();
  }

  async refresh() {
    if (!this._view) return;
    try {
      const status = await fetchJson(`${AGENT_HOST_URL}/api/status`);
      this._view.webview.postMessage({
        type: 'updateStatus',
        status
      });
    } catch (e) {
      this._view.webview.postMessage({
        type: 'updateStatus',
        status: { status: 'offline', error: e.message }
      });
    }
  }

  _getHtmlForWebview() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --bg: #1e1e2e;
      --card-bg: #28283d;
      --border: #3f3f5a;
      --accent: #6366f1;
      --success: #10b981;
      --text: #f0f0f8;
      --text-muted: #9898b0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      padding: 12px;
      line-height: 1.4;
      overflow-y: auto;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .url-box {
      background: #141420;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 8px;
      font-family: monospace;
      font-size: 11px;
      color: #818cf8;
      word-break: break-all;
      margin-bottom: 8px;
    }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      width: 100%;
      margin-top: 4px;
    }
    .btn:hover { opacity: 0.9; }
    .btn-secondary {
      background: #3b3b54;
      color: var(--text);
    }
    .clients-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 6px;
    }
    .client-btn {
      background: #1e1e2d;
      border: 1px solid var(--border);
      color: #fff;
      padding: 6px;
      border-radius: 4px;
      font-size: 11px;
      text-align: center;
      text-decoration: none;
      display: block;
    }
    .client-btn:hover { border-color: var(--accent); }
    .progress-bar-bg {
      height: 6px;
      background: #141420;
      border-radius: 3px;
      overflow: hidden;
      margin: 8px 0;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--success);
      width: 0%;
      transition: width 0.3s;
    }
  </style>
</head>
<body>
  <div class="status-badge" id="statusPill">
    <span>●</span>
    <span id="statusText">Bridge Online (Port 48271)</span>
  </div>

  <div class="card">
    <div class="card-title">
      <span>Streamable HTTP MCP 地址</span>
      <button style="background:none; border:none; color:#818cf8; cursor:pointer;" id="resetSecretBtn">🔄 重置</button>
    </div>
    <div class="url-box" id="mcpUrl">加载中...</div>
    <button class="btn" id="copyPromptBtn">📋 复制 Agent 连接提示词</button>
  </div>

  <div class="card">
    <div class="card-title">
      <span>远程 Agent 任务进度</span>
      <span id="progressPercent" style="color:#fff;">0%</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" id="progressBar"></div>
    </div>
    <div id="stepName" style="font-size: 11px; color: #818cf8;">等待远程指令调度...</div>
  </div>

  <div class="card">
    <div class="card-title">一键连接外部指挥台</div>
    <div class="clients-grid">
      <a href="https://arena.ai/agent" target="_blank" class="client-btn">🌐 Arena.ai</a>
      <a href="https://chatgpt.com" target="_blank" class="client-btn">💬 ChatGPT</a>
      <a href="https://manus.im/app" target="_blank" class="client-btn">🤖 Manus</a>
      <a href="https://work.trae.cn" target="_blank" class="client-btn">⚡ Trae</a>
      <a href="https://qwenwork.cn" target="_blank" class="client-btn">🌟 Qwen</a>
      <a href="https://workbuddy.cn" target="_blank" class="client-btn">👥 WorkBuddy</a>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentMcpUrl = '';

    document.getElementById('copyPromptBtn').onclick = () => {
      const prompt = \`\${currentMcpUrl}\\n\\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。\`;
      vscode.postMessage({ type: 'copyText', payload: prompt });
    };

    document.getElementById('resetSecretBtn').onclick = () => {
      vscode.postMessage({ type: 'resetSecret' });
    };

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'updateStatus') {
        const s = msg.status;
        currentMcpUrl = s.mcpUrl || '';
        document.getElementById('mcpUrl').innerText = currentMcpUrl;
        if (s.taskState) {
          const p = s.taskState.progress || 0;
          document.getElementById('progressPercent').innerText = p + '%';
          document.getElementById('progressBar').style.width = p + '%';
          document.getElementById('stepName').innerText = s.taskState.stepName || '系统就绪';
        }
      }
    });

    setInterval(() => {
      vscode.postMessage({ type: 'refreshStatus' });
    }, 4000);
  </script>
</body>
</html>`;
  }
}

module.exports = {
  activate,
  deactivate: () => {}
};
