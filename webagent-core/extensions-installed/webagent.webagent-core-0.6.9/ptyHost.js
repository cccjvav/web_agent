'use strict';

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadNodePty() {
  const root = vscode.env && vscode.env.appRoot;
  if (!root) return null;
  const rels = [
    ['node_modules', 'node-pty'],
    ['node_modules.asar', 'node-pty']
  ];
  for (const rel of rels) {
    try {
      return require(path.join(root, ...rel));
    } catch (_) { /* try next */ }
  }
  return null;
}

function stripAnsi(s) {
  return String(s || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\r/g, '');
}

function scrubEnv(base) {
  const out = { ...(base || {}) };
  for (const key of Object.keys(out)) {
    if (/(?:api[_-]?key|access[_-]?token|secret|password|credential|private[_-]?key)|^(?:github_token|gh_token|npm_token)$/i.test(key)) {
      delete out[key];
    }
  }
  return out;
}

function spawnSpec(command) {
  const win = process.platform === 'win32';
  if (!win) {
    return { shell: process.env.SHELL || '/bin/bash', args: ['-lc', String(command || '')], cleanup: null };
  }
  const text = String(command || '');
  const needsFile = /[\r\n]/.test(text) || /[^\x00-\x7F]/.test(text) || text.length > 400;
  if (!needsFile) {
    return {
      shell: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', text],
      cleanup: null
    };
  }
  const file = path.join(os.tmpdir(), `webagent-pty-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
  fs.writeFileSync(file, text, 'utf8');
  return {
    shell: 'powershell.exe',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file],
    cleanup: file
  };
}

class PtyHost {
  constructor({ agentHostUrl, requestJson }) {
    this.agentHostUrl = agentHostUrl;
    this.requestJson = requestJson;
    this.allowSession = false;
    this.sessions = new Map();
    this.seen = new Set();
    this.polling = false;
    this.disposed = false;
    this.seq = 0;
  }

  start(context) {
    this.hello();
    this.helloTimer = setInterval(() => this.hello(), 3000);
    this.pollTimer = setInterval(() => this.poll().catch(() => {}), 400);
    if (this.helloTimer.unref) this.helloTimer.unref();
    if (this.pollTimer.unref) this.pollTimer.unref();
    context.subscriptions.push({ dispose: () => this.dispose() });
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.helloTimer);
    clearInterval(this.pollTimer);
    for (const s of this.sessions.values()) {
      try { if (s.proc && s.proc.kill) s.proc.kill(); } catch (_) {}
    }
    this.sessions.clear();
  }

  url(p) {
    return `${this.agentHostUrl()}${p}`;
  }

  async hello() {
    if (this.disposed) return;
    try {
      await this.requestJson('POST', this.url('/api/pty/hello'), { ok: true });
    } catch (_) { /* agent-host 可能还没起来 */ }
  }

  async poll() {
    if (this.disposed || this.polling) return;
    this.polling = true;
    try {
      const r = await this.requestJson('GET', this.url('/api/pty/jobs'));
      const list = (r.json && r.json.jobs) || [];
      for (const job of list) {
        await this.handleIncoming(job);
      }
    } catch (_) { /* 下一轮再试 */ } finally {
      this.polling = false;
    }
  }

  async postJob(jobId, body) {
    return this.requestJson('POST', this.url(`/api/pty/jobs/${jobId}`), body);
  }

  async confirm(command) {
    if (this.allowSession) return true;
    const preview = String(command || '').slice(0, 400);
    const pick = await vscode.window.showWarningMessage(
      `Web Agent 要在集成终端「Web Agent · 1」运行：\n${preview}`,
      { modal: true },
      '运行',
      '本会话都允许',
      '拒绝'
    );
    if (pick === '本会话都允许') {
      this.allowSession = true;
      return true;
    }
    return pick === '运行';
  }

  cwdFor(job) {
    const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
    const root = folder && folder.uri && folder.uri.fsPath;
    const rel = String(job.cwd || '.').replace(/\\/g, '/');
    if (!root) return process.cwd();
    if (!rel || rel === '.') return root;
    return path.join(root, rel);
  }

  async handleRun(job) {
    try {
      const accepted = await this.postJob(job.jobId, { state: 'accepted' });
      if (accepted.json && accepted.json.already) return;
      const allow = await this.confirm(job.command);
      if (!allow) {
        await this.postJob(job.jobId, {
          state: 'done',
          status: 'denied',
          message: 'User declined to run this command in the integrated terminal.'
        });
        return;
      }
      const cwd = this.cwdFor(job);
      this.spawn(job, cwd);
    } catch (err) {
      try {
        await this.postJob(job.jobId, {
          state: 'done',
          status: 'error',
          stderr: err && err.message ? err.message : String(err)
        });
      } catch (_) {}
    }
  }

  spawn(job, cwd) {
    const nodePty = loadNodePty();
    if (nodePty) {
      this.spawnNodePty(nodePty, job, cwd);
      return;
    }
    this.spawnFallback(job, cwd);
  }

  spawnNodePty(nodePty, job, cwd) {
    const spec = spawnSpec(job.command);
    const writeEmitter = new vscode.EventEmitter();
    const closeEmitter = new vscode.EventEmitter();
    this.seq += 1;
    const name = this.seq === 1 ? 'Web Agent · 1' : `Web Agent · ${this.seq}`;
    let buf = '';
    const proc = nodePty.spawn(spec.shell, spec.args, {
      cwd,
      cols: 120,
      rows: 30,
      env: { ...scrubEnv(process.env), TERM: 'xterm-256color', FORCE_COLOR: '1', CI: 'true' }
    });
    proc.onData((d) => {
      const chunk = String(d);
      buf += chunk;
      writeEmitter.fire(chunk.replace(/\n/g, '\r\n'));
      this.postJob(job.jobId, { state: 'progress', stdout: stripAnsi(chunk) }).catch(() => {});
    });
    const pty = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,
      open: () => {},
      close: () => {
        try { proc.kill(); } catch (_) {}
      },
      handleInput: (data) => {
        try { proc.write(data); } catch (_) {}
      }
    };
    const terminal = vscode.window.createTerminal({ name, pty });
    terminal.show(true);
    const session = { proc, terminal, writeEmitter, closeEmitter, buf: () => buf };
    this.sessions.set(String(job.execId), session);
    const timeoutMs = Math.max(1000, (Number(job.timeoutSec) || 30) * 1000);
    const killer = setTimeout(() => {
      try { proc.kill(); } catch (_) {}
    }, timeoutMs);
    proc.onExit(({ exitCode }) => {
      clearTimeout(killer);
      try { closeEmitter.fire(exitCode); } catch (_) {}
      this.sessions.delete(String(job.execId));
      if (spec.cleanup) {
        try { fs.unlinkSync(spec.cleanup); } catch (_) {}
      }
      this.postJob(job.jobId, {
        state: 'done',
        status: 'done',
        exitCode: exitCode == null ? 0 : exitCode,
        stdout: stripAnsi(buf),
        outputCaptured: true
      }).catch(() => {});
    });
  }

  spawnFallback(job, cwd) {
    const existing = vscode.window.terminals.find((t) => /^Web Agent/.test(t.name));
    const terminal = existing || vscode.window.createTerminal({ name: 'Web Agent · 1', cwd });
    terminal.show(true);
    const si = terminal.shellIntegration;
    if (si && typeof si.executeCommand === 'function') {
      const execution = si.executeCommand(String(job.command || ''));
      let buf = '';
      const run = async () => {
        try {
          if (execution && execution.read) {
            for await (const chunk of execution.read()) {
              buf += String(chunk);
              await this.postJob(job.jobId, { state: 'progress', stdout: stripAnsi(chunk) });
            }
          }
          const exitCode = execution && execution.exitCode ? await execution.exitCode : 0;
          await this.postJob(job.jobId, {
            state: 'done',
            status: 'done',
            exitCode: exitCode == null ? 0 : exitCode,
            stdout: stripAnsi(buf),
            outputCaptured: true
          });
        } catch (err) {
          await this.postJob(job.jobId, {
            state: 'done',
            status: 'error',
            stderr: err && err.message ? err.message : String(err)
          });
        }
      };
      run();
      return;
    }
    terminal.sendText(String(job.command || ''), true);
    this.postJob(job.jobId, {
      state: 'done',
      status: 'done',
      exitCode: 0,
      stdout: '(command sent to Web Agent · 1; output was not captured — look at the terminal)',
      outputCaptured: false
    }).catch(() => {});
  }

  async handleInput(job) {
    try {
      const accepted = await this.postJob(job.jobId, { state: 'accepted' });
      if (accepted.json && accepted.json.already) return;
      const session = this.sessions.get(String(job.execId));
      if (!session || !session.proc || typeof session.proc.write !== 'function') {
        await this.postJob(job.jobId, {
          state: 'done',
          status: 'error',
          ok: false,
          message: 'No live PTY for this execId (one-shot run_command has already exited, or fallback terminal cannot take stdin).'
        });
        return;
      }
      session.proc.write(String(job.input || ''));
      await this.postJob(job.jobId, { state: 'done', status: 'done', ok: true });
    } catch (err) {
      try {
        await this.postJob(job.jobId, {
          state: 'done',
          status: 'error',
          stderr: err && err.message ? err.message : String(err)
        });
      } catch (_) {}
    }
  }

  async handleIncoming(job) {
    if (!job || !job.jobId) return;
    if (this.seen.has(job.jobId)) return;
    this.seen.add(job.jobId);
    if (this.seen.size > 400) {
      const first = this.seen.values().next().value;
      this.seen.delete(first);
    }
    const kind = job.kind || 'run';
    if (kind === 'input') return this.handleInput(job);
    if (kind === 'cancel') return this.handleCancel(job);
    return this.handleRun(job);
  }

  async handleCancel(job) {
    try {
      await this.postJob(job.jobId, { state: 'accepted' });
      const session = this.sessions.get(String(job.execId));
      if (session && session.proc && session.proc.kill) {
        try { session.proc.kill(); } catch (_) {}
      }
      await this.postJob(job.jobId, { state: 'done', status: 'done', ok: true });
    } catch (_) {}
  }
}

function startPtyHost(context, deps) {
  try {
    const host = new PtyHost(deps);
    host.start(context);
    return host;
  } catch (err) {
    console.warn('Web Agent PTY host not started:', err && err.message);
    return null;
  }
}

module.exports = { startPtyHost, PtyHost, loadNodePty, stripAnsi, scrubEnv, spawnSpec };
