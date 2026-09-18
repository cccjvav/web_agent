<!-- 定位：项目管理L1索引，记录当前状态、摘要与按需导航；详细计划和交接位于现有阶段。 -->

# Web Agent · 项目管理索引

接手只需本索引和[项目约定](agents.md)，再按导航读取[当前阶段的计划与交接约束](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另设路线图或根交接文件。

## 当前状态
- **阶段10：继续上游借鉴与文档整顿**。Tasks隔离/刷新恢复与初步编辑预览（核心0.7.2）已交付；所有者权限与Chat/Bridge互斥已交付，经典单文件受保护回退已交付，显式公网HTTPS出站已交付，原生草稿diff/恢复已交付，跨文件内容检查点已交付，继续非探测文档逐句审查与旧指南退役、过期内容清理与实际缺口复核；见[阶段10](stages/s10-upstream-adoption.md)。阶段9工作区调整已交付。
- 探测相关施工现全部暂停，等待外部助手完成整合并交接；不拉取合并、不重复开发、不提前确认新入口兼容。现有探针实现和历史证据保留。
- **阶段8暂停／等待外部交接**：用户2026-09-17报告另一助手在[arena-ai-probe指定分支](https://github.com/phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe)设计整合工作台/code-server外接与VSCode配套插件；目前仅用户报告，尚未审查或验收。不撤销既有0.5.2交付，11.3仍关闭。
- **阶段7也不是“全部优化完成”**：已确认缺陷和若干增强已落实，但26类借鉴中仍有未实现/待深入候选，详见阶段7与UPSTREAM_ADOPTION_MAP。
- 最近完整核验基线bff848389183ee099d42a227aa04bc73f974f306（第40组公开peer与私有会话分离/主体绑定），[CI35291325766](https://github.com/cccjvav/web_agent/actions/runs/35291325766)九项逐项成功；本地82测试文件通过，246源码/28目录/110排除。保留36ff82f首轮CI35125290301的Windows22两项超时（8/9、整体失败）：后续证据提交未改实现而全量通过，不说明超时根因已定位或修复。
- 持久登录仍延期；Chat API确切后端身份是用户约定的后续任务。启发式结果提供参考，不承诺绝对鉴定。

- 当前续作：第41组经典密钥轮换HTTP500仍toast成功已红测后修；确认/互斥/新响应合同、绑定与expectedSecret比较、写后读失败保留确认、未知不重放，旧空体协议兼容。本地82测试/文档检查通过；首轮CI8/9因新增浏览器夹具走错面板，已修真实导航，修正后浏览器通过但漏提交生成README导致其余8项库存门禁失败，补齐后新CI待核验；本地未执行Chromium。下一包Bridge启停与原生重置命令消费，R2/全仓/实机保留，探测暂停。

- 文档审查与施工继续：[现行范围与剩余施工](../review/SEMANTIC_REVIEW_2026-09-16.md)。早期测试数/CI仅是对应历史批次证据，不作为当前状态；当前已核验基线以上方精确提交为准。手机固定Bridge，同类型并发保留，新增控件不继承旧手机验收。

- 文档清理政策：过时使用指南删除或归档，不靠末尾追加新状态留在现行入口。已删除旧双向连接指南，当前有效步骤并入使用指南；早期探针接入报告移入review/archive，仅保留历史证据。清理提交72ad02f79b42c48fae191ba7d7f49a09cd4e8870已推送，CI35099997405九项成功，本地78测试文件通过。

## 阶段导航
| 阶段 | 状态与范围 | 记录 |
|---|---|---|
| 1 项目交接 | 历史阶段 | [交接](stages/s1-handoff.md) |
| 2 会话壳 | 历史阶段 | [会话壳](stages/s2-shell.md) |
| 3 Bridge回图 | 已实现；实机验收范围看清单 | [Bridge回图](stages/s3-bridge-image.md) |
| 4 终端 | 已实现并持续修正 | [终端](stages/s4-terminal.md) |
| 5 体验对齐 | 原阶段记录；后续修复见阶段7 | [体验](stages/s5-experience-parity.md) |
| 6 多Agent任务板 | 已实现；没有宣称通用多Agent协作完成 | [任务板](stages/s6-multi-agent-board.md) |
| 7 平台审计与可靠性 | 缺陷修复有证据；借鉴候选未全部落地 | [平台可靠性](stages/s7-platform-reliability.md) |
| 8 双探针完整整合 | 暂停，待外部整合项目正式交接；存量实现保留 | [当前能力与验收](stages/s8-probe-integration.md) |
| 9 工作区入口治理 | 核心0.7.1已交付；新增人工项单列 | [工作区与防错绑](stages/s9-workspace-entry.md) |
| 10 上游借鉴与文档整顿 | 进行中；不虚报整个队列完成 | [具体落地与剩余](stages/s10-upstream-adoption.md) |

## 用户环境与验收
- 用户指定最终验收：剩余施工完成后，通过Arena实际接入本机WebAgent MCP，选择本项目根目录。先核对工具可用、ping/workspace_info身份与root、Git提交/现有改动，再受控测试；未接入前不可用沙箱冒充。本机新清单M1–M5尚未执行，停止后的进程结果须本机确认。
- Windows桌面VSCode集成CMD，已有Conda环境，系统Node；不是默认Anaconda Prompt，不用venv。
- 用户已报告步骤7～10及11.1/11.2完成；11.3已由用户2026-09-16确认完成/关闭（协作说明，非独立验收）。不推断网络/手机条件。
- 用户已确认刷新后Bridge计数及调用记录保留；不扩大为其他功能验收。
- 手机Arena连接已通过（用户2026-09-16实机报告）：手机浏览器登录后使用WebAgent MCP链接成功连接，用法与电脑浏览器相同；未推断OS/浏览器/蜂窝或全部工具结果，详见清单F2。
- 模型失败显式停止；不自动切换模型或重放修改；浏览器写操作必须有明确授权。
- 当前会话没有用户本机MCP或桌面访问权限，不编造实机日志。

## 开发与文档规则
- 当前会话只使用Arena指定分支；及时提交/推送并核对精确SHA的CI。
- [项目约定](agents.md)、[唯一文档规范](docs/documentation.md)。逐函数解释基于真实源码。
- 阶段更新必须改本索引和对应阶段表，不能只向旧CONTEXT末尾追加“最新”。
- 当前索引不超过80行；历史事实移入归档，不删除失败证据。

## 导航规则
- [统一文档中心](../docs/README.md)：用户专题、开发学习、模块详解与当前/历史审查分层。
- 使用入口：[使用指南](../使用指南.md)；[Windows线性验收](../docs/guides/Windows新手逐步验收.md)。
- [探针完整验收](../探针完整整合实施与验收.md)、[Companion](../webagent-core/probe-extension/README.md)、[浏览器整合](../webagent-core/probe-extension/浏览器整合说明.md)。
- [现行逐句审查](../review/SEMANTIC_REVIEW_2026-09-16.md)、[验收清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。
- [经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)、[双探针0.3～0.4时间线](stages/probe-dual-integration-2026-09-15.md)。
