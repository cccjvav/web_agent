const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { resolveSafePath } = require('./patchEngine');
const { ProtocolError } = require('../mcp/errors');
const ptyJobs = require('./ptyJobs');
const { currentSignal, checkCancelled } = require('../utils/requestScope');

let lastExecId = '';
const commandStore = new Map();
const children = new Map();
const MAX_CAPTURE = 200 * 1024;
const MAX_RUNNING = 8;
const MAX_COMMANDS = 40;

function countRunning() {
  let n = 0;
  for (const rec of commandStore.values()) {
    if (rec.status === 'running') n += 1;
  }
  return n;
}

function pruneCommands() {
  if (commandStore.size < MAX_COMMANDS) return;
  for (const [id, rec] of commandStore) {
    if (rec.status === 'running') continue;
    commandStore.delete(id);
    children.delete(id);
    if (commandStore.size < MAX_COMMANDS) return;
  }
}

function killChild(child, force = false) {
  if (!child || !child.pid) return;
  if (process.platform === 'win32') {
    try {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
    } catch (_) {}
    return;
  }
  const sig = force ? 'SIGKILL' : 'SIGTERM';
  try {
    process.kill(-child.pid, sig);
  } catch (_) {
    try { child.kill(sig); } catch (_) {}
  }
}

function workingDirFrom(cwd) {
  try {
    return resolveSafePath(cwd || '.');
  } catch (err) {
    throw new Error(`cwd "${cwd}" is outside workspace root.`);
  }
}

function scrubEnv(base) {
  const out = { ...base };
  for (const key of Object.keys(out)) {
    if (/(?:api[_-]?key|access[_-]?token|secret|password|credential|private[_-]?key)|^(?:github_token|gh_token|npm_token)$/i.test(key)) {
      delete out[key];
    }
  }
  return out;
}

function publicRecord(rec, tail) {
  const limit = Math.min(MAX_CAPTURE, Math.max(500, Number(tail) || 8000));
  const running = rec.status === 'running';
  return {
    execId: rec.execId,
    command: rec.command,
    status: rec.status,
    found: true,
    exitCode: rec.exitCode,
    signal: rec.signal,
    durationMs: rec.durationMs,
    isTimeout: rec.isTimeout || false,
    stdout: String(rec.stdout || '').slice(-limit),
    stderr: String(rec.stderr || '').slice(-limit),
    suggestedWaitMs: running ? rec.suggestedWaitMs : 0,
    hint: running ? 'Still running. Poll get_command_output with this execId.' : undefined,
    execution: rec.execution,
    outputCaptured: rec.outputCaptured,
    message: rec.message,
    ok: rec.ok
  };
}

function storePtyResult(result) {
  lastExecId = result.execId;
  const rec = {
    execId: result.execId,
    command: result.command,
    status: result.status || (result.ok === false ? 'error' : 'done'),
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    execution: 'pty',
    outputCaptured: result.outputCaptured,
    message: result.message,
    ok: result.ok,
    isTimeout: result.status === 'timeout'
  };
  commandStore.set(String(result.execId), rec);
  return rec;
}

