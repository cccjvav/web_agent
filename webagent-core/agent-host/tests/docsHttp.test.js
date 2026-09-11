'use strict';
const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: pathname }, res => {
      res.resume(); res.once('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('request timed out')));
  });
}
(async () => {
  const root = path.resolve(__dirname, '../../..');
  const child = spawn(process.execPath, ['docs-site/serve.js'], {
    cwd: root, env: { ...process.env, DOCS_HOST: '127.0.0.1', DOCS_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  const exited = new Promise(resolve => child.once('exit', resolve));
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`docs server not ready: ${stderr}`)), 5000);
      let text = '';
      child.stdout.on('data', d => {
        text += d;
        const match = /bind 127\.0\.0\.1:(\d+)/.exec(text);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`docs server exited ${code}: ${stderr}`)); });
    });
    assert.strictEqual(await request(port, '/%ZZ'), 400);
    assert.strictEqual(await request(port, '/%00'), 400);
    assert.strictEqual(await request(port, '/'), 200, 'server must still serve after bad requests');
    assert.strictEqual(await request(port, '/missing-file.html'), 404);
    console.log('docs HTTP malformed URL regressions passed');
  } finally {
    child.kill();
    await exited;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
