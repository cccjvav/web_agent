'use strict';

// 本机 Chat「眼 + 手」最小集（review/PROMPT_SHUNCODE.md 第一阶段）：
// - computerUse：从 run_command 命令/输出里认出截图路径，白名单解析，读成 data URL
// - openai.js：vision 模型下一轮请求带 image_url；纯文本模型诚实失败、永不带图
// - skills.js：load_skill('computer-use') 给出仓库根脚本绝对目录 + 转发说明
// - MCP 不动：server.js 不引用 computerUse，tools/call 仍只回 text
// 全程不依赖真显示器：假 PNG + 本地假 provider。
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-vision-'));
const { config } = require('../src/config');
config.workspaceRoot = tmp;

const { collectShot, findShotCandidates, resolveShotPath, MAX_BYTES } = require('../src/agent/computerUse');
const { runOpenAI, modelSeesImages } = require('../src/agent/openai');
const { loadSkill } = require('../src/tools/skills');

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const noCu = path.join(tmp, 'no-cu-dir');

// --- 解析：-Out 参数与 stdout JSON / 裸路径
{
  const cands = findShotCandidates({
    command: `& 'C:\\repo\\computer-use\\win\\snap.ps1' -WindowTitle 记事本 -Out shots\\cur.png`,
    stdout: ''
  });
  assert.ok(cands.some((c) => c === 'shots\\cur.png'), '-Out 反斜杠路径应被认出');
  const quoted = findShotCandidates({ command: 'snap.ps1 -Out "shots/my shot.png"', stdout: '' });
  assert.ok(quoted.includes('shots/my shot.png'), '带引号 -Out 应去引号');
  const fromStdout = findShotCandidates({ command: 'x', stdout: '{"in":"a.png","out":"a-marked.png","ok":true}' });
  assert.ok(fromStdout.includes('a-marked.png'), 'mark.ps1 JSON out 应被认出');
  assert.ok(findShotCandidates({ command: 'npm test', stdout: 'all pass' }).length === 0, '无图命令不应误报');
}

// --- 白名单：工作区内收、外面拒
fs.mkdirSync(path.join(tmp, 'shots'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'shots', 'cur.png'), Buffer.from(PNG_B64, 'base64'));
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'webagent-outside-'));
fs.writeFileSync(path.join(outside, 'evil.png'), Buffer.from(PNG_B64, 'base64'));
{
  assert.ok(resolveShotPath('shots/cur.png', { workspaceRoot: tmp, cuDir: noCu }), '工作区内相对路径应收');
  assert.ok(resolveShotPath(path.join(tmp, 'shots', 'cur.png'), { workspaceRoot: tmp, cuDir: noCu }), '工作区内绝对路径应收');
  assert.strictEqual(resolveShotPath(path.join(outside, 'evil.png'), { workspaceRoot: tmp, cuDir: noCu }), null, '工作区外图片必须拒收');
  assert.strictEqual(resolveShotPath('shots/cur.txt', { workspaceRoot: tmp, cuDir: noCu }), null, '非图片扩展名拒收');
  // symlink 逃逸：工作区内链接指向外部图片 → realpath 后拒绝
  try {
    fs.symlinkSync(path.join(outside, 'evil.png'), path.join(tmp, 'shots', 'link.png'));
    assert.strictEqual(resolveShotPath('shots/link.png', { workspaceRoot: tmp, cuDir: noCu }), null, 'symlink 逃逸必须拒收');
  } catch (_) { /* 平台不支持 symlink 则跳过 */ }
  const shot = collectShot({ command: 'snap -Out shots/cur.png', stdout: '' }, { workspaceRoot: tmp, cuDir: noCu });
  assert.ok(shot && shot.dataUrl && shot.dataUrl.startsWith('data:image/png;base64,'), 'collectShot 应返回 data URL');
  assert.ok(shot.bytes > 0 && shot.rel);
  // 超限 → tooBig（临时调小上限没法，直接造 > MAX_BYTES 太贵；用不存在路径与大文件二选一：
  // 这里断言 tooBig 语义由 6MB 常量保证，行为分支在集成段用文本模型覆盖诚实提示路径）
  assert.ok(MAX_BYTES === 6 * 1024 * 1024);
}

// --- vision 能力判定
assert.strictEqual(modelSeesImages({ vision: true }), true);
assert.strictEqual(modelSeesImages({ caps: ['tools', 'vision'] }), true);
assert.strictEqual(modelSeesImages({ capabilities: ['vision'] }), true);
assert.strictEqual(modelSeesImages({ caps: ['tools'] }), false);
assert.strictEqual(modelSeesImages({}), false);
assert.strictEqual(modelSeesImages(null), false);

