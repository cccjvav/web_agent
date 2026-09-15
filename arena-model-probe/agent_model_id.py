#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agent_model_id.py — 【生产级】自动获取 Agent Mode 当前模型的真实标识

原理链（全部基于客户端有权访问的数据）：
  1. arena.ai 的 Agent 运行托管在 Trigger.dev
  2. 服务端在 SSE 流里下发 public-access-token（JWT, pub:true）
     scope 含 read:runs:run_xxx —— 即明确授予「读该 run」的权限
  3. 用该 token 读 run 的 trace：
       GET https://api.trigger.dev/api/v1/runs/{run}/events
  4. trace 里 ai.streamText.doStream 的 span 带 accessory 标签：
       {"text":"<模型标识>","icon":"tabler-cube"}    ← 模型
       {"text":"<token数>","icon":"tabler-hash"}
  5. 得到模型标识，再尝试与 arena 模型目录交叉比对

与之前失败路径的区别：
  - 不是攻击后端，是使用服务端主动授予客户端的读权限
  - 不需要 MITM、不需要改任何东西
  - 得到的是 worker 自己写入的真实模型标识，不是推断

用法:
    python agent_model_id.py            # 发一条消息并输出当前模型标识
    python agent_model_id.py --no-ask   # 不提问，直接读最近一次 run
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
from arena_probe import (CDP, cdp_alive, evaluate, page_ready,
                         inject_fresh, kill_modals, submit_question, log)

OUT = Path(__file__).resolve().parent / "recon"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def http_get(url, token, timeout=60, retries=4):
    """
    带重试的 GET。
    实测：直连 trigger.dev 偶发 SSL UNEXPECTED_EOF（网络抖动/TLS 中断），
    需要重试；若配置了代理则一并使用。
    """
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
            "Origin": "https://arena.ai",
            "Referer": "https://arena.ai/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
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


# ---------------------------------------------------------------------------
# 从 SSE 流文本里提取 token 与 run id
# ---------------------------------------------------------------------------
TOKEN_RE = re.compile(r'"public-access-token"\s*,\s*"?(eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})')
TOKEN_RE_ESC = re.compile(r'public-access-token\\?",\s*\\?"(eyJ[A-Za-z0-9_\-\.]{40,})')


def extract_token(stream_text):
    """realtime batch 把 header 记录嵌在 body 里，引号可能被转义"""
    for rx in (TOKEN_RE, TOKEN_RE_ESC):
        m = rx.search(stream_text or "")
        if m:
            return m.group(1)
    # 兜底：直接找 JWT 形态并验证 payload 含 trigger.dev
    for m in re.finditer(r"(eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,})",
                         stream_text or ""):
        tok = m.group(1)
        pl = jwt_payload(tok)
        if pl and "trigger.dev" in str(pl.get("iss", "")):
            return tok
    return None


def jwt_payload(tok):
    try:
        import base64
        p = tok.split(".")[1]
        p = p.replace("-", "+").replace("_", "/")
        p += "=" * (-len(p) % 4)
        return json.loads(base64.b64decode(p).decode("utf-8", "replace"))
    except Exception:
        return None


def run_id_from_token(tok):
    pl = jwt_payload(tok)
    if not pl:
        return None, None
    rid = None
    for s in (pl.get("scopes") or []):
        m = re.match(r"(?:read|write):\w+:(run_[A-Za-z0-9]+)", s)
        if m:
            rid = m.group(1)
            break
    return rid, pl


# ---------------------------------------------------------------------------
# 从 trace 提取模型标签
# ---------------------------------------------------------------------------
def extract_labels(trace_text):
    """返回 (model_labels, token_labels)"""
    models, toks = [], []
    for m in re.finditer(r'"text"\s*:\s*"([^"]{1,80})"\s*,\s*"icon"\s*:\s*"([^"]{1,40})"',
                         trace_text):
        text, icon = m.group(1), m.group(2)
        if "cube" in icon:
            models.append(text)
        elif "hash" in icon:
            toks.append(text)
    return models, toks


def load_catalog_names():
    f = OUT / "model-id-map.json"
    if not f.exists():
        return []
    try:
        d = json.loads(f.read_text(encoding="utf-8"))
        return [m.get("publicName") for m in (d.get("models") or []) if m.get("publicName")]
    except Exception:
        return []


def match_catalog(label, names):
    """把 dev-snapshot 标签尽量对到公开模型名"""
    if not label:
        return {"exact": [], "fragment": [], "roots": {}}
    low = label.lower()
    exact = [n for n in names if n and n.lower() == low]
    frag = [n for n in names if n and (low in n.lower() or n.lower() in low)]
    roots = {}
    for part in re.split(r"[-_\s]+", label):
        if len(part) < 3:
            continue
        near = [n for n in names if part.lower() in (n or "").lower()]
        if near:
            roots[part] = near[:8]
    return {"exact": exact, "fragment": frag, "roots": roots}


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
def get_stream_text(cdp):
    """取页面内探针累积的完整流文本"""
    try:
        return evaluate(cdp, """(() => {
          const a = window.__MODEL_PROBE__;
          if (!a) return '';
          return (a.bus.observations || []).map(o => o.text || '').join('\\n');
        })()""", timeout=30) or ""
    except Exception:
        return ""


