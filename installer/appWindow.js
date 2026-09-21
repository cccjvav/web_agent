'use strict';
// App-window bootstrap only. Readiness metadata is not authentication against a
// malicious process running as the same OS user; no credentials are sent here.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { performance } = require('perf_hooks');
const { spawn } = require('child_process');
const { TextDecoder } = require('util');
const APP_START_MS = 120000;
const PROBE_MS = 1500;
const BODY_BYTES = 64 * 1024;

function portValue(env, name, fallback) {
  const value = String(env[name] || fallback);
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${name}必须是1–65535的端口`);
  return Number(value);
}
function appOrigin(env = process.env) {
  return `http://127.0.0.1:${portValue(env, 'CODE_SERVER_PORT', 3000)}`;
}
function aborted() { return Object.assign(new Error('App启动已停止；未自动重试'), { code: 'ABORT_ERR' }); }
function checkSignal(signal) { if (signal?.aborted) throw signal.reason || aborted(); }

function probeJson(url, { signal, timeoutMs = PROBE_MS } = {}) {
  checkSignal(signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('启动探测期限无效');
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password
    || target.search || target.hash || !['/healthz', '/api/diagnostics'].includes(target.pathname)) {
    throw new Error('启动探测仅允许固定本机只读入口');
  }
  return new Promise((resolve, reject) => {
    const expires = performance.now() + timeoutMs;
    let req, res, settled = false, bytes = 0;
    const chunks = [];
    const finish = (result, error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
      if (res) res.destroy(); if (req) req.destroy();
      if (error) reject(error); else resolve(result);
    };
    const onAbort = () => finish(null, signal.reason || aborted());
    const timer = setTimeout(() => finish({ state: 'unknown' }), timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      req = http.get(target, { agent: false, headers: { Accept: 'application/json' } }, response => {
        res = response;
        res.on('error', () => finish({ state: 'unknown' }));
        if (settled) { res.destroy(); return; }
        if (res.statusCode !== 200 || !/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] || '')) {
          finish({ state: 'occupied' }); return;
        }
        res.on('aborted', () => finish({ state: 'unknown' }));
        res.on('data', chunk => {
          if (settled) return;
          bytes += chunk.length;
          if (bytes > BODY_BYTES) { finish({ state: 'occupied' }); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (settled) return;
          if (performance.now() >= expires) { finish({ state: 'unknown' }); return; }
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
            finish({ state: 'ok', value: JSON.parse(text) });
          } catch (_) { finish({ state: 'occupied' }); }
        });
      });
      req.on('error', error => finish({ state: error.code === 'ECONNREFUSED' ? 'absent' : 'unknown' }));
    } catch (_) { finish({ state: 'unknown' }); }
  });
}
function validHealth(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2 && ['alive', 'expired'].includes(value.status)
    && Number.isSafeInteger(value.lastHeartbeat) && value.lastHeartbeat >= 0;
}
async function ready(origin = appOrigin(), options) {
  const result = await probeJson(origin + '/healthz', options);
  return result.state === 'ok' && validHealth(result.value);
}
function normalizedWorkspace(value) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0') || !path.isAbsolute(value)) return null;
  // Never realpath/stat a path received from HTTP (e.g. an attacker-controlled UNC).
  const normalized = path.resolve(value);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
function hostIdentity(value, expected) {
  const identity = value?.identity;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)
    || typeof identity.hostInstanceId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(identity.hostInstanceId)
    || identity.version !== expected.version || identity.mcpPort !== expected.mcpPort
    || !Number.isSafeInteger(identity.workbenchPort) || identity.workbenchPort < 1 || identity.workbenchPort > 65535
    || identity.workbenchPort !== expected.codePort
    || typeof identity.startedAt !== 'string' || identity.startedAt.length > 64 || !Number.isFinite(Date.parse(identity.startedAt))
    || normalizedWorkspace(identity.workspaceRoot) !== normalizedWorkspace(expected.workspace)) {
    throw new Error('主机身份或工作区不匹配；未打开窗口，未停止已有服务');
  }
  return { hostInstanceId: identity.hostInstanceId, startedAt: identity.startedAt, version: identity.version,
    mcpPort: identity.mcpPort, workbenchPort: identity.workbenchPort,
    workspaceRoot: normalizedWorkspace(identity.workspaceRoot) };
}
async function inspectPair(expected, signal, timeoutMs) {
  const [editor, host] = await Promise.all([
    probeJson(expected.origin + '/healthz', { signal, timeoutMs }),
    probeJson(expected.hostOrigin + '/api/diagnostics', { signal, timeoutMs })
  ]);
  checkSignal(signal);
  const identity = host.state === 'ok' ? hostIdentity(host.value, expected) : null;
  if (editor.state === 'ok' && !validHealth(editor.value)) throw new Error('编辑器端口已占用但响应不是预期服务；未打开窗口');
  if (identity && editor.state === 'ok') return { state: 'ready', identity };
  return { state: editor.state === 'absent' && host.state === 'absent' ? 'absent' : 'waiting' };
}
function delay(ms, signal) {
  checkSignal(signal);
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); if (error) reject(error); else resolve(); };
    const onAbort = () => finish(signal.reason || aborted());
    const timer = setTimeout(() => finish(), ms);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
