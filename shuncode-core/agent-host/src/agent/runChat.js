const { callTool } = require('../tools');
const { runMultiModelConsensus } = require('../tools/consensusEngine');
const { load } = require('../models/store');
const { runOpenAI } = require('./openai');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeFix(text) {
  return /除以零|divide by zero|修.?bug|测试失败|failure|calculator|修复|一键修|守卫|divide/i.test(
    text || ''
  );
}

function wantsTestsOnly(text) {
  return /^(跑测试|运行测试|npm test|pytest|再测一次)/i.test((text || '').trim());
}

function wantsCommand(text) {
  return /^(npm |git |ls |node |python |pnpm |yarn )/i.test((text || '').trim());
}

async function safeTool(emit, name, args, mode) {
  try {
    const result = await callTool(name, args, mode);
    emit('tool', { name, args, result, ok: true });
    return result;
  } catch (err) {
    emit('tool', { name, args, error: err.message, ok: false });
    return null;
  }
}

function extractRaw(readResult) {
  if (!readResult || !readResult.content) return '';
  return readResult.content
    .split('\n')
    .map((line) => line.replace(/^\d+:\s?/, ''))
    .join('\n');
}

function buildAskAnswer(text, ctx) {
  const q = (text || '').trim();
  const src = extractRaw(ctx.src);
  const tests = extractRaw(ctx.tests);
  const hasGuard = /Cannot divide by zero/.test(src);
  const files = (ctx.tree && ctx.tree.items) || [];
  const fileNames = files.map((f) => (f.path || f.name)).join('、');

  if (/是什么|干什么|介绍|项目|workspace/i.test(q)) {
    return [
      '**【ASK · 只读】** 这是挂在 ShunCode 里的演示工作区 `workspace`。',
      '',
      `- 清单：${fileNames || 'package.json、src/calculator.js、tests/calculator.test.js'}`,
      '- 目标模块：四则运算 + 幂',
      '- 测试：`npm test`（5 个用例，含除零）',
      '',
      'Chat 模式不用登录、不用买 Bridge。Ask 只读；要对齐方案用 Plan；改仓库切 Code。'
    ].join('\n');
  }

  if (/skill/i.test(q)) {
    return [
      '**【ASK · 只读】** Skills 本质上是文件夹。把路径告诉模型就会用，不局限当前工作区。',
      '本机示例：`.shuncode/skills/fix-tests/`。Bridge 也能用 Skills，因为对面同样能读文件。',
      'MCP 外接工具只在 Chat 模式；不要和 Bridge 对外提供的 MCP 入口搞混。'
    ].join('\n');
  }

  if (/bridge|mcp|隧道/i.test(q)) {
    return [
      '**【ASK · 只读】** 两条路不要混：',
      '- Chat：本机对话框，模型跑在 agent-host，自己填 Key。',
      '- Bridge：把本机工作区变成 Streamable HTTP MCP，让 ChatGPT / Arena / Trae 等在浏览器里指挥这台机器。',
      '读写发生在本机。地址带秘密路径，泄露了就重置。'
    ].join('\n');
  }

  const divideHint = hasGuard
    ? '`divide` 已经有除零守卫，测试应能通过。'
    : '`src/calculator.js` 的 `divide(a, b)` 直接 `return a / b`，而 `tests/calculator.test.js` 要求除零抛出 `Cannot divide by zero`。这就是当前失败点。';

  if (!q || looksLikeFix(q) || /测试|诊断|bug|错/i.test(q)) {
    return [
      '**【ASK · 只读问答】** 已用 `list_directory` / `read_files` / `get_diagnostics` 探查，没有改文件，也没有跑终端。',
      '',
      divideHint,
      '',
      hasGuard
        ? '若要复核，切到 **Code** 执行 `npm test`。'
        : '下一步：切到 **Plan** 做多模型博弈（意见一致再行动），再切 **Code** 调用 `apply_patch`。Ask 模式锁死写操作与终端。'
    ].join('\n');
  }

  return [
    `**【ASK · 只读】** 已查看工作区。${divideHint}`,
    '',
    `针对「${q}」：我只能检索与解释。若要改代码请切 Code；若要多模型对齐请切 Plan。`,
    tests ? '测试文件已读取，可在对话里继续问具体函数。' : ''
  ]
    .filter(Boolean)
    .join('\n');
}

