import test from 'node:test';
import assert from 'node:assert/strict';
import {readTraceText} from '../trace-reader.js';
test('trace reader counts bytes before retaining oversized response and cancels', async () => {
  let cancelled = false;
  const body = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('中文')); }, cancel() { cancelled = true; }});
  await assert.rejects(readTraceText({body}, new AbortController().signal, 5), /预算/);
  assert.equal(cancelled, true);
});
test('trace reader handles unicode and aborts a stalled read', async () => {
  assert.equal(await readTraceText(new Response('中文'), new AbortController().signal, 6), '中文');
  const controller = new AbortController();
  const pending = readTraceText({body: new ReadableStream()}, controller.signal);
  controller.abort(); await assert.rejects(pending, /取消/);
});
