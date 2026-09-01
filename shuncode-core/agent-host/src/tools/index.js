const { applyPatch } = require('./patchEngine');
const { readFile, readFiles, writeFile, listDir, grepSearch } = require('./fileOps');
const { findFiles } = require('./findFiles');
const { executeCommand, getCommandOutput, sendCommandInput, wait } = require('./executor');
const { reportProgress, setTodos } = require('./progressTracker');
const { runMultiModelConsensus } = require('./consensusEngine');
const { lsp, getDiagnostics } = require('./lspStub');

function tool(def) {
  return def;
}

const TOOLS = [
  tool({
    name: 'list_directory',
    aliases: ['list_dir'],
    description: '查看已知目录的直接内容，限制深度，避免无控制递归。',
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
    description: '按 Glob 查找文件，支持范围与结果上限。',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        glob: { type: 'string' },
        searchPath: { type: 'string' },
        maxResults: { type: 'number' }
      }
    },
    handler: findFiles
  }),
  tool({
    name: 'search_files',
    aliases: ['grep_search'],
    description: '文本或正则搜索，返回文件、行号和有限上下文。',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        searchPath: { type: 'string' },
        isRegex: { type: 'boolean' },
        caseSensitive: { type: 'boolean' }
      },
      required: ['query']
    },
    handler: grepSearch
  }),
  tool({
    name: 'read_files',
    aliases: ['read_file'],
    description: '一次读取一个或多个文件或指定行范围，返回 sha256 版本哈希。',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' } },
        offset: { type: 'number' },
        limit: { type: 'number' }
      }
    },
    handler: readFiles
  }),
  tool({
    name: 'apply_patch',
    aliases: [],
    description: '多文件原子化预检补丁。SEARCH/REPLACE 块，sha256 冲突检测，失败不部分写入。仅 Code 模式。',
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
    description: '覆盖或创建文件。优先使用 apply_patch。仅 Code 模式。',
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
    description: '在工作区执行前台命令（构建、测试）。仅 Code 模式。',
    mode: ['code'],
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string' },
        timeoutSec: { type: 'number' }
      },
      required: ['command']
    },
    handler: executeCommand
  }),
  tool({
    name: 'get_command_output',
    aliases: [],
    description: '按命令 ID 读取上次命令的输出。',
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
    description: '为后台构建或服务器提供合理等待。',
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
    throw new Error(`Unknown tool: "${name}".`);
  }
  if (currentMode && !toolDef.mode.includes(currentMode)) {
    throw new Error(
      `Tool "${toolDef.name}" is locked in ${String(currentMode).toUpperCase()} mode. Ask/Plan are read-only; switch to CODE to apply_patch or run_command.`
    );
  }
  return toolDef.handler(args || {});
}

module.exports = {
  TOOLS,
  getToolList,
  callTool,
  runMultiModelConsensus
};
