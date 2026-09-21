'use strict';
// Isolated test owner: child exits itself via a private stop file or a 60s failsafe.
const path = require('path');
const { spawn } = require('child_process');
const { createRegistry } = require('../src/tunnel/tunnelRegistry');
const base = process.argv[2];
const stopFile = path.join(base, 'stop-child');
const code = `const fs=require('fs');setInterval(()=>{if(fs.existsSync(process.argv[1]))process.exit(0)},100);setTimeout(()=>process.exit(0),60000)`;
const child = spawn(process.execPath, ['-e', code, stopFile], { stdio: 'ignore' });
process.on('message', () => {});
setTimeout(() => process.exit(124), 60000).unref();
createRegistry({ baseDirectory: base }).observe(child, 'cloudflare', process.execPath).then(result => {
  process.send({ status: result.status, pid: child.pid });
}).catch(() => { process.exitCode = 1; child.kill(); });
