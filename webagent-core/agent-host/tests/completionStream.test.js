'use strict';
// F102 (review P2-2): the Chat Completions SSE assembler must rebuild exactly the message shape the
// buffered path produced, report visible text as it arrives, and reject malformed streams without
// ever reflecting provider bodies. Parsing only: transport budgets are tested in requestScope/model
// lifecycle tests, consumers in workbenchRuntime/nativeChatStream/webviewRuntime.
const assert = require('assert');
const { isEventStream, createCompletionAssembler, STREAM_TOOL_CALL_MAX } = require('../src/agent/completionStream');

const frame = chunk => `data: ${JSON.stringify(chunk)}\n\n`;
const delta = (delta, extra = {}) => ({ id: 'chatcmpl-x', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null, ...extra }] });

// Content-Type detection across the response shapes the transport can hand over.
assert.strictEqual(isEventStream({ headers: new Headers({ 'content-type': 'text/event-stream' }) }), true);
assert.strictEqual(isEventStream({ headers: new Headers({ 'Content-Type': 'text/event-stream; charset=utf-8' }) }), true);
assert.strictEqual(isEventStream({ headers: { 'Content-Type': ' text/event-stream' } }), true);
assert.strictEqual(isEventStream({ headers: new Headers({ 'content-type': 'application/json' }) }), false);
assert.strictEqual(isEventStream({ headers: new Headers({ 'content-type': 'text/event-streamx' }) }), false);
assert.strictEqual(isEventStream({ headers: {} }), false);
assert.strictEqual(isEventStream({}), false);
assert.strictEqual(isEventStream(null), false);

// Text deltas split at arbitrary boundaries, CRLF line ends, comments, a usage-only trailer and [DONE].
{
  const pieces = [];
  const assembler = createCompletionAssembler({ onContent: piece => pieces.push(piece) });
  const body = frame(delta({ role: 'assistant', content: '' })) + frame(delta({ content: '海' })) + ': keep-alive\r\n\r\n'
    + frame(delta({ content: '风' })).replace(/\n/g, '\r\n') + frame(delta({}, { finish_reason: 'stop' }))
    + frame({ id: 'chatcmpl-x', choices: [], usage: { total_tokens: 3 } }) + 'data: [DONE]\n\n';
  for (let i = 0; i < body.length; i += 7) assembler.push(body.slice(i, i + 7));
  const out = assembler.end();
  assert.deepStrictEqual(pieces, ['海', '风']);
  assert.strictEqual(assembler.content, '海风');
  assert.strictEqual(out.done, true);
  assert.strictEqual(out.finishReason, 'stop');
  assert.deepStrictEqual(out.data, { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '海风' } }] });
}

// A missing trailing blank line / [DONE] still yields the message (end() flushes the last event).
{
  const assembler = createCompletionAssembler();
  assembler.push('data: ' + JSON.stringify(delta({ content: 'tail' })));
  const out = assembler.end();
  assert.strictEqual(out.done, false);
  assert.strictEqual(out.data.choices[0].message.content, 'tail');
}

// Multi-line data fields join with \n (SSE spec) and non-data fields are ignored.
{
  const assembler = createCompletionAssembler();
  const json = JSON.stringify(delta({ content: 'two' }));
  // Splitting the JSON across two data lines is joined with "\n" inside a string literal -> not JSON.
  assert.throws(() => assembler.push(`event: chunk\nid: 7\nretry: 100\ndata: ${json.slice(0, 20)}\ndata:${json.slice(20)}\n\n`),
    /不是 JSON/, 'a newline inside the JSON payload is not valid JSON');
  const joined = createCompletionAssembler();
  joined.push(`event: chunk\nid: 7\nretry: 100\ndata: ${json}\n\n`);
  assert.strictEqual(joined.end().data.choices[0].message.content, 'two', 'non-data fields are ignored');
}

