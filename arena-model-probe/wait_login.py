#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
wait_login.py — 等待用户完成登录，成功后自动验证

用途：与 arena_probe.py --login 配合。用户登录后无需手动按 Enter，
本脚本轮询 /api/me 直到检测到真实账号。

用法:
    python wait_login.py                 # 只等待并验证
    python wait_login.py --ask "问题"     # 登录成功后自动实测
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import (CDP, cdp_alive, get_page, evaluate, diagnose_auth, run_ask, log)


def close_internal_dialogs(targets):
    """关掉 edge:// 内部弹窗（sync-confirmation-dialog 等），避免遮挡"""
    closed = []
    for t in targets:
        u = t.get("url", "")
        if u.startswith("edge://") and t.get("type") == "page" and u != "edge://newtab/":
            try:
                urllib.request.urlopen("http://127.0.0.1:9222/json/close/%s" % t["id"], timeout=5)
                closed.append(u)
            except Exception:
                pass
    return closed


def main():
    ask = None
    if "--ask" in sys.argv:
        i = sys.argv.index("--ask")
        if i + 1 < len(sys.argv):
            ask = sys.argv[i + 1]

    if not cdp_alive():
        log("[!] CDP 未就绪，请先运行:  python arena_probe.py --login")
        return 2

    try:
        targets = json.loads(urllib.request.urlopen(
            "http://127.0.0.1:9222/json/list", timeout=5).read().decode())
        closed = close_internal_dialogs(targets)
        if closed:
            log("[*] 已关闭干扰弹窗: %s" % ", ".join(closed))
    except Exception:
        pass

    page = get_page()
    if not page:
        log("[!] 找不到页面")
        return 2

    cdp = CDP(page["webSocketDebuggerUrl"]).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")

        who = None
        for i in range(300):          # 最多等 10 分钟
            try:
                auth = diagnose_auth(cdp)
                u = auth.get("user") or {}
                if auth.get("loggedIn"):
                    who = u
                    break
                if i % 10 == 0:
                    log("[%3ds] 等待登录… (email=%r, status=%s)" % (
                        i, u.get("email", ""), auth.get("status")))
            except Exception as e:
                if i % 10 == 0:
                    log("[%3ds] 读取中… %s" % (i, e))
            time.sleep(2)

        log("")
        if not who:
            log("[!] 超时：仍未检测到登录")
            log("    请确认在浏览器窗口里真的完成了账号登录（不是仅访问页面）")
            return 4

        log("=" * 68)
        log("[+] 登录成功")
        log("    email          : %s" % (who.get("email") or "(空)"))
        log("    username       : %s" % who.get("username"))
        log("    supabaseUserId : %s" % who.get("supabaseUserId"))
        log("    emailProvider  : %s" % who.get("emailProvider"))
        log("=" * 68)
        log("    配置目录已持久化，之后直接:")
        log('      python arena_probe.py --ask "你的问题"')

        if ask:
            log("")
            log("[*] 开始实测…")
            cdp.close()
            return run_ask([ask], out_json="recon/probe-live.json")
        return 0
    finally:
        try:
            cdp.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(main())
