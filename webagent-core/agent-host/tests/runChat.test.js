const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-chat-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { runChat } = require('../src/agent/runChat');

function collect() {
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  return { events, emit };
}

async function main() {
  fs.writeFileSync(
    path.join(tmp, 'README.md'),
    '# Widget\n\nThis workspace greets the user from src/app.js.\n'
  );
  fs.mkdirSync(path.join(tmp, 'src'));
  fs.writeFileSync(path.join(tmp, 'src/app.js'), 'module.exports = { greet: () => "hi" };\n');
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'widget', scripts: { test: 'node tests/app.test.js' } }, null, 2)
  );
  fs.mkdirSync(path.join(tmp, 'tests'));
  fs.writeFileSync(
    path.join(tmp, 'tests/app.test.js'),
    'const assert = require("assert");\nconst { greet } = require("../src/app");\nassert.strictEqual(greet(), "hi");\nconsole.log("ok");\n'
  );

  const ask = collect();
  await runChat({ mode: 'ask', message: '分析当前项目实现了什么功能' }, ask.emit);
  const askTools = ask.events.filter((e) => e.type === 'tool').map((e) => e.name);
  assert.ok(askTools.includes('list_directory'), 'Ask should list the workspace');
  assert.ok(askTools.includes('find_files'), 'Ask should find files');
  assert.ok(askTools.includes('read_files'), 'Ask should read files');
  assert.ok(!askTools.includes('get_diagnostics'));
  assert.ok(!askTools.includes('apply_patch'));
  const askMsg = ask.events.find((e) => e.type === 'message');
  assert.ok(askMsg && /README|Widget|app\.js/i.test(askMsg.text));
  assert.ok(!/calculator\.js/.test(JSON.stringify(ask.events)));
  assert.ok(ask.events.some((e) => e.type === 'tool' && e.label && /Found \d+ files/.test(e.label)));

  const plan = collect();
  await runChat({ mode: 'plan', message: '针对当前工作区制定修改计划' }, plan.emit);
  const consensus = plan.events.find((e) => e.type === 'consensus');
  assert.ok(consensus && consensus.result && consensus.result.consensusReached);
  assert.ok(!/calculator\.js/.test(JSON.stringify(plan.events)));
  assert.ok(plan.events.some((e) => e.type === 'tool' && e.name === 'set_todos'));

  const code = collect();
  await runChat({ mode: 'code', message: '跑测试' }, code.emit);
  const ran = code.events.find((e) => e.type === 'tool' && e.name === 'run_command');
  assert.ok(ran, 'Code should run the detected test command');
  assert.ok(ran.ok);
  const codeMsg = code.events.find((e) => e.type === 'message');
  assert.ok(codeMsg && /npm test|ok/i.test(codeMsg.text));

  const write = collect();
  await runChat(
    {
      mode: 'code',
      message: '写入 notes.md\n```\nhello from agent\n```'
    },
    write.emit
  );
  assert.ok(fs.existsSync(path.join(tmp, 'notes.md')));
  assert.ok(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8').includes('hello from agent'));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('runChat tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
