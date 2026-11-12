const assert = require('assert');
const http = require('http');
const { listRemoteModels, normalizeBase, missingVersionHint, probeCaps, probeContext, PROBE_FAILURE_HINTS } = require('../src/agent/providers');
const { runWithSignal } = require('../src/utils/requestScope');

async function run() {
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o' }), []);
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o', capabilities: ['vision', 'tools'] }), ['vision', 'tools']);
  assert.strictEqual(probeContext({ id: 'gpt-4o' }), '');
  assert.strictEqual(probeContext({ context_window: 128000 }), '128K');
  assert.strictEqual(probeContext({ context_length: 1000000 }), '1M');
  // F129: a pasted endpoint or doubled /v1 is reduced to one base; a version path is never invented.
  for (const [input, expected] of [
    ['https://a.test/v1/chat/completions', 'https://a.test/v1'], [' https://a.test/v1/CHAT/COMPLETIONS/ ', 'https://a.test/v1'],
    ['https://a.test/v1/responses', 'https://a.test/v1'], ['https://a.test/v1/models', 'https://a.test/v1'],
    ['https://a.test/v1/v1', 'https://a.test/v1'], ['https://a.test/v1/v1/v1/chat/completions', 'https://a.test/v1'],
    ['https://api.deepseek.com', 'https://api.deepseek.com'], ['https://a.test', 'https://a.test'],
    ['https://a.test/openai/v1', 'https://a.test/openai/v1'], ['https://a.test/v10', 'https://a.test/v10'], ['https://a.test/x/v1x', 'https://a.test/x/v1x']
  ]) assert.strictEqual(normalizeBase(input), expected, input);
  assert.ok(missingVersionHint('https://a.test').includes('/v1') && missingVersionHint('https://openrouter.ai/api').includes('/api/v1'));
  assert.strictEqual(missingVersionHint('https://a.test/v1'), '');
  assert.strictEqual(missingVersionHint('not a url'), '');

  const orig = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({data:[
    {id:'gpt-4o'}, {id:'flash-pro',capabilities:['vision'],context_window:128000}
  ]}));
  try {
    const models = await listRemoteModels('https://api.example.com/v1', 'sk-test');
    const guessed = models.find((m) => m.id === 'gpt-4o');
    assert.ok(guessed);
    assert.deepStrictEqual(guessed.caps, []);
    assert.strictEqual(guessed.contextSize, '');
    const declared = models.find((m) => m.id === 'flash-pro');
    assert.deepStrictEqual(declared.caps, ['vision']);
    assert.strictEqual(declared.contextSize, '128K');
    for (const data of [null,{}, {data:[null]}, {data:[{id:'x'},{id:'x'}]}, {data:[{id:42}]},
      {data:Array.from({length:101},(_,i)=>({id:String(i)}))}]) {
      global.fetch = async () => new Response(JSON.stringify(data));
      await assert.rejects(()=>listRemoteModels('https://model.test/v1','test'));
    }
    global.fetch = async () => new Response('reflected-SECRET',{status:401});
    await assert.rejects(()=>listRemoteModels('https://model.test/v1','SECRET'),error=>error.message.includes('401') && !error.message.includes('SECRET'));
    const asked = [];
    global.fetch = async url => { asked.push(url); return new Response('Not Found', { status: 404 }); };
    await assert.rejects(() => listRemoteModels('https://model.test', 'test'), error => error.message.includes('404') && error.message.includes('https://主机/v1'));
    await assert.rejects(() => listRemoteModels('https://model.test/v1/chat/completions', 'test'), error => error.message.includes('404') && !error.message.includes('版本路径'));
    assert.deepStrictEqual(asked, ['https://model.test/models', 'https://model.test/v1/models'], 'discovery asks the normalised base, never a guessed /v1');
    global.fetch = async () => new Response('not JSON');
    await assert.rejects(()=>listRemoteModels('https://model.test/v1','test'),/JSON/);
    let cancelled=false;
    global.fetch = async (_,options) => {
      assert.equal(options.redirect,'error');
      return new Response(new ReadableStream({
        start(controller) {controller.enqueue(new Uint8Array(512*1024+1));},
        cancel() {cancelled=true;}
      }));
    };
    await assert.rejects(()=>listRemoteModels('https://model.test/v1','test'),error => /512KiB/.test(error.message) && error.category === 'format');
    assert.ok(cancelled,'oversized response is cancelled, not drained');
    global.fetch=()=>{throw new Error('invalid input must not reach fetch')};
    for (const [url,key] of [['https://a.test/?key=secret','x'],['https://user:pass@a.test','x'],['file:///tmp/x','x'],['https://a.test','••••']]) {
      await assert.rejects(()=>listRemoteModels(url,key),error=>error.code==='E_BAD_PROVIDER');
    }
    global.fetch = async (_, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('probe aborted')), { once: true });
    });
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(() => listRemoteModels('https://model.invalid', 'test', { timeoutMs: 20 }), error => error.category === 'timeout'); }
    finally { clearTimeout(keepAlive); }
    // F131: each discovery failure carries a fixed category word the settings page renders from its own text.
    const categoryOf = promise => promise.then(() => 'resolved', error => error.category);
    for (const [status, expected] of [[401, 'auth'], [403, 'forbidden'], [404, 'endpoint'], [500, 'http'], [429, 'http']]) {
      global.fetch = async () => new Response('reflected-SECRET', { status });
      assert.strictEqual(await categoryOf(listRemoteModels('https://model.test/v1', 'SECRET')), expected, String(status));
    }
    for (const body of ['not JSON', JSON.stringify({}), JSON.stringify({ data: [{ id: 'x' }, { id: 'x' }] })]) {
      global.fetch = async () => new Response(body);
      assert.strictEqual(await categoryOf(listRemoteModels('https://model.test/v1', 'test')), 'format', body);
    }
    for (const [code, expected] of [['ENOTFOUND', 'dns'], ['ECONNREFUSED', 'connect'], ['UND_ERR_CONNECT_TIMEOUT', 'timeout'], ['CERT_HAS_EXPIRED', 'certificate']]) {
      global.fetch = async () => { throw new TypeError('fetch failed', { cause: Object.assign(new Error('fixture SECRET'), { code }) }); };
      const failure = await listRemoteModels('https://model.test/v1', 'SECRET').catch(error => error);
      assert.strictEqual(failure.category, expected, code);
      assert.ok(failure.message.includes(PROBE_FAILURE_HINTS[expected]) && !failure.message.includes('SECRET'), failure.message);
    }
    global.fetch = async () => ({ ok: true, status: 200, body: null });
    assert.strictEqual(await categoryOf(listRemoteModels('https://model.test/v1', 'test')), 'format', 'a reply without a body');
    global.fetch = async () => { throw new Error('unclassified fixture'); };
    assert.strictEqual(await categoryOf(listRemoteModels('https://model.test/v1', 'test')), undefined, 'an unknown failure gets no category');
    const gone = new AbortController();
    global.fetch = (_, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      gone.abort(); // the caller leaves while the request is in flight
    });
    assert.strictEqual(await categoryOf(runWithSignal(gone.signal, () => listRemoteModels('https://model.test/v1', 'test'))), undefined,
      'a caller that went away is a cancellation, not a timeout');
    assert.ok(Object.isFrozen(PROBE_FAILURE_HINTS));
  } finally {
    global.fetch = orig;
  }
  // Real loopback transport: fragmented UTF-8, redirects, and a stalled response body.
  let redirected=0, bodyStarted=false;
  const server=http.createServer((req,res)=>{
    if(req.url==='/redirect/models') {res.writeHead(302,{Location:'/target/models'});res.end();return;}
    if(req.url==='/target/models') redirected++;
    if(req.url==='/slow/models') {bodyStarted=true;res.writeHead(200);res.write('{"data":[');return;}
    const bytes=Buffer.from(JSON.stringify({data:[{id:'中文/model'}]}));
    res.writeHead(200,{'Content-Type':'application/json'});
    res.write(bytes.subarray(0,17));res.end(bytes.subarray(17));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const local=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await listRemoteModels(local,'local-fixture'))[0].id,'中文/model');
    await assert.rejects(()=>listRemoteModels(local+'/redirect','local-fixture'));
    assert.equal(redirected,0);
    await assert.rejects(()=>listRemoteModels(local+'/slow','local-fixture',{timeoutMs:500}));
    assert.ok(bodyStarted,'deadline covers response body, not only headers');
    // A real refused connection (a port that was just released) is classified by the real fetch's cause code.
    const closed = http.createServer(); await new Promise(resolve => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = closed.address().port; await new Promise(resolve => closed.close(resolve));
    assert.strictEqual(await listRemoteModels(`http://127.0.0.1:${closedPort}`, 'local-fixture').then(() => 'resolved', error => error.category), 'connect');
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  console.log('providers.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