async function executeCalculatorFix(emit) {
  await callTool(
    'report_progress',
    { message: '读取目标文件', percentage: 15, stepName: 'read_files' },
    'code'
  );
  const read = await safeTool(emit, 'read_files', { filePath: 'src/calculator.js' }, 'code');
  const hash = read && read.hash;

  const src = extractRaw(read);
  if (/Cannot divide by zero/.test(src)) {
    await callTool('report_progress', { message: '守卫已存在，直接验证', percentage: 60, stepName: 'run_command' }, 'code');
    const testRes = await safeTool(emit, 'run_command', { command: 'npm test' }, 'code');
    emit('message', {
      text: `CODE：divide 已有除零守卫。\`npm test\` 退出码 ${testRes ? testRes.exitCode : '?'}。`
    });
    return;
  }

  const patch = `<<<<<<< SEARCH
function divide(a, b) {
  // BUG to be fixed by ShunCode Agent (apply_patch):
  // Needs division by zero guard!
  return a / b;
}
=======
function divide(a, b) {
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}
>>>>>>> REPLACE`;

  await callTool('report_progress', { message: '预检并写入补丁', percentage: 45, stepName: 'apply_patch' }, 'code');
  const patchRes = await safeTool(
    emit,
    'apply_patch',
    { filePath: 'src/calculator.js', patch, expectedHash: hash },
    'code'
  );
  if (!patchRes) {
    emit('message', { text: 'apply_patch 失败。若提示 STALE_FILE，请再读一次文件后重试。' });
    return;
  }

  await callTool('report_progress', { message: '回归测试', percentage: 75, stepName: 'run_command' }, 'code');
  const testRes = await safeTool(emit, 'run_command', { command: 'npm test' }, 'code');
  const ok = testRes && testRes.exitCode === 0;
  await callTool(
    'set_todos',
    {
      todos: [
        { id: '1', title: '捕获失败用例', status: 'completed' },
        { id: '2', title: '读取 calculator.js', status: 'completed' },
        { id: '3', title: 'apply_patch 除零守卫', status: 'completed' },
        { id: '4', title: 'npm test 回归', status: ok ? 'completed' : 'failed' }
      ]
    },
    'code'
  );
  await callTool(
    'report_progress',
    { message: ok ? '全部通过' : '测试仍失败', percentage: 100, stepName: 'done' },
    'code'
  );

  emit('message', {
    text: ok
      ? '🎉 **CODE 完成**。`apply_patch` 已为 `divide` 加上除零守卫（整包预检，失败不会半写入），本地 `npm test` **5/5 PASS**。'
      : `补丁已写入，但测试未全绿。退出码 ${testRes ? testRes.exitCode : 'n/a'}。请查看终端输出。`
  });
}

async function runBuiltin({ mode, message, emit }) {
  const text = (message || '').trim();
  emit('status', {
    text:
      mode === 'ask'
        ? 'Ask：只读探查工作区…'
        : mode === 'plan'
          ? 'Plan：只读对齐方案，不会改仓库…'
          : 'Code：解锁 apply_patch 与终端…'
  });
  await sleep(160);

  const tree = await safeTool(emit, 'list_directory', { dirPath: '.', recursive: true, maxDepth: 4 }, mode);
  const src = await safeTool(emit, 'read_files', { filePath: 'src/calculator.js' }, mode);
  const tests = await safeTool(emit, 'read_files', { filePath: 'tests/calculator.test.js' }, mode);
  await safeTool(emit, 'get_diagnostics', { filePath: 'src/calculator.js' }, mode);

  if (mode === 'ask') {
    emit('message', { text: buildAskAnswer(text, { tree, src, tests }) });
    return;
  }

  if (mode === 'plan') {
    const consensus = await runMultiModelConsensus({
      taskDescription: text || '修复 calculator 除以零缺陷',
      emit
    });
    emit('consensus', { result: consensus });
    await safeTool(emit, 'set_todos', { todos: consensus.unifiedActionPlan }, 'plan');
    emit('message', {
      text: [
        consensus.summary,
        '',
        '**规则**：各分支互不可见；只有被采纳的那条进入后续上下文；没对齐之前仓库不动。',
        '切到 **Code** 后才会调用 `apply_patch`。'
      ].join('\n')
    });
    return;
  }

  if (wantsTestsOnly(text)) {
    const r = await safeTool(emit, 'run_command', { command: 'npm test' }, 'code');
    emit('message', {
      text: r
        ? `测试结束，退出码 **${r.exitCode}**（${r.durationMs}ms）。`
        : '命令未能执行。'
    });
    return;
  }

  if (wantsCommand(text)) {
    const r = await safeTool(emit, 'run_command', { command: text.trim() }, 'code');
    emit('message', {
      text: r ? `已在工作区执行。退出码 ${r.exitCode}。` : '命令失败。'
    });
    return;
  }

  if (!text || looksLikeFix(text) || /执行|动手|按方案|补丁/i.test(text)) {
    await executeCalculatorFix(emit);
    return;
  }

  emit('message', {
    text: [
      'CODE 已解锁写工具。我可以：',
      '- 修复 calculator 除零并跑 `npm test`',
      '- 直接执行工作区命令（以 `npm ` / `git ` 开头的消息）',
      '',
      `当前消息「${text}」没有匹配到自动补丁。可以说「修复除零并验证」，或切换到自定义 API 让模型自由规划。`
    ].join('\n')
  });
}

async function runChat({ mode, message, history = [], emit }) {
  mode = String(mode || 'ask').toLowerCase();
  if (!['ask', 'plan', 'code'].includes(mode)) mode = 'ask';

  const cfg = load();
  const custom = (cfg.models || []).find((m) => m.id === cfg.activeModelId && m.id !== 'builtin');
  if (custom && custom.apiKey && custom.baseUrl) {
    try {
      await runOpenAI({ mode, message, history, emit, model: custom });
      return;
    } catch (err) {
      emit('status', { text: `自定义模型失败，回退内置 Agent：${err.message}` });
    }
  }

  await runBuiltin({ mode, message, emit });
}

module.exports = { runChat };
