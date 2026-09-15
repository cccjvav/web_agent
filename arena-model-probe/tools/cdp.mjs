/**
 * cdp.mjs — 复用的极简 CDP 客户端
 */
export class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((ok, err) => {
      this.ws.addEventListener('open', ok, { once: true });
      this.ws.addEventListener('error', () => err(new Error('WS 连接失败')), { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && this.pending.has(m.id)) {
        const { ok, err } = this.pending.get(m.id); this.pending.delete(m.id);
        m.error ? err(new Error(JSON.stringify(m.error))) : ok(m.result);
      } else if (m.method) {
        for (const h of this.handlers.get(m.method) || []) { try { h(m.params); } catch { /* noop */ } }
      }
    });
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, err) => {
      this.pending.set(id, { ok, err });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); err(new Error(`超时 ${method}`)); } }, 25000);
    });
  }
  on(m, fn) { if (!this.handlers.has(m)) this.handlers.set(m, []); this.handlers.get(m).push(fn); }
  close() { try { this.ws.close(); } catch { /* noop */ } }
}

export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function pickPage(port = 9222, match = /arena\.ai/) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  return list.find(t => t.type === 'page' && match.test(t.url))
    || list.find(t => t.type === 'page' && /^https?:/.test(t.url));
}

export async function evaluate(cdp, expr, awaitPromise = true) {
  const r = await cdp.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise,
    allowUnsafeEvalBlockedByCSP: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
