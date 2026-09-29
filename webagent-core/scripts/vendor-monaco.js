#!/usr/bin/env node
'use strict';
// Copies the Monaco Editor "min" build into webagent-core/workbench/vendor/monaco so the workbench
// serves its own editor (F101, review P1-1): no script from a CDN inside the local control plane,
// no network at page load, and a Content-Security-Policy that only allows 'self'.
//
// Usage:  node webagent-core/scripts/vendor-monaco.js [--check]
//   default  download monaco-editor@<VERSION> with `npm pack`, verify its sha512 against the value
//            pinned below, replace vendor/monaco with the files listed in VERSION.json.
//   --check  only verify that the vendored tree matches VERSION.json (used by tests; no network).
//
// Upgrading: change VERSION and INTEGRITY together (`npm view monaco-editor@x.y.z dist.integrity`),
// run the script, run the monaco/workbench tests, and update MONACO_VERSION in workbench/js/monaco.js.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const VERSION = '0.52.2';
const INTEGRITY = 'sha512-GEQWEZmfkOGLdd3XK8ryrfWz3AIP8YymVXiPHEdewrUq7mh0qrKrfHLNCXcbB6sTnMLnOZ3ztSiKcciFUkIJwQ==';
// Only the UI language the workbench uses; the other nls bundles are dead weight in this product.
const OMIT = /^vs\/nls\.messages\.(?!zh-cn\.js$)[a-z-]+\.js$/;
const TARGET = path.resolve(__dirname, '../workbench/vendor/monaco');

function sha512(file) {
  return 'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}
function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function listFiles(root, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
function run(command, args, options) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${(result.stderr || '').trim()}`);
  return result.stdout;
}

function check() {
  const manifestFile = path.join(TARGET, 'VERSION.json');
  if (!fs.existsSync(manifestFile)) throw new Error('vendor/monaco/VERSION.json is missing; run vendor-monaco.js');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.version !== VERSION || manifest.integrity !== INTEGRITY) throw new Error('vendor/monaco was produced from a different monaco-editor release than this script pins');
  const present = listFiles(TARGET).filter(rel => rel !== 'VERSION.json');
  const expected = Object.keys(manifest.files).sort();
  const missing = expected.filter(rel => !present.includes(rel)), extra = present.filter(rel => !expected.includes(rel));
  if (missing.length || extra.length) throw new Error(`vendor/monaco differs from VERSION.json (missing ${missing.length}, unexpected ${extra.length}): ${[...missing, ...extra].slice(0, 5).join(', ')}`);
  for (const rel of expected) {
    if (sha256(path.join(TARGET, rel)) !== manifest.files[rel]) throw new Error(`vendor/monaco/${rel} does not match VERSION.json`);
  }
  return { version: manifest.version, files: expected.length };
}

function vendor() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'monaco-vendor-'));
  try {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npm, ['pack', `monaco-editor@${VERSION}`, '--pack-destination', tmp, '--silent'], { cwd: tmp, shell: process.platform === 'win32' });
    const tarball = path.join(tmp, `monaco-editor-${VERSION}.tgz`);
    const actual = sha512(tarball);
    if (actual !== INTEGRITY) throw new Error(`Refusing to vendor: tarball integrity ${actual} does not match the pinned ${INTEGRITY}`);
    run('tar', ['-xzf', tarball, '-C', tmp, 'package/min/vs', 'package/LICENSE', 'package/ThirdPartyNotices.txt', 'package/package.json']);
    const pkg = JSON.parse(fs.readFileSync(path.join(tmp, 'package/package.json'), 'utf8'));
    if (pkg.name !== 'monaco-editor' || pkg.version !== VERSION) throw new Error('Unexpected package contents');
    const staged = path.join(tmp, 'staged');
    fs.mkdirSync(path.join(staged, 'vs'), { recursive: true });
    const files = {};
    for (const rel of listFiles(path.join(tmp, 'package/min'))) {
      if (!rel.startsWith('vs/') || OMIT.test(rel)) continue;
      const dest = path.join(staged, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(tmp, 'package/min', rel), dest);
      files[rel] = sha256(dest);
    }
    for (const [from, to] of [['package/LICENSE', 'LICENSE.txt'], ['package/ThirdPartyNotices.txt', 'ThirdPartyNotices.txt']]) {
      fs.copyFileSync(path.join(tmp, from), path.join(staged, to));
      files[to] = sha256(path.join(staged, to));
    }
    const manifest = { name: 'monaco-editor', version: VERSION, integrity: INTEGRITY, source: `https://registry.npmjs.org/monaco-editor/-/monaco-editor-${VERSION}.tgz`,
      subset: 'min/vs (AMD build) without the non zh-cn nls bundles, plus LICENSE.txt and ThirdPartyNotices.txt', license: pkg.license,
      vendoredAt: new Date().toISOString(), fileCount: Object.keys(files).length, files };
    fs.writeFileSync(path.join(staged, 'VERSION.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.rmSync(TARGET, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(TARGET), { recursive: true });
    fs.cpSync(staged, TARGET, { recursive: true });
    return { version: VERSION, files: manifest.fileCount };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

if (require.main === module) {
  try {
    const result = process.argv.includes('--check') ? check() : vendor();
    console.log(`monaco-editor ${result.version}: ${result.files} files in ${path.relative(process.cwd(), TARGET) || '.'} ${process.argv.includes('--check') ? 'verified' : 'vendored'}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { VERSION, INTEGRITY, TARGET, check, vendor };
