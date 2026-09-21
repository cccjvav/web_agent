'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const workerThreads = require('worker_threads');
const { config } = require('../src/config');
const { grepSearch } = require('../src/tools/fileOps');
const { executeCommand } = require('../src/tools/executor');
const { runWithSignal } = require('../src/utils/requestScope');

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'process-diagnostics-'));
  const saved = {root:config.workspaceRoot,debug:process.env.WEBAGENT_DEBUG_PROCESS,Worker:workerThreads.Worker,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout,error:console.error};
  const logs = [], workers = [], realWorkers = [], timers = new Map();
  class FixtureWorker extends EventEmitter {
    constructor() {super();this.threadId=workers.length+1;this.posts=[];workers.push(this);}
    postMessage(message) {this.posts.push(message);}
    terminate() {this.terminated=(this.terminated||0)+1;this.emit('exit',1);return Promise.resolve(1);}
  }
  class TrackedWorker extends saved.Worker {
    constructor(...args) {
      super(...args);
      this.closed = new Promise(resolve => this.once('exit', resolve));
      realWorkers.push(this);
    }
  }
  const records = () => logs.filter(line => line[0] === 'process lifecycle').map(line => JSON.parse(line[1]));
  const secret = 'NEVER_LOG_QUERY_COMMAND_PATH_TOKEN';
  config.workspaceRoot = tmp;
  process.env.WEBAGENT_DEBUG_PROCESS = '1';
  console.error = (...args) => logs.push(args);
  workerThreads.Worker = FixtureWorker;
  global.setTimeout = (fn, ms) => {const token={};timers.set(token,{fn,ms});return token;};
  global.clearTimeout = token => timers.delete(token);
  try {
    const search = grepSearch({query:secret,path:secret});
    const failed = assert.rejects(search, error => error.code === 'E_TIMEOUT' && error.detail.phase === 'startup');
    const startup = [...timers.values()].find(timer => timer.ms === 10000); assert.ok(startup);
    workers[0].emit('online'); startup.fn(); await failed; await new Promise(resolve => setImmediate(resolve));
    assert.equal(workers[0].terminated,1);
    assert.ok(records().some(r => r.kind === 'search' && r.event === 'timeout' && r.online === true && r.ready === false), 'startup timeout needs an online/ready diagnostic distinction');
    assert.ok(records().some(r => r.kind === 'search' && r.event === 'released'));
    assert.equal(timers.size,0);

    logs.length=0;
    const scan = grepSearch({query:secret}); const second = workers.at(-1);
    second.emit('online');second.emit('message',{ready:true});
    const scanTimer=[...timers.values()].find(timer=>timer.ms===2000);assert.ok(scanTimer);
    second.emit('message',{ready:true}); assert.equal(timers.size,1,'duplicate ready cannot extend a budget');
    const scanFailure=assert.rejects(scan,error=>error.code==='E_TIMEOUT'&&error.detail.phase==='scan');
    scanTimer.fn();await scanFailure;await new Promise(resolve=>setImmediate(resolve));
    assert.ok(records().some(r=>r.event==='timeout'&&r.online===true&&r.ready===true));
    assert.equal(second.terminated,1); assert.equal(timers.size,0);

    logs.length=0;
    const controller=new AbortController();
    const cancelled=runWithSignal(controller.signal,()=>grepSearch({query:secret}));
    const cancelFailure=assert.rejects(cancelled,error=>error.code==='E_CANCELLED');
    controller.abort();await cancelFailure;await new Promise(resolve=>setImmediate(resolve));
    assert.ok(records().some(r=>r.kind==='search'&&r.event==='cancel'));
    assert.ok(!JSON.stringify(logs).includes(secret));
    workers.at(-1).emit('message',{ready:true});
    assert.equal(workers.at(-1).posts.length,0,'late readiness after cancellation cannot start a scan');
    assert.equal(timers.size,0);

    workerThreads.Worker=TrackedWorker;global.setTimeout=saved.setTimeout;global.clearTimeout=saved.clearTimeout;
    logs.length=0;
    const completed=await executeCommand({command:`echo ${secret}`,timeoutSec:30});
    assert.equal(completed.ok,true);assert.ok(completed.stdout.includes(secret),'diagnostics must not consume tool output');
    for (const event of ['created','spawn','stdout-first','exit','close']) assert.ok(records().some(r=>r.kind==='command'&&r.event===event),event);
    assert.ok(!JSON.stringify(logs).includes(secret));
    logs.length=0;
    const timeout=await executeCommand({command:'node -e "setInterval(()=>{},1000)"',timeoutSec:1});
    assert.equal(timeout.status,'timeout');assert.ok(records().some(r=>r.kind==='command'&&r.event==='timeout'));
    for(const record of records()) {
      assert.equal(typeof record.elapsedMs,'number');assert.ok(record.elapsedMs>=0);
      assert.ok(!Object.keys(record).some(k=>['command','cwd','query','path','stdout','stderr','env'].includes(k)));
    }
    logs.length=0;process.env.WEBAGENT_DEBUG_PROCESS='0';
    fs.writeFileSync(path.join(tmp,'sample.txt'),'needle');
    assert.equal((await executeCommand({command:'echo quiet',timeoutSec:30})).ok,true);
    assert.ok((await grepSearch({query:'needle'})).totalMatches>0);
    await Promise.all(realWorkers.map(worker => worker.closed));
    await new Promise(resolve=>setImmediate(resolve));assert.equal(records().length,0,'diagnostics default off must stay silent');
    process.env.WEBAGENT_DEBUG_PROCESS='1';console.error=()=>{throw Error('fixture broken diagnostic sink');};
    assert.equal((await executeCommand({command:'echo sink-safe',timeoutSec:30})).ok,true);
    workerThreads.Worker=FixtureWorker;
    const sinkSearch=grepSearch({query:secret});
    workers.at(-1).emit('message',{ready:true});workers.at(-1).emit('message',{result:{totalMatches:1}});
    assert.equal((await sinkSearch).totalMatches,1);
    await new Promise(resolve=>setImmediate(resolve));
  } finally {
    workerThreads.Worker=saved.Worker;global.setTimeout=saved.setTimeout;global.clearTimeout=saved.clearTimeout;console.error=saved.error;
    if(saved.debug===undefined)delete process.env.WEBAGENT_DEBUG_PROCESS;else process.env.WEBAGENT_DEBUG_PROCESS=saved.debug;
    config.workspaceRoot=saved.root;fs.rmSync(tmp,{recursive:true,force:true});
  }
  console.log('process diagnostics: bounded metadata, startup/scan/cancel distinction and real command lifecycle passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
