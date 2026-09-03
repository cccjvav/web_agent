# utils 模块说明书

当前处理目标：`shuncode-core/agent-host/src/utils/`

进程内事件总线与 diff 辅助。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 跨 MCP / Chat / 命令执行的广播通道；补丁成功后生成 unified diff 给 UI。
- **依赖：** Node `events`；npm 包 `diff`。
- **谁调用：** `../index.js` 把 `/ws` 客户端交给 eventBus；几乎所有工具与 `mcp/server.js`、`api/routes.js` broadcast；`patchEngine` 调 `createUnifiedDiff`。

---

## 2. 文件级详细说明书

### 📄 文件名：`eventBus.js`

- **文件职责：** 单例 EventEmitter + WebSocket 扇出 + 环形日志。
- **核心类/函数清单：**

  - **Class `BridgeEventBus`（L3–L44）**
    - **constructor（L4–L8）** — `wsClients` Set；`logs=[]`；`maxLogs=500`。
    - **Method `addWsClient(ws)`（L10–L15）** — 加入 Set；`close` 时 delete。
    - **Method `broadcast(type, payload={})`（L17–L40）**
      - L18–L22：造 `{ type, timestamp ISO, payload }`。
      - L24–L27：`logs.unshift`；超过 maxLogs 则 `pop`。
      - L29–L37：对每个 ws，`readyState === 1` 才 `try send`，catch 空。
      - L39：`this.emit(type, payload)` 给进程内监听者。
    - **Method `getRecentLogs(limit=50)`（L42–L44）** — `logs.slice(0, limit)`。

- **关键变量：** L46 `const eventBus = new BridgeEventBus()`，L47 `module.exports = eventBus`（单例，不是类）。

---

### 📄 文件名：`diff.js`

- **文件职责：** 给 `apply_patch` 成功结果提供 patch 文本和加减行数。
- **Function `createUnifiedDiff(filePath, oldContent, newContent)`（L3–L29）**
  - L4–L11：`jsdiff.createTwoFilesPatch`，路径 `a/` `b/`，头 `current`/`patched`。
  - L13–L22：`diffLines` 累计 added/removed（按非空行计数）。
  - L24–L29：返回 `{ patch, additions, deletions, changes }`。

---

## 3. 执行逻辑流

1. `index.js` `attachWss`：浏览器连 `/ws` → `addWsClient`，并立即收到 `connected`（含 secretKey）。
2. 工具/MCP 调用 `broadcast` → 写入 logs + 推到所有打开的工作台。
3. 工作台 `connectWs` 根据 type 刷新终端、文件树、BRIDGE 工具卡、todos。
4. `patchEngine` 写盘后用 `createUnifiedDiff` 把 diff 放进 broadcast payload，工作台可开 diff 页。
