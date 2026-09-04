# MCP 模块说明书

当前处理目标：`shuncode-core/agent-host/src/mcp/`

本文件只描述该目录内 8 个 `.js` 源码（无 `.json` / `.yaml` / 独立 `.html`）。行号以当前文件为准；解释不补源码里没有的调用。

---

## 1. 模块概述

- **定位：** agent-host 的 **MCP 协议门面**。把本机工具暴露成 Streamable HTTP JSON-RPC 2.0（兼 SSE），给 Arena / DeepSeek++ / ChatGPT 连接器等网页端调用。本目录**不改磁盘**：改文件发生在兄弟模块 `../tools/`。
- **在进程中的挂载（由 `../index.js` 完成，不在本目录）：** `app.use(oauth.router)` 在前（匿名发现文档 + 配对页），然后 `app.use('/mcp', mcpRouter)`（`server.js` 导出的 Express Router）。

**它调用的兄弟模块：**

| 本目录文件 | require 的本目录文件 | require 的目录外模块 |
|---|---|---|
| `server.js` | `instructions` `resources` `budget` `errors` `session` `oauth` | `../tools`（`getToolList`/`callTool`）、`../config`、`../models/customizations`、`../utils/eventBus` |
| `oauth.js` | （无） | `../config` |
| `resources.js` | `session` `instructions` `clients` | `../config`、`../tools`、`../tools/skills`、`../tools/progressTracker`、`../models/customizations`、`../models/profile`、`../models/memory`、`../utils/eventBus` |
| `instructions.js` | （无） | `../models/customizations`、`../config`、`../models/profile`、`../tools/skills` |
| `clients.js` | `instructions` | （无） |
| `budget.js` / `errors.js` / `session.js` | （无） | （无） |

**谁调用本模块：** `../index.js` 挂路由；`../api/routes.js` 用 `oauth.snapshotPairing` / `ensurePairing` / `revokeAll`、`clients.listClients`、`instructions.getBootstrapPrompt`（工作台 Bridge 页，不走 JSON-RPC）。

---

## 2. 文件级详细说明书

### 📄 文件名：`errors.js`

- **文件职责：** 把工具失败分成「协议层」和「执行层」，供 `server.js` 决定回 JSON-RPC `error` 还是 MCP `isError: true`。
- **核心类/函数清单（代码行级注释）：**

  - **Class `ProtocolError`（L1–L9）**
    - 输入：`code`（字符串错误码）、`message`、`detail`（可选对象）。
    - 行为：L3 `super(message)`；L4–L7 设 `name='ProtocolError'`、`layer='protocol'`、`code`、`detail || {}`。
  - **Class `ExecutionError`（L11–L19）**
    - 与上相同，但 L14–L15 `name='ExecutionError'`、`layer='execution'`。
  - **Function `classifyToolError(err)`（L21–L36）**
    - 输入：任意 thrown 值。返回：已分类的 Error。
    - L22：已经是上述两类 → 原样返回。
    - L23：取出 `err.message`，否则把 `err` 转字符串。
    - L24–L35：**按顺序第一次命中即返回**（后面的正则不会再跑）：
      - L24 `Unknown tool` → `E_UNKNOWN_CMD`（协议）
      - L25 `locked in` 或 `Ask/Plan are read-only` → `E_BAD_ARGS`
      - L26 `requires ` 或 `required` → `E_BAD_ARGS`
      - L27 `HASH_REQUIRED` → `E_BAD_ARGS`（协议；`apply_patch` 没 hash 时已是 `ProtocolError`，这条兜底裸 Error）
      - L28 `STALE_FILE` → `E_STALE_FILE`（执行）
      - L29 `Patch conflict` → `E_CONFLICT`
      - L30 `GIT_UNAVAILABLE` 或 `not a git repository` → `E_NOT_READY`（执行；现行 `git_status`/`git_diff` 多数情况已收成 `available:false`，不会走到这里）
      - L31 `not found` / `No such file` → `E_NOT_FOUND`
      - L32 `timeout` / `isTimeout` → `E_TIMEOUT`
      - L33 `ACCESS_DENIED_SENSITIVE_FILE` / `E_FORBIDDEN` → `E_FORBIDDEN`
      - L34 `confirm_dangerous` / `confirm_overwrite` / `confirm=true` → `E_BAD_ARGS`（协议）
      - L35 其它 → `E_INTERNAL`（执行）
  - **Function `publicError(err)`（L38–L46）**
    - 返回 `{ layer, code, msg, detail }`，给 MCP 正文或 JSON-RPC `data`。`detail` 常含 `currentHash` / `retryHint`。

