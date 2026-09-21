'use strict';
// OS-user-scoped integrity/confidentiality only, not proof of application origin or kill authority.
const path = require('path');
const { execFile } = require('child_process');
const supported = process.platform === 'win32';
let active = 0;
function unavailable() { return Error('Tunnel receipt protection unavailable'); }
function validPayload(value) { return typeof value === 'string' && value.length > 0 && value.length <= 16384 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value); }
async function run(operation, items) {
  if (!supported || !['protect', 'unprotect'].includes(operation) || !Array.isArray(items) || items.length > 32 || active >= 2
    || items.some(item => typeof item !== 'string' || (operation === 'protect' ? Buffer.byteLength(item) > 8192 : !validPayload(item)))) throw unavailable();
  if (!items.length) return [];
  const input = JSON.stringify({ operation, items });
  if (Buffer.byteLength(input) > 512 * 1024) throw unavailable();
  const shell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const child = execFile(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'receiptProtection.ps1')],
        { windowsHide: true, timeout: 8000, maxBuffer: 512 * 1024, encoding: 'utf8' }, (error, stdout) => {
          if (error) return reject(unavailable());
          try {
            const rows = JSON.parse(stdout.replace(/^\uFEFF/, ''));
            if (!Array.isArray(rows) || rows.length !== items.length || rows.some(row => row !== null && (typeof row !== 'string'
              || (operation === 'protect' ? !validPayload(row) : Buffer.byteLength(row) > 8192)))) throw unavailable();
            resolve(rows);
          } catch (_) { reject(unavailable()); }
        });
      // Data goes through stdin, never argv/env or command interpolation. Errors stay generic.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  } finally { active--; }
}
async function protect(record) {
  const [payload] = await run('protect', [JSON.stringify(record)]);
  if (!payload) throw unavailable();
  return { version: 2, protection: 'windows-dpapi-user', payload };
}
async function unprotect(envelopes) {
  if (!supported) return envelopes.map(() => null);
  const rows = await run('unprotect', envelopes.map(envelope => envelope.payload));
  return rows.map(row => { try { return row === null ? null : JSON.parse(row); } catch (_) { return null; } });
}
module.exports = { supported, validPayload, protect, unprotect };
