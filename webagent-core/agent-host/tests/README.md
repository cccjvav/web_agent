# tests 模块说明书

当前处理目标：`webagent-core/agent-host/tests/`

本目录是 **现行产品测试集**（Node 自带 `assert`，无 Jest）。仓库根不必再另建 `tests/`。无 `.html` / `.py`。

跑法：Windows `run-tests.cmd`；其它 `cd webagent-core/agent-host && npm test`。覆盖总表也见 [测试说明.md](../../../测试说明.md)。

`package.json` scripts.test 按下面顺序 `&&` 串联，任一失败即停。

| 文件 | 覆盖 |
|---|---|
| `patchEngine.test.js` | `apply_patch` 成功、STALE_FILE、读缓存省略 hash、从未 read 的 orphan→`HASH_REQUIRED`+`currentHash`、冲突、grep |
| `mcpProtocol.test.js` | initialize.instructions、资源、**25** 工具、危险命令（含 `git reset --hard`）、`Available:`、`cat`/`path` 别名、`tools/call` `isError:true`、memory、connect 提示词、DeepSeek / Chat Plus 客户端配方 |
| `workspaceTools.test.js` | 无仓 `available:false`、skills、`delete_file` 须 `confirm`、覆盖须 `confirm_overwrite`、Ask 锁、路径逃逸、敏感文件、`path`/`confirm:'true'`/`bash`/`ls`、`start_command` |
| `sandbox.test.js` | 默认 `host=127.0.0.1`；symlink 指到工作区外时 read/cwd/list 拒绝 |
| `hostPersist.test.js` | `generateNewSecret` 写入 `config.json`；`read-hashes.json` 跨 require 仍能 recalledHash；`resetHashes` 删文件 |
| `tunnel.test.js` | 从 cloudflared 日志解析 `*.trycloudflare.com` |
| `bridgeTunnel.test.js` | stub `startQuickTunnel`/`stopTunnel`：cloudflare 启动后 mcpUrl 含 trycloudflare；`E_NO_CLOUDFLARED` 仍 200；未登录 403 |
| `localControl.test.js` | 回环 / Cloudflare 头 / trycloudflare Host 是否算本机控制面 |
| `corsAllow.test.js` | MCP Origin 白名单；外站 Origin/Referer 打 `/api` 拒绝 |
| `httpSmoke.test.js` | 真起进程：health、工作台 HTML（含 `#page-env`）、模块脚本、MCP 401、initialize、tools/list、ping、隧道头打 `/api` 得 404、外站 Origin 的 `/api` 404、DeepSeek/扩展 OPTIONS 有 CORS 头、本机 `POST /api/chat` NDJSON |
| `codeServerNotRunnable.test.js` | Git 不内嵌 `code-server-dist`；vscode 入口走 npm runtime |
| `skipWorkbench.test.js` | `WEBAGENT_SKIP_WORKBENCH=1` 不占用工作台端口 |
| `runChat.test.js` | 内置 Chat 对任意工作区搜-读-再测；第二参 emit 与 `payload.emit` 两条路径 |
| `chatMode.test.js` | `@webagent` 默认 Agent=code；`/ask` `/plan` |
| `profile.test.js` | 环境偏好 / 技术栈写入 `.webagent`，进入指令 |
| `oauth.test.js` | OAuth 发现、配对、PKCE、Bearer `/mcp`、SSE |

---

## 1. 模块概述

- **定位：** 锁协议、工具沙箱、Chat 循环、OAuth、HTTP 烟测、启动脚本约束。失败 `process.exit(1)`。
- **兄弟依赖：** 全部 `../src/**`。`httpSmoke` / `skipWorkbench` 会 `spawn` `src/index.js`。多数测试把 `config.workspaceRoot` 指到 `os.tmpdir()`，结束 `rmSync`。
- **谁调用：** `npm test` 或根目录 `run-tests.cmd`。

---

## 2. 文件级详细说明书

### 📄 文件名：`patchEngine.test.js`

