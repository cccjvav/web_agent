'use strict';
// Real browser + real local MCP. Not part of the DOM-fixture test runner.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function docsViewerBrowser(browser) {
  const fixture = await browser.newPage(), errors = [];
  fixture.on('pageerror', error => errors.push(error.message));
  const docsRoot = path.resolve(__dirname, '../../../docs-site');
  try {
    await fixture.route('**/*', route => {
      const url = new URL(route.request().url());
      const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      const types = { 'index.html': 'text/html', 'app.js': 'text/javascript', 'content.js': 'text/javascript', 'styles.css': 'text/css' };
      if (url.origin !== 'https://docs.example.test' || !types[name]) return route.abort();
      return route.fulfill({ status: 200, contentType: types[name], body: fs.readFileSync(path.join(docsRoot, name)) });
    });
    await fixture.goto('https://docs.example.test/');
    await fixture.fill('#q', '工作');
    await fixture.locator('#search-hits a').first().waitFor();
    await fixture.fill('#q', 'this-query-has-no-matches');
    await fixture.waitForFunction(() => document.querySelector('#search-hits')?.textContent.includes('没有匹配'));
    assert.equal(await fixture.locator('#search-hits a').count(), 0);
    await fixture.fill('#q', ''); await fixture.locator('#search-hits').waitFor({ state: 'detached' });
    await fixture.evaluate(() => { location.hash = '#/guide/%xx'; });
    await fixture.locator('.guide-sec').first().waitFor();
    const anchor = await fixture.evaluate(() => {
      Element.prototype.scrollIntoView = function () { window.lastDocAnchor = this.id; };
      const documentEntry = window.DOCS.fileIndex.find(item => item.path.endsWith('/请求分发详解.md'));
      const target = window.DOCS.files[documentEntry.id].toc.find(item => item.id.includes('/'));
      location.hash = '#/files/' + documentEntry.id + '/' + target.id;
      return target.id;
    });
    await fixture.waitForFunction(target => window.lastDocAnchor === target, anchor);
    assert.deepEqual(errors, [], 'actual docs browser reports no unhandled rendering errors');
  } finally { await fixture.close(); }
}
async function probeHudBrowser(browser) {
  // Only the standalone UI module, in an empty page with all network blocked.
  // Never inject main.js, the interceptor or any credential/trace modules.
  const fixture = await browser.newPage();
  const errors = []; fixture.on('pageerror', error => errors.push(error.message));
  try {
    await fixture.route('**/*', route => route.abort());
    const source = fs.readFileSync(path.resolve(__dirname, '../../../arena-model-probe/src/ui.js'), 'utf8');
    await fixture.addScriptTag({ content: source.replace(/^export /gm, '') + '\nwindow.fixtureHUD = new HUD(document.body);' });
    const result = await fixture.evaluate(() => {
      const hud = window.fixtureHUD;
      const beginDrag = () => {
        const rect = hud.root.getBoundingClientRect();
        hud.root.querySelector('.hd').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: rect.left + 5, clientY: rect.top + 5 }));
      };
      beginDrag();
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 200 }));
      const moved = hud.root.style.left;
      window.dispatchEvent(new Event('blur'));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300 }));
      const afterBlur = hud.root.style.left;
      beginDrag();
      const close = hud.root.querySelector('[data-act="close"]');
      const warning = close.title; close.click();
      const closedLeft = hud.root.style.left;
      beginDrag(); // Detached root must no longer start document-level listeners.
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 400 }));
      hud.render(null); hud.log('must not retain this'); hud.destroy();
      return { moved, afterBlur, closedLeft, afterClose: hud.root.style.left, warning, removed: !document.getElementById('amp-hud'), destroyed: hud.destroyed, logs: hud.logs.length };
    });
    assert.strictEqual(result.moved, '295px');
    assert.strictEqual(result.afterBlur, result.moved);
    assert.strictEqual(result.afterClose, result.closedLeft);
    assert.ok(result.removed && result.destroyed && result.warning.includes('不停止采集'));
    assert.strictEqual(result.logs, 0); assert.deepStrictEqual(errors, []);
  } finally { await fixture.close(); }
}
async function bridgeLifecycleBrowser(browser, base) {
  const page = await browser.newPage({viewport:{width:1280,height:900}}), errors = [];
  let snapshot, starts = 0, stops = 0, release, entered, failRead = false;
  const pendingStart = new Promise(resolve=>{entered=resolve;});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/status',async route=>{
    if(failRead) return route.fulfill({status:503,json:{success:false}});
    const response = await route.fetch(); snapshot = await response.json();
    return route.fulfill({response,json:snapshot});
  });
  await page.route('**/api/bridge/start',async route=>{
    starts++;
    const body = route.request().postDataJSON();
    assert.equal(body.hostInstanceId,snapshot.identity.hostInstanceId);
    if(starts===1) await new Promise(resolve=>{release=resolve;entered();});
    failRead=true;
    const secretKey=snapshot.secretKey;
    await route.fulfill({json:{success:true,running:true,provider:body.tunnelProvider,secretKey,
      mcpPath:'/mcp/'+secretKey,mcpUrl:'https://fixture.test/mcp/'+secretKey,mcpCanonicalUrl:'https://fixture.test/mcp'}});
  });
  await page.route('**/api/bridge/stop',async route=>{
    stops++;assert.equal(route.request().postDataJSON().hostInstanceId,snapshot.identity.hostInstanceId);
    failRead=true;
    await route.fulfill({json:{success:true,running:false}});
  });
  try {
    await page.goto(base);
    await page.waitForFunction(()=>document.querySelector('#mcp-url').textContent.includes('/mcp/'));
    // Keep the real bind handler and start function; only retain its Promise for deterministic late-response assertions.
    await page.evaluate(async()=>{
      const {ui}=await import('/js/state.js');const start=ui.startBridge;
      ui.startBridge=()=>{window.fixtureBridgeStart=start();return window.fixtureBridgeStart;};
    });
    await page.click('#menu-help');await page.click('.modal-nav [data-page="bridge"]');
    await page.click('#btn-bridge-toggle');await pendingStart;
    assert.equal(await page.evaluate(async()=> (await import('/js/bridge.js')).startBridge()),false);
    assert.equal(starts,1);
    assert.equal(await page.locator('#btn-bridge-toggle').textContent(),'停止启动');
    assert.equal(await page.locator('#btn-bridge-toggle').isEnabled(),true);
    await page.click('#btn-bridge-toggle');
    await page.waitForFunction(()=>document.querySelector('#bridge-result').textContent.includes('停止已确认，但当前状态未核对'));
    assert.equal(stops,1);
    const stoppedText=await page.locator('#bridge-result').textContent();
    release();assert.equal(await page.evaluate(()=>window.fixtureBridgeStart),false);
    assert.equal(await page.locator('#bridge-result').textContent(),stoppedText,'late start cannot replace stop result');
    assert.equal(await page.locator('#bridge-result-rb').textContent(),stoppedText);
    failRead=false;
    await page.click('#btn-bridge-toggle');
    await page.waitForFunction(()=>document.querySelector('#bridge-result').textContent.includes('启动已确认，但当前状态或地址未核对'));
    assert.equal(await page.evaluate(()=>window.fixtureBridgeStart),true);
    assert.equal(starts,2);assert.equal(stops,1);
    assert.equal(await page.locator('#mcp-banner').isVisible(),false);
    assert.deepStrictEqual(errors,[]);
  } finally {if(release) release();await page.close();}
}

