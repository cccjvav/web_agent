# Web Agent 全量复审与优化建议报告（2026-09-29）

**基线：** 会话分支 `arena/01a0e8e7-web-agent`，已快进同步到 `origin/arena/01a0d084-web-agent` 的 `83ce419`（含 F91–F94），工作树干净。
**审查者：** Arena.ai Agent Mode（本会话）。
**性质：** 只读复审 + 优化建议。报告成文时未改动任何产品代码；随后的修复按批次记录在文末第 8 节“修复进度”与阶段日志（报告本身登记为第 97 组，修复从第 98 组起），成文后的深审新发现追加在第 9 节。上游在报告成文后前进到 `049d6a6`（F95，读取缓存按调用者归属）与 `c20c413`（F96，人提交的工作流/直接工具调用不算本机 Chat 读过），这两项改动不在本报告的审查范围内。
**读法：** 第 3 节是按严重度排列的缺陷（P1 > P2 > P3），第 4 节是优化建议（UI/排版、功能、工程），第 5 节是文档与代码一致性核对，第 6 节是暂停模块的结果，第 7 节是覆盖清单与未覆盖边界。每条都写了文件:行号，便于直接跳转核对。

---

## 0. 结论摘要

| 维度 | 结论 |
|---|---|
| 基线健康度 | `npm run lint` 通过；`npm test` 116 个测试文件全部通过（退出码 0）；`node docs-site/check-docs.js` 无漂移；`npm audit`（生产与开发依赖）0 漏洞；`npm outdated` 仅 `ws` 8.21.3→8.22.0 补丁级。 |
| 安全 | 未发现可被远程（隧道侧）利用的新缺陷；控制面（loopback + Host + Origin）、MCP 会话/OAuth、补丁路径、PTY 策略、危险命令策略、exec 环境清洗都经过了多轮审计并且实现质量高。本轮新提出的安全事项集中在**本机供应链面**（工作台从 jsDelivr 无 SRI 加载 Monaco，见 P1-1）和**危险命令词法检测的剩余绕过**（P2-1）。 |
| 功能 | 主链路（Chat/Code/Plan、工具、Bridge、审批队列、检查点/回退）实现完整、边界严格。成文时最大的体验缺口是**模型输出不是流式**（P2-2）：一次 chat/completions 最长等 120 秒才看到第一段文字——第 5 批（第 102 组）已修：`stream:true` + NDJSON `delta` 事件，三个客户端逐字显示，`message` 仍是每轮权威全文（见第 8 节、第 9.5 节）。 |
| UI/排版 | 工作台 106 处 `font-size` 声明中 69 处落在 12px（`--fs-xs` 与 `--fs-sm` 都是 0.75rem），中文正文偏小；三栏为固定像素宽、无拖拽分隔条、700–980px 区间编辑器可压到 <100px；`lang="zh-CN"` 页面里 Bridge 面板/菜单仍有十余处英文；VS Code 扩展 Webview 硬编码深色配色与 10–12px 字号、不跟随 VS Code 主题与字号。 |
| 文档 | 抽样与自动比对（路由、错误码、环境变量、工具数、路径引用）未发现现行文档与代码的实质冲突；仅发现工作台 UI 内一段陈旧提示文案（P2-6）与两处错别字。文档体系（`check-docs.js` + 目录 README + 详解）维护得比大多数同规模项目好。 |
| 仓库/工程 | 生成物 `docs-site/content.js`（5.3 MiB）、`documentation-manifest.json`（1.6 MiB）、`source-index.md`（0.9 MiB）入库，每次源码改动都会重写，历史膨胀明显；`review/shuncode-ui/` 26 张截图 13 MB。 |

**建议优先处理顺序：** P1-1（Monaco 自托管/SRI）→ P2-2（流式输出）→ P2-1（危险命令补充规则）→ UI 字号与三栏布局（4.1）→ 文案一致性（P2-6、4.1.3）。（进度见第 8 节：截至第 7 批，P1-1、P2-1、P2-2、P2-3、P2-4、P2-5、P2-6、P2-7、P2-8 已修。）

---

## 1. 范围与方法

### 1.1 用户要求
1. 先同步到最新分支 `01a0d084`。
2. 对**所有**实现做全面审查：全部语言的代码（js/mjs/py/html/css/cmd/ps1/cs/iss/yml）、全部文档（文档链接真实代码，须核对是否随代码更新）、以及一切可见/可获取/可推断的内容。
3. 给出所有维度的优化建议：UI（字号是否合适、排版是否合理）+ 功能实现。
4. 汇总成一份报告并提供下载。

### 1.2 实际执行
- **同步：** `git fetch` 后 `git merge --ff-only origin/arena/01a0d084-web-agent`，HEAD=`83ce419`，与 `ce495ed` 的差异为 F91–F94 四个提交（设置页核对主机文件夹、appWindow 身份复核、ESLint 进 CI、`/ws` 资源边界）。
- **基线验证（实测）：** `npm ci --include=dev` → `npm run lint`（退出 0）→ `npm test`（116 文件全部通过）→ `node docs-site/check-docs.js`（`updated:0`）→ `npm audit`（0）。
- **代码阅读（静态）：** 主机 `src/index.js`、`config.js`、`api/routes.js`（全文 1071 行）、`tools/index.js`、`tools/dangerous.js`、`tools/executor.js`（全文）、`agent/openai.js`（全文）、`agent/runChat.js`（关键段）、`mcp/server.js`（前 150 行）、`utils/{lifeline,localControl,probeBridge}.js`、`tools/patchEngine.js`（路径解析段）、`tools/gitOps.js`（spawn 段）；工作台 `index.html`（全文 777 行）、`styles.css`（全文 641 行）、`app.js`、`js/{api,state,dom,chat,monaco,tabs}.js`（全文）、`js/{bind,bridge,settings,operations}.js`（按 innerHTML/轮询/字号等模式定向阅读）、`settings-panel.{css,js}`；扩展 `package.json`、`extension.js`（请求层、两个 Webview 的 HTML/CSS）、`ptyPolicy.js`、`dangerousPolicy.js`（全文）；`scripts/ensure-code-server.js`、`installer/launch.js`、`admin-host/app.js`、`docs-site/{serve,check-docs,app}.js`、`docs-site/{index.html,styles.css}`；CI `test.yml`、`eslint.config.js`。
- **动态探针（实测）：** 对 `extension/dangerousPolicy.isDangerousCommand` 注入约 75 条命令观察判定（结果见 P2-1）；用 Node 加载 `tools/index.js` 统计工具数（40 个，其中 1 个隐藏）；对三个暂停探针目录用与主配置同规则的临时 ESLint 配置跑了一遍（未写入仓库）；对 18 个 `.py` 跑 `py_compile` 与 `pyflakes`。
- **文档一致性（半自动）：** 路由表（代码 65 个 `router.*` vs `路由逐项详解.md`）、错误码（代码 60 个 `E_*` vs 文档 52 个）、环境变量（代码 37 个 vs 文档 39 个）、工具数（40/39）、文档中反引号路径的存在性（排除 archive/repro 后 52 个"缺失"逐一判读，均为运行时文件或示例名）。

### 1.3 未覆盖或只做抽样（如实说明）
- 未在真实 Windows/桌面 VS Code/隧道环境实机运行（沙箱为 Linux，无 Chromium，Playwright 浏览器测试仅由 CI 验证）。
- `mcp/oauth.js`（647 行）、`mcp/session.js`、`tools/fileOps.js`、`models/store.js`、`tunnel/*`、`extension/hostManager.js`、`ptyHost.js`、`installer/appWindow.js`、`computer-use/win/*.ps1/.cs` 只读了与本轮发现相关的片段；这些模块在 F70–F94 已有多轮红测记录，本轮不重复认证。
- 109 份 Markdown 中，用户手册与开发文档读了主干（README、使用指南、路由/工具/命令策略详解、CONTEXT、阶段 10 当前段），其余以自动比对为主；未逐句核对每一份"详解"。
- 三个探针模块按项目约定是"暂停"状态；本轮按用户要求读了代码并跑了静态检查，但**不**据此认证其功能或对 arena.ai 的合规性。

---

## 2. 基线验证记录

| 项目 | 命令 | 结果 |
|---|---|---|
| 依赖安装 | `cd webagent-core/agent-host && npm ci --include=dev` | 152 个包，无错误 |
| Lint | `npm run lint` | 退出 0 |
| 单元/集成测试 | `npm test` | 116 个测试文件全部通过，退出 0（日志 `/tmp/test-output.log`，沙箱内） |
| 文档结构漂移 | `node docs-site/check-docs.js` | `{"files":…, "updated":0}`，无漂移 |
| 依赖漏洞 | `npm audit` / `npm audit --omit=dev` | 0 vulnerabilities |
| 依赖新旧 | `npm outdated` | 仅 `ws` 8.21.3 → 8.22.0 |
| 扩展字节副本 | `diff -rq extension extensions-installed/webagent.webagent-core-0.7.2` | 仅 `README.md` 不在副本（测试有意排除），其余一致 |
| 版本号 | `agent-host/package.json`、`extension/package.json`、`webagent.iss`（`{#AppVer}`） | 0.7.2 一致 |
| Python 语法 | `python3 -m py_compile` ×18 | 全部通过 |

---

## 3. 缺陷与风险（按严重度）

严重度定义：**P1** = 存在真实攻击面或会导致数据/行为错误，应尽快处理；**P2** = 明显影响可用性/正确性或有条件的安全影响；**P3** = 一致性、可读性、健壮性小问题。

### P1

