# Web Agent · 项目管理索引

## 当前阶段
- **阶段8：双探针完整整合，进行中**。不是以0.4历史功能替代完整交付。
- 用户要求原Probe全部参考能力与Inspector取长补短，再融入WebAgent；Chat API确切核验后置。
- 0.5主体已接入；0.5.1继续修复采集/配对取消竞态并接入旧Probe原生导出转换，新增回归，真实环境验收仍待进行。
- 当前已验证代码：`bed7547`，Companion/浏览器0.5；本地68测试文件，CI35020288953九项成功。
- 0.5两端：同一个CDP采集器、trace与通用响应参考；VSCode显式实时订阅/历史与审批入口。真实Chrome/Arena/手机11.3仍未验收。
- 未完成的完整能力及本轮状态以[阶段8](stages/s8-probe-integration.md)为唯一项目管理进度表。
- 当前阶段关闭条件：能力表逐项有代码和验证证据；真实桌面/网站未验证项单列，不标完成。

## 阶段导航
| 阶段 | 状态与范围 | 记录 |
|---|---|---|
| 1 项目交接 | 历史阶段 | [交接](stages/s1-handoff.md) |
| 2 会话壳 | 历史阶段 | [会话壳](stages/s2-shell.md) |
| 3 Bridge回图 | 已实现；实机验收范围看清单 | [Bridge回图](stages/s3-bridge-image.md) |
| 4 终端 | 已实现并持续修正 | [终端](stages/s4-terminal.md) |
| 5 体验对齐 | 原阶段记录；后续修复见阶段7 | [体验](stages/s5-experience-parity.md) |
| 6 多Agent任务板 | 已实现；没有宣称通用多Agent协作完成 | [任务板](stages/s6-multi-agent-board.md) |
| 7 平台审计与可靠性 | 已有修复/CI，Windows11.3仍待用户验收 | [平台可靠性](stages/s7-platform-reliability.md) |
| 8 双探针完整整合 | 进行中 | [当前能力与验收](stages/s8-probe-integration.md) |

## 用户环境与验收
- Windows桌面VSCode集成CMD，已有Conda环境，系统Node；不是默认Anaconda Prompt，不用venv。
- 用户已报告步骤7～10及11.1/11.2完成；11.3未完成。不推断网络/手机条件。
- 用户已确认刷新后Bridge计数及调用记录保留；不扩大为其他功能验收。
- 本机工作台保留；手机Arena通过认证MCP/Bridge访问机器的任务能力不删除。
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
