#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
trigger_full.py — 用授予的 token 抓取 run 的【完整】payload 与 trace，搜模型标识

已确认（上一轮实测）：
  - 流头下发的 public-access-token 有效（pub:true, read:runs scope）
  - GET /api/v3/runs/{run}                    -> 200（run 概要）
  - GET /api/v1/runs/{run}/events             -> 200（完整 trace，238KB）
  - GET /realtime/v1/runs/{run}               -> 200（含 payload 原文）

关键依据（逆向自 JS 3pzr5j-ne0eg1.js:184）：
    function rC({model, settings, telemetry, headers}) {
      return { "ai.model.provider": model.provider,
               "ai.model.id": model.modelId, ... }
    }
  这是 Vercel AI SDK 的遥测属性映射 —— span 属性里会写模型身份。

本脚本：抓全文，穷举搜索 ai.model.* 与模型名，并用 idmap 还原 UUID。
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / "recon"


def http_get(url, token, timeout=60):
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer %s" % token,
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://arena.ai",
        "Referer": "https://arena.ai/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, str(e)


def load_token():
    """
    读取 token 与 run id。

    优先用 get_token.py 产出的 recon/token.json（新格式，含 payload 与 runId）；
    若无则回退到从历史原始流里正则提取（旧格式兜底）。
    """
    p = OUT / "token.json"
    if p.exists():
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
            if d.get("token") and d.get("runId"):
                return d["token"], d["runId"]
        except Exception:
            pass

    # 兜底：从运行结果与历史流里拼
    run = None
    rp = OUT / "trigger-run-probe.json"
    if rp.exists():
        try:
            run = json.loads(rp.read_text(encoding="utf-8")).get("runId")
        except Exception:
            pass

    tok = None
    raw = OUT / "full-capture2-raw.txt"
    if raw.exists():
        t = raw.read_text(encoding="utf-8", errors="replace")
        m = re.search(r'public-access-token\\?"\s*,\s*\\?"(eyJ[A-Za-z0-9_\-\.]+)', t)
        if m:
            tok = m.group(1)
    return tok, run


MODEL_PATTERNS = [
    ("ai.model.id", re.compile(r'"ai\.model\.id"\s*:\s*"([^"]{2,90})"')),
    ("ai.model.provider", re.compile(r'"ai\.model\.provider"\s*:\s*"([^"]{2,60})"')),
    ("ai.model.*", re.compile(r'"(ai\.model[^"]*)"\s*:\s*"([^"]{2,90})"')),
    ("modelId", re.compile(r'"(?:modelId|model_id)"\s*:\s*"([^"]{2,90})"')),
    ("model(名)", re.compile(r'"model"\s*:\s*"([^"]{2,90})"')),
    ("provider", re.compile(r'"provider"\s*:\s*"([^"]{2,60})"')),
    ("harness", re.compile(r'"harness[^"]*"\s*:\s*"([^"]{2,60})"')),
]
BRAND = re.compile(
    r"\b(gpt[\w.\-]{1,26}|chatgpt[\w.\-]*|claude[\w.\-]{1,44}|gemini[\w.\-]{1,44}|"
    r"grok[\w.\-]{1,32}|deepseek[\w.\-]{1,32}|qwen[\w.\-]{1,32}|kimi[\w.\-]{1,32}|"
    r"glm[\w.\-]{1,32}|llama[\w.\-]{1,32}|mistral[\w.\-]{1,32}|doubao[\w.\-]{1,32}|"
    r"hunyuan[\w.\-]{1,32}|ernie[\w.\-]{1,32}|minimax[\w.\-]{1,32}|"
    r"astra|luna|sol|terra|fable|mythos)\b", re.I)


def main():
    tok, run = load_token()
    if not tok or not run:
        print("[!] 缺 token 或 run id，请先运行 get_token.py")
        return 2
    print("[*] run=%s  token=%s..." % (run, tok[:40]))

    targets = [
        ("run", "https://api.trigger.dev/api/v3/runs/%s" % run),
        ("events", "https://api.trigger.dev/api/v1/runs/%s/events" % run),
        ("realtime", "https://api.trigger.dev/realtime/v1/runs/%s" % run),
        ("tracev3", "https://api.trigger.dev/api/v3/runs/%s/trace" % run),
    ]

    bodies = {}
    for name, url in targets:
        st, body = http_get(url, tok)
        print("\n[*] %-9s %s -> %s  len=%s" % (name, url[:80], st, len(body or "")))
        if st and 200 <= st < 300:
            bodies[name] = body
            Path(OUT / ("trigger-%s.json" % name)).write_text(body, encoding="utf-8")

    if not bodies:
        print("[!] 无成功响应")
        return 3

    # ---- 穷举搜索 ----
    print("")
    print("=" * 78)
    print("  模型标识搜索")
    print("=" * 78)

    alltext = "\n".join(bodies.values())
    found_any = False

    for label, pat in MODEL_PATTERNS:
        hits = {}
        for name, body in bodies.items():
            for m in pat.finditer(body):
                grp = m.groups()
                val = grp[-1] if grp else m.group(0)
                hits.setdefault(val, set()).add(name)
        if hits:
            found_any = True
            print("")
            print("  ★ %s：" % label)
            for val, src in sorted(hits.items())[:25]:
                print("     %-52s [%s]" % (val[:52], ",".join(sorted(src))))

    print("")
    print("  品牌/代号：")
    brands = {}
    for name, body in bodies.items():
        for m in BRAND.finditer(body):
            brands.setdefault(m.group(1).lower(), set()).add(name)
    if brands:
        found_any = True
        for v, src in sorted(brands.items(), key=lambda x: -len(x[1]))[:30]:
            print("     %-40s [%s]" % (v[:40], ",".join(sorted(src))))
    else:
        print("     （无）")

    # ---- 用 idmap 还原 UUID ----
    UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
    uu = list(dict.fromkeys(m.group(0) for m in UUID.finditer(alltext)))
    print("")
    print("  文中 UUID: %d 个" % len(uu))
    for u in uu[:20]:
        print("     %s" % u)

    # ---- 打印 run payload（可能含模型配置）----
    print("")
    print("=" * 78)
    print("  run payload 原文")
    print("=" * 78)
    for name, body in bodies.items():
        m = re.search(r'"payload"\s*:\s*"((?:[^"\\]|\\.)*)"', body)
        if m:
            try:
                raw = json.loads('"' + m.group(1) + '"')
            except Exception:
                raw = m.group(1)
            print("  [%s] payload（%d 字符）:" % (name, len(raw)))
            print("  %s" % raw[:2500])
            print("")
            break

    # ---- span 属性全量 dump（找 ai.* 属性）----
    print("=" * 78)
    print("  所有 ai.* 开头的属性")
    print("=" * 78)
    aiattrs = {}
    for name, body in bodies.items():
        for m in re.finditer(r'"(ai\.[\w.]+)"\s*:\s*("?[^",}]{0,80}"?)', body):
            aiattrs.setdefault(m.group(1), set()).add(m.group(2)[:60])
    if aiattrs:
        for k, vs in sorted(aiattrs.items()):
            print("     %-40s %s" % (k, list(vs)[:3]))
    else:
        print("     （无 ai.* 属性）")

    print("")
    print("=" * 78)
    print("  结论: %s" % ("★ 找到模型标识" if found_any else "未找到模型标识"))
    print("=" * 78)

    (OUT / "trigger-model-hunt.json").write_text(
        json.dumps({"run": run, "found": found_any, "aiAttrs": {k: list(v) for k, v in aiattrs.items()}},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print("[*] 已写入 recon/trigger-model-hunt.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