function isAppControl(message) {
  return !!message && typeof message === 'object' && !Array.isArray(message) && Object.keys(message).length === 1
    && ['webagent-app-stop', 'webagent-app-release'].includes(message.type);
}
function supervise(child, expected, controller) {
  const state = { child, prepared: false, releaseRequested: false, released: false, transferred: false, stopping: false };
  const fail = message => { if (!state.transferred && !state.stopping) controller.abort(new Error(message)); };
  child.on('error', () => fail('后台启动失败；请检查startup.log，未自动重试'));
  child.once('exit', () => fail('后台在窗口启动确认前退出；请检查startup.log，未自动重试'));
  child.on('disconnect', () => fail('后台启动通道提前断开，结果未确认'));
  child.on('message', message => {
    if (state.transferred || state.stopping) return;
    if (message?.type === 'webagent-app-prepared' && Object.keys(message).length === 4
      && normalizedWorkspace(message.workspaceRoot) === normalizedWorkspace(expected.workspace)
      && message.codePort === expected.codePort && message.mcpPort === expected.mcpPort) {
      state.prepared = true;
    } else if (message?.type === 'webagent-app-released' && Object.keys(message).length === 1 && state.prepared && state.releaseRequested) {
      state.released = true;
    } else fail('后台启动通道返回了不匹配的阶段信息');
  });
  return state;
}
function sendControl(state, type, signal) {
  checkSignal(signal);
  if (type === 'webagent-app-release') state.releaseRequested = true;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(signal.reason || aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    try { state.child.send({ type }, error => finish(error ? new Error('后台启动通道发送失败，结果未确认') : null)); }
    catch (_) { finish(new Error('后台启动通道不可用，结果未确认')); }
  });
}
async function stopOwned(state) {
  state.stopping = true;
  const child = state.child;
  const detach = () => {
    if (child.connected) { try { child.disconnect(); } catch (_) {} }
    child.unref();
  };
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  // An observed exit is confirmation even when the code is non-zero. No process means nothing to signal.
  if (!child.pid || exited()) { detach(); return true; }
  const observed = await new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(termTimer); clearTimeout(killTimer); clearTimeout(deadline);
      child.removeListener('exit', onExit);
      resolve(value);
    };
    const onExit = () => finish(true);
    const send = signal => {
      if (settled || exited()) return;
      try { child.kill(signal); } catch (_) { /* Still wait for exit or the deadline. */ }
    };
    child.once('exit', onExit);
    try { child.send({ type: 'webagent-app-stop' }, error => { if (error && child.connected) child.disconnect(); }); }
    catch (_) { if (child.connected) { try { child.disconnect(); } catch (_) {} } }
    // Give a responsive supervisor the inner 9s+1s cleanup. A blocked loop ignores IPC and SIGTERM;
    // SIGKILL is only on this retained handle, never taskkill or a name/port/stale PID.
    const termTimer = setTimeout(() => send('SIGTERM'), 10000);
    const killTimer = setTimeout(() => send('SIGKILL'), 11000);
    const deadline = setTimeout(() => finish(false), 12000);
  });
  detach();
  return observed;
}
function openBrowser(url, env, signal) {
  checkSignal(signal);
  const target = new URL(url);
  if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password || target.hash) {
    throw new Error('浏览器地址必须是本机编辑器入口');
  }
  const candidates = [
    path.join(env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe')
  ];
  const browser = candidates.find(file => path.isAbsolute(file) && fs.existsSync(file));
  return new Promise((resolve, reject) => {
    let child, settled = false;
    const onAbort = () => finish(signal.reason || aborted());
    const finish = error => {
      if (settled) return;
      settled = true; signal.removeEventListener('abort', onAbort);
      if (child) child.unref(); if (error) reject(error); else resolve();
    };
    try {
      child = browser ? spawn(browser, [`--app=${url}`], { detached: true, stdio: 'ignore', shell: false })
        : spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', shell: false });
      child.once('spawn', () => finish());
      child.on('error', () => finish(new Error('浏览器启动失败；窗口可能未打开，未自动重试')));
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    } catch (_) { finish(new Error('浏览器启动失败，未自动重试')); }
  });
}
async function appWindow(root, workspace, env, home) {
  const expected = { origin: appOrigin(env), codePort: portValue(env, 'CODE_SERVER_PORT', 3000),
    mcpPort: portValue(env, 'AGENT_HOST_PORT', 48271), workspace,
    version: require(path.join(root, 'webagent-core/extension/package.json')).version };
  if (!normalizedWorkspace(workspace) || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected.version || '') || expected.codePort === expected.mcpPort) throw new Error('工作区或两个服务端口配置无效');
  expected.hostOrigin = `http://127.0.0.1:${expected.mcpPort}`;
  const controller = new AbortController(), expires = performance.now() + APP_START_MS;
  const timeoutError = new Error('App未在120秒内确认启动；请检查startup.log，未自动重试');
  const timer = setTimeout(() => controller.abort(timeoutError), APP_START_MS);
  const onSignal = () => controller.abort(aborted());
  const check = () => { if (performance.now() >= expires) controller.abort(timeoutError); checkSignal(controller.signal); };
  const budget = () => Math.min(PROBE_MS, Math.max(1, expires - performance.now()));
  let owned;
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    let snapshot = await inspectPair(expected, controller.signal, budget()); check();
    if (snapshot.state !== 'ready') {
      if (snapshot.state !== 'absent') throw new Error('端口已占用或服务尚不能确认；未自动复用或停止已有服务');
      fs.mkdirSync(home, { recursive: true });
      const fd = fs.openSync(path.join(home, 'startup.log'), 'a', 0o600);
      try {
        const child = spawn(process.execPath, [path.join(root, 'webagent-core/scripts/run-code-oss.js'), workspace], {
          env: { ...env, WEBAGENT_APP_BOOTSTRAP: '1' }, cwd: root, detached: true, windowsHide: true,
          stdio: ['ignore', fd, fd, 'ipc'], shell: false
        });
        owned = supervise(child, expected, controller);
      } finally { fs.closeSync(fd); }
      for (;;) {
        check();
        if (owned.prepared) {
          snapshot = await inspectPair(expected, controller.signal, budget()); check();
          if (snapshot.state === 'ready') break;
        }
        await delay(Math.min(500, Math.max(1, expires - performance.now())), controller.signal);
      }
    }
    // A read completes before a UI side effect. Pin the observed instance, not just the root.
    const confirmed = await inspectPair(expected, controller.signal, budget()); check();
    if (confirmed.state !== 'ready' || JSON.stringify(confirmed.identity) !== JSON.stringify(snapshot.identity)) {
      throw new Error('主机实例在启动确认期间变化；未打开窗口，请重新核对');
    }
    const target = new URL(expected.origin); target.searchParams.set('folder', workspace);
    await openBrowser(target.toString(), env, controller.signal); check();
    let afterOpen;
    try { afterOpen = await inspectPair(expected, controller.signal, budget()); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error('主机实例在打开窗口后变化；窗口可能已打开，未移交后台，请重新核对');
    }
    check();
    if (!afterOpen || afterOpen.state !== 'ready' || JSON.stringify(afterOpen.identity) !== JSON.stringify(confirmed.identity)) {
      throw new Error('主机实例在打开窗口后变化；窗口可能已打开，未移交后台，请重新核对');
    }
    if (owned) {
      await sendControl(owned, 'webagent-app-release', controller.signal); check();
      while (!owned.released) { await delay(Math.min(50, Math.max(1, expires - performance.now())), controller.signal); check(); }
      owned.transferred = true;
      if (owned.child.connected) owned.child.disconnect();
      owned.child.unref();
    }
  } catch (error) {
    controller.abort(error);
    if (owned && !owned.transferred && !await stopOwned(owned)) {
      throw new Error((error.message || 'App启动未确认') + '；后台清理结果未确认，未按名称/端口/PID补杀，请在本机核对');
    }
    throw error;
  } finally {
    clearTimeout(timer); controller.abort();
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  }
}
module.exports = { appOrigin, ready, appWindow, probeJson, validHealth, normalizedWorkspace, hostIdentity, isAppControl };
