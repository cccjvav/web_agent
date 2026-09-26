// "Web Agent 设置" editor tab (R6 phase 2). It serves the web workbench's own index.html with a different entry
// module (workbench/settings-panel.js) and one extra stylesheet, so the tab and the browser workbench run the same
// settings markup and modules; only the settings modal is shown. The page has no network access: its requests go
// through apiRelay.js to the local host this extension talks to, and the two browser services a webview lacks
// (confirm dialog, clipboard) are answered here with VS Code's modal dialog and clipboard.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createApiRelay } = require('./apiRelay');

// Files the tab needs; a directory missing any of them is not a usable workbench (e.g. an older checkout).
const WORKBENCH_FILES = ['index.html', 'styles.css', 'settings-panel.css', 'settings-panel.js', 'js/api.js', 'js/vscodeRelay.js'];
const REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CONFIRM_CHARS = 2000;
const MAX_COPY_CHARS = 128000;
const MAX_PENDING_SERVICES = 4;

// Desktop VS Code: the checkout named by host.json. code-server loads the extension from
// <repo>/webagent-core/extensions-installed/<ext>, and a development host from <repo>/webagent-core/extension.
function findWorkbenchDir({ extensionDir, hostRoot, exists = fs.existsSync }) {
  const candidates = [];
  if (hostRoot) candidates.push(path.join(hostRoot, 'webagent-core', 'workbench'));
  candidates.push(path.resolve(extensionDir, '..', '..', 'workbench'), path.resolve(extensionDir, '..', 'workbench'));
  return candidates.find(dir => WORKBENCH_FILES.every(file => exists(path.join(dir, file)))) || null;
}

function contentSecurityPolicy(nonce, cspSource) {
  // Scripts: the nonce'd entry plus the modules it imports from the workbench directory (the only local
  // resource root). No connect-src: every request goes through the extension.
  return [`default-src 'none'`, `script-src 'nonce-${nonce}' ${cspSource}`, `style-src ${cspSource} 'unsafe-inline'`,
    `img-src ${cspSource} data:`, `font-src ${cspSource}`, `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`,
    `base-uri 'none'`, `form-action 'none'`].join('; ');
}

