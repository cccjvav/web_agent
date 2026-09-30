import { $, $$, ui, state } from './state.js';

export function applyTheme(theme, { persist = true } = {}) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = selected;
  if (persist) {
    try { localStorage.setItem('webagent-theme', selected); } catch (_) { /* private/storage-disabled browser */ }
  }
  const button = $('#btn-theme');
  if (button) {
    button.textContent = selected === 'light' ? '深色' : '浅色';
    button.setAttribute('aria-label', `切换到${selected === 'light' ? '深色' : '浅色'}主题`);
  }
  if (window.monaco) window.monaco.editor.setTheme(selected === 'light' ? 'vs' : 'vs-dark');
  return selected;
}

// Without a stored choice the page follows the operating system (prefers-color-scheme) on every
// load; only the theme button stores a choice, which then wins. Storing the fallback here would
// freeze the first visit's answer forever. Browsers without matchMedia get dark as before.
export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('webagent-theme'); } catch (_) {}
  if (saved === 'light' || saved === 'dark') return applyTheme(saved, { persist: false });
  let prefersLight = false;
  try { prefersLight = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches === true; } catch (_) {}
  return applyTheme(prefersLight ? 'light' : 'dark', { persist: false });
}


// Text size. The stylesheet expresses every font size in rem, so scaling the root font size
// scales the whole workbench together instead of leaving hardcoded 11px labels unreadable.
// The Monaco editor sizes its own text in px, so it follows the same scale explicitly
// (EDITOR_BASE_FONT_PX × scale, like VS Code's window zoom). This only affects this page's
// rendering; it never touches file contents or anything on the host.
export const TEXT_SCALE_MIN = 0.85;
export const TEXT_SCALE_MAX = 1.6;
export const TEXT_SCALE_STEP = 0.1;
export const EDITOR_BASE_FONT_PX = 13;

export function editorFontSize(scale) {
  return Math.round(EDITOR_BASE_FONT_PX * clampScale(scale));
}

// Authoritative value lives here rather than being re-read from computed styles: the element may
// not have been laid out yet at boot, and reading back a percentage would re-introduce rounding.
let textScale = 1;

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  // Round to two decimals so repeated steps cannot accumulate float drift in localStorage.
  return Math.round(Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, n)) * 100) / 100;
}

export function applyTextScale(scale) {
  const value = clampScale(scale);
  textScale = value;
  const root = document.documentElement;
  if (root && root.style && typeof root.style.setProperty === 'function') {
    root.style.setProperty('--text-scale', String(value));
  }
  try { localStorage.setItem('webagent-text-scale', String(value)); } catch (_) { /* private/storage-disabled browser */ }
  if (state.editor && typeof state.editor.updateOptions === 'function') {
    try { state.editor.updateOptions({ fontSize: editorFontSize(value) }); } catch (_) { /* editor disposed mid-step */ }
  }
  const percent = Math.round(value * 100);
  for (const [selector, label, atLimit] of [
    ['#btn-text-smaller', '缩小', value <= TEXT_SCALE_MIN],
    ['#btn-text-larger', '放大', value >= TEXT_SCALE_MAX]
  ]) {
    const button = $(selector);
    if (!button) continue;
    button.setAttribute('aria-label', `${label}工作台文字（当前 ${percent}%）`);
    // Disable at the ends so the control reports its own limit instead of silently no-opping.
    button.disabled = atLimit;
  }
  return value;
}

export function currentTextScale() {
  return textScale;
}

export function stepTextScale(direction) {
  return applyTextScale(textScale + (direction > 0 ? TEXT_SCALE_STEP : -TEXT_SCALE_STEP));
}

export function initTextScale() {
  let saved = 1;
  try { saved = Number(localStorage.getItem('webagent-text-scale')) || 1; } catch (_) { /* storage disabled */ }
  return applyTextScale(saved);
}

// Measure only after the popover is attached and visible. Keep it inside the viewport.
export function positionPopover(box, anchor) {
  const margin = 8, gap = 4;
  const width = window.innerWidth, height = window.innerHeight;
  const r = anchor.getBoundingClientRect();
  const below = Math.max(0, height - r.bottom - gap - margin);
  const above = Math.max(0, r.top - gap - margin);
  const up = box.scrollHeight > below && above > below;
  box.style.position = 'fixed';
  box.style.maxWidth = `${Math.max(1, width - margin * 2)}px`;
  box.style.maxHeight = `${Math.max(1, up ? above : below)}px`;
  const bounds = box.getBoundingClientRect();
  box.style.left = `${Math.max(margin, Math.min(r.left, width - bounds.width - margin))}px`;
  box.style.top = `${Math.max(margin, Math.min(up ? r.top - gap - bounds.height : r.bottom + gap, height - bounds.height - margin))}px`;
}

// Short notes vanish after 2.2 s; longer text stays up to 6 s (≈15 characters per second of
// reading). Clicking the toast dismisses it at once.
export function toastDuration(text) {
  const len = String(text == null ? '' : text).length;
  return Math.min(6000, Math.max(2200, Math.round(len / 15 * 1000)));
}