#### P1-1 工作台从公网 CDN 加载 Monaco，无 SRI、无 `script-src` CSP，且该页面拥有本机全部 API 权限
- **位置：** `webagent-core/workbench/js/monaco.js:15,19`（`https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js` 及 `paths.vs`）；`src/index.js` 的安全头里没有 `script-src`（此前审计记录：无脚本 CSP，因内联脚本与 CDN）。
- **现象：** 页面在 `127.0.0.1:3000` 上通过 `<script>` 动态加载 CDN 脚本，且 AMD loader 之后再加载数十个子模块，没有 `integrity` 属性。工作台 JS 可以调用 `/api/tool/call`、`/api/files/content`（写文件）、`/api/chat`（Code 模式跑命令）。
- **影响：** 若 CDN/DNS/代理链路被投毒，或用户在企业代理下被注入，攻击者获得的是**本机开发者权限的代码执行**（通过 `run_command`）。这是当前整个控制面模型里唯一一条把外部内容当可执行代码引入本机特权页面的路径；其他部分（Host/Origin 门禁、`/ws` 只收不发、扩展 Webview `connect-src 'none'`）都已经做得很严。
- **建议：** ① 把 `monaco-editor` 作为 agent-host 依赖自托管（`express.static` 提供 `node_modules/monaco-editor/min`），同时解决离线场景（现在断网时 7 秒后退化到纯文本框）；② 若坚持 CDN，至少对 `loader.js` 加 `integrity`+`crossorigin`，并为工作台加 `Content-Security-Policy: script-src 'self' 'nonce-…' https://cdn.jsdelivr.net`（内联脚本改 nonce）；③ 在 `SECURITY.md` 的"网络"段写明这一依赖。
- **证据类型：** 静态阅读 + 现有审计记录（无 CSP）。

### P2

#### P2-1 危险命令词法检测的剩余绕过（实测）
- **位置：** `webagent-core/extension/dangerousPolicy.js`（461 行，与 `agent-host/src/tools/dangerous.js` 同源策略）。
- **方法：** 用 `node -e` 直接调用 `isDangerousCommand`，输入约 75 条命令。
- **已正确拦截（示例）：** `rm -r*`、`xargs rm`、`\rm`、`git checkout -- .`、`git restore .`、`git reset --hard`、`git clean -f`、`git push`（含 `--force`）、`git stash drop`、`git filter-branch`、`find … -delete`、`truncate`/`: > f`、`dd`、`mkfs`、`chmod -R /`、`kill -9 -1`、`npm publish`、`reg add`、`schtasks`、`shutdown`、`curl … | sh`、换行分隔的多命令、`sudo`/`timeout`/`env -S`/`bash -c` 包装、`psql … drop database`。
- **未拦截（应视为漏检）：**
  | 命令 | 后果 |
  |---|---|
  | `git checkout .` / `git checkout <path>`（无 `--`） | 丢弃工作区改动，与已拦截的 `git checkout -- .` 等价 |
  | `git switch --discard-changes` / `-f` / `-C` | 同上 |
  | `rsync --delete …` | 删除目标多余文件 |
  | `cp /dev/null file` | 清空文件（与已拦截的 `truncate` 等价） |
  | `:(){ :\|:& };:` | fork bomb |
  | `docker system prune -af` / `docker volume rm` | 删除本机全部镜像/卷 |
  | `kubectl delete …` / `terraform destroy` / `aws s3 rm --recursive` | 云侧破坏 |
  | Windows `del /f /q *`（无 `/s`） | 当前目录批量删除 |
  | `sqlite3 db "DROP TABLE …"` | 数据库破坏 |
  | `sed -i …` / `perl -i …` | 就地改写文件（Ask/Plan 只读模式下应被视为写入） |
  | `history -c` | 痕迹清除 |
- **影响：** 策略的用法是（`tools/dangerous.js:13-27`）：远程 MCP 命中即拒绝（`E_FORBIDDEN`），本机 Chat 命中时要求模型显式传 `confirm_dangerous=true`，插件 PTY 侧命中时要求人工确认。漏检意味着上表命令**在远程 Bridge 会被直接执行、在本机不需要确认标志**。项目文档已诚实声明"脚本文件与 `python -c` 正文不在范围内"，但上表大多是单条 shell 命令，属于同一词法层可以覆盖的。
- **建议：** 为上表补规则（`git checkout|switch` 只要目标是 `.`/路径且无 `-b`；`rsync --delete`；`cp /dev/null`；`docker (system prune|volume rm|rm -f)`；`kubectl delete`；`terraform destroy`；`aws s3 rm`；`del` 带 `/q`；`DROP (TABLE|DATABASE)` 出现在任意命令行；`sed|perl -i`），并把这份矩阵作为 `dangerousCommands.test.js` 的固定用例。
- **证据类型：** 实测。

#### P2-2 模型输出非流式：用户最长 120 秒看不到任何文字
- **位置：** `agent-host/src/agent/openai.js:218-233`（`fetchText(...)` 一次性读完响应，`stream` 未开启）；`routes.js:687` 整轮 Chat 5 分钟硬上限。
- **现象：** `/api/chat` 是 NDJSON 事件流，但 `message` 事件只在模型整段生成完后发一次；期间界面只有"请求 model…"状态。对推理模型（o 系列/gpt-5）和长回答尤其明显。
- **影响：** 体验落后于所有主流编码助手；用户会误以为卡死。同一工作台标签页内再次点击会变成"停止"（`chat.js:141`，已处理），但多标签页、插件与网页同时发送时服务端 `/chat` 没有并发上限，会真的并行跑多条模型+工具链。
- **建议：** ① `stream: true` + 解析 SSE `delta`，新增 `delta` 事件，前端在 `chat.js` 增量追加（NDJSON 通道与预算逻辑可以复用）；② 工具调用的 `tool_calls` 增量拼接；③ 服务端对同一 owner 的 Chat 加并发上限（1–2），超出返回 409。
- **证据类型：** 静态阅读。
- **处置（第 5 批 / 第 102 组）：** ①② 已修，见第 8 节与第 9.5 节；③ 并发上限未做（它不是流式的一部分，且要先决定“同一 owner”的定义——工作台没有登录态，只有 Host 门禁），留在 9.5 的 D-27。

#### P2-3 Chat 上下文管理粗糙：只按条数裁剪、不估算 token
- **位置：** `openai.js:206`（`history.slice(-12)`）；`routes.js` 允许单条消息 1 MiB、历史 12 条/合计 1 MiB。
- **现象：** 没有 token 估算；超出模型上下文时上游返回 400，本项目有意不回显上游错误正文，用户只看到"模型 HTTP 400 请求失败"。
- **建议：** 按 `contextSize`（模型目录已有该字段）做粗略 token 估算（字符/3.5 或 `tiktoken`），超限时在发送前提示并截断；对上游错误至少回显**受控的**错误类别（`context_length_exceeded`、`invalid_api_key`、`model_not_found`），不回显原文。
- **证据类型：** 静态阅读。
- **处置（第 6 批 / 第 103 组）：** 受控错误类别与发送前估算提示已修（见第 8 节、第 9.6 节）；“超限时截断”有意不做——目录的 `contextSize` 是用户可编辑的展示文本，估算又是粗略的，自动截断会在错误的地方丢上下文，所以只提示、由模型的 400 做最终裁决；按 token 裁剪历史（替代 `slice(-12)`）也未做，同样理由。

#### P2-4 危险命令与执行环境的两个未文档化行为
- **位置：** `tools/executor.js:228`（`CI: 'true'` 注入环境）；`executor.js` 的 `scrubEnv` 会静默剥离名称含 `token/secret/key/password` 等的环境变量。
- **现象：** ① `CI=true` 会让 Create React App / Vite 部分工具把警告当错误、让 `npm ci` 行为变化、让一些测试框架关闭交互和彩色输出——用户在工作台跑 `npm run build` 失败但本地终端成功时无法理解；② 需要 `GITHUB_TOKEN`/`NPM_TOKEN` 的命令（`gh`、私有源 `npm install`）会在无提示的情况下失败。
- **建议：** 在命令结果里附一行"已注入 CI=true；已剥离环境变量 N 个（GITHUB_TOKEN, …）"，并在 `工具入口与命令策略详解.md` 写明；`CI=true` 可改为可配置。
- **证据类型：** 静态阅读。
- **处置（第 7 批 / 第 104 组）：** 已修。`prepareCommandEnv` 在执行命令前计算环境净化与注入摘要，用户显式指定 `CI` 时尊重其值，结果记录中新增结构化 `envSummary: { stripped: [...], injected: [...] }` 字段透明化所有变更；测试见 `executorEnv.test.js`。

#### P2-5 硬编码 `/bin/bash` 与端口 48271 的多处硬编码
- **位置：** `executor.js:178`（非 Windows 一律 `/bin/bash`，Alpine/NixOS/部分容器无此路径）；`routes.js:599-605` 四条提示写死"本机48271端口"（应为 `config.port`）；`models/store.js:50`、`extension.js:38`、`hostManager.js:17`、`installer/appWindow.js:225`、`index.html:715,724` 亦写死。
- **建议：** shell 用 `process.env.SHELL || (fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh')`；提示文案改用运行时端口；扩展/安装器统一从一处常量导出。
- **证据类型：** 静态阅读 + grep。
- **处置（第 7 批 / 第 104 组）：** `/bin/bash` 已修。`detectPosixShell` 按顺序探测：`/bin/bash` → `/usr/bin/bash` → 绝对路径且名为 bash/sh/dash/ash 的 `SHELL` → `/bin/sh` → `/usr/bin/sh`（fish/zsh/nu/csh 等交互 Shell 不用于 `-c`，F105 复核修正） → `/bin/sh` 兜底；端口 48271 在第 1 批已部分修复（运行时文案采用 `config.port`），跨进程独立默认值保留。

#### P2-6 工作台"高级设置"提示文案描述了不存在的功能
- **位置：** `workbench/index.html:743`：`随 Web Agent 启动 Bridge、重置 MCP 地址、startupTimeoutMs。` 而该区块只有一个"重置 MCP 地址"按钮；全仓 grep `autoStartBridge|startupTimeoutMs` 在工作台/主机代码中无实现（扩展侧的"启动主机后同时开启 Bridge"是另一功能）。
- **影响：** 用户会去找"随启动 Bridge"和 `startupTimeoutMs` 设置项。
- **建议：** 改为"重置 MCP 地址会使旧地址立即失效，需重新配置客户端。"
- **证据类型：** 实测 grep。

#### P2-7 多模型"总结模型"下拉出现两个同名选项
- **位置：** `workbench/js/settings.js:79`：`<option value="active">用当前对话模型</option><option value="auto">用当前对话模型</option>`。
- **影响：** 用户看到两条一模一样的"用当前对话模型"，无法区分 `active` 与 `auto` 的语义差别。
- **建议：** 二选一保留，或分别命名为"跟随当前对话模型"/"自动（按分支多数）"，并在 `画像与记忆详解`/设置文档中写明差异。
- **证据类型：** 静态阅读。

