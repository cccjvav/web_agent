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
    fs.writeFileSync(path.join(tmp, 'checkpoint-http.txt'), 'HTTP original');
    const checkpointBinding = { workspaceRoot: tmp, hostInstanceId: config.hostInstanceId };
    assert.equal((await request(server, 'POST', '/api/checkpoints', { paths: ['checkpoint-http.txt'], confirmed: true })).status, 400);
    const checkpointCreated = await request(server, 'POST', '/api/checkpoints', { ...checkpointBinding, paths: ['checkpoint-http.txt'], confirmed: true });
    assert.equal(checkpointCreated.status, 200);
    const checkpointId = checkpointCreated.json.id;
    fs.writeFileSync(path.join(tmp, 'checkpoint-http.txt'), 'HTTP modified');
    const checkpointPreview = await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/preview', checkpointBinding);
    assert.equal(checkpointPreview.status, 200);
    assert.equal((await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/restore', { ...checkpointBinding, previewId: checkpointPreview.json.previewId, confirmed: 'true' })).status, 400);
    const checkpointRestored = await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/restore', { ...checkpointBinding, previewId: checkpointPreview.json.previewId, confirmed: true });
    assert.equal(checkpointRestored.json.result.status, 'succeeded');
    assert.equal(fs.readFileSync(path.join(tmp, 'checkpoint-http.txt'), 'utf8'), 'HTTP original');
    assert.equal((await request(server, 'GET', '/api/checkpoints')).json.find(item => item.id === checkpointId).state, 'consumed');
    assert.equal((await request(server, 'POST', '/api/checkpoints/' + checkpointId + '/remove', checkpointBinding)).status, 200);

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

    const customSaved = await request(server,'PUT','/api/customizations',{environment:{shell:'powershell',notes:'first'}});
    assert.strictEqual(customSaved.status,200);
    const customPatched = await request(server,'PUT','/api/customizations',{environment:{notes:'second'}});
    assert.strictEqual(customPatched.json.customizations.environment.shell,'powershell');
    const beforeCustom = fs.readFileSync(path.join(tmp,'.webagent/customizations.json'));
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
    const configPath=path.join(tmp,'.webagent/config.json');
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
      {...providerInput,models:[{id:'x',caps:{}}]}]) {
      const bad=await request(server,'POST','/api/models',{addProvider:input});
      assert.equal(bad.status,400);
      assert.equal(fs.readFileSync(configPath,'utf8'),providerBytes);
    }
    assert.equal((await request(server,'POST','/api/models',{addProvider:providerInput,models:[]})).status,400);
    assert.equal(fs.readFileSync(configPath,'utf8'),providerBytes);
    // Two overlapping HTTP requests are serialized by the synchronous local save path.
    const parallel=await Promise.all(['third','fourth'].map(name=>request(server,'POST','/api/models',{
      addProvider:{baseUrl:`https://${name}.test/v1`,apiKey:`${name}-key`,models:[{id:'shared-model'}]}
    })));
    assert.ok(parallel.every(response=>response.status===200));
    afterProvider=store.load();assert.equal(afterProvider.models.length,previous.models.length+4);
    assert.equal(afterProvider.models.find(m=>m.id==='custom-1').apiKey,'sk-secret');
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
