'use strict';
// F102 (review P2-2): runOpenAI asks for `stream: true`, forwards visible text as `delta` events
// while the provider is still generating, closes every turn with the same full `message` as before,
// reassembles streamed tool calls, falls back once on HTTP 400, and keeps the deadline/cancellation/
// byte budgets on the streamed body. Real WHATWG Response objects over a fake fetch; no network.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const store = require('../src/models/store');
const { runChat, planRound } = require('../src/agent/runChat');
const { runOpenAI, STREAM_UNSUPPORTED, MODEL_RESPONSE_MAX_BYTES, MODEL_STREAM_RESPONSE_MAX_BYTES, DELTA_FLUSH_CHARS } = require('../src/agent/openai');
const { runWithSignal } = require('../src/utils/requestScope');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-model-stream-'));
const priorWorkspace = config.workspaceRoot, priorFetch = global.fetch;
config.workspaceRoot = tmp;
fs.writeFileSync(path.join(tmp, 'a.txt'), 'fixture');
const model = { id: 'stream', protocol: 'openai', apiKey: 'fixture', baseUrl: 'https://stream.invalid/v1', modelId: 'fixture-stream' };
const SECRET = 'PROVIDER_SECRET_MUST_NOT_SURFACE';

const frame = chunk => `data: ${JSON.stringify(chunk)}\n\n`;
const delta = (d, extra = {}) => ({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: null, ...extra }] });
const done = 'data: [DONE]\n\n';
const jsonReply = (message, status = 200) => new Response(JSON.stringify({ choices: [{ message }] }), { status, headers: { 'content-type': 'application/json' } });

