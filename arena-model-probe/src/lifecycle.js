/** Reserve startup before DOMContentLoaded. A partial/older instance needs a reload,
 * not another set of hooks: the prototype has no complete shutdown protocol yet. */
export function scheduleBoot(win, doc, version, start) {
  const occupied = () => Boolean(win.__MODEL_PROBE__ || win.__MODEL_PROBE_BOOTED__);
  if (occupied() || win.__MODEL_PROBE_START__) return false;
  const ticket = { version, phase: 'pending' };
  win.__MODEL_PROBE_START__ = ticket;
  const run = () => {
    if (win.__MODEL_PROBE_START__ !== ticket || ticket.phase !== 'pending') return;
    if (occupied()) { ticket.phase = 'blocked'; return; }
    ticket.phase = 'starting';
    try {
      start();
      win.__MODEL_PROBE_BOOTED__ = version;
      ticket.phase = 'ready';
    } catch (error) {
      // Do not automatically retry a boot that may already have installed hooks.
      ticket.phase = 'failed';
      throw error;
    }
  };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  return true;
}
