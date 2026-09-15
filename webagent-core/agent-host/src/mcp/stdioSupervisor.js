'use strict';
// POSIX process-group supervisor: never reads the target's protocol stdin/stdout.
const { spawn } = require('child_process');
function terminate() {
  try { process.kill(-process.pid, 'SIGKILL'); } catch (_) { process.exit(125); }
}
try {
  const launch = JSON.parse(process.env.WEBAGENT_STDIO_LAUNCH);
  delete process.env.WEBAGENT_STDIO_LAUNCH;
  if (process.platform === 'win32' || process.ppid !== launch.parentPid) throw new Error('Supervisor parent mismatch');
  const child = spawn(launch.program, launch.args, { cwd: launch.cwd, env: process.env, shell: false, stdio: 'inherit' });
  child.once('error', terminate);
  child.once('exit', terminate); // Includes descendants that kept protocol pipes open.
  process.on('SIGTERM', terminate); process.on('SIGINT', terminate);
  setInterval(() => { if (process.ppid !== launch.parentPid) terminate(); }, 500).unref();
} catch (_) { terminate(); }
