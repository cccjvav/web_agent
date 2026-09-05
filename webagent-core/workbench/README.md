# workbench 模块说明书

当前处理目标：`webagent-core/workbench/`

浏览器里的自绘工作台。静态文件由 `../agent-host/src/index.js` 用 `express.static` 挂出。本目录 **不直接 fs**；所有读写经 `/api/*` 与 `/ws`。

文件：`index.html`、`app.js`（入口）、`js/*.js`（按职责拆开的交互）、`styles.css`、`favicon.svg`。无打包；浏览器原生 ES module。

---

## 1. 模块概述

- **定位：** UI 组件壳（欢迎页、编辑器、CHAT、BRIDGE、设置模态）。真正改盘在 agent-host。
- **依赖的兄弟模块：** 运行时 HTTP 依赖 `agent-host` 的 `/api`、`/mcp`（仅内置演示 `arenaConnect`）、`/ws`。源码上不 require Node 模块。
- **谁调用：** 用户浏览器打开 `http://127.0.0.1:3000`。`run-webagent-vscode` 跳过本目录（`WEBAGENT_SKIP_WORKBENCH=1`）。

---

## 2. 文件级详细说明书

### 📄 文件名：`index.html`

- **文件职责：** DOM 骨架。逻辑在 `app.js` + `js/*.js`。
- **DOM 结构区块：**
  - L3–L8：charset、viewport、title、favicon、`/styles.css`。
  - L11–L28 **标题栏 `#titlebar`：** 文件/编辑/选择/查看/转到/运行菜单（多数按钮无 JS）；`#menu-term` 终端、`#menu-help` 帮助；中间 `#window-title`。
  - L31–L54 **活动栏 `#activitybar`：** `data-left=explorer|search` 有 JS；SCM/调试/扩展按钮无 handler；底栏 `#btn-account` 无登录实现、`#btn-manage` 打开管理菜单。
  - L56–L70 **左侧栏 `#sidebar`：** 默认 `collapsed`。`#left-explorer` 文件树；`#left-search` 搜索框。
  - L72–L157 **中间 `#center`：**
    - L73 `#tabs` 标签条。
    - L75–L112 `#welcome` 欢迎页：新建/打开文件/打开文件夹（后两个只点开资源管理器）；「连接到」「生成新工作区」无 handler；`#recent-list`；`#walk-basics` 打开设置；`#btn-agent-window`。
    - L113–L114 Monaco `#editor` 与 fallback textarea。
    - L115–L123 `#browser` 内置假浏览器（地址栏、`#browser-page`）。
    - L125–L140 `#agent-pane` 智能体窗口（独立输入框与 Ask/Plan/Code）。
    - L142–L145 `#diff-pane` 补丁对比。
    - L147–L157 `#panel` 终端，默认 hidden。
  - L160–L223 **右侧 `#rightbar`：**
    - L161–L164 CHAT / BRIDGE 页签。
    - L165–L192 `#right-chat`：流、Tasks、chips 快捷句、`#chat-input`、`#btn-agent-pick`、隐藏 `#mode-select`、`#model-select`、发送。
    - L193–L222 `#right-bridge`：等待文案、任务、log、MCP session。L204–L221 `.mcp-session`：`#btn-reset-round`（清除本轮统计）、`#btn-stop-bridge-rb`、`#stat-calls` / `#stat-avg` / `#stat-fail` / `#stat-ok`。
  - L226–L235 `#statusbar`。
  - L238–L569 **`#modal` 设置：** 左侧 nav 多页（概述/环境/技术栈/智能体/技能/指令/提示/挂钩/MCP/Bridge/插件/API/Codex/多模型）。**`#page-env` / `#page-stack` 有完整表单**（`#btn-detect-env`、`#btn-save-env`、`#btn-detect-stack`、`#btn-save-stack`）。Bridge 页含客户端卡片、复制 URL/提示词、打开各站点、**本机演示授权**（按钮 id 仍是 `#btn-gh-login`，文案写不是 GitHub）、隧道 radio（cloudflare 默认；named/ngrok 输入框 **无对应 JS 去 spawn**）。警告文案写明隧道不转发 `/api`。`#btn-reset-secret` 在高级设置。
  - L518–L537 下拉：`#file-menu`、`#manage-menu`、`#agent-pick-menu`。
  - L538 `#toast`；L539 `<script type="module" src="/app.js">`（原生 ES module，无打包）。

