const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = '4.135.0';
const repoRoot = path.resolve(__dirname, '../..');
const runtimeRoot = path.join(repoRoot, 'bin/code-server-runtime');

function npmCmd() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runNpm(args, cwd) {
  const r = spawnSync(npmCmd(), args, {
    cwd,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, FORCE_NODE_VERSION: String(process.versions.node.split('.')[0]) },
    shell: process.platform === 'win32'
  });
  if (r.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed in ${cwd} (exit ${r.status})`);
  }
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

function ensureVscodeDeps(entry) {
  const vscodeDir = vscodeDirFromEntry(entry);
  const marker = path.join(vscodeDir, 'node_modules/@microsoft/1ds-core-js');
  if (fs.existsSync(marker)) return;
  if (!fs.existsSync(path.join(vscodeDir, 'package.json'))) {
    throw new Error(`code-server 包不完整，找不到 ${vscodeDir}`);
  }
  console.log('Installing code-server VS Code dependencies (first run, ~1–2 min)…');
  runNpm(['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], vscodeDir);
}

function ensure() {
  fs.mkdirSync(runtimeRoot, { recursive: true });
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
    runNpm(
      ['install', `code-server@${VERSION}`, '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
      runtimeRoot
    );
    entry = findEntry();
  }
  if (!entry) {
    throw new Error('code-server 安装后仍找不到 out/node/entry.js');
  }
  ensureVscodeDeps(entry);
  return entry;
}

function syncExtension() {
  const src = path.join(repoRoot, 'webagent-core/extension');
  const dest = path.join(repoRoot, 'webagent-core/extensions-installed/webagent.webagent-core-0.6.9');
  fs.mkdirSync(dest, { recursive: true });
  fs.mkdirSync(path.join(dest, 'resources'), { recursive: true });
  for (const name of ['package.json', 'extension.js']) {
    fs.copyFileSync(path.join(src, name), path.join(dest, name));
  }
  const icon = path.join(src, 'resources/icon.svg');
  if (fs.existsSync(icon)) {
    fs.copyFileSync(icon, path.join(dest, 'resources/icon.svg'));
  }
  const extRoot = path.join(repoRoot, 'webagent-core/extensions-installed');
  const abs = dest.replace(/\\/g, '/');
  fs.writeFileSync(
    path.join(extRoot, 'extensions.json'),
    JSON.stringify(
      [
        {
          identifier: { id: 'webagent.webagent-core' },
          version: '0.6.9',
          location: { $mid: 1, path: abs, scheme: 'file' },
          relativeLocation: 'webagent.webagent-core-0.6.9'
        }
      ],
      null,
      2
    )
  );
  return dest;
}

if (require.main === module) {
  try {
    const entry = ensure();
    syncExtension();
    console.log('code-server entry:', entry);
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { ensure, syncExtension, findEntry, VERSION, runtimeRoot, repoRoot };