- **关键变量/常量：** 无模块级配置。导出见 L48。

---

### 📄 文件名：`session.js`

- **文件职责：** 进程内 MCP 客户端心跳表（内存 `Map`，重启清空）。工作台用它显示「对面还在不在」。
- **核心类/函数清单：**

  - **Function `sessionKey(req)`（L3–L7）**
    - 输入：Express `req`（可空）。
    - L4：ip = `req.ip` 或头 `x-forwarded-for`，都没有则 `'local'`。
    - L5：client = `req.body.params.clientInfo.name`，没有则 `'mcp'`。
    - L6：返回 `` `${client}@${ip}` ``。
  - **Function `touch(req, extra = {})`（L9–L27）**
    - 输入：`req`；`extra` 可含 `key`、`incCall`、`incFail`、`busy`、以及要合并的其它字段。
    - L10：key 优先 `extra.key`。
    - L11–L16：没有旧记录则新建 `connectedAt`、`calls:0`、`fail:0`。
    - L17–L24：覆盖 extra；**始终**刷新 `lastSeen`；仅当 `incCall`/`incFail` 为真才 +1；`busy = Boolean(extra.busy)`（没传则为 false）。
    - L25–L26：写回 Map，返回 `next`。
  - **Function `snapshot()`（L29–L41）**
    - 无输入。L30 按 `lastSeen` 字符串降序。
    - L31–L32：最新一条的年龄毫秒；没有 latest 则 `ageMs=null`。
    - L33–L40：`staleAfterMs` 写死 10000；`alive` 当 latest 存在且年龄 &lt; 10s；`sessions` 最多 8 条。
  - **Function `reset()`（L43–L46）** — `sessions.clear()` 后返回 `snapshot()`。被 `POST /api/bridge/reset-round` 调用。

- **关键变量：** L1 `sessions = new Map()`，整个进程一份。导出 L48：`touch` / `snapshot` / `sessionKey` / `reset`。

---

### 📄 文件名：`budget.js`

- **文件职责：** 把工具结果截到约 16k 字符，避免网页 Agent 上下文被一次日志撑爆。
- **核心类/函数清单：**

  - **Function `estimateTokens(text)`（L4–L6）**
    - 输入：任意。返回 `ceil(length/4)`。源码里 MCP 主路径主要用 `clipText`/`clipJson`，本函数被导出供测试或其它模块。
  - **Function `clipText(text, maxChars = MAX_CHARS)`（L8–L17）**
    - L9：`null`/`undefined` 当空串。
    - L10：未超长 → `{ text, truncated:false }`。
    - L11–L16：保留 `maxChars-80`，后缀提示 truncated 字数以及用 offset/limit/cursor/`get_command_output`。
  - **Function `clipJson(value, maxChars = MAX_CHARS)`（L19–L56）**
    - L20：`null`/`undefined` 原样返回。
    - L21–L26：**字符串**：截断则包成 `{ text, _truncated, originalChars }`，否则返回原字符串。
    - L27–L28：stringify 后未超长 → 原对象。
    - L29：非数组对象浅拷贝，否则包 `{ value }`。
    - L30–L35：键 `stdout|stderr|content|preview|text|diff` 若字符串 &gt;2000，再 clip 到 `min(4000, maxChars/3)`。
    - L36–L40：`matches` 多于 20 条则切到 20，设 `nextCursor=20`。
    - L41–L44：`items` 多于 40 条则切到 40，`nextCursor=40`。
    - L45–L52：仍超长 → 只留 `_truncated` + `summary` + `hint`。
    - L53–L55：否则给 copy 打 `_truncated` 和 `originalChars`。

