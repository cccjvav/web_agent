const { spawnSync } = require('child_process');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('./patchEngine');
const { ExecutionError } = require('../mcp/errors');

function notGitResult(extra = {}) {
  return {
    ok: true,
    available: false,
    git: false,
    branch: null,
    dirty: false,
    files: [],
    summary: '',
    truncated: false,
    hint: 'This folder is not a git working copy (or git is not installed). Other tools still work. Do not run git init unless the user asked.',
    ...extra
  };
}

function git(args, timeoutMs = 8000) {
  const started = Date.now();
  const baseArgs = ['--no-optional-locks', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'color.ui=never'];
  const options = { cwd: config.workspaceRoot, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 512 * 1024 };
  // Reading config does not execute drivers. Disable every configured filter before reading worktree data.
  let r = spawnSync('git', [...baseArgs, 'config', '--null', '--name-only', '--get-regexp', '^filter\\..*\\.(clean|smudge|process|required)$'], options);
  if (!r.error && (r.status === 0 || r.status === 1)) {
    const drivers = new Set((r.stdout || '').split('\0').filter(Boolean).map(key => key.replace(/\.(clean|smudge|process|required)$/, '')));
    const overrides = [];
    for (const driver of drivers) {
      for (const action of ['clean', 'smudge', 'process']) overrides.push('-c', driver + '.' + action + '=');
      overrides.push('-c', driver + '.required=false');
    }
    r = spawnSync('git', [...baseArgs, ...overrides, ...args], { ...options, timeout: Math.max(1, timeoutMs - (Date.now() - started)) });
  }
  if (r.error) {
    const err = new Error(`GIT_UNAVAILABLE: git failed to start: ${r.error.message}`);
    err.code = 'GIT_UNAVAILABLE';
    if (r.error.code === 'ENOENT' || /ENOENT|not found/i.test(String(r.error.message))) {
      throw err;
    }
    throw new ExecutionError('E_INTERNAL', `git failed to start: ${r.error.message}`);
  }
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  if (r.status !== 0) {
    const msg = (stderr || stdout || `git exit ${r.status}`).trim();
    if (
      r.status === 127 ||
      /not a git repository/i.test(msg) ||
      /command not found|is not recognized/i.test(msg)
    ) {
      const err = new Error(
        /not a git repository/i.test(msg)
          ? 'GIT_UNAVAILABLE: workspace is not a git repository'
          : `GIT_UNAVAILABLE: ${msg.slice(0, 200)}`
      );
      err.code = 'GIT_UNAVAILABLE';
      throw err;
    }
    throw new ExecutionError('E_INTERNAL', msg.slice(0, 800));
  }
  return stdout;
}

function gitStatus() {
  try {
    const porcelain = git(['status', '--porcelain=v1', '-z', '-b']);
    const records = porcelain.split('\0');
    const summary = records.shift() || '';
    const branchText = summary.replace(/^## (?:No commits yet on |Initial commit on )?/, '');
    const branch = (branchText.match(/^(\S+?)(?:\.\.\.|\s|$)/) || [])[1] || 'HEAD';
    const entries = [];
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record) continue;
      const entry = { code: record.slice(0, 2), path: record.slice(3) };
      // Porcelain -z emits rename destination first, then a separate source record.
      if (/[RC]/.test(entry.code)) entry.originalPath = records[++i];
      entries.push(entry);
    }
    const files = entries.slice(0, 80);
    return {
      ok: true,
      available: true,
      git: true,
      branch,
      dirty: files.length > 0,
      summary,
      files,
      truncated: entries.length > 80
    };
  } catch (err) {
    if (err.code === 'GIT_UNAVAILABLE' || /GIT_UNAVAILABLE/.test(err.message || '')) {
      return notGitResult();
    }
    throw err;
  }
}

function gitDiff({ filePath, staged = false, stat = false } = {}) {
  try {
    const args = ['diff', '--no-ext-diff', '--no-textconv'];
    if (staged) args.push('--cached');
    if (stat) args.push('--stat');
    args.push('--');
    if (filePath) {
      const full = resolveSafePath(filePath);
      args.push(path.relative(config.workspaceRoot, full) || '.');
    }
    const raw = git(args);
    const lines = raw.split('\n');
    const max = stat ? 80 : 200;
    return {
      ok: true,
      available: true,
      git: true,
      filePath: filePath || '.',
      staged: Boolean(staged),
      totalLines: lines.length,
      diff: lines.slice(0, max).join('\n'),
      truncated: lines.length > max
    };
  } catch (err) {
    if (err.code === 'GIT_UNAVAILABLE' || /GIT_UNAVAILABLE/.test(err.message || '')) {
      return notGitResult({ filePath: filePath || '.', staged: Boolean(staged), diff: '', totalLines: 0 });
    }
    throw err;
  }
}

module.exports = { gitStatus, gitDiff };
