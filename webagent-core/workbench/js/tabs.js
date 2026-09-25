import { $, state, ui } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml } from './dom.js';

export function paintTabs() {
  const tabs = $('#tabs');
  tabs.innerHTML = '';
  state.tabs.forEach((t, index) => {
    const d = document.createElement('div');
    const active = t.id === state.activeTab;
    d.className = 'tab' + (active ? ' on' : '');
    d.setAttribute?.('role', 'presentation');
    d.innerHTML = `<button type="button" id="editor-tab-${index}" class="tab-label" role="tab" aria-selected="${active}" aria-controls="editor-wrap" tabindex="${active ? 0 : -1}"><span>${escapeHtml(t.title)}${t.dirty ? ' •' : ''}</span></button>`;
    const label = d.querySelector('.tab-label');
    label.onclick = () => {
      activateTab(t.id);
      tabs.querySelector('[aria-selected="true"]')?.focus?.();
    };
    label.onkeydown = (event) => {
      const key = event.key;
      if (key === 'Delete') { event.preventDefault(); closeTab(t.id); return; }
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
      event.preventDefault();
      const last = state.tabs.length - 1;
      const target = key === 'Home' ? 0 : key === 'End' ? last
        : key === 'ArrowRight' ? (index + 1) % state.tabs.length : (index + last) % state.tabs.length;
      activateTab(state.tabs[target].id);
      tabs.querySelectorAll('.tab-label')[target]?.focus?.();
    };
    tabs.appendChild(d);
  });
  const cur = state.tabs.find((t) => t.id === state.activeTab);
  if (cur) {
    $('#editor-wrap').setAttribute?.('role', 'tabpanel');
    $('#editor-wrap').setAttribute?.('aria-labelledby', `editor-tab-${state.tabs.indexOf(cur)}`);
  }
  const close = $('#btn-close-tab');
  if (close) {
    close.disabled = state.tabs.length <= 1;
    close.setAttribute?.('aria-label', `关闭 ${cur?.title || '当前编辑器'}`);
    close.onclick = () => closeTab(state.activeTab);
  }
  $('#window-title').textContent = cur ? cur.title : '欢迎';
  $('#sb-file').textContent = cur ? cur.title : '欢迎';
  document.title = `${cur ? cur.title : '欢迎'} — Web Agent`;
}

export function captureActiveFile() {
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab || tab.kind !== 'file') return;
  tab.content = tab.model ? tab.model.getValue() : $('#editor-fallback').value;
  if (tab.model && state.editor) tab.viewState = state.editor.saveViewState();
  tab.dirty = tab.content !== tab.savedContent;
}

