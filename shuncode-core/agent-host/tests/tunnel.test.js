const assert = require('assert');
const { parseTunnelUrl } = require('../src/tunnel/cloudflared');

const sample = `
2026-09-02 INF +--------------------------------------------------------------------------------------------+
2026-09-02 INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-09-02 INF |  https://random-words-ab12.trycloudflare.com                                               |
2026-09-02 INF +--------------------------------------------------------------------------------------------+
`;
assert.strictEqual(parseTunnelUrl(sample), 'https://random-words-ab12.trycloudflare.com');
assert.strictEqual(parseTunnelUrl('no url here'), null);
console.log('tunnel tests passed');
