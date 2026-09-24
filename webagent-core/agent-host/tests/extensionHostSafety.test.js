// F71 batch 2: VS Code extension ↔ agent-host trust edges, found by reading extension.js / ptyHost.js / ptyPolicy.js.
//  1. webagent.agentHostUrl was used verbatim. The host's /api only answers Host localhost/127.0.0.1/[::1] from a
//     loopback socket, so any other URL can never be a real Web Agent host — yet the extension would send chat
//     prompts, workspace paths (PTY hello every 3 s) and would take PTY command jobs from it.
//  2. http://[::1]:port failed with ENOTFOUND: URL.hostname keeps the brackets and http.request does not strip them.
//  3. "同类都允许" keyed families on the first [A-Za-z0-9_.+-]+ run: approving `"C:\...\node.exe" --version` approved
//     family "c", i.e. every later C:\ path program (format.com included) ran with no prompt; `./a.sh` approved `./*`.
//  4. Windows PTY commands lost failures: `powershell -File` exits 0 on normal termination and `-Command` reports
//     only the last statement's $?, so a failing `npm test` in a multi-line command was reported ok (same defect
//     class as the executor's §5.4-1 fix, which the extension's spawnSpec never received).
'use strict';
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const vm = require('vm');
const Module = require('module');
const { spawnSync } = require('child_process');

const EXT = path.resolve(__dirname, '../../extension');

function loadExtension(getUrl) {
  const vscode = {
    workspace: { isTrusted: true, workspaceFolders: [], getConfiguration: () => ({ get: () => getUrl() }) },
    window: {}, commands: {}, env: {}
  };
  const context = vm.createContext({ module: { exports: {} }, console, process, Buffer, URL, setTimeout, clearTimeout, setInterval, clearInterval,
    require: name => name === 'vscode' ? vscode : name.startsWith('./') ? {} : require(name) });
  vm.runInContext(fs.readFileSync(path.join(EXT, 'extension.js'), 'utf8') + '\nmodule.exports={agentHostUrl,requestJson};', context);
  return context.module.exports;
}

function loadPty(fakeVscode) {
  const originalLoad = Module._load;
  Module._load = function(name, ...rest) {
    if (name === 'vscode') return fakeVscode;
    return originalLoad.call(this, name, ...rest);
  };
  try {
    delete require.cache[require.resolve(path.join(EXT, 'ptyHost'))];
    return require(path.join(EXT, 'ptyHost'));
  } finally { Module._load = originalLoad; }
}

async function agentHostUrlContract() {
  let configured = '';
  const { agentHostUrl } = loadExtension(() => configured);
  const accepted = {
    'http://127.0.0.1:48271': 'http://127.0.0.1:48271',
    'http://127.0.0.1:48271/': 'http://127.0.0.1:48271',
    'http://localhost:5000': 'http://localhost:5000',
    'http://LOCALHOST:5000/': 'http://localhost:5000',
    'http://[::1]:48271': 'http://[::1]:48271',
    'https://127.0.0.1:9443': 'https://127.0.0.1:9443'
  };
  for (const [raw, want] of Object.entries(accepted)) {
    configured = raw;
    assert.strictEqual(agentHostUrl(), want, raw);
  }
  for (const raw of ['http://evil.example:48271', 'https://attacker.test', 'http://127.0.0.2:48271', 'http://0.0.0.0:48271',
    'http://127.0.0.1.evil.test:48271', 'http://[::ffff:127.0.0.1]:48271', 'http://user:pw@127.0.0.1:48271',
    'http://127.0.0.1:48271/api', 'http://127.0.0.1:48271/?x=1', 'http://127.0.0.1:48271/#x', 'file:///etc/passwd',
    'ftp://127.0.0.1/', 'not a url']) {
    configured = raw;
    assert.throws(() => agentHostUrl(), /webagent\.agentHostUrl/, `${raw} must be refused before any request`);
  }
  configured = '';
  const saved = process.env.WEBAGENT_AGENT_HOST_URL;
  try {
    delete process.env.WEBAGENT_AGENT_HOST_URL;
    assert.strictEqual(agentHostUrl(), 'http://127.0.0.1:48271', 'default');
    process.env.WEBAGENT_AGENT_HOST_URL = 'http://evil.example';
    assert.throws(() => agentHostUrl(), /webagent\.agentHostUrl/, 'the environment fallback obeys the same rule');
  } finally {
    if (saved === undefined) delete process.env.WEBAGENT_AGENT_HOST_URL; else process.env.WEBAGENT_AGENT_HOST_URL = saved;
  }

  // The PTY poller never contacts (and never sends the workspace path to) a refused URL.
  const calls = [];
  const { PtyHost } = loadPty({ workspace: { workspaceFolders: [{ uri: { fsPath: os.tmpdir() } }] }, env: {}, window: {} });
  const host = new PtyHost({ agentHostUrl: () => { configured = 'http://evil.example'; return agentHostUrl(); },
    requestJson: async (...args) => { calls.push(args); return { status: 200, json: { jobs: [] } }; } });
  await host.hello();
  await host.poll();
  host.dispose();
  assert.deepStrictEqual(calls, [], 'refused agentHostUrl must not receive hello/poll');
}

