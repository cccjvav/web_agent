class ProtocolError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'ProtocolError';
    this.layer = 'protocol';
    this.code = code;
    this.detail = detail || {};
  }
}

class ExecutionError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'ExecutionError';
    this.layer = 'execution';
    this.code = code;
    this.detail = detail || {};
  }
}

function classifyToolError(err) {
  if (err instanceof ProtocolError || err instanceof ExecutionError) return err;
  const msg = String(err && err.message ? err.message : err);
  if (/Unknown tool/i.test(msg)) return new ProtocolError('E_UNKNOWN_CMD', msg);
  if (/locked in|Ask\/Plan are read-only/i.test(msg)) return new ProtocolError('E_BAD_ARGS', msg);
  if (/requires |required/i.test(msg)) return new ProtocolError('E_BAD_ARGS', msg);
  if (/HASH_REQUIRED/.test(msg)) return new ProtocolError('E_BAD_ARGS', msg);
  if (/STALE_FILE/.test(msg)) return new ExecutionError('E_STALE_FILE', msg);
  if (/Patch conflict/.test(msg)) return new ExecutionError('E_CONFLICT', msg);
  if (/GIT_UNAVAILABLE|not a git repository/i.test(msg)) return new ExecutionError('E_NOT_READY', msg);
  if (/not found|No such file/i.test(msg)) return new ExecutionError('E_NOT_FOUND', msg);
  if (/timeout|isTimeout/i.test(msg)) return new ExecutionError('E_TIMEOUT', msg);
  if (/ACCESS_DENIED_SENSITIVE_FILE|E_FORBIDDEN/i.test(msg)) return new ExecutionError('E_FORBIDDEN', msg);
  if (/confirm_dangerous|confirm_overwrite|confirm=true/i.test(msg)) return new ProtocolError('E_BAD_ARGS', msg);
  return new ExecutionError('E_INTERNAL', msg);
}

function publicError(err) {
  const classified = classifyToolError(err);
  return {
    layer: classified.layer,
    code: classified.code,
    msg: classified.message,
    detail: classified.detail || {}
  };
}

module.exports = { ProtocolError, ExecutionError, classifyToolError, publicError };