- **关键变量：** L1–L2 注释写明 ~4k tokens ≈ 16k chars；`MAX_CHARS = 16000`。

---

### 📄 文件名：`instructions.js`

- **文件职责：** 给模型的「怎么用这台 MCP」说明书，以及剪贴板第一句连接语。
- **核心类/函数清单：**

  - **Function `getBootstrapPrompt(mcpUrl)`（L8–L10）**
    - 输入：`mcpUrl` 字符串（可空）。
    - 返回：URL + 空行 + `CONNECT_LINE`。Arena 等 paste-url 客户端当第一句。
  - **Function `getInstructions()`（L59–L66）**
    - 无参数。L58 `loadCustom()`。
    - L60：若 `custom.instructions` 真值，追加 `## Workspace instructions`。
    - L61：追加 `formatWorkspaceContext`（环境/技术栈/skills）。
    - L62：追加工作区根路径。
    - L63：`SERVER_INSTRUCTIONS.trim()` 与 extra 用 `\n\n` 拼接。

- **关键变量/常量：**
  - L6 `CONNECT_LINE`：固定一句中文（测试锁原文，改一字会红）。
  - L12–L55 `SERVER_INSTRUCTIONS`：Ask/Plan 只读、Code 可写、工作流 1–7（含 git `available:false`、读后可省略 `expectedHash`、HASH_REQUIRED 带 `currentHash`）、输出预算、`tools/call` 失败是 MCP `isError` 文本（不是传输崩溃）、别名 `bash`/`cat`/`path`、安全（`confirm_dangerous` / `confirm_overwrite` / `confirm=true`）、memory。这是 `initialize.instructions` 的主体。模板字符串里**不能**写 `{layer,code,msg,detail}` 这种花括号，会当成 JS 插值炸掉。

---

### 📄 文件名：`clients.js`

- **文件职责：** 工作台 Bridge 页「怎么连」卡片的**数据**，不是 MCP 协议实现。`server.js` 的 JSON-RPC **不读取**本文件。
- **核心类/函数清单：**

  - **Function `hydrateClient(client, urls)`（L117–L139）**
    - 输入：`CLIENTS` 里的一项；`urls.mcpUrl` / `urls.mcpCanonicalUrl`。
    - L118–L119：canonical 缺省把 `/mcp/<secret>` 收成 `/mcp`。
    - L121–L131 按 `connectMode` 设 `prompt`：
      - `paste-url` → `getBootstrapPrompt(mcpUrl)`（URL + CONNECT_LINE）
      - `oauth-connector` → 规范地址两行，不含长期密钥
      - `extension-http` → **只有** `mcpUrl` 一行（DeepSeek++ URL 框）
      - `unsupported-mcp` → 空串
      - 其它（含 `local-chat`）→ `prompt` 保持 `''`
    - L132–L138：oauth 模式对外 `mcpUrl` 改成 canonical；附 `connectLine`。
  - **Function `listClients(urls = {})`（L141–L143）**
    - 返回 6 张卡全部 hydrate。
  - **Function `getClient(id, urls = {})`（L145–L148）**
    - 找不到 id 则 **回落到 `CLIENTS[1]`（arena）**。

- **关键变量 `CLIENTS`（L3–L115）——每项 Key：**

  | Key | 含义 | 取值 |
  |---|---|---|
  | `id` | 卡片主键 | `chat` / `arena` / `deepseek` / `generic` / `chatgpt-free` / `chatgpt-plus` |
  | `name` | UI 标题 | 中文名 |
  | `url` | 打开的网站；本机 Chat / generic 为 `null` | URL 或 null |
  | `needsPlus` | 是否必须付费档 | 仅 `chatgpt-plus` 为 `true` |
  | `needsTunnel` | 是否需要公网隧道 | 仅 `chat` 为 `false` |
  | `supportsMcp` | 该端会不会真调 MCP | `chat` 与 `chatgpt-free` 为 `false` |
  | `connectMode` | hydrate 分支 | 见上 |
  | `summary` / `steps` | UI 文案 | 字符串 / 字符串数组 |
  | `extensionId` / `storeUrl` | 仅 DeepSeek 项 | CWS 扩展 ID 与商店 URL |

