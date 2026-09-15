#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_model_map2.py — 用 Python 侧精确解析提取 id -> 模型名 映射

教训（为什么重写）：
  前两版都在浏览器里用 JS 正则/配平解析 RSC，双双失败：
    - 第一版：假设了错误的字段形态（找 organization，但实际嵌在 initialModels 里）
    - 第二版：括号配平未处理 RSC 的双重转义 \\" 与嵌套数组，全部解析失败
  正确做法：把原始文本拿到 Python 侧，做「先还原转义、再逐个 JSON 对象解析」，
  并用 json.JSONDecoder.raw_decode 做稳健解析（比手写括号配平可靠得多）。

已确认的目标结构（RSC 中）：
    {"id":"019b24bb-...","organization":"boss-bandit","provider":"boss-bandit",
     "publicName":"Max","name":"boss-bandit","displayName":"Max","capabilities":{...},
     "userSelectable":true,"rankByModality":{...}}
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import CDP, cdp_alive, get_page, evaluate, log

OUT = Path(__file__).resolve().parent / "recon"

# 在浏览器里只负责把原始 HTML 甩出来（不做任何解析，解析全部放 Python 侧）
FETCH_JS = r"""
(async () => {
  const pages = ['/leaderboard', '/leaderboard/agent', '/leaderboard/text',
                 '/leaderboard/vision', '/leaderboard/webdev',
                 '/leaderboard/code', '/leaderboard/search'];
  const out = {};
  for (const p of pages) {
    try {
      const r = await fetch(p, { credentials: 'include' });
      if (!r.ok) { out[p] = null; continue; }
      out[p] = await r.text();
    } catch (e) { out[p] = null; }
  }
  return out;
})()
"""


def decode_rsc_payloads(html):
    """
    从 HTML 里取出 self.__next_f.push([1,"..."]) 的字符串载荷并反转义。
    返回拼接后的文本。
    """
    parts = []
    # self.__next_f.push([1,"<encoded>"])
    for m in re.finditer(r'self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\s*\]\)', html):
        raw = m.group(1)
        try:
            # 用 JSON 解析来正确还原 \uXXXX、\"、\\ 等转义
            s = json.loads('"' + raw + '"')
            parts.append(s)
        except Exception:
            parts.append(raw)
    return "".join(parts)


def extract_models(text):
    """
    稳健提取所有模型对象。
    方法：定位每个 "publicName" 或 "\"id\"" 锚点，然后用 JSONDecoder.raw_decode
    从其所在对象的 '{' 处开始尝试解析（比手写配平可靠）。
    """
    models = []
    seen_ids = set()

    # 直接找所有可能的对象起点：{ 后面紧跟 "id"
    # 用 raw_decode 逐个尝试，能解析出且含 publicName/organization 的即为模型
    decoder = json.JSONDecoder()
    n = len(text)
    i = 0
    while i < n:
        j = text.find('{"id"', i)
        if j < 0:
            break
        i = j + 1
        try:
            obj, end = decoder.raw_decode(text, j)
        except Exception:
            continue
        if not isinstance(obj, dict):
            continue
        mid = obj.get("id")
        if not mid or mid in seen_ids:
            continue
        # 判定是否模型对象：有 publicName/provider/organization 之一
        if not (obj.get("publicName") or obj.get("provider") or obj.get("organization")):
            continue
        # 排除明显非模型（要有 capabilities 或 rankByModality 或 displayName 佐证）
        if not (obj.get("capabilities") or obj.get("rankByModality")
                or obj.get("displayName") or obj.get("userSelectable") is not None):
            continue

        seen_ids.add(mid)
        caps = obj.get("capabilities") or {}
        models.append({
            "id": mid,
            "organization": obj.get("organization"),
            "provider": obj.get("provider"),
            "publicName": obj.get("publicName") or obj.get("name"),
            "displayName": obj.get("displayName"),
            "userSelectable": obj.get("userSelectable"),
            "inputModalities": list((caps.get("inputCapabilities") or {}).keys()),
            "outputModalities": list((caps.get("outputCapabilities") or {}).keys()),
            "rankByModality": obj.get("rankByModality"),
        })
    return models


def main():
    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2
    page = get_page()
    if not page:
        log("[!] 无页面")
        return 2

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=180).connect()
    try:
        cdp.call("Runtime.enable")
        log("[*] 抓取排行榜 HTML…")
        pages = evaluate(cdp, FETCH_JS, await_promise=True, timeout=180) or {}
    finally:
        cdp.close()

    all_models = {}
    stats = []
    for url, html in pages.items():
        if not html:
            stats.append((url, None, 0))
            continue
        text = decode_rsc_payloads(html)
        ms = extract_models(text)
        for m in ms:
            all_models.setdefault(m["id"], m)
        stats.append((url, len(html), len(ms)))

    log("")
    log("=== 抓取统计 ===")
    for url, ln, cnt in stats:
        log("  %-26s html=%-9s models=%d" % (url, ln if ln else "-", cnt))

    models = list(all_models.values())

    # 合并：同一 id 在不同页面可能字段互补
    OUT.mkdir(exist_ok=True)
    (OUT / "model-id-map.json").write_text(
        json.dumps({"total": len(models), "models": models}, ensure_ascii=False, indent=2),
        encoding="utf-8")

    log("")
    log("=" * 74)
    log("  ★ 提取到 %d 个模型（id -> publicName 映射）" % len(models))
    log("=" * 74)

    by_org = {}
    for m in models:
        by_org.setdefault(m.get("organization") or "unknown", []).append(m)
    log("")
    log("  按 organization 分组（top 20）：")
    for org in sorted(by_org, key=lambda k: -len(by_org[k]))[:20]:
        log("     %-22s %d" % (org, len(by_org[org])))

    FRONT = re.compile(
        r"gpt-6|gpt-5\.6|claude-(opus|sonnet|fable)-5|gemini-3\.[6-8]|"
        r"grok-4\.[5-9]|deepseek-v4\.1|glm-5\.3|kimi-k3", re.I)
    log("")
    log("  --- 前沿模型 id -> 名 映射 ---")
    hits = [m for m in models if FRONT.search(m.get("publicName") or "")]
    for m in sorted(hits, key=lambda x: x.get("publicName") or "")[:40]:
        log("     %s  ->  %-36s [%s] sel=%s" % (
            m["id"], m["publicName"], m.get("organization"), m.get("userSelectable")))
    log("     （共 %d 个命中）" % len(hits))

    sel = [m for m in models if m.get("userSelectable")]
    log("")
    log("  --- userSelectable=true（%d 个，前 25）---" % len(sel))
    for m in sel[:25]:
        log("     %s  ->  %-36s [%s]" % (m["id"], m["publicName"], m.get("organization")))

    log("")
    log("[*] 已写入 recon/model-id-map.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
