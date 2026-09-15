/**
 * boot-smoke.mjs — 完整 bundle 启动冒烟测试
 *
 * 为什么单独做：E2E 测的是 interceptor 模块；而用户实际拿到的是**打包产物**，
 * 走的是 main.js 的编排路径（装 HUD → 订阅 BUS → 判定 → 建档 → 暴露 API）。
 * 打包器的模块绑定、HUD 的 DOM 依赖、main.js 的顶层副作用都只在这条路径上暴露。
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(resolve(__dir, '..', 'dist', 'arena-model-probe.inject.js'), 'utf8');

/* ---------------- 浏览器 shim（比 E2E 更完整，含 HUD 所需 DOM） ---------------- */
function mkEl(tag = 'div') {
  const el = {
    tagName: tag, style: {}, id: '', className: '', _h: '',
    children: [], listeners: {},
    attachShadow() {
      this._shadow = mkShadow();
      return this._shadow;
    },
    appendChild(c) { this.children.push(c); return c; },
    remove() { if (this._parent) this._parent.children = this._parent.children.filter(x => x !== this); },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    removeEventListener() {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 }),
    closest: () => null,
    get innerHTML() { return this._h; },
    set innerHTML(v) { this._h = String(v); },
    get textContent() { return this._h; },
    set textContent(v) { this._h = String(v); },
  };
  return el;
}
function mkShadow() {
  const s = { children: [], listeners: {}, _h: '' };
  s.appendChild = (c) => { s.children.push(c); return c; };
  s.querySelector = () => null;
  s.querySelectorAll = () => [];
  s.addEventListener = (t, fn) => { (s.listeners[t] = s.listeners[t] || []).push(fn); };
  s.removeChild = () => {};
  return s;
}

const store = new Map();
const define = (k, v) => { try { Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true }); } catch { /* noop */ } };

define('localStorage', {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
});
define('performance', { now: () => Date.now() });
define('document', {
  readyState: 'complete',
  documentElement: mkEl('html'),
  createElement: mkEl,
  addEventListener() {},
  activeElement: null,
});
define('window', globalThis);
define('navigator', { clipboard: { writeText() {} } });
define('location', { href: 'https://arena.ai/agent' });
define('innerWidth', 1200);
define('XMLHttpRequest', class { open() {} send() {} addEventListener() {} });
define('WebSocket', class { constructor() {} addEventListener() {} });
define('EventSource', class { constructor() {} addEventListener() {} });
define('Response', globalThis.Response);
define('TextDecoder', globalThis.TextDecoder);
define('setInterval', globalThis.setInterval);
define('clearInterval', globalThis.clearInterval);

/* ---------------- 执行 bundle ---------------- */
const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

let evalOk = true, evalErr = null;
try { new Function(bundle)(); } catch (e) { evalOk = false; evalErr = e; }
console.error = origError;

