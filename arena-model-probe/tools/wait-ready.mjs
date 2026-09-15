/**
 * wait-ready.mjs — 等待 arena.ai 页面完全就绪（编辑器可交互）
 */
import { CDP, sleep, evaluate } from './cdp.mjs';

const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(t => t.type === 'page' && /arena\.ai/.test(t.url));
if (!page) { console.error('找不到 arena.ai 页面'); process.exit(1); }

const cdp = await new CDP(page.webSocketDebuggerUrl).connect();
await cdp.send('Runtime.enable');

console.log(`URL: ${page.url}`);
for (let i = 1; i <= 40; i++) {
  const st = await evaluate(cdp, `(() => ({
    textLen: document.body ? document.body.innerText.length : 0,
    hasPM: Boolean(document.querySelector('.ProseMirror[contenteditable="true"]')),
    busy: /taking longer than expected/i.test(document.body ? document.body.innerText : ''),
    textHead: (document.body ? document.body.innerText : '').slice(0, 200).replace(/\\n/g, ' | '),
  }))()`).catch(() => ({ textLen: -1, hasPM: false }));
  console.log(`[${String(i).padStart(2)}s] len=${String(st.textLen).padStart(5)} PM=${st.hasPM ? 'Y' : 'n'} busy=${st.busy ? 'Y' : 'n'}  ${st.textHead.slice(0, 110)}`);
  if (st.hasPM && st.textLen > 100) { console.log('\n✓ 就绪'); break; }
  await sleep(2000);
}

// 若显示 busy，点 Reload
const needReload = await evaluate(cdp, `(() => {
  const b = [...document.querySelectorAll('button')].find(x => /reload the page/i.test((x.innerText||'')));
  if (b) { b.click(); return true; }
  return false;
})()`).catch(() => false);
if (needReload) {
  console.log('\n检测到 "taking longer than expected"，已点击 Reload，等待…');
  for (let i = 1; i <= 30; i++) {
    await sleep(2000);
    const st = await evaluate(cdp, `({
      textLen: document.body ? document.body.innerText.length : 0,
      hasPM: Boolean(document.querySelector('.ProseMirror[contenteditable="true"]')),
    })`).catch(() => ({ textLen: -1, hasPM: false }));
    console.log(`[reload ${i}] len=${st.textLen} PM=${st.hasPM ? 'Y' : 'n'}`);
    if (st.hasPM && st.textLen > 100) { console.log('\n✓ 就绪'); break; }
  }
}

cdp.close();
process.exit(0);
