const assert = require('assert');
const { toolLabel } = require('../src/agent/toolLabel');

assert.strictEqual(toolLabel('list_directory', { dirPath: 'src' }, true), 'Explored src');
assert.strictEqual(toolLabel('list_directory', null, false), 'Explored .');
assert.strictEqual(toolLabel('find_files', { total: 3, files: ['a', 'b', 'c'] }, true), 'Found 3 files');
assert.strictEqual(toolLabel('search_files', { totalMatches: 4 }, true), 'Found 4 matches');
assert.strictEqual(toolLabel('read_files', { filePath: 'a.js' }, true), 'Read a.js');
assert.strictEqual(toolLabel('apply_patch', { filePath: 'a.js' }, true), 'Patched a.js');
assert.strictEqual(toolLabel('load_skill', { found: true, name: 'demo' }, true), 'Skill demo');
assert.strictEqual(toolLabel('load_skill', { skills: [{ name: 'a' }, { name: 'b' }] }, true), 'Skills 2');
console.log('toolLabel tests passed');
