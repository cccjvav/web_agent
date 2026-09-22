'use strict';
const jsdiff = require('diff');
const { ExecutionError } = require('../mcp/errors');

// Bounded bytes do not imply bounded CPU. The diff algorithm is super-linear in the number of
// differing lines, and it runs synchronously on the host event loop, so a pair of inputs well
// under the 8MiB text budget can still stall the host for seconds and delay cancellations.
// Give it an explicit wall-clock and edit-distance budget, and compute the patch exactly once
// instead of running two independent passes over the same pair of inputs.
const DIFF_TIMEOUT_MS = Number(process.env.WEBAGENT_DIFF_TIMEOUT_MS || 1500);
const DIFF_MAX_EDIT_LENGTH = Number(process.env.WEBAGENT_DIFF_MAX_EDIT || 20000);

function diffBudgetExceeded(filePath) {
  return new ExecutionError(
    'E_DIFF_BUDGET',
    `Diff for "${filePath}" exceeded the computation budget `
    + `(${DIFF_TIMEOUT_MS}ms / ${DIFF_MAX_EDIT_LENGTH} edits). `
    + 'The change is too large to render here; review it with an external diff tool.',
    { filePath, timeoutMs: DIFF_TIMEOUT_MS, maxEditLength: DIFF_MAX_EDIT_LENGTH }
  );
}

/**
 * Build a unified diff plus +/- counts under one bounded computation.
 * Throws ExecutionError('E_DIFF_BUDGET') when the algorithm cannot finish within budget;
 * callers must treat that as "not rendered", never as "no change".
 */
function createUnifiedDiff(filePath, oldContent, newContent) {
  // structuredPatch accepts the same budget options and yields the hunks that formatPatch
  // renders, so additions/deletions come from the same single computation as the patch text.
  const structured = jsdiff.structuredPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    'current',
    'patched',
    { timeout: DIFF_TIMEOUT_MS, maxEditLength: DIFF_MAX_EDIT_LENGTH }
  );
  // Both budget kinds make jsdiff return undefined rather than throw.
  if (!structured || !Array.isArray(structured.hunks)) throw diffBudgetExceeded(filePath);

  let additions = 0;
  let deletions = 0;
  for (const hunk of structured.hunks) {
    for (const line of hunk.lines || []) {
      if (line.startsWith('+')) additions += 1;
      else if (line.startsWith('-')) deletions += 1;
    }
  }

  return {
    patch: jsdiff.formatPatch(structured),
    additions,
    deletions,
    hunks: structured.hunks
  };
}

module.exports = {
  DIFF_TIMEOUT_MS,
  DIFF_MAX_EDIT_LENGTH,
  createUnifiedDiff
};
