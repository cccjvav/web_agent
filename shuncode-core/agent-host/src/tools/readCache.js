const hashes = new Map();

function norm(filePath) {
  return String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function rememberHash(filePath, hash) {
  const key = norm(filePath);
  if (!key || !hash) return;
  hashes.set(key, String(hash));
}

function recalledHash(filePath) {
  return hashes.get(norm(filePath)) || null;
}

function forgetHash(filePath) {
  hashes.delete(norm(filePath));
}

function resetHashes() {
  hashes.clear();
}

module.exports = { rememberHash, recalledHash, forgetHash, resetHashes };
