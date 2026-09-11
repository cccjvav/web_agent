const { readBoundedText, MAX_TEXT_BYTES } = require('../utils/boundedFile');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { createUnifiedDiff } = require('../utils/diff');
const { assertNotSensitive } = require('./sensitive');
const { ProtocolError, ExecutionError } = require('../mcp/errors');
const { rememberHash, recalledHash } = require('./readCache');

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function tempSibling(fullPath) {
  return `${fullPath}.tmp.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;
}

/** Replace text without losing an existing executable's permissions; clean up on failure. */
function atomicWriteText(fullPath, content) {
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) throw new ProtocolError('E_BAD_ARGS', 'Result exceeds text file budget');
  if (fs.existsSync(fullPath)) fullPath = fs.realpathSync(fullPath); // Replace the checked target, not the symlink itself.
  const tmp = tempSibling(fullPath);
  const mode = fs.existsSync(fullPath) ? fs.statSync(fullPath).mode & 0o777 : null;
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx', ...(mode == null ? {} : { mode }) });
    if (mode != null) fs.chmodSync(tmp, mode);
    fs.renameSync(tmp, fullPath);
  } finally {
    try { fs.unlinkSync(tmp); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
}

function toPosixRel(p) {
  return String(p || '').replace(/\\/g, '/');
}

const writeLocks = new Map();

function writeLockKey(filePath) {
  const canonical = realPathOrJoin(resolveSafePath(filePath));
  return process.platform === 'win32' ? canonical.toLowerCase() : canonical;
}

function lockOne(key, fn) {
  const prev = writeLocks.get(key) || Promise.resolve();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => held, () => held);
  writeLocks.set(key, tail);
  return Promise.resolve(prev).catch(() => {}).then(async () => {
    try {
      return await fn();
    } finally {
      release();
      if (writeLocks.get(key) === tail) writeLocks.delete(key);
    }
  });
}

function withWriteLock(paths, fn) {
  const keys = [...new Set((Array.isArray(paths) ? paths : [paths]).map(writeLockKey))].sort();
  return keys.reduceRight((next, key) => () => lockOne(key, next), fn)();
}

function looksLikeUncOrDrive(relPath) {
  const raw = String(relPath || '');
  if (raw.includes('\0')) return true;
  const posix = raw.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(raw) || /^[a-zA-Z]:/.test(posix)) return true;
  if (posix.startsWith('//')) return true;
  return false;
}

function detectEol(text) {
  return String(text || '').includes('\r\n') ? '\r\n' : '\n';
}

function toLf(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function applyEol(text, eol) {
  const lf = toLf(text);
  if (eol === '\r\n') return lf.replace(/\n/g, '\r\n');
  return lf;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    n += 1;
    from = i + needle.length;
  }
  return n;
}

function replaceOccurrence(haystack, needle, replacement, occurrence) {
  let seen = 0;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) break;
    seen += 1;
    if (seen === occurrence) {
      return haystack.slice(0, i) + replacement + haystack.slice(i + needle.length);
    }
    from = i + needle.length;
  }
  return haystack;
}

function existingAncestor(absPath) {
  let cur = path.resolve(absPath);
  for (;;) {
    try {
      fs.lstatSync(cur);
      return cur;
    } catch (err) {
      if (err && err.code !== 'ENOENT') throw err;
      const parent = path.dirname(cur);
      if (parent === cur) return cur;
      cur = parent;
    }
  }
}

function realPathOrJoin(absPath) {
  const abs = path.resolve(absPath);
  const ancestor = existingAncestor(abs);
  const realAncestor = fs.existsSync(ancestor) ? fs.realpathSync(ancestor) : ancestor;
  if (ancestor === abs) return realAncestor;
  return path.resolve(realAncestor, path.relative(ancestor, abs));
}

function isInsideWorkspace(absPath) {
  const root = realPathOrJoin(path.resolve(config.workspaceRoot));
  const real = realPathOrJoin(absPath);
  const rel = path.relative(root, real);
  const posix = toPosixRel(rel);
  if (!posix || posix === '.') return true;
  return !(posix === '..' || posix.startsWith('../') || path.isAbsolute(rel));
}

function resolveSafePath(relPath) {
  if (looksLikeUncOrDrive(relPath)) {
    throw new Error(`Security error: path "${relPath}" is outside workspace root.`);
  }
  const root = path.resolve(config.workspaceRoot);
  const incoming = String(relPath || '.').replace(/[/\\]+/g, path.sep);
  if (process.platform === 'win32' && incoming.split(path.sep).some(part =>
    part !== '.' && part !== '..' && (part.includes(':') || /[. ]$/.test(part)))) {
    throw new ProtocolError('E_BAD_ARGS', 'Ambiguous Windows path component.');
  }
  const resolved = path.resolve(root, incoming);
  const rel = path.relative(root, resolved);
  const posix = toPosixRel(rel);
  if (posix === '..' || posix.startsWith('../') || path.isAbsolute(rel)) {
    throw new Error(`Security error: path "${relPath}" is outside workspace root.`);
  }
  if (!isInsideWorkspace(resolved)) {
    throw new Error(`Security error: path "${relPath}" is outside workspace root.`);
  }
  if (posix && posix !== '.') assertNotSensitive(posix);
  const real = realPathOrJoin(resolved);
  const realRel = toPosixRel(path.relative(realPathOrJoin(root), real));
  if (realRel && realRel !== '.') assertNotSensitive(realRel);
  return resolved;
}

function looksLikeUnifiedDiff(text) {
  const start = String(text || '').replace(/^\uFEFF/, '').replace(/^\s+/, '').slice(0, 400);
  if (start.startsWith('diff --git ')) return true;
  if (/^--- [^\n]+\r?\n\+\+\+ /m.test(start) && /@@/.test(String(text || ''))) return true;
  return false;
}

function looksLikeV4A(text) {
  const t = String(text || '').replace(/^\uFEFF/, '');
  return /\*{3}\s*Begin Patch\b/i.test(t)
    || /\*{3}\s*(Update File|Add File|Delete File|Move to)\b/i.test(t);
}

function rejectUnsupportedPatchFormat(filePath, patch, blocks) {
  if (blocks && blocks.length) return;
  if (!looksLikeV4A(patch)) return;
  throw new ProtocolError(
    'E_BAD_ARGS',
    `Patch for ${filePath} looks like Codex V4A (*** Begin Patch / Update File / Add File / Delete File / Move to). This host applies SEARCH/REPLACE, or unified diff on an existing file — not V4A, and not a multi-file patch in one call.`,
    {
      filePath,
      format: 'v4a',
      retryHint: 'Rewrite as <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE for this one filePath. Do not paste *** Begin Patch.'
    }
  );
}

function parseSearchReplaceBlocks(patchText) {
  const blocks = [];
  const regex = /<{5,}\s*SEARCH\r?\n([\s\S]*?)\r?\n?={5,}\r?\n([\s\S]*?)\r?\n>{5,}\s*REPLACE/g;
  let match;
  while ((match = regex.exec(patchText)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2]
    });
  }
  return blocks;
}

function applySearchBlocks(currentContent, blocks, { filePath, occurrence } = {}) {
  const eol = detectEol(currentContent);
  let patchedLf = toLf(currentContent);
  const occRaw = Number(occurrence);
  const occ = Number.isFinite(occRaw) && occRaw >= 1 ? Math.round(occRaw) : null;

  for (let i = 0; i < blocks.length; i++) {
    const searchLf = toLf(blocks[i].search);
    const replaceLf = toLf(blocks[i].replace);
    let needle = searchLf;
    let replacement = replaceLf;
    let n = countOccurrences(patchedLf, needle);
    if (n === 0 && searchLf.trim()) {
      needle = searchLf.trim();
      replacement = replaceLf.trim();
      n = countOccurrences(patchedLf, needle);
    }
    if (!needle) {
      throw new ProtocolError(
        'E_BAD_ARGS',
        `Patch conflict: SEARCH block #${i + 1} is empty; existing files need a unique SEARCH.`,
        { filePath, block: i + 1 }
      );
    }
    if (n === 0) {
      throw new Error(`Patch conflict: SEARCH block #${i + 1} could not be found in "${filePath}".`);
    }
    if (occ == null && n > 1) {
      throw new ExecutionError(
        'E_CONFLICT',
        `Patch conflict: SEARCH block #${i + 1} matched ${n} times in "${filePath}". Make the SEARCH unique, or pass occurrence (1-based).`,
        { filePath, block: i + 1, matches: n }
      );
    }
    const which = occ == null ? 1 : occ;
    if (which > n) {
      throw new Error(
        `Patch conflict: SEARCH block #${i + 1} matched ${n} times in "${filePath}", occurrence=${which} is out of range.`
      );
    }
    patchedLf = replaceOccurrence(patchedLf, needle, replacement, which);
  }
  return applyEol(patchedLf, eol);
}

