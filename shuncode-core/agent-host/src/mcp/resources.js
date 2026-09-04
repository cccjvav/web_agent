const { config } = require('../config');
const { getToolList } = require('../tools');
const { loadCustom } = require('../models/customizations');
const { formatWorkspaceContext } = require('../models/profile');
const { listSkills } = require('../tools/skills');
const { getTaskState } = require('../tools/progressTracker');
const { recall } = require('../models/memory');
const { snapshot } = require('./session');
const eventBus = require('../utils/eventBus');
const { getInstructions } = require('./instructions');
const { listClients } = require('./clients');

const RESOURCE_DEFS = [
  { uri: 'shuncode://instructions', name: 'Instructions', mimeType: 'text/markdown', description: 'Full server + workspace instructions (same payload as initialize.instructions).' },
  { uri: 'shuncode://protocol', name: 'Protocol', mimeType: 'text/markdown', description: 'How to call this MCP host.' },
  { uri: 'shuncode://capabilities', name: 'Capabilities', mimeType: 'text/plain', description: 'Registered tools and modes.' },
  { uri: 'shuncode://config', name: 'Config', mimeType: 'text/plain', description: 'Host config without secrets.' },
  { uri: 'shuncode://workspace', name: 'Workspace', mimeType: 'text/plain', description: 'Workspace root and task state.' },
  { uri: 'shuncode://memory', name: 'Memory', mimeType: 'text/markdown', description: 'Persisted agent notes.' },
  { uri: 'shuncode://profile', name: 'Profile', mimeType: 'text/markdown', description: 'Environment preference, tech stack, and skills catalog.' },
  { uri: 'shuncode://clients', name: 'Clients', mimeType: 'text/markdown', description: 'How web agents connect. ChatGPT Plus is optional.' }
];

function listResources() {
  return RESOURCE_DEFS;
}

function readResource(uri) {
  switch (uri) {
    case 'shuncode://instructions':
      return { uri, mimeType: 'text/markdown', text: getInstructions() };
    case 'shuncode://profile':
      return {
        uri,
        mimeType: 'text/markdown',
        text: formatWorkspaceContext(loadCustom(), listSkills())
      };
    case 'shuncode://protocol':
      return {
        uri,
        mimeType: 'text/markdown',
        text: [
          '# ShunCode MCP',
          '',
          '- Transport: Streamable HTTP JSON-RPC 2.0. Paste-URL clients use `/mcp/<secret>`; OAuth clients use `/mcp` + Bearer.',
          '- initialize → workspace_info → tools/list → tools/call',
          '- resources: shuncode://protocol|capabilities|config|workspace|memory|profile|clients',
          '- prompts: workspace customizations',
          '- Tool results are clipped (~4k tokens). Use offset/limit/cursor.',
          '- tools/call failures (wrong args, HASH_REQUIRED, confirm, missing files) are MCP `isError: true` with `{layer,code,msg,detail}`. Retry using detail.retryHint / detail.currentHash.',
          '- JSON-RPC `error` is for bad jsonrpc / unknown method / missing tools/call name, not for a failed tool.',
          '- Heartbeat: call ping; host treats 10s silence as a stale client.',
          '- Long commands: start_command → poll get_command_output(execId) using suggestedWaitMs.',
          '- git_status / git_diff are read-only. Plain folders return available:false instead of throwing.',
          '- apply_patch reuses the last read_files sha256 for that path (persisted under .shuncode/read-hashes.json); otherwise pass expectedHash. HASH_REQUIRED includes currentHash.',
          '- Remote tools/call defaults to Code mode. Pass params._meta.mode=ask|plan|code to switch. Local Chat sends the UI mode on /api/chat.',
          '- Argument aliases: path/file_path → filePath; cmd → command; bash/cat/grep/ls map to run_command/read_files/search_files/list_directory.'
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
    case 'shuncode://clients': {
      const rows = listClients({ mcpUrl: '(mcp url)', mcpCanonicalUrl: '(origin)/mcp' });
      const text = [
        '# Connecting web agents',
        '',
        'This host is not ChatGPT-only. Free users should use local Chat, a web agent that can call MCP (Arena, etc.), or DeepSeek Web via the DeepSeek++ extension (Streamable HTTP).',
        '',
        ...rows.map((c) => `- **${c.name}**: ${c.summary} (Plus=${c.needsPlus ? 'yes' : 'no'}, tunnel=${c.needsTunnel ? 'yes' : 'no'})`)
      ].join('\n');
      return { uri, mimeType: 'text/markdown', text };
    }
    default:
      return null;
  }
}

module.exports = { listResources, readResource };
