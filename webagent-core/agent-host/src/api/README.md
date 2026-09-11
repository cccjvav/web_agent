# api 模块说明书

## 2026-09-11当前整改语义

无公网隧道时MCP地址回退到127.0.0.1:config.port，不再使用工作台页面Host。bridge/start仅实际获得隧道URL后running/success为true；失败仍HTTP200以保留错误展示兼容，但success/running=false，并广播bridge_failed。


当前处理目标：`webagent-core/agent-host/src/api/`

本目录只有 `routes.js`：工作台和 VS Code 插件用的 REST，挂在 `/api`。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 给人点的按钮的后端：状态、Chat 流、文件树、自定义设置、启停 Bridge、探测模型。
- **依赖：** `../config`、`../tools`、`../tools/readCache`（`resetHashes`、`rememberHash`）、`../tools/planRound`、`../agent/runChat`、`../agent/providers`、`../models/*`、`../mcp/session`（含 `reset`）、`../mcp/instructions`、`../mcp/clients`、`../mcp/oauth`、`../tunnel/cloudflared`、`../tunnel/ngrok`、`../auth/github`、`../usage/tracker`、`../utils/eventBus`、`../tools/patchEngine`。
- **谁调用：** `../index.js`：`uiApp.use('/api', apiRouter)`；`mcpApp.use('/api', rejectUnlessLocalControl, apiRouter)`（隧道/公网 Host 打 48271 的 `/api` 得 404）。浏览器工作台走 **3000**；VS Code 插件走本机 `127.0.0.1:48271`。

---

## 2. 文件级详细说明书

### 📄 文件名：`routes.js`

- **文件职责：** 注册全部 `/api/*` 路由。
- **核心类/函数清单：**

  - **Function `publicOrigin(req)`（L27–L31）** — proto/host 来自转发头或 `req`，fallback host 用 `workbenchPort`。
  - **Function `mcpOrigin(req)`（L33–L36）** — 有 `config.publicTunnelUrl` 用它（去尾 `/`），否则 `publicOrigin`。
  - **Function `isNamedTunnelProvider(provider)`（L38–L40）** — `cloudflare-named` 或 `named` 为真。
  - **Function `isNgrokProvider(provider)`（L42–L44）** — `provider === 'ngrok'`。
  - **Function `recentToolLogs(limit=12)`（L46–L59）** — `getRecentLogs(40)` 里只留 `tool_call_end`，最多 12 条；payload 只含 `tool` / `success` / `durationMs`。
  - **Function `mcpInfo(req)`（L61–L77）** — 拼 `/mcp/${secretKey}`、canonical `/mcp`、bootstrap prompt、`listClients`、pairing、`tunnel.snapshot()`（含 ngrok 是否在跑）。不含 Token。