async function applyPatch(opts = {}) {
  return withWriteLock(opts.filePath, () => applyPatchBody(opts));
}

async function applyPatchBody({ filePath, patch, expectedHash = null, dryRun = false, occurrence } = {}) {
  if (typeof patch === 'string' && Buffer.byteLength(patch, 'utf8') > MAX_TEXT_BYTES) throw new ProtocolError('E_BAD_ARGS', 'Patch exceeds text budget');
  if (typeof patch !== 'string') throw new ProtocolError('E_BAD_ARGS', 'patch must be a string.');
  const fullPath = resolveSafePath(filePath);
  const blocksEarly = parseSearchReplaceBlocks(patch);
  rejectUnsupportedPatchFormat(filePath, patch, blocksEarly);

  if (!fs.existsSync(fullPath)) {
    const blocks = blocksEarly;
    const emptySearchNew = blocks.length > 0 && String(blocks[0].search).trim() === '';
    if (looksLikeUnifiedDiff(patch) && !emptySearchNew) {
      throw new ProtocolError(
        'E_BAD_ARGS',
        `New file ${filePath}: this looks like a unified diff. Use SEARCH/REPLACE with an empty SEARCH, or pass the file body — do not paste a unified diff as the new file.`,
        {
          filePath,
          retryHint: 'Retry apply_patch with <<<<<<< SEARCH\\n=======\\n<body>\\n>>>>>>> REPLACE, or write_file with the file body.'
        }
      );
    }
    let newContent = patch;
    if (emptySearchNew) newContent = blocks[0].replace;

    if (dryRun) {
      return { success: true, isNewFile: true, filePath, message: 'Dry run check passed (New file)' };
    }

    await Promise.resolve();
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, newContent, 'utf8');

    const diffInfo = createUnifiedDiff(filePath, '', newContent);
    eventBus.broadcast('file_patched', {
      filePath,
      isNewFile: true,
      diff: diffInfo.patch,
      additions: diffInfo.additions,
      deletions: diffInfo.deletions,
      newHash: computeHash(newContent)
    });

    const newHash = computeHash(newContent);
    rememberHash(filePath, newHash);
    return {
      success: true,
      isNewFile: true,
      filePath,
      newHash,
      diffSummary: `+${diffInfo.additions} -0`
    };
  }

  const currentContent = readBoundedText(fullPath);
  const currentHash = computeHash(currentContent);
  if (!expectedHash) {
    const remembered = recalledHash(filePath);
    if (remembered) expectedHash = remembered;
  }

  if (!expectedHash && !dryRun) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `HASH_REQUIRED ${filePath}: pass expectedHash from the last read_files (sha256) before patching an existing file. New files may omit it. dryRun may omit it.`,
      {
        filePath,
        currentHash,
        retryHint: `Retry apply_patch with expectedHash=${currentHash}`
      }
    );
  }

  if (expectedHash && currentHash !== expectedHash) {
    throw new ExecutionError(
      'E_STALE_FILE',
      `STALE_FILE: file changed since last read. Re-run read_files for a fresh sha256. expected=${expectedHash} current=${currentHash}`,
      { filePath, expectedHash, currentHash, retryHint: `Re-run read_files then apply_patch with expectedHash=${currentHash}` }
    );
  }

  let patchedContent = currentContent;
  const blocks = blocksEarly;
  const eol = detectEol(currentContent);

  if (blocks.length > 0) {
    patchedContent = applySearchBlocks(currentContent, blocks, { filePath, occurrence });
  } else if (looksLikeUnifiedDiff(patch) || /^--- |^\+\+\+ |^@@/m.test(patch)) {
    const jsdiff = require('diff');
    let parsed;
    try {
      parsed = jsdiff.parsePatch(toLf(patch).replace(/^\uFEFF/, '').trimStart());
    } catch (err) {
      throw new ProtocolError('E_BAD_ARGS', `Invalid unified diff: ${err.message}`);
    }
    if (parsed.length !== 1 || !parsed[0].hunks || !parsed[0].hunks.length
        || parsed[0].oldFileName === '/dev/null' || parsed[0].newFileName === '/dev/null') {
      throw new ProtocolError('E_BAD_ARGS', 'Expected one unified diff for a single existing file with hunks.');
    }
    const applied = jsdiff.applyPatch(toLf(currentContent), parsed[0]);
    if (applied === false) {
      throw new Error(`Unified diff failed to apply cleanly to "${filePath}".`);
    }
    patchedContent = applyEol(applied, eol);
  } else {
    patchedContent = applyEol(patch, eol);
  }

  const diffInfo = createUnifiedDiff(filePath, currentContent, patchedContent);

  if (dryRun) {
    return {
      success: true,
      filePath,
      diffSummary: `+${diffInfo.additions} -${diffInfo.deletions}`,
      diff: diffInfo.patch
    };
  }

  atomicWriteText(fullPath, patchedContent);

  const newHash = computeHash(patchedContent);
  rememberHash(filePath, newHash);

  eventBus.broadcast('file_patched', {
    filePath,
    diff: diffInfo.patch,
    additions: diffInfo.additions,
    deletions: diffInfo.deletions,
    newHash
  });

  return {
    success: true,
    filePath,
    newHash,
    diffSummary: `+${diffInfo.additions} -${diffInfo.deletions}`,
    diff: diffInfo.patch
  };
}

module.exports = {
  applyPatch,
  computeHash,
  atomicWriteText,
  tempSibling,
  resolveSafePath,
  isInsideWorkspace,
  toPosixRel,
  detectEol,
  countOccurrences,
  withWriteLock,
  looksLikeV4A,
  looksLikeUnifiedDiff
};
