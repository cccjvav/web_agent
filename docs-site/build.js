#!/usr/bin/env node
/**
 * Pack root Markdown + folder READMEs into content.js for the visual docs site.
 * No npm dependencies. Re-run after changing 架构导读.md / 技术实现.md / 总览.md / folder READMEs.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'content.js');

const FILE_DOCS = [
  { id: 'webagent-core', path: 'webagent-core/README.md', group: '产品' },
  { id: 'agent-host', path: 'webagent-core/agent-host/README.md', group: '产品' },
  { id: 'src', path: 'webagent-core/agent-host/src/README.md', group: '进程' },
  { id: 'mcp', path: 'webagent-core/agent-host/src/mcp/README.md', group: '进程' },
  { id: 'tools', path: 'webagent-core/agent-host/src/tools/README.md', group: '进程' },
  { id: 'agent', path: 'webagent-core/agent-host/src/agent/README.md', group: '进程' },
  { id: 'models', path: 'webagent-core/agent-host/src/models/README.md', group: '进程' },
  { id: 'api', path: 'webagent-core/agent-host/src/api/README.md', group: '进程' },
  { id: 'tunnel', path: 'webagent-core/agent-host/src/tunnel/README.md', group: '进程' },
  { id: 'utils', path: 'webagent-core/agent-host/src/utils/README.md', group: '进程' },
  { id: 'tests', path: 'webagent-core/agent-host/tests/README.md', group: '产品' },
  { id: 'workbench', path: 'webagent-core/workbench/README.md', group: '界面' },
  { id: 'extension', path: 'webagent-core/extension/README.md', group: '界面' },
  { id: 'ext-installed', path: 'webagent-core/extensions-installed/README.md', group: '界面' },
  { id: 'scripts', path: 'webagent-core/scripts/README.md', group: '界面' },
  { id: 'workspace', path: 'workspace/README.md', group: '工作区' },
  { id: 'bin', path: 'bin/README.md', group: '运行时' },
  { id: 'repro', path: 'webagent-repro/README.md', group: '冻结' },
  { id: 'code-server-cfg', path: '.config/code-server/README.md', group: '运行时' },
  { id: 'launchers', path: '启动脚本说明.md', group: '入口' }
];

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slug(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[📄`]/g, '')
    .replace(/[^\w\u4e00-\u9fff./-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function rewriteHref(href) {
  if (!href) return href;
  const [rawPath, hash] = href.split('#');
  const p = rawPath || '';
  if (/^https?:\/\//i.test(p) || p.startsWith('mailto:')) return href;
  const map = {
    './架构导读.md': '#/guide',
    '架构导读.md': '#/guide',
    './技术实现.md': '#/impl',
    '技术实现.md': '#/impl',
    './总览.md': '#/graph',
    '总览.md': '#/graph',
    './组件说明.md': '#/workflow',
    '组件说明.md': '#/workflow',
    './DOCUMENTATION_SUMMARY.md': '#/files/summary',
    'DOCUMENTATION_SUMMARY.md': '#/files/summary'
  };
  if (map[p]) return hash ? `${map[p]}/${hash}` : map[p];
  const fileHit = FILE_DOCS.find((d) => p.endsWith(d.path) || p === `./${d.path}`);
  if (fileHit) return hash ? `#/files/${fileHit.id}/${hash}` : `#/files/${fileHit.id}`;
  if (p.endsWith('.md')) return href;
  return href;
}

function inline(text) {
  const parts = [];
  let i = 0;
  const src = text;
  while (i < src.length) {
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        parts.push(`<code>${escapeHtml(src.slice(i + 1, end))}</code>`);
        i = end + 1;
        continue;
      }
    }
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i) {
        parts.push(`<strong>${inline(src.slice(i + 2, end))}</strong>`);
        i = end + 2;
        continue;
      }
    }
    if (src[i] === '[') {
      const close = src.indexOf(']', i);
      if (close > i && src[close + 1] === '(') {
        const end = src.indexOf(')', close + 2);
        if (end > close) {
          const label = src.slice(i + 1, close);
          const href = rewriteHref(src.slice(close + 2, end));
          const ext = /^https?:\/\//i.test(href);
          parts.push(
            `<a href="${escapeHtml(href)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${inline(label)}</a>`
          );
          i = end + 1;
          continue;
        }
      }
    }
    let j = i + 1;
    while (j < src.length && src[j] !== '`' && src[j] !== '[' && !(src[j] === '*' && src[j + 1] === '*')) j += 1;
    parts.push(escapeHtml(src.slice(i, j)));
    i = j;
  }
  return parts.join('');
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let inList = null;

  const closeList = () => {
    if (inList) {
      out.push(inList === 'ul' ? '</ul>' : '</ol>');
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      closeList();
      const lang = line.slice(3).trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const cls = lang ? ` class="lang-${escapeHtml(lang)}"` : '';
      if (lang === 'mermaid') {
        out.push(`<pre class="mermaid-src"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      } else {
        out.push(`<pre${cls}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      }
      continue;
    }

    if (/^\s*\|.+\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      closeList();
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        i += 1;
      }
      const parseRow = (row) =>
        row
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((c) => c.trim());
      const head = parseRow(rows[0]);
      const body = rows.slice(2).map(parseRow);
      out.push('<div class="table-wrap"><table><thead><tr>');
      head.forEach((c) => out.push(`<th>${inline(c)}</th>`));
      out.push('</tr></thead><tbody>');
      body.forEach((r) => {
        out.push('<tr>');
        r.forEach((c) => out.push(`<td>${inline(c)}</td>`));
        out.push('</tr>');
      });
      out.push('</tbody></table></div>');
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push('<hr />');
      i += 1;
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const title = h[2].trim();
      const id = slug(title);
      out.push(`<h${level} id="${id}">${inline(title)}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      closeList();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`);
      continue;
    }

    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (inList !== 'ul') {
        closeList();
        out.push('<ul>');
        inList = 'ul';
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      i += 1;
      continue;
    }

    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (inList !== 'ol') {
        closeList();
        out.push('<ol>');
        inList = 'ol';
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      i += 1;
      continue;
    }

    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }

    closeList();
    const buf = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !/^\s*\|/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(buf.join(' ').replace(/\s+/g, ' '))}</p>`);
  }
  closeList();
  return out.join('\n');
}

function tocFromMd(md) {
  const toc = [];
  for (const line of md.split('\n')) {
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (!h) continue;
    const text = h[2].replace(/`/g, '').trim();
    toc.push({ level: h[1].length, text, id: slug(text) });
  }
  return toc;
}

function extractLayer(body, label) {
  const re = new RegExp(`\\*\\*${label}\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*[^*]+\\*\\*|\\n---\\s*$|$)`);
  const m = re.exec(body);
  return m ? m[1].trim() : '';
}

function parseGuide(md) {
  const chunks = md.split(/\n(?=## )/);
  const intro = chunks[0] || '';
  const sections = [];
  for (const chunk of chunks.slice(1)) {
    const nl = chunk.indexOf('\n');
    const title = chunk.slice(3, nl === -1 ? undefined : nl).trim();
    const body = nl === -1 ? '' : chunk.slice(nl + 1);
    const talk = extractLayer(body, '人话') || extractLayer(body, '人话 \\+ 隐患');
    const metaphor = extractLayer(body, '比喻');
    const files = extractLayer(body, '落在仓库哪') || extractLayer(body, '落地闭环（源码路径）');
    const jargon = extractLayer(body, '行业里管这叫什么');
    sections.push({
      id: slug(title),
      title,
      talkHtml: talk ? mdToHtml(talk) : '',
      metaphorHtml: metaphor ? mdToHtml(metaphor) : '',
      filesHtml: files ? mdToHtml(files) : '',
      jargonHtml: jargon ? mdToHtml(jargon) : '',
      html: mdToHtml(body)
    });
  }
  return { introHtml: mdToHtml(intro), sections };
}

function parseTerms(md) {
  const block = md.split('## 12. 术语对照')[1] || '';
  const table = block.split('## 13.')[0] || block;
  const rows = [];
  for (const line of table.split('\n')) {
    if (!/^\|/.test(line) || /---/.test(line) || /你听到的词/.test(line)) continue;
    const cells = line
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
    if (cells.length >= 2) rows.push({ term: cells[0], meaning: cells[1] });
  }
  return rows;
}

const guideMd = readUtf8('架构导读.md');
const implMd = readUtf8('技术实现.md');
const overviewMd = readUtf8('总览.md');
const workflowMd = readUtf8('组件说明.md');

const files = {};
for (const doc of FILE_DOCS) {
  const md = readUtf8(doc.path);
  files[doc.id] = {
    id: doc.id,
    path: doc.path,
    group: doc.group,
    title: (md.match(/^#\s+(.*)$/m) || [null, doc.path])[1],
    toc: tocFromMd(md),
    html: mdToHtml(md)
  };
}

const payload = {
  builtAt: new Date().toISOString().slice(0, 10),
  guide: parseGuide(guideMd),
  impl: {
    title: '代码直译技术实现',
    toc: tocFromMd(implMd),
    html: mdToHtml(implMd)
  },
  overview: {
    title: '总览（知识图谱）',
    toc: tocFromMd(overviewMd),
    html: mdToHtml(overviewMd)
  },
  workflow: {
    title: '组件说明',
    toc: tocFromMd(workflowMd),
    html: mdToHtml(workflowMd)
  },
  terms: parseTerms(guideMd),
  files,
  fileIndex: FILE_DOCS.map((d) => ({ id: d.id, path: d.path, group: d.group }))
};

fs.writeFileSync(
  OUT,
  `/* generated by docs-site/build.js — do not edit by hand */\nwindow.DOCS = ${JSON.stringify(payload)};\n`,
  'utf8'
);
console.log('wrote', path.relative(ROOT, OUT), Buffer.byteLength(fs.readFileSync(OUT)), 'bytes');
