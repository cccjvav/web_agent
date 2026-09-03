# shuncode-repro（已冻结，不要运行）

这是仓库里 **第一代 Bridge 原型**：一个 Node 进程同时提供简易网页和 MCP（默认端口 **3000**，工作区是本目录 `workspace_demo/`）。

**现行产品不在这里。** 启动脚本不会进入本目录。不要 `cd shuncode-repro && npm start`。端口、工具集、密钥存储都和现在的使用指南对不上。

| 你想做的事 | 请用 |
|---|---|
| Windows 改本机仓库 | 仓库根 `run-shuncode.cmd`，代码在 `../shuncode-core/` |
| 网页里真 VS Code | `run-shuncode-vscode.cmd` |
| 目录对照 | [组件说明.md](../组件说明.md) 第 1.1 节 |

下面是第一阶段行级说明书（对照用）。**不**把本目录当成可启动产品，不要改这里的 JS。

当前处理目标：`shuncode-repro/`（整棵树：`src/`、`public/`、`tests/`、`workspace_demo/`）。无 Python。

---

## 1. 模块概述

- **定位：** 单 Express + `ws` 进程、单端口 `3000`、路径密钥 MCP、**8** 个工具、内嵌 Studio 页面、可选 cloudflared。没有 OAuth、没有双端口、没有内置 Chat Agent、没有 25 工具。
- **兄弟依赖：** **没有。** 不 import `shuncode-core/`。
- **谁曾经调用：** `npm start` → `node src/index.js`（**现在不要跑**）。`npm test` 只跑本目录 `tests/patchEngine.test.js`。

**目录内 require 关系：**

| 文件 | require 本目录 |
|---|---|
| `src/index.js` | `config`、`mcp/server`、`api/routes`、`utils/eventBus`、`tunnel/tunnelManager` |
| `src/mcp/server.js` | `./tools`、`./auth`、`../config`、`../utils/eventBus` |
| `src/mcp/auth.js` | `../config`、`../utils/eventBus` |
| `src/mcp/tools/index.js` | `./patchEngine` `./fileOps` `./executor` `./progressTracker` |
| `src/mcp/tools/fileOps.js` | `./patchEngine`、`../../config`、`../../utils/eventBus` |
| `src/mcp/tools/patchEngine.js` | `../../config`、`../../utils/eventBus`、`../../utils/diff` |
| `src/mcp/tools/executor.js` | `../../config`、`../../utils/eventBus` |
| `src/api/routes.js` | `config`、`mcp/auth`、`tunnel/tunnelManager`、`mcp/tools`、`progressTracker`、`executor`、`eventBus` |
| `src/tunnel/tunnelManager.js` | `../config`、`../utils/eventBus` |
| `public/app.js` | 无 require（浏览器） |

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **职责：** 原型 npm 清单。
- **Key：**
  - `name`=`shuncode-repro`，`version`=`1.0.0`，`main`=`index.js`（实际启动走 scripts，不是根 `index.js`）
  - `scripts.start`=`node src/index.js`；`scripts.test`=`node tests/patchEngine.test.js`
  - `dependencies`：`cors ^2.8.6`、`diff ^9.0.0`、`express ^5.2.1`、`ws ^8.21.3`
  - 无 `uuid`、无 `nodemon`。

---

### 📄 文件名：`src/config.js`

- **职责：** 进程内配置对象。密钥**每次启动随机**，不写 `.secret` 文件。
- **对象 `config`（L7–L21）：**
  - `port`：`PORT` 或 **3000**
  - `host`：写死 `'0.0.0.0'`
  - `workspaceRoot`：`WORKSPACE_ROOT` 或 `../workspace_demo`
  - `secretKey`：`crypto.randomBytes(12).toString('hex')`
  - `tunnelProvider`：写死 `'quick'`（注释写 Cloudflare / named / ngrok / local）
  - `tunnelUrl`：初始 `null`（隧道成功后由 TunnelManager 写回）
  - `version`：`'0.6.9'`；`serverName`：`'ShunCode-Bridge'`
  - `timeoutMs` 30000；`maxCommandTimeout` 60000
  - `allowShellExecution` / `autoApprove` 均为 `true`（本目录其它文件**没有读取**这两项）
