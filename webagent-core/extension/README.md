# extension 模块说明书

当前处理目标：`webagent-core/extension/`

VS Code / code-server 插件源码。侧栏 Chat、Bridge、原生 Chat `@webagent`。工具实现仍在 agent-host，本目录只做 HTTP 客户端 + webview HTML 字符串。

文件：`extension.js`、`package.json`、`resources/icon.svg`。

---

## 1. 模块概述

- **定位：** 网页 VS Code 的 UI 插件。`scripts/ensure-code-server.js` 的 `syncExtension` 会把本目录拷到 `extensions-installed/`。
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
  | `version` | 版本 | `0.6.9`（与 syncExtension 目标目录名一致） |
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

- **文件职责：** activate 注册侧栏、Chat 参与者、状态栏；webview HTML 内嵌在本文件。
- **核心类/函数清单：**

  - **Function `agentHostUrl()`（L6–L9）** — 配置 `webagent.agentHostUrl` 或 env `WEBAGENT_AGENT_HOST_URL` 或默认 48271，去尾 `/`。
  - **Function `requestJson(method, url, body)`（L11–L43）** — 按协议选 http/https。结束 try JSON.parse；失败 `{ json:null, raw }`。`req.on('error', reject)`。
  - **Function `postNdjson(url, body, onEvent)`（L45–L85）** — **只用 `http.request`**（https URL 不会走 https 模块）。按行 parse，失败忽略；结束处理残余 buf。
  - **Function `modeFromChatRequest(request)`（L87–L95）** — `request.command` 小写 ask/plan/code；否则 prompt 以 `/ask|/plan|/code` 开头；**都不匹配 → `'code'`**。
  - **Function `historyFromChatContext`（L97–L113）** — 最多 12 轮 user/assistant。
  - **Function `revealWorkspaceFile(rel)`（L115–L123）** — 无 folder 或 rel 则 return；打开失败 catch 空。
  - **Function `registerChatParticipant`（L125–L174）** — 无 `createChatParticipant` 则 return。handler：空 message 输出模式说明；否则 `postNdjson /api/chat`。status→progress；tool→markdown，apply_patch 成功 reveal + `stream.reference`；message/error/consensus。catch 提示连不上 48271。外层 try/catch warn，不抛给 activate。
  - **Function `activate`（L176–L228）** — 注册 ChatView、BridgeView；Chat 参与者；状态栏每 5s GET `/api/status`（运行中 / Agent / 未连接）。命令：打开侧栏；`openAgentChat` 试原生 Chat query `@webagent `，失败侧栏；resetSecret POST reset-secret。
  - **Class `ChatView`（L230–L271）** — webview scripts 开。`openNative` → 命令。`send`：history 12，postNdjson，事件转 webview；apply_patch reveal；assistantText 非空才进 history。
  - **Class `BridgeView`（L273–L312）** — start POST `{ tunnelProvider:'cloudflare' }`；stop/copy/reset；refresh GET status。catch 弹 ErrorMessage。
  - **Function `chatHtml`（L314–L421）** — 完整 HTML。内嵌脚本：默认 `mode='code'`；Agent 菜单切 ask/plan/code；Enter 发送；set_todos 画任务。DOM：`#log` 空态、`#tasks`、textarea `#q`、`#agent` 按钮、`#menu`、`#go`。
  - **Function `bridgeHtml`（L423–L490）** — 启动/停止/复制/重置。4s refresh。copy 用 `status.prompt` 或 mcpUrl+CONNECT。DOM：`#pill`、`#url`、按钮、`#tasks`、`#stream`。

  内嵌 `chatHtml` 脚本函数：L385 `add`、L390 `paintTasks`。  
  内嵌 `bridgeHtml` 脚本：L463 `paintTasks`、L470 `paintLogs`（只画 `tool_call_end` 最多 12 条）。

- **导出（L492）：** `{ activate, deactivate: () => {}, modeFromChatRequest }`。`deactivate` 空函数。

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
