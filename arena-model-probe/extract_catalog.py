#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_catalog.py — 从 arena.ai 排行榜提取【完整】权威模型目录

为什么关键：实测发现 arena.ai Agent Mode 是盲测（不披露 modelId），
但排行榜公开列出全部参评模型。这份目录是 ground truth：
  1. 替代我此前靠经验猜的正则（我写的是 gpt-6，实际前沿是 gpt-5.6-sol/luna/terra）
  2. 让候选集收敛到真实存在的模型，大幅降低误判
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena_probe import CDP, cdp_alive, get_page, evaluate, log

JS = r"""
(async () => {
  const pages = ['/leaderboard', '/leaderboard/agent', '/leaderboard/text',
                 '/leaderboard/vision', '/leaderboard/webdev'];
  const out = { raw: {}, models: [], byOrg: {} };
  const modelSet = new Map();   // model_name -> {org}

  for (const p of pages) {
    try {
      const r = await fetch(p, { credentials: 'include' });
      if (!r.ok) { out.raw[p] = { status: r.status }; continue; }
      const t = await r.text();
      out.raw[p] = { status: r.status, len: t.length };

      // 从 RSC/JSON 里抓 model 对象
      // 形如: {"model_name":"...","organization":"...","model_id":"..."} 或 modelName/publicName
      for (const m of t.matchAll(/\{[^{}]{0,400}?"(?:model_name|modelName|publicName)"\s*:\s*"([^"]{2,90})"[^{}]{0,400}?\}/g)) {
        const block = m[0];
        const name = m[1];
        const om = block.match(/"(?:organization|organization_name|provider|org)"\s*:\s*"([^"]{2,50})"/);
        const org = om ? om[1] : null;
        if (!modelSet.has(name)) modelSet.set(name, { org });
        else if (org && !modelSet.get(name).org) modelSet.get(name).org = org;
      }

      // 兜底：抓所有像模型 slug 的字符串（排行榜里模型以 slug 出现）
      const slugRe = /\b((?:gpt|chatgpt|o[1-9])[-\s]?[\w.\-]{0,30}|claude[\w.\-]{2,40}|gemini[\w.\-]{2,40}|grok[\w.\-]{1,30}|deepseek[\w.\-]{2,40}|qwen[\w.\-]{1,30}|kimi[\w.\-]{1,30}|glm[\w.\-]{1,30}|llama[\w.\-]{1,30}|mistral[\w.\-]{1,30}|doubao[\w.\-]{1,30}|minimax[\w.\-]{1,30}|command[\w.\-]{1,20}|phi[\w.\-]{1,20}|nemotron[\w.\-]{0,20}|jamba[\w.\-]{0,20}|ernie[\w.\-]{1,20}|hunyuan[\w.\-]{1,20}|step[\w.\-]{1,20}|seed[\w.\-]{1,20})\b/gi;
      for (const m of t.matchAll(slugRe)) {
        const s = m[1];
        if (s.length < 3 || s.length > 60) continue;
        if (!modelSet.has(s)) modelSet.set(s, { org: null });
      }
    } catch (e) { out.raw[p] = { error: String(e.message) }; }
  }

  out.models = [...modelSet.entries()].map(([name, meta]) => ({ name, org: meta.org }));
  const orgMap = {};
  for (const { name, org } of out.models) {
    const k = org || 'unknown';
    (orgMap[k] = orgMap[k] || []).push(name);
  }
  out.byOrg = orgMap;
  out.count = out.models.length;
  return out;
})()
"""


def norm_org(name, org):
    """把组织名归一到家族键"""
    n = (name or "").lower()
    o = (org or "").lower()
    rules = [
        ("openai", r"^gpt|^chatgpt|^o[1-9](-|$)|openai|davinci|gpt-oss"),
        ("anthropic", r"claude|anthropic"),
        ("google", r"gemini|palm|bard|google|gemma"),
        ("xai", r"grok|xai|x\.ai"),
        ("deepseek", r"deepseek"),
        ("qwen", r"qwen|tongyi|ali"),
        ("moonshot", r"kimi|moonshot"),
        ("zhipu", r"glm|chatglm|zhipu"),
        ("minimax", r"minimax|abab"),
        ("bytedance", r"doubao|seed|skylark|bytedance|volc"),
        ("meta", r"llama|meta"),
        ("mistral", r"mistral|mixtral|codestral|magistral|devstral"),
        ("cohere", r"command[-\s]?[ar]|cohere"),
        ("nvidia", r"nemotron|nvidia"),
        ("microsoft", r"^phi|microsoft"),
        ("ai21", r"jamba|ai21"),
        ("baidu", r"ernie|wenxin|baidu"),
        ("tencent", r"hunyuan|tencent"),
        ("stepfun", r"^step|stepfun"),
        ("amazon", r"nova|amazon|titan"),
        ("reka", r"reka"),
        ("perplexity", r"sonar|perplexity"),
        ("inception", r"mercury|inception"),
        ("liquid", r"lfm|liquid"),
        ("allenai", r"olmo|tulu|allen"),
        ("upstage", r"solar|upstage"),
        ("naver", r"hyperclova|naver"),
        ("sakana", r"sakana"),
        ("ai2", r"molmo"),
    ]
    for key, pat in rules:
        if re.search(pat, n, re.I) or re.search(pat, o, re.I):
            return key
    return "other"


def main():
    if not cdp_alive():
        log("[!] CDP 未就绪")
        return 2
    page = get_page()
    if not page:
        log("[!] 无页面")
        return 2

    cdp = CDP(page["webSocketDebuggerUrl"], timeout=120).connect()
    try:
        cdp.call("Runtime.enable")
        d = evaluate(cdp, JS, await_promise=True)
    finally:
        cdp.close()

    Path("recon").mkdir(exist_ok=True)
    Path("recon/catalog-full.json").write_text(
        json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")

    log("")
    log("=== 抓取概览 ===")
    for p, v in (d.get("raw") or {}).items():
        log(f"  {p}: {v}")

    models = d.get("models") or []
    log("")
    log(f"=== 共提取 {len(models)} 个模型名 ===")

    by_family = defaultdict(list)
    for m in models:
        fam = norm_org(m.get("name"), m.get("org"))
        by_family[fam].append(m["name"])

    log("")
    for fam in sorted(by_family, key=lambda k: -len(by_family[k])):
        names = sorted(set(by_family[fam]))
        log(f"--- {fam} ({len(names)}) ---")
        for n in names:
            log(f"    {n}")
        log("")

    Path("recon/catalog-by-family.json").write_text(
        json.dumps({k: sorted(set(v)) for k, v in by_family.items()},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    log("[*] 已写入 recon/catalog-full.json 与 recon/catalog-by-family.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
