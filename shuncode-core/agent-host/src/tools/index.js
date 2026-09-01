const { applyPatch } = require('./patchEngine');
const { readFile, readFiles, writeFile, listDir, grepSearch } = require('./fileOps');
const { findFiles } = require('./findFiles');
const { executeCommand, getCommandOutput, sendCommandInput, wait } = require('./executor');
const { reportProgress, setTodos, getTaskState } = require('./progressTracker');
const { runMultiModelConsensus } = require('./consensusEngine');
const { lsp, getDiagnostics } = require('./lspStub');
const eventBus = require('../utils/eventBus');
const { remember, recall } = require('../models/memory');
const { snapshot } = require('../mcp/session');
const { ProtocolError } = require('../mcp/errors');
const { clipJson } = require('../mcp/budget');

function tool(def) {
  return def;
}

function pingHost() {
  return { ok: true, ts: Date.now(), ...snapshot() };
}

function getLogs({ maxLines = 50 } = {}) {
  const n = Math.min(200, Math.max(1, Number(maxLines) || 50));
  return { logs: eventBus.getRecentLogs(n), count: n };
}

function getCapabilities() {
  return {
    tools: TOOLS.map((t) => ({ name: t.name, mode: t.mode, description: t.description })),
    session: snapshot()
  };
}

function getTaskStatus() {
  const task = getTaskState();
  const running = task.status === 'in_progress';
  return {
    ...task,
    suggestedWaitMs: running ? 2000 : 0,
    etaSeconds: running ? Math.max(1, Math.round((100 - (task.progress || 0)) / 10)) : 0
  };
}

const DANGEROUS_RE = /\b(rm\s+-rf|rm\s+-fr|mkfs\b|dd\s+if=|shutdown\b|reboot\b)\b/i;

