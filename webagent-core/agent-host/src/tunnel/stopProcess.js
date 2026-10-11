'use strict';
const { spawn } = require('child_process');
function stopProcess(proc, graceMs = 1500) {
  if (!proc || proc.exitCode != null || proc.signalCode != null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let force, deadline;
    const cleanup = () => { clearTimeout(force); clearTimeout(deadline); proc.removeListener('exit', exited); proc.removeListener('error', errored); };
    const exited = () => { cleanup(); resolve(); };
    const errored = () => { if (!proc.pid && !proc.killed) exited(); };
    proc.once('exit', exited); proc.once('error', errored);
    force = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} }, graceMs);
    deadline = setTimeout(() => { cleanup(); reject(Object.assign(new Error('隧道进程在限定时间内没有退出，不会再启动新的隧道：在任务管理器（或 ps/kill）结束 cloudflared / ngrok 后再操作。(Previous tunnel did not exit; refusing to start a replacement)'), { code: 'E_TUNNEL_PREVIOUS' })); }, graceMs * 2);
    if (force.unref) force.unref(); if (deadline.unref) deadline.unref();
    try {
      if (process.platform === 'win32' && proc.pid) {
        const killer = spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { try { proc.kill('SIGTERM'); } catch (_) {} });
      } else proc.kill('SIGTERM');
    } catch (_) { /* A failed signal is not proof of exit; wait for the deadline. */ }
  });
}
module.exports = { stopProcess };