let safetyBound = false;
export function initEditorSafety() {
  if (safetyBound) return;
  safetyBound = true;
  $('#editor-fallback').addEventListener('input', () => { captureActiveFile(); paintTabs(); });
  $('#btn-preview-save').onclick = savePreview;
  window.addEventListener('beforeunload', event => {
    captureActiveFile();
    if (state.tabs.some(t => t.kind === 'file' && (t.dirty || t.saving))) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

export function activateTab(id) {
  if (Number(window.innerWidth) <= 700) ui.closeSidebar?.();
  ui.setWorkspaceView?.('editor');
  captureActiveFile();
  state.activeTab = id;
  const t = state.tabs.find((x) => x.id === id);
  $('#welcome').classList.toggle('hidden', !t || t.kind !== 'welcome');
  $('#browser').classList.toggle('hidden', !t || t.kind !== 'browser');
  $('#agent-pane').classList.toggle('hidden', !t || t.kind !== 'agent');
  $('#diff-pane').classList.toggle('hidden', !t || t.kind !== 'diff');
  const showEditor = t && t.kind === 'file';
  $('#editor').classList.toggle('hidden', !showEditor || !state.editor);
  $('#editor-fallback').classList.toggle('hidden', !showEditor || !!state.editor);
  if (showEditor) applyEditor(t);
  if (t && t.kind === 'browser') ui.renderBrowser(t);
  if (t && t.kind === 'diff') paintDiff(t);
  paintTabs();
}

export function closeTab(id) {
  captureActiveFile();
  const tab = state.tabs.find(t => t.id === id);
  if (!tab || state.tabs.length === 1) return;
  if (tab.saving) return ui.toast('正在保存，请等待完成后再关闭');
  if (tab.dirty && !window.confirm('“' + tab.title + '”有未保存修改，确定放弃并关闭？')) return;
  if (state.activeTab === id) {
    state.activeTab = null;
    if (state.editor) state.editor.setModel(null);
  }
  if (tab.modelListener) tab.modelListener.dispose();
  if (tab.model) tab.model.dispose();
  state.tabs = state.tabs.filter((t) => t.id !== id);
  if (state.activeTab == null) activateTab(state.tabs[state.tabs.length - 1].id);
  else paintTabs();
  $('#tabs').querySelector?.('[aria-selected="true"]')?.focus?.();
}

export function openAgentWindow() {
  let tab = state.tabs.find((t) => t.id === 'agent');
  if (!tab) {
    tab = { id: 'agent', title: '智能体', kind: 'agent' };
    state.tabs.push(tab);
  }
  ui.setRight('chat');
  activateTab('agent');
  ui.paintChat();
}

export function openDiff(filePath, diff, preview = null) {
  const id = 'diff:' + filePath;
  let tab = state.tabs.find((t) => t.id === id);
  if (!tab) {
    tab = { id, title: filePath.split('/').pop() + ' (diff)', kind: 'diff', path: filePath, diff };
    state.tabs.push(tab);
  } else {
    tab.diff = diff;
  }
  tab.preview = preview;
  activateTab(id);
}

export function paintDiff(tab) {
  $('#diff-title').textContent = (tab.path || 'Diff') + (tab.preview?.undo ? ' · 回退预览，尚未执行' : tab.preview ? ' · 草稿预览，尚未保存' : '');
  $('#btn-preview-save').classList.toggle('hidden', !tab.preview);
  $('#btn-preview-save').textContent = tab.preview?.undo ? '确认回退这次保存' : '确认保存这份预览';
  const lines = String(tab.diff || '').split('\n');
  $('#diff-body').innerHTML = lines.map((line) => {
    const cls = line.startsWith('+') && !line.startsWith('+++') ? 'diff-add'
      : line.startsWith('-') && !line.startsWith('---') ? 'diff-del'
        : line.startsWith('@@') ? 'diff-hunk' : '';
    return `<div class="${cls}">${escapeHtml(line) || ' '}</div>`;
  }).join('');
}

export function ensureWelcome() {
  if (!state.tabs.some((t) => t.id === 'welcome')) {
    state.tabs.unshift({ id: 'welcome', title: '欢迎', kind: 'welcome' });
  }
  activateTab('welcome');
}

export async function openFile(filePath) {
  try {
    let tab = state.tabs.find(t => t.id === 'file:' + filePath);
    if (!tab) {
      const res = await apiFetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '无法打开');
      if (typeof data.content !== 'string' || !/^[a-f0-9]{64}$/.test(data.hash || '')) {
        throw new Error('文件响应缺少内容或有效版本号');
      }
      // Another open may have completed while this request was pending.
      tab = state.tabs.find(t => t.id === 'file:' + filePath);
      if (!tab) {
        tab = { id: 'file:' + filePath, title: filePath.split('/').pop(), kind: 'file',
          path: filePath, content: data.content, savedContent: data.content, hash: data.hash, dirty: false };
        state.tabs.push(tab);
      }
    }
    activateTab(tab.id);
    return true;
  } catch (err) {
    ui.toast('打开失败：' + err.message);
    return false;
  }
}

export function langFor(p) {
  if (p.endsWith('.js')) return 'javascript';
  if (p.endsWith('.json')) return 'json';
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.html')) return 'html';
  return 'plaintext';
}

export function applyEditor(tab) {
  if (state.editor && window.monaco) {
    if (!tab.model) {
      tab.model = window.monaco.editor.createModel(tab.content || '', langFor(tab.path || ''));
      tab.modelListener = tab.model.onDidChangeContent(() => {
        tab.content = tab.model.getValue();
        tab.dirty = tab.content !== tab.savedContent;
        paintTabs();
      });
    }
    state.editor.setModel(tab.model);
    if (tab.viewState) state.editor.restoreViewState(tab.viewState);
  } else {
    $('#editor-fallback').value = tab.content || '';
  }
}

export function reconcilePatchedFile(filePath, disk) {
  if (!disk || typeof disk.content !== 'string' || !/^[a-f0-9]{64}$/.test(disk.hash || '')) {
    throw new Error('文件响应缺少内容或有效版本号');
  }
  const tab = state.tabs.find(candidate => candidate.id === 'file:' + filePath);
  if (!tab) return { status: 'closed' };
  if (state.activeTab === tab.id) captureActiveFile();
  if (tab.dirty && tab.content !== disk.content) {
    return { status: 'dirty', path: filePath };
  }
  tab.content = disk.content;
  tab.savedContent = disk.content;
  tab.hash = disk.hash;
  tab.dirty = false;
  if (tab.model && tab.model.getValue() !== disk.content) tab.model.setValue(disk.content);
  if (state.activeTab === tab.id && !tab.model) $('#editor-fallback').value = disk.content;
  paintTabs();
  return { status: 'updated', path: filePath };
}

function validTreeItems(items, depth = 0) {
  if (!Array.isArray(items) || depth > 8) return false;
  return items.every(item => {
    if (!item || typeof item !== 'object' || typeof item.name !== 'string' || !['file', 'directory'].includes(item.type)) return false;
    if (item.type === 'file') return typeof item.path === 'string';
    return item.children === undefined || validTreeItems(item.children, depth + 1);
  });
}

export function treeHtml(items, depth = 0) {
  if (!items) return '';
  return items.map((it) => {
    if (it.type === 'directory') {
      return `<div class="tree-dir">
        <button type="button" class="tree-item dir" data-dir="1" aria-expanded="true" style="padding-left:${8 + depth * 12}px"><span class="chev">▾</span>${escapeHtml(it.name)}</button>
        <div class="tree-kids">${treeHtml(it.children || [], depth + 1)}</div>
      </div>`;
    }
    return `<button type="button" class="tree-item" data-path="${escapeHtml(it.path)}" style="padding-left:${8 + depth * 12}px">${escapeHtml(it.name)}</button>`;
  }).join('');
}

// The welcome page's "工作区文件" list. It used to be the first six files in depth-first order,
// which in a real repository meant `.config/…` and `.github/…` files ahead of anything a person
// opens. Now: top-level entry files first (README, package manifests, in that order), then the
// most recently modified files anywhere in the tree (the tree already carries mtime), skipping
// dot-directories. Still derived from the tree listing, not a real "recently opened" history.
const ENTRY_FILES = ['readme.md', 'readme', 'package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'makefile'];

export function welcomeFiles(items, limit = 6) {
  const files = [];
  (function walk(list, depth) {
    for (const it of list || []) {
      if (it.type === 'file') files.push({ ...it, depth });
      else if (it.children && !String(it.name || '').startsWith('.')) walk(it.children, depth + 1);
    }
  })(items || [], 0);
  const entry = (f) => (f.depth === 0 ? ENTRY_FILES.indexOf(String(f.name || '').toLowerCase()) : -1);
  const time = (f) => { const t = Date.parse(f.mtime); return Number.isFinite(t) ? t : 0; };
  const firsts = files.filter((f) => entry(f) >= 0).sort((a, b) => entry(a) - entry(b));
  const rest = files.filter((f) => entry(f) < 0 && !String(f.name || '').startsWith('.'))
    .sort((a, b) => time(b) - time(a) || String(a.path).localeCompare(String(b.path)));
  return [...firsts, ...rest].slice(0, limit);
}

export async function loadTree() {
  const response = await apiFetch('/api/files/tree');
  const data = await response.json();
  if (!response.ok) throw new Error(data && data.error || `文件树请求失败（HTTP ${response.status || '错误'}）`);
  if (!data || typeof data !== 'object' || !validTreeItems(data.items)) throw new Error('文件树响应格式无效');
  const box = $('#file-tree');
  // The host stops after 1000 entries and says so; a silently shortened tree looks complete.
  box.innerHTML = treeHtml(data.items) + (data.truncated === true
    ? '<p class="tree-truncated hint" role="note">文件较多，仅显示前 1000 项；可用搜索或让 Agent 用 list_directory 指定子目录查看。</p>'
    : '');
  box.onclick = (e) => {
    const dir = e.target.closest('.tree-item.dir');
    if (dir) {
      const kids = dir.parentElement && dir.parentElement.querySelector(':scope > .tree-kids');
      if (kids) {
        const hide = kids.style.display === 'none';
        kids.style.display = hide ? '' : 'none';
        const chev = dir.querySelector('.chev');
        if (chev) chev.textContent = hide ? '▾' : '▸';
        dir.setAttribute('aria-expanded', hide ? 'true' : 'false');
      }
      return;
    }
    const item = e.target.closest('.tree-item[data-path]');
    if (item) openFile(item.dataset.path);
  };
  $('#recent-list').innerHTML = welcomeFiles(data.items).map((f) =>
    `<button type="button" data-open="${escapeHtml(f.path)}">${escapeHtml(f.name)} <span class="path">${escapeHtml(f.path)}</span></button>`
  ).join('') || '<p class="hint">工作区还没有文件</p>';
  $('#recent-list').onclick = (e) => {
    const b = e.target.closest('button[data-open]');
    if (b) openFile(b.dataset.open);
  };
  return true;
}
export async function saveActive() {
  captureActiveFile();
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab || tab.kind !== 'file' || tab.saving) return;
  if (!/^[a-f0-9]{64}$/.test(tab.hash || '')) return ui.toast('缺少文件版本号，不能安全保存');
  return saveFile(tab, tab.content, tab.hash);
}

async function saveFile(tab, content, expectedHash) {
  tab.saving = true;
  try {
    const res = await apiFetch('/api/files/content', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tab.path, content, expectedHash })
    });
    const data = await res.json();
    if (res.status === 409) throw new Error('磁盘文件已变化，未覆盖。请保留当前编辑并核对磁盘版本');
    if (!res.ok || data.success !== true) throw new Error(data.error || '服务器未确认保存成功');
    if (!/^[a-f0-9]{64}$/.test(data.hash || '')) throw new Error('保存响应缺少版本号，请核对磁盘状态');
    tab.hash = data.hash;
    tab.undo = data.undo || null;
    tab.savedContent = content;
    captureActiveFile();
    tab.dirty = tab.content !== tab.savedContent;
    ui.toast('已保存 ' + tab.path + (tab.dirty ? '（仍有后续未保存修改）' : ''));
  } catch (err) {
    ui.toast('保存失败：' + err.message);
  } finally {
    tab.saving = false;
    paintTabs();
  }
}

