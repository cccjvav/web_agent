# agent 模块说明书

## 第六批：请求取消与PTY生命周期

模型HTTP及响应body最多120秒，服从当前Chat请求AbortSignal。普通工具执行前检查取消；取消不是切换模型或继续内置执行的理由。


## 2026-09-11当前整改语义

模型调用失败/所选非builtin模型配置不完整时停止，不自动调用内置写入；内置写入/补丁失败停止。工具业务ok:false/success:false也计失败。每轮最多执行8项，但对全部tool_call id返回结果或限额错误。Plan分支提交前核对原round对象，总结还核对分支数，拒绝过期结果。


当前处理目标：`webagent-core/agent-host/src/agent/`

本目录实现 **本机 Chat**（`POST /api/chat`）。网页 Agent 走 MCP，**不进入本目录**。无 `.json` / `.html`。文件：`runChat.js`、`openai.js`、`computerUse.js`、`providers.js`、`toolLabel.js`。

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

  - **Function `flattenDir`（L12–L18）** — 递归摊平 `items`（含 children）到数组。
  - **Function `timedTool`（L20–L50）**
    - 输入：`emit`、`mode`、工具名、args。
    - try `callTool` 成功 emit `tool` ok true；catch emit ok false，**不把异常抛出**。返回 `{ ok, result|error, durationMs }`。
  - **Function `keywordsFrom`（L52–L63）** — 按空白与中文标点切词，去掉停用词，长度≥2，最多 6 个。
  - **Function `pickExisting`（L65–L73）** — 工作区存在且是文件的相对路径。
  - **Function `detectTestCommand`（L75–L87）**
    - 先用 `resolveTechStack(loadCustom()).testCommand`（探测层已按 pnpm/yarn/npm 拼 `test`）。
    - 没有声明且存在 `tests/` 目录 → `{ cmd: (packageManager 或 npm) + ' test', kind:'guess' }`。
    - 都没有 → `null`。
  - **Function `extractPatch`（L89–L92）** — 第一段 `<<<<<<< SEARCH`…`>>>>>>> REPLACE`，没有则 null。
  - **Function `extractWriteIntent`（L94–L99）** — 同时有代码围栏和「写入|创建|write|create + 带扩展名路径」才返回 `{ filePath, content }`。
  - **Function `clip`（L101–L104）** / **`stripLineNumbers`（L106–L111）** — 去掉 `^\d+:\s?`。
  - **Function `explore`（L113–L178）** — **只读**：list_directory maxDepth 3 → git_status → find_files max 100 → 有 keyword 则 search_files（前 3 词 `|` 拼接、isRegex）→ 读 README/package 等最多 6 个。填 facts.files/readme/pkg/testCmd。不写文件。
  - **Function `summarizeAsk`（L180–L200）** — markdown 摘要，声明只读 Ask。
  - **Function `runBuiltin`（L202–L305）**
    - mode 默认 `ask`。先 set_todos 三条，再 `facts = explore(...)`。
    - **`mode==='plan'`（仅当误入 builtin）：** emit 一段「请走 Plan 入口」摘要，**return**。真正的分支在 `runPlanRound`。
    - **`mode==='ask'`：** todos completed，emit summarizeAsk，return。
    - 否则视为 **code**：有 writeIntent → write_file；有 patch → 从消息匹配文件或 `facts.files[0]`，read_files 取 hash 再 apply_patch；detectTestCommand 有则 run_command timeout 60；最后 emit 摘要（写明内置没有大模型）。
  - **Function `capturingEmit`（L307–L318）** — 吞掉 `message` 事件，其它转给外层 emit；`.captured()` 取文本。
  - **Function `pickModel`（L320–L327）** — 按 id，否则 `activeModelId`，否则第一项。
  - **Function `canCallModel`（L329–L331）** — 同时有 apiKey、baseUrl、modelId，且 `protocol !== 'builtin'`。
  - **Function `resolvePlanAction`（L333–L343）** — 显式 `planAction` 优先；`multiModel.enabled===false` → `single`；空消息且未合并的活回合 → `branch`；否则 `start`。
  - **Function `runPlanBranch`（L345–L383）** — 能调模型：`runOpenAI` mode plan，`simulated:false`。否则复用 `live.facts` 或 `explore`，`draftLocalBranch`，`simulated:true`。
  - **Function `addLiveBranch`（L385–L405）** — status「模型名 · 分支 n/max」后 `planRound.addBranch`。
  - **Function `emitRound`（L407–L420）** — emit `planRound` + 带 `branch` 元数据的 message。
  - **Function `runPlanRound`（L422–L523）**
    - `single`：一份草案，无回合。
    - `reset`：清空。
    - `merge`：<2 支 emit error；合并主模型 `auto`→active；能调则 `runOpenAI` 读各支原文（`mergeAllowsRead===false` 则 `allowTools:false`），`agreementRate:null`；否则 `mergeLocalBranches`。然后 `markMerged`、todos、emit consensus。
    - `branch` / `start`：start 空任务抛 `E_PLAN_NO_TASK`（catch 成 error 事件）。
  - **Function `runChat`（L525–L548）** — `send` 第二参或 `payload.emit`。`mode==='plan'` → `runPlanRound`。否则能调 `payload.modelId` 或 active 则 `runOpenAI`（失败改 builtin）；否则 `runBuiltin`。导出 `{ runChat, planRound }`。

- **关键变量：** L8 `SKIP_DIRS` = node_modules/.git/.cache/dist/build/.local/bin。

---

### 📄 文件名：`toolLabel.js`

