const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const VERSION = '4.135.0';
const repoRoot = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(repoRoot, 'bin/code-server-runtime');

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function abortedError() { return Object.assign(new Error('code-server准备已停止'), { code: 'ABORT_ERR' }); }
function checkSignal(signal) { if (signal?.aborted) throw abortedError(); }
function runNpm(args, cwd, { timeoutMs = 180000, signal } = {}) {
  checkSignal(signal);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('npm准备期限无效');
  const command = npmCmd();
  return new Promise((resolve, reject) => {
    let child, settled = false, timedOut = false, stopped = false, timer, forceTimer, giveUp;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(forceTimer); clearTimeout(giveUp);
      signal?.removeEventListener('abort', onAbort);
      if (error) reject(error); else resolve();
    };
    const send = sig => {
      if (!child || child.exitCode != null || child.signalCode != null) return;
      try { child.kill(sig); } catch (_) { /* The give-up deadline still rejects. */ }
    };
    const onAbort = () => {
      stopped = true; send('SIGTERM');
      forceTimer = setTimeout(() => send('SIGKILL'), 1000);
      giveUp = setTimeout(() => finish(signal?.reason && signal.reason.name !== 'AbortError' ? signal.reason : abortedError()), 2000);
    };
    try {
      child = spawn(command, args, {
        cwd, stdio: 'inherit', windowsHide: true,
        env: { ...process.env, FORCE_NODE_VERSION: String(process.versions.node.split('.')[0]) },
        shell: process.platform === 'win32'
      });
    } catch (error) { finish(error); return; }
    if (!child || typeof child.on !== 'function') {
      finish(new Error(`npm ${args.join(' ')} failed in ${cwd} (exit null)`));
      return;
    }
    timer = setTimeout(() => {
      timedOut = true; send('SIGTERM');
      forceTimer = setTimeout(() => send('SIGKILL'), 1000);
      giveUp = setTimeout(() => finish(Object.assign(new Error(`npm ${args.join(' ')} 超时 ${timeoutMs}ms in ${cwd}`), { code: 'ETIMEDOUT' })), 2000);
    }, timeoutMs);
    child.on('error', error => { if (!settled && child.pid == null) finish(error); });
    child.once('exit', code => {
      if (stopped || signal?.aborted) return finish(signal?.reason && signal.reason.name !== 'AbortError' ? signal.reason : abortedError());
      if (timedOut) return finish(Object.assign(new Error(`npm ${args.join(' ')} 超时 ${timeoutMs}ms in ${cwd}`), { code: 'ETIMEDOUT' }));
      if (code !== 0) return finish(new Error(`npm ${args.join(' ')} failed in ${cwd} (exit ${code})`));
      finish();
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function findEntry() {
  const candidates = [
    path.join(runtimeRoot, 'node_modules/code-server/out/node/entry.js'),
    path.join(runtimeRoot, `code-server-${VERSION}/out/node/entry.js`),
    path.join(runtimeRoot, `code-server-${VERSION}-linux-amd64/out/node/entry.js`)
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function vscodeDirFromEntry(entry) {
  return path.join(path.dirname(entry), '../../lib/vscode');
}

async function ensureVscodeDeps(entry, { signal } = {}) {
  checkSignal(signal);
  const vscodeDir = vscodeDirFromEntry(entry);
  const marker = path.join(vscodeDir, 'node_modules/@microsoft/1ds-core-js');
  if (fs.existsSync(marker)) return;
  if (!fs.existsSync(path.join(vscodeDir, 'package.json'))) {
    throw new Error(`code-server 包不完整，找不到 ${vscodeDir}`);
  }
  console.log('Installing code-server VS Code dependencies (first run, ~1–2 min)…');
  await runNpm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], vscodeDir, { timeoutMs: 120000, signal });
}

async function ensure({ signal } = {}) {
  checkSignal(signal);
  fs.mkdirSync(runtimeRoot, { recursive: true });
  checkSignal(signal);
  let entry = findEntry();
  if (!entry) {
    const pkg = path.join(runtimeRoot, 'package.json');
    if (!fs.existsSync(pkg)) {
      fs.writeFileSync(
        pkg,
        JSON.stringify(
          {
            name: 'webagent-code-server-runtime',
            private: true,
            dependencies: { 'code-server': VERSION }
          },
          null,
          2
        )
      );
    }
    console.log(`Downloading code-server@${VERSION} from npm (first run, ~50 MB)…`);
    // Cancel leaves a partial runtime directory; the next run continues from the marker, it does not delete it.
    await runNpm(
      ['install', `code-server@${VERSION}`, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      runtimeRoot,
      { timeoutMs: 180000, signal }
    );
    checkSignal(signal);
    entry = findEntry();
  }
  if (!entry) {
    throw new Error('code-server 安装后仍找不到 out/node/entry.js');
  }
  await ensureVscodeDeps(entry, { signal });
  return entry;
}

function extensionVersion() {
  return require('../agent-host/src/extensionVersion').productVersion();
}

function syncExtension(extRoot = path.join(repoRoot, 'webagent-core/extensions-installed')) {
  const src = path.join(repoRoot, 'webagent-core/extension');
  const version = extensionVersion();
  const dest = path.join(extRoot, `webagent.webagent-core-${version}`);
  const { copyTree, pruneOld } = require('./install-desktop-extension');
  copyTree(src, dest);
  pruneOld(extRoot, path.basename(dest));
  const abs = dest.replace(/\\/g, '/');
  fs.writeFileSync(
    path.join(extRoot, 'extensions.json'),
    JSON.stringify(
      [
        {
          identifier: { id: 'webagent.webagent-core' },
          version,
          location: { $mid: 1, path: abs, scheme: 'file' },
          relativeLocation: `webagent.webagent-core-${version}`
        }
      ],
      null,
      2
    )
  );
  return dest;
}

if (require.main === module) {
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);
  ensure({ signal: controller.signal }).then(entry => {
    syncExtension();
    console.log('code-server entry:', entry);
  }).catch(err => {
    console.error(err.message || err);
    process.exitCode = 1;
  }).finally(() => {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  });
}

module.exports = { ensure, syncExtension, findEntry, runNpm, VERSION, runtimeRoot, repoRoot };