function startProcess({ command, cwd = '.', timeoutSec = 30 }) {
  if (countRunning() >= MAX_RUNNING) {
    throw new ProtocolError('E_BAD_ARGS', `Too many running commands (max ${MAX_RUNNING}). Cancel or wait.`);
  }
  pruneCommands();
  const execId = crypto.randomBytes(8).toString('hex');
  lastExecId = execId;
  const workingDir = workingDirFrom(cwd);
  const timeoutMs = Math.max(1000, (timeoutSec || 30) * 1000);
  const startTime = Date.now();
  const rec = {
    execId,
    command,
    cwd: path.relative(config.workspaceRoot, workingDir) || '.',
    status: 'running',
    stdout: '',
    stderr: '',
    isTimeout: false,
    suggestedWaitMs: Math.min(4000, Math.max(800, Math.round(timeoutMs / 8)))
  };
  commandStore.set(String(execId), rec);

  eventBus.broadcast('command_started', {
    execId,
    command,
    cwd: rec.cwd,
    timestamp: new Date().toISOString()
  });

  const win = process.platform === 'win32';
  const shell = win ? 'powershell.exe' : '/bin/bash';
  const args = win
    ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command]
    : ['-c', command];
  const child = spawn(shell, args, {
    cwd: workingDir,
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { ...scrubEnv(process.env), CI: 'true', TERM: 'xterm-256color', FORCE_COLOR: '1' }
  });
  children.set(String(execId), child);
  const requestSignal = currentSignal();
  const abort = () => {
    if (rec.status !== 'running') return;
    rec.status = 'cancelled'; rec.ok = false;
    killChild(child);
    const force = setTimeout(() => { if (children.has(String(execId))) killChild(child, true); }, 2000);
    if (force.unref) force.unref();
  };
  if (requestSignal) {
    requestSignal.addEventListener('abort', abort, { once: true });
    if (requestSignal.aborted) abort();
  }

  const timer = setTimeout(() => {
    rec.isTimeout = true;
    killChild(child);
    const killer = setTimeout(() => {
      if (children.has(String(execId))) killChild(child, true);
    }, 2000);
    if (killer.unref) killer.unref();
  }, timeoutMs);
  if (timer.unref) timer.unref();

  const append = (field, chunk) => {
    rec[field] += chunk;
    if (rec[field].length > MAX_CAPTURE) rec[field] = rec[field].slice(-MAX_CAPTURE);
    eventBus.broadcast('command_output', { execId, stream: field, chunk });
  };

  child.stdout.on('data', (data) => append('stdout', data.toString()));
  child.stderr.on('data', (data) => append('stderr', data.toString()));

  const done = new Promise((resolve, reject) => {
    child.on('error', (err) => {
      if (requestSignal) requestSignal.removeEventListener('abort', abort);
      clearTimeout(timer);
      children.delete(String(execId));
      rec.durationMs = Date.now() - startTime;
      rec.stderr += err.message;
      if (rec.status === 'running') rec.status = 'error';
      eventBus.broadcast('command_finished', { execId, command, error: err.message, durationMs: rec.durationMs });
      reject(new Error(`Failed to start command: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      if (requestSignal) requestSignal.removeEventListener('abort', abort);
      clearTimeout(timer);
      children.delete(String(execId));
      rec.exitCode = code;
      rec.signal = signal;
      rec.durationMs = Date.now() - startTime;
      if (rec.status === 'running') rec.status = rec.isTimeout ? 'timeout' : (code === 0 ? 'done' : 'error');
      rec.ok = rec.status === 'done' && code === 0;
      eventBus.broadcast('command_finished', {
        execId,
        command,
        exitCode: code,
        durationMs: rec.durationMs,
        isTimeout: rec.isTimeout,
        status: rec.status
      });
      resolve(publicRecord(rec));
    });
  });

  return { rec, done };
}

async function executeCommand(opts) {
  checkCancelled();
  if (ptyJobs.wantsPty()) {
    pruneCommands();
    const result = await ptyJobs.enqueue('run', {
      command: (opts && opts.command) || '',
      cwd: (opts && opts.cwd) || '.',
      timeoutSec: (opts && opts.timeoutSec) || 30
    });
    const rec = storePtyResult(result);
    return publicRecord(rec);
  }
  const { done } = startProcess(opts || {});
  return done;
}

function startCommand(opts) {
  checkCancelled();
  if (ptyJobs.wantsPty()) {
    if (countRunning() >= MAX_RUNNING) {
      throw new ProtocolError('E_BAD_ARGS', `Too many running commands (max ${MAX_RUNNING}). Cancel or wait.`);
    }
    pruneCommands();
    const execId = crypto.randomBytes(8).toString('hex');
    lastExecId = execId;
    const timeoutMs = Math.max(1000, ((opts && opts.timeoutSec) || 30) * 1000);
    const rec = {
      execId,
      command: (opts && opts.command) || '',
      cwd: (opts && opts.cwd) || '.',
      status: 'running',
      stdout: '',
      stderr: '',
      execution: 'pty',
      suggestedWaitMs: Math.min(4000, Math.max(800, Math.round(timeoutMs / 8)))
    };
    commandStore.set(String(execId), rec);
    eventBus.broadcast('command_started', {
      execId,
      command: rec.command,
      cwd: rec.cwd,
      timestamp: new Date().toISOString()
    });
    ptyJobs.enqueue('run', {
      execId,
      command: rec.command,
      cwd: rec.cwd,
      timeoutSec: (opts && opts.timeoutSec) || 30,
      onChunk: (chunk, stream) => {
        const field = stream === 'stderr' ? 'stderr' : 'stdout';
        rec[field] += chunk;
        if (rec[field].length > MAX_CAPTURE) rec[field] = rec[field].slice(-MAX_CAPTURE);
        eventBus.broadcast('command_output', { execId, stream: field, chunk });
      }
    }).then((result) => {
      if (rec.status !== 'cancelled') rec.status = result.status || (result.ok === false ? 'error' : 'done');
      rec.ok = rec.status !== 'cancelled' && result.ok === true;
      rec.stdout = result.stdout != null ? result.stdout : rec.stdout;
      rec.stderr = result.stderr != null ? result.stderr : rec.stderr;
      rec.exitCode = result.exitCode;
      rec.durationMs = result.durationMs;
      rec.outputCaptured = result.outputCaptured;
      rec.message = result.message;
      rec.ok = result.ok;
      rec.isTimeout = result.status === 'timeout';
      eventBus.broadcast('command_finished', {
        execId,
        command: rec.command,
        exitCode: rec.exitCode,
        durationMs: rec.durationMs,
        status: rec.status
      });
    }).catch((err) => {
      if (rec.status === 'running') rec.status = 'error';
      rec.stderr = `${rec.stderr || ''}${err && err.message ? err.message : err}`;
    });
    return {
      execId: rec.execId,
      status: 'running',
      command: rec.command,
      suggestedWaitMs: rec.suggestedWaitMs,
      hint: 'Poll get_command_output until status is done or timeout. Desktop Chat runs this in Web Agent · 1.'
    };
  }
  const { rec, done } = startProcess(opts || {});
  done.catch((err) => {
    if (rec.status === 'running') rec.status = 'error';
    rec.stderr = `${rec.stderr || ''}${err.message}`;
  });
  return {
    execId: rec.execId,
    status: 'running',
    command: rec.command,
    suggestedWaitMs: rec.suggestedWaitMs,
    hint: 'Poll get_command_output until status is done or timeout.'
  };
}

function getCommandOutput({ execId, commandId, tail } = {}) {
  const id = String(execId || commandId || lastExecId);
  const rec = commandStore.get(id);
  if (!rec) {
    return { execId: id, found: false, message: 'No command with this execId yet.' };
  }
  return publicRecord(rec, tail);
}

async function cancelCommand({ execId } = {}) {
  const id = String(execId || '');
  const rec = commandStore.get(id);
  const child = children.get(id);
  if (ptyJobs.wantsPty()) {
    if (!rec) return { execId: id, found: false };
    if (rec.status !== 'running') {
      return { execId: rec.execId, status: rec.status, cancelled: false, message: 'Command is not running.' };
    }
    rec.status = 'cancelled';
    ptyJobs.cancelExec(id);
    try {
      await ptyJobs.enqueue('cancel', { execId: id });
    } catch (_) { /* plugin may already have exited */ }
    if (child) killChild(child, true);
    return { execId: rec.execId, cancelled: true, status: 'cancelled', execution: 'pty' };
  }
  if (!rec) return { execId: id, found: false };
  if (rec.status !== 'running') {
    return { execId: rec.execId, status: rec.status, cancelled: false, message: 'Command is not running.' };
  }
  rec.status = 'cancelled';
  if (child) killChild(child, true);
  return { execId: rec.execId, cancelled: true, status: 'cancelled' };
}

async function sendCommandInput({ execId, input } = {}) {
  if (ptyJobs.wantsPty()) {
    return ptyJobs.enqueue('input', { execId, input });
  }
  return {
    ok: false,
    execId,
    message: 'Interactive PTY is not enabled on this host. Commands are one-shot processes. Desktop Chat with the VS Code plugin can write stdin to a live terminal.',
    input
  };
}

function wait({ ms = 800 } = {}) {
  const delay = Math.min(15000, Math.max(0, Number(ms) || 800));
  return new Promise((resolve) => {
    setTimeout(() => resolve({ waitedMs: delay }), delay);
  });
}

module.exports = {
  executeCommand,
  startCommand,
  getCommandOutput,
  cancelCommand,
  sendCommandInput,
  wait,
  scrubEnv
};
