/**
 * interceptor.js — 页面内网络采集层（有界旁路采样，不承诺零侵入）
 *
 * 原理：模型身份最硬的证据是"页面自己发出去/收回来的网络流量"。
 * 所以我们在页面最早的时机接管 fetch / XHR / EventSource，旁路读取（clone），
 * 保留原Response对象；旁路采样仍有资源和时序成本，不能保证任意网站无影响。
 *
 * 目标：< 800ms 内给出首判（第一个 SSE chunk 到达即可判定）。
 */

import {
  collectModelFields, scanTextForModel, evidenceFromHeaders, protocolFingerprint,
} from './classify.js';

export const BUS = {
  evidence: [],      // 结构化证据
  observations: [],  // 每次完整对话的观测（用于指纹建档）
  listeners: [],
  on(fn) {
    if (typeof fn !== 'function') throw new TypeError('Listener must be a function');
    const listener = evt => fn(evt);
    this.listeners.push(listener);
    return () => { const i = this.listeners.indexOf(listener); if (i >= 0) this.listeners.splice(i, 1); };
  },
  emit(evt) {
    // Snapshot: subscriptions changed by a callback take effect on the next event.
    for (const fn of [...this.listeners]) {
      try { Promise.resolve(fn(evt)).catch(() => {}); } catch { /* isolate observers */ }
    }
  },
  addObservation(obs) {
    this.observations.push(obs);
    if (this.observations.length > 20) this.observations.splice(0, this.observations.length - 20);
  },
  push(e, notify = true) {
    this.evidence.push(e);
    if (this.evidence.length > 500) this.evidence.splice(0, 200);
    if (notify) this.emit({ kind: 'evidence', data: e });
  },
};

const now = () => performance.now();
export const CAPTURE_LIMITS = Object.freeze({ bytes: 1024 * 1024, line: 65536, chunks: 4096, text: 200000, active: 4, deadlineMs: 15000 });
const activeCaptures = new Set();
export function stopCaptures() { for (const stop of [...activeCaptures]) stop('stopped'); }
export async function readCapture(body, consume) {
  if (!body || activeCaptures.size >= CAPTURE_LIMITS.active) return 'capacity-or-no-body';
  const reader = body.getReader(); let reason = null, bytes = 0, chunks = 0;
  const stop = why => { reason = reason || why; reader.cancel().catch(() => {}); };
  activeCaptures.add(stop);
  const timer = setTimeout(() => stop('deadline'), CAPTURE_LIMITS.deadlineMs);
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done || reason) break;
      if (++chunks > CAPTURE_LIMITS.chunks) { stop('chunk-limit'); break; }
      bytes += part.value.byteLength;
      if (bytes > CAPTURE_LIMITS.bytes) { stop('byte-limit'); break; }
      if (consume(part.value) === false) { stop('parser-limit'); break; }
    }
  } catch (_) { stop('read-failed'); }
  finally { clearTimeout(timer); activeCaptures.delete(stop); reader.releaseLock(); }
  return reason;
}

/**
 * 判断是否像 AI 推理请求（避免把静态资源也解析）
 *
 * 两层判定：
 *  - URL 层：路径含 completions/chat/messages 等，或主机是已知厂商/网关
 *  - 内容类型层：text/event-stream 本身就是强信号（匿名网关路径不可预测）
 *
 * 三层排除（每一层都是实测踩坑后加的）：
 *  1. 静态资源
 *  2. 遥测/分析/监控域 —— 这类端点 URL 里常含 /api/，会被"疑似 LLM"规则误收，
 *     而它们的 payload 是通用 JSON（含 code/message/request_id 等），
 *     足以命中错误的协议指纹，制造假阳性。
 *     实测事故：Datadog RUM 上报被当成模型响应，导致误报 qwen 家族。
 *  3. 同域但明确与推理无关的路径
 */