// Tool calls are merged by index: id/name from their first fragment, arguments concatenated,
// interleaved with text and with a second call; the merged shape matches the buffered one.
{
  const pieces = [];
  const assembler = createCompletionAssembler({ onContent: piece => pieces.push(piece) });
  assembler.push(frame(delta({ role: 'assistant', content: 'Let me look.' })));
  assembler.push(frame(delta({ tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'read_files', arguments: '' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ index: 0, function: { arguments: '{"paths":' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ index: 1, id: 'call_b', function: { name: 'list_directory', arguments: '{}' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ index: 0, function: { arguments: '["a.js"]}' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ index: 0, id: 'call_a', function: { name: 'read_files' } }] })), 'repeated id/name fragments are not appended');
  assembler.push(frame(delta({}, { finish_reason: 'tool_calls' })) + 'data: [DONE]\n\n');
  const out = assembler.end();
  assert.deepStrictEqual(pieces, ['Let me look.']);
  assert.deepStrictEqual(out.data.choices[0].message, {
    role: 'assistant', content: 'Let me look.',
    tool_calls: [
      { id: 'call_a', type: 'function', function: { name: 'read_files', arguments: '{"paths":["a.js"]}' } },
      { id: 'call_b', type: 'function', function: { name: 'list_directory', arguments: '{}' } }
    ]
  });
}

// Providers that omit `index`: a new id opens a new call, id-less fragments extend the last one.
{
  const assembler = createCompletionAssembler();
  assembler.push(frame(delta({ tool_calls: [{ id: 'one', function: { name: 'search_files', arguments: '{"que' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ function: { arguments: 'ry":"x"}' } }] })));
  assembler.push(frame(delta({ tool_calls: [{ id: 'two', function: { name: 'git_status', arguments: '{}' } }] })));
  const calls = assembler.end().data.choices[0].message.tool_calls;
  assert.deepStrictEqual(calls.map(call => [call.id, call.function.name, call.function.arguments]),
    [['one', 'search_files', '{"query":"x"}'], ['two', 'git_status', '{}']]);
}

// Everything after [DONE] is ignored, as EventSource consumers do.
{
  const pieces = [];
  const assembler = createCompletionAssembler({ onContent: piece => pieces.push(piece) });
  assembler.push(frame(delta({ content: 'first' })) + 'data: [DONE]\n\n' + frame(delta({ content: 'late' })) + 'data: not json\n\n');
  assert.strictEqual(assembler.end().data.choices[0].message.content, 'first');
  assert.deepStrictEqual(pieces, ['first']);
}

// Rejections: each stops the stream with a stable Chinese message and never echoes the payload.
const secret = 'PROVIDER_SECRET_DETAIL';
const rejected = [
  ['in-band provider error', frame({ error: { message: secret, type: 'server_error' } }), /流式响应中报告错误/],
  ['array chunk', 'data: [1,2]\n\n', /不是对象/],
  ['choices not array', 'data: {"choices":{}}\n\n', /choices 类型无效/],
  ['choice not object', 'data: {"choices":[1]}\n\n', /choice 类型无效/],
  ['delta not object', 'data: {"choices":[{"delta":"x"}]}\n\n', /delta 类型无效/],
  ['role not string', frame(delta({ role: 1 })), /role 类型无效/],
  ['content not string', frame(delta({ content: { text: secret } })), /content 类型无效/],
  ['content array', frame(delta({ content: [secret] })), /content 类型无效/],
  ['tool_calls not array', frame(delta({ tool_calls: {} })), /tool_calls 类型无效/],
  ['tool call not object', frame(delta({ tool_calls: ['x'] })), /工具调用形状无效/],
  ['negative index', frame(delta({ tool_calls: [{ index: -1, id: 'a' }] })), /序号无效/],
  ['index beyond cap', frame(delta({ tool_calls: [{ index: STREAM_TOOL_CALL_MAX, id: 'a' }] })), /序号无效/],
  ['fractional index', frame(delta({ tool_calls: [{ index: 0.5, id: 'a' }] })), /序号无效/],
  ['id not string', frame(delta({ tool_calls: [{ index: 0, id: 5 }] })), /工具调用形状无效/],
  ['function not object', frame(delta({ tool_calls: [{ index: 0, id: 'a', function: 'f' }] })), /工具调用形状无效/],
  ['name not string', frame(delta({ tool_calls: [{ index: 0, id: 'a', function: { name: {} } }] })), /工具调用形状无效/],
  ['arguments not string', frame(delta({ tool_calls: [{ index: 0, id: 'a', function: { arguments: {} } }] })), /工具调用形状无效/],
  ['invalid JSON', 'data: {"choices":\n\n', /不是 JSON/]
];
for (const [label, body, pattern] of rejected) {
  const assembler = createCompletionAssembler();
  let error;
  try { assembler.push(body); assembler.end(); } catch (caught) { error = caught; }
  assert.ok(error, label + ': must throw');
  assert.match(error.message, pattern, label);
  assert.strictEqual(error.code, 'E_MODEL_STREAM', label + ': stable error code');
  assert.ok(!error.message.includes(secret), label + ': provider payload is not reflected');
}
// Sparse tool-call indexes are rejected at end(), when the gap is certain.
{
  const assembler = createCompletionAssembler();
  assembler.push(frame(delta({ tool_calls: [{ index: 1, id: 'b', function: { name: 'git_status', arguments: '{}' } }] })));
  assert.throws(() => assembler.end(), /序号不连续/);
}
// An empty body, a comments-only body and a choices-less body are not answers.
assert.throws(() => createCompletionAssembler().end(), /流式响应为空/);
{
  const assembler = createCompletionAssembler();
  assembler.push(': ping\n\n: ping\n\n');
  assert.throws(() => assembler.end(), /流式响应为空/);
}
{
  const assembler = createCompletionAssembler();
  assembler.push(frame({ id: 'x', choices: [], usage: {} }) + 'data: [DONE]\n\n');
  assert.throws(() => assembler.end(), /没有 message/);
}
// A [DONE]-only stream is likewise not an answer.
{
  const assembler = createCompletionAssembler();
  assembler.push('data: [DONE]\n\n');
  assert.throws(() => assembler.end(), /没有 message/);
}

console.log('completionStream: SSE framing, delta/tool-call merging, [DONE] handling and malformed-stream rejections passed');
