const jsdiff = require('diff');
const { ExecutionError } = require('../mcp/errors');

function createUnifiedDiff(filePath, oldContent, newContent) {
  const fail = () => { throw new ExecutionError('E_DIFF_LIMIT', 'Diff exceeds the preview budget; no patch was written. Reduce the reviewed change or use an editor.'); };
  // Text IO has a larger budget; a display diff is a separate CPU/output operation.
  for (const text of [oldContent, newContent]) {
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1024 * 1024 || text.split('\n').length > 20000) fail();
  }
  const structured = jsdiff.structuredPatch(
    `a/${filePath}`, `b/${filePath}`, oldContent, newContent, 'current', 'patched',
    { timeout: 100, maxEditLength: 4000 }
  );
  if (!structured) fail();
  let additions = 0, deletions = 0;
  for (const hunk of structured.hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith('+')) additions++;
      if (line.startsWith('-')) deletions++;
    }
  }
  // Reuse the structured result: do not run the quadratic algorithm a second time.
  const patch = jsdiff.formatPatch(structured);
  if (Buffer.byteLength(patch, 'utf8') > 256 * 1024) fail();
  return { patch, additions, deletions };
}

module.exports = { createUnifiedDiff };
