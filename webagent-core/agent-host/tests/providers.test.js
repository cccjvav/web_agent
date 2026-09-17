const assert = require('assert');
const http = require('http');
const { listRemoteModels, probeCaps, probeContext } = require('../src/agent/providers');

async function run() {
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o' }), []);
  assert.deepStrictEqual(probeCaps({ id: 'gpt-4o', capabilities: ['vision', 'tools'] }), ['vision', 'tools']);
  assert.strictEqual(probeContext({ id: 'gpt-4o' }), '');
  assert.strictEqual(probeContext({ context_window: 128000 }), '128K');
  assert.strictEqual(probeContext({ context_length: 1000000 }), '1M');

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
    await assert.rejects(()=>listRemoteModels('https://model.test/v1','test'),/512KiB/);
    assert.ok(cancelled,'oversized response is cancelled, not drained');
    global.fetch=()=>{throw new Error('invalid input must not reach fetch')};
    for (const [url,key] of [['https://a.test/?key=secret','x'],['https://user:pass@a.test','x'],['file:///tmp/x','x'],['https://a.test','••••']]) {
      await assert.rejects(()=>listRemoteModels(url,key),error=>error.code==='E_BAD_PROVIDER');
    }
    global.fetch = async (_, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new Error('probe aborted')), { once: true });
    });
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(() => listRemoteModels('https://model.invalid', 'test', { timeoutMs: 20 }), /aborted/); }
    finally { clearTimeout(keepAlive); }
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
  } finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
  console.log('providers.test.js ok');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
