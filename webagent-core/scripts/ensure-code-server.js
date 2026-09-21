const fs = require('fs');
const path = require('path');
const { runPreparation } = require('../../installer/preparation');

const VERSION = '4.135.0';
const repoRoot = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(repoRoot, 'bin/code-server-runtime');

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function abortedError() { return Object.assign(new Error('code-server准备已停止'), { code: 'ABORT_ERR' }); }
function checkSignal(signal) { if (signal?.aborted) throw abortedError(); }
async function runNpm(args, cwd, { timeoutMs = 180000, signal } = {}) {
  checkSignal(signal);
  await runPreparation(npmCmd(), args, {
    cwd, windowsHide: true, timeoutMs, signal,
    env: { ...process.env, FORCE_NODE_VERSION: String(process.versions.node.split('.')[0]) },
    shell: process.platform === 'win32'
  });
  checkSignal(signal);
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
  checkSignal(signal);
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
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  ensure({ signal: controller.signal }).then(entry => {
    checkSignal(controller.signal);
    syncExtension();
    console.log('code-server entry:', entry);
  }).catch(err => {
    console.error(err.message || err); process.exitCode = 1;
  }).finally(() => {
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  });
}

module.exports = { ensure, syncExtension, findEntry, runNpm, VERSION, runtimeRoot, repoRoot };
