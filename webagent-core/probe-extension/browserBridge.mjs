// Ephemeral browser-to-host channel. No token is persisted or put into a URL.
export function createBrowserBridge(services) {
  let connection = null, timer = null, busy = false, generation = 0;
  const running = new Map();
  async function post(link, body) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(link.base + '/probe-link', {method: 'POST', headers: {'Content-Type':'application/json', Authorization:'Bearer ' + link.token}, body: JSON.stringify(body), signal: controller.signal, credentials:'omit', redirect:'error', cache:'no-store'});
      if (!response.ok) throw new Error('Host rejected probe link');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 65536) { void reader.cancel(); throw new Error('Host response budget'); } chunks.push(part.value); } }
      finally { reader.releaseLock(); }
      const joined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
      return JSON.parse(new TextDecoder().decode(joined));
    } finally { clearTimeout(timeout); }
  }
  async function disconnect(invalidate = true) {
    if (invalidate) generation++;
    const old = connection; connection = null; clearTimeout(timer);
    for (const [id, controller] of running) { controller.abort(); void services.cancel(old?.tabId, id); }
    running.clear();
    if (old) await post(old, {type:'disconnect'}).catch(() => {});
  }
  async function perform(link, command) {
    if (connection !== link || running.size >= 4 || command.deadline <= Date.now() || link.seen.has(command.id) || link.seen.size >= 100) return;
    link.seen.add(command.id);
    const controller = new AbortController(); running.set(command.id, controller);
    const timeout = setTimeout(() => { controller.abort(); void services.cancel(link.tabId, command.id); }, Math.max(1, command.deadline - Date.now()));
    let status = 'unknown';
    try {
      if (command.tabId !== link.tabId) throw new Error('Wrong tab');
      const result = await services.execute(command, controller.signal);
      if (!controller.signal.aborted && result?.ok === true) status = 'succeeded';
    } catch (_) { /* Effects may already exist. Never replay. */ }
    finally { clearTimeout(timeout); running.delete(command.id); }
    if (connection === link) await post(link, {type:'result', id:command.id, status}).catch(() => connection === link ? disconnect() : undefined);
  }
  async function tick() {
    const link = connection;
    if (!link || busy) return;
    busy = true;
    try {
      if (Date.now() >= link.expiresAt) throw new Error('Pairing expired');
      const current = await services.current(link.tabId);
      if (connection !== link) return;
      const response = await post(link, {type:'sync', ...current});
      if (connection !== link) return;
      for (const id of response.cancellations || []) { running.get(id)?.abort(); void services.cancel(link.tabId, id); }
      for (const command of response.commands || []) void perform(link, command);
    } catch (_) { if(connection === link) await disconnect(); }
    finally { busy = false; if (connection) timer = setTimeout(() => void tick(), 2000); }
  }
  return {
    async connect(input, tabId) {
      const ticket = ++generation;
      const url = new URL(input?.base);
      if (input?.schema !== 'webagent-probe-pair/v1' || url.origin !== input.base || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || !/^[a-f0-9]{64}$/.test(input.token || '') || !Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now() || input.expiresAt > Date.now() + 16 * 60000 || !Number.isInteger(tabId)) throw new Error('Invalid pairing');
      await services.current(tabId);
      if(ticket!==generation)throw Error('Pairing superseded');
      await disconnect(false);
      if(ticket!==generation)throw Error('Pairing cancelled');
      connection = {...input, tabId, seen: new Set()}; void tick(); return {connected: true};
    },
    disconnect,
    status() { return {connected: !!connection, expiresAt: connection?.expiresAt, tabId: connection?.tabId}; },
    async request(action, text, tabId, sessionId) {
      if (!connection || connection.expiresAt <= Date.now() || connection.tabId !== tabId) throw new Error('No paired current tab');
      return post(connection, {type:'request', action, text, tabId, sessionId, requestKey:crypto.randomUUID()});
    }
  };
}