- **Function `generateNewSecret`（L22–L25）** — 重新 randomBytes，返回新密钥。
- **Function `setWorkspaceRoot`（L27–L29）** — `path.resolve` 后写入 `config.workspaceRoot`。本目录启动路径**没有调用**它。

---

### 📄 文件名：`src/index.js`

- **职责：** 唯一入口：HTTP + 同端口 WebSocket + 静态页 + `/mcp` + `/api`。
- L12–L14：`express()`、`http.createServer`、`WebSocketServer({ server })`（同一端口升级 WS）。
- **WS `connection`（L17–L29）** — `eventBus.addWsClient`；立刻 `send` `{ type:'connected', payload:{ serverName, version, secretKey } }`。
- **中间件 L32–L36：** cors；json **20mb**；`public/` 静态。
- **路由 L39–L40：** `app.use('/mcp', mcpRouter)`；`app.use('/api', apiRouter)`。
- **SPA fallback L43–L47：** GET 且路径不以 `/api`、`/mcp` 开头 → 送 `public/index.html`。
- **listen L51–L61：** `config.host:config.port`；打印 MCP `http://127.0.0.1:${port}/mcp/${secretKey}`；然后 **`tunnelManager.startTunnel('local')`**（.catch 只 `console.error`）。
- L64：导出 `{ app, server }`（文件共 64 行）。

---

### 📄 文件名：`src/mcp/auth.js`

- **Function `validateSecret`（L4–L19）** — 密钥来源顺序：`req.params.secret` **或** 头 `x-mcp-secret` **或** `query.secret`。不等或缺失 → 401 JSON-RPC `-32000`。无 Bearer、无 OAuth。
- **Function `rotateSecret`（L21–L29）** — 调 `generateNewSecret`；`eventBus.broadcast('secret_rotated', { oldSecret, newSecret, timestamp })`；返回新密钥。

---

### 📄 文件名：`src/mcp/server.js`

- **职责：** Express Router，挂到 `/mcp` 后路径为 `/mcp/:secret`。
- **GET `/:secret`（L12–L27）** — 先 `validateSecret`；返回 status/online、server、version、workspace、`protocol:'mcp-streamable-http'`、endpoints 对象（jsonrpc / sse / **messages**）、toolsCount、tools 名列表。  
  **源码里没有 `POST /:secret/messages` 路由**，诊断 JSON 列出的 messages 地址本文件未实现。
- **POST `/:secret`（L32–L180）**
  - L33：拆 `jsonrpc, id, method, params`。
  - L35–L40：`jsonrpc !== '2.0'` → 400、`-32600`。
  - L42：`callStartTime = Date.now()`。
  - **switch method：**
    - `initialize` L47–L74：broadcast `agent_connected`；返回 protocol `2024-11-05`、capabilities（tools.listChanged、空 prompts/resources/logging）、serverInfo。**没有 `instructions` 字段。**
    - `notifications/initialized` L76–L78：result `{}`（仍 200 JSON，不是产品的 204）。
    - `ping` L80–L82：result `{}`。
    - `tools/list` L84–L93：`getToolList()`。
    - `tools/call` L95–L157：无 `name` → 400 `-32602`；broadcast `tool_call_start`；`callTool`；成功 broadcast `tool_call_end` success；MCP `content[{type:text}]` `isError:false`；工具 throw → isError true，文本 `Tool Execution Error: …`。
    - default L159–L164：404、`-32601`。
  - L166–L170：外层 catch → 500 `-32603`。
- **GET `/:secret/sse`（L182–L199）** — SSE 头；先写 `event: endpoint` `data: /mcp/${secret}/messages`；每 15s `: ping`；close 清 interval。同样没有对应 messages POST。

