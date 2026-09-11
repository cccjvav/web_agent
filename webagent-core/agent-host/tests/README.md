# tests 模块说明书

当前处理目标：`webagent-core/agent-host/tests/`

本目录是 **现行产品测试集**（Node 自带 `assert`，无 Jest）。仓库根不必再另建 `tests/`。无 `.html` / `.py`。

跑法：Windows `run-tests.cmd`；其它 `cd webagent-core/agent-host && npm test`。覆盖总表也见 [测试说明.md](../../../测试说明.md)。

`npm test` 跑 `scripts/run-tests.js`：缺 `node_modules/express` 则打印先 `npm install` 并以退出码 2 结束；否则逐个 `tests/*.test.js`，失败也继续，最后汇总。新增`*.test.js`自动发现；preferred测试缺失退出1。支持`npm test -- --filter=oauth`文件名子串筛选；无匹配/未知参数退出2。每文件默认120秒超时，WEBAGENT_TEST_TIMEOUT_MS支持1000–600000毫秒。无覆盖率百分比统计。

| 文件 | 覆盖 |
|---|---|
| `modelLifecycle.test.js` | 模型失败不重放、9个tool id完整结果、Plan异步旧轮次/过期总结拒绝 |
| `oauthClientAuth.test.js` | 实际HTTP：public/secret-post/secret-basic、错误凭据/混用拒绝、不消耗code、refresh认证 |
| `stateIntegrity.test.js` | 坏配置保留/保存失败清理、短hash/已删目标/链接写语义、同名同IP隔离、认领状态机、业务失败统计 |
| `installerPackaging.test.js` | 干净发行清单、秘密/原型排除、manifest校验与用户运行时、失败清理、相对路径/文件/根目录；ISCC/CMD另需Windows |
| `webviewRuntime.test.js` | 实际扩展宿主回调/HTML脚本：动态文本不经HTML、任务日志空值、CSP nonce、消息白名单；不是VS Code真实CSP执行验收 |
| `editorRuntime.test.js` | 真实编辑器ES模块＋DOM/Monaco fixture：切tab/dirty/关闭/卸载、HTTP保存结果、hash冲突、保存竞态与模型释放；非浏览器E2E |
| `auditStorage.test.js` | 记忆日期/链接边界、敏感路径、git-header/BOM补丁、stale dryRun、写锁、mode保留、rename失败清理、Skill限额、用量延迟响应 |
| `auditControl.test.js` | 本机API Host校验及实际HTTP/WS握手的Origin校验 |
| `workbenchRuntime.test.js` | 实际ES模块主题初始化、DOM/storage/Monaco fixture；不是浏览器E2E |
| `docsHttp.test.js` | 子进程HTTP：畸形URI/NUL返回400且继续服务、首页200与404 |
| `testRunner.test.js` | runner子进程：筛选、无匹配、未知参数和非法timeout退出码 |
| `patchEngine.test.js` | `apply_patch` 成功、STALE_FILE、读缓存省略 hash、从未 read 的 orphan→`HASH_REQUIRED`+`currentHash`、冲突、CRLF 保留、SEARCH 多处拒绝、`occurrence` 指定第几处、grep 跳过大文件、嵌套正则拒绝、find_files 超额 `truncated`、**恰好 cap 条不算截断**、新建拒绝 unified diff、空 SEARCH 建新文件、**同一文件并发补丁一个成功一个 STALE** |
| `mcpProtocol.test.js` | initialize.instructions、资源、**25** 工具、危险命令（含 `git reset --hard`）、**远程 `confirm_dangerous` 仍 `E_FORBIDDEN`**、`Available:`、`cat`/`path` 别名、`tools/call` `isError:true`、memory、connect 提示词、`PAGE_RULES_LEAD` / `getPageRulesPrompt`、DeepSeek / Chat Plus `rulesText` 与「复制规则」、ChatGPT 聊天栏与自制插件配方、`get_logs` 不含 args/chunk/result/patch、**第三阶段：run_command 截图以 `type:'image'` 内容回传（text 仍在第一位、裸 base64、无图不附）** |
| `workspaceTools.test.js` | 无仓 `available:false`、skills、`delete_file` 须 `confirm`、覆盖须 `confirm_overwrite`、Ask 锁、路径逃逸、敏感文件、`workspace_info.rules`、`path`/`confirm:'true'`/`bash`/`ls`、`start_command`、`cancel_command` 终态保持 cancelled、持久 hash 不能单独覆盖 |
| `sandbox.test.js` | 默认 `host=127.0.0.1`；symlink 指到工作区外时 read/cwd/list 拒绝；UNC / 盘符路径拒绝；Windows 上再测 junction |
| `hostPersist.test.js` | `config.version` 等于插件 `package.json`；`generateNewSecret` 写入 `config.json`；旧盘 `永久顺`/假 `github`/`demo` 迁成 `local-demo`；带 `githubId` 的 octocat **留下**；`usage.json` 进 gitignore；强制 `git add -f` 后 `trackedSecretFiles` 能发现并警告；`read-hashes.json` 跨 require 仍能 recalledHash，**sessionHash 为空**；`resetHashes` 删文件 |
| `eventBus.test.js` | 日志脱敏 `ghp_` / `sk-` / `Bearer` / `oldSecret` / `namedToken` / `ngrokToken`；长 chunk 截断；普通字段留下；**源码锁** app.js `onclose` 重连 +「事件流重连中」+ 30s 封顶；broadcast 成功发送必须 `_touchIdle`；假 socket 验证 idle 重置、1001、第 33 路 1013 |
| `tunnel.test.js` | 从 cloudflared 日志解析 `*.trycloudflare.com`；`canonicalNamedUrl`；`parseNgrokUrl`；缺主机名/Token/Authtoken 在 spawn 前拒绝；**日志 buf 上限** `slice(-65536)` 锁 cloudflared 两处 + ngrok 一处 |
| `bridgeTunnel.test.js` | stub Quick/Named/ngrok：cloudflare 启动后 mcpUrl 含 trycloudflare；Named / ngrok 成功走自定义主机名且响应不含 Token；缺字段仍 200；`E_NO_CLOUDFLARED` 仍 200；未登录 403 |
| `apiFiles.test.js` | `PUT /api/files/content` 走 `write_file`：普通文件写入、`.env` 拒绝、越界拒绝、错 hash 409、`POST /api/skills` |
| `localControl.test.js` | 回环 / Cloudflare 头 / trycloudflare Host / ngrok Host / Named `publicTunnelUrl` Host 是否算本机控制面 |
| `corsAllow.test.js` | MCP Origin 白名单；外站 Origin 打 `/mcp` 403 且不执行工具；无 Origin 仍可调；外站 Origin/Referer 打 `/api` 拒绝 |
| `dangerousCommands.test.js` | `rm -rf` / `rm -r -f` / `find -delete` / `r""m -rf`：远程 MCP 与本机 `/api` 两条路径 |
| `githubAuth.test.js` | PAT 空令牌 400；假 fetch 校验 octocat；设备码 grant_type 含 `device_code`；无 client_id → `E_NO_GITHUB_APP` |
| `usageTracker.test.js` | `record` 写 `.webagent/usage.json`；成功率；`reportNow` POST Bearer |
| `adminHost.test.js` | 无 Bearer 读 `/`、`/api/stats` 与 POST 都 401；有令牌 HTML 含 `@alice`；body 超 1MB → 413；默认 bind 不是 0.0.0.0；**源码锁** Bearer 用 `crypto.timingSafeEqual` |
| `extensionCopy.test.js` | `extension/` 与 `extensions-installed/webagent.webagent-core-0.6.9/` 除 README 外逐字节一致 |
| `providers.test.js` | `gpt-4o` 无接口字段时 caps/context 为空；声明了 `capabilities`/`context_window` 才填 |
| `httpSmoke.test.js` | 真起进程：health、工作台 HTML（含 `#page-env`、多模型博弈、总结钮、本机演示授权、**GitHub 验证** / **验证令牌**、Named Tunnel `tunnel run --token`、`ngrok http`、Codex/挂钩/插件未实现、不得含「不会被使用」/永久顺 / 「使用 GitHub 登录」）、模块脚本、MCP 401、initialize、tools/list、ping、**ping 后有 usage.json 且 reset-round 不清它**、`/status.tools` 无 inputSchema、远程 `get_logs` 无 args/chunk/patch、空 token 400、隧道头打 `/api` 得 404、外站 Origin 的 `/api` 404、DeepSeek/扩展 OPTIONS 有 CORS 头、**外站 Origin 打 `/mcp` tools/call 403 且不执行**、本机 `POST /api/chat` NDJSON（Ask + Plan 分支再总结） |
| `codeServerNotRunnable.test.js` | Git 不内嵌 `code-server-dist`；vscode 入口走 npm runtime；不写死 `--auth none` / `trusted-origins *` / `--disable-workspace-trust`；`syncExtension` 读插件 `package.json` 版本、不写死 `webagent.webagent-core-0.6.9`；`run-webagent.sh` 接受 `$1` 并检查 node；`run-webagent-vscode.sh` 检查 node 且不 mkdir；runtime 包名 `webagent-code-server-runtime` |
| `workbenchHtml.test.js` | 工作台 HTML 含 bind 所需 id（page-env / btn-send / btn-plan-merge / btn-gh-login / named-domain / named-token / ngrok-domain / ngrok-token 等）；含 `ngrok http`；不得含「不会被使用」/「使用 GitHub 登录」；**S4 锁**：composer chip、chat.js branch-pill、Bridge 页折叠组 |
| `docsSite.test.js` | 跑 `docs-site/build.js` 后，提交的 `content.js` 与生成结果一致（忽略当天 `builtAt`） |
| `codeServerAuth.test.js` | 口令落盘复用；`CODE_SERVER_PASSWORD`；`CODE_SERVER_AUTH=none`；trusted-origins 仅本机 |
| `board.test.js` | 多 Agent 任务板：认领原子性（并发仅一胜）、归属者才能改状态、注记开放、释放回池、持久化 |
| `mcpBoard.test.js` | 板子经真 MCP 协议：双模拟客户端互见（peers_list）、会话身份穿进归属、E_TAKEN 跨客户端 |
| `skipWorkbench.test.js` | `WEBAGENT_SKIP_WORKBENCH=1` 不占用工作台端口 |
| `planRound.test.js` | 回合 clamp、空任务/满额/过早总结错误码 |
| `runChat.test.js` | 内置 Chat 对任意工作区搜-读-再测；Plan 首轮一支、空发第二支、过早 merge、再 merge `agreementRate==null`；第二参 emit 与 `payload.emit` |
| `chatMode.test.js` | `@webagent` 默认 Agent=code；`/ask` `/plan`（直接 require 插件 `modeFromChatRequest.js`） |
| `chatVision.test.js` | 本机 Chat「眼+手」（ShunCode 第一阶段）：截图路径解析（`-Out`/JSON out/裸路径）、白名单（工作区内收、区外/非图/symlink 逃逸拒）、`modelSeesImages`、`load_skill('computer-use')` 带 `scriptsDir`+`runHint`；假 provider 集成——vision 模型第二轮请求含 `image_url` data URL 且事件流不带 base64，纯文本模型永不带图并注入诚实提示；**源码锁**（第三阶段签字后翻转）：MCP server 复用 computerUse、run_command 截图以 `type:'image'` 回传、base64 不经 eventBus |
| `toolLabel.test.js` | 共用短标签：Explored / Found N files / Found N matches / Read / Patched |
| `profile.test.js` | 环境偏好 / 技术栈写入 `.webagent`，进入指令 |
| `oauth.test.js` | OAuth 发现、配对、PKCE、Bearer `/mcp`、SSE、session 复用/未知 404/`DELETE`、SSE endpoint 含密钥路径、注册限速 429、refresh 轮换与重放吊销；**源码锁** secretKey 用 `crypto.timingSafeEqual`、`engines.node >=18` |
| `desktopExtension.test.js` | 桌面 VS Code 侧载：`workspaceMatch` 路径规范化；`installTo` 拷 `extension/`（无 README、含 `ptyHost.js`）、摘旧 `webagent.webagent-core-*`；`WEBAGENT_VSCODE_EXTENSIONS`；根 `install-vscode-extension.cmd` 不拉 code-server；`extension.js` 提示 `run-webagent.cmd` |
| `ptyJobs.test.js` | PTY 队列 emit/report/denied；默认名单 30；远程 `send_command_input` `E_FORBIDDEN`；插件 `client:'vscode-extension'`；`ptyPolicy` 只读自动放行 / 危险命令仍问 |

