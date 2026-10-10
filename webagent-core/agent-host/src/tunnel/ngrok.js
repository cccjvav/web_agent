const { spawn, spawnSync } = require('child_process');
const { cachedLookup } = require('./binaryLookup');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const eventBus = require('../utils/eventBus');
const { stopProcess } = require('./stopProcess');
const { observeTunnel } = require('./tunnelRegistry');
const { canonicalNamedUrl, createTokenRedactor } = require('./cloudflared');

const NGROK_URL_RE = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i;
const NGROK_READY_RE = /started tunnel|Forwarding\s+https:\/\//i;

// ngrok failures that retrying cannot fix. The agent prints the code and keeps running or exits; either way
// the user needs to act, so the start is rejected at once with what to do instead of a 25-second wait or an
// install hint. Only the code is matched; the surrounding output (which may echo the token) is never copied.
const NGROK_FAILURES = Object.freeze({
  ERR_NGROK_334: '这个 ngrok 地址已经有别的会话在用（ERR_NGROK_334）。通常是上一次的 ngrok 还没退出，或另一台机器、另一个工作区用了同一个预留域名。先关掉占用它的 ngrok（任务管理器里的 ngrok.exe，或 ngrok 控制台的 Endpoints 页），刚停掉的地址可能要等几十秒才释放；不要为互不相干的工作区开启 pooling。',
  ERR_NGROK_108: 'ngrok 账号的同时在线会话数已满（ERR_NGROK_108），免费账号只能开 1 个。关掉其它正在运行的 ngrok（ngrok 控制台的 Agents 页能看到）再重试。',
  ERR_NGROK_105: 'Authtoken 格式不对（ERR_NGROK_105）。到 dashboard.ngrok.com 的 Your Authtoken 页重新复制完整的 Token。',
  ERR_NGROK_4018: 'ngrok 要求已验证的账号和 Authtoken（ERR_NGROK_4018）。注册并验证邮箱后，从 dashboard.ngrok.com 复制 Authtoken。'
});

// -> { code, message, known } for the first ERR_NGROK_<n> in the output, or null.
function ngrokFailure(output) {
  const text = String(output || '');
  const busy = /\bendpoint\b[^\r\n]{0,2048}\bis already online\b/i.test(text);
  const match = text.match(/ERR_NGROK_\d{1,6}\b/i);
  const code = match ? match[0].toUpperCase() : (busy ? 'ERR_NGROK_334' : null);
  if (!code) return null;
  if (NGROK_FAILURES[code]) return { code, message: NGROK_FAILURES[code], known: true };
  return { code, message: `ngrok 报告 ${code}，说明见 https://ngrok.com/docs/errors/${code.toLowerCase()}`, known: false };
}

function failureError(failure) {
  const err = new Error(failure.message);
  err.code = failure.code; err.retryable = false;
  return err;
}

let child = null;
let generation = 0, cancelPending = null;
let stopping = Promise.resolve();
let ngrokUrl = null;