---

### 📄 文件名：`src/mcp/tools/index.js`

- **职责：** 8 个工具的 schema + 分发。
- **常量 `TOOLS`（L9–L201）** 每项 `name` / `description` / `inputSchema` / `handler`：

  | name | handler | required |
  |---|---|---|
  | `read_file` | `readFile` | filePath |
  | `write_file` | `writeFile` | filePath, content |
  | `apply_patch` | `applyPatch` | filePath, patch |
  | `execute_command` | `executeCommand` | command |
  | `list_dir` | `listDir` | （无 required） |
  | `grep_search` | `grepSearch` | query |
  | `report_progress` | `reportProgress` | message |
  | `set_todos` | `setTodos` | todos |

- L203–L204：`toolRegistry` Map（`TOOLS.forEach` 写入）。
- **Function `getToolList`（L206–L212）** — 去掉 handler，只返回 name/description/inputSchema。
- **Function `callTool`（L214–L220）** — 未知名 throw `Unknown tool: "…"`. Available tools: …；否则 `await tool.handler(args)`。无 Ask/Plan 模式参数。

---

### 📄 文件名：`src/mcp/tools/fileOps.js`

- **Function `readFile`（L7–L48）** — `resolveSafePath`；不存在 throw；是目录 throw 让用 list_dir；读 utf8；`computeHash`；按 1-based `offset`（默认 1）与 `limit`（默认 2000）切片；格式 `行号: 内容`；broadcast `file_read`；返回 filePath/totalLines/offset/limit/hash/content。
- **Function `writeFile`（L50–L68）** — mkdir recursive；写盘；broadcast `file_written`；返回 success/filePath/size/hash。
- **Function `listDir`（L70–L123）** — 内部 `scan(currentPath, currentDepth)`：depth > maxDepth 返回 `[]`；跳过 `node_modules/.git/.cache/dist/build`；目录可 `children`（recursive 且 depth < maxDepth）；文件带 size/mtime。默认 dirPath `.`、recursive false、maxDepth 3。
- **Function `grepSearch`（L121–L187）** — 非法正则 throw；非 regex 则转义；目录递归 / 单文件；跳过 node_modules/.git/.cache/dist；读失败忽略；`matches` 最多 **100** 条；返回 query/totalMatches/matches。

---

### 📄 文件名：`src/mcp/tools/patchEngine.js`

- **Function `computeHash`（L8–L10）** — SHA256 hex。
- **Function `resolveSafePath`（L12–L18）** — resolve 后必须以 `workspaceRoot` 开头，否则 throw `Security error: path … is outside workspace root.`
- **Function `parseSearchReplaceBlocks`（L28–L39）** — 正则抓 `<<<<< SEARCH` … `=====` … `>>>>> REPLACE`；返回 `{search, replace}[]`。
- **Function `applyPatch`（L44–L167）** 参数 `{ filePath, patch, expectedHash=null, dryRun=false }`：
  1. 文件不存在：若第一块 search 为空则用 replace 当新内容，否则整份 patch 当新内容；dryRun 不写盘；否则 mkdir+write；broadcast `file_patched` isNewFile。
  2. 文件存在：读盘算 hash；若提供 `expectedHash` 且既不等于全 hash 也不让全 hash `startsWith(expectedHash)` → throw **`Hash mismatch conflict`**（**不是**产品测试里的 `STALE_FILE` 字符串）。
  3. 有 SEARCH 块：规范化换行；找不到则 trim 再试；再找不到 throw `Patch conflict in block #N`。
  4. 无 SEARCH 块：若以 `--- ` 开头且含 `@@` → `jsdiff.applyPatch`，失败 throw；否则整文件替换。
  5. dryRun 返回 diff 不写盘。
  6. 否则写 `${fullPath}.tmp.${Date.now()}` 再 `renameSync`。

