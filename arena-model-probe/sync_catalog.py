#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync_catalog.py — 把 arena.ai 排行榜的真实模型目录落成可被探针消费的资产

用途：
  1. 产出 recon/catalog-by-family.json（已由 extract_catalog.py 生成）
  2. 产出 dist/arena-catalog.json —— 探针运行时读取的「候选模型集」
  3. 报告与注册表的差异，提示哪些新模型需要补进 src/registry.js

为什么有价值：实测确认 Agent Mode 是盲测（不披露 modelId），
候选集收敛到真实存在的模型能显著降低误判，且新模型出现时一眼可见。
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FAMILY_FILE = HERE / "recon" / "catalog-by-family.json"
OUT = HERE / "dist" / "arena-catalog.json"


def main():
    if not FAMILY_FILE.exists():
        print(f"[!] 缺少 {FAMILY_FILE}，请先运行: python extract_catalog.py")
        return 2

    fam = json.loads(FAMILY_FILE.read_text(encoding="utf-8"))

    # 过滤掉明显不是模型的噪声（域名、页面标题等）
    noise = re.compile(
        r"\.(com|ai|io|html|tencent|baidu)\b|^(?:commands|steps|stephen|kimi\.ai)$",
        re.I)

    catalog = {}
    total = 0
    for family, names in fam.items():
        clean = sorted({n.strip() for n in names
                        if n and 3 <= len(n) <= 60 and not noise.search(n)})
        if clean:
            catalog[family] = clean
            total += len(clean)

    payload = {
        "source": "https://arena.ai/leaderboard",
        "note": "arena.ai 公开排行榜的真实模型目录，用作探针候选集与指纹校准依据",
        "totalModels": total,
        "families": catalog,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"[*] 目录已写入 {OUT}")
    print(f"    家族 {len(catalog)} 个 / 模型 {total} 个")
    print()
    for family in sorted(catalog, key=lambda k: -len(catalog[k])):
        names = catalog[family]
        print(f"  {family:<12} {len(names):>4}   e.g. {', '.join(names[:3])}")

    # 与注册表比对：找出目录里有、但注册表可能未覆盖的代际
    # 说明：不能直接对 registry.js 做字面正则匹配——源码里的字面量含 '\-' 之类的
    # 转义，字面匹配会假报警。这里改为「用 Node 实际加载注册表并逐条试命中」。
    print()
    print("=== 目录中值得检查的新代际线索 ===")
    import subprocess
    probes = [
        ("gpt-6", "gpt-6-astra-max"),
        ("gpt-5.6", "gpt-5.6-sol-xhigh"),
        ("claude-5", "claude-fable-5.1-high"),
        ("claude-opus-5", "claude-opus-5-max"),
        ("gemini-3.8", "gemini-3.8-flash-high"),
        ("grok-4.20", "grok-4.20-beta-0309-reasoning"),
        ("deepseek-v4.1", "deepseek-v4.1-flash-max"),
        ("deepseek-v4.1-hyphen", "deepseek-v4-1-flash"),
        ("glm-5.3", "glm-5.3-flash"),
        ("kimi-k3", "kimi-k3-gateway-max"),
        ("hunyuan", "hunyuan-hy3-preview"),
        ("ernie", "ernie-5.1-0508-release"),
        ("stepfun", "step-3.7-flash"),
        ("seed", "seed-2.1-pro-preview"),
    ]
    js = (
        "import {matchKnownModels} from './src/classify.js';"
        "const p=JSON.parse(process.argv[1]);"
        "for(const [label,sample] of p){const m=matchKnownModels(sample);"
        "console.log(label+'|'+sample+'|'+(m.length?m[0].family+'/'+m[0].gen:'MISS'));}"
    )
    try:
        out = subprocess.run(
            ["node", "--input-type=module", "-e", js, json.dumps(probes)],
            cwd=str(HERE), capture_output=True, text=True, encoding="utf-8", timeout=60)
        for line in (out.stdout or "").strip().splitlines():
            if "|" not in line:
                continue
            label, sample, res = line.split("|", 2)
            in_cat = any(sample.lower() in n.lower() for names in catalog.values() for n in names)
            flag = "OK " if res != "MISS" else "!! "
            print(f"  {flag}{label:<20} catalog={in_cat}  registry={res}")
        if out.returncode != 0:
            print(f"  (node 检查失败: {(out.stderr or '')[:200]})")
    except Exception as e:
        print(f"  (跳过注册表比对: {e})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
