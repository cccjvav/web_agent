'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { config } = require('../src/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-concurrency-'));
config.workspaceRoot = tmp;

// Mock runChat with individual unblock callbacks
const runChatModule = require('../src/agent/runChat');
const unblockers = [];
let activeCalls = 0;

runChatModule.runChat = async ({ emit }) => {
  activeCalls++;
  emit('delta', { text: 'processing...' });
  await new Promise(resolve => {
    unblockers.push(resolve);
  });
  activeCalls--;
  emit('message', { text: 'done' });
};

const app = express();
app.use(express.json());
app.use('/api', require('../src/api/routes'));

const server = app.listen(0, '127.0.0.1');

async function main() {
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;

  // Poll instead of a fixed 50 ms sleep: on a loaded CI runner the request can take longer to reach
  // runChat (a fixed sleep failed with 0 !== 1 on ubuntu Node 20, run 36748708956).
  async function until(check, label) {
    const end = Date.now() + 5000;
    while (!check()) {
      if (Date.now() > end) throw new Error('timed out waiting for ' + label);
      await new Promise(r => setTimeout(r, 10));
    }
  }

  async function postChat(msg) {
    return fetch(base + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ask', message: msg })
    });
  }

  try {
    // 1. Send first request (will hang on unblockers)
    const p1 = postChat('first');
    await until(() => activeCalls === 1, 'activeCalls === 1');

    // 2. Send second request (will also hang)
    const p2 = postChat('second');
    await until(() => activeCalls === 2, 'activeCalls === 2');

    // 3. Send third request (exceeds MAX_ACTIVE_CHAT = 2, must get HTTP 429)
    const res3 = await postChat('third');
    assert.strictEqual(res3.status, 429);
    const body3 = await res3.json();
    assert.strictEqual(body3.success, false);
    assert.ok(body3.error.includes('并发上限'));

    // 4. Unblock both pending chats
    while (unblockers.length > 0) {
      const fn = unblockers.shift();
      fn();
    }
    const res1 = await p1;
    const res2 = await p2;
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);

    // Drain the response streams
    await res1.text();
    await res2.text();

    await until(() => activeCalls === 0, 'activeCalls === 0');

    // 5. After draining, a new chat request succeeds
    const p4 = postChat('fourth');
    await until(() => activeCalls === 1, 'activeCalls === 1');
    while (unblockers.length > 0) {
      const fn = unblockers.shift();
      fn();
    }
    const res4 = await p4;
    assert.strictEqual(res4.status, 200);
    await res4.text();

    console.log('chatConcurrency tests passed');
  } finally {
    server.closeAllConnections();
    await new Promise(r => server.close(r));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