/* ---------------- 断言 ---------------- */
let pass = 0, fail = 0;
const out = [];
function t(name, fn) {
  try { fn(); pass++; out.push(`  PASS  ${name}`); }
  catch (e) { fail++; out.push(`  FAIL  ${name}\n        ${e.message}`); }
}
const ok = (v, m) => { if (!v) throw new Error(m || '断言失败'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: 期望 ${JSON.stringify(b)}，实际 ${JSON.stringify(a)}`); };

const api = globalThis.__MODEL_PROBE__;

t('bundle 可执行且无未捕获异常', () => {
  ok(evalOk, `执行抛错: ${evalErr && evalErr.message}`);
});

t('bundle 启动时无内部错误（console.error 干净）', () => {
  ok(errors.length === 0, `出现错误: ${errors.join(' | ')}`);
});

t('main.js 暴露 window.__MODEL_PROBE__', () => {
  ok(api, '未暴露 API');
});

t('API 版本与关键方法齐备', () => {
  // 版本号形如 1.0.0+<8位内容哈希>（构建时盖章，用于页面内版本比对）
  ok(/^1\.0\.0(\+[0-9a-f]{8})?$/.test(api.version), `版本格式异常: ${api.version}`);
  for (const m of ['classify', 'observations', 'learned', 'export', 'probePack', 'canaries', 'reset', 'bus']) {
    ok(typeof api[m] === 'function' || typeof api[m] === 'object', `缺少 ${m}`);
  }
});

t('HUD 已挂载到 documentElement', () => {
  const html = globalThis.document.documentElement;
  ok(html.children.some(c => c.id === 'amp-hud'), '未找到 #amp-hud');
});

t('钩子已安装（fetch/XHR 均被包装）', () => {
  ok(globalThis.fetch && globalThis.fetch.__probeWrapped === true, 'fetch 未包装');
  ok(globalThis.XMLHttpRequest.__probeWrapped === true, 'XHR 未包装');
});

t('canaries 可运行且返回 5 组探针', () => {
  const pack = api.probePack();
  eq(pack.length, 5);
});

t('canaries 对样本文本产出证据', () => {
  const ev = api.canaries("I can't help with that. It's important to keep things constructive.");
  ok(Array.isArray(ev) && ev.length > 0, '应产出证据');
});

t('reset 可清空证据链', () => {
  api.bus.evidence.push({ source: 'test', weight: 1, modelId: 'gpt-6' });
  ok(api.bus.evidence.length > 0);
  api.reset();
  eq(api.bus.evidence.length, 0, 'reset 后证据应清空');
  eq(api.bus.observations.length, 0, 'reset 后观测应清空');
});

t('classify() 无证据时返回 UNKNOWN 而非崩溃', () => {
  const v = api.classify();
  eq(v.mode, 'UNKNOWN');
});

t('export() 产出合法 JSON', () => {
  const s = api.export();
  const o = JSON.parse(s);
  ok(Array.isArray(o.entries), 'entries 应为数组');
  ok(typeof o.version === 'string', '应含指纹库版本');
});

t('端到端：push 证据 → classify 得到 GPT-6', () => {
  api.bus.evidence.push({ source: 'request.body.model', weight: 1.0, modelId: 'gpt-6-turbo' });
  const v = api.classify();
  eq(v.mode, 'RESOLVED');
  eq(v.family, 'openai');
  eq(v.gen, 'gpt-6');
  ok(v.confidence > 0.9, `置信度 ${v.confidence}`);
  api.reset();
});

t('打包产物自包含（无残留 import/export）', () => {
  ok(!/\bimport\s*\{/.test(bundle), '含 import');
  ok(!/^\s*export\s+/m.test(bundle), '含 export');
  ok(bundle.includes('__mods'), '缺模块表');
});

/* ---------------- 真实模型名链路完整性 ---------------- */
// 实测踩过的坑：interceptor 会发 'stream-header' 事件，但 main.js 里
// 没有监听者，token 流到 BUS 就断了，导致永远拿不到真实模型名。

t('runmodel 模块已打包进产物', () => {
  ok(bundle.includes('runmodel'), '产物应含 runmodel 模块');
  ok(bundle.includes('extractModelLabels'), '应含模型标签提取函数');
  ok(bundle.includes('api.trigger.dev'), '应含 Trigger.dev API 地址');
});

t('main.js 监听了 stream-header（第一环不可断）', () => {
  // 这是关键断点：acceptToken 必须被 stream-header 事件驱动
  ok(/stream-header/.test(bundle), 'main.js 必须监听 stream-header 事件');
  ok(/acceptToken/.test(bundle), '必须调用 acceptToken');
  const m = bundle.match(/acceptToken/g);
  ok(m && m.length >= 2, `acceptToken 应有定义+调用，实际出现 ${m ? m.length : 0} 次`);
});

t('真实模型名到达时会触发重算', () => {
  // run-model 事件必须触发 recompute，否则 HUD 停在旧的"家族未知"结果。
  //
  // 注意定位方式：'run-model' 在产物里出现多次（runmodel.js 里有 emit，
  // main.js 里有处理）。必须定位【处理分支】而不是发射端 ——
  // 之前用 search() 取首次出现，命中的是 runmodel.js 的 emit，所以误报失败。
  const all = [];
  let i = -1;
  while ((i = bundle.indexOf('run-model', i + 1)) !== -1) all.push(i);
  ok(all.length >= 2, `run-model 应至少出现 2 次（emit + 处理），实际 ${all.length}`);

  // 处理分支的特征：附近含 recompute 与 recordRealModel
  const handled = all.some(pos => {
    const seg = bundle.slice(pos, pos + 1600);
    return /recompute/.test(seg) && /recordRealModel/.test(seg);
  });
  ok(handled, '必须存在同时调用 recompute 与 recordRealModel 的 run-model 处理分支');

  // 且必须同时处理 run-model-failed（否则失败时界面不给提示）
  ok(/run-model-failed/.test(bundle), '应处理 run-model-failed 事件');
});

t('API 暴露真实模型名相关接口', () => {
  for (const name of ['realModel', 'runState', 'fetchRunModels', 'realModels']) {
    ok(typeof api[name] === 'function', `API 应暴露 ${name}()`);
  }
});

t('API 的 realModel() 初始为空而不抛异常', () => {
  const r = api.realModel();
  ok(r === null || typeof r === 'string', 'realModel() 应返回 null 或字符串');
});

t('API 的 runState() 结构完整', () => {
  const s = api.runState();
  ok(s && typeof s === 'object', 'runState() 应返回对象');
  for (const k of ['token', 'runId', 'modelName', 'lastError', 'fetchCount']) {
    ok(k in s, `runState() 应含 ${k}`);
  }
});

t('API 的 extractFromTrace 能从真实 trace 提取模型名', () => {
  const frag = '{"message":"ai.streamText.doStream","style":{"icon":"hero-sparkles",'
    + '"accessory":{"style":"pills","items":['
    + '{"text":"qwen3.8-max-0902","icon":"tabler-cube"},'
    + '{"text":"7.0k","icon":"tabler-hash"}]}}}';
  const r = api.extractFromTrace(frag);
  ok(r && r.models && r.models.length === 1, '应提取 1 个模型');
  eq(r.models[0], 'qwen3.8-max-0902');
  eq(r.tokens[0], '7.0k');
});

/* ---------------- 报告 ---------------- */
console.log('\n=== arena-model-probe 启动冒烟测试 ===\n');
console.log(out.join('\n'));
console.log(`\n合计: ${pass} 通过 / ${fail} 失败 / ${pass + fail} 用例`);
// main.js 会注册 setInterval（匿名簇定时回填），在 Node 里会挂住事件循环，
// 必须显式退出，否则测试进程永不结束。
process.exit(fail ? 1 : 0);
