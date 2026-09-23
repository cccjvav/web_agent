const { scrubEnv, sliceTextTail } = require('../../../extension/ptyPolicy');
const { spawn, spawnSync } = require('child_process');
const { StringDecoder } = require('string_decoder');
const crypto = require('crypto');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { resolveSafePath } = require('./patchEngine');
const { ProtocolError } = require('../mcp/errors');
const ptyJobs = require('./ptyJobs');
const { currentSignal, checkCancelled } = require('../utils/requestScope');

const commandStore = new Map();
const children = new Map();
const MAX_CAPTURE = 200 * 1024;
const MAX_RUNNING = 8;
const MAX_COMMANDS = 40;

function commandOwner(options = {}) {
  if (options.remote && !options.callerKey) throw new ProtocolError('E_SESSION_REQUIRED', 'Remote command access requires an authenticated caller key');
  return String(options.callerKey || 'local');
}

function lastCommandId(owner) {
  return [...commandStore.values()].reverse().find(record => record.owner === owner)?.execId || '';
}

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
      const result = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true, timeout: 3000, encoding: 'utf8', maxBuffer: 64 * 1024
      });
      if (result.error || result.status !== 0) {
        // Root termination is sufficient once commandJob has attached; its OS job closes descendants.
        try { child.kill('SIGKILL'); } catch (_) {}
      }
      if (result.error || result.status !== 0 || process.env.WEBAGENT_DEBUG_PROCESS === '1') {
        console.error('taskkill result', JSON.stringify({ pid: child.pid, status: result.status,
          error: result.error && result.error.code, stdout: String(result.stdout || '').slice(-600),
          stderr: String(result.stderr || '').slice(-600) }));
      }
    } catch (err) {
      console.error('taskkill failed:', err.message);
      try { child.kill('SIGKILL'); } catch (_) {}
    }
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
    stdout: sliceTextTail(rec.stdout, limit),
    stderr: sliceTextTail(rec.stderr, limit),
    suggestedWaitMs: running ? rec.suggestedWaitMs : 0,
    hint: running ? 'Still running. Poll get_command_output with this execId.' : undefined,
    execution: rec.execution,
    outputCaptured: rec.outputCaptured,
    message: rec.message,
    ok: rec.ok
  };
}

