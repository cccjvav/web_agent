// Entry of the VS Code "Web Agent 设置" editor tab (R6 phase 2). The browser workbench loads app.js instead.
// The extension (webagent-core/extension/settingsPanel.js) serves this same index.html with this module in place
// of app.js and settings-panel.css after styles.css: only the settings modal is shown, full size and not closable,
// so both front ends run the same page markup and the same modules. Every host request and the two browser
// services a webview lacks (confirm dialog, clipboard) go through the extension via js/vscodeRelay.js; the page
// itself has no network access (connect-src 'none').
import { $$, ui } from './js/state.js';
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
  { page: 'operations', label: '工具接入与审批', refresh: 'refreshOperations' },
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

// A failed read stays visible at the top of the tab until a read succeeds, with its own retry button. It used
// to be a toast that vanished after about two seconds and was easy to miss (feedback from the batch-5
// acceptance). The first read fails whenever the tab is opened before the host is started.
export const LOAD_FAILED_TEXT = '部分设置未能读取：请确认主机已启动，然后点【重新读取】（或再点一次侧栏的齿轮）。';

// state: 'failed' shows the banner with the retry button, 'loading' keeps a shown banner but disables the
// button, 'ok' hides it. A 'failed' with a reason (the extension's webagent-host-problem, F91: the host serves
// another folder) shows that reason instead of the generic text.
export function createLoadBanner(retry, doc = document) {
  const box = doc.createElement('div');
  box.id = 'load-banner';
  box.setAttribute('role', 'alert');
  box.hidden = true;
  const text = doc.createElement('span');
  text.textContent = LOAD_FAILED_TEXT;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'vs-btn primary';
  button.textContent = '重新读取';
  button.onclick = () => retry();
  box.append(text, button);
  const main = doc.querySelector('.modal-main');
  if (main) main.insertBefore(box, main.firstChild); else doc.body.prepend(box);
  const set = (state, reason = '') => {
    if (state === 'ok') { box.hidden = true; return; }
    if (state === 'loading' && box.hidden) return;
    if (state === 'failed') text.textContent = reason || LOAD_FAILED_TEXT;
    box.hidden = false;
    button.disabled = state === 'loading';
    button.textContent = state === 'loading' ? '读取中…' : '重新读取';
  };
  return { element: box, set };
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
  // hostProblem: the extension's reason for refusing requests (webagent-host-problem); cleared before each read
  // and set again by the refusal if it still applies, since that message arrives before the refused reply.
  let loadFailed = false, loading = null, hostProblem = '';
  const banner = createLoadBanner(() => loadAll());
  const loadAll = () => loading || (loading = (async () => {
    hostProblem = '';
    banner.set('loading');
    const results = await Promise.allSettled([() => ui.refreshStatus(), () => ui.loadSkills(), () => ui.loadCustomizations()]
      .map(load => Promise.resolve().then(load)));
    const failed = results.filter(result => result.status === 'rejected' || result.value === false);
    loadFailed = failed.length > 0;
    if (loadFailed) console.error('Some settings failed to load', failed);
    banner.set(loadFailed ? 'failed' : 'ok', hostProblem);
  })().finally(() => { loading = null; }));

  ui.openModal('overview');
  show(document.documentElement.dataset.initialPage);
  channel.onMessage(message => {
    if (message && message.type === 'webagent-show-page') show(message.page);
    if (message && message.type === 'webagent-reload' && loadFailed) loadAll();
    if (message && message.type === 'webagent-host-problem' && typeof message.text === 'string' && message.text) {
      hostProblem = message.text.slice(0, 500);
      loadFailed = true; // so reopening from the sidebar re-reads once the host is fixed
      if (!loading) banner.set('failed', hostProblem);
    }
  });

  await loadAll();
  // Coming back to the tab re-reads the host, which may have been restarted or changed meanwhile.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ui.refreshStatus(); });
}

if (typeof acquireVsCodeApi === 'function') boot().catch(error => console.error(error));