---

## 1. 模块概述

- **定位：** 锁协议、工具沙箱、Chat 循环、OAuth、HTTP 烟测、启动脚本约束。失败 `process.exit(1)`。
- **兄弟依赖：** 全部 `../src/**`。`httpSmoke` / `skipWorkbench` 会 `spawn` `src/index.js`。多数测试把 `config.workspaceRoot` 指到 `os.tmpdir()`，结束 `rmSync`。
- **谁调用：** `npm test` 或根目录 `run-tests.cmd`。

---

## 2. 文件级详细说明书

### 📄 文件名：`patchEngine.test.js`

- **文件职责：** 临时工作区测补丁成功、过期 hash、读缓存、orphan `HASH_REQUIRED`、冲突、grep、新建拒绝 unified diff。
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
  - 另测：CRLF 文件打 LF 的 SEARCH 后仍是 `\r\n`；两处相同 SEARCH 拒绝；`occurrence:2` 只改第二处。
  - 另测：2MB 文件 `skippedLarge`；新建路径若 patch 是 unified diff 则拒绝且不写盘；空 SEARCH 与纯正文可建新文件。
  - 删临时目录后打印 passed。
- L101–L104：`main().catch` → 打印并 `exit(1)`。

---

### 📄 文件名：`mcpProtocol.test.js`

