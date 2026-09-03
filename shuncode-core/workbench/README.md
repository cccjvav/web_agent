# workbench 模块说明书

当前处理目标：`shuncode-core/workbench/`

浏览器里的自绘工作台。静态文件由 `../agent-host/src/index.js` 用 `express.static` 挂出。本目录 **不直接 fs**；所有读写经 `/api/*` 与 `/ws`。

文件：`index.html`、`app.js`、`styles.css`、`favicon.svg`。

---

## 1. 模块概述

- **定位：** UI 组件壳（欢迎页、编辑器、CHAT、BRIDGE、设置模态）。真正改盘在 agent-host。
- **依赖的兄弟模块：** 运行时 HTTP 依赖 `agent-host` 的 `/api`、`/mcp`（仅内置演示 `arenaConnect`）、`/ws`。源码上不 require Node 模块。
- **谁调用：** 用户浏览器打开 `http://127.0.0.1:3000`。`run-shuncode-vscode` 跳过本目录（`SHUNCODE_SKIP_WORKBENCH=1`）。

---

## 2. 文件级详细说明书

### 📄 文件名：`index.html`

- **文件职责：** DOM 骨架。逻辑全在 `app.js`。
- **DOM 结构区块：**
  - L3–L8：charset、viewport、title、favicon、`/styles.css`。
  - L10–L27 **标题栏 `#titlebar`：** 文件/编辑/选择/查看/转到/运行菜单（多数按钮无 JS）；`#menu-term` 终端、`#menu-help` 帮助；中间 `#window-title`。
  - L29–L62 **活动栏 `#activitybar`：** `data-left=explorer|search` 有 JS；SCM/调试/扩展按钮无 handler；底栏 `#btn-account` 无登录实现、`#btn-manage` 打开管理菜单。
  - L64–L80 **左侧栏 `#sidebar`：** 默认 `collapsed`。`#left-explorer` 文件树；`#left-search` 搜索框。
  - L82–L178 **中间 `#center`：**
    - L83 `#tabs` 标签条。
    - L85–L123 `#welcome` 欢迎页：新建/打开文件/打开文件夹（后两个只点开资源管理器）；「连接到」「生成新工作区」无 handler；`#recent-list`；`#walk-basics` 打开设置；`#btn-agent-window`。
    - L124–L125 Monaco `#editor` 与 fallback textarea。
    - L126–L135 `#browser` 内置假浏览器（地址栏、`#browser-page`）。
    - L136–L155 `#agent-pane` 智能体窗口（独立输入框与 Ask/Plan/Code）。
    - L156–L159 `#diff-pane` 补丁对比。
    - L160–L177 `#panel` 终端，默认 hidden。
  - L180–L247 **右侧 `#rightbar`：**
    - L181–L184 CHAT / BRIDGE 页签。
    - L185–L216 `#right-chat`：流、Tasks、chips 快捷句、`#chat-input`、`#btn-agent-pick`、隐藏 `#mode-select`、`#model-select`、发送。
    - L217–L246 `#right-bridge`：等待文案、任务、log、MCP session 统计、Stop Bridge。
  - L249–L259 `#statusbar`。
  - L261–L512 **`#modal` 设置：** 左侧 nav 多页（概述/环境/技术栈/智能体/技能/指令/提示/挂钩/MCP/Bridge/插件/API/Codex/多模型）。L479–L511 Bridge 页含客户端卡片、复制 URL/提示词、打开各站点、GitHub 登录演示、隧道 radio（cloudflare 默认；named/ngrok 输入框 **无对应 JS 去 spawn**）。
  - L514–L534 下拉：`#file-menu`、`#manage-menu`、`#agent-pick-menu`。
  - L535–L536 `#toast`；L537 加载 `/app.js`。

---

### 📄 文件名：`app.js`

