'use strict';
const { createHash } = require('crypto');
const { runWithSignal } = require('../utils/requestScope');
const { ProtocolError } = require('./errors');

// Only live calls are retained. The same session with a different credential
// cannot cancel a call, even if it learns that call's JSON-RPC id.
function createLifecycle({ timeoutMs = 300000, limit = 64 } = {}) {
  const active = new Map();
  function key(owner, id) {
    if (!owner || !(typeof id === 'string' && id.length <= 256 || typeof id === 'number' && Number.isFinite(id))) return null;
    return JSON.stringify([owner, id]);
  }
  function owner(session, credential) {
    return session && credential ? createHash('sha256').update(JSON.stringify([session, credential])).digest('hex') : null;
  }
  function cancel(identity, id) {
    const entry = active.get(key(identity, id));
    if (entry) entry.abort();
    // Unknown/finished/wrong-owner IDs have no observable lookup result.
  }
  async function run(identity, id, response, fn) {
    const requestKey = key(identity, id);
    if (active.size >= limit) throw new ProtocolError('E_BUSY', 'Too many active MCP calls');
    if (requestKey && active.has(requestKey)) throw new ProtocolError('E_BAD_ARGS', 'Duplicate active MCP request id');
    const slot = requestKey || Symbol('unaddressable-call');
    const controller = new AbortController();
    active.set(slot, controller);
    const abort = () => { if (!response?.writableEnded) controller.abort(); };
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    response?.on('close', abort);
    if (response?.destroyed) abort();
    try { return await runWithSignal(controller.signal, fn); }
    finally {
      clearTimeout(timer);
      response?.removeListener('close', abort);
      active.delete(slot);
    }
  }
  return { owner, cancel, run };
}
module.exports = { createLifecycle };
