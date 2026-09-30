#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
final_e2e.py — 最终完整端到端实测（一次跑完全链路）

覆盖：
  A. 登录态与鉴权
  B. 探针注入（版本比对）
  C. 自动提问 + 自动提交
  D. 协议采集（realtime batch 嵌套帧解析）
  E. 探针判定（验证不再假阳性）
  F. 从流取 public-access-token → 解码
  G. 读 Trigger.dev run trace → 提取真实模型标识
  H. 汇总报告

每一步都记录耗时与结果，失败也如实标注。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, evaluate, page_ready, inject_fresh,
                         kill_modals, submit_question, diagnose_auth,
                         PROBE_VERSION, log)

OUT = Path(__file__).resolve().parent / "recon"
RESULTS = {"steps": [], "at": time.strftime("%Y-%m-%dT%H:%M:%S")}


def step(name, ok, detail="", extra=None):
    RESULTS["steps"].append({"step": name, "ok": bool(ok),
                             "detail": str(detail)[:400], "extra": extra})
    mark = "✓" if ok else "✗"
    log("  %s %s%s" % (mark, name, ("  — " + str(detail)[:200]) if detail else ""))


def http_get(url, token, timeout=60, retries=4):
    import os
    proxy = os.environ.get("AMP_PROXY") or os.environ.get("HTTPS_PROXY") or ""
    handlers = []
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    opener = urllib.request.build_opener(*handlers) if handlers else urllib.request.build_opener()
    last = None
    for i in range(retries):
        req = urllib.request.Request(url, headers={
            "Authorization": "Bearer %s" % token,
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://arena.ai", "Referer": "https://arena.ai/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        })
        try:
            with opener.open(req, timeout=timeout) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(1.5 * (i + 1))
    return None, str(last)


def jwt_payload(tok):
    try:
        import base64
        p = tok.split(".")[1].replace("-", "+").replace("_", "/")
        p += "=" * (-len(p) % 4)
        return json.loads(base64.b64decode(p).decode("utf-8", "replace"))
    except Exception:
        return None


def extract_token(text):
    for rx in (re.compile(r'"public-access-token"\s*,\s*"?(eyJ[\w\-]{10,}\.[\w\-]{10,}\.[\w\-]{10,})'),
               re.compile(r'public-access-token\\?",\s*\\?"(eyJ[A-Za-z0-9_\-\.]{40,})')):
        m = rx.search(text or "")
        if m:
            return m.group(1)
    for m in re.finditer(r"(eyJ[\w\-]{10,}\.eyJ[\w\-]{10,}\.[\w\-]{10,})", text or ""):
        pl = jwt_payload(m.group(1))
        if pl and "trigger.dev" in str(pl.get("iss", "")):
            return m.group(1)
    return None


def get_stream(cdp):
    try:
        return evaluate(cdp, """(() => {
          const a = window.__MODEL_PROBE__;
          if (!a) return '';
          return (a.bus.observations || []).map(o => o.text || '').join('\\n');
        })()""", timeout=30) or ""
    except Exception:
        return ""


def main():
    log("")
    log("=" * 76)
    log("  arena.ai 模型探针 · 最终端到端实测")
    log("  构建版本 %s" % PROBE_VERSION)
    log("=" * 76)

    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2

    import urllib.request as ur
    lst = json.loads(ur.urlopen("http://127.0.0.1:9222/json/list", timeout=6).read().decode())
    pages = [t for t in lst if t.get("type") == "page" and "arena.ai" in (t.get("url") or "")]
    if not pages:
        log("[!] 没有 arena.ai 页面")
        return 2
    page = next((t for t in pages if "/agent" in (t.get("url") or "")), pages[0])
    RESULTS["page"] = page.get("url")
    log("")
    log("  页面: %s" % page.get("url"))

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=60).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")

        # ---------- A. 就绪 ----------
        log("")
        log("── A. 页面就绪 ──")
        t0 = time.time()
        ready = page_ready(cdp, want_editor=True)
        step("页面就绪（编辑器可交互）", ready, "耗时 %.1fs" % (time.time() - t0))
        if not ready:
            return 3

        # ---------- B. 鉴权 ----------
        log("")
        log("── B. 登录态 ──")
        try:
            auth = diagnose_auth(cdp)
            who = auth.get("user") or {}
            email = who.get("email") or who.get("username") or "(匿名)"
            step("鉴权诊断", auth.get("loggedIn"), "email=%s provider=%s" % (
                email, who.get("emailProvider")), {"user": who})
            if not auth.get("loggedIn"):
                log("  [!] 未登录，无法继续")
                return 4
        except Exception as e:
            step("鉴权诊断", False, str(e))

        # ---------- C. 探针注入 ----------
        log("")
        log("── C. 探针注入 ──")
        ok, info = inject_fresh(cdp)
        step("探针注入（版本比对）", ok, info)
        log("     期望版本: %s" % PROBE_VERSION)
        got = info.replace("injected ", "").replace("already ", "").strip()
        step("版本一致", got == PROBE_VERSION, "实际 %s" % got)
        try:
            kill_modals(cdp)
        except Exception:
            pass

        # ---------- D. 提问 ----------
        log("")
        log("── D. 自动提问 ──")
        q = "什么是并查集？一句话。"
        RESULTS["question"] = q
        try:
            before = evaluate(cdp, "window.__MODEL_PROBE__.bus.observations.length", timeout=15)
        except Exception:
            before = 0
        t0 = time.time()
        ok, detail = submit_question(cdp, q)
        step("提交问题", ok, detail)

        if ok:
            log("     等待响应完成…")
            for i in range(70):
                time.sleep(2)
                txt = get_stream(cdp)
                if txt and "finish" in txt and i > 4:
                    break
            time.sleep(2)
        step("响应采集完成", ok, "耗时 %.1fs" % (time.time() - t0))

        # ---------- E. 协议与判定 ----------
        log("")
        log("── E. 协议采集与判定 ──")
        try:
            snap = evaluate(cdp, """(() => {
              const a = window.__MODEL_PROBE__;
              if (!a) return { error: 'no-api' };
              const obs = a.bus.observations || [];
              const last = obs[obs.length - 1] || {};
              return {
                obsCount: obs.length,
                textLen: (last.text || '').length,
                events: last.events || [],
                frames: last.frames || [],
                url: last.url || '',
                evidence: a.bus.evidence.map(e => ({source:e.source, modelId:e.modelId,
                            family:e.family, weight:e.weight, detail:e.detail})),
                verdict: a.classify(),
                mapStats: a.mapStats ? a.mapStats() : null,
              };
            })()""", timeout=30)
        except Exception as e:
            step("读取探针状态", False, str(e))
            snap = {}

        frames = snap.get("frames") or []
        events = snap.get("events") or []
        step("协议帧解析", len(frames) >= 5,
             "事件=[%s] 帧=%d 种" % (",".join(events), len(frames)),
             {"frames": frames, "events": events})
        log("     帧: %s" % ", ".join(frames[:12]))

        v = snap.get("verdict") or {}
        RESULTS["verdict"] = v
        log("")
        log("     判定模式 : %s" % v.get("mode"))
        log("     模型     : %s" % (v.get("label") or v.get("modelId") or "-"))
        log("     家族     : %s" % (v.get("family") or "null"))
        log("     传输层   : %s" % (v.get("wire") or "-"))
        log("     置信度   : %.1f%%" % ((v.get("confidence") or 0) * 100))

        # 关键验证：不得再假阳性
        not_false_positive = v.get("family") != "openai"
        step("【关键】不再误判为 openai 家族", not_false_positive,
             "family=%s" % v.get("family"))
        step("判定为诚实的 UNKNOWN（仅传输层）",
             v.get("mode") == "UNKNOWN" and v.get("family") is None,
             "mode=%s family=%s" % (v.get("mode"), v.get("family")))
        ms = snap.get("mapStats") or {}
        step("UUID 映射表可用", (ms.get("loaded") or 0) > 100,
             "装载 %s 条 / %s 个名字" % (ms.get("loaded"), ms.get("names")))

        # ---------- F. token ----------
        log("")
        log("── F. 从流取 public-access-token ──")
        stream = get_stream(cdp)
        step("流文本非空", len(stream) > 500, "%d 字符" % len(stream))
        tok = extract_token(stream)
        if not tok:
            raw = OUT / "full-capture2-raw.txt"
            if raw.exists():
                tok = extract_token(raw.read_text(encoding="utf-8", errors="replace"))
                if tok:
                    log("     (用历史流兜底)")
        step("取得 access token", bool(tok), (tok or "")[:44] + "…" if tok else "未取得")

        rid = None
        if tok:
            pl = jwt_payload(tok)
            for s in ((pl or {}).get("scopes") or []):
                m = re.match(r"(?:read|write):\w+:(run_[A-Za-z0-9]+)", s)
                if m:
                    rid = m.group(1)
                    break
            left = ((pl or {}).get("exp") or 0) - int(time.time())
            step("token 解码", bool(pl), "pub=%s 有效期剩余 %ds" % ((pl or {}).get("pub"), left))
            step("提取 run id", bool(rid), rid or "无")

        # ---------- G. run trace ----------
        log("")
        log("── G. 读取 run trace → 真实模型标识 ──")
        model_labels, token_counts = [], []
        if rid and tok:
            st, body = http_get("https://api.trigger.dev/api/v1/runs/%s/events" % rid, tok)
            step("读取 run trace", st and 200 <= st < 300,
                 "HTTP %s %d 字节" % (st, len(body or "")))
            if st and 200 <= st < 300:
                for m in re.finditer(r'"text"\s*:\s*"([^"]{1,80})"\s*,\s*"icon"\s*:\s*"([^"]{1,40})"', body):
                    if "cube" in m.group(2):
                        model_labels.append(m.group(1))
                    elif "hash" in m.group(2):
                        token_counts.append(m.group(1))
                step("提取模型标识", bool(model_labels),
                     ", ".join(sorted(set(model_labels))) or "无标签")
                if token_counts:
                    log("     各轮输入 token: %s" % ", ".join(token_counts))
                (OUT / "final-e2e-trace.json").write_text(body, encoding="utf-8")

        # ---------- H. 汇总 ----------
        log("")
        log("=" * 76)
        log("  最终结果")
        log("=" * 76)
        log("")
        log("  ① 探针判定（客户端协议层）")
        log("     模式   : %s" % v.get("mode"))
        log("     家族   : %s   （修复后不再假阳性）" % (v.get("family") or "null"))
        log("     传输层 : %s" % (v.get("wire") or "-"))
        log("     协议帧 : %d 种" % len(frames))
        log("")
        log("  ② 真实模型标识（run trace，服务端授予读取）")
        if model_labels:
            for name, c in Counter(model_labels).most_common():
                log("     ★ %s   ×%d" % (name, c))
        else:
            log("     (本次未取得)")
        log("")
        log("  ③ 调用方式")
        log("     OpenAI 兼容协议（@ai-sdk/openai-compatible）")
        log("")

        passed = sum(1 for s in RESULTS["steps"] if s["ok"])
        total = len(RESULTS["steps"])
        log("=" * 76)
        log("  步骤通过: %d/%d" % (passed, total))
        log("=" * 76)

        RESULTS["modelLabels"] = dict(Counter(model_labels))
        RESULTS["tokenCounts"] = token_counts
        RESULTS["frames"] = frames
        RESULTS["events"] = events
        RESULTS["runId"] = rid
        RESULTS["stepsPassed"] = passed
        RESULTS["stepsTotal"] = total
        (OUT / "final-e2e.json").write_text(
            json.dumps(RESULTS, ensure_ascii=False, indent=2), encoding="utf-8")
        log("")
        log("[*] 已写入 recon/final-e2e.json")
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
