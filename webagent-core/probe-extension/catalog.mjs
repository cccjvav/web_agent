import {parseInitialModels} from '../../arena-model-probe/src/idmap.js';
export async function refreshCatalog(fetcher, signal) {
  const pages = ['https://arena.ai/leaderboard/agent','https://arena.ai/leaderboard/text','https://arena.ai/leaderboard'];
  const entries = new Map(), conflicts = new Set(), sources = [];
  for (const url of pages) {
    if (signal.aborted) throw new Error('Catalog cancelled');
    const response = await fetcher(url,{signal,credentials:'omit',redirect:'error',cache:'no-store'});
    if (!response.ok) throw new Error('Public catalog unavailable; old cache retained');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let text='', bytes=0;
    const abort = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort',abort,{once:true});
    try { for (;;) { const part = await reader.read(); if(signal.aborted) throw Error('Catalog cancelled'); if(part.done) break; bytes += part.value.length; if(bytes>2*1024*1024){abort();throw Error('Catalog page exceeds 2MiB');} text += decoder.decode(part.value,{stream:true}); } text += decoder.decode(); }
    finally { signal.removeEventListener('abort',abort); reader.releaseLock(); }
    for (const model of parseInitialModels(text)) {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(model.id || '') || typeof model.publicName !== 'string' || !model.publicName || model.publicName.length>120) continue;
      const id = model.id.toLowerCase();
      if (entries.has(id) && entries.get(id)!==model.publicName) conflicts.add(id);
      else if (entries.size < 1000) entries.set(id, model.publicName); else throw Error('Catalog count budget');
    }
    sources.push(url);
  }
  if (!entries.size) throw Error('No catalog rows; old cache retained');
  return {schema:'webagent-catalog/v1', refreshedAt:new Date().toISOString(), sources, conflicts:[...conflicts],
    models:[...entries].filter(([id])=>!conflicts.has(id)).map(([id,publicName])=>({id,publicName}))};
}
