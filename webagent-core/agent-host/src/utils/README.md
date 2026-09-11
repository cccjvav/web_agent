# utils 模块说明书

## 第六批：请求取消与PTY生命周期

requestScope.js使用AsyncLocalStorage传播每个Chat请求的AbortSignal；checkCancelled在工具开始前阻断后续执行。fetchText连接到请求取消，120秒覆盖模型响应与body读取，finally移除监听器和计时器。


当前处理目标：`webagent-core/agent-host/src/utils/`

进程内事件总线、diff 辅助、本机控制面闸、以及 MCP CORS 白名单。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 跨 MCP / Chat / 命令执行的广播通道；补丁成功后生成 unified diff 给 UI；mcp 端口上的 `/api` 只允许本机回环；浏览器跨域只放行扩展和已知聊天站。
- **依赖：** Node `events`；npm 包 `diff`、`cors`（仅 `corsAllow.js`）。`localControl.js` 读 `../config`（看当前 `publicTunnelUrl` 的 Host），无第三方依赖。
- **谁调用：** `../index.js` 把 `/ws` 客户端交给 eventBus，并把 `rejectUnlessLocalControl` + `rejectCrossSiteApi` 挂在两套 app 的 `/api` 前；`mcpCors()` 挂在 mcpApp；`rejectDisallowedMcpOrigin` 挂在 `/mcp` 前（带了不在名单的 Origin → 403，工具不执行）；几乎所有工具与 `mcp/server.js`、`api/routes.js` broadcast；`patchEngine` 调 `createUnifiedDiff`。

---

## 2. 文件级详细说明书

### 📄 文件名：`eventBus.js`

- **文件职责：** 单例 EventEmitter + WebSocket 扇出 + 环形日志。
- **核心类/函数清单：**

  - **Function `clipStr` / `sanitizePayload`（L12–L41）** — 字符串截 4000 并替换 `ghp_` / `github_pat_` / `sk-` / `Bearer …`；对象键 `apiKey|token|password|secret|secretKey|authorization|access_token|refresh_token|pat|namedToken|ngrokToken|authtoken` 整值改 `[redacted]`；`diff|patch|content|chunk|stdout|stderr|args|body` 截 500。深度 6、键 40、数组 40。
  - **Class `BridgeEventBus`（L47–L111）**
    - **constructor** — `wsClients` Set；`logs=[]`；`maxLogs=500`。
    - **Method `_clearIdle` / `_touchIdle`** — WeakMap 存每个 socket 的 idle `setTimeout`；`unref()`。
    - **Method `addWsClient(ws)`** — 已有 ≥32 路则 `close(1013)` 返回 false；否则加入 Set，`_touchIdle`（30 分钟后 `close(1001)`）。`close` 时清定时器并从 Set 删除。
    - **Method `broadcast(type, payload={})`**
      - 日志和 WebSocket 用 `sanitizePayload(payload)`；进程内 `this.emit(type, payload)` 仍是原对象。
      - `logs.unshift`；超过 maxLogs 则 `pop`。
      - 对每个 ws，`readyState === 1` 才 `try send`，**发送成功后 `_touchIdle(ws)`**（有活动就不当空闲）；catch 空。
    - **Method `getRecentLogs(limit=50)`（L82–L84）** — `logs.slice(0, limit)`（已脱敏）。

- **关键变量：** L87 `const eventBus = new BridgeEventBus()`，L88–L89 `module.exports = eventBus` 并挂 `sanitizePayload`（单例，不是类）。

---

### 📄 文件名：`diff.js`

- **文件职责：** 给 `apply_patch` 成功结果提供 patch 文本和加减行数。
- **Function `createUnifiedDiff(filePath, oldContent, newContent)`（L3–L29）**
  - L4–L11：`jsdiff.createTwoFilesPatch`，路径 `a/` `b/`，头 `current`/`patched`。
  - L13–L22：`diffLines` 累计 added/removed（按非空行计数）。
  - L24–L29：返回 `{ patch, additions, deletions, changes }`。

---

### 📄 文件名：`localControl.js`

- **文件职责：** 判断请求是不是本机控制面。隧道/公网 Host 打 `/api` 得 404。
- **Function `isLoopbackAddress(addr)`** — `127.0.0.1` / `::1` / `::ffff:127.0.0.1` / `localhost`。
- **Function `isTunnelRequest(req)`** — 头 `cf-ray` / `cf-connecting-ip` / `cf-visitor` / `cf-ew-via` / `cdn-loop`。
- **Function `hostName(req)`** — `Host` 去端口、去 IPv6 方括号。
- **Function `publicTunnelHost()`** — 从 `config.publicTunnelUrl` 取出主机名（无则空串）。
- **Function `isPublicHost(req)`** — `*.trycloudflare.com`、ngrok 域名，或当前 `publicTunnelUrl` 的 Host（Named Tunnel 自定义域名）。
- **Function `isLocalControlPlane(req)`** — 必须无隧道特征头，Host严格为localhost/127.0.0.1/[::1]及可选有效端口，再检查socket.remoteAddress为回环；未知/缺失/畸形Host均拒绝。
- **Function `rejectUnlessLocalControl(req, res, next)`** — 本机 `next()`，否则 404 `{ error:'not found' }`。

