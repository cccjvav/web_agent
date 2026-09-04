# api 模块说明书

当前处理目标：`webagent-core/agent-host/src/api/`

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

  - **Function `publicOrigin(req)`（L24–L28）** — proto/host 来自转发头或 `req`，fallback host 用 `workbenchPort`。
  - **Function `mcpOrigin(req)`（L30–L33）** — 有 `config.publicTunnelUrl` 用它（去尾 `/`），否则 `publicOrigin`。
  - **Function `mcpInfo(req)`（L35–L51）** — 拼 `/mcp/${secretKey}`、canonical `/mcp`、bootstrap prompt、`listClients`、pairing、`tunnel.snapshot()`。

- **路由（逐步，含分支）：**

  - **GET `/status`（L53–L89）** — 拼 online、端口、workspace、tools、taskState、logs 40 条、bridgeRunning、mcpInfo 展开、models（apiKey 变成 `hasKey` 布尔）、activeModelId、multiModel、bridgeAccount、mcpSession。无鉴权。
  - **POST `/bridge/reset-secret`（L91–L97）** — `generateNewSecret()`（内存 + `.webagent/config.json`）→ `oauth.revokeAll()` → broadcast `secret_rotated`。
  - **POST `/bridge/start`（L99–L139）**
    - L101–L103：`!loggedIn || !deviceAuthorized` → **403**。
    - L104–L108：记下 tunnelProvider，patch store，`config.bridgeRunning=true`。
    - L108：`oauth.ensurePairing()`。
    - L111–L117：`provider === 'cloudflare'` 时 **`await tunnel.startQuickTunnel({ port: config.port })`**。失败（无二进制、超时、spawn 错）记下 `tunnelError`，**不**把整个 Bridge 判失败。
    - L119–L138：broadcast + json。有 `tunnel.url` → note「Quick Tunnel 已就绪」；否则 note 带错误或「走当前页面源」，`mcpOrigin` 仍用 Host。
    - Named / ngrok **不** spawn（源码没有对应实现）。
  - **POST `/bridge/stop`（L141–L146）** — **`tunnel.stopTunnel()`**，`bridgeRunning=false`，broadcast，json 带 mcpInfo。
  - **POST `/bridge/reset-round`（L148–L153）** — `mcpReset()` + `resetHashes()` + broadcast `bridge_round_reset`。
  - **POST `/consensus/run`（L155–L163）** — `runMultiModelConsensus`；catch 500。
  - **POST `/tool/call`（L165–L176）** — body `{ name, arguments, mode='code' }`；broadcast 后 `callTool(..., mode)`；失败 400。
  - **POST `/chat`（L178–L200）** — NDJSON、`X-Accel-Buffering: no`、flushHeaders。emit 写一行 JSON。try `runChat` 后 emit `done`；catch emit `error`；最后 `res.end()`。
  - **POST `/tasks/reset`（L202–L204）** — `resetTaskState()`。
  - **GET `/files/tree`（L206–L213）** — `callTool('list_directory', { recursive:true, maxDepth:5 }, 'ask')`。
  - **GET `/files/content`（L215–L232）** — query.path → resolveSafePath；不存在或目录 404；否则全文+hash。
  - **PUT `/files/content`（L234–L249）** — path 与 string content 必须；mkdir+write；broadcast。
  - **GET `/skills`（L251–L272）** — 扫两个 skills 根，有 SKILL.md 则 preview 400 字（不要求 isDirectory 检查，与 `tools/skills.listSkills` 略不同）。
  - **POST `/providers/probe`（L274–L282）** — `listRemoteModels`；失败 400。
  - **GET `/models`（L284–L291）** — apiKey 显示 `••••` 或 `''`。
  - **POST `/models`（L293–L306）** — 可改 activeModelId；可整表 models；可 upsert `body.model`；可合并 multiModel；然后 **`store.save(cfg)` 整份**。
  - **GET `/logs`（L308–L310）** — 80 条。
  - **GET `/profile/detect`（L312–L318）** — detectEnvironment + detectTechStack + listSkills。
  - **GET `/customizations`（L320–L322）** / **PUT（L324–L328）** — load / patchCustom。
  - **POST `/skills`（L330–L342）** — name 清洗：非单词变 `-`，去首尾 `-`，最长 40；空 400。默认 content 模板。写 `.webagent/skills/<name>/SKILL.md`。
  - **POST `/bridge/login`（L344–L357）** — 默认 github/demo，patch loggedIn true、永久顺、deviceAuthorized true。
  - **POST `/bridge/logout`（L359–L365）** — loggedIn false；**`tunnel.stopTunnel()`**；`bridgeRunning=false`。

- **关键变量：** L22 `router = express.Router()`。

---

## 3. 执行逻辑流

1. 工作台 boot → GET `/status` 填 Bridge 卡与模型下拉。
2. CHAT 发送 → POST `/chat` → `runChat` → 工具经 `callTool`。
3. 点启动 Bridge → POST `/bridge/start`：登录校验后置 `bridgeRunning`、配对码；`tunnelProvider==='cloudflare'` 时 `await startQuickTunnel`。成功则 `mcpOrigin` 用 trycloudflare 公网 URL；失败仍 200，MCP 走当前页面 Host。
4. 点停止 Bridge → POST `/bridge/stop` → `stopTunnel()` 清子进程与 `publicTunnelUrl`。
5. 点「清除本轮统计」→ POST `/bridge/reset-round` → 清 MCP session 计数与 `readCache` 哈希。
6. 设置页表单 → PUT `/customizations` 或 POST `/models`。
7. 插件侧栏与工作台打同一组路径。
