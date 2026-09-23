'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const store = require('../src/models/store');
const { runChat, planRound } = require('../src/agent/runChat');
const { MODEL_REQUEST_MAX_BYTES, MODEL_RESPONSE_MAX_BYTES, MODEL_TOOL_CALL_MAX, runOpenAI } = require('../src/agent/openai');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-model-life-'));
const priorWorkspace = config.workspaceRoot, priorFetch = global.fetch;
config.workspaceRoot = tmp;
const model = { id: 'test', protocol: 'openai', apiKey: 'fixture', baseUrl: 'https://model.invalid/v1', modelId: 'fixture' };
const reply = message => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message }] }) });
(async () => {
  store.save({ ...store.defaults(), activeModelId: 'test', models: [model] });
  let defaultTools;
  global.fetch = async (_, options) => {
    assert.strictEqual(options.redirect, 'error', 'model requests must never follow redirects');
    defaultTools = JSON.parse(options.body).tools;
    return reply({ role: 'assistant', content: 'default mode checked' });
  };
  await runChat({ message: 'list' }, () => {});
  assert.ok(defaultTools.some(t => t.function.name === 'read_files'));
  assert.ok(!defaultTools.some(t => t.function.name === 'write_file'));
  assert.strictEqual((await runChat({ mode: 'invalid', message: 'list' }, () => {})).ok, false);

  // F70: reasoning models reject a custom temperature with HTTP 400, and because provider error
  // bodies are never reflected the user only ever saw "模型 HTTP 400". Checked on the real request
  // body: reasoning families get reasoning_effort (the same 思考 low/medium/high), gpt-5 -chat
  // variants get neither field, everything else keeps the temperature mapping.
  const sentBodies = [];
  global.fetch = async (_, options) => { sentBodies.push(JSON.parse(options.body)); return reply({ role: 'assistant', content: 'ok' }); };
  const sampling = [
    ['gpt-5', 'medium', { reasoning_effort: 'medium' }],
    ['o3', 'low', { reasoning_effort: 'low' }],
    ['o4-mini', undefined, { reasoning_effort: 'high' }],
    ['openai/gpt-5-mini', 'high', { reasoning_effort: 'high' }],
    ['gpt-5-chat-latest', 'low', {}],
    ['gpt-4o', 'low', { temperature: 0.1 }],
    ['deepseek-chat', 'medium', { temperature: 0.4 }],
    ['qwen-max', undefined, { temperature: 0.7 }],
    ['omni-model', 'high', { temperature: 0.7 }]
  ];
  for (const [modelId, thinkLevel, expected] of sampling) {
    sentBodies.length = 0;
    await runOpenAI({ mode: 'ask', message: 'sampling', history: [], model: { ...model, modelId }, thinkLevel, allowTools: false });
    const body = sentBodies[0];
    const got = {};
    for (const key of ['temperature', 'reasoning_effort']) if (key in body) got[key] = body[key];
    assert.deepStrictEqual(got, expected, `sampling fields for ${modelId}/${thinkLevel}`);
  }

  const reflectedProviderBody = 'REMOTE_SECRET_SHOULD_NOT_BE_REFLECTED';
  global.fetch = async () => new Response(reflectedProviderBody, { status: 401 });
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'error body', history: [], model }),
    error => {
      assert.match(error.message, /HTTP 401/);
      assert.ok(!error.message.includes(reflectedProviderBody), 'provider response bodies are not trusted error text');
      return true;
    }
  );
  assert.strictEqual(MODEL_RESPONSE_MAX_BYTES, 1024 * 1024);
  global.fetch = async () => new Response('x'.repeat(MODEL_RESPONSE_MAX_BYTES + 1), { status: 200 });
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'oversized response', history: [], model }),
    error => error && error.code === 'E_RESPONSE_TOO_LARGE'
  );
  assert.strictEqual(MODEL_REQUEST_MAX_BYTES, 12 * 1024 * 1024);
  let oversizedRequestCalls = 0;
  global.fetch = async () => { oversizedRequestCalls++; return reply({ role: 'assistant', content: 'must not send' }); };
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'oversized request', history: [], model, extraSystem: 'x'.repeat(MODEL_REQUEST_MAX_BYTES) }),
    error => error && error.code === 'E_MODEL_REQUEST_TOO_LARGE'
  );
  assert.strictEqual(oversizedRequestCalls, 0, 'oversized model requests fail before credentials or content reach fetch');

  const malformedToolEvents = [];
  let malformedToolRequests = 0;
  global.fetch = async () => {
    malformedToolRequests++;
    return reply({ role: 'assistant', content: null, tool_calls: [{
      id: 'malformed-tool-call', type: 'function',
      function: { name: 'list_directory', arguments: '{' }
    }] });
  };
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'malformed tool arguments', history: [], model,
      emit: (type, data) => malformedToolEvents.push({ type, ...data }) }),
    /工具调用参数不是对象JSON/
  );
  assert.strictEqual(malformedToolRequests, 1);
  assert.ok(!malformedToolEvents.some(event => event.type === 'tool'), 'malformed tool arguments cannot execute with fabricated empty args');
  const nonObjectToolEvents = [];
  global.fetch = async () => reply({ role: 'assistant', content: null, tool_calls: [{
    id: 'array-tool-call', type: 'function',
    function: { name: 'list_directory', arguments: '[]' }
  }] });
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'non-object tool arguments', history: [], model,
      emit: (type, data) => nonObjectToolEvents.push({ type, ...data }) }),
    /工具调用参数不是对象JSON/
  );
  assert.ok(!nonObjectToolEvents.some(event => event.type === 'tool'));

  const disabledToolEvents = [];
  global.fetch = async () => reply({ role: 'assistant', content: null, tool_calls: [{
    id: 'disabled-tool-call', type: 'function',
    function: { name: 'list_directory', arguments: '{}' }
  }] });
  await assert.rejects(
    runOpenAI({ mode: 'plan', message: 'tools are disabled', history: [], model, allowTools: false,
      emit: (type, data) => disabledToolEvents.push({ type, ...data }) }),
    /未声明或已禁用的工具/
  );
  assert.ok(!disabledToolEvents.some(event => event.type === 'tool'), 'allowTools=false must be an execution circuit breaker');

  const unadvertisedToolEvents = [];
  global.fetch = async () => reply({ role: 'assistant', content: null, tool_calls: [{
    id: 'hidden-tool-call', type: 'function',
    function: { name: 'send_command_input', arguments: '{"execId":"0123456789abcdef","input":"fixture"}' }
  }] });
  await assert.rejects(
    runOpenAI({ mode: 'code', message: 'unadvertised tool', history: [], model,
      emit: (type, data) => unadvertisedToolEvents.push({ type, ...data }) }),
    /未声明或已禁用的工具/
  );
  assert.ok(!unadvertisedToolEvents.some(event => event.type === 'tool'), 'hidden tools cannot be invoked by a provider');

  global.fetch = async () => reply({ role: 'assistant', content: { text: 'not a Chat Completions string' } });
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'bad assistant content', history: [], model }),
    /模型 message\.content 类型无效/
  );

  assert.strictEqual(MODEL_TOOL_CALL_MAX, 64);
  let excessiveToolRequests = 0;
  const excessiveToolEvents = [];
  global.fetch = async () => {
    excessiveToolRequests++;
    return reply({ role: 'assistant', content: null, tool_calls: Array.from({ length: MODEL_TOOL_CALL_MAX + 1 }, (_, index) => ({
      id: `excess-${index}`, type: 'function', function: { name: 'list_directory', arguments: '{}' }
    })) });
  };
  await assert.rejects(
    runOpenAI({ mode: 'ask', message: 'too many tools', history: [], model,
      emit: (type, data) => excessiveToolEvents.push({ type, ...data }) }),
    /模型工具调用超过64项上限/
  );
  assert.strictEqual(excessiveToolRequests, 1);
  assert.ok(!excessiveToolEvents.some(event => event.type === 'tool'));

  let projectionRequests = 0;
  const projectionToolEvents = [];
  global.fetch = async (_, options) => {
    projectionRequests++;
    if (projectionRequests === 1) return reply({
      role: 'assistant', content: null, providerSecret: 'MUST_NOT_ECHO',
      tool_calls: [{
        id: 'projection-call', type: 'function', providerExtension: 'MUST_NOT_ECHO',
        function: { name: 'list_directory', arguments: '{"dirPath":"."}', providerExtension: 'MUST_NOT_ECHO' }
      }]
    });
    const messages = JSON.parse(options.body).messages;
    const assistant = messages.find(message => message.role === 'assistant');
    assert.deepStrictEqual(Object.keys(assistant).sort(), ['content', 'role', 'tool_calls']);
    assert.deepStrictEqual(Object.keys(assistant.tool_calls[0]).sort(), ['function', 'id', 'type']);
    assert.deepStrictEqual(Object.keys(assistant.tool_calls[0].function).sort(), ['arguments', 'name']);
    assert.ok(!JSON.stringify(messages).includes('MUST_NOT_ECHO'));
    return reply({ role: 'assistant', content: 'projected' });
  };
  assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'project response', history: [], model,
    emit: (type, data) => projectionToolEvents.push({ type, ...data }) })).text, 'projected');
  assert.strictEqual(projectionToolEvents.filter(event => event.type === 'tool').length, 1);

  const events = [];
  global.fetch = async () => { throw new Error('fixture model unavailable'); };
  await runChat({ mode: 'code', message: '创建 note.txt\n```text\nhello\n```' }, (type, data) => events.push({ type, ...data }));
  assert.ok(events.some(e => e.type === 'error' && /已停止/.test(e.message)));
  assert.ok(!events.some(e => e.type === 'tool'));
  assert.ok(!fs.existsSync(path.join(tmp, 'note.txt')));
  let requests = 0;
  global.fetch = async (_, options) => {
    requests++;
    if (requests === 1) return reply({ role: 'assistant', content: null, tool_calls: Array.from({ length: 9 }, (_, i) => ({ id: 'call-' + i, type: 'function', function: { name: 'list_directory', arguments: '{"dirPath":"."}' } })) });
    const messages = JSON.parse(options.body).messages;
    const tools = messages.filter(m => m.role === 'tool');
    assert.strictEqual(tools.length, 9);
    assert.strictEqual(JSON.parse(tools[8].content).ok, false);
    return reply({ role: 'assistant', content: 'done' });
  };
  assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'list', history: [], model })).text, 'done');

  // Result-style failures must stay visible to the model and UI as failures, even when the
  // tool returned normally instead of throwing (for example operation_result).
  const queue = require('../src/utils/operatorQueue');
  queue.register('model-outcome-fixture', async () => ({ status: 'failed', error: 'fixture terminal failure' }));
  const failedOperation = queue.submit('model-outcome-fixture', {}, {}, 'model-outcome-failed');
  await queue.approve(failedOperation.requestId, true);
  const failureEvents = [];
  let failureRequests = 0;
  global.fetch = async (_, options) => {
    failureRequests++;
    if (failureRequests === 1) {
      return reply({ role: 'assistant', content: null, tool_calls: [{
        id: 'failed-result-call', type: 'function',
        function: { name: 'operation_result', arguments: JSON.stringify({ requestId: failedOperation.requestId }) }
      }] });
    }
    const messages = JSON.parse(options.body).messages;
    const reported = messages.find(message => message.role === 'tool' && message.tool_call_id === 'failed-result-call');
    assert.ok(reported, 'the model receives the returned terminal record instead of a fabricated success');
    const outcome = JSON.parse(reported.content);
    assert.strictEqual(outcome.status, 'failed');
    assert.strictEqual(outcome.result.error, 'fixture terminal failure');
    return reply({ role: 'assistant', content: 'failure observed' });
  };
  assert.strictEqual((await runOpenAI({ mode: 'ask', message: 'inspect', history: [], model,
    emit: (type, data) => failureEvents.push({ type, ...data }) })).text, 'failure observed');
  const failedEvent = failureEvents.find(event => event.type === 'tool' && event.name === 'operation_result');
  assert.ok(failedEvent);
  assert.strictEqual(failedEvent.ok, false, 'returned failed/unknown/cancelled states must not paint as successful tools');
  assert.strictEqual(failedEvent.result.status, 'failed');

  let finish;
  global.fetch = () => new Promise(resolve => { finish = resolve; });
  const oldTask = runChat({ mode: 'plan', message: 'first plan' }, () => {});
  assert.ok(finish);
  planRound.start({ task: 'second plan', maxBranches: 4 });
  finish(reply({ role: 'assistant', content: 'old plan answer' }));
  await oldTask;
  assert.strictEqual(planRound.current().task, 'second plan');
  assert.strictEqual(planRound.current().branches.length, 0);
  planRound.addBranch({ answer: 'one' }); planRound.addBranch({ answer: 'two' });
  const merging = runChat({ mode: 'plan', planAction: 'merge' }, () => {});
  planRound.addBranch({ answer: 'third arrived during merge' });
  finish(reply({ role: 'assistant', content: 'outdated merge' }));
  await merging;
  assert.strictEqual(planRound.current().merged, null);
  console.log('model failure/tool-result/Plan generation regressions passed');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  config.workspaceRoot = priorWorkspace; global.fetch = priorFetch; planRound.reset();
  fs.rmSync(tmp, { recursive: true, force: true });
});
