'use strict';
// Local interactive confirmation only. No --yes, PID, path, or remote API surface.
const readline = require('readline');
async function main() {
  if (process.argv.length !== 2 || process.platform !== 'win32' || !process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('Use a local interactive Windows terminal: node scripts/tunnel-cleanup.js (no arguments or piped confirmation).');
    process.exitCode = 2; return;
  }
  let lease, terminal;
  try {
    lease = await require('../src/tunnel/tunnelCleanup').prepareCleanup();
    console.log('只处理本次验证通过的旧宿主隧道根进程；不停止当前 Bridge，不按名称批量结束。');
    console.table(lease.records);
    console.log(`未验证/无效记录跳过：${lease.skipped}。candidate 以外的项目不会执行终止。`);
    if (!lease.records.some(row => row.status === 'candidate')) { console.log('没有通过本次验证的可回收项。'); return; }
    terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await Promise.race([
      new Promise(resolve => { terminal.question('60秒内输入 RECYCLE 确认回收；其他输入或 Ctrl+C 取消：', resolve); terminal.once('SIGINT', () => resolve(null)); terminal.once('close', () => resolve(null)); }),
      lease.closed.then(() => null)
    ]);
    if (answer !== 'RECYCLE') { console.log('已取消或预览过期，未发送确认。'); return; }
    const results = await lease.confirm();
    console.table(results);
    if (results.some(row => ['failed', 'unconfirmed', 'not-started', 'owner-unknown', 'inaccessible'].includes(row.status))) process.exitCode = 1;
    console.log('terminated 才表示已观察到退出；跳过项不等于已清理。不会自动重试。');
  } catch (error) {
    console.error(error.code === 'E_CLEANUP_UNKNOWN' ? '回收结果未知：可能已执行，不要重放；请重新检测。' : '当前无法安全回收或预览已失效，未发送确认。');
    process.exitCode = 1;
  } finally {
    if (terminal) terminal.close();
    if (lease) await lease.cancel();
  }
}
main().catch(() => { console.error('Tunnel cleanup unavailable'); process.exitCode = 1; });