---

### 📄 文件名：`corsAllow.js`

- **文件职责：** MCP 口 CORS 白名单；`/api` 拒绝非本机浏览器 Origin（防网页 CSRF）。**不是**认证。
- **常量：** L3–L7 `EXTENSION_PROTOCOLS`；L10–L18 `PAGE_ORIGINS`（DeepSeek / ChatGPT / Gemini / AI Studio / Arena，以本仓库文档点名为准）。
- **Function `extraOrigins()`（L20–L25）** — `WEBAGENT_CORS_ORIGINS` 逗号分隔。
- **Function `parseOrigin(origin)`（L27–L33）** — `new URL`，坏值 `null`。
- **Function `isLoopbackHostName(name)`（L35–L38）** / **`isLoopbackOrigin(origin)`（L40–L45）** — 仅 `http(s)` 的 127.0.0.1 / localhost / `::1`。
- **Function `isExtensionOrigin(origin)`（L47–L50）** — `chrome-extension:` / `moz-extension:` / `safari-web-extension:`。
- **Function `extraOriginSet()`（L52–L59）** — 环境变量解析成 origin 集合。
- **Function `isAllowedMcpOrigin(origin)`（L61–L70）** — 无 Origin（curl / Node / 云上服务器）放行；本机、扩展、PAGE_ORIGINS、额外名单放行；其它假。
- **Function `isAllowedApiBrowserOrigin(origin)`（L72–L75）** — 无 Origin 或本机 Origin 才真。聊天站 Origin **不能**打 `/api`。
- **Function `refererOrigin(req)`（L77–L82）** — 从表单 CSRF 的 Referer 取 origin。
- **Function `rejectCrossSiteApi(req, res, next)`（L84–L96）** — 有 Origin 且非本机 → 404；无 Origin 但 Referer 非本机 → 404；否则 `next()`。
- **Function `mcpCors()`（L98–L104）** — `cors({ origin(cb) })`，回调 `isAllowedMcpOrigin`。只决定 CORS 头，**不**拦执行。
- **Function `rejectDisallowedMcpOrigin(req, res, next)`（L106–L112）** — 请求带了 Origin 且 `isAllowedMcpOrigin` 为假 → **403** `{ error:'origin not allowed' }`；无 Origin → `next()`。挂在 `mcpApp.use('/mcp', …)` 上。

---

## 3. 执行逻辑流

1. `index.js` `attachWss`：浏览器连3000的`/ws`，先在upgrade阶段验证本机控制面＋本机HTTP(S) Origin（无Origin允许本机客户端），通过才`addWsClient`，并立即收到 `connected`（**不含** secretKey）。mcp 端口不挂 WebSocket。
2. mcpApp 先 `mcpCors()`：浏览器预检只给扩展和名单里的聊天站回 `Access-Control-Allow-Origin`。`/mcp` 再过 `rejectDisallowedMcpOrigin`：名单外 Origin 的 POST 得 403，工具不跑。
3. 两套 app 的 `/api` 先过 `rejectUnlessLocalControl`：Cloudflare 头、`*.trycloudflare.com` / ngrok Host、或当前 `publicTunnelUrl` 主机名 → 404；只有明确本机Host与回环socket才`next()`。再过 `rejectCrossSiteApi`：`https://evil.example` 这类 Origin 同样 404。无 Origin 的 Node 插件 / 测试仍通。
4. 工具/MCP 调用 `broadcast` → 写入 logs + 推到所有打开的工作台。
5. 工作台 `connectWs` 根据 type 刷新终端、文件树、BRIDGE 工具卡、todos。`onclose` 后 1s→30s 退避重连；状态栏写「事件流重连中」。有工具广播时服务端 idle 计时重置，空闲满 30 分钟仍会 1001 关掉（客户端再连）。
6. `patchEngine` 写盘后用 `createUnifiedDiff` 把 diff 放进 broadcast payload，工作台可开 diff 页。

### boundedFile.js（2026-09-11新增）
readBoundedText在路径及fd上检查普通文件/8MiB默认上限，按64KiB块读取且最多maxBytes+1探测增长，finally关闭fd，不先readFileSync整个增长文件。由工具读/补丁/API读共用；不是操作系统沙箱。
