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
  'model-select'
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
assert.ok(html.includes('技能使用指南.md'));
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

console.log('workbench HTML has bind() nodes');