async function secretRotationBrowser(browser, base) {
  const page = await browser.newPage();
  let snapshot, posts = 0, release, failRead = false, entered;
  const pendingPost = new Promise(resolve => { entered=resolve; });
  page.on('dialog', dialog => dialog.accept());
  await page.route('**/api/status', async route => {
    if (failRead) return route.fulfill({status:503,json:{success:false}});
    const response = await route.fetch(); snapshot = await response.json();
    return route.fulfill({response,json:snapshot});
  });
  await page.route('**/api/bridge/reset-secret', async route => {
    posts++;
    if (posts === 1) return route.fulfill({status:500,json:{success:false}});
    const body = route.request().postDataJSON();
    assert.equal(body.expectedSecret,snapshot.secretKey);
    assert.equal(body.hostInstanceId,snapshot.identity.hostInstanceId);
    await new Promise(resolve => { release=resolve; entered(); });
    failRead = true;
    const secretKey = 'b'.repeat(24);
    const url = new URL(snapshot.mcpUrl);
    await route.fulfill({json:{success:true,secretKey,mcpPath:'/mcp/'+secretKey,
      mcpUrl:url.origin+'/mcp/'+secretKey,mcpCanonicalUrl:url.origin+'/mcp'}});
  });
  try {
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#mcp-url').textContent.includes('/mcp/'));
    await page.click('#menu-help');
    await page.click('.modal-nav [data-page="bridge"]');
    await page.click('#page-bridge details:has(#btn-reset-secret) > summary');
    await page.click('#btn-reset-secret');
    await page.waitForFunction(() => document.querySelector('#secret-result').textContent.includes('结果未确认'));
    assert.equal(posts,1);
    await page.click('#btn-reset-secret');
    await page.waitForFunction(() => document.querySelector('#secret-result').textContent.includes('轮换已发送'));
    assert.equal(await page.locator('#btn-reset-secret').isDisabled(),true);
    assert.equal(await page.evaluate(() => document.querySelector('#btn-reset-secret').onclick()),false);
    await pendingPost;
    assert.equal(posts,2); release();
    await page.waitForFunction(() => document.querySelector('#secret-result').textContent.includes('轮换已确认，但当前地址'));
    assert.equal(posts,2);
    assert.equal(await page.locator('#btn-reset-secret').isDisabled(),false);
  } finally { if(release) release(); await page.close(); }
}

