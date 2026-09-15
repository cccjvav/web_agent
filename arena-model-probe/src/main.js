/**
 * main.js — 编排入口
 *
 * 目标：装钩子 → 收证据 → 首帧快判 → 每次完整响应精判 → 自动建档。
 * 预算：从页面发消息到 HUD 出首判，目标 < 800ms（首帧即判）。
 */

import { scheduleBoot } from './lifecycle.js';
import { BUS, installFetchHook, installXHRHook, installSocketHook } from './interceptor.js';
import { classify } from './classify.js';
import { learnFromObservation, listLearned, exportLearned, backfillNames,
         recordRealModel, listRealModels } from './learned.js';
import { matchTokenizer, runCanaries, buildProbePack } from './probe.js';
import { refreshModelMap, resolveEvidence, mapStats, isUuid, resolveModelId } from './idmap.js';
import { startAutoResolve, acceptToken, fetchRunModels, pollRunModels,
         pushModelEvidence, state as runState, reset as runReset,
         extractModelLabels } from './runmodel.js';
import { HUD } from './ui.js';
import { REGISTRY_VERSION } from './registry.js';

export const VERSION = '1.0.0';

export function boot(opts = {}) {
  if (window.__MODEL_PROBE__) return window.__MODEL_PROBE__;
  if (window.__MODEL_PROBE_BOOTED__) throw new Error('Probe startup is incomplete; reload the page before retrying.');
  // Keep a failure marker too: partially installed hooks must not be stacked.
  window.__MODEL_PROBE_BOOTED__ = VERSION;
  const cfg = {
    showHUD: true,
    learn: true,
    autoBackfillMs: 30000,
    ...opts,
  };

  // 1) 先装钩子（越早越好，抢在页面自己的 fetch 之前）
  installFetchHook();
  installXHRHook();
  installSocketHook();

  const state = { hud: null, lastVerdict: null, lastObservation: null, slots: {}, t0: performance.now() };

  if (cfg.showHUD && typeof document !== 'undefined' && document.documentElement) {
    state.hud = new HUD(document.documentElement);
    state.hud.onAction = (act) => {
      if (act === 'rescan') { recompute('manual'); state.hud.log('手动重新判定'); }
      if (act === 'dump') {
        const dump = buildDump(state);
        console.log('[amp] evidence dump', dump);
        copy(JSON.stringify(dump, null, 2));
        state.hud.log('证据已复制到剪贴板（同时输出到 console）');
      }
      if (act === 'export') {
        copy(exportLearned());
        state.hud.log('指纹库已复制到剪贴板');
      }
    };
    state.hud.log(`探针 v${VERSION} 已挂载，指纹库 ${REGISTRY_VERSION}`);
    state.hud.log('等待页面发起对话请求…');
  }

  /* ---------------- 装载 UUID → 模型名 映射（揭示机制） ---------------- */
  // 为什么要异步拉取：映射表来自排行榜 RSC 载荷，会随官方更新而变化。
  // 有了它，消息层/网络层拿到的 UUID 才能还原成 gpt-6-astra-high 这样的真名。
  (async () => {
    try {
      const r = await refreshModelMap();
      if (state.hud) state.hud.log(`模型映射表已装载 ${r.loaded} 条`);
    } catch (e) {
      if (state.hud) state.hud.log(`映射表装载失败: ${e && e.message}`);
    }
  })();

  /* ---------------- 自动解析运行标签（未核验）（核心能力） ---------------- */
  // 流程：流里出现 public-access-token → 解出 run id → 轮询 run trace
  //       → 提取 ai.streamText.doStream span 的模型标签 → 回灌为最高权重证据。
  // 这样探针就能直接显示 qwen3.8-max-0902 这类运行标签（未核验），而不只是"家族未知"。
  startAutoResolve({ initialDelayMs: 8000, maxMs: 180000, intervalMs: 6000 });

  BUS.on((evt) => {
    // ---- 第一环：接收流里下发的 token ----
    //
    // 实测踩过的坑：interceptor 会发出 'stream-header' 事件，但这里
    // 没有监听者，导致 token 流到 BUS 就断了，acceptToken 从未被调用，
    // 于是永远读不到 run trace，HUD 只能显示"模型家族未知"。
    if (evt.kind === 'stream-header') {
      const d = evt.data || {};
      try {
        if (acceptToken(d.name, d.value) && state.hud) {
          state.hud.log(`流头发现访问令牌: ${d.name}`);
        }
      } catch (e) {
        if (state.hud) state.hud.log(`令牌解析失败: ${e && e.message}`);
      }
      return;
    }

    if (!state.hud) return;

    if (evt.kind === 'run-token') {
      const d = evt.data || {};
      state.hud.log(`取得 run 令牌（runId=${d.runId || '?'}, 有效期 ${d.expiresInSec || '?'}s）`);
    }

    if (evt.kind === 'run-model') {
      const name = evt.data && evt.data.name;
      state.hud.log(`★ 运行标签（未核验）: ${name}`);
      // 把原始报告标签单独存档（历史VERIFIED状态不等于认证）：这类名字（如 qwen-latest-series-invite-202608-m4）
      // 常不在公开目录里，指纹无法归类，但这些只是来源自报的字符串。
      try {
        const r = recordRealModel(name, { runId: evt.data && evt.data.runId });
        if (r && r.kind === 'VERIFIED_NEW') {
          state.hud.log(`已存档运行标签（未核验）: ${name}`);
        }
      } catch { /* noop */ }
      // 关键：运行标签（未核验）到达时必须立刻重算并刷新 HUD。
      // 否则界面会停留在旧的「模型家族未知」上（实测踩过的坑）。
      recompute('run-model');
    }

    if (evt.kind === 'run-model-failed') {
      state.hud.log(`run trace 读取未得到模型名（${evt.data && evt.data.reason}）`);
    }
  });

  /* ---------------- 首帧快判（快速） ---------------- */
  BUS.on((evt) => {
    if (evt.kind === 'fast-verdict') {
      const d = evt.data;
      const v = quickVerdict(d);
      if (state.hud && (v.modelId || v.family)) {
        state.hud.log(`首帧命中: ${v.modelId || v.family}`);
        recompute('fast');
      }
    }
    if (evt.kind === 'evidence' && state.hud) {
      const e = evt.data;
      if (e.modelId && e.source !== 'sse.chunk.model') {
        state.hud.log(`证据 ${e.source}: ${e.modelId}`);
      }
    }
    if (evt.kind === 'observation') {
      state.lastObservation = evt.data;
      recompute('observation');
    }
  });

  /* ---------------- 完整判定 + 建档 ---------------- */
  function recompute(trigger) {
    // 先把 UUID 形态的 modelId 还原成运行标签（未核验）（揭示机制），
    // 再把还原结果纳入证据链 —— 这一步决定了能否给出「具体版本号」。
    try {
      const n = resolveEvidence(BUS.evidence);
      if (n && state.hud) state.hud.log(`UUID 还原 ${n} 个模型名`);
    } catch { /* noop */ }

    const evidence = BUS.evidence.filter(e => !e.stale);
    let verdict = classify(evidence);

    // ---- 运行标签（未核验）优先：只要 run trace 给了名字，就直接作为结论 ----
    //
    // 为什么需要这层兜底：classify 依赖证据链融合，若新名字不在注册表里
    // （如 qwen-latest-series-invite-202608-m4），融合结果会给出
    // RESOLVED 但 family/label 为空，HUD 仍显示"未知"。
    // 运行标签（未核验）由 worker 直接写入 run，仅为来源自报，不证明真实执行者。
    const rs = runState();
    if (rs.modelName) {
      const matched = classify([{ source: 'run.trace.model', weight: 1.0, modelId: rs.modelName }]);
      verdict = {
        ...matched,
        mode: 'RESOLVED',
        modelId: rs.modelName,
        label: matched.label || rs.modelName,     // 未归类时直接显示名字
        confidence: Math.max(verdict.confidence || 0, 0.96),
        note: matched.family
          ? `运行标签（未核验）来自 Trigger.dev run trace（worker 写入）`
          : `运行标签（未核验）来自 Trigger.dev run trace；该名称未收录于本地注册表，已按原样显示`,
        source: 'run.trace.model',
        reportedName: true, // The trace reports a label; it does not authenticate an executor.
        evidence: [
          { source: 'run.trace.model', detail: `run ${rs.runId || '?'} 的 streamText span 标签` },
          ...(verdict.evidence || []).slice(0, 5),
        ],
      };
    }

    verdict = { ...verdict, modelIdentityVerified: false };
    state.lastVerdict = verdict;
    state.slots = splitBySlot(evidence);

    let learnedSummary = null;
    if (cfg.learn && state.lastObservation) {
      const obsEv = evidence.filter(e => {
        if (!state.lastObservation.url) return true;
        return e.url === state.lastObservation.url;
      });
      try {
        const lv = learnFromObservation(state.lastObservation, obsEv);
        if (state.hud && lv && lv.kind === 'NEW_MODEL') {
          state.hud.log(`⚠ 发现未建档模型: ${lv.entry.resolved}（已写入指纹库）`);
        }
      } catch { /* noop */ }
      learnedSummary = summarizeLearned();
    }

    let tokenizer = null;
    if (state.lastObservation && state.lastObservation.promptTokens) {
      tokenizer = matchTokenizer(state.lastObservation.promptTokens);
    }

    // 主动探针：对响应文本跑 canary 判定，作为家族级旁证
    if (state.lastObservation && state.lastObservation.text) {
      const cand = runCanaries(state.lastObservation.text);
      for (const c of cand) {
        if (c.family || c.weight >= 0.3) {
          BUS.evidence.push({ ...c, source: c.source, url: state.lastObservation.url, t: performance.now() });
        }
      }
    }

    if (state.hud) {
      const lastH = rs.modelHistory[rs.modelHistory.length - 1] || {};
      state.hud.render(verdict, {
        observation: state.lastObservation,
        learnedSummary,
        tokenizer,
        slots: state.slots,
        realModel: rs.modelName
          ? { name: rs.modelName, runId: rs.runId, tokens: lastH.tokens, all: lastH.all }
          : null,
        runInfo: rs.runId ? { runId: rs.runId, reason: rs.lastError } : null,
      });
    }
    return verdict;
  }

  function quickVerdict(d) {
    const evidence = BUS.evidence.filter(e => e.url === d.url || e.modelId);
    return classify(evidence);
  }

  /* ---------------- 定时回填匿名簇命名 ---------------- */
  if (cfg.autoBackfillMs > 0) {
    setInterval(() => {
      const n = backfillNames();
      if (n && state.hud) state.hud.log(`回填 ${n} 条匿名簇命名`);
    }, cfg.autoBackfillMs);
  }

  // 暴露 API 给控制台/自动化
  const api = {
    version: VERSION,
    bus: BUS,
    hud: state.hud,
    state,
    classify: () => ({ ...classify(BUS.evidence), modelIdentityVerified: false }),
    observations: () => BUS.observations,
    learned: () => listLearned(),
    export: () => exportLearned(),
    probePack: () => buildProbePack(),
    canaries: (text) => runCanaries(text),
    reset: () => { BUS.evidence.length = 0; BUS.observations.length = 0; recompute('reset'); },

    // ---- UUID → 模型名（揭示机制）----
    /** 重新拉取映射表（官方更新模型后调用） */
    refreshMap: () => refreshModelMap(),
    /** 直接查一个 UUID */
    resolve: (id) => resolveModelId(id),
    /** 映射表统计 */
    mapStats: () => mapStats(),
    /** 手动把证据里的 UUID 全量还原 */
    resolveEvidence: () => resolveEvidence(BUS.evidence),
    /** 判断是否 UUID */
    isUuid,

    // ---- 运行标签（未核验）（Trigger.dev run trace）----
    /** 当前 run 状态（token / runId / 已解析出的模型名 / 历史） */
    runState: () => runState(),
    /** 手动触发一次 trace 读取 */
    fetchRunModels: (opts) => fetchRunModels(opts),
    /** 轮询直到拿到模型名 */
    pollRunModels: (opts) => pollRunModels(opts),
    /** 从 trace 文本提取模型标签（离线可用） */
    extractFromTrace: (text) => extractModelLabels(text),
    /** 当前运行标签（未核验）（最常需要的接口） */
    realModel: () => runState().modelName,
    /** 手动喂入 token（调试用） */
    acceptToken: (name, value) => acceptToken(name, value),
    /** 已存档的运行标签（未核验）列表 */
    realModels: () => listRealModels(),
    /** 手动记录一个运行标签（未核验） */
    recordRealModel: (name, meta) => recordRealModel(name, meta),
  };
  try { window.__MODEL_PROBE__ = api; } catch { /* noop */ }
  return api;
}

