import { loadMonaco } from './js/monaco.js';
import { $, state, ui } from './js/state.js';
import './js/dom.js';
import './js/tabs.js';
import './js/chat.js';
import './js/bridge.js';
import './js/settings.js';
import './js/bind.js';
import './js/operations.js';

const WS_BACKOFF_MIN = 1000;
const WS_BACKOFF_MAX = 30000;
let wsBackoffMs = WS_BACKOFF_MIN;
let wsTimer = null;
let wsSock = null;

function setWsStatus(text) {
  const el = $('#sb-ws');
  if (!el) return;
  if (text) {
    el.textContent = text;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function scheduleWsReconnect() {
  if (wsTimer) return;
  setWsStatus('事件流重连中');
  const delay = wsBackoffMs;
  wsBackoffMs = Math.min(wsBackoffMs * 2, WS_BACKOFF_MAX);
  wsTimer = setTimeout(() => {
    wsTimer = null;
    connectWs();
  }, delay);
}

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  if (wsTimer) {
    clearTimeout(wsTimer);
    wsTimer = null;
  }
  if (wsSock && (wsSock.readyState === 0 || wsSock.readyState === 1)) return;
  try {
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsSock = ws;
    ws.onopen = () => {
      wsBackoffMs = WS_BACKOFF_MIN;
      setWsStatus('');
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'command_output' && msg.payload && msg.payload.chunk) {
        ui.termLine(msg.payload.chunk, msg.payload.stream === 'stderr' ? 'err' : '');
      }
      if (msg.type === 'bridge_round_reset' && ui.refreshBridgeActivity) ui.refreshBridgeActivity();
      if (msg.type === 'file_patched') ui.loadTree();
      if (['todos_updated', 'progress_updated'].includes(msg.type)) {
        if (msg.payload?.source === 'Bridge-Remote') ui.refreshBridgeActivity();
        else if (Array.isArray(msg.payload?.todos)) ui.paintTodos(msg.payload.todos);
      }
      if (msg.type === 'tool_call_end' && msg.payload?.source === 'Bridge-Remote') {
        const p = msg.payload || {};
        ui.logBridgeTool({
          name: p.tool,
          ok: p.success,
          durationMs: p.durationMs,
          result: p.result,
          error: p.error
        });
      }
    };
    ws.onclose = () => {
      if (wsSock === ws) wsSock = null;
      scheduleWsReconnect();
    };
  } catch (_) {
    scheduleWsReconnect();
  }
}

async function boot() {
  try {
    ui.initEditorSafety();
    ui.bind();
  } catch (err) {
    console.error('bind failed', err);
  }
  ui.setAgentMode('code');
  ui.paintTabs();
  ui.paintChat();
  ui.termLine('Web Agent terminal ready.', 'info');
  connectWs();
  if (ui.refreshBridgeActivity) {
    ui.refreshBridgeActivity();
    // Poll only while the tab is visible: a background tab would otherwise hit the host every
    // 3 s indefinitely. Coming back refreshes at once, so the panel never shows stale numbers;
    // /ws events still trigger refreshes in between.
    const hidden = () => typeof document !== 'undefined' && document.hidden === true;
    setInterval(() => { if (!hidden()) ui.refreshBridgeActivity(); }, 3000);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => { if (!hidden()) ui.refreshBridgeActivity(); });
    }
  }
  const results = await Promise.allSettled([
    () => ui.refreshStatus(), () => ui.loadTree(), () => ui.loadSkills(), () => ui.loadCustomizations(), loadMonaco
  ].map(load => Promise.resolve().then(load)));
  if (results.some(result => result.status === 'rejected')) {
    console.error('Some workbench data failed to load', results.filter(result => result.status === 'rejected'));
    ui.toast('部分数据加载失败，请刷新重试；事件流仍会自动重连。');
  }
  ui.activateTab(state.activeTab);
}

boot().catch((err) => console.error(err));
