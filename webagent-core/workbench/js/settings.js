import { $, $$, state, ui } from './state.js';
import { escapeHtml } from './dom.js';

export function rowList(items, render, empty) {
  if (!items || !items.length) return `<p class="hint">${empty}</p>`;
  return items.map(render).join('');
}

export function paintCustom() {
  const c = state.custom || {};
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
  const groups = {};
  models.forEach((m) => {
    const g = m.group || 'custom';
    (groups[g] = groups[g] || []).push(m);
  });
  box.innerHTML = Object.keys(groups).map((g) => {
    const rows = groups[g].map((m) => {
      const caps = (m.caps || []).map((c) => `<span class="cap-pill">${escapeHtml(c)}</span>`).join('') || '—';
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
      await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeModelId: r.value })
      });
      await ui.refreshStatus();
    };
  });
}

export async function loadCustomizations() {
  const res = await fetch('/api/customizations');
  state.custom = await res.json();
  ui.paintCustom();
}

export async function saveCustom(partial) {
  const res = await fetch('/api/customizations', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...state.custom, ...partial })
  });
  const data = await res.json();
  state.custom = data.customizations;
  ui.paintCustom();
  return state.custom;
}

export async function loadSkills() {
  const res = await fetch('/api/skills');
  const data = await res.json();
  const list = data.skills || [];
  $('#cnt-skills').textContent = list.length ? String(list.length) : '';
  $('#skills-list').innerHTML = list.length
    ? list.map((s) => `<article class="block"><h4>${escapeHtml(s.name)}</h4><p class="hint">${escapeHtml(s.path)}</p><pre style="white-space:pre-wrap;font-size:12px">${escapeHtml(s.preview)}</pre></article>`).join('')
    : '<p class="hint">还没有 Skill。把文件夹放到 .webagent/skills/ 即可。</p>';
}

ui.rowList = rowList;
ui.paintCustom = paintCustom;
ui.paintProviderTable = paintProviderTable;
ui.loadCustomizations = loadCustomizations;
ui.saveCustom = saveCustom;
ui.loadSkills = loadSkills;