const TELEMETRY_RE = /(?:datadoghq|datadog|posthog|sentry|amplitude|mixpanel|segment\.io|segment\.com|google-analytics|googletagmanager|hotjar|clarity\.ms|fullstory|logrocket|newrelic|nr-data|bugsnag|rollbar|trackjs|raygun|elastic\.co|honeycomb|lightstep|opentelemetry|otlp|statsig|launchdarkly|optimizely|split\.io|vwo\.com|matomo|plausible\.io|umami|vercel-insights|vercel\.com\/_vercel\/insights)/i;

const IRRELEVANT_PATH_RE = /(?:rum\/|_vercel\/insights|\/cdn-cgi\/|\/survey|\/feedback\/|\/beacon|\/log\/|\/logs\/|\/metrics\/|\/trace\/|\/analytics|\/telemetry)/i;

function isLikelyLLMUrl(url) {
  if (!url) return false;
  // 1) 静态资源
  if (/\.(?:js|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map|mp4|webp|avif)(?:\?|$)/i.test(url)) return false;
  // 2) 遥测/监控域（关键排除：否则会把分析上报当成模型响应）
  if (TELEMETRY_RE.test(url)) return false;
  // 3) 与推理无关的路径
  if (IRRELEVANT_PATH_RE.test(url)) return false;

  return /(?:completions?|chat|messages|generate|generateContent|streamGenerateContent|converse|invoke|agent|run|responses|assistant|thread|conversation|inference|chatbot|api\/v\d|\/api\/|\/rpc\/|\/graphql)/i.test(url)
    || /(?:openai|anthropic|generativelanguage|deepseek|x\.ai|openrouter|groq|together|mistral|cohere|dashscope|moonshot|bigmodel|volces|minimax)/i.test(url);
}

/** 响应是否值得解析：URL 像 LLM，或内容类型是流式 */
function shouldInspect(url, contentType) {
  if (TELEMETRY_RE.test(url || '')) return false;
  if (isStreamCT(contentType)) return true;
  if (/application\/json|text\/json/i.test(contentType || '') && isLikelyLLMUrl(url)) return true;
  return isLikelyLLMUrl(url);
}

function isStreamCT(ct) {
  return /text\/event-stream|application\/x-ndjson|application\/stream\+json|text\/plain/i.test(ct || '');
}

/** 读取 Headers 为普通对象 */
function headersToObj(h) {
  const o = {};
  try {
    if (h && typeof h.forEach === 'function') h.forEach((v, k) => { o[k.toLowerCase()] = v; });
    else if (Array.isArray(h)) for (const [k, v] of h) o[String(k).toLowerCase()] = v;
    else if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) o[String(k).toLowerCase()] = v;
  } catch { /* noop */ }
  return o;
}

/* ------------------------------------------------------------------ *
 * SSE 增量解析器：边流边解析，首帧即判定（"快速"的关键）
 * ------------------------------------------------------------------ */
export class SSETap {
  constructor(ctx, onChunk) {
    this.ctx = ctx;               // { url, requestModel, slot }
    this.onChunk = onChunk;
    this.buf = '';
    this.text = '';
    this.decoder = new TextDecoder('utf-8', { fatal: false });
    this.t0 = now();
    this.ttft = 0;
    this.chunks = 0;
    this.promptTokens = null;
    this.completionTokens = null;
    this.reasoningTokens = null;
    this.modelSeen = null;
    this.done = false;
    this.bytes = 0; this.linesSeen = 0; this.truncated = null;
  }

  feed(bytes) {
    if (this.done) return;
    this.bytes += typeof bytes === 'string' ? new TextEncoder().encode(bytes).byteLength : bytes.byteLength;
    if (this.bytes > CAPTURE_LIMITS.bytes || this.chunks >= CAPTURE_LIMITS.chunks) { this.truncated = 'input-limit'; this.buf = ''; this.finish(); return; }
    const s = typeof bytes === 'string' ? bytes : this.decoder.decode(bytes, { stream: true });
    if (!s) return;
    if (!this.ttft) this.ttft = now() - this.t0;
    this.chunks++;
    this.text += s;
    if (this.text.length > CAPTURE_LIMITS.text) this.text = this.text.slice(-CAPTURE_LIMITS.text);

    this.buf += s;
    const lines = this.buf.split('\n');
    this.buf = lines.pop();
    if (this.buf.length > CAPTURE_LIMITS.line || lines.some(line => line.length > CAPTURE_LIMITS.line)) { this.truncated = 'line-limit'; this.buf = ''; this.finish(); return; }
    for (const line of lines) { if (this.done) break; this.handleLine(line.trim()); }
    this.scanUsage();
  }

