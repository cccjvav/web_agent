const assert = require('assert');

function modeFromChatRequest(request) {
  const cmd = String((request && request.command) || '').toLowerCase();
  if (cmd === 'ask' || cmd === 'plan' || cmd === 'code') return cmd;
  const prompt = String((request && request.prompt) || '');
  if (/^\s*\/ask\b/i.test(prompt)) return 'ask';
  if (/^\s*\/plan\b/i.test(prompt)) return 'plan';
  if (/^\s*\/code\b/i.test(prompt)) return 'code';
  return 'code';
}

assert.strictEqual(modeFromChatRequest({ command: 'ask' }), 'ask');
assert.strictEqual(modeFromChatRequest({ command: 'plan' }), 'plan');
assert.strictEqual(modeFromChatRequest({ prompt: '/ask 这是什么' }), 'ask');
assert.strictEqual(modeFromChatRequest({ prompt: '修复测试' }), 'code');
assert.strictEqual(modeFromChatRequest({}), 'code');
console.log('chatMode tests passed');