function storePtyResult(result, owner) {
  const rec = {
    execId: result.execId,
    owner,
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

function startProcess({ command, cwd = '.', timeoutSec = 30 }, owner) {
  if (countRunning() >= MAX_RUNNING) {
    throw new ProtocolError('E_BAD_ARGS', `Too many running commands (max ${MAX_RUNNING}). Cancel or wait.`);
  }
  pruneCommands();
  const execId = crypto.randomBytes(8).toString('hex');
  const workingDir = workingDirFrom(cwd);
  const timeoutMs = Math.max(1000, (timeoutSec || 30) * 1000);
  const startTime = Date.now();
  const rec = {
    execId,
    owner,
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
  const jobSource = path.join(__dirname, 'commandJob.cs').replace(/'/g, "''");
  // Attach before user code may spawn descendants. If the host is killed while
  // taskkill is enumerating the tree, the OS job still terminates late children.
  //
  // Exit-code contract. powershell.exe -Command exits with the status of the LAST STATEMENT, so
  // the trailer must restore what the user's command meant; rec.ok/rec.status derive from it.
  //  1. A native program's real code survives: `node failing.js` exiting 3 is reported as 3, not
  //     collapsed to 1 (F62-17).
  //  2. A failing cmdlet still fails: `Get-Item missing.txt` sets $? = false but never touches
  //     $LASTEXITCODE. The F62 trailer `if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }` became
  //     the last statement with $? = true and turned every such failure into exit 0 — the host
  //     reported broken commands as successful (external review §5.4-1).
  //  3. Success exits 0, including a native program that exited 0 earlier in the script.
  // $__wa_ok is captured on the very next statement, before anything of ours can overwrite $?.
  // $LASTEXITCODE is reset first, so a value inherited from the Add-Type/Attach prologue can never
  // masquerade as the user's. A non-zero native code wins; otherwise $? decides. $LASTEXITCODE
  // holds the MOST RECENT native program's code, so `node fail.js; node ok.js` exits 0 (sh-like),
  // while `node fail.js; Write-Output done` keeps 3 — a cmdlet does not reset it. That stickiness
  // is kept from F62 on purpose: reporting that run as failed is the safer reading.
  const guardedCommand = `try { Add-Type -Path '${jobSource}' -ErrorAction Stop; [WebAgentCommandJob]::Attach() } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 };
$global:LASTEXITCODE = $null
${command}
$__wa_ok = $?
if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not $__wa_ok) { exit 1 }
exit 0`;
  const args = win
    ? ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', guardedCommand]
    : ['-c', command];
  const debug = process.env.WEBAGENT_DEBUG_PROCESS === '1';
  const traceStart = debug ? process.hrtime.bigint() : 0n;
  const child = spawn(shell, args, {
    cwd: workingDir,
    windowsHide: true,
    detached: process.platform !== 'win32',
    env: { ...scrubEnv(process.env), CI: 'true', TERM: 'xterm-256color', FORCE_COLOR: '1' }
  });
  children.set(String(execId), child);
  let spawned = false, exited = false, stdoutBytes = 0, stderrBytes = 0;
  const trace = (event, code = null) => {
    if (!debug) return;
    try {
      console.error('process lifecycle', JSON.stringify({kind:'command',event,pid:process.pid,childPid:child.pid || null,
        elapsedMs:Number((process.hrtime.bigint()-traceStart)/1000000n),spawned,exited,stdoutBytes,stderrBytes,
        exitCode:Number.isInteger(code) ? code : null}));
    } catch (_) { /* Diagnostics must not change command execution or cleanup. */ }
  };
  trace('created');
  if (debug) {
    child.once('spawn', () => { spawned = true; trace('spawn'); });
    child.once('exit', code => { exited = true; trace('exit', code); });
  }
  const requestSignal = currentSignal();
  const abort = () => {
    if (rec.status !== 'running') return;
    trace('cancel');
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
    trace('timeout');
    rec.isTimeout = true;
    killChild(child);
    const killer = setTimeout(() => {
      if (children.has(String(execId))) killChild(child, true);
    }, 2000);
    if (killer.unref) killer.unref();
  }, timeoutMs);
  if (timer.unref) timer.unref();

  const append = (field, chunk) => {
    if (!chunk) return;
    rec[field] += chunk;
    if (rec[field].length > MAX_CAPTURE) rec[field] = sliceTextTail(rec[field], MAX_CAPTURE);
    eventBus.broadcast('command_output', { execId, stream: field, chunk });
  };

  // Pipe chunk boundaries fall wherever the OS puts them, not on character boundaries. Decoding
  // each chunk independently with data.toString() turns any multi-byte character that straddles
  // two chunks into replacement characters -- a program printing Chinese one byte at a time came
  // back as pure U+FFFD. StringDecoder retains the incomplete tail bytes until the rest arrives,
  // so a character is only emitted once it is complete. One decoder per stream, since stdout and
  // stderr are independent byte streams and must not share partial state.
  const decoders = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };

  child.stdout.on('data', (data) => {
    if (debug) { const first = stdoutBytes === 0; stdoutBytes += data.length; if (first) trace('stdout-first'); }
    append('stdout', decoders.stdout.write(data));
  });
  child.stderr.on('data', (data) => {
    if (debug) { const first = stderrBytes === 0; stderrBytes += data.length; if (first) trace('stderr-first'); }
    append('stderr', decoders.stderr.write(data));
  });
  // Flush any trailing bytes of a truncated final character so they surface as a single
  // replacement char rather than being dropped silently.
  const flushDecoders = () => {
    for (const field of ['stdout', 'stderr']) append(field, decoders[field].end());
  };

  const done = new Promise((resolve, reject) => {
    child.on('error', (err) => {
      trace('error');
      flushDecoders();
      if (requestSignal) requestSignal.removeEventListener('abort', abort);
      clearTimeout(timer);
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) children.delete(String(execId));
      rec.durationMs = Date.now() - startTime;
      rec.stderr += err.message;
      if (rec.status === 'running') rec.status = 'error';
      eventBus.broadcast('command_finished', { execId, command, error: err.message, durationMs: rec.durationMs });
      reject(new Error(`Failed to start command: ${err.message}`));
    });
    child.on('close', (code, signal) => {
      trace('close', code);
      flushDecoders();
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

async function executeCommand(opts, options = {}) {
  checkCancelled();
  const owner = commandOwner(options);
  if (ptyJobs.wantsPty()) {
    pruneCommands();
    const result = await ptyJobs.enqueue('run', {
      command: (opts && opts.command) || '',
      cwd: (opts && opts.cwd) || '.',
      timeoutSec: (opts && opts.timeoutSec) || 30
    });
    const rec = storePtyResult(result, owner);
    return publicRecord(rec);
  }
  const { done } = startProcess(opts || {}, owner);
  return done;
}

function startCommand(opts, options = {}) {
  checkCancelled();
  const owner = commandOwner(options);
  if (ptyJobs.wantsPty()) {
    if (countRunning() >= MAX_RUNNING) {
      throw new ProtocolError('E_BAD_ARGS', `Too many running commands (max ${MAX_RUNNING}). Cancel or wait.`);
    }
    pruneCommands();
    const execId = crypto.randomBytes(8).toString('hex');
    const timeoutMs = Math.max(1000, ((opts && opts.timeoutSec) || 30) * 1000);
    const rec = {
      execId,
      owner,
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
        if (rec[field].length > MAX_CAPTURE) rec[field] = sliceTextTail(rec[field], MAX_CAPTURE);
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
  const { rec, done } = startProcess(opts || {}, owner);
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

function getCommandOutput({ execId, commandId, tail } = {}, options = {}) {
  const owner = commandOwner(options);
  const id = String(execId || commandId || lastCommandId(owner));
  const rec = commandStore.get(id);
  if (!rec || rec.owner !== owner) {
    return { execId: id, found: false, message: 'No command with this execId for this caller.' };
  }
  return publicRecord(rec, tail);
}

async function cancelCommand({ execId } = {}, options = {}) {
  const owner = commandOwner(options);
  const id = String(execId || '');
  const rec = commandStore.get(id);
  const child = children.get(id);
  if (!rec || rec.owner !== owner) return { execId: id, found: false };
  if (ptyJobs.wantsPty()) {
    if (rec.status !== 'running' && !child) {
      return { execId: rec.execId, status: rec.status, cancelled: false, message: 'Command is not running.' };
    }
    rec.status = 'cancelled';
    rec.ok = false;
    ptyJobs.cancelExec(id);
    try {
      await ptyJobs.enqueue('cancel', { execId: id });
    } catch (_) { /* plugin may already have exited */ }
    if (child) killChild(child, true);
    return { execId: rec.execId, cancelled: true, status: 'cancelled', execution: 'pty' };
  }
  if (rec.status !== 'running' && !child) {
    return { execId: rec.execId, status: rec.status, cancelled: false, message: 'Command is not running.' };
  }
  rec.status = 'cancelled';
  rec.ok = false;
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

function activeCount() { return Math.max(countRunning(), children.size); }

// Host shutdown: terminate every command this process started. POSIX children run detached in
// their own process group, so they do NOT receive the terminal's Ctrl+C and used to outlive the
// host as orphans (reproduced: `start_command sleep 300`, SIGINT to the host, the sleep kept
// running). Windows children are already bound to a kill-on-close OS job by commandJob, and
// killChild's taskkill /t covers the tree as well. Records are marked cancelled first so no
// late close handler reports them as a normal completion. Synchronous by design: it runs from
// the shutdown path, where only already-issued signals are guaranteed to take effect.
function stopAll() {
  let stopped = 0;
  for (const [id, child] of children) {
    const rec = commandStore.get(id);
    if (rec && rec.status === 'running') { rec.status = 'cancelled'; rec.ok = false; rec.message = 'Host shut down'; }
    killChild(child, true);
    stopped += 1;
  }
  return stopped;
}

module.exports = {
  activeCount,
  stopAll,
  executeCommand,
  startCommand,
  getCommandOutput,
  cancelCommand,
  sendCommandInput,
  wait,
  scrubEnv
};