function escapeAttribute(value) {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Rewrites the workbench page for the tab. Each edit must match exactly once; a changed page is refused with the
// reason instead of silently serving a half-working tab.
function buildSettingsHtml({ html, nonce, cspSource, resource, initialPage = 'overview' }) {
  if (typeof html !== 'string' || !/^[A-Za-z0-9+/=]{16,}$/.test(nonce || '') || !cspSource || typeof resource !== 'function') {
    throw new TypeError('buildSettingsHtml needs html, a nonce, cspSource and resource()');
  }
  let page = html;
  const edit = (label, pattern, replacement) => {
    const matches = page.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')) || [];
    if (matches.length !== 1) throw new Error(`网页工作台页面与设置页不匹配（${label}），请更新仓库后重新安装插件`);
    page = page.replace(pattern, () => replacement); // literal: a URI may contain '$'
  };
  const safePage = /^[a-z]{1,32}$/.test(initialPage) ? initialPage : 'overview';
  edit('html', /<html lang="zh-CN" data-theme="dark">/, `<html lang="zh-CN" data-theme="dark" data-initial-page="${safePage}">`);
  edit('charset', /<meta charset="UTF-8" \/>/,
    `<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(contentSecurityPolicy(nonce, cspSource))}">`);
  edit('title', /<title>[^<]*<\/title>/, '<title>Web Agent 设置</title>');
  edit('favicon', /\s*<link rel="icon" href="\.\/favicon\.svg"[^>]*>/, '');
  edit('theme script', /\s*<script>\s*try \{[\s\S]*?<\/script>/, ''); // settings-panel.js follows the VS Code theme
  edit('stylesheet', /<link rel="stylesheet" href="\.\/styles\.css" \/>/,
    `<link rel="stylesheet" href="${escapeAttribute(resource('styles.css'))}" />\n  <link rel="stylesheet" href="${escapeAttribute(resource('settings-panel.css'))}" />`);
  edit('entry', /<script type="module" src="\.\/app\.js"><\/script>/,
    `<script type="module" nonce="${nonce}" src="${escapeAttribute(resource('settings-panel.js'))}"></script>`);
  // Anything the CSP would block must not exist, so a future workbench edit fails here, loudly.
  const scripts = page.match(/<script\b[^>]*>/g) || [];
  if (scripts.length !== 1 || !scripts[0].includes(`nonce="${nonce}"`)) throw new Error('网页工作台页面含有设置页无法运行的脚本，请更新仓库后重新安装插件');
  if (/\son[a-z]+\s*=/i.test(page.replace(/<script\b[\s\S]*?<\/script>/g, ''))) throw new Error('网页工作台页面含有内联事件处理，设置页的安全策略会阻止它');
  if (/\s(?:src|href)="\.\//.test(page)) throw new Error('网页工作台页面引用了设置页未提供的本地文件');
  return page;
}

// Answers { type: 'webagent-service', id, service, text } from the page (see createHostServices in vscodeRelay.js).
// A confirm answer only tells the page's own code to continue; it grants nothing in the extension.
function createHostServiceHandler({ vscode, post, maxPending = MAX_PENDING_SERVICES }) {
  const pending = new Set();
  let disposed = false;
  const reply = message => { if (!disposed) post(message); };

  async function run(id, service, text) {
    try {
      if (service === 'confirm') {
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_CONFIRM_CHARS) throw new Error('确认内容无效');
        const pick = await vscode.window.showWarningMessage(text, { modal: true, detail: '来自“Web Agent 设置”标签页' }, '确认');
        reply({ type: 'webagent-service-result', id, ok: true, value: pick === '确认' });
      } else if (service === 'copy') {
        if (typeof text !== 'string' || text.length > MAX_COPY_CHARS) throw new Error('复制内容无效或过长');
        await vscode.env.clipboard.writeText(text);
        reply({ type: 'webagent-service-result', id, ok: true, value: true });
      } else throw new Error('设置页不支持该操作');
    } catch (error) {
      reply({ type: 'webagent-service-result', id, ok: false, error: String((error && error.message) || error).slice(0, 300) });
    } finally {
      pending.delete(id);
    }
  }

  // Returns true when the message was a service request (handled here, possibly by a refusal).
  function handle(message) {
    if (!message || typeof message !== 'object' || message.type !== 'webagent-service') return false;
    const id = message.id;
    if (typeof id !== 'string' || !REQUEST_ID.test(id) || disposed) return true;
    if (pending.has(id) || pending.size >= maxPending) {
      reply({ type: 'webagent-service-result', id, ok: false, error: pending.has(id) ? '重复的请求编号' : '设置页同时等待的确认过多' });
      return true;
    }
    pending.add(id);
    void run(id, message.service, message.text);
    return true;
  }

  return { handle, dispose() { disposed = true; }, get size() { return pending.size; } };
}

// One tab per window: opening again reveals it (and switches page when asked).
// send(method, path, body, { signal, timeoutMs }) -> { status, contentType, raw } reaches the local host.
function createSettingsPanel({ vscode, extensionDir, hostRoot = () => null, send, log = () => {} }) {
  let panel = null;

  function open(page) {
    const target = typeof page === 'string' && /^[a-z]{1,32}$/.test(page) ? page : undefined;
    if (panel) {
      panel.reveal();
      if (target) panel.webview.postMessage({ type: 'webagent-show-page', page: target });
      // Opening again is also how the user retries after a failed first read (host started meanwhile).
      panel.webview.postMessage({ type: 'webagent-reload' });
      return panel;
    }
    let root = null;
    try { root = hostRoot(); } catch { /* fall back to the code-server / development layouts */ }
    const dir = findWorkbenchDir({ extensionDir, hostRoot: root });
    if (!dir) {
      throw new Error('找不到网页工作台文件（webagent-core/workbench，需包含 settings-panel.js）。桌面 VS Code：请在仓库根重新运行 install-vscode-extension.cmd 并重载窗口。');
    }
    const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const created = vscode.window.createWebviewPanel('webagent.settings', 'Web Agent 设置', vscode.ViewColumn.Active, {
      enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.file(dir)]
    });
    const webview = created.webview;
    try {
      webview.html = buildSettingsHtml({
        html, nonce: crypto.randomBytes(18).toString('base64'), cspSource: webview.cspSource, initialPage: target,
        resource: rel => webview.asWebviewUri(vscode.Uri.file(path.join(dir, ...rel.split('/')))).toString()
      });
    } catch (error) {
      created.dispose();
      throw error;
    }
    const post = message => { try { webview.postMessage(message); } catch { /* panel closing */ } };
    const relay = createApiRelay({ send, post });
    const services = createHostServiceHandler({ vscode, post });
    const listener = webview.onDidReceiveMessage(message => { if (!relay.handle(message)) services.handle(message); });
    created.onDidDispose(() => {
      relay.dispose();
      services.dispose();
      if (listener && typeof listener.dispose === 'function') listener.dispose();
      if (panel === created) panel = null;
    });
    panel = created;
    log(`[settings] 设置页已打开，界面文件来自 ${dir}`);
    return panel;
  }

  return { open, dispose() { if (panel) panel.dispose(); }, get panel() { return panel; } };
}

module.exports = { createSettingsPanel, createHostServiceHandler, buildSettingsHtml, findWorkbenchDir, contentSecurityPolicy,
  WORKBENCH_FILES, MAX_CONFIRM_CHARS, MAX_COPY_CHARS, MAX_PENDING_SERVICES };
