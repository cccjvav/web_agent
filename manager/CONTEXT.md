# Web Agent · 项目管理索引

## 当前阶段
- **阶段10：继续上游借鉴与文档整顿**。Tasks隔离/刷新恢复与初步编辑预览（核心0.7.2）已交付；当前进行文档逐句审查、过期内容清理与实际缺口复核；见[阶段10](stages/s10-upstream-adoption.md)。阶段9工作区调整已交付。
- 探针经典工作台/code-server入口补齐已按用户要求移出施工范围，仅保留接线说明。
- **阶段8仍进行中**：双探针Companion/浏览器0.5.2主体与自动回归已交付，真实Chrome/Arena/目录源/桌面等仍需各自实机证据；11.3协作说明已由用户确认关闭，不以切换阶段掩盖未完成。
- **阶段7也不是“全部优化完成”**：已确认缺陷和若干增强已落实，但26类借鉴中仍有未实现/待深入候选，详见阶段7与UPSTREAM_ADOPTION_MAP。
- 当前代码faeaa1f（密钥轮换）及前批0465073（模型/工具结果/MCP取消）各自CI全部九项成功：35038187350、35038038886；本地77测试文件，235源码/28目录/109排除。核心仍0.7.2、Companion0.5.2；不是用户真实桌面验收。
- 持久登录仍延期；Chat API确切后端身份是用户约定的后续任务。启发式结果提供参考，不承诺绝对鉴定。

- 文档审查与施工继续：[逐句修订与剩余施工](../review/SEMANTIC_REVIEW_2026-09-16.md)。已修Plan无效模型回退、直接工具API成功外包及MCP在途取消；又修密钥轮换保存失败仍报成功，协议/存储/运行配置详解累计全文复核4篇，其余文档仍待审。当前续作核对权限边界及审批结果，记录手机连接通过；截图式四分类权限开关尚未实现。当前批测试/CI以阶段10记录为准，未沿用旧绿灯。

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
| 8 双探针完整整合 | 主体已交付；实机验收未关闭 | [当前能力与验收](stages/s8-probe-integration.md) |
| 9 工作区入口治理 | 核心0.7.1已交付；新增人工项单列 | [工作区与防错绑](stages/s9-workspace-entry.md) |
| 10 上游借鉴与文档整顿 | 进行中；不虚报整个队列完成 | [具体落地与剩余](stages/s10-upstream-adoption.md) |

## 用户环境与验收
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

## 用户与维护导航
- 使用入口：[使用指南](../使用指南.md)；[Windows线性验收](../Windows新手逐步验收.md)。
- [探针完整验收](../探针完整整合实施与验收.md)、[Companion](../webagent-core/probe-extension/README.md)、[浏览器整合](../webagent-core/probe-extension/浏览器整合说明.md)。
- [现行审计](../review/CURRENT_AUDIT.md)、[验收清单](../review/CHECKLIST_WINDOWS.md)、[借鉴映射](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。
- [经验](docs/experience.md)、[旧索引归档](stages/context-history-through-0.4.md)、[双探针0.3～0.4时间线](stages/probe-dual-integration-2026-09-15.md)。
