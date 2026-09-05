const assert = require('assert');
const {
  isLoopbackAddress,
  isTunnelRequest,
  isPublicHost,
  isLocalControlPlane
} = require('../src/utils/localControl');

function req({ ip = '127.0.0.1', host = '127.0.0.1:48271', headers = {} } = {}) {
  return {
    ip,
    socket: { remoteAddress: ip },
    headers: { host, ...headers }
  };
}

assert.strictEqual(isLoopbackAddress('127.0.0.1'), true);
assert.strictEqual(isLoopbackAddress('::1'), true);
assert.strictEqual(isLoopbackAddress('::ffff:127.0.0.1'), true);
assert.strictEqual(isLoopbackAddress('192.168.1.8'), false);

assert.strictEqual(isTunnelRequest(req({ headers: { 'cf-ray': 'abc' } })), true);
assert.strictEqual(isTunnelRequest(req({ headers: { 'cf-connecting-ip': '1.1.1.1' } })), true);
assert.strictEqual(isTunnelRequest(req()), false);

assert.strictEqual(isPublicHost(req({ host: 'random-words.trycloudflare.com' })), true);
assert.strictEqual(isPublicHost(req({ host: '127.0.0.1:48271' })), false);
assert.strictEqual(isPublicHost(req({ host: 'localhost:3000' })), false);

assert.strictEqual(isLocalControlPlane(req()), true);
assert.strictEqual(isLocalControlPlane(req({ headers: { 'cf-ray': 'abc' } })), false);
assert.strictEqual(isLocalControlPlane(req({ host: 'foo.trycloudflare.com' })), false);
assert.strictEqual(isLocalControlPlane(req({ ip: '10.0.0.8', host: '10.0.0.8:48271' })), false);

console.log('localControl tests passed');
