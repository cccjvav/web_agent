const { checkCancelled } = require('../utils/requestScope');
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
function atomicWriteText(fullPath, content, { exclusive = false } = {}) {
  checkCancelled();
  if (Buffer.byteLength(content, 'utf8') > MAX_TEXT_BYTES) throw new ProtocolError('E_BAD_ARGS', 'Result exceeds text file budget');
  if (fs.existsSync(fullPath)) fullPath = fs.realpathSync(fullPath); // Replace the checked target, not the symlink itself.
  const tmp = tempSibling(fullPath);
  const mode = fs.existsSync(fullPath) ? fs.statSync(fullPath).mode & 0o777 : null;
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8', flag: 'wx', ...(mode == null ? {} : { mode }) });
    if (mode != null) fs.chmodSync(tmp, mode);
    checkCancelled();
    if (exclusive) fs.linkSync(tmp, fullPath);
    else fs.renameSync(tmp, fullPath);
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
      checkCancelled();
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

// SEARCH/REPLACE markers are whole lines. The opening marker's run length N (5+ '<') fixes the
// divider (exactly N '=') and the closing marker (N '>'), so a `# ==========` banner or a
// Markdown setext underline inside the SEARCH text stays content. The previous single regex made
// the newline before the divider optional and accepted any 5+ '=' run: such a line silently
// ended SEARCH early and the host wrote a corrupted file while reporting success. It also could
// not express an empty REPLACE (line deletion) at all.
const SR_OPEN = /^\s*(<{5,})\s*SEARCH\s*$/;
const SR_DIVIDER = /^\s*(={5,})\s*$/;
const SR_CLOSE = /^\s*(>{5,})\s*REPLACE\s*$/;

function malformedPatch(message, hint) {
  return new ProtocolError('E_BAD_ARGS', message, {
    retryHint: hint || 'Resend complete SEARCH/REPLACE blocks, including every closing REPLACE marker. Use write_file for literal marker text.'
  });
}

function parseSearchReplaceBlocks(patchText) {
  const text = String(patchText);
  // Only a SEARCH or REPLACE marker makes this a SEARCH/REPLACE patch. A body with nothing but
  // '=====' lines (a setext heading in a new Markdown file) is content: for a new file it is the
  // full body, and for an existing file it is refused later as an unmarked body.
  if (!/^\s*(?:<{5,}\s*SEARCH|>{5,}\s*REPLACE)\s*$/m.test(text)) return [];
  // Split into lines while keeping each line's own terminator, so SEARCH/REPLACE text keeps its
  // exact bytes and the final line break before a marker belongs to the marker line.
  const lines = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g).filter((line, i, all) => line !== '' || i < all.length - 1);
  const bare = (line) => line.replace(/\r?\n$|\r$/, '');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const open = SR_OPEN.exec(bare(lines[i]));
    if (!open) {
      if (SR_DIVIDER.test(bare(lines[i])) || SR_CLOSE.test(bare(lines[i]))) {
        throw malformedPatch('Incomplete or malformed SEARCH/REPLACE patch; original file preserved.');
      }
      i += 1;
      continue;
    }
    const n = open[1].length;
    // Scope of this block: up to the next same-length opener. Markers of a different length are
    // content, which is what lets longer markers carry literal 7-character marker lines.
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      const inner = SR_OPEN.exec(bare(lines[j]));
      if (inner && inner[1].length === n) { end = j; break; }
    }
    const markerLines = (re, from, to, sameLength) => {
      const hits = [];
      for (let j = from; j < to; j++) {
        const m = re.exec(bare(lines[j]));
        if (m && (!sameLength || m[1].length === n)) hits.push(j);
      }
      return hits;
    };
    // Prefer markers matching the opener's length; fall back to any length (models sometimes mix
    // 5- and 7-character markers) only where that is still unambiguous.
    let close = markerLines(SR_CLOSE, i + 1, end, true)[0];
    if (close === undefined) close = markerLines(SR_CLOSE, i + 1, end, false)[0];
    if (close === undefined) {
      throw malformedPatch('Incomplete or malformed SEARCH/REPLACE patch; original file preserved.');
    }
    let dividers = markerLines(SR_DIVIDER, i + 1, close, true);
    if (!dividers.length) dividers = markerLines(SR_DIVIDER, i + 1, close, false);
    if (!dividers.length) {
      throw malformedPatch('Incomplete or malformed SEARCH/REPLACE patch; original file preserved.');
    }
    if (dividers.length > 1) {
      // e.g. Git conflict markers inside SEARCH: guessing which divider is ours would write a
      // corrupted file, so refuse with zero writes.
      throw malformedPatch(
        'Ambiguous SEARCH/REPLACE block: more than one divider line of the same length; original file preserved.',
        'Use longer markers (e.g. 9 characters each: <<<<<<<<< SEARCH / ========= / >>>>>>>>> REPLACE), or send a unified diff.'
      );
    }
    const join = (from, to) => {
      const body = lines.slice(from, to).join('');
      // The line break before a marker line is part of the marker, not of the text.
      return body.replace(/\r?\n$|\r$/, '');
    };
    const replaceLines = lines.slice(dividers[0] + 1, close);
    blocks.push({
      search: join(i + 1, dividers[0]),
      replace: join(dividers[0] + 1, close),
      // Distinguishes an empty REPLACE (delete) from a REPLACE that is one blank line.
      replaceEmpty: replaceLines.length === 0
    });
    i = close + 1;
  }
  return blocks;
}

