/**
 * recon.mjs — 服务端侦察：下载 arena.ai 的 JS chunk，挖出真实 API 端点与模型字段
 * 目的：验证探针的 URL 启发式与 JSON 键名是否匹配站点真实行为（地面真值）。
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '..', 'recon');
const CHUNKS = resolve(OUT, 'chunks');
for (const d of [OUT, CHUNKS]) if (!existsSync(d)) mkdirSync(d, { recursive: true });

const PROXY = process.env.AMP_PROXY || 'http://127.0.0.1:10809';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function get(url) {
  return execFileSync('curl.exe', ['-sS', '--max-time', '60', '-x', PROXY, '-A', UA, url],
    { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' });
}

const html = get('https://arena.ai/agent');
writeFileSync(resolve(OUT, 'agent.html'), html, 'utf8');
console.log('[1] HTML ' + html.length + ' 字节');

const chunks = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/([\w.\-]+\.js)/g)].map(m => m[0]))];
console.log('[2] 发现 ' + chunks.length + ' 个 JS chunk');

const HITS = {
  apiPaths:  /["'`](\/(?:api|v1|v2|rpc|trpc|nextjs-api)\/[\w\-./\[\]$]{2,90})["'`]/g,
  absApi:    /https?:\/\/[\w.\-]*\.(?:arena\.ai|openai\.com|anthropic\.com|googleapis\.com)[\w\-./]{2,90}/g,
  modelKeys: /["'](model[_a-zA-Z]*|resolved_model|served_model|upstream_model|base_model|deployment[_a-zA-Z]*)["']\s*:/g,
  sse:       /(text\/event-stream|application\/x-ndjson|streamGenerateContent|generateContent|\/completions|chat\.completion)/g,
  providers: /["'](openai|anthropic|google|gemini|xai|deepseek|qwen|moonshot|zhipu|minimax|bytedance|doubao|mistral|cohere|meta|llama|bedrock|vertex|azure)["']/gi,
  modelNames:/\b(gpt[-\s]?[0-9][\w.\-]*|claude[-\s]?[\w.\-]+|gemini[-\s]?[\w.\-]+|grok[-\s]?[\w.\-]+|deepseek[-\s]?[\w.\-]+|qwen[\w.\-]*|o[1-9][-\s]?[a-z]*|kimi[\w.\-]*|glm[-\s]?[0-9][\w.\-]*)\b/gi,
};

const found = {};
for (const k of Object.keys(HITS)) found[k] = new Set();

let downloaded = 0;
for (const c of chunks) {
  let body;
  try { body = get('https://arena.ai' + c); } catch { continue; }
  downloaded++;
  const fname = c.split('/').pop().replace(/\.js$/, '');
  writeFileSync(resolve(CHUNKS, fname + '.js'), body, 'utf8');
  for (const [k, re] of Object.entries(HITS)) {
    for (const m of body.matchAll(new RegExp(re.source, re.flags))) found[k].add(m[1] || m[0]);
  }
}
console.log('[3] 下载 ' + downloaded + '/' + chunks.length + ' 个 chunk');

const report = {};
for (const [k, set] of Object.entries(found)) {
  const arr = [...set].map(String).sort();
  report[k] = arr;
  console.log('\n=== ' + k + ' (' + arr.length + ') ===');
  console.log(arr.slice(0, 70).join('\n'));
}
writeFileSync(resolve(OUT, 'findings.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('\n报告已写入 recon/findings.json');
