# 文档正文质量审查 · 2026-09-12

## 审查范围与方法
本次按“职责/入口、主流程、关键错误分支、副作用、测试证据、可读性”对核心说明进行源码契约复核。结构自动生成不代替语义审查；不是对每个函数的所有路径做形式化证明，也不是新的全项目代码安全审计。

此前文档清单覆盖与CI绿灯，仅说明文件归属/生成一致性；本次发现正文仍有过期承诺，因此直接重写问题集中的正文，保留自动导航和git历史，而不把旧版本作为当前章节继续展示。

## 已确认并纠正的质量问题
| 编号 | 旧问题 | 源码依据与处理 |
|---|---|---|
| DQ01 | Agent前文说失败停止，后文仍说失败改builtin | runChat的普通Chat失败分支；重写agent说明，区分模型服务失败与工具失败反馈 |
| DQ02 | PTY仍描述不可观测sendText回退 | ptyHost.runFallback检查shell integration；重写extension并修相关根指南 |
| DQ03 | API HTTP成功/done被写成任务成功 | routes的chat/tool/call；明确外层结束与业务结果差异 |
| DQ04 | store保护被推广成所有配置保护 | store与customizations/readCache/usage各有不同实现；分别说明 |
| DQ05 | MCP取消通知被泛化为执行取消 | server的notifications/cancelled分支为空处理；明确尚未贯通 |
| DQ06 | 手抄函数/DOM行号漂移、补充与旧正文并存 | 替换核心README为职责/流程/边界/验证，定位交给AST索引 |
| DQ07 | 新开发依赖未进入人工说明 | package.json已有Acorn；修agent-host与测试运行要求 |
| DQ08 | 启动器正文仍保留已废弃长CMD逐行解释 | 当前CMD转launch.js；重写启动说明，区分Windows与shell行为 |
| DQ09 | 文档站称启动说明未收录，实际已收录 | build.js已有launchers页面；修收录范围与查看流程 |
| DQ10 | 测试文档以过期行号和计数代替覆盖解释 | 重写tests为风险分类、证据类型和未验收边界 |

## 源码差异单独保留，不借改文档宣布修复
本轮不改变产品运行行为，以下是对照源码发现/确认的当前差异，仍需单独决策和代码测试：
- Plan merge在模型不可调用时仍可能本机合并，与普通Chat及Plan分支的配置失败处理不完全一致。
- customizations读坏文件回defaults，保存为多文件顺序写，不具备store的损坏拒绝/原子更新策略。
- /api/tool/call对正常返回对象外包success:true，即使内部result业务失败；Chat done也不是业务成功证明。
- MCP notifications/cancelled尚未映射到请求执行取消；本机Chat requestScope不能代表远程协议实现。
- 直接node启动index.js先persistIdentity再检查工作区，可能提前创建工作区数据目录；脚本入口的检查不能推广到直接启动。

这些差异以本次来源函数为证据；旧审计批次“已修”描述如果过度概括，以这里更窄的实际保证为准。没有运行攻击复现或扩展产品能力。

## 未全面重写的内容
用户操作指南、架构导读、总览和组件说明保留原有叙述，只修本次已确认的交叉矛盾；历史review和用户上传的新旧方案保留原文。新近添加的CI、资源、辅助脚本等短README按职责复核，不为凑数量强行重写。外部客户端操作说明、所有非JS符号细节、Markdown渲染器差异和真实浏览器视觉验收仍未全面验证。


## 逐篇处置清单
| 处置 | 文档范围 | 复核依据 |
|---|---|---|
| 重写（9份） | agent-host/src中的agent、api、auth、mcp、models、tools、tunnel、usage、utils README | 对照主要入口、状态/错误分支、常量与调用关系；不声称所有辅助函数逐行证明 |
| 重写（7份） | webagent-core、agent-host包、agent-host/src、tests、extension、workbench、scripts README | 包清单/组装、运行器、终端宿主、编辑模型与启动编排 |
| 重写（4份） | admin-host、installer、docs-site README和根启动脚本说明 | HTTP授权、用户runtime、清单/构建/渲染、薄CMD与shell入口差异 |
| 重新组织（1份） | 技术实现.md | 跨模块主链、实际结果语义和已知例外，移除重复的旧函数直译 |
| 定点修正 | 架构导读、技能使用指南、使用指南 | PTY不可观测回退及Plan模型配置差异 |
| 保留短说明 | workflows、computer-use/win、agent-host/scripts、extension/resources、workbench/js README | 核对职责/入口与邻接源码，未为统一篇幅而强行重写 |

以上覆盖当前25份源码归属说明书的处置决策，不是给整个仓库所有Markdown颁发合格证明。新结构减少重复不应丢失函数查找能力，完整JS结构仍在自动索引中；非JS仍依赖正文解释和源文件。

## 排版与回归结果
新增本页目录（可折叠、长目录限高滚动、键盘焦点），章节URL编码/解码支持中文，目录标签按文本转义。文档站“代码直译”改称“技术实现”，避免暗示逐行完整解释。

新增documentationQuality测试：20篇正文单标题、职责/流程/证据要素、旧补充与行号清单回归、Markdown表格列数/围栏、真实renderFiles函数的目录链接/文字转义/中文跳转fixture。首次运行因启动说明缺少明确流程标记失败，调整章节标题后复跑。

本地完整 **51/51测试文件通过，退出码0**；清单165个纳入文件、25份归属说明、37项排除；生成一致性通过。真实浏览器截图、移动端布局与完整无障碍检查尚未运行，不以DOM fixture替代。