#### P2-8 Bridge 活动面板固定 3 秒轮询，不看页面可见性
- **位置：** `workbench/app.js:99`：`setInterval(() => ui.refreshBridgeActivity(), 3000)`。
- **现象：** 无论 Bridge 是否运行、右栏是否在 Bridge 页、标签页是否在后台，每 3 秒一次 `GET /api/bridge/activity`。而 `/ws` 事件流已经推送 `tool_call_end` 等事件。
- **建议：** 仅在 Bridge 页可见且 `document.visibilityState === 'visible'` 时轮询，或改为 WS 事件触发 + 30 秒兜底。
- **证据类型：** 静态阅读。

### P3

| 编号 | 位置 | 问题 | 建议 |
|---|---|---|---|
| P3-1 | `config.js:12-13` | `parseInt(AGENT_HOST_PORT/WORKBENCH_PORT)` 无 NaN/范围校验，`AGENT_HOST_PORT=abc` 会把 NaN 传给 `listen` | 校验 1–65535，非法即退出并提示 |
| P3-2 | `index.js` | `/api` 的两个守卫中间件挂载了两次（无害但多余） | 合并 |
| P3-3 | `routes.js` `/api/probe/*` | 直接把 `req.body` 交给 probeBridge，未经 `apiRequestBody` 顶层白名单；本轮阅读 `probeBridge.validateAction` 确认其自行做了键白名单与类型校验，因此**不是漏洞**，但与其余路由风格不一致 | 统一走 `apiRequestBody` |
| P3-4 | `routes.js` `POST /models`、`PUT /customizations`、`POST /providers/probe` | 未经 `apiRequestBody`（各自有严格 schema，安全上无差，风格不一致） | 同上 |
| P3-5 | `openai.js:106` | 系统提示里写死 `(including calculator.js)`——示例项目的名字进入了所有用户的提示词 | 删除 |
| P3-6 | `openai.js:99` | 系统提示称"Editor is Code-OSS"，经典工作台模式下编辑器是 Monaco 页面 | 按入口注入 |
| P3-7 | `tools/index.js` | `report_progress`/`set_todos` 的 description 为中文，其余 37 个为英文；同一 tools/list 语言混杂会影响模型工具选择一致性 | 统一英文（或双语） |
| P3-8 | `dom.js:108-118 renderMd` | 先 `escapeHtml` 再替换（XSS 安全），但：围栏代码的语言标记（```js）成为代码块首行；`<li>` 没有外层 `<ul>`；不支持有序列表/链接/斜体/表格 | 用 ~3 KB 的小型渲染器（或 `marked` + DOMPurify 自托管） |
| P3-9 | `dom.js:99` | toast 固定 2.2 秒，长错误文本读不完 | 按文本长度 2.2–6 秒，错误类可点击关闭 |
| P3-10 | `chat.js paintTodos` | 只迭代 `['chat']`，是多面板时代的残留 | 清理 |
| P3-11 | `styles.css` | 末尾追加式覆盖：两个 `:root`（1、545）、`.composer-tools` 两次（279、578）、`@media 980` 两次（462、605）、`@media 700` 两次（579、629）、空规则 `.tree-dir .tree-kids { }`（437） | 一次性合并 |
| P3-12 | `index.html:286,400` | 错别字"本地 的智能体自定义设置"（多一个空格） | 修正 |
| P3-13 | `utils/probeBridge.js` | 单行多语句、无空格的压缩风格（如第 16、52-54 行），与仓库其余代码风格差异大，ESLint 未启用格式规则所以不报 | 视为可读性债务 |
| P3-14 | `arena-model-probe/active_probe.py:68` | `one_line()` 使用 `re.sub` 但文件未 `import re`（函数目前无调用者，属死代码里的 NameError） | 补 import 或删函数 |
| P3-15 | 探针 `.py`/`.mjs` | pyflakes：8 处未使用 import/变量；ESLint：`tools/e2e.mjs`、`tools/selftest.mjs` 5 处未使用变量 | 清理 |

---

## 4. 优化建议

### 4.1 UI / 排版（工作台、扩展 Webview、文档站）

#### 4.1.1 字号（用户点名关注）
**事实（实测统计 `styles.css`）：** `font-size` 声明 106 处，其中 `var(--fs-sm)` 43 处、`var(--fs-xs)` 26 处、`var(--fs-md)` 25 处、其余 12 处为标题。而 `--fs-xs` 与 `--fs-sm` **同为 0.75rem = 12px**（`styles.css:26-27`），即 **65% 的文字是 12px**，包括：所有 `.hint` 说明、状态栏、终端、任务列表、工具卡片、Bridge 统计、设置页大部分控件。`--fs-md` 13px 只用于正文/输入框/文件树。

**判断：** 对中文界面偏小。VS Code 默认 UI 字号 13px、编辑器 14px；Chrome/Edge 中文最小可读推荐 ≥13px；12px 中文（尤其在 Windows 100% 缩放、非 ClearType 环境）笔画粘连明显。已有 A-/A+ 缩放（`--text-scale`），但那是用户补救，不是默认合理值。

**建议：**
1. `--fs-sm: 0.8125rem`（13px），`--fs-xs` 保持 12px 且只用于时间戳/徽标；`.hint` 行高 1.6。
2. 设置页与"工具接入与审批"页的长说明段（如 `index.html` 里 `#prompt-hint`、工具接入 lead、隧道说明）改为 13px + 折叠 `<details>`；一段不超过 3 行。
3. Monaco `fontSize: 13` 固定（`monaco.js:26`），**不跟随 A-/A+**：在 `dom.js` 设置 `--text-scale` 时同步 `state.editor.updateOptions({ fontSize: Math.round(13 * scale) })`。
4. 扩展 Webview（`extension.js:859-882`、`995-1008`）：`body 12px`、`.tool 11px`、`.agent-btn 11px`、`.menu .hint 10px`。F70 已把工作台 25 处 11px 中文清掉，Webview 里仍在。改为 `font-size: var(--vscode-font-size)`、`font-family: var(--vscode-font-family)`，最小不低于 12px。
5. 文档站 `docs-site/styles.css`：11px 7 处、12px 9 处（侧栏 section 标签、脚注），同样建议 ≥12px。

#### 4.1.2 布局
1. **三栏固定像素、无拖拽：** `#sidebar` 240px、`#rightbar` 356px、`#panel` 160px（`styles.css:107,209,198`）。只有 980/700 两个断点。**在 700–980px 宽度下**三栏仍并排：编辑器可用宽度 = 视口 − 48（活动栏）− 240 − 356，980px 时 336px，760px 时约 116px——笔记本半屏窗口下编辑器不可用。建议：① 增加 ~1200px 断点，让侧栏改为覆盖式（复用 700px 断点的做法）或让右栏缩到 300px；② 给三条边界加 `resize` 分隔条（≈40 行 JS，记忆到 localStorage）；③ 底部面板高度可拖拽。
2. **右栏 Chat 与 Bridge 的信息密度：** Bridge 面板把统计（4 个数字）、任务、日志、会话卡片竖排堆叠，在 356px 宽、常见 800px 高的窗口里需要滚动两屏。建议统计改为一行 4 个小徽标，日志默认折叠。
3. **首页"欢迎"页 8 个"打开 X"站点按钮 + "快速打开"列表重复**（`index.html` 欢迎区与 `#ql-list`）；且这些页面在工作台内只是"连接指引"而非嵌入。建议保留一个"连接外部客户端"入口，把 8 个站点收进下拉。
4. **内联样式：** `execution-controls` fieldset、`#ops-stdio-review`、`#checkpoint-review`、`#skill-reader-content`、`label.chk`、`.block-h` 使用 `style=`，主题切换时这些元素不跟随变量。移入 `styles.css`。
5. **无 `prefers-color-scheme` 默认**：首次打开总是深色，浅色系统用户需手动切；一行媒体查询即可跟随系统。

#### 4.1.3 语言与文案一致性
`index.html` 声明 `lang="zh-CN"`，但以下位置仍为英文（用户第一眼即见）：Bridge 面板 `Waiting for the remote Agent`（231）、`MCP session`（243）、`Stop Bridge`（250）、`Clear log`（252）、`Average response`/`Failures`/`Success rate`（257-259）、`Streamable HTTP`（263）、`Bridge mode is output-only here…`（264）、`Tasks`；设置页 `Add API Provider`（576）；文件菜单 `API Provider...`（764）。扩展 Webview 里 `Tasks` 亦然。建议统一中文（或做 i18n 字典，两处前端共用）。另有错别字见 P3-12。

#### 4.1.4 可访问性（已做得好的与剩余）
做得好：全部按钮有 `type`、标签页 `role=tab`/键盘方向键、`aria-live` 状态区、焦点环、对比度（深色 `#b0b0b0/#1f1f1f` ≈7.5:1，浅色 ≈6.1:1）、A-/A+、CI 内 axe 扫描。
剩余：① `renderMd` 产出的 `<li>` 无列表容器，读屏器不会宣告"列表 N 项"；② toast 2.2 秒对读屏/低视力过短；③ 扩展 Webview 未用 `--vscode-*` 变量，高对比主题下颜色写死。

#### 4.1.5 字体栈
`--font` 缺少 Linux 中文回退（`Noto Sans CJK SC` / `WenQuanYi Micro Hei`），Linux 下会落到 `sans-serif` 的默认中文字体（常为宋体类），观感差且与 Windows 不一致。

### 4.2 功能实现优化

