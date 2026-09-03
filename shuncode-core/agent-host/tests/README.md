# tests 模块说明书

当前处理目标：`shuncode-core/agent-host/tests/`

本目录是 **现行产品测试集**（Node 自带 `assert`，无 Jest）。仓库根不必再另建 `tests/`。无 `.html` / `.py`。

跑法：Windows `run-tests.cmd`；其它 `cd shuncode-core/agent-host && npm test`。覆盖总表也见 [测试说明.md](../../../测试说明.md)。

`package.json` scripts.test 按下面顺序 `&&` 串联，任一失败即停。

| 文件 | 覆盖 |
|---|---|
| `patchEngine.test.js` | `apply_patch` 成功、STALE_FILE、冲突、grep |
| `mcpProtocol.test.js` | initialize.instructions、资源、**25** 工具、危险命令、memory、connect 提示词、DeepSeek 客户端配方 |
| `workspaceTools.test.js` | git 只读、skills、删/改名、Ask 锁、路径逃逸、敏感文件、`start_command` |
| `tunnel.test.js` | 从 cloudflared 日志解析 `*.trycloudflare.com` |
| `httpSmoke.test.js` | 真起进程：health、工作台 HTML、MCP 401、initialize、tools/list、ping |
| `codeServerNotRunnable.test.js` | Git 不内嵌 `code-server-dist`；vscode 入口走 npm runtime |
| `skipWorkbench.test.js` | `SHUNCODE_SKIP_WORKBENCH=1` 不占用工作台端口 |
| `runChat.test.js` | 内置 Chat 对任意工作区搜-读-再测；不依赖 calculator.js |
| `chatMode.test.js` | `@shuncode` 默认 Agent=code；`/ask` `/plan` |
| `profile.test.js` | 环境偏好 / 技术栈写入 `.shuncode`，进入指令 |
| `oauth.test.js` | OAuth 发现、配对、PKCE、Bearer `/mcp`、SSE |

---

## 1. 模块概述

- **定位：** 锁协议、工具沙箱、Chat 循环、OAuth、HTTP 烟测、启动脚本约束。失败 `process.exit(1)`。
- **兄弟依赖：** 全部 `../src/**`。`httpSmoke` / `skipWorkbench` 会 `spawn` `src/index.js`。多数测试把 `config.workspaceRoot` 指到 `os.tmpdir()`，结束 `rmSync`。
- **谁调用：** `npm test` 或根目录 `run-tests.cmd`。

---

## 2. 文件级详细说明书

### 📄 文件名：`patchEngine.test.js`

- **文件职责：** 临时工作区测补丁成功、过期 hash、冲突、grep。
- **顶部：** L1–L10 `assert`/`fs`/`os`/`path`；`config`；`applyPatch`/`computeHash`；`readFile`/`grepSearch`；`mkdtempSync` 后改 `config.workspaceRoot`。
- **Function `main`（L12–L67）**
  - L13：写 `sample.js`，内容含 `return a + b`。
  - L15–L17：`readFile` 必须有 `hash`，正文含原 return。
  - L19–L29：带 `expectedHash` 的 SEARCH/REPLACE 改成 `Number(a)+Number(b)`，磁盘出现 `Number(a)`。
  - L31–L44：再用**旧** hash 打补丁；catch 消息须匹配 `STALE_FILE`。
  - L46–L59：SEARCH 不在文件中 → 消息匹配 `Patch conflict`。
  - L61–L62：`grepSearch({ query:'Number', searchPath:'.' })`，`totalMatches >= 1`。
  - L64：删临时目录。L66：打印 passed。
- L69–L72：`main().catch` → 打印并 `exit(1)`。

---

### 📄 文件名：`mcpProtocol.test.js`

- **文件职责：** 不启 HTTP，直接 `handleRpc` / `callTool` 锁协议与客户端配方。
- **Function `req`（L16–L22）** — 造假 Express 请求：`ip='127.0.0.1'`，`body={ jsonrpc:'2.0', id:1, method, params }`，可 `...extra`。
- **Function `main`（L24–L110）**
  - L25–L30：`initialize` 的 `instructions` 含 `ShunCode Bridge MCP` 与 `shuncode://instructions`；有 `capabilities.resources` / `prompts`；有 `serverInfo.name`。
  - L32–L33：`ping.ok === true`。
  - L35–L44：`resources/list` 的 uri 含 protocol / memory / profile / clients；`resources/read` protocol 正文含 `Streamable HTTP`。
  - L46–L53：**锁死** `CONNECT_LINE` 原文；`getBootstrapPrompt(url)` 必须是 `url + 空行 + CONNECT_LINE`。
  - L55–L62：`getToolList().length === 25`；含 ping / workspace_info / remember / get_task_status / git_status / start_command；**不含** `lsp`。
  - L64–L65：`clipJson` 2 万字符 stdout → `_truncated` 或 stdout 变短。
  - L67–L74：`run_command` `rm -rf ...` 无 `confirm_dangerous` → `publicError.code === 'E_BAD_ARGS'` 且消息含该字段。
  - L76–L82：未知工具 → `ProtocolError` 且 `E_UNKNOWN_CMD`。
  - L84–L87：`remember` 后 `recall` 能读回文本。
  - L89–L92：`prompts/list` 含 `connect`；`prompts/get` 正文含「快速连接这个 MCP」。
  - L94–L95：`shuncode://clients` 文本含 `无需` 或 `Plus=no` 或 `not ChatGPT-only`。
  - L97–L107：`listClients`：`chat` 无需 Plus、无需隧道；`arena` 支持 MCP 且无需 Plus；`deepseek` 的 `connectMode==='extension-http'`、`prompt` **只有 URL**、`extensionId` 为 `kdmpkkahkhdmdhfkdihkopikgcocbpbf`、步骤含「不要装 deepseek-pp-shell-host」；`chatgpt-free` 为 `unsupported-mcp`；`chatgpt-plus` `needsPlus`。
  - L109：删 tmp。