function splitBySlot(evidence) {
  const out = {};
  for (const e of evidence) {
    if (!e.slot) continue;
    const s = e.slot;
    out[s] = out[s] || { evidence: [] };
    out[s].evidence.push(e);
  }
  for (const s of Object.keys(out)) {
    const v = classify(out[s].evidence);
    out[s] = { modelId: v.modelId, label: v.label, family: v.family, gen: v.gen, confidence: v.confidence, mode: v.mode };
  }
  return out;
}

function summarizeLearned() {
  const all = listLearned();
  return {
    total: all.length,
    unseen: all.filter(e => e.status === 'UNSEEN').length,
    anon: all.filter(e => e.status === 'ANON_CLUSTER').length,
  };
}

function buildDump(state) {
  return {
    probe: 'arena-model-probe',
    version: VERSION,
    at: new Date().toISOString(),
    href: location.href,
    verdict: state.lastVerdict,
    slots: state.slots,
    observation: state.lastObservation
      ? { ...state.lastObservation, text: (state.lastObservation.text || '').slice(0, 4000) }
      : null,
    evidence: BUS.evidence.slice(-120).map(e => ({
      source: e.source, weight: e.weight, modelId: e.modelId,
      family: e.family, detail: e.detail, url: e.url, slot: e.slot,
    })),
  };
}

function copy(text) {
  try { navigator.clipboard.writeText(text); } catch { /* noop */ }
}

// Re-injection never silently replaces a live/partial instance. Reload to update.
if (typeof window !== 'undefined') {
  const scheduled = scheduleBoot(window, document, VERSION, () => boot());
  if (!scheduled && window.__MODEL_PROBE__?.version !== VERSION) {
    console.warn('[amp] Existing or pending probe retained; reload the page to update. No second instance was started.');
  }
}