| 编号 | 主题 | 现状 | 建议 |
|---|---|---|---|
| F-1 | 流式输出 | 见 P2-2 | `stream:true` + `delta` 事件 |
| F-2 | 上游错误可读性 | 一律"模型 HTTP 4xx 请求失败"（`openai.js:229`，有意不回显） | 白名单映射错误类别（鉴权失败/模型不存在/上下文超限/限流），仍不回显原文 |
| F-3 | Chat 5 分钟硬上限 | `routes.js:687` | 可配置；Code 模式跑测试常超 5 分钟。或改为"无事件 5 分钟"而非"总时长 5 分钟" |
| F-4 | Chat 并发 | 无上限 | 同 owner 排队或 409 |
| F-5 | 历史裁剪 | 12 条 | 按 token 预算裁剪，并把被裁掉的早期轮次压缩成一句摘要 |
| F-6 | 工具结果预算 | 单个工具结果截到 12000 字符（`clipJson`） | 对 `read_files` 结果按行号窗口分页而不是硬截；提示模型"已截断，可用 offset 续读" |
| F-7 | 危险命令策略 | 见 P2-1 | 补规则 + 矩阵测试 |
| F-8 | 执行环境透明度 | 见 P2-4 | 回显注入/剥离的环境变量名 |
| F-9 | Bridge 活动刷新 | 3 秒轮询 | 可见性门控 / WS 驱动 |
| F-10 | Monaco 自托管 | 见 P1-1 | 自托管，同时解决离线 |
| F-11 | 令牌持久化时序 | 隧道令牌在隧道成功前已写盘（既有审计观察） | 成功后再写；失败即清 |
| F-12 | 工具描述语言 | 中英混杂（P3-7） | 统一 |
| F-13 | `/bridge/logout` | 缺 workspace 绑定（其余 Bridge 写操作都要求绑定） | 对齐 |
| F-14 | 端口/Shell 硬编码 | 见 P2-5 | 统一常量 |
| F-15 | `renderMd` | 自制正则 | 小型正规渲染器 |
| F-16 | 多模型总结选项 | 见 P2-7 | 改名 |

### 4.3 工程与仓库

1. **生成物入库：** `docs-site/content.js` 5.3 MiB、`documentation-manifest.json` 1.6 MiB、`source-index.md` 0.9 MiB，均为 `build.js`/`check-docs.js` 的输出，任何源码改动都会重写三者。本浅克隆仅 5 个提交就已累积 15 个 blob、39 MB 未压缩，包大小 63.7 MiB。建议：保留 `documentation-manifest.json`（小且是漂移证据），把 `content.js` 与 `source-index.md` 改为 `.gitignore` + CI 构建产物；安装器已支持 `bundled.json` 预构建，不受影响。若坚持入库，至少在 CI 里对这三者做 `git diff --stat` 门禁而不是每次提交携带。
2. **图片体积：** `review/shuncode-ui/` 26 张 JPG 共 13 MB（单张最大 842 KB）。建议缩到 1280px 宽、质量 75（可降到 ~2 MB），或移入 Release 附件。
3. **Node 18：** CI 矩阵含 Node 18（2025-04 已 EOL），`engines` 为 `>=18`。建议 `engines >=20` 并从矩阵移除 18，或在 README 明示"18 仅尽力支持"。
4. **ESLint 覆盖：** 三个探针目录被排除。本轮用同规则临时跑过：除全局名/模块类型噪音外仅 5 处未使用变量，说明可以低成本纳入（配置里给 `chrome`、`ArenaTraceView`、`ArenaHudLayout`、`ArenaConversationRename` 声明只读全局）。
5. **前端测试：** 工作台交互仅由 Playwright 浏览器任务覆盖且沙箱不可运行；`renderMd`、`settings.js` 的下拉构建、`app.js` 轮询门控这类纯函数可以抽到可在 Node 内跑的单元测试（`workbenchRuntime.test.js` 已有 VM 方式，可复用）。
6. **代码风格：** 主仓库未启用格式化器（用户决策方案 B），因此 `probeBridge.js` 这类压缩风格与其他文件并存；若接受，建议至少对"新增文件"要求 Prettier 默认格式。
7. **第三方编辑器入库（第 4 批决策记录）：** 修 P1-1 时在三种方案里选了“把 `monaco-editor@0.52.2` 的 `min/vs` 树（97 个文件、约 12 MiB）提交到 `webagent-core/workbench/vendor/monaco/`”。放弃 npm 依赖的原因：首次启动的 `npm ci` 有 120 秒硬预算（`installer/preparation.js:61`）、扩展就绪 180 秒（`hostManager.js:134`），多装 1467 个文件/18 MB 会直接吃掉这个预算，且已装机器仍要 CDN 回退→动态 CSP；放弃 postinstall 下载的原因相同（网络成本没有消失，只是换了时机）；放弃裁剪 `min/vs` 的原因是去掉 tsWorker 会让 .js/.ts 语言模式加载失败。代价是仓库多 12 MiB 的第三方压缩产物（`.gitattributes` 标 `linguist-vendored`/`-diff`，ESLint 与文档清单排除），升级时用 `scripts/vendor-monaco.js` 按 tarball integrity 重新落盘并由 `contentSecurity` 测试核对逐文件 sha256；若将来仓库体积成为问题，可改为 Release 附件 + 安装器预置。

---

## 5. 文档与代码一致性核对

| 核对项 | 方法 | 结果 |
|---|---|---|
| REST 路由 | 代码 65 个 `router.get/post/put/delete` vs `api/路由逐项详解.md` | 全部在文档中有对应段落（`/probe/*` 明确标注由探针专项负责）；无文档有而代码无的路由 |
| 错误码 | 代码 60 个 `E_*` vs 现行文档 52 个 | 文档中出现的全部存在于代码；archive 目录内的旧码未计 |
| 环境变量 | 代码 37 个 `process.env.*` vs 文档 39 个 | 文档多出的 `CODE_SERVER_PATH`、`WEBAGENT_NO_PAUSE` 均为"不存在该开关"的否定句或 archive，无误导 |
| 工具数量 | 运行时 40 个（`send_command_input` 隐藏）vs 文档"39 个工具" | 一致（对外 39） |
| 端口/版本/脚本名 | README、使用指南、启动脚本说明 | 3000/48271、0.7.2、`run-webagent*.cmd`、`check-env.cmd`、`install-vscode-extension.cmd` 均存在且一致 |
| 反引号路径 | 排除 archive/repro/context-history 后 52 个未直接命中 | 逐一判读：`.webagent/*`、`host.json`、`reports.json`、`recon/*` 为运行时文件；`manager/privacy.md` 有意 gitignore；`s2-backend.md` 为示例名；无真正失效引用 |
| `FULL_REVIEW_INDEX` 指纹 | 抽样 `AGENTS.md`、`web_agent_review_2026-09-23.md` | sha256 前 16 位与文件一致 |
| 工作台内嵌文案 | 与代码功能对照 | **P2-6**：`index.html:743` 描述了不存在的"随启动 Bridge / startupTimeoutMs" |
| 项目自报未决项（`manager/CONTEXT.md`） | 对照 | R7 逐文档核对未收口、R6 第 11 步 `@webagent` 待用户续跑 4、R4 Windows 超时根因、R5 隧道残留清理、OAuth 默认关闭、探针暂停、F61-05/06 未复验——与代码状态相符，本轮无新增矛盾 |

**总体判断：** 文档与代码的一致性在本仓库是被工具和流程持续维护的（目录 README 生成区、manifest 哈希、`documentationLinks.test.js` 强制登记），本轮未发现"文档说 A、代码做 B"的实质性冲突；剩余问题是 UI 内嵌文案（不在 Markdown 体系里，因此逃过了现有检查）。建议把 `index.html`/扩展 Webview 里的说明性长文案也纳入 R7 的核对范围。

---

## 6. 暂停模块（`arena-model-probe/`、`arena-trace-inspector/`、`webagent-core/probe-extension/`）

项目约定为"暂停、只登记路径"。按用户要求本轮读了代码并做静态检查，结论仅限代码卫生，不认证功能与合规：

- 18 个 `.py` 全部可编译；pyflakes 9 条（1 条真实缺陷 P3-14，其余未用 import/变量）。
- ESLint（同主配置规则）：真实问题仅 5 处未使用变量；其余为浏览器扩展跨文件全局（`chrome`、`ArenaTraceView` 等）与模块类型配置噪音。
- 安全/隐私：`get_token.py` 把抓到的 `public-access-token` JWT 明文写入 `recon/token.json`；`recon/` 已在根 `.gitignore`（确认），但目录内无过期清理。`arena_probe.py` 文档字符串明确说明是为绕过 reCAPTCHA 而驱动真实浏览器——这类自动化对目标站点的服务条款存在合规风险，建议在 README 顶部保留显著提示（现有 README 未读正文，按约定登记）。
- 主机对探针的运行时耦合：`agent-host/src/utils/probeBridge.js:8-9` 直接 `require('../../../probe-extension/{referenceInput,traceInput}')`，安装器 `installer/package.js:9-10` 也显式打包这两个文件。若日后删除暂停目录，主机将无法启动；建议把这两个纯校验模块迁到 `agent-host/src/utils/` 下。

---

## 7. 覆盖清单

### 7.1 代码（按目录）
| 目录 | 文件数/行数 | 本轮覆盖 |
|---|---|---|
| `webagent-core/agent-host/src` | 13,367 行 JS | 入口/配置/路由/工具入口/危险策略/执行器/openai/runChat 关键段/mcp server 头部/probeBridge/lifeline/localControl 全文；其余定向 |
| `webagent-core/agent-host/tests` | 116 文件 | 全部执行通过；`documentationLinks.test.js` 登记合同已读 |
| `webagent-core/workbench` | 5,480 行 | `index.html`/`styles.css`/`app.js`/`api,state,dom,chat,monaco,tabs` 全文；`bind,bridge,settings,operations,picker,vscodeRelay` 定向；`settings-panel.*` 全文 |
| `webagent-core/extension` | 2,976 行 | `package.json`、`extension.js` 请求层与两个 Webview、`dangerousPolicy.js`（实测）、`ptyPolicy.js` 全文；`hostManager/ptyHost/settingsPanel` 定向 |
| `webagent-core/scripts`、`installer`、`admin-host`、`docs-site` | 2,945 行 | `ensure-code-server.js`、`launch.js`、`admin-host/app.js` 前段、`serve.js`、`check-docs.js`、`app.js` 头部、样式 |
| `computer-use/win`（ps1/cs） | — | 未读（Windows 专用，沙箱无法验证） |
| 三个探针（py/js/mjs） | ≈12,329 行 | 静态检查（py_compile、pyflakes、ESLint） |
| `webagent-repro/`、`examples/` | — | 冻结/示例，未审 |

### 7.2 文档
109 份 Markdown：主干手册与开发文档通读；其余以路由/错误码/环境变量/路径/工具数自动比对为主（第 5 节）。

