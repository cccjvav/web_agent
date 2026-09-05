const assert = require('assert');
const path = require('path');
const { modeFromChatRequest } = require(path.join(__dirname, '../../extension/modeFromChatRequest'));

assert.strictEqual(modeFromChatRequest({ command: 'ask' }), 'ask');
assert.strictEqual(modeFromChatRequest({ command: 'plan' }), 'plan');
assert.strictEqual(modeFromChatRequest({ prompt: '/ask 这是什么' }), 'ask');
assert.strictEqual(modeFromChatRequest({ prompt: '修复测试' }), 'code');
assert.strictEqual(modeFromChatRequest({}), 'code');
console.log('chatMode tests passed');
