// ShunCode Bridge Studio Frontend Controller

let ws = null;
let currentSecret = '';
let currentMcpUrl = '';
let currentSelectedFile = null;

// Preset simulator payloads
const SIMULATOR_PRESETS = {
  read_file: {
    filePath: 'src/calculator.js',
    offset: 1,
    limit: 50
  },
  apply_patch: {
    filePath: 'src/calculator.js',
    patch: `<<<<<<< SEARCH
function divide(a, b) {
  // BUG: Missing check for division by zero!
  // Should throw new Error('Cannot divide by zero');
  return a / b;
}
=======
function divide(a, b) {
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}
>>>>>>> REPLACE`
  },
  execute_command: {
    command: 'npm test',
    cwd: '.',
    timeoutSec: 15
  },
  report_progress: {
    stepName: '修复单元测试',
    message: '正在使用 apply_patch 修改 divide 函数',
    percentage: 60
  },
  set_todos: {
    todos: [
      { id: '1', title: '执行 npm test 定位测试失败点', status: 'completed' },
      { id: '2', title: '读取 src/calculator.js 源码', status: 'completed' },
      { id: '3', title: '调用 apply_patch 修复除以零校验 Bug', status: 'in_progress' },
      { id: '4', title: '重新运行 npm test 验证回归测试', status: 'pending' }
    ]
  },
  grep_search: {
    query: 'divide',
    searchPath: 'src',
    isRegex: false
  },
  list_dir: {
    dirPath: '.',
    recursive: true,
    maxDepth: 3
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initWebSocket();
  fetchInitialStatus();
  loadFileTree();
  bindEvents();
  initSimulatorDefaults();
});

function showToast(msg) {
  const toast = document.getElementById('toast-notify');
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 2200);
}

// Tab Switching
function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    });
  });
}

// WebSocket Setup
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    appendTerminalLog('[$] WebSocket connected to ShunCode Bridge IPC.', 'stream-info');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleBridgeEvent(data);
    } catch (e) {
      console.error('WS parse error', e);
    }
  };

  ws.onclose = () => {
    appendTerminalLog('[!] WebSocket disconnected. Reconnecting in 3s...', 'stream-stderr');
    setTimeout(initWebSocket, 3000);
  };
}

// Handle Real-Time Bridge Events
function handleBridgeEvent(event) {
  const { type, payload, timestamp } = event;

  switch (type) {
    case 'tool_call_start': {
      addActivityCard({
        type: 'start',
        tool: payload.tool,
        time: timestamp,
        data: payload.args,
        status: 'running'
      });
      break;
    }

    case 'tool_call_end': {
      addActivityCard({
        type: 'end',
        tool: payload.tool,
        time: timestamp,
        success: payload.success,
        duration: payload.durationMs,
        data: payload.success ? payload.result : payload.error,
        status: payload.success ? 'success' : 'error'
      });
      break;
    }

    case 'file_patched': {
      renderDiffView(payload);
      loadFileTree();
      if (currentSelectedFile === payload.filePath) {
        loadFileContent(payload.filePath);
      }
      break;
    }

    case 'command_output': {
      appendTerminalLog(payload.chunk, payload.stream === 'stderr' ? 'stream-stderr' : 'stream-stdout');
      break;
    }

    case 'command_started': {
      appendTerminalLog(`\n[$] execute: ${payload.command} (cwd: ${payload.cwd})`, 'stream-info');
      break;
    }

    case 'command_finished': {
      const statusText = payload.exitCode === 0 ? 'SUCCESS' : `FAILED (code ${payload.exitCode})`;
      const style = payload.exitCode === 0 ? 'stream-info' : 'stream-stderr';
      appendTerminalLog(`[✓] finished in ${payload.durationMs}ms -> ${statusText}\n`, style);
      break;
    }

    case 'progress_updated': {
      updateProgressUI(payload);
      break;
    }

    case 'todos_updated': {
      updateTodosUI(payload.todos);
      break;
    }

    case 'secret_rotated': {
      fetchInitialStatus();
      showToast('MCP Secret Token 已成功重置！');
      break;
    }
  }
}

