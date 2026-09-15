/**
 * ui.js — 轻量 HUD（Shadow DOM 隔离，不污染页面样式）
 *
 * 为什么用 Shadow DOM：arena 类站点 CSS 复杂，内联样式极易被覆盖；
 * Shadow DOM 保证探针面板在任意站点都渲染一致，也不会反向影响页面。
 */

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 16px; top: 16px; z-index: 2147483647;
  width: 360px; max-height: 78vh; overflow: auto;
  font: 12px/1.5 "SF Mono", ui-monospace, Consolas, monospace;
  color: #e6edf3; background: rgba(13,17,23,.94);
  border: 1px solid #30363d; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,.55);
  backdrop-filter: blur(10px);
}
.hd { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:move;
  border-bottom:1px solid #30363d; background:rgba(22,27,34,.9); border-radius:10px 10px 0 0; }
.dot { width:8px;height:8px;border-radius:50%;background:#3fb950;flex:0 0 auto; }
.dot.warn{background:#d29922}.dot.bad{background:#f85149}
.ttl { font-weight:600;letter-spacing:.3px; flex:1; }
.mini { cursor:pointer;opacity:.65;padding:0 4px;user-select:none }
.mini:hover{opacity:1}
.bd { padding:10px; }
.verdict { border-radius:8px; padding:10px; margin-bottom:8px; border:1px solid #30363d; background:#161b22; }
.mode { font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.7; }
.model { font-size:15px; font-weight:700; margin:3px 0; word-break:break-all; }
.meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; }
.tag { font-size:10px; padding:2px 6px; border-radius:999px; background:#21262d; border:1px solid #30363d; }
.tag.ok{background:#0f2f1a;border-color:#238636;color:#7ee787}
.tag.new{background:#3d2a00;border-color:#9e6a03;color:#e3b341}
.tag.warn{background:#3d1418;border-color:#8e1519;color:#ff7b72}
.tag.inf{background:#0c2d6b22;border-color:#1f6feb;color:#79c0ff}
.bar { height:6px;border-radius:3px;background:#21262d;overflow:hidden;margin-top:6px }
.bar > i { display:block;height:100%;background:linear-gradient(90deg,#1f6feb,#3fb950); }
.sec { margin-top:9px; font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.55; }
.row { display:flex; gap:6px; align-items:baseline; padding:2px 0; border-bottom:1px dashed #21262d; }
.row:last-child{border-bottom:0}
.k { opacity:.6; flex:0 0 92px; }
.v { flex:1; word-break:break-all; }
.ev { font-size:11px; opacity:.85; padding:2px 0; word-break:break-all; }
.ev b { color:#79c0ff; font-weight:600 }
.btns { display:flex; gap:6px; margin-top:9px; flex-wrap:wrap }
button { font:inherit; padding:4px 8px; border-radius:6px; cursor:pointer;
  background:#21262d; color:#e6edf3; border:1px solid #30363d; }
button:hover{background:#30363d}
button.pri{background:#1f6feb;border-color:#1f6feb}
button.pri:hover{background:#388bfd}
.log { max-height:130px; overflow:auto; font-size:10.5px; opacity:.8; margin-top:6px;
  border-top:1px solid #21262d; padding-top:5px }
.log div{ padding:1px 0 }
.hide .bd, .hide .ft { display:none }
`;

export class HUD {
  constructor(root = document.documentElement) {
    this.host = document.createElement('div');
    this.host.id = 'amp-hud';
    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);
    this.root = document.createElement('div');
    this.root.className = 'wrap';
    this.shadow.appendChild(this.root);
    root.appendChild(this.host);
    this.logs = [];
    this.render(null);
    this._draggable();
  }

  _draggable() {
    this.root.addEventListener('mousedown', (e) => {
      const hd = e.target.closest('.hd');
      if (!hd || e.target.classList.contains('mini')) return;
      const r = this.root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = (ev) => {
        this.root.style.left = (ev.clientX - dx) + 'px';
        this.root.style.top = (ev.clientY - dy) + 'px';
        this.root.style.right = 'auto';
      };
      const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });
  }

  log(msg, kind = 'info') {
    const t = new Date().toTimeString().slice(0, 8);
    this.logs.unshift(`<div>[${t}] ${esc(msg)}</div>`);
    if (this.logs.length > 60) this.logs.pop();
    const el = this.shadow.querySelector('.log');
    if (el) el.innerHTML = this.logs.join('');
  }

  confidenceClass(c) { return c >= 0.8 ? 'ok' : c >= 0.5 ? 'inf' : 'warn'; }

  render(v, extras = {}) {
    const dotCls = !v ? '' : v.mode === 'RESOLVED' ? '' : v.mode === 'INFERRED' ? 'warn' : 'bad';
    const vd = v || {
      mode: 'WARMING', modelId: null, family: null, gen: null,
      label: '等待首个对话…', confidence: 0, evidence: [], alternatives: [],
    };
    const conf = Math.round((vd.confidence || 0) * 100);

    // ---- 真实模型名（来自 Trigger.dev run trace）最高优先显示 ----
    // 这是用户最需要的信息：具体是哪个模型，例如 qwen3.8-max-0902
    const real = extras.realModel;
    const realBlock = real
      ? `<div class="verdict" style="border-color:#238636;background:#0d1f12">
           <div class="mode" style="color:#7ee787">真实模型名（run trace）</div>
           <div class="model" style="color:#7ee787">${esc(real.name)}</div>
           <div class="ev" style="opacity:.85">runId: ${esc(real.runId || '-')}${real.tokens && real.tokens.length ? ' · tokens ' + esc(real.tokens.join(',')) : ''}</div>
           ${real.all && real.all.length > 1
             ? `<div class="ev" style="opacity:.7">本轮出现: ${esc(real.all.join(', '))}</div>` : ''}
         </div>`
      : (extras.runInfo
        ? `<div class="verdict" style="border-color:#9e6a03;background:#1f1a0d">
             <div class="mode" style="color:#e3b341">真实模型名 获取中…</div>
             <div class="ev">runId: ${esc(extras.runInfo.runId || '-')}${extras.runInfo.reason ? ' · ' + esc(extras.runInfo.reason) : ''}</div>
           </div>`
        : '');

    const altHtml = (vd.alternatives || []).length
      ? `<div class="sec">备选</div>` + vd.alternatives.map(a =>
        `<div class="row"><span class="k">${esc(a.family || '?')}</span><span class="v">${esc(a.modelId)} · ${Math.round(a.confidence * 100)}%</span></div>`).join('')
      : '';

    const evHtml = (vd.evidence || []).slice(0, 7).map(e => {
      if (typeof e === 'string') return `<div class="ev"><b>${esc(e)}</b></div>`;
      return `<div class="ev"><b>${esc(e.source || '')}</b> ${esc(e.detail || e.modelId || '')}</div>`;
    }).join('');

    const learnedHtml = extras.learnedSummary
      ? `<div class="sec">指纹库</div>
         <div class="row"><span class="k">建档</span><span class="v">${extras.learnedSummary.total} 条 · 未知 ${extras.learnedSummary.unseen} · 匿名簇 ${extras.learnedSummary.anon}</span></div>`
      : '';

    const tokHtml = extras.tokenizer
      ? `<div class="sec">Tokenizer</div>
         <div class="row"><span class="k">chars/token</span><span class="v">${extras.tokenizer.charsPerToken} → 最接近 ${esc(extras.tokenizer.best)}${extras.tokenizer.confident ? '' : '（差距偏大，仅供参考）'}</span></div>`
      : '';

    const slotHtml = extras.slots && Object.keys(extras.slots).length
      ? `<div class="sec">盲测槽位</div>` + Object.entries(extras.slots).map(([s, d]) =>
        `<div class="row"><span class="k">模型 ${esc(s)}</span><span class="v">${esc(d.label || d.modelId || '未识别')}${d.confidence ? ' · ' + Math.round(d.confidence * 100) + '%' : ''}</span></div>`).join('')
      : '';

    this.root.innerHTML = `
      <div class="hd"><span class="dot ${dotCls}"></span>
        <span class="ttl">模型探针 · arena-model-probe</span>
        <span class="mini" data-act="toggle">—</span>
        <span class="mini" data-act="close">✕</span>
      </div>
      <div class="bd">
        ${realBlock}
        <div class="verdict">
          <div class="mode">${esc(vd.mode)}</div>
          <div class="model">${esc(vd.label || vd.modelId || '未识别')}</div>
          ${vd.modelId && vd.label && vd.modelId !== vd.label ? `<div class="ev">id: <b>${esc(vd.modelId)}</b></div>` : ''}
          <div class="bar"><i style="width:${conf}%"></i></div>
          <div class="meta">
            <span class="tag ${this.confidenceClass(vd.confidence || 0)}">置信 ${conf}%</span>
            ${vd.family ? `<span class="tag">${esc(vd.family)}</span>` : ''}
            ${vd.gen ? `<span class="tag">${esc(vd.gen)}</span>` : ''}
            ${vd.frontier === true ? `<span class="tag ok">最新代际</span>` : ''}
            ${vd.frontier === false ? `<span class="tag">非最新代际</span>` : ''}
          </div>
          ${vd.note ? `<div class="ev" style="opacity:.7">${esc(vd.note)}</div>` : ''}
        </div>
        ${slotHtml}
        ${extras.observation ? `<div class="sec">本次响应</div>
          <div class="row"><span class="k">TTFT</span><span class="v">${extras.observation.ttftMs} ms</span></div>
          <div class="row"><span class="k">总耗时</span><span class="v">${extras.observation.totalMs} ms</span></div>
          <div class="row"><span class="k">chunks</span><span class="v">${extras.observation.chunks}</span></div>
          <div class="row"><span class="k">tokens</span><span class="v">in ${extras.observation.promptTokens ?? '?'} / out ${extras.observation.completionTokens ?? '?'}${extras.observation.reasoningTokens ? ' / reason ' + extras.observation.reasoningTokens : ''}</span></div>
        ` : ''}
        ${tokHtml}
        ${learnedHtml}
        ${evHtml ? `<div class="sec">证据链</div>${evHtml}` : ''}
        ${altHtml}
        <div class="btns">
          <button class="pri" data-act="rescan">重新判定</button>
          <button data-act="dump">导出证据</button>
          <button data-act="export">导出指纹库</button>
        </div>
        <div class="log">${this.logs.join('')}</div>
      </div>`;

    this.root.querySelectorAll('[data-act]').forEach(el => {
      el.addEventListener('click', () => {
        const act = el.getAttribute('data-act');
        if (act === 'toggle') this.root.classList.toggle('hide');
        else if (act === 'close') this.host.remove();
        else if (this.onAction) this.onAction(act);
      });
    });
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
