const jsdiff = require('diff');

function createUnifiedDiff(filePath, oldContent, newContent) {
  const patch = jsdiff.createTwoFilesPatch(
    `a/${filePath}`,
    `b/${filePath}`,
    oldContent,
    newContent,
    'current',
    'patched'
  );

  // Calculate stats
  const changes = jsdiff.diffLines(oldContent, newContent);
  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    const lines = change.value.split('\n').filter(Boolean).length;
    if (change.added) additions += lines;
    if (change.removed) deletions += lines;
  }

  return {
    patch,
    additions,
    deletions,
    changes
  };
}

module.exports = {
  createUnifiedDiff
};
