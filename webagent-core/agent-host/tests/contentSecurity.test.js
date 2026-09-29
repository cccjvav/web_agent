'use strict';
// F101 (review P1-1): the workbench Content-Security-Policy and the vendored Monaco tree it relies on.
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const csp = require('../src/utils/contentSecurity');
const vendor = require('../../scripts/vendor-monaco');

// --- hashes follow the exact element text, src= scripts are left to 'self'
const page = '<html><head><script src="./app.js"></script><script>\n  try { x(); } catch (e) {}\n</script><style>body{margin:0}</style></head></html>';
const expected = `'sha256-${crypto.createHash('sha256').update('\n  try { x(); } catch (e) {}\n', 'utf8').digest('base64')}'`;
assert.deepStrictEqual(csp.inlineScriptHashes(page), [expected]);
assert.deepStrictEqual(csp.inlineStyleHashes(page), [`'sha256-${crypto.createHash('sha256').update('body{margin:0}', 'utf8').digest('base64')}'`]);
assert.deepStrictEqual(csp.inlineScriptHashes('<script type="module" src="/a.js"></script>'), [], 'external scripts need no hash');
assert.deepStrictEqual(csp.inlineScriptHashes(''), []);

// --- the real page: exactly one inline script (the theme bootstrap), and the hash the host will send
const workbenchDir = path.resolve(__dirname, '../../workbench');
const html = fs.readFileSync(path.join(workbenchDir, 'index.html'), 'utf8');
const hashes = csp.inlineScriptHashes(html);
assert.strictEqual(hashes.length, 1, 'index.html has one inline script; a second one must be a deliberate, hashed addition');
assert.ok(/^'sha256-[A-Za-z0-9+/]+=*'$/.test(hashes[0]));
assert.ok(!/\son[a-z]+\s*=/i.test(html.replace(/<script\b[\s\S]*?<\/script>/g, '')), 'no inline event handlers (CSP would block them silently)');
assert.ok(!/javascript:/i.test(html));

// --- workbench policy: own host only, ws:// named for the socket, no third party
const policy = csp.workbenchPolicy({ scriptHashes: hashes, host: '127.0.0.1:48270' });
assert.ok(policy.startsWith("default-src 'self'; script-src 'self' " + hashes[0] + '; '), policy);
assert.ok(policy.includes("connect-src 'self' ws://127.0.0.1:48270 wss://127.0.0.1:48270"));
assert.ok(policy.includes("worker-src 'self' blob:") && policy.includes("style-src 'self' 'unsafe-inline'"));
assert.ok(policy.includes("object-src 'none'") && policy.includes("base-uri 'self'") && policy.includes("form-action 'self'") && policy.endsWith("frame-ancestors 'none'"));
assert.ok(!policy.includes('http:') && !policy.includes('https:'), 'no remote origin anywhere in the policy');
for (const host of ['localhost:3000', '[::1]:48270', 'my-pc.local', 'LOCALHOST']) {
  assert.ok(csp.workbenchPolicy({ host }).includes(`ws://${host} wss://${host}`), host);
}
for (const bad of ['evil.com/x', "a'b", 'host:port', '127.0.0.1:1 ws://x', '', undefined, 'a..b', '-a', 'x:123456']) {
  assert.ok(csp.workbenchPolicy({ host: bad }).includes("connect-src 'self';"), 'unusable Host header falls back to self only: ' + JSON.stringify(bad));
}
assert.ok(csp.workbenchPolicy().includes("script-src 'self';"), 'no hashes: no dangling space');

// --- pairing page policy: nothing but the hashed style block
const authorize = csp.authorizePolicy({ styleHashes: ["'sha256-abc'"] });
assert.strictEqual(authorize, "default-src 'none'; style-src 'sha256-abc'; base-uri 'none'; frame-ancestors 'none'");
assert.strictEqual(csp.authorizePolicy(), "default-src 'none'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'");
assert.ok(!authorize.includes('form-action'), 'Chrome applies form-action to the post-submit redirect to the client');

// --- vendored editor: the tree the host serves is byte-for-byte the pinned monaco-editor release
const checked = vendor.check();
assert.strictEqual(checked.version, vendor.VERSION);
assert.ok(checked.files >= 90, 'min/vs subset present: ' + checked.files);
for (const rel of ['vs/loader.js', 'vs/editor/editor.main.js', 'vs/editor/editor.main.css', 'vs/nls.messages.zh-cn.js',
  'vs/base/worker/workerMain.js', 'vs/base/browser/ui/codicons/codicon/codicon.ttf', 'vs/language/typescript/tsWorker.js', 'vs/basic-languages/python/python.js', 'LICENSE.txt', 'ThirdPartyNotices.txt']) {
  assert.ok(fs.existsSync(path.join(vendor.TARGET, rel)), 'vendored: ' + rel);
}
assert.ok(!fs.existsSync(path.join(vendor.TARGET, 'vs/nls.messages.de.js')), 'other UI languages are left out on purpose');
const monacoJs = fs.readFileSync(path.join(workbenchDir, 'js/monaco.js'), 'utf8');
assert.ok(monacoJs.includes(`MONACO_VERSION = '${vendor.VERSION}'`), 'workbench and vendor script pin the same release');
assert.ok(/^sha512-[A-Za-z0-9+/]+=*$/.test(vendor.INTEGRITY));
const manifest = JSON.parse(fs.readFileSync(path.join(vendor.TARGET, 'VERSION.json'), 'utf8'));
assert.strictEqual(manifest.license, 'MIT');
assert.strictEqual(Object.keys(manifest.files).length, manifest.fileCount);

console.log('content security policy and vendored Monaco regressions passed');
