const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(
  path.resolve(__dirname, '../../workbench/index.html'),
  'utf8'
);

const required = [
  'page-env',
  'btn-detect-env',
  'page-stack',
  'btn-detect-stack',
  'btn-manage',
  'btn-agent-pick',
  'btn-send',
  'btn-plan-merge',
  'btn-gh-login',
  'btn-copy-prompt',
  'btn-copy-rules',
  'chat-input',
  'model-select',
  'ops-external-result'
];
for (const id of required) {
  assert.ok(html.includes(`id="${id}"`), `workbench HTML missing #${id}`);
}
assert.ok(html.includes('本机演示授权'));
assert.ok(html.includes('id="named-domain"'));
assert.ok(html.includes('id="named-token"'));
assert.ok(html.includes('id="ngrok-domain"'));
assert.ok(html.includes('id="ngrok-token"'));
assert.ok(html.includes('cloudflared tunnel run --token'));
assert.ok(html.includes('ngrok http'));
assert.ok(!/ngrok 开发域名[\s\S]{0,80}未实现/.test(html));
assert.ok(!html.includes('不会被使用'));
assert.ok(!html.includes('使用 GitHub 登录'));
assert.ok(!html.includes('永久顺'));
assert.ok(!html.includes('D:\\skills'));
assert.ok(!html.includes('不必拷进当前项目'));
assert.ok(!html.includes('不必拷进工作区'));
assert.ok(html.includes('docs/guides/技能使用指南.md'));
assert.ok(html.includes('都不会'));
assert.ok(!html.includes('Chat 模式才能外接 MCP'));
assert.ok(html.includes('id="sb-ws"'));
assert.ok(html.includes('./app.js'));
assert.ok(html.includes('./styles.css'));
assert.ok(html.includes('./favicon.svg'));
assert.ok(!html.includes('src="/app.js"'));
assert.ok(!html.includes('href="/styles.css"'));
assert.ok(!html.includes('href="/favicon.svg"'));
assert.ok(html.includes('id="btn-theme"'));
assert.ok(html.includes('id="btn-bridge-health"'));
assert.ok(html.includes('id="sess-meta"'));
assert.ok(html.includes('清除本轮统计'));
assert.ok(html.includes('Clear log'));
assert.ok(html.includes('data-theme'));

// stage 2 (ShunCode alignment): welcome/settings spell out the two paths
for (const id of ['walk-local-chat', 'walk-bridge', 'two-paths']) {
  assert.ok(html.includes(`id="${id}"`), `workbench HTML missing #${id}`);
}
assert.ok(html.includes('两条路'));
assert.ok(html.includes('image 内容') && html.includes('签字'), 'stage 3: bridge copy says screenshots return as image content after user consent');
const bindSrc = fs.readFileSync(path.resolve(__dirname, '../../workbench/js/bind.js'), 'utf8');
assert.ok(bindSrc.includes('walk-local-chat') && bindSrc.includes('walk-bridge'), 'welcome two-path cards are wired');

// stage 4 (S4-3): ShunCode UI alignment polish
assert.ok(html.includes('id="chip-local"') && html.includes('id="chip-approval"'), 'composer semantic chips (本地 / 默认审批)');
assert.ok(html.includes('id="model-pick-btn"') && html.includes('id="model-select"'), 'searchable model picker button + hidden fallback select');
assert.ok(html.includes('id="btn-mm-pick"') && html.includes('id="mm-merge-display"') && html.includes('id="btn-mm-active"'), 'merge-model picker row');
const chatSrc = fs.readFileSync(path.resolve(__dirname, '../../workbench/js/chat.js'), 'utf8');
assert.ok(chatSrc.includes('branch-pill'), 'multi-model round messages carry a branch pill');
assert.ok(chatSrc.includes('<button type="button" class="gen-instr"') && !chatSrc.includes('<a class="gen-instr"'),
  'chat empty-state actions remain native keyboard-operable buttons');