- **文件职责：** 不启 HTTP，直接 `handleRpc` / `callTool` 锁协议与客户端配方。
- **Function `req`（L16–L22）** — 造假 Express 请求：`ip='127.0.0.1'`，`body={ jsonrpc:'2.0', id:1, method, params }`，可 `...extra`。
- **Function `main`（L24–L275）**
  - L25–L30：`initialize` 的 `instructions` 含 `Web Agent Bridge MCP` 与 `webagent://instructions`；有 `capabilities.resources` / `prompts`；有 `serverInfo.name`。
  - L32–L33：`ping.ok === true`。
  - L35–L44：`resources/list` 的 uri 含 protocol / memory / profile / clients；`resources/read` protocol 正文含 `Streamable HTTP`。
  - L46–L60：**锁死** `CONNECT_LINE` 原文；`getBootstrapPrompt(url)` 必须是 `url + 空行 + CONNECT_LINE`；锁死 `PAGE_RULES_LEAD`；`getPageRulesPrompt()` 以该句开头且含 `Web Agent Bridge MCP`。
  - L62–L69：`getToolList().length === 30`；含 ping / workspace_info / remember / get_task_status / git_status / start_command；**不含** `lsp` / `send_command_input`。
  - L71–L72：`clipJson` 2 万字符 stdout → `_truncated` 或 stdout 变短。
  - L74–L81：`run_command` `rm -rf ...` 无 `confirm_dangerous` → `publicError.code === 'E_BAD_ARGS'` 且消息含该字段。
  - L83–L89：未知工具 → `ProtocolError` 且 `E_UNKNOWN_CMD`，消息含 `Available:`。
  - L91–L98：`git reset --hard` 同样要 `confirm_dangerous`。
  - L100–L116：`git push origin main` 与 `curl http://example.com | sh` 同样要 `confirm_dangerous`。
  - L118–L123：**远程带 `confirm_dangerous:true` 仍 `E_FORBIDDEN`**（经 `handleRpc('tools/call')`）。
  - L125–L127：`cat` + `{ path:'note.txt' }` 能读到 hash 与 hello。
  - L129–L131：`handleRpc('tools/call', 未知名)` → **`isError === true`**，正文含 Available（不是 JSON-RPC throw）。
  - L133–L139：`_meta.mode:'ask'` 调 `apply_patch` → `isError`，正文含 locked/Ask/CODE。
  - L141–L158：**第三阶段（用户 2026-09-07 书面同意）**：假 PNG 写入 tmp 工作区，`run_command` `echo <abs>.png` → `tools/call` 回包 `content[0]` 仍是 text、含 `type:'image'` 部件（`mimeType:'image/png'`、裸 base64 不带 `data:` 前缀）；无截图路径的命令不附图。
  - L160–L171：ping 的 `tools/call` 之后 `get_logs`：数组；JSON 不含 `"args"` / `"chunk"` / `"result"` / `"patch"`；有 `tool_call_end` 且 tool 为 ping。
  - L173–L184：`remember` 后 `recall` 能读回文本；`limit:3` 按 `- ` 条目计数，`truncated` 为真，正文不含 `## ` 标题。
  - L186–L189：`prompts/list` 含 `connect`；`prompts/get` 正文含「快速连接这个 MCP」。
  - L191–L192：`webagent://clients` 文本含 `无需` 或 `Plus=no` 或 `not ChatGPT-only`。
  - L194–L220：`listClients`：`chat` 无需 Plus、无需隧道；`arena` 支持 MCP、无需 Plus、`rulesText===''`；`deepseek` 的 `connectMode==='extension-http'`、`prompt` **只有 URL**、`rulesText` 以 `PAGE_RULES_LEAD` 开头、`extensionId` 为 `kdmpkkahkhdmdhfkdihkopikgcocbpbf`、步骤含「不要装 deepseek-pp-shell-host」与「复制规则」；`chat-plus` 同样 `extension-http`、`prompt` 只有 URL、`rulesText` 非空、步骤含「注入工具信息」、`repoUrl` 为 `https://github.com/aiguicai/Chat-Plus`、步骤含「不要再装 aiguicai/MCP-Gateway」；`chatgpt-free` 为 `unsupported-mcp`（步骤含「贴进 ChatGPT 输入框」）；`chatgpt-plus` 为自制插件：`oauth-connector`、`needsPlus===false`、步骤含开发者模式 / 新建插件。
  - L222–L271：`handlePost`——`fakeRes`/`post` helper；JSON-RPC 批量（数组回数组、顺序对应 id）；notifications 回 204；`id:0` 的 ping。
  - L273：删 tmp。

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
  - L133–L136：`workspace_info.root === tmp`；`rules` 含 `Web Agent Bridge MCP`；`hint` 含 `initialize.instructions`。
  - L113–L117：`start_command` `echo async-ok`，poll 后 status 为 done/timeout，stdout 含该字符串。
  - 另测：`start_command` 长 sleep 后 `cancel_command`，立即与 250ms 后 `get_command_output` 都是 `cancelled`。
  - 另测：只 `rememberHash` + `clearSession` 后 `write_file` 仍要 `confirm_overwrite`。

