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
  - L3–L15：charset、viewport、title、favicon、`./styles.css`；html `data-theme`；head 脚本读 `localStorage webagent-theme`。
  - L17–L36 **标题栏 `#titlebar`：** 文件/编辑/选择/查看/转到/运行菜单（多数按钮无 JS）；`#menu-term` 终端、`#menu-help` 帮助；中间 `#window-title`；右侧 `#btn-theme` 浅色/深色（只换本页 CSS，不是 exe 皮肤）。
  - L39–L62 **活动栏 `#activitybar`：** `data-left=explorer|search` 有 JS；SCM/调试/扩展按钮无 handler；底栏 `#btn-account` 无登录实现、`#btn-manage` 打开管理菜单。
  - L64–L78 **左侧栏 `#sidebar`：** 默认 `collapsed`。`#left-explorer` 文件树；`#left-search` 搜索框。
  - L80–L181 **中间 `#center`：**
    - L73 `#tabs` 标签条。
    - L83–L135 `#welcome` 欢迎页：新建/打开文件/打开文件夹（后两个只点开资源管理器）；「连接到」「生成新工作区」无 handler；`#recent-list`；`#walk-basics` 打开设置；**「两条路」标题与两张卡**：`#walk-local-chat`（打开智能体窗口——本机 Chat 直接改工作区、vision 模型可看截图）、`#walk-bridge`（打开设置 Bridge 页——网页 AI 经 MCP、恒文本）；`#btn-agent-window`。
    - L136–L137 Monaco `#editor` 与 fallback textarea。
    - L138–L147 `#browser` 内置假浏览器（地址栏、`#browser-page`）。
    - L148–L164 `#agent-pane` 智能体窗口（独立输入框与 Ask/Plan/Code）。
    - L165–L168 `#diff-pane` 补丁对比。
    - L170–L180 `#panel` 终端，默认 hidden。
  - L183–L260 **右侧 `#rightbar`：**
    - L184–L187 CHAT / BRIDGE 页签。
    - L188–L221 `#right-chat`：流、Tasks、chips、`#chat-input`、`#btn-agent-pick`、隐藏 `#mode-select`、`#model-select`、`#think-select`、`#plan-badge`、`#btn-plan-merge`（总结）、发送。
    - L223–L259 `#right-bridge`：等待文案、任务、log、MCP session 卡（可折叠）。`#btn-stop-bridge-rb`、`#btn-bridge-health`、`#btn-reset-round`（按钮文案 Clear log，title 仍是「清除本轮统计」）、`#stat-calls` / `#stat-avg`（秒）/ `#stat-fail` / `#stat-ok`、`#sess-meta`、`#sess-foot`。
  - L263–L274 `#statusbar`：`#sb-bridge`；`#sb-ws` 默认 hidden，断线时由 `app.js` 写「事件流重连中」。
  - L276–L629 **`#modal` 设置：** 左侧 nav 多页（概述/环境/技术栈/智能体/技能/指令/提示/挂钩/MCP/Bridge/插件/API/Codex/**多模型博弈** `#page-multimodel`）。概述页顶部 `#two-paths`「两条路」区块：本机 Chat（模型在右侧对话框跑、能动工作区与 computer-use 脚本、vision 模型收得到截图、不用隧道）vs Bridge（模型是网页 AI、经 MCP 工具层、恒文本收不到截图、要公网地址）。**`#page-env` / `#page-stack` 有完整表单**。挂钩/插件/MCP 服务器名单/Voice/Dictation **标明不会执行或未实现**。Codex 页写「没有接 OpenAI Codex OAuth」，按钮 disabled。API Key 提示写 `.webagent/config.json`，不是钥匙串。API 页有 `#m-vision`「可看图（vision）」勾选：Add API 时写进模型记录，本机 Chat 据此决定截图发不发 `image_url`（computer-use）。`#page-multimodel`：启用、合并主模型、合并思考、合并时只读验证、每回合最大分支 2–8 默认 4。Bridge 页含客户端卡片、复制 URL/提示词、`#btn-copy-rules`（默认 hidden）、打开各站点、**本机演示授权**（`#btn-gh-login`，文案写不是 GitHub）以及 **GitHub 验证**（`#btn-gh-token` / `#btn-gh-device` / `#btn-gh-clear`）。隧道 radio：cloudflare 默认会拉 Quick Tunnel；**Named Tunnel** 填 `#named-domain` / `#named-token` 后启动会 `tunnel run --token`；**ngrok** 填 `#ngrok-domain`（可选）/ `#ngrok-token` 后启动会 `ngrok http`。`#btn-reset-secret` 在高级设置。
  - L631–L650 下拉：`#file-menu`、`#manage-menu`、`#agent-pick-menu`（Plan 文案「分支」）。
  - L630 `#toast`；L631 `<script type="module" src="./app.js">`（原生 ES module，无打包）。

跨模块调用走 `js/state.js` 的 `ui` 袋（避免 import 环），**不改** `/api` 与按钮行为。

---

### 📄 文件名：`app.js`

- **文件职责：** 工作台入口。import `js/*.js` 后 `boot`。120 行。
- **Function `setWsStatus`（L15–L25）** — 写 `#sb-ws`；有文案则去掉 hidden，空则藏起来。
- **Function `scheduleWsReconnect`（L27–L36）** — 已有 timer 则 return；状态栏「事件流重连中」；`setTimeout(connectWs, delay)`，delay 从 1s 倍增，`Math.min(..., WS_BACKOFF_MAX=30000)`。
- **Function `connectWs`（L38–L77）** — `ws(s)://location.host/ws`；已有 CONNECTING/OPEN 的 socket 则 return。`onopen` 把退避打回 1s 并清空状态栏。`command_output` → `ui.termLine`；`file_patched` → `ui.loadTree`；`todos_updated` → `ui.paintTodos`；`tool_call_end` → `ui.logBridgeTool`。**`ws.onclose` 调 `scheduleWsReconnect`**（服务端 30min idle / 1013 满员同样走这条）。constructor 抛错也重连。
- **Function `loadMonaco`（L79–L103）** — jsDelivr monaco 0.52.2；`window.monaco.editor.create`；onerror 或 7s 超时。
- **Function `boot`（L105–L118）** — `ui.bind`、默认 code、并行 refresh/tree/skills/custom/monaco、WS、welcome。L120 `boot().catch(console.error)`。

---

### 📄 文件名：`js/state.js`

- **文件职责：** `$` / `$$`、外链 `SITES`、共享 `state`、空对象 `ui`。无函数。L1–L35。
- **`state` 初值：** `mode:'code'`、`tabs` 仅 welcome、`stats`、`loggedIn:true`、`selectedClient:'arena'`、`stayOnBridge:false`、`planRound:null`。
- **`SITES`：** chatgpt/arena/deepseek/workbuddy/trae/qwen/manus/shunova 的外链。

---

### 📄 文件名：`js/dom.js`

- **文件职责：** toast / 转义 / 极简 markdown / 终端行 / 模态 / 右侧页签。
- **Function `applyTheme` / `initTheme`（L3–L16）** — `data-theme=light|dark` 写入 html 与 `localStorage webagent-theme`；按钮文案「浅色/深色」。
- **Function `toast`（L18–L24）** — 显示 2.2s。
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
- **Function `summarizeTool`（L36–L42）** / **`renderMsg`（L44–L94）** — user/status/tool/consensus（标题「多模型总结」；采纳则 `ui.setAgentMode('code')` 并 `ui.sendChat` 固定句）/assistant。
- **Function `pushMsg`（L96–L103）**。
- **Function `paintPlanComposer`（L105–L123）** — Plan 时显示 `分支 n/max`；`canMerge` 才显示总结钮。
- **Function `sendChat`（L125–L199）** — Ask/Code 空输入直接 return；Plan 空输入仅 `canBranch` 时当 `planAction:'branch'`；`planAction:'merge'` 不重打任务。POST `/api/chat` 带 `modelId`/`thinkLevel`/`planAction`。parse 失败 continue；finally `ui.refreshStatus` + `ui.loadTree`。
- **Function `handleEvent`（L201–L242）** — tool 可 `ui.logBridgeTool`；`planRound` 写入 `state.planRound`；message 可附分支徽章。
- **Function `paintTodos`（L244–L261）** / **`agentLabel`（L263–L266）** / **`setAgentMode`（L268–L275）** — 切模式后 `paintPlanComposer`。

---

### 📄 文件名：`js/bridge.js`

- **文件职责：** Bridge 启停、客户端卡、内置假浏览器。**不是云上 Arena。**
- **Function `logBridgeTool`（L11–L32）** / **`paintStats`（L34–L53）** / **`resetRound`（L55–L67）** — 统计用秒和一位小数成功率；meta 行写 Streamable HTTP / active / last tool。Clear log → POST `/api/bridge/reset-round`。
- **Function `selectedClientInfo`（L45–L48）** / **`promptText`（L50–L55）** / **`paintClients`（L57–L93）** — 无 prompt 则拼 CONNECT_LINE；选中 `extension-http` 且有 `rulesText` 时去掉 `#btn-copy-rules` 的 `hidden`；配对码仅 `pair.code && bridgeRunning`。
- **Function `renderBrowser`（L91–L139）** — arena/chatgpt 走 `arenaConnect`；deepseek **不调 MCP**。
- **Function `arenaConnect`（L141–L170）** — 本机 `/mcp/${secret}` initialize/tools/list/resources/read，再 `ui.sendChat(..., { stayOnBridge:true })`。
- **Function `openSite`（L172–L190）**。
- **Function `startBridge` / `stopBridge` / `paintBridge`** — POST start：named 时带 `#named-domain` / `#named-token`；ngrok 时带 `#ngrok-domain` / `#ngrok-token`；按 `s.tunnel.url` 与 `tunnelProvider` 显示 Quick Tunnel、Named Tunnel、ngrok 或「走当前页面源」；会话说明写成 Connected / Waiting / Stopped。
- **Function `checkBridgeHealth`** — GET `/health` + `/api/status`，结果写入 `#sess-meta`（Streamable HTTP 那一行），不 toast。`state.stats.healthLine` 直到下次工具调用 / 启停 Bridge / Clear log。不改磁盘。
- **Function `refreshStatus`** — GET `/api/status`；填 `#model-select`；同步 `state.planRound` 并 `ui.paintPlanComposer`；未触摸过的 `#think-select` 跟 `multiModel.thinkLevel`。

---

### 📄 文件名：`js/settings.js`

- **文件职责：** 自定义设置、API Provider 表、skills 列表。
- **Function `rowList`（L4–L7）** / **`paintCustom`（L9–L82）** — `#mm-merge` 用当前对话模型 + 已配置模型列表。`#codex-status` 恒写未实现，不读 `c.codex.loggedIn`。
- **Function `paintProviderTable`（L83–L123）** — radio 改 `activeModelId`；`m.vision` 且 caps 无 vision 时补一枚 `vision` pill。
- **Function `loadCustomizations`（L113–L117）** / **`saveCustom`（L119–L129）** — GET/PUT `/api/customizations`。
- **Function `loadSkills`（L131–L139）** — GET `/api/skills`。

---

### 📄 文件名：`js/bind.js`

- **文件职责：** 全部 DOM 事件。闭包内 `skillMarkdown` / `SKILL_TPL` / `fillSkillPreview` / `probeProvider`（不导出）。
- **Function `onClick(id, handler)`（L4–8）** — 节点不存在则跳过，避免 `null.onclick` 把整个 `boot` 打断。
- **Function `bind`（L10–L575）** — 先 `initTheme`；`#btn-theme` 切换浅/深；`#btn-sess-toggle` 折叠 MCP 卡；`#btn-bridge-health` 调 `checkBridgeHealth`。其余：活动栏、菜单、发送、`#btn-plan-merge`（`planAction:'merge'`）、`#model-select` onchange POST `/api/models` `{ activeModelId }`、`#think-select` 标记 touched、Enter、Bridge、复制 URL/提示词、`#btn-copy-rules`（复制 `rulesText`）、reset-secret、本机演示授权、**验证令牌** `/bridge/token`、设备码 `/bridge/device`+poll、清除 GitHub `/bridge/github/clear`、各 `ui.saveCustom`、技能模板、环境/技术栈、probe/Add API（手动 id 时 caps/context 空，不猜 1.3M；`#m-vision` 勾选或 caps 自带 vision → 记录 `vision:true`）、Codex 钮 toast「未实现，不会假装已登录」、保存多模型博弈（`maxBranches` 默认 4）、终端 `POST /api/tool/call` `run_command` mode code、搜索 `search_files` mode ask、Ctrl/Cmd+S、欢迎页两条路卡（`#walk-local-chat` 开智能体窗口、`#walk-bridge` 开设置 Bridge 页）。

---

### 📄 文件名：`styles.css`

- **文件职责：** 深色 VS Code 风布局。无 JS。
- **区块：**
  - L1–L27 `:root` 色板与尺寸（`--right:356px`；`--sess-*` 给 MCP 卡）。`html[data-theme=light]` 暖米色覆盖，对齐截图式会话卡，不是安装包主题引擎。
  - L25–L29 全局；`.hidden { display:none !important }`。
  - L31–L44 标题栏。
  - L46–L72 活动栏与侧栏文件树。
  - L74–L123 标签、编辑器、欢迎页。
  - L125–L166 内置浏览器与 Arena/generic 仿页。
  - L168–L177 终端面板。
  - L179–L277 右侧 CHAT 消息/工具卡/共识/composer。
  - L265–L290 BRIDGE 等待与 MCP session 卡（圆角、四格统计、可折叠）。
  - L450–L510 `html[data-theme=light]` 暖米色。
  - L293–L298 状态栏；`#sb-ws` 用 `--warn`。
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
4. 启动 Bridge → POST `/api/bridge/start`（cloudflare / Named / ngrok 分别 spawn）→ toast `note` → `paintBridge` 按 `s.tunnel.url` 显示对应隧道或「走当前页面源」。
5. 复制提示词读 `clients[].prompt`（hydrate 在服务端）。选中 Chat Plus / DeepSeek++ 时显示 `#btn-copy-rules`，复制 `clients[].rulesText`（`getPageRulesPrompt()`），贴进扩展系统提示词，不要贴进 MCP URL 框。
6. `/ws` 把远程 MCP 工具调用画到 BRIDGE。
7. 「Clear log / 清除本轮统计」→ POST `/api/bridge/reset-round`（清 session 计数 + 读哈希缓存）并清空右侧 log。Health 只探活。标题栏浅色/深色只改 CSS 变量。
8. 内置「打开 Arena」只是本机演示：先打本机 `/mcp`，再走 `/api/chat`。
