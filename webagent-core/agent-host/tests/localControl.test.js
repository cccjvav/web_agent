const assert = require('assert');
const { config } = require('../src/config');
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
assert.strictEqual(isPublicHost(req({ host: 'abc.ngrok-free.app' })), true);
assert.strictEqual(isPublicHost(req({ host: 'foo.ngrok.dev' })), true);
assert.strictEqual(isPublicHost(req({ host: '127.0.0.1:48271' })), false);
assert.strictEqual(isPublicHost(req({ host: 'localhost:3000' })), false);
assert.strictEqual(isPublicHost(req({ host: 'mcp.example.com' })), false);
const origPub = config.publicTunnelUrl;
config.publicTunnelUrl = 'https://mcp.example.com';
assert.strictEqual(isPublicHost(req({ host: 'mcp.example.com' })), true);
assert.strictEqual(isLocalControlPlane(req({ host: 'mcp.example.com' })), false);
config.publicTunnelUrl = origPub;

assert.strictEqual(isLocalControlPlane(req()), true);
assert.strictEqual(isLocalControlPlane(req({ headers: { 'cf-ray': 'abc' } })), false);
assert.strictEqual(isLocalControlPlane(req({ host: 'foo.trycloudflare.com' })), false);
assert.strictEqual(isLocalControlPlane(req({ ip: '10.0.0.8', host: '10.0.0.8:48271' })), false);

// A valid Host must not mask a remote socket or a forged proxy/Express address.
assert.strictEqual(isLocalControlPlane(req({ ip: '10.0.0.8' })), false);
assert.strictEqual(isLocalControlPlane({
  ...req(), socket: { remoteAddress: '10.0.0.8' },
  headers: { host: 'localhost:48271', 'x-forwarded-for': '127.0.0.1' }
}), false);
assert.strictEqual(isLocalControlPlane({ headers: { host: 'localhost' }, ip: '127.0.0.1' }), true);
assert.strictEqual(isLocalControlPlane({ headers: { host: 'localhost' } }), false);
for (const host of ['localhost:0', 'localhost:65536', '127.1', '2130706433', 'localhost.', '[::1]:999999']) {
  assert.strictEqual(isLocalControlPlane(req({ host })), false, host);
}
for (const host of ['localhost:1', 'LOCALHOST:65535', '[::1]:48271']) {
  assert.strictEqual(isLocalControlPlane(req({ host })), true, host);
}
console.log('localControl tests passed');
