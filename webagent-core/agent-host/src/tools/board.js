// 第六阶段：多 Agent 任务板（multi-agent board）。
// 背景：Bridge 的 Streamable HTTP 本就允许多个网页 AI（MCP 客户端）同连（会话注册表见
// mcp/session.js，键为 clientName@ip）。本模块把「互知」与「临时任务分配」变成 5 个 MCP 工具：
//   peers_list / board_list / board_create / board_claim / board_update
// 设计边界（用户 2026-09-08 提出的小白想法之工程化）：
//   - 只共享**任务元数据**（标题/状态/归属/进度注），不共享对话内容、不共享密钥；
//   - 不是协作协议：没有消息总线、没有锁步；认领制（claim）防双做，注记（note）供互通进度；
//   - 板子是**临时**的：落在工作区 .webagent/board.json，随工作区走，卸载/删除即清；
//   - 信任边界不变：拿隧道地址者即可读写板（与既有工具同边界），板内不得写密钥（sensitive 扫描不覆盖板，靠 SKILL 纪律 + 文案告诫）。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');
const { allSessions } = require('../mcp/session');

const BOARD_REL = path.join('.webagent', 'board.json');
const PEER_ALIVE_MS = 10 * 60 * 1000; // 10 分钟内有动静算在线（MCP 客户端轮询间隔不定，比 ping 的 10s 宽）
const NOTE_MAX = 500;
const NOTES_KEEP = 50;
const TITLE_MAX = 200;
const VALID_STATUS = ['open', 'claimed', 'doing', 'done', 'failed'];

// 单写者队列：Node 单线程但 fs 是异步的，读-改-写必须串行，防并发认领双写
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function boardPath() {
  return path.join(config.workspaceRoot, BOARD_REL);
}

function loadBoard() {
  try {
    const raw = fs.readFileSync(boardPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tasks)) return parsed;
  } catch (_) { /* 没有板=空板 */ }
  return { tasks: [] };
}

function saveBoard(board) {
  const file = boardPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function callerOf(ctx) {
  return String((ctx && ctx.callerKey) || 'local');
}

function stamp() {
  return new Date().toISOString();
}

function nextId(board) {
  let n = 0;
  for (const t of board.tasks) {
    const m = /^t(\d+)$/.exec(String(t.id || ''));
    if (m) n = Math.max(n, parseInt(m[1], 10));
  }
  return `t${n + 1}`;
}

function view(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    owner: task.owner,
    createdBy: task.createdBy,
    createdAt: task.createdAt,
    claimedAt: task.claimedAt || null,
    updatedAt: task.updatedAt,
    notes: (task.notes || []).slice(-5)
  };
}

// —— 工具 handlers（签名与既有工具一致：(args, ctx)）——

function peersList(_args = {}, _ctx = {}) {
  const now = Date.now();
  const peers = allSessions().map((s) => ({
    key: s.key,
    client: (s.clientInfo && s.clientInfo.name) || 'External-Agent',
    connectedAt: s.connectedAt,
    lastSeen: s.lastSeen,
    calls: s.calls,
    fail: s.fail,
    busy: Boolean(s.busy),
    aliveMs: now - Date.parse(s.lastSeen),
    alive: now - Date.parse(s.lastSeen) < PEER_ALIVE_MS
  }));
  return {
    ok: true,
    aliveWindowMs: PEER_ALIVE_MS,
    count: peers.length,
    peers,
    hint: 'Before starting work, call board_list; claim a task with board_claim before doing it.'
  };
}

function boardList(_args = {}, _ctx = {}) {
  const board = loadBoard();
  return {
    ok: true,
    path: BOARD_REL,
    open: board.tasks.filter((t) => t.status === 'open').length,
    tasks: board.tasks.map(view)
  };
}