- **文件职责：** 临时工作区测补丁成功、过期 hash、读缓存、orphan `HASH_REQUIRED`、冲突、grep。
- **顶部：** L1–L10 `assert`/`fs`/`os`/`path`；`config`；`applyPatch`/`computeHash`；`readFile`/`grepSearch`；`mkdtempSync` 后改 `config.workspaceRoot`。
- **Function `main`（L12–L99）**
  - L13：写 `sample.js`，内容含 `return a + b`。
  - L15–L17：`readFile` 必须有 `hash`，正文含原 return。
  - L19–L30：带 `expectedHash` 的 SEARCH/REPLACE 改成 `Number(a)+Number(b)`，磁盘出现 `Number(a)`。
  - L32–L46：再用**旧** hash 打补丁；catch 消息须匹配 `STALE_FILE`。
  - L48–L56：不传 `expectedHash` 仍成功（复用上次 read/补丁的缓存）。
  - L58–L75：磁盘直接写 `orphan.js`（**从未** `readFile`）再补丁 → `HASH_REQUIRED` 且 `err.detail.currentHash` 有值。
  - L77–L92：SEARCH 不在文件中 → 消息匹配 `Patch conflict`。
  - L94–L95：`grepSearch({ query:'function add', searchPath:'.' })`，`totalMatches >= 1`。
  - L97：删临时目录。L98：打印 passed。
- L101–L104：`main().catch` → 打印并 `exit(1)`。

---

### 📄 文件名：`mcpProtocol.test.js`

- **文件职责：** 不启 HTTP，直接 `handleRpc` / `callTool` 锁协议与客户端配方。
- **Function `req`（L16–L22）** — 造假 Express 请求：`ip='127.0.0.1'`，`body={ jsonrpc:'2.0', id:1, method, params }`，可 `...extra`。
- **Function `main`（L24–L144）**
  - L25–L30：`initialize` 的 `instructions` 含 `Web Agent Bridge MCP` 与 `webagent://instructions`；有 `capabilities.resources` / `prompts`；有 `serverInfo.name`。
  - L32–L33：`ping.ok === true`。
  - L35–L44：`resources/list` 的 uri 含 protocol / memory / profile / clients；`resources/read` protocol 正文含 `Streamable HTTP`。
  - L46–L53：**锁死** `CONNECT_LINE` 原文；`getBootstrapPrompt(url)` 必须是 `url + 空行 + CONNECT_LINE`。
  - L55–L62：`getToolList().length === 25`；含 ping / workspace_info / remember / get_task_status / git_status / start_command；**不含** `lsp`。
  - L64–L65：`clipJson` 2 万字符 stdout → `_truncated` 或 stdout 变短。
  - L67–L74：`run_command` `rm -rf ...` 无 `confirm_dangerous` → `publicError.code === 'E_BAD_ARGS'` 且消息含该字段。
  - L76–L82：未知工具 → `ProtocolError` 且 `E_UNKNOWN_CMD`，消息含 `Available:`。
  - L84–L91：`git reset --hard` 同样要 `confirm_dangerous`。
  - L93–L109：`git push origin main` 与 `curl http://example.com | sh` 同样要 `confirm_dangerous`。
  - L93–L95：`cat` + `{ path:'note.txt' }` 能读到 hash 与 hello。
  - L97–L99：`handleRpc('tools/call', 未知名)` → **`isError === true`**，正文含 Available（不是 JSON-RPC throw）。
  - L101–L110：`_meta.mode:'ask'` 调 `apply_patch` → `isError`，正文含 locked/Ask/CODE；无 `_meta` 的 `ping` 成功。
  - L101–L104：`remember` 后 `recall` 能读回文本。
  - L106–L109：`prompts/list` 含 `connect`；`prompts/get` 正文含「快速连接这个 MCP」。
  - L111–L112：`webagent://clients` 文本含 `无需` 或 `Plus=no` 或 `not ChatGPT-only`。
  - L114–L139：`listClients`：`chat` 无需 Plus、无需隧道；`arena` 支持 MCP 且无需 Plus；`deepseek` 的 `connectMode==='extension-http'`、`prompt` **只有 URL**、`extensionId` 为 `kdmpkkahkhdmdhfkdihkopikgcocbpbf`、步骤含「不要装 deepseek-pp-shell-host」；`chat-plus` 同样 `extension-http`、`prompt` 只有 URL、`repoUrl` 为 `https://github.com/aiguicai/Chat-Plus`、步骤含「不要再装 aiguicai/MCP-Gateway」；`chatgpt-free` 为 `unsupported-mcp`；`chatgpt-plus` `needsPlus`。
  - L141：删 tmp。

