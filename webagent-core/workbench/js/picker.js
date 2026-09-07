import { $, state } from './state.js';
import { escapeHtml } from './dom.js';

// 阶段 4（S4-3，ShunCode 对齐）：可搜索模型选择弹层。
// 行 = 显示名 + group/modelId + 上下文 + 能力 pill；搜索框过滤；Esc/外部点击关闭。
// 两处复用：composer 作答模型（#model-pick-btn）与多模型合并主模型（#btn-mm-pick，带 Current merge model 标记）。
let openBox = null;

function closePicker() {
  if (openBox) {
    openBox.remove();
    openBox = null;
  }
}

export function closeModelPicker() {
  closePicker();
}

export function openModelPicker({ anchor, currentId = '', onPick, mergeMark = false }) {
  closePicker();
  const models = ((state.status && state.status.models) || []).filter((m) => m.protocol !== 'builtin');
  const box = document.createElement('div');
  box.className = 'model-picker';
  box.innerHTML = '<input class="mp-search" placeholder="Search models" spellcheck="false" /><div class="mp-list"></div>';
  const list = box.querySelector('.mp-list');
  const paint = (q) => {
    const kw = String(q || '').toLowerCase();
    const rows = models.filter((m) => !kw || `${m.name} ${m.id} ${m.modelId || ''} ${m.group || ''}`.toLowerCase().includes(kw));
    list.innerHTML = rows.length
      ? rows.map((m) => {
        const caps = (m.caps || []).slice();
        if (m.vision && !caps.some((c) => /vision/i.test(String(c)))) caps.push('vision');
        const mark = mergeMark && m.id === currentId ? '<span class="mp-mark">Current merge model</span>' : '';
        return `<button type="button" class="mp-row" data-id="${escapeHtml(m.id)}">`
          + `<span class="mp-name">${escapeHtml(m.name)}</span>`
          + `<span class="mp-sub">${escapeHtml(`${m.group || 'custom'}/${m.modelId || m.id}`)}${m.contextSize ? ` · ${escapeHtml(String(m.contextSize))}` : ''}</span>`
          + `<span class="mp-caps">${caps.map((c) => `<span class="cap-pill">${escapeHtml(c)}</span>`).join('')}</span>${mark}</button>`;
      }).join('')
      : '<p class="hint">无匹配模型</p>';
  };
  paint('');
  box.querySelector('.mp-search').oninput = (e) => paint(e.target.value);
  box.querySelector('.mp-search').onkeydown = (e) => {
    if (e.key === 'Escape') closePicker();
  };
  list.onclick = (e) => {
    const b = e.target.closest('.mp-row');
    if (!b) return;
    closePicker();
    onPick(b.dataset.id);
  };
  const r = anchor.getBoundingClientRect();
  box.style.position = 'fixed';
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - 340, r.left))}px`;
  box.style.top = `${Math.min(window.innerHeight - 320, r.bottom + 4)}px`;
  document.body.appendChild(box);
  openBox = box;
  const away = (e) => {
    if (openBox && !box.contains(e.target) && e.target !== anchor) {
      closePicker();
      document.removeEventListener('mousedown', away);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', away), 0);
  box.querySelector('.mp-search').focus();
}
