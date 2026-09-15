/**
 * cdp-inspect.mjs — 把探针注入到真实浏览器并输出判定结果
 *
 * 为什么需要它：单元/集成测试证明逻辑正确，但"arena.ai 上到底能不能用"
 * 只能在真实浏览器里验证。本脚本走 Chrome DevTools Protocol
 * （Node 24 内置 WebSocket，无需 puppeteer / playwright）。
 *
 * 用法：
 *   1) 启动带调试端口的 Chrome：
 *      chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\amp-chrome
 *   2) 在该 Chrome 里打开 https://arena.ai/agent 并手动发一条消息
 *   3) node tools/cdp-inspect.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const PORT = process.env.AMP_CDP_PORT || 9222;
const TARGET_URL_MATCH = process.env.AMP_URL_MATCH || 'arena.ai';

const bundle = readFileSync(resolve(ROOT, 'dist', 'arena-model-probe.inject.js'), 'utf8');

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  if (!res.ok) throw new Error(`无法访问 CDP（HTTP ${res.status}）。Chrome 是否带 --remote-debugging-port=${PORT} 启动？`);
  return res.json();
}

/** 极简 CDP 客户端（Node 内置 WebSocket） */
class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((ok, err) => {
      this.ws.addEventListener('open', ok, { once: true });
      this.ws.addEventListener('error', () => err(new Error('WebSocket 连接失败')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, err } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? err(new Error(JSON.stringify(msg.error))) : ok(msg.result);
      } else if (msg.method) {
        const hs = this.handlers.get(msg.method);
        if (hs) for (const h of hs) { try { h(msg.params); } catch { /* noop */ } }
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, err) => {
      this.pending.set(id, { ok, err });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); err(new Error(`CDP 超时: ${method}`)); } }, 20000);
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

async function evaluate(cdp, expr, { awaitPromise = true } = {}) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise, allowUnsafeEvalBlockedByCSP: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  }
  return r.result?.value;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log('=== arena-model-probe · 真实浏览器实测 ===\n');

  let targets;
  try { targets = await listTargets(); }
  catch (e) { console.error(`[!] ${e.message}`); process.exit(1); }

  const pages = targets.filter(t => t.type === 'page' && /^https?:/.test(t.url));
  if (!pages.length) { console.error('[!] 没有可用的页面目标'); process.exit(1); }

  const page = pages.find(p => p.url.includes(TARGET_URL_MATCH)) || pages[0];
  console.log(`目标页面: ${page.title || '(无标题)'}`);
  console.log(`URL: ${page.url}`);
  if (!page.url.includes(TARGET_URL_MATCH)) {
    console.log(`[提示] 未找到匹配 "${TARGET_URL_MATCH}" 的页面，使用第一个页面。`);
  }

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  // 收集控制台输出（探针日志）
  const logs = [];
  cdp.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args || []).map(a => a.value ?? a.description ?? '').join(' ');
    if (text) logs.push(text);
  });

  // 1) 检查是否已装
  const already = await evaluate(cdp, 'Boolean(window.__MODEL_PROBE__)').catch(() => false);
  if (already) {
    console.log('\n[状态] 探针已在页面中运行，跳过注入。');
  } else {
    // 注入前刷新到 document-start 语义：先装钩子，再让页面继续
    console.log('\n[1/4] 注入探针…');
    const res = await evaluate(cdp, `(function(){ try { ${bundle}\n return 'injected'; } catch(e){ return 'ERR: '+e.message; } })()`);
    console.log(`      → ${res}`);
    if (res !== 'injected') { console.error('[!] 注入失败'); cdp.close(); process.exit(1); }

    console.log('[2/4] 重新加载页面以使钩子先于页面代码生效…');
    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(6000);
    const urlNow = await evaluate(cdp, 'location.href').catch(() => '?');
    console.log(`      → 已加载 ${urlNow}`);

    console.log('[3/4] 重新注入（reload 后钩子已最早安装）…');
    await evaluate(cdp, `(function(){ try { ${bundle}\n return 1; } catch(e){ return 0; } })()`);
  }

  // 2) 等页面产出观测
  console.log('\n[4/4] 等待对话流量（最多 90 秒）…');
  console.log('      请在页面里发一条消息。');
  let snapshot = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    snapshot = await evaluate(cdp, `(function(){
      var a = window.__MODEL_PROBE__;
      if (!a) return { error: 'api-missing' };
      return {
        evidence: a.bus.evidence.map(function(e){ return { source:e.source, modelId:e.modelId, family:e.family, weight:e.weight, detail:e.detail, url:e.url, slot:e.slot }; }),
        observations: a.bus.observations.map(function(o){ return { url:o.url, ttftMs:o.ttftMs, totalMs:o.totalMs, chunks:o.chunks, promptTokens:o.promptTokens, completionTokens:o.completionTokens, modelSeen:o.modelSeen, frames:o.frames }; }),
        verdict: a.classify(),
        learned: a.learned().map(function(e){ return { resolved:e.resolved, status:e.status, family:e.family, count:e.count }; }),
        url: location.href,
      };
    })()`).catch(e => ({ error: e.message }));

    if (snapshot && snapshot.verdict && snapshot.verdict.mode !== 'UNKNOWN') break;
    if (i % 10 === 9) console.log(`      … 已等 ${i + 1}s（证据 ${snapshot?.evidence?.length ?? 0} 条）`);
  }

  console.log('\n--- 判定结果 ---');
  if (!snapshot || snapshot.error) {
    console.error(`[!] 未能取到结果: ${snapshot && snapshot.error}`);
    console.error('    可能原因：页面未发消息 / 探针注入前页面已加载（需 reload）/ CSP 限制。');
    cdp.close();
    process.exit(2);
  }

  const v = snapshot.verdict;
  console.log(`模式:     ${v.mode}`);
  console.log(`模型:     ${v.label || v.modelId || '(未识别)'}`);
  console.log(`modelId:  ${v.modelId || '-'}`);
  console.log(`家族:     ${v.family || '-'}    代际: ${v.gen || '-'}`);
  console.log(`置信度:   ${(v.confidence * 100).toFixed(1)}%`);
  if (v.note) console.log(`说明:     ${v.note}`);

  console.log(`\n证据链 (${snapshot.evidence.length} 条，显示最近 12 条):`);
  for (const e of snapshot.evidence.slice(-12)) {
    console.log(`  [${e.source}] ${e.modelId || e.family || ''} ${e.detail || ''}`.trim());
  }

  if (snapshot.observations.length) {
    const o = snapshot.observations[snapshot.observations.length - 1];
    console.log(`\n最近一次响应: TTFT ${o.ttftMs}ms / 总 ${o.totalMs}ms / ${o.chunks} chunks / in ${o.promptTokens ?? '?'} out ${o.completionTokens ?? '?'}`);
    if (o.frames && o.frames.length) console.log(`帧类型: ${o.frames.join(', ')}`);
  }

  if (snapshot.learned.length) {
    console.log(`\n指纹库 (${snapshot.learned.length} 条):`);
    for (const e of snapshot.learned.slice(-8)) {
      console.log(`  ${e.status.padEnd(13)} ${e.resolved || '(匿名簇)'} ×${e.count}`);
    }
  }

  console.log('\n浏览器控制台日志（探针）:');
  for (const l of logs.slice(-10)) console.log(`  ${l}`);

  cdp.close();
  console.log('\n完成。');
})().catch(e => { console.error('[!] 未捕获错误:', e.message); process.exit(1); });
