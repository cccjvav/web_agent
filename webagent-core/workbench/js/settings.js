import { $, state, ui } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml } from './dom.js';

export function rowList(items, render, empty) {
  if (!items || !items.length) return `<p class="hint">${empty}</p>`;
  return items.map(render).join('');
}

export function paintCustom({ preserveDrafts = false } = {}) {
  const c = state.custom || {};
  if (!preserveDrafts) {
    $('#instr-text').value = c.instructions || '';
    if ($('#pref-input')) $('#pref-input').value = c.preference || '';
    const env = c.environment || {};
    if ($('#env-os')) $('#env-os').value = env.os || 'auto';
    if ($('#env-shell')) $('#env-shell').value = env.shell || 'auto';
    if ($('#env-reply')) $('#env-reply').value = env.replyLanguage || 'zh-CN';
    if ($('#env-commit')) $('#env-commit').value = env.commitLanguage || 'zh-CN';
    if ($('#env-notes')) $('#env-notes').value = env.notes || '';
    const st = c.techStack || {};
    if ($('#st-lang')) $('#st-lang').value = st.languages || '';
    if ($('#st-fw')) $('#st-fw').value = st.frameworks || '';
    if ($('#st-pm')) $('#st-pm').value = st.packageManager || '';
    if ($('#st-test')) $('#st-test').value = st.testCommand || '';
    if ($('#st-notes')) $('#st-notes').value = st.notes || '';
  }
  $('#agents-list').innerHTML = ui.rowList(c.agents, (a) =>
    `<div class="list-row"><div><strong>${escapeHtml(a.name)}</strong><div class="hint">${escapeHtml(a.role || '')}</div></div></div>`,
  '还没有自定义智能体');
  $('#prompts-list').innerHTML = ui.rowList(c.prompts, (p) =>
    `<div class="list-row"><div><strong>${escapeHtml(p.name)}</strong></div><button type="button" data-insert="${escapeHtml(p.content)}">插入对话</button></div>`,
  '还没有提示');
  $('#prompts-list').onclick = (e) => {
    const b = e.target.closest('[data-insert]');
    if (!b) return;
    $('#chat-input').value = b.dataset.insert;
    ui.closeModal();
    ui.setRight('chat');
  };
  $('#hooks-list').innerHTML = ui.rowList(c.hooks, (h) =>
    `<div class="list-row"><span>${escapeHtml(h.event)} → ${escapeHtml(h.command)}</span></div>`,
  '还没有挂钩');
  $('#mcps-list').innerHTML = ui.rowList(c.mcpServers, (s) =>
    `<div class="list-row"><span>${escapeHtml(s.name)} · ${escapeHtml(s.url)}</span></div>`,
  '尚未添加 Chat 模式 MCP');
  $('#plugins-list').innerHTML = ui.rowList(c.plugins, (p) =>
    `<div class="list-row"><span>${escapeHtml(p.name || p)}</span></div>`,
  '未登记插件');
  $('#ql-list').innerHTML = ui.rowList(c.quickLinks, (l) =>
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
    ui.closeModal();
    ui.activateTab(id);
  };
  if ($('#codex-status')) {
    $('#codex-status').textContent = '未实现。不会读写 ~/.codex/auth.json。';
  }
  if (preserveDrafts) return;
  if (typeof c.multiModelEnabled === 'boolean') $('#mm-enabled').checked = c.multiModelEnabled;
  const mm = (state.status && state.status.multiModel) || {};
  if ($('#mm-enabled') && typeof mm.enabled === 'boolean') $('#mm-enabled').checked = mm.enabled;
  const mergeSel = $('#mm-merge');
  if (mergeSel) {
    const models = (state.status && state.status.models) || [];
    const extras = models.map((m) =>
      `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name || m.modelId || m.id)}</option>`
    ).join('');
    mergeSel.innerHTML = `<option value="active">用当前对话模型</option><option value="auto">用当前对话模型</option>${extras}`;
    if (mm.mergeModel) mergeSel.value = mm.mergeModel;
    const disp = $('#mm-merge-display');
    if (disp) disp.value = mm.mergeModel && mm.mergeModel !== 'active' && mm.mergeModel !== 'auto' ? mm.mergeModel : '';
  }
  if ($('#mm-think') && mm.thinkLevel) $('#mm-think').value = mm.thinkLevel;
  if ($('#mm-readonly') && typeof mm.mergeAllowsRead === 'boolean') $('#mm-readonly').checked = mm.mergeAllowsRead;
  if ($('#mm-branches') && mm.maxBranches) $('#mm-branches').value = mm.maxBranches;
}

