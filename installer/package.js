'use strict';
// Build only explicitly selected product code. Never recursively package the checkout.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const files = [
  'LICENSE', '双向连接核对使用指南.md', 'arena-model-probe/webagent-connection.user.js', '内置探索Agent使用指南.md', '借鉴优化说明（新手版）.md', 'Bridge统计与刷新排查.md', 'SECURITY.md', 'README.md', '使用指南.md', '技术实现.md', '架构导读.md', '组件说明.md',
  'Conda环境说明.md', '代码复盘指南.md', 'Windows新手逐步验收.md', 'review/CHECKLIST_WINDOWS.md',
  'installer/README.md', 'installer/函数详解.md',
  'webagent-core/agent-host/scripts/README.md', 'webagent-core/agent-host/scripts/运行器详解.md',
  '总览.md', '技能使用指南.md', '网页VSCode使用指南.md', 'check-env.cmd',
  'run-webagent.cmd', 'run-webagent-vscode.cmd', 'run-webagent-appwindow.cmd',
  'run-admin.cmd', 'install-vscode-extension.cmd', 'installer/launch.js',
  'webagent-core/agent-host/package.json', 'webagent-core/agent-host/package-lock.json',
  'webagent-core/admin-host/index.js', 'webagent-core/admin-host/app.js',
  'workspace/README.md',
  'docs-site/index.html', 'docs-site/app.js', 'docs-site/styles.css', 'docs-site/content.js', 'docs-site/serve.js', 'docs-site/README.md'
];
const trees = ['webagent-core/agent-host/src', 'webagent-core/workbench', 'webagent-core/scripts',
  'webagent-core/extension', 'computer-use', 'project-manager', 'multi-agent-board'];
const extensions = new Set(['.js', '.json', '.md', '.html', '.css', '.svg', '.ps1', '.cs', '.txt']);
const forbidden = new Set(['node_modules', '.git', '.webagent', 'data', 'output', 'cache', '.cache', '.local']);
function digest(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function collect(source = root) {
  const out = [];
  function add(rel) {
    const full = path.join(source, rel);
    const st = fs.lstatSync(full);
    if (st.isSymbolicLink()) throw new Error('Package inputs must not be links: ' + rel);
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(full).sort()) {
        if (forbidden.has(name.toLowerCase()) || name.startsWith('.')) continue;
        add(rel + '/' + name);
      }
    } else if (st.isFile() && (files.includes(rel) || extensions.has(path.extname(rel)))) {
      if (/\.(?:log|tmp|pem|key)$|(?:^|\/)privacy\.md$/i.test(rel)) return;
      out.push(rel);
    }
  }
  for (const rel of files) add(rel);
  for (const rel of trees) add(rel);
  return [...new Set(out)].sort();
}
function bundledDocs(source) {
  const text = fs.readFileSync(path.join(source, 'docs-site/content.js'), 'utf8');
  const match = text.match(/window\.DOCS = ([\s\S]+);\s*$/);
  if (!match) throw new Error('Invalid prebuilt documentation');
  return JSON.parse(match[1]);
}
function rewritePackagedMarkdown(rel, text, selected, docs) {
  const directory = path.posix.dirname(rel);
  const site = path.posix.relative(directory, 'docs-site/index.html');
  return text.replace(/(!?)\[([^\]]*)\]\(([^)]+)\)/g, (whole, image, label, href) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) return whole;
    const [raw, anchor] = href.split('#');
    let dest;
    try { dest = path.posix.normalize(path.posix.join(directory, decodeURIComponent(raw))); }
    catch (_) { return `${label}（仅源码仓库）`; }
    if (selected.has(dest) || [...selected].some(file => file.startsWith(dest + '/'))) return whole;
    const doc = docs.fileIndex.find(entry => entry.path === dest);
    const special = { '架构导读.md': 'guide', '技术实现.md': 'impl', '总览.md': 'graph', '组件说明.md': 'workflow' };
    const route = docs.sources[dest] ? `source/${encodeURIComponent(dest)}` : special[dest] || (doc && `files/${doc.id}`);
    if (!image && route) return `[${label}](${site}#/${route}${anchor ? '/' + anchor : ''})`;
    // Don't ship clickable links to deliberately excluded source/history/private data.
    return `${label}（仅源码仓库：\`${raw.replace(/`/g, '')}\`）`;
  });
}
function stage(source = root, target = path.join(root, 'installer/output/payload')) {
  source = path.resolve(source); target = path.resolve(target);
  if (source === target || source.startsWith(target + path.sep)) throw new Error('Invalid staging destination');
  const selected = collect(source); // Validate all inputs before replacing previous staging.
  const docs = bundledDocs(source);
  fs.rmSync(target, { recursive: true, force: true });
  const entries = [];
  const included = new Set(selected);
  for (const rel of selected) {
    let data = fs.readFileSync(path.join(source, rel));
    if (rel.endsWith('.md')) data = Buffer.from(rewritePackagedMarkdown(rel, data.toString('utf8'), included, docs));
    const dest = path.join(target, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, data);
    entries.push({ path: rel, sha256: digest(data) });
  }
  // Generate a neutral config rather than copying an operator's local password/config.
  const cfg = 'bind-addr: 127.0.0.1:3000\nauth: password\ncert: false\ndisable-telemetry: true\ndisable-update-check: true\n';
  fs.mkdirSync(path.join(target, '.config/code-server'), { recursive: true });
  fs.writeFileSync(path.join(target, '.config/code-server/config.yaml'), cfg);
  entries.push({ path: '.config/code-server/config.yaml', sha256: digest(cfg) });
  const bundled = JSON.stringify({ format: 1, prebuilt: true });
  fs.writeFileSync(path.join(target, 'docs-site/bundled.json'), bundled);
  entries.push({ path: 'docs-site/bundled.json', sha256: digest(bundled) });
  const manifest = { format: 1, files: entries };
  fs.writeFileSync(path.join(target, 'installation.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
if (require.main === module) {
  try { console.log('Staged product files:', stage().files.length); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { collect, stage, digest };
