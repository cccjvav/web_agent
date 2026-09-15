#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_realname.py — 验证探针【自动显示真实模型名】（无需外部脚本）

目标：注入探针 → 发消息 → 探针自己完成「取 token → 读 trace → 显示模型名」，
      全程不需要 Python 侧干预。

验证点：
  1. 探针捕获到 public-access-token（stream-header 事件）
  2. 解出 run id
  3. 自动读取 trace 并提取模型标签
  4. verdict.modelId 是具体模型名（qwen3.8-max-0902 这类），不是 null
"""
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, evaluate, page_ready, inject_fresh,
                         kill_modals, submit_question, PROBE_VERSION, log)

OUT = Path(__file__).resolve().parent / "recon"

STATUS_JS = """(() => {
  const a = window.__MODEL_PROBE__;
  if (!a) return { error: 'probe-missing' };
  const rs = a.runState ? a.runState() : {};
  const v = a.classify();
  return {
    version: a.version,
    runId: rs.runId,
    tokenExp: rs.tokenExp,
    modelName: rs.modelName,
    lastError: rs.lastError,
    fetchCount: rs.fetchCount,
    history: (rs.modelHistory || []).map(h => ({ name: h.name, all: h.all, at: h.at })),
    verdict: v,
    evidence: (a.bus.evidence || []).map(e => ({
      source: e.source, modelId: e.modelId, family: e.family, weight: e.weight, detail: e.detail,
    })).slice(-14),
  };
})()"""


def main():
    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2

    import urllib.request as ur
    lst = json.loads(ur.urlopen("http://127.0.0.1:9222/json/list", timeout=6).read().decode())
    pages = [t for t in lst if t.get("type") == "page" and "arena.ai" in (t.get("url") or "")]
    if not pages:
        log("[!] 无 arena.ai 页面")
        return 2

    # 选页策略（实测踩过的坑）：多标签时若随机选页，可能落到
    #   ① 跑旧版探针的页面，或
    #   ② 编辑器不在的会话历史页
    # 都会导致误判为"拿不到模型名"。这里按可用性排序：
    #   1) 已持有真实模型名的页面（直接报告）
    #   2) 有编辑器的页面（可提问）
    scored = []
    for t in pages:
        score, note = 0, []
        try:
            c = CDP(t["webSocketDebuggerUrl"], timeout=30).connect()
            c.call("Runtime.enable")
            d = evaluate(c, """(() => {
              const a = window.__MODEL_PROBE__;
              return {
                ver: a ? a.version : null,
                real: a && a.realModel ? a.realModel() : null,
                ed: Boolean(document.querySelector('[contenteditable="true"]')),
              };
            })()""", timeout=20)
            c.close()
            if d.get("real"):
                score += 100
                note.append("已有真名")
            if d.get("ed"):
                score += 10
                note.append("有编辑器")
            if d.get("ver"):
                score += 1
                note.append("v" + str(d["ver"]))
        except Exception as e:
            note.append("读取失败")
        scored.append((score, t, " ".join(note)))

    scored.sort(key=lambda x: -x[0])
    for s, t, n in scored:
        log("  候选 [%3d] %s   %s" % (s, (t.get("url") or "")[-46:], n))

    page = scored[0][1]
    log("")
    log("[*] 选用: %s  (%s)" % (page.get("url"), scored[0][2]))

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=60).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")

        # 先探测当前是否已持有真名 —— 若有，无需编辑器也不需要提问。
        # （实测踩过的坑：会话历史页没有编辑器，但探针已解析出模型名，
        #   若一开始就要求"编辑器就绪"会直接退出，误报失败。）
        try:
            pre = evaluate(cdp, STATUS_JS, timeout=25)
        except Exception:
            pre = {}
        have_real = bool(pre.get("modelName"))

        if not have_real:
            if not page_ready(cdp, want_editor=True):
                log("[!] 页面未就绪（无编辑器且探针无真名）")
                return 3
        else:
            log("[*] 探针已持有真实模型名，跳过就绪检查")

        ok, info = inject_fresh(cdp)
        log("[*] 探针: %s   (期望 %s)" % (info, PROBE_VERSION))
        try:
            kill_modals(cdp)
        except Exception:
            pass

        # ---- 若有真名则直接报告；否则提问后轮询 ----
        if have_real:
            log("")
            log("  探针已持有真实模型名（无需重新提问）: %s" % pre["modelName"])
            final = pre
            skip_ask = True
        else:
            skip_ask = False

        if not skip_ask:
            log("")
            log("=" * 74)
            log("  1. 发消息（之后全部由探针自动完成）")
            log("=" * 74)
            ok, detail = submit_question(cdp, "什么是字典树？一句话。")
            log("  提交: %s" % detail)

            log("")
            log("  轮询探针状态（探针内部会自动取 token→读 trace→提取模型名）…")
            final = None
            for i in range(90):
                time.sleep(3)
                try:
                    st = evaluate(cdp, STATUS_JS, timeout=25)
                except Exception:
                    continue
                rn = st.get("modelName")
                v = st.get("verdict") or {}
                tag = "runId=%s fetch=%s model=%s verdict=%s" % (
                    (st.get("runId") or "-")[:28], st.get("fetchCount"),
                    rn or "-", v.get("modelId") or v.get("mode"))
                if i % 4 == 0 or rn:
                    log("     [%3ds] %s" % (i * 3, tag))
                if rn:
                    final = st
                    break
                final = st

        log("")
        log("=" * 74)
        log("  2. 探针状态")
        log("=" * 74)
        if not final:
            log("  [!] 未取得状态")
            return 4

        log("  探针版本   : %s" % final.get("version"))
        log("  runId      : %s" % (final.get("runId") or "-"))
        log("  token 过期 : %s" % (
            time.strftime("%H:%M:%S", time.localtime(final["tokenExp"] / 1000))
            if final.get("tokenExp") else "-"))
        log("  trace 读取 : %s 次" % final.get("fetchCount"))
        log("  lastError  : %s" % (final.get("lastError") or "无"))
        log("")
        log("  ★ 真实模型名: %s" % (final.get("modelName") or "（未取得）"))

        hist = final.get("history") or []
        if hist:
            log("")
            log("  历史记录:")
            for h in hist[-6:]:
                log("     %s   出现: %s" % (h.get("name"), ", ".join(h.get("all") or [])))

        v = final.get("verdict") or {}
        log("")
        log("=" * 74)
        log("  3. 判定结果（这是 HUD 上会显示的内容）")
        log("=" * 74)
        log("  模式     : %s" % v.get("mode"))
        log("  modelId  : %s" % (v.get("modelId") or "-"))
        log("  标签     : %s" % (v.get("label") or "-"))
        log("  家族     : %s" % (v.get("family") or "-"))
        log("  置信度   : %.1f%%" % ((v.get("confidence") or 0) * 100))

        log("")
        log("  证据链（最近）:")
        for e in (final.get("evidence") or [])[-10:]:
            log("     [%-20s] %-32s %s" % (
                e.get("source"), (e.get("modelId") or e.get("family") or "")[:32],
                (e.get("detail") or "")[:60]))

        # ---- 结论 ----
        log("")
        log("=" * 74)
        got_real = bool(final.get("modelName"))
        if got_real:
            log("  ✅ 探针已自动显示真实模型名: %s" % final["modelName"])
        else:
            log("  ⚠ 未取得真实模型名")
            log("     runId 是否取到: %s" % ("是" if final.get("runId") else "否"))
            log("     可能原因: 该 run 尚未执行模型调用 / trace 尚未写入标签")
        log("=" * 74)

        OUT.mkdir(exist_ok=True)
        (OUT / "realname-verify.json").write_text(
            json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")
        log("[*] 已写入 recon/realname-verify.json")
        return 0 if got_real else 6
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
