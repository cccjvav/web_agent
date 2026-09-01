const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { createUnifiedDiff } = require('../utils/diff');

function computeHash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function resolveSafePath(relPath) {
  const resolved = path.resolve(config.workspaceRoot, relPath);
  if (!resolved.startsWith(config.workspaceRoot)) {
    throw new Error(`Security error: path "${relPath}" is outside workspace root.`);
  }
  return resolved;
}

function parseSearchReplaceBlocks(patchText) {
  const blocks = [];
  const regex = /<{5,}\s*SEARCH\r?\n([\s\S]*?)\r?\n={5,}\r?\n([\s\S]*?)\r?\n>{5,}\s*REPLACE/g;
  let match;
  while ((match = regex.exec(patchText)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2]
    });
  }
  return blocks;
}

async function applyPatch({ filePath, patch, expectedHash = null, dryRun = false }) {
  const fullPath = resolveSafePath(filePath);

  if (!fs.existsSync(fullPath)) {
    const blocks = parseSearchReplaceBlocks(patch);
    let newContent = patch;
    if (blocks.length > 0 && blocks[0].search.trim() === '') {
      newContent = blocks[0].replace;
    }

    if (dryRun) {
      return { success: true, isNewFile: true, filePath, message: 'Dry run check passed (New file)' };
    }

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

    return {
      success: true,
      isNewFile: true,
      filePath,
      newHash: computeHash(newContent),
      diffSummary: `+${diffInfo.additions} -0`
    };
  }

  const currentContent = fs.readFileSync(fullPath, 'utf8');
  const currentHash = computeHash(currentContent);

  if (expectedHash && currentHash !== expectedHash && !currentHash.startsWith(expectedHash)) {
    const err = new Error(
      `STALE_FILE: file changed since last read. Re-run read_files for a fresh sha256. expected=${expectedHash} current=${currentHash}`
    );
    err.code = 'STALE_FILE';
    throw err;
  }

  let patchedContent = currentContent;
  const blocks = parseSearchReplaceBlocks(patch);

  if (blocks.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      const { search, replace } = blocks[i];
      const normalizedCurrent = patchedContent.replace(/\r\n/g, '\n');
      const normalizedSearch = search.replace(/\r\n/g, '\n');
      const normalizedReplace = replace.replace(/\r\n/g, '\n');

      if (!normalizedCurrent.includes(normalizedSearch)) {
        const trimmedSearch = normalizedSearch.trim();
        if (trimmedSearch && normalizedCurrent.includes(trimmedSearch)) {
          patchedContent = normalizedCurrent.replace(trimmedSearch, normalizedReplace.trim());
        } else {
          throw new Error(`Patch conflict: SEARCH block #${i + 1} could not be found in "${filePath}".`);
        }
      } else {
        patchedContent = normalizedCurrent.replace(normalizedSearch, normalizedReplace);
      }
    }
  } else {
    if (patch.startsWith('--- ') && patch.includes('@@')) {
      const jsdiff = require('diff');
      const applied = jsdiff.applyPatch(currentContent, patch);
      if (applied === false) {
        throw new Error(`Unified diff failed to apply cleanly to "${filePath}".`);
      }
      patchedContent = applied;
    } else {
      patchedContent = patch;
    }
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

  const tempPath = `${fullPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, patchedContent, 'utf8');
  fs.renameSync(tempPath, fullPath);

  const newHash = computeHash(patchedContent);

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
  resolveSafePath
};
