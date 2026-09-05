# src 模块说明书

当前处理目标：`webagent-core/agent-host/src/`

本 README 只覆盖**本目录直接文件** `config.js`、`index.js`。子目录各有自己的 README：`mcp/`（已完成）、`tools/`、`agent/`、`models/`、`api/`、`tunnel/`、`utils/`。

---

## 1. 模块概述

- **定位：** 进程入口与全局单例配置。`index.js` 组装**两套** Express（店堂 UI 与后厨 MCP）、开两个 HTTP 端口。
- **依赖：** 本目录几乎所有子模块；npm：`express`、`ws`、`cors`。
- **谁调用：** `run-webagent.cmd` / `.sh` 执行 `node src/index.js`；`scripts/run-code-oss.js` 同样启动并设 `WEBAGENT_SKIP_WORKBENCH=1`。

---

## 2. 文件级详细说明书

### 📄 文件名：`config.js`

- **文件职责：** 进程内单例：端口、工作区根、secret、隧道 URL。任何 `require('../config')` 拿到同一块对象。
- **核心类/函数清单：**

  - **模块加载（L1–L21）**
    - L4–L6：`workspaceRoot = path.resolve(process.env.WORKSPACE_ROOT || …/workspace)`。
    - L8–L21 `config` 对象，见 Key 表。
  - **Function `generateNewSecret()`（L23–L29）** — 12 字节 hex 写入 `config.secretKey`；lazy `require('./models/store').patch({ secretKey })` 落盘（失败 catch 空）。返回新值。
  - **Function `persistIdentity(store)`（L31–L37）**
    - L32：`store.load()`。
    - L33–L34：有 `saved.secretKey` 则覆盖内存，否则 `store.patch({ secretKey })`。
    - L35–L36：`installId` 同样。

- **关键变量 `config` Key：**

  | Key | 含义 | 取值 |
  |---|---|---|
  | `port` | MCP/API 端口 | `AGENT_HOST_PORT` 或 `48271` |
  | `workbenchPort` | UI 端口 | `WORKBENCH_PORT` 或 `3000` |
  | `host` | listen 地址 | `WEBAGENT_BIND` 或 **`'127.0.0.1'`**（不再默认听所有网卡） |
  | `workspaceRoot` | 工具允许读写的根 | 环境变量或仓库 `workspace/` |
  | `secretKey` | URL 密钥 | 先随机 12 字节 hex，随即可能被 persistIdentity 换成磁盘值 |
  | `version` | 展示版本 | `'0.6.9'` |
  | `serverName` / `productName` | MCP serverInfo / 日志 | `WebAgent-AgentHost` / `Web Agent` |
  | `tunnelProvider` | 隧道种类标签 | 默认 `'cloudflare'` |
  | `publicTunnelUrl` | Quick Tunnel URL | 默认 `null`，由 tunnel 模块成功时写入 |
  | `bridgeRunning` | Bridge 开关 | 默认 `false`，由 `/api/bridge/start` 置 true |
  | `installId` | 安装 ID | 8 字节 hex，可被磁盘覆盖 |

---

### 📄 文件名：`index.js`

- **文件职责：** 创建 **uiApp / mcpApp** 两套 Express、两个 `http.Server`、可选跳过 3000。隧道打在 48271 时公网只应碰到 MCP/OAuth；`/api` 在 mcpApp 上要过 `rejectUnlessLocalControl`。
- **核心类/函数清单：**

  - **顶层启动（L1–L23）**
    - L15：`persistIdentity(store)`。
    - L17–L23：工作区不存在且设了 `WORKSPACE_ROOT` → 打印错误 `exit(1)`；未设环境变量 → `mkdirSync`。
  - **Function `applyCommon(app)`（L25–33）** — 关 x-powered-by、所有响应 `Cache-Control: no-store`、json 20mb、urlencoded。**不再**给两套 app 共用无条件 `cors()`。
  - **Function `mountHealth(app)`（L35–39）** — `GET /health` → `{ ok, product, version }`。
  - **Function `mountWorkbench(app)`（L43–57）** — 静态 `../../workbench`；SPA 回退：非 GET → next；path 以 `/api` `/mcp` `/ws` `/oauth` `/.well-known` 开头或恰好 `/register` → next；有扩展名 → next；否则 `index.html`。
  - **两套 app（L60–72）**
    - L60–64 `uiApp`：health、`/api` 先 `rejectUnlessLocalControl`、工作台静态 + SPA。**没有** cors、**没有** `/mcp`。
    - L66–72 `mcpApp`：`cors()`（浏览器扩展跨域调 MCP）、health、`oauth.router`、`/mcp`、`/api` 先 `rejectUnlessLocalControl` 再 `apiRouter`。**没有**静态工作台、**没有** SPA。
  - **Function `attachWss(server)`（L74–94）** — `WebSocketServer` path `/ws`；**非本机控制面直接 close(1008)**；否则 `addWsClient`，立刻 send `type:'connected'`，payload 只含 `serverName`、`version`（**不含 secretKey**）。
  - **Function `listenOrExit(server, port, label)`（L100–110）** — `error.code==='EADDRINUSE'` 打印占用后 `exit(1)`；其它 error 同样退出；`listen(port, config.host)`（默认 127.0.0.1）。
  - **双服务器（L96–139）**
    - L96–98：`uiServer = createServer(uiApp)`，`mcpServer = createServer(mcpApp)`；**只**给 uiServer attachWss。
    - L112：`skipWorkbench = WEBAGENT_SKIP_WORKBENCH === '1'`。
    - L114–126：非 skip 则 listen 3000 并打印 UI/MCP/**Bind**，以及「公网只收 /mcp 与 OAuth」。
    - L127–134：skip 则打印「不占用 3000」，并说明 `/api` 仅本机回环。
    - L136–139：无论 skip 都 listen `config.port`（48271）。

- **关键变量：** L41 `workbenchDir`；L60 `uiApp`；L66 `mcpApp`；L96–97 两个 Server。导出 `{ uiApp, mcpApp, uiServer, mcpServer }`（L141）。

---

## 3. 执行逻辑流

1. CMD/`node src/index.js` 加载 `config`（随机 secret）→ `persistIdentity` 可能换成磁盘密钥。
2. 确保工作区目录。
3. 两套 Express：`uiApp`（3000：工作台 + `/api` + `/ws`）与 `mcpApp`（48271：`/mcp` + OAuth + 本机才能打的 `/api`）。
4. 两个 listen：给人看的 3000（可跳过）与 MCP 的 48271。
5. 浏览器打开 3000 拿到 workbench；Chat 走 3000 的 `/api`；网页 Agent 走 `/mcp`（可能经隧道）。VS Code 插件仍打本机 `127.0.0.1:48271/api`（无 Cloudflare 头）。
6. `/ws` 只挂在 3000，把工具事件推回 UI；连接消息**不下发** secretKey。
