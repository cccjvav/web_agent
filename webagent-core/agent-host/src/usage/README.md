# usage 模块说明书

当前处理目标：`webagent-core/agent-host/src/usage/`

本目录只有 `tracker.js`：把 **Bridge `tools/call`** 记进工作区 `.webagent/usage.json`（按 UTC 日）。`POST /api/bridge/reset-round` **不**清这份文件。本机 Chat 的 `/api/tool/call` **不**走这里。

---

## 1. 模块概述

- **定位：** 日汇总 + 可选上报。没配 `WEBAGENT_TELEMETRY_URL` + `WEBAGENT_TELEMETRY_TOKEN` 就不发 HTTP。
- **依赖：** `../config`（`workspaceRoot` / `installId` / `productName` / `version`）、`../models/store`（GitHub 用户名）。
- **谁调用：** `../mcp/server.js` 的 `tools/call` 成功/失败各 `record` 一次；`../index.js` 启动 `startReporter()`；`../api/routes.js` `GET /status` 的 `usage`。

---

## 2. 文件级详细说明书

### 📄 文件名：`tracker.js`

- **文件职责：** 读写 usage.json；15 分钟 interval + 调用后 4 秒 debounce 上报。timer `unref`，不挡测试退出。
- **核心类/函数清单：**

  - **Function `usagePath`（L11–L13）** — `<workspace>/.webagent/usage.json`。
  - **Function `today`（L15–L17）** — `toISOString().slice(0,10)`。
  - **Function `emptyDay(day)`（L19–L27）** — `toolCalls/fail` 0，`lastAt`/`lastReportAt` null。
  - **Function `load`（L29–L44）** — 坏 JSON 或 `day` 不是今天 → `emptyDay()`。
  - **Function `save(next)`（L46–L51）** — mkdir + 美化 JSON。
  - **Function `successRate(rec)`（L53–L56）** — 无调用 → `null`；否则 `round((1-fail/toolCalls)*100)`。
  - **Function `snapshot`（L58–L66）** — load + successRate + `telemetryConfigured` + `intervalMs`。
  - **Function `record({ ok=true })`（L68–L76）** — toolCalls+1；`ok` 假则 fail+1；写 `lastAt`；`scheduleReport`。
  - **Function `identity`（L78–L87）** — `provider==='github'` 才带 githubUser（去 `@`）和 githubId。
  - **Function `payload`（L89–L105）** — 上报 JSON：installId、github、day、计数、product、version。
  - **Function `reportNow({ fetchFn=fetch })`（L107–L129）** — 缺 URL/token → `{ skipped:true, reason:'not-configured' }`；无调用 → `'no-calls'`。POST Bearer。`!ok` 不改 lastReportAt。成功写 `lastReportAt`。
  - **Function `scheduleReport`（L131–L138）** — 已有 debounce 则 return；否则 4000ms 后 `reportNow().catch` 空。
  - **Function `startReporter`（L140–L146）** — 已有 timer 则 return；`setInterval` 15 分钟。
  - **Function `stopReporter`（L148–L157）** — 清 interval 与 debounce。测试用。

- **关键变量：** L6 `INTERVAL_MS = 15*60*1000`；L8–L9 `timer` / `debounce`。

---

## 3. 执行逻辑流

1. 远程 `tools/call` 结束 → `record`。
2. 约 4 秒后若配了 URL+令牌，POST 到独立管理页 `/api/report`（默认 4174，**不是** 3000/48271）。
3. 跨日 `load` 自动空计数。换工作区 = 另一份 usage.json。
