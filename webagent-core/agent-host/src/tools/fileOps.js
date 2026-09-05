const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath, isInsideWorkspace, computeHash, toPosixRel } = require('./patchEngine');
const { isHidden } = require('./sensitive');
const eventBus = require('../utils/eventBus');
const { ProtocolError, ExecutionError } = require('../mcp/errors');
const { rememberHash, sessionHash, forgetHash } = require('./readCache');

const MAX_GREP_QUERY = 200;
const MAX_GREP_REGEX = 120;
const MAX_GREP_FILE_BYTES = 1.5 * 1024 * 1024;
const MAX_GREP_SCAN_FILES = 800;
const MAX_GREP_COLLECT = 2000;

function readFiles({ filePath, paths, offset = 1, limit = 400 } = {}) {
  const list = [];
  if (Array.isArray(paths) && paths.length) list.push(...paths);
  if (filePath) list.push(filePath);
  if (!list.length) {
    throw new Error('read_files requires filePath or paths[]');
  }
  if (list.length === 1) return readFile({ filePath: list[0], offset, limit });
  return {
    files: list.map((p) => {
      try {
        return readFile({ filePath: p, offset, limit });
      } catch (err) {
        return { filePath: p, error: err.message };
      }
    })
  };
}

function readFile({ filePath, offset = 1, limit = 400 }) {
  const fullPath = resolveSafePath(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: "${filePath}"`);
  }

  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    throw new Error(`Path "${filePath}" is a directory, use list_dir instead.`);
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const hash = computeHash(content);
  const allLines = content.split(/\r?\n/);

  const startIdx = Math.max(0, offset - 1);
  const endIdx = Math.min(allLines.length, startIdx + limit);
  const selectedLines = allLines.slice(startIdx, endIdx);

  const formatted = selectedLines
    .map((line, idx) => `${startIdx + idx + 1}: ${line}`)
    .join('\n');

  eventBus.broadcast('file_read', { filePath, totalLines: allLines.length, offset, limit, hash });
  rememberHash(filePath, hash);

  return {
    filePath,
    totalLines: allLines.length,
    offset,
    limit,
    hash,
    content: formatted
  };
}

function deleteFile({ filePath, confirm = false }) {
  if (!filePath) throw new Error('delete_file requires filePath');
  const fullPath = resolveSafePath(filePath);
  const rel = toPosixRel(path.relative(config.workspaceRoot, fullPath));
  if (!rel || rel === '.') {
    throw new Error('Refusing to delete the workspace root.');
  }
  if (!confirm) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `Delete blocked for ${filePath}: pass confirm=true after listing the path.`,
      { filePath, retryHint: `Retry delete_file with { filePath: ${JSON.stringify(filePath)}, confirm: true }` }
    );
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: "${filePath}"`);
  }
  const stat = fs.statSync(fullPath);
  if (stat.isDirectory()) {
    const leftover = fs.readdirSync(fullPath);
    if (leftover.length) {
      throw new Error(`Directory "${filePath}" is not empty. Delete files first.`);
    }
    fs.rmdirSync(fullPath);
  } else {
    fs.unlinkSync(fullPath);
  }
  eventBus.broadcast('file_deleted', { filePath: rel });
  forgetHash(rel);
  forgetHash(filePath);
  return { success: true, filePath: rel, type: stat.isDirectory() ? 'directory' : 'file' };
}

function renameFile({ from, to, filePath, dest }) {
  const srcRel = from || filePath;
  const destRel = to || dest;
  if (!srcRel || !destRel) throw new Error('rename_file requires from and to');
  const src = resolveSafePath(srcRel);
  const dst = resolveSafePath(destRel);
  if (!fs.existsSync(src)) throw new Error(`File not found: "${srcRel}"`);
  if (fs.existsSync(dst)) throw new Error(`Destination already exists: "${destRel}"`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.renameSync(src, dst);
  const fromOut = toPosixRel(path.relative(config.workspaceRoot, src));
  const toOut = toPosixRel(path.relative(config.workspaceRoot, dst));
  eventBus.broadcast('file_renamed', { from: fromOut, to: toOut });
  return { success: true, from: fromOut, to: toOut };
}

function writeFile({ filePath, content, expectedHash, confirmOverwrite = false, confirm_overwrite = false }) {
  const fullPath = resolveSafePath(filePath);
  const exists = fs.existsSync(fullPath);
  let overwriteOk = Boolean(confirmOverwrite || confirm_overwrite);
  let currentHash = null;
  if (exists) {
    const current = fs.readFileSync(fullPath, 'utf8');
    currentHash = computeHash(current);
    const seenThisSession = sessionHash(filePath);
    if (!overwriteOk && expectedHash && expectedHash === currentHash) overwriteOk = true;
    if (!overwriteOk && seenThisSession && seenThisSession === currentHash) overwriteOk = true;
    if (!overwriteOk) {
      throw new ProtocolError(
        'E_BAD_ARGS',
        `Overwrite blocked for ${filePath}: pass confirm_overwrite=true after reading the file. Prefer apply_patch for existing files.`,
        {
          filePath,
          currentHash,
          retryHint: `Retry write_file with confirm_overwrite=true, or apply_patch with expectedHash=${currentHash}`
        }
      );
    }
    if (expectedHash && expectedHash !== currentHash) {
      throw new ExecutionError(
        'E_STALE_FILE',
        `STALE_FILE ${filePath}: expectedHash ${expectedHash} does not match. Re-read the file.`,
        { filePath, currentHash, retryHint: `Re-run read_files then retry. currentHash=${currentHash}` }
      );
    }
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const tmpPath = `${fullPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.renameSync(tmpPath, fullPath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw err;
  }
  const hash = computeHash(content);

  eventBus.broadcast('file_written', { filePath, hash, size: content.length });
  rememberHash(filePath, hash);

  return {
    success: true,
    filePath,
    size: content.length,
    hash
  };
}

function listDir({ dirPath = '.', recursive = false, maxDepth = 3 }) {
  const fullPath = resolveSafePath(dirPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Directory not found: "${dirPath}"`);
  }

  function scan(currentPath, currentDepth) {
    if (currentDepth > maxDepth) return [];
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      const itemFullPath = path.join(currentPath, entry.name);
      if (!isInsideWorkspace(itemFullPath)) continue;
      const relPath = toPosixRel(path.relative(config.workspaceRoot, itemFullPath));
      if (isHidden(relPath)) continue;
      if (entry.isSymbolicLink && entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        const item = { name: entry.name, path: relPath, type: 'directory' };
        if (recursive && currentDepth < maxDepth) {
          item.children = scan(itemFullPath, currentDepth + 1);
        }
        results.push(item);
      } else {
        const stat = fs.statSync(itemFullPath);
        results.push({ name: entry.name, path: relPath, type: 'file', size: stat.size, mtime: stat.mtime });
      }
    }
    return results;
  }

  const items = scan(fullPath, 1);
  return { dirPath, items };
}

