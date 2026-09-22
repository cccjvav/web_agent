const { spawnSync } = require('child_process');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('./patchEngine');
const { isSensitive, toPosix } = require('./sensitive');
const { ExecutionError } = require('../mcp/errors');

// Git is run with cwd = workspaceRoot, but Git itself always works on the whole repository.
// When the workspace root is a subdirectory of a larger checkout, an unscoped command would
// report files the rest of the tool surface refuses to touch. `-- .` limits every read to the
// current directory subtree; paths are still reported repository-relative, which is what the
// existing status/diff consumers already expect when root == repository root.
const SCOPE_PATHSPEC = ['--', '.'];

// Enumerating changed paths and then re-running the diff with an explicit allow-list keeps the
// default (path-less) diff under the same per-path sensitive rules as an explicit one. Renames
// contribute both sides, so a rename away from `.env` cannot expose the old content either.
const MAX_DIFF_PATHSPECS = 300;

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

// Porcelain always reports repository-relative paths. When the workspace root is the repository
// root (the ordinary case) the prefix is empty and nothing changes; for a nested root the prefix
// is stripped so reported paths stay usable with the other workspace-relative tools.
function workspacePrefix() {
  const raw = git(['rev-parse', '--show-prefix']).replace(/\r?\n$/, '');
  return raw ? toPosix(raw) : '';
}

function stripPrefix(prefix, repoPath) {
  const rel = toPosix(repoPath);
  if (!prefix) return rel;
  return rel.startsWith(prefix) ? rel.slice(prefix.length) : null;
}

function gitStatus() {
  try {
    const prefix = workspacePrefix();
    const porcelain = git(['status', '--porcelain=v1', '-z', '-b', ...SCOPE_PATHSPEC]);
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
      const scoped = stripPrefix(prefix, entry.path);
      // `-- .` already excludes out-of-scope files; this is a defensive second check.
      if (scoped == null) continue;
      entry.path = scoped;
      if (entry.originalPath != null) {
        const original = stripPrefix(prefix, entry.originalPath);
        if (original == null) delete entry.originalPath;
        else entry.originalPath = original;
      }
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

// Enumerate what the requested diff would touch, drop anything the per-path sensitive rules
// deny, and report both sides of a rename. Returns workspace-relative pathspecs.
function diffPathspecs(prefix, staged) {
  const args = ['diff', '-M', '--name-status', '-z', '--no-ext-diff', '--no-textconv'];
  if (staged) args.push('--cached');
  args.push(...SCOPE_PATHSPEC);
  const records = git(args).split('\0').filter((part) => part !== '');
  const allowed = [];
  const excluded = [];
  for (let i = 0; i < records.length; i++) {
    const code = records[i];
    // Rename/copy status records carry two names; every other status carries one.
    const sides = /^[RC]/.test(code) ? [records[++i], records[++i]] : [records[++i]];
    for (const side of sides) {
      if (side == null) continue;
      const scoped = stripPrefix(prefix, side);
      if (scoped == null || scoped === '') continue;
      if (isSensitive(scoped)) {
        if (!excluded.includes(scoped)) excluded.push(scoped);
        continue;
      }
      if (!allowed.includes(scoped)) allowed.push(scoped);
    }
  }
  return { allowed, excluded };
}

function gitDiff({ filePath, staged = false, stat = false } = {}) {
  try {
    const prefix = workspacePrefix();
    const args = ['diff', '--no-ext-diff', '--no-textconv'];
    if (staged) args.push('--cached');
    if (stat) args.push('--stat');
    // --relative keeps reported paths workspace-relative for a nested root and is a no-op at
    // the repository root.
    if (prefix) args.push('--relative');
    args.push('--');

    let excluded = [];
    let pathspecCapped = false;
    if (filePath) {
      // Explicit paths already pass resolveSafePath, which rejects sensitive and out-of-root
      // targets before anything is executed.
      const full = resolveSafePath(filePath);
      args.push(path.relative(config.workspaceRoot, full) || '.');
    } else {
      const scope = diffPathspecs(prefix, staged);
      excluded = scope.excluded;
      if (!scope.allowed.length) {
        return {
          ok: true,
          available: true,
          git: true,
          filePath: '.',
          staged: Boolean(staged),
          totalLines: 0,
          diff: '',
          truncated: false,
          ...(excluded.length ? { excludedSensitivePaths: excluded } : {})
        };
      }
      const capped = scope.allowed.slice(0, MAX_DIFF_PATHSPECS);
      pathspecCapped = capped.length < scope.allowed.length;
      args.push(...capped);
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
      truncated: lines.length > max || pathspecCapped,
      ...(excluded.length ? { excludedSensitivePaths: excluded } : {}),
      ...(pathspecCapped ? { pathspecLimit: MAX_DIFF_PATHSPECS } : {})
    };
  } catch (err) {
    if (err.code === 'GIT_UNAVAILABLE' || /GIT_UNAVAILABLE/.test(err.message || '')) {
      return notGitResult({ filePath: filePath || '.', staged: Boolean(staged), diff: '', totalLines: 0 });
    }
    throw err;
  }
}

module.exports = { gitStatus, gitDiff };
