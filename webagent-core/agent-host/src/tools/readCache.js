const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');

const MAX_ENTRIES = 400;
const MAX_SESSION = 4000;
let hashes = new Map();
// Keyed by reader + '\n' + path: a read by one caller must not authorize another caller's overwrite.
let session = new Map();
let loadedRoot = null;

// Who a tool call is attributed to, from the server-built call options (never from tool arguments).
// The person at the workbench is nobody: opening a file in the editor, saving it, undoing a save or
// restoring a checkpoint must not count as "the model has seen this version". Before this, an
// editor save recorded its own hash, and a model that had read the older version could then
// overwrite the person's edit with write_file and no confirmation (F95).
function readerOf(opts) {
  if (opts && opts.operator) return null;
  if (opts && opts.remote) return 'remote:' + String(opts.callerKey || '');
  return 'local';
}

function sessionKey(reader, key) {
  return reader + '\n' + key;
}

// One key per file: backslashes, `./`, doubled and inner `.` segments all collapse (F99 — a read of
// `src/a.js` followed by write_file `src//a.js` or `./src/./a.js` used to look like an unread file
// and demand confirm_overwrite; the write-side checks always compare against the current content,
// so the loose key was friction, never an authorisation). `..` is resolved too: the file tools
// only ever pass paths that stay inside the workspace.
function norm(filePath) {
  const posix = String(filePath || '').replace(/\\/g, '/');
  if (!posix) return '';
  const normalized = path.posix.normalize(posix);
  return normalized === '.' || normalized === './' ? '' : normalized.replace(/^\.\//, '');
}

function hashFile() {
  return path.join(config.workspaceRoot, '.webagent', 'read-hashes.json');
}

function ensureLoaded() {
  if (loadedRoot === config.workspaceRoot) return;
  loadedRoot = config.workspaceRoot;
  hashes = new Map();
  session = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(hashFile(), 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        if (key && value) hashes.set(norm(key), String(value));
      }
    }
  } catch (_) {}
}

// The whole map is rewritten on every change, so a change costs O(MAX_ENTRIES) bytes. That is
// bounded, but it used to run even when nothing had actually changed: re-reading the same file
// (the common case while an agent iterates on one file) rewrote the entire store every time.
// Callers that change nothing now skip the write entirely.
function persist() {
  const file = hashFile();
  const tmp = `${file}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const obj = {};
    for (const [key, value] of hashes) obj[key] = value;
    // Publish via rename: a crash or full disk mid-write must not leave truncated JSON where a
    // valid store was. Truncated JSON parses as "no hashes at all", which would silently force
    // every later apply_patch to re-read instead of reusing a known-good version.
    fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
    fs.renameSync(tmp, file);
  } catch (_) {
    try { fs.unlinkSync(tmp); } catch (_unlink) { /* nothing to clean up */ }
  }
}

function rememberSession(reader, key, value) {
  const skey = sessionKey(reader, key);
  if (session.has(skey)) session.delete(skey);
  session.set(skey, value);
  while (session.size > MAX_SESSION) session.delete(session.keys().next().value);
}

// reader: from readerOf(); null (the operator) records nothing.
function rememberHash(filePath, hash, reader = 'local') {
  ensureLoaded();
  const key = norm(filePath);
  if (!key || !hash || reader === null) return;
  const value = String(hash);
  // Same file, same hash, already the most recent entry: the on-disk bytes would be identical,
  // so there is nothing to publish. Recency order is unchanged because it is already newest.
  const keys = hashes.size ? [...hashes.keys()] : [];
  const alreadyNewest = keys.length && keys[keys.length - 1] === key && hashes.get(key) === value;
  if (alreadyNewest) {
    rememberSession(reader, key, value);
    return;
  }
  if (hashes.has(key)) hashes.delete(key);
  hashes.set(key, value);
  rememberSession(reader, key, value);
  while (hashes.size > MAX_ENTRIES) {
    const oldest = hashes.keys().next().value;
    hashes.delete(oldest);
  }
  persist();
}

function recalledHash(filePath) {
  ensureLoaded();
  return hashes.get(norm(filePath)) || null;
}

function sessionHash(filePath, reader = 'local') {
  ensureLoaded();
  return session.get(sessionKey(reader, norm(filePath))) || null;
}

function forgetHash(filePath) {
  ensureLoaded();
  const key = norm(filePath);
  const had = hashes.delete(key);
  const suffix = '\n' + key;
  for (const skey of session.keys()) if (skey.endsWith(suffix)) session.delete(skey);
  // Forgetting something that was never recorded changes no bytes.
  if (had) persist();
}

function clearSession() {
  session = new Map();
}

function resetHashes() {
  hashes = new Map();
  session = new Map();
  loadedRoot = config.workspaceRoot;
  try { fs.unlinkSync(hashFile()); } catch (_) {}
}

module.exports = {
  readerOf,
  rememberHash,
  recalledHash,
  sessionHash,
  forgetHash,
  resetHashes,
  clearSession
};
