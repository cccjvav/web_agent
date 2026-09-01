const { config } = require('../config');
const { getToolList } = require('../tools');
const { loadCustom } = require('../models/customizations');
const { getTaskState } = require('../tools/progressTracker');
const { recall } = require('../models/memory');
const { snapshot } = require('./session');
const eventBus = require('../utils/eventBus');
const { getInstructions } = require('./instructions');

const RESOURCE_DEFS = [
  { uri: 'shuncode://instructions', name: 'Instructions', mimeType: 'text/markdown', description: 'Full server + workspace instructions (same payload as initialize.instructions).' },
  { uri: 'shuncode://protocol', name: 'Protocol', mimeType: 'text/markdown', description: 'How to call this MCP host.' },
  { uri: 'shuncode://capabilities', name: 'Capabilities', mimeType: 'text/plain', description: 'Registered tools and modes.' },
  { uri: 'shuncode://config', name: 'Config', mimeType: 'text/plain', description: 'Host config without secrets.' },
  { uri: 'shuncode://workspace', name: 'Workspace', mimeType: 'text/plain', description: 'Workspace root and task state.' },
  { uri: 'shuncode://memory', name: 'Memory', mimeType: 'text/markdown', description: 'Persisted agent notes.' }
];

function listResources() {
  return RESOURCE_DEFS;
}

function readResource(uri) {
  switch (uri) {
    case 'shuncode://protocol':
      return {
        uri,
        mimeType: 'text/markdown',
        text: [
          '# ShunCode MCP',
          '',
          '- Transport: Streamable HTTP JSON-RPC 2.0 at `/mcp/<secret>`',
          '- initialize → tools/list → tools/call',
          '- resources: shuncode://protocol|capabilities|config|workspace|memory',
          '- prompts: workspace customizations',
          '- Tool results are clipped (~4k tokens). Use offset/limit/cursor.',
          '- Protocol errors are JSON-RPC `error`; execution failures are `isError: true` with `{code,msg}`.',
          '- Heartbeat: call ping; host treats 10s silence as a stale client.',
          '- Long commands: start_command → poll get_command_output(execId) using suggestedWaitMs.',
          '- git_status / git_diff are read-only. delete_file / rename_file stay inside the workspace.',
          '- apply_patch needs expectedHash from the last read_files hash.'
        ].join('\n')
      };
    case 'shuncode://capabilities': {
      const tools = getToolList();
      return {
        uri,
        mimeType: 'text/plain',
        text: `tools ${tools.length}\n` + tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
      };
    }
    case 'shuncode://config': {
      const sess = snapshot();
      return {
        uri,
        mimeType: 'text/plain',
        text: [
          `server ${config.serverName} ${config.version}`,
          `workspace ${config.workspaceRoot}`,
          `bridgeRunning ${config.bridgeRunning}`,
          `tunnel ${config.tunnelProvider}`,
          `installId ${config.installId}`,
          `mcpClients ${sess.clients} alive=${sess.alive}`,
          'secret omitted'
        ].join('\n')
      };
    }
    case 'shuncode://workspace': {
      const custom = loadCustom();
      const task = getTaskState();
      return {
        uri,
        mimeType: 'text/plain',
        text: [
          `root ${config.workspaceRoot}`,
          `instructions ${custom.instructions || '(none)'}`,
          `task ${task.status} ${task.progress}% ${task.stepName || ''}`.trim(),
          `recentEvents ${eventBus.getRecentLogs(5).map((e) => e.type).join(', ') || 'none'}`
        ].join('\n')
      };
    }
    case 'shuncode://memory': {
      const mem = recall({ limit: 80 });
      return { uri, mimeType: 'text/markdown', text: mem.text };
    }
    default:
      return null;
  }
}

module.exports = { listResources, readResource };
