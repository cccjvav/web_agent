'use strict';
// Execute the real ES modules, rather than merely searching for HTML IDs.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
if (!process.argv.includes('--vm-child')) {
  const result = spawnSync(process.execPath, ['--experimental-vm-modules', __filename, '--vm-child'], { stdio: 'inherit', timeout: 10000 });
  if (result.error) console.error(result.error);
  process.exit(result.status == null ? 1 : result.status);
}
(async () => {
  const button = { setAttribute(name, value) { this[name] = value; } };
  const storage = new Map();
  const themes = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {} }, querySelector: () => button },
    window: { monaco: { editor: { setTheme: value => themes.push(value) } } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }
  });
  const root = path.resolve(__dirname, '../../workbench/js');
  const state = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'state.js'), 'utf8'), { context });
  const dom = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'dom.js'), 'utf8'), { context });
  await state.link(() => {});
  await dom.link(specifier => { assert.strictEqual(specifier, './state.js'); return state; });
  await dom.evaluate(); // F01 used to throw here, before boot's catch could run.
  assert.strictEqual(dom.namespace.initTheme(), 'dark');
  assert.strictEqual(dom.namespace.applyTheme('light'), 'light');
  assert.strictEqual(context.document.documentElement.dataset.theme, 'light');
  assert.strictEqual(storage.get('webagent-theme'), 'light');
  assert.strictEqual(themes.at(-1), 'vs');
  assert.strictEqual(button.textContent, '深色');
  assert.strictEqual(dom.namespace.initTheme(), 'light');
  storage.set('webagent-theme', 'invalid');
  assert.strictEqual(dom.namespace.initTheme(), 'dark');
  context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  assert.doesNotThrow(() => dom.namespace.initTheme());
  assert.strictEqual(state.namespace.ui.applyTheme, dom.namespace.applyTheme);
  // Exercise the actual picker, geometry and resource cleanup separately from the real Chromium CI job.
  const listeners = new Map(), timers = new Map();
  let serial = 0, box, focused;
  function listen(target) {
    target.addEventListener = (kind, fn) => {
      if (!listeners.has(kind)) listeners.set(kind, new Set());
      listeners.get(kind).add(fn);
    };
    target.removeEventListener = (kind, fn) => listeners.get(kind)?.delete(fn);
  }
  listen(context.document); listen(context.window);
  context.setTimeout = fn => { timers.set(++serial, fn); return serial; };
  context.clearTimeout = id => timers.delete(id);
  context.window.innerWidth = 320; context.window.innerHeight = 240;
  const anchor = { getBoundingClientRect: () => ({ left: 270, top: 190, bottom: 215 }),
    contains: node => node === anchor, focus: () => { focused = anchor; } };
  context.document.createElement = () => {
    const search = { focus() { focused = search; } }, list = {};
    const item = { style: {}, scrollHeight: 300,
      querySelector: selector => selector === '.mp-search' ? search : list,
      getBoundingClientRect() { return { width: Math.min(330, parseFloat(this.style.maxWidth)),
        height: Math.min(300, parseFloat(this.style.maxHeight)) }; },
      contains: node => [item, search, list].includes(node), remove() { this.removed = true; } };
    return item;
  };
  context.document.body = { appendChild: node => { box = node; } };
  const picker = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'picker.js'), 'utf8'), { context });
  await picker.link(specifier => specifier === './state.js' ? state : dom);
  await picker.evaluate();
  state.namespace.state.status = { models: [
    { id: 'builtin', name: '内置探索 Agent', protocol: 'builtin' },
    { id: 'api', name: 'External <model>', protocol: 'openai' }
  ] };
  let picked;
  const open = extra => picker.namespace.openModelPicker({ anchor, onPick: id => { picked = id; }, ...extra });
  const clean = () => {
    assert.strictEqual(timers.size, 0, 'closing cancels deferred outside listener');
    assert.ok([...listeners.values()].every(set => !set.size), 'all picker listeners must be removed');
  };
  open();
  assert.ok(box.querySelector('.mp-list').innerHTML.includes('data-id="builtin"'));
  assert.ok(box.querySelector('.mp-list').innerHTML.includes('无需 API Key'));
  assert.ok(box.querySelector('.mp-list').innerHTML.includes('External &lt;model&gt;'));
  assert.strictEqual(box.style.top, '8px');
  assert.strictEqual(box.style.left, '8px');
  assert.strictEqual(box.style.maxHeight, '178px');
  box.querySelector('.mp-search').oninput({ target: { value: 'not-a-model' } });
  assert.ok(box.querySelector('.mp-list').innerHTML.includes('无匹配模型'));
  box.querySelector('.mp-list').onclick({ target: { closest: () => ({ dataset: { id: 'builtin' } }) } });
  assert.strictEqual(picked, 'builtin'); clean();
  open({ mergeMark: true });
  assert.ok(!box.querySelector('.mp-list').innerHTML.includes('data-id="builtin"'));
  picker.namespace.closeModelPicker(); clean();
  state.namespace.state.status.models.pop();
  open({ mergeMark: true });
  assert.ok(box.querySelector('.mp-list').innerHTML.includes('尚未配置外部模型'));
  // Reopening before deferred registration must not leak the previous instance.
  const previous = box; open(); assert.ok(previous.removed);
  for (const fn of timers.values()) fn(); timers.clear();
  assert.strictEqual(listeners.get('mousedown').size, 1);
  for (const fn of listeners.get('scroll')) fn({ target: box.querySelector('.mp-list') });
  assert.ok(!box.removed, 'scrolling the list must not close it');
  for (const fn of listeners.get('keydown')) fn({ key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.strictEqual(focused, anchor); clean();
  open(); for (const fn of listeners.get('resize')) fn(); clean();
  open(); for (const fn of listeners.get('scroll')) fn({ target: context.document }); clean();
  context.window.innerHeight = 640;
  dom.namespace.positionPopover(box, { getBoundingClientRect: () => ({ left: 10, top: 10, bottom: 30 }) });
  assert.strictEqual(box.style.top, '34px', 'a top anchor opens below when space permits');
  context.URL = URL;
  const bridge = new vm.SourceTextModule(fs.readFileSync(path.join(root, 'bridge.js'), 'utf8'), { context });
  await bridge.link(specifier => specifier === './state.js' ? state : dom);
  await bridge.evaluate();
  button.classList = { remove() {}, toggle() {} };
  state.namespace.ui.setRight = () => {};
  state.namespace.ui.toast = () => {};
  state.namespace.ui.sendChat = () => { throw new Error('connecting must not execute a task'); };
  context.fetch = () => { throw new Error('guidance must not pretend to initialize MCP'); };
  await bridge.namespace.arenaConnect('example task');
  assert.ok(button.textContent.includes('尚未建立'));
  state.namespace.ui.startBridge = () => { throw new Error('navigation must not start a public tunnel'); };
  state.namespace.ui.closeModal = () => {};
  state.namespace.ui.activateTab = () => {};
  await bridge.namespace.openSite('chatgpt');
  assert.ok(state.namespace.state.tabs.some(tab => tab.id === 'browser:chatgpt'));

  state.namespace.ui.promptText = () => 'Local connection instructions';
  bridge.namespace.renderBrowser({ site: 'arena', title: 'Arena', url: 'https://arena.ai/agent' });
  assert.ok(button.innerHTML.includes('外部客户端连接指引'));
  assert.ok(!button.innerHTML.includes('arena-send'));
  bridge.namespace.renderBrowser({ site: 'custom', title: 'Unsafe', url: 'javascript:alert(1)' });
  assert.ok(!button.innerHTML.includes('href='), 'escapeHtml alone must not permit executable URLs');

  let activityPaints = 0, activityRequests = 0;
  state.namespace.ui.paintStats = () => { activityPaints++; };
  const activity = { epoch: 'host-fixture', revision: 1,
    stats: { calls: 7, fail: 1, totalMs: 10 },
    logs: [{ tool: '<read_files>', success: true, durationMs: 2, timestamp: '2026-09-14T12:00:00Z' }] };
  bridge.namespace.paintBridgeActivity(activity);
  bridge.namespace.paintBridgeActivity(activity);
  assert.strictEqual(activityPaints, 1, 'same snapshot is not accumulated or repainted');
  assert.strictEqual(state.namespace.state.stats.calls, 7, 'restore the server total, not the visible log length');
  assert.ok(button.innerHTML.includes('&lt;read_files&gt;'));
  context.AbortController = AbortController;
  context.fetch = async (url, options) => { assert.strictEqual(options.cache, 'no-store'); activityRequests++; return { ok: true, json: async () => activity }; };
  const firstRefresh = bridge.namespace.refreshBridgeActivity();
  assert.strictEqual(bridge.namespace.refreshBridgeActivity(), firstRefresh, 'polls/events share one in-flight request');
  await firstRefresh;
  assert.strictEqual(activityRequests, 1);
  context.fetch = async () => ({ ok: false, status: 503 });
  await bridge.namespace.refreshBridgeActivity();
  assert.ok(button.textContent.includes('同步失败'));
  context.fetch = async () => ({ ok: true, json: async () => activity });
  await bridge.namespace.refreshBridgeActivity();
  assert.ok(!button.textContent.includes('同步失败'), 'same revision recovers the error message');
  context.fetch = async () => ({ ok: true, json: async () => ({}) });
  await bridge.namespace.refreshBridgeActivity();
  assert.ok(button.textContent.includes('同步失败'));
  assert.strictEqual(state.namespace.state.stats.calls, 7, 'bad snapshot must not erase known statistics');
  bridge.namespace.paintBridgeActivity({ ...activity, revision: 2, stats: { calls: 0, fail: 0, totalMs: 0 }, logs: [] });
  assert.strictEqual(state.namespace.state.stats.calls, 0);
  assert.strictEqual(button.innerHTML, '');
  assert.strictEqual(timers.size, 0, 'each activity request clears its abort timer');

  let sockets = 0, activated = 0, warnings = 0;
  const bootUi = Object.fromEntries(['initEditorSafety', 'bind', 'setAgentMode', 'paintTabs', 'paintChat', 'termLine',
    'refreshStatus', 'loadSkills', 'loadCustomizations'].map(name => [name, () => {}]));
  bootUi.loadTree = () => { throw new Error('fixture initial request failure'); };
  bootUi.activateTab = () => { activated++; };
  bootUi.toast = () => { warnings++; };
  const bootContext = vm.createContext({ console: { error() {} }, location: { protocol: 'http:', host: 'localhost:3000' },
    WebSocket: function () { sockets++; this.readyState = 1; } });
  const stateStub = new vm.SyntheticModule(['$', 'state', 'ui'], function () {
    this.setExport('$', () => null); this.setExport('state', { activeTab: 'welcome' }); this.setExport('ui', bootUi);
  }, { context: bootContext });
  const monacoStub = new vm.SyntheticModule(['loadMonaco'], function () {
    this.setExport('loadMonaco', () => Promise.reject(new Error('fixture CDN failure')));
  }, { context: bootContext });
  const empty = new vm.SyntheticModule([], function () {}, { context: bootContext });
  const app = new vm.SourceTextModule(fs.readFileSync(path.join(root, '../app.js'), 'utf8'), { context: bootContext });
  await app.link(specifier => specifier.endsWith('/state.js') ? stateStub : specifier.endsWith('/monaco.js') ? monacoStub : empty);
  await app.evaluate();
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(sockets, 1, 'initial request failure must not prevent websocket startup');
  assert.strictEqual(activated, 1, 'initial tab must still activate');
  assert.strictEqual(warnings, 1, 'partial initialization failure must be visible');
  // Bridge start binds the visible project, not a different host returned after restart.
  let starts = 0, alerts = 0;
  const boundStatus = {workspaceRoot:'/fixture/project',identity:{hostInstanceId:'current'},mcpUrl:'/mcp/fixture'};
  context.window.alert = () => { alerts++; };
  context.navigator = {clipboard:{writeText:async()=>{}}};
  button.classList = {add(){},remove(){}};
  state.namespace.ui.refreshStatus = async()=>{};
  context.fetch = async url => url==='/api/status' ? {ok:true,json:async()=>boundStatus} : (++starts,{ok:true,status:200,json:async()=>({success:true})});
  state.namespace.state.status = null;
  assert.equal(await bridge.namespace.startBridge(),false);assert.equal(starts,0);
  state.namespace.state.status = {...boundStatus,identity:{hostInstanceId:'stale'}};
  assert.equal(await bridge.namespace.startBridge(),false);assert.equal(starts,0);
  state.namespace.state.status = boundStatus;
  assert.equal(await bridge.namespace.startBridge(),true);assert.equal(starts,1);
  context.fetch = async url => url==='/api/status' ? {ok:true,json:async()=>boundStatus} : {status:409,json:async()=>({success:false,error:'stale'})};
  assert.equal(await bridge.namespace.startBridge(),false);assert.equal(alerts,3);
  context.fetch = async()=>{throw new Error('offline');};
  assert.equal(await bridge.namespace.startBridge(),false);assert.equal(alerts,4);
  const bridgeNotices = [];
  let refreshed = 0, removed = 0, copied = 0;
  state.namespace.ui.toast = message => bridgeNotices.push(message);
  state.namespace.ui.refreshStatus = async () => { refreshed++; };
  context.navigator.clipboard.writeText = async () => { copied++; };
  button.classList.remove = () => { removed++; };
  for (const reason of [{tunnelError:'fixture cloudflared missing'}, {note:'fixture tunnel not ready'}]) {
    context.fetch = async url => url === '/api/status' ? {ok:true,json:async()=>boundStatus} :
      {ok:true,status:200,json:async()=>({success:false,...reason})};
    assert.equal(await bridge.namespace.startBridge(), false);
    assert.ok(bridgeNotices.at(-1).startsWith('fixture '), 'show actionable server failure, not generic failure');
  }
  assert.equal(refreshed, 2, 'failed restart refreshes stale public URL state');
  assert.equal(copied, 0, 'failure must not copy a fallback URL');
  context.fetch = async () => ({ok:false,status:500,json:async()=>({success:true,error:'fixture stop rejected'})});
  assert.equal(await bridge.namespace.stopBridge(), false);
  assert.equal(removed, 0, 'HTTP failure cannot extinguish the indicator as if stop succeeded');
  assert.equal(bridgeNotices.at(-1), 'fixture stop rejected');
  context.fetch = async () => ({ok:true,json:async()=>({success:false,error:'fixture still running'})});
  assert.equal(await bridge.namespace.stopBridge(), false);
  assert.equal(removed, 0);
  context.fetch = async () => { throw new Error('fixture lost response'); };
  assert.equal(await bridge.namespace.stopBridge(), false);
  assert.equal(removed, 0);
  context.fetch = async () => ({ok:true,json:async()=>({success:true})});
  assert.equal(await bridge.namespace.stopBridge(), true);
  assert.equal(removed, 1);
  assert.equal(refreshed, 3);
  const taskNodes = new Map();
  context.document.querySelector = selector => {
    if (!taskNodes.has(selector)) taskNodes.set(selector,{innerHTML:'',textContent:'',classList:{remove(){},toggle(){}}});
    return taskNodes.get(selector);
  };
  const chat = new vm.SourceTextModule(fs.readFileSync(path.join(root,'chat.js'),'utf8'),{context});
  await chat.link(specifier=>specifier==='./state.js'?state:dom);await chat.evaluate();
  chat.namespace.paintTodos([{title:'Local task',status:'pending'}]);
  chat.namespace.paintBridgeTasks([{sessionId:'remote-a',todos:[{title:'Remote <script>',status:'completed'}]}]);
  assert.ok(taskNodes.get('#chat-todo-list').innerHTML.includes('Local task'));
  assert.ok(!taskNodes.get('#bridge-todo-list').innerHTML.includes('Local task'));
  assert.ok(taskNodes.get('#bridge-todo-list').innerHTML.includes('&lt;script&gt;'));
  assert.ok(taskNodes.get('#bridge-task-count').textContent.includes('1/1'));
  bridge.namespace.paintBridgeActivity({...activity,taskStates:[]});
  assert.ok(taskNodes.get('#bridge-todo-list').innerHTML.includes('set_todos'));
  // Identical activity revisions must still refresh independent task expiry/snapshots.
  bridge.namespace.paintBridgeActivity({...activity,taskStates:[{sessionId:'b',todos:[{title:'Another task'}]}]});
  assert.ok(taskNodes.get('#bridge-todo-list').innerHTML.includes('Another task'));
  const settings = new vm.SourceTextModule(fs.readFileSync(path.join(root,'settings.js'),'utf8'),{context});
  await settings.link(specifier => specifier === './state.js' ? state : dom); await settings.evaluate();
  const custom = {instructions:'saved',preference:'old',environment:{},techStack:{},agents:[],prompts:[],hooks:[],mcpServers:[],plugins:[],quickLinks:[]};
  state.namespace.state.custom = custom;
  const notices = []; state.namespace.ui.toast = message => notices.push(message);
  context.fetch = async () => ({ok:false,status:400,json:async()=>({success:false,error:'fixture rejected'})});
  assert.strictEqual(await settings.namespace.saveCustom({instructions:'draft'}), false);
  assert.strictEqual(state.namespace.state.custom,custom);
  assert.ok(notices.at(-1).includes('fixture rejected'));
  for (const response of [
    {ok:true,json:async()=>({success:false,error:'business rejection'})},
    {ok:true,json:async()=>({success:true})},
    {ok:true,json:async()=>{throw new Error('invalid JSON')}}
  ]) {
    context.fetch = async () => response;
    assert.strictEqual(await settings.namespace.saveCustom({instructions:'draft'}),false);
    assert.strictEqual(state.namespace.state.custom,custom);
  }
  context.fetch = async () => {throw new Error('network lost')};
  assert.strictEqual(await settings.namespace.saveCustom({instructions:'draft'}),false);
  assert.ok(notices.at(-1).includes('状态未知'));
  assert.strictEqual(await settings.namespace.loadCustomizations(),false);
  assert.strictEqual(state.namespace.state.custom,custom);
  for (const data of [{success:false,error:'load rejected'},[],{...custom,hooks:[null]}]) {
    context.fetch = async () => ({ok:true,json:async()=>data});
    assert.strictEqual(await settings.namespace.loadCustomizations(),false);
    assert.strictEqual(state.namespace.state.custom,custom);
  }
  context.fetch = async (url,options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',()=>reject(new Error('timeout fixture'))));
  const oldTimers = new Set(timers.keys());
  const timedSave = settings.namespace.saveCustom({instructions:'timeout'});
  const timeoutId = [...timers.keys()].find(id => !oldTimers.has(id));
  timers.get(timeoutId)();
  assert.strictEqual(await timedSave,false);
  assert.ok(!timers.has(timeoutId));
  assert.strictEqual(state.namespace.state.custom,custom);
  let finishSave, sent, requests = 0;
  context.fetch = async (url,options) => { requests++; sent=JSON.parse(options.body); return new Promise(resolve=>{finishSave=resolve}); };
  taskNodes.get('#instr-text') || context.document.querySelector('#instr-text');
  taskNodes.get('#instr-text').value='newer draft';
  const saving = settings.namespace.saveCustom({preference:'changed'});
  assert.strictEqual(await settings.namespace.saveCustom({instructions:'second'}),false);
  assert.strictEqual(await settings.namespace.loadCustomizations(),false);
  assert.strictEqual(requests,1);
  assert.deepStrictEqual(sent,{preference:'changed'});
  finishSave({ok:true,json:async()=>({success:true,customizations:{...custom,preference:'changed'}})});
  assert.ok(await saving);
  assert.strictEqual(taskNodes.get('#instr-text').value,'newer draft');
  context.fetch = async () => ({ok:true,json:async()=>custom});
  assert.ok(await settings.namespace.loadCustomizations());
  assert.strictEqual(taskNodes.get('#instr-text').value,'saved');
  let modelRefreshes = 0;
  state.namespace.ui.refreshStatus = async () => { modelRefreshes++; };
  context.fetch = async () => ({ok:false,json:async()=>({success:false,error:'model fixture rejected'})});
  assert.strictEqual(await settings.namespace.saveModelSettings({multiModel:{enabled:true}}),false);
  assert.strictEqual(modelRefreshes,0);
  assert.ok(notices.at(-1).includes('model fixture rejected'));
  context.fetch = async () => ({ok:true,json:async()=>({success:false,error:'business failure'})});
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'x'}),false);
  context.fetch = async () => {throw new Error('connection lost')};
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'x'}),false);
  assert.ok(notices.at(-1).includes('状态未知'));
  let completeModel, modelCalls = 0;
  context.fetch = async () => {modelCalls++; return new Promise(resolve=>{completeModel=resolve});};
  const modelSave = settings.namespace.saveModelSettings({activeModelId:'x'});
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'y'}),false);
  assert.strictEqual(modelCalls,1);
  completeModel({ok:true,json:async()=>({success:true,activeModelId:'x'})});
  assert.strictEqual(await modelSave,true); assert.strictEqual(modelRefreshes,1);
  context.fetch = async () => ({ok:true,json:async()=>({success:true})});
  state.namespace.ui.refreshStatus = async () => {throw new Error('refresh failed')};
  assert.strictEqual(await settings.namespace.saveModelSettings({multiModel:{enabled:true}}),true);
  assert.ok(notices.at(-1).includes('已保存，但状态刷新失败'));
  const clientNodes = new Map();
  context.document.querySelector = selector => {
    if (!clientNodes.has(selector)) clientNodes.set(selector,{innerHTML:'',value:'',textContent:'',querySelectorAll:()=>[],classList:{toggle(){}}});
    return clientNodes.get(selector);
  };
  state.namespace.state.selectedClient='deepseek';
  state.namespace.state.status={clients:[{id:'deepseek',name:'Candidate',summary:'未验证',steps:[],needsPlus:null,verification:'unverified',connectMode:'extension-http'}],mcpUrl:'http://localhost:123/mcp/fixture'};
  bridge.namespace.paintClients();
  assert.ok(clientNodes.get('#client-cards').innerHTML.includes('订阅条件待核对'));
  assert.ok(!clientNodes.get('#client-cards').innerHTML.includes('无需 Plus'));
  bridge.namespace.renderBrowser({site:'deepseek',url:'https://chat.deepseek.com/'});
  assert.ok(clientNodes.get('#browser-page').innerHTML.includes('兼容性未验证'));
  assert.ok(!clientNodes.get('#browser-page').innerHTML.includes('kdmpkkahkhdmdhfkdihkopikgcocbpbf'));
  state.namespace.state.status.bridgeRunning=true;
  state.namespace.state.status.pairing={code:'FIXTURE',expiresInSec:120};
  bridge.namespace.paintClients();
  assert.ok(clientNodes.get('#pairing-line').textContent.includes('兼容OAuth客户端'));
  assert.ok(!clientNodes.get('#pairing-line').textContent.includes('仅 ChatGPT'));
  state.namespace.state.status.clients=[{id:'chatgpt-free',prompt:'',connectMode:'unsupported-mcp'}];
  state.namespace.state.selectedClient='chatgpt-free';
  state.namespace.state.status.prompt='MUST-NOT-FALL-BACK-TO-SECRET';
  assert.strictEqual(bridge.namespace.promptText(),'');
  // R3: validate snapshots before publishing and never let an older GET win.
  const statusNodes = new Map();
  context.document.querySelector = selector => {
    if (!statusNodes.has(selector)) statusNodes.set(selector, {
      value: '', textContent: '', innerHTML: '', dataset: {}, style: {},
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      addEventListener() {}, setAttribute() {}, querySelectorAll: () => []
    });
    return statusNodes.get(selector);
  };
  context.document.querySelectorAll = () => [];
  context.document.getElementById = id => context.document.querySelector('#' + id);
  const confirmedStatus = { status:'online', bridgeRunning:false, activeModelId:'old',
    models:[{id:'old',name:'Old model'},{id:'new',name:'New model'},{id:'builtin',name:'内置探索 Agent',protocol:'builtin'}] };
  state.namespace.state.status = confirmedStatus;
  state.namespace.ui.paintBridge = () => {};
  state.namespace.ui.paintProviderTable = () => {};
  state.namespace.ui.paintPlanComposer = () => {};
  state.namespace.ui.paintTodos = () => {};
  context.document.querySelector('#model-select').value = 'old';
  for (const response of [
    {ok:false,status:503,json:async()=>({error:'unavailable'})},
    {ok:true,json:async()=>({success:false})},
    {ok:true,json:async()=>({...confirmedStatus,models:[null]})},
    {ok:true,json:async()=>({...confirmedStatus,models:[{id:'bad',caps:{}}]})},
    {ok:true,json:async()=>{throw new Error('invalid JSON')}}
  ]) {
    context.fetch = async () => response;
    await assert.rejects(bridge.namespace.refreshStatus());
    assert.strictEqual(state.namespace.state.status,confirmedStatus,'invalid GET must not replace the last snapshot');
    assert.strictEqual(statusNodes.get('#model-select').value,'old');
  }
  assert.ok(statusNodes.get('#sb-bridge').textContent.includes('状态同步失败'));
  let finishOlder, finishNewer, olderSignal;
  context.fetch = (url, options) => { olderSignal=options?.signal; return new Promise(resolve=>{finishOlder=resolve}); };
  const olderRead = bridge.namespace.refreshStatus();
  context.fetch = () => new Promise(resolve=>{finishNewer=resolve});
  const newerRead = bridge.namespace.refreshStatus();
  finishNewer({ok:true,json:async()=>({...confirmedStatus,activeModelId:'new'})});
  assert.strictEqual(await newerRead,true);
  finishOlder({ok:true,json:async()=>confirmedStatus});
  assert.strictEqual(await olderRead,false,'superseded refresh is not a successful synchronization');
  assert.ok(olderSignal.aborted);
  assert.strictEqual(state.namespace.state.status.activeModelId,'new');
  assert.strictEqual(statusNodes.get('#model-select').value,'new');
  assert.strictEqual(statusNodes.get('#model-pick-btn').textContent,'New model');
  // A failing newer read still invalidates an older success; no stale fallback.
  context.fetch = () => new Promise(resolve=>{finishOlder=resolve});
  const staleRead = bridge.namespace.refreshStatus();
  context.fetch = async () => {throw new Error('offline')};
  await assert.rejects(bridge.namespace.refreshStatus());
  finishOlder({ok:true,json:async()=>confirmedStatus});
  assert.strictEqual(await staleRead,false);
  assert.strictEqual(state.namespace.state.status.activeModelId,'new');
  const beforeTimeout = new Set(timers.keys());
  context.fetch = (url, options) => new Promise((resolve,reject) => options.signal.addEventListener('abort',()=>reject(new Error('timeout'))));
  const timedRead = bridge.namespace.refreshStatus();
  const readTimer = [...timers.keys()].find(id=>!beforeTimeout.has(id));
  timers.get(readTimer)();
  await assert.rejects(timedRead);
  assert.ok(!timers.has(readTimer));
  assert.strictEqual(state.namespace.state.status.activeModelId,'new');

  // Guard after JSON as well as headers: a cancelled decoder can still resolve.
  let finishBody, enteredBody;
  const bodyEntered = new Promise(resolve=>{enteredBody=resolve});
  context.fetch = async () => ({ok:true,json:()=>{enteredBody();return new Promise(resolve=>{finishBody=resolve});}});
  const decodingRead = bridge.namespace.refreshStatus();
  await bodyEntered;
  context.fetch = async () => ({ok:true,json:async()=>({...confirmedStatus,activeModelId:'new'})});
  await bridge.namespace.refreshStatus();
  finishBody(confirmedStatus);
  assert.strictEqual(await decodingRead,false);
  assert.strictEqual(state.namespace.state.status.activeModelId,'new');
  context.fetch = async () => ({ok:true,json:async()=>({...confirmedStatus,activeModelId:'missing'})});
  assert.strictEqual(await bridge.namespace.refreshStatus(),true);
  assert.strictEqual(statusNodes.get('#model-select').value,'');
  assert.ok(statusNodes.get('#model-pick-btn').textContent.includes('模型不可用'));
  assert.strictEqual(state.namespace.state.status.activeModelId,'missing','unknown model must not silently fall back to builtin');
  statusNodes.get('#think-select').value='my-draft';
  statusNodes.get('#think-select').dataset.touched='1';
  context.fetch = async () => ({ok:true,json:async()=>({...confirmedStatus,activeModelId:'new',multiModel:{thinkLevel:'high'}})});
  await bridge.namespace.refreshStatus();
  assert.strictEqual(statusNodes.get('#think-select').value,'my-draft');

  // Execute the real bind callbacks and shared save helper, not copied handlers.
  const binding = new vm.SourceTextModule(fs.readFileSync(path.join(root,'bind.js'),'utf8'),{context});
  await binding.link(specifier => specifier==='./state.js'?state:specifier==='./picker.js'?picker:dom);
  await binding.evaluate();
  state.namespace.ui.initOperations = () => {};
  state.namespace.ui.initExecutionControl = () => {};
  state.namespace.ui.initTheme = () => {};
  binding.namespace.bind();
  state.namespace.ui.saveModelSettings = settings.namespace.saveModelSettings;
  state.namespace.ui.refreshStatus = bridge.namespace.refreshStatus;
  const modelSelect = statusNodes.get('#model-select');
  const beforeSelection = state.namespace.state.status;
  let finishSelection, selectionCalls=0;
  context.fetch = (url,options) => { selectionCalls++; return new Promise(resolve=>{finishSelection=resolve}); };
  modelSelect.value='old';
  const changing = modelSelect.onchange();
  assert.strictEqual(modelSelect.value,'new','pending choice must not become the Chat request model');
  assert.strictEqual(statusNodes.get('#model-pick-btn').textContent,'New model');
  await statusNodes.get('#btn-use-builtin').onclick();
  assert.strictEqual(selectionCalls,1,'builtin and composer share the model write guard');
  assert.ok(!statusNodes.get('#model-status').textContent.includes('已改回'));
  finishSelection({ok:false,status:409,json:async()=>({success:false,error:'selection rejected'})});
  await changing;
  assert.strictEqual(state.namespace.state.status,beforeSelection);
  assert.strictEqual(modelSelect.value,'new');
  context.fetch = async () => ({ok:true,json:async()=>({success:false,error:'builtin rejected'})});
  await statusNodes.get('#btn-use-builtin').onclick();
  assert.strictEqual(state.namespace.state.status,beforeSelection);
  assert.ok(statusNodes.get('#model-status').textContent.includes('未确认'));
  let selectedBody;
  context.fetch = async (url,options) => {
    if (url==='/api/models') { selectedBody=JSON.parse(options.body); return {ok:true,json:async()=>({success:true})}; }
    return {ok:true,json:async()=>({...confirmedStatus,activeModelId:selectedBody.activeModelId})};
  };
  modelSelect.value='old'; await modelSelect.onchange();
  assert.deepStrictEqual(selectedBody,{activeModelId:'old'});
  assert.strictEqual(state.namespace.state.status.activeModelId,'old');
  assert.strictEqual(modelSelect.value,'old');
  assert.strictEqual(statusNodes.get('#model-pick-btn').textContent,'Old model');
  await statusNodes.get('#btn-use-builtin').onclick();
  assert.deepStrictEqual(selectedBody,{activeModelId:'builtin'});
  assert.strictEqual(state.namespace.state.status.activeModelId,'builtin');
  // A confirmed write with a failed/superseded read remains saved, never re-POSTed.
  let savedCalls=0;
  context.fetch = async url => {
    if (url==='/api/models') {savedCalls++; return {ok:true,json:async()=>({success:true})};}
    return {ok:false,status:500,json:async()=>({success:false})};
  };
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'old'}),true);
  assert.strictEqual(savedCalls,1);
  assert.ok(notices.at(-1).includes('已保存，但状态刷新失败'));
  assert.strictEqual(state.namespace.state.status.activeModelId,'builtin');
  state.namespace.ui.refreshStatus = async () => false;
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'old'}),true);
  assert.ok(notices.at(-1).includes('已保存，但状态刷新失败'));
  // Provider UI: HTTP success and business success are distinct; no implicit fallback.
  const providerNodes = statusNodes;
  for (const id of ['m-base','m-key','m-id','m-vision']) context.document.querySelector('#'+id);
  providerNodes.get('#m-base').value='https://provider.test/v1';
  providerNodes.get('#m-key').value='fixture-key';
  providerNodes.get('#m-id').value='';
  context.fetch = async () => ({ok:false,status:500,json:async()=>({success:true,models:[{id:'x'}]})});
  await providerNodes.get('#btn-test-api').onclick();
  assert.ok(providerNodes.get('#model-status').textContent.includes('失败'),'HTTP500 cannot report Test OK');
  let providerWrites=0;
  for (const response of [
    {ok:false,status:400,json:async()=>({success:false,error:'denied'})},
    {ok:true,json:async()=>({success:false})},
    {ok:true,json:async()=>({success:true,models:[null]})},
    {ok:true,json:async()=>{throw new Error('bad JSON')}}
  ]) {
    context.fetch = async url => {if(url==='/api/models') providerWrites++; return response;};
    assert.strictEqual(await providerNodes.get('#btn-save-model').onclick(),false);
    assert.equal(providerWrites,0);
  }
  context.fetch=async()=>{throw new Error('network SECRET fixture-key')};
  assert.strictEqual(await providerNodes.get('#btn-save-model').onclick(),false);
  assert.ok(!providerNodes.get('#model-status').textContent.includes('fixture-key'));
  const providerTimers=new Set(timers.keys());
  context.fetch=(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('timeout'))));
  const providerTimeout=providerNodes.get('#btn-save-model').onclick();
  const providerTimer=[...timers.keys()].find(id=>!providerTimers.has(id));
  timers.get(providerTimer)();
  assert.strictEqual(await providerTimeout,false);assert.ok(!timers.has(providerTimer));
  let finishProbe, appendedBody, providerCalls=0, providerRefreshes=0;
  state.namespace.ui.refreshStatus=async()=>{providerRefreshes++;};
  providerNodes.get('#m-vision').checked=false;
  context.fetch=async(url,options)=>{
    providerCalls++;
    if(url==='/api/providers/probe') return new Promise(resolve=>{finishProbe=resolve});
    appendedBody=JSON.parse(options.body);
    return {ok:true,json:async()=>({success:true,added:1})};
  };
  const addingProvider=providerNodes.get('#btn-save-model').onclick();
  providerNodes.get('#m-base').value='https://new-draft.test/v1';
  providerNodes.get('#m-key').value='newer-key-draft';
  providerNodes.get('#m-vision').checked=true;
  assert.strictEqual(await providerNodes.get('#btn-save-model').onclick(),false);
  assert.strictEqual(await providerNodes.get('#btn-test-api').onclick(),false);
  assert.strictEqual(await settings.namespace.saveModelSettings({activeModelId:'builtin'}),false);
  assert.equal(providerCalls,1);
  finishProbe({ok:true,json:async()=>({success:true,models:[{id:'discovered',caps:[]}]})});
  assert.strictEqual(await addingProvider,true);
  assert.equal(providerCalls,2);assert.equal(providerRefreshes,1);
  assert.deepStrictEqual(appendedBody,{addProvider:{baseUrl:'https://provider.test/v1',apiKey:'fixture-key',vision:false,models:[{id:'discovered',caps:[]}]}});
  assert.equal(providerNodes.get('#m-key').value,'newer-key-draft','do not clear a newer draft after saving old input');
  assert.ok(providerNodes.get('#model-status').textContent.includes('未切换当前模型'));
  providerNodes.get('#m-id').value='manual/id';
  let manualCalls=0;
  context.fetch=async(url,options)=>{
    assert.equal(url,'/api/models','manual mode never implicitly discovers');manualCalls++;
    appendedBody=JSON.parse(options.body);
    return {ok:true,json:async()=>({success:true,added:1})};
  };
  assert.strictEqual(await providerNodes.get('#btn-save-model').onclick(),true);
  assert.equal(manualCalls,1);
  assert.equal(appendedBody.addProvider.models[0].id,'manual/id');
  assert.equal(appendedBody.addProvider.vision,true);
  assert.equal(providerNodes.get('#m-key').value,'');
  providerNodes.get('#m-key').value='keep-on-error';
  for (const response of [
    {ok:false,status:409,json:async()=>({success:false,error:'exists'})},
    {ok:true,json:async()=>({success:true})}, // An old host must not pretend to support addProvider.
    {ok:true,json:async()=>{throw new Error('lost response keep-on-error')}}
  ]) {
    context.fetch=async()=>response;
    assert.strictEqual(await providerNodes.get('#btn-save-model').onclick(),false);
    assert.ok(providerNodes.get('#model-status').textContent.includes('未确认'));
    assert.equal(providerNodes.get('#m-key').value,'keep-on-error');
    assert.ok(!notices.at(-1).includes('keep-on-error'));
  }
  context.fetch=async()=>({ok:true,json:async()=>({success:true,models:[{id:'found'}]})});
  assert.strictEqual(await providerNodes.get('#btn-test-api').onclick(),true);
  assert.ok(providerNodes.get('#model-status').textContent.includes('未保存'));
  state.namespace.state.status={models:[{id:'p',name:'Prototype group',group:'__proto__',caps:[]},{id:'c',name:'Constructor group',group:'constructor',caps:[]}]};
  settings.namespace.paintProviderTable();
  assert.ok(providerNodes.get('#provider-table').innerHTML.includes('Prototype group'));
  assert.ok(providerNodes.get('#provider-table').innerHTML.includes('Constructor group'));
  // Real operations module: delayed review A must not replace a newer review B.
  function opsNode() {
    return {textContent:'',value:'',children:[],disabled:false,
      append(...nodes) {this.children.push(...nodes);},
      replaceChildren(...nodes) {this.children=nodes;}};
  }
  const opsNodes=new Map();
  context.document.querySelector=selector=>{
    if (!opsNodes.has(selector)) opsNodes.set(selector,opsNode());
    return opsNodes.get(selector);
  };
  context.document.createElement=()=>opsNode();
  context.confirm=()=>true;
  const operations=new vm.SourceTextModule(fs.readFileSync(path.join(root,'operations.js'),'utf8'),{context});
  await operations.link(()=>state);await operations.evaluate();
  state.namespace.ui.initOperations();
  const opsJobs=['review-a','review-b'].map(requestId=>({requestId,kind:'workflow',status:'waiting-approval',input:{definition:{steps:[]}}}));
  let finishReviewA, finishReviewB, finishApproval, finishSubmission, approvalCount=0, submissionCount=0, previewFailure=false;
  context.crypto={randomUUID:()=>`fixture-key-${submissionCount}`};
  function opsResponse(value) {return {ok:true,json:async()=>value};}
  context.fetch=async(url)=>{
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[],requests:opsJobs});
    if(url==='/api/operations/review-a') return new Promise(resolve=>{finishReviewA=resolve});
    if(url==='/api/operations/review-b') return new Promise(resolve=>{finishReviewB=resolve});
    if(url.endsWith('/approve')) {approvalCount++;return new Promise(resolve=>{finishApproval=resolve;});}
    if(url==='/api/workflows/request') {submissionCount++;return new Promise(resolve=>{finishSubmission=resolve;});}
    if(url==='/api/workflows/preview') return opsResponse(previewFailure ? {ok:false,error:'fixture rejected'} : {ok:true,steps:[],preview:'NEW DRAFT'});
    throw new Error('Unexpected operation fixture URL '+url);
  };
  await state.namespace.ui.refreshOperations();
  const firstReview=opsNodes.get('#ops-requests').children[0].onclick();
  const secondReview=opsNodes.get('#ops-requests').children[1].onclick();
  finishReviewB(opsResponse(opsJobs[1]));await secondReview;
  finishReviewA(opsResponse(opsJobs[0]));await firstReview;
  assert.equal(JSON.parse(opsNodes.get('#ops-review').textContent).requestId,'review-b','older response must not replace newer approval target');
  const staleApprove=opsNodes.get('#ops-controls').children[0];
  context.document.querySelector('#ops-workflow').value='{"steps":[]}';
  await opsNodes.get('#btn-ops-preview').onclick();
  assert.equal(opsNodes.get('#ops-controls').children.length,0,'draft preview invalidates old approval controls');
  assert.ok(opsNodes.get('#ops-review').textContent.includes('NEW DRAFT'));
  await staleApprove.onclick();assert.equal(approvalCount,0,'even detached old controls cannot approve');
  const reopenB=opsNodes.get('#ops-requests').children[1].onclick();
  finishReviewB(opsResponse(opsJobs[1]));await reopenB;
  const approveB=opsNodes.get('#ops-controls').children[0];
  const pendingApproval=approveB.onclick();
  await approveB.onclick();assert.equal(approvalCount,1,'consume review before awaiting approval POST');
  const reopenA=opsNodes.get('#ops-requests').children[0].onclick();
  assert.equal(opsNodes.get('#ops-controls').children.length,0,'new inspection clears controls before its response');
  finishReviewA(opsResponse(opsJobs[0]));await reopenA;
  finishApproval(opsResponse({...opsJobs[1],status:'succeeded'}));await pendingApproval;
  assert.equal(JSON.parse(opsNodes.get('#ops-review').textContent).requestId,'review-a','late approval result must not reopen older selection');
  const mismatched=opsNodes.get('#ops-requests').children[0].onclick();
  finishReviewA(opsResponse(opsJobs[1]));assert.equal(await mismatched,false);
  assert.equal(opsNodes.get('#ops-controls').children.length,0,'mismatched request id cannot render approval');
  previewFailure=true;
  assert.equal(await opsNodes.get('#btn-ops-preview').onclick(),false,'HTTP 200 business failure is not success');
  assert.equal(opsNodes.get('#ops-controls').children.length,0);
  previewFailure=false;
  const submit=opsNodes.get('#btn-ops-submit').onclick();
  await opsNodes.get('#btn-ops-submit').onclick();assert.equal(submissionCount,1,'in-flight submission cannot mint a second request key');
  finishSubmission(opsResponse(opsJobs[0]));
  await new Promise(resolve=>setImmediate(resolve));
  finishReviewA(opsResponse(opsJobs[0]));await submit;
  const timedReview=opsNodes.get('#ops-requests').children[0].onclick();
  [...timers.values()].at(-1)(); // Real fetch observes this signal; a late fixture response must also be ignored.
  finishReviewA(opsResponse(opsJobs[0]));assert.equal(await timedReview,false);
  assert.equal(opsNodes.get('#ops-controls').children.length,0,'timeout cannot reactivate stale approval controls');
  state.namespace.state.status={workspaceRoot:'/fixture',identity:{hostInstanceId:'fixture-host'}};
  const checkpointRecord={id:'cp-a',state:'ready',paths:['a.txt'],result:null};
  const checkpointPreview={...checkpointRecord,previewId:'preview-a',files:[{path:'a.txt',expectedHash:'a'.repeat(64),targetHash:'b'.repeat(64),changed:true,diff:'reviewed diff'}]};
  context.fetch=async url=>{
    if(url==='/api/checkpoints') return opsResponse([checkpointRecord]);
    if(url==='/api/operations') return opsResponse({servers:[],requests:opsJobs});
    if(url==='/api/checkpoints/cp-a/preview') return opsResponse({...checkpointPreview,id:'cp-b'});
    throw new Error(url);
  };
  await state.namespace.ui.refreshOperations();
  await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
  assert.equal(opsNodes.get('#checkpoint-controls').children.length,0,'mismatched checkpoint preview must not authorize restore');
  // A failed checkpoint list must not block the independent approvals list.
  let operationReads=0;
  context.fetch=async url=>{
    if(url==='/api/checkpoints') throw new Error('fixture checkpoints unavailable');
    if(url==='/api/operations') {operationReads++;return opsResponse({servers:[],requests:opsJobs});}
    throw new Error(url);
  };
  await state.namespace.ui.refreshOperations().catch(()=>{});
  assert.equal(operationReads,1,'checkpoint failure must not prevent approval status refresh');
  assert.match(opsNodes.get('#checkpoint-list').textContent,/刷新失败/);
  assert.equal(opsNodes.get('#ops-requests').children.length,2,'healthy list is published despite sibling failure');
  const listBodies=[];
  context.fetch=async url=>url==='/api/checkpoints' ? opsResponse([]) : {ok:true,json:()=>new Promise(resolve=>listBodies.push(resolve))};
  const olderList=state.namespace.ui.refreshOperations();
  const newerList=state.namespace.ui.refreshOperations();
  await new Promise(resolve=>setImmediate(resolve));
  listBodies[1]({servers:[],requests:[opsJobs[1]]});await newerList;
  listBodies[0]({servers:[],requests:[opsJobs[0]]});await olderList;
  assert.ok(opsNodes.get('#ops-requests').children[0].textContent.includes('review-b'),'late JSON cannot roll back list');
  const detachedRequest=opsNodes.get('#ops-requests').children[0];
  context.fetch=async url=>url==='/api/checkpoints' ? opsResponse([]) : opsResponse({servers:[],requests:[opsJobs[0],null]});
  await state.namespace.ui.refreshOperations();
  assert.equal(opsNodes.get('#ops-requests').children.length,0,'invalid row rejects entire list, not a partial actionable snapshot');
  assert.equal(await detachedRequest.onclick(),false,'detached list controls cannot act after refresh');
  let previewValue=checkpointPreview, restoreValue, restoreCalls=0;
  context.fetch=async url=>{
    if(url==='/api/checkpoints') return opsResponse([checkpointRecord]);
    if(url==='/api/operations') return opsResponse({servers:[],requests:opsJobs});
    if(url.endsWith('/preview')) return opsResponse(previewValue);
    if(url.endsWith('/restore')) {restoreCalls++;return opsResponse(restoreValue);}
    throw new Error(url);
  };
  for (const invalid of [{...checkpointPreview,previewId:''},{...checkpointPreview,files:[]},{...checkpointPreview,files:[{...checkpointPreview.files[0],diff:null}]}]) {
    previewValue=invalid;await state.namespace.ui.refreshOperations();
    await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
    assert.equal(opsNodes.get('#checkpoint-controls').children.length,0,'incomplete diff cannot create restore authorization');
  }
  previewValue=checkpointPreview;
  await state.namespace.ui.refreshOperations();
  await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
  const boundRestore=opsNodes.get('#checkpoint-controls').children[0];
  state.namespace.state.status.workspaceRoot='/other';await boundRestore.onclick();
  assert.equal(restoreCalls,0,'changed workspace must re-review before dispatch');
  state.namespace.state.status.workspaceRoot='/fixture';
  for (const result of [null,{id:'wrong',state:'consumed',paths:['a.txt'],result:{success:true,status:'succeeded',files:[{path:'a.txt',status:'restored'}]}},
    {...checkpointRecord,state:'consumed',result:{success:true,status:'succeeded',files:[{path:'a.txt',status:'unknown'}]}}]) {
    restoreValue=result;await state.namespace.ui.refreshOperations();
    await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
    const restore=opsNodes.get('#checkpoint-controls').children[0];await restore.onclick();await restore.onclick();
    assert.match(opsNodes.get('#checkpoint-review').textContent,/未取得可信完成结果/);
    assert.equal(opsNodes.get('#checkpoint-controls').children.length,0);
  }
  assert.equal(restoreCalls,3,'uncertain responses cannot replay a consumed button');
  for (const [status,success,fileStatus] of [['unknown',false,'unknown'],['succeeded',true,'restored']]) {
    restoreValue={...checkpointRecord,state:'consumed',result:{status,success,files:[{path:'a.txt',status:fileStatus}]}};
    await state.namespace.ui.refreshOperations();await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
    await opsNodes.get('#checkpoint-controls').children[0].onclick();
    assert.equal(JSON.parse(opsNodes.get('#checkpoint-review').textContent).result.status,status,'preserve validated partial/terminal results');
  }
  const checkpointBodies=[];
  context.fetch=async url=>url==='/api/checkpoints' ? {ok:true,json:()=>new Promise(resolve=>checkpointBodies.push(resolve))} : opsResponse({servers:[],requests:opsJobs});
  const oldCheckpoints=state.namespace.ui.refreshOperations(), newCheckpoints=state.namespace.ui.refreshOperations();
  await new Promise(resolve=>setImmediate(resolve));
  checkpointBodies[1]([]);await newCheckpoints;
  checkpointBodies[0]([checkpointRecord]);await oldCheckpoints;
  assert.equal(opsNodes.get('#checkpoint-list').children.length,0,'late checkpoint list cannot revive old ready records');
  console.log('workbench module/theme runtime regressions passed (DOM fixture, not browser E2E)');
})().catch(err => { console.error(err); process.exitCode = 1; });
