/**
 * tabs.mjs — 列出 CDP 标签页（避免 PowerShell 解析问题）
 */
const PORT = process.env.AMP_CDP_PORT || 9222;
try {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const pages = list.filter(t => t.type === 'page');
  console.log(`共 ${list.length} 个目标，其中 ${pages.length} 个页面\n`);
  for (const p of pages) {
    console.log(`- ${p.title || '(无标题)'}`);
    console.log(`  ${p.url}`);
  }
} catch (e) {
  console.error('CDP 不可达: ' + e.message);
  process.exit(1);
}
