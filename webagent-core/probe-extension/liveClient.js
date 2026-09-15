'use strict';
const http = require('http');
const {localBase} = require('./client');
function liveRequest(base, method, route, body, signal) {
  const origin = localBase(base);
  if (!((method === 'GET' && (/^\/api\/probe\/links(?:\/[a-f0-9-]{36}\/reports\/\d+)?$/.test(route) || /^\/api\/operations(?:\/[a-f0-9-]{36})?$/.test(route)))
    || (method === 'POST' && ['/api/probe/links','/api/probe/actions'].includes(route))
    || (method === 'POST' && /^\/api\/operations\/[a-f0-9-]{36}\/(approve|cancel)$/.test(route))
    || (method === 'DELETE' && /^\/api\/probe\/links\/[a-f0-9-]{36}$/.test(route)))) throw new Error('Invalid live route');
  const payload = body === undefined ? null : JSON.stringify(body);
  if (payload && Buffer.byteLength(payload) > 32768) throw new Error('Live input budget');
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(route, origin), {method, signal, headers: payload ? {'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)} : {}}, res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 524288) req.destroy(new Error('Live result budget')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error('Live API rejected')); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { reject(new Error('Live JSON invalid')); } });
    });
    const timer = setTimeout(() => req.destroy(new Error('Live API deadline; no replay')), 65000);
    req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end(payload);
  });
}
module.exports = {liveRequest};