ui.captureActiveFile = captureActiveFile;
ui.initEditorSafety = initEditorSafety;

ui.paintTabs = paintTabs;
ui.activateTab = activateTab;
ui.closeTab = closeTab;
ui.openAgentWindow = openAgentWindow;
ui.openDiff = openDiff;
ui.paintDiff = paintDiff;
ui.ensureWelcome = ensureWelcome;
ui.openFile = openFile;
ui.langFor = langFor;
ui.applyEditor = applyEditor;
ui.reconcilePatchedFile = reconcilePatchedFile;
ui.treeHtml = treeHtml;
ui.loadTree = loadTree;
ui.saveActive = saveActive;

export async function previewActive() {
  captureActiveFile();
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab || tab.kind !== 'file' || tab.saving || tab.previewing) return;
  const content = tab.content, expectedHash = tab.hash;
  tab.previewing = true;
  try {
    const response = await apiFetch('/api/files/preview', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({path:tab.path,content,expectedHash}) });
    const data = await response.json();
    if (!response.ok || data.success !== true) throw Error(data.error || '预览失败');
    captureActiveFile();
    if (!state.tabs.includes(tab) || state.activeTab !== tab.id || tab.content !== content || tab.hash !== expectedHash) throw Error('草稿或标签已变化，未打开旧预览；请重新预览');
    if (data.expectedHash !== expectedHash || data.path !== tab.path || typeof data.diff !== 'string') throw Error('预览响应与文件版本不一致');
    openDiff(tab.path, data.diff, { source:tab, content, expectedHash });
  } catch(error) { ui.toast('预览未保存：' + error.message); }
  finally { tab.previewing = false; }
}
export async function savePreview() {
  const tab = state.tabs.find(t => t.id === state.activeTab);
  const preview = tab?.preview;
  if (!preview) return;
  const source = preview.source;
  if (!state.tabs.includes(source) || source.saving || source.content !== preview.content || source.hash !== preview.expectedHash) return ui.toast('草稿或文件版本已变化，请重新预览；未保存');
  // Consume the reviewed snapshot before dispatch; even an unknown response must not replay.
  tab.preview = null;
  paintDiff(tab);
  if (!preview.undo) return saveFile(source, preview.content, preview.expectedHash);
  source.saving = true;
  source.undo = null;
  try {
    const response = await apiFetch('/api/files/undo/' + encodeURIComponent(preview.undo), { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,expectedHash:preview.expectedHash,workspaceRoot:state.status?.workspaceRoot,hostInstanceId:state.status?.identity?.hostInstanceId}) });
    const data = await response.json();
    if (!response.ok || data.success !== true || data.path !== source.path || typeof data.content !== 'string' || !/^[a-f0-9]{64}$/.test(data.hash || '')) throw Error(data.error || '回退结果未知，请检查磁盘');
    captureActiveFile();
    source.hash = data.hash;
    source.savedContent = data.content;
    // Preserve any edits made while the restore request was pending.
    if (source.content === preview.content) {
      source.content = data.content;
      if (source.model) source.model.setValue(data.content);
      if (state.activeTab === source.id) applyEditor(source);
    }
    source.dirty = source.content !== source.savedContent;
    ui.toast('已回退 ' + source.path + (source.dirty ? '（仍保留后续草稿）' : ''));
  } catch(error) { ui.toast('回退未确认：' + error.message); }
  finally { source.saving = false; paintTabs(); }
}
ui.previewActive = previewActive;
ui.savePreview = savePreview;

