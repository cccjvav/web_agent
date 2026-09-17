'use strict';
// Selected current navigation + renderer integration; not all Markdown dialects or all docs.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const { slug, headingTargets, resolveFragment } = require('../../../docs-site/anchors');
const root = path.resolve(__dirname, '../../..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function checkLinks(documentPath, markdown) {
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
    const [name, fragment] = href.split('#');
    const target = name ? path.posix.normalize(path.posix.join(path.posix.dirname(documentPath), decodeURIComponent(name))) : documentPath;
    assert(!target.startsWith('../') && !path.posix.isAbsolute(target), documentPath + ': link escapes repository');
    assert(fs.existsSync(path.join(root, target)), documentPath + ': missing ' + target);
    if (fragment && target.endsWith('.md')) assert(resolveFragment(read(target), fragment), documentPath + ': missing heading ' + href);
  }
}
const sample = '# Main\n## editorReview.js：原生草稿\n```md\n## not-a-heading\n```\n~~~text\n## also-not\n~~~\n';
assert.equal(resolveFragment(sample, 'editorreviewjs原生草稿'), slug('editorReview.js：原生草稿'));
assert.equal(resolveFragment(sample, encodeURIComponent('editorreviewjs原生草稿')), slug('editorReview.js：原生草稿'));
assert(!headingTargets(sample).has('not-a-heading')); assert(!headingTargets(sample).has('also-not'));
assert.equal(resolveFragment(sample, 'missing'), null); assert.equal(resolveFragment(sample, '%xx'), null);
assert.throws(() => checkLinks('docs/development/总览.md', '[bad](技术实现.md#definitely-not-a-heading)'), /missing heading/);
assert.throws(() => checkLinks('docs/development/总览.md', '[bad](not-a-real-document.md)'), /missing/);
for (const name of ['README.md', '交接与路线图.md', 'manager/ROADMAP.md', '使用指南.md', 'manager/stages/s8-probe-integration.md', 'docs/development/架构导读.md', 'docs/development/组件说明.md', 'docs/development/总览.md', 'docs/development/技术实现.md', 'docs/development/测试说明.md', 'docs/development/代码复盘指南.md', 'review/SEMANTIC_REVIEW_2026-09-16.md', 'docs/guides/Conda环境说明.md', 'docs/development/平台启动与CI详解.md', 'docs/guides/隧道使用指南.md', 'docs/guides/技能使用指南.md', 'docs/guides/Windows新手逐步验收.md', 'review/CHECKLIST_WINDOWS.md']) checkLinks(name, read(name));
for (const folder of ['docs/guides','docs/development']) {
  for (const name of fs.readdirSync(path.join(root,folder)).filter(name => name.endsWith('.md'))) {
    checkLinks(folder+'/'+name,read(folder+'/'+name));
    if (name !== 'README.md') assert(!fs.existsSync(path.join(root,name)), 'no duplicate root guide: '+name);
  }
}
for (const name of ['docs/README.md','review/README.md','review/archive/README.md']) checkLinks(name,read(name));
assert(!fs.existsSync(path.join(root,'review/PROMPT.md')), 'obsolete task prompt retired, not a new live task list');
const context = { window: {} }; vm.runInNewContext(read('docs-site/content.js'), context);
const docs = context.window.DOCS;
assert(docs.fileIndex.some(item => item.path === 'docs/README.md'), 'central index is available in actual viewer');
assert(docs.fileIndex.some(item => item.path === 'manager/ROADMAP.md'), 'management roadmap is indexed');
assert(docs.fileIndex.some(item => item.path === '交接与路线图.md'), 'handoff is available in actual generated viewer content');
const guide = docs.fileIndex.find(item => item.path === 'webagent-core/extension/入口与Webview详解.md');
const heading = resolveFragment(read(guide.path), 'editorreviewjs原生单文件草稿预览与恢复');
assert(docs.overview.html.includes('href="#/files/' + guide.id + '/' + heading + '"'), 'actual root render resolves fragment using its own document directory');
assert(docs.files[guide.id].html.includes('id="' + heading + '"'), 'rewritten link lands on actual generated heading');
// Exercise the real build functions for a same-document link, without running/writing a build here.
const source = read('docs-site/build.js');
const begin = source.indexOf('let activeDocPath'), end = source.indexOf('\nfunction inline(', begin);
const rewriteContext = { path, fs, ROOT: root, manifest: { files: [] }, FILE_DOCS: [{ path: 'docs/development/技术实现.md', id: 'impl' }], resolveFragment };
vm.createContext(rewriteContext);
vm.runInContext(source.slice(begin, end) + '\nactiveDocPath="docs/development/技术实现.md"; result=rewriteHref("#2-启动与端口");', rewriteContext);
assert.equal(rewriteContext.result, '#/impl/' + slug('2. 启动与端口'));
console.log('documentationLinks: selected live navigation, negative targets, encoded/fenced headings and actual generated route targets passed');