export function toast(text) {
  const el = $('#toast');
  el.hidden = false;
  el.textContent = text;
  el.title = '点击关闭';
  el.onclick = () => { clearTimeout(toast._t); el.hidden = true; };
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, toastDuration(text));
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Review P3-8: a small block/inline Markdown renderer for model output. Every piece of source text is
// HTML-escaped before any tag is added, links only get http(s)/mailto targets, and nothing produces
// inline styles or scripts (the workbench CSP forbids both). Unclosed code fences (a stream still in
// progress) render as code up to the end.
function mdInline(text) {
  const codes = [];
  let t = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const raw = url.replace(/&amp;/g, '&');
    if (!/^(https?:\/\/|mailto:)/i.test(raw)) return m;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  t = t.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  t = t.replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>');
  return t.replace(/\u0000(\d+)\u0000/g, (_, n) => `<code>${codes[Number(n)]}</code>`);
}

function mdTableRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
}

export function renderMd(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(mdInline).join('<br>')}</p>`); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*```\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const body = [];
      while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i]);
      const lang = fence[1] ? ` class="lang-${escapeHtml(fence[1])}"` : '';
      out.push(`<pre><code${lang}>${escapeHtml(body.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { flush(); const level = Math.min(6, heading[1].length + 2); out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const quote = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s*>\s?/, ''));
      i--;
      out.push(`<blockquote>${renderMd(quote.join('\n'))}</blockquote>`);
      continue;
    }
    const listMatch = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (listMatch) {
      flush();
      const ordered = /\d/.test(listMatch[1]);
      const items = [];
      for (; i < lines.length; i++) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || /\d/.test(m[1]) !== ordered) break;
        items.push(`<li>${mdInline(m[2])}</li>`);
      }
      i--;
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
      flush();
      const head = mdTableRow(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(mdTableRow(lines[i]));
      i--;
      out.push(`<table><thead><tr>${head.map(c => `<th>${mdInline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map(r => `<tr>${r.map(c => `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    para.push(line);
  }
  flush();
  return out.join('');
}

export function termLine(text, cls = '') {
  const box = $('#terminal');
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

let modalReturnFocus = null;

export function openModal(page) {
  const modal = $('#modal');
  const active = document.activeElement;
  modalReturnFocus = active && typeof active.focus === 'function' ? active : null;
  modal.classList.remove('hidden');
  modal.setAttribute?.('aria-hidden', 'false');
  showPage(page || 'overview');
  const initial = modal.querySelector?.('#modal-close, button, a[href], summary, input, textarea, select, [tabindex]:not([tabindex="-1"])');
  initial?.focus?.();
}
export function closeModal() {
  const modal = $('#modal');
  modal.classList.add('hidden');
  modal.setAttribute?.('aria-hidden', 'true');
  const target = modalReturnFocus;
  modalReturnFocus = null;
  target?.focus?.();
}

export function showPage(id) {
  $$('.nav-item').forEach((b) => {
    const active = b.dataset.page === id;
    b.classList.toggle('on', active);
    b.setAttribute?.('aria-current', active ? 'page' : 'false');
  });
  $$('.page').forEach((p) => p.classList.toggle('hidden', p.id !== `page-${id}`));
}

export function setWorkspaceView(which) {
  if (!['editor', 'chat', 'bridge'].includes(which)) return;
  const hiddenPane = $(which === 'editor' ? '#rightbar' : '#center');
  const restoreFocus = hiddenPane?.contains?.(document.activeElement);
  const workbench = $('#workbench');
  if (workbench?.dataset) workbench.dataset.workspaceActive = which;
  $$('[data-workspace-view]').forEach(button => button.setAttribute?.('aria-pressed', String(button.dataset.workspaceView === which)));
  if (Number(window.innerWidth) <= 700) {
    if (restoreFocus) $(`[data-workspace-view="${which}"]`)?.focus?.();
  }
}

export function setRight(which) {
  const restoreFocus = $(which === 'chat' ? '#right-bridge' : '#right-chat')?.contains?.(document.activeElement);
  setWorkspaceView(which);
  const chat = $('#rb-chat-tab'), bridge = $('#rb-bridge-tab');
  chat.classList.toggle('on', which === 'chat');
  bridge.classList.toggle('on', which === 'bridge');
  chat.setAttribute?.('aria-selected', which === 'chat' ? 'true' : 'false');
  bridge.setAttribute?.('aria-selected', which === 'bridge' ? 'true' : 'false');
  chat.tabIndex = which === 'chat' ? 0 : -1;
  bridge.tabIndex = which === 'bridge' ? 0 : -1;
  $('#right-chat').classList.toggle('hidden', which !== 'chat');
  $('#right-bridge').classList.toggle('hidden', which !== 'bridge');
  if (restoreFocus) (which === 'chat' ? chat : bridge).focus?.();
}

ui.applyTheme = applyTheme;
ui.initTheme = initTheme;
ui.applyTextScale = applyTextScale;
ui.initTextScale = initTextScale;
ui.stepTextScale = stepTextScale;
ui.currentTextScale = currentTextScale;
ui.toast = toast;
ui.escapeHtml = escapeHtml;
ui.renderMd = renderMd;
ui.termLine = termLine;
ui.openModal = openModal;
ui.closeModal = closeModal;
ui.showPage = showPage;
ui.setRight = setRight;

ui.setWorkspaceView = setWorkspaceView;