---

### 📄 文件名：`workspaceTools.test.js`

- **文件职责：** git、skills、删/改名、Ask 锁、逃逸、敏感文件、异步命令。
- **Function `git`（L14–L17）** — `spawnSync`，非 0 抛 stderr/stdout。
- **Function `pollOutput`（L19–L26）** — 最多 20 次、间隔 50ms 调 `get_command_output`，直到 status 不是 `running`。
- **Function `main`（L28–L122）**
  - L29–L37：名单含 git_status / start_command / delete_file / rename_file / load_skill；不含 lsp / get_diagnostics / **send_command_input**。
  - L39–L50：`git init` + config + commit 后 `git_status`（ask）有 branch；改文件后 `git_diff`（plan）。
  - L52–L57：写 `.shuncode/skills/demo/SKILL.md`，`load_skill` 列表与全文。
  - L59–L67：code 模式 `delete_file` / `rename_file` 成功。
  - L69–L75：Ask 调 `delete_file` → `ProtocolError E_BAD_ARGS`。
  - L77–L83：`../outside.txt` → 消息匹配 `outside workspace`。
  - L85–L107：`.env` 与 `.shuncode/config.json` 走 `read_files` 被拒（SENSITIVE|FORBIDDEN）；`.env.example` 可读；`list_directory` 不出现 `.env`。
  - L109–L111：`workspace_info.root === tmp`。
  - L113–L117：`start_command` `echo async-ok`，poll 后 status 为 done/timeout，stdout 含该字符串。

---

### 📄 文件名：`tunnel.test.js`

- **文件职责：** 只测日志解析，不 spawn cloudflared。
- L4–L9：样例日志含 `https://random-words-ab12.trycloudflare.com`。
- L10：`parseTunnelUrl(sample)` 严格等于该 URL。
- L11：无 URL 文本 → `null`。
- L12：打印 passed。无 `main()`。

---

### 📄 文件名：`httpSmoke.test.js`

- **文件职责：** 真起 `src/index.js`，打工作台 HTML、MCP status/401/initialize/tools/list/ping、OAuth 发现。
- **顶部 L8–L11：** tmp；`hostDir`；随机 `workbenchPort`（18000+）、`mcpPort`（20000+）。
- **Function `request`（L13–L46）** — Node `http.request`，body 有则 JSON；响应 try `JSON.parse`。
- **Function `waitHealth`（L48–L65）** — 轮询 GET 直到 200 或超时。
- **Function `stop`（L67–L76）** — win32 `taskkill /t /f`，否则 SIGTERM。
- **Function `main`（L78–L201）**
  - L79–L86：spawn `src/index.js`，env 设 `WORKSPACE_ROOT=tmp`、`WORKBENCH_PORT`、`AGENT_HOST_PORT`。
  - L108–L110：health JSON `ok` 且 `product==='ShunCode'`。
  - L112–L126：GET `/` HTML 必须含：`ShunCode`；`编辑进化` 或 `CHAT`；`Add API`；`btn-agent-pick`；`agent-pick-menu`；`ShunCode Code`；`环境偏好`；`技术栈`；`技能引导`；`怎么连到本机仓库`；`无需 Plus` 或 `不需要 Plus`；`打开 DeepSeek`；`data-site="deepseek"`。
  - L128–L135：GET **mcp 端口** `/api/status`：有 `secretKey`；`prompt` 含「快速连接这个 MCP…」整句；`tools.length===25`；clients 含 arena（无需 Plus）与 deepseek（`extension-http`、支持 MCP、无需 Plus）；`mcpCanonicalUrl` 以 `/mcp` 结尾。
  - L138–L144：错误 secret POST initialize → 401。
  - L146–L154：正确 secret initialize 200，instructions 含 Bridge MCP 与 `shuncode://instructions`。
  - L156–L167：tools/list 25 个且含 apply_patch / start_command / workspace_info。
  - L169–L175：`POST /mcp` 无密钥 → 401。
  - L177–L179：GET `/.well-known/oauth-authorization-server` 200，有 `authorization_endpoint`。
  - L181–L189：tools/call ping 成功，`isError===false`，正文含 `"ok": true`。
  - L196–L199：finally `stop` 子进程，等 300ms，删 tmp。

