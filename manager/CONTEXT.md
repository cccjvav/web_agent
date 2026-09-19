<!-- 定位：项目管理L1索引，记录当前状态、摘要与按需导航；详细计划和交接位于现有阶段。 -->

# Web Agent · 项目管理索引

接手只需本索引和[项目约定](agents.md)，再按导航读取[当前阶段的计划与交接约束](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另设路线图或根交接文件。

## 当前状态
- **阶段10：继续上游借鉴与文档整顿**。Tasks隔离/刷新恢复与初步编辑预览（核心0.7.2）已交付；所有者权限与Chat/Bridge互斥已交付，经典单文件受保护回退已交付，显式公网HTTPS出站已交付，原生草稿diff/恢复已交付，跨文件内容检查点已交付，继续非探测文档逐句审查与旧指南退役、过期内容清理与实际缺口复核；见[阶段10](stages/s10-upstream-adoption.md)。阶段9工作区调整已交付。
- 探测相关施工现全部暂停并由另一位助手负责，等待其完成整合并正式交接；本分支不拉取合并、不运行专项审查、不修改探针代码/文档。即使通用检查发现疑似缺陷也只记录移交，不自行实现；现有探针实现和历史证据保留。
- **阶段8暂停／等待外部交接**：用户2026-09-17报告另一助手在[arena-ai-probe指定分支](https://github.com/phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe)设计整合工作台/code-server外接与VSCode配套插件；目前仅用户报告，尚未审查或验收。不撤销既有0.5.2交付，11.3仍关闭。
- **阶段7也不是“全部优化完成”**：已确认缺陷和若干增强已落实，但26类借鉴中仍有未实现/待深入候选，详见阶段7与UPSTREAM_ADOPTION_MAP。
- 最近完整核验基线f89767fdbbc3db1787bf48bb10a32895b1dca647（第48组返回式失败、Skill核验与审批历史容量实修），[CI35408375271](https://github.com/cccjvav/web_agent/actions/runs/35408375271)九项逐项成功；本地84/84通过、文档249源码/28目录/110排除且生产依赖audit 0漏洞。保留36ff82f首轮CI35125290301的Windows22两项超时（8/9、整体失败）：后续证据提交未改实现而全量通过，不说明超时根因已定位或修复。
- 持久登录仍延期；Chat API确切后端身份是用户约定的后续任务。启发式结果提供参考，不承诺绝对鉴定。

- 当前续作：第45组已完成第44组报告交叉复核并落实P1-A七个结果消费者、设备码代次/单飞、`createOnly`原子创建、PTY 2xx门禁、Chat可靠终态、补丁协调、Bridge布尔合同、无障碍/390px界面及CI最小权限/高危审计门禁。曾误改的3个model-probe文件已恢复到同步基线，仅留未裁决线索给负责该项目的另一位助手；详见[第45组报告](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)。非探针本地验证通过；两轮Chromium 8/9失败及后续成功证据均保留，边界纠正`27fca73`的CI35386685807九项成功。第46组已修非探针operatorQueue临期结果立即淘汰/过期被取消改写、workflow及external_request/operation_result包装、矛盾条件/动态前序引用schema，以及命令结果/取消/get_logs跨peer未隔离、远程get_task_status误读Local计划和get_capabilities绕过目录ACL过滤；本地83测试与文档生成/库存通过；`a85fa5a`的CI35397169896九项成功。第47组已修外部ok:false被改成功、工作流部分读取后继续写、模型掩码Key破坏/跨端点复用、严格字段/引用及addProvider整表预算；首轮80/83暴露并修三项施工漂移，最终83/83，文档248/28/110零漂移、生产audit 0漏洞、探针目录零diff；实现`874006e`的CI35402127412九项成功。第48组再修Chat/OpenAI把只以终态表达的返回式失败画成成功、Skill忽略写后unknown核验，以及审批队列在容量压力下提前删除15分钟内结果/requestKey墓碑；新增真实队列/HTTP/模拟模型回归，首轮83/84仅暴露新增测试未登记主说明，补齐后84/84，文档249/28/110零漂移、audit 0漏洞、探针目录零diff；实现`f89767f`的CI35408375271九项成功。下一项继续其余非探针API/workflow结果边界并交叉R2；正式清单199项为逐句8、局部54、待80、历史32、暂停15、边界7、生成1、规范1、受限1，lint/EOL/生成物取舍与实机边界保留。

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
- [现行逐句审查](../review/SEMANTIC_REVIEW_2026-09-16.md)、[验收清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)、[第44组原始优化报告](../review/OPTIMIZATION_REPORT_2026-09-18.md)、[第45组交叉审查与实修](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)。
- [经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)、[双探针0.3～0.4时间线](stages/probe-dual-integration-2026-09-15.md)。
