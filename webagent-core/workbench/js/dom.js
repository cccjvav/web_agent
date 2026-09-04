import { $, $$, ui } from './state.js';

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

export function openModal(page) {
  $('#modal').classList.remove('hidden');
  showPage(page || 'overview');
}
export function closeModal() { $('#modal').classList.add('hidden'); }

export function showPage(id) {
  $$('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.page === id));
  $$('.page').forEach((p) => p.classList.toggle('hidden', p.id !== `page-${id}`));
}

export function setRight(which) {
  $('#rb-chat-tab').classList.toggle('on', which === 'chat');
  $('#rb-bridge-tab').classList.toggle('on', which === 'bridge');
  $('#right-chat').classList.toggle('hidden', which !== 'chat');
  $('#right-bridge').classList.toggle('hidden', which !== 'bridge');
}

ui.toast = toast;
ui.escapeHtml = escapeHtml;
ui.renderMd = renderMd;
ui.termLine = termLine;
ui.openModal = openModal;
ui.closeModal = closeModal;
ui.showPage = showPage;
ui.setRight = setRight;
