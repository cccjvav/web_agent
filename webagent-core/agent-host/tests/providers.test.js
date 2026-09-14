const assert = require('assert');
const { listRemoteModels, probeCaps, probeContext } = require('../src/agent/providers');

async function run() {
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o' }), []);
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o', capabilities: ['vision', 'tools'] }), ['vision', 'tools']);
  assert.strictEqual(probeContext({ id: 'gpt-4o' }), '');
  assert.strictEqual(probeContext({ context_window: 128000 }), '128K');
  assert.strictEqual(probeContext({ context_length: 1000000 }), '1M');

  const orig = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        data: [
          { id: 'gpt-4o' },
          { id: 'flash-pro', capabilities: ['vision'], context_window: 128000 }
        ]
      });
    }
  });
  try {
    const models = await listRemoteModels('https://api.example.com/v1', 'sk-test');
    const guessed = models.find((m) => m.id === 'gpt-4o');
    assert.ok(guessed);
    assert.deepStrictEqual(guessed.caps, []);
    assert.strictEqual(guessed.contextSize, '');
    const declared = models.find((m) => m.id === 'flash-pro');
    assert.deepStrictEqual(declared.caps, ['vision']);
    assert.strictEqual(declared.contextSize, '128K');
    global.fetch = async (_, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('probe aborted')), { once: true });
    });
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(() => listRemoteModels('https://model.invalid', 'test', { timeoutMs: 20 }), /aborted/); }
    finally { clearTimeout(keepAlive); }
  } finally {
    global.fetch = orig;
  }
  console.log('providers.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