function parseNgrokUrl(chunk) {
  const text = String(chunk || '');
  const jsonUrl = text.match(/"url"\s*:\s*"(https:\/\/[^"]+)"/i);
  if (jsonUrl) return jsonUrl[1].replace(/\/$/, '');
  const tagged = text.match(/(?:url=|Forwarding\s+)(https:\/\/[^\s"'\\]+)/i);
  if (tagged) return tagged[1].replace(/\/$/, '').replace(/[.,;]+$/, '');
  const m = text.match(NGROK_URL_RE);
  if (!m) return null;
  const url = m[0].replace(/\/$/, '');
  if (/\.ngrok(?:-free)?\.(?:app|dev|io)\b/i.test(url) || /\.ngrok\.io\b/i.test(url)) return url;
  return null;
}

function resolveNgrokToken(token) {
  const fromArg = String(token || '').trim();
  if (fromArg) return fromArg;
  return String(process.env.NGROK_AUTHTOKEN || '').trim();
}

function lookupNgrok() {
  if (process.env.NGROK_PATH && fs.existsSync(process.env.NGROK_PATH)) {
    return process.env.NGROK_PATH;
  }
  const which = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(which, ['ngrok'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: 5000
  });
  const hit = String(r.stdout || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s && fs.existsSync(s));
  if (hit) return hit;
  const guesses = process.platform === 'win32'
    ? [
      path.join(process.env.LOCALAPPDATA || '', 'ngrok', 'ngrok.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'ngrok', 'ngrok.exe'),
      path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'ngrok', 'ngrok.exe')
    ]
    : ['/usr/local/bin/ngrok', '/opt/homebrew/bin/ngrok', '/usr/bin/ngrok'];
  return guesses.find((p) => p && fs.existsSync(p)) || null;
}

// Same status-poll hot path as cloudflared (snapshot() runs on every /api/status).
const ngrokLookup = cachedLookup(lookupNgrok, () => process.env.NGROK_PATH);

function findNgrok({ fresh = false } = {}) {
  return ngrokLookup({ fresh });
}

function installHint() {
  if (process.platform === 'win32') {
    return '未找到 ngrok。在 Windows 终端执行：winget install Ngrok.Ngrok   装完后完全退出并重开 VS Code，再新建集成 CMD 运行 run-webagent.cmd（独立 CMD 请重新打开）。也可从 https://ngrok.com/download 下载 ngrok.exe 并加入 PATH，或设 NGROK_PATH。';
  }
  return '未找到 ngrok。macOS: brew install ngrok/ngrok/ngrok；其它系统见 https://ngrok.com/download';
}

function stopNgrok() {
  generation++;
  if (cancelPending) { cancelPending(); cancelPending = null; }
  const previous = child;
  child = null;
  ngrokUrl = null;
  config.publicTunnelUrl = null;
  config.bridgeRunning = false;
  const other = Promise.resolve();
  stopping = Promise.all([stopping, stopProcess(previous), other]).then(() => undefined);
  stopping.catch(() => {}); // Callers awaiting stop still receive failures.
  return stopping;
}

async function startNgrokTunnel({ hostname, token, port = config.port, timeoutMs = 25000 } = {}) {
  const tok = resolveNgrokToken(token);
  if (!tok) {
    const err = new Error('ngrok 需要 Authtoken（dashboard.ngrok.com 复制，或设环境变量 NGROK_AUTHTOKEN）。');
    err.code = 'E_NGROK_TOKEN';
    return Promise.reject(err);
  }
  const named = hostname ? canonicalNamedUrl(hostname) : null;
  if (hostname && String(hostname).trim() && !named) {
    const err = new Error('ngrok 域名无效。可留空用随机地址，或填 mcp.ngrok-free.app 这类主机名。');
    err.code = 'E_NGROK_HOSTNAME';
    return Promise.reject(err);
  }
  const stopped = require('./cloudflared').stopTunnel();
  const ticket = generation;
  await stopped;
  if (ticket !== generation) throw new Error('Tunnel start superseded');
  const bin = findNgrok({ fresh: true });
  if (!bin) {
    const err = new Error(installHint());
    err.code = 'E_NO_NGROK';
    return Promise.reject(err);
  }
  const target = `127.0.0.1:${port}`;
  return new Promise((resolve, reject) => {
    const args = ['http', target, '--log=stdout', '--log-format=term'];
    if (named) args.push('--url', named);
    const isWin = process.platform === 'win32';
    const needShell = isWin && /\.(cmd|bat)$/i.test(bin);
    const proc = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: needShell,
      env: { ...process.env, NGROK_AUTHTOKEN: tok }
    });
    child = proc;
    observeTunnel(proc, 'ngrok', bin);
    const redactLogs = new Map([proc.stdout, proc.stderr].map(stream => [stream, createTokenRedactor(tok)]));
    let buf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (child === proc && ticket === generation) stopNgrok().catch(() => {});
      const failure = ngrokFailure(buf);
      reject(failure ? failureError(failure) : new Error('ngrok 已启动但 25 秒内没有给出公网地址。请确认 Authtoken、预留域名（若填了）以及本机网络。'));
    }, timeoutMs);

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ngrokUrl = url;
      config.publicTunnelUrl = url;
      eventBus.broadcast('tunnel_ready', { url, target: `http://${target}`, ngrok: true });
      resolve({ url, binary: bin, target: `http://${target}`, ngrok: true });
    };

    const onData = (chunk, stream) => {
      if (child !== proc || ticket !== generation) return;
      const text = chunk.toString();
      buf = (buf + text).slice(-65536);
      const safe = redactLogs.get(stream)(chunk);
      if (safe) eventBus.broadcast('tunnel_log', { chunk: safe.slice(0, 400) });
      const failure = ngrokFailure(buf);
      if (failure && failure.known && !settled) {
        settled = true; clearTimeout(timer);
        if (child === proc && ticket === generation) stopNgrok().catch(() => {});
        return reject(failureError(failure));
      }
      const parsed = parseNgrokUrl(buf);
      if (named && NGROK_READY_RE.test(buf)) return finish(named);
      if (parsed) return finish(parsed);
    };

    cancelPending = () => {
      if (settled) return; settled = true; clearTimeout(timer); reject(new Error('Tunnel start cancelled'));
    };
    const clearActive = () => {
      if (child !== proc || ticket !== generation) return;
      child = null; ngrokUrl = null; config.publicTunnelUrl = null; config.bridgeRunning = false;
      eventBus.broadcast('tunnel_stopped', {});
    };
    proc.stdout.on('data', chunk => onData(chunk, proc.stdout));
    proc.stderr.on('data', chunk => onData(chunk, proc.stderr));
    proc.on('error', (err) => {
      if (!proc.pid) clearActive();
      else if (child === proc && ticket === generation) stopNgrok().catch(() => {});
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`无法启动 ngrok: ${err.message}`));
    });
    proc.on('exit', (code) => {
      clearActive();
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // A process that ran and printed an ngrok error code is not an installation problem.
      const failure = ngrokFailure(buf);
      reject(failure ? failureError(failure) : new Error(`ngrok 退出（code ${code}）。${installHint()}`));
    });
  });
}

function snapshot() {
  return {
    binary: findNgrok(),
    url: ngrokUrl || null,
    running: Boolean(child && !child.killed)
  };
}

module.exports = {
  NGROK_FAILURES,
  ngrokFailure,
  parseNgrokUrl,
  findNgrok,
  installHint,
  startNgrokTunnel,
  stopNgrok,
  snapshot
};
