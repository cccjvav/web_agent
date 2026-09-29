'use strict';
// Content-Security-Policy for the two HTML surfaces this host serves (F101, review P1-1).
//
// Workbench (UI port): everything the page runs or loads comes from this host — the Monaco editor is
// vendored under /vendor/monaco (see webagent-core/scripts/vendor-monaco.js), so no CDN is allowed.
// The single inline script (the theme bootstrap at the top of index.html) is admitted by its hash,
// computed from the page at start-up: editing that script changes the policy on the next start
// instead of silently breaking the page. Monaco injects <style> elements and style="" attributes
// while rendering and boots its language workers from blob: URLs (a bootstrap blob that
// importScripts() the same-origin workerMain.js), hence 'unsafe-inline' for styles and blob: for
// workers. connect-src names the request's own host for the /ws socket because some browsers do
// not treat ws://same-host as 'self'.
//
// OAuth pairing page (MCP port, reachable through the tunnel): no scripts at all, one <style> block
// admitted by hash. No form-action: Chrome applies it to the 302 that follows the POST, which is the
// client's redirect_uri and never this host.
const crypto = require('crypto');

const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?$/i;

function sourceHash(text) {
  return `'sha256-${crypto.createHash('sha256').update(String(text), 'utf8').digest('base64')}'`;
}

// Hashes of the exact text of every inline <script> (elements with src= are governed by 'self').
function inlineScriptHashes(html) {
  return [...String(html).matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => sourceHash(m[1]));
}

function inlineStyleHashes(html) {
  return [...String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => sourceHash(m[1]));
}

function workbenchPolicy({ scriptHashes = [], host = '' } = {}) {
  const own = HOST.test(String(host || '')) ? ` ws://${host} wss://${host}` : '';
  return [
    "default-src 'self'",
    `script-src 'self'${scriptHashes.length ? ' ' + scriptHashes.join(' ') : ''}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    `connect-src 'self'${own}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

function authorizePolicy({ styleHashes = [] } = {}) {
  return [
    "default-src 'none'",
    `style-src${styleHashes.length ? ' ' + styleHashes.join(' ') : " 'none'"}`,
    "base-uri 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

module.exports = { sourceHash, inlineScriptHashes, inlineStyleHashes, workbenchPolicy, authorizePolicy, HOST };
