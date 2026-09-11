# tunnel 模块说明书

当前处理目标：`webagent-core/agent-host/src/tunnel/`

本目录包含共享停止辅助`stopProcess.js`以及两个提供商文件：`cloudflared.js`（Quick Tunnel + Named Tunnel）和 `ngrok.js`（`ngrok http`）。无 `.json` / `.html`。逐步用法见仓库根 [隧道使用指南.md](../../../../隧道使用指南.md)。

---

## 1. 模块概述

- **定位：** 把本机 `config.port`（默认 48271）映射成 HTTPS，让云上网页 Agent 能打进来。
- **依赖：** `../config`、`../utils/eventBus`。`ngrok.js` 还用 `canonicalNamedUrl`（`cloudflared.js`）。
- **谁调用：** `../api/routes.js`：`/status` 暴露 `tunnel.snapshot()`（会并上 ngrok 是否在跑）；**`POST /bridge/start`** 在 `tunnelProvider==='cloudflare'` 时 `await startQuickTunnel`；**`cloudflare-named` / `named` 时 `await startNamedTunnel`**；**`ngrok` 时 `await startNgrokTunnel`**（失败记下`tunnelError`，返回失败状态；不宣称远程已就绪）；`/bridge/stop` 与 `/bridge/logout` 调 `stopTunnel`（会顺带 `stopNgrok`）。

---

## 2. 文件级详细说明书

### 📄 文件名：`cloudflared.js`

- **文件职责：** spawn `cloudflared`。Quick Tunnel 用 `tunnel --url http://127.0.0.1:<port>`，从日志抠 `*.trycloudflare.com`；Named Tunnel 用 `tunnel --no-autoupdate run --token <token>`，公网 URL 是用户填的主机名。写入 `config.publicTunnelUrl`。`stopTunnel` 会先停 ngrok。
- **核心类/函数清单：**

  - **Function `parseTunnelUrl(chunk)`（L12–L15）** — 用 `URL_RE` 匹配；命中去尾 `/`，否则 null。
  - **Function `findCloudflared()`（L17–L40）** — `CLOUDFLARED_PATH` → `where`/`which` → 常见安装路径。
  - **Function `installHint()`（L42–L47）** — win32 返回 winget + GitHub releases 文案。
  - **Function `stopTunnel()`（L49–L64）** — lazy `require('./ngrok').stopNgrok()`；再 SIGTERM/SIGKILL cloudflared child；清空 child、quickUrl、`config.publicTunnelUrl`。
  - **Function `canonicalNamedUrl(hostname)`（L66–L73）** — trim、去协议/路径/端口，须带点的主机名；返回 `https://host` 或 `null`。
  - **Function `startNamedTunnel({ hostname, token, port=config.port, timeoutMs=25000 })`（L77–L150）**
    - 主机名非法 → reject `E_NAMED_HOSTNAME`；Token 空 → `E_NAMED_TOKEN`。都在 spawn 前。
    - 先 `stopTunnel()`。无二进制 → `E_NO_CLOUDFLARED`。
    - spawn args `tunnel --no-autoupdate run --token TOKEN`。日志把 Token 换成 `[token]`。就绪看 `Registered tunnel connection` / `connIndex=`。日志缓冲 `buf = (buf + text).slice(-65536)`（只为就绪判定；广播用当前 `text` 截 400）。
  - **Function `startQuickTunnel({ port=config.port, timeoutMs=25000 })`（L152–L213）** — 先 `stopTunnel()`；spawn `tunnel --url http://127.0.0.1:${port} --no-autoupdate`；解析 trycloudflare。日志缓冲同样 slice 到 64k。
  - **Function `snapshot()`（L215–L225）** — 并上 `ngrok.snapshot()`：`running` 为 cloudflared **或** ngrok；`url` 为 quickUrl / ngrok url / `publicTunnelUrl`。不含 Token。

- **关键变量：** L8 `URL_RE`；L75 `NAMED_READY_RE`；L9–L10 `child`、`quickUrl`；L227–L229 进程退出会 `stopTunnel`。

### 📄 文件名：`ngrok.js`

