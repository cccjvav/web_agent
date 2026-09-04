import { $, $$, state, ui } from './state.js';
import { escapeHtml } from './dom.js';

export function bind() {
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
    const ap = $('#agent-pick-menu');
    if (ap) ap.classList.add('hidden');
  });
  $('#btn-agent-pick').onclick = (e) => {
    e.stopPropagation();
    const menu = $('#agent-pick-menu');
    const btn = $('#btn-agent-pick');
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.left = r.left + 'px';
    menu.classList.toggle('hidden');
  };
  $('#agent-pick-menu').onclick = (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-mode]');
    if (b) {
      ui.setAgentMode(b.dataset.mode);
      $('#agent-pick-menu').classList.add('hidden');
    }
  };
  $('#menu-custom-from-agent').onclick = () => {
    $('#agent-pick-menu').classList.add('hidden');
    ui.openModal('agents');
  };
  $('#menu-custom').onclick = () => ui.openModal('overview');
  $('#menu-api').onclick = () => ui.openModal('api');
  $('#menu-bridge').onclick = () => ui.openModal('bridge');
  $('#btn-agent-window').onclick = () => ui.openAgentWindow();
  $('#walk-basics').onclick = () => ui.openModal('overview');
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
    if (b.dataset.act === 'save') ui.saveActive();
    if (b.dataset.act === 'welcome') ui.ensureWelcome();
    if (b.dataset.act === 'custom') ui.openModal('overview');
  };
  $('#modal-close').onclick = ui.closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') ui.closeModal(); });
  $$('.nav-item').forEach((b) => { b.onclick = () => ui.showPage(b.dataset.page); });
  $$('.card-grid [data-page]').forEach((b) => { b.onclick = () => ui.showPage(b.dataset.page); });

  $('#rb-chat-tab').onclick = () => ui.setRight('chat');
  $('#rb-bridge-tab').onclick = () => ui.setRight('bridge');
  $('#btn-send').onclick = () => ui.sendChat();
  $('#btn-agent-send').onclick = () => {
    const t = $('#agent-input').value;
    ui.setAgentMode($('#agent-mode').value);
    ui.sendChat(t);
  };
  $('#chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ui.sendChat(); }
  });
  $('#agent-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('#btn-agent-send').click();
    }
  });
  $('#mode-select').onchange = () => ui.setAgentMode($('#mode-select').value);
  $('#chips').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    ui.setAgentMode(b.dataset.mode);
    ui.sendChat(b.dataset.text);
  };

  $('#btn-bridge-toggle').onclick = async () => {
    if (state.status && state.status.bridgeRunning) await ui.stopBridge();
    else await ui.startBridge();
  };
  $('#btn-stop-bridge-rb').onclick = ui.stopBridge;
  if ($('#btn-reset-round')) $('#btn-reset-round').onclick = ui.resetRound;
  $('#btn-copy-url').onclick = async () => {
    await navigator.clipboard.writeText((state.status || {}).mcpUrl || '');
    $('#mcp-banner').classList.remove('hidden');
    ui.toast('已复制 MCP 地址');
  };
  $('#btn-copy-prompt').onclick = async () => {
    await navigator.clipboard.writeText(ui.promptText());
    const c = ui.selectedClientInfo();
    ui.toast(c && c.connectMode === 'extension-http'
      ? '已复制 MCP 地址，填进 DeepSeek++ 侧边栏（Streamable HTTP）'
      : '已复制提示词，请整段作为第一句发出');
  };
  $('#btn-reset-secret').onclick = async () => {
    await fetch('/api/bridge/reset-secret', { method: 'POST' });
    await ui.refreshStatus();
    ui.toast('Secret 已重置，旧链接立即失效');
  };
  $$('.open-site').forEach((b) => {
    b.onclick = () => ui.openSite(b.dataset.site);
  });
  $('#btn-gh-login').onclick = async () => {
    await fetch('/api/bridge/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'github', username: 'demo' })
    });
    state.loggedIn = true;
    ui.paintBridge();
    ui.toast('已使用 GitHub 登录（演示）');
  };
  $('#btn-refresh-auth').onclick = () => { ui.paintBridge(); ui.toast('已刷新授权'); };

  $('#btn-add-agent').onclick = async () => {
    const agents = [...((state.custom && state.custom.agents) || []), {
      id: Date.now().toString(36),
      name: $('#ag-name').value || '未命名',
      role: $('#ag-role').value
    }];
    await ui.saveCustom({ agents });
    ui.toast('已新建智能体');
  };
  function skillMarkdown(name, when, steps) {
    const n = (name || 'untitled').trim() || 'untitled';
    return [
      '---',
      `name: ${n}`,
      `description: ${(when || n).replace(/\n/g, ' ').slice(0, 200)}`,
      '---',
      '',
      `# Skill: ${n}`,
      '',
      '## 何时使用',
      when || '任务匹配时使用。',
      '',
      '## 步骤',
      steps || '1. load_skill 读完本文件\n2. 按说明调用工具',
      ''
    ].join('\n');
  }
  const SKILL_TPL = {
    'fix-tests': {
      name: 'fix-tests',
      when: '用户提到测试失败、红灯、回归、除以零时使用。',
      steps: '1. Ask：search_files / read_files，不要改文件。\n2. Code：read_files 取 sha256，apply_patch 修失败用例。\n3. 跑工作区声明的测试命令，确认通过。'
    },
    review: {
      name: 'review',
      when: '用户要求审查、找风险、看 diff、合并前检查时使用。默认只读。',
      steps: '1. workspace_info → git_status / git_diff（available:false 时改用 list_directory，不要 git init）。\n2. read_files 打开改动文件。\n3. 按文件列出严重/建议/风格，给路径+原因+改法。未经用户要求不要 apply_patch。'
    },
    release: {
      name: 'release',
      when: '用户要发版、打 tag、写 changelog 时使用。',
      steps: '1. 读 package.json 版本与测试命令。\n2. 先跑测试。\n3. 按仓库惯例写 changelog，不要改无关文件。'
    }
  };
  function fillSkillPreview() {
    if (!$('#sk-body') || $('#sk-body').dataset.dirty === '1') return;
    $('#sk-body').value = skillMarkdown($('#sk-name').value, $('#sk-when').value, $('#sk-steps').value);
  }
  ['sk-name', 'sk-when', 'sk-steps'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', fillSkillPreview);
  });
  if ($('#sk-body')) {
    $('#sk-body').addEventListener('input', () => { $('#sk-body').dataset.dirty = '1'; });
  }
  if ($('#skill-templates')) {
    $('#skill-templates').onclick = (e) => {
      const b = e.target.closest('[data-tpl]');
      if (!b) return;
      const tpl = SKILL_TPL[b.dataset.tpl];
      if (!tpl) return;
      $('#sk-name').value = tpl.name;
      $('#sk-when').value = tpl.when;
      $('#sk-steps').value = tpl.steps;
      if ($('#sk-body')) $('#sk-body').dataset.dirty = '';
      fillSkillPreview();
    };
  }
  $('#btn-add-skill').onclick = async () => {
    const name = $('#sk-name').value;
    const content = $('#sk-body').value || skillMarkdown(name, $('#sk-when').value, $('#sk-steps').value);
    await fetch('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content })
    });
    await ui.loadSkills();
    ui.toast('已创建 Skill 文件夹');
  };
  $('#btn-detect-env').onclick = async () => {
    const res = await fetch('/api/profile/detect');
    const data = await res.json();
    const env = data.environment || {};
    $('#env-os').value = env.os || 'auto';
    $('#env-shell').value = env.shell || 'auto';
    $('#env-status').textContent = `探测到 ${env.os} / ${env.shell}`;
  };
  $('#btn-save-env').onclick = async () => {
    await ui.saveCustom({
      environment: {
        os: $('#env-os').value,
        shell: $('#env-shell').value,
        replyLanguage: $('#env-reply').value,
        commitLanguage: $('#env-commit').value,
        notes: $('#env-notes').value
      }
    });
    $('#env-status').textContent = '已写入 .webagent/preference.md';
    ui.toast('已保存环境偏好');
  };
  $('#btn-detect-stack').onclick = async () => {
    const res = await fetch('/api/profile/detect');
    const data = await res.json();
    const st = data.techStack || {};
    $('#st-lang').value = st.languages || '';
    $('#st-fw').value = st.frameworks || '';
    $('#st-pm').value = st.packageManager || '';
    $('#st-test').value = st.testCommand || '';
    $('#stack-status').textContent = st.languages || st.testCommand ? '已填入探测结果，确认后保存。' : '工作区没有识别到常见清单文件。';
  };
  $('#btn-save-stack').onclick = async () => {
    await ui.saveCustom({
      techStack: {
        languages: $('#st-lang').value,
        frameworks: $('#st-fw').value,
        packageManager: $('#st-pm').value,
        testCommand: $('#st-test').value,
        notes: $('#st-notes').value
      }
    });
    $('#stack-status').textContent = '已写入 .webagent/tech-stack.md';
    ui.toast('已保存技术栈');
  };
  $('#btn-save-instr').onclick = async () => {
    await ui.saveCustom({ instructions: $('#instr-text').value });
    ui.toast('指令已保存到 .webagent/instructions.md');
  };
  $('#btn-add-prompt').onclick = async () => {
    const prompts = [...((state.custom && state.custom.prompts) || []), {
      id: Date.now().toString(36),
      name: $('#pr-name').value || '提示',
      content: $('#pr-body').value
    }];
    await ui.saveCustom({ prompts });
  };
  $('#btn-add-hook').onclick = async () => {
    const hooks = [...((state.custom && state.custom.hooks) || []), {
      event: $('#hk-event').value,
      command: $('#hk-cmd').value
    }];
    await ui.saveCustom({ hooks });
  };
  $('#btn-add-mcp').onclick = async () => {
    const mcpServers = [...((state.custom && state.custom.mcpServers) || []), {
      name: $('#mcp-name').value,
      url: $('#mcp-endpoint').value
    }];
    await ui.saveCustom({ mcpServers });
  };
  $('#btn-add-plugin').onclick = async () => {
    const plugins = [...((state.custom && state.custom.plugins) || []), { name: $('#pl-name').value }];
    await ui.saveCustom({ plugins });
  };
  $('#btn-add-link').onclick = async () => {
    const quickLinks = [...((state.custom && state.custom.quickLinks) || []), {
      name: $('#ql-name').value,
      url: $('#ql-url').value
    }];
    await ui.saveCustom({ quickLinks });
  };
  $('#btn-codex').onclick = async () => {
    await ui.saveCustom({ codex: { loggedIn: true, account: 'codex-demo' } });
    ui.toast('已模拟 Codex 登录');
  };
  $('#btn-save-mm').onclick = async () => {
    await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        multiModel: {
          enabled: $('#mm-enabled').checked,
          mergeModel: $('#mm-merge').value,
          thinkLevel: $('#mm-think').value,
          mergeAllowsRead: $('#mm-readonly').checked,
          maxBranches: Number($('#mm-branches').value) || 3
        }
      })
    });
    ui.toast('已保存多模型设置');
    await ui.refreshStatus();
  };
  $('#btn-save-pref').onclick = async () => {
    await ui.saveCustom({
      preference: $('#pref-input').value,
      instructions: $('#instr-text').value || $('#pref-input').value
    });
    ui.toast('已写入偏好');
  };

  async function probeProvider() {
    const baseUrl = $('#m-base').value.trim();
    const apiKey = $('#m-key').value.trim();
    const res = await fetch('/api/providers/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey })
    });
    return res.json();
  }
  $('#btn-test-api').onclick = async () => {
    $('#model-status').textContent = 'Testing…';
    const data = await probeProvider();
    $('#model-status').textContent = data.success
      ? `OK · 发现 ${data.models.length} 个模型`
      : ('失败：' + (data.error || '无法连接'));
  };
  $('#btn-save-model').onclick = async () => {
    const baseUrl = $('#m-base').value.trim();
    const apiKey = $('#m-key').value.trim();
    const manualId = $('#m-id').value.trim();
    $('#model-status').textContent = 'Adding provider and loading models...';
    const data = await probeProvider();
    let discovered = data.success ? data.models : [];
    if (!discovered.length && manualId) {
      discovered = [{ id: manualId, name: manualId, group: 'custom', contextSize: '1.3M', caps: ['工具'], pricing: '' }];
    }
    if (!discovered.length) {
      $('#model-status').textContent = '失败：' + (data.error || '没有模型。可手动填模型 ID 后再 Add API。');
      return;
    }
    const group = discovered[0].group || 'custom';
    $('#model-status').textContent = `Adding ${group} and loading models...`;
    const builtin = ((state.status && state.status.models) || []).find((m) => m.id === 'builtin') || {
      id: 'builtin', name: '内置探索 Agent', protocol: 'builtin', baseUrl: '', apiKey: '', modelId: 'webagent-explore'
    };
    const models = [
      { ...builtin, apiKey: '' },
      ...discovered.map((m) => ({
        id: `${group}-${m.id}`.replace(/[^\w.-]+/g, '-'),
        name: m.name || m.id,
        protocol: 'chat.completions',
        baseUrl,
        apiKey,
        modelId: m.id,
        group,
        contextSize: m.contextSize,
        caps: m.caps,
        pricing: m.pricing || ''
      }))
    ];
    const firstChat = models.find((m) => m.protocol !== 'builtin' && !/video|image/i.test(m.modelId || '')) || models[1];
    await fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeModelId: firstChat.id, models })
    });
    $('#model-status').textContent = `已添加 ${group} · ${discovered.length} 个模型。Chat 将走该兼容 OpenAI 的接口。`;
    await ui.refreshStatus();
  };
  $('#btn-use-builtin').onclick = async () => {
    await fetch('/api/models', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activeModelId: 'builtin' }) });
    $('#model-status').textContent = '已改回内置探索 Agent。';
    await ui.refreshStatus();
  };

  $('#lnk-new-file').onclick = async () => {
    const name = prompt('文件名', 'untitled.js');
    if (!name) return;
    await fetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name, content: '' })
    });
    await ui.loadTree();
    ui.openFile(name);
  };
  $('#lnk-open-file').onclick = () => {
    $('#activitybar [data-left="explorer"]').click();
  };
  $('#lnk-open-folder').onclick = () => {
    $('#activitybar [data-left="explorer"]').click();
  };

  $('#menu-term').onclick = () => $('#panel').classList.toggle('hidden');
  $('#menu-help').onclick = () => ui.ensureWelcome();
  $('#btn-clear-term').onclick = () => { $('#terminal').innerHTML = ''; };
  $('#term-form').onsubmit = async (e) => {
    e.preventDefault();
    const cmd = $('#term-input').value.trim();
    if (!cmd) return;
    $('#term-input').value = '';
    ui.termLine('$ ' + cmd, 'info');
    const res = await fetch('/api/tool/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'run_command', mode: 'code', arguments: { command: cmd } })
    });
    const data = await res.json();
    const r = data.result || {};
    if (r.stdout) ui.termLine(r.stdout);
    if (r.stderr) ui.termLine(r.stderr, 'err');
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
      if (item) ui.openFile(item.dataset.path);
    };
  };
  $('#br-go').onclick = () => {
    const url = $('#br-url').value.trim();
    const tab = state.tabs.find((t) => t.id === state.activeTab);
    if (tab && tab.kind === 'browser') { tab.url = url; ui.renderBrowser(tab); }
  };
  $('#br-reload').onclick = () => {
    const tab = state.tabs.find((t) => t.id === state.activeTab);
    if (tab && tab.kind === 'browser') ui.renderBrowser(tab);
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') ui.closeModal();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      ui.saveActive();
    }
  });
}

ui.bind = bind;
