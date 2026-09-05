# tunnel 模块说明书

当前处理目标：`webagent-core/agent-host/src/tunnel/`

本目录只有 `cloudflared.js`：找二进制、拉 Cloudflare Quick Tunnel 或 Named Tunnel、从日志解析公网 URL。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 把本机 `config.port`（默认 48271）映射成 HTTPS，让云上网页 Agent 能打进来。
- **依赖：** `../config`、`../utils/eventBus`。
- **谁调用：** `../api/routes.js`：`/status` 暴露 `tunnel.snapshot()`；**`POST /bridge/start` 在 `tunnelProvider==='cloudflare'` 时 `await startQuickTunnel({ port: config.port })`**；在 **`cloudflare-named` / `named` 时 `await startNamedTunnel({ hostname, token, port })`**（失败记下 `tunnelError`，Bridge 仍 200）；`/bridge/stop` 与 `/bridge/logout` 调 `stopTunnel`。ngrok **不** spawn。

---

## 2. 文件级详细说明书

### 📄 文件名：`cloudflared.js`

- **文件职责：** spawn `cloudflared`。Quick Tunnel 用 `tunnel --url http://127.0.0.1:<port>`，从日志抠 `*.trycloudflare.com`；Named Tunnel 用 `tunnel --no-autoupdate run --token <token>`，公网 URL 是用户填的主机名（`https://mcp.example.com`）。写入 `config.publicTunnelUrl`。
- **核心类/函数清单：**

  - **Function `parseTunnelUrl(chunk)`（L12–L15）** — 用 `URL_RE` 匹配；命中去尾 `/`，否则 null。
  - **Function `findCloudflared()`（L17–L40）**
    - L18–L20：`CLOUDFLARED_PATH` 存在则用。
    - L21–L29：`where`（win）或 `which`，stdout 按行找 `existsSync`。
    - L30–L39：再猜 LOCALAPPDATA / Program Files（Windows）或 brew/usr（Unix）。
    - L39：都没有 `null`。
  - **Function `installHint()`（L42–L47）** — win32 返回 winget + GitHub releases 文案；否则 brew / Cloudflare 文档。
  - **Function `stopTunnel()`（L49–L59）** — child 未 killed → SIGTERM；1.5s 后再 SIGKILL。清空 child、quickUrl、`config.publicTunnelUrl`。
  - **Function `canonicalNamedUrl(hostname)`（L61–L68）** — trim、去协议/路径/端口，须带点的主机名；返回 `https://host` 或 `null`。
  - **Function `startNamedTunnel({ hostname, token, port=config.port, timeoutMs=25000 })`（L72–L145）**
    - L73–L78：主机名非法 → **Promise.reject**，`code='E_NAMED_HOSTNAME'`。
    - L79–L84：Token 空 → **Promise.reject**，`code='E_NAMED_TOKEN'`。这两步都在 spawn 之前。
    - L85：先 `stopTunnel()`。
    - L86–L91：无二进制 → **Promise.reject**，`code='E_NO_CLOUDFLARED'`。
    - L92–L145：Promise：spawn args `tunnel --no-autoupdate run --token TOKEN`。Windows 上仅当二进制是 `.cmd/.bat` 才 `shell:true`。
    - L106–L111：timeoutMs 内日志没有 `Registered tunnel connection` / `connIndex=` → stopTunnel + reject。
    - L113–L127：stdout **和** stderr 都进 onData；broadcast `tunnel_log` 前把 Token 原文换成 `[token]`（截 400 字）；就绪则设 quickUrl 与 `config.publicTunnelUrl` 为 `https://<hostname>`，broadcast `tunnel_ready`（`named:true`），resolve `{ url, binary, target, named:true }`。
    - L129–L135：`error` 未 settled → reject 无法启动。
    - L136–L143：`exit` 未 settled → reject 退出码 + installHint。
  - **Function `startQuickTunnel({ port=config.port, timeoutMs=25000 })`（L147–L208）**
    - L148：先 `stopTunnel()`。
    - L149–L154：无二进制 → **Promise.reject**，`code='E_NO_CLOUDFLARED'`。
    - L156–L208：Promise：spawn args `tunnel --url http://127.0.0.1:${port} --no-autoupdate`。Windows 上仅当二进制是 `.cmd/.bat` 才 `shell:true`。
    - L169–L174：timeoutMs 内未解析 URL → stopTunnel + reject。
    - L176–L189：stdout **和** stderr 都进 onData；broadcast `tunnel_log`（截 400 字）；解析成功则设 quickUrl 与 `config.publicTunnelUrl`，broadcast `tunnel_ready`，resolve `{ url, binary, target }`。
    - L191–L197：`error` 未 settled → reject 无法启动。
    - L198–L205：`exit` 未 settled → reject 退出码 + installHint。
  - **Function `snapshot()`（L210–L216）** — `{ binary, url: quickUrl||publicTunnelUrl, running: Boolean(child && !child.killed) }`。不含 Token。

- **关键变量：**
  - L8 `URL_RE` = `/https:\\/\\/[a-z0-9-]+\\.trycloudflare\\.com/i`
  - L70 `NAMED_READY_RE` = `/Registered tunnel connection|\\bconnIndex=/i`
  - L10–L11 模块级 `child`、`quickUrl`
  - L218–L220：`process` 的 exit/SIGINT/SIGTERM 会 `stopTunnel`（后两者再 `process.exit(0)`）

---

## 3. 执行逻辑流

1. Quick：`startQuickTunnel` → 找二进制 → spawn → 扫 trycloudflare URL → 写下 `config.publicTunnelUrl`。
2. Named：`startNamedTunnel` → 校验主机名/Token → 找二进制 → spawn `tunnel run --token` → 等 Registered connection → `publicTunnelUrl=https://<hostname>`。仪表盘里 Public Hostname 必须指到 `http://127.0.0.1:<port>`，本文件不传 `--url`。
3. 之后 `mcp/oauth.requestOrigin` 与 `api/routes.mcpOrigin` 会优先用该 URL，MCP 地址变成 `https://….trycloudflare.com/mcp/<secret>` 或 `https://你的域名/mcp/<secret>`。
4. `stopTunnel` 或进程退出清掉 URL。
5. **产品按钮路径：** `POST /bridge/start`（cloudflare 或 named）进入第 1/2 步；`/bridge/stop` 与 logout 进入 `stopTunnel`。无二进制、缺字段或超时 → 路由 catch，MCP 仍走当前 Host。ngrok 不进本文件。