// Deleting whole lines: when REPLACE is empty and every match of SEARCH covers complete lines,
// widen the needle to also take the line's indentation and one line break, so no stray blank
// or whitespace-only line is left behind. Only applied when every occurrence qualifies, so the
// occurrence count (and therefore uniqueness / `occurrence`) is exactly the same as for the
// plain needle. A mid-line match keeps the plain needle and removes just the matched text.
function wholeLineDeletionNeedle(haystack, needle, block) {
  if (!block.replaceEmpty || !needle || needle.includes('\n\n')) return needle;
  const core = needle.replace(/\n$/, '');
  if (!core) return needle;
  const hits = [];
  for (let from = 0; ;) {
    const at = haystack.indexOf(core, from);
    if (at < 0) break;
    hits.push(at);
    from = at + core.length;
  }
  if (!hits.length) return needle;
  let widened = null;
  for (const at of hits) {
    let start = at;
    while (start > 0 && (haystack[start - 1] === ' ' || haystack[start - 1] === '\t')) start -= 1;
    let end = at + core.length;
    while (end < haystack.length && (haystack[end] === ' ' || haystack[end] === '\t')) end += 1;
    const lineStart = start === 0 || haystack[start - 1] === '\n';
    const lineEnd = end === haystack.length || haystack[end] === '\n';
    if (!lineStart || !lineEnd) return needle;
    // Take the following line break; for the final line take the preceding one instead.
    const span = end < haystack.length ? haystack.slice(start, end + 1)
      : start > 0 ? haystack.slice(start - 1, end) : haystack.slice(start, end);
    if (widened === null) widened = span;
    else if (widened !== span) return needle; // Different indentation per match: keep it simple.
  }
  return countOccurrences(haystack, widened) === hits.length ? widened : needle;
}

