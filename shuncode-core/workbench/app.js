/* ShunCode workbench — Code-OSS-like shell talking to independent agent-host */
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const CLIENTS = [
    ['ChatGPT', 'https://chatgpt.com/'],
    ['Arena', 'https://arena.ai/agent'],
    ['WorkBuddy', 'https://www.workbuddy.cn/app'],
    ['Trae', 'https://work.trae.cn/'],
    ['Qwen', 'https://qwenwork.cn/app/chat'],
    ['Manus', 'https://manus.im/app'],
    ['Shunova', 'https://shunova.cc/']
  ];

  const WELCOME = {
    path: 'Welcome.md',
    content: `# ShunCode  打辅助，不做替代

编辑器是 Code-OSS 载体；模型循环跑在独立 **agent-host**（:48271），不写进 VS Code 内核。

## 两条路

| 路径 | 做什么 | 要登录吗 |
| --- | --- | --- |
| **Chat** | 本机 Ask / Plan / Code | 不用。自己配模型即可 |
| **Bridge** | 浏览器指挥本机工作区 | 要。隧道把 MCP 交出去 |

## 建议怎么点

1. 左侧 **Ask** → 「诊断测试失败」（只读）
2. **Plan** → 「多模型博弈」（意见一致再行动，仓库不动）
3. **Code** → 「一键修复并验证」（\`apply_patch\` + \`npm test\`）

主编辑工具是 \`apply_patch\`：带 sha256，整包预检，失败不部分写入。STALE_FILE 时重新 \`read_files\`。

演示缺陷在 \`src/calculator.js\` 的 \`divide\`。
`
  };

  const state = {
    view: 'chat',
    mode: 'plan',
    status: null,
    messages: [],
    sending: false,
    tabs: [{ path: WELCOME.path, content: WELCOME.content, virtual: true }],
    activePath: WELCOME.path,
    dirty: {},
    monaco: null,
    editor: null,
    prompt: '',
    mcpUrl: '',
    history: []
  };

  const HINTS = {
    ask: 'Ask：只读探查。不能 apply_patch，也不能跑终端。',
    plan: 'Plan：只读出方案。空输入再发送 = 从同一起点开新分支。',
    code: 'Code：允许 apply_patch 与终端。应对齐后的那条方案动手。'
  };

  function toast(text) {
    const el = $('#toast');
    el.hidden = false;
    el.textContent = text;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function renderMd(src) {
    let t = escapeHtml(src || '');
    t = t.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/^### (.*)$/gm, '<h4>$1</h4>');
    t = t.replace(/^## (.*)$/gm, '<h3>$1</h3>');
    t = t.replace(/^# (.*)$/gm, '<h2>$1</h2>');
    t = t.replace(/^\| (.+)$/gm, '<div class="tbl">$1</div>');
    t = t.replace(/^- (.*)$/gm, '<li>$1</li>');
    t = t.replace(/\n/g, '<br>');
    return t;
  }

  function termLine(text, cls = '') {
    const box = $('#terminal');
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function setMode(mode) {
    state.mode = mode;
    $$('#mode-switch .mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#mode-hint').textContent = HINTS[mode];
    $('#sb-mode').textContent = mode.toUpperCase();
  }

  function setView(view) {
    state.view = view;
    $$('#activitybar .ab-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.side-view').forEach((s) => s.classList.add('hidden'));
    const el = $(`#view-${view}`);
    if (el) el.classList.remove('hidden');
  }

  function paintTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    state.tabs.forEach((t) => {
      const b = document.createElement('div');
      b.className = 'tab' + (t.path === state.activePath ? ' on' : '');
      b.innerHTML = `<span>${escapeHtml(t.path.split('/').pop())}${state.dirty[t.path] ? ' •' : ''}</span><span class="x">✕</span>`;
      b.querySelector('span').onclick = () => openTab(t.path);
      b.querySelector('.x').onclick = (e) => {
        e.stopPropagation();
        closeTab(t.path);
      };
      tabs.appendChild(b);
    });
    $('#window-title').textContent = `${state.activePath} — ShunCode`;
    $('#sb-file').textContent = state.activePath;
  }

  function langFor(p) {
    if (p.endsWith('.js')) return 'javascript';
    if (p.endsWith('.json')) return 'json';
    if (p.endsWith('.md')) return 'markdown';
    if (p.endsWith('.css')) return 'css';
    if (p.endsWith('.html')) return 'html';
    return 'plaintext';
  }

  function currentTab() {
    return state.tabs.find((t) => t.path === state.activePath);
  }

  function applyEditorContent(text, path) {
    if (state.editor && window.monaco) {
      const model = monaco.editor.createModel(text, langFor(path));
      state.editor.setModel(model);
    } else {
      $('#editor-fallback').value = text;
    }
  }

  function getEditorContent() {
    if (state.editor) return state.editor.getValue();
    return $('#editor-fallback').value;
  }

  async function openTab(filePath, content) {
    let tab = state.tabs.find((t) => t.path === filePath);
    if (!tab) {
      if (content == null) {
        const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (!res.ok) return toast(data.error || '无法打开');
        content = data.content;
      }
      tab = { path: filePath, content, virtual: false };
      state.tabs.push(tab);
    }
    state.activePath = filePath;
    paintTabs();
    applyEditorContent(tab.content, filePath);
  }

  function closeTab(filePath) {
    if (state.tabs.length === 1) return;
    state.tabs = state.tabs.filter((t) => t.path !== filePath);
    if (state.activePath === filePath) {
      state.activePath = state.tabs[state.tabs.length - 1].path;
      applyEditorContent(currentTab().content, state.activePath);
    }
    paintTabs();
  }

  async function saveActive() {
    const tab = currentTab();
    if (!tab || tab.virtual) return;
    const content = getEditorContent();
    const res = await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tab.path, content })
    });
    const data = await res.json();
    if (!res.ok) return toast(data.error || '保存失败');
    tab.content = content;
    delete state.dirty[tab.path];
    paintTabs();
    toast('已保存 ' + tab.path);
  }

  function treeHtml(items, depth = 0) {
    if (!items) return '';
    return items.map((it) => {
      if (it.type === 'directory') {
        return `<div class="tree-item dir" style="padding-left:${8 + depth * 12}px"><span class="ico">▸</span>${escapeHtml(it.name)}</div>
          ${treeHtml(it.children || [], depth + 1)}`;
      }
      return `<div class="tree-item" data-path="${escapeHtml(it.path)}" style="padding-left:${8 + depth * 12}px"><span class="ico">∷</span>${escapeHtml(it.name)}</div>`;
    }).join('');
  }

  async function loadTree() {
    const res = await fetch('/api/files/tree');
    const data = await res.json();
    const box = $('#file-tree');
    box.innerHTML = treeHtml(data.items || []);
    box.onclick = (e) => {
      const item = e.target.closest('.tree-item[data-path]');
      if (item) openTab(item.dataset.path);
    };
  }

  function emptyWelcome() {
    return `<div class="welcome">
      <h2>ShunCode</h2>
      <p>打辅助，不做替代。ChatGPT Plus、Codex、Arena、你自己的 API 都继续用；它只是把本机项目接出去。</p>
      <p><strong>Ask</strong> 只读 · <strong>Plan</strong> 多模型博弈，意见一致再行动 · <strong>Code</strong> 才改仓库。</p>
      <p class="tiny">模型跑在独立 agent-host，不进 VS Code 内核。主工具 apply_patch 带版本哈希。</p>
    </div>`;
  }

  function paintChat() {
    const box = $('#chat-stream');
    if (!state.messages.length) {
      box.innerHTML = emptyWelcome();
      return;
    }
    box.innerHTML = '';
    state.messages.forEach((m) => box.appendChild(renderMsg(m)));
    box.scrollTop = box.scrollHeight;
  }

  function renderMsg(m) {
    const wrap = document.createElement('div');
    if (m.kind === 'user') {
      wrap.className = 'msg user';
      wrap.textContent = m.text;
      return wrap;
    }
    if (m.kind === 'status') {
      wrap.className = 'status-line';
      wrap.textContent = m.text;
      return wrap;
    }
    if (m.kind === 'tool') {
      wrap.className = 'tool-card';
      const ok = m.ok !== false && !m.error;
      const body = escapeHtml(JSON.stringify(m.error ? { error: m.error } : summarizeTool(m.result), null, 2));
      wrap.innerHTML = `<header><span class="name">${escapeHtml(m.name)}</span>${ok ? '<span class="ok">ok</span>' : '<span class="bad">err</span>'}</header><pre>${body}</pre>`;
      wrap.querySelector('header').onclick = () => {
        const pre = wrap.querySelector('pre');
        pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
      };
      return wrap;
    }
    if (m.kind === 'consensus') {
      wrap.className = 'consensus';
      const r = m.result || {};
      const parts = r.participants || [];
      wrap.innerHTML = `
        <h3><span>多模型博弈 · 意见一致再行动</span><span>${escapeHtml(r.agreementRate || '')}</span></h3>
        <div class="branch-tabs">${['合并', ...parts.map((p) => p.id || p.model)].map((lab, i) =>
          `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(lab)}</button>`
        ).join('')}</div>
        <div class="branch-body"></div>
        <button type="button" class="adopt">采纳共识并切到 Code 执行</button>`;
      const body = $('.branch-body', wrap);
      const show = (i) => {
        $$('.branch-tabs button', wrap).forEach((b, idx) => b.classList.toggle('on', idx === i));
        if (i === 0) {
          body.innerHTML = `<p>${renderMd(r.canonical || r.summary || '')}</p>
            <ul>${(r.unifiedActionPlan || []).map((t) => `<li>${escapeHtml(t.title)}</li>`).join('')}</ul>
            ${(r.disagreements || []).map((d) => `<p class="tiny">分歧：${escapeHtml(d.topic)} — ${escapeHtml(d.detail)}</p>`).join('')}`;
        } else {
          const p = parts[i - 1];
          body.innerHTML = `<p><strong>${escapeHtml(p.model)}</strong> · ${escapeHtml(p.focus || '')} · ${escapeHtml(p.verdict || '')}</p>
            <div class="md">${renderMd(p.answer || '')}</div>`;
        }
      };
      show(0);
      wrap.querySelector('.branch-tabs').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) show(Number(b.dataset.i));
      };
      $('.adopt', wrap).onclick = () => {
        setMode('code');
        sendChat('按已对齐方案修复除零并运行 npm test');
      };
      return wrap;
    }
    wrap.className = 'msg assistant';
    wrap.innerHTML = `<div class="md">${renderMd(m.text || '')}</div>`;
    return wrap;
  }

  function summarizeTool(result) {
    if (result == null) return result;
    if (typeof result !== 'object') return result;
    const copy = { ...result };
    if (typeof copy.content === 'string' && copy.content.length > 800) {
      copy.content = copy.content.slice(0, 800) + '\n…';
    }
    if (typeof copy.stdout === 'string' && copy.stdout.length > 1200) {
      copy.stdout = copy.stdout.slice(0, 1200) + '\n…';
    }
    return copy;
  }

  function pushMsg(m) {
    state.messages.push(m);
    const box = $('#chat-stream');
    if (box.querySelector('.welcome')) box.innerHTML = '';
    box.appendChild(renderMsg(m));
    box.scrollTop = box.scrollHeight;
  }

  async function sendChat(text) {
    if (state.sending) return;
    const message = text != null ? text : $('#chat-input').value;
    if (text == null) $('#chat-input').value = '';
    state.sending = true;
    $('#btn-send').disabled = true;
    if (message) {
      pushMsg({ kind: 'user', text: message });
      state.history.push({ role: 'user', content: message });
    } else {
      pushMsg({ kind: 'user', text: '（空输入 · 分支作答）' });
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: state.mode,
          message: message || '',
          history: state.history.slice(-12)
        })
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let assistantText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          handleEvent(ev);
          if (ev.type === 'message' && ev.text) assistantText += ev.text;
        }
      }
      if (assistantText) state.history.push({ role: 'assistant', content: assistantText });
    } catch (err) {
      pushMsg({ kind: 'assistant', text: '请求失败：' + err.message });
    } finally {
      state.sending = false;
      $('#btn-send').disabled = false;
      refreshStatus();
      loadTree();
    }
  }

  function handleEvent(ev) {
    if (ev.type === 'status') pushMsg({ kind: 'status', text: ev.text });
    else if (ev.type === 'tool') {
      pushMsg({ kind: 'tool', name: ev.name, args: ev.args, result: ev.result, error: ev.error, ok: ev.ok });
      if (ev.name === 'run_command' || ev.name === 'execute_command') {
        const r = ev.result || {};
        if (r.stdout) termLine(r.stdout);
        if (r.stderr) termLine(r.stderr, 'err');
        if (r.command) termLine(`$ ${r.command}  (exit ${r.exitCode}, ${r.durationMs}ms)`, r.exitCode ? 'err' : 'ok');
      }
      if (ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
        const p = ev.result.filePath;
        const tab = state.tabs.find((t) => t.path === p);
        if (tab) {
          fetch(`/api/files/content?path=${encodeURIComponent(p)}`)
            .then((r) => r.json())
            .then((d) => {
              tab.content = d.content;
              if (state.activePath === p) applyEditorContent(d.content, p);
            });
        }
      }
    } else if (ev.type === 'consensus') pushMsg({ kind: 'consensus', result: ev.result });
    else if (ev.type === 'message') pushMsg({ kind: 'assistant', text: ev.text });
    else if (ev.type === 'error') pushMsg({ kind: 'assistant', text: '错误：' + ev.message });
  }

  async function refreshStatus() {
    const res = await fetch('/api/status');
    const s = await res.json();
    state.status = s;
    state.mcpUrl = s.mcpUrl;
    state.prompt = s.prompt;
    $('#mcp-url').textContent = s.mcpUrl;
    $('#install-id').textContent = s.installId;
    $('#bridge-account').textContent = s.bridgeAccount
      ? `${s.bridgeAccount.provider} @${s.bridgeAccount.username} · ${s.bridgeAccount.license} · 当前设备已授权`
      : '';
    const running = s.bridgeRunning;
    $('#bridge-pill').textContent = running ? '运行中' : '未启动';
    $('#bridge-pill').className = 'pill ' + (running ? 'on' : 'off');
    $('#sb-bridge').textContent = running
      ? 'ShunCode · Bridge Online'
      : `ShunCode · agent-host :${s.port}`;
    const ts = s.taskState || {};
    $('#task-step').textContent = ts.stepName || ts.lastMessage || '等待调度';
    $('#task-pct').textContent = (ts.progress || 0) + '%';
    $('#task-bar').style.width = (ts.progress || 0) + '%';
    const todos = ts.todos || [];
    $('#todo-list').innerHTML = todos.length
      ? todos.map((t) => `<li>${t.status === 'completed' ? '✓' : t.status === 'failed' ? '✕' : '○'} ${escapeHtml(t.title)}</li>`).join('')
      : '<li class="tiny">等待 set_todos</li>';

    const sel = $('#model-select');
    const current = sel.value;
    sel.innerHTML = (s.models || []).map((m) =>
      `<option value="${escapeHtml(m.id)}" ${m.id === s.activeModelId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
    ).join('');
    if (current) sel.value = current;
  }

  function bindUi() {
    $$('#activitybar .ab-btn').forEach((b) => {
      b.onclick = () => setView(b.dataset.view);
    });
    $$('#mode-switch .mode-btn').forEach((b) => {
      b.onclick = () => setMode(b.dataset.mode);
    });
    $('#btn-send').onclick = () => sendChat();
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      }
    });
    $('#chips').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setMode(b.dataset.mode);
      sendChat(b.dataset.text);
    };
    $('#btn-refresh-tree').onclick = loadTree;
    $('#btn-help').onclick = () => {
      setView('chat');
      openTab(WELCOME.path, WELCOME.content);
    };
    $('#btn-search').onclick = async () => {
      const q = $('#search-q').value.trim();
      if (!q) return;
      const res = await fetch('/api/tool/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'search_files', mode: 'ask', arguments: { query: q } })
      });
      const data = await res.json();
      const hits = (data.result && data.result.matches) || [];
      $('#search-results').innerHTML = hits.length
        ? hits.map((h) => `<div class="search-hit" data-path="${escapeHtml(h.file)}"><b>${escapeHtml(h.file)}:${h.line}</b><p>${escapeHtml(h.content)}</p></div>`).join('')
        : '<p class="tiny">没有命中</p>';
      $('#search-results').onclick = (e) => {
        const hit = e.target.closest('.search-hit');
        if (hit) openTab(hit.dataset.path);
      };
    };
    $('#btn-copy-url').onclick = async () => {
      await navigator.clipboard.writeText(state.mcpUrl);
      toast('已复制 MCP 地址');
    };
    $('#btn-copy-prompt').onclick = async () => {
      await navigator.clipboard.writeText(state.prompt);
      toast('已复制提示词，请整段作为第一句发出');
    };
    $('#btn-reset-secret').onclick = async () => {
      await fetch('/api/bridge/reset-secret', { method: 'POST' });
      await refreshStatus();
      toast('Secret 已重置，旧链接立即失效');
    };
    $('#btn-bridge-start').onclick = async () => {
      const res = await fetch('/api/bridge/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelProvider: $('#tunnel-select').value })
      });
      const data = await res.json();
      await refreshStatus();
      toast(data.success ? 'Bridge 已启动' : data.error);
    };
    $('#btn-bridge-stop').onclick = async () => {
      await fetch('/api/bridge/stop', { method: 'POST' });
      await refreshStatus();
    };
    $('#btn-save-model').onclick = async () => {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeModelId: 'custom',
          model: {
            id: 'custom',
            name: $('#m-name').value || '自定义 API',
            protocol: 'chat.completions',
            baseUrl: $('#m-base').value.trim(),
            apiKey: $('#m-key').value.trim(),
            modelId: $('#m-id').value.trim()
          }
        })
      });
      $('#model-status').textContent = '已保存。之后 Chat 会走这个兼容 OpenAI 的接口；失败则回退内置 Agent。';
      await refreshStatus();
    };
    $('#btn-use-builtin').onclick = async () => {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeModelId: 'builtin' })
      });
      $('#model-status').textContent = '已改回内置 Demo Agent。';
      await refreshStatus();
    };
    $('#model-select').onchange = async () => {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeModelId: $('#model-select').value })
      });
    };
    $('#term-form').onsubmit = async (e) => {
      e.preventDefault();
      const cmd = $('#term-input').value.trim();
      if (!cmd) return;
      $('#term-input').value = '';
      termLine('$ ' + cmd, 'info');
      const res = await fetch('/api/tool/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'run_command', mode: 'code', arguments: { command: cmd } })
      });
      const data = await res.json();
      const r = data.result || {};
      if (r.stdout) termLine(r.stdout);
      if (r.stderr) termLine(r.stderr, 'err');
      termLine(`exit ${r.exitCode}`, r.exitCode ? 'err' : 'ok');
    };
    $('#btn-clear-term').onclick = () => { $('#terminal').innerHTML = ''; };

    let drag = false;
    $('#sash').onmousedown = () => { drag = true; };
    window.onmousemove = (e) => {
      if (!drag) return;
      const w = e.clientX - 48;
      if (w > 260 && w < 560) {
        document.documentElement.style.setProperty('--sidebar', w + 'px');
        $('#sidebar').style.width = w + 'px';
      }
    };
    window.onmouseup = () => { drag = false; };

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActive();
      }
    });
  }

  function fillClients() {
    $('#client-grid').innerHTML = CLIENTS.map(([name, url]) =>
      `<a href="${url}" target="_blank" rel="noopener">${name}</a>`
    ).join('');
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let ws;
    try {
      ws = new WebSocket(`${proto}//${location.host}/ws`);
    } catch {
      return;
    }
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'command_output' && msg.payload && msg.payload.chunk) {
        termLine(msg.payload.chunk, msg.payload.stream === 'stderr' ? 'err' : '');
      }
      if (msg.type === 'file_patched' && msg.payload) {
        toast('已打补丁 ' + msg.payload.filePath);
        loadTree();
      }
      if (msg.type === 'progress_updated') refreshStatus();
    };
  }

  function loadMonaco() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
      script.onload = () => {
        window.require.config({
          paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
        });
        window.require(['vs/editor/editor.main'], () => {
          state.editor = monaco.editor.create($('#editor'), {
            value: WELCOME.content,
            language: 'markdown',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'Cascadia Code, JetBrains Mono, Consolas, monospace',
            scrollBeyondLastLine: false
          });
          state.editor.onDidChangeModelContent(() => {
            const tab = currentTab();
            if (!tab || tab.virtual) return;
            tab.content = state.editor.getValue();
            state.dirty[tab.path] = true;
            paintTabs();
          });
          resolve(true);
        });
      };
      script.onerror = () => {
        $('#editor').classList.add('hidden');
        $('#editor-fallback').classList.remove('hidden');
        $('#editor-fallback').value = WELCOME.content;
        resolve(false);
      };
      document.head.appendChild(script);
      setTimeout(() => {
        if (!state.editor) {
          $('#editor').classList.add('hidden');
          $('#editor-fallback').classList.remove('hidden');
          $('#editor-fallback').value = WELCOME.content;
          resolve(false);
        }
      }, 7000);
    });
  }

  async function boot() {
    bindUi();
    fillClients();
    setMode('plan');
    setView('chat');
    paintChat();
    paintTabs();
    termLine('ShunCode terminal ready. Workspace attached.', 'info');
    await Promise.all([refreshStatus(), loadTree(), loadMonaco()]);
    connectWs();
    setTimeout(() => $('#splash').classList.add('gone'), 700);
  }

  boot().catch((err) => {
    console.error(err);
    $('#splash').classList.add('gone');
  });
})();
