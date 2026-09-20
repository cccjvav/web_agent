<!-- 定位：项目管理L1索引；只记当前摘要，计划/交接和逐批历史由既有阶段承载。 -->

# Web Agent · 项目管理索引

接手先读本索引和[项目约定](agents.md)，再按需读[阶段10的工作包与交接](stages/s10-upstream-adoption.md#当前工作包与交接约束)。不另建路线图或根交接文件。

## 当前状态
- **第五批原生聊天可靠终态实现已推送，931d4e9的CI35542931972九项成功，本地85/85与真实Chromium通过；证据提交2111f0e的CI35543099280为8/9，Windows24依赖审计失败原因未明，不能据前次绿灯关闭。** 先红测302被误判成功，再修NDJSON失败传播/预算/终态、两种原生消费者与失败历史；不改审批/文件/MCP权限。原生requestJson相邻预算、实际IDE与窄屏/ARIA仍待，探针继续暂停。
- **用户重申自我复审与目标防偏移，本轮先完成前四批交叉复核。** 基线20ad7b2；核对七处累计运行时代码及会话/取消、文件/检查点、资源/权限的相邻合同。发现并收窄工具目录和初始化指引中自动hash复用的过宽承诺，红转绿；不改变文件新建行为。13项定向、84/84及真实Chromium通过；范围/兼容边界见阶段10续记。该轮自审未改原生实现，现由第五批续修。
- **阶段10进行中，核心0.7.2，不是只剩人工验收。** 已交付Chat/Bridge互斥、所有者权限、Tasks隔离/刷新恢复、经典受保护回退、原生草稿diff/恢复、跨文件内容检查点和显式公网HTTPS出站；R2/R3与其它待办仍在[唯一工作包表](stages/s10-upstream-adoption.md#当前工作包与交接约束)。
- **2026-09-20独立复审已归档，已完成第一批，第二批RPC准入亦已交付，第三批补丁创建保护已交付，第四批资源隔离/ACL与机器指引已交付（f318e60）；本地84/84和真实Chromium通过，首轮CI8/9，Windows20依赖审计失败原因未明，文档提交1b9eb04的[CI35536951646](https://github.com/cccjvav/web_agent/actions/runs/35536951646)已逐job核实9/9成功；不据此解释首轮审计失败根因。** [F54报告](../review/INDEPENDENT_AUDIT_2026-09-20.md)列出真实文件/HTTP/完整主机/原生函数/浏览器证据、ShunCode取舍及未执行项。审查之后第一批选择性采用01a0bf59的会话pin/头校验，补全忙503与空闲TTL；第二批`f40b917`补RPC ID/整份批次/版本绑定与通知202，本地84/84和真实Chromium通过，[CI35533579984](https://github.com/cccjvav/web_agent/actions/runs/35533579984)九项成功。实现`d7b521b`及[CI35531273186](https://github.com/cccjvav/web_agent/actions/runs/35531273186)九项成功，门禁与未完成项见阶段54组续记。
- 本会话固定`arena/01a0bfa9-web-agent`。已fetch指定来源`arena/01a0b053-web-agent`，同步时均为`50c03bedc97f9eaaf1c875f4767c6e9bb5278d56`，当时ahead/behind=0/0；前批曾核对整树后仅恢复ref/index；第四批从干净35968a2接续，没有恢复ref/index或覆盖工作文件。
- 精确实现基线[CI35470787917](https://github.com/cccjvav/web_agent/actions/runs/35470787917)已逐job核实九项success。本地84/84、真实Chromium既有套件、文档249源码/28目录/110排除且updated=0、生产audit 0漏洞；语法201 JS/MJS+14 JSON+4 Shell、calculator6/6。基线成功不覆盖新增负例。审查落档`a490ca02f84fe5d9086e2d7629c0e1bfa2258206`已推本会话分支，[CI35525528734](https://github.com/cccjvav/web_agent/actions/runs/35525528734)亦逐job核实9/9成功；门禁与边界见阶段54组。
- **下一闭环仍为R2，并与R3交叉**：新文件patch的hash/块处理；RPC准入/批内ID与busy会话驱逐；资源caller/目录ACL；原生聊天可靠终态；窄屏/ARIA。busy会话/会话头已交付；第二批补RPC envelope/协商版本/批内ID与预算预检，第三批`95c3330`新增缺失目标hash/新建块校验，[CI35534909704](https://github.com/cccjvav/web_agent/actions/runs/35534909704)九项成功；第四批补可信资源caller/目录ACL与错误hash指引；第五批修原生流确认与失败历史；UI仍未修。正式回归须先锁正确合同再最小修复，不用整体替换掩盖问题。
- 参考ShunCode zip只在仓库外安全解包/read-only阅读，未安装或执行。优先借鉴busy/stream pin与整批ID预检查；自适应并发/重放暂缓，信号量缩容有静态缺陷；不换现有文件/审批栈、不做支付授权、不授信手写类型。
- **探针原分工继续暂停，用户本轮再次确认。** 不接手arena-model-probe、arena-trace-inspector、probe-extension及其专项源码/文档；通用套件经过旧用例不是专项审查。阶段8等另一助手正式交接；用户2026-09-17报告的[外部整合分支](https://github.com/phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe)仍未由本助手验收，不撤销0.5.2交付，11.3仍已关闭。
- 正式清单201项：已逐句8、局部56、待逐句79、历史32、暂停15、边界7、生成1、规范1、受限2。新增报告不自授通过；库存、静态扫描、深入阅读、运行验证与实机验收分开。
- 阶段7的26类借鉴仍有候选/未深入项；持久登录、确切后端身份的用户约定后续任务仍延期，不承诺启发式绝对鉴定。

## 必须保留的失败与边界
- 上传`3fbe872`曾因新增任务TXT未登记而七项主机CI失败、另两项通过；现已由`50c03be`九项绿灯取代为当前基线。前任ref恢复及各批施工漂移仍在阶段历史，不写成今天又发生，也不据此自动重置checkout。
- `36ff82f`首轮CI35125290301的Windows Node22两项超时仍未定位（R4）。后续绿灯不能证明根因已修；不得删断言、加时限或反复重跑美化结果。
- 首轮完整主机确认资源混入Local任务/目录权限投影不一致；第四批已补资源归属/ACL回归，实际Edit禁用仍拒绝写入。异常RPC写入使用有效临时凭据，不是未认证越权结论。
- 390/320px中心区宽度为0并溢入聊天，axe命中tablist子角色；已有浏览器回归仍绿。字体优化是建议，Linux审查字体回退不是用户Windows效果认证。
- 文档逐句、R5 PTY/平台、R6候选、R7文档、R8实机、R9工程化均继续；历史实现/CI详见[阶段10](stages/s10-upstream-adoption.md)，不在轻量索引复制整段F45–53日志。

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
- [本轮独立报告](../review/INDEPENDENT_AUDIT_2026-09-20.md)、[正式逐文件清单](../review/FULL_REVIEW_INDEX.md)、[语义台账](../review/SEMANTIC_REVIEW_2026-09-16.md)、[人工清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。
- [F44原报告](../review/OPTIMIZATION_REPORT_2026-09-18.md)、[F45交叉审查/实修](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md)、[经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)。
- 暂停导航仅供定位：[探针验收](../探针完整整合实施与验收.md)、[Companion](../webagent-core/probe-extension/README.md)、[浏览器整合](../webagent-core/probe-extension/浏览器整合说明.md)、[历史时间线](stages/probe-dual-integration-2026-09-15.md)。
