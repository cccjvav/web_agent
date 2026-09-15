/**
 * build.mjs — 极简 ESM → 单文件打包器（无外部依赖）
 *
 * 为什么自己写：本机没有 esbuild/rollup，而探针必须是"单文件可注入"
 * （userscript 或 CDP Runtime.evaluate 都需要自包含）。本打包器只处理
 * 本项目实际用到的三种语法：import{...}from、export const/function/class、export{...}。
 * 一旦遇到超出范围的新语法会直接报错，而不是静默产出坏包。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = resolve(ROOT, 'src');
const DIST = resolve(ROOT, 'dist');

const ENTRY = 'main.js';
const MODULES = ['registry.js', 'classify.js', 'interceptor.js', 'idmap.js', 'runmodel.js', 'learned.js', 'probe.js', 'ui.js', 'main.js'];

const idOf = (file) => basename(file, '.js');

/* ------------------------------------------------------------------ *
 * 构建指纹：对全部源码做内容哈希，作为版本号的一部分。
 *
 * 为什么必须这么做：实测踩过一个坑——改了探针代码但没改版本号，
 * 页面里跑的旧实例被判定为「版本相同」而跳过注入，导致新指纹不生效，
 * 排查了很久。用内容哈希后，只要源码有任何变化，版本号必然改变，
 * 版本比对就永远不会误判。
 * ------------------------------------------------------------------ */
function sourceFingerprint() {
  const h = createHash('sha256');
  for (const m of MODULES) {
    h.update(m);
    h.update(readFileSync(resolve(SRC, m)));
  }
  return h.digest('hex').slice(0, 8);
}

/* ------------------------------------------------------------------ *
 * 单模块转换
 * ------------------------------------------------------------------ */
function transform(file, code) {
  const exports = new Set();
  let out = code;
  const imports = [];   // [{ from, names: [[imported, local]] }]

  // 1) 处理 import { a, b as c } from './x.js';
  out = out.replace(
    /^\s*import\s*\{([^}]+)\}\s*from\s*['"]\.\/([\w.-]+)['"];?\s*$/gm,
    (_, names, from) => {
      const pairs = names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(\w+)\s+as\s+(\w+)$/);
        return m ? [m[1], m[2]] : [s, s];
      });
      imports.push({ from, names: pairs });
      return '';
    }
  );

  // 2) 处理 export { a, b };  （含 re-export）
  out = out.replace(/^\s*export\s*\{([^}]+)\}\s*;?\s*$/gm, (_, names) => {
    names.split(',').map(s => s.trim()).filter(Boolean).forEach(s => {
      const m = s.match(/^(\w+)\s+as\s+(\w+)$/);
      exports.add(m ? m[2] : s);
      if (m && m[1] !== m[2]) out += `\nvar ${m[2]} = ${m[1]};`;
    });
    return '';
  });

  // 3) 处理 export const|let|var|function|class|async function
  out = out.replace(/^\s*export\s+(const|let|var|function|async\s+function|class)\s+(\w+)/gm, (_, kw, name) => {
    exports.add(name);
    return `${kw} ${name}`;
  });

  // 残留 export 说明有未支持的语法 → 明确失败
  const leftover = out.match(/^\s*export\s+/m);
  if (leftover) {
    throw new Error(`[build] ${file}: 出现打包器不支持的 export 语法: ${leftover[0].trim()}`);
  }

  return { code: out, exports: [...exports], imports };
}

/* ------------------------------------------------------------------ *
 * 打包
 * ------------------------------------------------------------------ */
