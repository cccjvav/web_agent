#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
get_token.py — 在页面内抓取 public-access-token 并解码

发现背景（逆向得出）：
  arena.ai 的 Agent 提交流走 /ai-proxy/realtime/v1/sessions/{sid}/in|out，
  而流的 header 记录里带 ["public-access-token", "<JWT>"]。
  解码该 JWT：
    {"sub":"...","pub":true,
     "scopes":["read:runs:run_xxx","read:sessions:...","write:inputStreams:run_xxx"],
     "iss":"https://id.trigger.dev","aud":"https://api.trigger.dev"}
  即：arena 的 Agent 运行托管在 Trigger.dev，服务端把「读该 run」的
  公开令牌发给了客户端（pub:true，专为前端订阅设计）。

本脚本负责取得并解码这个 token。

用法:
    python get_token.py            # 从当前会话流里取
    python get_token.py --ask      # 先发一条消息再取
"""
import base64
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, evaluate, page_ready, inject_fresh,
                         kill_modals, submit_question, log)

OUT = Path(__file__).resolve().parent / "recon"

TOKEN_RES = [
    re.compile(r'"public-access-token"\s*,\s*"?(eyJ[\w\-]{10,}\.[\w\-]{10,}\.[\w\-]{10,})'),
    re.compile(r'public-access-token\\?",\s*\\?"(eyJ[A-Za-z0-9_\-\.]{40,})'),
]


def jwt_payload(tok):
    try:
        p = tok.split(".")[1].replace("-", "+").replace("_", "/")
        p += "=" * (-len(p) % 4)
        return json.loads(base64.b64decode(p).decode("utf-8", "replace"))
    except Exception:
        return None


def extract_token(text):
    for rx in TOKEN_RES:
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

        if "--ask" in sys.argv:
            log("")
            log("[*] 发一条消息以取得当前有效 token…")
            ok, detail = submit_question(cdp, "1+1等于几？只回答数字。")
            log("    提交: %s" % detail)
            for i in range(40):
                time.sleep(2)
                if get_stream(cdp):
                    break
            time.sleep(2)

        stream = get_stream(cdp)
        log("[*] 流文本 %d 字符" % len(stream))
        tok = extract_token(stream)
        if not tok:
            raw = OUT / "full-capture2-raw.txt"
            if raw.exists():
                tok = extract_token(raw.read_text(encoding="utf-8", errors="replace"))
                if tok:
                    log("    (用历史流兜底，可能已过期)")
        if not tok:
            log("[!] 未取得 token")
            return 4

        pl = jwt_payload(tok)
        log("")
        log("=" * 74)
        log("  token 解码")
        log("=" * 74)
        log(json.dumps(pl, ensure_ascii=False, indent=2))

        run_id = None
        for s in ((pl or {}).get("scopes") or []):
            m = re.match(r"(?:read|write):\w+:(run_[A-Za-z0-9]+)", s)
            if m:
                run_id = m.group(1)
                break

        exp = (pl or {}).get("exp")
        log("")
        log("  pub      : %s" % (pl or {}).get("pub"))
        log("  run id   : %s" % run_id)
        if exp:
            left = exp - int(time.time())
            log("  有效期   : %d 秒%s" % (left, "（已过期）" if left < 0 else ""))

        (OUT / "token.json").write_text(json.dumps({
            "token": tok, "payload": pl, "runId": run_id,
            "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        log("")
        log("[*] 已写入 recon/token.json")
        return 0
    finally:
        cdp.close()


if __name__ == "__main__":
    sys.exit(main())
