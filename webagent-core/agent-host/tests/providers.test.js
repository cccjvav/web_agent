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
  } finally {
    global.fetch = orig;
  }
  console.log('providers.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