- **路由（逐步，含分支）：**

  - **GET `/status`（L79–L123）** — 拼 online、端口、workspace、**tools 只含 name/description（无 inputSchema）**、taskState、**`recentLogs: recentToolLogs(12)`**、bridgeRunning、`tunnelProvider`、**`namedDomain` / `ngrokDomain`（主机名，不含 Token）**、mcpInfo 展开、models（apiKey 变成 `hasKey` 布尔）、activeModelId、multiModel、**`planRound: planRound.snapshot()`**、bridgeAccount（含 `githubId`）、**`githubAuth.deviceAvailable`**、**`usage: tracker.snapshot()`**、mcpSession。无鉴权。`recentLogs` 仍在，但是工具名摘要。
  - **POST `/bridge/reset-secret`（L120–L125）** — `generateNewSecret()`（内存 + `.webagent/config.json`）→ `oauth.revokeAll()` → broadcast `secret_rotated`（不含新旧密钥）。
  - **POST `/bridge/start`（L131–L210）**
    - L133–L135：`!loggedIn || !deviceAuthorized` → **403**（文案：需要先点本机演示授权或完成 GitHub 验证。Chat 不受影响）。
    - L136–L149：记下 tunnelProvider、namedDomain、ngrokDomain；body 里有 Named Token / ngrok Authtoken 才写入 store；`config.bridgeRunning=true`。
    - L150：`oauth.ensurePairing()`。
    - L152–L181：`cloudflare` → **`await tunnel.startQuickTunnel`**；named → **`await tunnel.startNamedTunnel`**；`ngrok` → **`await ngrok.startNgrokTunnel({ hostname, token, port })`**。失败记下 `tunnelError`，**不** 500。缺字段不会改走 Quick Tunnel。
    - L183–L209：broadcast + json。有 `tunnel.url` → note「Quick / Named / ngrok 已就绪」；否则 note 带错误或「走当前页面源」。响应 **不含** Token。
  - **POST `/bridge/stop`（L212–L217）** — **`tunnel.stopTunnel()`**（会停 ngrok），`bridgeRunning=false`，broadcast，json 带 mcpInfo。
  - **POST `/bridge/reset-round`（L195–L200）** — `mcpReset()` + `resetHashes()` + broadcast `bridge_round_reset`。
  - **POST `/consensus/run`（L155–L163）** — `runMultiModelConsensus`；catch 500。
  - **POST `/tool/call`（L165–L176）** — body `{ name, arguments, mode='code' }`；broadcast 后 `callTool(..., mode)`；失败 400。
  - **POST `/chat`** — NDJSON、`X-Accel-Buffering: no`、flushHeaders。emit 写一行 JSON。`body.client === 'vscode-extension'` 时 `ptyJobs.runWithPty({ pty:true, emit })` 包住 `runChat`（可能发 `pty_request`）。工作台不带 client，仍一次性 spawn。后 emit `done`；catch emit `error`；最后 `res.end()`。
  - **POST `/pty/hello`** / **GET `/pty/jobs`** / **POST `/pty/jobs/:jobId`** — 插件心跳、列出未完成 job、回报 accepted/progress/done。本机控制面；隧道 404。
  - **POST `/tasks/reset`（L202–L204）** — `resetTaskState()`。
  - **GET `/files/tree`（L206–L213）** — `callTool('list_directory', { recursive:true, maxDepth:5 }, 'ask')`。
  - **GET `/files/content`（L215–L234）** — query.path → resolveSafePath；不存在或目录 404；否则全文+hash，并 `rememberHash`。
  - **PUT `/files/content`（L236–L258）** — path 与 string content 必须；`callTool('write_file', { confirm_overwrite:true, expectedHash? }, 'code')`。敏感路径 / 逃出工作区 400；`STALE_FILE` 409。不直接 `writeFileSync`。
  - **GET `/skills`** — 直接 `listSkills()`：工作区两处 + 仓库根 bundled，须是目录且有 SKILL.md；每项 `name`/`path`/`preview`/`skillFile`/`skillFileAbs`（与 `load_skill` 列表同一份）。
  - **POST `/providers/probe`（L283–L291）** — `listRemoteModels`；失败 400。
  - **GET `/models`（L293–L300）** — apiKey 显示 `••••` 或 `''`。
  - **POST `/models`（L302–L315）** — 可改 activeModelId；可整表 models；可 upsert `body.model`；可合并 multiModel；然后 **`store.save(cfg)` 整份**。
  - **GET `/logs`（L343–L345）** — 80 条脱敏全文（本机控制面；不是 `/status` 那种摘要）。
  - **GET `/profile/detect`（L321–L327）** — detectEnvironment + detectTechStack + listSkills。
  - **GET `/customizations`（L329–L331）** / **PUT（L333–L337）** — load / patchCustom。
  - **POST `/skills`（L339–L354）** — name 清洗：非单词变 `-`，去首尾 `-`，最长 40；空 400。默认 content 模板。`callTool('write_file')` 写 `.webagent/skills/<name>/SKILL.md`。
  - **POST `/bridge/login`（L368–L380）** — 本机演示授权：`provider/license=local-demo`，`loggedIn` 与 `deviceAuthorized` true，清空 `githubId`。**不**请求 GitHub。按钮文案仍是「本机演示授权」，**不是**「使用 GitHub 登录」。
  - **POST `/bridge/token`（L382–L389）** — `github.loginWithToken(body.token)`。空令牌 400。成功只写入用户名/`githubId`，**不**把 PAT 写入 config.json。
  - **POST `/bridge/device`（L391–L398）** — `startDeviceLogin`。无 `WEBAGENT_GITHUB_CLIENT_ID` → 400 `E_NO_GITHUB_APP`。
  - **POST `/bridge/device/poll`（L400–L407）** — `pollDeviceLogin`。grant_type 在 github.js 里写死为 `urn:ietf:params:oauth:grant-type:device_code`。
  - **POST `/bridge/github/clear`（L409–L412）** — `clearGithubKeepDemo()`，仍保留演示授权。
  - **POST `/bridge/logout`（L414–L428）** — `github.resetPending()`；loggedIn false、清空 githubId；**`tunnel.stopTunnel()`**；`bridgeRunning=false`。
  - **POST `/bridge/reset-round` 不清 `usage.json`。**

- **关键变量：** L22 `router = express.Router()`。

---

## 3. 执行逻辑流

1. 工作台 boot → GET `/status` 填 Bridge 卡与模型下拉。
2. CHAT 发送 → POST `/chat` → `runChat` → 工具经 `callTool`。
3. 点启动 Bridge → POST `/bridge/start`：登录校验后置 `bridgeRunning`、配对码；`cloudflare` 时 `await startQuickTunnel`；named 时 `await startNamedTunnel`；`ngrok` 时 `await startNgrokTunnel`。成功则 `mcpOrigin` 用公网 URL；失败HTTP200但success/running=false，MCP走本机MCP端口。缺 Authtoken/主机名不会改走 Quick Tunnel。
4. 点停止 Bridge → POST `/bridge/stop` → `stopTunnel()` 清子进程与 `publicTunnelUrl`。
5. 点「清除本轮统计」→ POST `/bridge/reset-round` → 清 MCP session 计数与 `readCache` 哈希。
6. 设置页表单 → PUT `/customizations` 或 POST `/models`。
7. 插件侧栏与工作台打同一组路径。