function grepFile(fullItemPath, pattern, matches) {
  const relPath = toPosixRel(path.relative(config.workspaceRoot, fullItemPath));
  const stat = fs.statSync(fullItemPath);
  if (stat.size > MAX_GREP_FILE_BYTES) return 'large';
  const buf = fs.readFileSync(fullItemPath);
  if (buf.includes(0)) return 'binary';
  const lines = buf.toString('utf8').split(/\r?\n/);
  for (let idx = 0; idx < lines.length; idx++) {
    if (matches.length >= MAX_GREP_COLLECT) return 'ok';
    if (pattern.test(lines[idx])) {
      matches.push({ file: relPath, line: idx + 1, content: lines[idx].trim().slice(0, 400) });
      pattern.lastIndex = 0;
    }
  }
  return 'ok';
}

function grepSearch({ query, searchPath = '.', isRegex = false, caseSensitive = false, limit = 20, cursor = 0 } = {}) {
  const q = String(query == null ? '' : query);
  if (!q) {
    throw new ProtocolError('E_BAD_ARGS', 'search_files requires a non-empty query.');
  }
  if (q.length > MAX_GREP_QUERY) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `query is too long (${q.length} > ${MAX_GREP_QUERY}). Narrow the pattern.`
    );
  }
  if (isRegex && q.length > MAX_GREP_REGEX) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `regex query is too long (${q.length} > ${MAX_GREP_REGEX}).`
    );
  }

  const fullPath = resolveSafePath(searchPath);
  let pattern;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = isRegex
      ? new RegExp(q, flags)
      : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch (err) {
    throw new Error(`Invalid regex pattern: ${err.message}`);
  }

  const matches = [];
  let scannedFiles = 0;
  let skippedLarge = 0;
  let skippedBinary = 0;
  let truncated = false;

  function noteSkip(kind) {
    if (kind === 'large') skippedLarge += 1;
    else if (kind === 'binary') skippedBinary += 1;
  }

  function searchInDir(dir) {
    if (truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const fullItemPath = path.join(dir, entry.name);
      if (!isInsideWorkspace(fullItemPath)) continue;
      const relHidden = toPosixRel(path.relative(config.workspaceRoot, fullItemPath));
      if (isHidden(relHidden)) continue;
      if (entry.isSymbolicLink && entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        searchInDir(fullItemPath);
      } else if (entry.isFile()) {
        if (scannedFiles >= MAX_GREP_SCAN_FILES || matches.length >= MAX_GREP_COLLECT) {
          truncated = true;
          return;
        }
        scannedFiles += 1;
        try {
          noteSkip(grepFile(fullItemPath, pattern, matches));
        } catch (_) {}
        if (matches.length >= MAX_GREP_COLLECT) truncated = true;
      }
    }
  }

  const startStat = fs.statSync(fullPath);
  if (startStat.isDirectory()) {
    searchInDir(fullPath);
  } else {
    scannedFiles = 1;
    try {
      noteSkip(grepFile(fullPath, pattern, matches));
    } catch (_) {}
  }

  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const start = Math.max(0, Number(cursor) || 0);
  const page = matches.slice(start, start + pageSize);
  const nextCursor = start + page.length < matches.length ? start + page.length : null;
  return {
    query: q,
    totalMatches: matches.length,
    matches: page,
    cursor: start,
    nextCursor,
    scannedFiles,
    skippedLarge,
    skippedBinary,
    truncated
  };
}

module.exports = {
  readFile,
  readFiles,
  writeFile,
  deleteFile,
  renameFile,
  listDir,
  grepSearch
};
