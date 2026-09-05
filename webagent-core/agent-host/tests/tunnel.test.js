const assert = require('assert');
const { parseTunnelUrl, canonicalNamedUrl, startNamedTunnel } = require('../src/tunnel/cloudflared');
const { parseNgrokUrl, startNgrokTunnel } = require('../src/tunnel/ngrok');

const sample = `
2026-09-02 INF +--------------------------------------------------------------------------------------------+
2026-09-02 INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-09-02 INF |  https://random-words-ab12.trycloudflare.com                                               |
2026-09-02 INF +--------------------------------------------------------------------------------------------+
`;
assert.strictEqual(parseTunnelUrl(sample), 'https://random-words-ab12.trycloudflare.com');
assert.strictEqual(parseTunnelUrl('no url here'), null);
assert.strictEqual(canonicalNamedUrl('https://MCP.Example.com/foo'), 'https://mcp.example.com');
assert.strictEqual(canonicalNamedUrl('mcp.example.com:443'), 'https://mcp.example.com');
assert.strictEqual(canonicalNamedUrl(''), null);
assert.strictEqual(canonicalNamedUrl('localhost'), null);

assert.strictEqual(
  parseNgrokUrl('lvl=info msg="started tunnel" url=https://abc123.ngrok-free.app'),
  'https://abc123.ngrok-free.app'
);
assert.strictEqual(
  parseNgrokUrl('{"msg":"started tunnel","url":"https://xyz.ngrok.app"}'),
  'https://xyz.ngrok.app'
);
assert.strictEqual(parseNgrokUrl('Forwarding  https://foo.ngrok.io -> http://127.0.0.1:48271'), 'https://foo.ngrok.io');
assert.strictEqual(parseNgrokUrl('no url here'), null);

const savedNgrokTok = process.env.NGROK_AUTHTOKEN;
delete process.env.NGROK_AUTHTOKEN;

Promise.all([
  startNamedTunnel({ hostname: '', token: 'eyJnot-a-real-token' }).then(
    () => { throw new Error('empty hostname should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NAMED_HOSTNAME'); }
  ),
  startNamedTunnel({ hostname: 'mcp.example.com', token: '' }).then(
    () => { throw new Error('empty token should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NAMED_TOKEN'); }
  ),
  startNgrokTunnel({ hostname: '', token: '' }).then(
    () => { throw new Error('empty ngrok token should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NGROK_TOKEN'); }
  ),
  startNgrokTunnel({ hostname: 'not a host', token: 'tok_test' }).then(
    () => { throw new Error('bad ngrok hostname should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NGROK_HOSTNAME'); }
  )
]).then(() => {
  if (savedNgrokTok != null) process.env.NGROK_AUTHTOKEN = savedNgrokTok;
  console.log('tunnel tests passed');
}).catch((err) => {
  if (savedNgrokTok != null) process.env.NGROK_AUTHTOKEN = savedNgrokTok;
  console.error(err);
  process.exit(1);
});
