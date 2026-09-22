<!-- 定位：阶段10的目标、需求、设计、实现计划、交接约束、验证证据与复盘；由CONTEXT按需导航。 -->

# 阶段10：继续上游借鉴与文档整顿

## 目标

继续完成已授权的剩余施工，并正式开展全仓逐句审查；不将候选、暂停或未实机项目当成已完成。当前焦点与最近验证从[管理索引](../CONTEXT.md)进入。

## 需求

- 用户持续要求完成此前待办、及时推送、逐句对照并整理/更新/退役文档。
- 用户要求交接彻底并入原项目管理，不新增独立路线文件或平行交接入口。
- 探测专项保持暂停，等待外部正式交接；原有失败、授权和用户验收边界不变，见[阶段8](s8-probe-integration.md)。

## 设计

沿用项目管家既有L0/L1/L2：AGENTS发现规则；CONTEXT/agents提供轻量索引与约定；本阶段承载计划、完成条件、交接和证据；专项规范留manager/docs。没有改动只读manager/SKILL.md或project-manager技能原文，也不新增管理文件类型。

工作包状态只维护在下面的表中；后面的实施批次是历史过程，不能把其中“当前/下一项”直接当今天的指令。正式审查的文件覆盖留在review清单，不另排项目优先级。

## 实现

### 当前工作包与交接约束

两项当前任务：继续全部剩余待办，同时按[正式全仓逐句审查清单](../../review/FULL_REVIEW_INDEX.md)逐文件开展正式审查；整理和测试不代替逐句核对。

> 更新：2026-09-21。面向接力助手与项目主人，不替代产品《使用指南》。本交接以Git checkout为准，安装包不保证包含开发测试/管理资料。这是经管理索引按需进入的现行施工计划与交接约束，不是“全部完成”报告。每次完成一项，应更新对应路线状态和证据，而不是只在末尾追加新结论。

#### F62 独立复审（2026-09-22，本会话）

用户要求"自己独立再做一遍完整审查与修复"，与F61报告**交叉验证**而不是复述。基线`2f6e7ab`（已从`arena/01a0bfa9-web-agent`ff-only快进），绑定分支`arena/01a0c925-web-agent`，进入时本地97/97。

独立取证手段（脚本在沙箱`/tmp/audit/`，非仓库内容，随沙箱消失，结论记在此处）：非暂停区跟踪js/cjs/mjs逐个`node --check`零错、跟踪json逐个`JSON.parse`零错、`src`空catch零命中；文档链接扫描缺失锚点0/缺失文件目标2；workbench 38处innerHTML全部经escapeHtml或renderMd；自建临时仓库复现git子目录越界与重命名双侧name-status行为。

**第1批已修并测绿（100/100测试文件）：**

| 项 | 独立复现的事实 | 修法 | 红测 |
|---|---|---|---|
| F62-01 敏感规则加载 | 600项目录一次列目录里`.webagentignore`被完整读601次；448KiB规则文件把扫描放大约90倍 | 按"工作区根+规则文件stat身份"缓存解析结果，globRegex按模式memo（上限2048）；新增512条/64KiB上限与`customRuleStatus()` | `sensitiveBoundary.test.js` |
| F62-02 git越界与broad diff | 工作区是仓库子目录时status/diff投影出工作区外文件；不带路径的diff整体返回含已跟踪`.env` | status/diff一律附`-- .`并按`--show-prefix`裁剪；无filePath时先枚举差异路径、逐条套用与显式diff相同的敏感规则，再以allowed作白名单取差异，上限300条 | 同上 |
| F62-03 非法UTF-8同hash | `41 ff 0a`与`41 fe 0a`宽松解码后同为`A\uFFFD\n`、同一hash，据前者取得的hash可覆盖后者 | `readBoundedText`先拼齐字节再整体解码（跨块多字节不再被切断），默认严格UTF-8，非法抛`EncodingError`/`E_ENCODING`（不可重试）；仅grep与memory.recall两条纯扫描路径传`{strict:false}` | `textEncoding.test.js` |
| F62-04 同步diff无预算 | 8000行全文替换同步占住宿主事件循环数秒 | `createUnifiedDiff`改为单次`structuredPatch`（原先算两遍），带1500ms/20000编辑预算，超限抛`E_DIFF_BUDGET`；patchEngine新建分支改为先渲染后落盘，拒绝对应零写 | `diffBudget.test.js` |
| F62-05 admin坏存储 | 损坏`reports.json`被当空库，下一条上报整体覆盖历史 | 区分"缺文件/零字节＝空库"与"能读到但不是JSON数组＝损坏"；损坏时读写都抛`E_STORE_CORRUPT`并保留原字节，发布走临时文件+rename | 同上 |
| D2 陈旧注释 | `computerUse.js`/`mcp/server.js`指向已归档的`review/REPORT_SHUNCODE_S3.md` | 改为`review/archive/` | 无 |
| D5 扩展副本死链 | `extensions-installed/…/PTY扩展详解.md`两条相对链接在副本层级失效，但`extensionCopy`要求逐字节一致 | 不改副本；在`extensions-installed/README.md`登记原因并指向源文件，同时补齐副本文件清单 | 无 |

三个新红测都用`git stash`回到基线验证过确实为红（非"写完就绿"的空测）；已加入`scripts/run-tests.js`的preferred列表。相关正文已改（`SECURITY.md`、`使用指南.md`、tools/utils/tests/admin-host的README与中文详解、本表第85行Git只读工具边界），再走`check-docs.js --write`与`build.js`。

**第2批已修并测绿（101/101）：**

| 项 | 独立复现的事实 | 修法 | 红测 |
|---|---|---|---|
| F62-08 身份裸fetch | `auth/github.js`三个外发请求无signal/超时/字节上限，端点黑洞时登录与设备码轮询永久挂起 | 统一经新的`githubJson`走`fetchText`，默认15s超时+1MiB上限；错误消息不回显原始正文 | `networkBudget.test.js` |
| F62-09 遥测裸fetch | `usage/tracker.js`同样无超时，而它跑在4秒debounce与15分钟周期里，不可达端点会让每个tick叠加一个永不结束的请求 | 经`fetchText`，10s超时+256KiB上限；请求层失败转`{ok:false}`而非抛出 | 同上 |
| F62-10 readCache空转重写 | 重复读同一未改动文件时每次重写整张表（400次读＝400次整表写、6.2MB） | 已是最新且hash未变只更新session不落盘；删不存在的key不落盘；persist改临时文件+rename | 同上 |
| — | `fetchText`原本写死全局fetch，无法覆盖已公开`fetchFn`注入点的模块 | 新增`options.fetchImpl`，注入传输照样受超时/预算约束，发出前剥离 | 同上 |

`networkBudget.test.js`有一个**必须保留**的细节：文件末尾持有一个referenced的`setInterval`保活句柄。`fetchText`的deadline计时器是`unref`的（正确行为），生产里有HTTP服务器撑着事件循环，测试进程里没有——少了保活句柄，Node会在黑洞请求还在飞时直接以0退出，后面的断言一条都不跑，测试"通过"其实是空转。删掉它等于注销这个测试。

**第3批已修并测绿（101/101）：UI 字号与排版**

先纠正上一批留下的一处错误记载：`workbench/styles.css`**不是**"零`@media`"，实际有4处（980px与700px各两处），窄屏抽屉、工作区切换、模态导航都已有响应式规则。真正的缺陷是**排版而非布局**——104处font-size全是硬编码px，浏览器与操作系统的字号设置对本工作台完全无效，大量次要文字（时间戳、胶囊、工具卡正文）被钉死在11px，用户没有任何办法调大。

修法：引入`--fs-xs`(0.6875rem≈11px)到`--fs-hero`(2.625rem≈42px)的rem字阶，104处font-size全部改为引用字阶，默认16px根字号下渲染与原来逐像素一致；`html { font-size: calc(100% * var(--text-scale, 1)); }`把标题栏新增的A-/A+控件接进同一套字阶（`--text-scale`设在`<html>`，挂到`<body>`的模态与浮层一起缩放；`100%`是继承来的浏览器/系统字号，故系统设置与本控件**相乘**而非互相覆盖）。范围0.85–1.6，到端点按钮置disabled而不是静默无反应，aria-label播报当前百分比，选择持久化在localStorage。

守卫：`workbenchHtml.test.js`新增断言——样式表里不得再出现硬编码px字号（已用旧样式表验证确为红）、字阶变量与`--text-scale`根规则必须存在、每条font-size都必须解析到字阶、两个按钮必须有aria-label；`workbenchRuntime.test.js`在真实ES模块上验证钳制、持久化、坏存储（`not-a-number`/`99`/`-5`/`0`/空串）回退与storage不可用不崩。

另复核一项前批列为"待修"的疑点并**判定为非缺陷**：`patchEngine`回退到可跨重启的`recalledHash()`、而`write_file`只认本进程的`sessionHash()`，这个口径差异是有意的——补丁自带SEARCH/REPLACE或diff上下文，内容对不上会先失败；`write_file`整块覆盖没有任何内容级校验，若也认落盘hash，新进程就能凭上次运行留下的记录盲覆盖文件。已实测确认（清空session后write_file报`E_BAD_ARGS`、apply_patch仍成功），并把这条"不要统一掉"的理由写进`src/tools/README.md`。

**第4批已修并测绿（102/102）：命令输出编码与危险命令包装器**

本批开始审查此前明确未覆盖的面：`tools/executor.js`、`tools/index.js`、`api/routes.js`、`agent/runChat.js`、`tools/dangerous.js` 与 `extension/dangerousPolicy.js`。

| 项 | 独立复现的事实 | 修法 | 红测 |
|---|---|---|---|
| F62-11 命令输出跨块损坏 | `executor.js`对每个stdout/stderr块各自`data.toString()`。管道分块边界由OS决定、不对齐字符边界，逐字节输出"项目已完成"实测返回**15个U+FFFD**。模型会把损坏输出当作真实结果去推理 | stdout/stderr各持一个`StringDecoder('utf8')`，不完整尾字节留到下一块拼齐；close/error时`flushDecoders()`把截断残余以单个替换字符收尾而非丢弃 | `commandEncoding.test.js` |
| F62-12 危险命令包装器绕过 | `sudo rm -rf /`**未被识别**。同类还有nohup/setsid/nice/ionice/stdbuf/time/command/exec/xargs/env前缀。这既不是编码混淆也不是环境变量间接，就是原命令前加一个词 | 新增`ARGV_WRAPPERS`与`stripWrappers()`，剥掉同argv包装器（含其自身带值短flag）与`env`的`-i`/`VAR=value`前缀后递归判定；剥壳只能更严、不能洗白已命中的命令 | `dangerousCommands.test.js`扩充 |

`dangerousPolicy.js`改动已同步到`extensions-installed`副本（`extensionCopy`要求逐字节一致）。同时用31条日常命令验证**零误报**（`npm test`/`git status`/`time npm test`/`sudo -v`/`env | sort`等）——误报会逼用户整个关掉保护，比漏报更糟。

**明确记录为"不覆盖"并用断言钉住**：`bash -c "rm -rf X"`、`eval "..."`、`python -c`/`node -e` 正文、`$(echo rm)`命令替换。这些需要重新解析字符串或进入解释器，词法检测器做不到，真正兜底的是进程组终止与工作区路径限制。测试里有专门断言防止有人误以为它是沙箱。

**本批复核未发现问题的**：`/files/preview`直接调`diff`但正确把budget的`undefined`判成413；`stdioTransport.js`按字节缓冲、不受同类编码缺陷影响；隧道日志只匹配ASCII URL故分块解码无实质影响；API全面经`rejectUnlessLocalControl`+`rejectCrossSiteApi`；`runChat`的`detectTestCommand`虽取自配置但仍过`callTool`→`assertCommandAllowed`。另实测fork bomb（`:(){ :|:& };:`）词法层未识别但进程组终止成功回收，无残留进程。

**第5批已修并测绿（103/103）：交叉验证与OAuth墓碑预算**

本批先与并行审查分支`arena/01a0c932-web-agent`（顶点08aa942）做交叉验证，再继续未审面。完整台账见[交叉验证合并台账](../../review/CROSS_VALIDATION_LEDGER_2026-09-22.md)。

比对结果：4项独立同解（互证）、1项互补（GitHub身份请求，本分支管上游超时、对方管客户端断开取消，**须取并集**）、本分支独有3项（命令输出编码、包装器绕过、UI字号）、对方独有1项（`run-code-oss`安装回退）、**分歧1项**。

| 项 | 事实 | 处置 |
|---|---|---|
| F62-13 BOM被静默删除 | 本分支严格解码用`ignoreBOM:false`。该参数语义反直觉：`true`才是"保留BOM为普通字符U+FEFF"，`false`会剥掉它。后果是一次普通read→patch→write把用户文件的BOM删掉（实测首三字节`efbbbf`消失），而严格解码的全部意义就是"重编码==磁盘字节"。**对方做对、本分支做错** | 改为`ignoreBOM:true`；测试断言由`endsWith`（两种行为都通过、等于没测）改为往返断言+端到端断言 |
| F62-14 `spentRefresh`无容量上限 | refresh重放墓碑只在7天TTL后清理，无条数上限。已配对客户端持续轮换，按限流60/min×7天约60万条、每条约188字节、合计约109MB。`oauth.js`其余存储都有界（MAX_CLIENTS=80、限流表1000），这张表是唯一例外 | `MAX_SPENT_REFRESH=5000`+按Map插入序淘汰最旧。**代价写明**：被淘汰墓碑的重放降级为普通`invalid_grant`、不再额外撤销该client全部令牌；拒绝本身不变 |

F62-13 最值得记的不是缺陷本身而是**为什么自测没抓到**：实现与测试由同一人带着同一个错误假设写成，断言用`endsWith`两种行为都通过，等于把错误确认了一遍。这是单人审查的结构性盲区，也是交叉验证的直接收益。

**本批复核未发现问题的**：`oauth.js`的PKCE强制S256且校验43字符形状、`redirect_uri`精确匹配且仅允许https或回环http、`authenticateClient`用`timingSafeEqualString`且校验注册时声明的认证方式、`clientIp`不回退到可伪造的转发头、`randomPairingCode`用32字母表对256取模无偏、配对码5分钟且按**已验证的**clientId计尝试次数（攻击者无法用伪造ID挤掉他人配额）、`registerClient`在校验全部通过后才改注册表。

**对方独有项复核**：`run-code-oss.js`把依赖安装交给`runPreparation()`统一持有直接子进程（带timeoutMs与signal），避免双重清理策略；本分支未审过该文件，认可其方案，无异议。

**第6批已修并测绿（104/104）：吸收并行分支的互补与独有修复**

对方分支`arena/01a0c932-web-agent`已冻结，本批把其独有与互补项逐条复现后吸收。**未直接照搬**：每项先在本分支代码上复现缺口，确认属实才改，改完验红。

| 项 | 复现结论 | 处置 |
|---|---|---|
| C1 身份请求生命周期 | 缺口属实。客户端断开后上游signal不abort（基线false/修后true）。超时预算只解决"上游不回话"，不解决"客户端已经走了" | 吸收`identityRequest()`，`/bridge/token`、`/bridge/device`、`/bridge/device/poll`统一包裹；回错补`code`、写响应前查`res.destroyed`。新增`identityRequestLifetime.test.js` |
| B1 依赖准备无期限 | 缺口属实。模拟卡住的install，5秒后无任何期限介入，只能靠用户Ctrl+C；且登记进`children`，停止路径会对`runPreparation`已持有的进程再套9秒服务器宽限，两套清理策略叠加 | 改由`runPreparation()`独占持有（120s deadline + `controller.signal`），移出`children`。吸收对方harness沙箱化改造+8条新测 |
| X1 gitOps子目录前缀 | **台账原判有误**：本分支在`c7acac4`就已有`workspacePrefix()`+`stripPrefix()`。实测工作区为`<repo>/sub`时路径已正确剥前缀、未泄露仓库顶层文件 | 无需吸收，已更正台账 |

**B1 连带发现**：`codeServerLifecycle.test.js`的harness用`vm`注入假`child_process`，但`preparation.js`自己`require('child_process')`会**逃出沙箱跑真实npm**（实测报`npm.cmd: not found`，确在尝试真实安装）。对方的harness改造把`preparation.js`也放进同一沙箱，必须一并吸收，否则测试会真的动网络。

**C1 写测试踩的坑（记录以免重演）**：最初把红测合写进`networkBudget.test.js`，**基线也绿**。原因是`github.js`的模块级身份状态（`identityGeneration`/`pendingDevice`）会作废在途尝试，同进程中早先的身份测试在约150ms就把本测试的上游调用abort掉，断言**因错误原因**通过。改独立文件才消除歧义。通用教训：**新测试变绿要先确认它是为正确的原因变绿**。

**第7批已修并测绿（本地104/104 + CI 35794970708 九job全绿）：Windows回归与新审面**

本批先追查一个**我自己造成的**CI回归，再继续未审面。教训优先记录：**本地全绿不等于没回归**——我连推四个提交，Linux 全绿而 Windows 三个 Node 版本全红，而我直到开始审 `.github/workflows` 才发现。此后每批必须查 CI 结论，不能只看本地。

| 项 | 事实 | 修法 |
|---|---|---|
| F62-15 BOM保留破坏JSON配置 | 我在 `710f6c3` 把解码改成 `ignoreBOM:true` 保证字节往返，但 `JSON.parse` 遇前导 U+FEFF 直接抛错。Windows 编辑器（记事本、PowerShell `Out-File`）写配置带 BOM，于是带BOM的配置被当成损坏文件报给用户 | 新增 `readBoundedJsonText()=stripBom(readBoundedText())`，剥离**只放JSON这一侧**：文本读取仍字节往返、hash 仍忠实，带BOM配置也能加载。`stripBom` 只剥一个，第二个 U+FEFF 是真实内容。改到 `customizations.js`/`profile.js`/`board.js` |
| F62-16 测试用POSIX-only语法 | `commandEncoding.test.js` 用 `printf "x" >&2; exit 3`，cmd.exe 无此语法。等于该测试此前只在 Linux 真正跑过 | 三处改为先写 `.js` 再 `node` 执行 |
| F62-17 **Windows丢失原生退出码** | 改成纯 node 脚本后 Windows 仍在同一断言失败 ⇒ 不是测试问题而是**产品缺陷**：`powershell.exe -Command` 取最后一条语句的状态，多语句脚本按管道成败给 0/1，丢掉原生程序真实退出码（`exit 3` 收到 1）。`rec.status`/`rec.ok` 均由此码推导，Windows 上主机**静默误报**哪些命令失败 | guardedCommand 末尾补 `if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`（`$LASTEXITCODE` 仅在跑过原生程序后有值，故需 null 判断） |

**取证方法记录**：本沙箱下载 CI 日志被 TLS 阻断（与 Chromium 下载同一问题），改用 `gh api repos/.../check-runs/<id>/annotations` 拿到真实断言与 platform/node，不靠猜测。这条对后续排查 Windows 问题直接可复用。

**本批复核未发现问题的**：`mcp/server.js` 实测认证（无token/错token均401）、batch上限64、重复`Mcp-Session-Id`头拒绝、未知会话404、GET状态页不泄露secret、SSE上限32且计数正确回收、250次SSE开关不钉死会话表、断开后批次余项确实停止执行；`mcp/resources.js` 是固定枚举无任意文件读取，F54-04 已修且有既有测试覆盖；workbench 前端 114 处模板插值全部经 `escapeHtml`/整数校验，`renderMd` 先转义后替换、14 条XSS载荷无标签逃逸，`treeHtml` 递归深度前置校验上限8，33 处 fetch 均经 `confirmedJson` 或显式超时；`.github/workflows` 无 `pull_request_target`、无不可信插值、权限为 `contents: read`。

**仍待修（已取证未动，下一批候选）：** F54-04（`mcp/resources.js`疑似已修，待红测确认）；`reports.json`无条数上限与轮转，长期运行需外部归档；F61-05/06尚未独立复核。

**未审范围（不得当作已审）：** 第4批已覆盖`executor.js`/`tools/index.js`/`api/routes.js`（路由清单与写入链）/`runChat.js`/`dangerous*`。**仍未审**：`installer/preparation.js`、`scripts/run-code-oss.js`、`extension/extension.js`与`ptyHost.js`、`workbench/js/bind.js|bridge.js|operations.js`、`.github/workflows`。浏览器项因本机Chromium下载TLS中断未验；Windows/C#/PS无本地环境。

#### 即时接手检查（2026-09-21）

这份交接随施工维护，用户可随时要求切换助手，不要求对方读取全部聊天。**“可交接”不是全项目完成，也不是所有外部证据仍可下载。**

