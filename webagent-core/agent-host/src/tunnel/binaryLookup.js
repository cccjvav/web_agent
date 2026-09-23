'use strict';
// Memoise a synchronous binary lookup for status display.
//
// cloudflared/ngrok discovery spawns `where`/`which` synchronously, and the tunnel snapshot()
// that calls it runs on every /api/status request. The workbench polls that endpoint, so every
// poll blocked the host's event loop for two process spawns (measured ~2 ms each on Linux; far
// more on Windows, where `where` runs through cmd.exe). Contract:
//  * a result — found or not found — is reused for LOOKUP_TTL_MS, so status may lag an install
//    or uninstall by at most that long;
//  * a cached path is re-checked with a cheap existsSync before reuse, so a deleted binary is
//    noticed immediately;
//  * changing the override environment variable (CLOUDFLARED_PATH / NGROK_PATH) invalidates it;
//  * `{ fresh: true }` always performs the real lookup: starting a tunnel uses it, so a binary
//    installed a moment ago is found exactly when it matters.
const LOOKUP_TTL_MS = 30000;

function cachedLookup(lookup, overrideKey) {
  let cache = { at: -Infinity, value: null, override: undefined };
  return function find({ fresh = false } = {}) {
    const now = performance.now();
    const override = overrideKey();
    const reusable = !fresh && cache.override === override && now - cache.at < LOOKUP_TTL_MS
      && (cache.value === null || require('fs').existsSync(cache.value));
    if (reusable) return cache.value;
    const value = lookup();
    cache = { at: now, value, override };
    return value;
  };
}

module.exports = { cachedLookup, LOOKUP_TTL_MS };