---

### 📄 文件名：`sandbox.test.js`

- **文件职责：** 默认只听本机；符号链接不能读出工作区。
- L24：`config.host` 等于 `WEBAGENT_BIND` 或 `127.0.0.1`。
- L31–L58：若能 `symlinkSync` 把工作区 `leak` 指到临时目录外的 `secret.txt`，则 `read_files leak/secret.txt`、`run_command cwd=leak`、`resolveSafePath` 都须匹配 outside workspace；`list_directory` 正文不得出现 `secret.txt`。
- 无法建符号链接的环境跳过那一段，仍测 host 默认值。

---

### 📄 文件名：`tunnel.test.js`

- **文件职责：** 测日志解析和 Named / ngrok 字段校验，不 spawn 二进制。
- L4–L9：样例日志含 `https://random-words-ab12.trycloudflare.com`。
- L10：`parseTunnelUrl(sample)` 严格等于该 URL。
- L11：无 URL 文本 → `null`。
- L12–L15：`canonicalNamedUrl` 去协议/路径/端口；空串与 `localhost` → `null`。
- L18–L25：`parseNgrokUrl` 认 `url=`、JSON `"url"`、`Forwarding`；无 URL → `null`。
- 源码锁：`cloudflared.js` 两处、`ngrok.js` 一处必须是 `buf = (buf + text).slice(-65536)`，且不得 `buf += text`。
- L31–L47：`startNamedTunnel` 缺主机名 `E_NAMED_HOSTNAME`、缺 Token `E_NAMED_TOKEN`；`startNgrokTunnel` 缺 Authtoken `E_NGROK_TOKEN`、坏主机名 `E_NGROK_HOSTNAME`（spawn 之前）。测前删 `NGROK_AUTHTOKEN`。
- L48：打印 passed。

