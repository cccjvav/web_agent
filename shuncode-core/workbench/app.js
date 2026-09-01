(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const SITES = {
    chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
    arena: { name: 'Arena', url: 'https://arena.ai/agent' },
    workbuddy: { name: 'WorkBuddy', url: 'https://www.workbuddy.cn/app' },
    trae: { name: 'Trae', url: 'https://work.trae.cn/' },
    qwen: { name: 'Qwen', url: 'https://qwenwork.cn/app/chat' },
    manus: { name: 'Manus', url: 'https://manus.im/app' },
    shunova: { name: 'Shunova', url: 'https://shunova.cc/' }
  };

  const state = {
    mode: 'plan',
    status: null,
    messages: [],
    history: [],
    sending: false,
    tabs: [{ id: 'welcome', title: '欢迎', kind: 'welcome' }],
    activeTab: 'welcome',
    files: {},
    monaco: null,
    editor: null,
    dirty: {},
    stats: { calls: 0, fail: 0, totalMs: 0 },
    loggedIn: true,
    custom: null,
    stayOnBridge: false
  };

  function toast(text) {
    const el = $('#toast');
    el.hidden = false;
    el.textContent = text;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2200);
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

  function openModal(page) {
    $('#modal').classList.remove('hidden');
    showPage(page || 'overview');
  }
  function closeModal() { $('#modal').classList.add('hidden'); }

  function showPage(id) {
    $$('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
    $$('.page').forEach((p) => p.classList.toggle('hidden', p.id !== `page-${id}`));
  }

  function setRight(which) {
    $('#rb-chat-tab').classList.toggle('on', which === 'chat');
    $('#rb-bridge-tab').classList.toggle('on', which === 'bridge');
    $('#right-chat').classList.toggle('hidden', which !== 'chat');
    $('#right-bridge').classList.toggle('hidden', which !== 'bridge');
  }

  function paintTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    state.tabs.forEach((t) => {
      const d = document.createElement('div');
      d.className = 'tab' + (t.id === state.activeTab ? ' on' : '');
      d.innerHTML = `<span>${escapeHtml(t.title)}</span><span class="x">✕</span>`;
      d.querySelector('span').onclick = () => activateTab(t.id);
      d.querySelector('.x').onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
      tabs.appendChild(d);
    });
    const cur = state.tabs.find((t) => t.id === state.activeTab);
    $('#window-title').textContent = cur ? cur.title : '欢迎';
    $('#sb-file').textContent = cur ? cur.title : '欢迎';
    document.title = `${cur ? cur.title : '欢迎'} — ShunCode`;
  }

  function activateTab(id) {
    state.activeTab = id;
    const t = state.tabs.find((x) => x.id === id);
    $('#welcome').classList.toggle('hidden', !t || t.kind !== 'welcome');
    $('#browser').classList.toggle('hidden', !t || t.kind !== 'browser');
    $('#agent-pane').classList.toggle('hidden', !t || t.kind !== 'agent');
    $('#diff-pane').classList.toggle('hidden', !t || t.kind !== 'diff');
    const showEditor = t && t.kind === 'file';
    if (state.editor) $('#editor').classList.toggle('hidden', !showEditor);
    else $('#editor-fallback').classList.toggle('hidden', !showEditor);
    if (showEditor) applyEditor(t);
    if (t && t.kind === 'browser') renderBrowser(t);
    if (t && t.kind === 'diff') paintDiff(t);
    paintTabs();
  }

  function closeTab(id) {
    if (state.tabs.length === 1) return;
    state.tabs = state.tabs.filter((t) => t.id !== id);
    if (state.activeTab === id) activateTab(state.tabs[state.tabs.length - 1].id);
    else paintTabs();
  }

  function openAgentWindow() {
    let tab = state.tabs.find((t) => t.id === 'agent');
    if (!tab) {
      tab = { id: 'agent', title: '智能体', kind: 'agent' };
      state.tabs.push(tab);
    }
    setRight('chat');
    activateTab('agent');
    paintChat();
  }

  function openDiff(filePath, diff) {
    const id = 'diff:' + filePath;
    let tab = state.tabs.find((t) => t.id === id);
    if (!tab) {
      tab = { id, title: filePath.split('/').pop() + ' (diff)', kind: 'diff', path: filePath, diff };
      state.tabs.push(tab);
    } else {
      tab.diff = diff;
    }
    activateTab(id);
  }

  function paintDiff(tab) {
    $('#diff-title').textContent = tab.path || 'Diff';
    const lines = String(tab.diff || '').split('\n');
    $('#diff-body').innerHTML = lines.map((line) => {
      const cls = line.startsWith('+') && !line.startsWith('+++') ? 'diff-add'
        : line.startsWith('-') && !line.startsWith('---') ? 'diff-del'
          : line.startsWith('@@') ? 'diff-hunk' : '';
      return `<div class="${cls}">${escapeHtml(line) || ' '}</div>`;
    }).join('');
  }

  function ensureWelcome() {
    if (!state.tabs.some((t) => t.id === 'welcome')) {
      state.tabs.unshift({ id: 'welcome', title: '欢迎', kind: 'welcome' });
    }
    activateTab('welcome');
  }

  async function openFile(filePath) {
    let tab = state.tabs.find((t) => t.id === 'file:' + filePath);
    if (!tab) {
      const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) return toast(data.error || '无法打开');
      tab = { id: 'file:' + filePath, title: filePath.split('/').pop(), kind: 'file', path: filePath, content: data.content };
      state.tabs.push(tab);
    }
    activateTab(tab.id);
  }

  function langFor(p) {
    if (p.endsWith('.js')) return 'javascript';
    if (p.endsWith('.json')) return 'json';
    if (p.endsWith('.md')) return 'markdown';
    if (p.endsWith('.css')) return 'css';
    if (p.endsWith('.html')) return 'html';
    return 'plaintext';
  }

  function applyEditor(tab) {
    if (state.editor && window.monaco) {
      const model = monaco.editor.createModel(tab.content || '', langFor(tab.path || ''));
      state.editor.setModel(model);
    } else {
      $('#editor-fallback').value = tab.content || '';
    }
  }

  function treeHtml(items, depth = 0) {
    if (!items) return '';
    return items.map((it) => {
      if (it.type === 'directory') {
        return `<div class="tree-dir">
          <div class="tree-item dir" data-dir="1" style="padding-left:${8 + depth * 12}px"><span class="chev">▾</span>${escapeHtml(it.name)}</div>
          <div class="tree-kids">${treeHtml(it.children || [], depth + 1)}</div>
        </div>`;
      }
      return `<div class="tree-item" data-path="${escapeHtml(it.path)}" style="padding-left:${8 + depth * 12}px">${escapeHtml(it.name)}</div>`;
    }).join('');
  }

  async function loadTree() {
    const res = await fetch('/api/files/tree');
    const data = await res.json();
    const box = $('#file-tree');
    box.innerHTML = treeHtml(data.items || []);
    box.onclick = (e) => {
      const dir = e.target.closest('.tree-item.dir');
      if (dir) {
        const kids = dir.parentElement && dir.parentElement.querySelector(':scope > .tree-kids');
        if (kids) {
          const hide = kids.style.display === 'none';
          kids.style.display = hide ? '' : 'none';
          const chev = dir.querySelector('.chev');
          if (chev) chev.textContent = hide ? '▾' : '▸';
        }
        return;
      }
      const item = e.target.closest('.tree-item[data-path]');
      if (item) openFile(item.dataset.path);
    };
    $('#recent-list').innerHTML = `
      <button type="button" data-open="README.md">workspace <span class="path">/workspace</span></button>
      <button type="button" data-open="src/calculator.js">calculator.js <span class="path">src/calculator.js</span></button>
    `;
    $('#recent-list').onclick = (e) => {
      const b = e.target.closest('button[data-open]');
      if (b) openFile(b.dataset.open);
    };
  }

  function emptyChat() {
    return `<div class="chat-empty">
      <div class="bubble">💬</div>
      <h3>使用智能体构建</h3>
      <p>AI 答复可能不准确。</p>
      <p style="margin-top:10px"><a class="gen-instr">生成智能体指令</a> 以将 AI 载入代码库。</p>
    </div>`;
  }

  function paintChat() {
    const paint = (box) => {
      if (!box) return;
      if (!state.messages.length) {
        box.innerHTML = emptyChat();
        box.querySelectorAll('.gen-instr').forEach((a) => {
          a.onclick = () => openModal('instructions');
        });
        return;
      }
      box.innerHTML = '';
      state.messages.forEach((m) => box.appendChild(renderMsg(m)));
      box.scrollTop = box.scrollHeight;
    };
    paint($('#chat-stream'));
    paint($('#agent-stream'));
  }

  function summarizeTool(result) {
    if (result == null || typeof result !== 'object') return result;
    const copy = { ...result };
    if (typeof copy.content === 'string' && copy.content.length > 800) copy.content = copy.content.slice(0, 800) + '\n…';
    if (typeof copy.stdout === 'string' && copy.stdout.length > 1000) copy.stdout = copy.stdout.slice(0, 1000) + '\n…';
    return copy;
  }

  function renderMsg(m) {
    const wrap = document.createElement('div');
    if (m.kind === 'user') { wrap.className = 'msg user'; wrap.textContent = m.text; return wrap; }
    if (m.kind === 'status') { wrap.className = 'status-line'; wrap.textContent = m.text; return wrap; }
    if (m.kind === 'tool') {
      wrap.className = 'tool-card';
      const ok = m.ok !== false && !m.error;
      wrap.innerHTML = `<header><span>${escapeHtml(m.name)}</span><span>${ok ? 'ok' : 'err'}</span></header><pre>${escapeHtml(JSON.stringify(m.error ? { error: m.error } : summarizeTool(m.result), null, 2))}</pre>`;
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
      wrap.innerHTML = `<h3><span>多模型博弈 · 意见一致再行动</span><span>${escapeHtml(r.agreementRate || '')}</span></h3>
        <div class="branch-tabs">${['合并', ...parts.map((p) => p.id || p.model)].map((lab, i) =>
          `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}">${escapeHtml(lab)}</button>`).join('')}</div>
        <div class="branch-body"></div>
        <button type="button" class="adopt">采纳共识并切到 Code 执行</button>`;
      const body = $('.branch-body', wrap);
      const show = (i) => {
        $$('.branch-tabs button', wrap).forEach((b, idx) => b.classList.toggle('on', idx === i));
        if (i === 0) {
          body.innerHTML = `<div>${renderMd(r.canonical || r.summary || '')}</div><ul>${(r.unifiedActionPlan || []).map((t) => `<li>${escapeHtml(t.title)}</li>`).join('')}</ul>`;
        } else {
          const p = parts[i - 1];
          body.innerHTML = `<p><strong>${escapeHtml(p.model)}</strong> · ${escapeHtml(p.focus || '')}</p><div>${renderMd(p.answer || '')}</div>`;
        }
      };
      show(0);
      wrap.querySelector('.branch-tabs').onclick = (e) => {
        const b = e.target.closest('button');
        if (b) show(Number(b.dataset.i));
      };
      $('.adopt', wrap).onclick = () => {
        $('#mode-select').value = 'code';
        state.mode = 'code';
        sendChat('按已对齐方案修复除零并运行 npm test');
      };
      return wrap;
    }
    wrap.className = 'msg assistant';
    wrap.innerHTML = `<div>${renderMd(m.text || '')}</div>`;
    return wrap;
  }

  function pushMsg(m) {
    state.messages.push(m);
    [$('#chat-stream'), $('#agent-stream')].filter(Boolean).forEach((box) => {
      if (box.querySelector('.chat-empty')) box.innerHTML = '';
      box.appendChild(renderMsg(m));
      box.scrollTop = box.scrollHeight;
    });
  }

  async function sendChat(text, opts = {}) {
    if (state.sending) return;
    const message = text != null ? text : ($('#chat-input').value || ($('#agent-input') && $('#agent-input').value) || '');
    if (text == null) {
      $('#chat-input').value = '';
      if ($('#agent-input')) $('#agent-input').value = '';
    }
    state.mode = ($('#agent-pane') && !$('#agent-pane').classList.contains('hidden') && $('#agent-mode'))
      ? $('#agent-mode').value
      : $('#mode-select').value;
    state.sending = true;
    if (!opts.stayOnBridge) setRight('chat');
    if (message) {
      pushMsg({ kind: 'user', text: message });
      state.history.push({ role: 'user', content: message });
    } else pushMsg({ kind: 'user', text: '（空输入 · 分支作答）' });
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: state.mode, message: message || '', history: state.history.slice(-12) })
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
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          handleEvent(ev);
          if (ev.type === 'message' && ev.text) assistantText += ev.text;
        }
      }
      if (assistantText) state.history.push({ role: 'assistant', content: assistantText });
    } catch (err) {
      pushMsg({ kind: 'assistant', text: '请求失败：' + err.message });
    } finally {
      state.sending = false;
      refreshStatus();
      loadTree();
    }
  }

  function handleEvent(ev) {
    if (ev.type === 'status') pushMsg({ kind: 'status', text: ev.text });
    else if (ev.type === 'tool') {
      pushMsg({ kind: 'tool', name: ev.name, args: ev.args, result: ev.result, error: ev.error, ok: ev.ok });
      logBridgeTool(ev);
      if (ev.name === 'run_command' || ev.name === 'execute_command') {
        const r = ev.result || {};
        if (r.stdout) termLine(r.stdout);
        if (r.stderr) termLine(r.stderr, 'err');
      }
      if (ev.name === 'apply_patch' && ev.result && ev.result.filePath) {
        const p = ev.result.filePath;
        const tab = state.tabs.find((t) => t.path === p);
        if (tab) {
          fetch(`/api/files/content?path=${encodeURIComponent(p)}`).then((r) => r.json()).then((d) => {
            tab.content = d.content;
            if (state.activeTab === tab.id) applyEditor(tab);
          });
        }
        if (ev.result.diff) openDiff(p, ev.result.diff);
      }
    } else if (ev.type === 'consensus') pushMsg({ kind: 'consensus', result: ev.result });
    else if (ev.type === 'message') pushMsg({ kind: 'assistant', text: ev.text });
    else if (ev.type === 'error') pushMsg({ kind: 'assistant', text: '错误：' + ev.message });
  }

  function logBridgeTool(ev) {
    state.stats.calls += 1;
    if (ev.ok === false || ev.error) state.stats.fail += 1;
    paintStats();
    const log = $('#bridge-log');
    const row = document.createElement('div');
    row.className = 'tool-card';
    row.innerHTML = `<header><span>${escapeHtml(ev.name)}</span><span>${ev.ok === false ? 'fail' : 'ok'}</span></header>`;
    log.appendChild(row);
    $('#sess-note').textContent = 'Remote MCP client is calling local tools.';
  }

  function paintStats() {
    const s = state.stats;
    $('#stat-calls').textContent = String(s.calls);
    $('#stat-fail').textContent = String(s.fail);
    const ok = s.calls ? Math.round((1 - s.fail / s.calls) * 100) : 100;
    $('#stat-ok').textContent = ok + '%';
    $('#stat-avg').textContent = (s.calls ? Math.round(s.totalMs / s.calls) : 0) + ' ms';
  }

  function promptText() {
    const s = state.status || {};
    return s.prompt || `${s.mcpUrl || ''}\n\n快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。`;
  }

  function renderBrowser(tab) {
    $('#br-url').value = tab.url || '';
    const page = $('#browser-page');
    const prompt = promptText();
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
      $('#arena-send').onclick = () => arenaConnect($('#arena-input').value);
    } else if (tab.site === 'chatgpt') {
      page.innerHTML = `<div class="gpt">
        <div class="gpt-top">ChatGPT</div>
        <h1>有什么可以帮忙的？</h1>
        <div class="gpt-card">
          <textarea id="gpt-input">${escapeHtml(prompt)}</textarea>
          <div style="display:flex"><button type="button" class="gpt-send" id="gpt-send">↑</button></div>
        </div>
      </div>`;
      $('#gpt-send').onclick = () => arenaConnect($('#gpt-input').value);
    } else {
      page.innerHTML = `<div class="generic-site">
        <h2>在 ShunCode 内置浏览器中打开 ${escapeHtml(tab.title)}</h2>
        <p>官方站点若禁止被嵌入，会在此展示已复制的第一句提示词。把它整段贴进新对话发出去。</p>
        <p><a href="${escapeHtml(tab.url)}" target="_blank" rel="noopener">${escapeHtml(tab.url)}</a></p>
        <div class="prompt-box">${escapeHtml(prompt)}</div>
      </div>`;
    }
  }

  async function arenaConnect(text) {
    setRight('bridge');
    $('#sess-dot').classList.add('on');
    $('#sess-note').textContent = 'MCP session connected from the built-in browser.';
    toast('已用提示词连接本机 MCP');
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
      logBridgeTool({ name: 'tools/list', ok: true, result: { tools: (state.status.tools || []).map((t) => t.name) } });
    } catch (e) { toast(e.message); }
    const extra = (text || '').replace(promptText(), '').trim();
    const task = extra || '按已对齐方案修复除零并运行 npm test';
    $('#mode-select').value = 'code';
    sendChat(task, { stayOnBridge: true });
  }

  async function openSite(key) {
    const site = SITES[key];
    if (!site) return;
    if (!(state.status && state.status.bridgeRunning)) {
      await startBridge();
    }
    try { await navigator.clipboard.writeText(promptText()); } catch (_) {}
    $('#mcp-banner').classList.remove('hidden');
    const id = 'browser:' + key;
    let tab = state.tabs.find((t) => t.id === id);
    if (!tab) {
      tab = { id, title: site.name, kind: 'browser', site: key, url: site.url };
      state.tabs.push(tab);
    }
    closeModal();
    setRight('bridge');
    activateTab(id);
    toast(`在 ShunCode 内置浏览器中打开 ${site.url.replace(/^https?:\/\//, '')}`);
  }

  async function startBridge() {
    const provider = ($('input[name="tunnel"]:checked') || {}).value || 'cloudflare';
    const res = await fetch('/api/bridge/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tunnelProvider: provider })
    });
    const data = await res.json();
    if (!data.success) { toast(data.error || '无法启动'); return false; }
    await refreshStatus();
    $('#mcp-banner').classList.remove('hidden');
    try { await navigator.clipboard.writeText(state.status.mcpUrl); } catch (_) {}
    setRight('bridge');
    $('#sess-dot').classList.add('on');
    return true;
  }

  async function stopBridge() {
    await fetch('/api/bridge/stop', { method: 'POST' });
    await refreshStatus();
    $('#sess-dot').classList.remove('on');
  }

  function paintBridge() {
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
    $('#conn-label').textContent = running
      ? 'Cloudflare Quick Tunnel 已就绪 · 重启后临时地址会变化'
      : '正在检查隧道设置…';
    $('#conn-pill').textContent = running ? '已就绪' : '检查中';
    $('#conn-pill').className = 'status-pill ' + (running ? 'ok' : '');
    if (state.loggedIn) {
      $('#acct-label').textContent = 'GitHub @demo · 永久顺 · 当前设备已授权';
      $('#acct-pill').textContent = '已授权';
      $('#acct-pill').className = 'status-pill ok';
    } else {
      $('#acct-label').textContent = '尚未连接 GitHub 账号';
      $('#acct-pill').textContent = '登录';
      $('#acct-pill').className = 'status-pill stop';
    }
    $('#sess-note').textContent = running
      ? 'Bridge is running and waiting for the external MCP client.'
      : 'Start the Bridge here, then connect the configured MCP URL from the external client.';
  }

  async function refreshStatus() {
    const res = await fetch('/api/status');
    state.status = await res.json();
    paintBridge();
    const sel = $('#model-select');
    const cur = sel.value;
    sel.innerHTML = (state.status.models || []).map((m) =>
      `<option value="${escapeHtml(m.id)}" ${m.id === state.status.activeModelId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`
    ).join('');
    if (cur) sel.value = cur;
  }

  function rowList(items, render, empty) {
    if (!items || !items.length) return `<p class="hint">${empty}</p>`;
    return items.map(render).join('');
  }

  function paintCustom() {
    const c = state.custom || {};
    $('#instr-text').value = c.instructions || '';
    if ($('#pref-input') && c.preference) $('#pref-input').value = c.preference;
    $('#agents-list').innerHTML = rowList(c.agents, (a) =>
      `<div class="list-row"><div><strong>${escapeHtml(a.name)}</strong><div class="hint">${escapeHtml(a.role || '')}</div></div></div>`,
    '还没有自定义智能体');
    $('#prompts-list').innerHTML = rowList(c.prompts, (p) =>
      `<div class="list-row"><div><strong>${escapeHtml(p.name)}</strong></div><button type="button" data-insert="${escapeHtml(p.content)}">插入对话</button></div>`,
    '还没有提示');
    $('#prompts-list').onclick = (e) => {
      const b = e.target.closest('[data-insert]');
      if (!b) return;
      $('#chat-input').value = b.dataset.insert;
      closeModal();
      setRight('chat');
    };
    $('#hooks-list').innerHTML = rowList(c.hooks, (h) =>
      `<div class="list-row"><span>${escapeHtml(h.event)} → ${escapeHtml(h.command)}</span></div>`,
    '还没有挂钩');
    $('#mcps-list').innerHTML = rowList(c.mcpServers, (s) =>
      `<div class="list-row"><span>${escapeHtml(s.name)} · ${escapeHtml(s.url)}</span></div>`,
    '尚未添加 Chat 模式 MCP');
    $('#plugins-list').innerHTML = rowList(c.plugins, (p) =>
      `<div class="list-row"><span>${escapeHtml(p.name || p)}</span></div>`,
    '未登记插件');
    $('#ql-list').innerHTML = rowList(c.quickLinks, (l) =>
      `<div class="list-row"><span>${escapeHtml(l.name)}</span><button type="button" data-open-url="${escapeHtml(l.url)}">${escapeHtml(l.url)}</button></div>`,
    '还没有自定义站点');
    $('#ql-list').onclick = (e) => {
      const b = e.target.closest('[data-open-url]');
      if (!b) return;
      const url = b.dataset.openUrl;
      const id = 'browser:custom:' + url;
      let tab = state.tabs.find((t) => t.id === id);
      if (!tab) {
        tab = { id, title: b.textContent || url, kind: 'browser', site: 'custom', url };
        state.tabs.push(tab);
      }
      closeModal();
      activateTab(id);
    };
    $('#codex-status').textContent = (c.codex && c.codex.loggedIn) ? `已登录 ${c.codex.account}` : '尚未登录';
    if (typeof c.multiModelEnabled === 'boolean') $('#mm-enabled').checked = c.multiModelEnabled;
  }

  async function loadCustomizations() {
    const res = await fetch('/api/customizations');
    state.custom = await res.json();
    paintCustom();
  }

  async function saveCustom(partial) {
    const res = await fetch('/api/customizations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...state.custom, ...partial })
    });
    const data = await res.json();
    state.custom = data.customizations;
    paintCustom();
    return state.custom;
  }

  async function loadSkills() {
    const res = await fetch('/api/skills');
    const data = await res.json();
    const list = data.skills || [];
    $('#cnt-skills').textContent = list.length ? String(list.length) : '';
    $('#skills-list').innerHTML = list.length
      ? list.map((s) => `<article class="block"><h4>${escapeHtml(s.name)}</h4><p class="hint">${escapeHtml(s.path)}</p><pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(s.preview)}</pre></article>`).join('')
      : '<p class="hint">还没有 Skill。把文件夹放到 .shuncode/skills/ 即可。</p>';
  }

  function bind() {
    $$('#activitybar [data-left]').forEach((b) => {
      b.onclick = () => {
        const left = b.dataset.left;
        const side = $('#sidebar');
        const already = b.classList.contains('active') && !side.classList.contains('collapsed');
        $$('#activitybar .ab-btn').forEach((x) => x.classList.remove('active'));
        if (already) {
          side.classList.add('collapsed');
          return;
        }
        b.classList.add('active');
        side.classList.remove('collapsed');
        $('#left-explorer').classList.toggle('hidden', left !== 'explorer');
        $('#left-search').classList.toggle('hidden', left !== 'search');
      };
    });

    $('#btn-manage').onclick = (e) => {
      e.stopPropagation();
      $('#manage-menu').classList.toggle('hidden');
    };
    document.addEventListener('click', () => {
      $('#manage-menu').classList.add('hidden');
      $('#file-menu').classList.add('hidden');
    });
    $('#menu-custom').onclick = () => openModal('overview');
    $('#menu-api').onclick = () => openModal('api');
    $('#menu-bridge').onclick = () => openModal('bridge');
    $('#btn-agent-window').onclick = () => openAgentWindow();
    $('#walk-basics').onclick = () => openModal('overview');
    $('[data-menu="file"]').onclick = (e) => {
      e.stopPropagation();
      $('#file-menu').classList.toggle('hidden');
    };
    $('#file-menu').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      $('#file-menu').classList.add('hidden');
      if (b.dataset.act === 'new') $('#lnk-new-file').click();
      if (b.dataset.act === 'open') $('#activitybar [data-left="explorer"]').click();
      if (b.dataset.act === 'save') saveActive();
      if (b.dataset.act === 'welcome') ensureWelcome();
      if (b.dataset.act === 'custom') openModal('overview');
    };
    $('#modal-close').onclick = closeModal;
    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    $$('.nav-item').forEach((b) => { b.onclick = () => showPage(b.dataset.page); });
    $$('.card-grid [data-page]').forEach((b) => { b.onclick = () => showPage(b.dataset.page); });

    $('#rb-chat-tab').onclick = () => setRight('chat');
    $('#rb-bridge-tab').onclick = () => setRight('bridge');
    $('#btn-send').onclick = () => sendChat();
    $('#btn-agent-send').onclick = () => {
      const t = $('#agent-input').value;
      $('#mode-select').value = $('#agent-mode').value;
      sendChat(t);
    };
    $('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
    });
    $('#agent-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('#btn-agent-send').click();
      }
    });
    $('#mode-select').onchange = () => { state.mode = $('#mode-select').value; };
    $('#chips').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $('#mode-select').value = b.dataset.mode;
      state.mode = b.dataset.mode;
      sendChat(b.dataset.text);
    };

    $('#btn-bridge-toggle').onclick = async () => {
      if (state.status && state.status.bridgeRunning) await stopBridge();
      else await startBridge();
    };
    $('#btn-stop-bridge-rb').onclick = stopBridge;
    $('#btn-copy-url').onclick = async () => {
      await navigator.clipboard.writeText((state.status || {}).mcpUrl || '');
      $('#mcp-banner').classList.remove('hidden');
      toast('已复制 MCP 地址');
    };
    $('#btn-copy-prompt').onclick = async () => {
      await navigator.clipboard.writeText(promptText());
      toast('已复制提示词，请整段作为第一句发出');
    };
    $('#btn-reset-secret').onclick = async () => {
      await fetch('/api/bridge/reset-secret', { method: 'POST' });
      await refreshStatus();
      toast('Secret 已重置，旧链接立即失效');
    };
    $$('.open-site').forEach((b) => {
      b.onclick = () => openSite(b.dataset.site);
    });
    $('#btn-gh-login').onclick = async () => {
      await fetch('/api/bridge/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'github', username: 'demo' })
      });
      state.loggedIn = true;
      paintBridge();
      toast('已使用 GitHub 登录（演示）');
    };
    $('#btn-refresh-auth').onclick = () => { paintBridge(); toast('已刷新授权'); };

    $('#btn-add-agent').onclick = async () => {
      const agents = [...((state.custom && state.custom.agents) || []), {
        id: Date.now().toString(36),
        name: $('#ag-name').value || '未命名',
        role: $('#ag-role').value
      }];
      await saveCustom({ agents });
      toast('已新建智能体');
    };
    $('#btn-add-skill').onclick = async () => {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: $('#sk-name').value, content: $('#sk-body').value })
      });
      await loadSkills();
      toast('已创建 Skill 文件夹');
    };
    $('#btn-save-instr').onclick = async () => {
      await saveCustom({ instructions: $('#instr-text').value });
      toast('指令已保存到 .shuncode/instructions.md');
    };
    $('#btn-add-prompt').onclick = async () => {
      const prompts = [...((state.custom && state.custom.prompts) || []), {
        id: Date.now().toString(36),
        name: $('#pr-name').value || '提示',
        content: $('#pr-body').value
      }];
      await saveCustom({ prompts });
    };
    $('#btn-add-hook').onclick = async () => {
      const hooks = [...((state.custom && state.custom.hooks) || []), {
        event: $('#hk-event').value,
        command: $('#hk-cmd').value
      }];
      await saveCustom({ hooks });
    };
    $('#btn-add-mcp').onclick = async () => {
      const mcpServers = [...((state.custom && state.custom.mcpServers) || []), {
        name: $('#mcp-name').value,
        url: $('#mcp-endpoint').value
      }];
      await saveCustom({ mcpServers });
    };
    $('#btn-add-plugin').onclick = async () => {
      const plugins = [...((state.custom && state.custom.plugins) || []), { name: $('#pl-name').value }];
      await saveCustom({ plugins });
    };
    $('#btn-add-link').onclick = async () => {
      const quickLinks = [...((state.custom && state.custom.quickLinks) || []), {
        name: $('#ql-name').value,
        url: $('#ql-url').value
      }];
      await saveCustom({ quickLinks });
    };
    $('#btn-codex').onclick = async () => {
      await saveCustom({ codex: { loggedIn: true, account: 'codex-demo' } });
      toast('已模拟 Codex 登录');
    };
    $('#btn-save-mm').onclick = async () => {
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiModel: { enabled: $('#mm-enabled').checked } })
      });
      toast('已保存多模型设置');
    };
    $('#btn-save-pref').onclick = async () => {
      await saveCustom({
        preference: $('#pref-input').value,
        instructions: $('#instr-text').value || $('#pref-input').value
      });
      toast('已写入偏好');
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
      $('#model-status').textContent = '已保存。Chat 将走该兼容 OpenAI 的接口。';
      await refreshStatus();
    };
    $('#btn-use-builtin').onclick = async () => {
      await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activeModelId: 'builtin' }) });
      $('#model-status').textContent = '已改回内置 Demo Agent。';
      await refreshStatus();
    };

    $('#lnk-new-file').onclick = async () => {
      const name = prompt('文件名', 'untitled.js');
      if (!name) return;
      await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: name, content: '' })
      });
      await loadTree();
      openFile(name);
    };
    $('#lnk-open-file').onclick = () => {
      $('#activitybar [data-left="explorer"]').click();
    };
    $('#lnk-open-folder').onclick = () => {
      $('#activitybar [data-left="explorer"]').click();
    };

    $('#menu-term').onclick = () => $('#panel').classList.toggle('hidden');
    $('#menu-help').onclick = () => ensureWelcome();
    $('#btn-clear-term').onclick = () => { $('#terminal').innerHTML = ''; };
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
      $('#search-results').innerHTML = hits.map((h) =>
        `<div class="tree-item" data-path="${escapeHtml(h.file)}"><b>${escapeHtml(h.file)}:${h.line}</b><div class="hint">${escapeHtml(h.content)}</div></div>`
      ).join('') || '<p class="hint">没有命中</p>';
      $('#search-results').onclick = (e) => {
        const item = e.target.closest('[data-path]');
        if (item) openFile(item.dataset.path);
      };
    };
    $('#br-go').onclick = () => {
      const url = $('#br-url').value.trim();
      const tab = state.tabs.find((t) => t.id === state.activeTab);
      if (tab && tab.kind === 'browser') { tab.url = url; renderBrowser(tab); }
    };
    $('#br-reload').onclick = () => {
      const tab = state.tabs.find((t) => t.id === state.activeTab);
      if (tab && tab.kind === 'browser') renderBrowser(tab);
    };

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActive();
      }
    });
  }

  async function saveActive() {
    const tab = state.tabs.find((t) => t.id === state.activeTab);
    if (!tab || tab.kind !== 'file') return;
    const content = state.editor ? state.editor.getValue() : $('#editor-fallback').value;
    await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tab.path, content })
    });
    tab.content = content;
    toast('已保存 ' + tab.path);
  }

  function connectWs() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'command_output' && msg.payload && msg.payload.chunk) {
          termLine(msg.payload.chunk, msg.payload.stream === 'stderr' ? 'err' : '');
        }
        if (msg.type === 'file_patched') loadTree();
        if (msg.type === 'tool_call_end') {
          state.stats.totalMs += (msg.payload && msg.payload.durationMs) || 0;
        }
      };
    } catch (_) {}
  }

  function loadMonaco() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
      script.onload = () => {
        window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
        window.require(['vs/editor/editor.main'], () => {
          state.editor = monaco.editor.create($('#editor'), {
            value: '',
            language: 'plaintext',
            theme: 'vs-dark',
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            scrollBeyondLastLine: false
          });
          $('#editor').classList.add('hidden');
          resolve(true);
        });
      };
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
      setTimeout(() => resolve(!!state.editor), 7000);
    });
  }

  async function boot() {
    bind();
    paintTabs();
    paintChat();
    termLine('ShunCode terminal ready.', 'info');
    await Promise.all([refreshStatus(), loadTree(), loadSkills(), loadCustomizations(), loadMonaco()]);
    connectWs();
    activateTab('welcome');
  }

  boot().catch((err) => console.error(err));
})();
