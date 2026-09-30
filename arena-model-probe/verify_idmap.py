#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_idmap.py — 在真实站点上验证 UUID → 模型名 还原能力

这是本轮逆向的落地验证：
  1. 注入最新探针
  2. 调用探针的 refreshMap()，看能否从排行榜 RSC 装载完整映射表
  3. 用已知 UUID 测试 resolve()，确认能还原成真实模型名
  4. 检查当前会话流量里是否出现过 UUID 形态的 modelId
     （若有 → 探针能自动还原；若无 → 印证 Agent Mode 确实不下发模型标识）
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, get_page, evaluate, page_ready,
                         inject_fresh, kill_modals, submit_question, PROBE_VERSION, log)

OUT = Path(__file__).resolve().parent / "recon"

# 已知的真实映射（来自 extract_model_map2.py 的提取结果）
KNOWN = [
    ("01a06ebf-809f-7e34-9abc-53b0fc8761a9", "gpt-6-astra-high"),
    ("019f9593-b5a9-7575-aff0-5971ff479f88", "claude-opus-5-max"),
    ("01a0681c-b561-76b6-b338-a44ff0cff460", "gemini-3.8-flash-high"),
    ("01a05e31-fc9d-76dc-b6bf-ab5b6781d4c3", "claude-fable-5.1-high"),
]

REFRESH_JS = """(async () => {
  const a = window.__MODEL_PROBE__;
  if (!a || !a.refreshMap) return { error: 'refreshMap-missing' };
  try {
    const r = await a.refreshMap();
    return { ok: true, loaded: r.loaded, pages: r.pages, stats: a.mapStats() };
  } catch (e) { return { error: String(e) }; }
})()"""

RESOLVE_JS = """(ids => {
  const a = window.__MODEL_PROBE__;
  if (!a || !a.resolve) return { error: 'resolve-missing' };
  return ids.map(([id, expect]) => {
    const r = a.resolve(id);
    return { id, expect, got: r ? r.name : null, org: r ? r.org : null, ok: r && r.name === expect };
  });
})"""

SCAN_JS = """(() => {
  const a = window.__MODEL_PROBE__;
  if (!a) return { error: 'probe-missing' };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ev = a.bus.evidence || [];
  const uuidEv = ev.filter(e => e.modelId && UUID.test(String(e.modelId).trim()));
  const namedEv = ev.filter(e => e.modelId && !UUID.test(String(e.modelId).trim()));
  return {
    totalEvidence: ev.length,
    uuidModelIds: uuidEv.map(e => ({ modelId: e.modelId, source: e.source, resolved: a.resolve(e.modelId) })),
    namedModelIds: namedEv.map(e => ({ modelId: e.modelId, source: e.source })).slice(0, 10),
    verdict: a.classify(),
    stats: a.mapStats(),
  };
})()"""