function boardCreate(args = {}, ctx = {}) {
  const title = String((args && args.title) || '').trim().slice(0, TITLE_MAX);
  if (!title) return { ok: false, error: 'E_BAD_ARGS', detail: 'board_create requires a non-empty title.' };
  return serial(() => {
    const board = loadBoard();
    const by = callerOf(ctx);
    const task = {
      id: nextId(board),
      title,
      status: 'open',
      owner: null,
      createdBy: by,
      createdAt: stamp(),
      claimedAt: null,
      updatedAt: stamp(),
      notes: []
    };
    const note = String((args && args.note) || '').trim().slice(0, NOTE_MAX);
    if (note) task.notes.push({ at: stamp(), by, text: note });
    board.tasks.push(task);
    saveBoard(board);
    return { ok: true, task: view(task) };
  });
}

function boardClaim(args = {}, ctx = {}) {
  const id = String((args && args.id) || '').trim();
  if (!id) return { ok: false, error: 'E_BAD_ARGS', detail: 'board_claim requires params.id.' };
  return serial(() => {
    const board = loadBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: 'E_NOT_FOUND', detail: `No board task ${id}.` };
    if (task.status !== 'open') {
      return { ok: false, error: 'E_TAKEN', detail: `Task ${id} is ${task.status}, owned by ${task.owner}. Pick another or wait for release.`, task: view(task) };
    }
    const by = callerOf(ctx);
    if (args.owner && args.owner !== by) return { ok: false, error: 'E_NOT_OWNER', detail: 'Tasks can only be claimed for the current peer' };
    task.owner = by;
    task.status = 'claimed';
    task.claimedAt = stamp();
    task.updatedAt = stamp();
    saveBoard(board);
    return { ok: true, task: view(task) };
  });
}

function boardUpdate(args = {}, ctx = {}) {
  const id = String((args && args.id) || '').trim();
  if (!id) return { ok: false, error: 'E_BAD_ARGS', detail: 'board_update requires params.id.' };
  const status = args && args.status ? String(args.status) : null;
  const note = args && args.note ? String(args.note).trim().slice(0, NOTE_MAX) : '';
  if (status && !VALID_STATUS.includes(status)) {
    return { ok: false, error: 'E_BAD_ARGS', detail: `status must be one of ${VALID_STATUS.join('/')}.` };
  }
  if (!status && !note) return { ok: false, error: 'E_BAD_ARGS', detail: 'board_update needs status and/or note.' };
  return serial(() => {
    const board = loadBoard();
    const task = board.tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: 'E_NOT_FOUND', detail: `No board task ${id}.` };
    const by = callerOf(ctx);
    if (status) {
      if (!task.owner || task.status === 'open') return { ok: false, error: 'E_NOT_OWNER', detail: 'Claim this task with board_claim before changing status' };
      const allowed = { claimed: ['doing', 'done', 'failed', 'open'], doing: ['done', 'failed', 'open'], done: ['open'], failed: ['open'] };
      if (status !== task.status && !(allowed[task.status] || []).includes(status)) return { ok: false, error: 'E_BAD_STATE', detail: 'Invalid task transition' };
      if (task.owner && task.owner !== by) {
        return { ok: false, error: 'E_NOT_OWNER', detail: `Task ${id} is owned by ${task.owner}; only the owner may change status. Add a note instead.`, task: view(task) };
      }
      task.status = status;
      if (status === 'open') { task.owner = null; task.claimedAt = null; } // 释放
      if (status === 'claimed' && !task.owner) task.owner = by;
      task.updatedAt = stamp();
    }
    if (note) {
      task.notes = task.notes || [];
      task.notes.push({ at: stamp(), by, text: note });
      if (task.notes.length > NOTES_KEEP) task.notes = task.notes.slice(-NOTES_KEEP);
      task.updatedAt = stamp();
    }
    saveBoard(board);
    return { ok: true, task: view(task) };
  });
}

module.exports = {
  peersList,
  boardList,
  boardCreate,
  boardClaim,
  boardUpdate,
  BOARD_REL,
  PEER_ALIVE_MS,
  _boardPath: boardPath,
  _serial: serial,
  _rand: crypto.randomBytes
};