function build({ banner = '', expose = null, fingerprint = null } = {}) {
  const records = [];
  for (const m of MODULES) {
    const file = resolve(SRC, m);
    if (!existsSync(file)) throw new Error(`[build] 缺少模块 ${m}`);
    let code = readFileSync(file, 'utf8');
    // 版本戳必须在 transform 之前做：transform 会剥掉 export 关键字，
    // 之后再去匹配 "export const VERSION = ..." 就永远匹配不到了
    // （实测踩过：产物里版本号仍是 1.0.0，导致页面版本比对失效）。
    if (fingerprint && m === 'main.js') {
      const before = code;
      code = code.replace(/export const VERSION = '[^']*';/, `export const VERSION = '1.0.0+${fingerprint}';`);
      if (code === before) {
        throw new Error('[build] 未能替换 main.js 的 VERSION 常量，请检查源码写法');
      }
    }
    const t = transform(m, code);
    records.push({ id: idOf(m), ...t });
  }

  const parts = [];
  parts.push('(function () {');
  parts.push('"use strict";');
  parts.push('var __mods = {}, __cache = {};');
  parts.push('function __req(id) {');
  parts.push('  if (__cache[id]) return __cache[id].exp;');
  parts.push('  var m = __mods[id]; if (!m) throw new Error("module not found: " + id);');
  parts.push('  var exp = {}; __cache[id] = { exp: exp };');
  parts.push('  m.fn(exp);');
  parts.push('  return exp;');
  parts.push('}');

  for (const r of records) {
    const bindLines = [];
    for (const imp of r.imports) {
      const target = idOf(imp.from);
      for (const [imported, local] of imp.names) {
        bindLines.push(`  var ${local} = __req(${JSON.stringify(target)}).${imported};`);
      }
    }
    // 导出赋值
    const assign = r.exports.map(n => `  exp.${n} = ${n};`).join('\n');
    // 自引用（模块内使用自身导出名）已由声明本身提供，无需额外处理
    parts.push(`__mods[${JSON.stringify(r.id)}] = { fn: function (exp) {`);
    parts.push(bindLines.join('\n'));
    parts.push(r.code);
    parts.push(assign);
    parts.push('} };');
  }

  parts.push('  try { __req(' + JSON.stringify(idOf(ENTRY)) + '); }');
  parts.push('  catch (e) { console.error("[amp] boot failed:", e); }');
  parts.push('})();');

  const body = parts.filter(Boolean).join('\n');
  return `${banner}\n${body}\n`;
}

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

const FP = sourceFingerprint();

const US_HEADER = `// ==UserScript==
// @name         Arena Model Probe · 模型探针
// @namespace    local.amp
// @version      1.0.0.${FP}
// @description  汇总页面模型标识与协议线索（启发式候选，不是后台模型身份认证）
// @author       local
// @match        *://arena.ai/*
// @match        *://*.arena.ai/*
// @match        *://lmarena.ai/*
// @match        *://chat.lmsys.org/*
// @match        *://*.openrouter.ai/*
// @match        *://chatgpt.com/*
// @match        *://claude.ai/*
// @match        *://gemini.google.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==`;

const userscript = build({ banner: US_HEADER, fingerprint: FP });
writeFileSync(resolve(DIST, 'arena-model-probe.user.js'), userscript, 'utf8');

const plain = build({ banner: `/* arena-model-probe v1.0.0+${FP} — 单文件注入版 (CDP / DevTools Snippet) */`, fingerprint: FP });
writeFileSync(resolve(DIST, 'arena-model-probe.inject.js'), plain, 'utf8');

// 自检：产物里必须能读到盖章后的版本号
const stamped = plain.match(/VERSION = '(1\.0\.0\+[0-9a-f]+)'/);
if (!stamped || stamped[1] !== `1.0.0+${FP}`) {
  throw new Error(`[build] 版本戳校验失败：期望 1.0.0+${FP}，产物中为 ${stamped ? stamped[1] : '未找到'}`);
}

// 供 Python 驱动器读取，确保它注入的是「当前构建」而不是旧产物
writeFileSync(resolve(DIST, 'build-info.json'), JSON.stringify({
  version: `1.0.0+${FP}`,
  fingerprint: FP,
  builtAt: new Date().toISOString(),
  bytes: { userscript: Buffer.byteLength(userscript, 'utf8'), inject: Buffer.byteLength(plain, 'utf8') },
}, null, 2), 'utf8');

console.log(`[build] dist/arena-model-probe.user.js   ${Buffer.byteLength(userscript, 'utf8')} bytes`);
console.log(`[build] dist/arena-model-probe.inject.js ${Buffer.byteLength(plain, 'utf8')} bytes`);
console.log(`[build] 构建指纹 ${FP}  (version 1.0.0+${FP})  ✓ 已盖入产物`);
console.log('[build] ok');
