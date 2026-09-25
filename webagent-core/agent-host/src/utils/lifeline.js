'use strict';

// Lifeline for a host started by the VS Code extension (launch.js host). The extension owns the
// write end of our stdin pipe; the OS closes it when the extension host exits for any reason,
// including a crash, so EOF on stdin is the prompt "owner gone" signal. The parent-PID poll is
// a second, slower check for the case where a pipe handle leaks into another process and EOF
// never arrives. Neither is enabled for classic/CMD starts: the variables are only set by the
// extension, and a console stdin must never shut the host down.

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error && error.code === 'EPERM'; }
}

// Launch-only variables meant for this host process alone. Read once and remove them from the
// environment, so commands the agent runs (run_command, start_command, stdio MCP servers, tests
// that start their own host) never inherit them. Found by running the test suite through an
// extension-started host: a nested host that inherited WEBAGENT_LIFELINE=stdin shut down as soon
// as its stdin ended, and one that inherited WEBAGENT_SKIP_WORKBENCH=1 never opened the workbench
// port its test expected (the code-server launcher had the same leak).
const LAUNCH_ONLY_ENV = ['WEBAGENT_LIFELINE', 'WEBAGENT_PARENT_PID', 'WEBAGENT_SKIP_WORKBENCH'];
function takeLaunchEnv(env = process.env) {
  const taken = {};
  for (const key of LAUNCH_ONLY_ENV) {
    if (Object.hasOwn(env, key)) { taken[key] = env[key]; delete env[key]; }
  }
  return taken;
}

function watchLifeline({ env = process.env, stdin = process.stdin, onLost, intervalMs = 5000, isAlive = pidAlive } = {}) {
  if (typeof onLost !== 'function') throw new TypeError('onLost is required');
  const stops = [];
  let fired = false;
  const stop = () => { while (stops.length) { try { stops.pop()(); } catch (_) { /* best effort */ } } };
  const fire = (reason) => {
    if (fired) return;
    fired = true;
    stop();
    onLost(reason);
  };
  if (env.WEBAGENT_LIFELINE === 'stdin' && stdin && typeof stdin.on === 'function') {
    const onEnd = () => fire('stdin-closed');
    const discard = () => {};
    stdin.on('data', discard);
    stdin.on('end', onEnd);
    stdin.on('close', onEnd);
    stdin.on('error', onEnd);
    if (typeof stdin.resume === 'function') stdin.resume();
    stops.push(() => {
      stdin.removeListener('data', discard);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('close', onEnd);
      stdin.removeListener('error', onEnd);
    });
  }
  const raw = String(env.WEBAGENT_PARENT_PID || '');
  const pid = /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : 0;
  if (pid) {
    const timer = setInterval(() => { if (!isAlive(pid)) fire('parent-exited'); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    stops.push(() => clearInterval(timer));
  }
  return { active: stops.length > 0, stop };
}

module.exports = { watchLifeline, takeLaunchEnv, LAUNCH_ONLY_ENV, pidAlive };