async function ipv6Loopback() {
  const { requestJson } = loadExtension(() => '');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ host: req.headers.host })); });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '::1', resolve); });
  } catch (err) {
    console.log(`ipv6 loopback unavailable here (${err.code}); bracketed-host request check skipped`);
    return;
  }
  try {
    const port = server.address().port;
    const res = await requestJson('GET', `http://[::1]:${port}/api/status`);
    assert.strictEqual(res.status, 200);
    // The host's isLocalControlPlane accepts exactly "[::1]" (with port) as a local Host header.
    assert.strictEqual(res.json.host, `[::1]:${port}`);
  } finally { await new Promise(resolve => server.close(resolve)); }
}

function familyContract() {
  const policy = require(path.join(EXT, 'ptyPolicy'));
  // Families are bare program names only; anything path-like has no family and can never be batch-approved.
  for (const [command, family] of [['npm test', 'npm'], ['npm.cmd run build', 'npm.cmd'], ['node scripts/x.js', 'node'],
    ['& git status --short', 'git'], ['"node" --version', 'node'], ['Get-ChildItem -Force', 'get-childitem']]) {
    assert.strictEqual(policy.commandFamily(command), family, command);
  }
  for (const command of ['"C:\\Program Files\\nodejs\\node.exe" --version', 'C:\\tools\\a.exe', './build.sh', '.\\build.ps1',
    'bin/lint', '../x', '/usr/bin/env node', '~/bin/x', '"unterminated', '', '   ']) {
    assert.strictEqual(policy.commandFamily(command), '', `${JSON.stringify(command)} must have no family`);
  }
  // Before the fix, one approval of a C:\ program auto-allowed format.com; ./a.sh auto-allowed ./other.sh.
  const families = new Set();
  for (const approved of ['"C:\\Program Files\\nodejs\\node.exe" --version', './build.sh', 'bin/lint']) {
    const f = policy.shouldAutoAllow(approved, {}).family;
    if (f) families.add(f);
  }
  for (const later of ['C:\\Windows\\System32\\format.com D:', '"C:\\Users\\me\\Downloads\\x.exe"', './other.sh --wipe', 'bin/../../x']) {
    assert.strictEqual(policy.shouldAutoAllow(later, { allowedFamilies: families }).allow, false, later);
  }
  assert.strictEqual(policy.shouldAutoAllow('npm test', { allowedFamilies: new Set(['npm']) }).allow, true, 'bare families still work');
}

