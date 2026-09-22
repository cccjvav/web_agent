'use strict';
const fs = require('fs');
const { TextDecoder } = require('util');
const { ExecutionError } = require('../mcp/errors');
const MAX_TEXT_BYTES = 8 * 1024 * 1024;
function readBoundedText(file, maxBytes = MAX_TEXT_BYTES) {
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
    const bytes = Buffer.concat(chunks);
    try {
      // Fatal decoding prevents different invalid byte sequences sharing a text hash.
      // ignoreBOM=true means retain U+FEFF: re-encoding must reproduce the input bytes.
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (_) {
      throw new ExecutionError('E_INVALID_TEXT', 'Expected valid UTF-8 text; the file was not changed.');
    }
  } finally { fs.closeSync(fd); }
}
module.exports = { MAX_TEXT_BYTES, readBoundedText };
