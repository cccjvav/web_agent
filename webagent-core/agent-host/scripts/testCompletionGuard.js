'use strict';
// Preloaded into every test file by run-tests.js (node --require). A promise that never settles lets Node drain the
// event loop and exit 0 in the middle of a test, so the runner counted a half-run test as passed (found in F82 when
// a mutation made the settings panel's main() hang). This guard watches the promises that the test file's own top
// level creates while it runs synchronously - in practice the `.catch(...)`, `.then(...)` or `.finally(...)` chained
// on `main()` - and if the event loop drains naturally while one of them is still pending, the test stopped
// half-way and the exit code becomes 1.
// Only top-level promises count: a Promise.race timeout that loses and never settles, inside some helper, is
// normal. Limits: an explicit process.exit() skips the check (beforeExit does not fire); a bare top-level `main();`
// with nothing chained is not covered; work not chained to a top-level promise (fire-and-forget) is not covered.
const path = require('path');
const { promiseHooks } = require('v8');

const mainFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
const topLevelFrame = `at Object.<anonymous> (${mainFile}:`;
const pending = new Set();
let watched = 0, loading = true, stopSettled = null;

// First stack frame outside Node internals and this file: is it the main file's top level?
function createdAtTopLevel() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 12;
  const stack = new Error().stack || '';
  Error.stackTraceLimit = limit;
  const frame = stack.split('\n').slice(1).map(line => line.trim())
    .find(line => !line.includes('node:internal') && !line.includes(__filename) && !line.startsWith('at new Promise (<anonymous>)')
      && !/^at (Promise|Function)\.\w+ \(<anonymous>\)$/.test(line));
  return Boolean(mainFile && frame && frame.startsWith(topLevelFrame));
}

const stopInit = promiseHooks.onInit((promise) => {
  if (!loading || !createdAtTopLevel()) return;
  pending.add(promise);
  watched += 1;
});
stopSettled = promiseHooks.onSettled((promise) => {
  pending.delete(promise);
  if (!loading && pending.size === 0 && stopSettled) { stopSettled(); stopSettled = null; }
});
// The main module runs synchronously right after the preloads; the first nextTick callback runs after it finishes.
process.nextTick(() => {
  loading = false;
  stopInit();
  if (pending.size === 0 && stopSettled) { stopSettled(); stopSettled = null; }
});

process.on('beforeExit', (code) => {
  if (process.env.WEBAGENT_TEST_GUARD_REPORT === '1') console.error(`[completion-guard] watched=${watched} pending=${pending.size}`);
  if (code !== 0 || pending.size === 0) return;
  console.error(`test ended before its top-level promise settled (${pending.size} pending): a promise never resolved, so Node ran out of work and would have exited 0 half-way`);
  process.exitCode = 1;
});

module.exports = { createdAtTopLevel };
