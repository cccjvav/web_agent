const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath, isInsideWorkspace } = require('./patchEngine');
const { isHidden } = require('./sensitive');

function globToRegExp(glob) {
  const g = String(glob || '**/*').replace(/\\/g, '/');
  const escaped = g
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DS::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DS::/g, '.*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

function findFiles({ glob = '**/*', searchPath = '.', maxResults = 40 } = {}) {
  const root = resolveSafePath(searchPath);
  if (!fs.existsSync(root)) {
    throw new Error(`Path not found: "${searchPath}"`);
  }
  const re = globToRegExp(glob);
  const files = [];
  let truncated = false;
  const cap = Math.max(1, Math.min(200, Number(maxResults) || 40));

  function walk(dir) {
    if (truncated) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated) return;
      const full = path.join(dir, entry.name);
      if (!isInsideWorkspace(full)) continue;
      const rel = path.relative(config.workspaceRoot, full).split(path.sep).join('/');
      if (isHidden(rel)) continue;
      if (entry.isSymbolicLink && entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (glob === '**/*' || re.test(rel) || re.test(entry.name)) {
        if (files.length >= cap) {
          truncated = true;
          return;
        }
        files.push(rel);
      }
    }
  }

  const stat = fs.statSync(root);
  if (stat.isDirectory()) walk(root);
  else files.push(path.relative(config.workspaceRoot, root).split(path.sep).join('/'));

  return { glob, searchPath, total: files.length, files, truncated };
}

module.exports = { findFiles };