  handleLine(line) {
    if (++this.linesSeen > CAPTURE_LIMITS.chunks) { this.truncated = 'frame-limit'; this.buf = ''; this.finish(); return; }
    if (!line || line.startsWith(':')) return;
    // 记录事件名（realtime batch 协议靠 event: batch 识别）
    if (line.startsWith('event:')) {
      const ev = line.slice(6).trim().slice(0, 128);
      if (ev) {
        this.events = this.events || [];
        if (this.events.length < 64 && !this.events.includes(ev)) this.events.push(ev);
      }
      return;
    }
    let payload = line;
    if (line.startsWith('data:')) payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let obj = null;
    try { obj = JSON.parse(payload); } catch { /* 非 JSON，交给正则兜底 */ }

    if (obj) {
      // ---- arena.ai realtime batch：records[].body 是「JSON 字符串里再套 JSON」----
      // 必须二次解包，否则模型字段与帧类型都看不见（实测踩过的坑）。
      if (Array.isArray(obj.records)) {
        for (const rec of obj.records) {
          // headers 帧里带 public-access-token —— 这是读取真实模型名的钥匙。
          // 结构：{"seq_num":N,"headers":[["public-access-token","eyJ..."]],...}
          if (Array.isArray(rec.headers)) {
            for (const h of rec.headers) {
              if (Array.isArray(h) && typeof h[0] === 'string' && typeof h[1] === 'string') {
                BUS.emit({ kind: 'stream-header', data: { name: h[0], value: h[1], url: this.ctx.url } });
              }
            }
          }
          if (typeof rec.body !== 'string') continue;
          let inner = null;
          try { inner = JSON.parse(rec.body); } catch { continue; }
          this.consumeFrame(inner, `seq${rec.seq_num}`);
        }
      }
      // 顶层也可能直接带 headers
      if (Array.isArray(obj.headers)) {
        for (const h of obj.headers) {
          if (Array.isArray(h) && typeof h[0] === 'string' && typeof h[1] === 'string') {
            BUS.emit({ kind: 'stream-header', data: { name: h[0], value: h[1], url: this.ctx.url } });
          }
        }
      }
      this.consumeFrame(obj, `chunk${this.chunks}`);
    } else {
      for (const v of scanTextForModel(payload)) {
        if (!this.modelSeen) this.modelSeen = v;
        BUS.push({ source: 'sse.chunk.model', weight: 0.82, modelId: v, detail: 'regex-fallback', url: this.ctx.url, slot: this.ctx.slot, t: now() });
      }
    }

    if (this.chunks <= 3 && this.onChunk) this.onChunk(this); // 首帧快判钩子
  }

  /**
   * consumeFrame — 处理一个（可能嵌套的）协议帧
   *
   * 为什么要递归：arena.ai 的 realtime batch 把真实帧放在 records[].body 里，
   * 而 body 本身又是一段 JSON 字符串；某些网关还会再包一层 data。
   * 不递归就会漏掉 type/model 等关键字段。
   */
  consumeFrame(obj, where, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;

    // 1) 模型字段
    const hits = collectModelFields(obj);
    for (const h of hits) {
      if (!this.modelSeen) this.modelSeen = h.value;
      BUS.push({
        source: 'sse.chunk.model', weight: 0.90, modelId: h.value,
        detail: `${h.path} @${where}`, url: this.ctx.url,
        slot: this.ctx.slot, t: now(),
      });
    }

    // 2) 协议帧类型（Vercel AI SDK stream parts 与各家原生帧）
    this.frames = this.frames || [];
    const tag = obj.type || obj.object || (Array.isArray(obj.candidates) ? 'candidates' : null);
    if (typeof tag === 'string' && this.frames.length < 64 && !this.frames.includes(tag)) this.frames.push(tag.slice(0, 128));

    // 3) 递归解包常见的嵌套容器
    for (const key of ['data', 'delta', 'message', 'response', 'payload', 'event']) {
      const v = obj[key];
      if (v && typeof v === 'object') this.consumeFrame(v, `${where}.${key}`, depth + 1);
      else if (typeof v === 'string' && v.length > 2 && v[0] === '{') {
        try { this.consumeFrame(JSON.parse(v), `${where}.${key}`, depth + 1); } catch { /* 非 JSON */ }
      }
    }
  }

