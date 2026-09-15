function modeFromChatRequest(request) {
  const cmd = String((request && request.command) || '').toLowerCase();
  if (cmd === 'ask' || cmd === 'plan' || cmd === 'code') return cmd;
  const prompt = String((request && request.prompt) || '');
  if (/^\s*\/ask\b/i.test(prompt)) return 'ask';
  if (/^\s*\/plan\b/i.test(prompt)) return 'plan';
  if (/^\s*\/code\b/i.test(prompt)) return 'code';
  return 'code';
}

module.exports = { modeFromChatRequest };