跨模块调用走 `js/state.js` 的 `ui` 袋（避免 import 环），**不改** `/api` 与按钮行为。

---

### 📄 文件名：`app.js`

- **文件职责：** 工作台入口。import `js/*.js` 后 `boot`。71 行。
- **Function `connectWs`（L9–L32）** — `ws(s)://location.host/ws`；`command_output` → `ui.termLine`；`file_patched` → `ui.loadTree`；`todos_updated` → `ui.paintTodos`；`tool_call_end` → `ui.logBridgeTool`。
- **Function `loadMonaco`（L34–L58）** — jsDelivr monaco 0.52.2；`window.monaco.editor.create`；onerror 或 7s 超时。
- **Function `boot`（L60–L69）** — `ui.bind`、默认 code、并行 refresh/tree/skills/custom/monaco、WS、welcome。L71 `boot().catch(console.error)`。

---

### 📄 文件名：`js/state.js`

- **文件职责：** `$` / `$$`、外链 `SITES`、共享 `state`、空对象 `ui`。无函数。L1–L35。
- **`state` 初值：** `mode:'code'`、`tabs` 仅 welcome、`stats`、`loggedIn:true`、`selectedClient:'arena'`、`stayOnBridge:false`。
- **`SITES`：** chatgpt/arena/deepseek/workbuddy/trae/qwen/manus/shunova 的外链。

---

### 📄 文件名：`js/dom.js`

- **文件职责：** toast / 转义 / 极简 markdown / 终端行 / 模态 / 右侧页签。
- **Function `toast`（L3–L9）** — 显示 2.2s。
- **Function `escapeHtml`（L11–L15）** — 五字符。
- **Function `renderMd`（L17–L27）** — escape 后再 fence/inline/bold/标题/列表/`<br>`。
- **Function `termLine`（L29–L36）**。
- **Function `openModal` / `closeModal` / `showPage`（L38–L47）**。
- **Function `setRight`（L49–L54）** — chat/bridge。

---

### 📄 文件名：`js/tabs.js`

- **文件职责：** 标签、文件树、打开文件、Monaco/fallback、保存。
- **Function `paintTabs`（L4–L19）** / **`activateTab`（L21–L35）** — kind=welcome/browser/agent/diff/file；browser 调 `ui.renderBrowser`。
- **Function `closeTab`（L37–L42）** — 只剩 1 个则 return。
- **Function `openAgentWindow`（L44–L53）** / **`openDiff`（L55–L65）** / **`paintDiff`（L67–L76）** — `+` 非 `+++` 绿。
- **Function `ensureWelcome`（L78–L83）**。
- **Function `openFile`（L85–L95）** — GET `/api/files/content`。
- **Function `langFor`（L97–L104）** / **`applyEditor`（L106–L113）** — `window.monaco`。
- **Function `treeHtml`（L115–L126）** / **`loadTree`（L128–L162）** — GET `/api/files/tree`；recent 最多 6。
- **Function `saveActive`（L163–L174）** — 仅 file tab PUT。

---

### 📄 文件名：`js/chat.js`

- **文件职责：** 本机 CHAT 流。
- **Function `emptyChat`（L4–L16）** / **`paintChat`（L18–L34）**。
- **Function `summarizeTool`（L36–L42）** / **`renderMsg`（L44–L93）** — user/status/tool/consensus（采纳则 `ui.setAgentMode('code')` 并 `ui.sendChat` 固定句）/assistant。
- **Function `pushMsg`（L95–L102）**。
- **Function `sendChat`（L104–L152）** — POST `/api/chat` NDJSON；parse 失败 continue；finally `ui.refreshStatus` + `ui.loadTree`。
- **Function `handleEvent`（L154–L188）** — tool 可 `ui.logBridgeTool`；set_todos；run_command 进终端；apply_patch 刷新并 `ui.openDiff`。
- **Function `paintTodos`（L190–L207）** / **`agentLabel`（L209–L212）** / **`setAgentMode`（L214–L220）**。

---

### 📄 文件名：`js/bridge.js`

