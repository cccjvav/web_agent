const assert = require('assert');
const { parseTunnelUrl, canonicalNamedUrl, startNamedTunnel } = require('../src/tunnel/cloudflared');

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

Promise.all([
  startNamedTunnel({ hostname: '', token: 'eyJnot-a-real-token' }).then(
    () => { throw new Error('empty hostname should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NAMED_HOSTNAME'); }
  ),
  startNamedTunnel({ hostname: 'mcp.example.com', token: '' }).then(
    () => { throw new Error('empty token should reject'); },
    (err) => { assert.strictEqual(err.code, 'E_NAMED_TOKEN'); }
  )
]).then(() => {
  console.log('tunnel tests passed');
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
