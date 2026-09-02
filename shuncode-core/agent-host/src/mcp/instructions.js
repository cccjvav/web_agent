const { loadCustom } = require('../models/customizations');
const { config } = require('../config');
const { formatWorkspaceContext } = require('../models/profile');
const { listSkills } = require('../tools/skills');

const CONNECT_LINE = '快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。';

function getBootstrapPrompt(mcpUrl) {
  return `${mcpUrl || ''}\n\n${CONNECT_LINE}`;
}

const SERVER_INSTRUCTIONS = `# ShunCode Bridge MCP

You are connected to a local ShunCode agent-host. Tools edit the workspace on disk.
Do not invent file contents or command output — call tools.

If this text is missing from your system prompt (common for some web MCP clients),
read resource shuncode://instructions and then call tools/list.

## Modes
- Ask / Plan: read-only. Use list/search/read, git_status, git_diff, load_skill. Do not apply_patch, write_file, delete_file, rename_file, or run/start_command.
- Code: may patch, write, delete/rename, and run commands.
If a tool returns E_BAD_ARGS about mode, tell the user to switch to Code.

## Workflow
1. ping → get_capabilities if the session is new
2. git_status / list_directory / search_files / read_files (always capture sha256 hash)
3. apply_patch with expectedHash from the last read (STALE_FILE means re-read)
4. Long work: start_command (e.g. npm test) → wait suggestedWaitMs → get_command_output(execId) until status=done
5. Short one-liners may use run_command. Prefer delete_file/rename_file over shell rm/mv.
6. report_progress / set_todos so the editor UI stays in sync
7. load_skill when a Skill folder is relevant

## Output budget
- One tool result is capped (~4k tokens). Prefer offset/limit, cursor, maxResults.
- read_files default window is hundreds of lines, not whole files.
- Do not paste entire logs back; summarize and keep execId.

## Errors
- Protocol (E_UNKNOWN_CMD / E_BAD_ARGS): you called wrong. Fix arguments.
- Execution (E_NOT_FOUND / E_STALE_FILE / E_TIMEOUT / E_CONFLICT): workspace or command failed.
- get_logs for recent host events. get_task_status for progress + suggestedWaitMs.

## Safety
- Destructive shell (rm -rf, mkfs, dd, shutdown) needs confirm_dangerous=true.
- Prefer apply_patch over write_file.
- Stay inside the workspace; the host rejects path escape.

## Memory
Use remember to persist durable facts across chats; recall before repeating research.
`;

function getInstructions() {
  const custom = loadCustom();
  const extra = [];
  if (custom.instructions) extra.push(`## Workspace instructions\n${custom.instructions}`);
  extra.push(formatWorkspaceContext(custom, listSkills()));
  extra.push(`## Workspace root\n${config.workspaceRoot}`);
  return [SERVER_INSTRUCTIONS.trim(), ...extra].join('\n\n');
}

module.exports = { getInstructions, SERVER_INSTRUCTIONS, getBootstrapPrompt, CONNECT_LINE };
