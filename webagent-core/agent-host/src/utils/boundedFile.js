'use strict';
const fs = require('fs');
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
    return Buffer.concat(chunks).toString('utf8');
  } finally { fs.closeSync(fd); }
}
module.exports = { MAX_TEXT_BYTES, readBoundedText };