export async function previewUndo() {
  captureActiveFile();
  const tab = state.tabs.find(t => t.id === state.activeTab);
  if (!tab || tab.kind !== 'file' || tab.saving || tab.previewing) return;
  if (tab.dirty) return ui.toast('请先保留并处理未保存草稿，不能用回退覆盖草稿');
  if (!tab.undo?.id) return ui.toast('此文件没有可回退记录（仅本页面近期的有版本号保存，非持久备份）');
  const content = tab.content, expectedHash = tab.hash, id = tab.undo.id;
  tab.previewing = true;
  try {
    const response = await apiFetch('/api/files/undo/' + encodeURIComponent(id));
    const data = await response.json();
    if (!response.ok || data.success !== true) throw Error(data.error || '回退预览失败');
    captureActiveFile();
    if (!state.tabs.includes(tab) || state.activeTab !== tab.id || tab.content !== content || tab.hash !== expectedHash || tab.undo?.id !== id) throw Error('草稿或版本变化，请重新核对');
    if (data.path !== tab.path || data.expectedHash !== expectedHash || typeof data.diff !== 'string') throw Error('回退预览版本不一致');
    openDiff(tab.path, data.diff, {source:tab,content,expectedHash,undo:id});
  } catch(error) { ui.toast('未回退：' + error.message); }
  finally { tab.previewing = false; }
}
ui.previewUndo = previewUndo;
