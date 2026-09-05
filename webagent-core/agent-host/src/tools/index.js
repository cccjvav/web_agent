const { applyPatch } = require('./patchEngine');
const { readFile, readFiles, writeFile, deleteFile, renameFile, listDir, grepSearch } = require('./fileOps');
const { findFiles } = require('./findFiles');
const { executeCommand, startCommand, getCommandOutput, cancelCommand, wait } = require('./executor');
const { reportProgress, setTodos, getTaskState } = require('./progressTracker');
const { runMultiModelConsensus } = require('./consensusEngine');
const eventBus = require('../utils/eventBus');
const { remember, recall } = require('../models/memory');
const { snapshot } = require('../mcp/session');
const { ProtocolError } = require('../mcp/errors');
const { clipJson } = require('../mcp/budget');
const { gitStatus, gitDiff } = require('./gitOps');
const { loadSkill } = require('./skills');
const { workspaceInfo } = require('./workspaceInfo');
const { resolveToolName, normalizeToolArgs } = require('./normalize');

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
    tools: getToolList().map((t) => ({ name: t.name, description: t.description })),
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

const DANGEROUS_RE =
  /\b(rm\s+-rf|rm\s+-fr|mkfs\b|dd\s+if=|shutdown\b|reboot\b|halt\b|poweroff\b|git\s+push\b|git\s+reset\s+--hard|git\s+checkout\s+--|git\s+clean\s+-f|format\s+[a-z]:|del\s+\/s|rd\s+\/s|rmdir\s+\/s|Remove-Item\s+-Recurse|drop\s+database|Invoke-Expression\b|\biex\b|Invoke-WebRequest\b|\biwr\b|Start-Process\b|curl\b[\s\S]*\|\s*(?:sh|bash|zsh|powershell|pwsh|cmd)|wget\b[\s\S]*\|\s*(?:sh|bash|zsh)|powershell[^\n]*-enc(?:odedcommand)?|certutil\b[\s\S]*-urlcache|bitsadmin\b|reg\s+add\b|net\s+user\b|schtasks\b)\b/i;

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
    name: 'workspace_info',
    aliases: [],
    description: 'Orientation: workspace root, git branch, tech stack, skills, top-level names. Call this before listing the whole tree.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: { type: 'object', properties: {} },
    handler: workspaceInfo
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
    description: 'Append a durable note under .webagent/memory. Survive chat resets.',
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
    name: 'git_status',
    aliases: [],
    description: 'Read-only git status (branch + porcelain). If the folder is not a git repo or git is missing, returns {ok:true, available:false, git:false} — do not git init unless the user asked.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: { type: 'object', properties: {} },
    handler: gitStatus
  }),
  tool({
    name: 'git_diff',
    aliases: [],
    description: 'Read-only git diff. Optional filePath, staged, stat. Output is truncated. Same available:false shape as git_status when git is missing.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        staged: { type: 'boolean' },
        stat: { type: 'boolean' }
      }
    },
    handler: gitDiff
  }),
  tool({
    name: 'load_skill',
    aliases: [],
    description: 'List or load a Skill from .webagent/skills/<name>/SKILL.md. Omit name to list.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } }
    },
    handler: loadSkill
  }),
  tool({
    name: 'apply_patch',
    aliases: [],
    description: 'Atomic SEARCH/REPLACE patch. Prefer expectedHash from the last read_files. If you just read the same path, the host reuses that sha256. HASH_REQUIRED returns currentHash in detail for an immediate retry. New files / dryRun may omit the hash. STALE_FILE means re-read. Code mode only.',
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
    description: 'Create a file. Overwrite is allowed with confirm_overwrite=true, or when expectedHash / the last read_files hash still matches. Prefer apply_patch for existing files. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        content: { type: 'string' },
        expectedHash: { type: 'string', description: 'Optional sha256 of the current file when overwriting.' },
        confirm_overwrite: { type: 'boolean', description: 'Required when the path already exists.' }
      },
      required: ['filePath', 'content']
    },
    handler: (args) => writeFile({
      ...args,
      confirmOverwrite: args.confirmOverwrite || args.confirm_overwrite
    })
  }),
  tool({
    name: 'delete_file',
    aliases: [],
    description: 'Delete a file or empty directory inside the workspace. Requires confirm=true. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        confirm: { type: 'boolean', description: 'Must be true after you listed the path.' }
      },
      required: ['filePath']
    },
    handler: deleteFile
  }),
  tool({
    name: 'rename_file',
    aliases: ['move_file'],
    description: 'Rename or move a path inside the workspace. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' }
      },
      required: ['from', 'to']
    },
    handler: renameFile
  }),
  tool({
    name: 'run_command',
    aliases: ['execute_command'],
    description: 'Run a command and wait. For tests/builds that may exceed a few seconds, prefer start_command. Destructive commands need confirm_dangerous=true. Code mode only.',
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
    name: 'start_command',
    aliases: [],
    description: 'Start a workspace command and return execId immediately. Poll get_command_output using suggestedWaitMs. Code mode only.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeoutSec: { type: 'number' },
        confirm_dangerous: { type: 'boolean' }
      },
      required: ['command']
    },
    handler: startCommand
  }),
  tool({
    name: 'get_command_output',
    aliases: [],
    description: 'Poll stdout/stderr for execId from start_command or run_command. Returns status running|done|timeout and suggestedWaitMs.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        execId: { type: 'number' },
        commandId: { type: 'string' },
        tail: { type: 'number' }
      }
    },
    handler: getCommandOutput
  }),
  tool({
    name: 'cancel_command',
    aliases: [],
    description: 'SIGTERM a running start_command execId.',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: { execId: { type: 'number' } },
      required: ['execId']
    },
    handler: cancelCommand
  }),
  tool({
    name: 'wait',
    aliases: [],
    description: 'Sleep up to 15s. Prefer suggestedWaitMs from get_command_output / get_task_status.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: { ms: { type: 'number' } }
    },
    handler: wait
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
    mode: ['ask', 'plan', 'code'],
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
  const resolved = resolveToolName(name);
  const toolDef = toolRegistry.get(resolved) || toolRegistry.get(name);
  if (!toolDef) {
    throw new ProtocolError(
      'E_UNKNOWN_CMD',
      `Unknown tool: "${name}". Available: ${TOOLS.map((t) => t.name).join(', ')}.`,
      { retryHint: 'Call tools/list and use one of the Available names (aliases like bash→run_command, cat→read_files are also accepted).' }
    );
  }
  if (currentMode && !toolDef.mode.includes(currentMode)) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `Tool "${toolDef.name}" is locked in ${String(currentMode).toUpperCase()} mode. Ask/Plan are read-only; switch to CODE to apply_patch or run_command.`
    );
  }
  const input = normalizeToolArgs(toolDef.name, args || {});
  if ((toolDef.name === 'run_command' || toolDef.name === 'start_command') && DANGEROUS_RE.test(String(input.command || ''))) {
    if (!input.confirm_dangerous) {
      throw new ProtocolError(
        'E_BAD_ARGS',
        'Destructive command blocked. Pass confirm_dangerous=true if you really mean it.',
        { retryHint: 'Retry the same command with confirm_dangerous=true only if the user asked for this destructive action.' }
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
