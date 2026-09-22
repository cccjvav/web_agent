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
// Input and output ceilings, adopted from branch 01a0c932. The time/edit budgets bound one run;
// these bound what may enter and leave it at all.
const DIFF_MAX_INPUT_BYTES = 1024 * 1024;
const DIFF_MAX_INPUT_LINES = 20000;
const DIFF_MAX_PATCH_BYTES = 256 * 1024;

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
  // Guard the INPUTS before invoking the algorithm. The timeout below bounds how long a run may
  // take, but a caller should not be able to hand a multi-megabyte pair to a super-linear
  // algorithm at all; rejecting early is cheaper and gives a deterministic answer. Adopted from
  // the parallel audit on branch 01a0c932, which caught that my version only bounded the run.
  for (const text of [oldContent, newContent]) {
    if (typeof text !== 'string'
      || Buffer.byteLength(text, 'utf8') > DIFF_MAX_INPUT_BYTES
      || text.split('\n').length > DIFF_MAX_INPUT_LINES) {
      throw diffBudgetExceeded(filePath);
    }
  }

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

  const patch = jsdiff.formatPatch(structured);
  // Also bound the OUTPUT: a diff that fits the edit budget can still render into something far
  // too large to ship to a browser or a model context.
  if (Buffer.byteLength(patch, 'utf8') > DIFF_MAX_PATCH_BYTES) throw diffBudgetExceeded(filePath);

  return {
    patch,
    additions,
    deletions,
    hunks: structured.hunks
  };
}

module.exports = {
  DIFF_TIMEOUT_MS,
  DIFF_MAX_EDIT_LENGTH,
  DIFF_MAX_INPUT_BYTES,
  DIFF_MAX_INPUT_LINES,
  DIFF_MAX_PATCH_BYTES,
  createUnifiedDiff
};