- **文件职责：** spawn PATH 上的 `ngrok` 二进制（不要 npm 包装包）。`ngrok http 127.0.0.1:<port>`，Authtoken 只放进子进程环境 `NGROK_AUTHTOKEN`，**不**出现在 argv。可选 `--url https://主机名`。从日志解析公网 URL。
- **核心类/函数清单：**

  - **Function `parseNgrokUrl(chunk)`（L14–L25）** — 先 `"url":"https://…"`，再 `url=` / `Forwarding`，再匹配 `*.ngrok-free.app` / `*.ngrok.app` / `*.ngrok.dev` / `*.ngrok.io`。
  - **Function `resolveNgrokToken(token)`（L27–L31）** — 参数 trim；空则 `process.env.NGROK_AUTHTOKEN`。
  - **Function `findNgrok()`（L33–L55）** — `NGROK_PATH` → `where`/`which` → 常见安装路径。
  - **Function `installHint()`（L57–L62）** — win32：`winget install Ngrok.Ngrok` 或 `NGROK_PATH`。
  - **Function `stopNgrok()`（L64–L74）** — SIGTERM/SIGKILL；清空 child、ngrokUrl、`config.publicTunnelUrl`。**不**再调 `stopTunnel`（避免互递归）。
  - **Function `startNgrokTunnel({ hostname, token, port=config.port, timeoutMs=25000 })`（L76–L160）**
    - Token（参数或 `NGROK_AUTHTOKEN`）空 → reject `E_NGROK_TOKEN`。
    - 填了主机名但 `canonicalNamedUrl` 失败 → `E_NGROK_HOSTNAME`。主机名可留空（随机地址）。
    - 先 `cloudflared.stopTunnel()`（会停 ngrok 旧进程 + cloudflared），再 `stopNgrok()`。
    - 无二进制 → `E_NO_NGROK`。
    - spawn args：`http 127.0.0.1:<port> --log=stdout --log-format=term`，有主机名再 `--url https://host`。`env.NGROK_AUTHTOKEN=tok`。
    - 日志把 Authtoken 原文换成 `[token]`（截 400 字）。缓冲 `buf = (buf + text).slice(-65536)`。填了主机名则等 `started tunnel` / `Forwarding` 后用该 `https://host`；否则用 `parseNgrokUrl`。
    - 25s 超时、`error`、`exit` 未 settled 则 reject。
  - **Function `snapshot()`（L162–L168）** — `{ binary, url: ngrokUrl, running }`。不含 Token。

- **关键变量：** L8–L9 正则；L11–L12 `child`、`ngrokUrl`。

---

## 3. 执行逻辑流

1. Quick：`startQuickTunnel` → 找 cloudflared → spawn → 扫 trycloudflare → `publicTunnelUrl`。
2. Named：校验主机名/Token → spawn `tunnel run --token` → 等 Registered connection → `publicTunnelUrl=https://<hostname>`。仪表盘 Public Hostname 必须指到 `http://127.0.0.1:<port>`。
3. ngrok：校验 Authtoken（可环境变量）→ spawn `ngrok http` → 解析或使用预留域名 → `publicTunnelUrl`。
4. 换模式再启动会先 `stopTunnel`（连带停 ngrok）。之后 `mcpOrigin` 优先用该 URL。
5. **产品按钮：** `POST /bridge/start` 按 provider 进 1/2/3；失败仍 200，MCP 走当前 Host。缺字段**不会**偷偷改走 Quick Tunnel。

## 2026-09-11 生命周期修订（覆盖上文旧行号/同步停止描述）
- stop/start均可等待；共享stopProcess捕获旧进程引用，等待exit而不是把killed标志当退出。TERM后1.5秒升级KILL，3秒未退出则失败并拒绝替换；Windows采用taskkill树。停止失败需要人工核对/重启，不宣称远端一定不可达。
- generation及child引用隔离过期日志、就绪与exit；停止取消未就绪启动，active进程退出清URL/running。已有pid的error不视为退出，仍尝试停止并等待。
- API start/stop/logout都有代次控制；logout等待停止，不让较旧start重新发布状态。
- 本地进程fixture验证等待退出、过期事件、启动取消与信号失败；真实公网及Windows进程树不是这些fixture的验收范围。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [cloudflared.js](cloudflared.js) | 39 个函数/类节点 |
| [ngrok.js](ngrok.js) | 22 个函数/类节点 |
| [stopProcess.js](stopProcess.js) | 8 个函数/类节点 |
<!-- docs-inventory:end -->
