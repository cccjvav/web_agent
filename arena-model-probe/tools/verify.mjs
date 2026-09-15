/**
 * verify.mjs — 一键全量验证（构建 → 单测 → 集成 → 冒烟）
 * 用法: node tools/verify.mjs
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const stages = [
  ['构建', 'build.mjs'],
  ['单元测试', 'selftest.mjs'],
  ['端到端集成测试', 'e2e.mjs'],
  ['启动冒烟测试', 'boot-smoke.mjs'],
];

let failed = 0;
for (const [label, script] of stages) {
  console.log(`\n${'━'.repeat(64)}\n▶ ${label}  (tools/${script})\n${'━'.repeat(64)}`);
  const r = spawnSync(process.execPath, [resolve(__dir, script)], { stdio: 'inherit' });
  if (r.status !== 0) { failed++; console.log(`\n✗ ${label} 失败 (exit ${r.status})`); }
  else console.log(`\n✓ ${label} 通过`);
}

console.log(`\n${'━'.repeat(64)}`);
console.log(failed ? `✗ 验证失败：${failed}/${stages.length} 阶段未通过` : `✓ 全部 ${stages.length} 个阶段通过`);
process.exit(failed ? 1 : 0);