assert.ok(chatSrc.includes('<button type="button" class="tool-card-toggle" aria-expanded="false"')
  && chatSrc.includes("setAttribute('aria-expanded'"), 'tool details use a native disclosure button');
assert.ok(/details class="block"/.test(html) && html.includes('快速打开') && html.includes('高级设置'), 'bridge page collapsible groups');

console.log('workbench HTML has bind() nodes');

assert.ok(!html.includes('\uFFFD'), 'workbench copy must not contain Unicode replacement characters');

// Keep the useful lightweight shell, not nonfunctional IDE/login/upload controls.
for (const id of ['btn-account', 'br-back', 'br-fwd']) assert.ok(!html.includes(`id="${id}"`));
assert.ok(!html.includes('data-menu="edit"'));
assert.ok(!html.includes('title="附加"'));
assert.ok(!html.includes('启动时显示欢迎页'));
assert.ok(!html.includes('data-page="codex"'));
assert.ok(html.includes('兼容资料（不执行）'));
assert.ok(html.includes('aria-controls="agent-pick-menu"'));

assert.ok(html.includes('id="walk-start"'));
assert.ok(html.includes('id="page-help"'));
assert.ok(bindSrc.includes("$('#menu-help').onclick = () => ui.openModal('help')"));
assert.ok(bindSrc.includes("onClick('#walk-start', () => ui.openModal('help'))"));

// Keyboard and assistive-technology semantics are part of the workbench contract.
for (const id of ['walk-start', 'walk-basics', 'walk-local-chat', 'walk-bridge']) {
  assert.match(html, new RegExp(`<button[^>]+id="${id}"`), `#${id} must be keyboard-operable`);
}
assert.ok(html.includes('id="tabs" role="tablist"'));
assert.ok(html.includes('id="rb-chat-tab" class="on" role="tab" aria-selected="true" aria-controls="right-chat" tabindex="0"'));
assert.ok(html.includes('id="right-chat" class="rb-body" role="tabpanel" aria-labelledby="rb-chat-tab"'));
assert.ok(html.includes('id="modal" class="hidden" role="dialog" aria-modal="true"'));
assert.ok(html.includes('id="toast" hidden role="status" aria-live="polite"'));
for (const match of html.matchAll(/<button\b[^>]*>/g)) {
  assert.ok(/\btype="button"/.test(match[0]), `${match[0].slice(0, 100)} must declare type=button`);
}
for (const match of html.matchAll(/<(input|textarea|select)\b[^>]*>/g)) {
  const tag = match[0];
  if (/\btype="hidden"|\bclass="[^"]*\bhidden\b/.test(tag)) continue;
  const id = /\bid="([^"]+)"/.exec(tag)?.[1];
  const insideLabel = html.lastIndexOf('<label', match.index) > html.lastIndexOf('</label>', match.index);
  const labelled = /\baria-label(?:ledby)?="|\btitle="/.test(tag)
    || (id && html.includes(`for="${id}"`)) || insideLabel;
  assert.ok(labelled, `${tag.slice(0, 80)} must have an accessible label`);
}
const styles = fs.readFileSync(path.resolve(__dirname, '../../workbench/styles.css'), 'utf8');
assert.match(styles, /input:focus-visible,\s*textarea:focus-visible/);
assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?#sidebar \{[\s\S]*?position: absolute/);
const tabsSrc = fs.readFileSync(path.resolve(__dirname, '../../workbench/js/tabs.js'), 'utf8');
assert.ok(tabsSrc.includes('class="tab-label" role="tab"'));
assert.ok(tabsSrc.includes('aria-controls="editor-wrap" tabindex="${active ? 0 : -1}"'));
assert.ok(tabsSrc.includes("['ArrowLeft', 'ArrowRight', 'Home', 'End']"));
assert.ok(tabsSrc.includes('type="button" class="tree-item"'));
