'use strict';
// R5 (F123): read-only startup notice about tunnels left behind by a killed host. Only clear orphans count,
// a failed/incomplete scan never shows "nothing left" as a banner, and nothing here can stop a process.
const assert = require('assert');
const path = require('path');
const notice = require('../src/tunnel/residueNotice');

(async () => {
  // summarize: only orphan-candidate records count; providers are de-duplicated and sorted.
  const report = { complete: true, records: [
    { id: 'a', provider: 'ngrok', status: 'orphan-candidate' },
    { id: 'b', provider: 'cloudflared', status: 'orphan-candidate' },
    { id: 'c', provider: 'ngrok', status: 'orphan-candidate' },
    { id: 'd', provider: 'cloudflared', status: 'active-current' },
    { id: 'e', provider: 'cloudflared', status: 'active-other' },
    { id: 'f', provider: 'cloudflared', status: 'unknown' },
    { id: 'g', provider: 'cloudflared', status: 'identity-changed' },
    { id: 'h', provider: 'cloudflared', status: 'exited' }
  ] };
  const summary = notice.summarize(report, 123);
  assert.deepStrictEqual(summary, { checkedAt: 123, complete: true, orphanCount: 3, providers: ['cloudflared', 'ngrok'] });
  assert.strictEqual(notice.summarize({ complete: true, error: 'registry-unavailable', records: [] }).complete, false);
  assert.strictEqual(notice.summarize(null).orphanCount, 0);

  // Before the scan: nothing to show. While it runs: pending, so the extension knows to ask again.
  notice.reset();
  assert.strictEqual(notice.notice(), null);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const running = notice.check(() => gate);
  assert.deepStrictEqual(notice.notice(), { pending: true });
  assert.strictEqual(notice.check(() => { throw new Error('second scan must not start'); }), running, 'one startup scan, shared');
  release(report);
  const found = await running;
  assert.strictEqual(found.orphanCount, 3);
  assert.deepStrictEqual(found.providers, ['cloudflared', 'ngrok']);
  assert.ok(found.hint.includes('隧道残留回收（需确认）') && found.hint.includes('不会结束任何进程'));
  assert.ok(notice.scanComplete());
  const copy = notice.notice(); copy.providers.push('tampered');
  assert.deepStrictEqual(notice.notice().providers, ['cloudflared', 'ngrok'], 'callers get a copy');

  // Nothing left behind: no banner.
  notice.reset();
  assert.strictEqual(await notice.check(async () => ({ complete: true, records: [{ provider: 'ngrok', status: 'exited' }] })), null);
  assert.strictEqual(notice.notice(), null);
  assert.ok(notice.scanComplete());

  // Scan failed or incomplete: no banner (it would show on every start), but not reported as complete either.
  notice.reset();
  assert.strictEqual(await notice.check(async () => { throw new Error('inspection unavailable'); }), null);
  assert.strictEqual(notice.scanComplete(), false);
  notice.reset();
  assert.strictEqual(await notice.check(async () => ({ complete: false, records: [] })), null);
  assert.strictEqual(notice.scanComplete(), false);

  // The module exposes no cleanup, kill or signal entry point.
  assert.deepStrictEqual(Object.keys(notice).sort(), ['HINT', 'check', 'notice', 'reset', 'scanComplete', 'summarize']);

  // Extension side: warn once with the host's text; wait while pending; ignore malformed or empty notices.
  const extensionPath = path.resolve(__dirname, '../../extension/extension.js');
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => request === 'vscode' ? {} : originalLoad(request, parent, isMain);
  let ext;
  try { ext = require(extensionPath); } finally { Module._load = originalLoad; }
  assert.strictEqual(ext.residueWarning({ tunnelResidue: null }), null);
  assert.strictEqual(ext.residueWarning({ tunnelResidue: { pending: true } }), null);
  assert.strictEqual(ext.residueWarning({ tunnelResidue: { orphanCount: '2', hint: 'x' } }), null);
  assert.strictEqual(ext.residueWarning({ tunnelResidue: { orphanCount: 0, hint: 'x' } }), null);
  assert.strictEqual(ext.residueWarning({ tunnelResidue: { orphanCount: 2, hint: '去开始菜单' } }), 'Web Agent：遗留隧道 2 个。去开始菜单');

  const replies = [{ tunnelResidue: { pending: true } }, { tunnelResidue: { pending: true } }, { tunnelResidue: { orphanCount: 1, hint: 'h' } }];
  const shown = [], waits = [];
  const result = await ext.watchTunnelResidue(async () => replies.shift(), message => shown.push(message), async ms => { waits.push(ms); });
  assert.strictEqual(result, 'Web Agent：遗留隧道 1 个。h');
  assert.deepStrictEqual(shown, [result]);
  assert.deepStrictEqual(waits, [5000, 5000]);

  const quiet = [];
  assert.strictEqual(await ext.watchTunnelResidue(async () => ({ tunnelResidue: null }), m => quiet.push(m), async () => {}), null);
  assert.strictEqual(await ext.watchTunnelResidue(async () => { throw new Error('host gone'); }, m => quiet.push(m), async () => {}), null);
  let polls = 0;
  assert.strictEqual(await ext.watchTunnelResidue(async () => { polls++; return { tunnelResidue: { pending: true } }; }, m => quiet.push(m), async () => {}), null);
  assert.strictEqual(polls, 7, 'bounded retries while the scan stays pending');
  assert.deepStrictEqual(quiet, []);

  console.log('tunnel residue notice: orphan-only count, shared startup scan, pending/none/failed states, no cleanup surface, extension warns once with bounded retries');
})().catch(error => { console.error(error); process.exitCode = 1; });
