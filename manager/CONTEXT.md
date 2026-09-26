<!-- 定位：项目管理L1索引；只记当前摘要，计划/交接和逐批历史由既有阶段承载。 -->

# Web Agent · 项目管理索引

接手先读本索引和[项目约定](agents.md)，再按需读[阶段10的工作包与交接](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另建路线图或根交接文件。

## 当前状态
- **F82（2026-09-26，本会话）：** R6第二期第3批：“Web Agent 设置”编辑器标签页（侧栏齿轮/命令“Web Agent: 打开设置”）。整页加载网页工作台自己的index.html、入口换成settings-panel.js，只显示设置弹层（与计划的“提取片段”不同，理由见方案第9节）；严格CSP，请求经第2批转发层，确认框/剪贴板由VS Code代答（webview里原生confirm会静默返回false）；六类设置一次开放，D4范围与仅限工作台的控件隐藏。网页版行为不变。单元30、浏览器9、真实activate 3种变异全红；自查修正读取失败后无法重试、侧栏提示过于保守两处，并发现“挂起的测试以退出码0被当成通过”的隐患（三个测试已加守卫，其余登记延后复审）。改插件，需重装；实机并入第4批手册。详见[第82组](stages/s10-upstream-adoption.md#第82组r6第二期第3批web-agent-设置标签页2026-09-26)。
- **F81（2026-09-26，本会话）：** 验收反馈跟进（用户同意先做两项）：侧栏按钮加禁用/处理中样式，点击立即显示“启动中…”等并在卡片结果行回报结果（扩展以actionDone应答每次点击，hostStart按实际状态判定，stopHost返回结果）；原生与侧栏Chat的失败工具显示原因。新增sidebarFeedback测试，18种变异全红（自查修正启动中【停止】被禁用的回退）。改插件，需重装；实机确认并入第二期第4批手册。详见[第81组](stages/s10-upstream-adoption.md#第81组验收反馈跟进侧栏按钮反馈与chat失败原因2026-09-26)。
- **F80（2026-09-26，本会话）：** R6第一期用户Windows实机验收通过（`506cd0a`），记录由根`r6result.md`按R8先例归档到`review/`（未登记曾使`6503ab9`的CI红）。手册三处措辞修订（CMD-A须独立cmd窗口、地址在MCP卡片、重载后看不到`[lifeline]`）。复查4.7：用户看到的是code模式输出，内置循环`npm test`受60秒上限必然超时，插件Chat丢失工具失败原因。待用户决定产品跟进（按钮反馈、失败原因等）后再做第二期第3批。详见[第80组](stages/s10-upstream-adoption.md#第80组r6第一期实机验收通过与手册修订2026-09-26)。
- **F79（2026-09-25，本会话）：** R6第二期第2批：扩展进程转发层`extension/apiRelay.js`（默认拒绝白名单，按D4不含外部MCP/多模型）与webview端`workbench/js/vscodeRelay.js`（fetch语义），`requestJson`加可选rawBody/timeoutMs/signal；真实主机端到端通过，尚未接入面板。详见[第79组](stages/s10-upstream-adoption.md#第79组r6第二期第2批设置页请求转发层2026-09-25)。
- **F78（2026-09-25，本会话）：** 用户同意R6第一期验收与第二期并行。第二期第1批：新增`workbench/js/api.js`，工作台六个模块33处`fetch`收拢为`apiFetch`（默认即fetch，行为不变），为插件设置页经扩展进程转发做准备；插件未改动。计划见[方案第9节](../docs/development/插件一体化启动返工方案.md#9-第二期实施记录2026-09-25起)，详见[第78组](stages/s10-upstream-adoption.md#第78组r6第二期第1批网页工作台请求收拢2026-09-25)。
- **F77（2026-09-25，本会话）：** 审计余下范围完成（延后清单第1行已关闭）：用户自行运行改写Host的代理（`ngrok --host-header=rewrite`等）时公网请求被当成本机控制面、免密钥调用整个`/api`（高影响、条件触发），现以转发头识别；`find_files`的glob在主线程指数回溯（12个`**/`约103秒冻结主机）改为线性动态规划；无会话调用者键退化（低危）已修；其余模块未发现问题。详见[第77组](stages/s10-upstream-adoption.md#第77组审计余下范围find_files回溯本机控制面误判无会话调用者键2026-09-25)。
- **F76（2026-09-25，本会话）：** 开头复审F75补两处漏改（MCP资源与启动日志仍按OAuth可用描述），查明两道“未单独抓到”的防线是冗余防线并锁住可观察行为；处理第74组三个非OAuth低危项：跨站GET按`Sec-Fetch-Site`拒绝、Windows保留设备名拒绝、`.webagentignore`列入内置敏感模式。Windows分支只由CI验证。详见[第76组](stages/s10-upstream-adoption.md#第76组f75开头复审与第74组三个低危项2026-09-25)。
- **F75 OAuth默认关闭（2026-09-25，本会话）：** 用户选方案B：`bridge.oauthEnabled`缺省false，关闭时OAuth全部路由404、令牌失效、401不再引导OAuth，URL密钥（Arena）不受影响；工作台BRIDGE区可开关。复审修正一处自己引入的回归（config.json损坏时URL密钥变500）。复审可延后但须登记到[延后复审清单](stages/s10-upstream-adoption.md#延后复审清单)。详见[第75组](stages/s10-upstream-adoption.md#第75组oauth配对改为默认关闭2026-09-25)。
- **F74 安全审计（2026-09-25，本会话）：** 用户要求每轮交付前自我复审（已写入agents.md）并按判断审计早期实现。审远程面（MCP认证、OAuth、权限门控、文件工具边界）与本机`/api`防护，修两处中等问题：Windows 8.3短名可绕过敏感文件规则（Windows CI基线`27511d7`证实，`f8ffd03`修复）；改名`.webagent`等祖先目录可让带目录的规则失效。均在关闭Execute时才是真实越权（默认全开时shell本可读）。低危记录不修与未审范围见[第74组](stages/s10-upstream-adoption.md#第74组远程暴露面与本机api的安全审计2026-09-25)。
- **F73 / R6第一期（本会话）：** 插件一键启动主机：侧栏“主机”卡片【启动】后台运行`launch.js host <文件夹>`（不开3000），先接管同一文件夹已有主机（run-webagent.cmd启动的不会被插件关闭）；stdin生命线＋父PID轮询让主机随VS Code退出并先停隧道；`host.json`记录仓库与提交（修R8偏差c）。新增hostLaunch真实主机测试，本地113/113。自查修正5处未提交缺陷（探测字段、取消误判、早期停止无效、未await、静默换端口）。**用户追问后第二轮完整复审**又修正：启动变量（生命线与SKIP_WORKBENCH）泄漏给Agent命令（严重；修后经插件主机start_command跑整套测试113/113）、测试失败挂起、测试假主机被外部强杀后成孤儿、卡片与连接不一致、换文件夹产生孤儿主机、手册一处与代码不符。待用户实机；残余风险见[第73组](stages/s10-upstream-adoption.md#第73组r6第一期插件一键启动主机2026-09-25会话01a0d084)。
- **F71（本会话`arena/01a0d084-web-agent`，起点4a868ae=01a0ce8d的F70末提交）：** 用户确认顺序：①修无会话调用者合并 ②用户用Arena实机验收第七批与本批（R8）③新规范2026-07-28按需做成新旧两代并存。①已修：无会话远程调用的callerKey由`名称@req.ip`改为追加由已验证凭据派生的盐化HMAC标签（session.sessionKey），经隧道同为127.0.0.1的URL密钥与各OAuth客户端不再互读命令输出/get_logs；同一凭据的多个对话仍合并（须initialize区分）。新增mcpCallerIsolation基线红，本地110/110，`b9522be`的CI35934665823九job全绿。详见[阶段10第71组](stages/s10-upstream-adoption.md#第71组接手01a0ce8d无会话调用者按凭据区分2026-09-24会话01a0d084)。第二批首次审查VS Code扩展：agentHostUrl限本机根地址（此前任意URL可收Chat正文/工作区路径并下发PTY任务）、`[::1]`可连、“同类都允许”仅限裸程序名（此前批准一个C:\\程序即放行全部C:\\程序）、Windows PTY补与executor同一退出合同（此前-File恒0）。新增extensionHostSafety基线红。自查纠正第一批改写“历史保留”的s6与漏刷FULL_REVIEW_INDEX指纹。**F72（严重）**：共享危险命令检测器把换行当空格，`echo hi`＋换行＋`rm -rf x`在远端MCP实测照样执行（删目录）；现按行/括号切分、剥shell保留字、续行三读法取并集。admin-host令牌0600创建、5xx不再把数据路径给共用令牌的客户端。详见[第72组](stages/s10-upstream-adoption.md#第72组admin-host首次审查与共享危险命令检测器的换行绕过2026-09-24会话01a0d084)。
- **F70（本会话`arena/01a0ce8d-web-agent`，基线26a167e=01a0c925）进行中：** 基线CI35850879210为红（上传的第三方复审报告未登记进FULL_REVIEW_INDEX），已登记为历史保留（202份）。第三方报告逐条在26a167e复现后分拣：P1-1 apply_patch裸正文整文件覆盖、P1-5危险命令旁路（90条矩阵基线实测漏69条）、P1-6启动改写用户根.gitignore、§5.4-1 Windows cmdlet失败退0、§5.4-3文档旧错误码、§5.4-7尾窗切断代理对**属实并已修**；§5.4-2“丢失argv字节预算”为**假阳性**（9766c6c已恢复）。另发现并修复SEARCH/REPLACE分隔符把`# ====`横幅当分隔、静默写坏文件的独立缺陷。并行分支01a0cdcf按用户要求不参考。第一批`50fc5ae`的CI35881884224九job全绿（含Windows三版本，退出码合同已真机验证）。第二批修主机退出留下孤儿命令（真实复现）、权限逐工具读盘、状态轮询同步spawn、MCP虚报listChanged/logging（CI35883433324九job全绿）。第三批UI：160%缩放下标题/状态栏裁切、32个控件不随缩放、25处11px中文、文件树静默截断、目录无序、版本元数据与Ask/Plan措辞（首推CI浏览器因CI字体下菜单折行失败，11dee04修复后九job全绿）。第四批：Windows输出代码页（仅CI可验）、响应安全头、会话key不读转发头、命令详解旧退出码描述纠偏。其余P1-3/P1-4/P2/P3待后续批次，清单在阶段10第70组末尾。 第五批（接手复审后）：推理模型（o系列/gpt-5）因请求带temperature每次400→改发reasoning_effort；统计账本满10000行后所有上报永久500→整日轮出最旧日期；五个原子写入者清理失败会顶替真实写入错误（ENOSPC变EPERM）→共享removeScratch；本地多模型合并丢弃分支原文→并入总结；扩展`*`激活改onStartupFinished；欢迎页emoji在无emoji字体环境显示空框→内联SVG，工作区文件列表改为README/清单优先+最近修改。第五批`bd8c519`在令牌过期中断后补推，CI35908981268九job全绿（含Windows三版本）。第六批（复审第五批）：gpt-5.4+/gpt-6在chat/completions上拒绝“工具+非none的reasoning_effort”，第五批对这些型号每次仍400，且gpt-6未被识别→带工具时发none并在status说明思考强度不生效（带工具推理需/v1/responses，未做）。`09e656d`的CI35913876271九job全绿。第七批MCP bridge专项：用官方SDK 1.30.1/2.1.0客户端与官方一致性套件对真实主机复核，修ping非空结果（SDK的ping抛错）、未知方法误回404（表示会话失效）、39个工具无annotations（ChatGPT开发者模式对每次读取都要确认）、HTML错误页泄露路径与调用栈（认证前可触发）、虚报旧版HTTP+SSE（旧客户端永远等待）、远程run 60秒与SDK超时同值、start被夹60秒、输出截断不可见；无状态新规范2026-07-28未适配（双代SDK可回退），实机验收仍待R8。`1ae9975`的CI35927907136九job全绿。新规范适配已评估未实施：当前不必须（Arena已实测可连、官方SDK默认旧代），推荐双代分流约2–3批，见阶段10。
- **F62独立复审已交付3批（2f6e7ab起，提交c7acac4/66f5dc7＋UI批）：** 不复述F61报告，独立重新取证后修复：①不带路径的git diff改为逐路径套用与显式diff相同的敏感规则且限定工作区子树；②读取改严格UTF-8，非法字节抛`E_ENCODING`，不再出现不同字节同hash导致过期写入被接受；③差异渲染加时间/编辑距离预算并先渲染后落盘；④admin坏存储fail-closed且原子发布；⑤GitHub身份与遥测的裸fetch统一走`fetchText`（超时+字节上限），readCache停止空转重写整表；⑥104处硬编码px字号改rem字阶并新增A-/A+字号控件；⑦命令输出改StringDecoder，修掉跨管道分块把中文打成U+FFFD（逐字节输出"项目已完成"实测返回15个替换字符，模型会当真实结果用）；⑧危险命令检测新增argv包装器剥壳，`sudo rm -rf /`此前**未被识别**；⑨与并行分支01a0c932交叉验证，发现**自己**的严格解码用错`ignoreBOM`会静默删除文件BOM（自测因`endsWith`断言写法而漏过），已按对方方案修正；⑩`spentRefresh`重放墓碑无容量上限（推算109MB），加5000上限并淘汰最旧；⑪修我自己造成的Windows CI回归（保留BOM破坏JSON配置加载）；⑫`commandEncoding`测试用POSIX-only语法，此前只在Linux真跑过；⑬**Windows下PowerShell丢失原生程序退出码**，导致主机静默误报命令成败（真实产品缺陷）。新增6个测试文件，均已回基线确认为红。
- **两处前批记载已纠正：** `workbench/styles.css`**有**4处`@media`（非"零"），真正缺陷是排版不是布局；`patchEngine`用落盘hash而`write_file`只认会话hash是**有意设计**（write_file整块覆盖无内容级校验，认落盘hash等于让新进程盲覆盖），已实测确认并写入`src/tools/README.md`，不要"统一"掉。
- **交叉验证：** 台账见`review/CROSS_VALIDATION_LEDGER_2026-09-22.md`。对方分支已冻结，其独有/互补项**已全部吸收**（C1身份请求生命周期、B1依赖准备120s期限）；X1原判"本分支缺workspacePrefix"**是台账自身的错误**，实测本分支早已具备，已更正。
- **R7 Markdown时效核对已完成（来自01a0c932，已合并）：** 以f317c44为基线枚举200份.md逐份判定现行一致/修正/待证据/历史/只读/生成/暂停，未留"待核对"；合并后加入本分支交叉验证台账共201份。文档修正**不等于**外部兼容、实机或全仓源码安全认证。清单见[文档清单](../review/FULL_REVIEW_INDEX.md)。
- **仍待修（已取证未动）：** 无会话调用者合并已于F71修复。`reports.json`上限与轮转已于F70第五批完成（整日轮出最旧日期，不自动归档）；F61-05/06尚未独立复核。F54-04经实测已修且有既有测试覆盖（executionControl.test.js），可关闭。**首次逐行审查已覆盖**：扩展（F71第二批）、admin-host与共享危险命令检测器（F72）、computer-use/win与collectShot（F72第二批：snap绝对-Out与唯一匹配、mark合法JSON）、`computer-use/win`（无dotnet/pwsh不可本地验）。`workbench/js`、`.github/workflows`、`mcp/server.js`、`installer/preparation.js`、`run-code-oss.js`已于第6–7批覆盖。下一批先复核本批相邻调用链，再按小包续修，不先扩功能。原F60源码ce68560/CI35662916656九项与交接63cbbdc/CI35663331086九项保留。
- **本轮验证边界：** 本地104/104通过 + CI 35794970708 九job全绿（含Windows 20/22/24）。**教训：本地全绿不等于没回归**，曾连推四个提交Linux绿而Windows全红；此后每批必查CI结论。沙箱下载CI日志被TLS阻断，改用`gh api .../check-runs/<id>/annotations`取真实断言。Chromium缺失且下载TLS中断，浏览器E2E与真实DPI/字体回退观感本轮未验，UI改动只有静态断言与DOM夹具证据。无本地Windows/C#/PS实机环境，旧CI不代签新反例或桌面。
- **来源验证：** bbe7985 / [CI35651963406](https://github.com/cccjvav/web_agent/actions/runs/35651963406)精确SHA九job success，本地原树97/97。此前ffb7589 / CI35651611509为2/9，七主机任务均有生成物漂移证据，不能用最终绿灯抹去。
- **接手顺序：** 本页→[项目约定](agents.md)→[即时接手检查](stages/s10-upstream-adoption.md#即时接手检查2026-09-21)。先核对分支/HEAD/未提交文件与在跑任务；外部沙箱日志不保证可移交，复现代码/结果及CI摘要保存在独立报告内。
- **当前会话固定分支** `arena/01a0d084-web-agent`（F71，自01a0ce8d的4a868ae起步）；以下01a0ce8d描述属于F70会话（与01a0c925同为26a167e起步）。以下01a0c925相关描述属于上一会话：它由`01a0c4b1`的bbe7985分出后ff-only快进到`01a0bfa9`的2f6e7ab再施工。旧交接中的各固定分支描述仅适用于各自来源会话。`origin/arena/01a0c5ba-web-agent`(33bd177,3提交)仍未合并，去留待定。**并行分支`01a0c932`(08aa942)已于本批全量合并**（合并提交3dd6447，7提交=3修复+4文档时效）。此前我只比对`*.js`漏掉全部文档提交，是过滤器用错；合并中另发现并修复7处真实缺陷（fetchText期限不设防、git重命名/跨边界泄露、目录绕过过滤、谎报完整、diff.relative误删、admin错误逃逸），34处冲突逐一裁决取并集（§11）。随后用**机械判据**复核合并完整性（提交/文件/逐行三层），补齐gitOps两项：内容diff加`--no-renames`（纵深防御，实测当前不可达）与argv字节预算（300个长中文路径可超Windows命令行上限）；R7台账双向对账201↔201零差（§12）。**方法教训：声称"已全部吸收"前必须先出逐行保留率表**——gitOps保留率4%正是这次的线索。
- **阶段10进行中，核心0.7.2，不是只剩实机。** R2/R3其余消费链/权限合同、R7逐句文档仍开放；R8本轮已由用户本机验收通过（2026-09-24，未执行项见记录）；R6/R9候选按收益和授权取舍。全部优先级和完成条件只维护在[工作包表](stages/s10-upstream-adoption.md#当前工作包与交接约束)。持久登录/确切后端身份任务仍延期。- **R4诊断可用，根因未关闭。** 命令/worker与收据辅助已有默认关闭的阶段元数据；CI失败摘要补了有界白名单中段记录。下一步按真实失败证据追查，不改长超时、删断言或重跑追绿；不为等偶发故障暂停所有其他工作。
- **R5到本机系统快捷入口，整体未完成。** 已有只读归属、Windows DPAPI记录、稳定句柄终端回收、真实ACL负例和开始菜单入口，仍需预览后RECYCLE。普通只读报告不授予清理权；面板按钮、桌面TTY/重复点击/关窗/真实隧道、跨用户及实际PID复用仍待。
- **探针原分工继续暂停（用户本轮再次确认完全暂停）。** 不接手arena-model-probe、arena-trace-inspector、probe-extension及其专项源码/文档；通用CI经过旧用例不是专项审查。阶段8等正式交接，不撤销0.5.2交付或用户已关闭的11.3。
- **ShunCode仅参考。** 上传原件现在[历史参考资料](../review/archive/README.md#上传参考原件只存档不运行)，字节未改；此前只在仓库外安全解包阅读，未安装/执行。不整体替换MCP/文件审批栈，不设计包中缺失的支付授权，不授信手写类型；自适应并发/重放候选仍暂缓。
- **记录口径：** 200份Markdown均有逐份时效处置：现行正文有实现/状态依据，历史不改写，暂停不读正文，外部缺证据明确标注。旧203项深度表和875源码/资产CSV仍只作历史，不换算本轮完成率。

## 必须保留的失败与边界
- **Windows命令/worker根因开放：** 36ff82f / CI35125290301的Windows22 echo及worker超时；a22428a / CI35614219553的Windows20 echo约30秒无输出。相似症状不证明同根因，后续成功不注销失败。
- **辅助/打包/审计失败不抹除：** befee7d / CI35602748192的Windows22收据/检测不可用；037b0ce / CI35603908774的暂停Probe打包失败；前批依赖审计等原因未定的失败，继续按阶段10历史保留，不擅自接手暂停模块。
- **授权边界不扩大：** 用户上传参考任务、旧批次误报/失败、CI导航遗漏与ref恢复均有历史记录；不把整理当重做权限/取消/检查点架构的授权。不把OS用户DPAPI或TTY当应用签名/不可伪造的人类身份。
- **测试不代签实机或整体设计：** 窄屏/ARIA、主机与Windows夹具只覆盖各自范围；用户桌面、真实IDE/MCP/隧道结果须另记。本轮不读取或清除用户忽略的秘密配置/运行数据；测试只用自行创建的隔离工作区。

## 阶段导航
| 阶段 | 状态与范围 | 记录 |
|---|---|---|
| 1 项目交接 | 历史阶段 | [交接](stages/s1-handoff.md) |
| 2 会话壳 | 历史阶段 | [会话壳](stages/s2-shell.md) |
| 3 Bridge回图 | 已实现；实机范围看清单 | [Bridge回图](stages/s3-bridge-image.md) |
| 4 终端 | 已实现并持续修正 | [终端](stages/s4-terminal.md) |
| 5 体验对齐 | 历史记录，后续修复见阶段7 | [体验](stages/s5-experience-parity.md) |
| 6 多Agent任务板 | 已实现，非通用多Agent协作完成 | [任务板](stages/s6-multi-agent-board.md) |
| 7 平台审计与可靠性 | 有修复证据，候选未全部落地 | [平台可靠性](stages/s7-platform-reliability.md) |
| 8 双探针完整整合 | 暂停，等外部正式交接 | [能力与验收](stages/s8-probe-integration.md) |
| 9 工作区入口治理 | 核心0.7.1已交付，人工项单列 | [工作区与防错绑](stages/s9-workspace-entry.md) |
| 10 上游借鉴与文档整顿 | 进行中，不虚报全队列完成 | [落地与剩余](stages/s10-upstream-adoption.md) |

## 用户环境与最终验收
- 用户指定：剩余施工完成后，从Arena实际连接本机WebAgent MCP，选择本项目根；先核对工具/ping/workspace_info的身份/root、Git提交与现有改动，再受控测试。R8结果：[R8实机验收记录](../review/R8实机验收记录-2026-09-24.md)总判定通过（M1–M4覆盖，M5/9.2、7.8双凭据、浏览器回归未执行）；沙箱不能代签。用户下一步选定：插件一体化启动返工，[方案](../docs/development/插件一体化启动返工方案.md)D1–D4按推荐确认，**第一期已实施、待用户按[插件一键启动实机验收](../docs/guides/插件一键启动实机验收.md)实机验收**，第二期设置页未开始；用户澄清网页工作台保留，只是插件版不应依赖它。本轮逐步手册：[R8本轮Arena实机验收](../docs/guides/R8本轮Arena实机验收.md)（用户环境：Windows桌面VS Code＋集成CMD＋Conda＋系统Node，仓库根工作区，Quick Tunnel）。
- Windows桌面VSCode集成CMD、已有Conda环境、系统Node；不是默认Anaconda Prompt，不新建venv。当前会话没有用户本机MCP/桌面权限，不编造日志。
- 用户已报告7～10与11.1/11.2完成；11.3于2026-09-16报告完成/关闭，仍属协作说明而非本助手独立验收。
- 用户已确认刷新后Bridge计数/记录保留；手机Arena浏览器通过MCP链接连接成功（2026-09-16）。不扩大为全部工具、OS/蜂窝或经典手机工作台UI验收，详见人工清单F2。
- 模型失败显式停止，不自动换模型/重放修改；浏览器写操作须明确授权。手机固定Bridge，同类型并发保留，新控件不继承旧手机验收。

## 开发与文档规则
- 只在当前Arena绑定分支施工/提交/推送，核对精确SHA的CI；不机械复制历史分支名。
- 遵循[项目约定](agents.md)与[唯一文档规范](docs/documentation.md)，按真实源码解释；原地修错误正文后重建文档，不手改生成区或只追加“最新说明”。
- 每批同时改本索引与阶段工作包；CONTEXT≤80行，历史证据保留在阶段/归档。旧使用指南应退役，不删除未解决失败，也不重写暂停资料。

## 按需导航
- [文档中心](../docs/README.md)、[使用指南](../使用指南.md)、[Windows线性验收](../docs/guides/Windows新手逐步验收.md)。
- [独立报告与接手续作](../review/INDEPENDENT_AUDIT_2026-09-20.md)、[文档时效清单](../review/FULL_REVIEW_INDEX.md)、[语义台账](../review/SEMANTIC_REVIEW_2026-09-16.md)、[人工清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。
- [F44原报告](../review/OPTIMIZATION_REPORT_2026-09-18.md)、[F45交叉审查/实修](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)、[经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)。
- 暂停导航仅供定位：[探针验收](../探针完整整合实施与验收.md)、[Companion](../webagent-core/probe-extension/README.md)、[浏览器整合](../webagent-core/probe-extension/浏览器整合说明.md)、[历史时间线](stages/probe-dual-integration-2026-09-15.md)。