  scanUsage() {
    const t = this.text.slice(-8192);
    const pick = (re) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const p = pick(/"prompt_tokens"\s*:\s*(\d+)/) ?? pick(/"input_tokens"\s*:\s*(\d+)/) ?? pick(/"promptTokenCount"\s*:\s*(\d+)/);
    const c = pick(/"completion_tokens"\s*:\s*(\d+)/) ?? pick(/"output_tokens"\s*:\s*(\d+)/) ?? pick(/"candidatesTokenCount"\s*:\s*(\d+)/);
    const r = pick(/"reasoning_tokens"\s*:\s*(\d+)/) ?? pick(/"thoughtsTokenCount"\s*:\s*(\d+)/);
    if (p != null) this.promptTokens = p;
    if (c != null) this.completionTokens = c;
    if (r != null) this.reasoningTokens = r;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    if (this.buf && !this.truncated) this.handleLine(this.buf.trim());

    const obs = {
      url: this.ctx.url,
      requestModel: this.ctx.requestModel || null,
      slot: this.ctx.slot || null,
      tStart: this.t0,
      ttftMs: Math.round(this.ttft),
      totalMs: Math.round(now() - this.t0),
      chunks: this.chunks,
      text: this.text, truncated: this.truncated,
      frames: this.frames || [],
      events: this.events || [],
      modelSeen: this.modelSeen,
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      reasoningTokens: this.reasoningTokens,
    };

    const proto = protocolFingerprint(this.text);
    for (const p of proto) {
      BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: `${p.label} [${p.matched.join('|')}]`, url: this.ctx.url, slot: this.ctx.slot, t: now() });
    }

    BUS.addObservation(obs);
    BUS.emit({ kind: 'observation', data: obs });
  }
}

/* ------------------------------------------------------------------ *
 * 槽位（Model A / Model B）推断：
 *   盲测站点会把两个模型并列，我们通过"哪个 DOM 子树里触发了这次请求"来归属。
 * ------------------------------------------------------------------ */
function inferSlot() {
  try {
    const el = document.activeElement;
    let node = el;
    let i = 0;
    while (node && i++ < 12) {
      const attrs = [
        node.getAttribute && node.getAttribute('data-testid'),
        node.getAttribute && node.getAttribute('data-slot'),
        node.getAttribute && node.getAttribute('aria-label'),
        node.id, node.className && String(node.className).slice(0, 120),
      ].filter(Boolean).join(' ');
      const m = attrs.match(/\b(?:model|side|slot|assistant|panel|column|pane)[-_ ]?([abAB])\b/);
      if (m) return m[1].toUpperCase();
      node = node.parentElement;
    }
    // 退路：按可见面板水平位置猜（左 A 右 B）
    const act = document.activeElement;
    if (act && act.getBoundingClientRect) {
      const r = act.getBoundingClientRect();
      if (r.width > 0 && window.innerWidth > 0) return r.left + r.width / 2 < window.innerWidth / 2 ? 'A' : 'B';
    }
  } catch { /* noop */ }
  return null;
}

/* ------------------------------------------------------------------ *
 * 安装 fetch 钩子
 * ------------------------------------------------------------------ */