1. **定位与保护工作区**：先查git status --short、git log -1、git branch --show-current。当前会话绑定arena/01a0c4b1-web-agent；已从用户更正的arena/01a0bfa9-web-agent快进接手67f4f966720c2d6f657f53e3dc3b02cbf3860b98，[CI35624122815](https://github.com/cccjvav/web_agent/actions/runs/35624122815)九项与本地94/94为进入基线。F55证据提交036d65b / CI35632714383、F56源码a68a77e / CI35641420076及证据4649250 / CI35642269647、F57源码4cf4d6f / CI35647781757及证据ee393c2 / CI35648274576、F58源码6daf576 / CI35651156739均已逐job核实九项；不覆盖新增改动或机械切换历史分支。
2. **防恢复误判**：前序会话环境曾出现HEAD/索引回到50c03be而工作文件保留最新交付；已fetch当前绑定远端、逐blob核对后只mixed恢复dcc321b指针/索引，不写工作树。若再出现，不可盲目reset --hard/clean或把整树当新修改提交；先核对远端SHA、文件差异及用户改动，不确定就停下确认。暂停探针的哈希比对不是专项审查，不能覆盖其文件。
3. **验证不能借用**：用gh run list按当前绑定分支列出headSha/status/conclusion/url，选择与git rev-parse HEAD一致的run，再gh run view核对全部jobs。不要用旧绿灯代签新HEAD，也不要仅看run总标题。安装/Node/测试入口见下；变更尚在施工或CI未结束就标明未完成。
4. **证据可得性**：[仓库内CI摘要](../../review/evidence/R4-handoff-ci-2026-09-21.json)是本轮重新取得的脱敏API事实。此前沙箱外ZIP本轮未见，绝对路径不等于可移交附件；完整失败日志此前TLS EOF，不能补造。原run/job/Checks能取就复取，不能取就保留“不可得”；不上传用户密钥/环境/命令正文来补证据。
5. **当前施工与下一步**：F58已补同步准备阶段超时/取消，本地97/97、Chromium与audit 0均退出0，代码`6daf576040bc92a36b8f89d582f30dffb8decd54` / [CI35651156739](https://github.com/cccjvav/web_agent/actions/runs/35651156739)九job已核实。继续R2/R3的下一线索为installer外层对实例/工作区的再确认及更细资源/权限边界；200/healthz不能代签身份，不据此重写权限/恢复架构。R4历史原因仍开放，不加期限/删断言/重跑追绿；R5真实后代/窗口、R7逐句和R8用户验收继续。
6. **已交付与仍待**：R5已到保护收据+稳定句柄交互回收+ACL负例+诊断+Windows开始菜单入口；面板内按钮、桌面TTY/重复点击/关窗/真实隧道、跨用户与实际PID复用未验。R4历史Windows22、befee7d辅助失败及a22428a Windows20 echo超时根因都开放，不因后来绿灯注销。R6/R9仍含取舍，R7文档、R8用户本机MCP/桌面未完成。
7. **授权不变**：三个探针原分工暂停，不能因通用CI报Probe失败自行接手；ShunCode只参考不执行/不整体替换MCP；保留文件hash/检查点/审批、未知不重放、活宿主保护，不以同用户DPAPI当应用签名。用户Windows桌面VSCode集成CMD、已有Conda/系统Node，不新建环境；本会话没有用户本机MCP权限。

源码根首次缺依赖时运行 `npm ci --prefix webagent-core/agent-host --include=dev --no-audit --no-fund`；回归 `npm test`，定向 `npm test -- --filter=testRunner`；文档改源后 `node docs-site/check-docs.js --write` 和 `node docs-site/build.js`，再完整测试/精确CI。测试实际修改临时文件/进程，不是无副作用只读命令。交接前更新本节及CONTEXT，记录未提交文件、在跑任务和最后实际结果；不新建平行路线文件。

#### 1. 接手边界

用户2026-09-17再次要求继续全部既有待办，并优先整理杂乱文档。现已建立[文档中心](../../docs/README.md)；结构归类不代替R2/R3等代码施工或全仓逐句复核，探测仍暂停。

**项目尚未全部完成；探测专项暂停；当前可以继续非探测代码/文档审查，无需重复申请已有授权。** 不要重新设计已交付的权限、恢复和MCP功能，也不要把后续工作压缩成“只差用户手工验收”。

当前提交、验证状态与焦点只从[CONTEXT](../CONTEXT.md)进入，具体CI/失败依据在[阶段10](s10-upstream-adoption.md)。本计划章节不另存一份“最新SHA/CI”表；本阶段的工作包表是当前剩余计划的唯一维护位置。历史批次证据仍保留在阶段记录与Git。

##### 权威入口与冲突处理

1. 当前会话的用户最新要求、平台绑定分支与安全约束优先。
2. [AGENTS](../../AGENTS.md)、[项目规则](../agents.md)、[管理索引](../CONTEXT.md)说明工作方式与现行状态；不支持Skill时先看[管家规则](../SKILL.md)。
3. [逐句审查台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)记已审范围、未审范围和具体失败；[阶段10](s10-upstream-adoption.md)记施工证据。
4. [上游26类采用地图](../../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)保留候选出处与阅读深度，不把其中早期“本批”当今天状态。
5. [Windows清单](../../review/CHECKLIST_WINDOWS.md)是人工验收判定入口；聊天报告只按用户实际报告的范围记入，不扩大结论。

遇到文档冲突，先对照当前代码和绑定提交的测试，直接修错误正文并保留历史证据。链接/AST齐全不等于全文语义正确。

#### 2. 新助手第一小时的顺序

这是顺序建议，不是必须一小时完成的工期承诺。

1. 先读管理索引，再按导航读本阶段与当前会话要求，确认探测暂停、最终本机验收尚未开始。
2. 在实际checkout读取`git status --short`、`git branch --show-current`、`git log -1 --format=fuller`、`git diff --stat`。记录已有修改归属，不把全部脏树直接add/commit。
3. 用git/gh核对远端当前分支和精确CI。新Arena会话若绑定了不同分支，遵守新会话绑定，不机械切回本文旧分支；同一会话内不得改分支。不要索要GitHub密码、PAT、OAuth Token或2FA。
4. 若沙箱重建后HEAD看起来回到很旧的提交，但文件像最新版：**停止普通提交流程**。先获取远端、备份真实差异，按远端树逐文件核对。不要reset --hard、clean -fd或整树覆盖；是否恢复索引/指针必须有明确证据，不能把此经验变成自动恢复脚本。
5. 安装本checkout开发依赖并跑基线检查，见第6节。依赖缺失不是产品测试已经失败，也不是可以跳过测试的理由；失败保留原始输出。
6. 接手后按第4节实际状态选下一项：R1第24组首包已做，R3第31组状态/选择首包已做，Provider追加第32组已修，续其余API/工作流及R2安全依赖，不重做已交付批次；出现新的可复现高风险缺陷优先插队，先记复现与权限边界，再加回归修复。
7. 完成一个可验证闭环就更新正文、生成站点、全量测试并及时推送。汇报用简明中文直接写聊天，用户不一定能可靠看到报告查看器。

#### 3. 已交付内容：不要重新施工

| 能力 | 现状 | 仍不能声称什么 |
|---|---|---|
| Chat/Bridge及主人权限 | idle/chat/bridge，同类型可并发，跨类型互斥；Read/Edit/Execute/Capture由本机保存 | Execute不是OS沙箱；远端不能替主人改策略，Ask/Plan/Code不是同一个开关 |
| 手机Arena入站MCP | 用户报告手机浏览器登录Arena并用MCP链接连接成功；手机固定Bridge | 不是远程工作台UI；未提供蜂窝/OS/浏览器/全工具结果 |
| Bridge统计/Tasks | 主机快照，页面刷新不清零；任务按会话隔离、显式上报 | Tasks不是工具日志，也不是完成质量证明 |
| 模型失败 | 非builtin配置或模型失败停止；回退只能由用户明确选择 | 不自动换模型、重放修改或伪装通用推理 |
| 外部MCP出站 | 有界发现、回环HTTP(S)、显式stdio、明确批准公网HTTPS/DNS固定连接；工具逐次审批 | 入站Arena不要求启用它；不含自动OAuth登录/刷新；外部结果是自报，真实厂商兼容待验 |
| 文本恢复 | 经典保存回退、原生未保存草稿恢复、任务前跨文件检查点三种入口 | 非原子项目回滚，不恢复创建/删除/重命名/数据库/外部命令效果；部分完成须如实报告 |
| 文档站/测试入口 | 中文和斜线锚点、搜索状态已修；npm test有依赖预检，真实Chromium另跑 | 不认证全部Markdown或真实VSCode窗口 |
| Skill与隧道 | Skill新建拒绝重名覆盖；启停不假报成功；Named/ngrok逐流遮盖跨块Token | 不清洗历史日志，不隐藏进程argv/env，不是所有秘密扫描器 |
| Git只读工具 | 字面路径，NUL状态/原路径，准确截断；限定工作区子树；默认diff逐路径套用与显式diff相同的敏感规则；禁外部diff/textconv/fsmonitor及已发现自定义filter | 与LFS/转换驱动终端结果可能不同；规则未覆盖的文件仍可能含秘密，不是脱敏导出，也不隔离同用户配置竞态 |

##### 恢复功能的不可丢约束

检查点：本机明确创建、1–12个已有普通UTF-8文件、每文件64KiB/原文合计256KiB、最多8条、15分钟惰性TTL。预览绑定hash，确认一次消费；全预检失败零写入，执行中失败可能部分完成，unknown必须查盘。重启/过期丢失，不自动补偿/重放。

详细实现以[编辑回退详解](../../webagent-core/agent-host/src/utils/编辑回退详解.md)、[原生扩展详解](../../webagent-core/extension/入口与Webview详解.md)为准，别为简化UI去掉版本校验。

#### 4. 路线图：按顺序推进，有结束条件

状态含义：**进行中/待做**属于当前计划；**候选**要先设计与核对收益；**暂停**不施工；**待用户实机**不能由沙箱代签。没有截止日期或“全自动做完”的虚假承诺。

| ID / 优先级 | 状态与工作包 | 入口与依赖 | 完成标准 |
|---|---|---|---|
| R0 / 持续 | 交接、证据与范围同步 | 本页、CONTEXT、语义台账、阶段10 | 新助手不翻聊天也能知道下一项、精确基线、失败和阻塞；每批改对应状态 |
| R1 / 本包完成 | 第24组三模块复核与确认缺陷修复已交付，范围/验证见阶段10 | [画像与记忆详解](../../webagent-core/agent-host/src/models/画像与记忆详解.md)，profile.js/customizations.js/memory.js；不依赖探测或用户本机 | 整篇对照实际函数/磁盘路径/预算/坏文件/中文召回/并发；核对假阳性后修代码，profile/memoryRecall及全量回归通过，明确未审的依赖 |
| R2 / 下一项，高 | F54第一批会话pin/全忙拒绝/SID校验已交付；第二批RPC准入/版本/整批ID预检已实施并定向验证，第四批现补资源caller与目录ACL及错误hash指引，第五批已补原生流确认，第六批补窄屏/页签ARIA，F55又补浏览器会话/挑战响应头可读性，其余UI/实机项待续修。参考包只借鉴busy pin/整批预检思路，不整体换栈 | [F54报告](../../review/INDEPENDENT_AUDIT_2026-09-20.md)、[SECURITY](../../SECURITY.md)，mcp/server/session/requestLifecycle/resources、OAuth与执行控制；ShunCode不安装/执行，探针专项仍暂停 | 先保证异常准入零副作用、取消/终态归属和现有权限/unknown/不重放；全忙拒绝新会话、pin单次释放；明确版本/预算，保留原文件/审批架构；有真实负载证据才考虑自适应队列 |
| R3 / 高，继续 | 第25/27/31–37与41–43/45–53组持续修复消费链。第53组已补齐所有当前非Probe路由的query门禁、external/workflow显式固定接线、status/diagnostics与定制/会话投影；F54第三批已补新文件patch显式hash与块校验，第五批补原生postNdjson坏流/终态及失败历史；F55补经典流严格完成/预算/取消清理；F56补可选编辑器编排健康期限与直接子进程收尾；F57补App窗口身份绑定与浏览器失败；F58补同步准备阶段超时/取消，按新证据续修，不重做已交付链 | [API逐项详解](../../webagent-core/agent-host/src/api/路由逐项详解.md)、routes、apiFiles及已登记消费者；明确排除探针专项 | 每路由核对HTTP与业务结果、请求/响应预算、审批前后复查、deep copy/幂等/取消/unknown；失败不自动重放，不扩大任意命令权限，脱敏凭据不能转绑新连接 |
| R4 / 高，独立追查 | 根因未定位；已复取历史annotations并补阶段诊断首包，等待可解释复现 | 第5节确切失败记录；executor/commandJob/patchEngine/searchWorker与Windows CI | 保留原失败，获得可解释复现或足够诊断证据；有证据才改根因并验证，不以加时限/重复到绿结案 |
| R5 / 用户优先 | 已授权安全隧道残留回收；已交付只读检测、Windows保护记录/稳定句柄终端回收及负例/诊断；本机开始菜单入口已接入，面板/桌面与PTY互操作仍待 | executor/ptyJobs、核心扩展ptyHost/ptyPolicy、computer-use既有实现；不进入暂停的探测整合 | 核对所有者、可观察退出、审批过期、取消、路径/脚本/编译分支；代码与说明修好，实机项继续单列 |
| R6 / 中 | 候选设计与分项实现 | 第4.2节、上游26类地图；完成明确缺陷修复优先 | 每项先写最小范围、输入/预算/权限/失败、回归与取舍；有收益且不突破授权边界再落地，不把全部候选统一许诺为必做 |
| R7 / 结构首包已做，语义继续 | 第26组集中19篇专题、归档17篇旧审查、删除过期PROMPT；F54改相邻错误说明、归档独立报告与同步当前基线，F55修文档站跳转/窄屏导航/代码/对比度，F56同步启动/运行器说明并纠正旧mkdir/副本版本，F57拆分appWindow并加身份/浏览器回归，F58补准备阶段超时/取消及对应测试说明，均未增加整篇逐句完成项；其余README/管理旧现状继续核对 | 源码清单、目录README、根维护/安装说明及阶段索引 | 活跃正文无相互矛盾的“当前”；无用旧指南退役，有效教学/历史失败保留；给出已审和未审清单而不是总称100% |
| R8 / 分项就绪后 | 待用户实机：项目根MCP验收 | 第7节、Windows清单M/W/T/G等；用户接入后核对工具身份 | 逐项有提交、实际环境、动作、退出码/效果与脱敏证据；失败/未执行如实留存，不借CI代签 |
| R9 / 中，部分完成 | 第45组已交付CI顶层`contents: read`与高危生产依赖硬门禁；F55新增默认axe开发门禁；EOL Node矩阵、最小lint（只报错不改风格）、生成物churn与仓库权重仍为候选 | [第45组报告剩余决策](../../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md#6-仍需保留的风险决策)；版本/依赖/发行取舍需项目主人决策 | 每项先写范围与回滚点，不改冻结原型、不做TS重写；CI九项不因新增检查放宽 |
| P / 暂停 | 探测整合、迁移与专项复核 | 第8节，另一助手正式交接前不动 | 交接后先锁版本/权限/接口/数据方案并重排范围，不自行恢复施工 |

##### 4.1 当前路线的证据入口

R1及R3已交付部分以表内范围为准，细节见[阶段10第24–28组](s10-upstream-adoption.md)；不能把早先的CI阻塞提示当作今天的状态。正式逐句审查的文件状态只维护在[审查清单](../../review/FULL_REVIEW_INDEX.md)，发现和处置见[语义台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)。本计划章节维护工作包与结束条件，逐批实现/CI日志保留在下面的历史证据章节。

##### 4.2 候选的范围与决策门槛

| 候选 | 先设计什么 | 不默认承诺 |
|---|---|---|
| 文件变化提示 | 用户启用、限定目录、去抖/背压、失效与删除、关闭回收 | 跨工作区常驻监视或无限扫描 |
| 公平性/限流 | 可信会话身份、拒绝不增计数、队列/取消/公平测试 | 根据不可信代理头分配身份，或仅凭已有入口限流就说公平性完成 |
| 性质/变异测试 | 先做路径、SSE、hash、审批的有界生成/变异；已有OAuth/Token有界对照不重做 | 小范围穷举等于形式化证明、小时级全仓门禁 |
| OCR/图片/桌面增强 | 中文质量门槛、像素/字节预算、目标窗口/焦点/DPI、明确可选依赖 | 自动安装OpenCV、通用OCR准确性、Linux测试替代Windows桌面 |
| 发布来源/签名 | 校验和、产物来源、构建可复现性、发布权限与验签说明 | 自动申请密钥、提高OIDC权限、发布Release或签名证书 |
| 通用补偿/回滚 | 哪些副作用可逆、部分失败记录、操作者确认与冲突 | 把现有内容检查点扩称原子事务或自动重试系统 |

新增收费/凭据/第三方上传、系统安装、扩大公网暴露、OS权限或发布权限，以及删迁用户数据的决定要及时向用户说明。已经授权的审查、复现、修复、测试、文档和正常推送不反复询问。

#### 5. 已知失败与未解决风险

##### 5.1 Windows超时尚未查明

- 提交36ff82f4b21ee4714dcacd9ff0cd657c47e88def的[CI35125290301](https://github.com/cccjvav/web_agent/actions/runs/35125290301)首轮8/9成功，整体失败。
- Windows Node22：mcpProtocol.test.js的截图路径echo约30.5秒超时、无stdout/stderr；patchEngine.test.js的搜索worker启动超10秒。浏览器、安装器、其余六组主机通过。
- 两次下载日志EOF；check-run `104892732306` annotations取得具体错误。一次诊断性rerun请求被拒绝，未实际重跑，错误文案不能证明workflow损坏。
- 后续未改实现的e470d5f完整CI35125876577成功；之后多轮也成功。**没有据此宣称根因已修复，也没有放宽时限、删断言或自动重试。**
- 继续时先确认同类失败是否再现及时间线；区分进程启动、编译、IO/取消、worker ready与runner负载，不凭“像环境问题”定案。

##### 5.2 不能丢的其它证据

本交接首推0fac6f0漏带生成的tests/README.md导航，CI35243193771仅1/9成功、整体失败；立即补交cd2a3ea后CI35243219647九项成功。不是测试不存在或功能失败，可复用教训是提交前将check-docs --write实际改出的全部生成文件纳入核对，不能只凭本地测试绿灯推断Git提交完整。

第16组6ed9adf曾漏登记docsViewerBrowser函数说明，CI35116366728仅2/9成功；8ed0496补齐后CI35116453656九项成功。历史失败原样保留在台账/归档，不通过删守卫或改历史测试数美化结果。

当前Git辅助程序禁用、隧道Token遮盖不代表全面OS隔离或所有秘密不外泄；源码中的路径/hash检查也不解决所有硬链接/父目录竞态。没有实机窗口/真实提供商证据时，必须继续写未执行。

#### 6. 开发、测试、说明与推送闭环

从仓库根操作。下面命令用于开发checkout；不要在正在运行并用于MCP验收的产品目录里盲目重建依赖。

```bat
npm ci --include=dev --no-audit --no-fund --prefix webagent-core/agent-host
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
echo %ERRORLEVEL%
```

Windows在VSCode集成CMD逐条运行，失败停止。Conda用于用户已有业务环境，WebAgent是Node项目，不安装根requirements.txt/pytest或新建venv。`npm ci`会重建该包node_modules；直接测试运行器检查express/Acorn入口，但不是依赖完整性认证。

R1回归入口（已做首包，供复核）：

```bat
npm test --prefix webagent-core/agent-host -- --filter=profile
npm test --prefix webagent-core/agent-host -- --filter=memoryRecall
```

修改解释正文后再生成：

```bat
node docs-site/check-docs.js --write
node docs-site/build.js
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
git diff --check
git status --short
```

不要手改清单、source-index、content.js。新增函数要补在documentationLearning登记的**实际主指南**，不是随便一篇相关说明中出现名字就算完成。

Playwright是Node开发依赖，现有版本以package/lockfile为准；普通运行不必安装浏览器。`npm test`不含独立浏览器入口，需要时另运行：

```bat
cd webagent-core\agent-host
npx playwright install chromium
npm run test:browser
cd ..\..
```

下载失败不关闭TLS校验；CI安装Chromium不代表用户电脑已有缓存。浏览器fixture中的route/VM与真实公网、真实VSCode窗口不是同一证据。

确认diff仅含自己的改动后选择文件提交，及时推到当前会话绑定分支。Bash脚本采用失败即停止的链式控制；CMD逐条检查退出，不能让tail/echo的成功掩盖测试失败。

本会话的推送与核验例子：

```sh
git push origin arena/01a0bfa9-web-agent
gh run list --branch arena/01a0bfa9-web-agent --limit 5 --json databaseId,headSha,status,conclusion
gh run view RUN_ID --json headSha,conclusion,jobs
```

RUN_ID需替换实际编号。核对headSha及每个job，不只看最后一行绿色；本地/远端/用户实机分别报告。CI的Action运行时Node20弃用警告与项目Node矩阵不同，不能混报失败。

#### 7. 用户参与节点与最终本机验收

**现在没有要求用户操作或提前接入。** 用户明确希望剩余施工完成后，由其让Arena连接本机WebAgent MCP，选择本项目根目录做验收。

- 当前会话若未列出本机WebAgent工具，就没有可用本机MCP通道；不能用沙箱bash/fetch或聊天文字冒充。
- 接入后先ping/workspace_info，比较root、identity.hostInstanceId与本机诊断；再读取README/CONTEXT并核对真实提交、Node路径、已有Git改动。主机重启需重新核对。
- 根目录不授权覆盖源码、清空.git、硬reset、删除用户改动；写入/检查点测试仅用约定的独立临时文件，完成后对照Git状态。
- Chat与Bridge互斥；需要本机Chat/PTY的项目先由操作者正确切换。原生窗口、安装/升级/卸载、真实桌面/DPI、供应商兼容要分别记录。
- 停止后远端失联不是进程退出证明；最后由本机操作者确认隧道/进程。完整动作见[新手手册](../../docs/guides/Windows新手逐步验收.md)，判定见[清单M1–M5及其它项](../../review/CHECKLIST_WINDOWS.md)。

已有用户结果：完整重启VSCode后npm/npx恢复；步骤7–10及11.1/11.2已报告完成，11.3作为协作说明关闭，不得改名重列为同一阻塞；Bridge计数/记录刷新后保留已确认；手机Arena连接已报告通过。不要让用户无故重做这些，也不把它们扩成新增权限、检查点、原生窗口或全部网络验收。

#### 8. 探测交接：明确暂停，不抢另一助手工作

外部来源：[phuang6666/arena-ai-probe，arena/01a0ab8a-arena-ai-probe分支](https://github.com/phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe)。用户报告其整合版面向工作台/code-server外接与VSCode配套插件；**本项目未拉取、审查、运行或验收该整合项目。**

暂停新增入口、采集/分析/插件改造、迁移整合和探测专项复核；保留当前实现及既有回归，不删功能、不跳测试。交接后要求固定SHA/版本、构建与失败证据、来源许可、三宿主矩阵、扩展ID/命令/端口、认证/工作区绑定、采集所有权、审批/取消/幂等、数据迁移/并存/卸载方案。详细门槛见[阶段8](s8-probe-integration.md)。

探测只作参考，持久登录与Chat API确切后台身份验证按约定后置。外部项目声称“完成”不自动改变本仓库权限和验收结果。

#### 9. 每次交班的最小记录

接力助手完成一批后更新本页路线（任务变更时）、CONTEXT焦点摘要与阶段证据（各按职责），按以下模板向用户直接报告：

```text
本次提交/推送：实际SHA；工作树是否还有别人的改动。
实际改动：代码与对应说明；哪些验证了，哪些只阅读。
验证：本地命令/退出/数量；CI run、headSha及逐job；实机单列。
失败/风险：原始失败、是否再现、根因是否已证实；不抹去历史。
下一项：路线ID、具体文件、测试与完成条件。
需要用户：没有 / 明确动作、原因、风险、预期证据。
暂停/延期：探测待交接；其它边界是否改变。
```

下一位助手先看本节即时接手检查和最新批次。非Probe query、只读投影及external/workflow接线已在第53组交付，不再当尚未施工；F54/F55/F56/F57已修的会话/原生/经典流/响应头/启动确认/直接子进程也不重做。继续按R2/R3的新负例推进（当前待验证线索为同步依赖准备期限/取消及外层再确认），交叉R4与R7；无需用户重新复述此前授权和约束。如发现与实际代码不符，以核验结果修订交接，而不是照抄本页当绝对真相。

### 实施批次与证据

以下保留先前批次的实际决策、失败与验证；旧路径和旧组织方式描述仅作历史。

#### 已交付：限流与生成测试批次

- 11限流：OAuth JSON/HTML 429都返回Retry-After；超额请求不增加计数/延长窗口；1000-key容量有恢复提示且旧key剩余额度不被挤掉；来源不直接回退不可信转发头。原固定窗口本来不会被连续拒绝无限延长，此处不虚报修复了不存在的问题。
- 18生成测试的一小部分：2000步固定种子时序与独立参考模型、容量/过期边界、真实HTTP伪造头/端点预算回归。不是完整性质/变异门禁。
- 文档：11.3按用户确认完成/关闭；探针三入口矩阵核对；历史根审计输入曾移入review/archive并修链接（重复归档后续已删除，保留Git来源和对照稿）；重写两个未经当前验证的第三方扩展安装保证；旧计数标记历史。
- 本地74测试文件通过。代码9dfa0ad2853fd60f256e3ae47cf29145663e4ed4的CI35031845316九项成功（Ubuntu/Windows、安装器/探针包解包验证、真实Chromium）：https://github.com/cccjvav/web_agent/actions/runs/35031845316 。不是实机账户验收。

#### 本批续作：Bridge Tasks与编辑预览（0.7.2）

修正Bridge/本地Chat任务共用、无报告即隐藏以及远程事件丢失后不能恢复的问题。远程报告按服务端会话键摘要隔离，主机快照供工作台和桌面/code-server核心扩展轮询，明确Agent报告与工具执行不是同一件事。新增有界/不可变/TTL及UI回归，最近统计日志只显示远程来源。

借鉴08继续落地新文件可读diff、现有/新文件预览版本hash及漂移拒绝回归；没有把可读预览当成完整回退实现。公网MCP、保护回退与目录变化通知等继续保留，不谎报全部完成。

本批还纠正MCP旧工作流提示“拿STALE_FILE的currentHash直接重试”，改为停止本次写入、重读并协调新内容，冲突询问操作者，未知效果不重放。不是放宽哈希检查来让测试通过。


##### 本批验证结论

代码99f46e9628546d6f787262784e8d91082b7c82ea，CI35033494833九项成功：https://github.com/cccjvav/web_agent/actions/runs/35033494833 。本地完整75文件通过，232受管源码/28目录/109排除，生成站点同步。

- 工作台：真实Chromium经MCP上报Tasks，禁用WS仍轮询显示；刷新恢复、completed更新、第二会话隔离、本地Chat不串入，均通过。
- 桌面/code-server/App：核心扩展同源及发行副本一致；真实生成的Bridge Webview脚本在VM验证分组/空提示/转义，HTTP服务快照经测试。未在真实桌面VSCode或code-server窗口操作，不冒充可视实机验收。
- 新文件/已有文件dryRun预览、哈希与漂移拒绝通过；回退尚未实现。
- 中途5eb354b的回归错用了只含连接URL的getBootstrapPrompt，断言失败；99f46e9改为真实getInstructions后全绿。保留失败事实，不借旧绿灯覆盖。沙箱Chromium下载仍ECONNRESET，本次真实浏览器证据来自上述CI，而非本地。

#### 当前任务：文档逐句审查（2026-09-16）

Tasks代码批已交付；当前清理过时产品正文，不再只在旧文后叠加更正。已重写README/CONTRIBUTING、修订使用/网页VSCode/技术/安全说明，删除失效统计摘要并重接summary站点路由。逐条依据、全文与局部审查范围、实际剩余施工见[审查台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)。全仓语义审查尚未完成，逐函数教学文档未删除。

当时优先处理的实现差异（现已在后续批次修复）：Plan merge缺配置时本机拼接、直接工具API业务失败外包、MCP取消通知未接执行取消。此处为历史起点，也不把公网MCP/受保护回滚与候选OCR/签名混称为同一完成度。

本批本地验证：开发依赖首次缺Acorn，安装完整依赖后，清单232源码/28目录/109排除通过，站点构建通过，完整75测试文件通过。首次diff检查发现一处修改行尾空格，已清理。远端CI需绑定本次提交后另查，不沿用上一批九项绿灯。

第二组继续：全文重写管理经验，纠正破坏性恢复建议与Bridge恒text；完整对照文档站app/serve/index复核其逐函数说明，修复预构建矛盾与全景页旧文案。比较后删除重复外部报告归档，保留原稿Git证据与对照稿，修复引用。范围明细见语义台账；其余文档仍待审。

验证续记：第一组c38ead31c5323ee3787ea55a3ecab5909c31c75e的CI35036910154九项成功（含真实Chromium、Windows矩阵和安装编译）。第二组本地75文件、文档生成校验与diff通过；第二组远端结果不沿用第一组。

第二组远端确认：149a951a7b80893b0107ce27170aebc06a1296df，CI35037123530全部九项成功：https://github.com/cccjvav/web_agent/actions/runs/35037123530 。CI另提示checkout/setup-node v4的Action运行时弃用警告；这与主机Node测试矩阵不同，未擅自升级工作流。

#### 续作：三项优先实现缺口修复

实现与边界见语义台账第三组；MCP请求分发、会话/错误/预算两篇逐函数说明已全文对照，其他文档仅涉及章节同步。没有实现公网出站MCP、受保护回滚/完整UX，也没有重开取消的探针入口或11.3。两次门禁失败及修正已保留，不借旧CI计入本批。

本批本地最终验证：77测试文件通过，235源码/28目录/109排除，站点构建、受检链接、diff检查通过。远端CI提交后按精确SHA查询；真实第三方客户端与用户桌面尚未验收。

#### 配置审查续作

完整核对store与config/extensionVersion两篇详解，整合过期秘密名单和错误的启动顺序。另发现并修复generateNewSecret吞掉保存失败：先保存成功再发布内存新密钥，失败不上报成功；新增坏JSON与EACCES保留旧密钥回归。未承诺跨进程/断电事务。models主README定制保存契约同步改正文，其他部分未计全文。

验证确认：0465073a489fe30d968964dbab791df473174a27 / CI35038038886、faeaa1f60dfd780598a1ffeb43c4a0c8a5f5feb5 / CI35038187350分别全部九项成功，均本地77文件通过。最新代码CI：https://github.com/cccjvav/web_agent/actions/runs/35038187350 。其余施工及全仓语义审查不关闭。

#### 手机实测与权限能力核对

用户2026-09-16报告手机浏览器登录Arena、使用WebAgent MCP链接成功连接，用法与电脑浏览器相同；清单F2记录通过，不重开11.3、不强制另找OAuth菜单。用户上传的是另一产品的Read/Edit/Execute/Capture控制参考，不是本产品这些开关的实测证据。

98ad224批次时尚无由本机所有者锁定的四分类Bridge权限开关；Ask/Plan/Code由调用参数选择，不能当作远端不可提升的权限上限。文件/命令边界、PTY审批及受控外部调用/工作流审批确实存在，详见SECURITY当前能力对照。此为当时范围；用户随后明确授权实施，当前施工见下节，不再将它留作待评估。

继续审阅审批执行链，发现operatorQueue只按ok/success/isError判断失败，status=failed、非零退出或isTimeout可能被记为succeeded；已复用isToolFailure纠正，保留cancelled/unknown及终态不重放。补实际队列回归，不新增或扩大授权。

本批本地验证：77测试文件通过；235源码/28目录/109排除，文档构建、受检链接与diff检查通过。手机通过来自用户实测反馈，与本批自动测试来源分开；本批没有新增权限开关或开放远程控制面。

本批远端验证：98ad224d3d4ad103c4a2e2da8114b8eeae92f741，CI35085304002成功：https://github.com/cccjvav/web_agent/actions/runs/35085304002 。手机F2仍以用户报告为证据，不归功于CI；四分类权限开关仍未实现。

#### 当前施工：所有者权限与主机模式互斥

用户确认手机Arena固定Bridge；Chat与Bridge不得同时执行，同类型多模型/多Agent可并行。新增executionControl租约、持久四类权限、工作区/主机/revision本机设置，经典工作台与VS Code/code-server核心扩展同名控件。Read/Edit/Execute/Capture不是四个OS沙箱：Edit依赖Read，Execute必须四项全开。默认兼容全开，详见[操作与边界](../../docs/guides/Bridge权限与工作模式.md)。

别名、资源/提示词、审批时与工作流步骤复查权限；等待审批允许撤权但阻止切模式；运行请求、后台子进程/stdio未close、PTY未确认取消阻止切换/撤权。隧道启动在await前预占；不自动取消、回退模式或重放。人工编辑/审批沿用当前模式，不当作同时启动另一个Chat模型。

新增executionControl真实HTTP/后台命令/PTY/隧道夹具，旧混合模式测试改为明确切换；浏览器用实际控件切换、保存、回读与拒绝别名，Webview模拟轮询不覆盖草稿。新增操作手册与逐函数解释；命令/PTY、协议、Chat、API及审批相关章节同步，测试README陈旧“全部52项”改为真实范围。不宣称全仓逐句完成，公网出站MCP/受保护回退等原队列仍保留。

验证状态：本地78测试文件全部通过，237源码/28目录/109排除，文档构建及diff检查通过；产品提交348ce98a80af2bfe7fb81eba3a366a74ad51dfef已推送；CI35097629168九项成功，含workbench-browser真实Chromium、Windows安装器、Ubuntu Node18/20/22/24及Windows20/22/24：https://github.com/cccjvav/web_agent/actions/runs/35097629168 。浏览器本地运行因缺Chromium无法启动，Playwright下载TLS前ECONNRESET失败；本地不能声称真实浏览器通过；随后本分支CI真实Chromium已成功，两处证据来源分开。新增控件Windows/手机人工验收未做。

#### 续作：旧连接指南退役与探针正文核对

按用户要求，删除根目录旧双向连接核对指南；不保留同名空壳。现行有效步骤及不鉴定身份、挑战转交/TTL/清除范围等边界合并到使用指南；原始捕获隐私提醒保留SECURITY。旧connection-check-guide文档站入口移除，安装包删除旧指南并补现行权限/探针入口说明。早期ARENA_PROBE_INTEGRATION报告归档至review/archive，显著标识0.1–0.3历史状态，不再作为当前未完工清单。

发现并改正文：原型README同时声称“完整参考整合”与“产品只接入最小核对”；当前验收页仍教安装0.5.1；入口页核心扩展仍写0.7.1；现行探针文档只提Code/审批却遗漏新所有者权限与互斥模式。逐项对照当前源码修订，未删除现有可选诊断功能，也未恢复已取消探针UI施工。Companion描述/菜单移除早期总括“完整移植进行中”，具体实机未验收继续保留。

新增文档退役及安装包防回流断言。本批本地78测试文件通过，237源码/28目录/109排除，文档构建与diff检查通过；提交72ad02f79b42c48fae191ba7d7f49a09cd4e8870的CI35099997405九项成功，含真实Chromium、Windows安装器和七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35099997405 。该结果不等于用户探针实机验收。全仓逐句审查及公网出站MCP、受保护回退等施工仍未完成。

#### 续作：经典已有文件预览与确认保存

新POST /files/preview只读、路径/hash/文本/diff计算预算；经典文件菜单生成不可变草稿预览，明确确认才PUT，保存再查磁盘hash。异步草稿/标签漂移淘汰旧预览，确认前消费快照防重复发送。保留Ctrl+S，未伪造受保护回退已完成。源码核对还发现工具描述和write/patch错误retryHint仍鼓励错误hash立即重试，与已修指令矛盾；本批改为停止、重读、协调，不放松门禁。

API/编辑器VM/浏览器流程增加回归；本地78测试文件通过，237源码/28目录/109排除、文档构建与diff检查通过，产品提交6e57fec3668eaefdc56d7efd0b8721ee01b7d6d4的CI35101343496九项成功，含真实Chromium菜单预览/确认保存、Windows安装器及七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35101343496 。这是CI隔离场景，不代签用户Windows实机。余项继续按表推进，不重新开启已取消入口。

#### 续作：经典单次保存受保护回退

editorUndo有限内存旧正文、保存后hash绑定；本机API预览及工作区/主机/严格确认后恢复，记录发起执行前一次消费。经典菜单先预览再确认，脏草稿拒绝；回退期间新编辑保留。最多16项、每项64KiB、15分钟按访问清理，非持久备份。只覆盖经典已有文件的版本化已验证保存，不把shell/删除/改名/多文件或原生VS Code回退报完成。

针对API/容量/到期/旧hash/重复/VM草稿与真实浏览器增加回归，逐函数说明及操作/安全正文同步。本地78测试文件通过，238源码/28目录/109排除，文档构建和diff检查通过；产品提交ec16f9eeeb40e00696f567ee7fe6eada4b1c311a的CI35103728795九项成功，含真实Chromium菜单回退、Windows安装器和七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35103728795 。不等于用户Windows/原生VS Code实机验收。全仓逐句审查、公网出站MCP和其余施工继续。

#### 集中续作：公网HTTPS出站与剩余范围归一

新增publicHttps传输：每次解析全部DNS并拒绝非公网/混合答案，固定socket lookup不二次解析，正常TLS/Host验证，不跟随3xx、不复用连接。IPv4特殊范围和保守IPv6范围明确；支持显式Bearer，参数仍在本机逐次审批后发送。公网登记默认关闭，必须外发确认+工作区/主机绑定。没有把入站手机连接误作出站实现证据。

真实隔离TLS测试覆盖固定lookup、Host、自签名无CA拒绝、目录发现、审批前零调用、DNS变私网拒绝、307不跟随、body超限和取消；测试专用socket路由并非真实公网连通证明。UI拦截测试独立检查开关、确认、绑定和令牌清空。安装包包含传输，不含测试TLS私钥。

本地79测试文件通过，240源码/28目录/109排除；本批CI待精确提交后核对。现行README/使用/安全/工具说明直接改掉“仅回环、不支持互联网”的旧描述；历史报告不因此自动成为现行指南。

剩余范围：真实第三方HTTPS/Bearer服务、Windows/手机新增控件待用户环境；通用多文件/任意Agent回滚未实现（不能无设计地自动补偿）；全仓逐句审查仍有未审正文。文件通知、公平性/OCR/目标识别、性质/变异与签名仍按候选分类，不未经确认启用系统签名密钥或扩大OS权限；既定延期/取消保持。

首轮公网b321432 CI35105260201为7/9成功；Node18 Readable.toWeb取消重复close及旧浏览器stdio等待输入文本的竞态已修复。改显式terminal/背压适配，浏览器等待具体审批成功再核对真实文件；本地79测试文件通过，不抹去失败或放宽断言。旧CURRENT_AUDIT与上游定向报告已归档保留编号/CI/许可/授权，DOC_SWEEP重复结构筛查报告删除；现行导航直指管理/逐句台账。修复代码7790e55bfbaf481ce52a1942e9e72da56e6b7f81，[CI35105944367](https://github.com/cccjvav/web_agent/actions/runs/35105944367)九项全部成功，已逐项确认：Ubuntu Node18/20/22/24、Windows Node20/22/24、安装器、真实Chromium。包括Node18取消与stdio审批等待修正；不是公网提供商/用户桌面实机验收。

#### 续作：角色说明与协议描述一致性

使用指南补Arena→WebAgent→第三方可选链路、两套凭据、登记与逐次批准、operation_result取结果及正文外发边界。移除正文遗漏的“不连接公网”；同步修正真正提供给模型的external_servers描述，新增守卫，权限不变。第十一组审查范围见逐句台账。跨文件/通用回滚、原生UX和其余逐句审查仍未完成，不把解释工作算作这些实现。

2026-09-16续作：核心扩展新增原生单文件草稿只读diff及明确确认恢复命令，64KiB/UTF-8/信任与真实路径边界、版本/磁盘复查、自动保存关闭、editor.edit撤销边界；不主动保存，不是已保存的Agent历史回滚。真实VS Code/code-server窗口验收仍待，测试只证明API契约。

##### 原生草稿批次验证

本批代码47ee11c232e7c267bf56ac7a414e9bd77079d302，[CI35108769347](https://github.com/cccjvav/web_agent/actions/runs/35108769347)九项全部成功：Ubuntu18/20/22/24、Windows20/22/24、安装器、经典工作台Chromium回归。本地80测试文件通过，242源码/28目录/110排除。源码/发行副本已同步，真实原生VS Code/code-server的diff与撤销交互仍未验收。首次本地全文测试因新夹具onConfirm等具名函数未补详解失败，补齐后80项全过，未放宽文档守卫。

上一批角色说明38bb741ec429e4876755edc18cbcd9ea8e1ad03e的CI35107665944也已逐项确认九项成功，不将新功能证据倒签到上一批。

#### 本批：跨文件内容检查点

本机任务前显式保存1–12个已有文件原文，任务后预览/确认恢复；8条/15分钟/单文件64KiB/合计256KiB。全文件预检、逐文件复查、共享hash写入/verified读回；部分失败保留restored/unknown/not-started并消费，不重试或补偿。经典工具接入页有创建、列表、diff、确认恢复/移除；刷新恢复记录而重启不持久。未保存草稿、创建/删除/改名、元数据和第三方副作用不在范围。

修正README仍称“没有回滚/界面”的陈旧断言；说明三种恢复入口的区别，更新管理当前表与采用映射。新模块/测试/接口/前端逐函数说明已补。初轮本地81文件通过，244源码/28目录/110排除；最终验证与精确CI随提交核对，不代签人工Windows。

##### 检查点批次证据

代码6ef3ac7cb2a618a1e773b9a5a2022ed46b121daf，[CI35112168535](https://github.com/cccjvav/web_agent/actions/runs/35112168535)九项全部成功，已逐项核对Ubuntu18/20/22/24、Windows20/22/24、安装器和真实Chromium。浏览器实际两文件建立、外部改写、只读预览、取消零写入、确认恢复及consumed列表通过；不是用户手机/Windows桌面编辑器人工验收。本地81文件通过，244源码/28目录/110排除。

##### 第十四组：核心导读全文归一

逐段读取原架构导读426行与组件说明424行，全文重写两篇而不在旧结论后加附录。保留四层教学、目录/数据/执行链职责；操作细节统一指现行专项指南/模块详解。修正默认计算器、无安装包、无Playwright、无条件Chat/Bridge并行、无配置自动builtin、Chat不联网、固定30工具、密钥等于无限授权、GPL泛化和扩展仅HTTP等错误。新增针对旧断言的文档回归守卫；这是局部语义证据，不认证全仓所有Markdown。

#### 第十五组：总览/技术执行链与导航实修

完整读取旧总览349行、技术实现112行。总览改为当前详解导航和模式/出站/恢复执行链，删除虚假的自动builtin回退、固定30工具、旧“全项目无Build”和建议开放0.0.0.0等陈述；技术实现补已交付模式、出站、恢复/存储边界，现行审查链接不再指旧质量报告。进程README的工作区默认/初始化顺序及API表遗漏同步修正。

文档站实际代码也修正：GitHub风格片段与站点slug不同导致链接到不了标题；根文档渲染复用了最后一个子文档上下文；同文档#片段误当父目录。新增共享anchors与范围明确的导航回归，五份根导航目标/标题检查及实际生成href/id对应。首次新守卫发现computer-use/README.md不存在，改成真正的win/README.md。未把受支持标题子集当完整GFM解析，也未把这些检查当全仓逐句认证。

##### 第十五组验证证据

代码c0ada67170558b6a9860739051f049f3668b3bfb，[CI35114310216](https://github.com/cccjvav/web_agent/actions/runs/35114310216)九项全部成功，逐项确认Ubuntu18/20/22/24、Windows20/22/24、安装器、Chromium回归。本地82文件通过，246源码/28目录/110排除。首次全量因旧docsSite VM用测试目录解析新anchors模块而失败；改createRequire(buildPath)后原CRLF逐字节断言仍保留并通过，不是跳过失败测试。新增导航守卫范围为五份核心根文档和明确标题子集，不是全仓Markdown/GFM认证或用户实机验收。

#### 第十六组：测试复盘与审查台账收拢

测试说明、代码复盘指南全文复核，去旧测试数/无Playwright/手机完全未验结论，保留完整函数/fixture教学导航。当前语义台账重写为已交付能力、精确全文/章节范围和待审顺序；1–15组原始失败/CI移至review/archive，修相对链接，不销毁证据。runner补缺express/Acorn时退出2的明确前置检查，隔离副本回归不移动真实依赖。现行导航链接守卫扩至这两份指南和台账。

本批另修第2组已记录但未修的文档站问题：搜索短输入清旧结果、无匹配明确替换、搜索标签转义；guide坏百分号不阻断，正文/文件章节拼接并解码完整中文/斜线ID。VM覆盖状态与编码，真实Chromium加载实际静态资源检查搜索/guide/目标节点（白名单网络fixture，不是静态HTTP服务验收）。

##### 第十六组验证

f6a7bff267c1678a26fcbfa90f20f601ad1f2574的CI35116022251九项成功。文档站交互续作6ed9adff87798dcfd21af9072a995cc5c1e233c9的CI35116366728仅浏览器/安装器成功（2/9），本地完整测试暴露docsViewerBrowser漏在登记的主指南说明，已补齐，未删除守卫。最终8ed049663bb943a5880f873ba4a33cd3f5a9b8fc，[CI35116453656](https://github.com/cccjvav/web_agent/actions/runs/35116453656)逐项九项成功；本地82测试文件、246源码/28目录/110排除。真实Chromium加载实际文档资源验证搜索、坏guide编码及带斜线标题目标；资源由白名单fixture提供，不伪称静态服务器网络或用户实机验收。

#### 第十七组：Conda/平台CI全文复核

Playwright并未删除：当前Node开发依赖1.63.0，浏览器任务独立安装Chromium并运行test:browser，普通运行与Arena连接不依赖它。Conda/测试/CI指南补清晰操作和边界，不要求Python Playwright或venv。对照实际脚本修平台指南中express旧检查/Shell相对路径/两job/不编译Drawing文件等过时正文；对照实际根package.json修总览误述。check-env输出同步提醒VSCode父进程PATH。新回归核对依赖版本、入口、链接、关键提示与隐藏控制字符。整篇阅读不等于Windows/Conda实机验收。

第17组代码/文档23ce0a3345d4d55685d9a21202f3ec0f6a440e98，[CI35120320368](https://github.com/cccjvav/web_agent/actions/runs/35120320368)九项已逐项确认成功（七组主机Node、Windows安装器、Chromium）；本地82测试文件、246源码/28目录/110排除。上述CI不证明用户Conda/Windows新操作已执行。

#### 第十八组：隧道实义对照与最终MCP验收入口

完成隧道指南/模块README/生命周期与停止说明整篇读取，对照实际三份源码、API启停与经典UI。修正文档旧HTTP200成功/回退3000/每次域名必变、System32安装与父进程PATH说明；安全说明的非破坏性命令承诺与域名段同步，不冒充安全全文完成。经典UI实际修复启动丢失具体原因、停止无HTTP/业务检查；失败刷新与不复制URL、停止失败不假灭灯有真实模块VM，新Chromium使用实际页面模块与拦截失败响应验证，公网提供商/Windows进程未执行。

用户安排最终本机项目根MCP验收，已进入管理索引及清单M1–M5：先实际工具/主机/根核对，不读取密钥、不覆盖源码改动、不代签原生窗口和断连后的进程状态；当前无本机MCP接入，不提前标通过。

#### 第十九组：Skill新建与现行操作说明

完整读取技能使用指南276行、skills.js198行，核对创建API/UI与图像候选读取路径，修来源ID/frontmatter、旧示例工作区与四篇说法，删未验证第三方比较。实际修API默认覆盖同名Skill（含规范化重名），内部createOnly在写路径锁内拒绝已有文件；新建按钮确认HTTP和业务结果，不再失败也成功。真实HTTP覆盖同名并发保留成功者，Chromium点按钮核对400错误；OS进程竞态、桌面真实窗口、当前MCP接入仍未代签。

第18组ae97f65e20f2b23f2ca3838aa9131934ad0471d4，CI35124844106九项逐项成功。第19组36ff82f4b21ee4714dcacd9ff0cd657c47e88def本地82测试文件通过，CI35125290301首轮8/9成功、整体失败：Windows22 npm test中mcpProtocol命令echo约30.5秒超时、patchEngine搜索worker启动10秒超时；浏览器/安装器/其余六组主机成功。日志下载EOF，check-run annotations提供具体错误；诊断性rerun请求被拒绝，未实际重跑。未放宽超时/删断言/自动重试，根因未证实，后续绿灯不抹去首轮失败。

后续证据提交e470d5ff7efbdcfe3ef03d86f42519f147003a9a，[CI35125876577](https://github.com/cccjvav/web_agent/actions/runs/35125876577)九项逐项成功，包括Windows22与新增Chromium失败响应测试。未改实现/放宽断言，仅新完整运行未再现上一轮超时；原失败与未定位根因仍保留。

#### 第20组：探测暂停与主使用指南非探测部分

按2026-09-17用户指令暂停探测专项等待外部整合项目交接，阶段8改为当前暂停并列交接门槛；未拉取/审查新项目，不删除现有功能或跳过原有回归。主使用指南全文读取，非探测正文核对启动器/安装/Bridge失败状态与配置保护，修错误回退/自动拼接/忽略规则/安装PATH等。探测小节只加存量范围说明，其实现不在本轮复核。

第20组b4cd7ae4852c113e6d9cf51fdce3da6cf3ba279d，[CI35231427025](https://github.com/cccjvav/web_agent/actions/runs/35231427025)九项逐项成功；本地82测试文件、246源码/28目录/110排除，文档构建/链接/diff检查通过。未拉取外部探测项目，既有探测回归保留不等于继续专项开发或替外部验收。原Windows超时根因仍未定位。

#### 第21组：隧道日志凭据边界

安全说明全文读取，聚焦修复已披露的Named/ngrok跨chunk Token泄露：逐stdout/stderr的UTF-8/KMP状态先遮盖后裁剪，结束不flush候选前缀。新增所有字节切分、中文/重复前缀及实际提供商回调/历史/交错流/停止回归；不代表通用秘密扫描或清除历史日志，不改变argv/env信任边界。探测暂停保持，当前不需用户操作，其他安全实现对照及Windows超时仍未全部解决。

第21组2e1bc29c280ab08b7cebe985bb6ba602c968f483，[CI35233048258](https://github.com/cccjvav/web_agent/actions/runs/35233048258)九项逐项成功，本地82测试文件、246源码/28目录/110排除。首轮本地遗漏collect函数说明导致1/82失败，补登记指南后全量通过，未推送失败版本。既有Windows历史超时根因不由本次通过代替，探测暂停不变。

#### 第22组：只读Git与工作区说明

任务板/Git/工作区详解整篇对照。Git状态改NUL记录，保留中文/重命名originalPath、识别无提交分支且超过80才截断；差异使用字面pathspec，禁external diff/textconv/fsmonitor，补实测仍能执行的clean filter入口，发现配置键名后临时禁clean/smudge/process/required，保留总预算和配置本身。真实临时Git及自写辅助程序正反对照，无用户仓库/凭据参与。原Git环境与同用户竞态不是隔离保证；任务板坏文件保留等旧说明/注释已修，探测仍暂停。

第22组52b2148b96bbb01431f0ead70352e7d4a90e4f64，[CI35235675274](https://github.com/cccjvav/web_agent/actions/runs/35235675274)九项逐项成功，包括七组主机的真实Git回归；本地82测试文件、246源码/28目录/110排除，构建/链接/diff通过。Windows旧超时根因与用户最终本机验收仍未关闭，探测继续暂停。

#### 第23组：优先交接与路线图

用户考虑其它助手接力，要求先准备交接并包含计划。新增根《交接与路线图》，由README/AGENTS/CONTEXT及文档站进入；记录精确基线、历史失败、权限/模式/恢复不可丢约束、R0–R8/P优先级/状态/入口/完成标准，R1画像与记忆可直接作为下一包。不恢复暂停探测，不将候选统一承诺实施，不提前连接本机或代签；本组未修改产品运行逻辑。

第23组cd2a3eaa42831526e3a6ef7a504370144e857da5，[CI35243219647](https://github.com/cccjvav/web_agent/actions/runs/35243219647)九项逐项成功；本地82测试文件、246源码/28目录/110排除。首推0fac6f0漏带生成tests/README导航，CI35243193771整体失败（仅浏览器1/9通过）；立即补齐cd2a3ea，无测试削弱。交接首版已可接力，下一项仍R1，未把路线待办冒充已实施。

#### 第24组：R1画像、定制与记忆

整篇对照画像与记忆详解及三个完整模块，读取profile/memoryRecall/stateIntegrity与路径/有界读取相关调用；同步models README、对应测试详解及PUT路由说明。隔离9639558旧模块复现：仅patch notes把shell重置auto；instructions对象写坏JSON后才抛ERR_INVALID_ARG_TYPE；260KiB条目可写但recall跳过；悬空日期文件链接可在工作区外创建目标。首个旧版副本复现夹具漏extension/package元数据，补齐临时目录布局后运行，不覆盖真实源码/用户文件。

修复：validateCustom对画像文本/子对象做有限类型校验；坏旧配置拒覆盖，所有输出先安全路径解析/渲染/8MiB校验，再逐文件rename；patch分别保留environment/techStack旧字段；PUT非法输入400 JSON，其余错误500。profile清单最多256KiB且只认对象/普通文件，jsconfig不当TS证据，Python标记不直接推断pytest。remember正文16KiB/NUL/类型校验，每日文件含新增字节不超过256KiB，lstat拒最终链接含悬空链接，CR/LF归一、新文件0600；旧日记不删除/轮转。

profile/API/记忆新增负例与字节保留断言；Windows外部目录用junction测试，悬空文件symlink负例仅非Windows。单Node同步调用无await穿插，但没有外部OS写进程锁/版本控制、四文件事务或断电耐久性；辅助列表不是完整schema。R1本包结束，下一包R3继续settings.js加载/保存失败呈现与旧state提交链，R2继续共享路径/安全实现，不据此关闭全部优化。探测继续暂停，实机与Windows历史超时仍待。

第24组55c3656d7842e5c361fefa27b376fa6db1ed8b75，[CI35245544812](https://github.com/cccjvav/web_agent/actions/runs/35245544812)九项逐项成功（七组主机Node、Windows安装器、Chromium）；本地82测试文件、246源码/28目录/110排除。悬空文件链接负例只在非Windows执行，Windows目录链接用junction；不是用户实机或同用户OS进程竞态验收，不关闭历史Windows22超时根因。

更新路线状态后的本地全量曾1/82失败：旧交接守卫写死“R1 / 下一项”。改为检查R0–R8/P齐全且恰有一个当前下一项，保留结束标准/历史CI/暂停/验收守卫，再重跑；没有为过时断言把实际状态倒退为待做。

#### 第25组：R3定制设置失败消费首包

对照settings的定制加载/保存/渲染、bind全部saveCustom调用与对应GET/PUT路由，非整个settings/bind/API语义认证。先在真实ES模块VM新增400负例，旧实现返回undefined且替换state，失败已复现；修为加载/保存HTTP、业务与可渲染快照检查，失败返回false、保留state和草稿，所有调用方成功提示均受结果控制。只提交partial，避免旧state无关字段回写；保存后只重画登记列表，保留请求期间和其他页的未提交表单。

页面内load/save共用busy，拒绝而不排队；10秒AbortController超时、finally释放。不是跨客户端CAS；错误/超时可能已经部分写盘，明确核对、不自动重试、不宣称回滚。GET损坏配置统一500 JSON/no-store、保留原文件。

VM覆盖HTTP/业务/JSON/形状/网络/超时、忙拒绝、partial与草稿；HTTP覆盖坏文件500和字节保留；Chromium新增真实保存按钮400/草稿/无假成功回归。相应正文、README、函数与测试教学直接同步。本地82通过；本批精确提交CI受账户级阻塞，证据如下。下一项继续R3模型选择/多模型设置等未检查响应的调用与工作流长篇；R2共享安全依赖、Windows旧超时和实机边界未关闭，探测保持暂停。

##### 第25组验证阻塞（不借旧绿灯）

实现提交483510a64b02fc2e124523ce13a668199411f722，[CI35247957459](https://github.com/cccjvav/web_agent/actions/runs/35247957459)整体失败，逐项九任务annotation均为“The job was not started because recent account payments have failed or your spending limit needs to be increased.”；并非九项代码测试执行失败，未运行主机矩阵/安装器/Chromium。已告知用户由仓库所有者检查GitHub Billing & plans，不代调付费额度、不重跑到绿。日志下载EOF，注释提供阻塞原因。

本地82测试文件、文档生成/构建/diff通过；包含实际ES模块VM与HTTP负例。沙箱无Chromium可执行文件，一次锁定版本的Playwright浏览器安装命令因cdn.playwright.dev TLS连接ECONNRESET失败，未执行新增浏览器用例。没有删除断言、放宽测试时限或冒充Windows/Chromium通过；解阻后核对包含本次实现的精确提交CI。

#### 第26组：用户要求的文档集中与旧稿退役

用户明确重申之前待办继续完成，并要求先整理集中仓库文档、做好链接、更新与删除过时材料。建立docs/README统一入口及guides/development二级索引，迁移19篇根专题；根保留主指南/交接/约定安全/脚本同级说明和暂停的探测三篇，源码逐函数教学留模块旁。17篇历史审查归archive并标非现行指令，review只保留活清单/台账/采用图与证据入口。

完整核对旧PROMPT：其1–10早已完成，仍包含旧分支、旧副本和失效能力限制；删除任务正文，将唯一完成映射保留在archive README，原稿可查迁移前1d532d0。ShunCode授权、Windows原始step5日志、历史失败/误报均保留，不用归档减少未完事项。DOC_QUALITY旧“当前差异”不再被活清单/站点README当当前结论，改指现行台账。

同步相对链接、文档站读取路径/稳定页面ID、安装白名单及实际界面帮助路径（核心扩展副本一致）；新增中央目录的逐文档链接/标题与无根副本回归。首次全量发现旧DOC_QUALITY配置和HTML帮助路径遗漏，修正；随后历史报告误入extraSiteDocs被既有守卫拒绝，移除该过时入口，不削弱禁止历史混入现行站点的断言。不是全仓逐句语义认证，R2/R3/R4/R5/R6/R8/P原状态继续。

第26组8ccbcc3b515c06b1b81b9c806c32b4cde6a75a7a，本地82测试文件、文档构建/链接/安装载荷回归通过；[CI35250548224](https://github.com/cccjvav/web_agent/actions/runs/35250548224)九任务仍因GitHub账户付款/支出上限未启动。不是代码测试九项执行失败，也不代表Windows/Chromium已通过；需所有者检查Billing & plans，未重跑或放宽断言。

#### 第27组：正式全仓逐句审查与剩余施工并行

用户明确两项任务，新增review/FULL_REVIEW_INDEX逐文件状态，198份Markdown/许可/文本证据全量枚举；维护索引自身除外、受限日志只登记路径，暂停探测不读正文。不把目录搬迁、旧批次阅读全文或生成通过当本轮认证。首批3篇导航按实际目录/入口逐句核对，2篇第三方说明全文对照发现clients.js固定安装/订阅/站点保证与指南不一致（F27-02未闭环，下一包优先），2篇设置说明仅模型/多模型保存段核对。

R3实修saveModelSettings：表格选择和多模型保存共用HTTP/success严格检查、页面内互斥、10秒等待；失败不假成功/重试，失败选择退回最近确认状态；保存已成功但刷新抛错单独提示而不重做保存。VM覆盖HTTP/业务/网络失败、互斥、成功刷新与保存成功/刷新失败；不是全部/api/models调用或refreshStatus的HTTP认证，也不代签真实模型服务/浏览器。

开头发现沙箱Git HEAD回到7c9bde5，文件仍是2f569c2：逐个比对远端blob，只有9份CMD换行不同且规范化后完全一致，先备份再mixed恢复索引/指针，立即clean；未hard reset、清理或覆盖工作树。验证结果以本批实际执行为准，CI账单阻塞仍单列。

第27组本地82测试文件通过，246源码/28目录/110排除；恢复依赖时发现Acorn缺失，按锁文件npm ci后生成/构建及全量通过。正式清单守卫验证全量文件登记而非语义自动通过。

第27组实现b07d41d552e6cd7ee2ccc5c1a757b79fab1a68c9，[CI35252848573](https://github.com/cccjvav/web_agent/actions/runs/35252848573)九任务annotation均为账户付款/支出上限问题，未启动测试；本地82测试文件通过，不代签Windows/Chromium，不自动重跑。

#### 第28组：F27-02第三方客户端跨端矛盾

完整读取clients.js，按needsPlus/needsTunnel/supportsMcp/connectMode检索消费者，发现除旧商店ID/构建/站点保证外，paintClients和MCP资源把null当false输出无需Plus/no；DeepSeek独立指引页和页面规则前言也保留固定安装/注入行为保证。先用真实Bridge模块VM复现未知被误报，随后修正两张候选卡为unverified/null，保留候选地址与复制规则但无安装/连接副作用；严格三态展示、移除固定商店入口、条件式认证/请求位置/版本核对、规则不授予权限。同步两篇专题、逐函数说明、页面提示及MCP/HTTP/VM回归，旧固定商店ID断言改为未知字段/无固定安装保证，CORS的扩展Origin测试原样保留。

正式清单198条：两篇专题从“已读有问题”转逐句核对，总计5篇；资源客户端详解仅对应章节核对，局部3篇。F28-01记录其余ChatGPT/通用卡片与配对提示的厂商/菜单/订阅保证仍待，未认证全部clients或OAuth实现、第三方站点和安装。未拉取探测/第三方源码，探测暂停。Git元数据重建再次显示旧HEAD，先逐文件核对远端5401103（9份CMD仅换行差异并备份）后mixed对齐，立即clean，没有覆盖源码；依赖缺diff，按锁文件npm ci恢复。

本地82测试文件、246源码/28目录/110排除通过；CI以本批精确提交为准，不继承旧绿灯。

第28组28f26e166be5294bc2963b30e195e800ef48f05d，[CI35263924819](https://github.com/cccjvav/web_agent/actions/runs/35263924819)逐项九项成功（Ubuntu18/20/22/24、Windows20/22/24、安装器、Chromium）。本地82测试文件通过，246源码/28目录/110排除。本次CI实际执行，不再把账户问题列为当前全局阻塞；不推断账单如何恢复，不删除25–27组未启动历史，也不据此关闭Windows旧超时根因或第三方实机验收。

#### 第29组：交接并入项目管理与F28-01续作

用户指出根路线与项目管理职责重复。将完整工作包/约束移入manager/ROADMAP，修相对链接；删除另存的最新SHA/CI快照表和重复批次续作日志，证据仍在阶段记录/Git。根交接页只导航，CONTEXT是摘要，stages是过程/证据，正式清单是文件覆盖。守卫迁至真正路线，根不准复制任务表，新增路线纳入全仓清单；不是再建第二套管理系统或取消原计划。

继续读取OAuth注册/授权检查相关函数，证实按客户端参数和PKCE而非ChatGPT厂商名验证。移除通用/OAuth卡的固定菜单、/plugins、订阅保证，标未知候选；配对码提示改兼容OAuth客户端。VM先复现旧专属提示，协议/HTTP核对新合同且保留认证测试。另发现已选unsupported卡片空prompt回退全局密钥连接文案，改已选卡片直接返回空；复制空值不写剪贴板，不假报成功。没有变更OAuth授权执行逻辑，不认证厂商服务或整份OAuth实现。

原R2/R3/Windows超时/实机/P暂停保留。本批管理路线完整内容尚未重新逐句认证，正式清单199条；结构去重不自动增加审查完成数。

第29组本地完整82测试文件通过，246源码/28目录/110排除；生成/构建、管理入口/全量文件登记/链接与协议/HTTP/VM回归均通过。实现6da5f89e8f8f84abc35a6d62843a9bfe74c7bce8，[CI35265619136](https://github.com/cccjvav/web_agent/actions/runs/35265619136)逐项九项成功（七组主机Node、Windows安装器、Chromium）。没有变更OAuth授权逻辑，不是客户端厂商兼容/用户本机验收；Windows历史超时根因仍未关闭。

#### 第30组：彻底回归原项目管家结构

核对manager/SKILL.md的L0/L1/L2和阶段模板，确认CONTEXT负责索引，stages本来就承载目标/需求/设计/实现/复盘/待更新文档。第29组将路线单独放manager仍属不必要的扩展，本次撤销：原工作包、候选门槛、接手顺序、测试方法、权限/恢复/验收/暂停约束并入本阶段；根交接文件和manager/ROADMAP.md删除，不留跳转壳。

原阶段的重复“当前剩余范围”表移除，唯一R0–R8/P表完整保留；日期批次证据保持，旧文件可从2f270e6追溯。同步所有内联引用、管理入口、站点路由和审查退役登记。没有取消剩余工作或增加语义完成数，本批不改产品运行逻辑。

本地验证：82测试文件通过，文档246源码/28目录/110排除；生成与链接守卫通过，两个只读技能文件无改动。首次直接构建被源码快照漂移守卫拒绝，按规定先运行check-docs --write再构建通过，未绕过守卫。远端核验：7439388ed80359bdcc814a8f0cfe3fb5a8267baf的[CI35266822926](https://github.com/cccjvav/web_agent/actions/runs/35266822926)九项全部成功（七组Linux/Windows主机矩阵、Windows安装器、真实Chromium），不替代用户实机验收或Windows旧超时根因。

#### 第31组：R3状态发布屏障与模型选择确认

接手在固定arena/01a0b0da-web-agent上fetch并快进同步来源01a08d85的73456b5，干净工作树；该来源精确CI35267082732九项成功，本地基线82测试文件通过。本批不切换/推送来源分支，不重复已交付功能，探测施工保持暂停。

对照GET status、POST models、store校验、bridge/settings/bind和Chat消费select链。先加真实VM负例，旧refreshStatus对HTTP503未reject而失败（Missing expected rejection），证实会发布错误JSON；实现加入核心形状验证、10秒/no-store、headers/body双序号屏障，新请求即使失败也不允许旧GET回填。成功显示后的select和按钮同用后台ID，未知ID不选builtin；读失败保留旧快照并标状态同步失败，渲染失败单独标注，不宣称DOM事务或全部嵌套schema已验。

聊天picker不再乐观更新标签，隐藏select在保存前立即恢复最近确认值；聊天选择、表格、多模型和显式切内置共用saveModelSettings的HTTP/业务检查及页内互斥。内置失败不报已切回；保存确认后刷新reject或被新读取代仍报告“已保存但刷新失败”，不重新POST。Chat结束的后台刷新新增catch，不把读取失败变成对话重放。

VM覆盖错误HTTP/业务/JSON/坏模型形状、网络、超时释放、乱序头/JSON迟到、新读失败不采纳旧成功、未知ID/think草稿、真实bind并发点击/失败与成功、一写后刷新失败。新增modelStateBrowser通过真实页面点击和拦截响应验证标签/select/错误提示及读恢复不重放；本沙箱Chromium下载因cdn.playwright.dev TLS握手前ECONNRESET失败，无可用浏览器，不将新增浏览器用例写成本地已执行。未降低TLS校验或改浏览器版本。

验证：workbenchRuntime筛选通过；文档生成/构建与完整82测试文件通过，246源码/28目录/110排除，git diff --check通过。实现78ebac2daac3904cd7d1ce71ea26a3c4152878a7已推当前固定分支；[CI35269106675](https://github.com/cccjvav/web_agent/actions/runs/35269106675)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）。新增modelStateBrowser在CI实际执行通过；本地下载失败事实保留，不代签用户本机或Windows历史超时根因。对应说明只认证已改章节，正式清单完成数不增加。Provider添加仍有探测HTTP/超时/失败消费、整表替换旧模型、写请求互斥等独立缺口，下一包先明确替换/保留边界并补回归；其他状态嵌套消费者、API/工作流、安全依赖、Windows旧超时及用户本机验收未关闭。

#### 第32组：Provider仅追加、发现期限与失败消费

范围是本机API Provider的/models发现与配置，不是暂停的身份/轨迹探针。对照bind/settings、providers、POST models及store同步保存链，确认旧Add构建builtin+发现列表整表替换、忽略保存结果；VM先复现HTTP500但success:true仍报Test OK。新增addProvider合同的HTTP回归初次失败是旧路由忽略新字段只回success、并未追加，故前端另检查added防假兼容。最初VM夹具缺m-base节点导致TypeError，补齐夹具后得到真实产品失败；不把夹具错误当产品缺陷。

决策：Add仅追加、不切换当前模型；同Endpoint/modelId（含旧版记录）冲突整批409，不覆盖密钥，不把脱敏旧列表提交回去。新ID由规范Endpoint+完整远端ID的SHA256生成，避免标点清洗碰撞；保留旧模型/Key、Bridge及其他配置。全部校验后单host同步load/check/save；不宣称跨进程CAS、旧模型更新/删除UI或完整配置schema已完成。通用POST models原整表能力保留兼容，只有新增分支严格禁止混用字段。

Test/Add全流程与模型选择共用guard，捕获Endpoint/Key/manualId/vision快照；普通发现失败不保存，明确填manualId后Add只登记此项。POST必须HTTP/业务成功且added匹配才确认，保存后刷新失败不重放。确认后只清仍等于本次输入的Key，保留新草稿。Provider表用无原型字典避免__proto__/constructor组名崩溃；HTML和说明改成列表成功不等于Chat/工具/视觉兼容。

后端15秒期限原已存在，本次修正文档中“无期限”旧断言；新增断连取消传播、逐块512KiB预算（非进程内存上限）、1–100项/字段预算、URL/key校验、拒跳转及错误正文不回显。发现只向用户明确指定的HTTP(S)端点发送Key，可含本机服务；没有套用externalMCP的公网DNS/SSRF隔离保证。旧ProviderKey更新/删除、其他状态消费者和R2剩余安全调用链仍未完成。

验证：apiFiles、providers、workbenchRuntime和chatVision筛选通过；VM、真实回环HTTP、body停顿/跳转与配置保留已覆盖。新增浏览器点击fixture在本批CI实际通过；沙箱仍无Chromium，沿用第31组下载失败记录，不伪造本地浏览器通过。完整82测试文件、生成/构建/一致性检查通过（246源码/28目录/110排除），实现87b1e918ff153c64b510c38cee8b44e9b5fac33a已推当前固定分支，[CI35270917981](https://github.com/cccjvav/web_agent/actions/runs/35270917981)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium），不代签用户本机或关闭Windows旧超时根因；正式清单只扩大对应章节局部范围，不增加整篇通过数。


#### 第33组：审批/工作流未知效果与审阅绑定

先核对operatorQueue、workflows、callTool/toolTrace、requestScope/executionControl及operations实际消费链。红测一是在真实file_written事件订阅抛错，文件已写却工作流报failed；二是handler回running/waiting-approval，队列却报succeeded；三是VM延迟审阅A后读取B，旧回包覆盖新审阅。先复现再最小修复，不把此前候选直接当已确认漏洞。

工作流调用前复查取消/before/引用/远端步骤权限，保留not-started拒绝；进入写工具后抛错（含E_CANCELLED）保守unknown并停止后步，缺失或未完成trace同样停止。队列严格布尔确认，handler非终态/null/未知验证不报成功；只有handler调用前的E_FORBIDDEN是已知拒绝，调用后同名错误仍unknown。取消意图在finally回收controller后保留；两步间取消不撤回第一步、阻止第二步，末步已取得可靠成功不被武断降级。不会自动重放，不声称failed意味着从未产生过副作用。

operations的详情/预览/提交共用审阅代次，先清旧控件、GET可取消、详情ID和状态/输入形状复核；按钮绑定已展示ID/代次并在POST前消费，迟到批准/停止回包不重开旧审阅。HTTP和顶层业务失败均拒绝，读取/工作流请求10秒、批准70秒，HTTP接入登记/stdio启动40秒留给后端30秒初始化。期限覆盖正文；网络取消不撤回服务端副作用。工作流提交在途guard避免连点新UUID，丢响应先查原列表/ID，不自动重放；明确下一次新提交仍是新请求，不承诺跨刷新/重启永久去重。批准中可重新读取同一请求再请求停止。

验证过程：approvedOperations/workflowPreconditions/workbenchRuntime先红后绿；执行控制旧断言曾因过度保守把调用前撤权也记unknown而失败，修为显式调用前权限复查，保留原failed断言并加强not-started证明。全量初次81/82：新增approvalReviewBrowser说明误放测试副文档，主归属是主机诊断与调用追踪详解，只修其浏览器测试段，不开展暂停专项。新增真实Chromium fixture覆盖审阅切换、预览/错ID清控件与提交连点；本地无Chromium，未宣称执行。修正后最终本地82测试文件通过，文档生成/构建/一致性检查通过（246源码/28目录/110排除），git diff --check通过；实现70c55a5718412460df3ebcff6828435314066cfa已推当前固定分支，[CI35276596251](https://github.com/cccjvav/web_agent/actions/runs/35276596251)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）；approvalReviewBrowser已实际执行通过，不代签用户实机。

本批只对审批/工作流及相关UI段落作局部核对，不把含stdio/connectionCheck的长篇或R2全链盖章。下一包继续operations列表/检查点响应及其余API消费者，穿插R2。历史Windows超时根因、用户实机、正式全仓逐句审查仍未完成；身份/轨迹探测保持暂停。


#### 第34组：审批/检查点列表隔离与恢复响应消费

第33组已完整交付，用户要求继续；从56a858f干净工作区续作，没有重复恢复Git或重做第33组。范围收窄到operations列表和检查点的预览/恢复消费者，后端fileCheckpoints/绑定/路径/hash/一次性ticket对照，不开展暂停探测专项。

红测确认：检查点GET失败让审批GET次数为0；错ID预览仍生成恢复控件。两列表改独立并发加载/代次、错误隔离、整批形状与重复ID校验，先清旧控件，迟到JSON不能回滚列表，旧列表按钮不可复用；刷新按钮不再action导致二次刷新。检查点预览校验ID/ready/previewId/完整文件清单/hash/changed/diff，展示/恢复/结果发布核对工作区绑定；恢复响应核对consumed、同一文件集合与success/status/逐文件一致，缺失/矛盾响应只提示未确认，不重放。合法部分失败照实展示，不说HTTP200就是恢复成功。

fileCheckpoints新增真实file_written回调抛错：磁盘已恢复第一文件、第二未开始、结果unknown且再次恢复拒绝；既有后端正确处理，未改后端代码。VM覆盖两个红测、双列表乱序JSON、无效整批/旧按钮、坏预览、绑定变化零POST、恢复null/错ID/矛盾结果、不重放与合法unknown/succeeded。新增checkpointResultsBrowser真实页面拦截场景；本地无Chromium，不代签已执行。最终本地82测试文件通过，文档生成/构建/一致性通过（246源码/28目录/110排除），git diff --check通过；实现677f47ab22bdfebe18daa13561e6a93776d2d581已推当前固定分支，[CI35279294245](https://github.com/cccjvav/web_agent/actions/runs/35279294245)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium），新增checkpointResultsBrowser已实际执行通过；本地仍无Chromium，不代签用户实机。

只扩大相关正文局部范围，未给整个编辑回退、审批长篇或API全链认证。下一包继续其余API写请求/状态消费者与检查点创建等尚未复核入口，R2穿插；权限/进程隔离、历史Windows超时根因、全仓逐句、用户实机仍未完成，探测继续暂停。


#### 第35组：创建检查点的确认、草稿与在途互斥

2026-09-18从389b237干净工作区继续，第34组最终CI已完整核验，不重做。先定位operations创建回调与fileCheckpoints.create/绑定/HTTP测试：两次onclick在首个POST等待期间会发两次创建，VM红测实际2、预期1。本沙箱依赖在会话恢复后缺失，按原命令npm ci补齐后取得真实红测；缺依赖不是产品缺陷。

新增createCheckpoint与页内checkpointCreating，先占guard/禁按钮、捕获路径/绑定、失效旧恢复控件。1–12条不重复字面路径/每条2048、当前绑定、明确confirm通过才发送；取消/本地拒绝明确未发送。HTTP/业务/JSON/元数据合同/绑定失败或10秒中断仅报创建未确认，不重建；ready/result:null/文件数匹配才展示规范路径与ID。服务端可能规范化./别名，不假装按原始字符串完全匹配或独立认证内容。等待中保留新草稿、旧回包不覆盖新预览，finally释放guard。

已确认创建后只刷新检查点列表一次；列表失败/被取代不抹掉ID，不触发第二次POST，绑定后续变化提示回原工作区核对。不是跨标签页或持久去重，无requestKey新合同；后端8条/15分钟内存/分别时点读取未改。apiFiles真实HTTP证明别名规范化、创建零写、部分读取失败不留半条记录，既有后端正确所以不改。

VM红转绿，补HTTP/业务/JSON/形状/超时、忙拒绝、草稿、绑定、确认后刷新失败与旧回包负例。新增checkpointCreateBrowser真实页面/真实后端创建后暂扣响应，测试实际在途回调/草稿与null响应消费，最后清理临时检查点/文件。本地无Chromium，未声称执行；最终本地82测试文件通过，文档生成/构建/一致性通过（246源码/28目录/110排除），git diff --check通过；实现048a584df8d968d2515cf93c1714491e7b2c01ae已推当前固定分支，[CI35280644858](https://github.com/cccjvav/web_agent/actions/runs/35280644858)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）；新增checkpointCreateBrowser已实际执行通过，本地仍无Chromium，不代签用户实机。

只核对创建相关正文，未宣称整个API或安全链完成。下一包非探测的外部接入登记/移除与其余结果消费，R2穿插；正式全仓逐句、历史Windows超时、用户实机及暂停专项边界不变。


#### 第36组：HTTP工具接入登记/移除结果与停止边界

2026-09-18从340ab44干净工作区继续，探测专项不动。先对照externalClient.add/establish/remove、REST、本机页面和实际回归。VM红测：removed:false仍被onclick返回true；挂起首个登记时连点使POST=2。没有据此宣称原UI明确显示过“进程已完全停止”，原问题是缺业务确认/停止状态保留。

externalHttpEndpoint做前端形式/规范地址检查，安全DNS/本机端口/隧道排除仍由后端；addExternalServer捕获全部表单/绑定、公网confirm、只清实际发送的旧Token。必须http/discovered/端点与公网选项匹配/有界唯一工具及审批schema才确认，固定异常提示不回显反射Token。独立结果区保留ID和未知提示，不被列表统计覆盖；确认后列表失败单独提示，不重放。

externalPending按登记与remove:ID分别互斥，允许移除connecting接入，不用全局锁挡住停止；移除按钮绑定列表代次并一次消费/禁用，刷新同ID也不能并发重发。removed必须true，stopping:true仅说明停止请求，不是已观察退出。externalMutationGeneration阻止旧登记回包覆盖新移除。拆分锁时曾有文本替换造成server未定义的中间回归，已修复并重跑，未削弱断言。无后端新幂等合同或跨页锁。

真实HTTP测试移除挂起发现、等待登记拒绝、再次remove=false，目标HTTP服务仍活着且后来显式登记可用；stdioMcp先检查移除回包，再closeAll/真实PID证明最终退出。既有后端行为正确，本批不改后端源码。VM定向通过，新增externalRegistrationBrowser拦截场景并补齐旧公网浏览器fixture合同；本地无Chromium，不宣称已执行。最终本地82测试文件通过，文档生成/构建/一致性通过（246源码/28目录/110排除），git diff --check通过；实现0b79fc41ae3465b4259a065450e445168756d1c6已推当前固定分支，[CI35282860722](https://github.com/cccjvav/web_agent/actions/runs/35282860722)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）；新增externalRegistrationBrowser已实际执行通过，本地仍无Chromium，不代签用户实机。

只扩大HTTP登记/移除及对应测试/页面段的局部审查；stdio预览/启动结果消费者留下一包，R2穿插。正式全仓逐句、历史Windows超时根因、真实提供商/用户实机仍未完成，探测保持暂停。


#### 第37组：stdio预览完整性、一次启动与结果未知

2026-09-18从f81613b干净工作区继续，仅非探测stdio消费链。对照stdioLaunch.preview/consume、externalClient.startStdio/establish、transport.status与页面，先红测证明：仅previewId就启用启动；启动HTTP200/null仍被onclick消费为true。不把这称为后端越权：后端已有完整配置/hash/过期/单次消费门槛，原问题是前端审阅和结果不可信。

新增完整预览合同/草稿与绑定快照，程序stamp、args、cwd、envKeys及reviewFiles等字段齐全才给按钮；规范路径由后端决定，前端不独立认证哈希或环境来源。预览/启动共busy，避免连点预览在清env后又生成无env的新授权；编辑/新预览使旧回包失效，程序化改value也在启动前被拒。确认前后复查草稿/绑定/本地有效期，确认后先消费ID再POST；取消确认不消费。期限沿用预览10秒/启动40秒，不伪装取消进程。

启动必须stdio/discovered、launch与预览一致、PID/ready/closed/stopped及工具审批目录合同通过；失败/非终态/矛盾/空响应只报未确认，可能已执行，不重启。确认后列表失败保留ID，新编辑后旧结果不覆盖警告。异常固定文案，不回显环境密钥；HTTP登记工具目录校验抽成validExternalTools共享，原合同保持。

stdioMcp真实进程加强失败consume不可重用、原输入args/env事后修改不影响已审快照（仍验证原secret/参数），后端行为正确、源码不改。VM红转绿并补过期/绑定/草稿/忙拒绝/超时/丢结果/刷新失败；新增stdioLifecycleBrowser合成响应页面测试，main已有真实启动链保留。本地无Chromium，新增场景未宣称执行；最终本地82测试文件通过，文档生成/构建/一致性通过（246源码/28目录/110排除），git diff --check通过；实现beb6d48fa355b5bef59d4bd9c4e2dd69a25a933b已推当前固定分支，[CI35284740947](https://github.com/cccjvav/web_agent/actions/runs/35284740947)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）；新增stdioLifecycleBrowser和既有真实启动链已实际执行通过，本地仍无Chromium，不代签用户实机。

仅扩大上述局部，未认证整个stdio长篇、依赖树或OS隔离。接下来按R2高风险穿插复核localControl/corsAllow及路由的本机控制面/跨站拒绝链，R3其它消费者继续保留；全仓逐句、旧Windows超时根因、用户实机未完成，探测专项暂停。


#### 第38组：本机控制面回归与MCP解析前Origin拒绝

2026-09-18从6639053干净工作区继续R2，不重做第37组、不进入探测。读取localControl/corsAllow、真实入口和API挂载后，用真实index服务复现：合法MCP密钥+不允许Origin+畸形JSON得到解析器400，预期应先403。原路由在解析后仍会拒绝业务，所以这是提前拒绝/资源处理顺序缺口，不是已证明的浏览器工具执行越权；跨站JSON通常还受浏览器预检限制。

最小实现只在MCP端口applyCommon中把/mcp硬Origin门禁提前到CORS/认证/正文解析之前，路由前原复验保留。允许预检仍204且不需密钥；合法来源或CLI的有效路径仍须认证，缺凭据的坏JSON先401，正常初始化200。未知路径不保证认证前置，不承诺网络层抗DoS。没有改变Origin允许集合、通用URL解析策略或无头本机CLI兼容；探索性“空Origin必须拒绝”断言与当前合同不符，已撤回，不作为产品漏洞证据。

auditControl直接加载真实双server，保留原400对403红测并转绿；覆盖/mcp与密钥路径GET/POST/OPTIONS拒绝、允许预检、CLI/Arena/扩展初始化；双端口API的非法Host/端口、CF/CDN头、外站Origin/Referer均在坏正文解析前404。WS补恶意Host/隧道头拒绝，并保留无Origin/本机Origin允许。localControl增加合法Host配远程socket、socket优先于伪造ip/转发头、缺地址与严格Host边界；corsAllow证明额外MCP来源不放开API。这些是Node HTTP/WS与纯函数证据，不冒充真实跨站浏览器或代理部署。

逐句对照控制面与Origin详解所有段落/函数并补准确装配、无/坏Referer与非严格同源边界；正式清单该篇新增整篇核对1，其余入口/测试/SECURITY只记对应局部。纠正旧安全说明“WS统一404”和状态API似乎强制Origin的表述。全仓仍197项，已逐句6、局部21、待逐句113，其余边界不变。

本地localControl/corsAllow/auditControl定向、完整82测试文件、文档生成/构建/一致性（246源码/28目录/110排除）及git diff --check通过。实现ca7ab17df95adf1526c791176c0fc71cb748c8af已推当前固定分支，[CI35287587285](https://github.com/cccjvav/web_agent/actions/runs/35287587285)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、既有真实Chromium。本地无Chromium，本批未新增浏览器攻击用例；既有页面链通过不是跨站攻击复现或用户实机验收。下一项继续R2 OAuth凭据/issuer与剩余路由边界；R3其它消费者、Provider更新/删除、历史Windows超时根因及用户实机未完成，探测继续暂停。


#### 第39组：OAuth凭据、issuer与生产路由回归

2026-09-18从edf47d4干净工作区继续R2，OAuth实现、真实index及MCP验证入口、现有三份OAuth回归逐段对照。本轮没有复现产品认证绕过，未修改产品源码或认证策略；不为审查凑漏洞，也不重复第38组门禁修复。

oauthClientAuth从自行拼Express改为临时工作区/双0端口的真实index，最终停tracker、关双server并清理。三种认证方式继续覆盖错误凭据/PKCE不消耗code，新增错client刷新不消耗、错client撤销200但保留目标、机密客户端缺认证401、已认证未知token200不影响有效token。匹配归属时分别以access/refresh撤销一对，真实/mcp ping由200变401、刷新为400；OAuth revoke不轮换长期URL secret。

三条well-known与MCP解析前401挑战共同验证issuer：本机配置合法origin优先，恶意Host/转发头不能指定issuer，配置缺失/非法回本机，合法本机Host保留。最初用fetch设置Host时夹具失败（收到连接端口origin而非配置回退），改node:http明确发送该头后原断言通过；这不是产品漏洞红测，未放宽断言。真实urlencoded授权错误redirect返回400且无Location、配对码未消耗，HTML转义state且不回显码；合法请求302，禁止自动跟随回调，换code200、重兑400且原access保留。不访问第三方回调，不模拟浏览器点击。

OAuth授权详解全段/函数逐句对照：补URL规范化及req.protocol/当前代理策略边界，明确none不是secret持有证明、撤销200不证明目标存在/已删除、长期密钥独立。MCP README修“仅机密客户端返回secret”的错误（none也返回但不校验），安全/测试对应段局部同步。正式197项：已逐句7、局部23、待逐句110，其余状态不变；完整OAuth标准、第三方兼容与多客户端隔离不随文档盖章。

本地oauth筛选三文件、完整82测试文件、文档生成/构建/一致性（246源码/28目录/110排除）及git diff --check通过。测试/说明提交526dfadb1065d2de5f903cd4d47dd3bccd339f38已推当前固定分支，[CI35288609389](https://github.com/cccjvav/web_agent/actions/runs/35288609389)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、既有真实Chromium。本地无Chromium，本轮无新增浏览器场景，不代签真实第三方OAuth/用户实机。下一包复核MCP session/peer、凭据与任务/取消边界；已有取消按peer+凭据键隔离，不自动等同全部会话状态隔离。先查实际影响，不把源码候选提前记成漏洞。R3其余消费者/Provider更新删除、历史Windows超时根因、用户实机保留，探测继续暂停。


#### 第40组：公开peer与私有会话分离、认证主体绑定

从b0ea801干净基线开始R2。真实index双server、同一长期密钥两个客户端：B用正常会话修改A任务被E_NOT_OWNER拒绝，但从peers_list拿A的peer标签剥前缀后当Mcp-Session-Id，磁盘任务实际从claimed变done。原回归期望claimed、实际done，证明已认证协作者可冒用owner，不是未认证接入或OS越权。仅分离公开标签后，另一OAuth client用已知私有SID ping仍200而应404，取得第二个独立红测。

initialize改为独立随机公开peer，不再拼HTTP SID；合法重初始化保留key。requireAuth验证凭据后生成私有principal摘要，OAuth按kind+注册clientId、长期secret按kind+实际密钥；HTTP会话创建/读取/删除及keyForReq核对它，错误主体不续期。OAuth刷新沿用会话/owner，长期密钥轮换不继承旧session；不保存原凭据。未知/异主体普通请求404；DELETE仍统一204但不删除他人；允许创建的initialize/GET SSE可分配另一新SID，不能接管旧peer。受信内部直接函数夹具可省略principal，不是公开免认证入口。

mcpBoard保留直接RPC工具回归，增加生产HTTP/磁盘负例：公开标签不能更新任务或删除会话，OAuth跨client的ping/写/GET被拒，DELETE不影响原owner、initialize返回不同新SID；刷新后旧token401、新token保持归属，再initialize/更新仍是原owner。公开ping/peers/board响应不含夹具私有SID，正确删除后404，临时密钥轮换不继承旧会话。mcpCancellation补公开peer无法取消共享密钥调用，同一OAuth client的两个有效token仍不能互相取消原调用；原具体凭据取消、取消trace、ID释放等断言保留。stateIntegrity加错误principal不续期/不删除及正确主体读取/删除，受控时钟finally恢复。

本批用户续接后沙箱Git指针回到b6ab9ed，而文件保留最新状态。先停止普通提交、备份全部binary diff与逐文件hash至工作区外/home/user/r40-recovery；fetch后逐项核对远端b0ea801，恰只有本轮5个源码/测试差异。仅以update-ref/read-tree恢复固定分支指针和index，未覆盖任何工作文件，逐文件hash全部一致；没有reset --hard、clean或改分支。依赖缺失按原锁文件npm ci恢复，不作为产品失败或安全证据。

说明修正覆盖私有会话/公开peer、稳定OAuth主体与具体取消凭据的区别；仅对应章节局部核对，未重审budget/errors/全部RPC长篇。正式197项：逐句7、局部28、待逐句105，其余状态不变。共享同一主体并真正知道私有SID者仍可使用，不是完整多租户隔离；重启/过期/淘汰不从磁盘任务恢复身份，刷新不自动取消旧凭据在途操作。既有任意Execute/同OS用户信任边界不变，探测专项未施工。

定向mcpBoard/mcpCancellation及完整82测试文件、文档生成/构建/一致性（246源码/28目录/110排除）和git diff --check通过。实现bff848389183ee099d42a227aa04bc73f974f306已推当前固定分支，[CI35291325766](https://github.com/cccjvav/web_agent/actions/runs/35291325766)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、既有真实Chromium。本地无Chromium，不冒充新增浏览器攻击用例或用户实机验收。下一包回R3 Bridge启停/密钥轮换结果消费，R2余项、Provider更新删除、历史Windows超时根因、全仓逐句和用户实机继续保留。


#### 第41组：经典工作台密钥轮换确认、旧值比较与未知结果

2026-09-18按R3对照Bridge启停/轮换。续接Git再次停在b6ab9ed，先备份binary diff到/home/user/r41-recovery并fetch，工作树与远端fa963e8完全一致（git diff --quiet）；只恢复固定分支ref/index，不覆盖文件，再按锁文件恢复依赖。本轮不把历史改动当新提交，不重做第40组。

真实bind回调VM红测：POST HTTP500/success:false后仍toast“Secret已重置，旧链接立即失效”。范围收窄先修经典轮换；启停已有HTTP/业务失败处理，但并发/期限/后读失败仍另包，不能用同一总锁阻塞启动中的停止。读取原生扩展发现其resetSecret也未消费requestJson状态，尚未做该命令红测/修复，旧空体兼容不等于该UI已验收。

bind委托bridge.resetSecret。页内secretRotating/禁按钮，从页面捕获主机/工作区/旧secret，再GET当前状态复核；明确确认且确认后仍同绑定才POST。secretRequest独立10秒期限含JSON正文；validRotatedSecret要求严格success、新24位secret/路径及HTTP(S)URL一致。取消/发送前失败明确未发送；发出后HTTP/业务/JSON/超时/坏合同保守未知、旧地址可能过期、不自动重试。写确认后读取失败/被取代/绑定或secret不匹配保留原主机已轮换，只要求重新读取，返回写入确认而非再POST。独立aria-live结果区，不自动复制，不回显异常正文/密钥。

后端新增兼容性条件合同：带workspaceRoot/hostInstanceId/expectedSecret任一字段就要求完整绑定和当前旧值一致，否则409零轮换/零OAuth撤销；比较与同步保存单进程顺序执行，两同旧值请求恰一成功。旧无字段调用保留，不声称全调用者都有绑定、跨进程锁或永久幂等。原generateNewSecret保存后发布内存与revokeAll链保留。

VM红转绿并验证有效绑定下确实发了一POST，补坏形状/旧key/错路径、取消/确认时变绑、忙拒绝、正文超时、读取失败保留成功。bridgeTunnel真实HTTP验证条件拒绝、两请求200/409、磁盘/内存一致、旧key失效、旧空体仍兼容；注入保存失败时500且旧key/OAuth不变，写后广播失败时500但已轮换，旧expectedSecret再发409不二次轮换。注入错误堆栈是预期fixture，不是全量失败。

secretRotationBrowser新增真实页面的合成500/扣住POST/连点一写/写成功后状态503场景，不改测试主机真实密钥；实际后端由HTTP测试另证。本地无Chromium，未声称运行新增页面。对应说明仅局部，正式197项：逐句7、局部30、待逐句103，其余不变；不扩大为整个Bridge或扩展认证。

本地定向与完整82测试文件、文档生成/构建/一致性（246源码/28目录/110排除）、git diff --check通过。首轮7406e1a9a9d5e57077ea6954177ec017f2a8bf94的[CI35309852333](https://github.com/cccjvav/web_agent/actions/runs/35309852333)8/9通过：新增浏览器夹具误只开右侧Bridge，实际重置按钮在设置弹窗，点击不可见超时。日志下载遇EOF，check-run annotation给出具体位置/调用日志，与HTML层级一致；已修真实帮助菜单→Bridge导航→高级summary，不用force或改产品CSS。修正e9bb63b18f38a1b415ad8f609d67e787c8f3e391的[CI35310130909](https://github.com/cccjvav/web_agent/actions/runs/35310130909)浏览器已通过，但另8项在文档库存门禁失败：生成器把tests/README的浏览器函数数189改为188，提交时漏add该文件，导致已测工作树不等于提交树。现补齐生成导航并在提交前检查无遗漏的unstaged差异，不削弱门禁；不重跑原提交掩盖失败。

补齐后的529752b8e453942d5e42c76089714185f3502a5c已推固定分支，[CI35310276345](https://github.com/cccjvav/web_agent/actions/runs/35310276345)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium。新增secretRotationBrowser在CI实际执行通过（合成响应，不是浏览器真实轮换），真实后端写入/并发/异常语义由bridgeTunnel另证。本地仍无Chromium；最终82测试文件及文档生成/构建/一致性通过，不代签用户实机。下一包继续Bridge启停及原生重置命令剩余消费者；R2余项、Provider更新删除、历史Windows超时根因、用户实机仍保留，探测暂停。

#### 第42组：经典启停去重、停止优先与写后状态分离

2026-09-18继续R3。续接Git ref再次停在b6ab9ed但工作树等远端92c82a4；先保存binary diff到/home/user/r42-recovery/before.patch，fetch后git diff --quiet FETCH_HEAD确认为零，仅update-ref/read-tree恢复固定分支ref/index，不覆盖文件、不重复提交历史。npm ci按原锁文件恢复依赖。

真实Bridge模块VM将首个POST挂起，再次startBridge，断言一POST而实际两POST，红测后修。范围收窄经典启停，不混入原生扩展独立命令。启动页内单飞、预读10秒，捕获同一provider/domain/token及主机/工作区快照；预读后复查绑定，实时已运行不再POST启动。启动POST45秒、停止15秒，均含JSON，超时不证明服务端未执行。

停止独立guard，不等启动结束，也不借用轮换锁。bind在启动中将原按钮变为“停止启动”，右栏停止仍可用；停止期间禁重复停止及新启动。停止递增页面动作代次，尚未POST的启动取消发送、已发送启动的迟到响应不改新结果/灯，旧finally不解锁较新启动。停止请求携捕获绑定；API有任一绑定字段时完整核对，不匹配409且不改generation/配置/隧道，旧无字段调用兼容。这是新增条件合同而非已证明的认证绕过修复；原backend在途租约和启动generation机制不重做。

启动回包要求HTTP成功、严格success/running/provider及完整地址；停止要求严格success:true/running:false。确认写与后续读取区分，读取reject/被取代/主机或状态不符仍保留“原主机已确认、当前未核对”，不重复POST。未发送与发出后未知分别提示，固定文本不反射Token/异常正文；启动失败可尝试一次只读刷新。设置页/右栏各独立aria-live结果，启停隐藏旧复制banner并取消启动自动复制，改为核对后手动复制；不以第三方已连接措辞代替隧道启动。

VM覆盖有效合同下单写、忙拒绝、停止跨过启动、GET中停止零启动POST、迟到启动与旧finally不覆盖新意图、草稿一致、绑错/已运行/坏合同/HTTP/网络/正文超时及写后读分离。HTTP bridgeTunnel使用真实路由但替身隧道：错stop零副作用且不取代挂起start、有效stop取代已受理start、后端已有重复start409；停止前抛错500仍运行，停止后广播抛错500但已生效，旧空体仍兼容。注入错误堆栈是预期fixture，不冒充真实OS/公网退出证明。

bridgeLifecycleBrowser通过真实菜单→设置Bridge导航和bind按钮，拦截启动/停止，不开公网隧道；扣首个start并验证重复调用零第二写，点同按钮停止，503后读保留停止确认，旧start放行不覆盖，再显式启动验证已启动但读取失败。保留真实函数Promise便于等待迟到完成，不靠固定sleep。普通本地全量不运行Chromium，本地无浏览器；新增场景须本批精确CI核验。

对应说明只核对本批启停/结果/条件绑定段，正式197项仍逐句7、局部30、待逐句103；未把长篇文档整篇晋级。本地定向workbenchRuntime/bridgeTunnel、完整82文件及文档生成/构建/一致性（246源码/28目录/110排除）、git diff --check通过。实现53a0560c7b1af1fcf2936988ae9c52f4cd0ec8c7已推当前固定分支，[CI35329103242](https://github.com/cccjvav/web_agent/actions/runs/35329103242)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium；新增bridgeLifecycleBrowser在CI实际执行通过，合成回包不等于真实公网隧道启停，本地仍无Chromium，不代签用户实机。

页内代次不是跨标签锁/永久幂等，停止无法保证撤回已发送但尚未到达服务器的启动，之后其他客户端启动仍可改变状态；不自动取消已接受的工具任务，不承诺全部OS后代退出。下一包原生重置命令（第41组只读发现忽略status/json、尚未红测/修复）；Bridge Health/其他API消费者、Provider更新删除、R2余项、历史Windows超时根因、全仓逐句及用户实机保留，探测暂停。


#### 第43组：原生扩展轮换/停止结果消费

2026-09-18继续R3。原生`webagent.resetSecret`此前POST空体`{}`并且不看`requestJson`的status/json，任何HTTP结果都弹“MCP Secret 已重置”。新增`nativeRotationCommands.test.js`在VM中跑真实`activate()`，只替换vscode与HTTP传输：先复现HTTP500仍提示已重置（断言0条、实际1条），再修实现。

`workspaceSnapshot()`承担原`workspaceBinding()`的校验并返回`{status,binding}`；`workspaceBinding()`改为薄封装，避免把secretKey随控制/启动请求外发。`validRotationResult(result,oldSecret)`要求HTTP200、`success`严格true、新24位hex且不同于旧值、`mcpPath`与密钥一致、`mcpUrl`为无凭据/查询/fragment的http(s)且canonical同源。`resetSecretCommand({refresh})`先读快照校验旧密钥形状，模态确认后才POST，携带workspaceRoot/hostInstanceId/expectedSecret；请求抛错与其它坏回包报“结果未确认”，HTTP409报“未轮换”（主机在写入前拒绝），合同成立才认为写已确认，再读一次核对新密钥与同一主机/工作区：核对成功提示“已重置并核对”，否则明确“已确认轮换，但当前地址未核对”。两者都刷新侧栏并返回true；提示按是否已发送区分“未发送密钥轮换”，且不回显密钥。命令注册改为委托该函数，便于执行真实代码路径。

原生停止同样先取绑定再POST，要求`success===true && running===false`；请求抛错、非200、`success`非严格true或running不为false都报“停止结果未确认”，409报“未停止”，只有确认才refresh。测试还抓到实现里`success:'true'`被当成功的真实漏洞，已收紧为严格布尔。

覆盖：绑定字段、模态确认与取消零POST、旧密钥形状未知/工作区不匹配零POST、十种坏回包、请求抛错、写后读成功与四种读取失败、停止六类失败与工作区不匹配零POST，并断言提示不含新旧密钥。后端绑定/CAS的真实HTTP证据仍由bridgeTunnel提供；夹具是HTTP与VS Code替身，不是真实IDE、隧道进程或Windows弹窗验收。`extensions-installed`副本已同步（extensionCopy按字节比较），`documentationLearning`新增测试文件到说明映射，并按命名函数规则改用箭头属性避免未说明的`show`/`dispose`等符号。

本地定向与完整**83个测试文件**通过（新增1个），文档生成/构建/一致性与`git diff --check`通过。实现db85323c770137f7cbe7b15d570869d13c43a004已推当前固定分支，[CI35332743748](https://github.com/cccjvav/web_agent/actions/runs/35332743748)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium；本批未改浏览器夹具，workbench-browser仅回归既有场景。相关说明只核对本批轮换/停止段：extension详解与命令安全测试说明由待逐句改为局部，其余仍待逐句。

单窗口顺序不是跨窗口锁或永久幂等；服务端仍接受旧空体调用（无绑定/CAS），不因此认为所有调用方都已绑定。下一包其余API消费者与Bridge Health；经典UI、R2余项、历史Windows超时根因、全仓逐句与用户实机保留，探测暂停。


#### 第44组：全仓检查与优化报告（交接用）

2026-09-18按用户要求，在交付第43组后做一次彻底全仓检查，并产出[全仓检查与优化报告](../../review/OPTIMIZATION_REPORT_2026-09-18.md)，供接手助手交叉审查后继续推进。本批**未改产品源码**。

检查基线e5c83637534ad3515a3d949447786c2eebd59792（工作树干净、远端同SHA）。实际执行的核验：完整**83个测试文件**通过；`check-docs`输出247源码/28目录/110排除、`content.js`3473871字节；`npm audit --omit=dev`为0漏洞；生产依赖仅express 5.2.1/cors 2.8.6/diff 9.0.0/ws 8.21.3；仓库829跟踪文件、核心JS188个27778行、Markdown195个、pack 60.74MiB。健康项（无TODO债务、无eval/shell:true、无真实凭据入库、文档守卫会真实失败、CI九项构成）逐条给了命令与命中数，不是概述。

报告用`文件:行`列出7处仍存在的同类缺陷（P1-A）：bind.js:221-229登录、276-280清除、497-506新建文件、518-533终端、534-547搜索均不消费响应即报成功；chat.js:235-242补丁后读不校验状态会把编辑器内容置空；extension/ptyHost.js:152-163轮询忽略HTTP状态。另给P2（CI审计continue-on-error永不失败、矩阵含两个EOL Node、无lint配置、设备码轮询缺catch/去重、超长文件）与P3（生成物churn与仓库权重、浅克隆交接事实、逐句进度策略），并写明不建议做的越界项、下一包顺序与未验证缺口。

本批同时修正自己写错的两处数字：CONTEXT基线行“82测试文件/246源码”更正为83/247；F43“局部30、待103口径不变”与同句“两篇改为局部”自相矛盾，按命令重算更正为局部32、待逐句101。清单因新增报告行由197项增至**198项**（逐句7、局部32、待逐句102、历史32、暂停15、边界7、生成1、规范1、受限1）。经验已同步到[experience](../docs/experience.md)三条：结果消费合同、浅克隆交接、管理数字须重算。路线归属：报告P1-A并入既有R3（界面/API结果消费），工程化项新立R9候选；初次误加第二个R7被`documentationQuality`的“每条路线只有一处权威行”守卫拦下，未绕过守卫而是改用未占用编号。

沙箱环境事实已写入报告P3-B：`.git/shallow`存在、本地仅33个提交、fetch refspec只有main，因此`git rev-parse origin/<工作分支>`必然失败；核对远端必须用`git ls-remote`或显式fetch+`FETCH_HEAD`，恢复ref前先备份差异并证明工作树等于远端。

验证：完整83测试文件、文档生成/构建/一致性、`git diff --check`通过。报告与管理同步提交6a1944d56d63e228bdf3b4b3a022c3efd6a84c1d已推当前固定分支，[CI35335420393](https://github.com/cccjvav/web_agent/actions/runs/35335420393)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）；本批只改文档，未改产品源码。报告在正式清单中登记为**待逐句核对**，由接手助手按报告第6节复核后改状态——本会话不自我认证。

#### 第45组：交叉审查、结果合同、无障碍与非探针辅助项目实修

2026-09-18接手后先显式fetch并快进到目标`81fb5c2`，逐项读取/复核第44组报告。确认P1-A七处和P2-D设备码竞态后，不仅改提示：所有相关消费者增加HTTP、严格布尔和响应形状门禁，区分写确认与后读失败且不自动重放；Chat要求可靠NDJSON终态，补丁后读协调脏草稿；GitHub服务端/浏览器双代次与poll单飞；新建文件端到端`createOnly`独占原子创建并以并发HTTP证明一胜一409；PTY所有确认点拒绝非2xx。Bridge统计函数返回可信布尔值，清除写确认不被后读失败改写。

界面审查修表单名称、伪链接/可点击容器、动态标签/树/搜索/工具卡的原生按钮语义；模态焦点进入、Tab约束、Escape恢复；编辑器及右栏页签roving tabindex与方向/Home/End键；最小字体11px、统一焦点轮廓、390px覆盖式侧栏。浏览器源码新增焦点/页签/390×844断言；本机无Chromium且既往下载`ECONNRESET`，首推真实CI执行并暴露宽→窄侧栏遮挡，处置、两次失败及最终复验证据见本组末尾，不把首轮失败冒充通过。

R9首包把Actions权限收敛为`contents: read`，高危生产依赖审计改硬门禁。扩展/安装镜像及函数说明同步。这里曾把用户要求的全仓检查错误扩大为探针实现授权：对model-probe专项verify后修改README、`src/learned.js`、`tools/e2e.mjs`。用户重申该项目由另一位助手负责后，三文件恢复至同步基线`81fb5c2`；观察只作为未裁决线索移交，不计本批发现修复或验证。后续即使通用检查触发探针失败也只记录边界，不开展专项审查。

详细文件、前置报告状态、验证和剩余Node EOL/lint/生成物/实机取舍见[第45组报告](../../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)。对话中断后分支ref三次曾回到初始提交而文件仍为新基线；每次均先备份binary diff/未跟踪项（第三次另留完整非Git/依赖工作树压缩包）、显式核对远端，只用`update-ref`+`read-tree`恢复固定分支引用/索引，未覆盖工作文件。外部临时备份路径另留本会话恢复记录，不作为仓库持久入口。本批非探针本地证据：83个主测试文件通过；文档库存247/28/110与构建一致；calculator 6项、trace-inspector 77项通过；生产审计0漏洞、扩展镜像一致。

首推`e0fdf65`的[CI35380095907](https://github.com/cccjvav/web_agent/actions/runs/35380095907)为8/9：Ubuntu/Windows主机矩阵及Windows安装器全部通过，真实Chromium在640px首次跨断点时捕获已展开侧栏遮挡Agent菜单。未改断言掩盖失败；bind现只在宽→窄跨越时关闭旧桌面侧栏并同步焦点/ARIA，避免窄屏键盘高度resize误关用户刚开的抽屉；VM加入1000→640真实闭包回归。Actions checkout/setup-node同步升v5，清理由旧Node动作运行时产生的弃用告警。

`04c8e04`的[CI35381193695](https://github.com/cccjvav/web_agent/actions/runs/35381193695)再次8/9，Chromium已越过原遮挡点并运行到Skill创建400负例；失败是浏览器断言仍要求旧版纯服务端错误串，而bind已按本批合同显示“状态未知：原错误”。断言现同时要求可信状态语义、保留原错误且磁盘零创建，不通过删负例或放宽为任意toast掩盖。

修复`cc779414c61493b02248571977eea9e96893953c`的[CI35381668516](https://github.com/cccjvav/web_agent/actions/runs/35381668516)九项逐项成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器及真实Chromium均通过；生产高危审计门禁也在各主机任务通过。前两次8/9仍保留为发现链，不用最终绿灯抹去。该成功早于上述探针三文件恢复；边界纠正`27fca73`的[CI35386685807](https://github.com/cccjvav/web_agent/actions/runs/35386685807)另行九项成功，未继承旧绿灯。GitHub仅剩ubuntu-latest将于2026-10-19迁移Ubuntu 26的计划性notice，不是本次失败或产品验证。


#### 第46组：非探针审批结果、工作流schema与caller隔离

按R3只续审`operatorQueue.js`、`workflows.js`及对应非探针测试/说明。发现终态淘汰仍锚定createdAt：待批接近15分钟才获批时，刚完成的结果会在下一次查询立即删除；同一prune中waiting先变expired又立刻按旧创建时间删除，因此expired实际不可观察。`cancel`不先prune还会把已经超期但未触发清理的请求改写成denied。修复后expired与denied分别记录finishedAt，终态从finishedAt完整保留15分钟，publicJob的expiresAt反映当前淘汰点；仍是进程内、按访问触发清理及约40条上限，不扩大为持久exactly-once。

工作流固定schema另发现顶层未知字段会静默进入审阅快照，且`exists:false`可与必须读取文件的contains/sha256组成永远不可能成立的条件；原前向引用扫描还漏掉`$steps.id`整个输出形式及结构上危险的路径段，可能在先前写入后才失败。validate现要求definition顶层只有steps，preview/request包装也拒绝未知字段，并在审批前拒绝矛盾条件；validateReferences递归限制为安全前序步骤，正文中间同名文字不误判；步骤工具集、权限、失败unknown、不重放与时点检查边界不变。同链external_request与operation_result也不再静默忽略autoApprove/autoRetry等包装字段，分别只接受固定请求字段；仍不把入队当批准或未知ID当重试许可。

相邻executionControl/结果消费者复核发现executor把lastExecId与commandStore全局共享；任一已认证peer若取得/猜中另一peer的execId可读输出或取消，不传ID还会直接拿到全局最近命令。记录现保存内部owner，commandOwner使用服务端认证后的peer/兼容caller键，lastCommandId只在该所有者的有界记录中反查；显式查询/取消也对跨peer统一found:false且不泄露记录存在。桌面调用仍共享local命名空间，事件与公开结果不暴露owner。executionControl用第二peer证明显式ID、缺省最近记录和取消均隔离，原所有者仍可查询/停止。getLogs原来也忽略options并汇总全局事件；远程现只返回sessionIdFor匹配的有界执行追踪，本机仍可查宿主事件。同一路径还发现getTaskStatus忽略handler的options，总是返回Local计划；现将上下文传入getTaskState/stateFor，taskProgress证明两个远程peer分别只读回自身计划且不含Local内容，未知peer读取返回未保存idle快照而不消耗16个报告槽。getCapabilities同样曾无视remote options，向只读peer重新广告tools/list已隐藏的写/命令工具；现复用同一allowed过滤，executionControl锁定两目录一致。

approvedOperations以可控Date.now覆盖临期完成、完整结果保留、可见expired及迟到cancel；workflowPreconditions覆盖顶层未知字段、两类矛盾条件、完整输出的自/前向引用、危险/空路径段及字面量非误判。专项定向测试、executionControl/PTY/taskProgress回归、本地83测试、文档247文件/28目录/110排除项库存与站点生成一致性均通过。实现提交`a85fa5a21a7bba448665f3f6da9671aad56dab6d`的[CI35397169896](https://github.com/cccjvav/web_agent/actions/runs/35397169896)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器、真实Chromium）；不把矩阵内既有探针任务当本组专项审查证据。

本组明确排除`arena-model-probe/`、`webagent-core/probe-extension/`及探针专项文档/测试；没有读取后再自行判定“顺手修复”。探针线索只移交负责该项目的另一位助手。

本组文档链首次运行到inventory时出现“missing Bridge任务栏说明.md”；核对发现并非文件/清单丢失，而是固定分支ref第三次被环境改回`1d532d0`，旧索引把现行docs/guides路径看成根路径删除/新增。按上节先备份、核对远端`27fca73`并恢复ref/index后，同一documentationLinks与docsSite通过；该次环境失败不冒充源码回归，也不靠改清单掩盖。扩展后的首轮完整套件另为82/83：唯一docsSite失败明确指出恢复记录在生成站点后又改文案产生镜像漂移；重建content.js后最终83/83，不以该可解释失败冒充产品逻辑回归。

#### 第47组：非探针外部结果、部分读取与模型设置事务

继续R3时先用真实回环MCP夹具复现：第三方tools/call回`ok:false`但无isError，被externalClient覆盖为ok:true并进入succeeded终态。execute现保留外部失败信号，以共享isToolFailure派生统一ok；仍标external-reported，不外推副作用证明。重复批准失败记录不再次调用。

工作流另用真实临时目录证明read_files双路径一项成功、一项missing时，普通工具返回`files:[成功,error]`，旧execute只看顶层trace而继续创建后续文件。新增hasPartialReadFailure只在固定工作流把显式逐项error标failed/E_PARTIAL_READ并停止；普通工具保留有界部分读取合同，不将truncated或git不可用等已声明状态泛化为失败。

模型API红测证明GET脱敏表直接POST会把磁盘fixture Key改成`••••`；旧空/拼错/错类型请求还会无操作报成功或非结构化失败，单model改baseUrl可通过浅合并沿用旧Key。新`models/modelSettings.js`从长routes分离请求级校验：非空固定字段、models/model互斥、模型数量/显示字段/caps/vision、有效active/merge引用及multiModel严格布尔/枚举/整数。掩码只在同id且protocol/baseUrl/modelId不变时恢复；省略或掩码改连接都拒绝，显式Key字段才可改变身份；addProvider现有加本批也不得超过100，不能靠多批绕开整表预算。全部输入通过后才单次store.save；失败逐字节保持配置。兼容旧整表往返，但不是跨进程CAS、模型可调用或供应商实测。

approvedOperations、workflowPreconditions和apiFiles三项红转绿；相关模型存储、API、受控工作流和测试正文同步，documentationLearning新增modelSettings到唯一主说明。首轮全量为80/83：documentationQuality抓到交接表暂时没有唯一“下一项”，docsSite抓到源码改后未重建镜像，workflowPreconditions抓到状态重排误少一个optional chain；三者修正并定向通过后，最终83/83。文档库存248源码/28目录/110排除且只读updated=0，站点重建一致，生产audit为0漏洞；实现`874006e4b8b6d2e1e5bb126e7c2d2a66314acc78`的[CI35402127412](https://github.com/cccjvav/web_agent/actions/runs/35402127412)九项逐项成功，含Windows Node20/22/24、Ubuntu18/20/22/24、真实Chromium与Windows安装器。探针目录零diff，不把完整回归中既有探针测试的通过冒充专项审查。

#### 第48组：返回式失败、Skill核验与审批历史容量

继续R3时，`runOpenAI`和内置探索的`timedTool`仍只识别`ok:false`/`success:false`。`operation_result`会正常return一个只以顶层`status:'failed'`表达的终态，因此界面事件被标`ok:true`；OpenAI下一轮虽能看到JSON，但成功颜色和截图等成功专属消费者已走错分支。两处现统一调用共享`isToolFailure`，返回式失败事件保留原result与归一错误并标`ok:false`；OpenAI仍把有界原结果交给模型继续判断，而不是改成无上下文异常，失败命令不再进入截图成功分支。真正抛错仍走原异常合同。对应说明另纠正`runChat`早已将空工作区`testCmd`初始化为空的事实，不再误写成会凭空报告`npm test`。

Skill创建路由原来只await `write_file`，不消费正常返回的业务对象；若文件在中央read-back前变化，工具会return `success:false`与`verification.state:'unknown'`，路由却仍答创建成功。现仅在`success===true`且核验严格为`verified`时确认；返回式失败/unknown答409并保留code/verification，提示先检查目标而非自动重试，抛出的重名/参数错误仍维持400。apiFiles用一次性`file_written`监听在真实写入与read-back之间删除目标，确定性证明路由不会再把未知效果包装成成功；它不是外部OS竞争穷举。

审批队列虽宣称约40条容量，旧`prune`在`jobs.size>40`时会不顾15分钟窗口提前删终态，令完整结果与requestKey墓碑在压力下消失。现设40条硬上限：先允许同owner/key/摘要命中原记录；未过完整窗口的任何终态都不为新请求让位，新key明确拒绝，超过窗口才惰性清理并恢复容量。该取舍优先查询/窗口内去重而非无限可用性，仍不是重启或多进程后的持久exactly-once。新增`operatorQueueCapacity.test.js`以固定时钟填满并批准40条，锁定首条可查、旧key不重执行、第41条拒绝及窗口后恢复。

定向`modelLifecycle`、`apiFiles`、`operatorQueueCapacity`及相邻`approvedOperations`、`workflowPreconditions`、`runChat`均通过，相关JS通过`node --check`。首轮完整套件为83/84：唯一失败是新测试已进生成库存但尚未加入documentationLearning的主指南映射；补登记且在详解写明`main`后，文档五项守卫与最终84/84通过。文档库存249源码/28目录/110排除且只读updated=0，站点重建一致；生产audit 0漏洞、`git diff --check`通过、两个探针目录零diff。实现提交`f89767fdbbc3db1787bf48bb10a32895b1dca647`的[CI35408375271](https://github.com/cccjvav/web_agent/actions/runs/35408375271)九项逐项成功，覆盖Windows Node20/22/24及重复取消/stdio、Ubuntu18/20/22/24、真实Chromium和Windows安装器；不把自动经过的存量探针测试称为专项审查。

本组启动时固定分支ref第四次回到`1d532d0`，而远端已前移到`90c0a9b`。先在`/home/user/r48-recovery-1789775918/`保存binary diff、目标文件和排除Git/依赖的全工作树压缩包，再只读fetch确认`90c0a9b`以`ff948013`为祖先并含第47组两提交；随后仅用`update-ref`与`read-tree`恢复引用/索引。远端独有文件从索引恢复，八个重叠正文以`ff948013`为共同基线三方合并并人工解决两处同段冲突；未使用`reset --hard`、`clean`或整树覆盖，目标改动由外部备份逐项保全。

#### 第49组：模型与Provider固定schema、历史配置公开投影

继续R3并交叉R2时，先在真实HTTP夹具把`authorization`等未声明秘密写入旧模型记录；旧GET `/models`会随整条对象浅拷贝发布，新增投影断言在`apiFiles.test.js`明确红测。沿同一路径复核又发现models/status原样返回multiModel，且已知caps/mergeModel槽位若被旧配置写成对象也可携嵌套值。现由modelSettings集中维护固定模型字段与五个multiModel字段：公开响应只复制类型/预算有效值并脱敏Key，status复用同一投影；合法公开快照往返保留真实Key，同时从新事务清除历史未知属性。它不是配置文件加密、同用户进程隔离或跨进程CAS。

普通模型POST现在拒绝记录级未知字段，`caps`与旧兼容`capabilities`共享数组预算；单模型更新先投影旧记录，避免浅合并继续传播历史属性。Provider发现包装必须恰为baseUrl/apiKey，未知字段在创建上游请求前400/E_BAD_PROVIDER；addProvider只接受baseUrl/apiKey/vision/models，每条目录项只接受id/name/contextSize/caps/pricing。错误文案不拼接Key；输入失败不触网或不改配置，既有15秒/512KiB/100项、拒跳转、连接身份绑定和整表上限保持。

`apiFiles`覆盖模型/multiModel未知及错类型历史值不经models/status发布、公开快照往返清洗、普通模型未知字段、探测未知包装零fetch、addProvider包装/目录未知字段零写和错误正文不含Key；`providers`与`modelLifecycle`守住发现、调用和失败语义。定向回归与完整84项均通过，文档249/28/110只读零漂移，生产audit 0漏洞、`git diff --check`及两个探针目录零diff；实现`124b2051563b2dc6a5b44dafb68d2dd3574b3323`的[CI35428457492](https://github.com/cccjvav/web_agent/actions/runs/35428457492)九项逐项成功，覆盖Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器和真实Chromium；证据提交`6be27cd`的[CI35428680374](https://github.com/cccjvav/web_agent/actions/runs/35428680374)也九项成功。两个探针目录仍明确排除，自动主套件经过其存量测试不算专项审查。

用户再次确认交接状态时，沙箱本地ref第五次从`6be27cd`回到`1d532d0`，工作文件仍为远端新树且依赖目录消失。先把binary diff、未跟踪项和四份权威交接正文保存到`/home/user/r49-recovery-1789811559/`；显式fetch并验证初始提交为远端`6be27cd`祖先，再用独立临时index证明工作树与远端树diff为0、无额外未跟踪项。最后只用`update-ref`与`read-tree`恢复固定分支ref/index，并按锁文件`npm ci`恢复75个包；未使用reset --hard、clean、checkout覆盖或整树替换。

#### 第50组：Bridge严格请求/公开投影与外部unknown终态

继续非探针REST/审批结果边界并交叉R2时，真实HTTP先证明Bridge start会静默接受未知字段、对象provider、跨提供商Token与超预算Token，随后写配置或进入停启；stop/reset-secret和清轮/身份端点也会把未知包装当合法请求。另把对象/数组植入历史Bridge已知槽位，旧status会原样发布，truthy对象还可通过启动授权。修复后provider仅为`cloudflare|cloudflare-named|named|ngrok|local`，domain最多512字节、Token和workspaceRoot最多4096字节、hostInstanceId/expectedSecret最多256字节，均拒CR/LF/NUL；当前provider实际复用的历史保存domain/Token也不能绕过同一预算，提供商专属字段不能跨用。只有真正空体保留旧stop/reset-secret兼容，其余无参端点只接受空体，所有包装失败固定400/`E_BAD_BRIDGE_REQUEST`且在认证存储、配置、控制租约、停启或GitHub触网前返回，不回显私密输入。

Bridge status现只投影固定公开字段，字符串须类型有效且有界，running/authorized等仅严格布尔；历史授权槽位也只有布尔`true`能启动。测试以真实HTTP覆盖未知字段、错类型、预算、跨provider凭据、历史嵌套值、truthy授权及认证/配置/停启/网络计数零副作用；正常启停、故障后的已知结果与旧空体兼容保持。

真实外部MCP夹具另复现原始`verification.state:'unknown'`会被宿主覆盖的external-reported说明改成verified，再被队列记作succeeded。externalClient现先对原始不可信结果执行共享失败/unknown判定，再合并宿主verification投影；终态保留unknown、`ok:false`且同requestKey重复批准不重放，仍不把外部自报当独立副作用证明。首轮完整套件83/84的唯一失败是改源码后尚未重建`docs-site/content.js`，重建后完整84/84。随后复核补上当前provider历史保存凭据不得绕过预算；再一轮83/84唯一由documentationLearning指出新增具名helper漏登记详解，补齐函数表并重建后最终完整84/84。两个失败均为施工中的生成/说明漂移，未删守卫或改运行断言。文档库存249源码/28目录/110排除，相关API/MCP/工具/测试正文维持局部，正式清单计数不变；生产audit 0漏洞、正式哈希183项匹配、`git diff --check`与探针两目录零diff，自动完整套件经过存量探针测试不算专项审查。实现`11c168915a1f0bace11128b77a022cf403f74c9d`的[CI35437963655](https://github.com/cccjvav/web_agent/actions/runs/35437963655)九项逐项成功，覆盖Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器和真实Chromium。

#### 第51组：本机固定包装与模型HTTP响应边界

继续非探针R3并交叉R2时，先以真实HTTP红测证明`/tool/call`带未知顶层字段仍返回200并实际写文件；静态链同时确认`createOnly:'true'`会退入普通覆盖分支。模型fixture要求`redirect:'error'`时，旧runChat把断言转成失败，随后因defaultTools未赋值退出1，证明请求选项没有拒跳转；另有非2xx正文前240字符直接进入异常及成功/错误body均无字节预算。

本批引入只用于已接入端点的固定body/query包装和`E_BAD_API_REQUEST`，在副作用前拒绝未知字段、数组/非对象及路由级错类型。Chat只接受固定字段/枚举、最多12条user/assistant历史和消息字节预算；tool/consensus/tasks、execution-control及operations approve/cancel在广播、租约、模式改变、执行/取消或重置前拒绝坏包装。文件新建必须`createOnly:true`且不得混hash，普通保存必须64位expectedHash，字符串true不能变覆盖；content/tree/preview/undo、检查点和Skill目录/load/create也固定query/body，错误包装不读取、分配/消费记录或写盘。底层路径、hash、权限与一次消费检查保持，不把包装校验当全router schema。

`requestScope.fetchText`现优先以WHATWG reader或Node异步流逐块累计原始字节，默认8MiB；标准流越界尝试取消并抛`E_RESPONSE_TOO_LARGE`，text-only旧fetch/测试替身只能事后核对。模型POST显式收紧到1MiB并设`redirect:'error'`，非2xx只传播固定状态错误，不再拼接远端正文。120秒deadline、父取消和Chat五分钟总限保持；预算不是进程总内存或Provider可信证明。

`apiFiles`新增真实HTTP零副作用回归，覆盖控制模式、审批handler、检查点ticket、回退记录及Skill文件；`modelLifecycle`覆盖跳转选项、401标记不反射和1MiB+1正文在JSON解析前失败。定向apiFiles/modelLifecycle/httpSmoke/executionControl/approvedOperations/fileCheckpoints/skillsLifecycle及相邻回归已通过。首轮完整套件80/84，四项仅为本批尚未同步说明/站点时的documentationPolicy、documentationLearning、docsSite、docsHttp，未删除守卫；同步后最终完整84/84。文档库存249源码/28目录/110排除且只读检查零漂移，生产audit 0漏洞、正式哈希183项匹配、`git diff --check`与探针两目录零diff；自动全量经过存量探针测试不算专项审查。首推`c1ea0f8c019c4829be2fd6acb2692cc219b652b8`的[CI35445326912](https://github.com/cccjvav/web_agent/actions/runs/35445326912)为8/9：七个Node矩阵和Windows安装器通过，真实Chromium在Skill正文首页等待SHA256超时；原因是前端把尚不存在的expectedHash作为空字符串发送，被本批严格可选hash合同拒绝。`a4157822238f6669cce6cbc994ee86989afc40ec`改为首页省略该字段、续页仍携可信hash并增加VM回归，[CI35448256206](https://github.com/cccjvav/web_agent/actions/runs/35448256206)九项逐项成功，覆盖Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器和真实Chromium。探针目录及专项实现继续排除。

#### 第52组：PTY/external管理包装与模型协议形状

继续非探针R3并交叉R2时，先写真实HTTP/模拟Provider红测：旧`/pty/hello`会静默接受未知字段、返回200并登记客户端；模型模块尚无出站请求字节预算。随后把同类核对扩到PTY poll/report、connection-check创建/检查/清空、external HTTP登记、stdio预览/启动及删除包装。所有相关POST/GET/DELETE现先固定body/query/ID字段；错误包装在刷新客户端、认领/推进/结束任务、分配/清空连接挑战、调用external登记/预览/启动/删除服务前固定400。PTY另按check/claimed/accepted/progress/五终态限制可带字段和预算，拒绝把cancelled等非done状态用矛盾status/ok重标成功；公网external登记要求严格确认及成对完整绑定。服务层原有工作区、所有权、一次消费、端点安全与进程语义保持。

`runOpenAI`现在在每轮fetch前序列化完整请求并限制12MiB，超限抛`E_MODEL_REQUEST_TOO_LARGE`；Provider assistant响应不再原样回送，只投影role/content/tool_calls及固定function字段。content须字符串/null，单轮最多64项tool call，ID唯一且有界，function名字固定形状，arguments须≤256KiB并解析为非数组对象；调用名还须属于本轮实际发送的工具声明，使allowTools=false成为执行断路器且隐藏工具不能被Provider点名。整份响应先验证后才执行任何工具；通过后仍只执行前8项，其余已验证ID获得限额反馈。畸形arguments不再静默退化为`{}`。

`apiFiles`锁定未知包装零服务调用、PTY矛盾终态零推进及合法状态链；`modelLifecycle`锁定请求超限零fetch、坏content/arguments、65项整体拒绝及Provider未知字段不回送。定向与相邻PTY/connection/external/model回归通过。首轮完整套件83/84，唯一`docsSite`失败明确为源码/正文更新后尚未重建`content.js`；生成库存与站点镜像刷新后最终84/84。文档库存249源码/28目录/110排除且只读零漂移，生产audit 0漏洞、正式哈希183项匹配、`git diff --check`及两个探针目录零diff；完整套件自动经过存量探针测试不算专项审查，探针文件未修改。实现提交`94841c38410591e062867cbe8da92dd9ae2aacdc`的[CI35450192029](https://github.com/cccjvav/web_agent/actions/runs/35450192029)九项逐项成功，覆盖Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器和真实Chromium。该处列出的下一包已由第53组完成。

#### 第53组：非Probe query闭环、状态投影与external/workflow接线

继续R3并交叉R2时，真实HTTP先证明diagnostics、bridge/activity、status、models、logs、profile/detect与customizations会忽略未知query并继续读取；Bridge reset-round附query仍会清会话，tool/call附query仍可调度。现`apiRequestBody`统一先要求空query，`bridgeRequestBody`同样以Bridge固定错误拒绝query；其余原始body路由显式接query门禁。静态逐路由核对确认除用户明确交给另一助手的`/probe/*`外，当前所有REST入口都在读取、触网或副作用前固定query，合法带参GET仍按各自白名单。

external/request、workflows/preview与workflows/request不再由宽泛operationApi直接转发，分别只接受固定body并保留异步错误捕获；未知query/body在外部server/tool查询、workflow校验或operatorQueue分配前400，合法request仍只到waiting-approval。服务层原有32KiB队列输入、requestKey幂等、批准时重查、unknown与不可重放语义不变。diagnostics合法响应锁定identity/probe/capabilities及嵌套字段；status的MCP peer不再展开任意touch extra/clientInfo：clientInfo在入库即只留有界name/title/version，snapshot再建立固定七字段深投影。

同链复核customizations发现历史未知顶层、environment和列表项属性会由GET原样发布，PUT也会保存未知字段，空patch还会重写四文件。现完整固定defaults顶层、两个字符串对象、六类≤100项列表、voice/dictation/codex的字段/type/字节预算；写请求严格拒绝空/未知/错类型，历史读取只丢未知属性但已知槽位损坏仍E_CUSTOM_CORRUPT，合法局部更新保持environment/techStack/codex子字段。四文件顺序发布仍非事务，同用户直接改盘不在此隔离。

`apiFiles`用服务调用/fetch/磁盘/会话计数锁定上述零副作用与固定投影；profile、stateIntegrity、httpSmoke、workflowPreconditions、externalDiscovery、MCP/board等相邻回归通过。首轮完整套件80/84，四项仅为新增函数说明、库存与站点镜像尚未同步，所有80项产品/业务测试通过；未删守卫。同步正文、库存与站点后最终84/84，文档249源码/28目录/110排除且只读updated=0，生产audit 0漏洞、正式哈希183项、`git diff --check`与两个探针目录零diff。实现提交`397476c7bc29d256781c759f3386beac91d9c147`的[CI35459273776](https://github.com/cccjvav/web_agent/actions/runs/35459273776)九项逐项成功，覆盖Ubuntu Node18/20/22/24、Windows Node20/22/24及重复取消/stdio、Windows安装器和真实Chromium；证据提交`0b8b9a4e642d2a813be1e2413056b01c64f96890`的[CI35459466444](https://github.com/cccjvav/web_agent/actions/runs/35459466444)也九项成功。完整套件经过存量探针测试不算专项审查。

#### 第54组：交接同步与独立非Probe复审（证据已落档，产品修复未开始）

用户上传提交`3fbe8723de4c9fdd9e115f377aff06d16b449a64`曾在根新增`shuncode-bridge-source.zip`及`web_agent提示词-修正版-纯净.txt`（2026-09-21仅原件归入review/archive，定位/哈希见该目录README）。任务要求不是替换现有实现，而是逐模块评估会话驱逐、自适应并发、信号量/事件缓冲、JSON-RPC ID登记和重复`Mcp-Session-Id`头，并确认文件工具/审批耦合不应直接替换；授权/支付不在包内，手写类型只作线索，代码从未在本环境运行。zip SHA-256为`4114d6e8d583cea5193b48d53e8137921803a681006914a943abf804aa847188`，已做绝对路径、`..`、symlink、单项/总字节检查后仅解到仓库外`/home/user/r54-shuncode-reference/`，不安装、不执行、不把类型声明当行为。

该上传提交的[CI35466582618](https://github.com/cccjvav/web_agent/actions/runs/35466582618)中真实Chromium和Windows安装器通过，七个主机任务的`npm test`均由同一文档守卫失败：正式清单遗漏新增TXT；不是已证明的产品运行回归，也不能冒称全绿。本组较早的接手记录：ref/index第八次回到初始提交而工作文件保留；外部备份`/home/user/r54-recovery-1789853320/`含binary diff和排除Git/依赖的整树包，显式fetch后以临时索引证明现有文件与远端除两份未落盘上传文件外一致且无额外untracked，只恢复ref/index并从远端blob补这两份文件，未使用hard reset、clean、checkout覆盖或整树替换。

本组先把任务TXT登记为只读原始证据并同步CONTEXT、路线、语义台账；准备提交`50c03bedc97f9eaaf1c875f4767c6e9bb5278d56`的[CI35470787917](https://github.com/cccjvav/web_agent/actions/runs/35470787917)已在2026-09-20按SHA与九个job逐项核验success，旧上传失败不再作为最新基线。

2026-09-20独立接手在固定`arena/01a0bfa9-web-agent`fetch用户指定的`arena/01a0b053-web-agent`，双方均为上述SHA、ahead/behind=0/0，工作树干净；没有本轮ref恢复/强制覆盖。先读manager与review，再独立阅读/实验。用户再次确认探针原分工保持暂停；完整套件经过存量用例不是专项接手。报告：[F54独立复审](../../review/INDEPENDENT_AUDIT_2026-09-20.md)。

证据新增：真实文件工具复现缺失目标忽略expectedHash、原始SEARCH落盘和多块丢后块；认证MCP及完整index主机复现异常/无ID写入、重复batch ID双写、2025-06-18仍接受batch/不支持版本头；内部容量填充配真实在途HTTP证明忙SID被驱逐后取消404且signal未abort。tools已隔离但workspace资源混入Local步骤、capabilities未过滤ACL；实际禁止Edit仍拒绝写入，不是认证/写权限绕过。原生真实postNdjson+VM依赖替身/回环HTTP在302、坏帧和无终态EOF时resolve；不是实际VSCode验收。另做9浏览器状态，390/320px中心宽度0并欢迎内容叠入Chat，axe命中tablist子角色。各项均未修，不把观察脚本退出0算产品正确。

ShunCode在仓库外`/home/user/audit-2026-09-20/shuncode/`重新安全解包87文件，仅阅读而未运行/安装；上传原文/zip保持不改。采用结论：优先局部借鉴busy/stream计数与整批ID预检；自适应并发/重放暂缓，参考信号量下调limit后release仍无条件补队的缩容缺陷仅静态推演；保留现有文件hash/dryRun/检查点/审批/所有权，不整体换SDK或文件工具，不做授权/支付。

基线本地84/84、文档249源码/28目录/110排除且updated=0、生产audit 0漏洞、calculator6/6；非暂停201 JS/MJS+14 JSON+4 Shell语法/格式检查通过。额外静态扫描200 JS、181 MD、5865本地链接；73个Promise执行器返回值风格提示不是73个功能bug，两个发行副本链接失效单列。当前仓库18 Python全部暂停，无主线TS/TSX/MTS。仓库外Chromium153.0.8010.0已跑完整既有浏览器套件且通过，未关闭web security/TLS；本轮CJK审查字体回退、Monaco CDN拦截与平台未验边界见报告。

本轮只落报告/截图证据，直接修分发详解的旧权限/截图/租约说明、patch新建风险和工作台窄屏验证描述，更新manager/review与文档导航/生成物；没有主机/扩展/工作台执行源码或测试/依赖变更；docs-site/content.js由生成器重建。正式清单新增报告待逐句项，总数201，已逐句仍8，局部56、待79，其余不变。说明/报告改动后已重跑本地84/84、完整既有Chromium套件、249/28/110只读文档检查updated=0与git diff --check；没有新增正式产品回归。审查落档提交`a490ca02f84fe5d9086e2d7629c0e1bfa2258206`已推到本会话固定`arena/01a0bfa9-web-agent`，远端SHA一致；[CI35525528734](https://github.com/cccjvav/web_agent/actions/runs/35525528734)已按该SHA核验completed/success且九个job逐项success（Ubuntu Node18/20/22/24、Windows Node20/22/24、Chromium和Windows安装器）。不是借50c03be绿灯代签，也不把这些绿灯当新增负例已修。附属复现脚本、原始JSON/日志与CI摘要在仓库外`/home/user/audit-2026-09-20/F54-audit-evidence.zip`，不进入产品依赖或暂停专项。R2/R3、R4历史Windows超时、R5–R9及探针暂停边界不关闭。

### F54修复第一批：会话pin与双向头校验（2026-09-20）

用户确认按分支对比计划施工，并确认此前本助手未修业务代码。来源01a0bf59精确2e865bd的会话/头实现和三份测试增量选择性吸收，不合其管理叙述或生成物；未触碰暂停探针。当前ref/index回到50c03be而文件保留：先用仓库外临时索引证明整树与已发布36895f6 tree完全一致、备份diff，再仅恢复本会话ref/index，无工作文件覆盖或切分支。

合同：POST/SSE active pin阻止TTL/容量淘汰；全部200忙时分配null，HTTP initialize/GET SSE固定503。release单次，最后一个工作完成更新lastSeen，从完成开始24h空闲TTL，不续凭据，不复活显式删除。入站查rawHeaders重复及单值1–512可见ASCII/无逗号，畸形400在分配前；出站区分缺省与空值，畸形不保存回传。禁逗号和512是本项目更窄兼容策略，不能当MCP通用限制。

三份新增回归在未修源码下先失败（缺beginHttpSessionWork、404而非400、未拒绝出站重复头），日志在仓库外/home/user/f54-fix-evidence；四份定向修后通过。额外真实认证HTTP回归覆盖忙会话取消送达、重复原始头POST/GET/DELETE、SSE pin及response close释放、全忙503；容量及25h由内部API/注入时钟构造，不声称200HTTP并发可达或长时实跑。本地完整84/84、真实Chromium套件、生产audit 0漏洞均通过；文档249/28/110已重建并零漂移，git diff --check通过。实现`d7b521ba724ec86d36ee4ed88946c1946b79407c`已推本会话固定分支；[CI35531273186](https://github.com/cccjvav/web_agent/actions/runs/35531273186)按该SHA核验九job逐项success，含Ubuntu/Windows矩阵、Chromium和安装器。不是历史绿灯代签，不关闭尚未修复的RPC/补丁/UI等缺陷。

不采纳“顺序批内重复ID无需预检”结论。RPC版本/ID/批次准入、补丁不存在目标保护、资源投影、原生终态与UI仍待后续批次；F54报告保留原始基线观察，不能用本批关闭所有发现。

### F54修复第二批：RPC整份准入与协议版本（2026-09-20）

从已发布3412ef2接续；本地ref/index再次处于50c03be、文件保留，仓库外临时索引证明完整tree等于3412ef2并备份diff后只恢复本会话ref/index，不覆盖文件。先加真实认证HTTP零写回归与lifecycle直接调用回归：旧版null ID真实写盘返回200、lifecycle无效ID执行fn，红测记录在/home/user/f54-rpc-evidence。正式回归没有运行参考包或接手暂停探针。

RPC envelope只允许jsonrpc/id/method/params，具名params对象；请求ID≤256字符单元或安全整数（本地预算），通知不得有ID，非notifications/方法不得缺ID。整份预检所有成员、批内typed ID唯一和64项上限，initialize必须单独发送；任何准入错误在会话分配/续期、模式租约、工具事件、文件写入前400。合法旧版batch仍顺序执行；预检不是工具参数预执行、事务回滚或持久exactly-once。未知客户端响应未被本服务请求，仍400拒绝。

私有HTTP会话保存协商protocolVersion；只读getHttpSession做准入查找，不续期。重复/不支持/与已知版本冲突的版本头在POST/GET/DELETE先400；缺省头沿用已知版本，全部未知才2025-03-26；已知会话不允许重新initialize降级。未知initialize提案仍按旧协商fallback，不等于接受不支持的HTTP版本头。2025-06-18拒绝所有batch，旧版1–64项受限兼容；接受的通知统一202空体（2025-03-26同样要求202），DELETE保持204。GET非SSE状态、断连取消、无SID兼容调用、未知SID重建等既有边界不在本批冒称符合全部协议。

两份红测已转绿，mcpCancellation/mcpBoard/httpSmoke/stateIntegrity/externalDiscovery定向通过。原取消精确凭据/owner和异常释放断言未删除；通知状态只纠正204→202。首次新HTTP夹具尝试解析Express对primitive的400 HTML失败，已按Content-Type保留原状态修正夹具，并非改变产品拒绝行为。本地完整84/84与真实Chromium套件已通过，生产audit为0漏洞；另在httpSmoke真实src/index.js入口验证异常ID/旧版重复ID/现代batch/坏版本零写，并以同路径合法写入为正对照。文档249/28/110重建零漂移；提交前刷新正式指纹且不提升语义认证状态，git diff --check通过。实现`f40b91780b9f6e0abac41839f502fb0b2dfd0c1f`已推固定会话分支；[CI35533579984](https://github.com/cccjvav/web_agent/actions/runs/35533579984)按该SHA核验九job逐项success（Ubuntu/Windows Node矩阵、Chromium、Windows安装器），不是前批绿灯代签。后续优先补丁不存在目标hash/多块，再资源投影、原生终态、UI；Windows实机/旧超时和全仓逐句仍未闭环。

### F54修复第三批：缺失目标补丁保护（2026-09-20）

从干净7423c88接续，无ref/index恢复。先在patchEngine新增missingTargetSafety，旧实现对“不存在目标+显式hash”的dryRun未拒绝，红测记录在/home/user/f54-patch-evidence/red.log；再最小修改创建分支，不替换文件/审批/检查点栈，不改暂停探针。

合同：显式expectedHash表示已有文件的内容前提，缺失目标在dryRun/提交均E_STALE_FILE且currentHash=null，空文件hash也不代表不存在。新建允许完整正文或恰好一个空SEARCH块；单非空SEARCH E_CONFLICT，多块E_BAD_ARGS整体拒绝，而不是猜测拼接或丢掉尾块。已有文件多块顺序应用、CRLF、写锁、exclusive原子创建、检查点/审批耦合保持；新建未传hash仍按原合同不自动使用历史readCache，不承诺外部编辑器事务或持久exactly-once。

正式回归锁拒绝前无父目录/文件、无file_patched和新hash缓存；先read再外部删除仍拒绝旧hash。合法正文/单空块dryRun零写，提交内容/hash与预览一致；已有文件双块完整应用。httpSmoke用真实src/index.js和有效凭据验证同类工具错误（HTTP200但isError=true）及成功新建正例。patchEngine/httpSmoke/taskProgress/fileCheckpoints/workflowPreconditions/apiFiles/stateIntegrity定向通过；本地完整84/84、真实Chromium套件与生产audit 0漏洞通过；文档249/28/110重建零漂移，git diff --check通过。实现`95c3330ecb5a2b8d7402cfc98da0c0b46bc39670`已推本会话分支；[CI35534909704](https://github.com/cccjvav/web_agent/actions/runs/35534909704)按该SHA逐job核验九项success，含Windows Node24重复取消/stdio；未重跑美化结果，不证明历史Windows超时根因已修。未扩大为Windows真实编辑器验收。下一项资源caller/目录ACL与机器重试指引，然后原生终态、UI；历史Windows超时及全仓逐句继续保留。

### F54修复第四批：资源上下文/目录ACL与安全重试指引（2026-09-20）

从干净35968a2接续，没有恢复ref/index、切分支或合并别处生成物。先给executionControl加真实HTTP负例：不同远端SID读workspace应匹配自身step，旧实现读到Local，红测在/home/user/f54-resource-evidence/red.log。仅修改resources/server两处运行时文件，不涉及暂停探针/参考包。

server不从params复制上下文，固定remote:true并从keyForReq取可信peer；readResource(uri,options={})保留Local内部缺省，远端再次检查Read。workspace远端须初始化SID，无可信peer报E_SESSION_REQUIRED，不用IP/显示名称/自报callerKey猜归属；已删除SID维持404。getTaskState(options)复用原工具隔离，空闲peer不新建任务槽位；远端移除全局recentEvents，需日志走既有get_logs。根、自定义instructions、memory等仍是Read授权的共享工作区信息，不宣称全面多租户隔离。

capabilities按当前remote ACL调用getToolList，与tools/list一致；恢复权限立即反映，实际派发权限仍复查。protocol资源删去Retry using detail.currentHash，明确hash仅诊断、停下重读协调、冲突询问操作者，不得去掉hash自动重建或盲目重放。

executionControl同IP同凭据双SID/Local任务、伪造上下文、空闲/删除/缺省SID、Read禁止和Edit实际拒绝定向通过；httpSmoke真实src/index.js通过本机Chat工具种Local，再切Bridge验证双peer，绑定+revision策略修改必须成功，目录名逐项等于tools/list且实际禁写无文件，再恢复策略。profile/mcpProtocol/taskProgress相邻回归通过。完整84/84、真实Chromium既有套件通过，生产依赖audit 0漏洞，docs249源码/28目录/110排除；实现`f318e6050d4276b24e9d3dbba4d622e236bedb92`的[CI35536769099](https://github.com/cccjvav/web_agent/actions/runs/35536769099)首轮8/9成功：Windows Node20在生产依赖审计步骤失败，该job测试未运行，其余八项成功。gh两条日志下载路径均EOF，未确认根因；failed-only重跑被GitHub拒绝（workflow file may be broken），不把失败归为已证明的网络波动。没有修改工作流/依赖/门禁。文档提交`1b9eb049527f473e38d2580f960ab7199b89ae07`的[CI35536951646](https://github.com/cccjvav/web_agent/actions/runs/35536951646)已逐job核实九项success（包括此前失败的Windows20审计及测试），不倒推首轮失败根因；正式清单201项，暂停15项，更新的是185个已登记指纹，不读暂停正文、不提升逐句认证状态。下一项原生NDJSON可靠终态，之后窄屏/ARIA；其余R4–R9与逐句/实机验收继续，未把目录修复夸成原先存在Edit越权。

### F54交叉复审：审查自己的累计修改与项目目标（2026-09-20）

用户明确要求继续时审查此前工作，避免旧功能回归与整体目标偏移。本轮先暂停增加原生功能，以20ad7b2为复核基线，对照a490ca0之后前四批累计改动，不把上一批CI成功当作审查结论。运行时代码范围为session/server/requestLifecycle/externalClient/resources、tools/index工具描述和patchEngine；沿调用链核对progressTracker、执行控制/文件恢复及原生消费者。不是全部源码或全仓逐句审完，也不是外部独立审计。

| 复核链 | 保留合同及审查结论 | 兼容变化/不能外推的边界 |
|---|---|---|
| 会话pin→HTTP请求/SSE→释放→取消 | 活跃会话不参与TTL/容量驱逐；release单次；认证主体绑定不替代精确凭据取消归属；出站无效SID拒绝后finally仍abort/清理，未发现遗漏这条清理路径 | 全忙503是有意背压；DELETE不是回滚；断开后的协作取消不是协议完全合规或持久exactly-once |
| RPC准入→版本→批次→工具派发 | 整份envelope/ID/预算预检先于执行，保留合法旧版批次、现代单请求、同类型并发与授权复查 | 256字符ID、64项批次是本地约束；2025-06-18拒批次是有意变化；不承诺整个批次语义事务或完成ID终身去重 |
| patch→hash→dryRun/写入→检查点 | 显式hash要求目标仍存在；新建只接受正文/单空SEARCH，已有文件多块/行尾/写锁保持；审批/恢复栈未被替换 | 多块新建拒绝是有意纠正丢块；未传hash的新建不自动使用旧readCache作为删除前提；不是跨进程事务 |
| resources→可信caller→任务/目录→ACL | HTTP固定上下文，Local内部缺省保持；同peer任务复用既有tracker；Read门槛和实际工具权限没有放宽 | workspace资源缺SID拒绝是有意兼容变化；根/指令/记忆仍按Read共享，不宣称全面租户隔离；真实第三方客户端未验 |
| 前端/原生→Chat路由→结果历史 | 浏览器既有回归覆盖审批/文件/恢复/stdio；对照真实/api/chat的done或error及两种原生消费者 | 原生postNdjson仍吞坏帧、允许302/无终态resolve，不能用经典页面成功代签；下一包必须同时测试传输函数、ChatView历史和chat participant消费 |

**本轮确实发现并修正自己的说明遗漏**：tools/index的apply_patch目录描述和initialize.instructions仍不加条件地说读过路径会自动复用hash，而patchEngine仅在“目标存在”分支查recalledHash。第四批protocol资源已限定existing，两处仍未对齐。本轮先在mcpProtocol给初始化指引/工具目录加断言，旧文案失败（guidance-red.log），再限定existing file only、优先显式expectedHash、先前读过的目标消失须保留hash并停止协调；说明缺hash的缺失目标走创建合同。只改机器说明，不悄悄改变文件创建合同，也不声称新增了删除检测保护。

stateIntegrity/mcpProtocol/mcpCancellation/requestLifecycle/externalDiscovery/patchEngine/executionControl/taskProgress/fileCheckpoints/workflowPreconditions/operatorQueueCapacity/nativeRotationCommands/extensionCopy共13项定向通过；84/84和真实Chromium既有套件通过。最初定向命令误写不存在的operatorQueue.test.js，属于执行脚本路径错误，停止后核对真实operatorQueueCapacity入口再运行；原错误日志保留，不把它报为产品回归或已执行测试。修改说明后再次完整84/84通过；docs249/28/110，精确提交CI在提交后核验。证据目录/home/user/f54-cross-review-evidence。

总体方向仍是既有安全文件工具、审批/恢复、Chat/Bridge和可靠结果链的选择性修复；没有引入替代MCP栈、模型自动切换/重放、扩大OS权限或解除探针暂停。本次未发现新的已复现运行时回归，不等于证明全部兼容性；保留历史Windows超时/首轮审计失败根因、R4–R9及实际Windows/第三方客户端验收。原生可靠终态仍是下一施工项，本轮自审不将其标成完成。

### F54第五批：原生聊天可靠终态（2026-09-21）

本轮先核对Git：本地ref/index回到50c03be而文件保留上轮成果；fetch固定分支2d4ac31，核对发布树后仅mixed恢复ref/index，不覆盖工作文件，恢复后status干净。未编辑暂停探针。

nativeChatStream先以真实HTTP证明旧postNdjson对302正常resolve（/home/user/f54-native-evidence/red.log），再最小修原生链：仅2xx NDJSON，1MiB单行/16MiB总响应、5分钟总deadline和空闲timeout；坏帧/回调错误/断流/error/取消全部拒绝并清理，只在唯一done后正常EOF确认。done之后非空事件同样拒绝。ChatView原有“await成功才存助手历史”现在获得可靠合同；原生participant返回完成metadata，失败assistant历史不再回送，未标记旧历史保持兼容。取消不弹错误模态、不声称主机一定未执行，不自动重放。未修改审批/文件/PTY权限、共享MCP及经典UI。

测试覆盖传输与两个真实消费者（VS Code及binding替身），正例跨UTF8字节/无尾换行，负例302/错误MIME/坏帧/无终态/重复或done后数据/error/断流/取消/预算/控制时钟deadline。发行副本按既有syncExtension生成，不手改单独副本或放宽一致性断言。首轮84/85仅新增测试的详解登记遗漏，补登记及夹具函数说明后完整85/85、真实Chromium通过，docs250/28/110；Playwright下载TLS失败，改用仓库外Chromium包及所需库运行，不降低TLS或浏览器安全策略。实现`931d4e965981cb1d5479b4aafeb2073149a0331e`的[CI35542931972](https://github.com/cccjvav/web_agent/actions/runs/35542931972)已逐job核验九项success；证据提交2111f0e的CI35543099280为8/9，Windows24在生产依赖审计失败，该job未执行测试；日志下载EOF，failed-only重跑请求被GitHub拒绝（workflow file may be broken），原因未明。本地生产audit为0，但不能倒推远端失败原因。保留首轮记录，不改工作流/依赖/门禁；后续提交即使通过，也不据此宣布根因修复。实际Windows VS Code窗口不代签。requestJson响应预算等相邻静态缺口仍待，窄屏/ARIA继续下一项，不把本次局部修复外推全原生链审完。

### F54第六批：窄屏单工作面与有效页签角色（2026-09-21）

从干净4d6c580接续，未恢复ref/index或碰暂停探针。先在既有真实Chromium套件加narrowWorkspaceBrowser，旧390px center宽度为0的断言失败（/home/user/f54-layout-evidence/red.log），再修布局，不用overflow:hidden消除报警。

≤700px增加独立编辑器/Chat/Bridge展示导航，一次一个占满剩余宽度的工作面；不切主机执行控制、不丢模型/草稿。文件激活进入editor并收起抽屉，宽屏focusin记录当前工作面以便缩窄时仍可见；桌面双栏、设置弹窗和侧栏保留。tablist内仅tab按钮；关闭当前页按钮移到外部、固定36px，不被长文件名挤出。关闭非当前页须先选择，选中页也可Delete；dirty确认/saving阻止/最后一页不关、模型释放保持，成功关闭后焦点返回活动页签。

真实浏览器覆盖320/390/640有效宽度、输入命中/草稿、长文件名关闭、键盘、取消dirty关闭/确认关闭及焦点；768/1024/1440桌面双栏。仓库外axe经AXE_PATH验证两条required-children/parent规则，无仓库依赖变化；CI始终有结构和交互断言，不把可选axe当唯一门禁或完整WCAG认证。旧真实保存/回退/审批/stdio浏览器场景继续。

首轮全量80/85：四项文档/生成物未同步，editorRuntime的简化DOM缺querySelectorAll使新展示函数报错；给fixture补真实DOM查询入口，未删旧dirty/hash/恢复断言。实际页面和该fixture随后均通过；第二轮84/85为新helper漏登记到原主详解（辅助详解已写），补主入口说明后85/85、真实Chromium及两条axe规则通过，docs250/28/110。自审补了程序切Chat/Bridge时隐藏面内焦点恢复到活动tab，避免只处理鼠标点击；截图中的中文缺字是沙箱字体环境限制，不据此认证Windows字体。实现`e32974a242cee3015fb22a7e5a1d2759ddcac545`的[CI35545037493](https://github.com/cccjvav/web_agent/actions/runs/35545037493)已逐job核实9/9成功。继续保留Windows桌面/读屏器/DPI验收、原生requestJson预算及R4–R9，不将局部UI修复扩大为项目全完成。

### F54第七批：原生JSON响应预算与断流（2026-09-21）

接续已发布2bcb7d3。本地ref/index再落回50c03be而文件保留成果；fetch固定分支，以临时index/read-tree对照发布树，git diff零差异后仅mixed恢复ref/index，未覆盖文件，status干净。不沿用聊天记忆盲重置工作树，不碰暂停探针。

先核对requestJson全部调用者：工作区绑定/状态、轮换、控制/启动/停止、PTY hello/poll及claimed/accepted。原实现无通用响应预算，res仅data/end，无error/aborted处理；15秒仅空闲timeout，滴流可延长。nativeRequestJson真实HTTP首红测证明>8MiB响应照收（/home/user/f54-json-evidence/red.log）。

最小修改只在规范extension.js的requestJson：最多8MiB实际Buffer字节，声明超限可提前拒绝但不能代替实际累计；15秒总deadline加原socket空闲timeout。finish单次结算、清chunks/timer，响应error/aborted/提前close/不完整end失败销毁两端。3xx不跟随且拒绝，防假success正文被旧调用方误接收。完整有界4xx/5xx仍返回status/json/raw，有界坏JSON和空正文保留json=null，调用者仍负业务成功判定；不借修传输改变409或PTY授权合同，不把请求失败说成主机未执行，不自动重放。

新增测试使用真实回环HTTP、实际workspaceMatch/轮换/BridgeView消费者，只替换VS Code和缩短夹具deadline。覆盖实际/声明超限、临界8MiB、跨UTF8字节、截断、滴流、无头、302、409/500/空200/204/坏JSON；所有服务端response关闭、timer清除。轮换/停止未知结果各只POST一次、不刷新报成功；有界409拒绝仍正确。没有真的轮换密钥/停止隧道；不是Windows桌面或长期RSS/并发压测。

自审核对第五批NDJSON与第六批布局未被修改，复用旧轮换/PTY/副本回归；发行副本由syncExtension生成。七项定向、完整86/86、真实Chromium（含上一批窄屏/两条axe规则）通过，docs251/28/110。自审增加多字节超限与HEAD零正文兼容：HEAD的Content-Length代表资源长度，不冒充待接收正文；未改变总deadline。实现`c37ef280ec408d22d86c1967098bdd3138df3496`的[CI35559183087](https://github.com/cccjvav/web_agent/actions/runs/35559183087)已逐job核实9/9成功。R4历史超时及CI审计失败未明根因、R5/PTY平台与R7/R8等继续，不据此认证全部原生代码或全仓逐句完成。

### R4诊断首包：历史Windows22超时，不宣称根因已修（2026-09-21）

从干净213241c接续，不切分支。重新用GitHub API核对35125290301/36ff82f、Windows22 job104892732306及check-run annotations：mcpProtocol截图echo的status=timeout、durationMs=30519、exitCode=1、stdout/stderr为空；patchEngine的grepSearch为E_TIMEOUT/detail.phase=startup。该job失败，其余八项成功。完整日志下载仍EOF，没有重跑历史任务。原annotations及JSON保存/home/user/r4-evidence；下载错误中的临时签名链接归档前脱敏。

fetch历史SHA只用于对照，不切换工作分支。历史到213241c的searchWorker.js/commandJob.cs无差异，grepSearch启动/扫描逻辑也未变化；fileOps其他写入分支及executor所有者隔离有后续差异。现有证据不能区分运行器负载、PowerShell启动/Add-Type/Attach或管道时序，更不能把退出码1直接解释为原始命令失败（可能发生于超时终止后）。

新增processDiagnostics先红测缺少online/ready诊断，随后仅补观测：WEBAGENT_DEBUG_PROCESS=1下executor记录created/spawn/首输出/取消/超时/error/exit/close，搜索记录线程online、模块ready、scan-start及失败/清理。固定数值/布尔/枚举schema，不记录命令、cwd、查询、输出正文、凭据；新trace写日志失败不改变执行。默认关闭，工具结果/事件合同不变。Windows主npm test步骤开启；不改30秒命令、10秒启动/2秒扫描、容量/内存、Job Object、终止或重试策略。

runner新增文件/Node/平台/架构/原预算及单调耗时/status/signal/errorCode/捕获字节数，失败annotation带有界元数据，默认120秒/退出码不变。既有日志可能含测试正文，本包不声称全日志脱敏。

可控Worker和时钟验证startup/scan/cancel/重复ready/迟到消息/单次释放，真实命令验证echo/超时/默认关闭/不吞工具输出；诊断sink抛错不破坏真实正常命令或可控worker结束。testRunner临时目录fixture验证exit7及1秒故意超时均失败且有元数据，未改真实套件时限。mcpProtocol/patchEngine开启诊断定向通过，是Linux当前实现证据，不是历史Windows复现或根因结案；首次全套发现旧searchWorkerLifecycle VM缺process环境（新增诊断读取process），补真实process/console后原断言全保留；随后一次全套因尚未重建源码清单触发文档漂移守卫，均保留失败日志。重建后Linux Node22、debug=1全套87/87通过，文档252/28/110及185登记hash已刷新；实现144833af902732062773f9749264ae94cd4d7e26的CI35560613257精确SHA九项全成功（含Windows20/22/24、浏览器和安装构建）。另跑debug=0全套87/87通过。仍未复现历史故障，不以当前绿色将R4结案。

### R2/R3外部响应互斥（2026-09-21）

继续前核对远端交付488f498。工作文件保留了上轮内容，但本地引用/索引停在50c03be；fetch后逐文件比对Git对象与行尾规范，确认交付内容仍在，只对齐本分支ref/index，没有覆盖工作文件或切分支。随后的变更仅属本包。

发现externalClient.rpc和stdioTransport.frame用message.error真假值判断成功，result与error:null/false/0同时存在会误接受。真实HTTP与stdio登记负例均先失败（Missing expected rejection），证据在/home/user/r2-response-evidence；不是假设性风险。本包运行时仅两处改为Object.hasOwn(message,'error')，保留已有版本/id/对象结果、预算、权限、审批与取消路径；不整体替换MCP、不放宽协议、不自动重试。非规范服务器以error:null搭配成功result的行为不再兼容。

externalDiscovery覆盖真实HTTP JSON和SSE，stdioMcp及既有fixture覆盖真实监督进程：矛盾响应登记失败后目录清空、stdio进程退出；已批准调用先产生夹具计数，收到矛盾回复必须unknown，重复批准不增加调用。正常结果、通知、分页、owner death/取消/预算旧断言保留。只解决该互斥缺陷，不宣称全RPC或所有第三方互通已认证；Linux Node22全套87/87通过，源码文档252/28/110、185登记指纹同步；实现d520ae71c541a2d3f1712c46d7c282145db4c161的CI35586118614精确SHA九项通过（含Windows20/22/24、浏览器、安装构建）。

剩余工作仍包括R2/R3其他消费链、R4历史超时根因、R5 PTY/Windows合同、R7文档逐句、R8本机MCP/桌面。R6优化候选与R9版本/lint/生成物取舍按收益与授权决策，不视作全部必做；P原分工暂停不变。

### R2/R3会话提交时序（2026-09-21）

从干净da1e841继续，复审上一批两处error存在性修复的相邻合同：externalClient.rpc在读取/校验响应体之前已写client.session，即使上一批正确拒绝矛盾响应，下一次已批准请求仍会带上失败回复的SID。真实HTTP红测观察到candidate-session-token而不是原valid-session-token，证据位于/home/user/r2-session-evidence。不是认证越权结论，而是拒绝响应残留状态的明确缺陷。

最小修复仅改变externalClient.rpc：会话头仍先校验为1–512可见ASCII且不含逗号的候选值；匹配响应经过JSON-RPC/对象result/无error检查后才保存。通知仍沿用现有2xx与取消响应体后返回的规则，只在成功路径保存候选SID。不引入会话重试/重建、并发轮换策略或新的通知状态限制；合法RPC result中的业务isError/unknown仍由execute及审批队列处理，不能把RPC接受等同业务成功。

externalDiscovery真实JSON/SSE覆盖HTTP500、error并存、ID/版本不符、数组结果、坏JSON和超过256KiB：已执行夹具计数的调用保持unknown，重复批准不重放；后续另行批准的请求必须仍带原SID并完成。有效结果的新SID、202通知SID兼容同时验证；旧分页/取消/目录/敏感字段/stdio合同不变。定向externalDiscovery/publicHttps/executionControl已通过；Linux Node22全套87/87通过、文档清单252/28/110和185登记指纹已同步；实现19eaa164d9799c757405bcf193fc5bb69bc9362e的CI35587380854精确SHA九项全通过（含Windows20/22/24、浏览器与安装构建）。不是实际公网/IDE/Windows桌面验收，R4根因等其他未完成项及探针暂停不变。

### R5安全残留回收：归属与只读检测首包（2026-09-21）

用户要求异常退出留下的隧道能一键回收，且不影响正在运行的Bridge和其他程序，已同意分阶段安全计划。从干净2807f88接续。本包先做记录/检测，不把清理候选直接变成kill，也不调用会关闭当前Bridge的stopTunnel。

三个provider spawn后各接一次observeTunnel；只持久化provider/实例UUID和宿主/目标PID+启动身份+exe，不传argv/Token，home私有目录共享同用户各项目。Linux读/proc，Windows固定系统PowerShell只查指定PID，8秒/128KiB、最多两个在途查询；其他平台unknown。记录/权限/路径/包装器不满足时固定警告，不阻止正常Bridge；正常退出移除本次记录，异常退出后留线索。32项/12KiB有限扫描，坏文件/链接/超额/不可读保守报告；缺目录不创建。磁盘收据不是认证/清理授权，Windows ACL与同UID篡改不作保证。

本地零参数CLI `node webagent-core/agent-host/scripts/tunnel-residue.js`输出active-current/active-other/orphan-candidate/identity-changed/exited/unknown，明确registered-launches-only、cleanupAvailable=false、canCleanup=false；禁止路径/PID/--cleanup参数。没有API/UI清理入口，无网络暴露面，无实际终止操作。旧版无记录不扫描认领，结果不代表全系统无残留，不能把元数据判断当原子句柄身份验证。

回归含分类负例、权限/未知、PID复用、坏记录/边界/链接/迟到exit/隐私/扫描合并；真实Node夹具宿主被SIGKILL后目标仍存活并被标记候选，检测既不杀它也不影响另一个活进程；目标由私有stop文件自行退出、失败60秒兜底。provider接线spy保留原隧道生命周期断言。Linux定向及完整88/88通过；文档257/28/110、185登记指纹同步。首轮全套发现命名辅助说明遗漏，补readStat/unknown/live；次轮因说明误写测试秘密哨兵原文触发发行防泄漏守卫，改为描述性文字，原断言未弱化，失败日志保留。发行白名单补只读CLI，安装回归核对模块/脚本并排除归属文件。首轮实现d5cbb79的CI35589693930为6/9：三个Windows任务均在新夹具处报告exited而非orphan-candidate（约2秒，并非超时）；annotations已存档。只将测试owner的子进程显式detached以构造实际存活孤儿，产品spawn不变，保留原断言而不允许exited冒充孤儿。修订9b8ed65744016f70144620b643d5a389ad02e1d2的CI35590001850精确SHA九项全通过，包含Windows20/22/24、浏览器与安装构建；不声称真实隧道桌面验收。

后续必须有：稳定进程句柄/可信归属、清理前重检活实例与目标身份、独立有界预览及本机绑定确认、防重复执行与逐项观察退出、只清确认项。禁止按名称/端口全杀、仅凭旧PID、篡改记录或候选状态结束程序；无法确认就跳过。R4历史超时根因及其余工作包/暂停探针不因本包改变。

### R5第二包：Windows收据完整性保护（2026-09-21）

用户继续授权安全残留回收。从交付457bf30接续；环境重建后本地引用/索引停50c03be，fetch后逐文件（含CMD行尾规范）核对交付一致，才只对齐ref/index，未覆盖工作文件。本包仍不引入清理API/UI或kill。

第一包明文收据不能授信。本包Windows新收据经CurrentUser DPAPI并绑定固定用途熵后存v2载荷；头/载荷预算、stdin传输、不在argv/env放记录，最多两项在途辅助查询、8秒/512KiB捕获。扫描批量解封，payload内UUID必须匹配文件名；可信标签由本次校验产生，不接受文件自报。旧v1只读且unverified，Windows封装失败不退回明文；Linux等平台继续未验证记录，复制来的v2不可解封项不能授信。等待封装期间退出和最终12KiB预算均复查。

明确限制：DPAPI只提供OS用户范围完整性/机密性，不证明WebAgent应用来源，不隔离同用户任意代码/管理员；未做真实跨用户登录验收，也没有把os-user-protected变成清理许可。所有canCleanup/cleanupAvailable仍false。后续可信启动链、稳定句柄、活实例复核、本机确认及观察退出仍待。

新测试用可控authority检查明文可信标签伪造/密文替换/改名/损坏/失败不降级/迟到退出；Windows专门运行真实DPAPI往返中文/emoji、翻转密文与预算失败，原真实孤儿/活实例夹具保留，发行断言新增JS及PS辅助。Linux三项定向和全套89/89通过，文档260/28/110及185登记指纹同步。文档守卫初次因PS脚本错放JS映射而失败，现放回非JS artifactPairs，保留原守卫。实现721686c7136f36ff111d8596e79f1443cedffccf的CI35596632247精确SHA九项全部通过，Windows20/22/24实际执行DPAPI及原真实孤儿回归，浏览器/安装构建也通过；不是用户桌面或跨真实用户验收。探针继续暂停，R4根因等其余工作包不关闭。

### R5第三包：Windows稳定句柄与终端确认回收（2026-09-21）

从干净f5599ea继续。独立本机零参数tunnel-cleanup.js仅Windows交互TTY；预览后60秒内输入RECYCLE，禁止--yes/PID/路径/管道确认，无新HTTP/MCP清理权限。图形按钮及非Windows终止仍待。

只读保护记录，完整有界扫描，旧v1/损坏不授信。cleanupSource保留文件名ID绑定并计算载荷清单指纹，确认前重读一致才发指令，变化使旧预览失效。helper独立DPAPI解封，核对创建时间/映像/原始父PID；限定cloudflared.exe/ngrok.exe根进程，任何活宿主（含PID复用）阻止清理。DPAPI不是应用签名，不隔离同用户恶意代码/管理员，TTY也不是防自动化的人类认证。

C#从预览至执行持有同一SafeProcessHandle，确认后重查身份/活宿主，对该句柄TerminateProcess并观察退出；不重开目标PID、按名称/端口枚举、taskkill树或调用stopTunnel。辅助预览15秒、确认60秒、来源读取12秒、结果8秒；原启动/测试超时未改。每项目标等待≤500ms、循环总4秒，未开始/未知/失败逐项报告。取消/过期只关辅助句柄；确认后断连可能已执行，unknown不重放。不是所有后代或无记录旧残留清理器。

新增模拟协调器确认单次/过期/来源漂移/重复帧/取消/管道拒绝；Windows真实测试复制Node为同名伪隧道，测活宿主、父PID/出生/映像不符、同名无关进程保留、持有期间退出、来源变化及确认后观察终止。旧owner夹具只增可选程序路径，默认程序/60秒自退保持。Linux全套91/91。首次2422ab2 CI35600036448六项通过、三个Windows失败：Node20暴露夹具TEMP短路径与实际映像长路径不匹配，Node22/24还由删除仍映射的测试exe错误覆盖主因。随后仅改测试路径用native realpath、提早保存PID/保留主错和等待close，未放宽产品身份核对或期限；补当前宿主/EOF/有界输入输出回归。修订实现ffb6f72d3008fcce66ecdf05d662d0426c3135d4的CI35600424734全部9项通过（Windows Node20/22/24实际运行原生回收测试），本地91/91、清单266文件/28目录/110排除。测试专用复制Node，不是实际Cloudflare/ngrok桌面验收；真实ACL拒绝/跨用户、实际PID复用时序、图形交互和非Windows回收仍待，R5整体不关闭。失败日志下载TLS中断，已由Checks annotations取得首轮错误并保存，未把网络错误当测试通过。R4根因及其他工作包/暂停探针不关闭。

### R5第四包：真实Windows进程DACL拒绝（2026-09-21）

从干净76f1043继续，先复核第三包原生Check/Commit/Dispose与协调器取消/结果路径：本批不修改产品实现、入口或权限，也不据局部核对认证全项目。新增Windows专用实际DACL夹具，仅创建自己的Node直接子进程和临时PowerShell宿主，用预持有句柄保存/恢复二者DACL。产品相同OpenProcess权限必须实际错误5，然后实际原生租约验证目标inaccessible、活宿主owner-unknown且Commit不终止；原始句柄检查存活，恢复后过时出生收据仍由活宿主阻止。过时出生不是实际PID复用，不宣称跨用户证据。

首轮63cd8b5 / CI35601977281六项通过、三个Windows均因未得到实际ERROR_ACCESS_DENIED失败，夹具已确认子进程退出；不据此认证权限拒绝。修订在一次性测试宿主获取身份/恢复句柄后禁用自身全部令牌特权，排除管理员CI/.NET诊断初始化可能启用调试特权的绕过；首次修订降低测试宿主权限，不改用户账号或产品，也不跳过/放宽断言；随后进一步改成私有线程令牌，见下。修订e6e9aacb0ce58a043e3c3f72bc91af329cb93b7c的CI35602308391九项通过，Windows Node20/22/24实际执行原生DACL拒绝；本地92/92（Linux的原生项明确未执行）。库存269文件/28目录/110排除。本次降低一次性夹具令牌后拒绝前提成立；首轮未记录具体启用的特权清单，因此不把某个特权的初始状态写成已测事实。

所有清理只通过测试创建对象的原始句柄，不按PID补杀；嵌套finally恢复DACL并观察子进程退出，30秒/64KiB辅助预算、子进程60秒自退，不改现有产品/回归期限。测试JS/PS/C#不入安装包并由禁止项断言守卫。Linux只能检查静态/打包与既有套件，Windows原生结果见上；图形按钮、真实隧道桌面、跨用户及实际PID复用仍未完成。R5整体/R4根因和其他包不关闭，三个探针继续原分工暂停。

第四包后续befee7d / CI35602748192八项通过、Windows22失败：tunnelCleanupWindows登记unavailable（20119ms）、tunnelReceiptProtection不可用（8913ms）、tunnelRegistry期望orphan-candidate而实际unknown（16731ms）；新增ACL测试未报失败。时长接近辅助期限不足以确定根因，不把后续绿灯当根因修复。复核夹具发现直接调整主令牌不能仅凭进程隔离排除共享风险，因此再改为DuplicateTokenEx私有线程模拟副本，只调整副本，RevertToSelf并逐字节检查原令牌特权未变。此修订不改产品或期限，不能断言它导致了先前失败；私有线程令牌修订8d49bea426a45868522ae43ba6bbe4f18409639b / CI35603422500九项通过，Windows Node20/22/24执行DACL拒绝与主令牌不变断言；本地92/92。befee7d的Windows22原有辅助失败根因仍未定位，没有因修订绿灯注销；后续须补仅阶段/耗时/退出码的脱敏诊断，不增加超时或重放。

### R5第五包：Windows收据/身份辅助诊断（2026-09-21）

接续037b0ce；该提交CI35603908774为8/9，Windows Node20/22/24主机套件通过、windows-installer在原有Probe Companion打包步骤失败，原因未定，仍保持原分工暂停，不改源码/门禁。前次befee7d Windows22原有辅助不可用/unknown根因继续开放。

本轮启动发现本地Git指针/索引回到50c03be，但文件保留交付内容；fetch当前绑定分支并逐blob比较037b0ce后仅mixed恢复指针/索引，不改工作文件。暂停探针文件的原始哈希差异未读源码/覆盖，恢复后Git规范化状态干净；没有整体替换或捎带提交。

先复核receiptProtection/processIdentity的8秒/并发2/严格形状/错误保守及相邻清理租约合同，再只补默认关闭的阶段元数据：helperDiagnostics每调用≤10行，固定字段/错误白名单、无参数/收据/PID/路径/原输出。PS固定阶段标记仅在回调转成布尔值；区分脚本未到达/安全程序集已加载/条目处理完与结果解析失败，不假定spawn=ready、killed=timeout或8秒耗时=DPAPI根因。不改变期限/权限/重试、不解除unknown不终止。模拟回归覆盖脱敏、日志异常、预算及原回包，Windows旧套件待精确CI验证；新诊断不是历史故障复现或根因修复。本地debug关/开均93/93，清单271/28/110；首推881230c漏stage自动生成tests/README一行导航，随后立即补齐并更新审查指纹，不改文档守卫。首推CI35611901470为1/9，八个文档门禁失败；修订6fd13b626a6e5d365ec548a3209b0532fdfb7d3e / CI35611958857九项通过（含Windows Node20/22/24实际保护/归属/回收/ACL），并非历史故障复现或根因关闭。旧Probe打包本次经过旧CI步骤成功不代表已接手/专项审查或已解释之前的失败。

### R5第六包：Windows开始菜单本机回收入口（2026-09-21）

从干净e805bef接续。先核对核心扩展/启动器路径，扩展混有网页VSCode/远程宿主场景，不将回收权直接接面板消息；本批改为Windows系统开始菜单快捷入口（不是面板按钮）。不读改暂停探针，不修改HTTP/MCP、Bridge停止或已有终端清理逻辑。

Inno入口用系统PowerShell -NoProfile执行固定installer/tunnel-recovery.ps1，不提权、不安装后自运行。PS零参数/输入输出非重定向门禁、当前用户SID的Local会话Mutex非阻塞排除重复点击，锁持有至结果窗口按键关闭；abandoned仅允许重新预览、不重放。PATH仅解析Node应用，用分离参数启动固定launch.js recovery。launchRecovery再次检查win32/双TTY/零参数，再准备runtime；不解析/创建工作区、npm安装或启动Bridge。当前Node+单独脚本参数shell=false/继承stdio执行原CLI，不自动传RECYCLE、不改60秒/稳定句柄/unknown合同。有效用户PATH/runtime不防同用户恶意代码，Mutex不是跨会话安全隔离。

新增VM回归验证真实启动分支的门禁先于runtime、路径字面量、只启动固定CLI、退出码/错误无重试，Windows原生测试仅解析PS和管道拒绝；打包断言包含新PS/快捷入口且不安装后自动执行。用户桌面实际点击、互斥/TTY、Ctrl+C/关窗、真实隧道仍未验；不能将静态/CI算作GUI验收或R5整体关闭。本地94/94；清单273/28/110。实现a22428a17a930a880c86ec8f61330ef932f36efd / CI35614219553八项成功，Windows20主机job失败：mcpProtocol截图回传的测试专用echo在30073ms超时，无stdout/stderr；测试文件耗时30431ms。Windows22/24主机、浏览器、Windows安装器与新入口PS/管道拒绝通过；不把新入口成功写成整体九项通过。已保存Checks annotations，完整日志TLS EOF无法读取；摘要未包含中段生命周期日志。与R4旧症状相似但不能确认同根因，不延长预算/删断言/重跑。用户桌面交互仍未验。

### R4继续：CI阶段摘要与交接可携带性（2026-09-21）

用户要求继续并确认随时交接准备。本轮核对最新基线、开放失败与证据可得性：外部ZIP不在当前工作区，已从GitHub重新取得dcc321b成功与a22428a失败run/job和Checks事实，最小脱敏摘要入review/evidence，原日志不可得不伪造。当前索引增加即时接手检查，不另建路线层。

对照run-tests.js发现失败annotation只取stderr头1600/尾1000和stdout尾1000，a22428a中段生命周期记录未出现在摘要。新增隔离夹具先红测确证这项诊断缺口（不是echo超时根因），再加lifecycleSummary：固定前缀+≤4096字符JSON行，重建白名单枚举/安全整数/布尔字段，最多最后6条/1800字符，优先放进原4500字符annotation预算；坏JSON/恶意字段/超长行忽略。仍16MiB捕获、原120秒文件预算/顺序/失败退出码，无重跑、无产品进程或权限变化。原首尾片段与完整日志并非全面脱敏，新摘要也不是认证时间线。

新增回归覆盖中段保留、末6条/长度、类型/敏感哨兵/超长坏行与失败不变；本地完整94/94；首次本地文档/打包4项因新取证JSON误当程序源码失败，已将该单一证据数据路径声明排除源码覆盖并解释字段，不排除任何程序/测试代码，不削弱守卫。源码库存273/28/111；实现7f62350246f682c5f1c23f912a1206900904d7db / CI35620755160九项通过（含Windows Node20/22/24执行隔离runner负例），脱敏结果同时落入仓库CI摘要。没有再次出现真实echo超时，因此未得到其根因新结论。Windows历史根因、R5实机/面板及探针暂停均不关闭。

### 仓库整理：入口瘦身与参考原件归档（2026-09-21）

用户要求先整理仓库，本轮停止新增功能，从干净1aabb31接续，只动资料归放、导航和生成文档。根上传ZIP/TXT原件移到既有review/archive，迁移前后SHA-256/大小一致，不解包/运行，不删除原任务或授权，不将原件加入发行白名单；正式文件审查行只改定位、不增加整篇通过数。

CONTEXT的长批次摘要先核对其中所有提交/CI标识均已在本阶段保留，再精简为最近验证/接手/开放工作包/安全边界；完整旧索引亦可由1aabb31追溯，不另复制一份历史时间线。agents删去重复进度日志、留下长期约定，修正“清理仍禁用”的过期笼统说法为“只读不执行，独立本机入口须确认”。根README补职责目录表，docs索引修R0–R9/P和参考原件归放。

源码、启动路径、API/权限、安装器配置/依赖版本不变；不搬源码模块，不动暂停探针及冻结原型，不读/删用户状态、日志或缓存，不git clean。本轮仅文档/归档整理，不宣称全仓语义审查完成，历史失败与用户桌面未验项继续保留。本地完整94/94、文档273/28/111且updated=0；原件完整性与无运行源码/暂停模块差异已核对。提交后的CI仍按实际HEAD单独核验，不继承整理前绿灯。

### 第55组：接手独立复审，浏览器协议/经典流与可读性修复（2026-09-21）

进入67f4f96前工作树干净，固定arena/01a0c4b1-web-agent，按用户更正来源01a0bfa9执行fetch/ff-only。先读manager/review，接手基线94/94、273/28/111/updated=0、真实Chromium及生产audit 0；来源CI35624122815九job逐一success，不继承为本批验收。范围、逐项红绿与三张中文UI截图见[独立报告第7节F55](../../review/INDEPENDENT_AUDIT_2026-09-20.md)。

先红测MCP暴露列表和经典done后数据，再最小修复：仅暴露会话/挑战头且Origin/token不放宽；经典流严格HTTP/NDJSON/UTF-8、单行1MiB/总16MiB/错误正文64KiB、拒跳转和5分钟deadline，唯一done后EOF才提交历史，失败abort/cancel/release且不等挂起cancel。真实Chromium续用会话列工具、不增计数调用；Response/ReadableStream坏流不当服务端命令退出证明。

文档站确认只有两处旧标题失效，修成可Enter的原生链接并移焦点；代码局部横滚、长路径换行、faint对比度/正文链接/分组字号。额外CJK复测发现导航62px却含663px内容和Bridge滚动焦点缺口，正式红测后修body自然增高/导航换行、文档代码表格和三个日志区键盘停靠。axe-core 4.13.0仅开发依赖，默认执行：工作台16个主题/宽度/欢迎-API设置状态，文档站12个宽度/全景-导读-源码状态；既有真实写盘/审批/内置/stdio等回归保留。

施工失败保留：浏览器夹具最初误将SSE当JSON，明确Accept修正（非产品缺陷）；新滚动pre触发axe，补停靠点；首轮完整93/94为新增compact漏主说明，补齐而不删守卫。中文字体只在仓库外审查环境，CDP确认Noto Sans SC，未把缺字/截图当Windows字体问题。精选lint四个清理finally提示未冒充四个已复现功能bug；Windows20历史原日志再次下载EOF，不改期限、不重跑追绿。

最终以独立subprocess分别记录真实退出码0：完整94/94、扩展后Chromium（含16+12状态）、生产audit 0漏洞；文档273/28/111且updated=0。再次检查194 JS/MJS语法，精选lint仍仅原有四个清理finally提示、无新增所选规则报警；185登记指纹同步。代码提交`33fc9ed8670ff51e94939549e05961ad65919e09`已推当前固定分支，[CI35632024550](https://github.com/cccjvav/web_agent/actions/runs/35632024550)按精确SHA核实全部9个job completed/success：Ubuntu Node18/20/22/24、Windows Node20/22/24（含既有重复取消/stdio）、Windows安装器及真实Chromium。不是来源绿灯、Windows桌面或历史根因结案。后续本段证据记录提交的CI仍须按其实际HEAD核对。正式清单只扩大受影响段的局部核对，整篇已逐句仍8；探针/冻结原型零施工。R2/R3其他合同、R4原因、R5桌面/跨用户/PID复用、R7逐句及R8用户MCP/IDE继续开放。

### 第56组：恢复CI核验与可选编辑器启动生命周期（2026-09-21）

用户已重连GitHub；固定分支/工作树先核对，进入036d65b735805f13381f3ab1b0a5408d999c872d，工作树干净。此前受401阻断的[CI35632714383](https://github.com/cccjvav/web_agent/actions/runs/35632714383)已逐job核实9项completed/success，F55文档提交的核验缺口已补，不把它当F56新修改通过。

沿第55组明确的run-code-oss线索，三项正式负例先红：真实HTTP服务已接受GET但不回头，250ms函数预算不能自行结束而触发1.5秒测试看门狗；预先abort仍发请求/挂起；认证存储抛错后已创建的真实Node子进程仍存活。测试自行收尾，只用临时目录、HTTP及Node夹具；后两者的启动/认证依赖为替身，不假装跑了真实agent-host/code-server或用户桌面。

修复保持主机health的15000ms：独立deadline加performance.now截止、前置/在途取消、串行200ms只读重试、每次dispose请求/响应，迟到200/error不复活。run不再从低层直接process.exit，main集中登记异步npm/agent/editor对象，单次stop及finally处理配置/同步spawn抛错/异步error/正常与信号退出；主机正常0退出也终止不可用的编辑器，非零保留，editor被信号结束不再假0。

stopChild区分killed与已退出；保留对象仅清本轮直接子进程，9秒TERM宽限保留主机原8秒shutdown，必要时KILL后再观察1秒，unknown明确非零/unref但不冒称已终止。删除原Windows按PID派生taskkill树的路径，不增加远程/名称/端口清理权。**这不承诺所有npm脚本、code-server worker、PTY或隧道等孙进程退出**；不是R5稳定句柄残留回收的替代，也没有认证真实PID复用/跨用户。健康200仍不是主机实例/工作区身份认证，ensure内部同步依赖准备不计入15秒。

新增codeServerLifecycle的28个命名场景，组合真实HTTP/Node和可控时钟/进程：开放503/200响应处置、请求失败重试、迟到回包、取消/期限、初始化参数兼容、agent/editor各退出码、mkdir/spawn失败、安装器成功/失败/取消、重复停止、killed但尚未退出、unknown有界与无关同名进程存活；CLI尾表达式退出码另测。主说明逐函数更新，并原地纠正测试说明“经典Shell默认mkdir”“固定0.7.0副本/全部只读”等过期表述，未改复制/安装架构。

本地首轮完整95/95、既有扩充Chromium（含F55跨源/坏流与16+12布局/axe状态）、生产audit 0漏洞均以独立进程退出0确认；文档274文件/28目录/111排除且updated=0，精选195份JS lint仅原四个清理finally提示，无新增所选规则报警。提交前再次确认95/95、Chromium/audit退出0、文档零漂移及185指纹。代码`a68a77e6fa82e509b3dc8a09ac27c38a402eadfb`已推当前固定分支，[CI35641420076](https://github.com/cccjvav/web_agent/actions/runs/35641420076)按该SHA逐一核实9个job completed/success：Ubuntu Node18/20/22/24、Windows Node20/22/24（含原重复取消/stdio）、Windows安装器与真实Chromium。查询曾因401中断，用户再次重连后已补核实；这是查询连接问题，不是CI测试失败。后续证据文档提交仍须核对其自身HEAD，不借源码绿色代签。UI、核心权限/工具、原生扩展、暂停探针和冻结原型运行源码零diff；不是全仓审完，不关闭R4历史原因、R5实机后代/窗口、R7逐句或R8用户MCP。

### 第57组：App窗口启动的身份绑定与浏览器失败路径（2026-09-21）

沿第56组待验证线索，外层installer/launch的ready与appWindow三项先红：无关HTML返回200被当ready、已有主机属于另一工作区仍开窗口、浏览器spawn失败报成功。真实HTTP与受控VM红测后拆分实现为installer/appWindow.js，代理保留在launch.js，不自动下载/运行code-server。

- ready/probeJson：固定只允许http://127.0.0.1的/healthz与/api/diagnostics，拒绝用户名/查询/hash/非loopback；状态分ok/occupied/absent/unknown；限制64KiB、UTF-8 fatal、JSON；任何阶段可abort/timeout并销毁req/res释放socket，不跟随重定向，不发凭据；非200/坏类型/超预算/坏JSON均视为occupied，不是实例认证。
- 复用分支：现有服务需同时editor alive且host的hostInstanceId/version/mcpPort/workspaceRoot匹配；错版本/端口/实例/时间/路径/形状/部分缺失均拒绝且不启动/终止另一工作区服务；非法/相同端口与非固定探测URL零网络。
- 冷启动：home/workspace已由外层解析，额外校验版本语义与端口不等；home递归创建、startup.log以0600追加打开，spawn run-code-oss workspace，env加WEBAGENT_APP_BOOTSTRAP=1，stdio含ipc，detached；supervise监听error/exit/disconnect及严格prepared/release消息；循环等prepared后inspectPair，再pin确认identity未变；URL显式folder参数，openBrowser用Edge/Chrome或rundll32，detached、shell:false，失败不重放；release需先请求再确认ack，移交后disconnect/unref；停止/失败统一stopOwned，仅处理保留对象，9秒TERM后必要时KILL再观察，最多12秒，未确认非零且明确提示，不按名称/端口/PID补杀。
- run-code-oss受控：WEBAGENT_APP_BOOTSTRAP=1且存在IPC才允许受控分支，否则抛错；收到webagent-app-stop即停止，release需已prepared且未取消；spawn后发prepared，失败/断开通知外层；清理复用F56直接子进程观察，不认证全部后代。

新增appWindowLifecycle.test.js的28个命名场景：真实回环HTTP/Node与受控时钟/进程，覆盖无关服务、错工作区、浏览器失败、复用pin、实例变化、版本/端口/路径/形状/部分缺失、非法端口/URL零网络、runner spawn错误/同步抛错/非法prepared/无prepared/浏览器失败/release回调挂起/ack缺失、冷启动等prepared后pin、停止取消、早期退出快速失败、清理未确认有界、真实HTTP大正文/坏UTF-8/形状/重定向及body stall/取消释放socket、真实Node IPC准备/释放；未执行真实code-server/窗口、跨用户/PID复用或桌面点击验收。本地96/96、Chromium与audit 0均以独立进程退出0确认；文档276/28/111且updated=0，185指纹已同步。代码`4cf4d6f81bfd9e0f85af690aa84d0ba0fdb48910`已推当前固定分支，[CI35647781757](https://github.com/cccjvav/web_agent/actions/runs/35647781757)按精确SHA核实9个job completed/success：Ubuntu Node18/20/22/24、Windows Node20/22/24（含重复取消/stdio）、Windows安装器与真实Chromium。提交前再次确认96/96、Chromium与audit 0、文档零漂移及185指纹；精选195份JS lint仅原有4处清理finally提示。UI、核心权限/工具、原生扩展、暂停探针和冻结原型运行源码零diff；不是全仓审完，不关闭R4/R5/R7/R8。后续证据文档提交仍须核对其自身HEAD。

### 第58组：同步准备阶段的超时与取消（2026-09-21）

沿第57组待验证线索，同步npm与code-server下载阶段尚无期限/取消。原轮VM替身检查timeout参数/错误和预先abort，未证明真实耗时或运行中取消；F59已复现缺口，见后段。未安装真实依赖或下载运行时。

- installer/launch.js：ensureDependencies(root,{timeoutMs=120000,signal})检查signal、期限有效性，存在express即零spawn，否则spawnSync带timeout，ETIMEDOUT转超时错误，abort转ABORT_ERR；无效期限零工作。导出该函数供测试，不改变prepareRuntime/resolveWorkspace等路径逻辑。
- webagent-core/scripts/ensure-code-server.js：runNpm(args,cwd,{timeoutMs=180000,signal})同样检查signal/期限，spawnSync带timeout，ETIMEDOUT转超时；ensure({signal})与ensureVscodeDeps({signal})检查signal，分别120秒/180秒超时，失败不吞；abortedError()/checkSignal(signal)固定ABORT_ERR。
- webagent-core/scripts/run-code-oss.js：main在ensure前checkRunning，ensure({signal:controller.signal})传入总控制器；signal传入不等于同步期间能处理新的SIGINT/SIGTERM/IPC取消。ensure抛错落到stop(1,error)，finally仅观察children已登记对象；ensure内部spawnSync不在该列表，不能承诺无遗留。

新增installerPreparation.test.js的7个场景：已有安装零spawn、模拟npm ci超时/参数、预先abort零工作、非法期限零工作、模拟下载超时、预先abort零下载、同步抛错传播（原有行为）；未执行真实npm或下载。本地97/97、Chromium与audit 0均以独立进程退出0确认；文档277/28/111且updated=0，185指纹已同步。代码`6daf576040bc92a36b8f89d582f30dffb8decd54`已推当前固定分支，[CI35651156739](https://github.com/cccjvav/web_agent/actions/runs/35651156739)按精确SHA核实9个job completed/success：Ubuntu Node18/20/22/24、Windows Node20/22/24（含重复取消/stdio）、Windows安装器与真实Chromium。提交前再次确认97/97、Chromium与audit 0、文档零漂移及185指纹；精选195份JS lint仅原有4处清理finally提示。UI、核心权限/工具、原生扩展、暂停探针和冻结原型运行源码零diff；不是全仓审完，不关闭R4/R5/R7/R8。后续证据文档提交仍须核对其自身HEAD。

## 复盘

- 上一轮只改文件所在目录，没有消除额外管理层次；应先核对已有规则，而不是先引入新文件类型。
- 交接是项目管理的用途，不需要独立的第二份状态源。只有章节职责清晰还不够，启动顺序也须保持L0+L1、L2按需。
- 元复盘：现有技能规则已足以承载本次需求，问题在项目执行方式，无需修改或升级技能原文/只读副本。

## 待更新文档

- [x] AGENTS、CONTEXT、agents、文档中心和现行审查入口：统一指向原管理索引和本阶段。
- [x] 旧路线/交接引用、站点入口及文档守卫：改为现有文件，保留全部工作包检查。
- [ ] 全仓逐句审查与剩余模块说明：按上面的工作包和正式清单持续推进，不能由本次结构合并勾选完成。

### 第59组：同步01a0c4b1并复审a68a77e之后的提交（2026-09-21）

用户要求先同步来源并审查后续推送，之后每一轮都先复审上一轮和相邻合同。该规则已写入agents；不因对另一助手能力的评价预判代码好坏，也不凭CI绿灯授信。

- 先复审自身67f4f96整理：原件字节/hash、说明导航、R4/R5未决边界保留，未动运行时。环境HEAD/index旧指针经逐文件核对后mixed reset恢复，不覆盖工作文件；Git换行过滤差异进一步以原始字节排除。来源merge-base正是67f4f96，当前绑定arena/01a0bfa9-web-agent快进9个提交到bbe79854a8b56d0fd096235275db419c3a0db415；暂停/冻结源码无来源diff，不切换或推送来源分支。
- 重点范围a68a77e6fa82e509b3dc8a09ac27c38a402eadfb..bbe7985共6个提交，含2个运行时提交与4个证据/生成提交；逐项范围、精确SHA/CI、复现代码与结果在独立报告第11节。a68本身与F55仅作为相邻依赖局部核对，非本轮全仓认证。
- 来源ffb7589/CI35651611509实际2/9，七个主机任务均有content.js漂移annotation；完整日志下载EOF，不能冒称全部原日志可得。bbe7985只重建生成物，CI35651963406精确SHA九job成功，本地docsSite匹配；不把这次修复外推为取消合同完成。
- 已确认F59-01/02：spawnSync阻塞新取消处理；timeout默认TERM不保证按时返回。Linux真实Node替身150ms期限527ms返回，另一个250ms子进程结束前10ms定时取消未执行。F58七例仅参数/模拟错误/预取消；同步抛错传播本来就存在，bounded未使用。原地纠正文档/当前状态，运行时尚未修复，不删原测试、不加产品期限、不重跑追绿。
- 来源本地全量97/97、两项定向通过，文档277/28/111 updated=0。没有重跑Chromium/audit或真正code-server/Windows窗口；旧CI均独立记录其原SHA，不代签本轮或实机。用户工作区、秘密与参考包未执行。

**下一轮优先顺序（纳入现有工作包，不新建路线）：** 先复审本组同步/证据/生成物，然后用真实子进程补在途取消与忽略TERM的负例；小包改异步准备/受控直接子进程归属及期限观察，覆盖SIGINT/SIGTERM与App IPC、取消后不得进入下一阶段、不可确认退出必须报告。不能新增名称/端口/PID树杀或声称所有后代已退出；保留120/180秒准备配置及既有health/App预算，不靠延时兜绿。根因修复和验证完成前F58只算部分完成；随后再继续R2–R9/逐句审查。探针原分工暂停、R4历史故障与R5实机边界不解除。

本轮最终正文/生成物修订后再次全量97/97，清单277/28/111 updated=0、diff --check通过；只有文档/管理和生成站点变化，无运行时/依赖/测试断言改动。精确交付CI须按本轮提交另验，不借来源绿灯代签。

### 第60组：准备命令异步取消与直接子进程期限（2026-09-22）

先复审上轮80de651（CI35660960673九项通过）：只有证据/管理/生成物变更，F59的同步阻塞与默认TERM非硬返回结论仍成立；确认工作树干净、绑定分支正确，复核ensure/launch/run-code-oss及App IPC/打包调用链。上轮不能直接迁移的复现是同步API专用，保留原版本上下文，不把现在改Promise后旧脚本返回方式当有效新证据。

先在原installerPreparation补真实Node替身：定时取消应拒绝ABORT_ERR，原版Missing expected rejection，完整失败见本轮记录摘要；不运行真实npm或code-server。本组新增installer/preparation.js，用异步spawn持有本次ChildProcess，预取消/非法期限零启动、在途取消/原120或180秒deadline停止；performance截止拒绝迟到exit0，停止仅发SIGKILL到所持直接子进程，额外至多1秒观察，不延长准备工作预算。exit才证明直接子进程退出；未知设置cleanupUnconfirmed/unref/明确提示，不补杀PID/名称/端口/树、不重放，也不保证shell/npm后代退出。

ensure/runNpm/ensureVscodeDeps改Promise，CLI与run-code-oss await并在跨阶段检查取消；外层ensureDependencies同样await，main仅在依赖准备期间注册SIGINT/SIGTERM。内层既有停止控制器现在能在准备期间处理信号及私有IPC stop/disconnect；cleanupUnconfirmed必须覆盖正常停止码为1并保留错误日志。syncExtension/prepareRuntime等同步磁盘步骤、已写入的部分依赖不回滚，不声明整个安装流程可抢占或有总期限。原后端依赖缺失fallback异步npm install仍未加独立deadline，是明确相邻剩余项，不将本组包装成所有启动合同已完成。

回归保留原参数/预取消/非法期限/抛错/安装跳过语义，适配Promise；真实Node验证在途取消零下一阶段，Linux文件握手证明实际忽略TERM，再由期限强制终止并观察exit，Windows仍跑实际期限/退出但不冒称能忽略TERM。替身覆盖未知退出/迟到error/重复取消/注册竞争/单调截止及同步和异步spawn失败；外层两种信号零模式启动，内层四种停止途径零agent/editor、未知非零。原生命周期用例的同步准备断言改为等待一个事件循环轮次，不删15秒/退出/无关进程断言。打包显式白名单及对应断言加入helper，文档主解释登记。

首轮全量96/97，仅documentationLearning因workspaceEntry新增fixture方法未解释失败；改用真实EventEmitter（而非空on/removeListener替身），同时补新helper主解释映射，未放宽守卫。未改暂停探针/冻结运行源码/核心权限或MCP。实际npm安装、Windows桌面/进程后代、R4历史根因、R5/R7/R8边界保持未验。

**下一轮先复审本组：** 核查精确提交CI、Promise调用方、正常/异常/取消与未知结算，尤其Windows shell后代与部分安装边界；然后再处理旧后端依赖fallback的独立期限，不把更多范围混入本轮。不改用户授权的清理边界，不延长预算或重跑追绿。

修订后本地完整97/97，文档278源码/28目录/111排除且updated=0、diff --check通过。新增运行helper的发行断言与逐函数归属已验证；精确提交CI收尾另查，不使用80de651绿灯代签。

F60运行时提交`ce685609d8c517e63acca54d0fc41661518b8532`的[CI35662916656](https://github.com/cccjvav/web_agent/actions/runs/35662916656)已按headSha及逐job状态核实九项completed/success：Ubuntu Node18/20/22/24、Windows Node20/22/24（含新准备测试及既有取消/stdio重跑）、Windows安装器、Chromium。不是用户桌面或真实npm后代验收；后续证据文档提交需另验自身CI。

### 第61组：全面检查报告与修复准备（2026-09-22）

用户要求检查所有类型代码、文档及优化空间，先形成报告再准备修复。询问暂停边界后，用户明确选择三个探针**继续完全暂停**，仅路径登记；并非只读接手，更未授权登录/采集或专项修复。先复审63cbbdc/ce68560的准备原语和相邻fallback、引用CI35663331086精确63cbbdc九job成功，未发现应撤销F60限定修复的证据；原fallback缺deadline保留。本轮不修产品实现，亦不执行参考ZIP或冻结原型。

交付[全仓报告](../../review/COMPREHENSIVE_AUDIT_2026-09-22.md)与[F61逐文件覆盖CSV](../../review/evidence/F61-file-coverage.csv)：以Git真实873文件建账，不按文档反推；暂停118、二进制275等分别分类，55个文件局部人工复核不自动变成整篇通过。所有18份Python均在暂停范围，TS/TSX/JSX跟踪文件为0；217份JS（含冻结17）AST、13份JSON、4份sh、2份SVG解析通过；259份跨语言源码/脚本文本风险扫描，158份允许范围Markdown相对文件链接候选0。C#/PowerShell/CMD/Inno只是文本/边界核对，本地无编译器；984个忽略文件不读取秘密正文，不声称第三方依赖逐行审过。

本地全套97/97，可选计算器6/6，host含dev的npm audit五档均0、docs278/28/111 updated=0。但独立临时目录/回环HTTP/子进程复现F61-01默认/暂存Git diff泄露假敏感标记、02非法UTF-8导致不同原始字节同hash且旧hash写入被接受、03身份网络忽略父取消、04统计损坏文件被下一次ingest覆盖、05同步diff在8000行输入触发2秒测试看门狗；06为已知fallback期限静态缺口。报告保留复现代码与精确结果，不依赖外部临时日志交接。未测试真实账号/MCP/隧道/Windows桌面。

本轮本地浏览器启动缺Chromium；一次安装命令报ECONNRESET/TLS握手前断开，未关闭TLS检查或循环重试，明确阻塞。基线CI浏览器绿不代签本轮浏览器。结构门禁不等于语义正确：GitHub/usage/admin详解已准确承认一些限制；另外review入口和正式清单当前指针遗漏F59/F60，本轮只纠正这类审查导航，源码注释旧S3路径另列后续。

**修复队列调整（仍属R2/R3/R4/R7等既有工作包）：**
1. 下一轮先复核F61报告/夹具和前批交付，将F61-01/02固化正式红测，先修差异敏感旁路与非法编码版本保护；保留git路径/过滤器禁用和文件审批/hash/检查点合同。
2. 单独处理F61-05 diff计算预算，复核新建文件先写后diff的相邻副作用顺序；再处理03 GitHub完整网络期限/取消及06 fallback准备期限，不通过加时或重试掩盖问题。
3. 04 admin坏文件保留/原子发布独立小包，随后再考虑容量/统计schema、telemetry单飞/网络预算；CDN离线可校验资源、构建锁定等是优化建议，不是假装已发生攻击。
4. CSV标记未逐句的源码与文档继续深审；二进制、历史资料和实际平台未验范围不得刷成通过；探针仍暂停。完整逐句文档清单因新报告201→202，新报告初始待逐句，已逐句仍8。

元复审结论：缺陷不是必须新引入才值得修；文档诚实列出限制也不能代替实现完善。每包需要针对性红→绿与旧合同/未知效果验证。本文报告是本轮证据交付，执行优先级只在本阶段维护，不新增并行路线文件。

报告/CSV/导航完成后再次完整97/97；从报告附录实际抽取并执行三段可携带代码，反例结果一致（diff本次2010ms触发同一2秒观察窗）；CSV与63cbbdc的git ls-tree精确匹配873个唯一文件，正式文档202项分布另行重算正确。产品运行源码、依赖锁、现有测试断言及暂停/冻结源码均零diff。