def main():
    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2

    # 必须切到对话页才能产生会话流量（排行榜页不会有聊天请求）
    import urllib.request as ur
    try:
        targets = json.loads(ur.urlopen("http://127.0.0.1:9222/json/list", timeout=6).read().decode())
    except Exception as e:
        log("[!] 无法列出标签页: %s" % e)
        return 2

    pages = [t for t in targets if t.get("type") == "page"]
    chat = next((t for t in pages
                 if "/agent/" in t.get("url", "")
                 or t.get("url", "").rstrip("/").endswith("/agent")), None)

    if not chat:
        log("[*] 没有对话页，新开 /agent …")
        try:
            chat = json.loads(ur.urlopen(
                "http://127.0.0.1:9222/json/new?https://arena.ai/agent", timeout=15).read().decode())
            time.sleep(8)
        except Exception as e:
            log("[!] 无法新开页面: %s" % e)
            return 2

    page = chat
    log("[*] 页面: %s" % page.get("url"))

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=90).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        page_ready(cdp, want_editor=True)

        ok, info = inject_fresh(cdp)
        log("[*] 探针: %s   (期望 %s)" % (info, PROBE_VERSION))
        if PROBE_VERSION not in info:
            log("[!] 探针版本不匹配，后续结果不可信")
        try:
            kill_modals(cdp)
        except Exception:
            pass

        # ---- 1. 装载映射表 ----
        log("")
        log("=" * 74)
        log("  1. 调用 refreshMap() 装载 UUID → 模型名 映射表")
        log("=" * 74)
        try:
            r = evaluate(cdp, REFRESH_JS, await_promise=True, timeout=120)
        except Exception as e:
            log("  失败: %s" % e)
            r = {"error": str(e)}

        if r.get("error"):
            log("  [!] %s" % r["error"])
        else:
            st = r.get("stats") or {}
            log("  ★ 装载成功：%d 条映射 / %d 个唯一名字 / 来源 %s" % (
                r.get("loaded", 0), st.get("names", 0), st.get("source")))
            log("     扫描页面数: %s" % r.get("pages"))

        # ---- 2. 验证还原 ----
        log("")
        log("=" * 74)
        log("  2. UUID → 模型名 还原验证（对照 extract_model_map2.py 的提取结果）")
        log("=" * 74)
        try:
            res = evaluate(cdp, RESOLVE_JS, await_promise=False, timeout=30) if False else None
            # 需要传参，改用拼装表达式
            expr = "(ids => { const a = window.__MODEL_PROBE__; if (!a || !a.resolve) return []; " \
                   "return ids.map(([id, expect]) => { const r = a.resolve(id); " \
                   "return { id, expect, got: r ? r.name : null, org: r ? r.org : null, ok: !!(r && r.name === expect) }; }); })(%s)" % json.dumps(KNOWN)
            res = evaluate(cdp, expr, timeout=30)
        except Exception as e:
            log("  失败: %s" % e)
            res = []

        passed = 0
        for x in (res or []):
            mark = "✓" if x.get("ok") else "✗"
            if x.get("ok"):
                passed += 1
            log("  %s %s  ->  %-26s (期望 %s) [%s]" % (
                mark, x.get("id"), x.get("got"), x.get("expect"), x.get("org")))
        log("")
        log("  还原成功率: %d/%d" % (passed, len(KNOWN)))

        # ---- 3. 扫描当前会话流量 ----
        log("")
        log("=" * 74)
        log("  3. 当前 Agent Mode 会话流量中的 modelId 形态")
        log("=" * 74)
        try:
            scan = evaluate(cdp, SCAN_JS, timeout=30)
        except Exception as e:
            log("  失败: %s" % e)
            scan = {}

        log("  证据总数: %s" % scan.get("totalEvidence"))
        uuid_ids = scan.get("uuidModelIds") or []
        named_ids = scan.get("namedModelIds") or []
        log("  UUID 形态的 modelId: %d 个" % len(uuid_ids))
        for u in uuid_ids[:8]:
            rv = u.get("resolved") or {}
            log("     %s [%s] -> %s" % (u.get("modelId"), u.get("source"), rv.get("name") or "(未在映射表)"))
        log("  具名形态的 modelId: %d 个" % len(named_ids))
        for n in named_ids[:8]:
            log("     %s [%s]" % (n.get("modelId"), n.get("source")))

        v = scan.get("verdict") or {}
        log("")
        log("  当前判定: %s / 家族 %s / 置信 %.1f%%" % (
            v.get("mode"), v.get("family") or "-", (v.get("confidence") or 0) * 100))

        # ---- 4. 主动提问，看是否产生 UUID ----
        log("")
        log("=" * 74)
        log("  4. 主动发一条消息，检查是否出现 UUID 形态的 modelId")
        log("=" * 74)
        ok, detail = submit_question(cdp, "什么是红黑树？一句话。")
        log("  提交: %s" % detail)
        if ok:
            for i in range(40):
                time.sleep(1.5)
                try:
                    scan2 = evaluate(cdp, SCAN_JS, timeout=20)
                except Exception:
                    continue
                if (scan2.get("totalEvidence") or 0) > (scan.get("totalEvidence") or 0):
                    if i > 6:
                        break
            uuid2 = scan2.get("uuidModelIds") or []
            named2 = scan2.get("namedModelIds") or []
            log("  提问后：UUID 形态 %d 个 / 具名形态 %d 个" % (len(uuid2), len(named2)))
            for u in uuid2[:8]:
                rv = u.get("resolved") or {}
                log("     ★ %s [%s] -> %s" % (u.get("modelId"), u.get("source"), rv.get("name")))
            for n in named2[:8]:
                log("     ★ %s [%s]" % (n.get("modelId"), n.get("source")))
            v2 = scan2.get("verdict") or {}
            log("  判定: %s / 家族 %s / 置信 %.1f%%" % (
                v2.get("mode"), v2.get("family") or "-", (v2.get("confidence") or 0) * 100))

        # ---- 汇总 ----
        summary = {
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "probeVersion": PROBE_VERSION,
            "mapLoad": r,
            "resolveTests": res,
            "resolvePassed": passed,
            "sessionScan": scan,
        }
        OUT.mkdir(exist_ok=True)
        (OUT / "idmap-verify.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

        log("")
        log("=" * 74)
        log("  结论")
        log("=" * 74)
        if r.get("loaded"):
            log("  ✓ 映射表可用：%d 条 UUID → 模型名" % r["loaded"])
        else:
            log("  ✗ 映射表装载失败")
        log("  %s UUID 还原：%d/%d" % ("✓" if passed == len(KNOWN) else "✗", passed, len(KNOWN)))
        log("  %s Agent Mode 会话中的 UUID modelId：%d 个" % (
            "有" if uuid_ids else "无", len(uuid_ids)))
        log("")
        log("[*] 已写入 recon/idmap-verify.json")
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