export function installFetchHook() {
  const origFetch = window.fetch;
  if (!origFetch || origFetch.__probeWrapped) return;
  const wrapped = function (input, init) {
    let url = '', reqModel = null, reqHeaders = {};
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      const body = init && init.body;
      if (typeof body === 'string' && body.length <= 32768 && isLikelyLLMUrl(url)) {
        reqHeaders = headersToObj(init.headers);
        try {
          const j = JSON.parse(body);
          const hits = collectModelFields(j);
          if (hits.length) { reqModel = hits[0].value; }
          if (!reqModel && typeof j.model === 'string') reqModel = j.model;
          if (j.model) BUS.push({ source: 'request.body.model', weight: 1.0, modelId: j.model, detail: `fetch body .model`, url, slot: inferSlot(), t: now() });
        } catch { /* 非 JSON */ }
      }
    } catch { /* noop */ }

    const slot = inferSlot();
    const p = origFetch.apply(this, arguments);
    if (!url) return p;

    return p.then((res) => {
      try {
        const hdrs = headersToObj(res.headers);
        const ct = hdrs['content-type'] || '';
        if (!shouldInspect(res.url || url, ct)) return res;

        for (const e of evidenceFromHeaders(hdrs, res.url || url)) {
          BUS.push({ ...e, slot, t: now() });
        }
        if (isStreamCT(ct) || !ct) {
          const tap = new SSETap({ url: res.url || url, requestModel: reqModel, slot }, (t) => {
            // 首帧快判：把证据立刻喂给判定器并由 UI 呈现
            BUS.emit({ kind: 'fast-verdict', data: { url: res.url || url, slot, modelSeen: t.modelSeen } });
          });
          if (res.body && activeCaptures.size < CAPTURE_LIMITS.active) {
            readCapture(res.clone().body, bytes => { tap.feed(bytes); return !tap.done; })
              .then(reason => { tap.truncated = tap.truncated || reason; tap.finish(); }).catch(() => {});
          }
          return res;
        }
        if (res.body && activeCaptures.size < CAPTURE_LIMITS.active) {
          let text = ''; const decoder = new TextDecoder();
          readCapture(res.clone().body, bytes => { text += decoder.decode(bytes, { stream: true }); })
            .then(reason => {
              if (reason) return; // Never classify a truncated JSON document as complete evidence.
              const j = JSON.parse(text + decoder.decode());
              for (const h of collectModelFields(j)) BUS.push({ source: 'response.json.model', weight: 0.93, modelId: h.value, detail: h.path, url: res.url || url, slot, t: now() });
              for (const p2 of protocolFingerprint(text.slice(0, CAPTURE_LIMITS.text))) BUS.push({ source: 'protocol.framing', weight: p2.score, family: p2.family, detail: p2.label, url, slot, t: now() });
            }).catch(() => {});
        }
        return res;
      } catch { return res; }
    });
  };
  wrapped.__probeWrapped = true;
  wrapped.__orig = origFetch;
  window.fetch = wrapped;
}

/* ------------------------------------------------------------------ *
 * 安装 XHR 钩子
 * ------------------------------------------------------------------ */
