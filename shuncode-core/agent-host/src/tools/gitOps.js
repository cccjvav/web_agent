const { spawnSync } = require('child_process');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('./patchEngine');
const { ExecutionError } = require('../mcp/errors');

function git(args, timeoutMs = 8000) {
  const r = spawnSync('git', ['-c', 'color.ui=never', ...args], {
    cwd: config.workspaceRoot,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 512 * 1024
  });
  if (r.error) {
    throw new ExecutionError('E_INTERNAL', `git failed to start: ${r.error.message}`);
  }
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  if (r.status !== 0) {
    const msg = (stderr || stdout || `git exit ${r.status}`).trim();
    if (/not a git repository/i.test(msg)) {
      throw new ExecutionError('E_NOT_READY', 'Workspace is not inside a git repository.');
    }
    throw new ExecutionError('E_INTERNAL', msg.slice(0, 800));
  }
  return stdout;
}

function gitStatus() {
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
    branch,
    dirty: files.length > 0,
    summary,
    files,
    truncated: files.length === 80
  };
}

function gitDiff({ filePath, staged = false, stat = false } = {}) {
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
    filePath: filePath || '.',
    staged: Boolean(staged),
    totalLines: lines.length,
    diff: lines.slice(0, max).join('\n'),
    truncated: lines.length > max
  };
}

module.exports = { gitStatus, gitDiff };