- **文件职责：** 全部交互。IIFE（L1–L1398）。
- **关键变量 `state`（L16–L32）：** `mode:'code'`、`status`、`messages`、`history`、`sending`、`tabs`（初始 welcome）、`activeTab`、`files`、`monaco`/`editor`、`dirty`、`stats`、`loggedIn:true`、`custom`、`stayOnBridge:false`、`selectedClient:'arena'`。
- **关键常量 `SITES`（L5–L14）：** chatgpt/arena/deepseek/workbuddy/trae/qwen/manus/shunova 的外链。
- **核心函数（行级）：**

  - L35–L41 `toast` — 显示 2.2s。
  - L43–L47 `escapeHtml` — 五字符。
  - L49–L59 `renderMd` — 先 escape 再极简 fence/inline/bold/标题/列表/`<br>`。
  - L61–L68 `termLine` — 终端追加。
  - L70–L79 模态开关与 `showPage`（nav-item / `.page` 的 hidden）。
  - L81–L86 `setRight` — chat/bridge 页签。
  - L88–L103 `paintTabs` — 点标题 activate，点 ✕ close。
  - L105–L119 `activateTab` — 按 kind 显示 welcome/browser/agent/diff/file。
  - L121–L126 `closeTab` — 只剩 1 个 tab 则 return。
  - L128–L137 `openAgentWindow` — 没有则加 agent tab，切右侧 chat。
  - L139–L160 `openDiff` / `paintDiff` — `+` 非 `+++` 绿，`-` 非 `---` 红，`@@` hunk。
  - L162–L167 `ensureWelcome`。
  - L169–L179 `openFile` — GET `/api/files/content`；`!ok` toast。
  - L181–L197 `langFor` / `applyEditor` — 有 monaco 则 setModel，否则 textarea。
  - L199–L246 `treeHtml` / `loadTree` — GET `/api/files/tree`；点目录折叠；点文件打开；recent 最多 6。
  - L248–L337 `emptyChat` / `paintChat` / `summarizeTool` / `renderMsg` — user/status/tool（点 header 显隐 pre）/consensus（采纳则切 code 并 sendChat 固定句）/assistant。
  - L339–L346 `pushMsg`。
  - L348–L396 `sendChat` — sending 则 return；可从两输入框取值；`stayOnBridge`；POST `/api/chat` 读 NDJSON；parse 失败 continue；finally refresh+loadTree。
  - L398–L432 `handleEvent` — tool 时可选 logBridgeTool；set_todos 画任务；run_command 进终端；apply_patch 刷新 tab 并 openDiff。
  - L434–L492 `logBridgeTool` / `paintTodos` / `agentLabel` / `setAgentMode` / `paintStats`。
  - L493–L537 `selectedClientInfo` / `promptText` / `paintClients` — 无 c.prompt 则拼 CONNECT_LINE；配对码仅 `pair.code && bridgeRunning`。
  - L539–L587 `renderBrowser` — arena/chatgpt 仿页发 `arenaConnect`；deepseek **不调 MCP**，展示商店与 mcpUrl；其它外链+prompt。
  - L589–L618 `arenaConnect` — 对本机 `/mcp/${secret}` 发 initialize/tools/list/resources/read；再 `sendChat(..., { stayOnBridge:true })`。**不是云上 Arena。**
  - L620–L638 `openSite` — bridge 未运行则 startBridge；try 复制 prompt；开 browser tab。
  - L640–L705 `startBridge` / `stopBridge` / `paintBridge` — POST start/stop；按 `s.tunnel.url` 显示隧道或「走当前页面源」。
  - L707–L719 `refreshStatus` — GET `/api/status`。
  - L721–L856 `paintCustom` / `paintProviderTable` / load/save customizations / `loadSkills`。
  - L858–L1320 `bind` — 活动栏、菜单、发送、Enter、Bridge、复制（extension-http toast 不同）、reset-secret、GitHub 登录演示、各 saveCustom、技能模板、probe/Add API（排除 modelId 匹配 video|image 当默认）、终端 `POST /api/tool/call` run_command mode code、搜索 search_files mode ask、Ctrl/Cmd+S。
    - L1002–L1018 闭包内 `skillMarkdown`；L1019–L1036 `SKILL_TPL`（fix-tests/review/release）；L1037–L1040 `fillSkillPreview` 在 dirty 时不覆盖。
    - L1182–L1188 `probeProvider`。
  - L1322–L1333 `saveActive` — 仅 file tab PUT content。
  - L1335–L1358 `connectWs` — `ws(s)://location.host/ws`；command_output / file_patched / todos_updated / tool_call_end。
  - L1360–L1384 `loadMonaco` — jsDelivr 0.52.2；onerror 或 7s 超时。
  - L1386–L1394 `boot` — bind、默认 code、并行 refresh/tree/skills/custom/monaco、WS、welcome。L1396 `boot().catch(console.error)`。

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

1. 浏览器 GET `/` → SPA 回退 `index.html` → 加载 css/js。
2. `boot` 拉 `/api/status`、文件树、skills、customizations，尝试 Monaco。
3. 用户 CHAT → `sendChat` → NDJSON `/api/chat` → `handleEvent` 画卡。
4. 启动 Bridge → POST `/api/bridge/start` → `paintBridge` 显示 mcpUrl（来自 status，不一定是 trycloudflare）。
5. 复制提示词读 `clients[].prompt`（hydrate 在服务端）。
6. `/ws` 把远程 MCP 工具调用画到 BRIDGE。
7. 内置「打开 Arena」只是本机演示：先打本机 `/mcp`，再走 `/api/chat`。
