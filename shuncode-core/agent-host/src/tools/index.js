const { applyPatch } = require('./patchEngine');
const { readFile, writeFile, listDir, grepSearch } = require('./fileOps');
const { executeCommand } = require('./executor');
const { reportProgress, setTodos } = require('./progressTracker');
const { runMultiModelConsensus } = require('./consensusEngine');

const TOOLS = [
  {
    name: 'read_file',
    description: 'Read contents of a file within the workspace with line numbers.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Relative path of the file' },
        offset: { type: 'number', description: '1-based starting line number' },
        limit: { type: 'number', description: 'Maximum number of lines' }
      },
      required: ['filePath']
    },
    handler: readFile
  },
  {
    name: 'list_dir',
    description: 'List files and directories in the workspace.',
    mode: ['ask', 'plan', 'code'],
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Relative directory path' },
        recursive: { type: 'boolean' },
        maxDepth: { type: 'number' }
      }
    },
    handler: listDir
  },
  {
    name: 'grep_search',
    description: 'Search for text or regular expression patterns across files.',
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
  },
  {
    name: 'apply_patch',
    description: 'Atomically apply structured patches to modify code. Supports search/replace blocks and rollback on conflict.',
    mode: ['code'], // Code mode only!
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
  },
  {
    name: 'write_file',
    description: 'Overwrite or create a file in the workspace.',
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
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command locally in the workspace (e.g. "npm test", "pytest").',
    mode: ['code'], // Code mode only!
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
  },
  {
    name: 'report_progress',
    description: 'Report current task status, step name, and completion percentage to the host UI.',
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
  },
  {
    name: 'set_todos',
    description: 'Update the task breakdown and TODO list in the host UI.',
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
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'] }
            },
            required: ['title']
          }
        }
      },
      required: ['todos']
    },
    handler: setTodos
  }
];

const toolRegistry = new Map();
TOOLS.forEach(t => toolRegistry.set(t.name, t));

function getToolList(currentMode = null) {
  return TOOLS
    .filter(t => !currentMode || t.mode.includes(currentMode))
    .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
}

async function callTool(name, args = {}, currentMode = null) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: "${name}".`);
  }

  // Mode check if specified
  if (currentMode && !tool.mode.includes(currentMode)) {
    throw new Error(`Tool "${name}" is locked in "${currentMode.toUpperCase()}" mode. Switch to CODE mode to execute modifications or commands.`);
  }

  return await tool.handler(args);
}

module.exports = {
  TOOLS,
  getToolList,
  callTool,
  runMultiModelConsensus
};