---

### 📄 文件名：`workspaceTools.test.js`

- **文件职责：** git、skills、删/改名、Ask 锁、逃逸、敏感文件、异步命令。
- **Function `git`（L14–L17）** — `spawnSync`，非 0 抛 stderr/stdout。
- **Function `pollOutput`（L19–L26）** — 最多 20 次、间隔 50ms 调 `get_command_output`，直到 status 不是 `running`。
- **Function `main`（L28–L122）**
  - L29–L37：名单含 git_status / start_command / delete_file / rename_file / load_skill；不含 lsp / get_diagnostics / **send_command_input**。
  - L39–L50：`git init` + config + commit 后 `git_status`（ask）有 branch；改文件后 `git_diff`（plan）。
  - L52–L57：写 `.webagent/skills/demo/SKILL.md`，`load_skill` 列表与全文。
  - L59–L67：code 模式 `delete_file` / `rename_file` 成功。
  - L69–L75：Ask 调 `delete_file` → `ProtocolError E_BAD_ARGS`。
  - L77–L83：`../outside.txt` → 消息匹配 `outside workspace`。
  - L85–L107：`.env` 与 `.webagent/config.json` 走 `read_files` 被拒（SENSITIVE|FORBIDDEN）；`.env.example` 可读；`list_directory` 不出现 `.env`。
  - L109–L111：`workspace_info.root === tmp`。
  - L113–L117：`start_command` `echo async-ok`，poll 后 status 为 done/timeout，stdout 含该字符串。

---

### 📄 文件名：`sandbox.test.js`

- **文件职责：** 默认只听本机；符号链接不能读出工作区。
- L24：`config.host` 等于 `WEBAGENT_BIND` 或 `127.0.0.1`。
- L31–L58：若能 `symlinkSync` 把工作区 `leak` 指到临时目录外的 `secret.txt`，则 `read_files leak/secret.txt`、`run_command cwd=leak`、`resolveSafePath` 都须匹配 outside workspace；`list_directory` 正文不得出现 `secret.txt`。
- 无法建符号链接的环境跳过那一段，仍测 host 默认值。

---

### 📄 文件名：`tunnel.test.js`

- **文件职责：** 只测日志解析，不 spawn cloudflared。
- L4–L9：样例日志含 `https://random-words-ab12.trycloudflare.com`。
- L10：`parseTunnelUrl(sample)` 严格等于该 URL。
- L11：无 URL 文本 → `null`。
- L12：打印 passed。无 `main()`。

---

### 📄 文件名：`hostPersist.test.js`

- **文件职责：** 密钥落盘与读哈希缓存跨重启。
- **Function `main`（L13–L41）** — 同步。
  - L14–L17：`generateNewSecret()` 后 `store.load().secretKey` 等于内存。
  - L19–L22：把内存 secret 改成 `deadbeefdead` 再 `persistIdentity`，应回到磁盘值。
  - L24–L29：`rememberHash` 写出 `.webagent/read-hashes.json`。
  - L31–L33：`delete require.cache` 后再 require，仍能 `recalledHash`。
  - L35–L37：`resetHashes` 后内存与文件都空。
- L43：直接 `main()`。

---

### 📄 文件名：`bridgeTunnel.test.js`

- **文件职责：** 测 REST 接线，**不** spawn cloudflared、不等 25s。替换 `cloudflared.js` 上同对象导出的 `startQuickTunnel` / `stopTunnel`（routes 已 require 该对象）。
- **Function `request`（L16–L45）** — 对已 listen 的 server 发 HTTP，body 有则 JSON。
- **Function `main`（L47–L123）**
  - L48–L61：保存原函数；stub start 写 `config.publicTunnelUrl`；stub stop 清 URL。
  - L63–L68：express 挂 `/api`，`listen(0)`。
  - L71–L79：`store.patch` 已登录；`POST /api/bridge/start` `{ tunnelProvider:'cloudflare' }` → 200、`startCalls===1`、mcpUrl 含 trycloudflare、note 含「Quick Tunnel 已就绪」、`tunnelError===null`。
  - L81–L83：`GET /api/status` mcpUrl 仍含 trycloudflare，`bridgeRunning`。
  - L85–L88：`POST /api/bridge/stop` → `stopCalls>=1`、`publicTunnelUrl===null`。
  - L90–L103：stub start throw `E_NO_CLOUDFLARED` → 仍 200、`success`、有 `tunnelError`、note 含「当前页面源」、mcpUrl **不含** trycloudflare。
  - L105–L109：`tunnelProvider:'named'` → 200 且 **不**调 `startQuickTunnel`，note 含「未启动 Quick Tunnel」。
  - L111–L113：未登录 → **403**。
  - L114–L121：finally 还原导出、关 server、删 tmp。