---

### 📄 文件名：`hostPersist.test.js`

- **文件职责：** 密钥落盘与读哈希缓存跨重启。
- **Function `main`（L14–L82）** — 同步。
  - L15–L24：defaults 的 license/provider 是 `local-demo`；磁盘写成 `永久顺`/`github`/`demo` 后再 `load` 应收成 `local-demo`。
  - L26–L29：`generateNewSecret()` 后 `store.load().secretKey` 等于内存。
  - L31–L34：把内存 secret 改成 `deadbeefdead` 再 `persistIdentity`，应回到磁盘值。
  - L36–L41：`rememberHash` 写出 `.webagent/read-hashes.json`。
  - L43–L45：`delete require.cache` 后再 require，仍能 `recalledHash`；`sessionHash` 为 `null`。
  - L47–L54：`.webagent/.gitignore` 含 config.json 与 read-hashes.json；非 Windows 时 config.json mode `0600`。
  - L56–L59：删掉嵌套 gitignore 后再 `persistIdentity` 会写回；无 `.git` 时不写工作区根 `.gitignore`。
  - L61–L83：`git init` 后 `protectWorkspaceSecrets` 追加仓库根 ignore；`git check-ignore` 命中；`trackedSecretFiles` 为空；`git add -f` 后能发现并 `warnTrackedSecrets`；`git rm --cached` 后再空；再调 protect 不重复 ignore。
  - L73–L74：本仓库根 `.gitignore` 含 `**/.webagent/config.json`。
  - L76–L78：`resetHashes` 后内存与文件都空。
- L84：直接 `main()`。

---

### 📄 文件名：`bridgeTunnel.test.js`

- **文件职责：** 测 REST 接线，**不** spawn 二进制、不等 25s。替换 `cloudflared.js` / `ngrok.js` 上同对象导出的 start/stop（routes 已 require 该对象）。
- **Function `request`（L17–L46）** — 对已 listen 的 server 发 HTTP，body 有则 JSON。
- **Function `main`（L48–L205）**
  - L49–L77：保存原函数；stub Quick start 写 `config.publicTunnelUrl`；Named / ngrok 默认转调原函数（缺字段会在 spawn 前拒绝）；stub stop 清 URL。
  - L79–L84：express 挂 `/api`，`listen(0)`。
  - L87–L95：已登录；cloudflare start → 200、mcpUrl 含 trycloudflare、note「Quick Tunnel 已就绪」。
  - L97–L112：`E_NO_CLOUDFLARED` 仍 200，走当前 Host。
  - L114–L121：`named` 无主机名 → 200、调 `startNamedTunnel`、有 `tunnelError`。
  - L123–L145：stub Named 成功 → mcpUrl 含 `mcp.example.com`、JSON **不含** Token。
  - L147–L157：`ngrok` 无 Authtoken → 200、调 `startNgrokTunnel`、有 `tunnelError`。
  - L159–L180：stub ngrok 成功 → mcpUrl 含 `mcp.ngrok-free.app`、note「ngrok 已就绪」、JSON **不含** Authtoken、`/status.ngrokDomain` 有主机名。
  - L182–L184：未登录 → **403**。
  - L185–L194：finally 还原导出、关 server、删 tmp。
- L208–L211：`main().catch` → `exit(1)`。

---

### 📄 文件名：`apiFiles.test.js`

- **文件职责：** 挂 `apiRouter`，测工作台写路径走 `write_file`（沙箱 / 敏感 / 原子写），不启完整 `index.js`。
- **Function `request`（L14–L45）** — 对已 listen 的 server 发 HTTP，body 有则 JSON。
- **Function `main`（L46–L104）**
  - L55–L62：`PUT /api/files/content` `notes.md` → 200、磁盘内容正确、无残留 `.tmp.`。
  - L64–L69：写 `.env` 被拒，磁盘无该文件。
  - L71–L75：`../outside.txt` 匹配 outside workspace。
  - L77–L82：已有文件带错 `expectedHash` → 409 `STALE_FILE`，磁盘仍旧内容。
  - L84–L88：`POST /api/skills` 写出 `.webagent/skills/demo-skill/SKILL.md`。
  - L90–L93：`GET /api/files/content` 仍返回全文 + hash。
- L106–L109：`main().catch` → `exit(1)`。

