'use strict';
// Isolated transport fixtures only: never boot the uploaded probe or visit an account.
const assert = require('assert');
(async () => {
  const { BUS, SSETap, CAPTURE_LIMITS, readCapture, stopCaptures, installFetchHook, installXHRHook, installSocketHook } = await import('../../../arena-model-probe/src/interceptor.js');
  const originalWindow = global.window, originalDocument = global.document;
  global.document = { activeElement: null };
  const bytes = text => new TextEncoder().encode(text);
  try {
    const tap = new SSETap({ url: 'https://fixture.invalid/chat' });
    tap.feed('x'.repeat(CAPTURE_LIMITS.line + 1));
    assert.strictEqual(tap.done, true); assert.strictEqual(tap.truncated, 'line-limit'); assert.strictEqual(tap.buf, '');
    const many = new SSETap({ url: 'https://fixture.invalid/chat' });
    many.feed('data: {}\n'.repeat(CAPTURE_LIMITS.chunks + 1));
    assert.strictEqual(many.truncated, 'frame-limit');
    for (let i = 0; i < 30; i++) BUS.addObservation({ text: 'fixture' });
    assert.strictEqual(BUS.observations.length, 20);
    let cancelled = false, inspected = 0;
    const large = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(CAPTURE_LIMITS.bytes + 1)); }, cancel() { cancelled = true; } });
    assert.strictEqual(await readCapture(large, () => inspected++), 'byte-limit');
    assert.strictEqual(cancelled, true); assert.strictEqual(inspected, 0);
    const pending = Array.from({ length: 4 }, () => readCapture(new ReadableStream(), () => {}));
    assert.strictEqual(await readCapture(new ReadableStream(), () => {}), 'capacity-or-no-body');
    stopCaptures(); assert.deepStrictEqual(await Promise.all(pending), Array(4).fill('stopped'));
    const originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
    try {
      let expire;
      global.setTimeout = (fn, delay) => { assert.strictEqual(delay, 15000); expire = fn; return 1; };
      global.clearTimeout = () => {};
      const deadlineRead = readCapture(new ReadableStream(), () => {});
      expire(); assert.strictEqual(await deadlineRead, 'deadline');
    } finally { global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout; }
    const tiny = new ReadableStream({ pull(c) { c.enqueue(bytes('x')); } });
    assert.strictEqual(await readCapture(tiny, () => {}), 'chunk-limit');

    const response = new Response('data: {"text":"fixture-only"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    Object.defineProperty(response, 'url', { value: 'https://fixture.invalid/chat' });
    let fetchArgs;
    global.window = { fetch: async (...args) => { fetchArgs = args; return response; } };
    installFetchHook();
    const init = { method: 'POST', body: '{}' };
    const returned = await window.fetch('https://fixture.invalid/chat', init);
    assert.strictEqual(returned, response, 'must preserve Response identity and metadata');
    assert.strictEqual(returned.url, 'https://fixture.invalid/chat');
    assert.strictEqual(fetchArgs[1], init);
    assert.ok((await returned.text()).includes('fixture-only'));
    stopCaptures();

    class Socket { static OPEN = 1; static CLOSED = 3; constructor(...args) { this.args = args; } addEventListener() {} }
    class Events { static CONNECTING = 0; static CLOSED = 2; constructor(...args) { this.args = args; } addEventListener() {} }
    window.WebSocket = Socket; window.EventSource = Events; installSocketHook();
    assert.strictEqual(window.WebSocket.OPEN, 1); assert.strictEqual(window.EventSource.CLOSED, 2);
    assert.throws(() => window.WebSocket('wss://fixture.invalid'), TypeError);
    class Child extends window.WebSocket {}
    const child = new Child('wss://fixture.invalid/chat');
    assert.ok(child instanceof Child && child instanceof Socket);
    assert.deepStrictEqual(child.args, ['wss://fixture.invalid/chat']);

    class Xhr {
      constructor() { this.listeners = new Set(); }
      open() {} send() {}
      addEventListener(type, fn) { if (type === 'load') this.listeners.add(fn); }
      removeEventListener(type, fn) { this.listeners.delete(fn); }
    }
    window.XMLHttpRequest = Xhr; installXHRHook();
    const xhr = new Xhr();
    for (let i = 0; i < 10; i++) { xhr.open('POST', '/chat'); xhr.send('{}'); }
    assert.strictEqual(xhr.listeners.size, 1, 'reusing XHR must not stack stale listeners');
    xhr.open('GET', ''); xhr.send(); assert.strictEqual(xhr.listeners.size, 0);
    const uiSource = require('fs').readFileSync(require('path').resolve(__dirname, '../../../arena-model-probe/src/ui.js'), 'utf8');
    assert.ok(uiSource.includes('非认证概率') && uiSource.includes('未独立核验'));
    console.log('probe transport: original Response, bounded capture/parser/history, cancellation, constructor constants/subclassing and XHR reuse passed offline');
  } finally {
    stopCaptures(); global.window = originalWindow; global.document = originalDocument;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