---

### 📄 文件名：`src/mcp/tools/executor.js`

- **模块变量** L6 `commandSequence = 0`。
- **Function `executeCommand`（L8–L105）** — 返回 Promise。
  - L10–L13：execId 自增；cwd resolve 到 workspace；timeout 默认 30s。
  - L15–L20：broadcast `command_started`。
  - L27–L28：win32 `powershell.exe -Command`，否则 `/bin/bash -c`。
  - L38–L45：超时 SIGTERM，2s 后再 SIGKILL。
  - stdout/stderr data → 累加并 broadcast `command_output`。
  - `error` → reject `Failed to start command`。
  - `close` → broadcast `command_finished`；超时也 **resolve**（带 `error` 字段），不 reject。
- **无命令黑名单**（产品 `run_command` 有 confirm_dangerous）。

---

### 📄 文件名：`src/mcp/tools/progressTracker.js`

- **模块状态 `currentTaskState`（L3–L10）** — status/progress/stepName/lastMessage/lastUpdated/todos。
- **Function `reportProgress`（L12–L29）** — percentage≥100 → status `completed` 否则 `in_progress`；clamp 0–100；broadcast `progress_updated`。
- **Function `setTodos`（L31–L48）** — 每项 id 默认 `todo-N`；title 回落到 text/description/`Task item`；status 默认 pending；broadcast `todos_updated`。
- **Function `getTaskState`（L50–L52）** / **`resetTaskState`（L54–L65）** — 后者重置并 broadcast。

---

### 📄 文件名：`src/api/routes.js`

- **职责：** 给 Studio 页的 REST（无密钥校验）。
- **GET `/status`（L17–L35）** — bridge=隧道 getStatus + port/version/serverName；workspace root/relRoot；tools 全列表；taskState；recentLogs 30。
- **POST `/bridge/start`（L39–L43）** — body `provider` 默认 `'quick'`，`host`；`startTunnel`。
- **POST `/bridge/stop`（L45–L48）** — `stopTunnel`。
- **POST `/bridge/rotate-secret`（L50–L57）** — `rotateSecret` + 当前隧道状态。
- **POST `/task/reset`（L59–L62）** — `resetTaskState`。
- **GET `/workspace/tree`（L67–L75）** — `listDir({ dirPath:'.', recursive:true, maxDepth:4 })`。
- **GET `/workspace/file`（L77–L94）** — query `path`；resolve 后必须 startsWith workspaceRoot 否则 403；不存在 404。
- **POST `/workspace/file`（L96–L115）** — body `path`+`content`；同样 403 逃逸检查；mkdir+write。
- **POST `/workspace/run-tests`（L118–L129）** — 固定 `executeCommand({ command:'npm test', cwd:'.', timeoutSec:15 })`。
- **POST `/simulator/call`（L134–L145）** — body `tool` + `arguments`；broadcast `simulator_call`；`callTool`。

挂到 app 后完整路径是 `/api/...`。

---

### 📄 文件名：`src/tunnel/tunnelManager.js`

- **Class `TunnelManager`（L5–L91）**
  - 实例字段：process、publicUrl、status（`offline|starting|online|error`）、provider（默认 `'quick'`）、error。
  - **Method `isCloudflaredAvailable`（L14–L21）** — `execSync('cloudflared --version')`，失败 false。
  - **Method `startTunnel(provider='quick', customHost=null)`（L23–L75）**
    - L24–L27：记下 provider，status=starting，broadcast。
    - L29–L35：`provider==='local'` → publicUrl=`http://127.0.0.1:${port}`，online，写 `config.tunnelUrl`。
    - L37–L64：若有 cloudflared → spawn `cloudflared tunnel --url http://127.0.0.1:${port}`（**不看 named/ngrok，也不用 `customHost`**）；stderr 正则 `https://*.trycloudflare.com` 第一次命中则 online。
    - L65–L73：无 cloudflared → 与 local 相同 fallback。
  - **Method `stopTunnel`（L77–L85）** — SIGTERM 子进程，status offline。
  - **Method `getStatus`（L88–L97）** — status/provider/publicUrl、`mcpEndpoint`=`${publicUrl}/mcp/${secretKey}`、secretKey、hasCloudflared。
