const { loadCustom } = require('../models/customizations');
const { config } = require('../config');

const SERVER_INSTRUCTIONS = `# ShunCode Bridge MCP

You are connected to a local ShunCode agent-host. Tools edit the workspace on disk.
Do not invent file contents or command output — call tools.

## Modes
- Ask / Plan: read-only (list/search/read). Do not apply_patch or run_command.
- Code: may apply_patch, write_file, run_command.
If a tool returns E_BAD_ARGS about mode, tell the user to switch to Code.

## Workflow
1. ping → get_capabilities if the session is new
2. list_directory / search_files / read_files (always capture sha256 hash)
3. apply_patch with expectedHash from the last read (STALE_FILE means re-read)
4. run_command for tests (e.g. npm test). On timeout use get_command_output(execId)
5. report_progress / set_todos so the editor UI stays in sync

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
  if (custom.preference) extra.push(`## Preference\n${custom.preference}`);
  extra.push(`## Workspace root\n${config.workspaceRoot}`);
  return [SERVER_INSTRUCTIONS.trim(), ...extra].join('\n\n');
}

module.exports = { getInstructions, SERVER_INSTRUCTIONS };
