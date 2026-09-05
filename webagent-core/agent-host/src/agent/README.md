# agent 模块说明书

当前处理目标：`webagent-core/agent-host/src/agent/`

本目录实现 **本机 Chat**（`POST /api/chat`）。网页 Agent 走 MCP，**不进入本目录**。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 有 API Key 时跑 OpenAI 兼容工具循环；没有 Key 时跑内置探索（搜-读-可选补丁-测）。
- **依赖：** `../tools`（`callTool`/`getToolList`/`runMultiModelConsensus`）、`../models/store`、`../models/customizations`、`../models/profile`、`../tools/skills`、`../config`。
- **谁调用：** 仅 `../api/routes.js` 的 `POST /chat`（以及测试）。VS Code 插件也打同一条 `/api/chat`，因此间接经过本目录。

---

## 2. 文件级详细说明书

### 📄 文件名：`runChat.js`

- **文件职责：** Chat 入口。决定 builtin vs OpenAI；内置路径实现 Ask/Plan/Code。
- **核心类/函数清单：**

  - **Function `flattenDir`（L10–L16）** — 递归摊平 `items`（含 children）到数组。
  - **Function `countFiles`（L18–L20）** — 其中 `type==='file'` 的个数。
  - **Function `toolLabel`（L22–L52）** — 给 UI 的短标签。失败时 list/read 给固定英文。成功时按工具名拼 Explored / Found N / Read path / command / Patched。
  - **Function `timedTool`（L54–L84）**
    - 输入：`emit`、`mode`、工具名、args。
    - try `callTool` 成功 emit `tool` ok true；catch emit ok false，**不把异常抛出**。返回 `{ ok, result|error, durationMs }`。
  - **Function `keywordsFrom`（L86–L97）** — 按空白与中文标点切词，去掉停用词，长度≥2，最多 6 个。
  - **Function `pickExisting`（L99–L107）** — 工作区存在且是文件的相对路径。
  - **Function `detectTestCommand`（L109–L133）**
    - L114–L115：先用 `resolveTechStack(loadCustom()).testCommand`。
    - L117–L124：有 package.json `scripts.test` → `{ cmd:'npm test', kind:'npm' }`（**写死 npm**）。
    - L125–L128：pytest / cargo / go 清单文件。
    - L129–L130：存在 `tests/` 目录 → `{ cmd:'npm test', kind:'guess' }`。
    - L131：都没有 → `null`。
  - **Function `extractPatch`（L135–L138）** — 第一段 `<<<<<<< SEARCH`…`>>>>>>> REPLACE`，没有则 null。
  - **Function `extractWriteIntent`（L140–L145）** — 同时有代码围栏和「写入|创建|write|create + 带扩展名路径」才返回 `{ filePath, content }`。
  - **Function `clip`（L147–L150）** / **`stripLineNumbers`（L152–L157）** — 去掉 `^\d+:\s?`。
  - **Function `explore`（L159–L224）** — **只读**：list_directory maxDepth 3 → git_status → find_files max 100 → 有 keyword 则 search_files（前 3 词 `|` 拼接、isRegex）→ 读 README/package 等最多 6 个。填 facts.files/readme/pkg/testCmd。不写文件。
  - **Function `summarizeAsk`（L226–L246）** — markdown 摘要，声明只读 Ask。
  - **Function `runBuiltin`（L248–L375）**
    - L249–L250：mode 默认 `ask`。
    - L252–L260：set_todos 三条。
    - L262–L263：`facts = explore(...)`。
    - L265–L277：更新 todos。
    - L279–L311 **`mode==='plan'`：** `multiModel.enabled === false` → emit 未开博弈文本并 **return**；否则 `runMultiModelConsensus`，写 todos，emit consensus + message，return。
    - L313–L325 **`mode==='ask'`：** todos completed，emit summarizeAsk，return。
    - L327 起视为 **code**：有 writeIntent → write_file；有 patch → 从消息匹配文件或 `facts.files[0]`，read_files 取 hash 再 apply_patch；detectTestCommand 有则 run_command timeout 60；最后 emit 摘要（写明内置没有大模型）。
  - **Function `runChat`（L377–L385）** — `emit` 可以是第二参，也可以是 `payload.emit`（HTTP `POST /api/chat` 把函数放进对象里）。`store.load()` 找 active 模型；**若** `apiKey && baseUrl && modelId` 都真 → `runOpenAI({ ...payload, emit: send })`；**否则** `runBuiltin(payload, send)`。两种调用都要把 `send` 传下去，否则工作台收不到 tool/message。