- L100–L101：单例导出。

入口 `index.js` 只调用 `startTunnel('local')`，默认**不会**自动开 Cloudflare。

---

### 📄 文件名：`src/utils/eventBus.js`

- **Class `BridgeEventBus` extends EventEmitter（L3–L47）**
  - L6–L8：`wsClients` Set；`logs` 数组；`maxLogs=500`。
  - **`addWsClient`（L11–L16）** — add；close 时 delete。
  - **`broadcast(type, payload={})`（L18–L42）** — 组 `{type,timestamp,payload}`；unshift 进 logs，超 500 则 pop；向 readyState===1 的 ws `send` JSON；再 `this.emit(type, payload)`。
  - **`getRecentLogs(limit=50)`（L44–L46）** — `logs.slice(0, limit)`。
- L49–L50：单例导出。

---

### 📄 文件名：`src/utils/diff.js`

- **Function `createUnifiedDiff`（L3–L30）** — `jsdiff.createTwoFilesPatch`；`diffLines` 统计 additions/deletions（空行 filter 掉）；返回 `{ patch, additions, deletions, changes }`。

---

### 📄 文件名：`public/index.html`

- **职责：** Studio 壳，无业务脚本（L237 `<script src="app.js">`）。
- **主要 DOM id：** `bridge-status-pill`、`btn-rotate-secret`、`btn-copy-prompt`、`btn-run-tests`、`btn-copy-url`、`mcp-url-display`、`prompt-text-preview`、`file-tree-container`、`btn-refresh-files`、`tools-badge-container`、`tab-stream/editor/diff/simulator`、`activity-stream-list`、`code-editor-area`、`btn-save-file`、`diff-content-area`、`sim-tool-select`、`sim-args-input`、`btn-run-sim-call`、`sim-btn-diagnose/apply-fix/verify/full-flow`、`task-progress-bar`、`todo-list-container`、`terminal-stream-box`、`toast-notify`。
- 标题写 `v0.6.9 (Core Repro)`。无 Chat 输入、无 `POST /api/chat`。

---

### 📄 文件名：`public/styles.css`

- **职责：** 深色三栏布局，无 JS。
- **`:root`（L1–L16）** — `--bg-primary` `#181824` 等；`--accent-primary` `#6366f1`；`--font-mono` / `--font-sans`。

---

### 📄 文件名：`public/app.js`

- **顶部变量 L3–L6：** `ws`、`currentSecret`、`currentMcpUrl`、`currentSelectedFile`。
- **常量 `SIMULATOR_PRESETS`（L9–L62）** — 各工具默认 JSON：read_file / apply_patch（针对 calculator divide）/ execute_command `npm test` / report_progress / set_todos / grep_search / list_dir。
- **启动 L63–L70：** DOMContentLoaded → tabs、WS、status、文件树、bindEvents、simulator。
- **Function `showToast`（L72–L80）** — `#toast-notify` 显示 2200ms。
- **Function `initTabs`（L82–L95）** — `.tab-btn` 的 `data-tab` 切 `.tab-content`。
- **Function `initWebSocket`（L97–L119）** — `ws(s)://location.host` 同端口；onmessage → `handleBridgeEvent`；onclose 3s 再连。
- **Function `handleBridgeEvent`（L122–L193）** — switch `type`：
  - `tool_call_start/end` → 活动卡
  - `file_patched` → diff + 刷新树，若正在看该文件则重读
  - `command_output/started/finished` → 终端
  - `progress_updated` / `todos_updated` → 看板
  - `secret_rotated` → 重拉 status + toast
  - 其它 type（含服务端 `connected`）**无 case，忽略**
