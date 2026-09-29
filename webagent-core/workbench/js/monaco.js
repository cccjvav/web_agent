import { $, state, ui } from './state.js';
import { EDITOR_BASE_FONT_PX, editorFontSize } from './dom.js';

// F101 (review P1-1): the editor is served by this host from webagent-core/workbench/vendor/monaco
// (refreshed by scripts/vendor-monaco.js), so the page never runs code from a CDN and works offline;
// the host's Content-Security-Policy would block any other origin anyway. Keep in step with the
// VERSION pinned in that script.
export const MONACO_VERSION = '0.52.2';
export const MONACO_BASE = '/vendor/monaco/vs';

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
    script.src = `${MONACO_BASE}/loader.js`;
    script.onerror = () => finish(false);
    script.onload = () => {
      try {
        window.require.config({ paths: { vs: MONACO_BASE } });
        const mount = () => window.require(['vs/editor/editor.main'], () => {
          try {
            ui.captureActiveFile();
            state.editor = window.monaco.editor.create($('#editor'), {
              model: null,
              theme: document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark',
              automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
              fontSize: ui.currentTextScale ? editorFontSize(ui.currentTextScale()) : EDITOR_BASE_FONT_PX
            });
            ui.activateTab(state.activeTab);
            finish(true);
          } catch (_) { finish(false); }
        }, () => finish(false));
        // Chinese UI strings for the context menu, find widget and command palette (the workbench is
        // zh-CN). Monaco 0.52 takes them from vs/nls.messages.<locale> loaded before the editor; if that
        // bundle is missing the editor still loads, in English.
        window.require(['vs/nls.messages.zh-cn'], mount, mount);
      } catch (_) { finish(false); }
    };
    document.head.appendChild(script);
  });
}
