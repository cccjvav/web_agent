const path = require('path');
const { config } = require('../config');
const { callTool } = require('../tools');
const { draftLocalBranch, mergeLocalBranches } = require('../tools/consensusEngine');
const planRound = require('../tools/planRound');
const { runOpenAI } = require('./openai');
const store = require('../models/store');

const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'dist', 'build', '.local', 'bin']);

function flattenDir(items, acc = []) {
  for (const it of items || []) {
    acc.push(it);
    if (it.children) flattenDir(it.children, acc);
  }
  return acc;
}

function countFiles(items) {
  return flattenDir(items).filter((it) => it.type === 'file').length;
}

function toolLabel(name, result, ok) {
  if (!ok) {
    if (name === 'list_directory' || name === 'list_dir') return 'Explored .';
    if (name === 'read_files' || name === 'read_file') return 'Read files';
    return name;
  }
  if (name === 'list_directory' || name === 'list_dir') {
    const n = countFiles(result && result.items);
    return n ? `Explored ${result.dirPath || '.'}` : `Explored ${result.dirPath || '.'}`;
  }
  if (name === 'find_files') {
    const n = (result && (result.total ?? result.files?.length)) || 0;
    return `Found ${n} files`;
  }
  if (name === 'search_files' || name === 'grep_search') {
    const n = (result && result.totalMatches) || 0;
    return `Found ${n} files`;
  }
  if (name === 'read_files' || name === 'read_file') {
    if (result && Array.isArray(result.files)) return `Read ${result.files.length} files`;
    if (result && result.filePath) return `Read ${result.filePath}`;
    return 'Read files';
  }
  if (name === 'run_command' || name === 'execute_command') {
    return result && result.command ? result.command : 'Run command';
  }
  if (name === 'apply_patch') return result && result.filePath ? `Patched ${result.filePath}` : 'apply_patch';
  if (name === 'git_status') return 'git status';
  if (name === 'set_todos') return 'Tasks';
  return name;
}

async function timedTool(emit, mode, name, args) {
  const t0 = Date.now();
  try {
    const result = await callTool(name, args, mode);
    const durationMs = Date.now() - t0;
    if (emit) {
      emit('tool', {
        name,
        args,
        result,
        ok: true,
        durationMs,
        label: toolLabel(name, result, true)
      });
    }
    return { ok: true, result, durationMs };
  } catch (err) {
    const durationMs = Date.now() - t0;
    if (emit) {
      emit('tool', {
        name,
        args,
        error: err.message,
        ok: false,
        durationMs,
        label: toolLabel(name, null, false)
      });
    }
    return { ok: false, error: err.message, durationMs };
  }
}

function keywordsFrom(message) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'please',
    '分析', '当前', '项目', '实现', '什么', '功能', '修复', '一下', '帮我',
    '请', '一下', '怎么', '如何', '一个', '这个', '那个'
  ]);
  return String(message || '')
    .split(/[\s,，。！？!?;；:：/\\()[\]{}'"`]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !stop.has(w.toLowerCase()))
    .slice(0, 6);
}

function pickExisting(relPaths) {
  const fs = require('fs');
  const found = [];
  for (const rel of relPaths) {
    const full = path.join(config.workspaceRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) found.push(rel.replace(/\\/g, '/'));
  }
  return found;
}

function detectTestCommand() {
  const fs = require('fs');
  const { loadCustom } = require('../models/customizations');
  const { resolveTechStack } = require('../models/profile');
  const declared = resolveTechStack(loadCustom()).testCommand;
  if (declared) return { cmd: declared, kind: 'declared' };
  const root = config.workspaceRoot;
  const pkgPath = path.join(root, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) return { cmd: 'npm test', kind: 'npm' };
    } catch {
      /* ignore */
    }
  }
  if (fs.existsSync(path.join(root, 'pyproject.toml')) || fs.existsSync(path.join(root, 'pytest.ini'))) {
    return { cmd: 'python -m pytest -q', kind: 'pytest' };
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) return { cmd: 'cargo test', kind: 'cargo' };
  if (fs.existsSync(path.join(root, 'go.mod'))) return { cmd: 'go test ./...', kind: 'go' };
  const testsDir = path.join(root, 'tests');
  if (fs.existsSync(testsDir)) return { cmd: 'npm test', kind: 'guess' };
  return null;
}