- L125–L128：`main().catch` → `exit(1)`。

---

### 📄 文件名：`localControl.test.js`

- **文件职责：** 不启 HTTP，直接断言 `isLoopbackAddress` / `isTunnelRequest` / `isPublicHost` / `isLocalControlPlane`。
- **Function `req`（L9–15）** — 造假 Express 请求：默认 `ip=127.0.0.1`、`Host=127.0.0.1:48271`，可叠 headers。
- L17–20：回环地址为真，`192.168.1.8` 为假。
- L22–24：`cf-ray` / `cf-connecting-ip` 为隧道；无头不是。
- L26–28：`*.trycloudflare.com` 为公网 Host；`127.0.0.1` / `localhost` 不是。
- L30–33：默认本机为真；带 Cloudflare 头、trycloudflare Host、或 `10.0.0.8` 为假。

---

### 📄 文件名：`corsAllow.test.js`

- **文件职责：** 不启 HTTP，断言 Origin 白名单与 `/api` 跨站闸。
- L11–L15：本机 Origin / 扩展协议为真；聊天站不是 loopback。
- L17–L25：无 Origin、DeepSeek / ChatGPT / Gemini / Arena、扩展、本机 → MCP 放行；`https://evil.example` 拒绝。
- L28–L31：`/api` 只放行无 Origin 或本机 Origin。
- L33–L39：`WEBAGENT_CORS_ORIGINS` 追加 `doubao` / `tongyi` 后 MCP 放行，evil 仍拒绝。
- L54–L90：`rejectCrossSiteApi`：evil Origin / evil Referer → 404；本机 Origin 与无头 → `next()`。

---

### 📄 文件名：`httpSmoke.test.js`

- **文件职责：** 真起 `src/index.js`，打工作台 HTML、MCP status/401/initialize/tools/list/ping、OAuth 发现、隧道头挡 `/api`、工作台口 Chat NDJSON。
- **顶部 L8–L11：** tmp；`hostDir`；随机 `workbenchPort`（18000+）、`mcpPort`（20000+）。
- **Function `request`（L13–49）** — Node `http.request`，body 有则 JSON；第四参 `extraHeaders` 叠进请求头。
- **Function `waitHealth`（L51–68）** — 轮询 GET 直到 200 或超时。
- **Function `stop`（L70–79）** — win32 `taskkill /t /f`，否则 SIGTERM。
- **Function `main`（L81–257）**
  - L82–89：spawn `src/index.js`，env 设 `WORKSPACE_ROOT=tmp`、`WORKBENCH_PORT`、`AGENT_HOST_PORT`。
  - L111–113：health JSON `ok` 且 `product==='Web Agent'`。
  - L115–135：GET `/` HTML 必须含：`Web Agent`；`编辑进化` 或 `CHAT`；`Add API`；`btn-agent-pick`；`agent-pick-menu`；`Web Agent Code`；`环境偏好`；`技术栈`；`技能引导`；`怎么连到本机仓库`；`无需 Plus` 或 `不需要 Plus`；`打开 DeepSeek`；`data-site="deepseek"`；`id="page-env"` / `btn-detect-env` / `page-stack` / `btn-detect-stack`；`type="module"` 与 `/app.js`。
  - L137–142：GET `/app.js` 含 `from './js/state.js'`；GET `/js/state.js` 含 `export const state`。
  - L144–152：GET **mcp 端口** `/api/status`（本机无隧道头）：有 `secretKey`；`prompt` 含「快速连接这个 MCP…」整句；`tools.length===25`；clients 含 arena（无需 Plus）、deepseek（`extension-http`、支持 MCP、无需 Plus）与 chat-plus；`mcpCanonicalUrl` 以 `/mcp` 结尾。
  - L154–160：错误 secret POST initialize → 401。
  - L162–170：正确 secret initialize 200，instructions 含 Bridge MCP 与 `webagent://instructions`。
  - L172–183：tools/list 25 个且含 apply_patch / start_command / workspace_info。
  - L185–191：`POST /mcp` 无密钥 → 401。
  - L193–195：GET `/.well-known/oauth-authorization-server` 200，有 `authorization_endpoint`。
  - L197–205：tools/call ping 成功，`isError===false`。
  - L207–211：本机 `POST /api/bridge/reset-round` 仍 200。
  - L214–223：带 `cf-ray` 的 mcp 口 `/api/status`、`/api/chat`、`/api/tool/call` 以及 `Host: *.trycloudflare.com` 的 `/api/status` 都 **404**，正文不含 secret。
  - L225–231：同一组隧道头 `POST /mcp/<secret>` initialize 仍 200。
  - L233–270：`Origin: https://evil.example` 打 mcp `/api/status` 与工作台 `reset-round` 都 404；本机 Origin 的 `/api/status` 200；OPTIONS `/mcp` 对 evil 无 ACAO，对 `chat.deepseek.com` 与 DeepSeek++ 扩展 Origin 回相同 ACAO。
  - L272–273：mcp 口 GET `/` 正文不得含 `btn-agent-pick`（没有工作台静态）。
  - L236–249：**工作台口** `POST /api/chat` NDJSON 必须有 `tool`（`list_directory`）、`message`、`done`。
  - L259–262：finally `stop` 子进程，等 300ms，删 tmp。

