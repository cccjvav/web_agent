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
    const created = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md',
      content: 'hello from editor'
    });
    assert.strictEqual(created.status, 200);
    assert.strictEqual(created.json.success, true);
    assert.ok(created.json.hash);
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');
    assert.ok(!fs.readdirSync(tmp).some((n) => n.includes('.tmp.')));

    const preview = await request(server, 'POST', '/api/files/preview', {path:'notes.md',content:'reviewed draft',expectedHash:created.json.hash});
    assert.equal(preview.status,200); assert.ok(preview.json.diff.includes('+reviewed draft'));
    assert.equal(preview.json.expectedHash,created.json.hash);
    assert.equal(fs.readFileSync(path.join(tmp,'notes.md'),'utf8'),'hello from editor','preview never writes');
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
    assert.equal((await request(server,'POST','/api/files/undo/'+undoId,{...restoreInput,confirmed:'true'})).status,409);
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
      content: 'SECRET=1'
    });
    assert.ok(blocked.status >= 400);
    assert.ok(/ACCESS_DENIED|outside workspace|sensitive/i.test(String(blocked.json && blocked.json.error)));
    assert.ok(!fs.existsSync(path.join(tmp, '.env')));

    const escaped = await request(server, 'PUT', '/api/files/content', {
      path: '../outside.txt',
      content: 'nope'
    });
    assert.ok(escaped.status >= 400);
    assert.ok(/outside workspace/i.test(String(escaped.json && escaped.json.error)));

    const stale = await request(server, 'PUT', '/api/files/content', {
      path: 'notes.md',
      content: 'newer',
      expectedHash: 'deadbeef'
    });
    assert.strictEqual(stale.status, 409);
    assert.match(stale.json.detail.retryHint, /Stop this write/);
    assert.ok(!stale.json.detail.retryHint.includes('then retry'));
    assert.ok(/STALE_FILE/.test(String(stale.json && stale.json.error)));
    assert.strictEqual(fs.readFileSync(path.join(tmp, 'notes.md'), 'utf8'), 'hello from editor');

    const skill = await request(server, 'POST', '/api/skills', {
      name: 'demo-skill',
      content: '# Skill: demo\n'
    });
    assert.strictEqual(skill.status, 200);
    assert.ok(fs.existsSync(path.join(tmp, '.webagent/skills/demo-skill/SKILL.md')));
    const listed = await request(server, 'GET', '/api/skills');
    assert.strictEqual(listed.status, 200);
    const demoSkill = (listed.json.skills || []).find((s) => s.name === 'demo-skill');
    assert.ok(demoSkill);
    assert.ok(demoSkill.skillFile && /SKILL\.md$/.test(String(demoSkill.skillFile).replace(/\\/g, '/')));
    assert.ok(demoSkill.skillFileAbs && path.isAbsolute(demoSkill.skillFileAbs));

    const opened = await request(server, 'GET', '/api/files/content?path=notes.md');
    assert.strictEqual(opened.status, 200);
    assert.strictEqual(opened.json.content, 'hello from editor');
    assert.ok(opened.json.hash);

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
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log('apiFiles tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
