import { $, $$, ui } from './state.js';

export function applyTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = selected;
  try { localStorage.setItem('webagent-theme', selected); } catch (_) { /* private/storage-disabled browser */ }
  const button = $('#btn-theme');
  if (button) {
    button.textContent = selected === 'light' ? '深色' : '浅色';
    button.setAttribute('aria-label', `切换到${selected === 'light' ? '深色' : '浅色'}主题`);
  }
  if (window.monaco) window.monaco.editor.setTheme(selected === 'light' ? 'vs' : 'vs-dark');
  return selected;
}

export function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('webagent-theme') || 'dark'; } catch (_) {}
  return applyTheme(saved);
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

export function toast(text) {
  const el = $('#toast');
  el.hidden = false;
  el.textContent = text;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function renderMd(src) {
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

export function setRight(which) {
  const chat = $('#rb-chat-tab'), bridge = $('#rb-bridge-tab');
  chat.classList.toggle('on', which === 'chat');
  bridge.classList.toggle('on', which === 'bridge');
  chat.setAttribute?.('aria-selected', which === 'chat' ? 'true' : 'false');
  bridge.setAttribute?.('aria-selected', which === 'bridge' ? 'true' : 'false');
  chat.tabIndex = which === 'chat' ? 0 : -1;
  bridge.tabIndex = which === 'bridge' ? 0 : -1;
  $('#right-chat').classList.toggle('hidden', which !== 'chat');
  $('#right-bridge').classList.toggle('hidden', which !== 'bridge');
}

ui.applyTheme = applyTheme;
ui.initTheme = initTheme;
ui.toast = toast;
ui.escapeHtml = escapeHtml;
ui.renderMd = renderMd;
ui.termLine = termLine;
ui.openModal = openModal;
ui.closeModal = closeModal;
ui.showPage = showPage;
ui.setRight = setRight;
