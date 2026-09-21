'use strict';
const path = require('path');
const { spawn } = require('child_process');
const { validPayload } = require('./receiptProtection');
const defaultRegistry = require('./tunnelRegistry');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATES = new Set(['candidate', 'terminated', 'exited', 'active-owner', 'owner-unknown', 'identity-changed', 'parent-mismatch',
  'unsupported-binary', 'invalid-record', 'inaccessible', 'duplicate-target', 'not-started', 'unconfirmed', 'failed', 'protected-process']);
function failure(unknown = false) {
  const error = Error(unknown ? 'Cleanup outcome unknown; do not replay. Inspect again.' : 'Cleanup unavailable or preview expired; no confirmation sent.');
  error.code = unknown ? 'E_CLEANUP_UNKNOWN' : 'E_CLEANUP_NOT_STARTED'; return error;
}
function bounded(promise, milliseconds) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(failure()), milliseconds); })]).finally(() => clearTimeout(timer));
}
function launchHelper() {
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return spawn(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'tunnelCleanup.ps1')],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}
function createController({ platform = process.platform, launch = launchHelper } = {}) {
  let busy = false;
  async function prepare(registry = defaultRegistry) {
    if (platform !== 'win32' || busy) throw failure();
    busy = true;
    let child;
    try {
      const source = await bounded(registry.cleanupSource(), 12000);
      if (!source.entries.length || source.entries.length > 32 || !/^[0-9a-f]{64}$/.test(source.fingerprint)
        || source.entries.some(item => !UUID.test(item.id) || item.envelope?.version !== 2 || item.envelope.protection !== 'windows-dpapi-user' || !validPayload(item.envelope.payload))
        || new Set(source.entries.map(item => item.id)).size !== source.entries.length) throw failure();
      const input = JSON.stringify({ controllerPid: process.pid, items: source.entries });
      if (Buffer.byteLength(input) > 512 * 1024) throw failure();
      child = launch();
      let phase = 'starting', sent = false, nonce, previewRecords, resultFrame, timer, outputBytes = 0, text = '';
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let resolveReady, rejectReady, resolveResult, rejectResult, resolveClosed;
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
      const result = new Promise((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
      result.catch(() => {}); // A cancelled preview need not consume a result promise.
      const closed = new Promise(resolve => { resolveClosed = resolve; });
      const stopHelper = () => { try { child.kill(); } catch (_) {} }; // Only our helper, never a target PID/tree.
      const fail = () => {
        if (phase === 'closed') return;
        const error = failure(sent); phase = 'failed'; clearTimeout(timer);
        rejectReady(error); rejectResult(error); stopHelper();
      };
      const arm = milliseconds => { clearTimeout(timer); timer = setTimeout(fail, milliseconds); };
      async function cancel() {
        if (phase !== 'closed') fail();
        await closed;
      }
      async function confirm() {
        if (phase !== 'preview') throw failure();
        phase = 'checking'; // Consume once BEFORE the asynchronous source recheck.
        try {
          const current = await bounded(registry.cleanupSource(), 12000);
          if (phase !== 'checking' || current.fingerprint !== source.fingerprint) throw failure();
          phase = 'executing'; sent = true; arm(8000);
          child.stdin.end(JSON.stringify({ action: 'confirm', nonce }) + '\n');
          return await result;
        } catch (_) { fail(); throw failure(sent); }
      }
      child.on('error', fail); child.stdin.on('error', fail);
      child.stderr.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > 64 * 1024) fail(); });
      child.stdout.on('data', chunk => {
        if (['closed', 'failed'].includes(phase)) return;
        try {
          outputBytes += chunk.length; if (outputBytes > 64 * 1024) throw failure();
          text += decoder.decode(chunk, { stream: true });
          let end;
          while ((end = text.indexOf('\n')) >= 0) {
            const frame = JSON.parse(text.slice(0, end)); text = text.slice(end + 1);
            if (!UUID.test(frame.nonce) || !Array.isArray(frame.records) || frame.records.length !== source.entries.length) throw failure();
            const ids = new Set();
            const records = frame.records.map(row => {
              if (!source.entries.some(item => item.id === row.id) || ids.has(row.id) || !Number.isInteger(row.pid) || row.pid < 0 || row.pid > 2147483647
                || !['unknown', 'cloudflare', 'cloudflare-named', 'ngrok'].includes(row.provider) || !STATES.has(row.status)) throw failure();
              ids.add(row.id);
              return Object.freeze({ id: row.id, provider: row.provider, pid: row.pid, status: row.status });
            });
            if (frame.type === 'preview' && phase === 'starting' && !records.some(row => ['terminated', 'unconfirmed', 'failed'].includes(row.status))) {
              nonce = frame.nonce; previewRecords = records; phase = 'preview'; arm(60000);
              resolveReady(Object.freeze({ records: Object.freeze(records), skipped: source.skipped, confirm, cancel, closed }));
            } else if (frame.type === 'result' && phase === 'executing' && frame.nonce === nonce && !resultFrame && !records.some(row => row.status === 'candidate')) {
              if (records.some(row => { const before = previewRecords.find(item => item.id === row.id); return row.pid !== before.pid || row.provider !== before.provider || (before.status !== 'candidate' && row.status !== before.status); })) throw failure();
              resultFrame = Object.freeze(records);
            } else throw failure();
          }
        } catch (_) { fail(); }
      });
      child.on('close', code => {
        clearTimeout(timer); busy = false;
        try {
          if (phase === 'executing' && code === 0 && resultFrame && !(text + decoder.decode()).trim()) resolveResult(resultFrame);
          else { rejectReady(failure(sent)); rejectResult(failure(sent)); }
        } catch (_) { rejectReady(failure(sent)); rejectResult(failure(sent)); }
        phase = 'closed'; resolveClosed();
      });
      arm(15000);
      child.stdin.write(input + '\n');
      return await ready;
    } catch (error) {
      if (!child) busy = false;
      throw error.code?.startsWith('E_CLEANUP_') ? error : failure();
    }
  }
  return { prepare };
}
module.exports = { createController, prepareCleanup: createController().prepare };
