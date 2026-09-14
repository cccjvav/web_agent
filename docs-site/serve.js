#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const PORT = parseInt(process.env.DOCS_PORT || '4173', 10);
const HOST = process.env.DOCS_HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(HOST)) console.warn('警告：文档站没有认证，包含源码快照；非回环绑定会对可达网络公开。不要通过公网隧道暴露。');

const bundled = fs.existsSync(path.join(ROOT, 'bundled.json'));
if (bundled) {
  const marker = JSON.parse(fs.readFileSync(path.join(ROOT, 'bundled.json'), 'utf8'));
  if (marker.format !== 1 || marker.prebuilt !== true || !fs.existsSync(path.join(ROOT, 'content.js'))) {
    throw new Error('Invalid bundled documentation');
  }
} else {
  const built = spawnSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'inherit' });
  if (built.status !== 0) process.exit(built.status || 1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let rel;
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    rel = decodeURIComponent(url.pathname);
    if (rel.includes('\0')) throw new Error('invalid path');
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('bad request');
    return;
  }
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(path.join(ROOT, rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  const shown = (HOST === '0.0.0.0' || HOST === '::') ? '127.0.0.1' : HOST;
  console.log(`Web Agent docs  http://${shown}:${server.address().port}/`);
  console.log(`bind ${HOST}:${server.address().port}`);
});
