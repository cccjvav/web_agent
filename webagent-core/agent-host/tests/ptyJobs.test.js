'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getToolList, callTool } = require('../src/tools');
const ptyJobs = require('../src/tools/ptyJobs');
const { ProtocolError } = require('../src/mcp/errors');
const { handleRpc } = require('../src/mcp/server');

ptyJobs.resetForTests();

assert.strictEqual(getToolList().length, 30);
assert.ok(!getToolList().map((t) => t.name).includes('send_command_input'));
const hidden = getToolList(null, { includeHidden: true }).map((t) => t.name);
assert.strictEqual(hidden.length, 31);
assert.ok(hidden.includes('send_command_input'));

async function main() {
  const events = [];
  const resultP = ptyJobs.runWithPty({ pty: true, remote: false, emit: (type, data) => events.push({ type, ...data }) }, () =>
    ptyJobs.enqueue('run', { command: 'echo hi', cwd: '.', timeoutSec: 5 })
  );
  await new Promise((r) => setTimeout(r, 20));
  const req = events.find((e) => e.type === 'pty_request');
  assert.ok(req && req.jobId, 'enqueue must emit pty_request');
  assert.strictEqual(req.kind, 'run');
  assert.strictEqual(req.command, 'echo hi');
  assert.strictEqual(req.state, 'queued');
  assert.ok(ptyJobs.listPending().some((j) => j.jobId === req.jobId));

  assert.ok(ptyJobs.report(req.jobId, { state: 'accepted' }).accepted);
  assert.ok(ptyJobs.report(req.jobId, { state: 'progress', stdout: 'hi\n' }).ok);
  assert.ok(ptyJobs.report(req.jobId, { state: 'done', status: 'done', exitCode: 0, stdout: 'hi\n', outputCaptured: true }).finished);

  const result = await resultP;
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.execution, 'pty');
  assert.strictEqual(result.outputCaptured, true);
  assert.ok(String(result.stdout).includes('hi'));
  assert.strictEqual(ptyJobs.listPending().length, 0);

  const deniedP = ptyJobs.runWithPty({ pty: true, remote: false, emit: () => {} }, () =>
    ptyJobs.enqueue('run', { command: 'rm -rf danger', timeoutSec: 5 })
  );
  await new Promise((r) => setTimeout(r, 10));
  const pending = ptyJobs.listPending()[0];
  ptyJobs.report(pending.jobId, { state: 'done', status: 'denied', message: 'User declined' });
  const denied = await deniedP;
  assert.strictEqual(denied.status, 'denied');
  assert.strictEqual(denied.ok, false);

  ptyJobs.noteClient();
  const snap = ptyJobs.snapshot();
  assert.strictEqual(snap.clientLive, true);

  let remoteForbidden = false;
  try {
    await callTool('send_command_input', { execId: 'abc', input: 'y\n' }, 'code', { remote: true });
  } catch (err) {
    remoteForbidden = err instanceof ProtocolError && err.code === 'E_FORBIDDEN';
  }
  assert.ok(remoteForbidden, 'remote MCP must E_FORBIDDEN send_command_input');

  const localNoPty = await callTool('send_command_input', { execId: 'abc', input: 'y\n' }, 'code');
  assert.strictEqual(localNoPty.ok, false);
  assert.ok(/PTY/i.test(String(localNoPty.message)));

  const rpc = await handleRpc({
    ip: '127.0.0.1',
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'send_command_input', arguments: { execId: 'x', input: 'y' } }
    }
  });
  assert.strictEqual(rpc.isError, true);
  assert.ok(/E_FORBIDDEN/.test(rpc.content[0].text));

  const ext = fs.readFileSync(path.resolve(__dirname, '../../extension/extension.js'), 'utf8');
  assert.ok(ext.includes("client: 'vscode-extension'"));
  assert.ok(!/\bclient:\s*'vscode'\b/.test(ext));
  assert.ok(ext.includes('startPtyHost'));
  assert.ok(ext.includes('dispatchPty'));
  assert.ok(ext.includes('pty_request'));

  const host = fs.readFileSync(path.resolve(__dirname, '../../extension/ptyHost.js'), 'utf8');
  assert.ok(host.includes('vscode.env.appRoot'));
  assert.ok(host.includes('node-pty'));
  assert.ok(host.includes('webagent-pty-'));
  assert.ok(host.includes('shellIntegration'));
  assert.ok(host.includes('sendText'));
  assert.ok(host.includes('Web Agent · 1'));
  assert.ok(host.includes('/api/pty/hello'));
  assert.ok(host.includes('handleIncoming'));
  assert.ok(host.includes('noteStream'));
  assert.ok(host.includes('waitForShellIntegration'));
  assert.ok(host.includes('同类都允许'));
  assert.ok(host.includes('streamFreshUntil'));
  assert.ok(/[^\x00-\x7F]|needsFile/.test(host) || host.includes('needsFile'));

  const policy = require('../../extension/ptyPolicy');
  assert.ok(policy.isReadishCommand('git status'));
  assert.ok(policy.looksDangerousCommand('rm -rf x'));
  assert.strictEqual(policy.shouldAutoAllow('git status', {}).allow, true);
  assert.strictEqual(policy.shouldAutoAllow('rm -rf x', { allowSession: true }).alwaysAsk, true);
  assert.strictEqual(policy.commandFamily('npm test'), 'npm');
  assert.ok(policy.shouldAutoAllow('npm test', { allowedFamilies: new Set(['npm']) }).allow);

  const routes = fs.readFileSync(path.resolve(__dirname, '../src/api/routes.js'), 'utf8');
  assert.ok(routes.includes("client === 'vscode-extension'"));
  assert.ok(routes.includes('/pty/hello'));
  assert.ok(routes.includes('runWithPty'));

  ptyJobs.resetForTests();
  console.log('ptyJobs tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
