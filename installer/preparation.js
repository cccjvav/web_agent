'use strict';
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

// Internal launch helper, not a cleanup API. Own only the ChildProcess we create.
function runPreparation(command, args, { timeoutMs, signal, ...options }) {
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('启动准备已停止'), { code: 'ABORT_ERR' }));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('准备期限无效'));
  return new Promise((resolve, reject) => {
    const expires = performance.now() + timeoutMs;
    let child, settled = false, stopping, observation;
    const timeoutError = () => Object.assign(new Error(`启动准备超时 ${timeoutMs}ms`), { code: 'ETIMEDOUT' });
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(observation);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const stop = error => {
      if (settled || stopping) return;
      stopping = error;
      // Preparation work has no server shutdown grace contract. Do not wait for
      // cooperative TERM; observe the retained direct child after forced stop.
      observation = setTimeout(() => {
        error.cleanupUnconfirmed = true;
        error.message += '；直接子进程退出未确认，未按名称/端口/PID补杀，请在本机核对';
        child?.unref(); finish(error);
      }, 1000);
      try { child?.kill('SIGKILL'); } catch (_) { /* Observation, not kill(), decides. */ }
    };
    const onAbort = () => stop(Object.assign(new Error('启动准备已停止'), { code: 'ABORT_ERR' }));
    const deadline = setTimeout(() => stop(timeoutError()), timeoutMs);
    try {
      child = spawn(command, args, { ...options, stdio: 'inherit' });
      child.on('error', error => {
        if (settled) return; // Keep a listener for late errors after an unknown result.
        if (!child.pid) finish(stopping || error); else stop(error);
      });
      child.once('exit', (code, exitSignal) => {
        if (settled) return;
        if (stopping) return finish(stopping);
        if (signal?.aborted) return finish(Object.assign(new Error('启动准备已停止'), { code: 'ABORT_ERR' }));
        if (performance.now() >= expires) return finish(timeoutError());
        finish(code === 0 ? null : new Error(`启动准备失败 (exit ${exitSignal || code})`));
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    } catch (error) { finish(error); }
  });
}
module.exports = { runPreparation };