### 7.3 本轮未做、建议后续做
- 真实 Windows + 桌面 VS Code + Quick Tunnel 走一遍 `R8本轮Arena实机验收.md`。
- 用 Playwright 在 800×600、1024×768、1366×768 三种视口截图工作台，验证 4.1.2 的编辑器宽度问题并作为回归基线。
- 对 `mcp/oauth.js`、`tools/fileOps.js`、`tunnel/*` 做与本轮同等深度的逐行阅读（F70–F94 已有红测，但没有一份是"整文件通读"记录）。

---

## 8. 修复进度（报告成文后追加）

| 编号 | 处置 | 批次 / 组 | 说明 |
|---|---|---|---|
| P2-1 危险命令漏检 | 已修 | 第 1 批 / 第 98 组 | 55 条实测漏网全部入规则并有矩阵测试；`sed -i`、`history -c`、`docker rm -f` 有意不拦（理由见工具入口与命令策略详解） |
| P2-5 硬编码 48271 | 部分 | 第 1 批 / 第 98 组 | `routes.js` 启动说明改用 `config.port`，工作台两处隧道提示改为“默认 48271”；扩展/安装器里的默认值属于另一进程的合法缺省，保留。`/bin/bash` 未动 |
| P2-6 陈旧提示 | 已修 | 第 1 批 / 第 98 组 | 高级设置提示改为说明重置 MCP 地址的后果 |
| P2-7 重复选项 | 已修 | 第 1 批 / 第 98 组 | 去掉 `auto` 重复项，旧值读取时归一为 `active` |
| P2-8 后台轮询 | 已修 | 第 1 批 / 第 98 组 | `document.hidden` 时跳过，切回立即刷新 |
| P3-1 端口未校验 | 已修 | 第 1 批 / 第 98 组 | `portFromEnv` 严格校验并按变量名报错；新增 `configPorts` 测试 |
| P3-5 calculator.js | 已修 | 第 1 批 / 第 98 组 | 系统提示删除示例残留 |
| P3-7 中文工具说明 | 已修 | 第 1 批 / 第 98 组 | `report_progress`/`set_todos` 改英文 |
| P3-12 错字 | 已修 | 第 1 批 / 第 98 组 | 两处“本地 的智能体” |
| 4.1 Monaco 字号不随 A-/A+ | 已修 | 第 1 批 / 第 98 组 | `editorFontSize = round(13 × scale)` |
| 4.1 主题不跟随系统 | 已修 | 第 1 批 / 第 98 组 | 无存储选择时按 `prefers-color-scheme`，且不落盘 |
| D-1 敏感文件内置规则缺口 | 已修 | 第 2 批 / 第 99 组 | `sensitive.js` 补 30 条凭据存储模式（27→57）（`*.env`、kubeconfig、`*.tfstate`、`.docker/config.json`、`.pypirc`/`.pgpass`、shell 历史、`.git/config` 等），样例例外扩到 `example.env`；`sensitiveBoundary` 正反 46 例 |
| D-2 自定义规则大小写绕过 | 已修 | 第 2 批 / 第 99 组 | Windows/macOS 上自定义 `.webagentignore` 规则改为不区分大小写（`isSensitive(rel, {ignoreCase})`，默认 `CASE_INSENSITIVE_FS`）；Linux 保持逐字 |
| D-3 终端确认弹窗静默截断 | 已修 | 第 2 批 / 第 99 组 | `ptyHost.confirm` 超 400 字符时写明总长度并把完整命令写入输出面板；命中破坏性规则时在预览上方点名；`shouldAutoAllow` 返回 `reason` |
| D-4 list_dir 遇不可读子目录整体失败 | 已修 | 第 2 批 / 第 99 组 | 子目录 EACCES/EPERM/ENOENT/ENOTDIR 就地标 `unreadable`，其余照常返回；文件 stat 竞态不再抛 |
| D-5 读取缓存键不归一 | 已修 | 第 2 批 / 第 99 组 | `readCache.norm` 经 `path.posix.normalize`，`src//a.js`/`./src/./a.js` 与 `src/a.js` 同键（仅摩擦，非授权漏洞） |
| D-6…D-10（报告即处置） | 记录 | 第 2 批 / 第 99 组 | 见第 9.3 节：`write_file` 目录目标报错无错误码、`applySearchBlocks` 的 trim 回退同时 trim REPLACE、`workspaceMatch` 在 macOS 上区分大小写、`.git/hooks` 可被模型写、`kubectl delete` 规则不看资源类型 |
| D-11 cloudflared Token 走命令行 | 已修 | 第 3 批 / 第 100 组 | Named Tunnel 改为 `env.TUNNEL_TOKEN` 传 Token，argv 固定 `tunnel --no-autoupdate run`；工作台提示、隧道指南、生命周期详解同步；`tunnelLifecycle` 测试断言两种隧道的 Token 都不在 args 里 |
| D-12 `/oauth/revoke` 无限流 | 已修 | 第 3 批 / 第 100 组 | 与 `/oauth/token` 同为每 IP 60 次/分钟，超限 429 带 `Retry-After`；`oauth` 测试连发 61 次 |
| D-13 调用者表按插入顺序驱逐 | 已修 | 第 3 批 / 第 100 组 | `session.touch` 先 delete 再 set，Map 保持最近使用顺序，满 200 时删最久未见者；`stateIntegrity` 新增 veteran 用例 |
| D-14…D-18（报告即处置） | 记录 | 第 3 批 / 第 100 组 | 见第 9.3 节：PKCE 失败不作废授权码、单 IP 可占满 80 个注册槽、`GET /mcp` 快照向任何持凭据调用者展示其他调用者、`resources/list` 不查 `read_files` 开关、`publicHttps` 不跟随重定向属有意设计 |
| P1-1 Monaco 走公网 CDN、无 SRI/CSP | 已修 | 第 4 批 / 第 101 组 | Monaco 0.52.2 随仓库分发（`workbench/vendor/monaco`，`scripts/vendor-monaco.js` 按 tarball sha512 落盘并写逐文件清单），主机 `/vendor/monaco` 静态提供（no-cache+ETag）；`monaco.js` 只加载同源 loader，先装 zh-cn 文案再装编辑器，7 秒纯文本回退保留；工作台全部响应带完整 CSP（`script-src 'self'` + 主题内联脚本 sha256、`worker-src blob:`、`connect-src` 只点名本机 ws/wss、无任何第三方来源），OAuth 配对页另有 `default-src 'none'` 策略；`httpSmoke`/`monacoLoading`/`installerPackaging`/新 `contentSecurity` 测试与 CI 的 `contentSecurityBrowser` 覆盖；SECURITY.md、验收指南、各详解同步 |
| D-19 安装器扩展名白名单漏 `.ttf` | 已修 | 第 4 批 / 第 101 组 | `installer/package.js` 的 `extensions` 没有字体类型，vendored 的 codicon 图标字体会被静默丢弃（编辑器图标变方块）；已加 `.ttf` 并在 `installerPackaging` 断言九个 vendored 文件入包 |
| D-20 OAuth 配对页无自有 CSP | 已修 | 第 4 批 / 第 101 组 | 该页面在公网隧道上暴露，只有基线安全头（无 `script-src`）；现按模板 `<style>` 哈希下发 `default-src 'none'; style-src 'sha256-…'; base-uri 'none'; frame-ancestors 'none'`，GET 与错误重渲染同策略；有意不设 `form-action`（Chrome 会把它套到 302 跳回客户端上） |
| D-21 浏览器测试 6 处重复的 CDN 阻断路由 | 已修 | 第 4 批 / 第 101 组 | 合并为 `withoutEditor(page)`（阻断 `**/vendor/monaco/**`），语义不变；`narrowWorkspaceBrowser` 因 axe 以内联脚本注入而改用 `bypassCSP: true`（只放行测试注入，不放行产品） |
| D-22…D-24（报告即处置） | 记录 | 第 4 批 / 第 101 组 | 见第 9.4 节：工作台 `style-src` 仍需 `'unsafe-inline'`、`connect-src` 取自请求 Host、VS Code 设置页 webview 不在此策略内 |
| P2-2 模型输出非流式 | 已修 | 第 5 批 / 第 102 组 | `openai.js` 每轮请求带 `stream:true`，新模块 `agent/completionStream.js` 逐行解析 SSE（`data:` 行、注释/keep-alive、`[DONE]`、usage 尾块、`delta.content` 与按 `index` 拼接的 `delta.tool_calls`，缺 `index` 的 Mistral 式分片并入最后一槽），`end()` 产出与整份 JSON 同形的 choices 后仍走原来的 `normalizeAssistantMessage`——工具白名单/64 项/256 KiB 等门禁一处未少。可见文本经 `requestScope.fetchText` 新增的 `limits.onChunk` 边收边发 NDJSON `delta{text}`（≥48 字符或 ≥80 ms 合并一次），每轮末尾仍发 `message{text}`（权威全文，与分片拼接逐字相同；带工具调用的叙述文本也先流后收口、再发工具事件）。三个客户端：工作台 `chat.js` `streamDelta/closeStream`（进行中气泡带 `▍` 光标，`prefers-reduced-motion` 不闪），VS Code Webview 同法，原生 Chat 参与者逐片 `stream.markdown` 且 `message` 只补写余量、两段之间空一行；三者历史都只收 `message`。Plan 分支/合并的 `capturingEmit` 吞掉 `delta`，分支答案仍由 `emitRound` 带分支号发一次。预算：SSE 传输层上限 `MODEL_STREAM_RESPONSE_MAX_BYTES=16 MiB`（token 被包成 150–250 B 的 JSON 块），Provider 忽略 `stream` 回整份 JSON 时仍是 1 MiB；流内 `{error}`、畸形 SSE、序号有洞都以固定文案 `E_MODEL_STREAM` 失败并取消 body，不回显。回退：流式请求得 400 ⇒ 同轮不带 `stream` 重试一次、status 提示、进程内 `STREAM_UNSUPPORTED` 记住该 `baseUrl+modelId`；401/403/429/5xx 不重试。测试：新 `tests/modelStreaming.test.js`（10 组，真实 WHATWG Response）、`tests/completionStream.test.js`（分帧与 18 种畸形输入）、`networkBudget`（`onChunk` 合同）、`workbenchRuntime`/`webviewRuntime`/`nativeChatStream`（三个客户端）、`workbench.browser.js classicChatStreamBrowser`（真实 DOM 快照，CI 跑）。文档：模型调用详解新增“流式响应”与 1b 节、函数详解、路由详解、Chat 详解、样式详解、入口与 Webview 详解、技术实现、使用指南 |
| P2-3 上游错误只显示“HTTP 400 请求失败”/无上下文估算 | 已修（截断除外） | 第 6 批 / 第 103 组 | 新模块 `agent/modelDiagnostics.js`：按上游 `error.code`/`type`/`param`、状态码兜底与少数消息形状把失败归入固定类别（context/stream/auth/forbidden/not_found/quota/rate_limit/overloaded/upstream/bad_request/http），文案写死在本机（如“模型 HTTP 400 请求失败：对话超出模型上下文长度（本次请求约 N tokens，估算值），请清空历史、缩短消息或换上下文更大的模型”），正文只匹配、截 2000 字符、永不拼接；认证类只看码/状态不看文本（“token”会撞 max_tokens）。200 正文 `{error}` 信封与 SSE 流内 `{error}` 同样归类。`parseContextSize` 解析目录展示文本（128K/1M/32768/200k tokens），`estimateTokens`（CJK≈1、其余≈3.5 字符/token）在发送前对整份序列化请求估算，超过声明上下文只发一条 status、不截断。测试：新 `tests/modelDiagnostics.test.js`（31 组分类矩阵、措辞、敌意正文、估算、20 组尺寸解析）、`modelStreaming` ⑪⑫；文档：模型调用详解“错误分类与上下文估算”+1c 节、agent/README、技术实现、SECURITY、使用指南故障排除 |
| D-26 流式 400 回退与上下文超限同码 | 已修 | 第 6 批 / 第 103 组 | 流式尝试的 400 先分类：只有 `stream` 类（param 为 stream/stream_options 或消息含 stream(ing)）或无法归类的 `bad_request` 才去掉 `stream` 重试并记入 `STREAM_UNSUPPORTED`；context/auth/not_found/quota 等直接以分类文案失败，不再多发一次请求（`modelStreaming` ⑪：context_length_exceeded 恰一次请求且不进入 STREAM_UNSUPPORTED） |
| D-28 120 s 总期限切断长回答 | 已修 | 第 6 批 / 第 103 组 | `requestScope.fetchText` 新增 `limits.idleMs` 空闲预算（第二个 racer：响应头与每个片段之间静默超过 idleMs ⇒ `E_TIMEOUT reason:'idle'`，文案“HTTP 请求 N 秒内没有收到新数据”；先触发的预算拥有错误，总期限更短时仍报 deadline），并把自己的 signal 传给读取器（`limits.signal`），使不理会请求信号的传输也会在超时时取消 body。模型调用改为 `MODEL_TIMEOUT_MS=300 s` 总 + `MODEL_IDLE_TIMEOUT_MS=120 s` 空闲：逐字输出的长回答可跑满 5 分钟，静默 Provider 仍 2 分钟放弃；其余调用方（GitHub 10 s、遥测）合同不变。测试：`networkBudget`（滴流/静默/无头/短总期限/默认不变/onChunk 并存/父取消/非法值）、`modelStreaming` 常量与源码守卫 |
| P2-4 执行环境注入与凭据剥离透明化 | 已修 | 第 7 批 / 第 104 组 | `tools/executor.js` `prepareCommandEnv` 汇总环境净化，敏感凭据从子进程剥离并记入 `stripped`，注入环境变量记入 `injected`（允许用户显式覆盖 `CI` 等值）；命令执行返回记录中带结构化 `envSummary`；测试见 `executorEnv.test.js` |
| P2-5 POSIX Shell 动态探测与降级 | 已修 | 第 7 批 / 第 104 组 | `tools/executor.js` `detectPosixShell` 按顺序探测 `/bin/bash` → `/usr/bin/bash` → 绝对路径且名为 bash/sh/dash/ash 的 `SHELL` → `/bin/sh` → `/usr/bin/sh`（fish/zsh/nu/csh 等交互 Shell 不用于 `-c`，F105 复核修正），Alpine/容器环境不再崩溃；测试见 `executorEnv.test.js` |
| D-27 Chat 并发上限保护 | 已修 | 第 7 批 / 第 104 组 | `routes.js` 为 `/api/chat` 增加在途计数保护 `activeChatCount` 与 `MAX_ACTIVE_CHAT = 2` 上限，超出时以 HTTP 429 拦截并提示稍后重试，退出时必定释放；测试见 `chatConcurrency.test.js` |
| 其余 P3、4.1 字号 token/三栏（分栏拖拽）、4.3 工程项、第 6 节探针 | 待后续批次 | — | 4.1 字号 token 与三栏分隔条评估后延后，因为它牵涉 `styles.css` 106 处 font-size 与 Playwright 断言，需要能跑浏览器的环境逐视口核对；后续候选：UI 细化、工程产物治理 |