// Real viewer functions in a minimal DOM: do not claim an actual browser session.
const app = read('docs-site/app.js');
let searchHtml = '', query = 'needle', scrollTarget = null;
const main = { innerHTML: '', insertAdjacentHTML(_position, html) { searchHtml = html; } };
const viewer = {
  window: { DOCS: { guide: { introHtml: '', sections: [{ title: 'needle <img src=x>', id: 'section', html: '' }] }, impl: { toc: [{ id: '中文/标题', text: 'other', level: 2 }], html: '' }, fileIndex: [], terms: [] } },
  $: selector => selector === '#q' ? { value: query } : selector === '#search-hits' ? searchHtml ? { remove() { searchHtml = ''; }, set outerHTML(html) { searchHtml = html; } } : null : main,
  pageChrome: () => '', route: () => ({ rest: ['%xx'] }),
  document: { getElementById(id) { return { scrollIntoView() { scrollTarget = id; } }; } }
};
vm.createContext(viewer);
vm.runInContext(app.slice(app.indexOf('  function escapeText('), app.indexOf('  function escapeAttr(')) +
  app.slice(app.indexOf('  function renderGuide('), app.indexOf('  function renderFiles(')) +
  app.slice(app.indexOf('  function onSearch('), app.indexOf('  function renderSource(')), viewer);
vm.runInContext('onSearch()', viewer); assert(searchHtml.includes('&lt;img')); assert(!searchHtml.includes('<img'));
query = 'no-match'; vm.runInContext('onSearch()', viewer); assert(searchHtml.includes('没有匹配')); assert(!searchHtml.includes('needle'));
query = ''; vm.runInContext('onSearch()', viewer); assert.equal(searchHtml, '');
query = 'needle'; vm.runInContext('onSearch()', viewer); query = 'n'; vm.runInContext('onSearch()', viewer); assert.equal(searchHtml, '');
vm.runInContext('renderGuide()', viewer); assert(main.innerHTML.includes('架构') || main.innerHTML.includes('guide-sec')); assert.equal(scrollTarget, null);
viewer.route = () => ({ rest: [encodeURIComponent('中文'), encodeURIComponent('标题')] });
vm.runInContext('renderProsePage("impl", "title", "kicker")', viewer); assert.equal(scrollTarget, '中文/标题');
viewer.route = () => ({ rest: ['%xx'] }); scrollTarget = null;
vm.runInContext('renderProsePage("impl", "title", "kicker")', viewer); assert.equal(scrollTarget, null);

// Formal review coverage is an inventory contract, never an automatic semantic approval.
const tracked = require('child_process').execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0');
const formal = read('review/FULL_REVIEW_INDEX.md');
for (const name of new Set(tracked.filter(name => /\.(?:md|mdx|rst|adoc|txt)$/i.test(name) || /(?:^|\/)(?:LICENSE|NOTICE|COPYING)$/.test(name)))) {
  if (name === 'review/FULL_REVIEW_INDEX.md') continue;
  assert.ok(formal.includes('['+name+']') || formal.includes('`'+name+'`'), 'formal review inventory missing '+name);
}
assert.ok(formal.includes('F27-02') && formal.includes('未闭环'));
assert.ok(docs.fileIndex.some(item => item.path === 'review/FULL_REVIEW_INDEX.md'));