async function confirmButtons() {
  const shown = [];
  const fakeVscode = { workspace: { workspaceFolders: [] }, env: {},
    window: { showWarningMessage: async (message, options, ...buttons) => { shown.push(buttons); return '同类都允许'; } } };
  const { PtyHost } = loadPty(fakeVscode);
  const host = new PtyHost({ agentHostUrl: () => 'http://127.0.0.1:1', requestJson: async () => ({}) });
  // A path-like program offers no family button; even a forged answer cannot add a family.
  assert.strictEqual(await host.confirm('./build.sh'), false, 'no family: the only way to run is an explicit 运行');
  assert.ok(!shown[0].includes('同类都允许'), 'no family button for a path-like program');
  assert.strictEqual(host.allowedFamilies.size, 0);
  assert.strictEqual(await host.confirm('npm test'), true);
  assert.ok(shown[1].includes('同类都允许'));
  assert.ok(host.allowedFamilies.has('npm'));
  host.dispose();
}

function windowsExitContract() {
  const { spawnSpec } = loadPty({ workspace: { workspaceFolders: [] }, env: {}, window: {} });
  const cases = [
    ['Write-Output ok', 0],
    ['node -e "process.exit(3)"', 3],
    ['node -e "process.exit(3)"; Write-Output after', 3],
    ['node -e "process.exit(4)"\nWrite-Output after', 4],          // -File branch (newline)
    ['Write-Output 中文; node -e "process.exit(6)"; Write-Output 后', 6], // -File branch (non-ASCII)
    ['Get-Item -LiteralPath "C:\\definitely\\missing\\webagent-path"', 1],
    ['Get-Item -LiteralPath "C:\\definitely\\missing\\webagent-path"\nWrite-Output 继续', 0],
    ['exit 5', 5],
    ['node -e "process.exit(2)"\n' + '#'.repeat(420), 2]            // -File branch (long), trailing comment line
  ];
  if (process.platform !== 'win32') {
    // POSIX keeps `$SHELL -lc <command>` unchanged; the Windows contract is asserted structurally and runs on Windows CI.
    assert.deepStrictEqual(spawnSpec('echo hi').args, ['-lc', 'echo hi']);
    const real = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      for (const [command] of cases) {
        const spec = spawnSpec(command);
        const text = spec.cleanup ? fs.readFileSync(spec.cleanup, 'utf8') : spec.args[spec.args.length - 1];
        if (spec.cleanupDir) fs.rmSync(spec.cleanupDir, { recursive: true, force: true });
        assert.ok(text.includes(command), 'user command kept verbatim');
        const reset = text.indexOf('$global:LASTEXITCODE = $null');
        assert.ok(reset !== -1 && reset < text.indexOf(command), 'LASTEXITCODE reset before the command');
        const tail = text.slice(text.indexOf(command) + command.length);
        assert.ok(/^\r?\n\$__wa_ok = \$\?/.test(tail), 'status captured on the line right after the command');
        assert.ok(tail.includes('exit $LASTEXITCODE') && tail.includes('exit 1') && /exit 0\s*$/.test(tail), 'three-way exit contract');
      }
    } finally { Object.defineProperty(process, 'platform', real); }
    console.log('windows PTY exit contract: structural only on this platform (real powershell.exe runs on Windows CI)');
    return;
  }
  for (const [command, want] of cases) {
    const spec = spawnSpec(command);
    try {
      const run = spawnSync(spec.shell, spec.args, { encoding: 'utf8', timeout: 60000, windowsHide: true });
      assert.strictEqual(run.status, want, `${JSON.stringify(command)} → ${run.status}; stderr ${String(run.stderr).slice(0, 300)}`);
    } finally { if (spec.cleanupDir) fs.rmSync(spec.cleanupDir, { recursive: true, force: true }); }
  }
}

async function main() {
  await agentHostUrlContract();
  await ipv6Loopback();
  familyContract();
  await confirmButtons();
  windowsExitContract();
  console.log('extension host safety passed: loopback-only agentHostUrl, [::1] requests, bare-name families, Windows PTY exit codes');
}

main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
