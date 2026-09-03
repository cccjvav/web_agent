# api 模块说明书

当前处理目标：`shuncode-core/agent-host/src/api/`

本目录只有 `routes.js`：工作台和 VS Code 插件用的 REST，挂在 `/api`。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 给人点的按钮的后端：状态、Chat 流、文件树、自定义设置、启停 Bridge、探测模型。
- **依赖：** `../config`、`../tools`、`../tools/readCache`（`resetHashes`）、`../agent/runChat`、`../agent/providers`、`../models/*`、`../mcp/session`（含 `reset`）、`../mcp/instructions`、`../mcp/clients`、`../mcp/oauth`、`../tunnel/cloudflared`、`../utils/eventBus`、`../tools/patchEngine`。
- **谁调用：** `../index.js` `app.use('/api', apiRouter)`；浏览器 `workbench/app.js` 与 `extension/extension.js` fetch 这些路径。

---

## 2. 文件级详细说明书

### 📄 文件名：`routes.js`

- **文件职责：** 注册全部 `/api/*` 路由。
- **核心类/函数清单：**

  - **Function `publicOrigin(req)`（L23–L27）** — proto/host 来自转发头或 `req`，fallback host 用 `workbenchPort`。
  - **Function `mcpOrigin(req)`（L29–L32）** — 有 `config.publicTunnelUrl` 用它（去尾 `/`），否则 `publicOrigin`。
  - **Function `mcpInfo(req)`（L34–L50）** — 拼 `/mcp/${secretKey}`、canonical `/mcp`、bootstrap prompt、`listClients`、pairing、`tunnel.snapshot()`。

- **路由（逐步，含分支）：**

  - **GET `/status`（L52–L88）** — 拼 online、端口、workspace、tools、taskState、logs 40 条、bridgeRunning、mcpInfo 展开、models（apiKey 变成 `hasKey` 布尔）、activeModelId、multiModel、bridgeAccount、mcpSession。无鉴权。
  - **POST `/bridge/reset-secret`（L90–L96）** — `generateNewSecret()` → `oauth.revokeAll()` → broadcast `secret_rotated`。**不** `store.patch({ secretKey })`。
  - **POST `/bridge/start`（L98–L116）**
    - L100–L102：`!loggedIn || !deviceAuthorized` → **403**。
    - L103–L107：记下 tunnelProvider，patch store，`config.bridgeRunning=true`。
    - L108：`oauth.ensurePairing()`。
    - L109–L115：broadcast + json；note 写明预览可同域、无需 cloudflared。
    - **源码未调用 `tunnel.startQuickTunnel`。**
  - **POST `/bridge/stop`（L118–L122）** — `bridgeRunning=false`，broadcast。**不** `stopTunnel`。
  - **POST `/consensus/run`（L124–L132）** — `runMultiModelConsensus`；catch 500。
  - **POST `/tool/call`（L134–L145）** — body `{ name, arguments, mode='code' }`；broadcast 后 `callTool(..., mode)`；失败 400。
  - **POST `/chat`（L147–L169）** — NDJSON、`X-Accel-Buffering: no`、flushHeaders。emit 写一行 JSON。try `runChat` 后 emit `done`；catch emit `error`；最后 `res.end()`。
  - **POST `/tasks/reset`（L171–L173）** — `resetTaskState()`。
  - **GET `/files/tree`（L175–L182）** — `callTool('list_directory', { recursive:true, maxDepth:5 }, 'ask')`。
  - **GET `/files/content`（L184–L201）** — query.path → resolveSafePath；不存在或目录 404；否则全文+hash。
  - **PUT `/files/content`（L203–L218）** — path 与 string content 必须；mkdir+write；broadcast。
  - **GET `/skills`（L220–L241）** — 扫两个 skills 根，有 SKILL.md 则 preview 400 字（不要求 isDirectory 检查，与 `tools/skills.listSkills` 略不同）。
  - **POST `/providers/probe`（L243–L251）** — `listRemoteModels`；失败 400。
  - **GET `/models`（L253–L260）** — apiKey 显示 `••••` 或 `''`。
  - **POST `/models`（L262–L275）** — 可改 activeModelId；可整表 models；可 upsert `body.model`；可合并 multiModel；然后 **`store.save(cfg)` 整份**。
  - **GET `/logs`（L277–L279）** — 80 条。
  - **GET `/profile/detect`（L281–L287）** — detectEnvironment + detectTechStack + listSkills。
  - **GET `/customizations`（L289–L291）** / **PUT（L293–L297）** — load / patchCustom。
  - **POST `/skills`（L299–L311）** — name 清洗：非单词变 `-`，去首尾 `-`，最长 40；空 400。默认 content 模板。写 `.shuncode/skills/<name>/SKILL.md`。
  - **POST `/bridge/login`（L313–L326）** — 默认 github/demo，patch loggedIn true、永久顺、deviceAuthorized true。
  - **POST `/bridge/logout`（L328–L333）** — loggedIn false；**`tunnel.stopTunnel()`**；`bridgeRunning=false`。

- **关键变量：** L21 `router = express.Router()`。

---

## 3. 执行逻辑流

1. 工作台 boot → GET `/status` 填 Bridge 卡与模型下拉。
2. CHAT 发送 → POST `/chat` → `runChat` → 工具经 `callTool`。
3. 点启动 Bridge → POST `/bridge/start` 只改内存标志与配对码；MCP URL 由 `mcpOrigin` 决定（有隧道 URL 用它，否则当前页面 Host）。
4. 点「清除本轮统计」→ POST `/bridge/reset-round` → 清 MCP session 计数与 `readCache` 哈希。
5. 设置页表单 → PUT `/customizations` 或 POST `/models`。
6. 插件侧栏与工作台打同一组路径。
