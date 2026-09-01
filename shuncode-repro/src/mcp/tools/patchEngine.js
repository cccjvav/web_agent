const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../../config');
const eventBus = require('../../utils/eventBus');
const { createUnifiedDiff } = require('../../utils/diff');

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

/**
 * Parses block style patches:
 * <<<<<<< SEARCH
 * old code
 * =======
 * new code
 * >>>>>>> REPLACE
 */
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

/**
 * Atomic apply_patch Engine
 */
async function applyPatch({ filePath, patch, expectedHash = null, dryRun = false }) {
  const fullPath = resolveSafePath(filePath);

  if (!fs.existsSync(fullPath)) {
    // If it's a new file creation
    const blocks = parseSearchReplaceBlocks(patch);
    let newContent = patch;
    if (blocks.length > 0 && blocks[0].search.trim() === '') {
      newContent = blocks[0].replace;
    }

    if (dryRun) {
      return {
        success: true,
        isNewFile: true,
        filePath,
        message: 'Dry run check passed: New file will be created.'
      };
    }

    // Ensure dir exists
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

  // File exists, read current content
  const currentContent = fs.readFileSync(fullPath, 'utf8');
  const currentHash = computeHash(currentContent);

  // Check expected hash if provided
  if (expectedHash && currentHash !== expectedHash && !currentHash.startsWith(expectedHash)) {
    throw new Error(`Hash mismatch conflict: Expected hash ${expectedHash}, but current file hash is ${currentHash.substring(0, 12)}. The file may have been modified concurrently.`);
  }

  let patchedContent = currentContent;
  const blocks = parseSearchReplaceBlocks(patch);

  if (blocks.length > 0) {
    for (let i = 0; i < blocks.length; i++) {
      const { search, replace } = blocks[i];
      
      // Normalize newlines for matching
      const normalizedCurrent = patchedContent.replace(/\r\n/g, '\n');
      const normalizedSearch = search.replace(/\r\n/g, '\n');
      const normalizedReplace = replace.replace(/\r\n/g, '\n');

      if (!normalizedCurrent.includes(normalizedSearch)) {
        // Try fuzzy trim matching
        const trimmedSearch = normalizedSearch.trim();
        if (trimmedSearch && normalizedCurrent.includes(trimmedSearch)) {
          patchedContent = normalizedCurrent.replace(trimmedSearch, normalizedReplace.trim());
        } else {
          throw new Error(`Patch conflict in block #${i + 1}: The specified SEARCH block could not be located in "${filePath}". Please re-read the file before applying.`);
        }
      } else {
        patchedContent = normalizedCurrent.replace(normalizedSearch, normalizedReplace);
      }
    }
  } else {
    // If no <<<<<< SEARCH markers, check if it is direct replacement or unified diff
    if (patch.startsWith('--- ') && patch.includes('@@')) {
      // It's a unified diff patch
      const jsdiff = require('diff');
      const applied = jsdiff.applyPatch(currentContent, patch);
      if (applied === false) {
        throw new Error(`Unified diff patch failed to apply cleanly to "${filePath}".`);
      }
      patchedContent = applied;
    } else {
      // Direct whole-file replacement
      patchedContent = patch;
    }
  }

  const diffInfo = createUnifiedDiff(filePath, currentContent, patchedContent);

  if (dryRun) {
    return {
      success: true,
      filePath,
      diffSummary: `+${diffInfo.additions} -${diffInfo.deletions}`,
      diff: diffInfo.patch,
      message: 'Dry run check passed. Patch is valid and ready to apply.'
    };
  }

  // Atomic write
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