## 9. 深审新发现（报告成文后，按批次追加）

第 3 节是报告成文时的只读发现；这一节记录后续逐文件深审时新发现的问题，编号 D-n，处置状态以第 8 节为准。每条都先在修复前的代码上复现（`git show HEAD:<file>` 取旧实现实测），再修。

### 9.1 第 2 批（第 99 组，2026-09-29）：文件工具、敏感规则、扩展主机/终端

通读：`tools/fileOps.js`（全文）、`tools/patchEngine.js`（全文，含 `resolveSafePath`/`atomicWriteText`/`applyPatchBody`）、`tools/readCache.js`、`tools/sensitive.js`、`utils/boundedFile.js`、`utils/fileCheckpoints.js`、`utils/editorUndo.js`、`extension/hostManager.js`、`extension/ptyHost.js`、`extension/ptyPolicy.js`、`extension/apiRelay.js`、`extension/workspaceMatch.js`。

| 编号 | 严重度 | 位置 | 问题 | 证据（修复前） |
|---|---|---|---|---|
| D-1 | 中 | `src/tools/sensitive.js` `SENSITIVE_PATTERNS` | 内置名单只盖 `.env`/`.env.*`、私钥、`.ssh/`、`.aws/` 等，`prod.env`、`terraform.tfstate`、`.kube/config`、`.docker/config.json`、`.pypirc`、`.pgpass`、`.bash_history`、`.git/config`（远程 URL 里的令牌）都能被 `read_files`/`search_files` 读出，且远程 MCP 会话同样适用 | 旧模块实测：新测试的 31 个正例（`prod.env`、`.kube/config`、`.git/config` …）全部 false |
| D-2 | 中 | `src/tools/sensitive.js` `isSensitive` 自定义规则分支 | 内置规则按小写比对，自定义规则按原拼写比对；Node 的 `realpathSync` 在 Windows/macOS 上保留调用者给的大小写，逻辑路径与真实路径都不命中，`private/*` 规则被 `read_files "PRIVATE/x"` 绕过。详解文档原话“自定义规则不是统一小写匹配”把它当成了既定行为 | 旧模块 `isSensitive('PRIVATE/x')` 在规则 `private/*` 下为 false（任何平台） |
| D-3 | 中低 | `extension/ptyHost.js` `confirm` | 模态只显示 `command.slice(0, 400)`，无省略标记、无总长度；复合/危险命令总会询问，但 `echo <390 个字符> && rm -rf ~` 在弹窗里就是一条 echo。命中破坏性规则也没有任何提示 | 代码阅读 + 新测试 `confirmPreviewContract` 在旧代码上失败 |
| D-4 | 低 | `src/tools/fileOps.js` `listDir.scan` | 递归时子目录 `opendirSync` 抛 EACCES/ENOENT 直接冒泡，一个 chmod 000 的目录让整个 `list_directory` 失败；文件 `statSync` 在 readdir 之后消失同样整体失败 | 实测：tmp 工作区含一个 000 子目录，`listDir({recursive:true})` 抛 `EACCES: permission denied, opendir` |
| D-5 | 低 | `src/tools/readCache.js` `norm` | 只去反斜杠和首个 `./`，`src//a.js`、`src/./a.js` 与 `src/a.js` 是三个键；读过 `src/a.js` 后用 `src//a.js` 写会被当成没读过而要求 `confirm_overwrite`。写侧始终比对当前内容哈希，所以不是授权漏洞 | 实测：读 `src/a.js` 后 `writeFile({filePath:'src//a.js'})` → `E_BAD_ARGS Overwrite blocked` |

### 9.2 第 3 批（第 100 组，2026-09-29）：MCP OAuth / 会话 / 公网出站 / 隧道

通读：`mcp/oauth.js`（全文 648 行）、`mcp/session.js`、`mcp/server.js`（全文）、`mcp/publicHttps.js`、`mcp/externalClient.js`、`mcp/stdioLaunch.js`、`mcp/resources.js`（资源分支）、`tunnel/cloudflared.js`、`tunnel/ngrok.js`、`tunnel/processIdentity.js`、`tunnel/stopProcess.js`、`tunnel/tunnelRegistry.js`（读取/校验部分）、`tunnel/tunnelCleanup.js`（前半）。

| 编号 | 严重度 | 位置 | 问题 | 证据（修复前） |
|---|---|---|---|---|
| D-11 | 中低 | `src/tunnel/cloudflared.js` `startNamedTunnel` | Named Tunnel 以 `['tunnel','--no-autoupdate','run','--token', tok]` 启动，Tunnel Token 出现在命令行：同机任何用户 `ps -ef`/`tasklist /v`/任务管理器命令行列可见，崩溃转储与部分 EDR 日志也会记录；`.cmd`/`.bat` 包装时还经 cmd.exe 解析。ngrok 一直用 `NGROK_AUTHTOKEN` 环境变量，两条隧道的做法不一致，隧道指南也如实写着“Token 仍在命令行参数中” | 代码阅读；新断言在旧代码上红：`named: token must not be an argv item`。cloudflared 官方支持 `TUNNEL_TOKEN` 环境变量（Docker 文档与社区实践一致），日志遮盖器与 `processIdentity`（不看命令行）都不受影响 |
| D-12 | 低 | `src/mcp/oauth.js` `router.post('/oauth/revoke')` | register 20/分、authorize 30/分、token 60/分都有 `rateLimit`，唯独 revoke 没有；它与 token 一样调用 `authenticateClient` 校验 `client_secret`，所以是唯一可以无限次试探 secret 的端点（虽然 secret 是 32 字节随机值，不可能猜中，但与其余端点的策略不一致，也没有 429 观测点） | 新测试连发 61 次在旧代码上全部 200 |
| D-13 | 低 | `src/mcp/session.js` `touch` | 满 200 条时 `sessions.delete(sessions.keys().next().value)` 删的是**最早插入**而不是最久未见的记录，`Map.set` 对已有键不改变顺序：从启动就在线、每次都 touch 的调用者反而最先被删，calls/fail 计数归零，`GET /mcp`/任务板看到的“在线客户端”闪断；而 199 个来过一次的短命调用者仍留着直到 TTL | 新用例：veteran 先 touch，199 个调用者，veteran 再 touch，第 201 个进入 → 旧代码删 veteran（`the caller seen most recently survives` 红） |