- **文件职责：** Bridge 启停、客户端卡、内置假浏览器。**不是云上 Arena。**
- **Function `logBridgeTool`（L4–L20）** / **`paintStats`（L22–L29）** / **`resetRound`（L31–L43）** — POST `/api/bridge/reset-round`。
- **Function `selectedClientInfo`（L45–L48）** / **`promptText`（L50–L55）** / **`paintClients`（L57–L89）** — 无 prompt 则拼 CONNECT_LINE；配对码仅 `pair.code && bridgeRunning`。
- **Function `renderBrowser`（L91–L139）** — arena/chatgpt 走 `arenaConnect`；deepseek **不调 MCP**。
- **Function `arenaConnect`（L141–L170）** — 本机 `/mcp/${secret}` initialize/tools/list/resources/read，再 `ui.sendChat(..., { stayOnBridge:true })`。
- **Function `openSite`（L172–L190）**。
- **Function `startBridge`（L192–L208）** / **`stopBridge`（L210–L214）** / **`paintBridge`（L216–L259）** — POST start/stop；按 `s.tunnel.url` 显示隧道或「走当前页面源」；`bridgeAccount.loggedIn` 同步本地；文案「本机演示授权（不是 GitHub 登录）」。
- **Function `refreshStatus`（L261–L273）** — GET `/api/status`。

---

### 📄 文件名：`js/settings.js`

- **文件职责：** 自定义设置、API Provider 表、skills 列表。
- **Function `rowList`（L4–L7）** / **`paintCustom`（L9–L71）**。
- **Function `paintProviderTable`（L73–L111）** — radio 改 `activeModelId`。
- **Function `loadCustomizations`（L113–L117）** / **`saveCustom`（L119–L129）** — GET/PUT `/api/customizations`。
- **Function `loadSkills`（L131–L139）** — GET `/api/skills`。

---

### 📄 文件名：`js/bind.js`

- **文件职责：** 全部 DOM 事件。闭包内 `skillMarkdown` / `SKILL_TPL` / `fillSkillPreview` / `probeProvider`（不导出）。
- **Function `onClick(id, handler)`（L4–8）** — 节点不存在则跳过，避免 `null.onclick` 把整个 `boot` 打断。
- **Function `bind`（L10–L475）** — 活动栏、菜单、发送、Enter、Bridge、复制（extension-http toast 不同）、reset-secret、本机演示授权（POST `/api/bridge/login`，不是 GitHub）、各 `ui.saveCustom`、技能模板、环境/技术栈探测与保存（`onClick` 守卫）、probe/Add API（排除 modelId 匹配 video|image 当默认）、终端 `POST /api/tool/call` `run_command` mode code、搜索 `search_files` mode ask、Ctrl/Cmd+S。

---

### 📄 文件名：`styles.css`

- **文件职责：** 深色 VS Code 风布局。无 JS。
- **区块：**
  - L1–L24 `:root` 色板与尺寸（`--right:356px` 右侧栏宽）。
  - L25–L29 全局；`.hidden { display:none !important }`。
  - L31–L44 标题栏。
  - L46–L72 活动栏与侧栏文件树。
  - L74–L123 标签、编辑器、欢迎页。
  - L125–L166 内置浏览器与 Arena/generic 仿页。
  - L168–L177 终端面板。
  - L179–L277 右侧 CHAT 消息/工具卡/共识/composer。
  - L279–L291 BRIDGE 等待与统计。
  - L293–L297 状态栏。
  - L299–L352 设置模态与表单。
  - L354–L387 Bridge 药丸、URL 盒、隧道卡片。
  - L389–L424 菜单、toast、diff 色、下拉、客户端卡、ChatGPT 仿页、滚动条、`@media max-width 980px`。

---

### 📄 文件名：`favicon.svg`

- **文件职责：** 标签页图标。L1–L5 简单几何 SVG，无脚本。

---

## 3. 执行逻辑流

1. 浏览器 GET `/` → SPA 回退 `index.html` → `type=module` 加载 `/app.js` → import `js/*.js`。
2. `boot` 拉 `/api/status`、文件树、skills、customizations，尝试 Monaco。
3. 用户 CHAT → `sendChat` → NDJSON `/api/chat` → `handleEvent` 画卡。
4. 启动 Bridge → POST `/api/bridge/start`（cloudflare 会 `await startQuickTunnel`）→ toast `note` → `paintBridge` 按 `s.tunnel.url` 显示 Quick Tunnel 或「走当前页面源」。
5. 复制提示词读 `clients[].prompt`（hydrate 在服务端）。
6. `/ws` 把远程 MCP 工具调用画到 BRIDGE。
7. 「清除本轮统计」→ POST `/api/bridge/reset-round`（清 session 计数 + 读哈希缓存）并清空右侧 log。
8. 内置「打开 Arena」只是本机演示：先打本机 `/mcp`，再走 `/api/chat`。