---

### 📄 文件名：`codeServerNotRunnable.test.js`

- **文件职责：** Git **不得**内嵌 `bin/code-server-dist`；主启动脚本不得拉 code-server。
- L5：`repoRoot` = tests 上三级（仓库根）。
- L6–L8：读 `ensure-code-server.js` 与 `run-code-oss.js` 原文。
- L10：`bin/code-server-dist` 不存在。
- L12–L17：拼接 `run-shuncode.cmd` + `.sh`，正则 **不得** 匹配 `code-server`；必须匹配 `agent-host`。
- L19–L25：`run-shuncode-vscode.cmd` 与 `run-code-oss.js` 存在；ensure 含 `bin/code-server-runtime`，且含 `code-server@4.135.0` 或 `\'code-server\': VERSION`；ensure/runner 都不含 `code-server-dist`。
- 无 async `main`。

---

### 📄 文件名：`skipWorkbench.test.js`

- **文件职责：** `SHUNCODE_SKIP_WORKBENCH=1` 时 MCP health 通，工作台端口无人听。
- **Function `get`（L12–L21）** / **`waitOk`（L23–L39）** — HTTP 轮询。
- **Function `main`（L41–L74）**
  - L42–L52：spawn index.js，`AGENT_HOST_PORT=mcpPort`，`WORKBENCH_PORT='19999'`，`SKIP=1`。
  - L54–L56：mcp 端口 `/health` 200。
  - L57–L62：GET `127.0.0.1:19999/health` 若成功回调则 **reject**（端口应空闲）；`error` 事件才 resolve。
  - L64–L71：finally taskkill/SIGTERM，删 tmp。

---

### 📄 文件名：`runChat.test.js`

- **文件职责：** 内置 Chat 对**任意**临时工作区搜-读-测；不依赖 calculator.js；不调 get_diagnostics。
- **Function `collect`（L12–L16）** — `{ events, emit }`，emit 把 `{type,...data}` 推进数组。
- **Function `main`（L18–L75）**
  - L19–L34：写 README（标题 Widget）、`src/app.js` greet、`package.json` scripts.test、`tests/app.test.js`。
  - L36–L46 **ask「分析当前项目」：** 工具含 list_directory / find_files / read_files；禁止 diagnostics / apply_patch；message 匹配 README|Widget|app.js；整段事件 JSON **不含** `calculator.js`；有 label 匹配 `Found N files`。
  - L48–L53 **plan：** 有 `consensus.result.consensusReached`；无 calculator.js；有 `set_todos`。
  - L55–L61 **code「跑测试」：** 有 `run_command` 且 `ok`；message 含 `npm test` 或 `ok`。
  - L63–L71 **code 写入 notes.md + 围栏：** 磁盘出现该文件且含 `hello from agent`。

---

### 📄 文件名：`chatMode.test.js`

- **文件职责：** **复制**插件里的 `modeFromChatRequest` 逻辑并断言默认 Agent=code（本文件不 `require` extension.js）。
- **Function `modeFromChatRequest`（L3–L11）** — `request.command` 小写若为 ask/plan/code 则用之；否则看 `prompt` 是否 `/ask|/plan|/code` 前缀；否则 `'code'`。
- L13–L17：command ask/plan、`/ask 这是什么`、普通「修复测试」、空对象 → 分别 ask/plan/ask/code/code。

---

### 📄 文件名：`profile.test.js`

- **文件职责：** 环境/技术栈写入 `.shuncode`，并进入 instructions 与 `shuncode://profile`。
- **Function `main`（L21–L68）** — **同步**，末尾 L70 直接 `main()`（无 catch）。
  - L22–L24：`detectEnvironment` 的 os ∈ windows/macos/linux；shell ∈ powershell/bash。
  - L26–L34：临时 package.json + express → JS / Express / npm / `npm test`。
  - L36–L44：`saveCustom` 后存在 `.shuncode/preference.md` 与 `tech-stack.md`；markdown 含 PowerShell 与 `npm test`。
  - L46–L62：skill `review` 出现在 `formatWorkspaceContext` 与 `getInstructions`。
  - L64–L65：`readResource('shuncode://profile')` 正文含 `Tech stack`。

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

1. `npm test` 按文件名顺序 `&&`：patchEngine → mcpProtocol → workspaceTools → tunnel → httpSmoke → codeServerNotRunnable → skipWorkbench → runChat → chatMode → profile → oauth。
2. 单文件：改 `config.workspaceRoot` 指向 tmp → require 被测模块 → assert → 删 tmp。`tunnel` / `chatMode` / `codeServerNotRunnable` 不改工作区。
3. 启进程的测试 spawn `src/index.js`，结束必须杀子进程。
4. 失败路径：有 `main()` 的文件走 `main().catch` → `exit(1)`；`profile.test.js` 同步抛错由 Node 非 0 退出；CMD 的 `run-tests.cmd` 据此 pause。