---

### 📄 文件名：`resources.js`

- **文件职责：** MCP `resources/list` 与 `resources/read`。当网页客户端丢掉 `initialize.instructions` 时的第二条规则通道。
- **核心类/函数清单：**

  - **Function `listResources()`（L25–L27）**
    - 无输入。直接返回 `RESOURCE_DEFS`（L13–L23 的 8 项）。
  - **Function `readResource(uri)`（L29–L112）**
    - 输入：字符串 URI。未知 → L110–L111 返回 `null`（由 `server.js` 转成 `E_NOT_FOUND`）。
    - L32–L33 `shuncode://instructions`：`getInstructions()`。
    - L34–L39 `profile`：`formatWorkspaceContext(loadCustom(), listSkills())`。
    - L38–L58 `protocol`：写死的传输/错误/心跳/补丁要点（markdown 数组 join）。含：`tools/call` 失败是 `isError: true`；JSON-RPC `error` 只给坏 jsonrpc / 未知 method / 缺 `params.name`；`git_status` 在普通文件夹返回 `available:false`；`apply_patch` 复用上次 `read_files` 的 sha256；`path`/`bash`/`cat`/`grep`/`ls` 别名。
    - L58–L65 `capabilities`：`getToolList()` 拼 `tools N` + 每行 name/description。
    - L66–L80 `config`：server/version/workspace/`bridgeRunning`/tunnel/`installId`/客户端数；L78 **明文 `secret omitted`，不输出密钥**。
    - L81–L93 `workspace`：root、用户 instructions、任务状态、最近 5 条 event 的 type。
    - L94–L97 `memory`：`recall({ limit: 80 }).text`。
    - L98–L109 `clients`：用占位 `(mcp url)` 调用 `listClients`，列出每张卡 summary。

- **关键变量 `RESOURCE_DEFS`（L13–L23）：** 每项 `uri` / `name` / `mimeType` / `description`。uri 取值仅上表 8 个 `shuncode://…`。

---

### 📄 文件名：`oauth.js`

- **文件职责：** OAuth 2.1 子集（动态注册 + 授权码 + PKCE S256 + 本机配对码）。给 ChatGPT Plus 连接器。Arena / DeepSeek++ **不走本文件的授权码流程**，但 `verifyAccessToken` 同时认 URL 密钥。
- **存储：** L7–L10 四个内存 `Map`；L17 `pairing`。进程退出全丢。