const TOOLS = [
  tool({
    name: 'ping',
    aliases: [],
    description: 'Heartbeat. Confirms the host is alive; remote clients should call this instead of retrying blindly.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: { type: 'object', properties: {} },
    handler: pingHost
  }),
  tool({
    name: 'get_capabilities',
    aliases: [],
    description: 'List tools and which Ask/Plan/Code modes they allow.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: { type: 'object', properties: {} },
    handler: getCapabilities
  }),
  tool({
    name: 'get_logs',
    aliases: [],
    description: 'Recent host events. Default 50 lines. Use when a tool failed and you need context.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { maxLines: { type: 'number', description: '1–200, default 50' } }
    },
    handler: getLogs
  }),
  tool({
    name: 'get_task_status',
    aliases: [],
    description: 'Current progress, todos, and suggestedWaitMs so you do not busy-poll.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: { type: 'object', properties: {} },
    handler: getTaskStatus
  }),
  tool({
    name: 'remember',
    aliases: [],
    description: 'Append a durable note under .shuncode/memory. Survive chat resets.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    },
    handler: remember
  }),
  tool({
    name: 'recall',
    aliases: [],
    description: 'Read persisted agent memory. Call before repeating research.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' }, day: { type: 'string' } }
    },
    handler: recall
  }),
  tool({
    name: 'list_directory',
    aliases: ['list_dir'],
    description: 'List a directory. Keep maxDepth small. Results may be clipped; pass a narrower dirPath.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string' },
        recursive: { type: 'boolean' },
        maxDepth: { type: 'number' }
      }
    },
    handler: listDir
  }),
  tool({
    name: 'find_files',
    aliases: [],
    description: 'Glob search. Always set maxResults (default 40).',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        glob: { type: 'string' },
        searchPath: { type: 'string' },
        maxResults: { type: 'number', description: 'Cap hits. Default 40.' }
      }
    },
    handler: findFiles
  }),
  tool({
    name: 'search_files',
    aliases: ['grep_search'],
    description: 'Search text. Returns at most `limit` hits (default 20) plus nextCursor.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        searchPath: { type: 'string' },
        isRegex: { type: 'boolean' },
        caseSensitive: { type: 'boolean' },
        limit: { type: 'number', description: 'Page size, default 20, max 100.' },
        cursor: { type: 'number', description: 'Skip this many prior hits.' }
      },
      required: ['query']
    },
    handler: grepSearch
  }),
  tool({
    name: 'read_files',
    aliases: ['read_file'],
    description: 'Read files by line window. Returns sha256. Default limit 400 lines — pass offset to continue. Use the hash as apply_patch expectedHash.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        offset: { type: 'number', description: '1-based start line.' },
        limit: { type: 'number', description: 'Max lines, default 400.' }
      }
    },
    handler: readFiles
  }),
  tool({
    name: 'apply_patch',
    aliases: [],
    description: 'Atomic SEARCH/REPLACE patch. Pass expectedHash from read_files. STALE_FILE means re-read. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        patch: { type: 'string' },
        expectedHash: { type: 'string' },
        dryRun: { type: 'boolean' }
      },
      required: ['filePath', 'patch']
    },
    handler: applyPatch
  }),
  tool({
    name: 'write_file',
    aliases: [],
    description: 'Overwrite or create a file. Prefer apply_patch. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['filePath', 'content']
    },
    handler: writeFile
  }),
  tool({
    name: 'run_command',
    aliases: ['execute_command'],
    description: 'Run a workspace shell command (build/test). Hard timeout (timeoutSec, default 30). Destructive commands need confirm_dangerous=true. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeoutSec: { type: 'number', description: 'Hard cap in seconds, default 30.' },
        confirm_dangerous: { type: 'boolean' }
      },
      required: ['command']
    },
    handler: executeCommand
  }),
  tool({
    name: 'get_command_output',
    aliases: [],
    description: 'Read captured stdout/stderr for execId after run_command. Prefer this over asking the model to remember logs.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        execId: { type: 'number' },
        commandId: { type: 'string' }
      }
    },
    handler: getCommandOutput
  }),
  tool({
    name: 'send_command_input',
    aliases: [],
    description: '向交互式命令继续输入（完整桌面版为持久 PTY）。',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        execId: { type: 'number' },
        input: { type: 'string' }
      }
    },
    handler: sendCommandInput
  }),
  tool({
    name: 'wait',
    aliases: [],
    description: 'Sleep up to 15s. Prefer get_task_status.suggestedWaitMs instead of tight loops.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { ms: { type: 'number' } }
    },
    handler: wait
  }),
  tool({
    name: 'lsp',
    aliases: [],
    description: '符号、定义、引用、Hover 等语言服务能力（本主机为近似实现）。',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        filePath: { type: 'string' },
        query: { type: 'string' }
      }
    },
    handler: lsp
  }),
  tool({
    name: 'get_diagnostics',
    aliases: [],
    description: '读取当前诊断，包括未保存状态的近似检查。',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { filePath: { type: 'string' } }
    },
    handler: getDiagnostics
  }),
  tool({
    name: 'report_progress',
    aliases: [],
    description: '把当前阶段和完成度同步到编辑器。',
    mode: ['plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        percentage: { type: 'number' },
        stepName: { type: 'string' }
      },
      required: ['message']
    },
    handler: reportProgress
  }),
  tool({
    name: 'set_todos',
    aliases: [],
    description: '更新任务分解，在本地 UI 显示。',
    mode: ['plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              title: { type: 'string' },
              status: { type: 'string' }
            },
            required: ['title']
          }
        }
      },
      required: ['todos']
    },
    handler: setTodos
  })
];

const toolRegistry = new Map();
for (const t of TOOLS) {
  toolRegistry.set(t.name, t);
  for (const alias of t.aliases || []) {
    toolRegistry.set(alias, t);
  }
}

function getToolList(currentMode = null) {
  return TOOLS
    .filter((t) => !currentMode || t.mode.includes(currentMode))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

async function callTool(name, args = {}, currentMode = null) {
  const toolDef = toolRegistry.get(name);
  if (!toolDef) {
    throw new ProtocolError('E_UNKNOWN_CMD', `Unknown tool: "${name}".`);
  }
  if (currentMode && !toolDef.mode.includes(currentMode)) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `Tool "${toolDef.name}" is locked in ${String(currentMode).toUpperCase()} mode. Ask/Plan are read-only; switch to CODE to apply_patch or run_command.`
    );
  }
  const input = args || {};
  if (toolDef.name === 'run_command' && DANGEROUS_RE.test(String(input.command || ''))) {
    if (!input.confirm_dangerous) {
      throw new ProtocolError(
        'E_BAD_ARGS',
        'Destructive command blocked. Pass confirm_dangerous=true if you really mean it.'
      );
    }
  }
  const result = await toolDef.handler(input);
  if (result && result.isTimeout) {
    result.code = 'E_TIMEOUT';
    result.suggestedWaitMs = 0;
  }
  return clipJson(result);
}

module.exports = {
  TOOLS,
  getToolList,
  callTool,
  runMultiModelConsensus
};
