const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');

const MAX_ENTRIES = 400;
let hashes = new Map();
let session = new Map();
let loadedRoot = null;

function norm(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
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

function rememberHash(filePath, hash) {
  ensureLoaded();
  const key = norm(filePath);
  if (!key || !hash) return;
  const value = String(hash);
  // Same file, same hash, already the most recent entry: the on-disk bytes would be identical,
  // so there is nothing to publish. Recency order is unchanged because it is already newest.
  const keys = hashes.size ? [...hashes.keys()] : [];
  const alreadyNewest = keys.length && keys[keys.length - 1] === key && hashes.get(key) === value;
  if (alreadyNewest) {
    session.set(key, value);
    return;
  }
  if (hashes.has(key)) hashes.delete(key);
  hashes.set(key, value);
  session.set(key, value);
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

function sessionHash(filePath) {
  ensureLoaded();
  return session.get(norm(filePath)) || null;
}

function forgetHash(filePath) {
  ensureLoaded();
  const key = norm(filePath);
  const had = hashes.delete(key);
  session.delete(key);
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
  rememberHash,
  recalledHash,
  sessionHash,
  forgetHash,
  resetHashes,
  clearSession
};
