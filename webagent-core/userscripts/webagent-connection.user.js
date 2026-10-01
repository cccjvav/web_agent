// ==UserScript==
// @name         WebAgent connection observation (explicit export)
// @namespace    webagent-local
// @version      1.0.0
// @description  Export minimal page context on click; no network interception or identity inference.
// @match        https://arena.ai/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  if (location.origin !== 'https://arena.ai' || document.getElementById('webagent-connection-export')) return;
  const panel = document.createElement('details'); panel.id = 'webagent-connection-export';
  panel.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#202020;color:#fff;padding:10px;max-width:300px;font:13px sans-serif';
  const title = document.createElement('summary'); title.textContent = 'WebAgent 连接核对（非模型鉴定）';
  const button = document.createElement('button'); button.textContent = '生成页面摘要（不发送）'; button.type = 'button';
  const text = document.createElement('textarea'); text.readOnly = true; text.rows = 8; text.style.width = '95%'; text.setAttribute('aria-label', '手动复制页面摘要');
  const note = document.createElement('p'); note.textContent = '点击生成后手动复制到本机主机诊断。只含来源、页面类型、路径摘要和时间；不含查询参数、登录信息或模型推测。';
  button.onclick = async () => {
    button.disabled = true;
    try {
      const origin = location.origin, pathname = location.pathname, observedAt = new Date().toISOString();
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pathname));
      const pageDigest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
      text.value = JSON.stringify({ schema: 'webagent-browser-observation/v1', origin,
        observedAt, pageKind: /^\/agent(?:\/|$)/.test(pathname) ? 'agent' : 'other', pageDigest }, null, 2);
      text.focus(); text.select();
    } catch (_) { text.value = '生成失败；请检查页面是否为HTTPS且浏览器支持Web Crypto。'; }
    finally { button.disabled = false; }
  };
  panel.append(title, note, button, text); document.body.append(panel);
})();
