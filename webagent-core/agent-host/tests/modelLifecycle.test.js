'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { config } = require('../src/config');
const store = require('../src/models/store');
const { runChat, planRound } = require('../src/agent/runChat');
const { runOpenAI } = require('../src/agent/openai');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-model-life-'));
const priorWorkspace = config.workspaceRoot, priorFetch = global.fetch;
config.workspaceRoot = tmp;
const model = { id: 'test', protocol: 'openai', apiKey: 'fixture', baseUrl: 'https://model.invalid/v1', modelId: 'fixture' };
const reply = message => ({ ok: true, text: async () => JSON.stringify({ choices: [{ message }] }) });
(async () => {
  store.save({ ...store.defaults(), activeModelId: 'test', models: [model] });
  let defaultTools;
  global.fetch = async (_, options) => {
    defaultTools = JSON.parse(options.body).tools;
    return reply({ role: 'assistant', content: 'default mode checked' });
  };
  await runChat({ message: 'list' }, () => {});
  assert.ok(defaultTools.some(t => t.function.name === 'read_files'));
  assert.ok(!defaultTools.some(t => t.function.name === 'write_file'));
  assert.strictEqual((await runChat({ mode: 'invalid', message: 'list' }, () => {})).ok, false);
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
