const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const MAX_ENTRIES = 400;
let hashes = new Map();
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
  try {
    const raw = JSON.parse(fs.readFileSync(hashFile(), 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [key, value] of Object.entries(raw)) {
        if (key && value) hashes.set(norm(key), String(value));
      }
    }
  } catch (_) {}
}

function persist() {
  try {
    fs.mkdirSync(path.dirname(hashFile()), { recursive: true });
    const obj = {};
    for (const [key, value] of hashes) obj[key] = value;
    fs.writeFileSync(hashFile(), JSON.stringify(obj), 'utf8');
  } catch (_) {}
}

function rememberHash(filePath, hash) {
  ensureLoaded();
  const key = norm(filePath);
  if (!key || !hash) return;
  if (hashes.has(key)) hashes.delete(key);
  hashes.set(key, String(hash));
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

function forgetHash(filePath) {
  ensureLoaded();
  hashes.delete(norm(filePath));
  persist();
}

function resetHashes() {
  hashes = new Map();
  loadedRoot = config.workspaceRoot;
  try { fs.unlinkSync(hashFile()); } catch (_) {}
}

module.exports = { rememberHash, recalledHash, forgetHash, resetHashes };
