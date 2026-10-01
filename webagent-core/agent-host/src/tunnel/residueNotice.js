'use strict';
// R5 (F123): read-only startup notice for tunnels left behind by an earlier host that was killed.
// One bounded registry scan at startup; counts only 'orphan-candidate' records (owner host gone, tunnel process
// alive with the recorded identity). Never stops, signals or retries anything: cleanup stays in the separate,
// confirmed start-menu entry (scripts/tunnel-cleanup.js), so a web page or extension button cannot kill processes.
const HINT = '发现上次遗留的隧道进程。请从开始菜单 → Web Agent → “隧道残留回收（需确认）”处理；本提示只读，不会结束任何进程。';
let state = null; // { checkedAt, complete, orphanCount, providers }
let pending = null;

function summarize(report, now = Date.now()) {
  const records = Array.isArray(report && report.records) ? report.records : [];
  const orphans = records.filter(record => record && record.status === 'orphan-candidate');
  return {
    checkedAt: now,
    complete: Boolean(report && report.complete) && !(report && report.error),
    orphanCount: orphans.length,
    providers: [...new Set(orphans.map(record => String(record.provider)))].sort()
  };
}

// Startup only. A failed or incomplete scan is reported as such, never as "nothing left".
function check(snapshot = () => require('./tunnelRegistry').snapshot()) {
  if (!pending) {
    pending = Promise.resolve().then(snapshot)
      .then(report => { state = summarize(report); }, () => { state = { checkedAt: Date.now(), complete: false, orphanCount: 0, providers: [] }; })
      .then(() => notice());
    // check() resolves with notice(); state is set first, so it is never { pending } here.
  }
  return pending;
}

// Copy for /api/status: { pending:true } while the startup scan runs, null when nothing was found. An incomplete scan is only
// logged (see index.js): a banner on every start would teach people to ignore it.
function notice() {
  if (!state) return pending ? { pending: true } : null;
  if (!state.orphanCount) return null;
  return { orphanCount: state.orphanCount, complete: state.complete, checkedAt: state.checkedAt, providers: [...state.providers], hint: HINT };
}

function reset() { state = null; pending = null; } // tests only
function scanComplete() { return Boolean(state && state.complete); }
module.exports = { check, notice, summarize, scanComplete, reset, HINT };
