'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path'), os = require('os');
const express = require('express');
const { config } = require('../src/config');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'task-progress-'));
config.workspaceRoot = tmp;
const { callTool } = require('../src/tools');
const progress = require('../src/tools/progressTracker');
const eventBus = require('../src/utils/eventBus');
async function main() {
  const instructions = require('../src/mcp/instructions').getBootstrapPrompt('http://127.0.0.1/mcp/example');
  assert.ok(instructions.includes('Never replay a stale patch'));
  assert.ok(instructions.includes('explicitly call set_todos'));
  progress.resetTaskState();
  const remote = key => ({ remote: true, callerKey: key });
  await callTool('ping', {}, 'ask', remote('a-secret-session'));
  assert.deepStrictEqual(progress.getBridgeTaskStates(), [], 'ordinary tools must not invent plans');
  await callTool('set_todos', { todos: [{ title: 'Remote A', status: 'in_progress' }] }, 'ask', remote('a-secret-session'));
  await callTool('set_todos', { todos: [{ title: 'Remote B', status: 'completed' }] }, 'ask', remote('b-secret-session'));
  await callTool('set_todos', { todos: [{ title: 'Local only' }] }, 'ask');
  await callTool('report_progress', { message: 'Remote progress', percentage: 25 }, 'code', remote('a-secret-session'));
  const before = progress.getBridgeTaskStates();
  assert.equal(before.length, 2); assert.equal(before[0].progress, 25);
  assert.equal(progress.getTaskState().todos[0].title, 'Local only');
  assert.ok(!JSON.stringify(before).includes('secret-session'));
  const returned = progress.getBridgeTaskStates(); returned[0].todos[0].title = 'tamper';
  assert.deepStrictEqual(progress.getBridgeTaskStates(), before);
  for (const todos of [[null], [{title:'x',status:'invented'}], [{id:'dup',title:'a'},{id:'dup',title:'b'}], Array(51).fill({title:'x'}), [{title:'x'.repeat(501)}]]) {
    await assert.rejects(callTool('set_todos', { todos }, 'ask', remote('a-secret-session')));
  }
  assert.throws(() => progress.reportProgress({message:'bad',percentage:NaN}, remote('a-secret-session')));
  assert.deepStrictEqual(progress.getBridgeTaskStates(), before, 'invalid input must not alter plans');
  const app = express();app.use(express.json());app.use('/api',require('../src/api/routes'));
  const server = await new Promise(resolve => {const s = app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    eventBus.broadcast('tool_call_end',{source:'Bridge-Remote',tool:'remote-only',success:true,durationMs:1});
    for(let i=0;i<50;i++) eventBus.broadcast('tool_call_end',{tool:'local-noise',success:true});
    const status = await (await fetch(base+'/api/status')).json();
    const activity = await (await fetch(base+'/api/bridge/activity')).json();
    assert.deepStrictEqual(status.bridgeTaskStates, before);
    assert.equal(status.recentLogs[0].payload.tool,'remote-only','local traffic must not displace remote sidebar history');
    assert.deepStrictEqual(activity.taskStates, before);
    assert.equal(status.taskState.todos[0].title, 'Local only');
    assert.deepStrictEqual(await (await fetch(base+'/api/bridge/activity')).json(), activity, 'reload snapshot is stable');
    eventBus.broadcast('bridge_round_reset');assert.deepStrictEqual(progress.getBridgeTaskStates(), before, 'stats clear must not erase plans');
    for (let i=2;i<16;i++) await callTool('set_todos',{todos:[]},'ask',remote('peer-'+i));
    await assert.rejects(callTool('set_todos',{todos:[]},'ask',remote('overflow')));
    const oldNow = Date.now;try {const future=oldNow()+31*60*1000;Date.now=()=>future;assert.deepStrictEqual(progress.getBridgeTaskStates(),[]);} finally {Date.now=oldNow;}
    progress.resetTaskState();assert.deepStrictEqual(progress.getTaskState().todos,[]);
  } finally { await new Promise(resolve => server.close(resolve)); }
  // Existing and new-file previews are read-only and expose their exact versions.
  const { applyPatch, computeHash } = require('../src/tools/patchEngine');
  fs.writeFileSync(path.join(tmp,'edit.txt'),'old');
  const patch='<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE';
  const preview=await applyPatch({filePath:'edit.txt',patch,dryRun:true});
  assert.equal(preview.baseHash,computeHash('old'));assert.equal(preview.proposedHash,computeHash('new'));assert.ok(preview.diff.includes('+new'));
  assert.equal(fs.readFileSync(path.join(tmp,'edit.txt'),'utf8'),'old');
  fs.writeFileSync(path.join(tmp,'edit.txt'),'changed');
  await assert.rejects(applyPatch({filePath:'edit.txt',patch,expectedHash:preview.baseHash}));
  const created=await applyPatch({filePath:'absent/new.txt',patch:'new body',dryRun:true});
  assert.equal(created.baseHash,null);assert.ok(created.diff.includes('+new body'));assert.equal(created.proposedHash,computeHash('new body'));
  assert.ok(!fs.existsSync(path.join(tmp,'absent')));
  console.log('Task plans: remote/local isolation, HTTP snapshots, bounds/TTL, and versioned read-only edit previews passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