export function installXHRHook() {
  const XO = window.XMLHttpRequest;
  if (!XO || XO.__probeWrapped) return;
  const origOpen = XO.prototype.open;
  const origSend = XO.prototype.send;

  XO.prototype.open = function (method, url) {
    this.__probeUrl = url;
    return origOpen.apply(this, arguments);
  };
  XO.prototype.send = function (body) {
    const url = this.__probeUrl || '';
    const slot = inferSlot();
    if (this.__probeOnLoad) this.removeEventListener('load', this.__probeOnLoad);
    // 注意：send 阶段拿不到响应头，所以不能在这里用内容类型过滤，
    // 否则匿名网关路径的 XHR 会被整体漏掉。改为广挂 load 监听，
    // 真正的过滤放在 load 里按 content-type 做（成本可忽略）。
    if (url) {
      if (isLikelyLLMUrl(url)) {
        try {
          if (typeof body === 'string' && body.length <= 32768) {
            const j = JSON.parse(body);
            if (j && typeof j.model === 'string') {
              BUS.push({ source: 'request.body.model', weight: 1.0, modelId: j.model, detail: 'xhr body .model', url, slot, t: now() });
            }
          }
        } catch { /* noop */ }
      }

      this.__probeOnLoad = () => {
        try {
          const hdrs = {};
          (this.getAllResponseHeaders() || '').split(/\r?\n/).forEach(l => {
            const i = l.indexOf(':');
            if (i > 0) hdrs[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
          });
          if (!shouldInspect(this.responseURL || url, hdrs['content-type'])) return;
          for (const e of evidenceFromHeaders(hdrs, this.responseURL || url)) BUS.push({ ...e, slot, t: now() });
          const text = typeof this.responseText === 'string' ? this.responseText.slice(0, CAPTURE_LIMITS.text) : '';
          if (text) {
            for (const v of scanTextForModel(text)) {
              BUS.push({ source: 'response.json.model', weight: 0.88, modelId: v, detail: 'xhr regex', url, slot, t: now() });
            }
            for (const p of protocolFingerprint(text)) {
              BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now() });
            }
            BUS.addObservation({
              url, slot, ttftMs: 0, totalMs: 0, text, truncated: this.responseText.length > CAPTURE_LIMITS.text ? 'text-limit' : null,
              promptTokens: null, completionTokens: null, reasoningTokens: null,
              modelSeen: scanTextForModel(text)[0] || null, frames: [],
            });
            BUS.emit({ kind: 'observation', data: BUS.observations[BUS.observations.length - 1] });
          }
        } catch { /* noop */ }
      };
      this.addEventListener('load', this.__probeOnLoad, { once: true });
    }
    return origSend.apply(this, arguments);
  };
  XO.__probeWrapped = true;
  window.XMLHttpRequest = XO;
}

/* ------------------------------------------------------------------ *
 * 安装 WebSocket / EventSource 钩子
 * ------------------------------------------------------------------ */
export function installSocketHook() {
  if (window.WebSocket && !window.WebSocket.__probeWrapped) {
    const OW = window.WebSocket;
    const W = function (url, protocols) {
      if (!new.target) throw new TypeError('WebSocket requires new');
      const ws = Reflect.construct(OW, Array.from(arguments), new.target);
      const slot = inferSlot();
      try {
        ws.addEventListener('message', (ev) => {
          const d = typeof ev.data === 'string' ? ev.data : '';
          if (!d || d.length < 4 || d.length > CAPTURE_LIMITS.line) return;
          for (const v of scanTextForModel(d)) {
            BUS.push({ source: 'sse.chunk.model', weight: 0.85, modelId: v, detail: 'ws message', url, slot, t: now() });
          }
          for (const p of protocolFingerprint(d)) {
            BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now() });
          }
        });
      } catch { /* noop */ }
      return ws;
    };
    W.prototype = OW.prototype; Object.setPrototypeOf(W, OW);
    W.__probeWrapped = true;
    window.WebSocket = W;
  }

  if (window.EventSource && !window.EventSource.__probeWrapped) {
    const OE = window.EventSource;
    const E = function (url, cfg) {
      if (!new.target) throw new TypeError('EventSource requires new');
      const es = Reflect.construct(OE, Array.from(arguments), new.target);
      const slot = inferSlot();
      try {
        es.addEventListener('message', (ev) => {
          const d = typeof ev.data === 'string' ? ev.data : '';
          if (!d || d.length > CAPTURE_LIMITS.line) return;
          for (const v of scanTextForModel(d)) {
            BUS.push({ source: 'sse.chunk.model', weight: 0.86, modelId: v, detail: 'eventsource', url, slot, t: now() });
          }
          for (const p of protocolFingerprint(d)) {
            BUS.push({ source: 'protocol.framing', weight: p.score, family: p.family, detail: p.label, url, slot, t: now() });
          }
        });
      } catch { /* noop */ }
      return es;
    };
    E.prototype = OE.prototype; Object.setPrototypeOf(E, OE);
    E.__probeWrapped = true;
    window.EventSource = E;
  }
}
