const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-apifiles-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const apiRouter = require('../src/api/routes');

function request(server, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body == null ? null : JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: urlPath,
        method,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
          resolve({ status: res.statusCode, json: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  try {
    for (const readPath of ['/diagnostics', '/bridge/activity', '/status', '/models', '/logs', '/profile/detect', '/customizations']) {
      const rejected = await request(server, 'GET', `/api${readPath}?unexpected=true`);
      assert.equal(rejected.status, 400, `${readPath} must reject unknown query fields before read-side discovery`);
      assert.equal(rejected.json.code, 'E_BAD_API_REQUEST');
    }
    const diagnosticsSnapshot = await request(server, 'GET', '/api/diagnostics');
    assert.equal(diagnosticsSnapshot.status, 200);
    assert.deepEqual(Object.keys(diagnosticsSnapshot.json).sort(), ['capabilities', 'identity', 'probe']);
    assert.deepEqual(Object.keys(diagnosticsSnapshot.json.identity).sort(),
      ['hostInstanceId', 'mcpPort', 'startedAt', 'version', 'workbenchPort', 'workspaceRoot']);
    assert.ok(diagnosticsSnapshot.json.capabilities.every(capability =>
      Object.keys(capability).sort().join(',') === 'id,reason,status'));

    const bridgeBeforeRejectedReset = require('../src/utils/eventBus').getBridgeActivity();
    const rejectedBridgeReset = await request(server, 'POST', '/api/bridge/reset-round?unexpected=true', {});
    assert.equal(rejectedBridgeReset.status, 400);
    assert.equal(rejectedBridgeReset.json.code, 'E_BAD_BRIDGE_REQUEST');
    const bridgeAfterRejectedReset = require('../src/utils/eventBus').getBridgeActivity();
    assert.equal(bridgeAfterRejectedReset.resetAt, bridgeBeforeRejectedReset.resetAt,
      'unknown Bridge query fields must fail before resetting session state');

    const ptyJobs = require('../src/tools/ptyJobs');
    ptyJobs.resetForTests();
    const ptyIdentity = { clientId: 'api-pty-client', workspace: tmp };
    const invalidPtyHello = await request(server, 'POST', '/api/pty/hello', { ...ptyIdentity, unexpected: true });
    assert.equal(invalidPtyHello.status, 400, 'unknown PTY hello fields must not register a client');
    assert.equal(invalidPtyHello.json.code, 'E_BAD_API_REQUEST');
    assert.equal(ptyJobs.hasClient(), false);
    const invalidPtyPoll = await request(server, 'GET', `/api/pty/jobs?${new URLSearchParams({ ...ptyIdentity, unexpected: 'true' })}`);
    assert.equal(invalidPtyPoll.status, 400, 'unknown PTY poll fields must not refresh client liveness');
    assert.equal(ptyJobs.hasClient(), false);
    assert.equal((await request(server, 'POST', '/api/pty/hello', ptyIdentity)).status, 200);
    const pendingPty = ptyJobs.enqueue('run', { command: 'printf fixture', cwd: '.', timeoutSec: 5 });
    const pendingPtyJob = ptyJobs.listPending(ptyIdentity.clientId)[0];
    const invalidPtyReport = await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, {
      ...ptyIdentity, state: 'claimed', unexpected: true
    });
    assert.equal(invalidPtyReport.status, 400, 'unknown PTY report fields must not claim a job');
    assert.equal(ptyJobs.listPending(ptyIdentity.clientId)[0].state, 'queued');
    assert.equal((await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, { ...ptyIdentity, state: 'claimed' })).status, 200);
    assert.equal((await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, { ...ptyIdentity, state: 'accepted' })).status, 200);
    const contradictoryPtyReport = await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, {
      ...ptyIdentity, state: 'cancelled', status: 'done', ok: true, exitCode: 0
    });
    assert.equal(contradictoryPtyReport.status, 400, 'a terminal PTY state cannot be relabelled as success');
    assert.equal(ptyJobs.listPending(ptyIdentity.clientId)[0].state, 'running');
    assert.equal((await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, {
      ...ptyIdentity, state: 'progress', stdout: 'fixture'
    })).status, 200);
    assert.equal((await request(server, 'POST', `/api/pty/jobs/${pendingPtyJob.jobId}`, {
      ...ptyIdentity, state: 'done', status: 'done', ok: true, exitCode: 0, stdout: 'fixture complete', outputCaptured: true
    })).status, 200);
    const completedPty = await pendingPty;
    assert.equal(completedPty.ok, true);
    assert.equal(completedPty.stdout, 'fixture complete');
    ptyJobs.resetForTests();

    const connectionCheck = require('../src/utils/connectionCheck');
    const connectionInput = {
      schema: 'webagent-browser-observation/v1', origin: 'https://arena.ai',
      observedAt: new Date().toISOString(), pageKind: 'agent', pageDigest: 'a'.repeat(64)
    };
    connectionCheck.clear();
    const originalConnectionCreate = connectionCheck.create;
    let connectionCreates = 0;
    connectionCheck.create = input => { connectionCreates++; return originalConnectionCreate(input); };
    try {
      const invalidConnectionCreate = await request(server, 'POST', '/api/connection-checks', {
        ...connectionInput, unexpected: true
      });
      assert.equal(invalidConnectionCreate.status, 400, 'unknown connection-check fields must fail before record allocation');
      assert.equal(connectionCreates, 0);
    } finally {
      connectionCheck.create = originalConnectionCreate;
    }
    const connectionRecord = connectionCheck.create(connectionInput);
    const invalidConnectionInspect = await request(server, 'GET', `/api/connection-checks/${connectionRecord.checkId}?unexpected=true`);
    assert.equal(invalidConnectionInspect.status, 400, 'unknown connection-check query fields must fail before inspection');
    assert.equal(connectionCheck.inspect(connectionRecord.checkId).status, 'waiting');
    const invalidConnectionClear = await request(server, 'DELETE', '/api/connection-checks', { unexpected: true });
    assert.equal(invalidConnectionClear.status, 400, 'unknown clear wrappers must not erase connection checks');
    assert.equal(connectionCheck.inspect(connectionRecord.checkId).status, 'waiting');
    assert.equal((await request(server, 'DELETE', '/api/connection-checks', {})).status, 200);
    assert.throws(() => connectionCheck.inspect(connectionRecord.checkId));

    const externalClient = require('../src/mcp/externalClient');
    const originalExternalAdd = externalClient.add;
    const originalExternalPreview = externalClient.previewStdio;
    const originalExternalStart = externalClient.startStdio;
    const originalExternalRemove = externalClient.remove;
    const originalExternalRequest = externalClient.request;
    const workflowService = require('../src/tools/workflows');
    const originalWorkflowPreview = workflowService.previewRequest;
    const originalWorkflowRequest = workflowService.request;
    let externalAdds = 0, externalPreviews = 0, externalStarts = 0, externalRemovals = 0, externalRequests = 0;
    let workflowPreviews = 0, workflowRequests = 0;
    externalClient.add = async () => { externalAdds++; return { serverId: 'fixture-http', status: 'discovered', tools: [] }; };
    externalClient.previewStdio = () => { externalPreviews++; return { previewId: '11111111-1111-4111-8111-111111111111' }; };
    externalClient.startStdio = async () => { externalStarts++; return { serverId: 'fixture-stdio', status: 'discovered', tools: [] }; };
    externalClient.remove = () => { externalRemovals++; return { removed: true }; };
    externalClient.request = () => { externalRequests++; return { requestId: 'fixture-external-request', status: 'waiting-approval' }; };
    workflowService.previewRequest = () => { workflowPreviews++; return { valid: true, steps: [] }; };
    workflowService.request = () => { workflowRequests++; return { requestId: 'fixture-workflow-request', status: 'waiting-approval' }; };
    try {
      const invalidStdioPreview = await request(server, 'POST', '/api/external/stdio/preview', {
        program: '/fixture', unexpected: true
      });
      assert.equal(invalidStdioPreview.status, 400, 'unknown stdio preview fields must fail before preview allocation');
      assert.equal(externalPreviews, 0);
      const invalidExternalAdd = await request(server, 'POST', '/api/external/servers', {
        name: 'fixture', url: 'http://127.0.0.1:9/mcp', token: '', publicHttps: false, unexpected: true
      });
      assert.equal(invalidExternalAdd.status, 400, 'unknown external registration fields must fail before network setup');
      assert.equal(externalAdds, 0);
      const unconfirmedPublicAdd = await request(server, 'POST', '/api/external/servers', {
        name: 'fixture', url: 'https://mcp.example.test/mcp', publicHttps: true, confirmedPublic: false,
        workspaceRoot: tmp, hostInstanceId: config.hostInstanceId
      });
      assert.equal(unconfirmedPublicAdd.status, 400, 'public HTTPS requires strict confirmation before registration');
      assert.equal(externalAdds, 0);
      const partialBindingAdd = await request(server, 'POST', '/api/external/servers', {
        name: 'fixture', url: 'http://127.0.0.1:9/mcp', publicHttps: false, workspaceRoot: tmp
      });
      assert.equal(partialBindingAdd.status, 400, 'optional registration bindings must be complete');
      assert.equal(externalAdds, 0);
      assert.equal((await request(server, 'POST', '/api/external/servers', {
        name: 'fixture', url: 'http://127.0.0.1:9/mcp', token: '', publicHttps: false, confirmedPublic: false,
        workspaceRoot: tmp, hostInstanceId: config.hostInstanceId
      })).status, 200);
      assert.equal(externalAdds, 1);
      const previewId = '11111111-1111-4111-8111-111111111111';
      const invalidStdioStart = await request(server, 'POST', '/api/external/stdio/start', {
        previewId, confirmed: true, unexpected: true
      });
      assert.equal(invalidStdioStart.status, 400, 'unknown stdio start fields must fail before process launch');
      assert.equal(externalStarts, 0);
      assert.equal((await request(server, 'POST', '/api/external/stdio/start', { previewId, confirmed: true })).status, 200);
      assert.equal(externalStarts, 1);
      const externalId = '22222222-2222-4222-8222-222222222222';
      const invalidExternalRemove = await request(server, 'DELETE', `/api/external/servers/${externalId}?unexpected=true`, {});
      assert.equal(invalidExternalRemove.status, 400, 'unknown external delete wrappers must not remove a server');
      assert.equal(externalRemovals, 0);
      assert.equal((await request(server, 'DELETE', `/api/external/servers/${externalId}`, {})).status, 200);
      assert.equal(externalRemovals, 1);

      const externalCall = { serverId: externalId, tool: 'fixture', arguments: {}, requestKey: 'external-route-001' };
      for (const [urlPath, body] of [
        ['/api/external/request?unexpected=true', externalCall],
        ['/api/external/request', { ...externalCall, unexpected: true }]
      ]) {
        const rejected = await request(server, 'POST', urlPath, body);
        assert.equal(rejected.status, 400, 'external request wrappers must fail before approval allocation');
        assert.equal(rejected.json.code, 'E_BAD_API_REQUEST');
      }
      assert.equal(externalRequests, 0);
      assert.equal((await request(server, 'POST', '/api/external/request', externalCall)).status, 200);
      assert.equal(externalRequests, 1);

      const workflowDefinition = { steps: [{ id: 'inspect', tool: 'ping', arguments: {} }] };
      for (const [urlPath, body] of [
        ['/api/workflows/preview?unexpected=true', { definition: workflowDefinition }],
        ['/api/workflows/preview', { definition: workflowDefinition, unexpected: true }]
      ]) {
        const rejected = await request(server, 'POST', urlPath, body);
        assert.equal(rejected.status, 400, 'workflow preview wrappers must fail before validation work');
        assert.equal(rejected.json.code, 'E_BAD_API_REQUEST');
      }
      assert.equal(workflowPreviews, 0);
      assert.equal((await request(server, 'POST', '/api/workflows/preview', { definition: workflowDefinition })).status, 200);
      assert.equal(workflowPreviews, 1);
      const workflowCall = { definition: workflowDefinition, requestKey: 'workflow-route-001' };
      for (const [urlPath, body] of [
        ['/api/workflows/request?unexpected=true', workflowCall],
        ['/api/workflows/request', { ...workflowCall, unexpected: true }]
      ]) {
        const rejected = await request(server, 'POST', urlPath, body);
        assert.equal(rejected.status, 400, 'workflow request wrappers must fail before approval allocation');
        assert.equal(rejected.json.code, 'E_BAD_API_REQUEST');
      }
      assert.equal(workflowRequests, 0);
      assert.equal((await request(server, 'POST', '/api/workflows/request', workflowCall)).status, 200);
      assert.equal(workflowRequests, 1);
    } finally {
      externalClient.add = originalExternalAdd;
      externalClient.previewStdio = originalExternalPreview;
      externalClient.startStdio = originalExternalStart;
      externalClient.remove = originalExternalRemove;
      externalClient.request = originalExternalRequest;
      workflowService.previewRequest = originalWorkflowPreview;
      workflowService.request = originalWorkflowRequest;
    }

    const invalidToolTarget = 'invalid-tool-wrapper.txt';
    const invalidToolQuery = await request(server, 'POST', '/api/tool/call?unexpected=true', {
      name: 'write_file', mode: 'code',
      arguments: { filePath: invalidToolTarget, content: 'MUST NOT WRITE' }
    });
    assert.equal(invalidToolQuery.status, 400, 'unknown query fields must fail before body-routed tool dispatch');
    assert.equal(invalidToolQuery.json.code, 'E_BAD_API_REQUEST');
    assert.ok(!fs.existsSync(path.join(tmp, invalidToolTarget)));
    const invalidToolWrapper = await request(server, 'POST', '/api/tool/call', {
      name: 'write_file', mode: 'code',
      arguments: { filePath: invalidToolTarget, content: 'MUST NOT WRITE' },
      unexpected: 'field'
    });
    assert.equal(invalidToolWrapper.status, 400, 'unknown tool wrapper fields must fail before dispatch');
    assert.equal(invalidToolWrapper.json.code, 'E_BAD_API_REQUEST');
    assert.ok(!fs.existsSync(path.join(tmp, invalidToolTarget)));
    assert.equal((await request(server, 'POST', '/api/tool/call', { name: 'ping', arguments: 'not-an-object' })).status, 400);
    const invalidChatWrapper = await request(server, 'POST', '/api/chat', { mode: 'ask', message: 'do not run', unexpected: true });
    assert.equal(invalidChatWrapper.status, 400, 'unknown Chat wrapper fields must fail before task/model work');
    assert.equal(invalidChatWrapper.json.code, 'E_BAD_API_REQUEST');
    const invalidChatHistory = await request(server, 'POST', '/api/chat', {
      mode: 'ask', message: 'do not run', history: [{ role: 'system', content: 'untrusted role' }]
    });
    assert.equal(invalidChatHistory.status, 400, 'Chat history only accepts fixed user/assistant records');
    assert.equal((await request(server, 'POST', '/api/consensus/run', { taskDescription: 'do not run', unexpected: true })).status, 400);
    assert.equal((await request(server, 'POST', '/api/tasks/reset', { unexpected: true })).status, 400);

    const executionControl = require('../src/utils/executionControl');
    const modeBeforeInvalidWrapper = executionControl.snapshot().mode;
    const invalidControlWrapper = await request(server, 'POST', '/api/execution-control', {
      workspaceRoot: tmp, hostInstanceId: config.hostInstanceId, workMode: 'chat', unexpected: true
    });
    assert.equal(invalidControlWrapper.status, 400);
    assert.equal(executionControl.snapshot().mode, modeBeforeInvalidWrapper, 'unknown control wrapper cannot change host mode');

    const queue = require('../src/utils/operatorQueue');
    let wrapperOperationRuns = 0;
    queue.register('api-wrapper-fixture', async () => { wrapperOperationRuns++; return { ok: true }; });
    const wrapperOperation = queue.submit('api-wrapper-fixture', {}, {}, 'api-wrapper-request');
    const invalidApprovalWrapper = await request(server, 'POST', `/api/operations/${wrapperOperation.requestId}/approve`, { confirm: true, unexpected: true });
    assert.equal(invalidApprovalWrapper.status, 400);
    assert.equal(wrapperOperationRuns, 0);
    assert.equal(queue.inspect(wrapperOperation.requestId).status, 'waiting-approval');
    assert.equal((await request(server, 'POST', `/api/operations/${wrapperOperation.requestId}/approve`, { confirm: true })).status, 200);
    assert.equal(wrapperOperationRuns, 1);
    const cancelledOperation = queue.submit('api-wrapper-fixture', { n: 2 }, {}, 'api-wrapper-cancel');
    assert.equal((await request(server, 'POST', `/api/operations/${cancelledOperation.requestId}/cancel`, { unexpected: true })).status, 400);
    assert.equal(queue.inspect(cancelledOperation.requestId).status, 'waiting-approval');
    assert.equal((await request(server, 'POST', `/api/operations/${cancelledOperation.requestId}/cancel`, {})).status, 200);

    fs.writeFileSync(path.join(tmp, 'checkpoint-http.txt'), 'HTTP original');
    const checkpointBinding = { workspaceRoot: tmp, hostInstanceId: config.hostInstanceId };
    assert.equal((await request(server, 'POST', '/api/checkpoints', { paths: ['checkpoint-http.txt'], confirmed: true })).status, 400);
    const unknownCheckpointCreate = await request(server, 'POST', '/api/checkpoints', {
      ...checkpointBinding, paths: ['checkpoint-http.txt'], confirmed: true, unexpected: true
    });
    assert.equal(unknownCheckpointCreate.status, 400);
    assert.deepEqual((await request(server, 'GET', '/api/checkpoints')).json, [], 'unknown checkpoint wrapper cannot allocate a record');
    const checkpointCreated = await request(server, 'POST', '/api/checkpoints', { ...checkpointBinding, paths: ['./checkpoint-http.txt'], confirmed: true });
    assert.equal(checkpointCreated.status, 200);
    assert.deepEqual(checkpointCreated.json.paths,['checkpoint-http.txt'],'creation reports canonical paths, not necessarily the submitted spelling');
    assert.equal(checkpointCreated.json.state,'ready');assert.equal(checkpointCreated.json.result,null);
    assert.equal(fs.readFileSync(path.join(tmp,'checkpoint-http.txt'),'utf8'),'HTTP original','creation never writes selected content');
    const checkpointsBeforeFailure=(await request(server,'GET','/api/checkpoints')).json;
    assert.equal((await request(server,'POST','/api/checkpoints',{...checkpointBinding,paths:['checkpoint-http.txt','checkpoint-missing.txt'],confirmed:true})).status,400);
    assert.deepEqual((await request(server,'GET','/api/checkpoints')).json,checkpointsBeforeFailure,'a failed multi-file read cannot create a partial checkpoint');
    const checkpointId = checkpointCreated.json.id;
    fs.writeFileSync(path.join(tmp, 'checkpoint-http.txt'), 'HTTP modified');
    const checkpointPreview = await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/preview', checkpointBinding);
    assert.equal(checkpointPreview.status, 200);
    const unknownCheckpointRestore = await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/restore', {
      ...checkpointBinding, previewId: checkpointPreview.json.previewId, confirmed: true, unexpected: true
    });
    assert.equal(unknownCheckpointRestore.status, 400);
    assert.equal(fs.readFileSync(path.join(tmp, 'checkpoint-http.txt'), 'utf8'), 'HTTP modified', 'bad restore wrapper cannot consume or write');
    assert.equal((await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/restore', { ...checkpointBinding, previewId: checkpointPreview.json.previewId, confirmed: 'true' })).status, 400);
    const checkpointRestored = await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/restore', { ...checkpointBinding, previewId: checkpointPreview.json.previewId, confirmed: true });
    assert.equal(checkpointRestored.json.result.status, 'succeeded');
    assert.equal(fs.readFileSync(path.join(tmp, 'checkpoint-http.txt'), 'utf8'), 'HTTP original');
    assert.equal((await request(server, 'GET', '/api/checkpoints')).json.find(item => item.id === checkpointId).state, 'consumed');
    assert.equal((await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/remove', { ...checkpointBinding, unexpected: true })).status, 400);
    assert.ok((await request(server, 'GET', '/api/checkpoints')).json.some(item => item.id === checkpointId));
    assert.equal((await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/remove', checkpointBinding)).status, 200);

    const created = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md',
      content: 'hello from editor',
      createOnly: true
    });
    assert.strictEqual(created.status, 200);
    assert.strictEqual(created.json.success, true);
    assert.ok(created.json.hash);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');
    assert.ok(!fs.readdirSync(tmp).some((n) => n.includes('.tmp.')));
    const ambiguousCreate = await request(server, 'PUT', '/api/files/content', {
      path: 'ambiguous-create.txt', content: 'MUST DECLARE CREATE MODE'
    });
    assert.equal(ambiguousCreate.status, 400, 'a write must be exclusive-create or carry an expected hash');
    assert.ok(!fs.existsSync(path.join(tmp, 'ambiguous-create.txt')));
    const invalidCreateOnly = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md', content: 'MUST NOT OVERWRITE', createOnly: 'true'
    });
    assert.equal(invalidCreateOnly.status, 400, 'wrongly typed createOnly cannot fall through to overwrite mode');
    assert.equal(invalidCreateOnly.json.code, 'E_BAD_API_REQUEST');
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');
    const unknownFileWrapper = await request(server, 'PUT', '/api/files/content', {
      path: 'unknown-wrapper.txt', content: 'MUST NOT WRITE', unexpected: true
    });
    assert.equal(unknownFileWrapper.status, 400);
    assert.ok(!fs.existsSync(path.join(tmp, 'unknown-wrapper.txt')));
    const duplicateCreate = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md', content: '', createOnly: true
    });
    assert.strictEqual(duplicateCreate.status, 409, 'create-only editor action cannot blank an existing file');
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');
    const racingCreates = await Promise.all(['FIRST','SECOND'].map(content => request(server,'PUT','/api/files/content',{
      path:'created-once.txt',content,createOnly:true
    })));
    assert.deepStrictEqual(racingCreates.map(result=>result.status).sort(),[200,409]);
    const createWinner=racingCreates[0].status===200?'FIRST':'SECOND';
    assert.strictEqual(fs.readFileSync(path.join(tmp,'created-once.txt'),'utf8'),createWinner);

    const preview = await request(server, 'POST', '/api/files/preview', {path:'notes.md',content:'reviewed draft',expectedHash:created.json.hash});
    assert.equal(preview.status,200); assert.ok(preview.json.diff.includes('+reviewed draft'));
    assert.equal(preview.json.expectedHash,created.json.hash);
    assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'hello from editor','preview never writes');
    const unknownPreview = await request(server,'POST','/api/files/preview',{path:'notes.md',content:'x',expectedHash:created.json.hash,unexpected:true});
    assert.equal(unknownPreview.status,400);
    assert.equal(unknownPreview.json.code,'E_BAD_API_REQUEST');
    assert.equal((await request(server,'POST','/api/files/preview',{path:'notes.md',content:'x'})).status,400);
    assert.equal((await request(server,'POST','/api/files/preview',{path:'notes.md',content:'x',expectedHash:'0'.repeat(64)})).status,409);
    assert.equal((await request(server,'POST','/api/files/preview',{path:'../escape',content:'x',expectedHash:created.json.hash})).status,400);
    assert.equal((await request(server,'POST','/api/files/preview',{path:'.env',content:'x',expectedHash:created.json.hash})).status,400);
    assert.equal((await request(server,'POST','/api/files/preview',{path:'notes.md',content:'x'.repeat(65537),expectedHash:created.json.hash})).status,413);
    assert.equal((await request(server,'POST','/api/files/preview',{path:'notes.md',content:'\n'.repeat(2000),expectedHash:created.json.hash})).status,413);
    fs.writeFileSync(path.join(tmp,'notes.md'),'another writer');
    const changed = await request(server,'PUT','/api/files/content',{path:'notes.md',content:'reviewed draft',expectedHash:preview.json.expectedHash});
    assert.equal(changed.status,409); assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'another writer');
    fs.writeFileSync(path.join(tmp,'notes.md'),'hello from editor');

    const baseline = created.json.hash;
    const undoSaved = await request(server,'PUT','/api/files/content',{path:'notes.md',content:'undo target',expectedHash:baseline});
    assert.ok(undoSaved.json.undo?.id);
    const undoId = undoSaved.json.undo.id;
    const undoPreview = await request(server,'GET','/api/files/undo/'+undoId);
    assert.equal(undoPreview.status,200);assert.ok(undoPreview.json.diff.includes('+hello from editor'));
    assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'undo target');
    const restoreInput={confirmed:true,expectedHash:undoSaved.json.hash,workspaceRoot:tmp,hostInstanceId:config.hostInstanceId};
    assert.equal((await request(server,'POST','/api/files/undo/'+undoId,{...restoreInput,hostInstanceId:'wrong'})).status,409);
    const wrongUndoType = await request(server,'POST','/api/files/undo/'+undoId,{...restoreInput,confirmed:'true'});
    assert.equal(wrongUndoType.status,400); assert.equal(wrongUndoType.json.code,'E_BAD_API_REQUEST');
    const unknownUndoWrapper = await request(server,'POST','/api/files/undo/'+undoId,{...restoreInput,unexpected:true});
    assert.equal(unknownUndoWrapper.status,400); assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'undo target');
    fs.writeFileSync(path.join(tmp,'notes.md'),'external edit');
    assert.equal((await request(server,'POST','/api/files/undo/'+undoId,restoreInput)).status,409);
    assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'external edit');
    fs.writeFileSync(path.join(tmp,'notes.md'),'undo target'); // Fixture restoration, never automatic product recovery.
    const restored=await request(server,'POST','/api/files/undo/'+undoId,restoreInput);
    assert.equal(restored.status,200);assert.equal(restored.json.hash,baseline);
    assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'hello from editor');
    assert.equal((await request(server,'POST','/api/files/undo/'+undoId,restoreInput)).status,409);
    const undoStore=require('../src/utils/editorUndo');
    assert.equal(undoStore.capture('notes.md',baseline,'x'.repeat(65537)),null);
    assert.equal(undoStore.capture('notes.md',baseline,'hello from editor'),null);
    assert.equal(undoStore.capture('.env',baseline,'x'),null);
    const snapshot=undoStore.capture('notes.md',baseline,'capacity fixture');
    const oldest=undoStore.remember(snapshot,snapshot.afterHash);
    for(let n=0;n<16;n++) undoStore.remember(snapshot,snapshot.afterHash);
    assert.throws(()=>undoStore.preview(oldest.id),/不存在/);
    const expiring=undoStore.remember(snapshot,snapshot.afterHash);
    const now=Date.now;
    try { Date.now=()=>now()+16*60000;assert.throws(()=>undoStore.preview(expiring.id),/过期/); }
    finally { Date.now=now; }

    const blocked = await request(server, 'PUT', '/api/files/content', {
      path: '.env',
      content: 'SECRET=1',
      createOnly: true
    });
    assert.ok(blocked.status >= 400);
    assert.ok(/ACCESS_DENIED|outside workspace|sensitive/i.test(String(blocked.json && blocked.json.error)));
    assert.ok(!fs.existsSync(path.join(tmp, '.env')));

    const escaped = await request(server, 'PUT', '/api/files/content', {
      path: '../outside.txt',
      content: 'nope',
      createOnly: true
    });
    assert.ok(escaped.status >= 400);
    assert.ok(/outside workspace/i.test(String(escaped.json && escaped.json.error)));

    const stale = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md',
      content: 'newer',
      expectedHash: 'd'.repeat(64)
    });
    assert.strictEqual(stale.status, 409);
    assert.match(stale.json.detail.retryHint, /Stop this write/);
    assert.ok(!stale.json.detail.retryHint.includes('then retry'));
    assert.ok(/STALE_FILE/.test(String(stale.json && stale.json.error)));
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');

    const customSaved = await request(server,'PUT','/api/customizations',{environment:{shell:'powershell',notes:'first'}});
    assert.strictEqual(customSaved.status,200);
    const customPatched = await request(server,'PUT','/api/customizations',{environment:{notes:'second'}});
    assert.strictEqual(customPatched.json.customizations.environment.shell,'powershell');
    const beforeCustom = fs.readFileSync(path.join(tmp,'.webagent/customizations.json'));
    const rejectedCustomQuery = await request(server, 'PUT', '/api/customizations?unexpected=true', { preference: 'MUST NOT SAVE' });
    assert.equal(rejectedCustomQuery.status, 400);
    assert.equal(rejectedCustomQuery.json.code, 'E_BAD_API_REQUEST');
    assert.ok(fs.readFileSync(path.join(tmp, '.webagent/customizations.json')).equals(beforeCustom));
    fs.writeFileSync(path.join(tmp,'.webagent/customizations.json'),'{broken');
    const badLoad = await request(server,'GET','/api/customizations');
    assert.strictEqual(badLoad.status,500);
    assert.strictEqual(badLoad.json.code,'E_CUSTOM_CORRUPT');
    assert.strictEqual(fs.readFileSync(path.join(tmp,'.webagent/customizations.json'),'utf8'),'{broken');
    fs.writeFileSync(path.join(tmp,'.webagent/customizations.json'),beforeCustom);

    const badCustom = await request(server,'PUT','/api/customizations',{instructions:{bad:true}});
    assert.strictEqual(badCustom.status,400);
    assert.strictEqual(badCustom.json.success,false);
    assert.strictEqual(badCustom.json.code,'E_BAD_ARGS');
    assert.ok(fs.readFileSync(path.join(tmp,'.webagent/customizations.json')).equals(beforeCustom));
    for (const body of [{}, []]) {
      const rejected = await request(server, 'PUT', '/api/customizations', body);
      assert.equal(rejected.status, 400, 'empty or non-record customization patches must not rewrite state');
      assert.equal(rejected.json.code, 'E_BAD_ARGS');
      assert.ok(fs.readFileSync(path.join(tmp, '.webagent/customizations.json')).equals(beforeCustom));
    }
    for (const body of [
      { undocumentedSecret: 'request-secret-must-not-persist' },
      { environment: { shell: 'bash', authorization: 'nested-request-secret' } },
      { agents: [{ id: 'fixture', name: 'Fixture', role: 'review', token: 'item-request-secret' }] }
    ]) {
      const rejected = await request(server, 'PUT', '/api/customizations', body);
      assert.equal(rejected.status, 400, 'customization writes only accept the documented fixed schema');
      assert.equal(rejected.json.code, 'E_BAD_ARGS');
      assert.ok(!JSON.stringify(rejected.json).includes('request-secret'));
      assert.ok(fs.readFileSync(path.join(tmp, '.webagent/customizations.json')).equals(beforeCustom));
    }
    {
      const legacyCustom = JSON.parse(beforeCustom.toString('utf8'));
      legacyCustom.internalToken = 'legacy-custom-top-secret';
      legacyCustom.environment.authorization = 'legacy-custom-nested-secret';
      legacyCustom.agents[0].password = 'legacy-custom-item-secret';
      fs.writeFileSync(path.join(tmp, '.webagent/customizations.json'), JSON.stringify(legacyCustom));
      const projectedCustom = await request(server, 'GET', '/api/customizations');
      assert.equal(projectedCustom.status, 200);
      assert.deepEqual(Object.keys(projectedCustom.json).sort(),
        Object.keys(require('../src/models/customizations').defaults()).sort());
      assert.deepEqual(Object.keys(projectedCustom.json.environment).sort(),
        Object.keys(require('../src/models/customizations').defaults().environment).sort());
      assert.deepEqual(Object.keys(projectedCustom.json.agents[0]).sort(), ['id', 'name', 'role']);
      for (const secret of ['legacy-custom-top-secret', 'legacy-custom-nested-secret', 'legacy-custom-item-secret']) {
        assert.ok(!JSON.stringify(projectedCustom.json).includes(secret));
      }
      fs.writeFileSync(path.join(tmp, '.webagent/customizations.json'), beforeCustom);
    }

    const unknownSkill = await request(server, 'POST', '/api/skills', {
      name: 'unknown-wrapper-skill', content: 'MUST NOT WRITE', unexpected: true
    });
    assert.strictEqual(unknownSkill.status, 400);
    assert.ok(!fs.existsSync(path.join(tmp, '.webagent/skills/unknown-wrapper-skill/SKILL.md')));
    assert.strictEqual((await request(server, 'GET', '/api/skills?unexpected=true')).status, 400);
    assert.strictEqual((await request(server, 'GET', '/api/skills/load?cursor=0&unexpected=true')).status, 400);
    const skill = await request(server, 'POST', '/api/skills', {
      name: 'demo-skill',
      content: '# Skill: demo\n'
    });
    assert.strictEqual(skill.status, 200);
    assert.ok(fs.existsSync(path.join(tmp, '.webagent/skills/demo-skill/SKILL.md')));
    const duplicateSkill = await request(server, 'POST', '/api/skills', {name:'demo skill',content:'MUST NOT OVERWRITE'});
    assert.strictEqual(duplicateSkill.status, 400, 'normalized duplicate name is not overwrite consent');
    assert.match(duplicateSkill.json.error, /already exists/);
    assert.strictEqual(fs.readFileSync(path.join(tmp, '.webagent/skills/demo-skill/SKILL.md'), 'utf8'), '# Skill: demo\n');
    const racingSkills = await Promise.all(['FIRST', 'SECOND'].map(content => request(server, 'POST', '/api/skills', {name:'concurrent-skill',content})));
    assert.deepStrictEqual(racingSkills.map(result => result.status).sort(), [200,400]);
    const winner = racingSkills[0].status === 200 ? 'FIRST' : 'SECOND';
    assert.strictEqual(fs.readFileSync(path.join(tmp,'.webagent/skills/concurrent-skill/SKILL.md'),'utf8'), winner);
    // A write can return normally yet fail read-back verification. The route must not turn
    // that result object into a confirmed Skill creation.
    const uncertainSkillPath = '.webagent/skills/verification-race/SKILL.md';
    require('../src/utils/eventBus').once('file_written', event => {
      if (event.filePath === uncertainSkillPath) fs.rmSync(path.join(tmp, uncertainSkillPath), { force: true });
    });
    const uncertainSkill = await request(server, 'POST', '/api/skills', {name:'verification-race',content:'NOT VERIFIED'});
    assert.strictEqual(uncertainSkill.status, 409);
    assert.strictEqual(uncertainSkill.json.success, false);
    assert.strictEqual(uncertainSkill.json.code, 'E_VERIFY_UNKNOWN');
    assert.strictEqual(uncertainSkill.json.verification.state, 'unknown');
    assert.ok(!fs.existsSync(path.join(tmp, uncertainSkillPath)));
    const listed = await request(server, 'GET', '/api/skills');
    assert.strictEqual(listed.status, 200);
    const demoSkill = (listed.json.skills || []).find((s) => s.name === 'demo-skill');
    assert.ok(demoSkill);
    assert.ok(demoSkill.skillFile && /SKILL\.md$/.test(String(demoSkill.skillFile).replace(/\\/g, '/')));
    assert.ok(demoSkill.skillFileAbs && path.isAbsolute(demoSkill.skillFileAbs));

    const opened = await request(server, 'GET', '/api/files/content?path=notes.md');
    assert.strictEqual(opened.status, 200);
    const unknownReadQuery = await request(server, 'GET', '/api/files/content?path=notes.md&unexpected=true');
    assert.strictEqual(unknownReadQuery.status, 400);
    assert.strictEqual(unknownReadQuery.json.code, 'E_BAD_API_REQUEST');
    assert.strictEqual(opened.json.content, 'hello from editor');
    assert.ok(opened.json.hash);

    const mcpSession = require('../src/mcp/session');
    mcpSession.touch({ ip: '127.0.0.1' }, {
      key: 'peer:status-projection-fixture', incCall: true, injected: 'session-record-secret',
      clientInfo: {
        name: 'fixture-client', title: 'Fixture Client', version: '1.2.3',
        authorization: 'client-info-secret', nested: { password: 'nested-client-info-secret' }
      }
    });
    const retainedSession = mcpSession.allSessions()[0];
    assert.deepEqual(Object.keys(retainedSession).sort(),
      ['busy', 'calls', 'clientInfo', 'connectedAt', 'fail', 'key', 'lastSeen']);
    assert.deepEqual(Object.keys(retainedSession.clientInfo).sort(), ['name', 'title', 'version']);
    retainedSession.clientInfo.name = 'consumer-mutation-must-not-stick';
    retainedSession.injected = 'consumer-mutation-secret';
    const retainedAgain = mcpSession.allSessions()[0];
    assert.equal(retainedAgain.clientInfo.name, 'fixture-client');
    assert.ok(!Object.hasOwn(retainedAgain, 'injected'));
    const projectedSessionStatus = await request(server, 'GET', '/api/status');
    assert.equal(projectedSessionStatus.status, 200);
    const projectedSession = projectedSessionStatus.json.mcpSession.latest;
    assert.deepEqual(Object.keys(projectedSession).sort(),
      ['busy', 'calls', 'clientInfo', 'connectedAt', 'fail', 'key', 'lastSeen']);
    assert.deepEqual(Object.keys(projectedSession.clientInfo).sort(), ['name', 'title', 'version']);
    assert.deepEqual(projectedSessionStatus.json.mcpSession.sessions[0], projectedSession);
    for (const secret of [
      'session-record-secret', 'client-info-secret', 'nested-client-info-secret',
      'consumer-mutation-must-not-stick', 'consumer-mutation-secret'
    ]) {
      assert.ok(!JSON.stringify(projectedSessionStatus.json).includes(secret));
    }
    mcpSession.reset();

    const rejectedModelQuery = await request(server, 'POST', '/api/models?unexpected=true', {
      model: { id: 'query-must-not-save', name: 'MUST NOT SAVE' }
    });
    assert.equal(rejectedModelQuery.status, 400);
    assert.equal(rejectedModelQuery.json.code, 'E_BAD_API_REQUEST');
    assert.ok(!(await request(server, 'GET', '/api/models')).json.models.some(model => model.id === 'query-must-not-save'));

    const saved = await request(server, 'POST', '/api/models', {
      model: {
        id: 'custom-1',
        name: 'Demo',
        protocol: 'openai',
        modelId: 'demo-l',
        baseUrl: 'https://example.com/v1',
        apiKey: 'sk-secret',
        group: 'demo-group',
        contextSize: '128K',
        caps: ['vision'],
        pricing: '$1/M'
      }
    });
    assert.strictEqual(saved.status, 200);
    const status = await request(server, 'GET', '/api/status');
    assert.strictEqual(status.status, 200);
    const row = (status.json.models || []).find((m) => m.id === 'custom-1');
    assert.ok(row, 'GET /api/status must list the saved model (workbench table source)');
    assert.strictEqual(row.group, 'demo-group');
    assert.strictEqual(row.contextSize, '128K');
    assert.deepStrictEqual(row.caps, ['vision']);
    assert.strictEqual(row.pricing, '$1/M');
    assert.strictEqual(row.hasKey, true);
    assert.ok(!('apiKey' in row));

    const configPath = path.join(tmp, '.webagent/config.json');
    const redactedModels = await request(server, 'GET', '/api/models');
    assert.strictEqual(redactedModels.json.models.find(model => model.id === 'custom-1').apiKey, '••••');
    {
      const modelStore = require('../src/models/store');
      const legacyConfig = modelStore.load();
      const legacyModel = legacyConfig.models.find(model => model.id === 'custom-1');
      legacyModel.authorization = 'legacy-secret-must-not-leak';
      legacyModel.internalToken = 'legacy-token-must-not-leak';
      legacyModel.metadata = { password: 'nested-secret-must-not-leak' };
      legacyModel.caps = ['vision', { authorization: 'typed-model-secret-must-not-leak' }];
      legacyConfig.multiModel.authorization = 'multi-secret-must-not-leak';
      legacyConfig.multiModel.mergeModel = { authorization: 'typed-multi-secret-must-not-leak' };
      modelStore.save(legacyConfig);
      const projectedModels = await request(server, 'GET', '/api/models');
      const projectedStatus = await request(server, 'GET', '/api/status');
      assert.strictEqual(projectedModels.status, 200);
      assert.strictEqual(projectedStatus.status, 200);
      const projectedModel = projectedModels.json.models.find(model => model.id === 'custom-1');
      assert.deepStrictEqual(Object.keys(projectedModel).sort(),
        Object.keys(redactedModels.json.models.find(model => model.id === 'custom-1')).filter(key => key !== 'caps').sort(),
        'the public model response only projects documented, well-typed fields from legacy configuration');
      assert.deepStrictEqual(Object.keys(projectedModels.json.multiModel).sort(),
        Object.keys(redactedModels.json.multiModel).filter(key => key !== 'mergeModel').sort(),
        'the public multi-model response only projects documented, well-typed fields from legacy configuration');
      assert.deepStrictEqual(projectedStatus.json.models.find(model => model.id === 'custom-1').caps, []);
      for (const secret of ['legacy-secret-must-not-leak', 'legacy-token-must-not-leak',
        'nested-secret-must-not-leak', 'multi-secret-must-not-leak',
        'typed-model-secret-must-not-leak', 'typed-multi-secret-must-not-leak']) {
        assert.ok(!JSON.stringify(projectedModels.json).includes(secret));
        assert.ok(!JSON.stringify(projectedStatus.json).includes(secret));
      }
    }
    const redactedRoundTrip = await request(server, 'POST', '/api/models', redactedModels.json);
    assert.strictEqual(redactedRoundTrip.status, 200, 'legacy model-table updates remain compatible');
    const roundTripConfig = fs.readFileSync(configPath, 'utf8');
    assert.strictEqual(JSON.parse(roundTripConfig).models.find(model => model.id === 'custom-1').apiKey, 'sk-secret',
      'a redacted GET response cannot overwrite the stored credential');
    for (const secret of ['legacy-secret-must-not-leak', 'legacy-token-must-not-leak',
      'nested-secret-must-not-leak', 'multi-secret-must-not-leak',
      'typed-model-secret-must-not-leak', 'typed-multi-secret-must-not-leak']) assert.ok(!roundTripConfig.includes(secret));
    const validMultiModel = { enabled: false, mergeModel: 'builtin', thinkLevel: 'medium', mergeAllowsRead: false, maxBranches: 3 };
    const savedMultiModel = await request(server, 'POST', '/api/models', { multiModel: validMultiModel });
    assert.strictEqual(savedMultiModel.status, 200);
    assert.strictEqual(savedMultiModel.json.modelCount, redactedModels.json.models.length);
    assert.deepStrictEqual(savedMultiModel.json.multiModel, validMultiModel);
    const beforeInvalidModelSettings = fs.readFileSync(configPath, 'utf8');
    for (const body of [
      {}, [], { typo: true }, { activeModelId: '' }, { activeModelId: 7 }, { activeModelId: 'missing-model' },
      { models: [] }, { models: redactedModels.json.models, model: { id: 'mixed' } },
      { model: 'bad' }, { model: { id: 'bad-caps', caps: 'vision' } },
      { model: { id: 'custom-1', apiKey: 'do-not-echo', caps: 'invalid' } },
      { model: { id: 'custom-1', undocumentedSecret: 'do-not-echo' } },
      { model: { id: 'custom-1', baseUrl: 'https://retargeted.invalid/v1' } },
      { model: { id: 'custom-1', apiKey: '••••', baseUrl: 'https://retargeted.invalid/v1' } },
      { multiModel: {} }, { multiModel: { enabled: 'false' } }, { multiModel: { maxBranches: 9 } },
      { multiModel: { thinkLevel: 'extreme' } }, { multiModel: { mergeModel: 'missing-model' } },
      { multiModel: { typo: true } }
    ]) {
      const rejected = await request(server, 'POST', '/api/models', body);
      assert.strictEqual(rejected.status, 400, `invalid model settings must be rejected: ${JSON.stringify(body)}`);
      assert.strictEqual(rejected.json.success, false);
      assert.strictEqual(rejected.json.code, 'E_BAD_MODEL_SETTINGS');
      assert.ok(!JSON.stringify(rejected.json).includes('do-not-echo'), 'validation errors cannot echo request credentials');
      assert.strictEqual(fs.readFileSync(configPath, 'utf8'), beforeInvalidModelSettings, 'invalid settings cannot rewrite configuration');
    }
    const retargetedModel = await request(server, 'POST', '/api/models', {
      model: { id: 'custom-1', baseUrl: 'https://retargeted.example/v1', apiKey: 'replacement-secret' }
    });
    assert.strictEqual(retargetedModel.status, 200, 'an explicit replacement credential permits a connection change');
    assert.ok(!JSON.stringify(retargetedModel.json).includes('replacement-secret'), 'model update responses cannot echo credentials');
    assert.strictEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')).models.find(model => model.id === 'custom-1').apiKey, 'replacement-secret');
    const restoredModel = await request(server, 'POST', '/api/models', {
      model: { id: 'custom-1', baseUrl: 'https://example.com/v1', apiKey: 'sk-secret' }
    });
    assert.strictEqual(restoredModel.status, 200);
    // Unknown provider-probe wrapper fields fail before credentials can reach an endpoint.
    const strictProbeFetch = global.fetch;
    let rejectedProbeCalls = 0;
    global.fetch = async () => { rejectedProbeCalls++; throw new Error('unknown wrapper reached fetch'); };
    try {
      const rejectedProbeQuery = await request(server, 'POST', '/api/providers/probe?unexpected=true', {
        baseUrl: 'https://strict-probe.test/v1', apiKey: 'strict-probe-key'
      });
      assert.strictEqual(rejectedProbeQuery.status, 400);
      assert.strictEqual(rejectedProbeQuery.json.code, 'E_BAD_API_REQUEST');
      assert.strictEqual(rejectedProbeCalls, 0);
      const rejectedProbe = await request(server, 'POST', '/api/providers/probe', {
        baseUrl: 'https://strict-probe.test/v1', apiKey: 'strict-probe-key', autoSave: true
      });
      assert.strictEqual(rejectedProbe.status, 400);
      assert.strictEqual(rejectedProbe.json.code, 'E_BAD_PROVIDER');
      assert.strictEqual(rejectedProbeCalls, 0);
      assert.ok(!JSON.stringify(rejectedProbe.json).includes('strict-probe-key'));
    } finally { global.fetch = strictProbeFetch; }

    // Disconnecting the local discovery request aborts its upstream signal.
    const previousFetch=global.fetch;
    let upstreamStarted, upstreamCancelled, disconnectTimer;
    const started=new Promise(resolve=>{upstreamStarted=resolve});
    const cancelled=new Promise(resolve=>{upstreamCancelled=resolve});
    global.fetch=async(url,options)=>{
      upstreamStarted();
      return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{upstreamCancelled();reject(new Error('cancelled fixture'));},{once:true}));
    };
    try {
      const discoveryRequest=http.request({hostname:'127.0.0.1',port:server.address().port,path:'/api/providers/probe',method:'POST',headers:{'Content-Type':'application/json'}});
      discoveryRequest.on('error',()=>{});
      discoveryRequest.end(JSON.stringify({baseUrl:'https://fixture.test/v1',apiKey:'fixture-key'}));
      const watchdog=new Promise((resolve,reject)=>{disconnectTimer=setTimeout(()=>reject(new Error('discovery disconnect was not propagated')),2000);});
      await Promise.race([started,watchdog]);
      discoveryRequest.destroy();
      await Promise.race([cancelled,watchdog]);
    } finally {clearTimeout(disconnectTimer);global.fetch=previousFetch;}

    // Add Provider is append-only and must never round-trip redacted old keys.
    const store = require('../src/models/store');
    const previous = store.load();
    const providerInput = {baseUrl:'https://api.second.test/v1/',apiKey:'second-fixture-key',vision:true,
      models:[{id:'same/name',name:'Second model',caps:[]},{id:'same-name',caps:['vision']}]};
    const addedProvider = await request(server,'POST','/api/models',{addProvider:providerInput});
    assert.equal(addedProvider.status,200);
    assert.equal(addedProvider.json.success,true);
    let afterProvider = store.load();
    assert.equal(afterProvider.models.length,previous.models.length+2);
    assert.equal(afterProvider.activeModelId,previous.activeModelId,'adding never changes the current choice');
    assert.deepStrictEqual(afterProvider.models.slice(0,previous.models.length),previous.models);
    assert.deepStrictEqual(afterProvider.bridge,previous.bridge);
    const appended = afterProvider.models.slice(previous.models.length);
    assert.notEqual(appended[0].id,appended[1].id,'normalization must not collapse distinct model IDs');
    assert.ok(appended.every(m=>m.apiKey==='second-fixture-key' && m.vision));
    assert.ok(!JSON.stringify(addedProvider.json).includes('fixture-key'));
    const providerBytes=fs.readFileSync(configPath,'utf8');
    const duplicateProvider=await request(server,'POST','/api/models',{addProvider:{...providerInput,apiKey:'replacement-key'}});
    assert.equal(duplicateProvider.status,409);
    assert.equal(fs.readFileSync(configPath,'utf8'),providerBytes);
    const legacyCollision=await request(server,'POST','/api/models',{addProvider:{baseUrl:'https://example.com/v1/chat/completions',apiKey:'new-key',models:[{id:'demo-l'}]}});
    assert.equal(legacyCollision.status,409,'legacy provider IDs also protect existing credentials');
    for (const input of [null,{}, {...providerInput,models:[null]}, {...providerInput,models:[{id:'x'},{id:'x'}]},
      {...providerInput,models:Array.from({length:101},(_,i)=>({id:String(i)}))},
      {...providerInput,apiKey:'••••'}, {...providerInput,baseUrl:'https://user:password@example.test/v1'},
      {...providerInput,baseUrl:'https://example.test/v1?api_key=secret'},
      {...providerInput,models:[{id:'x',caps:{}}]},
      {baseUrl:'https://unknown-wrapper.test/v1',apiKey:'wrapper-secret',models:[{id:'x'}],autoActivate:true},
      {baseUrl:'https://unknown-catalog.test/v1',apiKey:'catalog-secret',models:[{id:'x',authorization:'hidden'}]}]) {
      const bad=await request(server,'POST','/api/models',{addProvider:input});
      assert.equal(bad.status,400);
      if (input && typeof input.apiKey === 'string') assert.ok(!JSON.stringify(bad.json).includes(input.apiKey));
      assert.equal(fs.readFileSync(configPath,'utf8'),providerBytes);
    }
    assert.equal((await request(server,'POST','/api/models',{addProvider:providerInput,models:[]})).status,400);
    assert.equal(fs.readFileSync(configPath,'utf8'),providerBytes);
    const tooManyModels = await request(server, 'POST', '/api/models', { addProvider: {
      baseUrl: 'https://capacity.test/v1', apiKey: 'capacity-key',
      models: Array.from({ length: 100 }, (_, index) => ({ id: `capacity-${index}` }))
    } });
    assert.equal(tooManyModels.status, 400, 'provider append cannot grow the stored catalog beyond 100 models');
    assert.equal(fs.readFileSync(configPath, 'utf8'), providerBytes);
    // Two overlapping HTTP requests are serialized by the synchronous local save path.
    const parallel=await Promise.all(['third','fourth'].map(name=>request(server,'POST','/api/models',{
      addProvider:{baseUrl:`https://${name}.test/v1`,apiKey:`${name}-key`,models:[{id:'shared-model'}]}
    })));
    assert.ok(parallel.every(response=>response.status===200));
    afterProvider=store.load();assert.equal(afterProvider.models.length,previous.models.length+4);
    assert.equal(afterProvider.models.find(m=>m.id==='custom-1').apiKey,'sk-secret');
  } finally {
    require('../src/tools/ptyJobs').resetForTests();
    require('../src/utils/connectionCheck').clear();
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('apiFiles tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
