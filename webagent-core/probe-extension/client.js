'use strict';
const http = require('http');
function localBase(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Only a plain loopback HTTP root is allowed');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1'; // No DNS rebinding.
  return url.origin;
}
function parseObservation(text, now = Date.now()) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 2048) throw new Error('Observation exceeds limit');
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'observedAt,origin,pageDigest,pageKind,schema'
    || value.schema !== 'webagent-browser-observation/v1' || value.origin !== 'https://arena.ai'
    || !['agent', 'other'].includes(value.pageKind) || typeof value.pageDigest !== 'string' || !/^[a-f0-9]{64}$/.test(value.pageDigest)
    || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))
    || now - Date.parse(value.observedAt) > 600000 || Date.parse(value.observedAt) - now > 30000) throw new Error('Invalid or stale minimal observation');
  return value;
}
function request(base, method, route, body, signal) {
  const origin = localBase(base);
  if (!(method === 'GET' && (route === '/api/diagnostics' || /^\/api\/connection-checks\/[a-f0-9]{32}$/.test(route)))
    && !(method === 'POST' && route === '/api/connection-checks')) throw new Error('Route not permitted');
  const payload = body === undefined ? null : JSON.stringify(parseObservation(JSON.stringify(body)));
  return new Promise((resolve, reject) => {
    let timer;
    const req = http.request(new URL(route, origin), { method, signal, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} }, res => {
      const chunks = []; let length = 0;
      res.on('data', chunk => {
        length += chunk.length;
        if (length > 65536) { reject(new Error('Response exceeds limit')); req.destroy(new Error('Response exceeds limit')); res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error('Local API rejected request')); // No redirect or response text disclosure.
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { reject(new Error('Invalid API response')); }
      });
    });
    timer = setTimeout(() => req.destroy(new Error('Deadline exceeded')), 10000);
    req.on('error', reject); req.on('close', () => clearTimeout(timer));
    req.end(payload);
  });
}
module.exports = { localBase, parseObservation, request };
