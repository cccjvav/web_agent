const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { resolveSafePath, isInsideWorkspace } = require('./patchEngine');
const { isHidden } = require('./sensitive');
const { ProtocolError } = require('../mcp/errors');

// Glob matching without a backtracking regex. The previous translation turned every "**/" into
// "(?:.*/)?" and ran it as a RegExp on the main thread: twelve "**/" in one glob against a deep
// path took ~100 s (roughly x3 per extra "**/"), freezing MCP, the workbench and heartbeats. Tokens
// keep the old semantics exactly -- "**/" = zero or more leading directories, "**" = any characters
// including "/", "*" = any characters except "/", "?" = one character except "/", everything else
// literal -- and matchGlob is a dynamic program costing O(tokens x path length), never exponential.
const MAX_GLOB_LENGTH = 256;
const LIT = 0, ANY1 = 1, STAR = 2, GLOBSTAR = 3, DSDIR = 4;

function compileGlob(glob) {
  const g = String(glob || '**/*').replace(/\\/g, '/');
  // Same precedence as the old chained replaces: every "**/" first (left-to-right, non-overlapping,
  // so "***/" is "*" then "**/"), then "**" in what is left, then single characters.
  const tokens = [];
  g.split('**/').forEach((piece, i) => {
    if (i > 0) tokens.push([DSDIR]);
    piece.split('**').forEach((part, k) => {
      if (k > 0) tokens.push([GLOBSTAR]);
      for (const ch of part.split('')) tokens.push(ch === '*' ? [STAR] : ch === '?' ? [ANY1] : [LIT, ch]);
    });
  });
  return tokens;
}

// next[j]: tokens after i match text from j. cur[j]: tokens from i match text from j.
// dsdir[j]: from j, consume any characters then a "/" and let the rest match right after it.
function matchGlob(tokens, text) {
  const n = text.length;
  let next = new Uint8Array(n + 1);
  next[n] = 1; // the empty pattern matches only the end of the text
  for (let i = tokens.length - 1; i >= 0; i--) {
    const [kind, ch] = tokens[i];
    const cur = new Uint8Array(n + 1);
    let dsdir = 0;
    for (let j = n; j >= 0; j--) {
      const c = j < n ? text[j] : '';
      if (kind === LIT) cur[j] = j < n && c === ch && next[j + 1] ? 1 : 0;
      else if (kind === ANY1) cur[j] = j < n && c !== '/' && next[j + 1] ? 1 : 0;
      else if (kind === STAR) cur[j] = next[j] || (j < n && c !== '/' && cur[j + 1]) ? 1 : 0;
      else if (kind === GLOBSTAR) cur[j] = next[j] || (j < n && cur[j + 1]) ? 1 : 0;
      else {
        dsdir = j < n && ((c === '/' && next[j + 1]) || dsdir) ? 1 : 0;
        cur[j] = next[j] || dsdir ? 1 : 0;
      }
    }
    next = cur;
  }
  return next[0] === 1;
}

function findFiles({ glob = '**/*', searchPath = '.', maxResults = 40 } = {}) {
  const root = resolveSafePath(searchPath);
  if (!fs.existsSync(root)) {
    throw new Error(`Path not found: "${searchPath}"`);
  }
  if (String(glob || '').length > MAX_GLOB_LENGTH) {
    throw new ProtocolError('E_BAD_ARGS', `glob is too long (> ${MAX_GLOB_LENGTH} characters). Narrow the pattern.`);
  }
  const tokens = compileGlob(glob);
  const files = [];
  let truncated = false, visited = 0;
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
      if (++visited > 10000) { truncated = true; return; }
      const full = path.join(dir, entry.name);
      if (!isInsideWorkspace(full)) continue;
      const rel = path.relative(config.workspaceRoot, full).split(path.sep).join('/');
      if (isHidden(rel)) continue;
      if (entry.isSymbolicLink && entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (glob === '**/*' || matchGlob(tokens, rel) || matchGlob(tokens, entry.name)) {
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

module.exports = { findFiles, compileGlob, matchGlob, MAX_GLOB_LENGTH };
