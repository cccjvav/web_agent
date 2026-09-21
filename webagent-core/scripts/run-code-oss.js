const path = require('path');
const fs = require('fs');
const http = require('http');
const { performance } = require('perf_hooks');
const { spawn } = require('child_process');
const { ensure, syncExtension, repoRoot } = require('./ensure-code-server');
const { resolveAuth, trustedOrigins } = require('./codeServerAuth');

const workspace = path.resolve(
  process.argv[2] || process.env.WORKSPACE_ROOT || repoRoot
);
const mcpPort = parseInt(process.env.AGENT_HOST_PORT || '48271', 10);
const codePort = parseInt(process.env.CODE_SERVER_PORT || '3000', 10);

if (!fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
  console.error(`工作区不存在: ${workspace}`);
  process.exit(1);
}

function waitHealth(url, timeoutMs, { signal } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('健康检查期限必须为正数'));
  return new Promise((resolve, reject) => {
    const expires = performance.now() + timeoutMs;
    const timeoutError = Object.assign(new Error('agent-host 未在时限内就绪'), { code: 'ETIMEDOUT' });
    let request, response, retryTimer, settled = false;
    const release = () => {
      const req = request, res = response;
      request = response = null; // Late errors from a disposed attempt cannot schedule another one.
      if (res) res.destroy();
      if (req) req.destroy();
    };
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(retryTimer);
      signal?.removeEventListener('abort', onAbort);
      release();
      if (error) reject(error); else resolve();
    };
    const onAbort = () => finish(Object.assign(new Error('agent-host 启动已停止'), { code: 'ABORT_ERR' }));
    const deadline = setTimeout(() => finish(timeoutError), timeoutMs);
    const retry = () => {
      if (settled) return;
      release();
      if (performance.now() >= expires) return finish(timeoutError);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(tick, 200);
    };
    const tick = () => {
      if (settled) return;
      if (performance.now() >= expires) return finish(timeoutError);
      try {
        const active = http.get(url, { agent: false }, res => {
          res.on('error', () => { if (request === active) retry(); });
          if (settled || request !== active) { res.destroy(); return; }
          response = res;
          if (performance.now() >= expires) return finish(timeoutError);
          if (res.statusCode === 200) finish(); else retry();
        });
        request = active;
        active.on('error', () => { if (request === active) retry(); });
      } catch (error) { finish(error); }
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort(); else tick();
  });
}

function run(command, args, opts) {
  // The owner installs error/exit handlers; never exit the launcher from this helper.
  return spawn(command, args, {
    stdio: 'inherit',
    windowsHide: true,
    shell: Boolean(opts.shell),
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env }
  });
}

function stopChild(child, graceMs = 9000, forceMs = 1000) {
  // Keep the host's existing 8s shutdown budget. Only signal our retained child
  // handle: never launch taskkill by a possibly stale PID, name, port or tree.
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise(resolve => {
    let settled = false;
    const finish = observed => {
      if (settled) return;
      settled = true;
      clearTimeout(forceTimer); clearTimeout(deadline);
      child.removeListener('exit', onExit);
      child.removeListener('error', onError);
      resolve(observed);
    };
    const onExit = () => finish(true);
    const onError = () => {}; // A failed kill is not evidence of exit; still wait for exit/the deadline.
    const send = signal => {
      if (settled || child.exitCode !== null || child.signalCode !== null) return;
      try { child.kill(signal); } catch (_) { /* The observation deadline reports unknown. */ }
    };
    child.once('exit', onExit); child.on('error', onError);
    const forceTimer = setTimeout(() => send('SIGKILL'), graceMs);
    const deadline = setTimeout(() => finish(false), graceMs + forceMs);
    send('SIGTERM');
  });
}