---

### 📄 文件名：`localControl.test.js`

- **文件职责：** 不启 HTTP，直接断言 `isLoopbackAddress` / `isTunnelRequest` / `isPublicHost` / `isLocalControlPlane`。
- **Function `req`（L9–15）** — 造假 Express 请求：默认 `ip=127.0.0.1`、`Host=127.0.0.1:48271`，可叠 headers。
- L17–20：回环地址为真，`192.168.1.8` 为假。
- L22–24：`cf-ray` / `cf-connecting-ip` 为隧道；无头不是。
- L27–35：`*.trycloudflare.com` 为公网 Host；`127.0.0.1` / `localhost` 不是。设 `config.publicTunnelUrl='https://mcp.example.com'` 后该 Host 为公网，本机控制面为假。
- L37–40：默认本机为真；带 Cloudflare 头、trycloudflare Host、或 `10.0.0.8` 为假。

---

### 📄 文件名：`eventBus.test.js`

- **文件职责：** 不启 HTTP。broadcast 带 token / apiKey / 超长 chunk 后，`getRecentLogs` 不得出现原文，须含 `[redacted]`，普通字段留下。源码锁：`workbench/app.js` 必须 `ws.onclose` 重连、文案「事件流重连中」、退避封顶 30000；`eventBus.js` 的 `broadcast` 在 `ws.send` 之后 `_touchIdle`。假 WebSocket：加入后有 30min idle；broadcast 清掉旧 timer 再 arm；idle 回调 `close(1001)`；第 33 路 `close(1013)`。

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
  - L115–139：GET `/` HTML 必须含：`Web Agent`；`编辑进化` 或 `CHAT`；`Add API`；`btn-agent-pick`；`agent-pick-menu`；`Web Agent Code`；`环境偏好`；`技术栈`；`技能引导`；`怎么连到本机仓库`；`无需 Plus` 或 `不需要 Plus`；`打开 DeepSeek`；`data-site="deepseek"`；`id="page-env"` / `btn-detect-env` / `page-stack` / `btn-detect-stack`；`本机演示授权` 与 `不是 GitHub`；含 `多模型博弈`、`btn-plan-merge`、`think-select`；不得含 `永久顺` / `使用 GitHub 登录`；`type="module"` 与 `./app.js`。status 含 `planRound.active===false` 与 `multiModel.maxBranches===4`。末尾再 POST Plan start/branch/merge，首轮无 consensus、两支可总结、`agreementRate==null`。
  - L137–142：GET `/app.js` 含 `from './js/state.js'`；GET `/js/state.js` 含 `export const state`。
  - L148–160：GET **mcp 端口** `/api/status`（本机无隧道头）：有 `secretKey`；`prompt` 含「快速连接这个 MCP…」整句；`tools.length===30` 且每项无 `inputSchema`；clients 含 arena（无需 Plus、`rulesText===''`）、deepseek（`extension-http`、支持 MCP、无需 Plus、`rulesText` 非空）、chat-plus（`rulesText` 含 Bridge MCP）、chatgpt-free（`unsupported-mcp`）、chatgpt-plus（`oauth-connector`、无需 Plus）；`mcpCanonicalUrl` 以 `/mcp` 结尾；`bridgeAccount.license/provider` 为 `local-demo` 且 `loggedIn`；`recentLogs` 是数组。`tools/call` ping 之后再 GET `/status`：有 `tool_call_end` 且 payload 只有 tool/success/durationMs。再 `tools/call` `get_logs`：正文不含 `"args"` / `"chunk"` / `"patch"`。
  - L154–160：错误 secret POST initialize → 401。
  - L162–170：正确 secret initialize 200，instructions 含 Bridge MCP 与 `webagent://instructions`。
  - L172–183：tools/list 30 个且含 apply_patch / start_command / workspace_info。
  - L185–191：`POST /mcp` 无密钥 → 401。
  - L193–195：GET `/.well-known/oauth-authorization-server` 200，有 `authorization_endpoint`。
  - L197–205：tools/call ping 成功，`isError===false`。
  - L207–211：本机 `POST /api/bridge/reset-round` 仍 200。
  - L214–223：带 `cf-ray` 的 mcp 口 `/api/status`、`/api/chat`、`/api/tool/call` 以及 `Host: *.trycloudflare.com` 的 `/api/status` 都 **404**，正文不含 secret。
  - L225–231：同一组隧道头 `POST /mcp/<secret>` initialize 仍 200。
  - L233–270：`Origin: https://evil.example` 打 mcp `/api/status` 与工作台 `reset-round` 都 404；本机 Origin 的 `/api/status` 200；OPTIONS `/mcp` 对 evil 无 ACAO，对 `chat.deepseek.com` 与 DeepSeek++ 扩展 Origin 回相同 ACAO；evil Origin 的 `POST /mcp` `run_command` **403** 且响应不含命令输出；DeepSeek Origin 的 ping 仍 200。
  - L272–273：mcp 口 GET `/` 正文不得含 `btn-agent-pick`（没有工作台静态）。
  - L236–249：**工作台口** `POST /api/chat` NDJSON 必须有 `tool`（`list_directory`）、`message`、`done`。
  - L259–262：finally `stop` 子进程，等 300ms，删 tmp。

