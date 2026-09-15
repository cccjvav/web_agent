#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""new_tab.py — 用 CDP 开新标签（新版浏览器禁止 GET /json/new）"""
import json
import sys
import time
import urllib.request as ur

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from arena_probe import CDP, log

url = sys.argv[1] if len(sys.argv) > 1 else "https://arena.ai/agent"
ver = json.loads(ur.urlopen("http://127.0.0.1:9222/json/version", timeout=6).read().decode())
b = CDP(ver["webSocketDebuggerUrl"], timeout=30).connect()
try:
    r = b.call("Target.createTarget", {"url": url}, timeout=20)
    tid = r.get("targetId")
    log("[*] 新标签 targetId=%s" % tid)
finally:
    b.close()

time.sleep(10)
lst = json.loads(ur.urlopen("http://127.0.0.1:9222/json/list", timeout=6).read().decode())
for t in lst:
    if t.get("id") == tid:
        log("[*] URL=%s" % t.get("url"))
        break
else:
    log("[!] 未找到新标签")
    for t in lst:
        if t.get("type") == "page":
            log("   %s" % t.get("url"))
