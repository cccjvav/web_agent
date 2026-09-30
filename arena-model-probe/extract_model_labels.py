#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_model_labels.py — 从 run trace 提取模型标识标签

突破点（上一轮实测）：
  run trace 里 ai.streamText.doStream 的 span 带 accessory 字段：
    "accessory":{"style":"pills","items":[
        {"text":"Hy-dev0826-arena","icon":"tabler-cube"},   <- 模型标识
        {"text":"6.8k","icon":"tabler-hash"}]}              <- 输入 token 数
  这些是 Trigger.dev 面板展示用的标签，由 worker 写入，
  因此**模型身份确实存在于授予客户端读取的 run 数据中**。

本脚本：
  1. 提取全部 accessory pills（模型标签 + token 数）
  2. 统计各标签出现次数与对应时间
  3. 与 arena 的模型目录（3174 条映射 / 888 个名字）交叉比对
  4. 输出结论
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

OUT = Path(__file__).resolve().parent / "recon"


def main():
    ev_file = OUT / "trigger-events.json"
    if not ev_file.exists():
        print("[!] 缺少 %s" % ev_file)
        return 2
    t = ev_file.read_text(encoding="utf-8", errors="replace")
    print("[*] trace %d 字节" % len(t))

    # ---- 1. 提取所有 accessory pills ----
    # 结构：{"text":"<label>","icon":"tabler-cube"} 里 cube 图标 = 模型；hash = token 数
    model_pills = []
    token_pills = []

    for m in re.finditer(r'"text"\s*:\s*"([^"]{1,80})"\s*,\s*"icon"\s*:\s*"([^"]{1,40})"', t):
        text, icon = m.group(1), m.group(2)
        # 记录上下文里的 span 时间
        s = max(0, m.start() - 1200)
        ctx = t[s:m.start()]
        st = None
        mm = None
        for sm in re.finditer(r'"startTime"\s*:\s*"(\d{10,20})"', ctx):
            mm = sm
        if mm:
            st = mm.group(1)
        rec = {"text": text, "icon": icon, "startTime": st}
        if "cube" in icon:
            model_pills.append(rec)
        elif "hash" in icon:
            token_pills.append(rec)

    print("")
    print("=" * 78)
    print("  1. 模型标签（icon=tabler-cube）")
    print("=" * 78)
    if model_pills:
        cnt = Counter(p["text"] for p in model_pills)
        for name, c in cnt.most_common():
            times = [p["startTime"] for p in model_pills if p["text"] == name and p["startTime"]]
            tstr = ""
            if times:
                try:
                    import datetime
                    ts = int(times[0][:16]) / 1e6   # 微秒 -> 秒
                    tstr = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S UTC")
                except Exception:
                    tstr = times[0]
            print("     ★ %-40s ×%d   首次: %s" % (name, c, tstr))
    else:
        print("     （无）")

    print("")
    print("=" * 78)
    print("  2. token 数标签（icon=tabler-hash）")
    print("=" * 78)
    if token_pills:
        for p in token_pills[:30]:
            print("     %s" % p["text"])
    else:
        print("     （无）")

    # ---- 3. 与模型目录交叉比对 ----
    print("")
    print("=" * 78)
    print("  3. 与 arena 模型目录交叉比对")
    print("=" * 78)
    cat_file = OUT / "model-id-map.json"
    catalog_names = []
    if cat_file.exists():
        try:
            cat = json.loads(cat_file.read_text(encoding="utf-8"))
            catalog_names = [m.get("publicName") for m in (cat.get("models") or []) if m.get("publicName")]
        except Exception as e:
            print("  [!] 目录读取失败: %s" % e)
    print("  目录模型名总数: %d" % len(catalog_names))

    labels = sorted(set(p["text"] for p in model_pills))
    for lab in labels:
        # 精确匹配
        exact = [n for n in catalog_names if n and n.lower() == lab.lower()]
        # 前缀/片段匹配
        frag = [n for n in catalog_names if n and (
            lab.lower() in n.lower() or n.lower() in lab.lower())]
        # 按词根匹配（Hy -> hunyuan?）
        print("")
        print("  标签: %s" % lab)
        print("     精确匹配: %s" % (exact[:5] or "无"))
        print("     片段匹配: %s" % (frag[:8] or "无"))
        # 拆分词根
        parts = re.split(r"[-_\s]+", lab)
        print("     词根: %s" % parts)
        for p in parts:
            if len(p) < 3:
                continue
            near = [n for n in catalog_names if p.lower() in (n or "").lower()]
            if near:
                print("       '%s' 相关: %s" % (p, near[:6]))

    # ---- 4. 同时列出 provider 线索 ----
    print("")
    print("=" * 78)
    print("  4. Provider / 调用方式线索")
    print("=" * 78)
    provs = Counter()
    for m in re.finditer(r"@ai-sdk/([\w\-]+)@([\d.]+)", t):
        provs["%s@%s" % (m.group(1), m.group(2))] += 1
    for k, v in provs.most_common():
        print("     @ai-sdk/%-28s ×%d" % (k, v))

    print("")
    for m in re.finditer(r"(OpenAICompatible\w*|Anthropic\w*|Google\w*|Vertex\w*|Bedrock\w*)", t):
        provs[m.group(1)] += 1
    for k, v in sorted(provs.items(), key=lambda x: -x[1]):
        if "@ai-sdk" in k:
            continue
        print("     %-32s ×%d" % (k, v))

    # ---- 5. 源文件路径线索 ----
    print("")
    print("=" * 78)
    print("  5. 源码路径（揭示实现位置）")
    print("=" * 78)
    paths = Counter()
    for m in re.finditer(r"file:///((?:src|node_modules)[^\s\)\"']{0,120})", t):
        paths[m.group(1)] += 1
    for k, v in paths.most_common(25):
        print("     %-72s ×%d" % (k[:72], v))

    # ---- 保存 ----
    res = {
        "modelLabels": labels,
        "modelPillCounts": dict(Counter(p["text"] for p in model_pills)),
        "modelPills": model_pills,
        "tokenPills": [p["text"] for p in token_pills],
        "providers": {k: v for k, v in provs.items()},
    }
    (OUT / "model-labels.json").write_text(
        json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8")

    print("")
    print("=" * 78)
    if labels:
        print("  ★ 结论：run trace 中确实存在模型标识：%s" % ", ".join(labels))
    else:
        print("  ✗ 未提取到模型标签")
    print("=" * 78)
    print("[*] 已写入 recon/model-labels.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