### 📄 文件名：`codeServerNotRunnable.test.js`

- **文件职责：** Git **不得**内嵌 `bin/code-server-dist`；主启动脚本不得拉 code-server。
- L5：`repoRoot` = tests 上三级（仓库根）。
- L6–L8：读 `ensure-code-server.js` 与 `run-code-oss.js` 原文。
- L10：`bin/code-server-dist` 不存在。
- L12–L17：拼接 `run-webagent.cmd` + `.sh`，正则 **不得** 匹配 `code-server`；必须匹配 `agent-host`。`.sh` 须含 `$1`、`command -v node`、`mkdir`、自定义路径不存在的报错。`run-webagent-vscode.sh` 须检查 node、拒绝不存在的工作区、**不得** `mkdir`。runtime `package.json` 的 `name` 为 `webagent-code-server-runtime`。
- L19–L28：`run-webagent-vscode.cmd` 与 `run-code-oss.js` 存在；ensure 含 `bin/code-server-runtime`，且含 `code-server@4.135.0` 或 `'code-server': VERSION`；ensure/runner 都不含 `code-server-dist`；runner `require('./codeServerAuth')`；不得写死 `'--auth', 'none'` 与 `trusted-origins *`。
- 无 async `main`。

### 📄 文件名：`codeServerAuth.test.js`

- **文件职责：** 测 `scripts/codeServerAuth.js`，不 spawn code-server。
- L10–L11：`trustedOrigins(3000/8080)` 只有 127.0.0.1 与 localhost。
- L13–L20：空 env 生成口令并写入 tmp/`webagent-password`；再调一次同一串。
- L22–L24：`CODE_SERVER_PASSWORD` 覆盖文件。
- L26–L28：`CODE_SERVER_AUTH=none` → `mode:'none'`、password null。

---

### 📄 文件名：`workbenchHtml.test.js`

- **文件职责：** 不启 HTTP。读 `workbench/index.html`，锁 bind 所需 id（page-env / btn-send / btn-plan-merge / btn-gh-login / named-domain / named-token / ngrok-domain / ngrok-token / sb-ws 等），含 `cloudflared tunnel run --token` 与 `ngrok http`，不得含「不会被使用」/「使用 GitHub 登录」或「永久顺」。

### 📄 文件名：`docsSite.test.js`

- **文件职责：** 再跑 `docs-site/build.js`，断言仓库里的 `content.js` 与生成结果一致（去掉当天 `builtAt` 再比）。
- 失败文案要求执行 `node docs-site/build.js`。不启 HTTP。

### 📄 文件名：`skipWorkbench.test.js`

- **文件职责：** `WEBAGENT_SKIP_WORKBENCH=1` 时 MCP health 通，工作台端口无人听。
- **Function `get`（L12–L21）** / **`waitOk`（L23–L39）** — HTTP 轮询。
- **Function `main`（L41–L74）**
  - L42–L52：spawn index.js，`AGENT_HOST_PORT=mcpPort`，`WORKBENCH_PORT='19999'`，`SKIP=1`。
  - L54–L56：mcp 端口 `/health` 200。
  - L57–L62：GET `127.0.0.1:19999/health` 若成功回调则 **reject**（端口应空闲）；`error` 事件才 resolve。
  - L64–L71：finally taskkill/SIGTERM，删 tmp。

---

### 📄 文件名：`planRound.test.js`

- **文件职责：** 不启 HTTP，直接测回合状态机。
- L15–L19：`clampMax` undefined→4、1→2、99→8；reset 后 `active:false`。
- 空任务 `E_PLAN_NO_TASK`；无回合 `addBranch` → `E_PLAN_NO_ROUND`。
- start max=3 后一支：`canBranch` 真、`canMerge` 假；两支可总结；第三支后满额 `E_PLAN_FULL`；merge 后再加 `E_PLAN_MERGED`。
- 一支就 `markMerged` → `E_PLAN_NEED_TWO`。

### 📄 文件名：`runChat.test.js`

- **文件职责：** 内置 Chat 对**任意**临时工作区搜-读-测；不依赖 calculator.js；不调 get_diagnostics；锁 Plan 分支/总结；同时锁第二参 emit 与 `payload.emit`。
- **Function `collect`（L12–L16）** — `{ events, emit }`，emit 把 `{type,...data}` 推进数组。
- **Function `main`（L18–L115）**
  - L19–L34：写 README（标题 Widget）、`src/app.js` greet、`package.json` scripts.test、`tests/app.test.js`。
  - L36–L46 **ask「分析当前项目」：** 第二参 `ask.emit`；工具含 list_directory / find_files / read_files；禁止 diagnostics / apply_patch；message 匹配 README|Widget|app.js；整段事件 JSON **不含** `calculator.js`；有 label 匹配 `Found N files`。
  - L48–L59 **plan start：** 无 `consensus`；`planRound.branches.length===1`；status 含 `分支 1/`；message.branch.index===1 且 `simulated:true`；有 `set_todos`。
  - L61–L66 **planAction branch：** 两支、`canMerge`、仍无 consensus。
  - L68–L73 **一支就 merge：** error 含「至少两个」。
  - L75–L83 **两支再 merge：** `simulated:true`，`consensusReached===false`，`agreementRate == null`，participants 长度 2。**不要**用 `/97%/` 扫整段 JSON（本机拼接文案含「这不是假的 97% 投票」）。
  - L85–L91 **code「跑测试」：** 有 `run_command` 且 `ok`；message 含 `npm test` 或 `ok`。
  - L93–L100 **payload.emit：** `runChat({ mode:'ask', message, emit })` 无第二参，仍须有 `list_directory` 与 `message`。
  - L102–L111 **code 写入 notes.md + 围栏：** 磁盘出现该文件且含 `hello from agent`。

