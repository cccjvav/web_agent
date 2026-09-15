'use strict';
// Only launched explicitly by isolated tests, never by application startup.
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const mode = process.argv[2] || 'normal';
fs.writeFileSync('stdio-started.json', JSON.stringify({ pid: process.pid, parent: process.ppid, args: process.argv.slice(3) }));
if (mode === 'tree') spawn(process.execPath, ['-e', `require('fs').writeFileSync('stdio-grandchild.json',JSON.stringify({pid:process.pid}));setInterval(()=>{},1000)`], { stdio: 'ignore' });
function send(message) {
  const bytes = Buffer.from(JSON.stringify(message) + '\n');
  if (mode === 'fragmented') {
    let i = 0;
    function next() { if (i < bytes.length) { process.stdout.write(bytes.subarray(i, ++i)); setImmediate(next); } }
    next();
  } else process.stdout.write(bytes);
}
if (mode === 'bad-json') process.stdout.write('not-json\n');
if (mode === 'large-line') process.stdout.write('x'.repeat(256 * 1024 + 1));
if (mode === 'stderr') process.stderr.write('x'.repeat(1024 * 1024 + 1));
if (mode === 'frames') for (let i = 0; i < 4097; i++) send({ jsonrpc: '2.0', method: 'notice' });
if (mode === 'total') for (let i = 0; i < 500; i++) send({ jsonrpc: '2.0', method: 'notice', params: 'x'.repeat(20000) });
if (mode === 'server-request') send({ jsonrpc: '2.0', id: 'server-request', method: 'sampling/createMessage', params: {} });
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  fs.appendFileSync('stdio-received.txt', 'frame\n');
  if (message.id === 'server-request') { fs.writeFileSync('stdio-server-request.json', JSON.stringify(message)); return; }
  if (!message.id) return;
  if (mode === 'exit') process.exit(3);
  let result;
  if (message.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: { tools: {} } };
  if (message.method === 'tools/list') result = { tools: [{ name: 'echo', inputSchema: { type: 'object' }, annotations: { readOnlyHint: true } }] };
  if (message.method === 'tools/call') {
    fs.appendFileSync('stdio-calls.txt', 'call\n');
    if (message.params.arguments.hang) return;
    result = { content: [{ type: 'text', text: JSON.stringify({ echo: message.params.arguments.text, unicode: '中文🙂', args: process.argv.slice(3),
      hostSecret: Boolean(process.env.WEBAGENT_STDIO_TEST_SECRET || process.env.GH_TOKEN || process.env.NODE_OPTIONS), explicitKey: Boolean(process.env.FIXTURE_TOKEN), launchSpec: Boolean(process.env.WEBAGENT_STDIO_LAUNCH) }) }] };
  }
  send({ jsonrpc: '2.0', id: message.id, result });
});