### 9.3 只记录、暂不改（理由见各行）

| 编号 | 位置 | 说明 |
|---|---|---|
| D-6 | `fileOps.js` `writeFile` 目标是已有目录 | `readBoundedText` 抛通用 `Error('Expected a regular text file')`，没有 `E_*` 错误码，模型只能靠文案理解。建议改成 `E_BAD_ARGS` + “是目录”。改动小但牵涉 `readBoundedText` 的多处调用方，放到下一批与 `E_*` 码整理一起做 |
| D-7 | `patchEngine.js` `applySearchBlocks` | 精确匹配失败后的 trim 回退同时 trim 了 REPLACE 段，前后空白行会丢。文档已把它写成启发式；改行为会影响现有补丁语义，需要单独一组带矩阵测试 |
| D-8 | `extension/workspaceMatch.js` | 只在 win32 或盘符路径上小写比较，macOS（默认不区分大小写）上 `/Users/Me/x` 与 `/users/me/x` 判不同。两端路径都来自 `path.resolve`，实际拼写一致，仅在用户手填 URL 时可能触发；记录 |
| D-9 | `.git/hooks` | `.git` 只是噪声目录（隐藏不列出），模型可按路径 `write_file ".git/hooks/pre-commit"`；不过能写文件的模型本来就能用 `run_command` 做同样的事，不构成权限提升。F99 起 `.git/config` 归敏感 |
| D-10 | `extension/dangerousPolicy.js` `infraDangerous` | `kubectl delete` 不看资源类型/命名空间，`kubectl delete pod x -n dev` 与 `kubectl delete ns prod` 同级；只是保守，不是漏检 |
| D-14 | `oauth.js` `handleToken` 授权码分支 | `code_verifier` 不匹配时只抛 `invalid_grant`，授权码保留到 10 分钟过期；RFC 6749 §4.1.2 建议同一 code 被二次使用时作废。PKCE 用 S256、verifier 43–128 字符，离线猜不中，且 token 端点 60/分限流，实际风险极低；改为“失败即作废”会让手抖填错的客户端必须重新配对，先记录 |
| D-15 | `oauth.js` `pruneClients` | 注册槽 80 个、单 IP 20 次/分：同一来源 4 分钟即可用无授权码的空注册占满，其他客户端在 5 分钟空闲回收前得到 503。OAuth 默认关闭、只在公网隧道场景开启，且本机操作者可 `revokeAll`；建议后续按 IP 限制空闲注册数（例如 ≤10） |
| D-16 | `server.js` `GET /mcp`（hostStatus） | 任何通过认证的调用者（包括 OAuth 配对的外部客户端）都能看到其他调用者的 key（含 IP）、clientInfo、调用计数和 `workspaceRoot` 绝对路径。单操作者产品里这是“本机状态页”，但公网 OAuth 场景下属于跨调用者信息暴露；建议远程 principal 只回自己的记录 |
| D-17 | `server.js` `resources/list` | 不像 `resources/read` 那样 `assertAllowed('read_files')`；返回的只是 8 个固定 `webagent://` URI 与说明，不含内容，故无实际泄露 |
| D-18 | `mcp/publicHttps.js` | 用 `https.request` 且不跟随 3xx：注册的公网 MCP 服务器若返回 301/302 会直接失败。这是 SSRF 防线（重定向可指向内网）的一部分，属有意设计，只需在“公网出站详解”里保持说明 |

第 3 批复核无问题（不列为发现）：PKCE 只接受 S256、refresh 轮换 + 重放墓碑整族作废、跨 client refresh 拒绝且不消耗、`requestOrigin` 仅回环才信 Host、`redirect_uri` 只允许 https 或回环、授权页 HTML 全部转义、`rateLimit` 有 1000 键上限与最早过期回收、`verifyAccessToken` 定长比较；`publicHttps` 的 IPv4/IPv6 黑名单（含 v4-mapped v6）+ 固定解析结果 + 无凭据/查询串；`server.js` 的信封/批量 ≤64/协议头校验、SSE 上限 32 与 10 分钟空闲、会话销毁绑定 principal、`initialize` 前先 `bindHttpSession`（`handleRpc` 里的 `incomingSessionId` 回退只在测试直接调用时可达）；`externalClient` 仅回环或显式确认的公网 HTTPS、`redirect:'error'`、工具清单 100 条/10 页/256 KiB 上限、每次调用都进审批队列；`stdioLaunch` 绝对路径 + 哈希绑定 + 拒绝 shell/包管理器；cloudflared/ngrok 的代次/票据启停逻辑与跨 chunk Token 遮盖；`tunnelRegistry` 的目录/文件权限与 inode 校验。

第 2 批复核无问题（不列为发现）：`resolveSafePath` 对 UNC/盘符/Windows 保留名/8.3 短名/`..`/realpath 逃逸的拒绝，`atomicWriteText` 的临时文件+rename，`applyPatchBody` 对新文件/哈希/统一 diff 的门控，`apiRelay` 的白名单与路径规范化拒绝，`hostManager` 的端口探测/就绪等待/仅停止自己启动的主机，`fileCheckpoints`/`editorUndo` 的预检-执行-不可重放约束。

### 9.4 第 4 批（第 101 组，2026-09-29）：Monaco 分发、工作台 CSP、安装器载荷

本批只围绕 P1-1 展开，但顺带复核了与它相邻的三处：安装器白名单、OAuth 配对页响应头、浏览器测试夹具。新增发现与处置见第 8 节 D-19…D-21；以下三项只记录：

| 编号 | 位置 | 说明 |
|---|---|---|
| D-22 | `contentSecurity.workbenchPolicy` `style-src 'self' 'unsafe-inline'` | Monaco 0.52 运行时向 `<head>` 写内联样式、给节点设 `style=`，`index.html`/`app.js` 也有若干 `style=` 与 `.style.x=`；哈希只覆盖 `<style>` 元素，不覆盖属性，所以样式段暂时保留 `'unsafe-inline'`。风险面：CSS 注入只能改外观/做有限的信息外泄（例如背景图请求），而 `img-src`/`font-src`/`connect-src` 已把外泄目的地限制在同源与 `data:`/`blob:`，实际可利用性低。脚本段已无 `'unsafe-inline'`，这才是 P1-1 的核心 |
| D-23 | `workbenchPolicy` 的 `connect-src` 取自 `req.headers.host` | `ws:`/`wss:` 在部分浏览器不被 `'self'` 覆盖，只能点名；Host 已先经本机控制面的 Host 门禁（非本机 Host 的工作台请求本就 404），再经 `HOST` 正则（主机名或 IPv6 字面量 + 可选端口）校验，不合法就退回只有 `'self'`（只会让 WS 连不上，不会放宽）。因此不是注入点，但意味着经反向代理改写 Host 的部署要保证浏览器看到的 host 与后端收到的一致 |
| D-24 | `extension/settingsPanel.js` webview | VS Code 设置页有自己的 nonce CSP（`connect-src 'none'`），不经过 `contentSecurity.js`，且它对 `index.html` 的头部做逐字符串替换（html 标签、charset、title、favicon、主题脚本、样式链接、`app.js` 入口），任何偏差都会抛错——这就是本批把 CSP 放在响应头而不是 `<meta>` 的原因。两套策略各自独立，改一处不会同步另一处，文档已分别写明 |

第 4 批复核无问题（不列为发现）：`vendor-monaco.js` 用 `npm pack` 的 tarball sha512（写死在脚本与 VERSION.json）而不是信任 registry 元数据；`express.static` 对 `..%2f` 的拒绝（实测 403/404）；`/vendor/monaco` 缺文件走 `fallthrough:false` 的 404 而不是落到 SPA 回退把 `index.html` 当 JS 返回；`monaco.js` 在 nls 文案加载失败时仍装出编辑器（英文界面）而不是整体退回纯文本；主题内联脚本哈希在模块加载时算一次，改脚本后必须重启主机（已写入页面结构详解与入口详解）；沙箱里 `cdn.jsdelivr.net` 恰好不可达，正好复现了旧实现 7 秒后退化的路径，新实现在同一沙箱用 curl 拿到 loader/nls/字体均 200。未验证：真实浏览器里策略下的 Monaco 行为——沙箱装不了 Chromium，只能由 CI 的 `contentSecurityBrowser`（等 JS 模型出现 TypeScript 诊断标记，证明 blob 引导的 worker 能跑）给出结论。

### 9.5 第 5 批（第 102 组，2026-09-29）：流式输出

本批围绕 P2-2 展开。做之前先读了 `openai.js`/`requestScope.js`/`routes.js`/`runChat.js` 与三个客户端的事件消费，下面是实现时发现、且若不处理会让“加一个 delta 事件”出错的点，以及有意不做的项：

