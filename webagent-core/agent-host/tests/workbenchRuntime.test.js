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
  const cssVars = {};
  const storage = new Map();
  const themes = [];
  const context = vm.createContext({
    document: { documentElement: { dataset: {}, style: { setProperty: (k, v) => { cssVars[k] = v; } } }, querySelector: () => button },
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

  // Text scale: the stylesheet sizes everything in rem, so this control is the only way a user
  // can enlarge the dense 11px metadata. Verify it clamps, persists and survives a hostile store.
  context.localStorage.getItem = key => storage.get(key);
  context.localStorage.setItem = (key, value) => storage.set(key, value);
  const { applyTextScale, initTextScale, stepTextScale, currentTextScale,
    TEXT_SCALE_MIN, TEXT_SCALE_MAX } = dom.namespace;
  assert.strictEqual(initTextScale(), 1, 'default scale is 1 so existing rendering is unchanged');
  assert.strictEqual(cssVars['--text-scale'], '1', 'the CSS variable drives the rem scale');
  // Stepping must clamp at both ends rather than running away, and must not drift on floats.
  let scale;
  for (let i = 0; i < 20; i += 1) scale = stepTextScale(1);
  assert.strictEqual(scale, TEXT_SCALE_MAX, 'enlarging clamps at the declared maximum');
  assert.strictEqual(cssVars['--text-scale'], String(TEXT_SCALE_MAX));
  assert.strictEqual(button.disabled, true, 'the control reports its own limit instead of no-opping');
  for (let i = 0; i < 20; i += 1) scale = stepTextScale(-1);
  assert.strictEqual(scale, TEXT_SCALE_MIN, 'shrinking clamps at the declared minimum');
  assert.strictEqual(applyTextScale(1.2), 1.2);
  assert.strictEqual(currentTextScale(), 1.2);
  assert.strictEqual(storage.get('webagent-text-scale'), '1.2', 'the choice is persisted');
  assert.strictEqual(initTextScale(), 1.2, 'and restored on the next load');
  assert.ok(/120%/.test(button['aria-label']), 'the current size is announced to assistive tech');
  // A corrupt or hostile stored value must fall back, never produce an unreadable page.
  for (const [stored, expected] of [['not-a-number', 1], ['99', TEXT_SCALE_MAX], ['-5', 1], ['0', 1], ['', 1]]) {
    storage.set('webagent-text-scale', stored);
    assert.strictEqual(initTextScale(), expected, `stored ${JSON.stringify(stored)} must resolve to ${expected}`);
  }
  context.localStorage.getItem = () => { throw new Error('storage unavailable'); };
  context.localStorage.setItem = () => { throw new Error('storage unavailable'); };
  assert.doesNotThrow(() => initTextScale(), 'a storage-disabled browser must still render');
  context.localStorage.getItem = key => storage.get(key);
  context.localStorage.setItem = (key, value) => storage.set(key, value);
  applyTextScale(1);
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
  assert.strictEqual(await firstRefresh, true);
  assert.strictEqual(activityRequests, 1);
  context.fetch = async () => ({ ok: false, status: 503 });
  assert.strictEqual(await bridge.namespace.refreshBridgeActivity(), false);
  assert.ok(button.textContent.includes('同步失败'));
  context.fetch = async () => ({ ok: true, json: async () => activity });
  assert.strictEqual(await bridge.namespace.refreshBridgeActivity(), true);
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
  // R42: real start/stop functions; well-formed preflight and write contracts.
  const actionNodes = new Map();
  let starts = 0, stops = 0, copied = 0, lit = 0, removed = 0, refreshed = 0;
  context.document.querySelector = selector => {
    if (!actionNodes.has(selector)) actionNodes.set(selector,{value:'',textContent:'',disabled:false,
      classList:{add(){if(selector==='#sess-dot')lit++;},remove(){if(selector==='#sess-dot')removed++;},toggle(){}}});
    return actionNodes.get(selector);
  };
  context.window.alert = () => {};
  context.navigator = {clipboard:{writeText:async()=>{copied++;}}};
  const boundStatus = {status:'online',bridgeRunning:false,activeModelId:'builtin',models:[],
    workspaceRoot:'/fixture/project',identity:{hostInstanceId:'current'},secretKey:'c'.repeat(24)};
  const startAck = {success:true,running:true,provider:'cloudflare',secretKey:boundStatus.secretKey,
    mcpPath:'/mcp/'+boundStatus.secretKey,mcpUrl:'https://fixture.test/mcp/'+boundStatus.secretKey,mcpCanonicalUrl:'https://fixture.test/mcp'};
  const stopAck = {success:true,running:false};
  const actionReply = (data,ok=true) => ({ok,status:ok?200:500,json:async()=>data});
  const actionResult = () => actionNodes.get('#bridge-result').textContent;
  state.namespace.ui.refreshStatus = async () => {refreshed++;return true;};
  context.fetch = async url => url === '/api/status' ? actionReply(boundStatus) : (++starts,actionReply(startAck));
  for(const snapshot of [null,{...boundStatus,identity:{hostInstanceId:'stale'}}]) {
    state.namespace.state.status = snapshot;
    assert.equal(await bridge.namespace.startBridge(),false);assert.equal(starts,0);
    assert.ok(actionResult().includes('未发送启动'));
  }
  state.namespace.state.status = boundStatus;
  context.fetch = async url => url === '/api/status' ? actionReply({...boundStatus,bridgeRunning:true}) : (++starts,actionReply(startAck));
  assert.equal(await bridge.namespace.startBridge(),false);assert.equal(starts,0,'already-running status must not replay a start');
  let finishPreflight;
  context.fetch = async url => url === '/api/status' ? new Promise(resolve=>{finishPreflight=resolve;}) : (++starts,actionReply(startAck));
  const changedHostStart = bridge.namespace.startBridge();
  state.namespace.state.status = {...boundStatus,identity:{hostInstanceId:'other'}};
  finishPreflight(actionReply(boundStatus));
  assert.equal(await changedHostStart,false);assert.equal(starts,0,'recheck visible binding after await');
  state.namespace.state.status = boundStatus;
  for(const data of [null,{}, {success:true}, {...startAck,running:false},{...startAck,success:'true'},
    {...startAck,provider:'ngrok'},{...startAck,mcpUrl:'javascript:secret'}, {success:false,tunnelError:'TOKEN-MUST-NOT-ECHO'}]) {
    context.fetch = async url => url === '/api/status' ? actionReply(boundStatus) : (++starts,actionReply(data));
    assert.equal(await bridge.namespace.startBridge(),false);
    assert.ok(actionResult().includes('未确认'));assert.ok(!actionResult().includes('TOKEN-MUST-NOT-ECHO'));
  }
  assert.equal(refreshed,8,'failed sent requests still try one read, never another write');
  assert.equal(copied,0);assert.equal(lit,0);
  context.fetch = async url => url === '/api/status' ? actionReply(boundStatus) : actionReply(startAck,false);
  assert.equal(await bridge.namespace.startBridge(),false,'HTTP failure overrides success body');
  context.fetch = async()=>{throw new Error('offline');};
  assert.equal(await bridge.namespace.startBridge(),false);assert.ok(actionResult().includes('未发送启动'));
  for(const data of [null,{}, {success:true}, {...stopAck,running:true}, {...stopAck,success:'true'}, {success:false}]) {
    context.fetch = async () => (++stops,actionReply(data));
    assert.equal(await bridge.namespace.stopBridge(),false);
    assert.ok(actionResult().includes('停止结果未确认'));
  }
  context.fetch = async () => actionReply(stopAck,false);
  assert.equal(await bridge.namespace.stopBridge(),false);assert.equal(removed,0);
  context.fetch = async () => {throw new Error('TOKEN-MUST-NOT-ECHO');};
  assert.equal(await bridge.namespace.stopBridge(),false);assert.ok(!actionResult().includes('TOKEN-MUST-NOT-ECHO'));
  // Confirmed writes survive read rejection, supersession or a mismatching snapshot.
  for(const read of [async()=>{throw new Error('read failed');},async()=>false,async()=>true]) {
    state.namespace.state.status = {...boundStatus,bridgeRunning:true};
    state.namespace.ui.refreshStatus = read;
    context.fetch = async () => actionReply(stopAck);
    assert.equal(await bridge.namespace.stopBridge(),true);assert.ok(actionResult().includes('停止已确认，但当前状态未核对'));
    state.namespace.state.status = boundStatus;
    context.fetch = async url => url === '/api/status' ? actionReply(boundStatus) : actionReply(startAck);
    assert.equal(await bridge.namespace.startBridge(),true);assert.ok(actionResult().includes('启动已确认，但当前状态或地址未核对'));
  }
  state.namespace.ui.refreshStatus = async()=>{state.namespace.state.status={...boundStatus,...startAck,bridgeRunning:true};return true;};
  assert.equal(await bridge.namespace.startBridge(),true);assert.ok(actionResult().includes('当前地址已核对'));
  assert.equal(copied,0,'even confirmed starts leave address copying explicit');
  // Repeated start POST is single-flight; stop is independent and supersedes late success.
  state.namespace.state.status = boundStatus;
  state.namespace.ui.refreshStatus = async()=>{state.namespace.state.status=boundStatus;return true;};
  starts=0;stops=0;
  let finishStart, finishStop;
  context.fetch = async (url,options) => {
    if(url === '/api/status') return actionReply(boundStatus);
    if(url.endsWith('/start')) {starts++;return new Promise(resolve=>{finishStart=resolve;});}
    assert.equal(JSON.parse(options.body).hostInstanceId,'current');
    stops++;return new Promise(resolve=>{finishStop=resolve;});
  };
  const firstStart = bridge.namespace.startBridge();
  assert.equal(await bridge.namespace.startBridge(),false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(starts,1,'a pending start must not issue a second POST');
  assert.equal(actionNodes.get('#btn-bridge-toggle').textContent,'停止启动');
  assert.equal(actionNodes.get('#btn-stop-bridge-rb').disabled,false);
  const independentStop = bridge.namespace.stopBridge();
  assert.equal(await bridge.namespace.stopBridge(),false);assert.equal(stops,1);
  assert.equal(await bridge.namespace.startBridge(),false,'no start while stop is pending');
  finishStop(actionReply(stopAck));assert.equal(await independentStop,true);
  const stopMessage = actionResult(), lightsBeforeLate = lit;
  finishStart(actionReply(startAck));assert.equal(await firstStart,false);
  assert.equal(actionResult(),stopMessage);assert.equal(lit,lightsBeforeLate);assert.equal(copied,0);
  // A confirmed old start may still await its read while stop and a newer start run.
  {
    let finishRead, finishNewStart, reads=0, writes=0;
    state.namespace.state.status=boundStatus;
    state.namespace.ui.refreshStatus=async()=>++reads===1 ? new Promise(resolve=>{finishRead=resolve;}) : true;
    context.fetch=async url=>url==='/api/status' ? actionReply(boundStatus) : url.endsWith('/stop') ? actionReply(stopAck) :
      ++writes===1 ? actionReply(startAck) : new Promise(resolve=>{finishNewStart=resolve;});
    const confirmedOld=bridge.namespace.startBridge();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(await bridge.namespace.stopBridge(),true);
    const newerStart=bridge.namespace.startBridge();
    await new Promise(resolve=>setImmediate(resolve));
    const newerMessage=actionResult();finishRead(true);
    assert.equal(await confirmedOld,true,'a confirmed old write remains confirmed, without replacing the newer UI intent');
    assert.equal(actionResult(),newerMessage);assert.equal(bridge.namespace.bridgeStartPending(),true);
    assert.equal(await bridge.namespace.startBridge(),false,'old finally must not release a newer start guard');
    finishNewStart(actionReply(startAck));assert.equal(await newerStart,true);
    state.namespace.ui.refreshStatus=async()=>true;
  }
  // Stop during preflight prevents the not-yet-sent start; missing bindings never stop another host.
  starts=0;
  context.fetch = async url => url === '/api/status' ? new Promise(resolve=>{finishPreflight=resolve;}) :
    url.endsWith('/start') ? (++starts,actionReply(startAck)) : actionReply(stopAck);
  const beforePost = bridge.namespace.startBridge();
  assert.equal(await bridge.namespace.stopBridge(),true);
  finishPreflight(actionReply(boundStatus));assert.equal(await beforePost,false);assert.equal(starts,0);
  state.namespace.state.status = null;
  context.fetch = async()=>{throw new Error('must not send');};
  assert.equal(await bridge.namespace.stopBridge(),false);assert.ok(actionResult().includes('未发送停止'));
  state.namespace.state.status = boundStatus;
  // Capture provider/domain/token together, not a token edited while GET is in flight.
  actionNodes.get('input[name="tunnel"]:checked').value='ngrok';
  context.document.querySelector('#ngrok-domain').value='old.test';context.document.querySelector('#ngrok-token').value='old-token';
  let capturedStart;
  context.fetch = async (url,options) => url === '/api/status' ? new Promise(resolve=>{finishPreflight=resolve;}) :
    (capturedStart=JSON.parse(options.body),actionReply({...startAck,provider:'ngrok'}));
  const draftStart = bridge.namespace.startBridge();
  actionNodes.get('#ngrok-token').value='new-token';actionNodes.get('#ngrok-domain').value='new.test';
  finishPreflight(actionReply(boundStatus));assert.equal(await draftStart,true);
  assert.equal(capturedStart.ngrokToken,'old-token');assert.equal(capturedStart.ngrokDomain,'old.test');
  actionNodes.get('input[name="tunnel"]:checked').value='';
  // Expired response bodies cannot be consumed as success (without wall-clock sleeps).
  const actionTimeout = context.setTimeout, actionClear = context.clearTimeout;
  let expireAction, finishActionBody;
  context.setTimeout = fn=>{expireAction=fn;return 42;};context.clearTimeout=()=>{};
  for(const action of ['startBridge','stopBridge']) {
    state.namespace.state.status=boundStatus;
    context.fetch = async url => url === '/api/status' ? actionReply(boundStatus) : {ok:true,json:()=>new Promise(resolve=>{finishActionBody=resolve;})};
    const pendingAction = bridge.namespace[action]();
    await new Promise(resolve=>setImmediate(resolve));
    expireAction();finishActionBody(action==='startBridge'?startAck:stopAck);
    assert.equal(await pendingAction,false);assert.ok(actionResult().includes('未确认'));
  }
  context.setTimeout=actionTimeout;context.clearTimeout=actionClear;
  const taskNodes = new Map();
  context.document.querySelector = selector => {
    if (!taskNodes.has(selector)) taskNodes.set(selector,{innerHTML:'',textContent:'',classList:{remove(){},toggle(){}}});
    return taskNodes.get(selector);
  };
  const tabs = new vm.SourceTextModule(fs.readFileSync(path.join(root,'tabs.js'),'utf8'),{context});
  await tabs.link(specifier=>specifier==='./state.js'?state:dom);await tabs.evaluate();
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
  // OAuth pairing is opt-in (2026-09-25): while off, no code is shown even from a stale snapshot and
  // the button offers to turn it on; while on, the code appears and the button offers to turn it off.
  state.namespace.state.status.pairing={enabled:false,code:'FIXTURE',expiresInSec:120};
  bridge.namespace.paintClients();
  assert.ok(clientNodes.get('#pairing-line').textContent.includes('已关闭'));
  assert.ok(!clientNodes.get('#pairing-line').textContent.includes('FIXTURE'));
  assert.strictEqual(clientNodes.get('#btn-oauth-toggle').textContent, '开启 OAuth 配对');
  state.namespace.state.status.pairing={enabled:true,code:'FIXTURE',expiresInSec:120};
  bridge.namespace.paintClients();
  assert.ok(clientNodes.get('#pairing-line').textContent.includes('FIXTURE'));
  assert.strictEqual(clientNodes.get('#btn-oauth-toggle').textContent, '关闭 OAuth 配对');
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
      addEventListener() {}, setAttribute() {}, appendChild() {}, querySelectorAll: () => []
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
  const classSet = initial => {
    const values = new Set(initial);
    return { add: value => values.add(value), remove: value => values.delete(value),
      toggle(value, force) { if (force === true) values.add(value); else if (force === false) values.delete(value); else if (values.has(value)) values.delete(value); else values.add(value); },
      contains: value => values.has(value) };
  };
  const sidebarNode = context.document.querySelector('#sidebar');
  const sidebarChild = {};
  sidebarNode.classList = classSet(['collapsed']);
  sidebarNode.contains = node => node === sidebarChild;
  const activityNode = { dataset: { left: 'explorer' }, classList: classSet([]),
    setAttribute(name,value) { this[name]=value; }, focus() { focused=this; } };
  context.document.querySelectorAll = selector => selector === '#activitybar [data-left]' ? [activityNode] : [];
  context.window.innerWidth = 1000;
  const binding = new vm.SourceTextModule(fs.readFileSync(path.join(root,'bind.js'),'utf8'),{context});
  await binding.link(specifier => specifier==='./state.js'?state:specifier==='./picker.js'?picker:dom);
  await binding.evaluate();
  state.namespace.ui.initOperations = () => {};
  state.namespace.ui.initExecutionControl = () => {};
  state.namespace.ui.initTheme = () => {};
  binding.namespace.bind();
  state.namespace.ui.saveModelSettings = settings.namespace.saveModelSettings;
  state.namespace.ui.refreshStatus = bridge.namespace.refreshStatus;

  activityNode.onclick();
  assert.ok(!sidebarNode.classList.contains('collapsed'));
  context.document.activeElement = sidebarChild;
  context.window.innerWidth = 640;
  for (const resize of listeners.get('resize')) resize();
  assert.ok(sidebarNode.classList.contains('collapsed'),'crossing into the drawer breakpoint closes an obstructing sidebar');
  assert.strictEqual(activityNode['aria-pressed'],'false');
  assert.strictEqual(focused,activityNode,'focus returns to the visible activity control when its drawer closes');

  // R3 result consumers: an HTTP response is not success until its body confirms the action.
  const consumerNotices = [];
  state.namespace.ui.toast = message => consumerNotices.push(message);
  let consumerRefreshes = 0, treeLoads = 0, openedFiles = 0;
  state.namespace.ui.refreshStatus = async () => { consumerRefreshes++; return true; };
  state.namespace.ui.loadTree = async () => { treeLoads++; };
  state.namespace.ui.openFile = async () => { openedFiles++; };
  state.namespace.state.loggedIn = false;
  context.fetch = async () => ({ok:false,status:500,json:async()=>({success:true})});
  assert.equal(await statusNodes.get('#btn-gh-login').onclick(),false);
  assert.equal(state.namespace.state.loggedIn,false,'failed demo login cannot publish a local success');
  assert.equal(consumerRefreshes,0);assert.ok(!consumerNotices.at(-1).includes('已打开'));
  context.fetch = async () => ({ok:true,status:200,json:async()=>({success:false,error:'clear rejected'})});
  assert.equal(await statusNodes.get('#btn-gh-clear').onclick(),false);
  assert.equal(consumerRefreshes,0);assert.ok(!consumerNotices.at(-1).includes('已清除'));

  let deviceStarts=0,devicePolls=0;
  context.fetch=async url=>{
    if(url==='/api/bridge/device') return {ok:true,status:200,json:async()=>({success:true,userCode:'OLD-CODE',verificationUri:'https://github.com/login/device',interval:5})};
    if(url==='/api/bridge/github/clear') return {ok:true,status:200,json:async()=>({success:true,provider:'local-demo',username:'local'})};
    devicePolls++;return {ok:true,status:200,json:async()=>({pending:true,done:false,interval:5})};
  };
  const timersBeforeDevice=new Set(timers.keys());
  assert.equal(await statusNodes.get('#btn-gh-device').onclick(),true);
  const cancelledPoll=[...timers.keys()].find(id=>!timersBeforeDevice.has(id));
  assert.ok(cancelledPoll);assert.equal(await statusNodes.get('#btn-gh-clear').onclick(),true);
  assert.ok(!timers.has(cancelledPoll),'clearing identity cancels the scheduled device poll');assert.equal(devicePolls,0);
  context.fetch=async url=>{
    if(url==='/api/bridge/device') {
      deviceStarts++;return {ok:true,status:200,json:async()=>({success:true,userCode:'CODE-'+deviceStarts,verificationUri:'https://github.com/login/device',interval:5})};
    }
    devicePolls++;return {ok:true,status:200,json:async()=>({pending:false,done:true,success:true,username:'latest-user'})};
  };
  const replacementTimers=new Set(timers.keys());
  assert.equal(await statusNodes.get('#btn-gh-device').onclick(),true);
  const oldPoll=[...timers.keys()].find(id=>!replacementTimers.has(id));
  assert.equal(await statusNodes.get('#btn-gh-device').onclick(),true);
  assert.ok(!timers.has(oldPoll),'a newer device attempt cancels the older generation');
  const latestPoll=[...timers.keys()].find(id=>!replacementTimers.has(id));
  const latestTick=timers.get(latestPoll);timers.delete(latestPoll);await latestTick();
  assert.equal(devicePolls,1);assert.ok(consumerNotices.at(-1).includes('latest-user'));

  context.prompt = () => '../blocked.txt';
  context.fetch = async () => ({ok:true,status:200,json:async()=>({success:false,error:'create rejected'})});
  assert.equal(await statusNodes.get('#lnk-new-file').onclick(),false);
  assert.equal(treeLoads,0);assert.equal(openedFiles,0);
  assert.ok(consumerNotices.at(-1).includes('未确认'));

  let createBody;
  context.prompt = () => 'fresh.txt';
  context.fetch = async (url, options) => {
    assert.equal(url,'/api/files/content');createBody=JSON.parse(options.body);
    return {ok:true,status:200,json:async()=>({success:true,path:'fresh.txt',hash:'b'.repeat(64)})};
  };
  assert.equal(await statusNodes.get('#lnk-new-file').onclick(),true);
  assert.deepStrictEqual(createBody,{path:'fresh.txt',content:'',createOnly:true});
  assert.equal(treeLoads,1);assert.equal(openedFiles,1);

  const terminalLines = [];
  state.namespace.ui.termLine = (text, cls = '') => terminalLines.push({text,cls});
  context.document.querySelector('#term-input').value='echo fixture';
  context.fetch = async () => ({ok:true,status:200,json:async()=>({success:false,error:'command rejected'})});
  assert.equal(await statusNodes.get('#term-form').onsubmit({preventDefault(){}}),false);
  assert.ok(terminalLines.at(-1).text.includes('command rejected'));
  assert.equal(terminalLines.at(-1).cls,'err');
  context.fetch = async () => ({ok:true,status:200,json:async()=>({success:true,result:{stdout:'done\n',stderr:'',exitCode:0}})});
  context.document.querySelector('#term-input').value='echo fixture';
  assert.equal(await statusNodes.get('#term-form').onsubmit({preventDefault(){}}),true);
  assert.equal(terminalLines.at(-1).text,'done\n');
  context.fetch = async () => ({ok:false,status:503,json:async()=>({success:true,result:{matches:[]}})});
  context.document.querySelector('#search-q').value='fixture';
  assert.equal(await statusNodes.get('#btn-search').onclick(),false);
  assert.ok(statusNodes.get('#search-results').textContent.includes('失败'));
  assert.ok(!statusNodes.get('#search-results').textContent.includes('没有命中'));
  context.fetch = async () => ({ok:true,status:200,json:async()=>({success:true,result:{matches:[{file:'a.txt',line:3,content:'fixture'}]}})});
  assert.equal(await statusNodes.get('#btn-search').onclick(),true);
  assert.ok(statusNodes.get('#search-results').innerHTML.includes('a.txt:3'));

  let modelValue='keep me', modelUpdates=0;
  const patchedTab = {id:'file:patched.txt',path:'patched.txt',kind:'file',content:'keep me',savedContent:'keep me',hash:'a'.repeat(64),dirty:false,
    model:{getValue:()=>modelValue,setValue:value=>{modelValue=value;modelUpdates++;}}};
  state.namespace.state.tabs.push(patchedTab);
  context.fetch = async () => ({ok:false,status:500,json:async()=>({error:'read rejected'})});
  const consumerQuery = context.document.querySelector;
  context.document.querySelector = selector => ['#chat-stream','#agent-stream'].includes(selector) ? null : consumerQuery(selector);
  chat.namespace.handleEvent({type:'tool',name:'apply_patch',ok:true,result:{filePath:'patched.txt'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(patchedTab.content,'keep me','failed post-patch read cannot blank the editor tab');
  assert.ok(consumerNotices.at(-1).includes('重新读取失败'));

  context.fetch = async () => ({ok:true,status:200,json:async()=>({content:'from disk',hash:'c'.repeat(64)})});
  chat.namespace.handleEvent({type:'tool',name:'apply_patch',ok:true,result:{filePath:'patched.txt'}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(patchedTab.content,'from disk');assert.equal(patchedTab.savedContent,'from disk');
  assert.equal(patchedTab.hash,'c'.repeat(64));assert.equal(patchedTab.dirty,false);
  assert.equal(modelValue,'from disk');assert.equal(modelUpdates,1,'clean post-patch reads synchronize an existing Monaco model');

  patchedTab.content='newer local draft';patchedTab.savedContent='from disk';patchedTab.dirty=true;modelValue='newer local draft';
  context.fetch = async () => ({ok:true,status:200,json:async()=>({content:'newer disk patch',hash:'d'.repeat(64)})});
  chat.namespace.handleEvent({type:'tool',name:'apply_patch',ok:true,result:{filePath:'patched.txt'}});
  await new Promise(resolve=>setImmediate(resolve));
  context.document.querySelector = consumerQuery;
  assert.equal(patchedTab.content,'newer local draft','post-patch refresh preserves a dirty draft');
  assert.equal(modelValue,'newer local draft');assert.equal(modelUpdates,1);
  assert.equal(patchedTab.hash,'c'.repeat(64),'dirty tab keeps its old hash so a later save is rejected as stale');
  assert.equal(patchedTab.dirty,true);assert.ok(consumerNotices.at(-1).includes('已保留未保存草稿'));

  // Read-only consumers preserve the last trusted UI on HTTP/shape failures and late drafts.
  const environmentReply={environment:{os:'linux',shell:'bash'},techStack:{languages:'JavaScript',frameworks:'Express',packageManager:'npm',testCommand:'npm test'}};
  const envOs=context.document.querySelector('#env-os'),envShell=context.document.querySelector('#env-shell');
  envOs.value='draft-os';envShell.value='draft-shell';
  context.fetch=async()=>({ok:false,status:500,json:async()=>environmentReply});
  assert.equal(await statusNodes.get('#btn-detect-env').onclick(),false);
  assert.equal(envOs.value,'draft-os');assert.equal(envShell.value,'draft-shell');
  let finishDetection;
  context.fetch=()=>new Promise(resolve=>{finishDetection=resolve;});
  const detecting=statusNodes.get('#btn-detect-env').onclick();
  envOs.value='newer-draft';finishDetection({ok:true,status:200,json:async()=>environmentReply});
  assert.equal(await detecting,false);assert.equal(envOs.value,'newer-draft');
  envOs.value='draft-os';envShell.value='draft-shell';context.fetch=async()=>({ok:true,status:200,json:async()=>environmentReply});
  assert.equal(await statusNodes.get('#btn-detect-env').onclick(),true);
  assert.equal(envOs.value,'linux');assert.equal(envShell.value,'bash');
  context.document.querySelector('#st-lang').value='keep-stack';
  context.fetch=async()=>({ok:true,status:200,json:async()=>({environment:environmentReply.environment,techStack:null})});
  assert.equal(await statusNodes.get('#btn-detect-stack').onclick(),false);
  assert.equal(context.document.querySelector('#st-lang').value,'keep-stack');

  const treeBox=context.document.querySelector('#file-tree');treeBox.innerHTML='trusted tree';
  context.fetch=async()=>({ok:false,status:503,json:async()=>({error:'tree unavailable'})});
  await assert.rejects(tabs.namespace.loadTree());assert.equal(treeBox.innerHTML,'trusted tree');
  context.fetch=async()=>({ok:true,status:200,json:async()=>({items:null})});
  await assert.rejects(tabs.namespace.loadTree());assert.equal(treeBox.innerHTML,'trusted tree');
  context.fetch=async()=>({ok:true,status:200,json:async()=>({items:[{name:'a.txt',path:'a.txt',type:'file'}]})});
  assert.equal(await tabs.namespace.loadTree(),true);assert.ok(treeBox.innerHTML.includes('a.txt'));
  // F70 (review P2-9): the host stops at 1000 entries and reports truncated:true; the tree must
  // say so instead of looking complete. No notice for a complete listing.
  assert.ok(!treeBox.innerHTML.includes('tree-truncated'), 'a complete listing shows no truncation notice');
  context.fetch=async()=>({ok:true,status:200,json:async()=>({items:[{name:'a.txt',path:'a.txt',type:'file'}],truncated:true})});
  assert.equal(await tabs.namespace.loadTree(),true);
  assert.ok(treeBox.innerHTML.includes('tree-truncated') && treeBox.innerHTML.includes('1000'), 'a truncated listing must be announced');
  context.fetch=async()=>({ok:true,status:200,json:async()=>({items:[{name:'a.txt',path:'a.txt',type:'file'}],truncated:'yes'})});
  assert.equal(await tabs.namespace.loadTree(),true);assert.ok(!treeBox.innerHTML.includes('tree-truncated'), 'only a boolean true counts');
  // F70: the welcome list was the first six files depth-first, i.e. `.config/…`/`.github/…` in a
  // real repository. Entry files first, then most recently modified, never dot-directories.
  const f=(p,mtime)=>({name:p.split('/').pop(),path:p,type:'file',mtime});
  const welcomePicked=tabs.namespace.welcomeFiles([
    {name:'.config',path:'.config',type:'directory',children:[f('.config/code-server/config.yaml','2026-09-23T00:00:00Z')]},
    {name:'.github',path:'.github',type:'directory',children:[f('.github/workflows/test.yml','2026-09-23T00:00:01Z')]},
    {name:'src',path:'src',type:'directory',children:[f('src/old.js','2026-01-01T00:00:00Z'),f('src/new.js','2026-09-20T00:00:00Z'),
      {name:'deep',path:'src/deep',type:'directory',children:[f('src/deep/README.md','2026-09-21T00:00:00Z')]}]},
    f('.env.example','2026-09-23T00:00:02Z'),f('package.json','2020-01-01T00:00:00Z'),f('README.md','2020-01-01T00:00:00Z')
  ]).map(x=>x.path);
  assert.deepEqual(welcomePicked,['README.md','package.json','src/deep/README.md','src/new.js','src/old.js'],
    'entry files first (README before manifests), then newest; dot-directories and dotfiles skipped; a nested README is not an entry file');
  assert.deepEqual(tabs.namespace.welcomeFiles(null),[]);

  const skill={id:'workspace:test',name:'test',description:'fixture skill'};
  context.URLSearchParams=URLSearchParams;
  context.fetch=async()=>({ok:true,status:200,json:async()=>({skills:[skill],truncated:false,warnings:[]})});
  assert.equal(await settings.namespace.loadSkills(),true);
  const trustedSkills=statusNodes.get('#skills-list').innerHTML;
  context.fetch=async()=>({ok:true,status:200,json:async()=>({skills:[null],truncated:false,warnings:[]})});
  assert.equal(await settings.namespace.loadSkills(),false);
  assert.equal(statusNodes.get('#skills-list').innerHTML,trustedSkills,'malformed catalog cannot replace the last trusted list');
  const skillPage={...skill,found:true,resource:'SKILL.md',fileBytes:4,content:'body',hash:'e'.repeat(64),offset:0,nextOffset:null,totalChars:4,resources:[]};
  let initialSkillUrl='';context.fetch=async url=>{initialSkillUrl=String(url);return {ok:true,status:200,json:async()=>skillPage};};
  assert.equal(await settings.namespace.readSkillPage(skill.id),true);assert.equal(new URL(initialSkillUrl,'http://fixture.invalid').searchParams.has('expectedHash'),false,'the first page omits an empty optional hash');
  context.fetch=async()=>({ok:true,status:200,json:async()=>({...skillPage,resources:[null]})});
  assert.equal(await settings.namespace.readSkillPage(skill.id),false);
  assert.equal(statusNodes.get('#btn-skill-workflow').disabled,true);

  let resetRefreshes=0;
  state.namespace.ui.refreshStatus=async()=>{resetRefreshes++;return true;};
  context.fetch=async()=>({ok:true,status:200,json:async()=>({success:false,error:'reset rejected'})});
  assert.equal(await bridge.namespace.resetRound(),false);assert.equal(resetRefreshes,0);
  assert.ok(consumerNotices.at(-1).includes('未确认'));
  state.namespace.ui.refreshStatus=async()=>{resetRefreshes++;return false;};
  context.fetch=async url=>url==='/api/bridge/reset-round'
    ? {ok:true,status:200,json:async()=>({success:true,mcpSession:{}})}
    : {ok:true,status:200,json:async()=>activity};
  assert.equal(await bridge.namespace.resetRound(),true);
  assert.ok(consumerNotices.at(-1).includes('清除已确认'));

  let healthRefreshes=0;
  state.namespace.ui.refreshStatus=async()=>{healthRefreshes++;return true;};
  context.fetch=async()=>({ok:false,status:500,json:async()=>({ok:true})});
  await bridge.namespace.checkBridgeHealth();assert.equal(healthRefreshes,0);
  assert.ok(state.namespace.state.stats.healthLine.includes('失败'));
  context.fetch=async()=>({ok:true,status:200,json:async()=>({identity:{hostInstanceId:'bad',workspaceRoot:'/bad'},capabilities:[null]})});
  await bridge.namespace.refreshDiagnostics();
  context.document.querySelector('#expected-host').value='1'.repeat(36);
  assert.doesNotThrow(()=>bridge.namespace.compareHost());
  assert.ok(statusNodes.get('#host-comparison').textContent.includes('先成功读取'));

  state.namespace.state.status={...confirmedStatus,workspaceRoot:'/fixture',identity:{hostInstanceId:'host-fixture'},executionControl:{mode:'chat',revision:'rev-1',active:{chat:0,bridge:0},permissions:{read:true,edit:true,execute:false,capture:true}}};
  bridge.namespace.paintExecutionControl();bridge.namespace.initExecutionControl();
  let finishControl,controlPosts=0;
  state.namespace.ui.refreshStatus=async()=>false;
  context.fetch=()=>{controlPosts++;return new Promise(resolve=>{finishControl=resolve;});};
  const changingControl=statusNodes.get('#execution-save').onclick();
  assert.equal(await statusNodes.get('#execution-bridge').onclick(),false);assert.equal(controlPosts,1);
  finishControl({ok:true,status:200,json:async()=>({success:true})});
  assert.equal(await changingControl,true);assert.ok(statusNodes.get('#execution-result').textContent.includes('已确认应用'));
  context.fetch=async()=>({ok:true,status:200,json:async()=>({success:false,error:'permission rejected'})});
  assert.equal(await statusNodes.get('#execution-save').onclick(),false);
  assert.ok(statusNodes.get('#execution-result').textContent.includes('未确认'));

  context.TextDecoder=TextDecoder; context.TextEncoder=TextEncoder;
  const streamResponse=(chunks,status=200,type='application/x-ndjson; charset=utf-8')=>{
    const lifecycle={reads:0,cancelled:0,released:0};
    return {ok:status>=200&&status<300,status,headers:{get:name=>name.toLowerCase()==='content-type'?type:null},lifecycle,
      body:{getReader(){let index=0;return{
        async read(){lifecycle.reads++;return index<chunks.length?{done:false,value:Buffer.from(chunks[index++])}:{done:true};},
        cancel(){lifecycle.cancelled++;return Promise.resolve();},releaseLock(){lifecycle.released++;}
      };}},async text(){return chunks.join('');}};
  };
  const chatQuery=context.document.querySelector;
  context.document.querySelector=selector=>['#chat-stream','#agent-stream'].includes(selector)?null:chatQuery(selector);
  state.namespace.ui.refreshStatus=async()=>true;state.namespace.ui.loadTree=async()=>true;
  context.fetch=async()=>streamResponse(['{"error":"chat rejected"}'],500);
  assert.equal(await chat.namespace.sendChat('HTTP failure'),false);
  assert.ok(state.namespace.state.messages.at(-1).text.includes('chat rejected'));
  context.fetch=async()=>streamResponse(['{"type":"message","text":"confirmed answer"}\n{"type":"done"}']);
  assert.equal(await chat.namespace.sendChat('valid stream'),true);
  assert.equal(state.namespace.state.history.at(-1).content,'confirmed answer');
  const historyBeforeError = state.namespace.state.history.length;
  context.fetch=async()=>streamResponse(['{"type":"message","text":"must not persist"}\n{"type":"error","message":"failed"}\n{"type":"done"}']);
  assert.equal(await chat.namespace.sendChat('error then done'),false);
  assert.equal(state.namespace.state.history.length,historyBeforeError+1,'only the user prompt is retained after an error event');
  context.fetch=async()=>streamResponse(['not-json\n']);
  assert.equal(await chat.namespace.sendChat('bad stream'),false);
  context.fetch=async()=>streamResponse(['{"type":"status","text":"partial"}\n']);
  assert.equal(await chat.namespace.sendChat('truncated stream'),false);
  assert.ok(state.namespace.state.messages.at(-1).text.includes('提前结束'));
  // The classic consumer must enforce the same reliable-termination boundary as
  // the native consumer. A resolved fetch/read is not a confirmed assistant turn.
  const invalidStreams = [
    ['data after done', ['{"type":"message","text":"partial"}\n{"type":"done"}\n{"type":"message","text":"must not persist"}\n']],
    ['late chunk after done', ['{"type":"done"}\n','{"type":"status","text":"late"}\n']],
    ['duplicate done', ['{"type":"done"}\n{"type":"done"}\n']],
    ['invalid message', ['{"type":"message","text":{"bad":true}}\n{"type":"done"}\n']],
    ['empty type', ['{"type":""}\n{"type":"done"}\n']],
    ['wrong media type', ['{"type":"done"}\n'], 200, 'text/html'],
    ['byte-sized frame budget', [JSON.stringify({type:'status',text:'海'.repeat(400000)})+'\n{"type":"done"}\n']],
    ['total response budget', [...Array(19).fill(' '.repeat(900000)+'\n'),'{"type":"done"}\n']],
    ['invalid UTF-8', [Buffer.from([0xc3,0x28]),'\n{"type":"done"}\n']],
    ['HTTP error body budget', ['x'.repeat(65537)], 500, 'application/json']
  ];
  for (const [label,chunks,status,type] of invalidStreams) {
    const response=streamResponse(chunks,status,type);let options;
    context.fetch=async(_url,input)=>{options=input;return response;};
    const oldHistory=state.namespace.state.history.length;
    assert.equal(await chat.namespace.sendChat(label),false,label+' cannot be accepted');
    assert.equal(state.namespace.state.history.length,oldHistory+1,label+' keeps only the user prompt');
    assert.equal(options.redirect,'error','a mutation-bearing chat must not follow a redirect');
    assert.equal(options.signal.aborted,true,label+' aborts the request');
    assert.equal(response.lifecycle.cancelled,1,label+' cancels the reader');
    assert.equal(response.lifecycle.released,1,label+' releases the reader lock');
  }
  const utf8=Buffer.from('{"type":"message","text":"海风"}\n{"type":"done"}\n');
  const unicodeStart=utf8.indexOf(Buffer.from('海'));
  const split=streamResponse([utf8.subarray(0,unicodeStart+1),utf8.subarray(unicodeStart+1,unicodeStart+2),utf8.subarray(unicodeStart+2)]);
  context.fetch=async()=>split;
  assert.equal(await chat.namespace.sendChat('split Unicode'),true);
  assert.equal(state.namespace.state.history.at(-1).content,'海风');
  assert.equal(split.lifecycle.released,1);
  // The frame limit applies to a line, not to a network chunk containing many short lines.
  context.fetch=async()=>streamResponse([(' '.repeat(64)+'\n').repeat(17000)+'{"type":"done"}\n\n']);
  assert.equal(await chat.namespace.sendChat('coalesced short frames'),true);
  const stopped=streamResponse(['{"type":"done"}\n']);
  context.fetch=async()=>{state.namespace.state.chatAbort.abort();return stopped;};
  assert.equal(await chat.namespace.sendChat('stop before buffered done'),false);
  assert.equal(stopped.lifecycle.reads,0);assert.equal(stopped.lifecycle.cancelled,1);assert.equal(stopped.lifecycle.released,1);
  const originalSetTimeout=context.setTimeout;let deadline,deadlineOptions;
  context.setTimeout=(fn,ms)=>{if(ms===300000)deadline=fn;return originalSetTimeout(fn,ms);};
  context.fetch=async(_url,input)=>{deadlineOptions=input;assert.equal(typeof deadline,'function');deadline();return streamResponse(['{"type":"done"}\n']);};
  assert.equal(await chat.namespace.sendChat('deadline'),false);
  assert.equal(deadlineOptions.signal.aborted,true);
  assert.ok(state.namespace.state.messages.at(-1).text.includes('5分钟'));
  context.setTimeout=originalSetTimeout;
  context.document.querySelector=chatQuery;
  state.namespace.state.status={...confirmedStatus,activeModelId:'new'};

  const rotationNotices = [];
  const rotationRefresh = bridge.namespace.refreshStatus;
  state.namespace.ui.refreshStatus = rotationRefresh;
  const beforeRotation = state.namespace.state.status;
  const oldSecret = 'a'.repeat(24), newSecret = 'b'.repeat(24);
  const rotationSnapshot = {...beforeRotation, workspaceRoot:'/rotation',identity:{hostInstanceId:'rotation-host'},secretKey:oldSecret};
  const rotated = {success:true,secretKey:newSecret,mcpPath:'/mcp/'+newSecret,mcpUrl:'http://localhost/mcp/'+newSecret,mcpCanonicalUrl:'http://localhost/mcp'};
  const rotateButton = statusNodes.get('#btn-reset-secret');
  const rotationResult = () => statusNodes.get('#secret-result').textContent;
  let rotationPosts = 0;
  const rotationReply = data => ({ok:true,status:200,json:async()=>data});
  context.URL = URL;
  context.window.confirm = () => true;
  state.namespace.ui.toast = message => rotationNotices.push(message);
  state.namespace.ui.refreshStatus = async () => true;
  state.namespace.state.status = rotationSnapshot;
  context.fetch = async url => url === '/api/status' ? rotationReply(rotationSnapshot) : (++rotationPosts,{ok:false,status:500,json:async()=>({success:false})});
  await rotateButton.onclick();
  assert.equal(rotationPosts,1);
  assert.ok(!rotationNotices.some(message => message.includes('Secret 已重置')), 'HTTP failure must not announce credential rotation');
  assert.ok(rotationResult().includes('未确认'));
  for (const data of [null, {}, {success:'true'}, {...rotated,success:false}, {...rotated,secretKey:oldSecret}, {...rotated,mcpPath:'/mcp/wrong'}]) {
    context.fetch = async url => url === '/api/status' ? rotationReply(rotationSnapshot) : (++rotationPosts,rotationReply(data));
    assert.equal(await rotateButton.onclick(),false);
    assert.ok(rotationResult().includes('未确认'));
    assert.equal(rotateButton.disabled,false);
  }
  context.window.confirm = () => false;
  const beforeCancel = rotationPosts;
  assert.equal(await rotateButton.onclick(),false);assert.equal(rotationPosts,beforeCancel);
  assert.ok(rotationResult().includes('未发送'));
  context.window.confirm = () => { state.namespace.state.status = {...rotationSnapshot,identity:{hostInstanceId:'changed'}}; return true; };
  assert.equal(await rotateButton.onclick(),false);assert.equal(rotationPosts,beforeCancel);
  state.namespace.state.status = rotationSnapshot;
  context.window.confirm = () => true;
  let finishRotation;
  context.fetch = async (url,options) => {
    if(url === '/api/status') return rotationReply(rotationSnapshot);
    rotationPosts++;
    assert.deepStrictEqual(JSON.parse(options.body),{workspaceRoot:'/rotation',hostInstanceId:'rotation-host',expectedSecret:oldSecret});
    return new Promise(resolve=>{finishRotation=resolve;});
  };
  const pendingRotation = rotateButton.onclick();
  await new Promise(resolve=>setImmediate(resolve));
  const inFlightPosts = rotationPosts;
  assert.equal(rotateButton.disabled,true);
  assert.equal(await rotateButton.onclick(),false);assert.equal(rotationPosts,inFlightPosts);
  state.namespace.ui.refreshStatus = async()=>{throw new Error('private secret response lost');};
  finishRotation(rotationReply(rotated));
  assert.equal(await pendingRotation,true,'confirmed rotation survives a failed follow-up read');
  assert.ok(rotationResult().includes('轮换已确认'));assert.ok(rotationResult().includes('不要再次重置'));
  assert.ok(!rotationResult().includes('private secret'));assert.equal(rotationPosts,inFlightPosts);
  state.namespace.ui.refreshStatus = async()=>{state.namespace.state.status={...rotationSnapshot,secretKey:newSecret};return true;};
  context.fetch = async url => url === '/api/status' ? rotationReply(rotationSnapshot) : (++rotationPosts,rotationReply(rotated));
  assert.equal(await rotateButton.onclick(),true);assert.ok(rotationResult().includes('当前地址已重新读取'));
  state.namespace.state.status = rotationSnapshot;
  context.fetch = async url => url === '/api/status' ? rotationReply({...rotationSnapshot,secretKey:newSecret}) : (++rotationPosts,rotationReply(rotated));
  const beforeStale = rotationPosts;
  assert.equal(await rotateButton.onclick(),false);assert.equal(rotationPosts,beforeStale);
  const realRotationTimeout = context.setTimeout, realRotationClear = context.clearTimeout;
  let expireRotation;
  context.setTimeout = fn => {expireRotation=fn;return 41;};context.clearTimeout=()=>{};
  context.fetch = async url => url === '/api/status' ? rotationReply(rotationSnapshot) : (++rotationPosts,{ok:true,json:()=>new Promise(resolve=>{finishRotation=resolve;})});
  const timedRotation = rotateButton.onclick();
  await new Promise(resolve=>setImmediate(resolve));expireRotation();finishRotation(rotated);
  assert.equal(await timedRotation,false);assert.ok(rotationResult().includes('可能已生效'));assert.equal(rotateButton.disabled,false);
  context.setTimeout=realRotationTimeout;context.clearTimeout=realRotationClear;
  state.namespace.state.status=beforeRotation;
  state.namespace.ui.refreshStatus = rotationRefresh;
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
  // Checkpoint creation must be a single in-flight snapshot, not one per click.
  const createInput=context.document.querySelector('#checkpoint-paths');createInput.value='a.txt';
  let finishCreate, checkpointCreates=0, checkpointCreateBody;
  context.fetch=async(url,options={})=>{
    if(url==='/api/checkpoints' && options.method==='POST') {
      checkpointCreates++;checkpointCreateBody=JSON.parse(options.body);
      return new Promise(resolve=>{finishCreate=resolve;});
    }
    if(url==='/api/checkpoints') return opsResponse([checkpointRecord]);
    if(url==='/api/operations') return opsResponse({servers:[],requests:opsJobs});
    throw new Error(url);
  };
  const createButton=opsNodes.get('#btn-checkpoint-create');
  const pendingCreate=createButton.onclick(), duplicateCreate=createButton.onclick();
  assert.equal(checkpointCreates,1,'repeated click must not create a second checkpoint while awaiting confirmation');
  createInput.value='new-draft.txt';
  finishCreate(opsResponse(checkpointRecord));await pendingCreate;await duplicateCreate;
  assert.deepEqual(checkpointCreateBody.paths,['a.txt']);
  assert.equal(createInput.value,'new-draft.txt','new input is not cleared by the earlier response');
  assert.equal(JSON.parse(opsNodes.get('#checkpoint-review').textContent).id,'cp-a');
  assert.equal(createButton.disabled,false);
  for (const reply of [
    {ok:false,json:async()=>({error:'fixture HTTP error'})},
    opsResponse({ok:false,error:'fixture business failure'}),
    {ok:true,json:async()=>{throw new Error('fixture invalid JSON');}},
    opsResponse(null),opsResponse({...checkpointRecord,state:'consumed'}),
    opsResponse({...checkpointRecord,paths:['a.txt','b.txt']}),opsResponse({...checkpointRecord,result:{status:'running'}})
  ]) {
    context.fetch=async()=>{checkpointCreates++;return reply;};
    const count=checkpointCreates;assert.equal(await createButton.onclick(),false);
    assert.equal(checkpointCreates,count+1,'failed creation must not automatically retry or refresh as success');
    assert.match(opsNodes.get('#checkpoint-review').textContent,/创建未确认/);
    assert.equal(createButton.disabled,false);assert.equal(createInput.value,'new-draft.txt');
    assert.equal(opsNodes.get('#checkpoint-controls').children.length,0);
  }
  let creationLists=0;
  context.fetch=async(url,options={})=>{
    if(options.method==='POST') {checkpointCreates++;return opsResponse(checkpointRecord);}
    creationLists++;throw new Error('fixture list unavailable');
  };
  const beforeConfirmedCreate=checkpointCreates;
  assert.equal(await createButton.onclick(),true);
  const confirmedCreate=JSON.parse(opsNodes.get('#checkpoint-review').textContent);
  assert.equal(confirmedCreate.id,'cp-a');assert.match(confirmedCreate.note,/创建已确认.*列表刷新失败/);
  assert.equal(checkpointCreates,beforeConfirmedCreate+1);assert.equal(creationLists,1);
  const beforeRejectedCreate=checkpointCreates;
  context.confirm=()=>false;assert.equal(await createButton.onclick(),false);
  assert.equal(checkpointCreates,beforeRejectedCreate);assert.match(opsNodes.get('#checkpoint-review').textContent,/未发送/);
  context.confirm=()=>true;
  for(const input of ['', 'a.txt\na.txt',Array(13).fill('a.txt').join('\n')]) {
    createInput.value=input;assert.equal(await createButton.onclick(),false);assert.match(opsNodes.get('#checkpoint-review').textContent,/未发送/);
  }
  assert.equal(checkpointCreates,beforeRejectedCreate);createInput.value='a.txt';
  state.namespace.state.status.workspaceRoot='';assert.equal(await createButton.onclick(),false);
  assert.equal(checkpointCreates,beforeRejectedCreate);state.namespace.state.status.workspaceRoot='/fixture';
  // A late response may exist, but cannot claim creation in a different current workspace.
  context.fetch=async()=>new Promise(resolve=>{finishCreate=resolve;});
  const changedBindingCreate=createButton.onclick();state.namespace.state.status.workspaceRoot='/other';
  finishCreate(opsResponse(checkpointRecord));assert.equal(await changedBindingCreate,false);
  assert.match(opsNodes.get('#checkpoint-review').textContent,/创建未确认/);
  state.namespace.state.status.workspaceRoot='/fixture';
  const timedCreate=createButton.onclick();[...timers.values()].at(-1)();
  finishCreate(opsResponse(checkpointRecord));assert.equal(await timedCreate,false);
  assert.equal(createButton.disabled,false);assert.match(opsNodes.get('#checkpoint-review').textContent,/创建未确认/);
  context.fetch=async(url,options={})=>{
    if(url==='/api/checkpoints' && options.method==='POST') return new Promise(resolve=>{finishCreate=resolve;});
    if(url==='/api/checkpoints') return opsResponse([checkpointRecord]);
    if(url.endsWith('/preview')) return opsResponse(checkpointPreview);
    if(url==='/api/operations') return opsResponse({servers:[],requests:opsJobs});
    throw new Error(url);
  };
  await state.namespace.ui.refreshOperations();
  const staleCreation=createButton.onclick();
  await opsNodes.get('#checkpoint-list').children[0].children[1].onclick();
  finishCreate(opsResponse(checkpointRecord));assert.equal(await staleCreation,false);
  assert.equal(JSON.parse(opsNodes.get('#checkpoint-review').textContent).previewId,'preview-a','late creation cannot replace a newer restore preview');
  assert.equal(createButton.disabled,false);
  const externalServer={serverId:'external-fixture',name:'Fixture',transport:'http',status:'discovered',publicHttps:false,endpoint:'http://127.0.0.1:9000/mcp',tools:[]};
  context.document.querySelector('#ops-name').value='Fixture';
  context.document.querySelector('#ops-url').value='http://localhost:9000/mcp';
  context.document.querySelector('#ops-token').value='private-fixture-token';
  context.document.querySelector('#ops-public-https').checked=false;
  let externalPosts=0, finishExternal, externalBody;
  context.fetch=async(url,options={})=>{
    if(options.method==='POST') {externalPosts++;externalBody=JSON.parse(options.body);return new Promise(resolve=>{finishExternal=resolve;});}
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[externalServer],requests:[]});
    throw new Error(url);
  };
  const addExternal=opsNodes.get('#btn-ops-add');
  const pendingExternal=addExternal.onclick(), repeatedExternal=addExternal.onclick();
  assert.equal(externalPosts,1,'pending registration must not send a second initialization request');
  opsNodes.get('#ops-url').value='http://127.0.0.1:9001/next';opsNodes.get('#ops-token').value='NEW TOKEN DRAFT';
  finishExternal(opsResponse(externalServer));await pendingExternal;await repeatedExternal;
  assert.equal(externalBody.url,'http://localhost:9000/mcp');assert.equal(externalBody.token,'private-fixture-token');
  assert.equal(opsNodes.get('#ops-token').value,'NEW TOKEN DRAFT');
  let externalDeletes=0;
  context.fetch=async(url,options={})=>{
    if(options.method==='DELETE') {externalDeletes++;return opsResponse({removed:false});}
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[externalServer],requests:[]});
    throw new Error(url);
  };
  await state.namespace.ui.refreshOperations();
  const removeExternal=opsNodes.get('#ops-servers').children[0].children[1];
  assert.equal(await removeExternal.onclick(),false,'removed:false must not be consumed as confirmed removal');
  await removeExternal.onclick();assert.equal(externalDeletes,1,'failed/unknown removal consumes the old button; refresh before any new decision');
  assert.match(opsNodes.get('#ops-external-result').textContent,/移除未确认/);
  opsNodes.get('#ops-url').value='http://127.0.0.1:9000/mcp';
  for (const reply of [
    {ok:false,json:async()=>({error:'private-fixture-token'})},
    {ok:true,json:async()=>{throw new Error('private-fixture-token');}},opsResponse({ok:false,error:'private-fixture-token'}),opsResponse(null),
    opsResponse({...externalServer,status:'connecting'}),opsResponse({...externalServer,endpoint:'http://127.0.0.1:9001/mcp'}),
    opsResponse({...externalServer,tools:[{name:'unsafe',requiresApproval:false,inputSchema:{type:'object'}}]})
  ]) {
    context.fetch=async()=>{externalPosts++;return reply;};opsNodes.get('#ops-token').value='private-fixture-token';
    const count=externalPosts;assert.equal(await addExternal.onclick(),false);assert.equal(externalPosts,count+1);
    assert.match(opsNodes.get('#ops-external-result').textContent,/登记未确认/);
    assert.ok(!opsNodes.get('#ops-external-result').textContent.includes('private-fixture-token'),'registration errors cannot reflect the Bearer value');
    assert.equal(addExternal.disabled,false);
  }
  const beforeDisclosure=externalPosts;
  opsNodes.get('#ops-public-https').checked=true;opsNodes.get('#ops-url').value='https://mcp.example.test/mcp';
  opsNodes.get('#ops-token').value='UNSENT TOKEN';context.confirm=()=>false;
  assert.equal(await addExternal.onclick(),false);assert.equal(externalPosts,beforeDisclosure);
  assert.equal(opsNodes.get('#ops-token').value,'UNSENT TOKEN');context.confirm=()=>true;
  opsNodes.get('#ops-public-https').checked=false;opsNodes.get('#ops-url').value='http://127.0.0.1:9000/mcp?token=private-fixture-token';
  assert.equal(await addExternal.onclick(),false);assert.equal(externalPosts,beforeDisclosure);
  assert.match(opsNodes.get('#ops-external-result').textContent,/未发送/);
  opsNodes.get('#ops-url').value='http://127.0.0.1:9000/mcp';
  context.fetch=async()=>new Promise(resolve=>{finishExternal=resolve;});
  const timedExternal=addExternal.onclick();[...timers.values()].at(-1)();finishExternal(opsResponse(externalServer));
  assert.equal(await timedExternal,false);assert.equal(addExternal.disabled,false);
  let externalListReads=0;
  context.fetch=async(url,options={})=>{
    if(options.method==='POST') {externalPosts++;return opsResponse(externalServer);}
    externalListReads++;throw new Error('fixture list unavailable');
  };
  assert.equal(await addExternal.onclick(),true);assert.equal(externalListReads,1);
  assert.match(opsNodes.get('#ops-external-result').textContent,/已确认登记[\s\S]*列表刷新失败/);
  let finishRemoval;
  context.fetch=async(url,options={})=>{
    if(options.method==='DELETE') {externalDeletes++;return new Promise(resolve=>{finishRemoval=resolve;});}
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[externalServer],requests:[]});
    throw new Error(url);
  };
  await state.namespace.ui.refreshOperations();
  const removalButton=opsNodes.get('#ops-servers').children[0].children[1], beforeRemoval=externalDeletes;
  const pendingRemoval=removalButton.onclick();assert.equal(await removalButton.onclick(),false);
  await state.namespace.ui.refreshOperations();
  assert.equal(await opsNodes.get('#ops-servers').children[0].children[1].onclick(),false,'same server cannot be removed twice even via a refreshed list');
  finishRemoval(opsResponse({removed:true,stopping:true}));assert.equal(await pendingRemoval,true);
  assert.equal(externalDeletes,beforeRemoval+1);assert.equal(addExternal.disabled,false);
  assert.match(opsNodes.get('#ops-external-result').textContent,/登记记录已移除.*尚未确认进程退出/);
  await state.namespace.ui.refreshOperations();
  assert.match(opsNodes.get('#ops-external-result').textContent,/尚未确认进程退出/,'list refresh does not erase stop uncertainty');
  context.fetch=async(url,options={})=>{
    if(options.method==='POST') return new Promise(resolve=>{finishExternal=resolve;});
    if(options.method==='DELETE') {externalDeletes++;return opsResponse({removed:true});}
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[{...externalServer,status:'connecting'}],requests:[]});
    throw new Error(url);
  };
  const interruptedRegistration=addExternal.onclick();
  await state.namespace.ui.refreshOperations();
  assert.equal(await opsNodes.get('#ops-servers').children[0].children[1].onclick(),true,'registration guard must not block removing a connecting server');
  const removalNotice=opsNodes.get('#ops-external-result').textContent;
  finishExternal(opsResponse(externalServer));assert.equal(await interruptedRegistration,false);
  assert.equal(opsNodes.get('#ops-external-result').textContent,removalNotice,'late registration must not overwrite a newer removal result');
  assert.equal(addExternal.disabled,false);
  const stdioConfig=context.document.querySelector('#ops-stdio-config');
  stdioConfig.value=JSON.stringify({program:'/fixture/node',args:['server.js'],env:{FIXTURE_SECRET:'SECRET STDIO VALUE'}});
  const launchPreview={previewId:'stdio-preview',transport:'stdio',expiresAt:Date.now()+120000,requiresConfirmation:true,
    launch:{name:'Fixture',program:'/fixture/node',args:['server.js'],cwd:'/fixture',envKeys:['PATH','FIXTURE_SECRET']},
    programStamp:{path:'/fixture/node',bytes:42,sha256:'a'.repeat(64)},reviewFiles:[]};
  let stdioStarts=0;
  context.fetch=async(url)=>{
    if(url==='/api/external/stdio/preview') return opsResponse(launchPreview);
    if(url==='/api/external/stdio/start') {stdioStarts++;return opsResponse(null);}
    if(url==='/api/checkpoints') return opsResponse([]);
    if(url==='/api/operations') return opsResponse({servers:[],requests:[]});
    throw new Error(url);
  };
  const stdioFetch=context.fetch;
  context.fetch=async url=>url==='/api/external/stdio/preview' ? opsResponse({previewId:'only-id'}) : stdioFetch(url);
  await opsNodes.get('#btn-stdio-preview').onclick();
  assert.equal(opsNodes.get('#btn-stdio-start').disabled,true,'a token without a full launch review must not enable execution');
  context.fetch=stdioFetch;
  await opsNodes.get('#btn-stdio-preview').onclick();
  assert.equal(await opsNodes.get('#btn-stdio-start').onclick(),false,'null launch response cannot confirm a started/discovered process');
  assert.equal(stdioStarts,1);assert.match(opsNodes.get('#ops-stdio-review').textContent,/启动结果未确认/);
  assert.equal(await opsNodes.get('#btn-stdio-start').onclick(),false);assert.equal(stdioStarts,1,'consumed launch cannot replay after unknown response');
  const stdioStart=opsNodes.get('#btn-stdio-start'), stdioRead=opsNodes.get('#btn-stdio-preview');
  const stdioRecord={serverId:'stdio-server',name:'Fixture',transport:'stdio',status:'discovered',publicHttps:false,
    launch:{...launchPreview.launch},process:{pid:123,ready:true,stopped:false,closed:false},tools:[]};
  let previewReply=launchPreview, startReply=stdioRecord, stdioReads=0, finishStdio, listFails=false;
  context.fetch=async url=>{
    if(url==='/api/external/stdio/preview') {stdioReads++;return opsResponse(previewReply);}
    if(url==='/api/external/stdio/start') {stdioStarts++;return opsResponse(startReply);}
    if(url==='/api/operations') {if(listFails) throw new Error('fixture list down');return opsResponse({servers:[],requests:[]});}
    if(url==='/api/checkpoints') return opsResponse([]);
    throw new Error(url);
  };
  for(const invalid of [{...launchPreview,requiresConfirmation:false},{...launchPreview,expiresAt:0},{...launchPreview,programStamp:null},
    {...launchPreview,launch:{...launchPreview.launch,args:['different.js']}},{...launchPreview,reviewFiles:[{}]}]) {
    previewReply=invalid;assert.equal(await stdioRead.onclick(),false);assert.equal(stdioStart.disabled,true);
  }
  previewReply=launchPreview;await stdioRead.onclick();
  context.confirm=()=>false;const beforeStartCancel=stdioStarts;assert.equal(await stdioStart.onclick(),false);
  assert.equal(stdioStarts,beforeStartCancel);assert.equal(stdioStart.disabled,false);context.confirm=()=>true;
  const stdioClock=vm.runInContext('Date.now',context);
  try {
    vm.runInContext('Date.now = () => 9999999999999',context);
    assert.equal(await stdioStart.onclick(),false);assert.equal(stdioStarts,beforeStartCancel,'expired preview refuses before any launch POST');
  } finally {context.restoreStdioClock=stdioClock;vm.runInContext('Date.now = restoreStdioClock',context);delete context.restoreStdioClock;}
  await stdioRead.onclick();
  stdioConfig.value='{"program":"/other/node"}';
  assert.equal(await stdioStart.onclick(),false,'even programmatic edits without an input event invalidate a stored draft');assert.equal(stdioStarts,beforeStartCancel);
  stdioConfig.value=JSON.stringify({program:'/fixture/node',args:['server.js']});await stdioRead.onclick();
  state.namespace.state.status.workspaceRoot='/other';assert.equal(await stdioStart.onclick(),false);assert.equal(stdioStarts,beforeStartCancel);
  state.namespace.state.status.workspaceRoot='/fixture';
  for(const invalid of [{...stdioRecord,status:'connecting'},{...stdioRecord,process:{...stdioRecord.process,closed:true}},
    {...stdioRecord,launch:{...stdioRecord.launch,cwd:'/other'}},{...stdioRecord,tools:[{name:'unsafe'}]}]) {
    startReply=invalid;await stdioRead.onclick();assert.equal(await stdioStart.onclick(),false);
    assert.match(opsNodes.get('#ops-stdio-review').textContent,/启动结果未确认/);assert.equal(stdioStart.disabled,true);
  }
  startReply=stdioRecord;listFails=true;await stdioRead.onclick();assert.equal(await stdioStart.onclick(),true);
  assert.match(opsNodes.get('#ops-stdio-review').textContent,/stdio-server.*已确认启动[\s\S]*列表刷新失败/);
  listFails=false;const immediateStdioFetch=context.fetch;
  stdioConfig.value=JSON.stringify({program:'/fixture/node',args:['server.js'],env:{FIXTURE_SECRET:'SECRET STDIO VALUE'}});
  context.fetch=async url=>url==='/api/external/stdio/preview' ? new Promise(resolve=>{stdioReads++;finishStdio=resolve;}) : immediateStdioFetch(url);
  const waitingPreview=stdioRead.onclick(), priorReadCount=stdioReads;
  assert.ok(!stdioConfig.value.includes('SECRET STDIO VALUE'));
  assert.equal(await stdioRead.onclick(),false);assert.equal(stdioReads,priorReadCount,'busy preview cannot create a second token with silently stripped env');
  stdioConfig.value='NEW SECRET DRAFT';stdioConfig.oninput();finishStdio(opsResponse(launchPreview));assert.equal(await waitingPreview,false);
  assert.equal(stdioConfig.value,'NEW SECRET DRAFT');assert.equal(stdioStart.disabled,true);assert.equal(stdioRead.disabled,false);
  stdioConfig.value=JSON.stringify({program:'/fixture/node',args:['server.js']});
  const timedPreview=stdioRead.onclick();[...timers.values()].at(-1)();finishStdio(opsResponse(launchPreview));assert.equal(await timedPreview,false);
  assert.equal(stdioStart.disabled,true);
  context.fetch=immediateStdioFetch;await stdioRead.onclick();
  context.fetch=async url=>url==='/api/external/stdio/start' ? new Promise(resolve=>{stdioStarts++;finishStdio=resolve;}) : immediateStdioFetch(url);
  const waitingLaunch=stdioStart.onclick(), priorLaunchCount=stdioStarts;
  assert.equal(await stdioStart.onclick(),false);assert.equal(await stdioRead.onclick(),false);assert.equal(stdioStarts,priorLaunchCount);
  stdioConfig.value='NEXT DRAFT';stdioConfig.oninput();const editedNotice=opsNodes.get('#ops-stdio-review').textContent;
  finishStdio(opsResponse(stdioRecord));assert.equal(await waitingLaunch,false);
  assert.equal(opsNodes.get('#ops-stdio-review').textContent,editedNotice,'late launch cannot overwrite the newer edit warning');
  assert.equal(stdioRead.disabled,false);assert.equal(stdioStart.disabled,true);
  stdioConfig.value=JSON.stringify({program:'/fixture/node',args:['server.js']});await stdioRead.onclick();
  const timedLaunch=stdioStart.onclick();[...timers.values()].at(-1)();finishStdio(opsResponse(stdioRecord));assert.equal(await timedLaunch,false);
  assert.match(opsNodes.get('#ops-stdio-review').textContent,/启动结果未确认/);
  context.fetch=async()=>({ok:true,json:async()=>{throw new Error('SECRET STDIO VALUE');}});
  assert.equal(await stdioRead.onclick(),false);assert.ok(!opsNodes.get('#ops-stdio-review').textContent.includes('SECRET STDIO VALUE'));
  console.log('workbench module/theme runtime regressions passed (DOM fixture, not browser E2E)');
})().catch(err => { console.error(err); process.exitCode = 1; });
