const path = require('path');
const { config } = require('../config');
const { callTool } = require('../tools');
const { runMultiModelConsensus } = require('../tools/consensusEngine');
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
    const mm = store.load().multiModel || {};
    if (mm.enabled === false) {
      if (emit) {
        emit('message', {
          text: [
            `计划（未开多模型博弈）：${message}`,
            '',
            summarizeAsk(message, facts),
            '',
            '下一步切到 **Web Agent Code** 再改文件。'
          ].join('\n')
        });
      }
      return;
    }
    const consensus = await runMultiModelConsensus({
      taskDescription: message,
      facts,
      emit
    });
    await timedTool(emit, 'plan', 'set_todos', { todos: consensus.unifiedActionPlan });
    if (emit) {
      emit('consensus', { result: consensus });
      emit('message', {
        text: [
          consensus.canonical,
          '',
          consensus.summary,
          '',
          '下一步切到 **Web Agent Code** 执行补丁。配置了 API Provider 时会走模型工具循环。'
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

async function runChat(payload, emit) {
  const cfg = store.load();
  const active = (cfg.models || []).find((m) => m.id === cfg.activeModelId);
  if (active && active.apiKey && active.baseUrl && active.modelId) {
    return runOpenAI({ ...payload, model: active, emit });
  }
  return runBuiltin(payload, emit);
}

module.exports = { runChat };
