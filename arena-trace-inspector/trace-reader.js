// Bound bytes while consuming, not after response.text() has allocated the full body.
export async function readTraceText(response, signal, limit = 4 * 1024 * 1024) {
  if (!response.body) throw new Error('trace 正文不可读取');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let bytes = 0, text = '';
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    if (signal.aborted) throw new Error('trace 请求已取消');
    for (;;) {
      const part = await reader.read();
      if (signal.aborted) throw new Error('trace 请求已取消');
      if (part.done) return text + decoder.decode();
      bytes += part.value.byteLength;
      if (bytes > limit) { abort(); throw new Error('trace 超过读取预算，停止解析'); }
      text += decoder.decode(part.value, {stream: true});
    }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
}