async function stdioLifecycleBrowser(browser, base) {
  const fixture=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  let malformed=true, starts=0, previewRequest;
  const preview={previewId:'stdio-ui-fixture',expiresAt:Date.now()+120000,transport:'stdio',requiresConfirmation:true,
    launch:{name:'Fixture',program:'/fixture/node',args:['server.js'],cwd:'/fixture',envKeys:['PATH']},
    programStamp:{path:'/fixture/node',bytes:42,sha256:'a'.repeat(64)},reviewFiles:[]};
  try {
    await fixture.route('**/api/external/stdio/preview',route=>{previewRequest=route.request().postDataJSON();return route.fulfill({json:malformed ? {previewId:preview.previewId} : preview});});
    await fixture.route('**/api/external/stdio/start',route=>{starts++;return route.fulfill({json:null});});
    await fixture.goto(base);
    await fixture.waitForFunction(async()=>{const {state}=await import('/js/state.js');return Boolean(state.status?.workspaceRoot && state.status?.identity?.hostInstanceId);});
    await fixture.click('#rb-bridge-tab');await fixture.click('#btn-operations');
    await fixture.fill('#ops-stdio-config',JSON.stringify({program:'/fixture/node',args:['server.js'],env:{FIXTURE_SECRET:'PRIVATE STDIO FIXTURE'}}));
    await fixture.click('#btn-stdio-preview');
    await fixture.waitForFunction(()=>document.querySelector('#ops-stdio-review').textContent.includes('预览未确认'));
    assert.equal(await fixture.isDisabled('#btn-stdio-start'),true);assert.equal(starts,0);
    assert.equal(previewRequest.env.FIXTURE_SECRET,'PRIVATE STDIO FIXTURE');
    assert.ok(!(await fixture.inputValue('#ops-stdio-config')).includes('PRIVATE STDIO FIXTURE'));
    malformed=false;await fixture.click('#btn-stdio-preview');
    await fixture.waitForFunction(()=>!document.querySelector('#btn-stdio-start').disabled);
    await fixture.fill('#ops-stdio-config',JSON.stringify({program:'/fixture/edited',args:[]}));
    assert.equal(await fixture.isDisabled('#btn-stdio-start'),true);
    assert.equal(await fixture.evaluate(()=>document.querySelector('#btn-stdio-start').onclick()),false);assert.equal(starts,0);
    await fixture.fill('#ops-stdio-config',JSON.stringify({program:'/fixture/node',args:['server.js']}));
    await fixture.click('#btn-stdio-preview');await fixture.waitForFunction(()=>!document.querySelector('#btn-stdio-start').disabled);
    fixture.once('dialog',dialog=>dialog.accept());await fixture.click('#btn-stdio-start');
    await fixture.waitForFunction(()=>document.querySelector('#ops-stdio-review').textContent.includes('启动结果未确认'));
    assert.equal(await fixture.isDisabled('#btn-stdio-start'),true);assert.equal(starts,1);
    assert.equal(await fixture.evaluate(()=>document.querySelector('#btn-stdio-start').onclick()),false);assert.equal(starts,1);
    assert.deepEqual(errors,[]);
  } finally {await fixture.close();}
}
async function externalRegistrationBrowser(browser, base) {
  const fixture=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  const record={serverId:'browser-external',name:'Fixture',transport:'http',status:'discovered',endpoint:'http://127.0.0.1:9000/mcp',publicHttps:false,tools:[]};
  let registrationRoute, submitted, posts=0, deletes=0, registered=false, stop=false;
  try {
    await fixture.route('**/api/operations',route=>route.fulfill({json:{servers:registered ? [record] : [],requests:[]}}));
    await fixture.route('**/api/external/servers',route=>{posts++;submitted=route.request().postDataJSON();registrationRoute=route;});
    await fixture.route('**/api/external/servers/*',route=>{deletes++;if(stop) registered=false;return route.fulfill({json:stop ? {removed:true,stopping:true} : {removed:false}});});
    await fixture.goto(base);await fixture.click('#rb-bridge-tab');await fixture.click('#btn-operations');
    await fixture.fill('#ops-url','http://localhost:9000/mcp');await fixture.fill('#ops-token','PRIVATE FIXTURE TOKEN');
    const sent=fixture.waitForRequest(response=>response.url().endsWith('/api/external/servers') && response.method()==='POST');
    await fixture.click('#btn-ops-add');await sent;
    assert.equal(await fixture.isDisabled('#btn-ops-add'),true);
    assert.equal(await fixture.evaluate(()=>document.querySelector('#btn-ops-add').onclick()),false);assert.equal(posts,1);
    await fixture.fill('#ops-url','http://127.0.0.1:9001/new');await fixture.fill('#ops-token','NEW TOKEN DRAFT');
    registered=true;await registrationRoute.fulfill({json:record});registrationRoute=null;
    await fixture.waitForFunction(()=>document.querySelector('#ops-external-result').textContent.includes('已确认登记') && !document.querySelector('#btn-ops-add').disabled);
    assert.equal(submitted.url,'http://localhost:9000/mcp');assert.equal(submitted.token,'PRIVATE FIXTURE TOKEN');
    assert.equal(await fixture.inputValue('#ops-token'),'NEW TOKEN DRAFT');
    await fixture.locator('#ops-servers button').first().click();
    await fixture.waitForFunction(()=>document.querySelector('#ops-external-result').textContent.includes('移除未确认'));
    assert.equal(deletes,1);assert.equal(await fixture.locator('#ops-servers button').first().isDisabled(),true);
    stop=true;await fixture.click('#btn-ops-refresh');await fixture.locator('#ops-servers button').first().click();
    await fixture.waitForFunction(()=>document.querySelector('#ops-external-result').textContent.includes('尚未确认进程退出'));
    assert.equal(deletes,2);assert.deepEqual(errors,[]);
  } finally {if(registrationRoute) await registrationRoute.abort().catch(()=>{});await fixture.close();}
}
async function checkpointCreateBrowser(browser, base, workspace) {
  const fixture=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  const name='checkpoint-create-browser.txt', target=path.join(workspace,name);
  fs.writeFileSync(target,'CHECKPOINT CREATION DOES NOT WRITE');
  let posts=0, heldRoute, createdRecord, createBody, created;
  const serverCreated=new Promise(resolve=>{created=resolve;});
  try {
    await fixture.route('**/api/checkpoints',async route=>{
      if(route.request().method()!=='POST') return route.continue();
      posts++;
      if(posts>1) return route.fulfill({json:null});
      createBody=route.request().postDataJSON();
      const response=await route.fetch();
      assert.equal(response.status(),200);createdRecord=await response.json();heldRoute=route;created();
    });
    await fixture.goto(base);
    await fixture.waitForFunction(async()=>{const {state}=await import('/js/state.js');return Boolean(state.status?.workspaceRoot && state.status?.identity?.hostInstanceId);});
    await fixture.click('#rb-bridge-tab');await fixture.click('#btn-operations');
    await fixture.fill('#checkpoint-paths',name);
    fixture.once('dialog',dialog=>dialog.accept());await fixture.click('#btn-checkpoint-create');await serverCreated;
    assert.equal(await fixture.isDisabled('#btn-checkpoint-create'),true);
    assert.equal(await fixture.evaluate(()=>document.querySelector('#btn-checkpoint-create').onclick()),false);
    assert.equal(posts,1,'in-flight create guard applies to the actual page callback');
    await fixture.fill('#checkpoint-paths','NEW UNSUBMITTED DRAFT.txt');
    await heldRoute.fulfill({json:createdRecord});heldRoute=null;
    await fixture.waitForFunction(id=>document.querySelector('#checkpoint-review').textContent.includes(id),createdRecord.id);
    await fixture.waitForFunction(()=>!document.querySelector('#btn-checkpoint-create').disabled);
    assert.equal(await fixture.inputValue('#checkpoint-paths'),'NEW UNSUBMITTED DRAFT.txt');
    assert.deepEqual(createBody.paths,[name]);assert.equal(createdRecord.state,'ready');
    assert.equal(fs.readFileSync(target,'utf8'),'CHECKPOINT CREATION DOES NOT WRITE');
    fixture.once('dialog',dialog=>dialog.accept());await fixture.click('#btn-checkpoint-create');
    await fixture.waitForFunction(()=>document.querySelector('#checkpoint-review').textContent.includes('创建未确认'));
    assert.equal(posts,2);assert.equal(await fixture.locator('#checkpoint-controls button').count(),0);
    assert.deepEqual(errors,[]);
  } finally {
    if(heldRoute) await heldRoute.abort().catch(()=>{});
    if(createdRecord) {
      const removed=await fixture.request.post(base+'/api/checkpoints/'+createdRecord.id+'/remove',{data:{workspaceRoot:createBody.workspaceRoot,hostInstanceId:createBody.hostInstanceId}});
      assert.equal(removed.status(),200);
    }
    await fixture.close();fs.rmSync(target,{force:true});
  }
}
async function checkpointResultsBrowser(browser, base) {
  const fixture=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  const record={id:'fixture-checkpoint',state:'ready',paths:['a.txt'],result:null};
  const preview={...record,previewId:'fixture-preview',files:[{path:'a.txt',expectedHash:'a'.repeat(64),targetHash:'b'.repeat(64),changed:true,diff:'fixture full diff'}]};
  let unavailable=true, wrongId=true, restores=0;
  try {
    await fixture.route('**/api/checkpoints',route=>route.fulfill(unavailable ? {status:503,json:{error:'fixture unavailable'}} : {json:[record]}));
    await fixture.route('**/api/checkpoints/*/preview',route=>route.fulfill({json:{...preview,id:wrongId ? 'wrong-id' : record.id}}));
    await fixture.route('**/api/checkpoints/*/restore',route=>{
      restores++;return route.fulfill({json:{...record,state:'consumed',result:{success:true,status:'succeeded',files:[{path:'a.txt',status:'unknown'}]}}});
    });
    await fixture.route('**/api/operations',route=>route.fulfill({json:{servers:[],requests:[{requestId:'fixture-job',kind:'workflow',status:'waiting-approval'}]}}));
    await fixture.goto(base);
    await fixture.waitForFunction(async()=>{const {state}=await import('/js/state.js');return Boolean(state.status?.workspaceRoot && state.status?.identity?.hostInstanceId);});
    await fixture.click('#rb-bridge-tab');await fixture.click('#btn-operations');
    await fixture.locator('#ops-requests button').first().waitFor();
    await fixture.waitForFunction(()=>document.querySelector('#checkpoint-list').textContent.includes('刷新失败'));
    unavailable=false;await fixture.click('#btn-checkpoint-refresh');
    await fixture.locator('#checkpoint-list button').first().waitFor();
    await fixture.locator('#checkpoint-list button').first().click();
    await fixture.waitForFunction(()=>document.querySelector('#checkpoint-review').textContent.includes('预览失败'));
    assert.equal(await fixture.locator('#checkpoint-controls button').count(),0);
    wrongId=false;await fixture.locator('#checkpoint-list button').first().click();
    await fixture.locator('#checkpoint-controls button').first().waitFor();
    fixture.once('dialog',dialog=>dialog.accept());await fixture.locator('#checkpoint-controls button').first().click();
    await fixture.waitForFunction(()=>document.querySelector('#checkpoint-review').textContent.includes('未取得可信完成结果'));
    assert.equal(await fixture.locator('#checkpoint-controls button').count(),0);assert.equal(restores,1);
    assert.deepEqual(errors,[]);
  } finally {await fixture.close();}
}
async function approvalReviewBrowser(browser, base) {
  const fixture=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
  fixture.on('pageerror',error=>errors.push(error.message));
  const jobs=['fixture-review-a','fixture-review-b'].map(requestId=>({requestId,kind:'workflow',status:'waiting-approval',input:{definition:{steps:[{id:'ping',tool:'ping',arguments:{}}]}}}));
  let delayedReview, delayedSubmit, approvals=0, submissions=0, wrongId=false;
  try {
    await fixture.route('**/api/operations',route=>route.fulfill({json:{servers:[],requests:jobs}}));
    await fixture.route('**/api/operations/**',route=>{
      const url=route.request().url();
      if(url.endsWith('/approve')) {approvals++;return route.fulfill({json:{...jobs[1],status:'succeeded'}});}
      if(url.endsWith(jobs[0].requestId)) {delayedReview=route;return;}
      return route.fulfill({json:wrongId ? jobs[0] : jobs[1]});
    });
    await fixture.route('**/api/workflows/request',route=>{submissions++;delayedSubmit=route;});
    await fixture.goto(base);await fixture.click('#rb-bridge-tab');await fixture.click('#btn-operations');
    await fixture.locator('#ops-requests button').nth(1).waitFor();
    const requested=fixture.waitForRequest(base+'/api/operations/'+jobs[0].requestId);
    await fixture.locator('#ops-requests button').first().click();await requested;
    await fixture.locator('#ops-requests button').nth(1).click();
    await fixture.waitForFunction(id=>document.querySelector('#ops-review').textContent.includes(id),jobs[1].requestId);
    assert.equal(await fixture.locator('#ops-controls button').count(),2);
    // New review aborts the old fetch; a held route may already have been cancelled by Chromium.
    await delayedReview.fulfill({json:jobs[0]}).catch(()=>{});
    assert.equal(JSON.parse(await fixture.locator('#ops-review').textContent()).requestId,jobs[1].requestId);
    await fixture.fill('#ops-workflow',JSON.stringify(jobs[1].input.definition));
    await fixture.click('#btn-ops-preview');
    await fixture.waitForFunction(()=>document.querySelector('#ops-review').textContent.includes('requiresApproval'));
    assert.equal(await fixture.locator('#ops-controls button').count(),0,'draft must not retain approval for a different request');
    assert.equal(approvals,0);
    wrongId=true;await fixture.locator('#ops-requests button').nth(1).click();
    await fixture.waitForFunction(()=>document.querySelector('#ops-status').textContent.includes('ID不匹配'));
    assert.equal(await fixture.locator('#ops-controls button').count(),0);
    wrongId=false;
    const submitted=fixture.waitForRequest(base+'/api/workflows/request');
    await fixture.dblclick('#btn-ops-submit');await submitted;
    assert.equal(submissions,1,'double click cannot create two waiting approvals');
    await delayedSubmit.fulfill({json:jobs[1]});
    await fixture.locator('#ops-controls button').first().waitFor();
    assert.equal(approvals,0);assert.deepEqual(errors,[]);
  } finally {await fixture.close();}
}
async function modelStateBrowser(browser, base) {
  const fixture = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; fixture.on('pageerror', error => errors.push(error.message));
  const original = await (await fetch(base + '/api/status')).json();
  let snapshot = { ...original, activeModelId:'builtin', models:[...original.models,
    {id:'fixture-model',name:'Fixture model',protocol:'chat.completions',caps:[]}] };
  let statusCode = 200, writes = 0, providerRequests = 0, capturedProvider;
  let modelReply = {status:409,contentType:'application/json',body:JSON.stringify({success:false,error:'fixture model rejected'})};
  try {
    await fixture.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await fixture.route('**/api/status', route => route.fulfill({status:statusCode,contentType:'application/json',body:JSON.stringify(snapshot)}));
    await fixture.route('**/api/models', route => {
      writes++; capturedProvider=route.request().postDataJSON();
      return route.fulfill(modelReply);
    });
    await fixture.goto(base);
    await fixture.waitForFunction(()=>document.querySelector('#model-pick-btn').textContent.includes('内置探索'));
    await fixture.click('#model-pick-btn');
    await fixture.locator('.mp-row[data-id="fixture-model"]').click();
    await fixture.waitForFunction(()=>document.querySelector('#toast').textContent.includes('fixture model rejected'));
    assert.equal(await fixture.locator('#model-select').inputValue(),'builtin');
    assert.ok((await fixture.locator('#model-pick-btn').textContent()).includes('内置探索'));
    assert.equal(writes,1);
    snapshot = {...snapshot,activeModelId:'fixture-model'};
    assert.equal(await fixture.evaluate(async () => (await import('/js/bridge.js')).refreshStatus()),true);
    assert.equal(await fixture.locator('#model-select').inputValue(),'fixture-model');
    assert.equal(await fixture.locator('#model-pick-btn').textContent(),'Fixture model');
    await fixture.evaluate(async () => (await import('/js/state.js')).ui.openModal('api'));
    await fixture.click('#btn-use-builtin');
    await fixture.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('未确认'));
    assert.equal(await fixture.locator('#model-select').inputValue(),'fixture-model');
    assert.equal(writes,2);
    statusCode=503; snapshot={error:'status unavailable'};
    assert.equal(await fixture.evaluate(async () => {
      try { await (await import('/js/bridge.js')).refreshStatus(); return false; } catch (_) { return true; }
    }),true);
    assert.ok((await fixture.locator('#sb-bridge').textContent()).includes('状态同步失败'));
    assert.equal(await fixture.locator('#model-select').inputValue(),'fixture-model');
    assert.equal(await fixture.evaluate(async () => (await import('/js/state.js')).state.status.activeModelId),'fixture-model');
    statusCode=200; snapshot={...original,activeModelId:'builtin'};
    assert.equal(await fixture.evaluate(async () => (await import('/js/bridge.js')).refreshStatus()),true);
    assert.ok(!(await fixture.locator('#sb-bridge').textContent()).includes('状态同步失败'));
    assert.equal(await fixture.locator('#model-select').inputValue(),'builtin');
    assert.equal(writes,2,'status recovery never replays a model write');
    await fixture.route('**/api/providers/probe',route=>{
      providerRequests++;
      return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({success:true,models:[{id:'not-confirmed'}]})});
    });
    await fixture.fill('#m-base','https://provider.test/v1');await fixture.fill('#m-key','UI-fixture-key');
    await fixture.click('#btn-test-api');
    await fixture.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('失败'));
    assert.equal(writes,2);
    await fixture.fill('#m-id','manual-ui-model');await fixture.check('#m-vision');
    await fixture.click('#btn-save-model');
    await fixture.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('未确认'));
    assert.equal(writes,3);assert.equal(providerRequests,1,'manual registration does not retry discovery');
    assert.equal(await fixture.locator('#m-key').inputValue(),'UI-fixture-key');
    assert.deepStrictEqual(capturedProvider,{addProvider:{baseUrl:'https://provider.test/v1',apiKey:'UI-fixture-key',vision:true,models:[{id:'manual-ui-model'}]}});
    modelReply={status:200,contentType:'application/json',body:JSON.stringify({success:true,added:1})};
    await fixture.click('#btn-save-model');
    await fixture.waitForFunction(()=>document.querySelector('#model-status').textContent.includes('已登记'));
    assert.equal(writes,4);assert.equal(providerRequests,1);
    assert.equal(await fixture.locator('#m-key').inputValue(),'');
    assert.equal(await fixture.locator('#model-select').inputValue(),'builtin');
    assert.ok((await fixture.locator('#model-status').textContent()).includes('未切换当前模型'));

    assert.deepStrictEqual(errors,[]);
  } finally { await fixture.close(); }
}
async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-browser-'));
  fs.writeFileSync(path.join(workspace, 'acceptance.txt'), 'REAL-BROWSER-EVIDENCE\n');
  const skillDir = path.join(workspace, '.webagent/skills/browser-review');
  fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
  fs.mkdirSync(path.join(skillDir, 'scripts'));
  const skillBody = '---\ndescription: Browser skill fixture <img src=x onerror=alert(1)>\n---\n# Review\n' + '正文'.repeat(4500) + '\nEND-SKILL';
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillBody);
  fs.writeFileSync(path.join(skillDir, 'references/check.md'), 'REFERENCE-EVIDENCE');
  fs.writeFileSync(path.join(skillDir, 'scripts/run.js'), `require("fs").writeFileSync(${JSON.stringify(path.join(workspace, 'UNAUTHORIZED-SKILL'))}, "bad")`);
  fs.writeFileSync(path.join(skillDir, 'workflow.json'), JSON.stringify({ steps: [{ id: 'write', tool: 'write_file', arguments: { filePath: 'skill-produced.txt', content: 'REQUIRES-APPROVAL' } }] }));
  const uiPort = await freePort(), mcpPort = await freePort();
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(__dirname, '..'), env: { ...process.env, WORKSPACE_ROOT: workspace, WORKBENCH_PORT: String(uiPort), AGENT_HOST_PORT: String(mcpPort) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '', browser;
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Host startup timeout: ' + output)), 15000);
      const receive = chunk => {
        output += chunk;
        if (output.includes(`MCP listening on 127.0.0.1:${mcpPort}`)) { clearTimeout(timer); resolve(); }
      };
      child.stdout.on('data', receive); child.stderr.on('data', receive);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Host exited: ' + output)); });
    });
    const base = `http://127.0.0.1:${uiPort}`;
    const status = await (await fetch(base + '/api/status')).json();
    const rpc = async (name, args = {}) => {
      const response = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
      });
      assert.strictEqual(response.status, 200);
      return (await response.json()).result;
    };
    await rpc('ping'); // History exists before the page opens.
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    await probeHudBrowser(browser);
    await docsViewerBrowser(browser);
    await modelStateBrowser(browser, base);
    await approvalReviewBrowser(browser, base);
    await checkpointResultsBrowser(browser, base);
    await checkpointCreateBrowser(browser, base, workspace);
    await externalRegistrationBrowser(browser, base);
    await stdioLifecycleBrowser(browser, base);
    await secretRotationBrowser(browser, base);
    await bridgeLifecycleBrowser(browser, base);
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.routeWebSocket('**/ws', ws => ws.close()); // Polling must work without WS.
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '1');
    await page.click('#menu-help'); await page.locator('#page-help').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#builtin-guide').textContent()).includes('读取 `README.md`'));
    assert.ok((await page.locator('#adoption-guide').textContent()).includes('不是全部候选已完成'));
    assert.strictEqual(await page.evaluate(() => document.querySelector('#modal').contains(document.activeElement)), true,
      'opening the settings dialog moves focus inside it');
    await page.keyboard.press('Escape');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'menu-help',
      'closing the settings dialog restores focus to its trigger');
    await page.click('#walk-start'); await page.locator('#page-help').waitFor({ state: 'visible' }); await page.click('#modal-close');
    await page.focus('#rb-chat-tab'); await page.keyboard.press('ArrowRight');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'rb-bridge-tab');
    assert.strictEqual(await page.getAttribute('#rb-bridge-tab', 'aria-selected'), 'true');
    await page.keyboard.press('Home');
    assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'rb-chat-tab');
    await page.click('#rb-bridge-tab'); await page.click('#btn-host-diagnostics');
    await page.waitForFunction(() => document.querySelector('#diagnostic-identity').textContent.includes('hostInstanceId'));
    const ping = JSON.parse((await rpc('ping')).content[0].text);
    assert.deepStrictEqual(ping.identity, status.identity);
    await page.fill('#expected-host', ping.identity.hostInstanceId); await page.click('#btn-compare-host');
    assert.ok((await page.locator('#host-comparison').textContent()).startsWith('匹配'));
    await page.fill('#expected-host', '00000000-0000-0000-0000-000000000000'); await page.click('#btn-compare-host');
    assert.ok((await page.locator('#host-comparison').textContent()).startsWith('不匹配'));
    await page.click('#modal-close');
    await page.click('#btn-operations');
    await page.fill('#ops-workflow', JSON.stringify({ steps: [{ id: 'write', tool: 'write_file', arguments: { filePath: 'approved-browser.txt', content: 'OPERATOR-APPROVED' } }] }));
    await page.click('#btn-ops-preview');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('requiresApproval'));
    assert.ok(!fs.existsSync(path.join(workspace, 'approved-browser.txt')));
    await page.click('#btn-ops-submit');
    await page.locator('#ops-controls button').first().waitFor({ state: 'visible' });
    assert.ok(!fs.existsSync(path.join(workspace, 'approved-browser.txt')));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('succeeded'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'approved-browser.txt'), 'utf8'), 'OPERATOR-APPROVED');
    await page.click('#modal-close');
    const write = await rpc('write_file', { filePath: 'remote-proof.txt', content: 'WRITTEN-AND-VERIFIED' });
    const written = JSON.parse(write.content[0].text);
    assert.strictEqual(written.verification.state, 'verified');
    assert.strictEqual(write._meta.trace.hostInstanceId, status.identity.hostInstanceId);
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'remote-proof.txt'), 'utf8'), 'WRITTEN-AND-VERIFIED');
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    assert.ok((await page.locator('#bridge-log').textContent()).includes(write._meta.trace.callId));
    assert.ok((await page.locator('#bridge-log').textContent()).includes('verified'));
    const activityBefore = await (await fetch(base + '/api/bridge/activity')).json();
    await page.route('**/api/bridge/activity', route => route.fulfill({ status: 503, body: 'temporary failure' }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#sess-note').textContent.includes('同步失败'));
    assert.strictEqual(await page.locator('#stat-calls').textContent(), '—', 'not loaded is not zero');
    await page.unroute('**/api/bridge/activity');
    await page.click('#rb-bridge-tab'); await page.click('#btn-refresh-activity');
    await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    const activityAfter = await (await fetch(base + '/api/bridge/activity')).json();
    assert.strictEqual(activityAfter.epoch, activityBefore.epoch);
    assert.strictEqual(activityAfter.resetAt, activityBefore.resetAt);
    assert.strictEqual(activityAfter.stats.calls, 3);
    assert.ok((await page.locator('#bridge-log').textContent()).includes(write._meta.trace.callId));
    await page.reload(); await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '3');
    await page.click('[data-left="explorer"]'); await page.click('.tree-item[data-path="acceptance.txt"]');
    await page.locator('#editor-fallback').waitFor({ state: 'visible' });
    await page.fill('#editor-fallback', 'REAL-BROWSER-EVIDENCE\nSAVED-FROM-BROWSER\n');
    const saved = page.waitForResponse(response => response.url().includes('/api/files/content') && response.request().method() === 'PUT');
    await page.keyboard.press('Control+s'); assert.strictEqual((await saved).status(), 200);
    assert.ok(fs.readFileSync(path.join(workspace, 'acceptance.txt'), 'utf8').includes('SAVED-FROM-BROWSER'));
    await page.click('#rb-bridge-tab'); await page.click('#execution-chat');
    await page.waitForFunction(()=>document.querySelector('#execution-mode').textContent.includes('主机模式：chat'));
    await page.click('#rb-chat-tab');
    // Review an existing-file draft through the actual menu, then explicitly save the snapshot.
    await page.fill('#editor-fallback','REAL-BROWSER-EVIDENCE\nSAVED-FROM-BROWSER\nPREVIEW-CONFIRMED\n');
    await page.click('[data-menu="file"]');await page.click('[data-act="preview"]');
    await page.locator('#btn-preview-save').waitFor({state:'visible'});
    assert.ok((await page.locator('#diff-body').textContent()).includes('+PREVIEW-CONFIRMED'));
    assert.ok(!fs.readFileSync(path.join(workspace,'acceptance.txt'),'utf8').includes('PREVIEW-CONFIRMED'));
    const previewSaved=page.waitForResponse(response=>response.url().endsWith('/api/files/content') && response.request().method()==='PUT');
    await page.click('#btn-preview-save');assert.equal((await previewSaved).status(),200);
    assert.ok(fs.readFileSync(path.join(workspace,'acceptance.txt'),'utf8').includes('PREVIEW-CONFIRMED'));
    await page.locator('#tabs .tab').filter({hasText:'acceptance.txt'}).filter({hasNotText:'(diff)'}).locator('span').first().click();
    await page.click('[data-menu="file"]');await page.click('[data-act="undo-save"]');
    await page.locator('#btn-preview-save').filter({hasText:'确认回退'}).waitFor({state:'visible'});
    assert.ok(fs.readFileSync(path.join(workspace,'acceptance.txt'),'utf8').includes('PREVIEW-CONFIRMED'));
    const undoResponse=page.waitForResponse(response=>response.url().includes('/api/files/undo/') && response.request().method()==='POST');
    await page.click('#btn-preview-save');assert.equal((await undoResponse).status(),200);
    assert.ok(!fs.readFileSync(path.join(workspace,'acceptance.txt'),'utf8').includes('PREVIEW-CONFIRMED'));
    await page.click('#model-pick-btn'); await page.locator('.mp-row').filter({ hasText: '内置探索' }).click();
    await page.click('#btn-agent-pick'); await page.click('#agent-pick-menu [data-mode="ask"]');
    await page.fill('#chat-input', '只读取 `acceptance.txt`');
    const chat = page.waitForResponse(response => response.url().endsWith('/api/chat'));
    await page.click('#btn-send');
    assert.ok((await (await chat).text()).includes('SAVED-FROM-BROWSER'));
    await page.waitForFunction(() => document.querySelector('#btn-send').textContent === '↑');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async value => (await import('/js/dom.js')).applyTheme(value), theme);
      for (const viewport of [{ width: 1024, height: 600 }, { width: 640, height: 360 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport); await page.click('#btn-agent-pick');
        const rect = await page.locator('#agent-pick-menu').boundingBox();
        assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
        await page.keyboard.press('Escape');
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (!await page.locator('#sidebar').evaluate(el => el.classList.contains('collapsed'))) {
      await page.click('[data-left="explorer"]');
    }
    await page.click('[data-left="explorer"]');
    const narrowLayout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      sidebar: document.querySelector('#sidebar').getBoundingClientRect().toJSON(),
      rightbar: document.querySelector('#rightbar').getBoundingClientRect().toJSON()
    }));
    assert.ok(narrowLayout.scrollWidth <= narrowLayout.viewport, '390px layout must not overflow horizontally');
    assert.ok(narrowLayout.sidebar.x >= 48 && narrowLayout.sidebar.right <= 390, 'narrow sidebar is an in-viewport drawer');
    assert.ok(narrowLayout.rightbar.right <= 390, 'right panel stays reachable on a narrow screen');
    await page.click('[data-left="explorer"]');
    await page.setViewportSize({ width: 1280, height: 900 }); await page.click('#rb-bridge-tab');
    await page.click('#execution-bridge');
    await page.waitForFunction(()=>document.querySelector('#execution-mode').textContent.includes('主机模式：bridge'));
    await rpc('unknown-fixture-tool'); await page.waitForFunction(() => document.querySelector('#stat-fail').textContent === '1');
    await page.click('#btn-reset-round'); await page.waitForFunction(() => document.querySelector('#stat-calls').textContent === '0');
    assert.strictEqual((await (await fetch(base + '/api/bridge/activity')).json()).resetReason, 'operator-cleared');
    const endpoint = `http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`;
    const initialized = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'browser-approval-fixture', version: '1' } } }) });
    const session = initialized.headers.get('mcp-session-id'); assert.ok(session); await initialized.json();
    const queued = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': session }, body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'workflow_request', arguments: { requestKey: 'browser-remote-approval', definition: { steps: [{ id: 'remote', tool: 'write_file', arguments: { filePath: 'remote-approved.txt', content: 'REMOTE-APPROVED' } }] } } } }) });
    const pending = JSON.parse((await queued.json()).result.content[0].text);
    assert.strictEqual(pending.status, 'waiting-approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'remote-approved.txt')));
    await page.click('#btn-operations');
    await page.locator('#ops-requests button').filter({ hasText: pending.requestId }).click();
    page.once('dialog', dialog => dialog.accept()); await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('succeeded'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'remote-approved.txt'), 'utf8'), 'REMOTE-APPROVED');
    await page.click('#modal-close'); await page.click('#rb-chat-tab');
    await page.fill('#chat-input', 'KEEP-DRAFT');
    await page.click('#menu-help'); await page.click('.modal-nav [data-page="instructions"]');
    await page.fill('#instr-text','KEEP-CUSTOM-DRAFT');
    await page.route('**/api/customizations', route => route.request().method() === 'PUT' ? route.fulfill({
      status:400,contentType:'application/json',body:JSON.stringify({success:false,error:'fixture settings rejected'})
    }) : route.continue());
    await page.click('#btn-save-instr');
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('fixture settings rejected'));
    assert.strictEqual(await page.inputValue('#instr-text'),'KEEP-CUSTOM-DRAFT');
    assert.ok(!(await page.locator('#toast').textContent()).includes('指令已保存'));
    await page.unroute('**/api/customizations');
    await page.click('.modal-nav [data-page="skills"]');
    await page.route('**/api/skills', route => route.request().method() === 'POST' ? route.fulfill({
      status:400,contentType:'application/json',body:JSON.stringify({error:'fixture skill create rejected'})
    }) : route.continue());
    await page.fill('#sk-name', 'rejected-browser-skill');
    await page.click('#btn-add-skill');
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'fixture skill create rejected');
    assert.ok(!fs.existsSync(path.join(workspace,'.webagent/skills/rejected-browser-skill/SKILL.md')));
    await page.unroute('**/api/skills');
    await page.fill('#skill-search', 'browser-review');
    assert.strictEqual(await page.locator('#skills-list img').count(), 0);
    await page.click('[data-skill-id="workspace:browser-review"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-note').textContent.includes('SHA256'));
    await page.click('#btn-skill-more');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent.endsWith('END-SKILL'));
    assert.strictEqual(await page.locator('#skill-reader-content').textContent(), skillBody);
    await page.click('[data-resource="references/check.md"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent === 'REFERENCE-EVIDENCE');
    await page.click('[data-resource="SKILL.md"]');
    await page.click('[data-resource="scripts/run.js"]');
    await page.waitForFunction(() => document.querySelector('#skill-reader-content').textContent.includes('UNAUTHORIZED-SKILL'));
    assert.ok(!fs.existsSync(path.join(workspace, 'UNAUTHORIZED-SKILL')));
    let skillChatRequests = 0;
    page.on('request', request => { if (request.url().endsWith('/api/chat')) skillChatRequests++; });
    await page.click('#btn-skill-use');
    await page.locator('#modal').waitFor({ state: 'hidden' });
    assert.ok((await page.locator('#chat-input').inputValue()).includes('KEEP-DRAFT'));
    assert.ok((await page.locator('#chat-input').inputValue()).includes('workspace:browser-review'));
    assert.strictEqual(await page.locator('#mode-select').inputValue(), 'ask');
    assert.strictEqual(skillChatRequests, 0);
    await page.click('#menu-help'); await page.click('.modal-nav [data-page="skills"]');
    await page.click('[data-skill-id="workspace:browser-review"]');
    await page.click('[data-resource="workflow.json"]');
    await page.click('#btn-skill-workflow');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('requiresApproval'));
    assert.ok(!fs.existsSync(path.join(workspace, 'skill-produced.txt')), 'Skill workflow preview never executes');
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=missing-skill`)).status(), 404);
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=workspace%3Abrowser-review&limit=9000`)).status(), 400);
    const skillPage = JSON.parse((await rpc('load_skill', { name: 'workspace:browser-review', limit: 1111 })).content[0].text);
    assert.strictEqual(skillPage.content, skillBody.slice(0, 1111));
    const skillNext = JSON.parse((await rpc('load_skill', { name: skillPage.id, offset: skillPage.nextOffset, expectedHash: skillPage.hash, limit: 1111 })).content[0].text);
    assert.strictEqual(skillNext.content, skillBody.slice(1111, 2222));
    fs.appendFileSync(path.join(skillDir, 'SKILL.md'), '\nNEW-REVISION');
    assert.strictEqual((await rpc('load_skill', { name: skillPage.id, offset: skillPage.nextOffset, expectedHash: skillPage.hash })).isError, true);
    assert.strictEqual((await page.request.get(`http://127.0.0.1:${uiPort}/api/skills/load?name=workspace%3Abrowser-review&offset=1111&expectedHash=${skillPage.hash}`)).status(), 409);
    // Real checkpoint UI/API/disk; subscribing before clicking avoids stale UI text races.
    fs.writeFileSync(path.join(workspace, 'checkpoint-a.txt'), 'before A');
    fs.writeFileSync(path.join(workspace, 'checkpoint-b.txt'), 'before B');
    await page.fill('#checkpoint-paths', 'checkpoint-a.txt\ncheckpoint-b.txt');
    const createdCheckpoint = page.waitForResponse(response => response.url().endsWith('/api/checkpoints') && response.request().method() === 'POST');
    page.once('dialog', dialog => dialog.accept()); await page.click('#btn-checkpoint-create');
    const checkpoint = await (await createdCheckpoint).json(); assert.ok(checkpoint.id);
    await page.waitForFunction(() => document.querySelector('#checkpoint-list').textContent.includes('checkpoint-a.txt'));
    fs.writeFileSync(path.join(workspace, 'checkpoint-a.txt'), 'after A');
    fs.writeFileSync(path.join(workspace, 'checkpoint-b.txt'), 'after B');
    await page.locator('#checkpoint-list button').filter({ hasText: '只预览此检查点恢复差异' }).click();
    await page.waitForFunction(() => document.querySelector('#checkpoint-review').textContent.includes('previewId'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'checkpoint-a.txt'), 'utf8'), 'after A');
    page.once('dialog', dialog => dialog.dismiss()); await page.locator('#checkpoint-controls button').click();
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'checkpoint-a.txt'), 'utf8'), 'after A');
    const restoredCheckpoint = page.waitForResponse(response => response.url().endsWith('/checkpoints/' + checkpoint.id + '/restore'));
    page.once('dialog', dialog => dialog.accept()); await page.locator('#checkpoint-controls button').click();
    assert.strictEqual((await (await restoredCheckpoint).json()).result.status, 'succeeded');
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'checkpoint-a.txt'), 'utf8'), 'before A');
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'checkpoint-b.txt'), 'utf8'), 'before B');
    await page.click('#btn-checkpoint-refresh');
    await page.waitForFunction(() => document.querySelector('#checkpoint-list').textContent.includes('consumed'));
    await page.fill('#ops-workflow', JSON.stringify({ steps: [{ id: 'create', tool: 'write_file',
      arguments: { filePath: 'guard-target.txt', content: 'must not overwrite', confirm_overwrite: true },
      before: { path: 'guard-target.txt', exists: false } }] }));
    await page.click('#btn-ops-preview');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('explicit-precondition'));
    assert.ok(!fs.existsSync(path.join(workspace, 'guard-target.txt')));
    await page.click('#btn-ops-submit');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('waiting-approval'));
    fs.writeFileSync(path.join(workspace, 'guard-target.txt'), 'created by another program');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#ops-controls button').first().click();
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('E_PRECONDITION'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'guard-target.txt'), 'utf8'), 'created by another program');
    fs.copyFileSync(path.join(__dirname, 'stdioServerFixture.js'), path.join(workspace, 'stdio-ui-server.js'));
    const launchConfig = { program: process.execPath, args: [path.join(workspace, 'stdio-ui-server.js'), 'normal'], reviewFiles: ['stdio-ui-server.js'], env: { FIXTURE_TOKEN: 'browser-private-stdio' } };
    const deniedLaunch = await page.request.post(base + '/api/external/stdio/preview', { headers: { Origin: 'https://untrusted.example' }, data: launchConfig });
    assert.ok([403, 404].includes(deniedLaunch.status()));
    await page.fill('#ops-stdio-config', JSON.stringify(launchConfig));
    await page.click('#btn-stdio-preview');
    await page.waitForFunction(() => !document.querySelector('#btn-stdio-start').disabled);
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-started.json')));
    assert.ok(!(await page.locator('#ops-stdio-review').textContent()).includes('browser-private-stdio'));
    assert.ok(!(await page.locator('#ops-stdio-config').inputValue()).includes('browser-private-stdio'));
    page.once('dialog', dialog => dialog.dismiss()); await page.click('#btn-stdio-start');
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-started.json')));
    page.once('dialog', dialog => dialog.accept()); await page.click('#btn-stdio-start');
    await page.waitForFunction(() => document.querySelector('#ops-servers').textContent.includes('discovered'));
    const registeredStdio = (await (await page.request.get(base + '/api/operations')).json()).servers.find(server => server.transport === 'stdio');
    assert.ok(registeredStdio); assert.ok(fs.existsSync(path.join(workspace, 'stdio-started.json')));
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-calls.txt')));
    const stdioRequest = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': session }, body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'external_request', arguments: { serverId: registeredStdio.serverId, tool: 'echo', arguments: { text: 'STDIO-APPROVED' }, requestKey: 'browser-stdio-approval' } } }) });
    const stdioPending = JSON.parse((await stdioRequest.json()).result.content[0].text);
    assert.strictEqual(stdioPending.status, 'waiting-approval');
    assert.ok(!fs.existsSync(path.join(workspace, 'stdio-calls.txt')));
    await page.click('#btn-ops-refresh');
    await page.locator('#ops-requests button').filter({ hasText: stdioPending.requestId }).click();
    const stdioApproval=page.waitForResponse(response=>response.url().endsWith('/operations/'+stdioPending.requestId+'/approve') && response.request().method()==='POST');
    page.once('dialog', dialog => dialog.accept()); await page.locator('#ops-controls button').first().click();
    assert.equal((await (await stdioApproval).json()).status,'succeeded');
    await page.waitForFunction(() => document.querySelector('#ops-review').textContent.includes('succeeded') && document.querySelector('#ops-review').textContent.includes('STDIO-APPROVED'));
    assert.strictEqual(fs.readFileSync(path.join(workspace, 'stdio-calls.txt'), 'utf8'), 'call\n');
    assert.ok(!(await page.locator('#ops-review').textContent()).includes('browser-private-stdio'));
    await page.locator('#ops-servers button').first().click();
    await page.waitForFunction(() => !document.querySelector('#ops-servers').textContent);
    assert.deepStrictEqual(errors, []);
    // Minimal browser observation + authenticated MCP echo, without visiting Arena or collecting credentials.
    await page.click('#modal-close');
    await page.click('#rb-bridge-tab'); await page.click('#btn-host-diagnostics');
    const observation = { schema: 'webagent-browser-observation/v1', origin: 'https://arena.ai', observedAt: new Date().toISOString(), pageKind: 'agent', pageDigest: 'b'.repeat(64) };
    await page.fill('#connection-observation', JSON.stringify(observation));
    await page.click('#btn-create-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('toolRequest'));
    const check = JSON.parse(await page.locator('#connection-check-result').textContent());
    const spoof = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'spoof', method: 'tools/call', params: { ...check.toolRequest, name: ' confirm_connection ', clientInfo: { name: 'peer:forged' } } }) });
    assert.strictEqual((await spoof.json()).result.isError, true);
    const initResponse = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'connection-init', method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'connection-browser-fixture', version: '1' } } }) });
    const sessionId = initResponse.headers.get('mcp-session-id'); assert.ok(sessionId);
    const echoResponse = await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': sessionId }, body: JSON.stringify({ jsonrpc: '2.0', id: 'connection-echo', method: 'tools/call', params: check.toolRequest }) });
    const echo = JSON.parse((await echoResponse.json()).result.content[0].text);
    assert.strictEqual(echo.observationHash, check.observationHash);
    assert.strictEqual(echo.modelIdentityVerified, false);
    await page.click('#btn-refresh-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('echo-confirmed'));
    assert.ok(!(await page.locator('#connection-check-result').textContent()).includes(check.challenge));
    const crossOrigin = await fetch(base + '/api/connection-checks', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(observation) });
    assert.strictEqual(crossOrigin.status, 404); // Local API deliberately conceals denied routes.
    assert.deepStrictEqual(await crossOrigin.json(), { error: 'not found' });
    await page.click('#btn-clear-connection-check');
    await page.waitForFunction(() => document.querySelector('#connection-check-result').textContent.includes('已清除核对记录'));
    await page.click('#modal-close');
    assert.deepStrictEqual(errors, []);
    await page.click('#rb-bridge-tab');
    assert.ok((await page.locator('#bridge-tasks').textContent()).includes('set_todos'));
    await rpc('set_todos',{todos:[{id:'plan-1',title:'REMOTE-TASK-SNAPSHOT',status:'in_progress'}]});
    await page.waitForFunction(()=>document.querySelector('#bridge-todo-list').textContent.includes('REMOTE-TASK-SNAPSHOT'));
    await page.click('#execution-chat');await page.waitForFunction(()=>document.querySelector('#execution-mode').textContent.includes('主机模式：chat'));
    const localPlan = await page.request.post(base+'/api/tool/call',{data:{name:'set_todos',arguments:{todos:[{title:'LOCAL-PLAN-ONLY'}]},mode:'ask'}});
    assert.equal((await localPlan.json()).success,true);
    assert.equal((await (await page.request.get(base+'/api/status')).json()).taskState.todos[0].title,'LOCAL-PLAN-ONLY');
    assert.ok(!(await page.locator('#bridge-todo-list').textContent()).includes('LOCAL-PLAN-ONLY'));
    await page.reload();await page.click('#rb-bridge-tab');
    await page.waitForFunction(()=>document.querySelector('#bridge-todo-list').textContent.includes('REMOTE-TASK-SNAPSHOT'));
    await page.click('#execution-bridge');await page.waitForFunction(()=>document.querySelector('#execution-mode').textContent.includes('主机模式：bridge'));
    await rpc('set_todos',{todos:[{id:'plan-1',title:'REMOTE-TASK-SNAPSHOT',status:'completed'}]});
    await page.waitForFunction(()=>document.querySelector('#bridge-task-count').textContent.includes('1/1'));
    const secondPlan=await fetch(`http://127.0.0.1:${mcpPort}/mcp/${status.secretKey}`,{method:'POST',headers:{'Content-Type':'application/json','Mcp-Session-Id':sessionId},body:JSON.stringify({jsonrpc:'2.0',id:'second-plan',method:'tools/call',params:{name:'set_todos',arguments:{todos:[{title:'SECOND-SESSION-PLAN',status:'pending'}]}}})});
    assert.ok(!(await secondPlan.json()).result.isError);
    await page.waitForFunction(()=>document.querySelector('#bridge-todo-list').textContent.includes('SECOND-SESSION-PLAN'));
    assert.ok((await page.locator('#bridge-todo-list').textContent()).includes('REMOTE-TASK-SNAPSHOT'));
    const taskSnapshot=await (await page.request.get(base+'/api/status')).json();
    assert.equal(taskSnapshot.bridgeTaskStates.length,2);
    assert.notEqual(taskSnapshot.bridgeTaskStates[0].sessionId,taskSnapshot.bridgeTaskStates[1].sessionId);

    assert.deepStrictEqual(errors, []);
    // Real owner permission UI: no draft overwrite, save/readback, denied direct MCP alias.
    await page.uncheck('#access-edit');
    assert.equal(await page.isChecked('#access-execute'),false);
    await page.uncheck('#access-capture');
    await page.evaluate(async()=>{await (await import('/js/bridge.js')).refreshStatus();});
    assert.equal(await page.isChecked('#access-edit'),false,'poll must preserve unsaved draft');
    await page.click('#execution-save');
    await page.waitForFunction(()=>document.querySelector('#execution-result').textContent.includes('已由主机应用'));
    assert.equal((await rpc('execute_command',{command:'echo forbidden'})).isError,true);
    await page.reload();await page.click('#rb-bridge-tab');
    assert.equal(await page.isChecked('#access-edit'),false);assert.equal(await page.isChecked('#access-execute'),false);
    for(const key of ['read','edit','capture','execute']) await page.check('#access-'+key);
    await page.click('#execution-save');await page.waitForFunction(()=>document.querySelector('#execution-result').textContent.includes('已由主机应用'));
    await page.click('#btn-operations');
    assert.equal(await page.isChecked('#ops-public-https'),false);
    let publicRegistration;
    await page.route('**/api/external/servers', async route=>{
      publicRegistration=route.request().postDataJSON();
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({serverId:'ui-fixture',publicHttps:true,transport:'http',status:'discovered',endpoint:'https://mcp.example.test/mcp',tools:[]})});
    });
    await page.check('#ops-public-https');await page.fill('#ops-url','https://mcp.example.test/mcp');await page.fill('#ops-token','public-ui-fixture');
    const publicRefresh=page.waitForResponse(response=>response.url().endsWith('/api/external/servers') && response.request().method()==='POST');
    page.once('dialog',dialog=>dialog.accept());await page.click('#btn-ops-add');
    await page.waitForFunction(()=>document.querySelector('#ops-token').value==='');
    await publicRefresh;
    await page.waitForFunction(()=>document.querySelector('#ops-external-result').textContent.includes('已确认登记'));
    assert.equal(publicRegistration.publicHttps,true);assert.equal(publicRegistration.confirmedPublic,true);
    assert.equal(publicRegistration.hostInstanceId,status.identity.hostInstanceId);assert.equal(publicRegistration.workspaceRoot,status.workspaceRoot);
    assert.equal(publicRegistration.token,'public-ui-fixture');
    await page.unroute('**/api/external/servers');await page.click('#modal-close');
    // Real page/module + intercepted failures: no external tunnel process is started.
    await page.route('**/api/bridge/start', route => route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({success:false,running:false,tunnelError:'fixture cloudflared unavailable'}) }));
    assert.equal(await page.evaluate(async () => (await import('/js/bridge.js')).startBridge()), false);
    assert.ok((await page.locator('#bridge-result').textContent()).includes('启动结果未确认'));
    await page.unroute('**/api/bridge/start');
    await page.route('**/api/bridge/stop', route => route.fulfill({ status: 500, contentType: 'application/json',
      body: JSON.stringify({success:false,error:'fixture stop not confirmed'}) }));
    assert.equal(await page.evaluate(async () => (await import('/js/bridge.js')).stopBridge()), false);
    assert.ok((await page.locator('#bridge-result').textContent()).includes('停止结果未确认'));
    await page.unroute('**/api/bridge/stop');
    assert.deepStrictEqual(errors, []);
    console.log('Browser PASS: minimal page observation + authenticated connection echo/forged session rejection/clear, help, host match/mismatch, real MCP write verification, trace, WS loss/reload, file save, builtin evidence, themes/popovers, failure/reset, local + authenticated remote workflow approval; Skill paging/resources/draft/no script execution/workflow preview/hash change; approval-time file precondition refuses drift; stdio preview/start/remote request/local approval/removal');
  } finally {
    if (browser) await browser.close();
    if (child.exitCode === null) child.kill();
    await exited;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error);
  if (process.env.GITHUB_ACTIONS === 'true') {
    const detail = String(error.stack || error).slice(0, 2400).replace(/https?:\/\/[^\s)]+/g, '[url]').replace(/[a-f0-9]{32,}/gi, '[id]').replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::error title=Browser regression::${detail}`);
  }
  process.exitCode = 1;
});
