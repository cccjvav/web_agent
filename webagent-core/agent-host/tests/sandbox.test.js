const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-sandbox-'));
config.workspaceRoot = tmp;

const { callTool } = require('../src/tools');
const { resolveSafePath, isInsideWorkspace } = require('../src/tools/patchEngine');

function trySymlink(target, dest) {
  try {
    fs.symlinkSync(target, dest);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  assert.strictEqual(config.host, process.env.WEBAGENT_BIND || '127.0.0.1');

  fs.writeFileSync(path.join(tmp, 'inside.txt'), 'ok\n');
  assert.ok(isInsideWorkspace(path.join(tmp, 'inside.txt')));
  assert.ok(!isInsideWorkspace(path.join(tmp, '..', 'nope.txt')));

  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-outside-'));
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'LEAK\n');

  if (trySymlink(outside, path.join(tmp, 'leak'))) {
    let escaped = false;
    try {
      await callTool('read_files', { filePath: 'leak/secret.txt' }, 'ask');
    } catch (err) {
      escaped = /outside workspace/i.test(err.message);
    }
    assert.ok(escaped, 'symlink into an outside directory must not be readable');

    let cwdEscaped = false;
    try {
      await callTool('run_command', { command: 'echo hi', cwd: 'leak' }, 'code');
    } catch (err) {
      cwdEscaped = /outside workspace/i.test(err.message);
    }
    assert.ok(cwdEscaped, 'cwd through an outside symlink must be rejected');

    let patchEscaped = false;
    try {
      resolveSafePath('leak/secret.txt');
    } catch (err) {
      patchEscaped = /outside workspace/i.test(err.message);
    }
    assert.ok(patchEscaped);

    const listed = await callTool('list_directory', { dirPath: '.', recursive: true, maxDepth: 3 }, 'ask');
    const names = JSON.stringify(listed);
    assert.ok(!/secret\.txt/.test(names), 'list_directory must not walk outside via symlink');
  }

  fs.rmSync(outside, { recursive: true, force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('sandbox tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
