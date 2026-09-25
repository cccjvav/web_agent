// Single entry point for every HTTP request the workbench modules make to the local host.
// In the browser workbench it is plain fetch with identical arguments, so behaviour does not change.
// The VS Code settings panel (R6 phase 2) installs a transport that relays the same request through
// the extension process instead, because a webview must not call 127.0.0.1 directly or widen the
// host's Origin checks. Modules call apiFetch and never bare fetch (guarded by workbenchRuntime).
let transport = null;

// fn(input, init) must return a Promise of a fetch Response (or the same {ok,status,json,...} shape
// the modules already consume). Pass null to go back to plain fetch.
export function setApiTransport(fn) {
  if (fn !== null && typeof fn !== 'function') throw new TypeError('API transport must be a function or null');
  transport = fn;
}

// Looks up globalThis.fetch on every call rather than capturing it at load time, so tests and the
// browser regression that replace window.fetch keep working unchanged.
export function apiFetch(input, init) {
  return transport ? transport(input, init) : globalThis.fetch(input, init);
}