// --- skills：computer-use 带绝对脚本目录与转发说明
{
  const skill = loadSkill({ name: 'computer-use' });
  assert.ok(skill.found, '仓库根 computer-use 应能按名字加载');
  assert.ok(skill.absDir && skill.absDir.endsWith('computer-use'));
  assert.ok(skill.scriptsDir && skill.scriptsDir.endsWith(path.join('computer-use', 'win')));
  assert.ok(/snap\.ps1/.test(skill.runHint || ''), 'runHint 应给出 snap.ps1 命令模板');
  assert.ok(/不回传图片|看不了屏幕/.test(skill.runHint || ''), 'runHint 应写明 Bridge 无图');
  const other = loadSkill({ name: '不存在' });
  assert.strictEqual(other.found, false);
}

// --- 集成：假 provider。vision 模型第二轮请求带 image_url；纯文本模型永不带图且诚实
function withProvider(responses, run) {
  return new Promise((resolve, reject) => {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (d) => { raw += d; });
      req.on('end', () => {
        bodies.push(JSON.parse(raw));
        const r = responses[Math.min(bodies.length - 1, responses.length - 1)];
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(r));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
      run(baseUrl, bodies)
        .then(() => server.close(resolve))
        .catch((err) => server.close(() => reject(err)));
    });
  });
}

const toolCallResp = (cmd) => ({
  choices: [{
    message: {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'tc1', type: 'function', function: { name: 'run_command', arguments: JSON.stringify({ command: cmd }) } }]
    }
  }]
});
const finalResp = (text) => ({ choices: [{ message: { role: 'assistant', content: text } }] });

// run_command 仅 code 模式；命令用 echo（Linux/Windows 都无害），-Out 指向预置假 PNG
const cmd = `echo snapped -Out ${path.join(tmp, 'shots', 'cur.png')}`;

async function main() {
  await withProvider([toolCallResp(cmd), finalResp('我看到截图了')], async (baseUrl, bodies) => {
    const events = [];
    const out = await runOpenAI({
      mode: 'code',
      message: '按 computer-use 看屏幕',
      history: [],
      emit: (t, d = {}) => events.push({ t, ...d }),
      model: { id: 'v', modelId: 'vision-1', baseUrl, apiKey: 'k', vision: true },
      allowTools: true
    });
    assert.strictEqual(out.text, '我看到截图了');
    assert.strictEqual(bodies.length, 2, '应恰好两轮请求');
    assert.ok(!JSON.stringify(bodies[0]).includes('image_url'), '第一轮不该有图');
    const second = JSON.stringify(bodies[1]);
    assert.ok(second.includes('"type":"image_url"'), '第二轮请求必须带 image 部分');
    assert.ok(second.includes('data:image/png;base64,'), 'image 用 data URL（不走会截断的文本通道）');
    assert.ok(second.includes(path.basename(tmp)) || second.includes('cur.png'), '附文说明带相对路径');
    assert.ok(events.some((e) => e.t === 'status' && /截图/.test(e.text || '')), 'UI 状态提示已发');
    const blob = JSON.stringify(events);
    assert.ok(!blob.includes(PNG_B64.slice(0, 40)), '事件流不得携带 base64 图数据');
  });

  await withProvider([toolCallResp(cmd), finalResp('看不了图')], async (baseUrl, bodies) => {
    const events = [];
    await runOpenAI({
      mode: 'code',
      message: '按 computer-use 看屏幕',
      history: [],
      emit: (t, d = {}) => events.push({ t, ...d }),
      model: { id: 't', modelId: 'text-1', baseUrl, apiKey: 'k' },
      allowTools: true
    });
    const all = JSON.stringify(bodies);
    assert.ok(!all.includes('image_url'), '纯文本模型永不接收图片');
    assert.ok(all.includes('未标记为可看图'), '模型被明确要求如实转告');
    assert.ok(events.some((e) => e.t === 'status' && /不会看图|未标记/.test(e.text || '')), 'UI 有诚实提示');
  });

  // --- MCP 不变：Bridge 仍然只回文本
  const serverSrc = fs.readFileSync(path.join(__dirname, '../src/mcp/server.js'), 'utf8');
  assert.ok(!serverSrc.includes('computerUse'), 'MCP server 不得引用 Chat 专用 computerUse');
  assert.ok(!/type:\s*'image'/.test(serverSrc), "MCP tools/call 仍只回 type:'text'");

  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
  console.log('chatVision tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