### 📄 文件名：`codeServerNotRunnable.test.js`

- **文件职责：** Git **不得**内嵌 `bin/code-server-dist`；主启动脚本不得拉 code-server。
- L5：`repoRoot` = tests 上三级（仓库根）。
- L6–L8：读 `ensure-code-server.js` 与 `run-code-oss.js` 原文。
- L10：`bin/code-server-dist` 不存在。
- L12–L17：拼接 `run-webagent.cmd` + `.sh`，正则 **不得** 匹配 `code-server`；必须匹配 `agent-host`。
- L19–L25：`run-webagent-vscode.cmd` 与 `run-code-oss.js` 存在；ensure 含 `bin/code-server-runtime`，且含 `code-server@4.135.0` 或 `\'code-server\': VERSION`；ensure/runner 都不含 `code-server-dist`。
- 无 async `main`。

---

### 📄 文件名：`skipWorkbench.test.js`

- **文件职责：** `WEBAGENT_SKIP_WORKBENCH=1` 时 MCP health 通，工作台端口无人听。
- **Function `get`（L12–L21）** / **`waitOk`（L23–L39）** — HTTP 轮询。
- **Function `main`（L41–L74）**
  - L42–L52：spawn index.js，`AGENT_HOST_PORT=mcpPort`，`WORKBENCH_PORT='19999'`，`SKIP=1`。
  - L54–L56：mcp 端口 `/health` 200。
  - L57–L62：GET `127.0.0.1:19999/health` 若成功回调则 **reject**（端口应空闲）；`error` 事件才 resolve。
  - L64–L71：finally taskkill/SIGTERM，删 tmp。

---

### 📄 文件名：`runChat.test.js`

- **文件职责：** 内置 Chat 对**任意**临时工作区搜-读-测；不依赖 calculator.js；不调 get_diagnostics；同时锁第二参 emit 与 `payload.emit`。
- **Function `collect`（L12–L16）** — `{ events, emit }`，emit 把 `{type,...data}` 推进数组。
- **Function `main`（L18–L85）**
  - L19–L34：写 README（标题 Widget）、`src/app.js` greet、`package.json` scripts.test、`tests/app.test.js`。
  - L36–L46 **ask「分析当前项目」：** 第二参 `ask.emit`；工具含 list_directory / find_files / read_files；禁止 diagnostics / apply_patch；message 匹配 README|Widget|app.js；整段事件 JSON **不含** `calculator.js`；有 label 匹配 `Found N files`。
  - L48–L53 **plan：** 有 `consensus.result.consensusReached`；无 calculator.js；有 `set_todos`。
  - L55–L61 **code「跑测试」：** 有 `run_command` 且 `ok`；message 含 `npm test` 或 `ok`。
  - L63–L70 **payload.emit：** `runChat({ mode:'ask', message, emit })` 无第二参，仍须有 `list_directory` 与 `message`。
  - L72–L81 **code 写入 notes.md + 围栏：** 磁盘出现该文件且含 `hello from agent`。

