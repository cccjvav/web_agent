'use strict';
// Opt-in, bounded metadata only; never serialize Error objects, arguments or helper output.
let sequence = 0;
const events = new Set(['created', 'spawn', 'exit', 'error', 'callback', 'invalid-json', 'invalid-shape', 'decoded']);
const codes = new Set(['ENOENT', 'EACCES', 'EPERM', 'ETIMEDOUT', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER']);
function createTrace(operation, count) {
  const enabled = process.env.WEBAGENT_DEBUG_PROCESS === '1' && ['protect', 'unprotect', 'inspect'].includes(operation);
  const id = enabled ? ++sequence : 0;
  const start = enabled ? process.hrtime.bigint() : 0n;
  let emitted = 0, spawned = false, exited = false;
  function trace(event, error = null, stdout = '', stderr = '', rejected = 0) {
    if (!enabled || !events.has(event) || emitted++ >= 10) return;
    try {
      const markers = typeof stderr === 'string' ? stderr.split(/\r?\n/) : [];
      console.error('tunnel helper', JSON.stringify({ operation, id, event,
        count: Number.isInteger(count) && count >= 0 && count <= 64 ? count : null,
        elapsedMs: Number((process.hrtime.bigint() - start) / 1000000n), spawned, exited,
        exitCode: Number.isInteger(error?.code) ? error.code : null,
        errorCode: codes.has(error?.code) ? error.code : error && !Number.isInteger(error.code) ? 'other' : null,
        signal: ['SIGTERM', 'SIGKILL'].includes(error?.signal) ? error.signal : null,
        killed: error?.killed === true,
        stdoutBytes: typeof stdout === 'string' ? Buffer.byteLength(stdout) : 0,
        stderrBytes: typeof stderr === 'string' ? Buffer.byteLength(stderr) : 0,
        helperStarted: markers.includes('WA_TUNNEL_STARTED'),
        helperReady: markers.includes('WA_TUNNEL_READY'),
        helperCompleted: markers.includes('WA_TUNNEL_COMPLETED'),
        rejected: Number.isInteger(rejected) && rejected >= 0 && rejected <= 64 ? rejected : null }));
    } catch (_) { /* Broken diagnostics must not change the receipt/inspection contract. */ }
  }
  function watch(child) {
    if (!enabled) return;
    try {
      child.once('spawn', () => { spawned = true; trace('spawn'); });
      child.once('exit', (code, signal) => { exited = true; trace('exit', { code, signal }); });
      child.once('error', error => trace('error', error));
    } catch (_) {}
  }
  trace('created');
  return { trace, watch };
}
module.exports = { createTrace };