function applySearchBlocks(currentContent, blocks, { filePath, occurrence } = {}) {
  const eol = detectEol(currentContent);
  let patchedLf = toLf(currentContent);
  const occRaw = Number(occurrence);
  const occ = Number.isFinite(occRaw) && occRaw >= 1 ? Math.round(occRaw) : null;

  for (let i = 0; i < blocks.length; i++) {
    const searchLf = toLf(blocks[i].search);
    const replaceLf = toLf(blocks[i].replace);
    let needle = wholeLineDeletionNeedle(patchedLf, searchLf, blocks[i]);
    let replacement = replaceLf;
    let n = countOccurrences(patchedLf, needle);
    if (n === 0 && searchLf.trim()) {
      needle = wholeLineDeletionNeedle(patchedLf, searchLf.trim(), blocks[i]);
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
    // A hash is a precondition on an existing file, never permission to recreate it.
    // The empty-file hash is still a hash of an existing file, not an absence token.
    if (expectedHash !== null) {
      throw new ExecutionError('E_STALE_FILE', `STALE_FILE: ${filePath} no longer exists. Stop and reconcile before creating a new file.`, {
        filePath, expectedHash, currentHash: null,
        retryHint: 'Stop this patch; inspect the missing file and coordinate whether recreation is intended. Do not remove expectedHash and replay automatically.'
      });
    }
    if (blocksEarly.length > 1) {
      throw new ProtocolError('E_BAD_ARGS', 'New files require exactly one empty SEARCH block or a complete file body; multiple blocks are not supported for creation.', {
        filePath, retryHint: 'Review and supply the complete intended new file in one empty SEARCH block, or use write_file. No block was applied.'
      });
    }
    if (blocksEarly.length === 1 && blocksEarly[0].search.trim() !== '') {
      throw new ExecutionError('E_CONFLICT', `Patch conflict: ${filePath} does not exist, so a nonempty SEARCH cannot match.`, {
        filePath, retryHint: 'Stop and inspect the missing target; do not reinterpret an existing-file patch as a new file body.'
      });
    }
    if (!blocksEarly.length && looksLikeUnifiedDiff(patch)) {
      throw new ProtocolError('E_BAD_ARGS', `New file ${filePath}: use one empty SEARCH block or the complete file body, not a unified diff.`, {
        filePath, retryHint: 'Review the intended new file and use one empty SEARCH block or write_file.'
      });
    }
    const newContent = blocksEarly.length ? blocksEarly[0].replace : patch;
    // Render the diff BEFORE any filesystem mutation, including parent directory creation.
    // createUnifiedDiff enforces a computation budget and throws E_DIFF_BUDGET when it cannot
    // finish; computing it first keeps that rejection at zero writes instead of leaving a
    // created file behind a failed call.
    const diffInfo = createUnifiedDiff(filePath, '', newContent);

    if (dryRun) {
      return { success: true, isNewFile: true, filePath, baseHash: null, proposedHash: computeHash(newContent),
        diff: diffInfo.patch, diffSummary: `+${diffInfo.additions} -${diffInfo.deletions}`, message: 'Dry run check passed (New file)' };
    }

    await Promise.resolve();
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    atomicWriteText(fullPath, newContent, { exclusive: true });

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

  // An existing file is only ever PATCHED, never wholesale replaced by unmarked text. The hash
  // gate proves the caller saw the current bytes; it cannot prove the caller meant to replace the
  // whole file — and the host silently reuses the path's last read hash, so a patch with a
  // forgotten SEARCH/REPLACE marker used to turn a 3-line file into a fragment in one call while
  // reporting success. Whole-file replacement is write_file's explicit contract
  // (confirm_overwrite / expectedHash). This check runs before the hash gate: resending the same
  // body with a fresh hash can never succeed, so the caller must learn the real problem first.
  const unifiedDiffBody = !blocksEarly.length && (looksLikeUnifiedDiff(patch) || /^--- |^\+\+\+ |^@@/m.test(patch));
  if (!blocksEarly.length && !unifiedDiffBody) {
    throw new ProtocolError(
      'E_BAD_ARGS',
      `Patch for existing file ${filePath} contains neither SEARCH/REPLACE blocks nor a unified diff; original file preserved. `
      + 'apply_patch never replaces an existing file with unmarked text.',
      {
        filePath,
        format: 'unmarked',
        retryHint: 'Resend as <<<<<<< SEARCH / ======= / >>>>>>> REPLACE blocks or one unified diff. For a deliberate whole-file replacement use write_file with confirm_overwrite=true or expectedHash.'
      }
    );
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
        retryHint: 'Stop and read the file before planning a new patch. Do not blindly reuse currentHash from this error.'
      }
    );
  }

  if (expectedHash && currentHash !== expectedHash) {
    throw new ExecutionError(
      'E_STALE_FILE',
      `STALE_FILE: file changed since last read. Re-run read_files for a fresh sha256. expected=${expectedHash} current=${currentHash}`,
      { filePath, expectedHash, currentHash, retryHint: 'Stop this patch; re-read and coordinate the changed content. Do not replay or blindly reuse currentHash.' }
    );
  }

  let patchedContent = currentContent;
  const blocks = blocksEarly;
  const eol = detectEol(currentContent);

  if (blocks.length > 0) {
    patchedContent = applySearchBlocks(currentContent, blocks, { filePath, occurrence });
  } else {
    // unifiedDiffBody is guaranteed here: every other body was refused before the hash gate.
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
  }

  const diffInfo = createUnifiedDiff(filePath, currentContent, patchedContent);

  if (dryRun) {
    return {
      success: true,
      filePath,
      baseHash: currentHash,
      proposedHash: computeHash(patchedContent),
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