### 📄 文件名：`chatMode.test.js`

- **文件职责：** **复制**插件里的 `modeFromChatRequest` 逻辑并断言默认 Agent=code（本文件不 `require` extension.js）。
- **Function `modeFromChatRequest`（L3–L11）** — `request.command` 小写若为 ask/plan/code 则用之；否则看 `prompt` 是否 `/ask|/plan|/code` 前缀；否则 `'code'`。
- L13–L17：command ask/plan、`/ask 这是什么`、普通「修复测试」、空对象 → 分别 ask/plan/ask/code/code。

---

### 📄 文件名：`profile.test.js`

- **文件职责：** 环境/技术栈写入 `.webagent`，并进入 instructions 与 `webagent://profile`。
- **Function `main`（L21–L68）** — **同步**，末尾 L70 直接 `main()`（无 catch）。
  - L22–L24：`detectEnvironment` 的 os ∈ windows/macos/linux；shell ∈ powershell/bash。
  - L26–L34：临时 package.json + express → JS / Express / npm / `npm test`。
  - L36–L44：`saveCustom` 后存在 `.webagent/preference.md` 与 `tech-stack.md`；markdown 含 PowerShell 与 `npm test`。
  - L46–L62：skill `review` 出现在 `formatWorkspaceContext` 与 `getInstructions`。
  - L64–L65：`readResource('webagent://profile')` 正文含 `Tech stack`。

---

### 📄 文件名：`oauth.test.js`

- **文件职责：** 真 listen 随机端口：发现文档、401、URL 密钥 initialize、SSE ping、PKCE 发 token、Bearer tools/call、revoke 后 401。
- **Function `request`（L16–L47）** — 相对已 listen 的 server；`json=true` 发 JSON，否则 urlencoded。
- **Function `main`（L49–L153）**
  - L50–L57：express 挂 `oauth.router` + `/mcp`；`listen(0)`。
  - L60–L63：GET `/.well-known/oauth-authorization-server` 200；`authorization_endpoint` 含 `/oauth/authorize`；`code_challenge_methods_supported` 含 `S256`。
  - L65–L67：GET `/.well-known/oauth-protected-resource` 200；`resource` 以 `/mcp` 结尾。
  - L69–L73：无凭证 POST `/mcp` → 401 且 `WWW-Authenticate` 含 `resource_metadata=`。
  - L75–L79：`POST /mcp/${config.secretKey}` initialize 200，instructions 含 Bridge MCP。
  - L81–L87：同一 URL 密钥 + `Accept: text/event-stream` 的 ping → content-type 含 event-stream，正文含 `event: message`。
  - L89–L118：`s256` + `registerClient` + `issuePairing` + `completeAuthorize` + `handleToken`；access 以 `scat_` 开头。
  - L120–L132：坏 code → catch，`pkceFailed` true。
  - L134–L140：Bearer 调 `workspace_info` 成功，`isError===false`。
  - L142–L147：`revokeAll` 后同一 Bearer ping → 401。
  - L148–L151：close server，删 tmp。

---

## 3. 执行逻辑流（仅本目录）

1. `npm test` 按 `package.json` `scripts.test` 顺序 `&&`：patchEngine → mcpProtocol → workspaceTools → **sandbox** → **hostPersist** → tunnel → **bridgeTunnel** → **localControl** → **corsAllow** → httpSmoke → codeServerNotRunnable → skipWorkbench → runChat → chatMode → profile → oauth。
2. 单文件：改 `config.workspaceRoot` 指向 tmp → require 被测模块 → assert → 删 tmp。`tunnel` / `chatMode` / `codeServerNotRunnable` 不改工作区。`bridgeTunnel` 改 tmp 工作区并 stub 隧道导出。
3. 启进程的测试 spawn `src/index.js`，结束必须杀子进程。
4. 失败路径：有 `main()` 的文件走 `main().catch` → `exit(1)`；`profile.test.js` 同步抛错由 Node 非 0 退出；CMD 的 `run-tests.cmd` 据此 pause。
