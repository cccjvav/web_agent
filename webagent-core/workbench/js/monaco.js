import { $, state, ui } from './state.js';

export function loadMonaco() {
  const status = $('#sb-editor');
  const show = text => { if (status) status.textContent = text; };
  show('高级编辑器加载中 · 可先用纯文本编辑');
  return new Promise(resolve => {
    let settled = false;
    const finish = ok => {
      show(ok ? '高级编辑器就绪' : '纯文本编辑器 · 高级编辑器未加载');
      if (!settled) { settled = true; clearTimeout(timer); resolve(ok); }
    };
    const timer = setTimeout(() => finish(Boolean(state.editor)), 7000);
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js';
    script.onerror = () => finish(false);
    script.onload = () => {
      try {
        window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
        window.require(['vs/editor/editor.main'], () => {
          try {
            ui.captureActiveFile();
            state.editor = window.monaco.editor.create($('#editor'), {
              model: null,
              theme: document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
              automaticLayout: true, minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false
            });
            ui.activateTab(state.activeTab);
            finish(true);
          } catch (_) { finish(false); }
        }, () => finish(false));
      } catch (_) { finish(false); }
    };
    document.head.appendChild(script);
  });
}