- **核心类/函数清单：**

  - **Function `now()`（L19–L21）** — 返回 `Date.now()`。
  - **Function `randomToken(prefix, bytes = 24)`（L23–L25）** — `` `${prefix}` + hex ``。
  - **Function `randomPairingCode()`（L27–L31）**
    - L28 字母表去掉 0/O/1/I。L29–L30 用 8 字节映射成长度 8 的码。
  - **Function `requestOrigin(req)`（L33–L38）**
    - L34：若 `config.publicTunnelUrl` 真 → 去尾 `/` 返回（隧道域名）。
    - L35–L37：否则用 `x-forwarded-proto` / `req.protocol` / `http` 与 host 头拼 origin。
  - **Function `issuePairing()`（L40–L48）** — 写入新 pairing（attempts:0，TTL 见常量），返回 snapshot。
  - **Function `snapshotPairing()`（L50–L59）**
    - L51：没有或过期 → `{ code:null, expiresInSec:0, expired:true }`。
    - L55–L58：否则给出剩余秒数。
  - **Function `ensurePairing()`（L61–L65）** — 过期或无 code 则 issue，否则返回当前 snap。
  - **Function `consumePairing(code)`（L67–L88）**
    - L69–L73：过期 → 抛，`status=400`。
    - L74–L80：`attempts > 5` → `pairing=null`，抛 429。
    - L81–L85：大小写不敏感比较失败 → 400。
    - L86–L87：成功则 `pairing=null`（用过即废），返回 `true`。
  - **Function `authorizationServerMetadata(origin)`（L90–L102）** — 发现文档对象（issuer、authorize/token/register/revoke、S256、grant 类型）。
  - **Function `protectedResourceMetadata(origin)`（L104–L110）** — `resource` 为 `${origin}/mcp`。
  - **Function `wwwAuthenticate(origin)`（L112–L114）** — `Bearer realm=…` 指向 protected-resource 元数据。
  - **Function `registerClient(body = {})`（L116–L142）**
    - L117–L121：`redirect_uris` 必须是非空数组，否则 400。
    - L122–L141：生成 `sccid_` / `sccsec_`，存 Map，返回注册结果。
  - **Function `s256(verifier)`（L144–L146）** — SHA-256 `base64url`。
  - **Function `issueAccess(clientId)`（L148–L162）** — 发 `scat_` / `scrt_`，写入两个 token Map。
  - **Function `verifyAccessToken(token)`（L164–L175）**
    - L165：假值 → `null`。
    - L166：`token === config.secretKey` → `{ kind:'secret', clientId:'url-secret' }`（**贴 URL 的密钥走这里**）。
    - L167–L172：Map 没有或过期（过期会 delete）→ `null`。
    - L174：`{ kind:'oauth', clientId }`。
  - **Function `revokeAll()`（L177–L183）** — 四个 Map clear，`pairing=null`。被 `POST /api/bridge/reset-secret` 调用。
  - **Function `authorizeHtml(query, error)`（L185–L218）** — 返回完整 HTML 字符串（见下方 DOM）。
  - **Function `escapeHtml(s)`（L220–L224）** — `& < > " '`。
  - **Function `completeAuthorize(body)`（L226–L257）**
    - L227–L231：未知 client_id → 400。
    - L232–L236：redirect_uri 不在注册列表 → 400。
    - L237–L241：challenge method 缺省 S256；不是 S256 → 400。
    - L242：`consumePairing`。
    - L243–L250：发一次性 `sccode_`。
    - L251–L256：302 目标 URL 带 `code`，有 `state` 则带上。
  - **Function `handleToken(body = {})`（L259–L297）**
    - L261–L283 `authorization_code`：code 无效/过期 400；**先 delete code**；client_id / redirect_uri 不符 400；无 verifier 或 PKCE 失败 400；然后 `issueAccess`。
    - L284–L293 `refresh_token`：无效/过期 400；删旧双 token；再发一对。
    - L294–L296 其它 grant → 400。
  - **Function `tokenResponse(issued)`（L299–L306）** — Bearer、expires_in 秒、refresh、scope `mcp`。
  - **Function `sendError(res, err)`（L308–L311）** — `status || 500`；400 时 `error=invalid_request` 否则 `server_error`。
  - **Function `registerHandler`（L325–L331）** — try 201 + `registerClient`；catch `sendError`。

- **路由（L313–L365）：**

  | 行 | 方法 | 路径 | 行为 |
  |---|---|---|---|
  | L313–L315 | GET | `/.well-known/oauth-authorization-server` | metadata（匿名） |
  | L316–L318 | GET | `/.well-known/oauth-protected-resource` | 资源元数据 |
  | L319–L321 | GET | `/.well-known/oauth-protected-resource/mcp` | 同上 |
  | L332–L333 | POST | `/oauth/register` 与 `/register` | 动态注册 |
  | L335–L339 | GET | `/oauth/authorize` | `ensurePairing` + HTML |
  | L341–L349 | POST | `/oauth/authorize` | try 302；catch 用错误重绘 HTML |
  | L351–L356 | POST | `/oauth/token` | `handleToken` |
  | L358–L365 | POST | `/oauth/revoke` | 从两个 token Map delete，**始终 200** `{ revoked:true }` |

- **内嵌 HTML DOM（`authorizeHtml` L185–L218）：**
  - L192–L201：全页居中深色样式。
  - L202–L216：`<form method="post" action="/oauth/authorize">`。
  - L205–L206：说明配对码 5 分钟、用过即废。
  - L207：可选错误 `<p class="err">`。
  - L208：用户输入 `pairing_code`。
  - L209–L214：隐藏域 `client_id` `redirect_uri` `state` `code_challenge` `code_challenge_method` `response_type=code`。
  - L215：提交按钮「确认配对」。

