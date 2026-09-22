'use strict';
const fs = require('fs');
const { TextDecoder } = require('util');
const MAX_TEXT_BYTES = 8 * 1024 * 1024;

// Buffer#toString('utf8') silently replaces every illegal byte with U+FFFD. Two different byte
// sequences therefore decode to the same string, so a sha256 over the decoded text is not a
// faithful version token for the file on disk: an external edit that only changes illegal bytes
// leaves the hash unchanged and a stale write is accepted. Text tools here are UTF-8 only, so
// illegal input is rejected rather than "repaired" — refusing is the only answer that keeps
// hash == bytes for everything that is accepted.
class EncodingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncodingError';
    this.code = 'E_ENCODING';
  }
}

function decodeStrictUtf8(buffer, file) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(buffer);
  } catch (_) {
    throw new EncodingError(
      `E_ENCODING: "${file}" is not valid UTF-8. Text tools read and hash UTF-8 only; `
      + 'convert the file or handle it as a binary artifact instead of editing it here.'
    );
  }
}

/**
 * Read a regular file as bounded UTF-8 text.
 * @param {string} file absolute path, already validated by the caller
 * @param {number} [maxBytes] hard byte budget
 * @param {{strict?: boolean}} [options] strict (default true) rejects invalid UTF-8;
 *   pass strict:false only where the result is scanned and never hashed or written back.
 */
function readBoundedText(file, maxBytes = MAX_TEXT_BYTES, options = {}) {
  const strict = options.strict !== false;
  if (!fs.statSync(file).isFile()) throw new Error('Expected a regular text file');
  const fd = fs.openSync(file, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('Text file exceeds size budget (' + maxBytes + ' bytes)');
    const chunks = [];
    let count = 0;
    while (count <= maxBytes) {
      const buf = Buffer.alloc(Math.min(65536, maxBytes + 1 - count));
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      count += n; if (count > maxBytes) throw new Error('Text file exceeds size budget');
      chunks.push(buf.subarray(0, n));
    }
    // Decode the assembled buffer once: chunk boundaries must never split a code point.
    const bytes = Buffer.concat(chunks);
    return strict ? decodeStrictUtf8(bytes, file) : bytes.toString('utf8');
  } finally { fs.closeSync(fd); }
}

module.exports = { MAX_TEXT_BYTES, readBoundedText, decodeStrictUtf8, EncodingError };
