#!/usr/bin/env node
'use strict';
// Structural evidence only: generation never certifies the prose's semantics.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const START = '<!-- docs-inventory:start -->', END = '<!-- docs-inventory:end -->';
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const normalized = text => text.replace(/\r\n/g, '\n');
const posix = text => text.split(path.sep).join('/');
function safe(root, rel) {
  if (!rel || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error('Unsafe documentation path: ' + rel);
  const full = path.join(root, rel);
  if (fs.existsSync(full)) {
    const real = fs.realpathSync(full);
    if (real !== root && !real.startsWith(root + path.sep)) throw new Error('External symlink: ' + rel);
  }
  return full;
}
function extractSymbols(source) {
  const acorn = require('../webagent-core/agent-host/node_modules/acorn');
  const options = { ecmaVersion: 'latest', locations: true, allowHashBang: true, allowReturnOutsideFunction: true };
  let ast;
  try { ast = acorn.parse(source, { ...options, sourceType: 'module' }); }
  catch (_) { ast = acorn.parse(source, { ...options, sourceType: 'script' }); }
  const symbols = [], used = new Set();
  function walk(node, scope, parent) {
    if (!node || typeof node.type !== 'string') return;
    let next = scope;
    if (/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ClassDeclaration|ClassExpression)$/.test(node.type)) {
      const named = node.id && node.id.name;
      const owner = parent && (parent.type === 'VariableDeclarator' ? parent.id : parent.key);
      const name = named || (owner && (owner.name || owner.value)) || `anonymous@${node.loc.start.line}:${node.loc.start.column}`;
      let id = [...scope, String(name)].join('/');
      if (used.has(id)) id += `@${node.loc.start.line}:${node.loc.start.column}`;
      used.add(id); next = [...scope, String(name)];
      symbols.push({ id, name: String(name), kind: node.type, startLine: node.loc.start.line, endLine: node.loc.end.line,
        parameters: (node.params || []).map(p => source.slice(p.start, p.end)) });
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, next, node));
      else if (value && typeof value === 'object') walk(value, next, node);
    }
  }
  walk(ast, [], null);
  return symbols;
}
function inventory(root = DEFAULT_ROOT) {
  root = fs.realpathSync(root);
  const config = JSON.parse(fs.readFileSync(path.join(root, 'docs-site/documentation.config.json'), 'utf8'));
  if (config.version !== 1) throw new Error('Unsupported documentation config');
  for (const rule of config.exclusions) {
    if (!rule.reason || (!rule.path && !rule.prefix)) throw new Error('Exclusion needs a path/prefix and reason');
    safe(root, rule.path || rule.prefix);
  }
  const names = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))].sort();
  const files = [], excluded = [];
  for (const name of names) {
    if (name === 'docs-site/documentation-manifest.json') continue; // Self-output must not change first-run inventory.
    const ext = path.extname(name).toLowerCase();
    if (!config.sourceExtensions.includes(ext)) continue;
    const rule = config.exclusions.find(r => r.path === name || (r.prefix && name.startsWith(r.prefix)));
    const reason = rule ? rule.reason : /(^|\/)(package-lock|npm-shrinkwrap)\.json$/.test(name) ? '依赖锁文件；归属相邻package.json，不逐key解释' : null;
    if (reason) { excluded.push({ path: name, reason }); continue; }
    const full = safe(root, name);
    if (!fs.existsSync(full)) continue; // tracked deletion is absent from the working tree inventory
    if (!fs.statSync(full).isFile()) throw new Error('Not a regular source file: ' + name);
    const source = normalized(fs.readFileSync(full, 'utf8'));
    const dir = path.posix.dirname(name);
    const doc = dir === '.' ? (/\.(cmd|bat|sh)$/.test(name) ? config.rootScriptDoc : config.rootDoc) : dir + '/README.md';
    if (!fs.existsSync(safe(root, doc))) throw new Error('Missing directory README: ' + doc + ' (source ' + name + ')');
    const parsed = ['.js', '.mjs', '.cjs'].includes(ext);
    files.push({ path: name, doc, sha256: digest(source), lineCount: source.split('\n').length,
      structure: parsed ? 'javascript-ast' : 'file-only', semanticReview: 'not-certified',
      symbols: parsed ? extractSymbols(source) : [] });
  }
  return { version: 1, hashPolicy: 'SHA-256 of UTF-8 with CRLF normalized to LF', files, excluded, config };
}
function link(from, to) {
  return posix(path.relative(path.dirname(from), to)).split('/').map(encodeURIComponent).join('/');
}
function block(doc, entries) {
  return `${START}\n## 自动源码导航\n\n此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。\n\n| 源码 | 定位证据 |\n|---|---|\n` + entries.map(f => `| [${path.posix.basename(f.path)}](${link(doc, f.path)}) | ${f.structure === 'javascript-ast' ? f.symbols.length + ' 个函数/类节点' : '文件级登记；未做符号完整性证明'} |`).join('\n') + `\n${END}`;
}
function replaceBlock(text, generated) {
  const starts = text.split(START).length - 1, ends = text.split(END).length - 1;
  if (starts !== ends || starts > 1) throw new Error('Broken or duplicate inventory markers');
  if (!starts) return text.trimEnd() + '\n\n' + generated + '\n';
  const a = text.indexOf(START), b = text.indexOf(END);
  if (b < a) throw new Error('Reversed inventory markers');
  return text.slice(0, a) + generated + text.slice(b + END.length);
}
function checkLinks(root, doc, text) {
  // Scope: inline local file links. External URLs and renderer-specific heading anchors are not certified.
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of prose.matchAll(/\[[^\]\n]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const url = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(url)) continue;
    const target = decodeURIComponent(url.split('#')[0].split('?')[0]);
    if (!target) continue;
    const rel = posix(path.normalize(path.join(path.dirname(doc), target)));
    if (!fs.existsSync(safe(root, rel))) throw new Error(`Broken local link in ${doc}: ${url}`);
  }
}
function run({ root = DEFAULT_ROOT, write = false } = {}) {
  const data = inventory(root), grouped = new Map(), expected = new Map();
  for (const f of data.files) { if (!grouped.has(f.doc)) grouped.set(f.doc, []); grouped.get(f.doc).push(f); }
  for (const [doc, entries] of grouped) {
    const text = normalized(fs.readFileSync(safe(root, doc), 'utf8'));
    expected.set(doc, replaceBlock(text, block(doc, entries)));
  }
  const manifest = { ...data }; delete manifest.config;
  expected.set('docs-site/documentation-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  const index = ['# 源码与符号索引（自动生成）', '', '不手改。行号对应清单中的源码SHA-256快照；不是永久链接。JavaScript由Acorn提取语法节点，其他语言仅登记文件，语义均未自动认证。匿名节点使用位置标识，移动后可能变化。', ''];
  for (const f of data.files) {
    index.push(`## ${f.path}`, '', `[目录说明](${link('docs-site/source-index.md', f.doc)}) · SHA-256 \`${f.sha256}\``, '');
    for (const s of f.symbols) index.push(`- \`${s.id.replace(/`/g, '')}\` — ${s.kind}，[L${s.startLine}–L${s.endLine}](${link('docs-site/source-index.md', f.path)}#L${s.startLine}-L${s.endLine})`);
    if (!f.symbols.length) index.push('- 文件级登记；没有可报告的JS函数/类节点。');
    index.push('');
  }
  expected.set('docs-site/source-index.md', index.join('\n'));
  for (const [doc, text] of expected) if (doc.endsWith('.md')) checkLinks(root, doc, text);
  for (const item of data.config.extraSiteDocs) checkLinks(root, item.path, expected.get(item.path) || fs.readFileSync(safe(root, item.path), 'utf8'));
  const stale = [];
  for (const [doc, text] of expected) {
    const full = safe(root, doc), current = fs.existsSync(full) ? normalized(fs.readFileSync(full, 'utf8')) : '';
    if (current !== text) { stale.push(doc); if (write) fs.writeFileSync(full, text); }
  }
  if (stale.length && !write) throw new Error('Documentation inventory drift (review prose, then run node docs-site/check-docs.js --write):\n' + stale.join('\n'));
  return { files: data.files.length, directories: grouped.size, excluded: data.excluded.length, updated: stale.length };
}
if (require.main === module) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--write') || process.argv.length > 3) throw new Error('Usage: node docs-site/check-docs.js [--write]');
    console.log(JSON.stringify(run({ write: process.argv.includes('--write') })));
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
module.exports = { run, inventory, extractSymbols, replaceBlock, checkLinks };