- **关键常量（L12–L15）：**
  - `PAIRING_TTL_MS` = 5 分钟
  - `CODE_TTL_MS` = 5 分钟
  - `ACCESS_TTL_MS` = 1 小时
  - `REFRESH_TTL_MS` = 7 天

---

### 📄 文件名：`server.js`

- **文件职责：** MCP 的 HTTP 入口。校验身份后，把 JSON-RPC method 派到本目录其它文件或 `../tools.callTool`。
- **核心类/函数清单：**

  - **Function `extractToken(req)`（L17–L24）** — 顺序：Bearer 头 → `params.secret` → 头 `x-mcp-secret` → `query.secret` → `''`。
  - **Function `isAuthorized(req)`（L26–L28）** — `Boolean(oauth.verifyAccessToken(extractToken(req)))`。
  - **Function `rejectUnauthorized(req, res)`（L30–L38）** — 设 `WWW-Authenticate`，401 JSON-RPC `-32000`。
  - **Function `requireAuth`（L40–L43）** — 未授权则 reject，否则 `next()`。
  - **Function `wantsSse(req)`（L45–L47）** — `Accept` 含 `text/event-stream`。
  - **Function `sessionIdFor(req)`（L49–L51）** — 头 `mcp-session-id` 或随机 8 字节 hex。
  - **Function `sendJsonRpc(req, res, payload, httpStatus=200)`（L53–L65）**
    - L54–L55：回写 `Mcp-Session-Id`。
    - L56–L62：SSE 则 `event: message` + data 后 end。
    - L64：否则普通 JSON。
  - **Function `builtinPrompts()`（L67–L75）** — 仅一项 `name:'connect'`。
  - **Function `promptsFromCustom()`（L77–L85）** — 内置 + `custom.prompts`（description 截 120 字）。
  - **Function `pickProtocol(params)`（L86–L90）** — 客户端要的版本在支持列表里就用，否则 `'2025-03-26'`。
  - **Function `remoteToolMode(params)`（L92–L97）** — 读 `params._meta.mode` 或 `_meta.shuncodeMode`；仅 `ask|plan|code`；缺省 **`'code'`**。
  - **Function `handleRpc(req)`（L99–L210）** — 见下方 method 分支。
  - **Function `hostStatus()`（L212–L225）** — GET 非 SSE 的主机摘要（含完整 instructions、transports、auth 三种）。
  - **Function `handlePost(req, res)`（L227–L253）**
    - L229–L235：`jsonrpc !== '2.0'` → 400、RPC `-32600`。
    - L237–L242：`handleRpc`；method 以 `notifications/` 开头 → **HTTP 204 无 body**。
    - L243–L252：catch：`E_UNKNOWN_CMD` → HTTP 404 且 rpc `-32601`；其它协议 `-32602`；否则 `-32603` 或 `err.rpcCode`。**工具失败不会进这里**：`tools/call` 自己 `return { isError:true }`。
  - **Function `handleGet(req, res)`（L255–L268）**
    - L256–L265：SSE → 先写 `event: endpoint` `data: /mcp`，每 15s `: ping`，close 清 interval。
    - L267：否则 `hostStatus()` JSON。

  **`handleRpc` 的 method 分支：**

  | 行 | method | 做什么 |
  |---|---|---|
  | L102–L117 | `initialize` | L103 默认 client 名 `External-Agent`；L104 `touch`；L105 broadcast `agent_connected`；返回 protocol、capabilities、serverInfo、**`instructions: getInstructions()`** |
  | L119–L122 | `notifications/initialized`、`notifications/cancelled`、`logging/setLevel` | 返回 `{}` |
  | L124–L133 | `ping` | `touch incCall`，busy 写死 `false` |
  | L135–L137 | `tools/list` | `getToolList()` **不传 mode**（列表含 Code-only 工具） |
  | L139–L165 | `tools/call` | 见下 |
  | L167–L168 | `resources/list` | `listResources()` |
  | L170–L175 | `resources/read` | 未知 uri 抛 `E_NOT_FOUND` |
  | L177–L178 | `prompts/list` | `promptsFromCustom()` |
  | L180–L205 | `prompts/get` | `connect` 走 bootstrap；否则 custom.prompts；没有抛 `E_NOT_FOUND` |
  | L207–L208 | default | `E_UNKNOWN_CMD`（未知 **method**，仍是 JSON-RPC error） |

  **`tools/call` 细节（L139–L165）：**
  - L141：无 `name` → 抛 `E_BAD_ARGS`（这才会变成 JSON-RPC error）。
  - L142：broadcast `tool_call_start`，source `'Bridge-Remote'`。
  - L145：**`callTool(name, toolArgs || {}, remoteToolMode(params))`** — 默认 Code；`_meta.mode=ask|plan` 时模式锁生效。
  - L146：再 `clipJson`。
  - L151–L154：成功 → MCP `content[{type:text}]`，`isError:false`。
  - L155–L163：`catch` → `publicError`；`incFail`；**始终** `return { content:[{type:text, text: JSON.stringify(info)}], isError:true }`。未知工具名、HASH_REQUIRED、STALE_FILE 都走这条，网页 Agent 把它当工具结果而不是传输崩溃。

