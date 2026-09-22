<!-- 定位：项目管理L1索引；只记当前摘要，计划/交接和逐批历史由既有阶段承载。 -->

# Web Agent · 项目管理索引

接手先读本索引和[项目约定](agents.md)，再按需读[阶段10的工作包与交接](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另建路线图或根交接文件。

## 当前状态
- **F62独立复审已交付3批（2f6e7ab起，提交c7acac4/66f5dc7＋UI批）：** 不复述F61报告，独立重新取证后修复：①不带路径的git diff改为逐路径套用与显式diff相同的敏感规则且限定工作区子树；②读取改严格UTF-8，非法字节抛`E_ENCODING`，不再出现不同字节同hash导致过期写入被接受；③差异渲染加时间/编辑距离预算并先渲染后落盘；④admin坏存储fail-closed且原子发布；⑤GitHub身份与遥测的裸fetch统一走`fetchText`（超时+字节上限），readCache停止空转重写整表；⑥104处硬编码px字号改rem字阶并新增A-/A+字号控件；⑦命令输出改StringDecoder，修掉跨管道分块把中文打成U+FFFD（逐字节输出"项目已完成"实测返回15个替换字符，模型会当真实结果用）；⑧危险命令检测新增argv包装器剥壳，`sudo rm -rf /`此前**未被识别**；⑨与并行分支01a0c932交叉验证，发现**自己**的严格解码用错`ignoreBOM`会静默删除文件BOM（自测因`endsWith`断言写法而漏过），已按对方方案修正；⑩`spentRefresh`重放墓碑无容量上限（推算109MB），加5000上限并淘汰最旧。新增6个测试文件，均已回基线确认为红。
- **两处前批记载已纠正：** `workbench/styles.css`**有**4处`@media`（非"零"），真正缺陷是排版不是布局；`patchEngine`用落盘hash而`write_file`只认会话hash是**有意设计**（write_file整块覆盖无内容级校验，认落盘hash等于让新进程盲覆盖），已实测确认并写入`src/tools/README.md`，不要"统一"掉。
- **交叉验证：** 台账见`review/CROSS_VALIDATION_LEDGER_2026-09-22.md`；X1 `gitOps`建议取对方实现（有`workspacePrefix`处理子目录工作区，本分支缺、亦无红测）。
- **仍待修（已取证未动）：** F54-04待红测确认；`reports.json`无条数上限与轮转；F61-05/06尚未独立复核。**仍未审**：`mcp/server.js`、`installer/preparation.js`、`run-code-oss.js`、`extension/extension.js`与`ptyHost.js`、`workbench/js/bind.js|bridge.js|operations.js`、`.github/workflows`。下一批先复核本批相邻调用链，再按小包续修，不先扩功能。原F60源码ce68560/CI35662916656九项与交接63cbbdc/CI35663331086九项保留。
- **本轮验证边界：** 本地103/103测试文件通过；Chromium缺失且下载TLS中断，浏览器E2E与真实DPI/字体回退观感本轮未验，UI改动只有静态断言与DOM夹具证据。无本地Windows/C#/PS实机环境，旧CI不代签新反例或桌面。
- **来源验证：** bbe7985 / [CI35651963406](https://github.com/cccjvav/web_agent/actions/runs/35651963406)精确SHA九job success，本地原树97/97。此前ffb7589 / CI35651611509为2/9，七主机任务均有生成物漂移证据，不能用最终绿灯抹去。
- **接手顺序：** 本页→[项目约定](agents.md)→[即时接手检查](stages/s10-upstream-adoption.md#即时接手检查2026-09-21)。先核对分支/HEAD/未提交文件与在跑任务；外部沙箱日志不保证可移交，复现代码/结果及CI摘要保存在独立报告内。
- **当前会话固定分支** `arena/01a0c925-web-agent`，由`01a0c4b1`的bbe7985分出后已ff-only快进到`01a0bfa9`的2f6e7ab再施工；没有切换或推送其他分支。旧交接中的01a0bfa9/01a0c4b1固定分支描述仅适用于来源会话。`origin/arena/01a0c5ba-web-agent`(33bd177,3提交)仍未合并，去留待定。
- **阶段10进行中，核心0.7.2，不是只剩实机。** R2/R3其余消费链/权限合同、R7逐句文档、R8本机验收仍开放；R6/R9候选按收益和授权取舍。全部优先级和完成条件只维护在[工作包表](stages/s10-upstream-adoption.md#当前工作包与交接约束)。持久登录/确切后端身份任务仍延期。
- **R4诊断可用，根因未关闭。** 命令/worker与收据辅助已有默认关闭的阶段元数据；CI失败摘要补了有界白名单中段记录。下一步按真实失败证据追查，不改长超时、删断言或重跑追绿；不为等偶发故障暂停所有其他工作。
- **R5到本机系统快捷入口，整体未完成。** 已有只读归属、Windows DPAPI记录、稳定句柄终端回收、真实ACL负例和开始菜单入口，仍需预览后RECYCLE。普通只读报告不授予清理权；面板按钮、桌面TTY/重复点击/关窗/真实隧道、跨用户及实际PID复用仍待。
- **探针原分工继续暂停（用户本轮再次确认完全暂停）。** 不接手arena-model-probe、arena-trace-inspector、probe-extension及其专项源码/文档；通用CI经过旧用例不是专项审查。阶段8等正式交接，不撤销0.5.2交付或用户已关闭的11.3。
- **ShunCode仅参考。** 上传原件现在[历史参考资料](../review/archive/README.md#上传参考原件只存档不运行)，字节未改；此前只在仓库外安全解包阅读，未安装/执行。不整体替换MCP/文件审批栈，不设计包中缺失的支付授权，不授信手写类型；自适应并发/重放候选仍暂缓。
- **审查不自认证：** 正式清单202项（已逐句8、局部69、待逐句67、历史32、暂停15、边界7、生成1、规范1、受限2）。F55/F56仅将受影响说明转局部，不增加整篇通过数；整理/生成/测试也不能代签。逐批实现、红测、提交和CI都保留在阶段10与review，索引不再重复贴长时间线。

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
- 用户指定：剩余施工完成后，从Arena实际连接本机WebAgent MCP，选择本项目根；先核对工具/ping/workspace_info的身份/root、Git提交与现有改动，再受控测试。本机M1–M5未执行，停止后的进程结果仍须本机确认；沙箱不能代签。
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
- [独立报告与接手续作](../review/INDEPENDENT_AUDIT_2026-09-20.md)、[正式逐文件清单](../review/FULL_REVIEW_INDEX.md)、[语义台账](../review/SEMANTIC_REVIEW_2026-09-16.md)、[人工清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。
- [F44原报告](../review/OPTIMIZATION_REPORT_2026-09-18.md)、[F45交叉审查/实修](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)、[经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)。
- 暂停导航仅供定位：[探针验收](../探针完整整合实施与验收.md)、[Companion](../webagent-core/probe-extension/README.md)、[浏览器整合](../webagent-core/probe-extension/浏览器整合说明.md)、[历史时间线](stages/probe-dual-integration-2026-09-15.md)。
