'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { currentSignal, checkCancelled } = require('../utils/requestScope');
const MAX_FRAME = 256 * 1024, MAX_TOTAL = 8 * 1024 * 1024, MAX_STDERR = 1024 * 1024;
const live = new Set();
function open(launch, onStopped = () => {}) {
  const spec = JSON.stringify({ program: launch.program, args: launch.args, cwd: launch.cwd, parentPid: process.pid, envKeys: Object.keys(launch.env) });
  const win = process.platform === 'win32';
  const program = win ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe') : process.execPath;
  const args = win ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'stdioBridge.ps1')]
    : [path.join(__dirname, 'stdioSupervisor.js')];
  const helperEnv = { ...launch.env, WEBAGENT_STDIO_LAUNCH: spec };
  if (win) {
    // Runtime/cache locations belong to the product bootstrap, not to the target.
    for (const [key, value] of Object.entries(process.env)) {
      if (/^(USERPROFILE|APPDATA|LOCALAPPDATA|HOMEDRIVE|HOMEPATH)$/i.test(key) && !Object.keys(helperEnv).some(existing => existing.toUpperCase() === key.toUpperCase())) helperEnv[key] = value;
    }
    helperEnv.PSModulePath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/Modules');
  }
  const child = spawn(program, args, { cwd: launch.cwd, shell: false, detached: !win, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'], env: helperEnv });
  let ready = !win, queuedBytes = 0, bootstrapStage = win ? 'starting' : 'not-required'; const queued = [];
  const pending = new Map(); let buffer = Buffer.alloc(0), totalBytes = 0, stderrBytes = 0, frames = 0, stopped = false, closed = false, stopReason = '';
  let resolveClosed;
  const done = new Promise(resolve => { resolveClosed = resolve; });
  function stop(reason = 'Stdio server stopped') {
    if (stopped) return done;
    stopped = true; stopReason = reason; buffer = Buffer.alloc(0); queued.length = 0; queuedBytes = 0;
    for (const entry of pending.values()) entry.reject(new Error(reason));
    pending.clear();
    child.stdin.destroy();
    if (child.pid) {
      try { if (win) child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch (_) { try { child.kill('SIGKILL'); } catch (_) {} }
    }
    onStopped(reason);
    return done;
  }
  function finish() {
    if (closed) return;
    closed = true; stop('Stdio process exited'); live.delete(transport); resolveClosed();
  }
  function send(message) {
    const encoded = Buffer.from(JSON.stringify(message) + '\n');
    if (encoded.length > 32768 || queuedBytes + child.stdin.writableLength + encoded.length > 256 * 1024) throw new Error('Stdio input budget exceeded');
    if (!ready) { queued.push(encoded); queuedBytes += encoded.length; return; }
    child.stdin.write(encoded, error => { if (error) stop('Stdio input closed'); });
  }
  function frame(bytes) {
    const message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!message || message.jsonrpc !== '2.0' || Array.isArray(message)) throw new Error('Invalid stdio JSON-RPC frame');
    if (!ready) {
      if (message.method === 'notifications/webagent/stdio-bootstrap') {
        const next = { starting: 'script', script: 'config', config: 'compiled' }[bootstrapStage];
        if (!next || message.params?.stage !== next || Object.keys(message).length !== 3 || Object.keys(message.params).length !== 1) throw new Error('Invalid bootstrap stage');
        bootstrapStage = next; return;
      }
      if (message.method !== 'notifications/webagent/stdio-ready' || Object.keys(message).length !== 2) throw new Error('Expected guarded stdio readiness');
      ready = true;
      for (const bytes of queued) child.stdin.write(bytes, error => { if (error) stop('Stdio input closed'); });
      queued.length = 0; queuedBytes = 0; return;
    }
    if (++frames > 4096) throw new Error('Stdio session frame budget exceeded');
    if (typeof message.method === 'string') {
      // No sampling, roots, elicitation or server-initiated tools are authorized.
      if (Object.hasOwn(message, 'id')) send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Server requests are not supported' } });
      return;
    }
    const entry = pending.get(message.id);
    if (!entry) return;
    if (message.error || !message.result || typeof message.result !== 'object' || Array.isArray(message.result)) entry.reject(new Error('Stdio MCP protocol error'));
    else entry.resolve(message.result);
  }
  child.stdout.on('data', chunk => {
    if (stopped) return;
    try {
      totalBytes += chunk.length;
      if (totalBytes > MAX_TOTAL) throw new Error('Stdio session output budget exceeded');
      // Process each byte chunk before retaining an incomplete line; never readline an unlimited line.
      let start = 0, end;
      while ((end = chunk.indexOf(10, start)) !== -1) {
        const part = chunk.subarray(start, end);
        if (buffer.length + part.length > MAX_FRAME) throw new Error('Stdio frame exceeds 256 KiB');
        const line = buffer.length ? Buffer.concat([buffer, part]) : part;
        buffer = Buffer.alloc(0); start = end + 1;
        if (line.length) frame(line);
      }
      const rest = chunk.subarray(start);
      if (buffer.length + rest.length > MAX_FRAME) throw new Error('Stdio frame exceeds 256 KiB');
      if (rest.length) buffer = Buffer.concat([buffer, rest]);
    } catch (_) { stop('Stdio protocol or output budget failed; inspect server separately, no automatic replay'); }
  });
  child.stderr.on('data', chunk => {
    // Count but never retain/log third-party stderr (it may contain credentials or file contents).
    totalBytes += chunk.length; stderrBytes += chunk.length;
    if (stderrBytes > MAX_STDERR || totalBytes > MAX_TOTAL) stop('Stdio stderr/session output budget exceeded');
  });
  child.stdin.on('error', () => stop('Stdio input closed'));
  child.stdout.on('error', () => stop('Stdio output closed'));
  child.stderr.on('error', () => stop('Stdio error stream closed'));
  child.once('error', () => { stop('Stdio process could not start'); finish(); });
  child.once('exit', () => stop('Stdio process exited'));
  child.once('close', finish);
  function request(method, params, notification = false) {
    checkCancelled();
    if (stopped) return Promise.reject(new Error('Stdio server is stopped; explicitly preview/start again'));
    if (pending.size >= 8) return Promise.reject(new Error('At most eight in-flight stdio requests'));
    if (notification) { send({ jsonrpc: '2.0', method, params }); return Promise.resolve({}); }
    const id = randomUUID(), parent = currentSignal();
    return new Promise((resolve, reject) => {
      const abort = () => stop('Stdio request cancelled or timed out; effects may already exist');
      const timer = setTimeout(abort, 30000);
      function settle(callback, value) {
        clearTimeout(timer); parent?.removeEventListener('abort', abort); pending.delete(id); callback(value);
      }
      pending.set(id, { resolve: value => settle(resolve, value), reject: error => settle(reject, error) });
      parent?.addEventListener('abort', abort, { once: true });
      if (parent?.aborted) { abort(); return; }
      try { send({ jsonrpc: '2.0', id, method, params }); }
      catch (_) { stop('Stdio request exceeded input budget'); }
    });
  }
  const transport = { request, stop, closed: done, status: () => ({ pid: child.pid, stopped, closed, ready, queuedBytes, bootstrapStage, stopReason, stdoutAndStderrBytes: totalBytes, stderrBytes, frames, pending: pending.size }) };
  live.add(transport);
  return transport;
}
function snapshot() { return [...live].map(transport => transport.status()); }
function closeAll() { return Promise.all([...live].map(transport => transport.stop('Host stopping'))); }
process.once('exit', () => { for (const transport of live) transport.stop('Host exited'); });
module.exports = { open, closeAll, snapshot };