- **路由（L270–L273）：** `GET/POST /` 与 `GET/POST /:secret` 均 `requireAuth` 后进 handleGet/handlePost。挂到 app 上后即 `/mcp` 与 `/mcp/:secret`。

- **关键变量：** L14 `router`；L15 `SUPPORTED_PROTOCOL = ['2024-11-05','2025-03-26','2025-06-18']`。

---

## 3. 执行逻辑流（仅针对该子文件夹）

数据从 HTTP 进入本文件夹之后：

1. **OAuth 发现 / 配对（匿名，不进 `server.js`）**  
   客户端 GET `oauth.js` 的 `/.well-known/…`（L313–L321）拿元数据 → POST `/oauth/register`（L325–L333）拿到 `client_id` → 浏览器 GET `/oauth/authorize`（L335–L339，`ensurePairing`）看到配对页 HTML → 用户填工作台配对码 → POST `completeAuthorize`（L341–L349）→ 302 带回一次性 code → POST `/oauth/token` + PKCE（L351–L356）得到 Bearer。

2. **MCP 请求进 `server.js` 路由（L270–L273）**  
   `requireAuth` → `extractToken`（路径密钥 / Bearer / 头 / query）→ `oauth.verifyAccessToken`（L166 认 URL 密钥，或认 access token）。失败则 401 + `WWW-Authenticate`。

3. **GET**  
   - `Accept: text/event-stream` → SSE 通道（L255–L265）。  
   - 否则 `hostStatus()`，其中 `instructions` 来自 `instructions.js`。

4. **POST JSON-RPC**  
   `handlePost` 校验 `jsonrpc==='2.0'` → `handleRpc`：
   - `initialize`：`session.touch` + `instructions.getInstructions()`（读 customizations / profile / skills）。
   - `tools/list`：出本目录，调 `../tools.getToolList()`。
   - `tools/call`：出本目录，调 `../tools.callTool`（真正改盘）；回来用 `budget.clipJson` / `clipText`；**工具失败回 MCP `isError:true` 文本**（`publicError` 的 layer/code/msg/detail），不升级成 JSON-RPC `error`；全程 `eventBus.broadcast`（目录外）给工作台。
   - `resources/*`：留在 `resources.js`（只读说明书 / 状态，不写盘）。
   - `prompts/*`：`instructions` + `customizations`。
   - `notifications/*`：空对象，HTTP 204。

5. **工作台卡片（不经 JSON-RPC）**  
   `../api/routes.js` 调 `clients.listClients` + `instructions.getBootstrapPrompt` + `oauth.snapshotPairing`，把 hydrate 后的 `prompt` 交给用户复制。DeepSeek 卡只有一行 URL；Arena 卡是 URL + `CONNECT_LINE`。

**本目录没有的事（避免误读）：** 不 spawn cloudflared；不实现 `apply_patch`。远程 `tools/call` 默认 Code，可用 `params._meta.mode` 切 Ask/Plan。

---

第一阶段本文件夹已完成。按约束暂停。

请输入下一个文件夹名称（例如 `shuncode-core/agent-host/src/tools`）。全部文件夹处理完后再进入第三阶段。
