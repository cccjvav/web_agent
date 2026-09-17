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
  console.log('workbench module/theme runtime regressions passed (DOM fixture, not browser E2E)');
})().catch(err => { console.error(err); process.exitCode = 1; });