async function main() {
  console.log('===========================================================');
  console.log('  Web Agent  +  网页 VS Code (code-server 4.135.0)');
  console.log('===========================================================');

  const children = [], controller = new AbortController();
  let exitCode = null, failure, resolveStop;
  const stopped = new Promise(resolve => { resolveStop = resolve; });
  const stop = (code = 0, error) => {
    if (exitCode !== null) return;
    exitCode = code; failure = error;
    controller.abort(); resolveStop();
  };
  const onSignal = () => stop(0);
  const checkRunning = () => {
    if (controller.signal.aborted) throw new Error('启动已停止');
  };
  const launch = (command, args, opts, role) => {
    checkRunning();
    const child = run(command, args, opts);
    children.push(child);
    const finished = new Promise(resolve => {
      child.on('error', error => {
        stop(1, new Error(`无法启动或运行 ${command}: ${error.message}`));
        resolve({ code: 1, error });
      });
      child.once('exit', (code, signal) => {
        if (role === 'agent') stop(code || 1, new Error(`agent-host 已退出 (${signal || code})`));
        if (role === 'editor') stop(code === null ? 1 : code, signal ? new Error(`code-server 已退出 (${signal})`) : null);
        resolve({ code, signal });
      });
    });
    return { child, finished };
  };
  const appControlled = process.env.WEBAGENT_APP_BOOTSTRAP === '1' && typeof process.send === 'function';
  let appReleased = false, appPrepared = false;
  const sendApp = message => {
    try { process.send(message, error => { if (error && !appReleased) stop(1, new Error('App启动通道发送失败')); }); }
    catch (_) { if (!appReleased) stop(1, new Error('App启动通道已关闭')); }
  };
  const onAppMessage = message => {
    if (!appControlled || !require('../../installer/appWindow').isAppControl(message)) return;
    if (message.type === 'webagent-app-stop') stop(0);
    else if (appPrepared && !controller.signal.aborted) {
      appReleased = true;
      sendApp({ type: 'webagent-app-released' });
    }
  };
  const onAppDisconnect = () => { if (!appReleased) stop(0); };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  if (appControlled) { process.on('message', onAppMessage); process.once('disconnect', onAppDisconnect); }
  try {
    if (process.env.WEBAGENT_APP_BOOTSTRAP === '1' && !appControlled) throw new Error('App启动需要私有IPC通道');
    checkRunning();
    const entry = ensure({ signal: controller.signal });
    checkRunning();
    const extDir = path.join(repoRoot, 'webagent-core/extensions-installed');
    syncExtension();

    const agentHostDir = path.join(repoRoot, 'webagent-core/agent-host');
    if (!fs.existsSync(path.join(agentHostDir, 'node_modules/express'))) {
      console.log('Installing agent-host dependencies…');
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const install = launch(npm, ['install', '--no-audit', '--no-fund'], {
        cwd: agentHostDir,
        shell: process.platform === 'win32'
      }, 'install');
      const result = await Promise.race([install.finished, stopped]);
      checkRunning();
      if (result.code !== 0) throw new Error('npm install agent-host 失败');
    }

    launch(process.execPath, ['src/index.js'], {
      cwd: agentHostDir,
      env: {
        WORKSPACE_ROOT: workspace,
        AGENT_HOST_PORT: String(mcpPort),
        WEBAGENT_SKIP_WORKBENCH: '1'
      }
    }, 'agent');

    await waitHealth(`http://127.0.0.1:${mcpPort}/health`, 15000, { signal: controller.signal });
    checkRunning();

    const userData = process.env.WEBAGENT_USER_DATA_DIR || path.join(repoRoot, '.local/share/code-server');
    const configFile = path.join(repoRoot, '.config/code-server/config.yaml');
    fs.mkdirSync(userData, { recursive: true });
    const auth = resolveAuth({ userData, env: process.env });

    const csArgs = [
      entry,
      '--auth',
      auth.mode,
      '--bind-addr',
      `${process.env.WEBAGENT_BIND || '127.0.0.1'}:${codePort}`,
      '--disable-telemetry',
      '--disable-update-check',
      '--trusted-origins',
      trustedOrigins(codePort),
      '--app-name',
      'Web Agent',
      '--user-data-dir',
      userData,
      '--extensions-dir',
      extDir,
      '--config',
      configFile,
      workspace
    ];

    console.log(`  VS Code   http://127.0.0.1:${codePort}`);
    if (auth.mode === 'password') {
      console.log(`  登录密码  ${auth.password}`);
      console.log(auth.passwordFile ? `            存在 ${auth.passwordFile}` : '            来自CODE_SERVER_PASSWORD（未写入密码文件）');
      console.log('            自定：set CODE_SERVER_PASSWORD=…    关掉登录：set CODE_SERVER_AUTH=none');
    } else {
      console.log('  登录      已关（CODE_SERVER_AUTH=none）');
    }
    console.log(`  MCP       http://127.0.0.1:${mcpPort}/mcp/…`);
    console.log(`  Workspace ${workspace}`);
    console.log('  侧栏点 Web Agent 图标打开 Chat / Bridge（连本机 agent-host）');
    console.log('  停止: Ctrl+C');
    console.log('===========================================================');

    const csEnv = auth.mode === 'password' ? { PASSWORD: auth.password } : {};
    const editor = launch(process.execPath, csArgs, { cwd: path.dirname(entry), env: csEnv }, 'editor');
    if (appControlled) editor.child.once('spawn', () => {
      if (!controller.signal.aborted) {
        appPrepared = true;
        sendApp({ type: 'webagent-app-prepared', workspaceRoot: workspace, codePort, mcpPort });
      }
    });
    await stopped;
  } catch (error) { stop(1, error); }
  finally {
    controller.abort();
    const observed = await Promise.all(children.map(child => stopChild(child)));
    for (let i = 0; i < children.length; i++) {
      if (observed[i]) continue;
      console.error('未能确认本次启动的子进程退出；未按名称、端口或PID补杀，请在本机核对。');
      children[i].unref();
      exitCode = exitCode || 1;
    }
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
    if (appControlled) {
      process.removeListener('message', onAppMessage); process.removeListener('disconnect', onAppDisconnect);
      if (process.connected) { try { process.disconnect(); } catch (_) {} }
    }
  }
  if (failure) console.error(failure.message || failure);
  return exitCode === null ? 1 : exitCode;
}

main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
