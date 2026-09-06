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

console.log('workbench HTML has bind() nodes');
