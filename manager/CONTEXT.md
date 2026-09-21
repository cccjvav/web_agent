<!-- 定位：项目管理L1索引；只记当前摘要，计划/交接和逐批历史由既有阶段承载。 -->

# Web Agent · 项目管理索引

接手先读本索引和[项目约定](agents.md)，再按需读[阶段10的工作包与交接](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另建路线图或根交接文件。

## 当前状态
- **本轮已完成F59外层再确认与准备取消对齐。** 可选编辑器现在等待ensure结果；打开窗口后再次核对身份，准备阶段只向保留子进程发超时/取消。本地97/97，代码`bbf22e7a5924820d32ef1341de97f1983cc268bc` / [CI35657576065](https://github.com/cccjvav/web_agent/actions/runs/35657576065)九job已核实；不是全仓审完，也不关闭R4/R5/R7/R8。
- **接手基线：** `67f4f966720c2d6f657f53e3dc3b02cbf3860b98`，[CI35624122815](https://github.com/cccjvav/web_agent/actions/runs/35624122815)九项已逐job核实，本地94/94。F55新修改的验证与精确提交CI见阶段10，不借此基线绿灯代签。
- **F55-F58交付已核实：** 证据036d65b / CI35632714383、源码a68a77e / CI35641420076、证据4649250 / CI35642269647、源码4cf4d6f / CI35647781757、证据ee393c2 / CI35648274576、源码6daf576 / CI35651156739均九项success；不能代签用户桌面或R4-R8。
- **接手顺序：** 本页→[项目约定](agents.md)→[即时接手检查](stages/s10-upstream-adoption.md#即时接手检查2026-09-21)。先核对分支/HEAD/未提交文件与在跑任务；外部沙箱ZIP不保证可移交，[仓库内CI摘要](../review/evidence/R4-handoff-ci-2026-09-21.json)明确哪些事实可得、哪些原日志不可得。
- **当前会话固定分支** `arena/01a0c5ba-web-agent`。开工前已确认`arena/01a0c4b1-web-agent`与起点`bbe79854a8b56d0fd096235275db419c3a0db415`一致，没有切到其他分支或reset。此前01a0b053、01a0bfa9同步及ref恢复属于历史；不据旧记录覆盖工作文件。
- **阶段10进行中，核心0.7.2，不是只剩实机。** R2/R3其余消费链/权限合同、R7逐句文档、R8本机验收仍开放；R6/R9候选按收益和授权取舍。全部优先级和完成条件只维护在[工作包表](stages/s10-upstream-adoption.md#当前工作包与交接约束)。持久登录/确切后端身份任务仍延期。
- **R4诊断可用，根因未关闭。** 命令/worker与收据辅助已有默认关闭的阶段元数据；CI失败摘要补了有界白名单中段记录。下一步按真实失败证据追查，不改长超时、删断言或重跑追绿；不为等偶发故障暂停所有其他工作。
- **R5到本机系统快捷入口，整体未完成。** 已有只读归属、Windows DPAPI记录、稳定句柄终端回收、真实ACL负例和开始菜单入口，仍需预览后RECYCLE。普通只读报告不授予清理权；面板按钮、桌面TTY/重复点击/关窗/真实隧道、跨用户及实际PID复用仍待。
- **探针原分工继续暂停。** 不接手arena-model-probe、arena-trace-inspector、probe-extension及其专项源码/文档；通用CI经过旧用例不是专项审查。阶段8等正式交接，不撤销0.5.2交付或用户已关闭的11.3。
- **ShunCode仅参考。** 上传原件现在[历史参考资料](../review/archive/README.md#上传参考原件只存档不运行)，字节未改；此前只在仓库外安全解包阅读，未安装/执行。不整体替换MCP/文件审批栈，不设计包中缺失的支付授权，不授信手写类型；自适应并发/重放候选仍暂缓。
- **审查不自认证：** 正式清单201项（已逐句8、局部69、待逐句66、历史32、暂停15、边界7、生成1、规范1、受限2）。F55–F59只修订受影响说明，不增加整篇通过数；整理/生成/测试也不能代签。逐批实现、红测、提交和CI都保留在阶段10与review，索引不再重复贴长时间线。

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
