const assert = require('assert');
const {
  isLoopbackOrigin,
  isExtensionOrigin,
  isAllowedMcpOrigin,
  isAllowedApiBrowserOrigin,
  rejectCrossSiteApi
} = require('../src/utils/corsAllow');

assert.strictEqual(isLoopbackOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isLoopbackOrigin('http://localhost:48271'), true);
assert.strictEqual(isLoopbackOrigin('https://chat.deepseek.com'), false);
assert.strictEqual(isExtensionOrigin('chrome-extension://kdmpkkahkhdmdhfkdihkopikgcocbpbf'), true);
assert.strictEqual(isExtensionOrigin('https://chat.deepseek.com'), false);

assert.strictEqual(isAllowedMcpOrigin(undefined), true);
assert.strictEqual(isAllowedMcpOrigin(''), true);
assert.strictEqual(isAllowedMcpOrigin('https://chat.deepseek.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://chatgpt.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://gemini.google.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://arena.ai'), true);
assert.strictEqual(isAllowedMcpOrigin('chrome-extension://abcd'), true);
assert.strictEqual(isAllowedMcpOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isAllowedMcpOrigin('https://evil.example'), false);

assert.strictEqual(isAllowedApiBrowserOrigin(undefined), true);
assert.strictEqual(isAllowedApiBrowserOrigin('http://127.0.0.1:3000'), true);
assert.strictEqual(isAllowedApiBrowserOrigin('https://chat.deepseek.com'), false);
assert.strictEqual(isAllowedApiBrowserOrigin('https://evil.example'), false);

const prev = process.env.WEBAGENT_CORS_ORIGINS;
process.env.WEBAGENT_CORS_ORIGINS = 'https://www.doubao.com, https://tongyi.aliyun.com';
assert.strictEqual(isAllowedMcpOrigin('https://www.doubao.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://tongyi.aliyun.com'), true);
assert.strictEqual(isAllowedMcpOrigin('https://evil.example'), false);
if (prev === undefined) delete process.env.WEBAGENT_CORS_ORIGINS;
else process.env.WEBAGENT_CORS_ORIGINS = prev;

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    }
  };
}

{
  let nextCalled = false;
  const res = fakeRes();
  rejectCrossSiteApi(
    { headers: { origin: 'https://evil.example' } },
    res,
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 404);
}

{
  let nextCalled = false;
  rejectCrossSiteApi(
    { headers: { origin: 'http://127.0.0.1:3000' } },
    fakeRes(),
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, true);
}

{
  let nextCalled = false;
  rejectCrossSiteApi({ headers: {} }, fakeRes(), () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true);
}

{
  let nextCalled = false;
  const res = fakeRes();
  rejectCrossSiteApi(
    { headers: { referer: 'https://evil.example/attack' } },
    res,
    () => { nextCalled = true; }
  );
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(res.statusCode, 404);
}

console.log('corsAllow tests passed');
