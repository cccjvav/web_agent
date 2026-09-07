'use strict';

// 本机 Chat 的「眼睛」：把 run_command 产生的截图文件读成 data URL，供 openai.js 在
// 下一轮请求里作为 OpenAI 兼容的 image_url 部分发给**标记了 vision** 的模型。
//
// 边界（有意为之，勿放宽）：
// - 只属于本机 Chat（agent 层）。MCP/Bridge 不引用本模块：网页 tools/call 仍只回 type:'text'。
// - 白名单目录：工作区内（realpath 判定，symlink 逃逸同样拒绝）或仓库根 computer-use/ 内。
//   不开任意盘符读文件的口子（架构导读 第 12 节的沙箱取舍保持不变）。
// - 只认 .png/.jpg/.jpeg；超过 MAX_BYTES 不读，返回 tooBig 让 Chat 诚实说明。
// - base64 只进模型请求体；**不经 eventBus 广播**（状态事件只带相对路径）。
const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const COMPUTER_USE_DIR = path.resolve(__dirname, '../../../../computer-use');
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const MAX_BYTES = 6 * 1024 * 1024;

function stripQuotes(s) {
  return String(s || '').replace(/^["']|["']$/g, '');
}

// 从命令行与 stdout 里找候选图片路径：
// - snap.ps1 / mark.ps1 的 `-Out <路径>`（带引号或不带）
// - mark.ps1 stdout JSON 的 "out":"<路径>"
// - stdout 里裸的 *.png / *.jpg / *.jpeg token
function findShotCandidates({ command = '', stdout = '' } = {}) {
  const out = [];
  const cmd = String(command || '');
  const text = String(stdout || '');
  let m;
  const reOut = /-Out\s+("[^"]+"|'[^']+'|[^\s;|&"']+)/gi;
  while ((m = reOut.exec(cmd)) !== null) out.push(stripQuotes(m[1]));
  const reJsonOut = /"out"\s*:\s*"([^"]+\.(?:png|jpe?g))"/gi;
  while ((m = reJsonOut.exec(text)) !== null) out.push(m[1]);
  const reBare = /[^\s"'=<>|]+\.(?:png|jpe?g)\b/gi;
  while ((m = reBare.exec(text)) !== null) out.push(m[0]);
  return out.filter(Boolean);
}

function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch (_) {
    return p;
  }
}

function inside(child, parent) {
  return child === parent || child.startsWith(parent + path.sep);
}

// 解析 + 白名单：相对路径按工作区解析；realpath 后必须落在工作区或 computer-use/ 内。
function resolveShotPath(raw, roots = {}) {
  const wsRoot = roots.workspaceRoot || config.workspaceRoot;
  const cuDir = roots.cuDir || COMPUTER_USE_DIR;
  if (!raw) return null;
  const abs = path.isAbsolute(raw) ? raw : path.resolve(wsRoot, raw);
  const real = realOrSelf(abs);
  if (!MIME[path.extname(real).toLowerCase()]) return null;
  if (inside(real, realOrSelf(wsRoot))) return real;
  if (fs.existsSync(cuDir) && inside(real, realOrSelf(cuDir))) return real;
  return null;
}

// 读文件为 data URL；超限/不存在/不可读返回 null（超限另由 collectShot 报 tooBig）。
function readShotAsDataUrl(abs) {
  try {
    const st = fs.statSync(abs);
    if (!st.isFile() || st.size === 0 || st.size > MAX_BYTES) return null;
    const mime = MIME[path.extname(abs).toLowerCase()] || 'image/png';
    const b64 = fs.readFileSync(abs).toString('base64');
    return { dataUrl: `data:${mime};base64,${b64}`, bytes: st.size, mime };
  } catch (_) {
    return null;
  }
}

// 主入口：给一条 run_command 的命令与 stdout，返回第一张可附加的截图
// { abs, rel, dataUrl, bytes, mime }；超限返回 { tooBig:true, rel, bytes }；没有则 null。
function collectShot(input = {}, roots = {}) {
  const wsRoot = roots.workspaceRoot || config.workspaceRoot;
  for (const cand of findShotCandidates(input)) {
    const abs = resolveShotPath(cand, roots);
    if (!abs) continue;
    const read = readShotAsDataUrl(abs);
    if (read) {
      return { abs, rel: path.relative(wsRoot, abs) || abs, ...read };
    }
    try {
      const st = fs.statSync(abs);
      if (st.isFile() && st.size > MAX_BYTES) {
        return { tooBig: true, rel: path.relative(wsRoot, abs) || abs, bytes: st.size };
      }
    } catch (_) { /* 继续找下一张 */ }
  }
  return null;
}

module.exports = {
  collectShot,
  findShotCandidates,
  resolveShotPath,
  readShotAsDataUrl,
  MAX_BYTES,
  COMPUTER_USE_DIR
};