- **文件职责：** 给工作台 / VS Code 侧栏的短标签。`runChat.js` 与 `openai.js` **共用**这一份。
- **Function `toolLabel(name, result, ok)`** — 失败时 list/read 给固定英文。成功：list → `Explored dirPath`；find_files → `Found N files`；search_files → `Found N matches`；read / command / Patched / git status / Tasks / `load_skill` → `Skill name` 或 `Skills N`。未知名原样返回。

---

### 📄 文件名：`openai.js`

- **文件职责：** OpenAI 兼容 `/chat/completions` 工具循环，最多 10 步。本机 Chat 的「眼睛」在这里把截图附成 `image_url`（**MCP 不走本文件**）。
- **核心类/函数清单：**

  - **Function `modelSeesImages(model)`（L11–L18）** — `model.vision === true` 或 `caps`/`capabilities` 数组含 `vision`（大小写不敏感）→ 会看图。探测不到的纯文本 Endpoint 一律按不会看图处理（诚实拒绝，不假装 OCR）。
  - **Function `systemPrompt(mode)`（L20–L53）**
    - code 允许 patch/命令；否则 READ-ONLY。
    - follow-user / en / 默认中文。
    - 拼工作区根、循环规则、Windows PowerShell 提示、plan 不改仓库、custom.instructions、`formatWorkspaceContext`。
  - **Function `temperatureFor(level)`（L55–L59）** — `low→0.1`，`medium→0.4`，其它 `0.7`。不盲发未知厂商字段。
  - **Function `runOpenAI({ mode, message, history=[], emit, model, thinkLevel, allowTools=true, extraSystem })`（L61–L197）**
    - L72–L73：baseUrl 去尾 `/`，空则抛。`emit` 缺省空函数。
    - L74–L83：`allowTools` 真才把 `getToolList(mode)` 转 function tools（Ask/Plan 列表无 apply_patch）。
    - L85–L93：system（可拼 extraSystem）+ history 最后 12 条 + 当前 user。
    - L95–L103：`temperature: temperatureFor(thinkLevel)`；有 tools 才带 `tool_choice:'auto'`。
    - L105–L193：最多 10 轮 POST `${base}/chat/completions`。
      - `!resp.ok` 抛 HTTP + 正文前 240。JSON 失败抛。无 message 抛。
      - 每轮最多执行8个tool_calls，超额ID仍返回明确未执行结果以保持协议完整；`callTool`结果经clipJson软预算后序列化为完整JSON，业务失败/异常明确反馈，不自动切模型重放修改。
      - **「眼睛」（L152–L178）**：`run_command` 成功后 `computerUse.collectShot` 认截图（命令 `-Out` / stdout）——`tooBig` 则注入「降 Quality 重截」提示；`modelSeesImages` 真则追加一条 `role:'user'` 多模态消息（text + `image_url` data URL）并 send status（**只带路径不带 base64**）；假则注入 `[系统提示]` 要求模型**如实转告**「当前模型不会看图」并 send status。文本通道采用12000字符软预算并保持JSON完整，图仍走image部分。
      - 然后 `continue`；无 tool_calls → emit message（空则「（无文本输出）」）并 **`return { text }`**。
    - 10 轮用尽 emit「已达到最大工具轮次。」并 `return { text }`。
  - 导出 `{ runOpenAI, systemPrompt, temperatureFor, modelSeesImages }`。

---

### 📄 文件名：`computerUse.js`

- **文件职责：** 「眼睛」的公共实现：认出 `run_command` 产生的截图文件、读成 data URL。两个消费方：本机 Chat `openai.js`（data URL 作 `image_url` 附给 **vision** 模型）与 Bridge `mcp/server.js`（**第三阶段，用户 2026-09-07 书面同意**：截图以 `type:'image'` 内容回给网页 Agent；mcpProtocol/chatVision 测试锁）。base64 不经 eventBus 广播的边界不变。
- **核心类/函数清单：**

  - **`COMPUTER_USE_DIR`（L16）** — 仓库根 `computer-use/`（与 `skills.js bundledSkills()` 同一位置）。**`MAX_BYTES`（L18）** — 单图上限 6MB。
  - **Function `findShotCandidates({command,stdout})`（L28–L41）** — 认三种来源：`-Out <路径>`（带/不带引号）、stdout JSON 的 `"out":"….png"`、stdout 裸 `*.png|jpg|jpeg` token。
  - **Function `resolveShotPath(raw, roots)`（L55–L66）** — 相对路径按工作区解析；`realpathSync` 后**白名单**：仅工作区内或 `computer-use/` 内收（symlink 逃逸同拒）；仅图片扩展名。`roots={workspaceRoot,cuDir}` 可注入（测试用）。
  - **Function `readShotAsDataUrl(abs)`（L68–L80）** — 读文件转 `data:image/png;base64,…`；空/超限/不可读 → null。
  - **Function `collectShot(input, roots)`（L82–L99）** — 主入口：遍历候选取第一张可附加的 `{abs,rel,dataUrl,bytes,mime}`；超限 `{tooBig,rel,bytes}`；没有 null。
- **关键边界：** base64 只进模型请求体，**不经 eventBus 广播**；不开任意盘符读文件（架构导读 第 12 节沙箱取舍不变）。

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

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [computerUse.js](computerUse.js) | 7 个函数/类节点 |
| [openai.js](openai.js) | 11 个函数/类节点 |
| [providers.js](providers.js) | 6 个函数/类节点 |
| [runChat.js](runChat.js) | 34 个函数/类节点 |
| [toolLabel.js](toolLabel.js) | 1 个函数/类节点 |
<!-- docs-inventory:end -->
