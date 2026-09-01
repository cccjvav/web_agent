const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath, computeHash, toPosixRel } = require('./patchEngine');
const eventBus = require('../utils/eventBus');

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

  return {
    filePath,
    totalLines: allLines.length,
    offset,
    limit,
    hash,
    content: formatted
  };
}

function deleteFile({ filePath }) {
  if (!filePath) throw new Error('delete_file requires filePath');
  const fullPath = resolveSafePath(filePath);
  const rel = toPosixRel(path.relative(config.workspaceRoot, fullPath));
  if (!rel || rel === '.') {
    throw new Error('Refusing to delete the workspace root.');
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

function writeFile({ filePath, content }) {
  const fullPath = resolveSafePath(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  const hash = computeHash(content);

  eventBus.broadcast('file_written', { filePath, hash, size: content.length });

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
      if (['node_modules', '.git', '.cache', 'dist', 'build', '.local'].includes(entry.name)) {
        continue;
      }

      const itemFullPath = path.join(currentPath, entry.name);
      const relPath = toPosixRel(path.relative(config.workspaceRoot, itemFullPath));

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

function grepSearch({ query, searchPath = '.', isRegex = false, caseSensitive = false, limit = 20, cursor = 0 } = {}) {
  const fullPath = resolveSafePath(searchPath);
  let pattern;

  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = isRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch (err) {
    throw new Error(`Invalid regex pattern: ${err.message}`);
  }

  const matches = [];

  function searchInDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', '.cache', 'dist'].includes(entry.name)) continue;
      const fullItemPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        searchInDir(fullItemPath);
      } else if (entry.isFile()) {
        try {
          const content = fs.readFileSync(fullItemPath, 'utf8');
          const lines = content.split(/\r?\n/);
          const relPath = toPosixRel(path.relative(config.workspaceRoot, fullItemPath));
          lines.forEach((line, idx) => {
            if (pattern.test(line)) {
              matches.push({ file: relPath, line: idx + 1, content: line.trim() });
              pattern.lastIndex = 0;
            }
          });
        } catch (e) {}
      }
    }
  }

  if (fs.statSync(fullPath).isDirectory()) {
    searchInDir(fullPath);
  } else {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const relPath = toPosixRel(path.relative(config.workspaceRoot, fullPath));
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        matches.push({ file: relPath, line: idx + 1, content: line.trim() });
        pattern.lastIndex = 0;
      }
    });
  }

  const pageSize = Math.min(100, Math.max(1, Number(limit) || 20));
  const start = Math.max(0, Number(cursor) || 0);
  const page = matches.slice(start, start + pageSize);
  const nextCursor = start + page.length < matches.length ? start + page.length : null;
  return { query, totalMatches: matches.length, matches: page, cursor: start, nextCursor };
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