- **Function `fetchInitialStatus`（L195–L223）** — GET `/api/status`；拼 `origin/mcp/${secret}`；提示词 = URL + 空行 + 与产品相同的那句中文；渲染工具徽章与任务状态。
- **Function `renderToolsCatalog`（L225–L232）**
- **Function `loadFileTree`（L234–L275）** — GET `/api/workspace/tree`；内部 `renderItems`（L241）；仅文件可 click 打开。
- **Function `loadFileContent`（L277–L291）** / **`saveCurrentFile`（L293–L313）** — GET/POST `/api/workspace/file`。
- **Function `addActivityCard`（L315–L346）** / **`renderDiffView`（L348–L376）** / **`appendTerminalLog`（L378–L386）**
- **Function `updateProgressUI`（L388–L394）** / **`updateTodosUI`（L396–L424）**
- **Function `initSimulatorDefaults`（L426–L573）**
  - 下拉变化填 preset JSON；`btn-run-sim-call` POST `/api/simulator/call`。
  - diagnose / apply-fix / verify 三钮改选中工具并 click 执行。
  - `sim-btn-full-flow`：依次 set_todos → progress 25% → npm test → read_file → progress 70% → apply_patch → 再 npm test → progress 100% → todos 全 completed。
- **Function `bindEvents`（L575–L621）** — 复制 URL / 复制提示词 / rotate-secret / run-tests / 刷新树 / 保存 / 清活动 / 清终端 / reset task。
- **Function `escapeHtml`（L623–L631）** — `& < > " '`。

---

### 📄 文件名：`tests/patchEngine.test.js`

- **职责：** 原型自己的 5 步核心测试（不是产品 `agent-host/tests`）。
- L10–L13：在 `tests/temp_workspace` mkdir，改 `config.workspaceRoot`。
- **Function `runTests`（L15–L64）**
  1. 写 `hello.txt`
  2. `readFile` 含 Hello World
  3. apply_patch 改 Line 2
  4. 不存在的 SEARCH → 必须 throw 且消息含 `Patch conflict`
  5. grep `Modified` totalMatches===1
  6. `rmSync` 临时目录
- L66–L69：catch → exit(1)。**不测** hash mismatch。

---

### 📄 文件名：`workspace_demo/package.json`

- `name`=`shuncode-demo-project`；`main`=`src/calculator.js`；`scripts.test`=`node tests/calculator.test.js`。无 dependencies。

### 📄 文件名：`workspace_demo/src/calculator.js`

- **Function** `add`/`subtract`/`multiply`（L5–L15）；`divide`（L17–L22）除 0 throw `Cannot divide by zero`；`power`（L24–L26）；L28–L34 `module.exports` 五函数。

### 📄 文件名：`workspace_demo/tests/calculator.test.js`

- L10–L19 本地 `test(name, fn)` 计数 passed/failed。
- L21–L40：add/subtract/multiply/divide 正常；divide(10,0) `assert.throws`。
- L42–L52：failed>0 则 exit 1。**没有测 `power`。**

---

## 3. 执行逻辑流（仅本目录，历史行为）

1. `node src/index.js` 读 `config`（密钥内存随机）。
2. 同一端口：静态 Studio + WS + `POST /mcp/:secret` + `/api/*`。
3. listen(3000) 后 `startTunnel('local')` → MCP URL 是 `http://127.0.0.1:3000/mcp/<secret>`。
4. 网页 Agent 若连上，只能调 8 工具；`initialize` **不带** instructions。
5. Studio 用 REST 读文件、模拟器 `callTool`；页面里**没有**多步 Chat Agent。
6. 本目录 `npm test` 只验证 patch/read/grep，不启 HTTP。

**现行对照（不要在本目录做）：** 产品双端口（工作台 3000 / MCP 48271）、25 工具、OAuth、Chat、密钥可持久化。见 `shuncode-core/agent-host/src/README.md`。
