// Entry of the VS Code "Web Agent 设置" editor tab (R6 phase 2). The browser workbench loads app.js instead.
// The extension (webagent-core/extension/settingsPanel.js) serves this same index.html with this module in place
// of app.js and settings-panel.css after styles.css: only the settings modal is shown, full size and not closable,
// so both front ends run the same page markup and the same modules. Every host request and the two browser
// services a webview lacks (confirm dialog, clipboard) go through the extension via js/vscodeRelay.js; the page
// itself has no network access (connect-src 'none').
import { $, $$, ui } from './js/state.js';
import { setApiTransport, setHostServices } from './js/api.js';
import { createRelayTransport, createHostServices } from './js/vscodeRelay.js';
import './js/dom.js';
import './js/tabs.js';
import './js/chat.js';
import './js/bridge.js';
import './js/settings.js';
import './js/bind.js';
import './js/operations.js';

// Pages the browser opens from workbench-only buttons (toolbar, host card) get their own nav entries here.
// refresh names the ui loader the browser runs when it opens that page.
export const EXTRA_PAGES = [
  { page: 'operations', label: '审批与检查点', refresh: 'refreshOperations' },
  { page: 'diagnostics', label: '诊断', refresh: 'refreshDiagnostics' }
];

export function addExtraPages(doc = document) {
  const nav = doc.querySelector('.modal-nav');
  if (!nav) return [];
  const before = nav.querySelector('.legacy-settings');
  return EXTRA_PAGES.map(({ page, label }) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset.page = page;
    button.textContent = label;
    nav.insertBefore(button, before || null);
    return button;
  });
}

// VS Code marks the webview body with vscode-light / vscode-dark / vscode-high-contrast(-light).
export function vscodeTheme(body = document.body) {
  const names = body && body.classList;
  return names && (names.contains('vscode-light') || names.contains('vscode-high-contrast-light')) ? 'light' : 'dark';
}

// Only page ids that exist in the modal can be shown; anything else falls back to the overview.
export function knownPage(page, doc = document) {
  return typeof page === 'string' && /^[a-z]{1,32}$/.test(page) && doc.getElementById(`page-${page}`) ? page : 'overview';
}

async function boot() {
  const vscode = acquireVsCodeApi();
  const listeners = new Set();
  window.addEventListener('message', event => { for (const listener of listeners) listener(event.data); });
  const channel = { postMessage: message => vscode.postMessage(message), onMessage: listener => listeners.add(listener) };
  setApiTransport(createRelayTransport(channel));
  setHostServices(createHostServices(channel));

  const extra = addExtraPages();
  // The editor tab is the dialog: closing means closing the tab, so the modal never hides itself here.
  ui.closeModal = () => {};
  try { ui.bind(); } catch (error) { console.error('bind failed', error); }
  for (const button of extra) {
    const loader = EXTRA_PAGES.find(item => item.page === button.dataset.page).refresh;
    button.onclick = () => { ui.showPage(button.dataset.page); if (typeof ui[loader] === 'function') ui[loader](); };
  }
  const syncTheme = () => ui.applyTheme(vscodeTheme());
  syncTheme();
  new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  const show = page => {
    const target = knownPage(page);
    const button = $$('.modal-nav .nav-item').find(item => item.dataset.page === target);
    if (button && extra.includes(button)) button.onclick(); else ui.showPage(target);
  };
  // First read of the host. When it failed (host not started yet), opening the tab again from the sidebar
  // re-reads; after a good read it does not, so unsaved form input is never overwritten.
  let loadFailed = false, loading = null;
  const loadAll = () => loading || (loading = (async () => {
    const results = await Promise.allSettled([() => ui.refreshStatus(), () => ui.loadSkills(), () => ui.loadCustomizations()]
      .map(load => Promise.resolve().then(load)));
    const failed = results.filter(result => result.status === 'rejected' || result.value === false);
    loadFailed = failed.length > 0;
    if (loadFailed) {
      console.error('Some settings failed to load', failed);
      ui.toast('部分设置未能读取：请确认主机已启动，然后再点一次侧栏的齿轮重新读取。');
    }
  })().finally(() => { loading = null; }));

  ui.openModal('overview');
  show(document.documentElement.dataset.initialPage);
  channel.onMessage(message => {
    if (message && message.type === 'webagent-show-page') show(message.page);
    if (message && message.type === 'webagent-reload' && loadFailed) loadAll();
  });

  await loadAll();
  // Coming back to the tab re-reads the host, which may have been restarted or changed meanwhile.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ui.refreshStatus(); });
}

if (typeof acquireVsCodeApi === 'function') boot().catch(error => console.error(error));
