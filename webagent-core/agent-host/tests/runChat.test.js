const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-chat-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { runChat, planRound } = require('../src/agent/runChat');

function collect() {
  const events = [];
  const emit = (type, data = {}) => events.push({ type, ...data });
  return { events, emit };
}

async function main() {
  const empty = collect();
  await runChat({ mode: 'ask', message: '查看项目' }, empty.emit);
  assert.ok(empty.events.some(event => event.type === 'message' && event.text.includes('没有探测到标准测试命令')));
  assert.ok(!empty.events.some(event => event.type === 'tool' && event.name === 'run_command'));
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

  fs.writeFileSync(path.join(tmp, 'explicit-evidence.txt'), 'EXPLICIT-READ-EVIDENCE');
  const explicit = collect();
  await runChat({ mode: 'ask', message: '只读取 `explicit-evidence.txt`' }, explicit.emit);
  assert.ok(explicit.events.some(event => event.type === 'message' && event.text.includes('EXPLICIT-READ-EVIDENCE')));
  const explicitReads = explicit.events.filter(event => event.type === 'tool' && event.name === 'read_files');
  assert.strictEqual(explicitReads.length, 1);
  assert.deepStrictEqual(explicitReads[0].args.paths, ['explicit-evidence.txt']);
  const missing = collect();
  await runChat({ mode: 'ask', message: '读取 `absent.txt`' }, missing.emit);
  assert.ok(missing.events.some(event => event.type === 'message' && event.text.includes('未读取：absent.txt')));
  assert.ok(!missing.events.some(event => event.type === 'tool' && event.name === 'read_files'));

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

  planRound.reset();
  const planStart = collect();
  await runChat({ mode: 'plan', message: '针对当前工作区制定修改计划' }, planStart.emit);
  assert.ok(!planStart.events.some((e) => e.type === 'consensus'), 'first Plan turn is one branch, not a merge');
  const started = planStart.events.find((e) => e.type === 'planRound');
  assert.ok(started && started.round && started.round.branches.length === 1);
  assert.ok(planStart.events.some((e) => e.type === 'status' && /分支 1\//.test(e.text || '')));
  const startMsg = planStart.events.find((e) => e.type === 'message');
  assert.ok(startMsg && startMsg.branch && startMsg.branch.index === 1);
  assert.ok(startMsg.branch.simulated === true);
  assert.ok(!/calculator\.js/.test(JSON.stringify(planStart.events)));
  assert.ok(planStart.events.some((e) => e.type === 'tool' && e.name === 'set_todos'));

  const planBranch = collect();
  await runChat({ mode: 'plan', message: '', planAction: 'branch', thinkLevel: 'low' }, planBranch.emit);
  const branched = planBranch.events.find((e) => e.type === 'planRound');
  assert.ok(branched && branched.round.branches.length === 2);
  assert.ok(branched.round.canMerge);
  assert.ok(!planBranch.events.some((e) => e.type === 'consensus'));

  const tooSoon = collect();
  planRound.reset();
  await runChat({ mode: 'plan', message: '只要一支', planAction: 'start' }, tooSoon.emit);
  const mergeEarly = collect();
  await runChat({ mode: 'plan', planAction: 'merge' }, mergeEarly.emit);
  assert.ok(mergeEarly.events.some((e) => e.type === 'error' && /至少两个/.test(e.message || '')));

  planRound.reset();
  await runChat({ mode: 'plan', message: '两支再总结' }, collect().emit);
  await runChat({ mode: 'plan', planAction: 'branch' }, collect().emit);
  const planMerge = collect();
  await runChat({ mode: 'plan', planAction: 'merge' }, planMerge.emit);
  const consensus = planMerge.events.find((e) => e.type === 'consensus');
  assert.ok(consensus && consensus.result && consensus.result.simulated === true);
  assert.strictEqual(consensus.result.consensusReached, false);
  assert.ok(consensus.result.agreementRate == null);
  assert.ok(consensus.result.participants && consensus.result.participants.length === 2);

  const code = collect();
  await runChat({ mode: 'code', message: '跑测试' }, code.emit);
  const ran = code.events.find((e) => e.type === 'tool' && e.name === 'run_command');
  assert.ok(ran, 'Code should run the detected test command');
  assert.ok(ran.ok);
  const codeMsg = code.events.find((e) => e.type === 'message');
  assert.ok(codeMsg && /npm test|ok/i.test(codeMsg.text));

  const viaPayload = collect();
  await runChat({
    mode: 'ask',
    message: '分析当前项目实现了什么功能',
    emit: viaPayload.emit
  });
  assert.ok(viaPayload.events.some((e) => e.type === 'tool' && e.name === 'list_directory'));
  assert.ok(viaPayload.events.some((e) => e.type === 'message'));

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
