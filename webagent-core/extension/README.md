# extension 模块说明书

## 第六批：请求取消与PTY生命周期

PTY自动批准仅限完整匹配的保守只读命令，复合语法必须再次明确审批，不能被会话/命令族许可自动放行。插件每进程生成clientId，工作区匹配后才处理job；先claimed，用户批准后再次accepted，失效不spawn。轮询不等待长命令，以接收取消。node-pty区分timeout与exitCode，输出200Ki字符；fallback只在有shellIntegration及真实结束事件时执行，无可观测退出机制则拒绝，不再sendText后报成功。原生Chat CancellationToken传给HTTP；扩展Chat发送按钮执行中变停止，cancel消息中止HTTP。


当前处理目标：`webagent-core/extension/`

VS Code / code-server 插件源码。侧栏 Chat、Bridge、原生 Chat `@webagent`。工具实现仍在 agent-host，本目录只做 HTTP 客户端 + webview HTML 字符串。

文件：`extension.js`、`ptyHost.js`、`modeFromChatRequest.js`、`workspaceMatch.js`、`package.json`、`resources/icon.svg`。

---

## 1. 模块概述

- **定位：** VS Code / code-server 的 UI 插件。`scripts/ensure-code-server.js` 的 `syncExtension` 会把本目录拷到 `extensions-installed/`（网页 VS Code）。桌面 VS Code 走 `scripts/install-desktop-extension.js` 拷到用户 `~/.vscode/extensions`。
- **依赖：** VS Code API（`vscode`）；Node `http`/`https`/`path`。运行时打 `agentHostUrl()`（默认 `http://127.0.0.1:48271`）。
- **谁调用：** code-server 加载插件后 `activate`。自绘工作台 **不加载** 本目录。

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **文件职责：** 插件清单。code-server 用它注册 Chat 参与者、侧栏、命令。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | npm/插件 id 段 | `webagent-core` |
  | `displayName` | 市场显示名 | `Web Agent & Bridge` |
  | `description` | 简介 | 说明连本地 agent-host |
  | `version` | 版本 | 当前 `0.6.9`（`syncExtension` 读这个字段拼目标目录名） |
  | `publisher` | 发布者 | `webagent` |
  | `engines.vscode` | 最低 VS Code | `^1.90.0` |
  | `categories` | 分类 | Other、Chat |
  | `activationEvents` | 何时激活 | `*` 与 `onChatParticipant:webagent.agent` |
  | `main` | 入口 | `./extension.js` |
  | `contributes.configuration.properties.webagent.agentHostUrl` | 可配置 host | 类型 string，默认 `http://127.0.0.1:48271` |
  | `contributes.chatParticipants[0].id` | 参与者 id | `webagent.agent` |
  | `.fullName` / `.name` | UI 名 | Web Agent / webagent（`@webagent`） |
  | `.isSticky` / `.isDefault` | 粘滞、默认 | `true` |
  | `.commands` | slash | `ask` / `plan` / `code` |
  | `viewsContainers.activitybar` | 活动栏容器 | id `webagent-sidebar`，icon `resources/icon.svg` |
  | `views.webagent-sidebar` | 两个 webview | `webagent.chatView`、`webagent.bridgeView` |
  | `commands` | 命令面板 | `webagent.openBridge`、`openAgentChat`、`resetSecret` |

---

### 📄 文件名：`extension.js`

**2026-09-11安全更新：** Chat/Bridge每次生成页面使用随机nonce，CSP默认禁止资源/网络加载，仅允许该nonce脚本；保留内联CSS以兼容现有布局，禁止base与form提交。任务标题、工具名和耗时均用DOM＋textContent渲染，不拼接动态HTML。任务列表最多显示500项，工具日志12项；坏数组/空消息安全忽略。

`validWebviewMessage(msg, surface)`在宿主回调入口校验对象与消息类型；Chat仅openNative/send，send限定ask/plan/code和非空字符串（最多128000字符）；Bridge仅refresh/start/stop/reset/copy，copy需字符串且最多128000字符。未知/畸形消息不会触发后端或剪贴板操作。此校验不代替后端授权与命令审批。

回归：webviewRuntime.test.js执行实际HTML脚本、宿主回调与DOM fixture；CSP内容已检查，但真实VS Code中的CSP执行仍待实测。发行副本从此源码同步，不独立修改。


