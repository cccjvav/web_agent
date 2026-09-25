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
const { ProtocolError } = require('./errors');
const control = require('../utils/executionControl');
const oauth = require('./oauth');

const RESOURCE_DEFS = [
  { uri: 'webagent://instructions', name: 'Instructions', mimeType: 'text/markdown', description: 'Full server + workspace instructions (same payload as initialize.instructions).' },
  { uri: 'webagent://protocol', name: 'Protocol', mimeType: 'text/markdown', description: 'How to call this MCP host.' },
  { uri: 'webagent://capabilities', name: 'Capabilities', mimeType: 'text/plain', description: 'Registered tools and modes.' },
  { uri: 'webagent://config', name: 'Config', mimeType: 'text/plain', description: 'Host config without secrets.' },
  { uri: 'webagent://workspace', name: 'Workspace', mimeType: 'text/plain', description: 'Workspace root and task state.' },
  { uri: 'webagent://memory', name: 'Memory', mimeType: 'text/markdown', description: 'Persisted agent notes.' },
  { uri: 'webagent://profile', name: 'Profile', mimeType: 'text/markdown', description: 'Environment preference, tech stack, and skills catalog.' },
  { uri: 'webagent://clients', name: 'Clients', mimeType: 'text/markdown', description: 'How web agents connect. ChatGPT chat-bar paste is not MCP; use a homemade plugin or another client.' }
];

function listResources() {
  return RESOURCE_DEFS;
}

function readResource(uri, options = {}) {
  if (options.remote) control.assertAllowed('read_files');
  switch (uri) {
    case 'webagent://instructions':
      return { uri, mimeType: 'text/markdown', text: getInstructions() };
    case 'webagent://profile':
      return {
        uri,
        mimeType: 'text/markdown',
        text: formatWorkspaceContext(loadCustom(), listSkills())
      };
    case 'webagent://protocol':
      return {
        uri,
        mimeType: 'text/markdown',
        text: [
          '# Web Agent MCP',
          '',
          `- Transport: Streamable HTTP JSON-RPC 2.0. Paste-URL clients use \`/mcp/<secret>\`; OAuth clients use \`/mcp\` + Bearer${oauth.oauthEnabled() ? '' : ' (OAuth pairing is currently off on this host; only the operator can enable it locally)'}.`,
          '- initialize → notifications/initialized → workspace_info → tools/list → tools/call; retain Mcp-Session-Id and the negotiated MCP-Protocol-Version.',
          '- workspace resource task state requires an initialized session and reflects only that peer; use get_logs for caller-scoped execution logs.',
          '- resources: webagent://protocol|capabilities|config|workspace|memory|profile|clients',
          '- prompts: workspace customizations',
          '- Tool results are clipped (~4k tokens). Use offset/limit/cursor.',
          '- tools/call failures (wrong args, HASH_REQUIRED, confirm, missing files) are MCP `isError: true` with `{layer,code,msg,detail}`. Stop on HASH_REQUIRED / STALE_FILE and inspect the current file before planning a new edit; detail.currentHash is diagnostic only, never authorization to replay a write.',
          '- JSON-RPC `error` is for bad jsonrpc / unknown method / missing tools/call name, not for a failed tool.',
          '- Heartbeat: call ping; host treats 10s silence as a stale client.',
          '- Long commands: start_command → poll get_command_output(execId) using suggestedWaitMs.',
          '- git_status / git_diff are read-only. Plain folders return available:false instead of throwing.',
          '- apply_patch may reuse the last read_files sha256 for an existing path (persisted under .webagent/read-hashes.json). Never replay a stale patch: re-read and reconcile the current content, and ask the operator if intent conflicts. For a missing target with expectedHash, do not drop the hash and recreate automatically.',
          '- Remote tools/call defaults to Code mode. Pass params._meta.mode=ask|plan|code to switch. Local Chat sends the UI mode on /api/chat.',
          '- Argument aliases: path/file_path → filePath; cmd → command; bash/cat/grep/ls map to run_command/read_files/search_files/list_directory.'
        ].join('\n')
      };
    case 'webagent://capabilities': {
      const tools = getToolList(null, options.remote ? { remote: true } : {});
      return {
        uri,
        mimeType: 'text/plain',
        text: `tools ${tools.length}\n` + tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
      };
    }
    case 'webagent://config': {
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
    case 'webagent://workspace': {
      if (options.remote && !options.callerKey) throw new ProtocolError('E_SESSION_REQUIRED', 'Initialize and retain Mcp-Session-Id before reading the workspace task resource.');
      const custom = loadCustom();
      const task = getTaskState(options);
      return {
        uri,
        mimeType: 'text/plain',
        text: [
          `root ${config.workspaceRoot}`,
          `instructions ${custom.instructions || '(none)'}`,
          `task ${task.status} ${task.progress}% ${task.stepName || ''}`.trim(),
          ...(options.remote ? [] : [`recentEvents ${eventBus.getRecentLogs(5).map((e) => e.type).join(', ') || 'none'}`])
        ].join('\n')
      };
    }
    case 'webagent://memory': {
      const mem = recall({ limit: 80 });
      return { uri, mimeType: 'text/markdown', text: mem.text };
    }
    case 'webagent://clients': {
      const rows = listClients({ mcpUrl: '(mcp url)', mcpCanonicalUrl: '(origin)/mcp' });
      const text = [
        '# Connecting web agents',
        '',
        `This host is not ChatGPT-only. Compatible OAuth clients can use canonical /mcp after registration and authorization${oauth.oauthEnabled() ? '' : ' once the operator enables OAuth pairing locally (it is currently off; URL-secret clients do not need it)'}; vendor versions, menus and subscription availability require separate verification. Pasting a URL into ordinary chat is not connection setup or authorization.`,
        '',
        ...rows.map((c) => `- **${c.name}**: ${c.summary} (Plus=${c.needsPlus === true ? 'yes' : c.needsPlus === false ? 'no' : 'unknown'}, tunnel=${c.needsTunnel === true ? 'yes' : c.needsTunnel === false ? 'no' : 'unknown'})`)
      ].join('\n');
      return { uri, mimeType: 'text/markdown', text };
    }
    default:
      return null;
  }
}

module.exports = { listResources, readResource };