function extractPatch(message) {
  const m = String(message || '').match(/<<<<<<< SEARCH[\s\S]*?>>>>>>> REPLACE/);
  return m ? m[0] : null;
}

function extractWriteIntent(message) {
  const fence = String(message || '').match(/```(?:[\w.+-]+)?\n([\s\S]*?)```/);
  const file = String(message || '').match(/(?:写入|创建|write|create)\s+[`"]?([\w./\\-]+\.\w+)[`"]?/i);
  if (file && fence) return { filePath: file[1].replace(/\\/g, '/'), content: fence[1] };
  return null;
}

function clip(text, n = 1400) {
  const s = String(text || '');
  return s.length > n ? `${s.slice(0, n)}\n…` : s;
}

function stripLineNumbers(content) {
  return String(content || '')
    .split('\n')
    .map((line) => line.replace(/^\d+:\s?/, ''))
    .join('\n');
}

async function explore(emit, mode, message) {
  const facts = { files: [], readme: '', pkg: '', testCmd: 'npm test', testOutput: '' };

  const listed = await timedTool(emit, mode, 'list_directory', { dirPath: '.', recursive: true, maxDepth: 3 });
  if (listed.ok) {
    facts.files = flattenDir(listed.result.items)
      .filter((it) => it.type === 'file')
      .map((it) => it.path)
      .slice(0, 80);
  }

  await timedTool(emit, mode, 'git_status', {});

  const found = await timedTool(emit, mode, 'find_files', {
    glob: '**/*',
    searchPath: '.',
    maxResults: 100
  });
  if (found.ok && found.result.files) {
    for (const f of found.result.files) {
      if (!facts.files.includes(f)) facts.files.push(f);
    }
  }

  const keys = keywordsFrom(message);
  if (keys.length) {
    await timedTool(emit, mode, 'search_files', {
      query: keys.slice(0, 3).join('|'),
      isRegex: true,
      searchPath: '.',
      limit: 30
    });
  }

  const candidates = [
    'README.md',
    'readme.md',
    'README.zh-CN.md',
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod'
  ];
  const toRead = pickExisting(candidates);
  for (const f of facts.files) {
    if (toRead.length >= 6) break;
    if (!toRead.includes(f) && !SKIP_DIRS.has(f.split('/')[0])) toRead.push(f);
  }

  if (toRead.length) {
    const read = await timedTool(emit, mode, 'read_files', { paths: toRead.slice(0, 6), limit: 120 });
    if (read.ok) {
      const files = read.result.files ? read.result.files : [read.result];
      for (const file of files) {
        if (!file || file.error) continue;
        const body = stripLineNumbers(file.content);
        if (/readme/i.test(file.filePath)) facts.readme = body;
        if (/package\.json$/i.test(file.filePath)) facts.pkg = body;
      }
    }
  }

  const test = detectTestCommand();
  if (test) facts.testCmd = test.cmd;
  return facts;
}

function summarizeAsk(message, facts) {
  const tree = facts.files.slice(0, 30).map((f) => `- ${f}`).join('\n') || '- （工作区几乎是空的）';
  return [
    `工作区：\`${config.workspaceRoot}\``,
    '',
    `你问的是：${message}`,
    '',
    '**当前能看到的文件**',
    tree,
    facts.files.length > 30 ? `- …共 ${facts.files.length} 个文件` : '',
    '',
    facts.readme ? `**README**\n${clip(facts.readme, 800)}` : '',
    facts.pkg ? `**package.json / 清单**\n\`\`\`json\n${clip(facts.pkg, 600)}\n\`\`\`` : '',
    '',
    facts.testCmd ? `探测到的测试命令：\`${facts.testCmd}\`` : '没有探测到标准测试命令。',
    '',
    '这是只读 Ask：没有改文件。要落地补丁切到 **Web Agent Code**（配置 API Key 后走模型工具循环；没 Key 时会跑测试并尝试应用你消息里的补丁）。'
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function runBuiltin(payload, emit) {
  const mode = payload.mode || 'ask';
  const message = payload.message || '';

  await timedTool(emit, mode, 'set_todos', {
    todos: [
      { id: '1', title: '扫描项目结构与关键入口', status: 'in_progress' },
      { id: '2', title: '阅读核心模块', status: 'pending' },
      { id: '3', title: mode === 'ask' ? '汇总功能说明' : '验证 / 补丁', status: 'pending' }
    ]
  });

  if (emit) emit('status', { text: 'Explored .' });
  const facts = await explore(emit, mode, message);

  await timedTool(emit, mode, 'set_todos', {
    todos: [
      { id: '1', title: '扫描项目结构与关键入口', status: 'completed' },
      { id: '2', title: '阅读核心模块', status: 'completed' },
      {
        id: '3',
        title: mode === 'code' ? `运行 ${facts.testCmd}` : '汇总',
        status: 'in_progress'
      }
    ]
  });

  if (mode === 'plan') {
    if (emit) {
      emit('message', {
        text: [
          summarizeAsk(message, facts),
          '',
          '下一步切到 **Web Agent Code** 再改文件。多模型分支请走 Plan 入口（换模型后空发送）。'
        ].join('\n')
      });
    }
    return;
  }

  if (mode === 'ask') {
    await timedTool(emit, 'ask', 'set_todos', {
      todos: [
        { id: '1', title: '扫描项目结构与关键入口', status: 'completed' },
        { id: '2', title: '阅读核心模块', status: 'completed' },
        { id: '3', title: '汇总功能说明', status: 'completed' }
      ]
    });
    if (emit) emit('message', { text: summarizeAsk(message, facts) });
    return;
  }

  const write = extractWriteIntent(message);
  if (write) {
    await timedTool(emit, 'code', 'write_file', { ...write, confirm_overwrite: true });
  }

  const patch = extractPatch(message);
  if (patch) {
    const fileMatch = String(message).match(/(?:file|文件)\s*[:=]?\s*[`"]?([\w./\\-]+\.\w+)/i);
    const target = fileMatch ? fileMatch[1] : facts.files[0];
    if (target) {
      const hashed = await timedTool(emit, 'code', 'read_files', { filePath: target, limit: 400 });
      if (hashed.ok && hashed.result.hash) {
        await timedTool(emit, 'code', 'apply_patch', {
          filePath: target,
          expectedHash: hashed.result.hash,
          patch
        });
      }
    }
  }

  const test = detectTestCommand();
  if (test) {
    const ran = await timedTool(emit, 'code', 'run_command', { command: test.cmd, timeoutSec: 60 });
    facts.testOutput = ran.ok
      ? `${ran.result.stdout || ''}\n${ran.result.stderr || ''}`
      : ran.error || '';
  }

  await timedTool(emit, 'code', 'set_todos', {
    todos: [
      { id: '1', title: '扫描项目结构与关键入口', status: 'completed' },
      { id: '2', title: '阅读核心模块', status: 'completed' },
      { id: '3', title: test ? `运行 ${test.cmd}` : '没有测试命令', status: 'completed' }
    ]
  });

  const lines = [
    `工作区：\`${config.workspaceRoot}\``,
    '',
    write ? `已写入 \`${write.filePath}\`。` : '',
    patch ? '已尝试应用消息里的 SEARCH/REPLACE 补丁。' : '',
    test
      ? `已运行 \`${test.cmd}\`。输出摘要：\n\`\`\`\n${clip(facts.testOutput, 1200)}\n\`\`\``
      : '没有探测到 package.json / pytest / cargo / go 测试命令。',
    '',
    '内置循环没有大模型：它会搜、读、跑测试，并应用你消息里给出的补丁。',
    '要让模型自己决定改哪几行，到设置 → API Provider 填 Endpoint 和 Key，再发同一条任务。'
  ].filter(Boolean);

  if (emit) emit('message', { text: lines.join('\n') });
}

function capturingEmit(emit) {
  let text = '';
  const wrap = (type, data = {}) => {
    if (type === 'message') {
      text = data.text || '';
      return;
    }
    if (typeof emit === 'function') emit(type, data);
  };
  wrap.captured = () => text;
  return wrap;
}

function pickModel(cfg, id) {
  const models = cfg.models || [];
  if (id) {
    const hit = models.find((m) => m.id === id);
    if (hit) return hit;
  }
  return models.find((m) => m.id === cfg.activeModelId) || models[0];
}

function canCallModel(m) {
  return Boolean(m && m.apiKey && m.baseUrl && m.modelId && m.protocol !== 'builtin');
}

function resolvePlanAction(payload, mm) {
  const explicit = payload.planAction;
  if (explicit === 'merge' || explicit === 'branch' || explicit === 'start' || explicit === 'reset') {
    return explicit;
  }
  if (mm.enabled === false) return 'single';
  const msg = String(payload.message || '').trim();
  const live = planRound.current();
  if (!msg && live && live.branches.length && !live.merged) return 'branch';
  return 'start';
}

async function runPlanBranch({ emit, model, thinkLevel, task, history }) {
  if (canCallModel(model)) {
    const cap = capturingEmit(emit);
    const out = await runOpenAI({
      mode: 'plan',
      message: task,
      history: history || [],
      emit: cap,
      model,
      thinkLevel,
      allowTools: true
    });
    return {
      answer: (out && out.text) || cap.captured() || '',
      simulated: false
    };
  }
  const live = planRound.current();
  let facts = live && live.facts;
  if (!facts) {
    await timedTool(emit, 'plan', 'set_todos', {
      todos: [
        { id: '1', title: '扫描项目结构', status: 'in_progress' },
        { id: '2', title: '写只读方案', status: 'pending' }
      ]
    });
    facts = await explore(emit, 'plan', task);
    if (live) live.facts = facts;
  }
  const draft = draftLocalBranch({
    taskDescription: task,
    facts,
    modelName: (model && (model.name || model.modelId)) || '内置探索',
    thinkLevel,
    index: live ? live.branches.length + 1 : 1
  });
  if (live) live.facts = facts;
  return { answer: draft.answer, simulated: true, facts, focus: draft.focus };
}

async function addLiveBranch({ emit, model, thinkLevel, history, task }) {
  const live = planRound.current();
  const t = task || (live && live.task);
  const n = live ? live.branches.length + 1 : 1;
  const max = live ? live.maxBranches : 4;
  if (emit) {
    emit('status', {
      text: `${(model && (model.name || model.modelId)) || '内置'} · 分支 ${n}/${max}`
    });
  }
  const out = await runPlanBranch({ emit, model, thinkLevel, task: t, history });
  if (out.facts && live) live.facts = out.facts;
  return planRound.addBranch({
    modelId: model && model.id,
    modelName: (model && (model.name || model.modelId)) || '内置探索',
    thinkLevel,
    simulated: out.simulated,
    focus: out.focus,
    answer: out.answer
  });
}

function emitRound(emit, rec) {
  const snap = planRound.snapshot();
  if (!emit) return;
  emit('planRound', { round: snap });
  emit('message', {
    text: rec.answer,
    branch: {
      index: rec.index,
      max: snap.maxBranches,
      modelName: rec.modelName,
      simulated: rec.simulated
    }
  });
}

async function runPlanRound(payload, emit, cfg) {
  const mm = cfg.multiModel || {};
  const thinkLevel = payload.thinkLevel || mm.thinkLevel || 'high';
  const model = pickModel(cfg, payload.modelId);
  const action = resolvePlanAction(payload, mm);

  if (action === 'single') {
    const task = String(payload.message || '').trim() || '评估当前工作区并给出可执行方案';
    const out = await runPlanBranch({ emit, model, thinkLevel, task, history: payload.history });
    if (emit) emit('message', { text: out.answer });
    return;
  }

  try {
    if (action === 'reset') {
      planRound.reset();
      if (emit) {
        emit('planRound', { round: planRound.snapshot() });
        emit('message', { text: '已清空本轮多模型分支。' });
      }
      return;
    }

    if (action === 'merge') {
      const live = planRound.current();
      if (!live || live.branches.length < 2) {
        if (emit) emit('error', { message: '至少两个分支才能总结。换模型后空发送再作答一次。' });
        return;
      }
      const mergeId = mm.mergeModel === 'auto' ? 'active' : mm.mergeModel || 'active';
      const mergeModel = mergeId === 'active' ? pickModel(cfg, cfg.activeModelId) : pickModel(cfg, mergeId);
      let result;
      if (canCallModel(mergeModel)) {
        const pack = live.branches
          .map((b, i) => `### 分支 ${i + 1} · ${b.modelName}\n\n${b.answer}`)
          .join('\n\n');
        const extra =
          mm.mergeAllowsRead === false
            ? 'Do not call tools. Unify the branch plans from the user message only.'
            : 'You may read files only if branches disagree or lack evidence. Do not modify the repo.';
        const cap = capturingEmit(emit);
        const out = await runOpenAI({
          mode: 'plan',
          message: `任务：${live.task}\n\n${pack}\n\n请统一整理共识、分歧与可执行步骤。不要改文件。`,
          history: [],
          emit: cap,
          model: mergeModel,
          thinkLevel: mm.thinkLevel || thinkLevel,
          allowTools: mm.mergeAllowsRead !== false,
          extraSystem: extra
        });
        result = {
          simulated: false,
          consensusReached: false,
          agreementRate: null,
          participants: live.branches.map((b) => ({
            id: b.id,
            model: b.modelName,
            focus: b.thinkLevel,
            answer: b.answer
          })),
          unifiedActionPlan: [{ id: '1', title: '按合并方案切 Code 执行', status: 'pending' }],
          disagreements: [],
          canonical: (out && out.text) || cap.captured() || '',
          summary: `合并主模型 ${mergeModel.name || mergeModel.modelId} 读了 ${live.branches.length} 个分支。`
        };
      } else {
        result = mergeLocalBranches({
          taskDescription: live.task,
          branches: live.branches,
          facts: live.facts || {}
        });
      }
      planRound.markMerged(result);
      await timedTool(emit, 'plan', 'set_todos', { todos: result.unifiedActionPlan || [] });
      if (emit) {
        emit('planRound', { round: planRound.snapshot() });
        emit('consensus', { result });
        emit('message', { text: [result.canonical, '', result.summary].filter(Boolean).join('\n') });
      }
      return;
    }

    if (action === 'branch') {
      const rec = await addLiveBranch({ emit, model, thinkLevel, history: payload.history });
      emitRound(emit, rec);
      return;
    }

    const task = String(payload.message || '').trim();
    planRound.start({
      task,
      maxBranches: mm.maxBranches,
      mergeModelId: mm.mergeModel,
      thinkLevel
    });
    const rec = await addLiveBranch({ emit, model, thinkLevel, history: payload.history, task });
    emitRound(emit, rec);
  } catch (err) {
    if (emit) emit('error', { message: err.message });
  }
}

async function runChat(payload = {}, emit) {
  const send = typeof emit === 'function' ? emit : payload.emit;
  const cfg = store.load();
  const mode = payload.mode || 'agent';
  if (mode === 'plan') {
    return runPlanRound(payload, send, cfg);
  }
  const active = pickModel(cfg, payload.modelId);
  if (canCallModel(active)) {
    try {
      return await runOpenAI({
        mode,
        message: payload.message,
        history: payload.history || [],
        emit: send,
        model: active,
        thinkLevel: payload.thinkLevel
      });
    } catch (err) {
      if (send) send('error', { message: `模型调用失败，改走内置探索：${err.message}` });
    }
  }
  return runBuiltin(payload, send);
}

module.exports = { runChat, planRound };