- **文件职责：** activate 注册侧栏、Chat 参与者、状态栏；webview HTML 内嵌在本文件。
- **核心类/函数清单：**

  - **Function `agentHostUrl()`（L6–L9）** — 配置 `webagent.agentHostUrl` 或 env `WEBAGENT_AGENT_HOST_URL` 或默认 48271，去尾 `/`。
  - **Function `requestJson(method, url, body)`（L11–L43）** — 按协议选 http/https。结束 try JSON.parse；失败 `{ json:null, raw }`。`req.on('error', reject)`。
  - **Function `postNdjson(url, body, onEvent)`（L46–L87）** — 按协议选 `http`/`https`（与 `requestJson` 相同）。按行 parse，失败忽略；结束处理残余 buf。
  - **Function `historyFromChatContext`（L89–L105）** — 最多 12 轮 user/assistant。
  - **Function `revealWorkspaceFile(rel)`（L107–L115）** — 无 folder 或 rel 则 return；打开失败 catch 空。
  - **Function `registerChatParticipant`** — 无 `createChatParticipant` 则 return。handler：空 message 输出模式说明；否则 `postNdjson /api/chat`（body 带 `client:'vscode-extension'`）。`pty_request` → `dispatchPty`；status→progress；tool→markdown，apply_patch 成功 reveal + `stream.reference`；message/error/consensus。catch 提示连不上 48271。
  - **Function `activate`** — `startPtyHost`（hello 3s、poll 400ms）；注册 ChatView、BridgeView；Chat 参与者；状态栏每 5s GET `/api/status`。连得上时用 `workspaceMatch.sameWorkspace` 比对工作区；连不上提示先跑 `run-webagent.cmd`。
  - **Class `ChatView`** — webview scripts 开。`send`：history 12，postNdjson 同样 `client:'vscode-extension'`，`dispatchPty` 后事件转 webview。
  - **Class `BridgeView`** — start POST `{ tunnelProvider:'cloudflare' }`；stop/copy/reset；refresh GET status。catch 弹 ErrorMessage。
  - **Function `chatHtml`** — 完整 HTML。内嵌脚本：默认 `mode='code'`；Agent 菜单切 ask/plan/code；Enter 发送；set_todos 画任务。Agent 菜单 Plan 文案「分支」。DOM：`#log` 空态、`#tasks`、textarea `#q`、`#agent` 按钮、`#menu`、`#go`。
  - **Function `bridgeHtml`** — 启动/停止/复制/重置。4s refresh。copy 用 `status.prompt` 或 mcpUrl+CONNECT。DOM：`#pill`、`#url`、按钮、`#tasks`、`#stream`。

  内嵌chatHtml：add/paintTasks；bridgeHtml：paintTasks/paintLogs。以函数名定位，不维护易漂移行号。

- **导出（L484）：** `{ activate, deactivate: () => {}, modeFromChatRequest }`。`deactivate` 空函数。`modeFromChatRequest` 来自同目录 `./modeFromChatRequest`。

### 📄 文件名：`ptyPolicy.js`

- **文件职责：** 不依赖 `vscode`。只读命令（`git status` / `echo` / `ls`…）自动放行；破坏性命令即使「本会话都允许」也再问；`commandFamily` 给「同类都允许」。

### 📄 文件名：`ptyHost.js`

- **文件职责：** 桌面 Chat 档 B。从 `vscode.env.appRoot` 加载 **node-pty**；失败则等最多 2.5s 的 `shellIntegration` 再 `executeCommand`，仍没有才 `sendText`。Windows 多行 / 非 ASCII / 超长命令写临时 `.ps1`。终端名「Web Agent · 1」。NDJSON `pty_request` 走 `noteStream`（2.5s 内不轮询）；poll 无 pending 时 2s 一次、有活 job 400ms。`handleIncoming` 去重。确认：运行 / 本会话都允许 / 同类都允许 / 拒绝。

### 📄 文件名：`workspaceMatch.js`

- **文件职责：** 桌面 VS Code 打开的文件夹 vs agent-host `workspaceRoot`。无 `vscode` 依赖，测试可直接 require。
- **Function `normalizePath(p)`** — 反斜杠改 `/`、去尾 `/`、小写。
- **Function `sameWorkspace(vscodeFolder, hostRoot)`** — 任一侧空则 false；否则规范化后全等。

### 📄 文件名：`modeFromChatRequest.js`

- **文件职责：** 把 VS Code Chat 请求收成 ask/plan/code。无 `vscode` 依赖，测试可直接 require。
- **Function `modeFromChatRequest(request)`（L1–L9）** — `request.command` 小写 ask/plan/code；否则 prompt 以 `/ask|/plan|/code` 开头；**都不匹配 → `'code'`**。

---

### 📄 文件名：`resources/icon.svg`

- **文件职责：** 活动栏图标。L1–L5 描边 SVG（代码括号风格），无脚本。

---

## 3. 执行逻辑流

1. `run-code-oss.js` → `syncExtension` 拷贝本目录并写 `extensions.json`（绝对路径）。
2. code-server 激活 → `activate` 注册侧栏与 `@webagent`。
3. 用户发消息 → `postNdjson('/api/chat')` → 与工作台同一套 `runChat`/`callTool`。
4. Bridge 按钮 → `/api/bridge/start|stop`：start 在 cloudflare 下 `await startQuickTunnel`；失败仍 200，MCP 走当前 Host。stop 调 `stopTunnel`。
5. 默认模式 Code（Agent），与 Copilot 侧栏 Agent 对齐。
