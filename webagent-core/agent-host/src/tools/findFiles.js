const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath } = require('./patchEngine');
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

  function walk(dir) {
    if (files.length >= maxResults) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(config.workspaceRoot, full).split(path.sep).join('/');
      if (isHidden(rel)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (re.test(rel) || re.test(entry.name) || glob === '**/*') {
        if (glob === '**/*' || re.test(rel) || re.test(entry.name)) {
          files.push(rel);
        }
      }
      if (files.length >= maxResults) return;
    }
  }

  const stat = fs.statSync(root);
  if (stat.isDirectory()) walk(root);
  else files.push(path.relative(config.workspaceRoot, root).split(path.sep).join('/'));

  return { glob, searchPath, total: files.length, files };
}

module.exports = { findFiles };
