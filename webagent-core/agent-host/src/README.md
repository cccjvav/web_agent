# src 模块说明书

当前处理目标：`webagent-core/agent-host/src/`

本 README 只覆盖**本目录直接文件** `config.js`、`index.js`。子目录各有自己的 README：`mcp/`（已完成）、`tools/`、`agent/`、`models/`、`api/`、`tunnel/`、`utils/`。

---

## 1. 模块概述

- **定位：** 进程入口与全局单例配置。`index.js` 组装 Express、开两个 HTTP 端口、挂静态工作台 / MCP / API / OAuth / WebSocket。
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
  | `host` | listen 地址 | 写死 `'0.0.0.0'` |
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

- **文件职责：** 创建 app、两个 `http.Server`、可选跳过 3000。
- **核心类/函数清单：**

  - **顶层启动（L1–L56）**
    - L15：`persistIdentity(store)`。
    - L17–L23：工作区不存在且设了 `WORKSPACE_ROOT` → 打印错误 `exit(1)`；未设环境变量 → `mkdirSync`。
    - L25–L32：关 x-powered-by、cors、所有响应 `Cache-Control: no-store`、json 20mb、urlencoded。
    - L34–L38：静态 `../../workbench`；**先** `oauth.router`，再 `/mcp`，再 `/api`。
    - L40–L42：`GET /health` → `{ ok, product, version }`。
    - L44–L56 SPA 回退：非 GET → next；path 以 `/api` `/mcp` `/ws` `/oauth` `/.well-known` 开头或恰好 `/register` → next；有扩展名 → next；否则 `index.html`。
  - **Function `attachWss(server)`（L58–L76）** — `WebSocketServer` path `/ws`；连接时 `eventBus.addWsClient`，立刻 send `type:'connected'`，payload 含 **secretKey**。
  - **Function `listenOrExit(server, port, label)`（L82–L92）** — `error.code==='EADDRINUSE'` 打印占用后 `exit(1)`；其它 error 同样退出；`listen(port, config.host)`。
  - **双服务器（L78–L80, L94–L117）**
    - L78–L80：`uiServer` 与 `mcpServer` 都是 `http.createServer(app)`，各自 attachWss。
    - L94：`skipWorkbench = WEBAGENT_SKIP_WORKBENCH === '1'`。
    - L96–L105：非 skip 则 listen 3000 并打印 UI/MCP/Workspace。
    - L106–L112：skip 则打印「不占用 3000」。
    - L113–L117：无论 skip 都 listen `config.port`（48271）。

- **关键变量：** L24 `app`；L34 `workbenchDir`；L78–L80 两个 Server。导出 `{ app, uiServer, mcpServer }`（L119）。

---

## 3. 执行逻辑流

1. CMD/`node src/index.js` 加载 `config`（随机 secret）→ `persistIdentity` 可能换成磁盘密钥。
2. 确保工作区目录。
3. 同一套 Express：静态 UI + OAuth 发现 + `/mcp` + `/api` + `/health` + SPA。
4. 两个 listen：给人看的 3000（可跳过）与 MCP/API 的 48271。
5. 浏览器打开 3000 拿到 workbench；Chat 走 `/api`；网页 Agent 走 `/mcp`（可能经隧道）。
6. `/ws` 把工具事件推回 UI。