// A streamed provider reply: `parts` are strings or Buffers (byte-split allowed) or functions that
// return a promise to await before the next chunk (used to hold the stream open for cancellation).
function sseResponse(parts, { status = 200, signal, lifecycle = {} } = {}) {
  let index = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (index >= parts.length) { controller.close(); return; }
      const part = parts[index++];
      if (typeof part === 'function') {
        await part(signal);
        return;
      }
      controller.enqueue(typeof part === 'string' ? Buffer.from(part, 'utf8') : part);
    },
    cancel() { lifecycle.cancelled = (lifecycle.cancelled || 0) + 1; }
  });
  return new Response(body, { status, headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
}
const collect = () => { const events = []; events.emit = (type, data) => events.push({ type, ...data }); return events; };
const texts = (events, type) => events.filter(event => event.type === type).map(event => event.text);

(async () => {
  store.save({ ...store.defaults(), activeModelId: 'stream', models: [model] });
  STREAM_UNSUPPORTED.clear();

  // 1. Text answer: deltas arrive before the final message, concatenate to it exactly, survive
  //    byte-split multibyte characters, and are coalesced rather than forwarded one token at a time.
  {
    const bytes = Buffer.from(frame(delta({ role: 'assistant', content: '' })) + frame(delta({ content: '海风' })), 'utf8');
    const cut = bytes.indexOf(Buffer.from('风')) + 1; // inside the three bytes of 风
    const tokens = Array.from({ length: 200 }, (_, i) => frame(delta({ content: String(i % 10) })));
    const bodies = [];
    global.fetch = async (url, init) => {
      bodies.push(JSON.parse(init.body));
      assert.strictEqual(url, `${model.baseUrl}/chat/completions`);
      assert.strictEqual(init.redirect, 'error');
      return sseResponse([bytes.subarray(0, cut), bytes.subarray(cut), ...tokens, frame(delta({}, { finish_reason: 'stop' })), done]);
    };
    const events = collect();
    const out = await runOpenAI({ mode: 'ask', message: '流式', history: [], model, emit: events.emit, allowTools: false });
    const expected = '海风' + Array.from({ length: 200 }, (_, i) => String(i % 10)).join('');
    assert.strictEqual(bodies[0].stream, true, 'the request asks for a stream');
    assert.strictEqual(out.text, expected);
    const deltas = texts(events, 'delta');
    assert.ok(deltas.length >= 2 && deltas.length < 200, `deltas are coalesced (${deltas.length} events for 201 chunks)`);
    assert.ok(deltas.every(text => typeof text === 'string' && text.length > 0), 'no empty delta frames');
    assert.ok(deltas.slice(0, -1).every(text => text.length >= DELTA_FLUSH_CHARS) || deltas.length > 2);
    assert.strictEqual(deltas.join(''), expected, 'the deltas add up to the final text');
    assert.deepStrictEqual(texts(events, 'message'), [expected], 'exactly one final message with the full text');
    assert.strictEqual(events.findIndex(event => event.type === 'delta') < events.findIndex(event => event.type === 'message'), true);
    assert.strictEqual(events[0].type, 'status');
  }

  // 2. Streamed tool call: the model's narration is streamed, closed by an interim message before
  //    the tool runs, the fragments are reassembled into arguments, and the next turn streams again.
  {
    let requests = 0;
    global.fetch = async (_, init) => {
      requests++;
      const body = JSON.parse(init.body);
      assert.strictEqual(body.stream, true);
      if (requests === 1) {
        return sseResponse([
          frame(delta({ role: 'assistant', content: '先看' })), frame(delta({ content: '目录。' })),
          frame(delta({ tool_calls: [{ index: 0, id: 'call_ls', type: 'function', function: { name: 'list_directory', arguments: '' } }] })),
          frame(delta({ tool_calls: [{ index: 0, function: { arguments: '{"dir' } }] })),
          frame(delta({ tool_calls: [{ index: 0, function: { arguments: 'Path":"."}' } }] })),
          frame(delta({}, { finish_reason: 'tool_calls' })), done
        ]);
      }
      const assistant = body.messages.find(message => message.role === 'assistant');
      assert.deepStrictEqual(assistant, { role: 'assistant', content: '先看目录。',
        tool_calls: [{ id: 'call_ls', type: 'function', function: { name: 'list_directory', arguments: '{"dirPath":"."}' } }] });
      const toolMessage = body.messages.find(message => message.role === 'tool');
      assert.strictEqual(toolMessage.tool_call_id, 'call_ls');
      assert.ok(JSON.parse(toolMessage.content).items.some(item => item.name === 'a.txt'), 'the tool really ran against the workspace');
      return sseResponse([frame(delta({ content: '目录里有 a.txt' })), done]);
    };
    const events = collect();
    const out = await runOpenAI({ mode: 'ask', message: '看看', history: [], model, emit: events.emit });
    assert.strictEqual(out.text, '目录里有 a.txt');
    const kinds = events.map(event => event.type + (event.type === 'tool' ? ':' + event.name : ''));
    const first = kinds.indexOf('delta'), interim = kinds.indexOf('message'), tool = kinds.indexOf('tool:list_directory');
    assert.ok(first !== -1 && first < interim && interim < tool, `narration delta -> interim message -> tool (${kinds.join(' ')})`);
    assert.deepStrictEqual(texts(events, 'message'), ['先看目录。', '目录里有 a.txt']);
    assert.strictEqual(texts(events, 'delta').join(''), '先看目录。目录里有 a.txt');
    const toolEvent = events.find(event => event.type === 'tool');
    assert.strictEqual(toolEvent.ok, true);
    assert.deepStrictEqual(toolEvent.args, { dirPath: '.' });
    assert.strictEqual(requests, 2);
  }

  // 3. A provider that ignores `stream` and answers JSON still works, without any delta.
  {
    global.fetch = async () => jsonReply({ role: 'assistant', content: 'buffered' });
    const events = collect();
    assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'json', history: [], model, emit: events.emit, allowTools: false })).text, 'buffered');
    assert.deepStrictEqual(texts(events, 'delta'), []);
    assert.deepStrictEqual(texts(events, 'message'), ['buffered']);
    // A saved base that still carries the pasted endpoint or a doubled /v1 is normalised at request time (F129).
    const urls = [];
    global.fetch = async url => { urls.push(url); return jsonReply({ role: 'assistant', content: 'ok' }); };
    for (const baseUrl of ['https://stream.invalid/v1/chat/completions/', 'https://stream.invalid/v1/v1']) {
      await runOpenAI({ mode: 'ask', message: 'n', history: [], model: { ...model, id: 'n-' + urls.length, baseUrl }, emit: () => {}, allowTools: false });
    }
    assert.deepStrictEqual(urls, ['https://stream.invalid/v1/chat/completions', 'https://stream.invalid/v1/chat/completions']);
  }

  // 4. HTTP 400 on the streamed attempt: retried once without `stream`, remembered per model,
  //    other statuses and a second 400 are not retried.
  {
    const bodies = [];
    global.fetch = async (_, init) => {
      const body = JSON.parse(init.body); bodies.push(body);
      if (body.stream) return new Response(JSON.stringify({ error: { message: SECRET } }), { status: 400, headers: { 'content-type': 'application/json' } });
      return jsonReply({ role: 'assistant', content: 'unbuffered gateway' });
    };
    const events = collect();
    assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'fallback', history: [], model, emit: events.emit, allowTools: false })).text, 'unbuffered gateway');
    assert.strictEqual(bodies.length, 2);
    assert.strictEqual(bodies[0].stream, true);
    assert.strictEqual(Object.hasOwn(bodies[1], 'stream'), false, 'the retry omits the field entirely');
    assert.ok(events.some(event => event.type === 'status' && /不接受流式/.test(event.text)));
    assert.ok(!JSON.stringify(events).includes(SECRET));
    assert.ok(STREAM_UNSUPPORTED.has(`${model.baseUrl}\n${model.modelId}`));
    bodies.length = 0;
    await runOpenAI({ mode: 'ask', message: 'remembered', history: [], model, allowTools: false });
    assert.strictEqual(bodies.length, 1, 'no streamed attempt for a model that rejected it');
    assert.strictEqual(Object.hasOwn(bodies[0], 'stream'), false);
    STREAM_UNSUPPORTED.clear();

    let attempts = 0;
    global.fetch = async () => { attempts++; return new Response('{}', { status: 400, headers: { 'content-type': 'application/json' } }); };
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'twice', history: [], model, allowTools: false }), /模型 HTTP 400 请求失败/);
    assert.strictEqual(attempts, 2, 'stream attempt + one buffered retry, then stop');
    STREAM_UNSUPPORTED.clear();
    attempts = 0;
    global.fetch = async () => { attempts++; return new Response(SECRET, { status: 401 }); };
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'auth', history: [], model, allowTools: false }), error => /HTTP 401/.test(error.message) && !error.message.includes(SECRET));
    assert.strictEqual(attempts, 1, 'a 401 is not a shape problem and is not retried');
    assert.strictEqual(STREAM_UNSUPPORTED.size, 0);
  }

  // 5. An in-band provider error after some text: the run fails, nothing pretends to be an answer.
  {
    global.fetch = async () => sseResponse([frame(delta({ content: 'partial ' })), frame({ error: { message: SECRET, code: 'server_error' } })]);
    const events = collect();
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'mid-stream error', history: [], model, emit: events.emit, allowTools: false }),
      error => /流式响应中报告错误/.test(error.message) && !error.message.includes(SECRET));
    assert.deepStrictEqual(texts(events, 'message'), []);
  }

  // 6. Malformed SSE cancels the body and surfaces a stable error; the tool loop does not run.
  {
    const lifecycle = {};
    global.fetch = async () => sseResponse(['data: {"choices":[{"delta":{"content":' + JSON.stringify(SECRET) + '}}]\n\n', 'data: {nope}\n\n', frame(delta({ content: 'late' }))], { lifecycle });
    const events = collect();
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'malformed', history: [], model, emit: events.emit, allowTools: false }),
      error => error.code === 'E_MODEL_STREAM' && /不是 JSON/.test(error.message) && !error.message.includes(SECRET));
    assert.strictEqual(lifecycle.cancelled, 1, 'the provider body is cancelled as soon as the stream is invalid');
    assert.ok(!events.some(event => event.type === 'message' || event.type === 'tool'));
  }

  // 7. Budgets: a streamed body wider than 16 MiB, and a buffered JSON body wider than 1 MiB even
  //    though the transport was opened with the streaming cap.
  {
    assert.strictEqual(MODEL_STREAM_RESPONSE_MAX_BYTES, 16 * 1024 * 1024);
    const lifecycle = {};
    const comment = ': ' + 'k'.repeat(1024 * 1024 - 4) + '\n\n';
    global.fetch = async () => sseResponse([frame(delta({ content: 'x' })), ...Array(17).fill(comment)], { lifecycle });
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'wide stream', history: [], model, allowTools: false }), error => error.code === 'E_RESPONSE_TOO_LARGE');
    assert.strictEqual(lifecycle.cancelled, 1);
    let reads = 0;
    global.fetch = async () => new Response(new ReadableStream({
      pull(controller) { reads++; if (reads > 40) controller.close(); else controller.enqueue(Buffer.alloc(64 * 1024, 0x20)); }
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await assert.rejects(runOpenAI({ mode: 'ask', message: 'wide json', history: [], model, allowTools: false }), error => error.code === 'E_RESPONSE_TOO_LARGE' && error.maxBytes === MODEL_RESPONSE_MAX_BYTES);
    assert.ok(reads <= 18, `the buffered budget stops reading early (${reads} reads of 64 KiB)`);
  }

  // 8. Cancelling the task mid-stream aborts the provider request; no message is fabricated.
  {
    const controller = new AbortController();
    const events = collect();
    global.fetch = async (_, init) => sseResponse([
      frame(delta({ content: 'first piece that is long enough to be flushed on its own........' })),
      signal => new Promise((_resolve, reject) => {
        const stop = () => reject(Object.assign(new Error('aborted by client'), { name: 'AbortError' }));
        if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true });
      })
    ], { signal: init.signal });
    const run = runWithSignal(controller.signal, () => runOpenAI({ mode: 'ask', message: 'cancel', history: [], model, allowTools: false,
      emit: (type, data) => { events.emit(type, data); if (type === 'delta') controller.abort(); } }));
    await assert.rejects(run, error => error.code === 'E_CANCELLED');
    assert.strictEqual(texts(events, 'delta').length, 1);
    assert.deepStrictEqual(texts(events, 'message'), []);
  }

  // 9. Plan branches: the branch model's deltas and message are captured, so the answer is shown
  //    once -- as the branch record emitted with planRound -- and never as a streaming bubble too.
  {
    planRound.reset();
    global.fetch = async () => sseResponse([frame(delta({ content: '分支' })), frame(delta({ content: '方案' })), done]);
    const events = collect();
    await runChat({ mode: 'plan', message: 'plan with streaming model' }, events.emit);
    assert.deepStrictEqual(texts(events, 'delta'), [], 'plan branch deltas never reach the client');
    const messages = events.filter(event => event.type === 'message');
    assert.strictEqual(messages.length, 1, 'the branch answer is shown once, by emitRound, not by the model turn as well');
    assert.strictEqual(messages[0].text, '分支方案');
    assert.strictEqual(messages[0].branch.index, 1);
    const round = events.find(event => event.type === 'planRound');
    assert.ok(round && round.round.branches.length === 1);
    assert.strictEqual(planRound.current().branches[0].answer, '分支方案');
    planRound.reset();
  }

  // 10. The ordinary chat path forwards deltas to whatever emit the route installed.
  {
    global.fetch = async () => sseResponse([frame(delta({ content: '直接' })), frame(delta({ content: '回答' })), done]);
    const events = collect();
    await runChat({ mode: 'ask', message: 'ask with streaming model' }, events.emit);
    assert.strictEqual(texts(events, 'delta').join(''), '直接回答');
    assert.deepStrictEqual(texts(events, 'message'), ['直接回答']);
  }

  // 11. F103 (review P2-3 / D-26): upstream failures are explained with fixed text, never with the
  //     body, and a classified 400 (context overflow) is not wasted on a stream-less retry.
  {
    const { MODEL_TIMEOUT_MS, MODEL_IDLE_TIMEOUT_MS } = require('../src/agent/openai');
    assert.strictEqual(MODEL_TIMEOUT_MS, 300000, 'one turn may stream for up to 5 minutes');
    assert.strictEqual(MODEL_IDLE_TIMEOUT_MS, 120000, 'but must show life every 2 minutes (the old total)');
    const source = fs.readFileSync(path.join(__dirname, '../src/agent/openai.js'), 'utf8');
    assert.match(source, /idleMs: MODEL_IDLE_TIMEOUT_MS/, 'the model request passes the idle budget to fetchText');
    assert.match(source, /\}, MODEL_TIMEOUT_MS, \{/, 'and the total budget');
    const failWith = (status, body) => { let attempts = 0; global.fetch = async () => { attempts++; return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }; return () => attempts; };
    const expectFailure = async (label, pattern, category) => {
      const events = collect();
      const error = await runOpenAI({ mode: 'ask', message: label, history: [], model, emit: events.emit, allowTools: false }).then(() => null, e => e);
      assert.ok(error, label + ' must fail');
      assert.match(error.message, pattern, label);
      assert.ok(!error.message.includes(SECRET), label + ': body text is not reflected');
      assert.strictEqual(error.code, 'E_MODEL_HTTP', label);
      assert.strictEqual(error.category, category, label);
      assert.deepStrictEqual(texts(events, 'message'), [], label + ': no message is fabricated');
      return error;
    };
    STREAM_UNSUPPORTED.clear();
    let attempts = failWith(400, { error: { message: `This model's maximum context length is 8192 tokens. ${SECRET}`, type: 'invalid_request_error', code: 'context_length_exceeded' } });
    const overflow = await expectFailure('context', /^模型 HTTP 400 请求失败：对话超出模型上下文长度（本次请求约 \d+ tokens，估算值），请清空历史/, 'context');
    assert.strictEqual(attempts(), 1, 'a context overflow is not retried without stream');
    assert.ok(Number.isInteger(overflow.estimate) && overflow.estimate > 0);
    assert.strictEqual(STREAM_UNSUPPORTED.size, 0, 'and does not mark the model as stream-incapable');
    attempts = failWith(400, { error: { message: `stream is not supported for this model ${SECRET}`, param: 'stream' } });
    global.fetch = (fetchImpl => async (url, init) => (JSON.parse(init.body).stream ? fetchImpl(url, init) : jsonReply({ role: 'assistant', content: 'buffered' })))(global.fetch);
    assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'stream param', history: [], model, allowTools: false })).text, 'buffered');
    assert.strictEqual(attempts(), 1, 'the stream complaint was answered by one buffered retry');
    STREAM_UNSUPPORTED.clear();
    attempts = failWith(401, { error: { message: `Incorrect API key provided: sk-${SECRET}`, type: 'invalid_request_error', code: 'invalid_api_key' } });
    await expectFailure('auth', /^模型 HTTP 401 请求失败：API Key 无效或已失效/, 'auth');
    assert.strictEqual(attempts(), 1);
    attempts = failWith(429, { error: { message: SECRET, type: 'insufficient_quota', code: 'insufficient_quota' } });
    await expectFailure('quota', /^模型 HTTP 429 请求失败：配额或余额不足/, 'quota');
    attempts = failWith(429, `<html>${SECRET}</html>`);
    await expectFailure('rate limit html', /^模型 HTTP 429 请求失败：触发限流/, 'rate_limit');
    attempts = failWith(404, { error: { message: `The model \`${SECRET}\` does not exist`, code: 'model_not_found' } });
    await expectFailure('not found', /^模型 HTTP 404 请求失败：模型不存在/, 'not_found');
    attempts = failWith(502, SECRET);
    await expectFailure('bad gateway', /^模型 HTTP 502 请求失败：模型服务端错误/, 'upstream');
    assert.strictEqual(attempts(), 1, '5xx is not retried by the model layer');
    // A 200 whose body is an error envelope is a failure, not "模型没有 message".
    attempts = failWith(200, { error: { code: 'model_not_found', message: SECRET } });
    await expectFailure('200 envelope', /^模型返回了错误：模型不存在/, 'not_found');
    // An in-band error on the stream is classified the same way, keeping the F102 prefix.
    global.fetch = async () => sseResponse([frame(delta({ content: 'partial ' })), frame({ error: { message: SECRET, code: 'rate_limit_exceeded' } })]);
    await expectFailure('stream envelope', /^模型在流式响应中报告错误：触发限流/, 'rate_limit');
    STREAM_UNSUPPORTED.clear();
  }

  // 12. F103 (review P2-3): a request that is clearly larger than the catalogue's declared context
  //     gets one advisory status before it is sent; nothing is truncated and the model still answers.
  {
    const small = { ...model, id: 'small', contextSize: '1K' };
    const bodies = [];
    global.fetch = async (_, init) => { bodies.push(JSON.parse(init.body)); return jsonReply({ role: 'assistant', content: 'still answered' }); };
    const events = collect();
    const long = 'word '.repeat(2000);
    assert.strictEqual((await runOpenAI({ mode: 'ask', message: long, history: [], model: small, emit: events.emit, allowTools: false })).text, 'still answered');
    const advisories = texts(events, 'status').filter(text => /超过该模型声明的上下文 1K/.test(text));
    assert.strictEqual(advisories.length, 1, 'exactly one advisory: ' + JSON.stringify(texts(events, 'status')));
    assert.match(advisories[0], /^本次请求约 \d+ tokens（估算）/);
    assert.ok(bodies[0].messages.at(-1).content === long, 'the message is sent untouched');
    const roomy = collect();
    await runOpenAI({ mode: 'ask', message: long, history: [], model: { ...model, contextSize: '128K' }, emit: roomy.emit, allowTools: false });
    assert.ok(!texts(roomy, 'status').some(text => /声明的上下文/.test(text)), 'no advisory when the request fits');
    const unknown = collect();
    await runOpenAI({ mode: 'ask', message: long, history: [], model: { ...model, contextSize: 'unknown' }, emit: unknown.emit, allowTools: false });
    assert.ok(!texts(unknown, 'status').some(text => /声明的上下文/.test(text)), 'no advisory when the catalogue size is not a number');
  }

  console.log('modelStreaming: streamed deltas/final message, streamed tool calls, 400 fallback, mid-stream errors, budgets, cancellation, Plan capture, failure classification and context advisory passed');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  config.workspaceRoot = priorWorkspace; global.fetch = priorFetch; planRound.reset(); STREAM_UNSUPPORTED.clear();
  fs.rmSync(tmp, { recursive: true, force: true });
});
