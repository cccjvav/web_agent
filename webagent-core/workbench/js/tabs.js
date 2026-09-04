import { $, $$, state, ui } from './state.js';
import { escapeHtml } from './dom.js';

export function paintTabs() {
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
  document.title = `${cur ? cur.title : '欢迎'} — Web Agent`;
}

export function activateTab(id) {
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
  if (t && t.kind === 'browser') ui.renderBrowser(t);
  if (t && t.kind === 'diff') paintDiff(t);
  paintTabs();
}

export function closeTab(id) {
  if (state.tabs.length === 1) return;
  state.tabs = state.tabs.filter((t) => t.id !== id);
  if (state.activeTab === id) activateTab(state.tabs[state.tabs.length - 1].id);
  else paintTabs();
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

export function openDiff(filePath, diff) {
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

export function paintDiff(tab) {
  $('#diff-title').textContent = tab.path || 'Diff';
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
  let tab = state.tabs.find((t) => t.id === 'file:' + filePath);
  if (!tab) {
    const res = await fetch(`/api/files/content?path=${encodeURIComponent(filePath)}`);
    const data = await res.json();
    if (!res.ok) return ui.toast(data.error || '无法打开');
    tab = { id: 'file:' + filePath, title: filePath.split('/').pop(), kind: 'file', path: filePath, content: data.content };
    state.tabs.push(tab);
  }
  activateTab(tab.id);
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
    const model = window.monaco.editor.createModel(tab.content || '', langFor(tab.path || ''));
    state.editor.setModel(model);
  } else {
    $('#editor-fallback').value = tab.content || '';
  }
}

export function treeHtml(items, depth = 0) {
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

export async function loadTree() {
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
  const files = [];
  (function walk(items) {
    for (const it of items || []) {
      if (it.type === 'file') files.push(it);
      if (it.children) walk(it.children);
    }
  })(data.items || []);
  $('#recent-list').innerHTML = files.slice(0, 6).map((f) =>
    `<button type="button" data-open="${escapeHtml(f.path)}">${escapeHtml(f.name)} <span class="path">${escapeHtml(f.path)}</span></button>`
  ).join('') || '<p class="hint">工作区还没有文件</p>';
  $('#recent-list').onclick = (e) => {
    const b = e.target.closest('button[data-open]');
    if (b) openFile(b.dataset.open);
  };
}
export async function saveActive() {
  const tab = state.tabs.find((t) => t.id === state.activeTab);
  if (!tab || tab.kind !== 'file') return;
  const content = state.editor ? state.editor.getValue() : $('#editor-fallback').value;
  await fetch('/api/files/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: tab.path, content })
  });
  tab.content = content;
  ui.toast('已保存 ' + tab.path);
}

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
ui.treeHtml = treeHtml;
ui.loadTree = loadTree;
ui.saveActive = saveActive;