| 编号 | 位置 | 说明与处置 |
|---|---|---|
| D-25 | `runChat.js capturingEmit` | 只吞 `message`、转发其余事件。若照常转发 `delta`，Plan 分支正在生成的分片会被客户端画进一个没有分支信息的气泡，merge 的分片还会和分支分片混在一个气泡里，随后 `emitRound` 再发一次全文 ⇒ 双份。已修：`capturingEmit` 也吞 `delta`；Plan 因此不逐字显示（有意，文档已写明）。 |
| D-26（第 6 批已修） | `openai.js` 对 400 的解释 | 流式回退把“Provider 不接受 stream”与“上下文超限/参数非法”这两类 400 混在一起：第一次 400 都会触发一次非流式重试。代价是多一次请求（上游按 token 计费的请求在 400 时通常不计费），收益是不需要按模型配置开关。更细的分类需要读取上游错误正文的 `error.code`（本项目有意不回显正文，但**受控读取**并映射到固定文案是可行的），这与 P2-3 的建议是同一件事，留待一并处理。 |
| D-27（第 7 批已修） | `routes.js /chat` | 服务端对并发 Chat 增加在途计数门禁（`activeChatCount >= MAX_ACTIVE_CHAT = 2`），超出返回 HTTP 429，防止工作台连击或脚本并发耗尽主机资源与模型上下文。 |
| D-28（第 6 批已修） | `fetchText` 120 s 期限 | 是**总期限**不是空闲超时：现在长回答能看到文字了，但超过 120 s 的单轮仍会被切断（`E_TIMEOUT`，已显示的半截不入历史）。改为“首字节 N 秒 + 空闲 M 秒”需要同时改 `requestScope`、GitHub/遥测调用方的合同与 networkBudget 测试，超出本批范围；记录为后续项。 |
| D-29 | VS Code 原生 Chat 参与者 | 原生 `stream.markdown` 是追加式的，最终 `message` 若照旧整段写会出现两遍；且连续两段 assistant 文本（工具轮之间）之前没有分隔。已修：只补写余量、段间一个空行；`nativeChatStream` 用 `written.join('')` 精确断言。 |
| D-30 | `completionStream.js` 的 `Array.prototype.some` | 稀疏数组（工具 `index` 有洞）上 `some` 会跳过空洞，序号检查形同虚设；写测试时发现，改为下标循环。列出来是提醒：所有“按远端给的 index 写数组”的代码都要用循环而不是高阶函数做完整性检查。 |

本批复核无问题（不列为发现）：`routes.js` 的 `emit` 每事件一行 JSON、不缓冲，`X-Accel-Buffering: no` 与 `flushHeaders()` 已在，所以 `delta` 无需改路由；三个客户端的 NDJSON 解析器都是“未知 type 忽略”，旧客户端对新事件天然兼容；`chat.js` 的 5 分钟总期限、单行 1 MiB/总 16 MiB 预算对分片同样适用（分片 ≤ 数百字节）。未验证：没有真实 Provider（OpenAI/DeepSeek/兼容网关）上的 SSE 实测，`reasoning_content` 等非标准字段被丢弃而不是显示；Windows 上 VS Code 原生 Chat 的渲染节奏未看。

### 9.6 第 6 批（第 103 组，2026-09-29）：上游错误归类、上下文估算、空闲期限

本批处理 P2-3、D-26、D-28。三者都在 `openai.js`/`requestScope.js` 这一层，一起改一起测。实现中新增或坐实的发现：

| 编号 | 位置 | 说明与处置 |
|---|---|---|
| D-31 | `requestScope.readWebStream/readNodeStream` | 期限与空闲计时器只 `controller.abort()`，body 的取消完全依赖传输层把请求信号连到响应流。真实 `fetch` 会这么做，但任何不理会信号的传输（测试替身、polyfill）会让 `reader.read()` 永远挂起、reader 锁不释放。已修：fetchText 把自己的 signal 交给读取器（`limits.signal`），abort 时直接 `reader.cancel()`/`body.destroy()`；这也是“预算由本机强制、不靠对端配合”原则的收尾。 |
| D-32 | `openai.js` 对 200 响应的解释 | 部分兼容网关用 HTTP 200 承载 `{"error":{…}}`，旧代码走到 `normalizeAssistantMessage` 报“模型没有 message”，用户无从判断。已修：200 且正文含 `error`、无 `choices` 数组 ⇒ 按信封归类（“模型返回了错误：……”）。 |
| D-33 | 模型目录 `contextSize` | 是 ≤64 字符的展示文本（`providers.probeContext` 产出 128K/1M/数字，用户也可手填），不是数值字段；估算提示只能在能解析时给出，解析不出就沉默。若将来要做按 token 裁剪，应先给目录加数值字段而不是解析展示文本。记录，不改。 |
| D-34 | `routes.js /chat` 5 分钟总上限 vs 每轮 300 s | 一轮模型请求现在可达 5 分钟，与整次 Chat 的 5 分钟路由上限、工作台/插件各自的 5 分钟客户端期限相等：多轮工具循环加上一次长回答会以 `E_CANCELLED`/“结果未确认”收场而不是模型层超时。三处期限现在有耦合关系但没有单一来源；调大任何一处都要同时看另外两处。记录，不改。 |
| D-35 | 归类规则的覆盖面 | 只认 OpenAI/Anthropic 风格的字符串错误码与少数英文/中文消息形状；数字错误码（智谱、百度等）一律按 HTTP 状态兜底，因此 200+数字码的信封只能显示“模型返回了错误”。不打算维护各家私有码表；记录。 |

本批复核无问题（不列为发现）：`runChat` 对模型异常只转发 `err.message`（现在是固定文案），Bridge/MCP 路径不经过 `runOpenAI`，不受影响；`providers.js` 的 15 s/512 KiB 目录发现调用没有传 `idleMs`，其响应是一次性 JSON，无需空闲预算；`STREAM_UNSUPPORTED` 记忆仍是进程内的。未验证：真实 Provider 的错误信封形状按公开文档（OpenAI、Anthropic 兼容层、vLLM 422）编写；Windows 上未跑。

### 9.7 第 7 批（第 104 组，2026-09-30）：执行环境透明化、Shell 探测与 Chat 并发上限

通读与深审范围：`tools/executor.js` 执行环境构造与子进程生成、`api/routes.js /chat` 在途并发控制与端点保护。

| 编号 | 位置 | 现象与复现 | 影响与处置 |
|---|---|---|---|
| D-36 | `executor.js prepareCommandEnv` | 用户若在启动环境或调用时显式指定了 `CI=false`，原先无条件 `{ ...scrubEnv, CI: 'true' }` 会把用户的设定粗暴覆盖。 | **已修**。`prepareCommandEnv` 仅在用户未显式设置 `CI` 时默认注入 `CI: 'true'`，尊重调用方的明确要求。 |
| D-37 | `executor.js startProcess` | 命令执行虽然剥离了凭据并注入了 `CI`/`TERM`/`FORCE_COLOR`，但调用方和上层只拿到 stdout/stderr，完全无法知晓哪些环境变量被删去、哪些被注入。 | **已修**。执行记录 `rec` 及公开投影 `publicRecord` 中新增 `envSummary: { stripped: [...], injected: [...] }` 结构化对象，透明化所有环境变动。 |
| D-38 | `executor.js detectPosixShell` | 非 Windows 平台写死 `/bin/bash`，在最小化容器或 Alpine 镜像（仅有 `/bin/sh`）下 `spawn` 抛出 `ENOENT`。 | **已修**。引入 `detectPosixShell`，依次探测 `/bin/bash` → `/usr/bin/bash` → 绝对路径且名为 bash/sh/dash/ash 的 `SHELL` → `/bin/sh` → `/usr/bin/sh`（fish/zsh/nu/csh 等交互 Shell 不用于 `-c`，F105 复核修正），确保任何 POSIX 容器环境均能平稳降级执行。 |
| D-39 | `routes.js /chat` | `/api/chat` 无在途计数限制，同一客户端或多个客户端若并发发起多次长会话或模型调用，会造成宿主进程及后端上下文严重拥堵。 | **已修**。增加 `activeChatCount` 门禁，`MAX_ACTIVE_CHAT = 2`；超过上限时直接返回 HTTP 429 与友好文案，请求结束或异常中止时必定调用 `releaseChat` 归还槽位。 |

## 附录 A：本轮使用的命令

```
git fetch origin --prune && git merge --ff-only origin/arena/01a0d084-web-agent
cd webagent-core/agent-host && npm ci --include=dev && npm run lint && npm test && npm audit && npm outdated
node docs-site/check-docs.js
node -e "const {TOOLS}=require('./webagent-core/agent-host/src/tools');console.log(TOOLS.length)"
python3 -m py_compile <18 个 .py> ; python3 -m pyflakes <18 个 .py>
diff -rq webagent-core/extension webagent-core/extensions-installed/webagent.webagent-core-0.7.2
```

## 附录 B：发现编号速查
P1-1 Monaco CDN 无 SRI · P2-1 危险命令漏检矩阵 · P2-2 非流式 · P2-3 上下文无 token 估算 · P2-4 CI=true/环境剥离不透明 · P2-5 硬编码 shell/端口 · P2-6 陈旧提示文案 · P2-7 同名下拉项 · P2-8 无门控轮询 · P3-1…P3-15 见第 3 节表 · D-1 敏感规则缺口 · D-2 自定义规则大小写 · D-3 终端弹窗截断 · D-4 list_dir 整体失败 · D-5 读取缓存键 · D-6…D-10 见第 9.3 节。 · D-11 cloudflared Token 走 argv · D-12 revoke 无限流 · D-13 调用者表非 LRU 驱逐 · D-14 PKCE 失败不作废 code · D-15 单 IP 占满注册槽 · D-16 状态页跨调用者可见 · D-17 resources/list 不查开关 · D-18 publicHttps 不跟随重定向（有意） · D-19 安装器白名单漏 .ttf · D-20 OAuth 配对页无自有 CSP · D-21 浏览器测试重复 CDN 路由 · D-22 style-src 仍 unsafe-inline · D-23 connect-src 取自 Host · D-24 webview 策略独立 · D-25 Plan 捕获需吞 delta · D-26 400 回退与上下文超限同码 · D-27 Chat 无并发上限 · D-28 120 s 总期限非空闲超时 · D-29 原生 Chat 追加式写入 · D-30 稀疏数组 some 跳洞 · D-31 超时不取消不配合的 body · D-32 200 承载错误信封 · D-33 contextSize 是展示文本 · D-34 三处 5 分钟期限耦合 · D-35 私有数字错误码不识别 · D-36 CI用户设定被覆盖 · D-37 执行环境变动不透明 · D-38 POSIX无bash时ENOENT · D-39 Chat并发无门禁