// Fetch Initial Status from REST API
async function fetchInitialStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    currentSecret = data.bridge.secretKey;
    const origin = window.location.origin;
    currentMcpUrl = `${origin}/mcp/${currentSecret}`;

    document.getElementById('mcp-url-display').innerText = currentMcpUrl;
    
    // Set prompt preview
    const promptTemplate = `${currentMcpUrl}\n\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。`;
    document.getElementById('prompt-text-preview').innerText = promptTemplate;

    // Render tools catalog
    renderToolsCatalog(data.tools);

    // Initial tasks
    if (data.taskState) {
      updateProgressUI(data.taskState);
      if (data.taskState.todos) {
        updateTodosUI(data.taskState.todos);
      }
    }
  } catch (err) {
    console.error('Failed to fetch status', err);
  }
}

function renderToolsCatalog(tools) {
  const container = document.getElementById('tools-badge-container');
  if (!container || !tools) return;
  container.innerHTML = tools.map(t => 
    `<span class="tool-tag" title="${t.description}">${t.name}</span>`
  ).join('');
}

// File Explorer
async function loadFileTree() {
  try {
    const res = await fetch('/api/workspace/tree');
    const data = await res.json();
    const tree = document.getElementById('file-tree-container');
    tree.innerHTML = '';

    function renderItems(items, container, depth = 0) {
      for (const item of items) {
        const li = document.createElement('li');
        li.className = `file-item ${item.type === 'directory' ? 'folder' : ''}`;
        li.style.paddingLeft = `${depth * 14 + 8}px`;

        const icon = item.type === 'directory' ? '📁' : '📄';
        li.innerHTML = `<span>${icon}</span> <span>${item.name}</span>`;

        if (item.type === 'file') {
          li.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            loadFileContent(item.path);
          };
        }

        container.appendChild(li);

        if (item.children && item.children.length > 0) {
          renderItems(item.children, container, depth + 1);
        }
      }
    }

    if (data.items && data.items.length > 0) {
      renderItems(data.items, tree);
    } else {
      tree.innerHTML = '<li class="file-item">工作区暂无文件</li>';
    }
  } catch (err) {
    console.error('Failed to load file tree', err);
  }
}

// Load File Content to Editor
async function loadFileContent(filePath) {
  try {
    currentSelectedFile = filePath;
    document.getElementById('current-editing-file').innerText = filePath;
    const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    document.getElementById('code-editor-area').value = data.content || '';

    // Switch to editor tab
    document.querySelector('.tab-btn[data-tab="tab-editor"]').click();
  } catch (err) {
    showToast('读取文件失败: ' + err.message);
  }
}

// Save File
async function saveCurrentFile() {
  if (!currentSelectedFile) {
    showToast('请先在左侧选择一个文件！');
    return;
  }
  const content = document.getElementById('code-editor-area').value;
  try {
    const res = await fetch('/api/workspace/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentSelectedFile, content })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`✅ 文件 "${currentSelectedFile}" 保存成功！`);
    }
  } catch (err) {
    showToast('保存失败: ' + err.message);
  }
}

// Activity Stream Card
function addActivityCard({ type, tool, time, success, duration, data, status }) {
  const container = document.getElementById('activity-stream-list');
  const card = document.createElement('div');
  
  let toolClass = 'activity-card';
  if (tool === 'apply_patch') toolClass += ' tool-patch';
  else if (tool === 'execute_command') toolClass += ' tool-command';
  else if (tool === 'read_file') toolClass += ' tool-read';

  card.className = toolClass;

  const timeStr = new Date(time || Date.now()).toLocaleTimeString();
  const statusBadge = type === 'start' 
    ? '<span style="color: #60a5fa;">⏳ 调度中</span>' 
    : (success ? `<span style="color: #34d399;">✓ 完成 (${duration}ms)</span>` : '<span style="color: #f87171;">✗ 失败</span>');

  const formattedData = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);

  card.innerHTML = `
    <div class="activity-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="tool-name-badge">🛠️ ${tool}</span>
        ${statusBadge}
      </div>
      <span class="activity-time">${timeStr}</span>
    </div>
    <pre class="activity-body">${escapeHtml(formattedData)}</pre>
  `;

  container.insertBefore(card, container.firstChild);
}

