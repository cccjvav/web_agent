<!-- 定位：阶段10的目标、需求、设计、实现计划、交接约束、验证证据与复盘；由CONTEXT按需导航。 -->

# 阶段10：继续上游借鉴与文档整顿

## 目标

继续完成已授权的剩余施工，并正式开展全仓逐句审查；不将候选、暂停或未实机项目当成已完成。当前焦点与最近验证从[管理索引](../CONTEXT.md)进入。

## 需求

- 用户持续要求完成此前待办、及时推送、逐句对照并整理/更新/退役文档。
- 用户要求交接彻底并入原项目管理，不新增独立路线文件或平行交接入口。
- 探测专项保持暂停，等待外部正式交接；原有失败、授权和用户验收边界不变，见阶段8（F122已删除）。

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
| R2 / 高，按缺陷证据推进 | F54第一批会话pin/全忙拒绝/SID校验已交付；第二批RPC准入/版本/整批ID预检已实施并定向验证，第四批现补资源caller与目录ACL及错误hash指引，第五批已补原生流确认，第六批补窄屏/页签ARIA，F55又补浏览器会话/挑战响应头可读性，第94组（2026-09-28）补事件流WebSocket畸形帧/端口冲突崩溃与慢客户端/半开连接回收，第95组（2026-09-29）补读取缓存按调用者归属、人的查看/保存不算模型读过，第96组（2026-09-29）补人提交的工作流与直接/api/tool/call也不算本机Chat读过、核对执行控制各入口，其余UI/实机项待续修。参考包只借鉴busy pin/整批预检思路，不整体换栈 | [F54报告](../../review/INDEPENDENT_AUDIT_2026-09-20.md)、[SECURITY](../../SECURITY.md)，mcp/server/session/requestLifecycle/resources、OAuth与执行控制；ShunCode不安装/执行，探针专项仍暂停 | 先保证异常准入零副作用、取消/终态归属和现有权限/unknown/不重放；全忙拒绝新会话、pin单次释放；明确版本/预算，保留原文件/审批架构；有真实负载证据才考虑自适应队列 |
| R3 / 高，继续 | 第25/27/31–37与41–43/45–53组持续修复消费链。第53组已补齐所有当前非Probe路由的query门禁、external/workflow显式固定接线、status/diagnostics与定制/会话投影；F54第三批已补新文件patch显式hash与块校验，第五批补原生postNdjson坏流/终态及失败历史；F55补经典流严格完成/预算/取消清理；F56补可选编辑器编排健康期限与直接子进程收尾；F57补App窗口身份绑定与浏览器失败；F58同步准备的取消缺口已由F59纠偏、F60改异步；F62补Git/UTF-8/diff，F63补统计/入口/UI，F64补身份网络、F65补后端fallback独立准备期限；其它消费链按证据另验，不重做已交付链 | [API逐项详解](../../webagent-core/agent-host/src/api/路由逐项详解.md)、routes、apiFiles及已登记消费者；明确排除探针专项 | 每路由核对HTTP与业务结果、请求/响应预算、审批前后复查、deep copy/幂等/取消/unknown；失败不自动重放，不扩大任意命令权限，脱敏凭据不能转绑新连接 |
| R4 / 高，独立追查 | 根因未定位；已复取历史annotations并补阶段诊断首包，等待可解释复现 | 第5节确切失败记录；executor/commandJob/patchEngine/searchWorker与Windows CI | 保留原失败，获得可解释复现或足够诊断证据；有证据才改根因并验证，不以加时限/重复到绿结案 |
| R5 / 用户优先 | 已授权安全隧道残留回收；已交付只读检测、Windows保护记录/稳定句柄终端回收及负例/诊断；本机开始菜单入口已接入，面板/桌面与PTY互操作仍待 | executor/ptyJobs、核心扩展ptyHost/ptyPolicy、computer-use既有实现；不进入暂停的探测整合 | 核对所有者、可观察退出、审批过期、取消、路径/脚本/编译分支；代码与说明修好，实机项继续单列 |
| R6 / 下一项（用户2026-09-25选定：VS Code插件一体化启动返工，[方案](../../docs/development/插件一体化启动返工方案.md)D1–D4按推荐确认；**第一期已通过用户实机验收**（2026-09-25，[验收手册](../../docs/guides/插件一键启动实机验收.md)，[记录](../../review/R6第一期实机验收记录-2026-09-25.md)）；第二期设置页进行中，第1批请求收拢、第2批扩展转发层、第3批“Web Agent 设置”标签页、第4批外部MCP迁入标签页（D4于2026-09-26确认：外部MCP迁入、多模型博弈留网页工作台）已完成，第5批[验收手册](../../docs/guides/插件设置页实机验收.md)已完成；第一次实机验收第6步失败（第87组已修）；续跑1（`7b833a3`）9.3失败（第88组已修）；续跑2（`7230d65`）第2–10步通过、12.1失败（重载提示的pid是启动器而非主机），第89组已修；**续跑3（`fb3f345`，2026-09-28）通过，第二期已通过用户实机验收**（[记录](../../review/R6第二期实机验收记录-2026-09-28.md)）；第11步原生Chat `@webagent`从未注册（清单`isDefault`需提议API），第90组已修；第91组补上第3、4批两个剩余风险（设置页核对主机文件夹、标签页关闭时取消在途stdio启动）；三项待续跑4补验；第一期验收跟进①–④已完成；网页工作台保留） | 候选设计与分项实现 | 第4.2节、上游26类地图；完成明确缺陷修复优先 | 每项先写最小范围、输入/预算/权限/失败、回归与取舍；有收益且不突破授权边界再落地，不把全部候选统一许诺为必做 |
| R7 / 本轮完成，后续随代码持续维护 | 用户2026-09-22更正：确认所有项目.md与最新实现/状态一致，不要求全仓源码逐行认证。逐份处理现行说明/README/管理入口；历史、只读、生成、冻结和暂停分别标界。旧逐句统计保留为历史，不作为本任务完成率 | [文档时效清单](../../review/FULL_REVIEW_INDEX.md)、[唯一规范](../docs/documentation.md)、主指南与对应实现/测试；代码只按文档承诺查证 | 每份纳入.md有时效处置和依据；现行陈旧/矛盾已改，未确认或暂停原因明示；站点生成/结构/链接检查通过，不靠改日期或扩大源码认证凑完成 |
| R8 / 本轮已通过（2026-09-24，9c36c10，见[R8实机验收记录](../../review/R8实机验收记录-2026-09-24.md)）；未执行项待补 | 项目根MCP验收 | 第7节、Windows清单M/W/T/G等；用户接入后核对工具身份 | 逐项有提交、实际环境、动作、退出码/效果与脱敏证据；失败/未执行如实留存，不借CI代签 |
| R9 / 中，部分完成 | 第45组已交付CI顶层`contents: read`与高危生产依赖硬门禁；F55新增默认axe开发门禁；EOL Node矩阵、最小lint（只报错不改风格）、生成物churn与仓库权重仍为候选；**用户2026-09-28选定最小ESLint（方案B：只开找真错误的规则、排除webagent-repro与生成物、先分批修现有报警再进CI）**，第93组已接入并进CI（ubuntu+Node22一项）；EOL Node矩阵已于第118组处理（engines >=22、CI只跑22/24）；生成物churn与仓库权重第118组记录取舍、暂维持现状 | [第45组报告剩余决策](../../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md#6-仍需保留的风险决策)；版本/依赖/发行取舍需项目主人决策 | 每项先写范围与回滚点，不改冻结原型、不做TS重写；CI九项不因新增检查放宽 |
| P / 暂停 | 探测整合、迁移与专项复核 | 第8节，另一助手正式交接前不动 | 交接后先锁版本/权限/接口/数据方案并重排范围，不自行恢复施工 |

##### 4.1 当前路线的证据入口

R1及R3已交付部分以表内范围为准，细节见[阶段10第24–28组](s10-upstream-adoption.md)；不能把早先的CI阻塞提示当作今天的状态。Markdown文档时效核对及旧证据只维护在[审查清单](../../review/FULL_REVIEW_INDEX.md)，发现和处置见[语义台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)。本计划章节维护工作包与结束条件，逐批实现/CI日志保留在下面的历史证据章节。

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

暂停新增入口、采集/分析/插件改造、迁移整合和探测专项复核；保留当前实现及既有回归，不删功能、不跳测试。交接后要求固定SHA/版本、构建与失败证据、来源许可、三宿主矩阵、扩展ID/命令/端口、认证/工作区绑定、采集所有权、审批/取消/幂等、数据迁移/并存/卸载方案。详细门槛见阶段8（F122已删除）。

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

按月归档：2026年9月（第14组至第114组）的批次记录在 [archive/s10-2026-09.md](archive/s10-2026-09.md)。下面只保留10月起的批次。

### 第115组：交接第5项——人保存后模型写入被拒的浏览器测试（会话01a0e8ea，2026-10-01）

**测试：** workbench.browser在真实Chromium里走完：MCP先read_files记下acceptance.txt的hash → 人在工作台编辑并Ctrl+S保存 → MCP用旧hash调用write_file → 断言被拒、磁盘保留人的保存、Bridge日志出现可读原因。

**写测试时发现的问题：** 模型带了expectedHash（只是已过时），得到的却是E_BAD_ARGS“Overwrite blocked…pass confirm_overwrite=true”。这句提示不说文件已被人改过，反而引导模型加确认强行覆盖。fileOps.writeFileBody把“显式expectedHash不一致→E_STALE_FILE”挪到覆盖确认检查之前；带confirm_overwrite时本来就是这个结果，只是没带时顺序反了。apiFiles新增一段锁定该顺序（用旧代码运行确认会失败）。

**界面：** Bridge日志失败卡片原来只写“failed”。toolTrace早已在工具抛错时记录errorCode，现在卡片追加“错误 代码：中文说明”（bridge.js的ERROR_HINTS，覆盖E_STALE_FILE、E_BAD_ARGS、E_SESSION_REQUIRED、E_FORBIDDEN、E_CANCELLED，其余只显示代码）。

**验证：** 本地@sparticuz/chromium跑workbench.browser全程通过；npm test、lint；CI见提交。

**范围：** 本机Chat的写入失败显示在Chat流里，不在本条测试内。

### 第116组：交接第6项——waitHealth复查与启动配对（会话01a0e8ea，2026-10-01）

**复查原计划两点（F56遗留）：** 独立审计2026-09-20第289行提出的“接受连接但不回包”和“启动失败时子进程收尾”，第56组已经改写并有真实HTTP/真实子进程测试（`health deadline closes an accepted silent HTTP connection`、`startup authentication failure reaps the real child before returning`等）。逐条读了现行`waitHealth`与`main`，这两点成立，未发现回退。

**新发现：** waitHealth只看HTTP 200。若MCP端口上还留着别的Web Agent主机（上次没关干净、或另一个工作区的主机），它会立刻回200，launcher就当作就绪，接着启动code-server；随后自己的子进程才因EADDRINUSE退出，用户看到的是含糊的“agent-host 已退出”，期间编辑器可能连到错误的主机/工作区。

**修复：** run-code-oss每次启动生成随机`launchId`，经环境变量`WEBAGENT_LAUNCH_ID`交给agent-host；`/health`在该变量为32位小写十六进制时原样回显；waitHealth带launchId时读完响应体（≤4096字符）并核对，不一致按未就绪重试。旧主机因此不能冒充，自己的子进程退出后由已有的exit处理以真实原因停止启动。不传launchId时行为不变（其他调用方与旧测试）。

**测试：** codeServerLifecycle新增真实回环HTTP场景（旧主机只回`{ok:true}`→ETIMEDOUT；别的ID/无ID重试到正确ID才就绪），假传输自动回包改为回显spawn拿到的launchId；httpSmoke核对`/health`回显。

**限制：** launchId不是凭据，本机其他进程读到环境变量也能回显；它只解决“残留主机误当就绪”，不做身份认证。

### 第117组：交接第9项——ptyHost运行中node-pty错误（会话01a0e8ea，2026-10-01）

**核实：** 读了node-pty上游`src/unixTerminal.ts`与`src/windowsTerminal.ts`：两者都给内部socket挂error处理，EAGAIN/EIO静默，其余错误在`this.listeners('error').length < 2`时`throw err`。ptyHost的spawnNodePty只注册了onData/onExit，没有error监听，所以运行中出现非EIO的读错误（如ENXIO、EBADF）会在socket事件里抛出，成为扩展宿主的未捕获异常；该任务也只能等超时。写路径（CustomWriteStream）出错只console.error，不抛；ptyHost所有kill都不带信号（Windows带信号会在延迟执行里抛），resize未用。

**修复：** spawn后注册error监听：记第一条原因、kill一次；onExit最终回报status:'error'、ok:false、outputCaptured:false，原因写在`message`。最初写成`error`字段，核对主机路由时发现PTY回报按PTY_REPORT_FIELDS白名单校验，多字段会让整条最终回报被400拒绝，已改用白名单内的message。扩展副本同步。

**测试：** ptyLifecycle用EventEmitter复刻node-pty的重抛语义，连发两次ENXIO：不抛、只kill一次、最终回报如上。用修复前的ptyHost运行该段失败（“read ENXIO”）。

**限制：** 没有在真实VS Code里制造pty读错误；依据是上游源码与复刻语义的单元测试。

### 第118组：R9剩余项——停止维护的Node移出与生成物取舍（会话01a0e8ea，2026-10-01）

**决策方式：** R9剩余三项在路线表里写明需项目主人决策。我把选项列给用户（Node：维持/去18/去18和20；生成物：维持/不再提交content.js/只写方案），用户跳过选择并回复“继续”，按此前“接手并自行推进”的授权采用我推荐的选项。以后如要恢复旧版本支持，回滚点就是本组提交。

**Node：** Node 18于2025-04、Node 20于2026-04停止维护。agent-host的`engines`由`>=18`改为`>=22`（package-lock根项同步，oauth.test的断言同步），test.yml矩阵改为`[22, 24]`、去掉Ubuntu Node18附加任务；CI由九项变为六项（主机四项、安装器、浏览器），此后“全绿”按六项计。用户自带Node（安装器只查PATH、不下载），所以主机在低于22时只打印中文升级提示、照常启动，不让现有Node 20环境突然起不来。代码里为Node 18写的兼容处理（如公网出站的webBody）不删，留待需要时再清理。

**生成物churn与仓库权重：** `docs-site/content.js`（约5.7MB）、manifest、source-index每次改文档都重新生成并提交，仓库持续变大，CI也常因忘记重新生成而全红。改为安装/启动时生成需要改安装器payload、主机文档路由和CI检查，回归面大，而眼下没有使用者被它卡住，**暂维持现状**。若以后要做：①安装器打包前与`run-code-oss`启动前调用build.js生成；②CI改为生成后比对而非要求提交；③从Git移除三份生成物并在.gitignore登记；④文档站路由在文件缺失时给出提示。仓库权重的大头还有已随仓库分发的Monaco（用户要求保持现状）。

**文档：** workflows README、平台启动与CI详解（任务数、矩阵、lint说明）、测试说明、Conda环境说明、agents.md、入口详解同步。

### 第119组：复审第114–118组（会话01a0e8ea，2026-10-01）

用户要求再审一遍。逐个读了F114–F118的源码与测试改动（20d1f71~4..e29b19a），对每个怀疑点先写测试、再用修复前代码确认是否真失败。

**确认并修复：**
1. **F116的`WEBAGENT_LAUNCH_ID`漏进命令环境**：lifeline.js明确规定只给本主机用的启动变量要在启动时取出，避免agent运行的命令（run_command、start_command、stdio MCP、测试里再起的主机）继承——这条规则正是此前真实泄漏后定的。F116没把新变量加进`LAUNCH_ONLY_ENV`。已加入，`/health`改从launchEnv读；hostLaunch断言更新（旧代码下失败）。
2. **F114客户端名清洗不全**：只去了C0控制字符，U+202E等双向控制与零宽字符仍保留，远程客户端可用它在审批列表里打乱自己标签的显示（“远程会话（”前缀仍在最前，无法冒充成“你自己”，但可混淆后面的kind/status）。补去C1、U+200B–U+200F、U+202A–U+202E、U+2060–U+2069、U+FEFF；approvedOperations加入这些字符（旧代码下失败）。
3. **F118漏改两句**：Conda环境说明第112行仍写“包声明的`>=18`”，平台启动与CI详解第57行仍写“engines node>=18”。已改。

**怀疑但查证不成立：** waitHealth在200响应体中途断开时会不会干等到期限——写了真实HTTP测试，修复前代码同样立即重试：Node对中途断开的响应会发出`error`（aborted），F116已有的`res.on('error')`就会重试。撤回了为此加的代码，只保留测试作为回归。

**其余复核无问题：** submitter只在本机操作路由输出（submit去重分支、operation_result、eventBus/executionControl的list()都不带）；F115调序只影响“带了不一致expectedHash”的分支，PUT保存的409映射不变；F117在Windows未就绪前注册的监听挂在agent.outSocket上，同样生效；F118没有新增依赖Node 22的代码，低版本只提示。

### 第120组：再审第119组（会话01a0e8ea，2026-10-01）

用户要求再审一遍。第119组源码改动只有三处（lifeline列表、/health读launchEnv、客户端名清洗），逐行复读并扩查同类显示点。

**发现并修复：** 客户端名清洗后用`slice(0, 80)`截断，按UTF-16单元切，第80个位置若是emoji会留下孤立的高位代理项，标签显示为乱码。复现：79个a加一个emoji，标签里出现`\ud83d`。改为`Array.from(client).slice(0, 80)`按码点截；approvedOperations加这条（旧代码失败、新代码通过）。

**扩查不成立：** 第119组只修了审批标签的双向/零宽字符，查了其他显示远程自报名称的地方：工作台与扩展不显示MCP的clientInfo；OAuth注册的client_name只存储并回给注册它的客户端，不显示给用户，没有同类问题。

**经验：** 在[experience](../docs/experience.md)补一条“新增一项时回头看同类已有的规矩”，记F116漏登记启动变量、外部文本清洗分三次才补齐、复审先跑红再修。

### 第121组：主分支审查建议——安装器Node提示与两份历史文档指纹（会话01a0e8ea，2026-10-01）

用户转来主分支两条建议，均核实属实。

1. **安装器提示**：`installer/webagent.iss`第110行未检测到Node时提示“Node.js（>=18）”，第118组漏改。改为“>=22……请先装 Node.js 22 或更高版本的 LTS”。全仓.cmd/.ps1/.iss/.sh/.bat再搜，只有这一处版本检查文字。核对只改动这一行、文件编码与换行不变。要等下次重新打包安装器才生效。
2. **两份历史保留文档指纹不符**：第111组写“历史保留的两份此时已不在失配名单里”是错的，已在原句后更正。原因：当时的指纹脚本列失配时跳过“历史保留”行。两份在完整历史里找到与索引指纹相同的版本后，只复读其后的改动：
   - `review/COMPREHENSIVE_AUDIT_2026-09-22.md`（指纹对应bd0d060）：之后只有F106改了一行，把指向已删除`auth/github.js`的链接换成“github.js（已于F106移除）”，修死链，发现内容本身未动。
   - `review/FULL_REVIEW_2026-09-29.md`（指纹对应45e576f，即后来撤回的那次提交）：之后F104重做至F109在处置列和第8节追加进度。逐条对照现行源码：detectPosixShell顺序（/bin/bash→/usr/bin/bash→合格SHELL→/bin/sh→/usr/bin/sh）、`activeChatCount`/`MAX_ACTIVE_CHAT = 2`/429与handleChatStream、envSummary、D-14格式合法的错误verifier作废授权码、D-15每来源10个空闲注册超出429、D-16 OAuth调用者只见自己的记录且工作区只给目录名、Monaco 0.52.2随仓库分发、探针撤回后主机仍直接require两个校验器——均与源码一致。
   两行索引补说明后刷新指纹。指纹脚本改为列失配时也报历史保留行（单独标注），不再漏看。

### 第122组：按用户决定整体删除探针（会话01a0e8ea，2026-10-01）

用户决定：探针已经探测不出后台模型、没有效果，从项目里全部删除（此前“探针暂停、未经授权不得改动”的约定随之结束，原阶段8结束）。

**删除：** `arena-model-probe/`、`arena-trace-inspector/`、`webagent-core/probe-extension/`三个目录；主机端`utils/probeBridge.js`、`/api/probe/*`五条路由、`/probe-link`传输入口、`probe_links`/`probe_report`/`probe_request`三个MCP工具（对外工具39→36，含隐藏的send_command_input 40→37）及其权限/效果表项；operatorQueue里`probe-browser`任务与“浏览器探针”提交者分支；随之不再使用的`operationApi`包装；11个专项测试（probe*×10、traceIntegration）、workbench.browser里的探针HUD用例、CI windows-installer的两个Python打包步骤、ESLint排除与probeTransport专用配置、安装白名单中的探针文件；探针专项文档6份（根目录3份、阶段8、双探针时间线、早期接入归档）。

**保留：** “连接核对”（`/api/connection-checks`、`confirm_connection`、工作台面板、扩展转发）是独立功能，不是探针；它的用户脚本从探针目录迁到`webagent-core/userscripts/webagent-connection.user.js`（内容未改），新建目录README，ESLint按浏览器脚本处理。`.gitignore`里对旧探针原始抓包的忽略规则保留，防止老checkout里的残留（可能含凭据）被误提交。`/providers/probe`（模型发现）和扩展`probeStatus`（主机健康检查）只是同名，与探针无关。

**文档：** 现行说明（README、使用指南、docs/development与docs/guides相关页、CONTEXT、路由/受控工具/诊断/浏览器测试详解、扩展详解及其副本）改为现状；历史记录里提到探针的文字按历史保留，指向已删文件的链接改为“（F122已删除）”。审查索引删去对应15行（14份md+1份LICENSE）、新增用户脚本README一行；合计行原写210，按表格实际行数重算为208（之前删除的文档没从合计减掉），本组后为195。被改文档逐份复读改动处后刷新指纹，失配0。

**验证：** 本地109/109测试文件通过（删去11个），lint通过；安装白名单测试改为断言探针目录不进安装包、用户脚本进安装包。

**第122组补充：CONTEXT过时说法更正。** 用户要求深度核对“还有什么没完成”时发现：CONTEXT仍写“F61-05/06尚未独立复核”（实际F62-04、F65已修）、验证边界停在F71的“104/104、Windows 20/22/24”、固定分支仍写01a0d084、“R7逐句文档仍开放”（工作包表R7已是“本轮完成”），R4条目还粘在上一条末尾没换行。已逐条改为现状，历史说法保留并注明出处。

### 第123组：R5启动只读残留提醒与截图回传收紧（会话01a0e8ea，2026-10-01）

用户同意R5只读提醒方案（不加面板杀进程按钮），并同意先做优化①。

- **R5提醒。** 新增`src/tunnel/residueNotice.js`：MCP端口开始监听后执行一次`tunnelRegistry.snapshot()`，只统计`orphan-candidate`记录。结果经`/api/status.tunnelResidue`下发；工作台显示`#tunnel-residue-banner`横幅，扩展对同一宿主URL弹一次警告（扫描进行中时最多重试6次）。扫描失败或不完整只写控制台，不显示横幅。模块不导出任何回收入口，回收仍走开始菜单“隧道残留回收（需确认）”。回归测试：`tests/tunnelResidueNotice.test.js`。
- **优化①。** `computerUse.findShotCandidates`以前会把任意命令stdout里出现的图片路径当作截图读取并回传给模型。现在只认snap/mark命令（可带`.ps1`），读取其`-Out`参数或snap输出的`META {"file":...}`。chatVision增加反例测试：用旧代码运行时，这些反例确实失败。
- 优化②（URL里的密钥）等验收时确认客户端支持情况后再定；③为可选项；④⑤暂不做。

### 第124组：MCP实机验收与Windows截图路径大小写修复（会话01a0e8ea，2026-10-05）

用户提供本机Quick Tunnel MCP地址做验收。沙箱出网按域名拦截（trycloudflare、example.com均在TLS握手被重置，只有GitHub可达），GET只能读到状态。用户在仓库添加`MCP_URL` Secret后，用临时工作流`mcp-acceptance-temp.yml`在GitHub Actions上中转运行验收脚本，结果以annotation取回（日志下载在沙箱被拦）。前两次因托管runner未分配而没跑起来，改用ubuntu-26.04标签后正常执行。临时工作流已在本组删除。

- **结果：** 21项通过20项。初始化与会话、说明8204字、工具36个且无probe、资源8个、ping、workspace_info（`c:\Users\Peter\web_agent`）、createOnly、外部改动后盲写被拒、read_files带hash、run_command（Node v24.20.0）、裸图片路径不附图（证明本机已运行F123）、远程危险命令被拒、工作区外路径被拒、ASK锁写、错误密钥401、`/api/status`经隧道404、清理，都正常。
- **失败项：** `snap -Out <工作区内路径>`没有附图。原因是computerUse的`inside()`区分大小写，而VS Code传入的工作区盘符是小写`c:`，snap与path.resolve得到的是大写`C:`，Windows上工作区内的截图全部被拒。这是F90之前就存在的问题，文档里也写过“不单独做大小写归一”，但此前没有在真实Windows上验证过。F124改为win32下大小写不敏感，并补充了chatVision断言。
- **待办：** 用户更新并重启主机后，重跑验收中的截图一项。
- **F124b更正：** a8c449e在Windows CI上chatVision失败。原因是非Windows分支用了`path.sep`：测试本身跑在Windows上时它是`\`，导致POSIX断言`inside('/work/a.png','/work','linux')`失败。本地Linux发现不了这个问题。现改为非Windows固定使用`/`，并在本地模拟`path.sep='\'`验证通过。同一次CI的其余job是托管runner未分配而取消，并非测试失败。
- **F124c复验（2026-10-06）：** 用户更新Secret后重跑验收，仍是20/21，但workspace_info显示主机仍是同一实例（startedAt 2026-10-05T19:37:00Z，与上次相同）：本机checkout已是a4141a1，主机进程没有重启，仍在运行旧代码。于是经MCP在用户的真实Windows上单独加载磁盘上的新computerUse.js：工作区传小写`c:\Users\Peter\web_agent`，截图在`C:\...\.webagent-acceptance\v.png`。`resolveShotPath`接收了该截图，工作区外的`C:\Windows\x.png`返回null，findShotCandidates从`snap -Out`识别出该路径，临时文件已自清理。修复逻辑已在真机确认；“主机返回image”这一端到端项仍需在主机重启后补跑。临时工作流已删除。
- **F124d：** 695189c的CI中4个agent-host job在`npm audit --omit=dev --audit-level=high`失败，原因是新公布的proxy-addr严重漏洞（GHSA-jqcg-44mw-7w3h，IPv4映射IPv6的trust子网判断可被伪造）。主机没有开启trust proxy（见OAuth/会话文档），不受实际影响，但仍按审计门禁把锁文件中的proxy-addr从2.0.7升到2.0.8，锁文件里只有这一项变化。
- **F124e验收完成（2026-10-08）：** 用户重启主机（新实例1f6f5ee4，startedAt 2026-10-08T13:32:37Z，本机代码2eb7396）并更新Secret后重跑全套验收，结果21/21通过，其中`snap -Out`端到端返回image/png。临时工作流已删除。用户收尾事项：停隧道、重置Bridge Secret、删除仓库的MCP_URL Secret。

### 第125组：删除webagent-repro、/health公网口径、收尾遗留（会话01a0e8ea，2026-10-08）

- **删除`webagent-repro/`（用户决定）。** 它是第一代Bridge原型，已冻结，README注明“不要运行”，现行产品不引用它，CI也不跑它。目录整体删除；eslint忽略项、文档清单排除项、docs-site导航条目和安装包测试里针对它的断言一并移除。现行文档中的说明行已删除或改写，指向它的链接改为“（F125已删除）”。review/与阶段记录里的历史文字照旧保留。删除后，它锁文件里有漏洞的proxy-addr也随之消失。
- **`/health`公网口径。** 验收时发现`/health`经隧道可访问，与启动横幅“公网只收/mcp”不符。决定保留`/health`对公网开放：它只返回产品名和版本，可以在不带密钥的情况下确认隧道是否通。但启动配对ID`launchId`只对本机控制面（`isLocalControlPlane`）返回，经隧道或任何带转发头的请求一律不带。启动横幅、SECURITY、入口详解同步改为“公网只收/mcp与/health”。httpSmoke新增断言，旧代码运行时该断言失败。
- **遗留文字。** 路由详解里operations提交者类型还列着“浏览器探针”，代码中早已只剩三类，已更正。
- **优化②（密钥在URL里）的结论：保持现状。** 实机验收证实用户所用的Arena客户端只能填一个URL，路径密钥是它唯一可用的方式。已有的防护（timingSafeEqual、错误密钥401、带转发头的请求拒绝访问本机控制面、轮换入口）继续有效。改为只用请求头会让这个客户端连不上，因此不改；安全文档原有“URL当密码保管、用后停隧道并轮换”的说法保留。

## 复盘

- 上一轮只改文件所在目录，没有消除额外管理层次；应先核对已有规则，而不是先引入新文件类型。
- 交接是项目管理的用途，不需要独立的第二份状态源。只有章节职责清晰还不够，启动顺序也须保持L0+L1、L2按需。
- 元复盘：现有技能规则已足以承载本次需求，问题在项目执行方式，无需修改或升级技能原文/只读副本。

## 待更新文档

- [x] AGENTS、CONTEXT、agents、文档中心和现行审查入口：统一指向原管理索引和本阶段。
- [x] 旧路线/交接引用、站点入口及文档守卫：改为现有文件，保留全部工作包检查。
- [ ] 全仓逐句审查与剩余模块说明：按上面的工作包和正式清单持续推进，不能由本次结构合并勾选完成。

### 第126组：阶段10记录按月归档（会话01a0e8ea，2026-10-08）

用户提出的优化③：本文件已达约485KB，CONTEXT也顶到80行上限。处理方式是把2026年9月的批次记录（第14组至第114组，共147个记录块）逐字搬到[archive/s10-2026-09.md](archive/s10-2026-09.md)。本文件保留目标、需求、设计、当前工作包与交接约束（R0–R8路线表、完成标准等）、复盘、待更新文档，以及10月起的批次记录，体积降到约70KB。

- 用脚本按标题末尾的日期判断月份。旧文件的1419个非空行全部能在两个新文件中找到，没有丢失。
- 全仓指向已搬走章节的50个锚点链接，用`docs-site/anchors.js`的同一套锚点规则改指归档文件，链接测试全部通过。
- 以后每到月底，把当月已结束的批次记录搬进`archive/s10-YYYY-MM.md`，主文件只留当前状态和当月记录。

### 第127组：优化④⑤的决定，删除computer-use测试截图（会话01a0e8ea，2026-10-08）

- **④ 仓库体积，先核对成因。** `.git`约71MB。content.js和manifest的48个历史版本经git增量压缩后合计只占约3.6MB，并不是主要来源。主要来源是`computer-use/shots/`下244张玩“羊了个羊”的computer-use测试截图（约31MB），其次是历史上提交后又删除的code-server发行文件（约14MB），以及review/shuncode-ui的界面截图（约12MB）。
- **用户选择：** 删除这244张截图，把`computer-use/shots/`加入.gitignore；content.js维持现状，不改写git历史。截图脚本在运行时会重新生成输出目录（capture.cs/mark.cs会自己建目录），代码和文档都不引用具体的截图文件。新克隆的工作区小约31MB，但`.git`历史里仍保留这些截图，体积不会立即下降。
- **⑤ 发布签名与自带Node：** 用户决定暂不做，等需要分发给别人时再说。签名需要用户以本人或公司身份购买代码签名证书，助手无法代办。

