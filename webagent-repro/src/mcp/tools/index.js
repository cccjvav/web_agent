const { applyPatch } = require('./patchEngine');
const { readFile, writeFile, listDir, grepSearch } = require('./fileOps');
const { executeCommand } = require('./executor');
const { reportProgress, setTodos } = require('./progressTracker');

/**
 * MCP Tool definitions conforming to Model Context Protocol (MCP) standard
 */
const TOOLS = [
  {
    name: 'read_file',
    description: 'Read contents of a file within the workspace with line numbers. Supports reading specific line ranges.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path of the file to read (e.g., "src/calculator.js")'
        },
        offset: {
          type: 'number',
          description: '1-based starting line number (default: 1)'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to read (default: 2000)'
        }
      },
      required: ['filePath']
    },
    handler: readFile
  },
  {
    name: 'write_file',
    description: 'Overwrite or create a file in the workspace with complete content.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path of the file to write'
        },
        content: {
          type: 'string',
          description: 'Full text content of the file'
        }
      },
      required: ['filePath', 'content']
    },
    handler: writeFile
  },
  {
    name: 'apply_patch',
    description: 'Atomically apply structured patches to modify code. Supports search/replace blocks (<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE), unified diffs, and hash verification to prevent race conditions or corrupted edits.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative path to the file to modify'
        },
        patch: {
          type: 'string',
          description: 'The patch containing <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE blocks or unified diff'
        },
        expectedHash: {
          type: 'string',
          description: 'Optional expected SHA256 checksum of the file before modification to avoid editing outdated versions'
        },
        dryRun: {
          type: 'boolean',
          description: 'If true, verifies whether the patch applies cleanly without writing changes to disk'
        }
      },
      required: ['filePath', 'patch']
    },
    handler: applyPatch
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command locally in the workspace (e.g., "npm test", "pytest", "npm install", "git status"). Returns stdout, stderr, exit code and timing. Output is streamed to the host IDE in real time.',
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to run locally'
        },
        cwd: {
          type: 'string',
          description: 'Working directory relative to workspace root (default: ".")'
        },
        timeoutSec: {
          type: 'number',
          description: 'Maximum execution duration in seconds before SIGTERM (default: 30)'
        }
      },
      required: ['command']
    },
    handler: executeCommand
  },
  {
    name: 'list_dir',
    description: 'List files and directories in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: 'Directory path relative to workspace (default: ".")'
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to scan subdirectories (default: false)'
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum recursion depth if recursive is true (default: 3)'
        }
      }
    },
    handler: listDir
  },
  {
    name: 'grep_search',
    description: 'Search for text or regular expression patterns across files in the workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword or regex pattern'
        },
        searchPath: {
          type: 'string',
          description: 'Subfolder or file to search in (default: ".")'
        },
        isRegex: {
          type: 'boolean',
          description: 'Whether query is a regular expression (default: false)'
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether search is case-sensitive (default: false)'
        }
      },
      required: ['query']
    },
    handler: grepSearch
  },
  {
    name: 'report_progress',
    description: 'Report current task status, step name, and completion percentage to the Web Agent IDE host UI.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Current status description or progress explanation'
        },
        percentage: {
          type: 'number',
          description: 'Completion percentage (0 - 100)'
        },
        stepName: {
          type: 'string',
          description: 'Short name of current execution phase (e.g. "Diagnosing tests", "Applying bugfix", "Verifying regression")'
        }
      },
      required: ['message']
    },
    handler: reportProgress
  },
  {
    name: 'set_todos',
    description: 'Update the task breakdown and TODO list displayed in the Web Agent host IDE UI.',
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
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'failed']
              }
            },
            required: ['title']
          },
          description: 'List of todo items for the current session'
        }
      },
      required: ['todos']
    },
    handler: setTodos
  }
];

const toolRegistry = new Map();
TOOLS.forEach(tool => toolRegistry.set(tool.name, tool));

function getToolList() {
  return TOOLS.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema
  }));
}

async function callTool(name, args = {}) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    throw new Error(`Unknown tool: "${name}". Available tools: ${TOOLS.map(t => t.name).join(', ')}`);
  }
  return await tool.handler(args);
}

module.exports = {
  TOOLS,
  getToolList,
  callTool
};