// Diff Inspector
function renderDiffView(payload) {
  const diffArea = document.getElementById('diff-content-area');
  const title = document.getElementById('diff-file-title');
  title.innerText = `最近变更: ${payload.filePath} (${payload.additions ? '+' + payload.additions : ''} ${payload.deletions ? '-' + payload.deletions : ''})`;

  if (!payload.diff) {
    diffArea.innerHTML = `<p style="color: #34d399;">新创建文件: ${payload.filePath}</p>`;
    return;
  }

  const lines = payload.diff.split('\n');
  const rendered = lines.map(line => {
    let cls = '';
    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'diff-line-add';
    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'diff-line-del';
    else if (line.startsWith('@@')) cls = 'diff-line-hunk';
    return `<div class="${cls}">${escapeHtml(line)}</div>`;
  }).join('');

  diffArea.innerHTML = rendered;

  // Auto switch to Diff tab if user wants to see
  const tabDiff = document.querySelector('.tab-btn[data-tab="tab-diff"]');
  if (tabDiff) {
    tabDiff.style.color = '#34d399';
    setTimeout(() => { tabDiff.style.color = ''; }, 2000);
  }
}

// Terminal Log Stream
function appendTerminalLog(text, className = '') {
  const box = document.getElementById('terminal-stream-box');
  const item = document.createElement('span');
  item.className = className;
  item.innerText = text;
  box.appendChild(item);
  box.scrollTop = box.scrollHeight;
}

// Progress & Todos
function updateProgressUI(state) {
  const percent = state.progress || 0;
  document.getElementById('task-percent-label').innerText = `${percent}%`;
  document.getElementById('task-progress-bar').style.width = `${percent}%`;
  document.getElementById('task-step-label').innerText = state.stepName || '任务执行中...';
  document.getElementById('task-last-message').innerText = state.lastMessage || '';
}

function updateTodosUI(todos) {
  const container = document.getElementById('todo-list-container');
  if (!todos || todos.length === 0) {
    container.innerHTML = '<li class="todo-item"><span class="todo-checkbox">⏳</span><span>等待远端 Agent 下发任务分解...</span></li>';
    return;
  }

  container.innerHTML = todos.map(t => {
    let icon = '⭕';
    let cls = 'todo-item';
    if (t.status === 'completed') {
      icon = '✅';
      cls += ' completed';
    } else if (t.status === 'in_progress') {
      icon = '🔄';
      cls += ' in_progress';
    } else if (t.status === 'failed') {
      icon = '❌';
    }

    return `
      <li class="${cls}">
        <span class="todo-checkbox">${icon}</span>
        <span>${escapeHtml(t.title)}</span>
      </li>
    `;
  }).join('');
}

