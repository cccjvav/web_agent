const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-chat-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { runChat, planRound, wantsTests, BUILTIN_TEST_TIMEOUT_SEC } = require('../src/agent/runChat');

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
  const store = require('../src/models/store');
  const cfg = store.load();
  for (const model of [{id:'incomplete',protocol:'openai',modelId:'fixture',baseUrl:'',apiKey:''}, {id:'missing',protocol:'openai'}]) {
    store.patch({models:[...cfg.models, ...(model.id === 'missing' ? [] : [model])],multiModel:{...cfg.multiModel,mergeModel:model.id}});
    const stopped = collect();
    await runChat({mode:'plan',planAction:'merge'},stopped.emit);
    assert.ok(stopped.events.some(e=>e.type==='error' && /总结已停止/.test(e.message)));
    assert.ok(!stopped.events.some(e=>e.type==='consensus' || e.type==='tool'));
    assert.strictEqual(planRound.snapshot().merged,false);
    assert.strictEqual(planRound.snapshot().branches.length,2);
  }
  store.patch(cfg);
  const planMerge = collect();
  await runChat({ mode: 'plan', planAction: 'merge' }, planMerge.emit);
  const consensus = planMerge.events.find((e) => e.type === 'consensus');
  assert.ok(consensus && consensus.result && consensus.result.simulated === true);
  assert.strictEqual(consensus.result.consensusReached, false);
  assert.ok(consensus.result.agreementRate == null);
  assert.ok(consensus.result.participants && consensus.result.participants.length === 2);
  // F70: a local merge has no model to read the branches, so the branch answers themselves are the
  // summary. They used to be assembled and dropped; the VS Code chat (which renders only canonical)
  // then showed a boilerplate sentence and no answer at all.
  for (const participant of consensus.result.participants) {
    assert.ok(participant.answer && consensus.result.canonical.includes(participant.answer.slice(0, 80)),
      'the local merge summary carries every branch answer');
  }
  const mergeMessage = planMerge.events.find((e) => e.type === 'message');
  assert.ok(mergeMessage && mergeMessage.text.includes('### 分支 1') && mergeMessage.text.includes('### 分支 2'));

  const code = collect();
  await runChat({ mode: 'code', message: '跑测试' }, code.emit);
  const ran = code.events.find((e) => e.type === 'tool' && e.name === 'run_command');
  assert.ok(ran, 'Code should run the detected test command when asked');
  assert.ok(ran.ok);
  assert.deepStrictEqual(ran.args, { command: 'npm test', timeoutSec: 180 });
  const codeMsg = code.events.find((e) => e.type === 'message');
  assert.ok(codeMsg && codeMsg.text.includes('已运行 `npm test`（上限180秒）。输出摘要：'));
  assert.ok(codeMsg.text.includes('ok'), 'the summary carries what the tests printed');
  assert.ok(!codeMsg.text.includes('没有成功'));
  // A failing run must not read as "已运行": it says so and keeps both the reason and the test output.
  const testFile = path.join(tmp, 'tests/app.test.js'), passing = fs.readFileSync(testFile, 'utf8');
  fs.writeFileSync(testFile, 'console.error("FAILING-TEST-EVIDENCE");\nprocess.exit(1);\n');
  try {
    const failing = collect();
    await runChat({ mode: 'code', message: '跑测试' }, failing.emit);
    const failedRun = failing.events.find((e) => e.type === 'tool' && e.name === 'run_command');
    assert.ok(failedRun && failedRun.ok === false && failedRun.error, 'the failing run is reported as a failed tool with a reason');
    const failText = failing.events.find((e) => e.type === 'message').text;
    assert.ok(failText.includes('运行 `npm test` 没有成功（上限180秒；测试失败、超时、在 VS Code 里被拒绝都会这样）。摘要：'), failText);
    assert.ok(!failText.includes('已运行'), failText);
    assert.ok(failText.includes('FAILING-TEST-EVIDENCE'), 'the failure summary keeps what the tests printed');
    assert.ok(failText.includes(String(failedRun.error).split('\n')[0].slice(0, 40)), 'the failure summary keeps the reason');
  } finally { fs.writeFileSync(testFile, passing); }
  // R6 phase-1 acceptance follow-up 3: the built-in loop no longer runs the suite on every Code message.
  for (const message of ['看看 src/app.js', '不要跑测试，只看代码', 'skip the tests']) {
    const quiet = collect();
    await runChat({ mode: 'code', message }, quiet.emit);
    assert.ok(!quiet.events.some((e) => e.type === 'tool' && e.name === 'run_command'), `no test run for: ${message}`);
    const text = quiet.events.find((e) => e.type === 'message').text;
    assert.ok(text.includes('没有自动运行测试。要运行 `npm test`，在消息里写“跑测试”（上限180秒；更久的测试请在终端自己运行）。'), message);
    const todos = quiet.events.filter((e) => e.type === 'tool' && e.name === 'set_todos').map((e) => e.args.todos[2].title);
    assert.deepStrictEqual(todos.slice(-2), ['汇总', '未运行测试（消息未要求）'], message);
  }
  for (const [message, expected] of [['跑一下测试', true], ['run the tests', true], ['npm test 看看', true], ['帮我写单测', true],
    ['testing please', true], ['pytest', true], ['latest changes', false], ['contest', false], ['看代码', false],
    ['别跑测试', false], ['无需运行测试', false], ['跳过测试', false], ['no tests', false], ['without tests', false], ['', false]]) {
    assert.strictEqual(wantsTests(message), expected, JSON.stringify(message));
  }
  // The cap must fit the VS Code chat deadline together with the approval wait and the PTY's extra 15 s.
  const chatDeadlineMs = Number(/deadline = setTimeout\(\(\) => finish\(new Error\('Chat请求超时[^']*'\)\), (\d+)\)/
    .exec(fs.readFileSync(path.join(__dirname, '../../extension/extension.js'), 'utf8'))[1]);
  const confirmMs = Number(/CONFIRM_TIMEOUT_MS = (\d+)/.exec(fs.readFileSync(path.join(__dirname, '../src/tools/ptyJobs.js'), 'utf8'))[1]);
  assert.strictEqual(BUILTIN_TEST_TIMEOUT_SEC, 180);
  assert.ok(confirmMs + BUILTIN_TEST_TIMEOUT_SEC * 1000 + 15000 + 5000 <= chatDeadlineMs,
    `approval ${confirmMs} + test ${BUILTIN_TEST_TIMEOUT_SEC}s + 15s + exploration must fit the ${chatDeadlineMs} ms chat deadline`);

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
