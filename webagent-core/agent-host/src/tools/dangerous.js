const { ProtocolError } = require('../mcp/errors');

/**
 * Best-effort destructive-command detector used by callTool for both
 * local Chat and remote MCP. Not an OS sandbox: encoding, env indirection,
 * and nested scripts can still slip through.
 *
 * Policy lives here only — remote always E_FORBIDDEN, local needs confirm_dangerous.
 */

const { isDangerousCommand } = require('../../../extension/dangerousPolicy');

function assertCommandAllowed(command, { remote = false, confirmDangerous = false } = {}) {
  if (!isDangerousCommand(command)) return;
  if (remote) {
    throw new ProtocolError(
      'E_FORBIDDEN',
      'Destructive commands are blocked on remote MCP. Run them from local Chat if you really mean it.',
      { retryHint: 'Use the local workbench Chat in Code mode, or pick a non-destructive command.' }
    );
  }
  if (!confirmDangerous) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      'Destructive command blocked. Pass confirm_dangerous=true if you really mean it.',
      { retryHint: 'Retry the same command with confirm_dangerous=true only if the user asked for this destructive action.' }
    );
  }
}

module.exports = {
  isDangerousCommand,
  assertCommandAllowed
};