// Simulator setup
function initSimulatorDefaults() {
  const select = document.getElementById('sim-tool-select');
  const input = document.getElementById('sim-args-input');

  function updateInput() {
    const val = select.value;
    input.value = JSON.stringify(SIMULATOR_PRESETS[val] || {}, null, 2);
  }

  select.addEventListener('change', updateInput);
  updateInput();

  document.getElementById('btn-run-sim-call').addEventListener('click', async () => {
    const tool = select.value;
    let args = {};
    try {
      args = JSON.parse(input.value);
    } catch (e) {
      showToast('参数 JSON 格式错误: ' + e.message);
      return;
    }

    try {
      const res = await fetch('/api/simulator/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, arguments: args })
      });
      const data = await res.json();
      document.getElementById('sim-result-area').innerText = JSON.stringify(data, null, 2);
    } catch (err) {
      document.getElementById('sim-result-area').innerText = 'Error: ' + err.message;
    }
  });

  // Simulator Automated Presets
  document.getElementById('sim-btn-diagnose').onclick = async () => {
    select.value = 'execute_command';
    input.value = JSON.stringify(SIMULATOR_PRESETS.execute_command, null, 2);
    document.getElementById('btn-run-sim-call').click();
  };

  document.getElementById('sim-btn-apply-fix').onclick = async () => {
    select.value = 'apply_patch';
    input.value = JSON.stringify(SIMULATOR_PRESETS.apply_patch, null, 2);
    document.getElementById('btn-run-sim-call').click();
  };

  document.getElementById('sim-btn-verify').onclick = async () => {
    select.value = 'execute_command';
    input.value = JSON.stringify(SIMULATOR_PRESETS.execute_command, null, 2);
    document.getElementById('btn-run-sim-call').click();
  };

  // Full Flow Automation Demo
  document.getElementById('sim-btn-full-flow').onclick = async () => {
    showToast('🚀 正在模拟远端 Agent 完整修复工作流...');

    // 1. set_todos
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'set_todos', arguments: SIMULATOR_PRESETS.set_todos })
    });

    // 2. report_progress step 1
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'report_progress',
        arguments: { stepName: '阶段一：运行测试', message: '正在执行 npm test 定位测试失败点', percentage: 25 }
      })
    });

    // 3. execute_command -> fails on zero division
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'execute_command', arguments: { command: 'npm test' } })
    });

    await new Promise(r => setTimeout(r, 1200));

    // 4. read_file
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'read_file', arguments: { filePath: 'src/calculator.js' } })
    });

    // 5. report_progress step 2
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'report_progress',
        arguments: { stepName: '阶段二：应用补丁', message: '检测到除以零未捕获，正在调用 apply_patch 修复', percentage: 70 }
      })
    });

    // 6. apply_patch
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'apply_patch', arguments: SIMULATOR_PRESETS.apply_patch })
    });

    await new Promise(r => setTimeout(r, 1200));

    // 7. re-run test
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'execute_command', arguments: { command: 'npm test' } })
    });

    // 8. report_progress completed
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'report_progress',
        arguments: { stepName: '阶段三：验证通过', message: '所有单元测试均已通过 (Green)！', percentage: 100 }
      })
    });

    // 9. update todos to all completed
    await fetch('/api/simulator/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'set_todos',
        arguments: {
          todos: [
            { id: '1', title: '执行 npm test 定位测试失败点', status: 'completed' },
            { id: '2', title: '读取 src/calculator.js 源码', status: 'completed' },
            { id: '3', title: '调用 apply_patch 修复除以零校验 Bug', status: 'completed' },
            { id: '4', title: '重新运行 npm test 验证回归测试', status: 'completed' }
          ]
        }
      })
    });

    showToast('🎉 完整闭环修 Bug 演示完成！');
  };
}

// Bind Global UI Events
function bindEvents() {
  document.getElementById('btn-copy-url').onclick = () => {
    navigator.clipboard.writeText(currentMcpUrl);
    showToast('MCP 地址已复制！');
  };

  document.getElementById('btn-copy-prompt').onclick = () => {
    const prompt = `${currentMcpUrl}\n\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。`;
    navigator.clipboard.writeText(prompt);
    showToast('已复制 Agent 连接提示词！');
  };

  document.getElementById('btn-rotate-secret').onclick = async () => {
    if (confirm('确定要重置 MCP Secret 吗？旧的连接地址将立即失效！')) {
      const res = await fetch('/api/bridge/rotate-secret', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        fetchInitialStatus();
      }
    }
  };

  document.getElementById('btn-run-tests').onclick = async () => {
    showToast('正在本地执行测试套件...');
    await fetch('/api/workspace/run-tests', { method: 'POST' });
  };

  document.getElementById('btn-refresh-files').onclick = () => {
    loadFileTree();
    showToast('文件目录已刷新');
  };

  document.getElementById('btn-save-file').onclick = saveCurrentFile;

  document.getElementById('btn-clear-logs').onclick = () => {
    document.getElementById('activity-stream-list').innerHTML = '';
  };

  document.getElementById('btn-clear-terminal').onclick = () => {
    document.getElementById('terminal-stream-box').innerHTML = '';
  };

  document.getElementById('btn-reset-task').onclick = async () => {
    await fetch('/api/task/reset', { method: 'POST' });
    showToast('任务看板已重置');
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