### 📄 文件名：`chatMode.test.js`

- **文件职责：** 直接 `require('../../extension/modeFromChatRequest')`（不加载 `extension.js`，因此不需要 `vscode`）。
- L3–L9：command ask/plan、`/ask 这是什么`、普通「修复测试」、空对象 → 分别 ask/plan/ask/code/code。

### 📄 文件名：`chatVision.test.js`

- **文件职责：** ShunCode 第一阶段（review/PROMPT_SHUNCODE.md）：本机 Chat「眼 + 手」最小集。不依赖真显示器：假 PNG + 本地假 provider（http 服务脚本化两轮响应并记录请求体）。
- 单测 `computerUse`：`findShotCandidates` 认 `-Out`（带/不带引号、反斜杠路径）、mark JSON `"out"`、裸图路径，无图命令不误报；`resolveShotPath` 工作区内相对/绝对收，**工作区外、非图扩展名、symlink 逃逸拒**；`collectShot` 返回 `data:image/png;base64,`。
- `modelSeesImages`：`vision:true` / caps 含 vision → true；`{}`/null → false。
- `loadSkill({name:'computer-use'})`：`absDir`/`scriptsDir` 以 `computer-use`/`computer-use/win` 结尾；`runHint` 含 `snap.ps1` 与「image 内容」（Bridge 第三阶段签字后回图）。
- 集成：vision 模型——恰好两轮请求，第二轮含 `"type":"image_url"` 与 data URL、第一轮无图、status 含「截图」、**事件流不含 base64**；纯文本模型——所有请求体不含 `image_url`、对话注入「未标记为可看图」、status 诚实提示。
- 源码锁（第三阶段用户签字后翻转）：`mcp/server.js` 复用 `computerUse`、含 `type:'image'`、截图不经 eventBus 广播。

### 📄 文件名：`toolLabel.test.js`

- **文件职责：** 单测 `src/agent/toolLabel.js`。list / find_files / search_files / read / apply_patch 成功标签；list 失败仍是 `Explored .`。

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

- **文件职责：** 真 listen 随机端口：发现文档、401、URL 密钥 initialize、SSE ping、PKCE 发 token、refresh 轮换与重放吊销、Bearer tools/call、`Mcp-Session-Id` 复用/未知 404/`DELETE`、SSE GET endpoint 含 `/mcp/<secret>`、第 21 次 register 429、revoke 后 401。源码锁：`oauth.js` 用 `crypto.timingSafeEqual` 比 secretKey；`package.json` `engines.node` 为 `>=18`。
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

### 📄 文件名：`desktopExtension.test.js`

- **文件职责：** 不启 HTTP。锁桌面 VS Code 侧载安装与工作区路径比对。
- `sameWorkspace`：Windows 盘符大小写、尾斜杠视为同一路径；空串或不同目录为假。
- `WEBAGENT_VSCODE_EXTENSIONS` 覆盖 `defaultExtensionDirs` 为单一路径。
- `installTo(tmp)`：写出 `package.json` / `extension.js` / `workspaceMatch.js` / `resources/icon.svg`，不拷 README；预先放的 `webagent.webagent-core-0.0.1` 被摘掉。
- 根 `install-vscode-extension.cmd` 含 `install-desktop-extension.js`、`chcp 65001`，不含 `code-server`。
- `extension.js` 含 `workspaceMatch` 与 `run-webagent.cmd`。

---

## 3. 执行逻辑流（仅本目录）

1. `npm test` → `scripts/run-tests.js` 按表中顺序跑每个 `*.test.js`（失败继续，最后非 0）。表外新文件追加在末尾。
2. 单文件：改 `config.workspaceRoot` 指向 tmp → require 被测模块 → assert → 删 tmp。`tunnel` / `chatMode` / `codeServerNotRunnable` 不改工作区。`bridgeTunnel` 改 tmp 工作区并 stub 隧道导出。
3. 启进程的测试 spawn `src/index.js`，结束必须杀子进程。
4. 失败路径：有 `main()` 的文件走 `main().catch` → `exit(1)`；`profile.test.js` 同步抛错由 Node 非 0 退出；CMD 的 `run-tests.cmd` 据此 pause。
