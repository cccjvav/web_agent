import { $, state, ui } from './js/state.js';
import './js/dom.js';
import './js/tabs.js';
import './js/chat.js';
import './js/bridge.js';
import './js/settings.js';
import './js/bind.js';

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  try {
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'command_output' && msg.payload && msg.payload.chunk) {
        ui.termLine(msg.payload.chunk, msg.payload.stream === 'stderr' ? 'err' : '');
      }
      if (msg.type === 'file_patched') ui.loadTree();
      if (msg.type === 'todos_updated') ui.paintTodos((msg.payload && msg.payload.todos) || []);
      if (msg.type === 'tool_call_end') {
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
  } catch (_) {}
}

function loadMonaco() {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
    script.onload = () => {
      window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
      window.require(['vs/editor/editor.main'], () => {
        state.editor = window.monaco.editor.create($('#editor'), {
          value: '',
          language: 'plaintext',
          theme: 'vs-dark',
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false
        });
        $('#editor').classList.add('hidden');
        resolve(true);
      });
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
    setTimeout(() => resolve(!!state.editor), 7000);
  });
}

async function boot() {
  ui.bind();
  ui.setAgentMode('code');
  ui.paintTabs();
  ui.paintChat();
  ui.termLine('Web Agent terminal ready.', 'info');
  await Promise.all([ui.refreshStatus(), ui.loadTree(), ui.loadSkills(), ui.loadCustomizations(), loadMonaco()]);
  connectWs();
  ui.activateTab('welcome');
}

boot().catch((err) => console.error(err));
