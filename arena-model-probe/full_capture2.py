#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
full_capture2.py — 从页面内探针取【完整】流文本做穷举搜索

为什么不再用 CDP Network 抓 /out：
  /out 是长连接（SSE 持续推送），Network.loadingFinished 要等连接关闭才触发，
  而连接在整个会话期间保持打开 → 抓不到 body（实测：只拿到 472 字节杂项）。
  页面内探针的 SSETap 是逐块累积的，天然不受此限制，才是正确的数据源。

本脚本：
  1. 取页面内探针保存的完整观测文本
  2. 穷举搜索模型线索（键名 / 品牌 / 代号）
  3. 与 MITM 同等甚至更强的保真度（明文、无解密损耗）
"""
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, get_page, evaluate, page_ready,
                         inject_fresh, kill_modals, submit_question, log)

RECON = Path(__file__).resolve().parent / "recon"
RECON.mkdir(exist_ok=True)

KEY_HINT = re.compile(
    r"model|provider|harness|engine|deployment|backend|upstream|"
    r"slug|variant|snapshot|organization|vendor|family|"
    r"billing|cost|price|tier|capability",
    re.I)

BRAND = re.compile(
    r"\b(gpt[-\s]?[0-9][\w.\-]{0,24}|chatgpt[\w.\-]*|claude[\w.\-]{1,40}|"
    r"gemini[\w.\-]{1,40}|grok[\w.\-]{1,30}|deepseek[\w.\-]{1,40}|"
    r"qwen[\w.\-]{1,30}|kimi[\w.\-]{1,30}|glm[\w.\-]{1,30}|llama[\w.\-]{1,30}|"
    r"mistral[\w.\-]{1,30}|doubao[\w.\-]{1,30}|minimax[\w.\-]{1,30}|"
    r"hunyuan[\w.\-]{1,30}|ernie[\w.\-]{1,30}|step[-\s]?[0-9][\w.\-]{0,20}|"
    r"seed[-\s]?[0-9][\w.\-]{0,20}|nemotron[\w.\-]{0,24}|command[-\s]?[ar][\w.\-]{0,16}|"
    r"astra|luna|sol|terra|fable|mythos)\b",
    re.I)

# 取出全部观测的完整文本 + 同时收集全部证据
DUMP_JS = """(() => {
  const a = window.__MODEL_PROBE__;
  if (!a) return { error: 'probe-missing' };
  const obs = a.bus.observations || [];
  return {
    count: obs.length,
    texts: obs.map(o => o.text || ''),
    urls: obs.map(o => o.url || ''),
    events: obs.map(o => o.events || []),
    frames: obs.map(o => o.frames || []),
    modelSeen: obs.map(o => o.modelSeen || null),
    evidence: a.bus.evidence.map(e => ({source:e.source, modelId:e.modelId,
                family:e.family, weight:e.weight, detail:e.detail})),
    verdict: a.classify(),
  };
})()"""


def unwrap_all(text):
    """展开 realtime batch 的嵌套 body，产出可搜索文本集合"""
    outs = [text]
    for m in re.finditer(r'"body"\s*:\s*"((?:[^"\\]|\\.)*)"', text):
        raw = m.group(1)
        try:
            inner = json.loads('"' + raw + '"')
            outs.append(inner)
            try:
                obj = json.loads(inner)
                outs.append(json.dumps(obj, ensure_ascii=False))
            except Exception:
                pass
        except Exception:
            outs.append(raw)
    return "\n".join(outs)


def main():
    question = sys.argv[1] if len(sys.argv) > 1 else "什么是二叉搜索树？一句话。"

    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2
    page = get_page()
    if not page:
        log("[!] 无页面")
        return 2

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=60).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")

        page_ready(cdp, want_editor=True)
        ok, info = inject_fresh(cdp)
        log("[*] 探针: %s" % info)
        try:
            kill_modals(cdp)
        except Exception:
            pass

        try:
            before = evaluate(cdp, "window.__MODEL_PROBE__.bus.observations.length", timeout=15)
        except Exception:
            before = 0

        log("[*] 提问: %s" % question)
        ok, detail = submit_question(cdp, question)
        log("[*] 提交: %s" % detail)

        # 等新观测出现并稳定
        log("[*] 等待流式响应完成…")
        stable = 0
        last_len = -1
        for i in range(90):
            time.sleep(2)
            try:
                d = evaluate_soft_len(cdp)
            except Exception:
                continue
            if d["count"] > before:
                if d["len"] == last_len:
                    stable += 1
                    if stable >= 3:
                        break
                else:
                    stable = 0
                    last_len = d["len"]
                if i % 5 == 0:
                    log("    [%ds] 观测 %d / 文本 %d 字符" % (i * 2, d["count"], d["len"]))

        dump = evaluate_soft(cdp)
        if not dump or dump.get("error"):
            log("[!] 取探针数据失败: %s" % (dump or {}).get("error"))
            return 3

        raw = "\n".join(dump.get("texts") or [])
        flat = unwrap_all(raw)

        log("")
        log("=" * 74)
        log("  全保真捕获（数据源：页面内探针逐块累积，不受长连接影响）")
        log("=" * 74)
        log("  观测数 %d / 原始 %d 字节 / 展开 %d 字节" % (dump.get("count"), len(raw), len(flat)))
        log("  流 URL: %s" % ((dump.get("urls") or ["-"])[-1])[:110])
        log("  事件   : %s" % ", ".join((dump.get("events") or [[]])[-1]))
        log("  协议帧 : %s" % ", ".join((dump.get("frames") or [[]])[-1]))

        # 1) 键名
        log("")
        log("  --- 1. 可能的模型相关键名 ---")
        keys = Counter(m.group(1) for m in re.finditer(r'"([A-Za-z_][\w]*)"\s*:', flat))
        hits = {k: v for k, v in keys.items() if KEY_HINT.search(k)}
        if hits:
            for k, v in sorted(hits.items(), key=lambda x: -x[1]):
                log("     %-30s ×%d" % (k, v))
        else:
            log("     （无）")

        # 2) 品牌
        log("")
        log("  --- 2. 品牌 / 内部代号 ---")
        brands = Counter(m.group(1).lower() for m in BRAND.finditer(flat))
        qw = set(re.findall(r"[A-Za-z]+", question.lower()))
        brands = {k: v for k, v in brands.items() if k not in qw}
        if brands:
            for k, v in sorted(brands.items(), key=lambda x: -x[1]):
                log("     %-30s ×%d" % (k, v))
        else:
            log("     （未出现任何模型名或代号）")

        # 3) 全部键 top
        log("")
        log("  --- 3. 出现最多的键名（top 40）---")
        for k, v in keys.most_common(40):
            log("     %-30s ×%d" % (k, v))

        # 4) 探针证据与判定
        log("")
        log("  --- 4. 探针证据与判定 ---")
        for e in (dump.get("evidence") or []):
            log("     [%-20s] %-22s %s" % (
                e.get("source"), e.get("modelId") or e.get("family") or "",
                (e.get("detail") or "")[:60]))
        v = dump.get("verdict") or {}
        log("")
        log("     判定: %s / 家族 %s / 置信 %.1f%%" % (
            v.get("mode"), v.get("family") or "-", (v.get("confidence") or 0) * 100))

        summary = {
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "question": question,
            "rawBytes": len(raw), "flatBytes": len(flat),
            "modelishKeys": hits, "brands": brands,
            "topKeys": dict(keys.most_common(60)),
            "events": (dump.get("events") or [[]])[-1],
            "frames": (dump.get("frames") or [[]])[-1],
            "verdict": v,
        }
        (RECON / "full-capture2-summary.json").write_text(
            json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        (RECON / "full-capture2-raw.txt").write_text(raw, encoding="utf-8")
        log("")
        log("[*] 已写入 recon/full-capture2-summary.json 与 full-capture2-raw.txt")
        return 0
    finally:
        cdp.close()


def evaluate_soft(cdp, expr=DUMP_JS, timeout=25, retries=5):
    last = None
    for i in range(retries):
        try:
            return evaluate(cdp, expr, timeout=timeout)
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def evaluate_soft_len(cdp):
    """轻量探询：只取计数，减少主线程压力"""
    for _ in range(3):
        try:
            return evaluate(cdp, """(() => {
              const a = window.__MODEL_PROBE__;
              if (!a) return { count: 0, len: 0 };
              const o = a.bus.observations;
              return { count: o.length, len: o.length ? (o[o.length-1].text || '').length : 0 };
            })()""", timeout=20)
        except Exception:
            time.sleep(1)
    return {"count": -1, "len": -1}


if __name__ == "__main__":
    sys.exit(main())