export function paintProviderTable() {
  const box = $('#provider-table');
  if (!box) return;
  const models = ((state.status && state.status.models) || []).filter((m) => m.protocol !== 'builtin');
  if (!models.length) {
    box.innerHTML = '<p class="hint">还没有添加 API。Test 通过后点 Add API 会在此列出模型。</p>';
    return;
  }
  const groups = Object.create(null);
  models.forEach((m) => {
    const g = m.group || 'custom';
    (groups[g] = groups[g] || []).push(m);
  });
  box.innerHTML = Object.keys(groups).map((g) => {
    const rows = groups[g].map((m) => {
      const capList = (m.caps || []).slice();
      if (m.vision && !capList.some((c) => /vision/i.test(String(c)))) capList.push('vision');
      const caps = capList.map((c) => `<span class="cap-pill">${escapeHtml(c)}</span>`).join('') || '—';
      const checked = m.id === (state.status && state.status.activeModelId) ? 'checked' : '';
      return `<tr>
        <td><label><input type="radio" name="active-model" value="${escapeHtml(m.id)}" ${checked} /> ${escapeHtml(m.name || m.modelId)}</label></td>
        <td>${escapeHtml(m.contextSize || '—')}</td>
        <td>${caps}</td>
        <td>${escapeHtml(m.pricing || '')}</td>
      </tr>`;
    }).join('');
    return `<div class="model-group"><h4>${escapeHtml(g)}</h4>
      <table class="model-table"><thead><tr><th>名称</th><th>上下文大小</th><th>功能</th><th>定价</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }).join('');
  box.querySelectorAll('input[name="active-model"]').forEach((r) => {
    r.onchange = async () => {
      if (!await saveModelSettings({ activeModelId: r.value })) {
        box.querySelectorAll('input[name="active-model"]').forEach(node => {
          node.checked = node.value === state.status?.activeModelId;
        });
      }
    };
  });
}

let modelSettingsBusy = false;

async function withModelSettings(action) {
  if (modelSettingsBusy) { ui.toast('模型设置请求进行中，请等待后再操作。'); return false; }
  modelSettingsBusy = true;
  try { return await action(); }
  finally { modelSettingsBusy = false; }
}

export async function saveModelSettings(partial) {
  return withModelSettings(() => postModelSettings(partial));
}

async function postModelSettings(partial) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await apiFetch('/api/models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial), signal: controller.signal
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true
      || (partial.addProvider && data.added !== partial.addProvider.models.length)) {
      const reason = partial.addProvider
        ? (data?.code === 'E_PROVIDER_EXISTS' ? '模型已存在，未覆盖旧密钥' : 'Provider添加未确认，请核对输入与已有配置')
        : (data?.error || '模型设置保存未确认');
      ui.toast(reason + '；请核对状态，未自动重试。');
      return false;
    }
    ui.toast('已保存模型设置');
    try { if (await ui.refreshStatus() === false) throw new Error('状态刷新已被更新请求取代'); }
    catch (_) { ui.toast('模型设置已保存，但状态刷新失败；请手动核对，不要重复保存。'); }
    return true;
  } catch (error) {
    ui.toast('模型设置保存状态未知；保留输入，请核对后再操作，未自动重试：' + (partial.addProvider ? '响应丢失、超时或格式无效' : error.message));
    return false;
  } finally { clearTimeout(timer); }
}

async function probeProvider(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await apiFetch('/api/providers/probe', {
      method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
      body:JSON.stringify({baseUrl:input.baseUrl,apiKey:input.apiKey})
    });
    const data = await res.json();
    if (controller.signal.aborted) throw new Error('模型发现超时');
    if (!res.ok || data?.success !== true) throw new Error(data?.error || `HTTP ${res.status}`);
    if (!Array.isArray(data.models) || !data.models.length || data.models.length > 100
      || data.models.some(model => !model || typeof model.id !== 'string' || !model.id.trim())) {
      throw new Error('模型发现响应无效，未写入');
    }
    return data.models;
  } finally { clearTimeout(timer); }
}

export async function configureProvider(input, testOnly = false) {
  // Snapshot before the first await: later edits belong to the next explicit action.
  const draft = {...input};
  return withModelSettings(async () => {
    const note = $('#model-status');
    try {
      if (!draft.baseUrl || !draft.apiKey) throw new Error('请填写Endpoint和API Key');
      note.textContent = testOnly ? '正在读取模型列表…' : '正在准备添加模型…';
      const manual = !testOnly && !!draft.manualId;
      const models = manual ? [{id:draft.manualId}] : await probeProvider(draft);
      if (testOnly) {
        note.textContent = `模型列表读取成功 · ${models.length} 项；未保存，也未验证Chat/工具/视觉兼容性。`;
        return true;
      }
      const saved = await postModelSettings({addProvider:{baseUrl:draft.baseUrl,apiKey:draft.apiKey,vision:draft.vision,models}});
      if (!saved) {
        note.textContent = '添加未确认；请核对已有配置，未自动重试。';
        return false;
      }
      if ($('#m-key').value.trim() === draft.apiKey) $('#m-key').value = '';
      note.textContent = `已登记 ${models.length} 个模型，保留原模型/密钥，未切换当前模型。${manual ? '手动登记未做模型发现。' : ''}请明确选择模型后再使用；若刷新失败，请核对主机，不要重复保存。`;
      return true;
    } catch (_) {
      // No fallback or echoed request/response text (it can contain the supplied key).
      note.textContent = '模型发现或输入校验失败，未写入；请核对Endpoint、Key和模型列表。需要手动登记时，请明确填写模型ID后再点Add API。';
      return false;
    }
  });
}

let customBusy = false;

function isCustomSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.instructions !== 'string' || typeof value.preference !== 'string') return false;
  for (const key of ['environment', 'techStack']) {
    if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) return false;
  }
  return ['agents', 'prompts', 'hooks', 'mcpServers', 'plugins', 'quickLinks'].every(key =>
    Array.isArray(value[key]) && value[key].every(item =>
      (item && typeof item === 'object' && !Array.isArray(item)) || (key === 'plugins' && typeof item === 'string')));
}

export async function loadCustomizations() {
  if (customBusy) { ui.toast('设置请求进行中，请等待后再操作。'); return false; }
  customBusy = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await apiFetch('/api/customizations', { cache: 'no-store', signal: controller.signal });
    const data = await res.json();
    if (!res.ok || data?.success === false || !isCustomSnapshot(data)) throw new Error(data?.error || '设置响应无效');
    state.custom = data;
    ui.paintCustom();
    return data;
  } catch (error) {
    ui.toast('设置加载失败，保留当前内容：' + error.message);
    return false;
  } finally { clearTimeout(timer); customBusy = false; }
}

export async function saveCustom(partial) {
  if (customBusy) { ui.toast('设置请求进行中，请等待后再操作。'); return false; }
  customBusy = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await apiFetch('/api/customizations', {
      method: 'PUT',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
    const data = await res.json();
    if (!res.ok || data?.success !== true || !isCustomSnapshot(data.customizations)) {
      ui.toast((data?.error || '保存响应无效') + '；保存未确认，可能部分写入，请核对磁盘；未自动重试。');
      return false;
    }
    state.custom = data.customizations;
    ui.paintCustom({ preserveDrafts: true });
    return state.custom;
  } catch (error) {
    ui.toast('保存状态未知，保留草稿，请核对磁盘；未自动重试：' + error.message);
    return false;
  } finally { clearTimeout(timer); customBusy = false; }
}

let skillCatalog = [], openedSkill = null, skillRequest = 0, skillController = null;

function validSkillSummary(skill) {
  return Boolean(skill && typeof skill === 'object' && !Array.isArray(skill) &&
    typeof skill.id === 'string' && skill.id && typeof skill.name === 'string' && skill.name &&
    (skill.description === undefined || typeof skill.description === 'string') &&
    (skill.preview === undefined || typeof skill.preview === 'string'));
}

function validSkillPage(page, id, resource, offset) {
  if (!page || typeof page !== 'object' || Array.isArray(page) || page.found !== true ||
      page.id !== id || page.resource !== resource || typeof page.content !== 'string' ||
      !/^[a-f0-9]{64}$/.test(page.hash || '') || !Number.isInteger(page.fileBytes) || page.fileBytes < 0 ||
      !Number.isInteger(page.offset) || page.offset !== offset || !Number.isInteger(page.totalChars) || page.totalChars < 0 ||
      (page.nextOffset !== null && (!Number.isInteger(page.nextOffset) || page.nextOffset <= offset || page.nextOffset > page.totalChars))) return false;
  if (page.resources !== undefined && (!Array.isArray(page.resources) || page.resources.some(item => !item ||
      typeof item.path !== 'string' || typeof item.readable !== 'boolean'))) return false;
  return validSkillSummary(page);
}

export function paintSkills() {
  const query = ($('#skill-search').value || '').toLowerCase();
  const rows = skillCatalog.filter(skill => `${skill.id} ${skill.description || ''}`.toLowerCase().includes(query));
  $('#skills-list').innerHTML = rows.map(skill => `<article class="block"><h4>${escapeHtml(skill.name)}</h4>`
    + `<p class="hint">${escapeHtml(skill.id)} · 说明型 · 不自动执行${skill.shadowed ? ' · 存在同名项，请使用完整ID' : ''}</p>`
    + `<p>${escapeHtml(skill.description || skill.preview)}</p>`
    + `<button type="button" class="vs-btn" data-skill-id="${escapeHtml(skill.id)}">查看正文与资源</button></article>`).join('') || '<p class="hint">没有匹配的 Skill。</p>';
}

export async function readSkillPage(id, resource = 'SKILL.md', offset = 0, hash = '') {
  const ticket = ++skillRequest;
  if (skillController) skillController.abort();
  const controller = new AbortController(); skillController = controller;
  const timer = setTimeout(() => controller.abort(), 5000);
  if (!offset) { openedSkill = null; $('#skill-reader-content').textContent = ''; $('#skill-resources').innerHTML = ''; }
  $('#skill-reader').classList.remove('hidden');
  $('#btn-skill-more').disabled = true; $('#btn-skill-use').disabled = true; $('#btn-skill-workflow').disabled = true;
  $('#skill-reader-note').textContent = '正在只读加载…';
  try {
    const query = new URLSearchParams({ name: id, resource, offset: String(offset) });
    if (hash) query.set('expectedHash', hash);
    const response = await apiFetch('/api/skills/load?' + query, { signal: controller.signal });
    const data = await response.json();
    if (ticket !== skillRequest) return false;
    if (!response.ok || !validSkillPage(data, id, resource, offset)) throw new Error(data && (data.error || data.hint) || `HTTP ${response.status}`);
    $('#skill-reader-content').textContent = offset && openedSkill?.id === id && openedSkill?.resource === resource
      ? $('#skill-reader-content').textContent + data.content : data.content;
    openedSkill = data;
    $('#skill-reader-title').textContent = `${data.id} / ${data.resource}`;
    $('#skill-reader-note').textContent = `SHA256 ${data.hash} · 已读至 ${data.nextOffset ?? data.totalChars}/${data.totalChars} 字符。仅查看说明/源码；没有执行或安装。${data.resourcesTruncated ? '资源目录已截断，可按已知相对路径单独读取。' : ''}`;
    $('#btn-skill-more').disabled = data.nextOffset == null;
    $('#btn-skill-use').disabled = false;
    $('#btn-skill-workflow').disabled = data.resource !== 'workflow.json' || data.nextOffset != null || data.fileBytes > 32 * 1024;
    if (!offset) $('#skill-resources').innerHTML = `<button type="button" class="vs-btn" data-resource="SKILL.md">重新读取 SKILL.md</button>`
      + (data.resources || []).map(item => `<button type="button" class="vs-btn" data-resource="${escapeHtml(item.path)}" ${item.readable ? '' : 'disabled'}>${escapeHtml(item.path)}（只读）</button>`).join('');
    return true;
  } catch (error) {
    if (ticket === skillRequest) { openedSkill = null; $('#skill-reader-note').textContent = `加载失败：${error.message}。重新选择目录项，从第一页读取。`; }
    return false;
  } finally { clearTimeout(timer); if (ticket === skillRequest) skillController = null; }
}

export async function loadSkills() {
  let loaded = false;
  try {
    const response = await apiFetch('/api/skills', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.skills) || !data.skills.every(validSkillSummary) ||
        typeof data.truncated !== 'boolean' || !Array.isArray(data.warnings) || !data.warnings.every(item => typeof item === 'string')) {
      throw new Error('Skill 目录响应格式无效');
    }
    skillCatalog = data.skills;
    $('#cnt-skills').textContent = skillCatalog.length ? String(skillCatalog.length) : '';
    $('#skills-scan-note').textContent = `${skillCatalog.length} 项；来源仅表示位置，不表示授权。${data.truncated ? '扫描达到目录/数量上限，目录不完整。' : ''} ${data.warnings.join(' ')}`;
    paintSkills();
    loaded = true;
  } catch (error) { $('#skills-scan-note').textContent = `扫描失败：${error.message}`; }
  $('#skill-search').oninput = paintSkills;
  $('#btn-refresh-skills').onclick = loadSkills;
  $('#skills-list').onclick = event => {
    const button = event.target.closest('[data-skill-id]');
    if (button) readSkillPage(button.dataset.skillId);
  };
  $('#btn-skill-more').onclick = () => {
    if (openedSkill?.nextOffset != null) readSkillPage(openedSkill.id, openedSkill.resource, openedSkill.nextOffset, openedSkill.hash);
  };
  $('#skill-resources').onclick = event => {
    const button = event.target.closest('[data-resource]');
    if (button && openedSkill) readSkillPage(openedSkill.id, button.dataset.resource);
  };
  $('#btn-skill-workflow').onclick = () => {
    if (!openedSkill || openedSkill.resource !== 'workflow.json' || openedSkill.nextOffset != null || openedSkill.fileBytes > 32 * 1024) return;
    $('#ops-workflow').value = $('#skill-reader-content').textContent;
    ui.openModal('operations');
    $('#btn-ops-preview').click(); // Existing schema/risk preview only; submission/approval remain separate.
  };
  $('#btn-skill-use').onclick = () => {
    if (!openedSkill) return;
    const input = $('#chat-input');
    input.value += `${input.value ? '\n\n' : ''}请先调用 load_skill，name 为 ${JSON.stringify(openedSkill.id)}，读取说明并判断是否适用。先给出计划；未经本次授权不要写入、运行脚本或安装依赖。`;
    ui.setAgentMode('ask'); ui.setRight('chat'); ui.closeModal(); input.focus();
    ui.toast('已填入 Ask，尚未发送。内置探索不解释任意Skill；按技能推理需配置模型或使用外部AI。');
  };
  return loaded;
}

ui.rowList = rowList;
ui.paintCustom = paintCustom;
ui.paintProviderTable = paintProviderTable;
ui.loadCustomizations = loadCustomizations;
ui.saveCustom = saveCustom;
ui.saveModelSettings = saveModelSettings;
ui.configureProvider = configureProvider;
ui.loadSkills = loadSkills;
