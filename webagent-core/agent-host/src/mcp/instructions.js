const { loadCustom } = require('../models/customizations');
const { config } = require('../config');
const { formatWorkspaceContext } = require('../models/profile');
const { listSkills } = require('../tools/skills');

const CONNECT_LINE = '快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。';

function getBootstrapPrompt(mcpUrl) {
  return `${mcpUrl || ''}\n\n${CONNECT_LINE}`;
}

const SERVER_INSTRUCTIONS = `# Web Agent Bridge MCP

You are connected to a local Web Agent agent-host. Tools edit the workspace on disk.
Do not invent file contents or command output — call tools.

If this text is missing from your system prompt (common for some web MCP clients),
read resource webagent://instructions and then call tools/list.

## Modes
- Ask / Plan: read-only. Use list/search/read, git_status, git_diff, load_skill. Do not apply_patch, write_file, delete_file, rename_file, or run/start_command.
- Code: may patch, write, delete/rename, and run commands.
Remote MCP tools/call defaults to Code. Optional params._meta.mode of ask|plan|code switches the lock. Local Chat passes the UI mode separately.
If a tool returns E_BAD_ARGS about mode, tell the user to switch to Code.

## Workflow
1. ping → workspace_info (orientation) → get_capabilities if the session is new
2. git_status / list_directory / search_files / read_files (always capture sha256 hash). git_status may return available:false in a plain folder — do not git init unless asked.
3. apply_patch. If you just read_files that path, the host reuses the sha256 (kept in .webagent/read-hashes.json across host restarts until reset-round). Otherwise pass expectedHash. HASH_REQUIRED / STALE_FILE include currentHash in detail — retry once with that hash. Do not stop the loop. SEARCH must match once; if it appears more than once pass occurrence (1-based). The host keeps the file line endings (CRLF on Windows).
4. Long work: start_command (e.g. npm test) → wait suggestedWaitMs → get_command_output(execId) until status=done
5. Short one-liners may use run_command. Prefer delete_file/rename_file over shell rm/mv.
6. report_progress / set_todos so the editor UI stays in sync
7. load_skill when a Skill folder is relevant

## Output budget
- One tool result is capped (~4k tokens). Prefer offset/limit, cursor, maxResults.
- read_files default window is hundreds of lines, not whole files.
- Do not paste entire logs back; summarize and keep execId.

## Errors
- tools/call failures come back as MCP isError text with layer, code, msg, and detail. Read detail.retryHint / detail.currentHash and retry. Do not treat this as a transport crash.
- Protocol (E_UNKNOWN_CMD / E_BAD_ARGS): you called wrong. Fix arguments. Unknown names list Available; bash/cat/grep/ls map to run_command/read_files/search_files/list_directory.
- Execution (E_NOT_FOUND / E_STALE_FILE / E_TIMEOUT / E_CONFLICT / E_NOT_READY): workspace or command failed.
- get_logs for recent host events. get_task_status for progress + suggestedWaitMs.
- path / file_path / file are accepted as filePath. confirm / confirm_overwrite / confirm_dangerous accept true/1/"true".

## Safety
- Destructive shell (rm -rf, mkfs, dd, shutdown, git reset --hard, Remove-Item -Recurse) needs confirm_dangerous=true.
- Prefer apply_patch over write_file. Overwrite write_file is allowed if confirm_overwrite=true, expectedHash matches, or you read_files that path in this host process. A hash left on disk from a previous run is not enough. New files: empty SEARCH or the file body — not a unified diff.
- delete_file needs confirm=true after you have listed the path.
- Stay inside the workspace; the host rejects path escape.
- .env, keys, SSH, and .webagent/config.json are blocked (E_FORBIDDEN). Do not ask the user to paste secrets.

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
