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

// Two browser services the settings modal needs that a VS Code webview does not provide: the webview
// sandbox has no allow-modals, so window.confirm is silently ignored and returns false (every guarded
// action would look cancelled), and clipboard writes are not reliable there. The panel entry replaces
// them with the extension's modal dialog and clipboard; the browser keeps window.confirm and
// navigator.clipboard, looked up per call like fetch above.
let services = null;

// next = { confirm?(message) -> boolean|Promise<boolean>, copyText?(text) -> Promise } or null.
export function setHostServices(next) {
  if (next !== null && (typeof next !== 'object' || ['confirm', 'copyText'].some(key => next[key] !== undefined && typeof next[key] !== 'function'))) {
    throw new TypeError('host services must be null or an object of functions');
  }
  services = next;
}

// Resolves true only for an explicit yes. Callers must re-check anything that can change while the
// dialog is open, because in the panel the answer arrives asynchronously.
export async function confirmAction(message) {
  if (services && services.confirm) return (await services.confirm(String(message))) === true;
  return Boolean(globalThis.confirm(message)); // In the browser globalThis is window.
}

export function copyText(text) {
  if (services && services.copyText) return Promise.resolve().then(() => services.copyText(String(text)));
  return globalThis.navigator.clipboard.writeText(text);
}
