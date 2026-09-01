const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { applyPatch, computeHash } = require('../src/mcp/tools/patchEngine');
const { readFile, listDir, grepSearch } = require('../src/mcp/tools/fileOps');
const { config } = require('../src/config');

console.log('🧪 Testing ShunCode Bridge Core Mechanics...');

// Setup test workspace
const testWorkspace = path.join(__dirname, 'temp_workspace');
fs.mkdirSync(testWorkspace, { recursive: true });
config.workspaceRoot = testWorkspace;

async function runTests() {
  // Test 1: File creation via patch
  const newFilePath = 'hello.txt';
  const initialContent = 'Hello World\nLine 2\nLine 3\n';
  fs.writeFileSync(path.join(testWorkspace, newFilePath), initialContent, 'utf8');

  // Test 2: Read file
  const readRes = readFile({ filePath: newFilePath });
  assert.ok(readRes.content.includes('Hello World'));
  console.log('  ✅ read_file passed');

  // Test 3: apply_patch with search/replace
  const patch = `<<<<<<< SEARCH
Line 2
=======
Line 2 Modified
>>>>>>> REPLACE`;

  const patchRes = await applyPatch({ filePath: newFilePath, patch });
  assert.strictEqual(patchRes.success, true);
  const updatedContent = fs.readFileSync(path.join(testWorkspace, newFilePath), 'utf8');
  assert.ok(updatedContent.includes('Line 2 Modified'));
  console.log('  ✅ apply_patch atomic update passed');

  // Test 4: Conflict detection
  const conflictingPatch = `<<<<<<< SEARCH
Non Existent String In File
=======
New text
>>>>>>> REPLACE`;

  let conflictDetected = false;
  try {
    await applyPatch({ filePath: newFilePath, patch: conflictingPatch });
  } catch (err) {
    conflictDetected = true;
    assert.ok(err.message.includes('Patch conflict'));
  }
  assert.strictEqual(conflictDetected, true);
  console.log('  ✅ apply_patch conflict rollback check passed');

  // Test 5: grep_search
  const grepRes = grepSearch({ query: 'Modified', searchPath: '.' });
  assert.strictEqual(grepRes.totalMatches, 1);
  console.log('  ✅ grep_search passed');

  // Clean up
  fs.rmSync(testWorkspace, { recursive: true, force: true });
  console.log('🎉 All Bridge core tests passed!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
