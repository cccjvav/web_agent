import { state } from './state.js';
import { escapeHtml, positionPopover } from './dom.js';

// 阶段 4（S4-3，ShunCode 对齐）：可搜索模型选择弹层。
// 行 = 显示名 + group/modelId + 上下文 + 能力 pill；搜索框过滤；Esc/外部点击关闭。
// 两处复用：composer 作答模型（#model-pick-btn）与多模型合并主模型（#btn-mm-pick，带 Current merge model 标记）。
let openBox = null;
let disposePicker = null;

function closePicker() {
  if (disposePicker) { disposePicker(); disposePicker = null; }
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
  const models = ((state.status && state.status.models) || []).filter((m) => !mergeMark || m.protocol !== 'builtin');
  const box = document.createElement('div');
  box.className = 'model-picker';
  box.innerHTML = '<input class="mp-search" aria-label="搜索模型" placeholder="搜索模型" spellcheck="false" /><div class="mp-list"></div>';
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
          + `<span class="mp-sub">${escapeHtml(m.protocol === 'builtin' ? '本机探索 · 无需 API Key（非通用大模型）' : `${m.group || 'custom'}/${m.modelId || m.id}`)}${m.contextSize ? ` · ${escapeHtml(String(m.contextSize))}` : ''}</span>`
          + `<span class="mp-caps">${caps.map((c) => `<span class="cap-pill">${escapeHtml(c)}</span>`).join('')}</span>${mark}</button>`;
      }).join('')
      : `<p class="hint">${models.length ? '无匹配模型' : mergeMark ? '尚未配置外部模型。请到 API Provider 配置合并模型。' : '模型列表尚未加载，请刷新或检查本机服务。'}</p>`;
  };
  paint('');
  box.querySelector('.mp-search').oninput = (e) => paint(e.target.value);
  list.onclick = (e) => {
    const b = e.target.closest('.mp-row');
    if (!b) return;
    closePicker();
    anchor.focus();
    onPick(b.dataset.id);
  };
  document.body.appendChild(box);
  openBox = box;
  positionPopover(box, anchor);
  const away = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) closePicker(); };
  const escape = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); anchor.focus(); } };
  const scroll = (e) => { if (!box.contains(e.target)) closePicker(); };
  document.addEventListener('scroll', scroll, true);
  const timer = setTimeout(() => document.addEventListener('mousedown', away), 0);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', closePicker);
  disposePicker = () => {
    clearTimeout(timer);
    document.removeEventListener('scroll', scroll, true);
    document.removeEventListener('mousedown', away);
    document.removeEventListener('keydown', escape);
    window.removeEventListener('resize', closePicker);
  };
  box.querySelector('.mp-search').focus();
}
