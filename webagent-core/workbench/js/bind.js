import { $, $$, state, ui } from './state.js';
import { escapeHtml, positionPopover } from './dom.js';
import { openModelPicker, closeModelPicker } from './picker.js';

async function confirmedJson(response, action) {
  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error(`${action}响应不是有效 JSON`);
  }
  if (!response.ok) {
    const detail = data && typeof data.error === 'string' ? data.error : `HTTP ${response.status || '错误'}`;
    throw new Error(detail);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${action}响应格式无效`);
  }
  return data;
}

let profileDetection = null;
async function detectProfile() {
  if (profileDetection) return profileDetection;
  profileDetection = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const data = await confirmedJson(await fetch('/api/profile/detect', { cache: 'no-store', signal: controller.signal }), '工作区探测');
      const environment = data.environment, techStack = data.techStack;
      const validStrings = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
        && keys.every(key => typeof value[key] === 'string');
      if (!validStrings(environment, ['os', 'shell']) ||
          !validStrings(techStack, ['languages', 'frameworks', 'packageManager', 'testCommand'])) {
        throw new Error('工作区探测响应格式无效');
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  })();
  try { return await profileDetection; }
  finally { profileDetection = null; }
}

function onClick(id, handler) {
  const node = $(id);
  if (!node) return;
  node.onclick = handler;
}

export function bind() {
  ui.initOperations();
  $$('[data-workspace-view]').forEach(button => {
    button.onclick = () => {
      closeSidebar();
      if (button.dataset.workspaceView === 'editor') ui.setWorkspaceView('editor');
      else ui.setRight(button.dataset.workspaceView);
    };
  });
  if (ui.initExecutionControl) ui.initExecutionControl();
  onClick('#btn-host-diagnostics', () => { ui.openModal('diagnostics'); ui.refreshDiagnostics(); });
  onClick('#btn-refresh-diagnostics', () => ui.refreshDiagnostics());
  onClick('#btn-compare-host', () => ui.compareHost());
  if (ui.initTheme) ui.initTheme();
  onClick('#btn-theme', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    ui.applyTheme(cur === 'light' ? 'dark' : 'light');
  });
  if (ui.initTextScale) ui.initTextScale();
  onClick('#btn-text-smaller', () => ui.stepTextScale && ui.stepTextScale(-1));
  onClick('#btn-text-larger', () => ui.stepTextScale && ui.stepTextScale(1));
  onClick('#btn-sess-toggle', () => {
    const box = $('#mcp-session');
    if (!box) return;
    const on = box.classList.toggle('collapsed');
    const btn = $('#btn-sess-toggle');
    if (btn) btn.setAttribute('aria-expanded', on ? 'false' : 'true');
  });
  onClick('#btn-bridge-health', () => ui.checkBridgeHealth && ui.checkBridgeHealth());
  const closeSidebar = () => {
    const side = $('#sidebar');
    if (!side || side.classList.contains('collapsed')) return false;
    const buttons = $$('#activitybar [data-left]');
    const active = buttons.find((button) => button.classList.contains('active'));
    const restoreFocus = typeof side.contains === 'function' && side.contains(document.activeElement);
    side.classList.add('collapsed');
    buttons.forEach((button) => {
      button.classList.remove('active');
      button.setAttribute?.('aria-pressed', 'false');
    });
    if (restoreFocus) active?.focus?.();
    return true;
  };
  ui.closeSidebar = closeSidebar;
  document.addEventListener('focusin', event => {
    if (Number(window.innerWidth) <= 700) return;
    if (event.target?.closest?.('#center')) ui.setWorkspaceView('editor');
    else if (event.target?.closest?.('#rightbar')) ui.setWorkspaceView($('#rb-bridge-tab').classList.contains('on') ? 'bridge' : 'chat');
  });
  $$('#activitybar [data-left]').forEach((b) => {
    b.onclick = () => {
      const left = b.dataset.left;
      const side = $('#sidebar');
      const already = b.classList.contains('active') && !side.classList.contains('collapsed');
      if (already) {
        closeSidebar();
        return;
      }
      $$('#activitybar [data-left]').forEach((x) => {
        x.classList.remove('active');
        x.setAttribute?.('aria-pressed', 'false');
      });
      b.classList.add('active');
      b.setAttribute?.('aria-pressed', 'true');
      side.classList.remove('collapsed');
      $('#left-explorer').classList.toggle('hidden', left !== 'explorer');
      $('#left-search').classList.toggle('hidden', left !== 'search');
    };
  });

  $('#btn-manage').onclick = (e) => {
    e.stopPropagation();
    const hidden = $('#manage-menu').classList.toggle('hidden');
    $('#btn-manage').setAttribute('aria-expanded', hidden ? 'false' : 'true');
  };
  const closeAgentMenu = () => {
    $('#agent-pick-menu').classList.add('hidden');
    $('#btn-agent-pick').setAttribute('aria-expanded', 'false');
  };
  document.addEventListener('click', () => {
    $('#manage-menu').classList.add('hidden');
    $('#btn-manage').setAttribute('aria-expanded', 'false');
    $('#file-menu').classList.add('hidden');
    closeAgentMenu();
  });
  let narrowViewport = Number(window.innerWidth) > 0 && Number(window.innerWidth) <= 700;
  window.addEventListener('resize', () => {
    closeAgentMenu();
    const nextNarrow = Number(window.innerWidth) > 0 && Number(window.innerWidth) <= 700;
    if (nextNarrow && !narrowViewport) closeSidebar();
    narrowViewport = nextNarrow;
  });
  $('#btn-agent-pick').onclick = (e) => {
    e.stopPropagation();
    const menu = $('#agent-pick-menu');
    const btn = $('#btn-agent-pick');
    if (!menu.classList.contains('hidden')) { closeAgentMenu(); return; }
    closeModelPicker();
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
    positionPopover(menu, btn);
    menu.querySelector('button').focus();
  };
  $('#agent-pick-menu').onclick = (e) => {
    e.stopPropagation();
    const b = e.target.closest('[data-mode]');
    if (b) {
      ui.setAgentMode(b.dataset.mode);
      closeAgentMenu();
    }
  };
  $('#menu-custom-from-agent').onclick = () => {
    closeAgentMenu();
    ui.openModal('agents');
  };
  $('#menu-custom').onclick = () => ui.openModal('overview');
  $('#menu-api').onclick = () => ui.openModal('api');
  $('#menu-bridge').onclick = () => ui.openModal('bridge');
  $('#btn-agent-window').onclick = () => ui.openAgentWindow();
  onClick('#btn-refresh-activity', () => ui.refreshBridgeActivity());
  onClick('#walk-start', () => ui.openModal('help'));
  $('#walk-basics').onclick = () => ui.openModal('overview');
  $('#walk-local-chat').onclick = () => ui.openAgentWindow();
  $('#walk-bridge').onclick = () => ui.openModal('bridge');
  // 阶段 4（S4-3）：可搜索模型弹层（composer 作答模型 + 多模型合并主模型）
  if ($('#model-pick-btn')) {
    $('#model-pick-btn').onclick = () => openModelPicker({
      anchor: $('#model-pick-btn'),
      currentId: $('#model-select') ? $('#model-select').value : '',
      onPick: (id) => {
        const sel = $('#model-select');
        if (sel) {
          sel.value = id;
          if (sel.onchange) sel.onchange();
        }
      }
    });
  }
  if ($('#btn-mm-pick')) {
    $('#btn-mm-pick').onclick = () => openModelPicker({
      anchor: $('#btn-mm-pick'),
      currentId: $('#mm-merge') ? $('#mm-merge').value : '',
      mergeMark: true,
      onPick: (id) => {
        if ($('#mm-merge')) $('#mm-merge').value = id;
        if ($('#mm-merge-display')) $('#mm-merge-display').value = id;
      }
    });
  }
  if ($('#btn-mm-active')) {
    $('#btn-mm-active').onclick = () => {
      if ($('#mm-merge')) $('#mm-merge').value = 'active';
      if ($('#mm-merge-display')) $('#mm-merge-display').value = '';
    };
  }
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
    if (b.dataset.act === 'preview') ui.previewActive();
    if (b.dataset.act === 'undo-save') ui.previewUndo();
    if (b.dataset.act === 'welcome') ui.ensureWelcome();
    if (b.dataset.act === 'custom') ui.openModal('overview');
  };
  $('#modal-close').onclick = ui.closeModal;
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') ui.closeModal(); });
  $$('.nav-item').forEach((b) => { b.onclick = () => ui.showPage(b.dataset.page); });
  $$('.card-grid [data-page]').forEach((b) => { b.onclick = () => ui.showPage(b.dataset.page); });

  $('#rb-chat-tab').onclick = () => ui.setRight('chat');
  $('#rb-bridge-tab').onclick = () => ui.setRight('bridge');
  [['#rb-chat-tab', 'chat'], ['#rb-bridge-tab', 'bridge']].forEach(([selector, side]) => {
    $(selector).onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'bridge' : side === 'chat' ? 'bridge' : 'chat';
      ui.setRight(target);
      $(`#rb-${target}-tab`).focus();
    };
  });
  $('#btn-send').onclick = () => ui.sendChat();
  if ($('#btn-plan-merge')) {
    $('#btn-plan-merge').onclick = () => ui.sendChat('', { planAction: 'merge' });
  }
  if ($('#think-select')) {
    $('#think-select').onchange = () => { $('#think-select').dataset.touched = '1'; };
  }
  if ($('#model-select')) {
    $('#model-select').onchange = async () => {
      const id = $('#model-select').value;
      if (!id) return;
      // The hidden select feeds sendChat; keep the confirmed model while saving.
      $('#model-select').value = state.status?.activeModelId || '';
      await ui.saveModelSettings({ activeModelId: id });
    };
  }
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
    if (ui.bridgeStartPending() || state.status?.bridgeRunning) await ui.stopBridge();
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
    const prompt = ui.promptText();
    if (!prompt) { ui.toast('此入口没有可复制的MCP连接配置，请核对客户端连接方式。'); return; }
    await navigator.clipboard.writeText(prompt);
    const c = ui.selectedClientInfo();
    ui.toast(c && c.connectMode === 'extension-http'
      ? '已复制 MCP 地址；请先核对扩展版本、认证与兼容性，再填入连接配置'
      : '已复制提示词，请整段作为第一句发出');
  };
  onClick('#btn-copy-rules', async () => {
    const c = ui.selectedClientInfo();
    const text = (c && c.rulesText) || '';
    if (!text) {
      ui.toast('当前客户端会读 initialize.instructions，不必另贴规则');
      return;
    }
    await navigator.clipboard.writeText(text);
    ui.toast(c.id === 'chat-plus'
      ? '已复制规则，贴进 Chat Plus「编排 / 系统提示词」，不要贴进 URL 框'
      : '已复制规则，贴进扩展系统提示或对话第一句，不要贴进 URL 框');
  });
  $('#btn-reset-secret').onclick = ui.resetSecret;
  $$('.open-site').forEach((b) => {
    b.onclick = () => ui.openSite(b.dataset.site);
  });
  let devicePollGeneration = 0;
  let devicePollTimer = null;
  let devicePollController = null;
  const cancelDevicePoll = () => {
    devicePollGeneration++;
    if (devicePollTimer != null) clearTimeout(devicePollTimer);
    if (devicePollController) devicePollController.abort();
    devicePollTimer = null;
    devicePollController = null;
  };
  const refreshAfterConfirmedAuth = async () => {
    try { return await ui.refreshStatus() !== false; }
    catch (_) { return false; }
  };

  $('#btn-gh-login').onclick = async () => {
    cancelDevicePoll();
    try {
      const response = await fetch('/api/bridge/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await confirmedJson(response, '本机演示授权');
      if (data.success !== true || data.demo !== true || data.provider !== 'local-demo') {
        throw new Error(data.error || '服务器未确认本机演示授权');
      }
      state.loggedIn = true;
      const refreshed = await refreshAfterConfirmedAuth();
      ui.toast(refreshed ? '已打开本机演示授权（不是 GitHub）' : '本机演示授权已确认，但状态刷新失败；请手动刷新');
      return true;
    } catch (error) {
      ui.toast(('本机演示授权未确认：' + (error.message || '请核对主机状态')).slice(0, 180));
      return false;
    }
  };
  if ($('#btn-gh-token')) {
    $('#btn-gh-token').onclick = async () => {
      cancelDevicePoll();
      const input = $('#gh-token');
      const token = (input && input.value) || '';
      if (!token.trim()) { ui.toast('请先粘贴 GitHub 令牌'); return false; }
      try {
        const response = await fetch('/api/bridge/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await confirmedJson(response, 'GitHub 令牌验证');
        if (data.success !== true || data.provider !== 'github' || typeof data.username !== 'string' || !data.username) {
          throw new Error(data.error || '服务器未确认 GitHub 身份');
        }
        if (input && input.value === token) input.value = '';
        const refreshed = await refreshAfterConfirmedAuth();
        ui.toast(refreshed ? '已验证 GitHub @' + data.username : 'GitHub 身份已确认，但状态刷新失败；请手动刷新');
        return true;
      } catch (error) {
        ui.toast(('GitHub 令牌验证未确认；已保留输入：' + (error.message || '请核对主机状态')).slice(0, 180));
        return false;
      }
    };
  }
  if ($('#btn-gh-device')) {
    $('#btn-gh-device').onclick = async () => {
      cancelDevicePoll();
      const generation = devicePollGeneration;
      const controller = new AbortController();
      devicePollController = controller;
      const button = $('#btn-gh-device');
      button.disabled = true;
      try {
        const response = await fetch('/api/bridge/device', { method: 'POST', signal: controller.signal });
        const data = await confirmedJson(response, '设备码登录');
        if (generation !== devicePollGeneration) return false;
        if (data.success !== true || typeof data.userCode !== 'string' || !data.userCode ||
            typeof data.verificationUri !== 'string' || !data.verificationUri) {
          throw new Error(data.error || '服务器未确认设备码');
        }
        if ($('#gh-device-hint')) {
          $('#gh-device-hint').textContent = `在 ${data.verificationUri} 输入 ${data.userCode}`;
        }
        ui.toast('设备码 ' + data.userCode);
        const tick = async () => {
          if (generation !== devicePollGeneration) return false;
          try {
            const poll = await fetch('/api/bridge/device/poll', { method: 'POST', signal: controller.signal });
            const out = await confirmedJson(poll, '设备码轮询');
            if (generation !== devicePollGeneration) return false;
            if (out.done === true && out.success === true && typeof out.username === 'string' && out.username) {
              devicePollTimer = null;
              devicePollController = null;
              const refreshed = await refreshAfterConfirmedAuth();
              if (generation !== devicePollGeneration) return false;
              ui.toast(refreshed ? '已验证 GitHub @' + out.username : 'GitHub 身份已确认，但状态刷新失败；请手动刷新');
              return true;
            }
            if (out.pending === true && out.done === false) {
              devicePollTimer = setTimeout(tick, Math.max(5, Number(out.interval) || 5) * 1000);
              return true;
            }
            devicePollTimer = null;
            devicePollController = null;
            ui.toast(('设备码登录结束：' + (out.error || '服务器未确认身份')).slice(0, 180));
            return false;
          } catch (error) {
            if (generation !== devicePollGeneration || error.name === 'AbortError') return false;
            devicePollTimer = null;
            devicePollController = null;
            await refreshAfterConfirmedAuth();
            ui.toast(('设备码轮询结果未确认，已停止自动轮询：' + (error.message || '请核对身份状态')).slice(0, 180));
            return false;
          }
        };
        devicePollTimer = setTimeout(tick, Math.max(5, Number(data.interval) || 5) * 1000);
        return true;
      } catch (error) {
        if (generation !== devicePollGeneration || error.name === 'AbortError') return false;
        devicePollController = null;
        ui.toast(('无法开始设备码登录：' + (error.message || '请核对主机配置')).slice(0, 180));
        return false;
      } finally {
        if (generation === devicePollGeneration) button.disabled = false;
      }
    };
  }
  if ($('#btn-gh-clear')) {
    $('#btn-gh-clear').onclick = async () => {
      cancelDevicePoll();
      try {
        const response = await fetch('/api/bridge/github/clear', { method: 'POST' });
        const data = await confirmedJson(response, '清除 GitHub 身份');
        if (data.success !== true || data.provider !== 'local-demo' || data.username !== 'local') {
          throw new Error(data.error || '服务器未确认清除 GitHub 身份');
        }
        const refreshed = await refreshAfterConfirmedAuth();
        ui.toast(refreshed ? '已清除 GitHub 身份，仍保留本机演示授权' : 'GitHub 身份清除已确认，但状态刷新失败；请手动刷新');
        return true;
      } catch (error) {
        ui.toast(('清除 GitHub 身份未确认：' + (error.message || '请核对主机状态')).slice(0, 180));
        return false;
      }
    };
  }
  $('#btn-refresh-auth').onclick = () => { ui.paintBridge(); ui.toast('已刷新状态'); };

  $('#btn-add-agent').onclick = async () => {
    const agents = [...((state.custom && state.custom.agents) || []), {
      id: Date.now().toString(36),
      name: $('#ag-name').value || '未命名',
      role: $('#ag-role').value
    }];
    if (!await ui.saveCustom({ agents })) return;
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
    try {
      const name = $('#sk-name').value;
      const content = $('#sk-body').value || skillMarkdown(name, $('#sk-when').value, $('#sk-steps').value);
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, content })
      });
      const data = await confirmedJson(response, 'Skill 创建');
      if (data.success !== true || typeof data.path !== 'string' || !data.path) {
        throw new Error(data.error || '服务器未确认 Skill 创建');
      }
      const refreshed = await ui.loadSkills();
      ui.toast(refreshed === false ? 'Skill 创建已确认，但目录刷新失败；请手动刷新' : '已创建 Skill 文件夹');
      return true;
    } catch (error) {
      ui.toast(('Skill 创建状态未知：' + (error.message || '请核对主机与目录')).slice(0, 180));
      return false;
    }
  };
  onClick('#btn-detect-env', async () => {
    const fields = ['#env-os', '#env-shell'];
    const before = fields.map(selector => $(selector)?.value);
    try {
      const env = (await detectProfile()).environment;
      if (fields.some((selector, index) => $(selector)?.value !== before[index])) {
        if ($('#env-status')) $('#env-status').textContent = '探测完成，但输入已变化；已保留当前草稿，请需要时重新探测。';
        return false;
      }
      if ($('#env-os')) $('#env-os').value = env.os || 'auto';
      if ($('#env-shell')) $('#env-shell').value = env.shell || 'auto';
      if ($('#env-status')) $('#env-status').textContent = `探测到 ${env.os} / ${env.shell}`;
      return true;
    } catch (error) {
      if ($('#env-status')) $('#env-status').textContent = ('探测失败：' + (error.message || '请核对主机状态')).slice(0, 180);
      return false;
    }
  });
  onClick('#btn-save-env', async () => {
    if (!await ui.saveCustom({
      environment: {
        os: $('#env-os') ? $('#env-os').value : 'auto',
        shell: $('#env-shell') ? $('#env-shell').value : 'auto',
        replyLanguage: $('#env-reply') ? $('#env-reply').value : 'zh-CN',
        commitLanguage: $('#env-commit') ? $('#env-commit').value : 'zh-CN',
        notes: $('#env-notes') ? $('#env-notes').value : ''
      }
    })) return;
    if ($('#env-status')) $('#env-status').textContent = '已写入 .webagent/preference.md';
    ui.toast('已保存环境偏好');
  });
  onClick('#btn-detect-stack', async () => {
    const fields = ['#st-lang', '#st-fw', '#st-pm', '#st-test'];
    const before = fields.map(selector => $(selector)?.value);
    try {
      const stack = (await detectProfile()).techStack;
      if (fields.some((selector, index) => $(selector)?.value !== before[index])) {
        if ($('#stack-status')) $('#stack-status').textContent = '探测完成，但输入已变化；已保留当前草稿，请需要时重新探测。';
        return false;
      }
      if ($('#st-lang')) $('#st-lang').value = stack.languages;
      if ($('#st-fw')) $('#st-fw').value = stack.frameworks;
      if ($('#st-pm')) $('#st-pm').value = stack.packageManager;
      if ($('#st-test')) $('#st-test').value = stack.testCommand;
      if ($('#stack-status')) {
        $('#stack-status').textContent = stack.languages || stack.testCommand ? '已填入探测结果，确认后保存。' : '工作区没有识别到常见清单文件。';
      }
      return true;
    } catch (error) {
      if ($('#stack-status')) $('#stack-status').textContent = ('探测失败：' + (error.message || '请核对主机状态')).slice(0, 180);
      return false;
    }
  });
  onClick('#btn-save-stack', async () => {
    if (!await ui.saveCustom({
      techStack: {
        languages: $('#st-lang') ? $('#st-lang').value : '',
        frameworks: $('#st-fw') ? $('#st-fw').value : '',
        packageManager: $('#st-pm') ? $('#st-pm').value : '',
        testCommand: $('#st-test') ? $('#st-test').value : '',
        notes: $('#st-notes') ? $('#st-notes').value : ''
      }
    })) return;
    if ($('#stack-status')) $('#stack-status').textContent = '已写入 .webagent/tech-stack.md';
    ui.toast('已保存技术栈');
  });
  $('#btn-save-instr').onclick = async () => {
    if (!await ui.saveCustom({ instructions: $('#instr-text').value })) return;
    ui.toast('指令已保存到 .webagent/instructions.md');
  };
  $('#btn-add-prompt').onclick = async () => {
    const prompts = [...((state.custom && state.custom.prompts) || []), {
      id: Date.now().toString(36),
      name: $('#pr-name').value || '提示',
      content: $('#pr-body').value
    }];
    if (!await ui.saveCustom({ prompts })) return;
  };
  $('#btn-add-hook').onclick = async () => {
    const hooks = [...((state.custom && state.custom.hooks) || []), {
      event: $('#hk-event').value,
      command: $('#hk-cmd').value
    }];
    if (!await ui.saveCustom({ hooks })) return;
  };
  $('#btn-add-mcp').onclick = async () => {
    const mcpServers = [...((state.custom && state.custom.mcpServers) || []), {
      name: $('#mcp-name').value,
      url: $('#mcp-endpoint').value
    }];
    if (!await ui.saveCustom({ mcpServers })) return;
  };
  $('#btn-add-plugin').onclick = async () => {
    const plugins = [...((state.custom && state.custom.plugins) || []), { name: $('#pl-name').value }];
    if (!await ui.saveCustom({ plugins })) return;
  };
  $('#btn-add-link').onclick = async () => {
    const quickLinks = [...((state.custom && state.custom.quickLinks) || []), {
      name: $('#ql-name').value,
      url: $('#ql-url').value
    }];
    if (!await ui.saveCustom({ quickLinks })) return;
  };
  if ($('#btn-codex')) {
    $('#btn-codex').onclick = () => {
      ui.toast('Codex OAuth 未实现，不会假装已登录');
    };
  }
  $('#btn-save-mm').onclick = async () => {
    await ui.saveModelSettings({
      multiModel: {
        enabled: $('#mm-enabled').checked,
        mergeModel: $('#mm-merge').value,
        thinkLevel: $('#mm-think').value,
        mergeAllowsRead: $('#mm-readonly').checked,
        maxBranches: Number($('#mm-branches').value) || 4
      }
    });
  };
  $('#btn-save-pref').onclick = async () => {
    if (!await ui.saveCustom({
      preference: $('#pref-input').value,
      instructions: $('#instr-text').value || $('#pref-input').value
    })) return;
    ui.toast('已写入偏好');
  };

  function providerDraft() {
    return {
      baseUrl:$('#m-base').value.trim(), apiKey:$('#m-key').value.trim(),
      manualId:$('#m-id').value.trim(), vision:$('#m-vision').checked
    };
  }
  $('#btn-test-api').onclick = () => ui.configureProvider(providerDraft(), true);
  $('#btn-save-model').onclick = () => ui.configureProvider(providerDraft());
  $('#btn-use-builtin').onclick = async () => {
    if (!await ui.saveModelSettings({ activeModelId: 'builtin' })) {
      $('#model-status').textContent = '内置模型切换未确认；请核对主机状态，未自动重试。';
      return;
    }
    $('#model-status').textContent = '内置探索 Agent 选择已保存；若状态刷新失败，请核对主机，不要重复保存。';
  };

  let fileCreatePending = false;
  $('#lnk-new-file').onclick = async () => {
    if (fileCreatePending) { ui.toast('已有文件正在创建，请等待结果'); return false; }
    const name = prompt('文件名', 'untitled.js');
    if (!name) return false;
    const button = $('#lnk-new-file');
    fileCreatePending = true;
    button.disabled = true;
    try {
      const response = await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: name, content: '', createOnly: true })
      });
      const data = await confirmedJson(response, '创建文件');
      if (data.success !== true || data.path !== name || !/^[a-f0-9]{64}$/.test(data.hash || '')) {
        throw new Error(data.error || '服务器未确认文件创建');
      }
      let refreshed = true;
      try { if (await ui.loadTree() === false) refreshed = false; } catch (_) { refreshed = false; }
      try { if (await ui.openFile(name) === false) refreshed = false; } catch (_) { refreshed = false; }
      ui.toast(refreshed ? '已创建 ' + name : '文件创建已确认，但界面刷新失败；请手动刷新文件树');
      return true;
    } catch (error) {
      ui.toast(('文件创建未确认：' + (error.message || '请核对磁盘后再操作')).slice(0, 180));
      return false;
    } finally {
      fileCreatePending = false;
      button.disabled = false;
    }
  };
  $('#lnk-open-file').onclick = () => {
    $('#activitybar [data-left="explorer"]').click();
  };
  $('#lnk-open-folder').onclick = () => {
    $('#activitybar [data-left="explorer"]').click();
  };

  $('#menu-term').onclick = () => $('#panel').classList.toggle('hidden');
  $('#menu-help').onclick = () => ui.openModal('help');
  $('#btn-clear-term').onclick = () => { $('#terminal').innerHTML = ''; };
  $('#term-form').onsubmit = async (e) => {
    e.preventDefault();
    const cmd = $('#term-input').value.trim();
    if (!cmd) return false;
    $('#term-input').value = '';
    ui.termLine('$ ' + cmd, 'info');
    try {
      const response = await fetch('/api/tool/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'run_command', mode: 'code', arguments: { command: cmd } })
      });
      const data = await confirmedJson(response, '终端命令');
      const result = data.result;
      if (data.success !== true || !result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error(data.error || (result && (result.stderr || result.message)) || '服务器未确认命令成功');
      }
      if (typeof result.stdout === 'string' && result.stdout) ui.termLine(result.stdout);
      if (typeof result.stderr === 'string' && result.stderr) ui.termLine(result.stderr, 'err');
      if (!result.stdout && !result.stderr) ui.termLine('命令已完成（无输出）', 'info');
      return true;
    } catch (error) {
      ui.termLine(('命令失败或结果未确认：' + (error.message || '请核对执行状态')).slice(0, 500), 'err');
      return false;
    }
  };
  $('#btn-search').onclick = async () => {
    const q = $('#search-q').value.trim();
    if (!q) return false;
    const box = $('#search-results');
    try {
      const response = await fetch('/api/tool/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'search_files', mode: 'ask', arguments: { query: q } })
      });
      const data = await confirmedJson(response, '文件搜索');
      const hits = data.result && data.result.matches;
      if (data.success !== true || !Array.isArray(hits) || hits.some(hit => !hit || typeof hit.file !== 'string' ||
          !Number.isInteger(hit.line) || typeof hit.content !== 'string')) {
        throw new Error(data.error || '服务器未返回有效搜索结果');
      }
      box.innerHTML = hits.map((h) =>
        `<button type="button" class="tree-item search-hit" data-path="${escapeHtml(h.file)}"><b>${escapeHtml(h.file)}:${h.line}</b><span class="hint">${escapeHtml(h.content)}</span></button>`
      ).join('') || '<p class="hint">没有命中</p>';
      box.onclick = (e) => {
        const item = e.target.closest('[data-path]');
        if (item) ui.openFile(item.dataset.path);
      };
      return true;
    } catch (error) {
      box.innerHTML = '';
      box.textContent = ('搜索失败：' + (error.message || '请核对主机状态')).slice(0, 240);
      box.onclick = null;
      return false;
    }
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
    const modal = $('#modal');
    if (e.key === 'Tab' && !modal.classList.contains('hidden')) {
      const focusable = [...modal.querySelectorAll('button:not([disabled]), a[href], summary, input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => {
          const closedDetails = el.closest?.('details:not([open])');
          return !el.hidden && !el.closest?.('.hidden') && (!closedDetails || el.tagName === 'SUMMARY');
        });
      if (focusable.length) {
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
          e.preventDefault(); first.focus();
        }
      }
    }
    if (e.key === 'Escape') {
      if (!$('#agent-pick-menu').classList.contains('hidden')) {
        closeAgentMenu(); $('#btn-agent-pick').focus(); return;
      }
      closeModelPicker();
      if (!modal.classList.contains('hidden')) ui.closeModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      ui.saveActive();
    }
  });
}

ui.bind = bind;
