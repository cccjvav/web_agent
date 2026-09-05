# agent 模块说明书

当前处理目标：`webagent-core/agent-host/src/agent/`

本目录实现 **本机 Chat**（`POST /api/chat`）。网页 Agent 走 MCP，**不进入本目录**。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 有 API Key 时跑 OpenAI 兼容工具循环；没有 Key 时跑内置探索（搜-读-可选补丁-测）。Plan 走多模型分支：有 Key 调对应模型，没 Key 写本机草案。
- **依赖：** `../tools`（`callTool`）、`../tools/planRound`、`../tools/consensusEngine`（`draftLocalBranch`/`mergeLocalBranches`）、`../models/store`、`../models/customizations`、`../models/profile`、`../tools/skills`、`../config`。
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
    - L311–L325 **`mode==='plan'`（仅当误入 builtin）：** emit 一段「请走 Plan 入口」摘要，**return**。真正的分支在 `runPlanRound`。
    - L327–L339 **`mode==='ask'`：** todos completed，emit summarizeAsk，return。
    - L341 起视为 **code**：有 writeIntent → write_file；有 patch → 从消息匹配文件或 `facts.files[0]`，read_files 取 hash 再 apply_patch；detectTestCommand 有则 run_command timeout 60；最后 emit 摘要（写明内置没有大模型）。
  - **Function `capturingEmit`（L354–L365）** — 吞掉 `message` 事件，其它转给外层 emit；`.captured()` 取文本。
  - **Function `pickModel`（L367–L374）** — 按 id，否则 `activeModelId`，否则第一项。
  - **Function `canCallModel`（L376–L378）** — 同时有 apiKey、baseUrl、modelId，且 `protocol !== 'builtin'`。
  - **Function `resolvePlanAction`（L380–L390）** — 显式 `planAction` 优先；`multiModel.enabled===false` → `single`；空消息且未合并的活回合 → `branch`；否则 `start`。
  - **Function `runPlanBranch`（L392–L430）** — 能调模型：`runOpenAI` mode plan，`simulated:false`。否则复用 `live.facts` 或 `explore`，`draftLocalBranch`，`simulated:true`。
  - **Function `addLiveBranch`（L432–L452）** — status「模型名 · 分支 n/max」后 `planRound.addBranch`。
  - **Function `emitRound`（L454–L467）** — emit `planRound` + 带 `branch` 元数据的 message。
  - **Function `runPlanRound`（L469–L570）**
    - `single`：一份草案，无回合。
    - `reset`：清空。
    - `merge`：<2 支 emit error；合并主模型 `auto`→active；能调则 `runOpenAI` 读各支原文（`mergeAllowsRead===false` 则 `allowTools:false`），`agreementRate:null`；否则 `mergeLocalBranches`。然后 `markMerged`、todos、emit consensus。
    - `branch` / `start`：start 空任务抛 `E_PLAN_NO_TASK`（catch 成 error 事件）。
  - **Function `runChat`（L572–L595）** — `send` 第二参或 `payload.emit`。`mode==='plan'` → `runPlanRound`。否则能调 `payload.modelId` 或 active 则 `runOpenAI`（失败改 builtin）；否则 `runBuiltin`。导出 `{ runChat, planRound }`。

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
  - **Function `temperatureFor(level)`（L57–L61）** — `low→0.1`，`medium→0.4`，其它 `0.7`。不盲发未知厂商字段。
  - **Function `runOpenAI({ mode, message, history=[], emit, model, thinkLevel, allowTools=true, extraSystem })`（L63–L170）**
    - L70–L71：baseUrl 去尾 `/`，空则抛。`emit` 缺省空函数。
    - L72–L85：`allowTools` 真才把 `getToolList(mode)` 转 function tools（Ask/Plan 列表无 apply_patch）。
    - L87–L95：system（可拼 extraSystem）+ history 最后 12 条 + 当前 user。
    - L97–L105：`temperature: temperatureFor(thinkLevel)`；有 tools 才带 `tool_choice:'auto'`。
    - L107–L169：最多 10 轮 POST `${base}/chat/completions`。
      - `!resp.ok` 抛 HTTP + 正文前 240。
      - JSON 失败抛。无 message 抛。
      - 有 tool_calls 最多 8 个；arguments parse 失败当 `{}`；try `callTool(name, args, mode)`，结果 `JSON.stringify.slice(0,12000)` 作为 role tool；catch 则 `ERROR: …`；然后 `continue`。
      - 无 tool_calls → emit message（空则「（无文本输出）」）并 **`return { text }`**。
    - 10 轮用尽 emit「已达到最大工具轮次。」并 `return { text }`。

---

### 📄 文件名：`providers.js`

- **文件职责：** 探测远程 `/models`，给工作台 Add API 用。
- **核心类/函数清单：**

  - **Function `normalizeBase`（L1–L6）** — trim，去尾 `/`，再去掉尾部 `/chat/completions`。
  - **Function `probeCaps(m)`（L8–L14）** — 只用接口字段 `capabilities` / `supported_features` / `caps`。都没有 → `[]`。**不**用模型 id 猜「视觉」。
  - **Function `probeContext(m)`（L16–L26）** — `context_length` / `context_window` / `max_model_len` / `contextSize`。数字 ≥1e6 → `nM`；≥1000 → `nK`；没有 → `''`。
  - **Function `listRemoteModels`（L28–L68）**
    - L29–L31：无 base / 无 key 抛中文错误。
    - L32–L40：GET `/models` Bearer；`!ok` 抛 HTTP + 正文前 200。
    - L42–L46：非 JSON 抛。
    - L47–L48：`data.data` 数组，否则 `data` 是数组，否则 `[]`；空则抛。
    - L49–L55：hostname 去 `api.` 取第一段当 group。
    - L56–L67：映射 id/name/group/`probeContext`/`probeCaps`/pricing。

---

## 3. 执行逻辑流

1. `routes.js` `POST /chat` 打开 NDJSON，调用 `runChat({ mode, message, history, modelId, thinkLevel, planAction, emit })`（emit 在对象里）。
2. `runChat` 取出 `send`。`mode==='plan'` → `runPlanRound`（分支/总结）。
3. 否则能调所选模型 → `openai.runOpenAI`（返回 `{ text }`）；失败改 builtin。
4. 无 Key → `runBuiltin`：explore 只读 → Ask 摘要 / Code 解析消息里的补丁或围栏再测。
5. 每步 `timedTool`/`emit('tool')` 被工作台或 VS Code 插件画成工具卡。Plan 另发 `planRound` / 满 2 支才 `consensus`。