- **关键变量：** L8 `SKIP_DIRS` = node_modules/.git/.cache/dist/build/.local/bin。

---

### 📄 文件名：`openai.js`

- **文件职责：** OpenAI 兼容 `/chat/completions` 工具循环，最多 10 步。
- **核心类/函数清单：**

  - **Function `toolLabel`（L7–L20）** — 与 runChat 类似的短标签。
  - **Function `systemPrompt(mode)`（L22–L55）**
    - L23–L26：code 允许 patch/命令；否则 READ-ONLY。
    - L30–L34：follow-user / en / 默认中文。
    - L35–L53：拼工作区根、循环规则、Windows PowerShell 提示、plan 不改仓库、custom.instructions、`formatWorkspaceContext`。
  - **Function `runOpenAI({ mode, message, history=[], emit, model })`（L57–L144）**
    - L58–L59：baseUrl 去尾 `/`，空则抛。
    - L60–L68：`getToolList(mode)` 转 function tools（Ask 列表无 apply_patch）。
    - L70–L77：system + history 中 user/assistant 且有 content 的最后 12 条 + 当前 user。
    - L79–L141：最多 10 轮 POST `${base}/chat/completions`，`tool_choice:'auto'`，`temperature:0.2`。
      - L91–L93：`!resp.ok` 抛 HTTP + 正文前 240。
      - L96–L98：JSON 失败抛。
      - L100：无 message 抛。
      - L103–L133：有 tool_calls 最多 8 个；arguments parse 失败当 `{}`；try `callTool(name, args, mode)`，结果 `JSON.stringify.slice(0,12000)` 作为 role tool；catch 则 `ERROR: …`；然后 `continue`。
      - L136–L137：无 tool_calls → emit message（空则「（无文本输出）」）并 return。
    - L143：10 轮用尽 emit「已达到最大工具轮次。」

---

### 📄 文件名：`providers.js`

- **文件职责：** 探测远程 `/models`，给工作台 Add API 用。
- **核心类/函数清单：**

  - **Function `normalizeBase`（L1–L6）** — trim，去尾 `/`，再去掉尾部 `/chat/completions`。
  - **Function `guessCaps`（L8–L14）** — 恒含 `'工具'`；vision|image|gpt-4o|flash|pro 加视觉；video 加视频。
  - **Function `guessContext`（L16–L21）** — video|image → 1.3M；mini|haiku|lite → 128K；否则 1.3M。
  - **Function `listRemoteModels`（L23–L63）**
    - L24–L26：无 base / 无 key 抛中文错误。
    - L27–L35：GET `/models` Bearer；`!ok` 抛 HTTP + 正文前 200。
    - L37–L41：非 JSON 抛。
    - L42–L43：`data.data` 数组，否则 `data` 是数组，否则 `[]`；空则抛。
    - L44–L50：hostname 去 `api.` 取第一段当 group。
    - L51–L62：映射 id/name/group/contextSize/caps/pricing。

---

## 3. 执行逻辑流

1. `routes.js` `POST /chat` 打开 NDJSON，调用 `runChat({ mode, message, history, emit })`（emit 在对象里）。
2. `runChat` 取出 `send = 第二参或 payload.emit`，看 store 里当前模型是否同时有 Key、Endpoint、modelId。
3. 有 → `openai.runOpenAI`：systemPrompt（含 mode 锁）→ 最多 10 次 completions → 每次 tool_calls 进 `callTool(..., mode)`。
4. 无 → `runBuiltin`：explore 只读 → Ask 摘要 / Plan 进 consensusEngine（或关闭时跳过）/ Code 解析消息里的补丁或围栏再测。
5. 每步 `timedTool`/`emit('tool')` 被工作台或 VS Code 插件画成工具卡。