def main():
    no_ask = "--no-ask" in sys.argv
    question = "什么是单调栈？一句话。"

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
    log("[*] 页面: %s" % page.get("url"))

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=60).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        if not page_ready(cdp, want_editor=True):
            log("[!] 页面未就绪")
            return 3
        ok, info = inject_fresh(cdp)
        log("[*] 探针: %s" % info)
        try:
            kill_modals(cdp)
        except Exception:
            pass

        if not no_ask:
            log("")
            log("=" * 74)
            log("  1. 发一条消息（触发一次新的模型调用）")
            log("=" * 74)
            ok, detail = submit_question(cdp, question)
            log("  提交: %s" % detail)
            if ok:
                log("  等待响应完成…")
                for i in range(60):
                    time.sleep(2)
                    txt = get_stream_text(cdp)
                    if txt and "finish" in txt and i > 4:
                        break
                time.sleep(2)

        # ---- 取 token ----
        log("")
        log("=" * 74)
        log("  2. 从流里取 public-access-token")
        log("=" * 74)
        stream = get_stream_text(cdp)
        log("  流文本 %d 字符" % len(stream))
        tok = extract_token(stream)

        if not tok:
            log("  [!] 流里没有 token，改用历史原始流")
            raw = OUT / "full-capture2-raw.txt"
            if raw.exists():
                tok = extract_token(raw.read_text(encoding="utf-8", errors="replace"))

        if not tok:
            log("  [!] 未取得 token")
            return 4

        rid, pl = run_id_from_token(tok)
        log("  ★ token 取得（%s…）" % tok[:36])
        log("  run id: %s" % rid)
        if not rid:
            log("  [!] token 里无 run id")
            return 4

        exp = (pl or {}).get("exp")
        if exp:
            left = exp - int(time.time())
            log("  有效期剩余: %d 秒%s" % (left, "  （已过期）" if left < 0 else ""))

        # ---- 读 trace ----
        log("")
        log("=" * 74)
        log("  3. 读取 run trace（服务端已授予 read:runs 权限）")
        log("=" * 74)
        st, body = http_get("https://api.trigger.dev/api/v1/runs/%s/events" % rid, tok)
        log("  GET /api/v1/runs/%s/events -> %s  %d 字节" % (rid, st, len(body or "")))
        if not (st and 200 <= st < 300):
            log("  [!] 读取失败: %s" % (body or "")[:200])
            return 5

        # ---- 提取模型 ----
        log("")
        log("=" * 74)
        log("  4. 提取模型标识")
        log("=" * 74)
        models, toks = extract_labels(body)
        if toks:
            log("  各轮输入 token 数: %s" % ", ".join(toks))

        if not models:
            log("  ✗ trace 里没有模型标签（该 run 可能尚未执行模型调用）")
            return 6

        cnt = Counter(models)
        log("")
        log("  ★ 模型标识：")
        for name, c in cnt.most_common():
            log("     %-40s 出现 %d 次" % (name, c))

        # ---- 交叉比对 ----
        log("")
        log("=" * 74)
        log("  5. 与 arena 公开模型目录交叉比对")
        log("=" * 74)
        names = load_catalog_names()
        log("  目录模型名 %d 个" % len(names))
        for name in cnt:
            m = match_catalog(name, names)
            log("")
            log("  标签: %s" % name)
            log("     精确匹配: %s" % (m["exact"][:5] or "无"))
            log("     片段匹配: %s" % (m["fragment"][:6] or "无"))
            for r, near in m["roots"].items():
                log("     词根 '%s': %s" % (r, near[:6]))

        # ---- 结果 ----
        log("")
        log("=" * 74)
        log("  结果")
        log("=" * 74)
        log("  当前 Agent Mode 模型标识: %s" % ", ".join(cnt.keys()))
        log("  调用方式: OpenAI 兼容协议（@ai-sdk/openai-compatible）")
        log("")
        log("  说明：该标识是 worker 写入 run 的真实模型名，")
        log("        形如 <代号>-dev<MMDD>-arena，属于开发快照别名，")
        log("        不总是等于排行榜上的公开名。")

        (OUT / "agent-model-id.json").write_text(json.dumps({
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "runId": rid,
            "modelLabels": dict(cnt),
            "tokenCounts": toks,
            "catalogMatches": {n: match_catalog(n, names) for n in cnt},
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        log("")
        log("[*] 已写入 recon/agent-model-id.json")
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
