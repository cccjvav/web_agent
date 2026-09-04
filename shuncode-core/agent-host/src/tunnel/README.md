# tunnel 模块说明书

当前处理目标：`shuncode-core/agent-host/src/tunnel/`

本目录只有 `cloudflared.js`：找二进制、拉 Cloudflare Quick Tunnel、从日志解析 `*.trycloudflare.com`。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 把本机 `config.port`（默认 48271）映射成临时 HTTPS，让云上网页 Agent 能打进来。
- **依赖：** `../config`、`../utils/eventBus`。
- **谁调用：** `../api/routes.js`：`/status` 暴露 `tunnel.snapshot()`；**`POST /bridge/start` 在 `tunnelProvider==='cloudflare'` 时 `await startQuickTunnel({ port: config.port })`**（失败记下 `tunnelError`，Bridge 仍 200）；`/bridge/stop` 与 `/bridge/logout` 调 `stopTunnel`。Named / ngrok 不 spawn。

---

## 2. 文件级详细说明书

### 📄 文件名：`cloudflared.js`

- **文件职责：** spawn `cloudflared tunnel --url http://127.0.0.1:<port>`，从 stdout/stderr 抠公网 URL，写入 `config.publicTunnelUrl`。
- **核心类/函数清单：**

  - **Function `parseTunnelUrl(chunk)`（L12–L15）** — 用 `URL_RE` 匹配；命中去尾 `/`，否则 null。
  - **Function `findCloudflared()`（L17–L40）**
    - L18–L20：`CLOUDFLARED_PATH` 存在则用。
    - L21–L29：`where`（win）或 `which`，stdout 按行找 `existsSync`。
    - L30–L39：再猜 LOCALAPPDATA / Program Files（Windows）或 brew/usr（Unix）。
    - L39：都没有 `null`。
  - **Function `installHint()`（L42–L47）** — win32 返回 winget + GitHub releases 文案；否则 brew / Cloudflare 文档。
  - **Function `stopTunnel()`（L49–L59）** — child 未 killed → SIGTERM；1.5s 后再 SIGKILL。清空 child、quickUrl、`config.publicTunnelUrl`。
  - **Function `startQuickTunnel({ port=config.port, timeoutMs=25000 })`（L61–L122）**
    - L62：先 `stopTunnel()`。
    - L63–L68：无二进制 → **Promise.reject**，`code='E_NO_CLOUDFLARED'`。
    - L70–L122：Promise：spawn args `tunnel --url http://127.0.0.1:${port} --no-autoupdate`。Windows 上仅当二进制是 `.cmd/.bat` 才 `shell:true`。
    - L83–L88：timeoutMs 内未解析 URL → stopTunnel + reject。
    - L90–L103：stdout **和** stderr 都进 onData；broadcast `tunnel_log`（截 400 字）；解析成功则设 quickUrl 与 `config.publicTunnelUrl`，broadcast `tunnel_ready`，resolve `{ url, binary, target }`。
    - L105–L111：`error` 未 settled → reject 无法启动。
    - L112–L119：`exit` 未 settled → reject 退出码 + installHint。
  - **Function `snapshot()`（L124–L130）** — `{ binary, url: quickUrl||publicTunnelUrl, running: Boolean(child && !killed) }`。

- **关键变量：**
  - L8 `URL_RE` = `/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i`
  - L10–L11 模块级 `child`、`quickUrl`
  - L132–L134：`process` 的 exit/SIGINT/SIGTERM 会 `stopTunnel`（后两者再 `process.exit(0)`）

---

## 3. 执行逻辑流

1. 有人调用 `startQuickTunnel` → 找二进制 → spawn → 扫日志 → 写下 `config.publicTunnelUrl`。
2. 之后 `mcp/oauth.requestOrigin` 与 `api/routes.mcpOrigin` 会优先用该 URL，MCP 地址变成 `https://….trycloudflare.com/mcp/<secret>`。
3. `stopTunnel` 或进程退出清掉 URL。
4. **产品按钮路径：** `POST /bridge/start`（cloudflare）进入第 1 步；`/bridge/stop` 与 logout 进入 `stopTunnel`。无二进制或超时 → 路由 catch，MCP 仍走当前 Host。
