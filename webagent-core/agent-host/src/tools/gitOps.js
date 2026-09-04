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
  const r = spawnSync('git', ['-c', 'color.ui=never', ...args], {
    cwd: config.workspaceRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 512 * 1024
  });
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
    const porcelain = git(['status', '--porcelain=v1', '-b']);
    const lines = porcelain.split('\n').filter(Boolean);
    const summary = lines[0] || '';
    const branch = (summary.match(/##\s+([^\s.]+)/) || [])[1] || 'HEAD';
    const files = lines
      .filter((l) => !l.startsWith('##'))
      .slice(0, 80)
      .map((line) => ({
        code: line.slice(0, 2),
        path: line.slice(3)
      }));
    return {
      ok: true,
      available: true,
      git: true,
      branch,
      dirty: files.length > 0,
      summary,
      files,
      truncated: files.length === 80
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
    const args = ['diff'];
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
