const fs = require('fs');
const path = require('path');
const { config } = require('../../config');
const { resolveSafePath, computeHash } = require('./patchEngine');
const eventBus = require('../../utils/eventBus');

function readFile({ filePath, offset = 1, limit = 2000 }) {
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

  // 1-indexed offset
  const startIdx = Math.max(0, offset - 1);
  const endIdx = Math.min(allLines.length, startIdx + limit);
  const selectedLines = allLines.slice(startIdx, endIdx);

  // Format with line numbers like VS Code
  const formatted = selectedLines
    .map((line, idx) => `${startIdx + idx + 1}: ${line}`)
    .join('\n');

  eventBus.broadcast('file_read', {
    filePath,
    totalLines: allLines.length,
    offset,
    limit,
    hash
  });

  return {
    filePath,
    totalLines: allLines.length,
    offset,
    limit,
    hash,
    content: formatted
  };
}

function writeFile({ filePath, content }) {
  const fullPath = resolveSafePath(filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
  const hash = computeHash(content);

  eventBus.broadcast('file_written', {
    filePath,
    hash,
    size: content.length
  });

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
      // Ignore common non-essential dirs
      if (['node_modules', '.git', '.cache', 'dist', 'build'].includes(entry.name)) {
        continue;
      }

      const itemFullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(config.workspaceRoot, itemFullPath);

      if (entry.isDirectory()) {
        const item = {
          name: entry.name,
          path: relPath,
          type: 'directory'
        };
        if (recursive && currentDepth < maxDepth) {
          item.children = scan(itemFullPath, currentDepth + 1);
        }
        results.push(item);
      } else {
        const stat = fs.statSync(itemFullPath);
        results.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stat.size,
          mtime: stat.mtime
        });
      }
    }
    return results;
  }

  const items = scan(fullPath, 1);
  return {
    dirPath,
    items
  };
}

function grepSearch({ query, searchPath = '.', isRegex = false, caseSensitive = false }) {
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
          const relPath = path.relative(config.workspaceRoot, fullItemPath);

          lines.forEach((line, idx) => {
            if (pattern.test(line)) {
              matches.push({
                file: relPath,
                line: idx + 1,
                content: line.trim()
              });
              // Reset regex state if global
              pattern.lastIndex = 0;
            }
          });
        } catch (e) {
          // Ignore unreadable or binary files
        }
      }
    }
  }

  if (fs.statSync(fullPath).isDirectory()) {
    searchInDir(fullPath);
  } else {
    // Single file search
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const relPath = path.relative(config.workspaceRoot, fullPath);
    lines.forEach((line, idx) => {
      if (pattern.test(line)) {
        matches.push({
          file: relPath,
          line: idx + 1,
          content: line.trim()
        });
        pattern.lastIndex = 0;
      }
    });
  }

  return {
    query,
    totalMatches: matches.length,
    matches: matches.slice(0, 100) // cap to 100 results
  };
}

module.exports = {
  readFile,
  writeFile,
  listDir,
  grepSearch
};
