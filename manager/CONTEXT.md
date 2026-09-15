<!-- 定位：项目上下文索引，L1 启动时加载的唯一索引文件，回答「是什么、做到哪、详情在哪」 -->

# Web Agent - 上下文索引


## 2026-09-15 stdio Windows运行闭环证据

修复提交d28c6216e2c744c42b263c5844449f03979a037e的[CI34965636564](https://github.com/cccjvav/web_agent/actions/runs/34965636564)九项全部成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、安装器、Chromium。此前5e488ae及后续诊断提交曾失败；最初只查stdin刷新并不足以解决。固定阶段诊断最终将卡点定位到PowerShell脚本已进入、JSON/环境清理尚未完成；显式Utility模块限定调用和.NET环境/路径API之后全矩阵通过。保留独立二进制线程、Flush、启动屏障、辅助环境与目标环境隔离，以及不含原始stderr的阶段/停止原因。未放宽30秒请求期限或120秒测试文件期限。

测试不再用旧夹具PID或任意启动失败冒充预算触发；每个预算模式清理标记、要求真实启动，并核对预期错误。当前追加Windows stdio重复两轮、就绪完整顺序断言与本文档更新；上述链接只认证d28c621，不代签后续提交。用户11.3和实际第三方软件包仍待真实验收，公网MCP/网站兼容/独立OS隔离/发布签名及其余借鉴项并未宣布完成。

## 2026-09-15连续推进：stdio已实现
本批新增本机启动预览/一次性确认、程序与显式入口hash、最小环境、Windows Job/父监视和POSIX进程组/父监视、字节有界JSON行传输，复用工具逐次审批。取消停止全服务且不重放；启动执行可信OS用户代码，不是沙箱。页面/文档/安装器/CI与59个本地测试、真实浏览器全链路已同步；Windows执行以本批CI为准。公网MCP、网站扩展及其他未审队列仍待推进，用户11.3未代签。下文“stdio未做”是历史记录，当前以此节和UPSTREAM_ADOPTION_MAP为准。

## 2026-09-15本批：工作流执行前文件条件
沿用现有审批与文件工具，新增step.before、预览写保护提示及严格条件schema；文件在批准前变化时可拒绝当前步骤并停止后续，原expectedHash仍适用。不自动加保护、不承诺文件锁/事务、不回滚或重放。新隔离测试与真实浏览器漂移拒绝回归已加入；本批本地58测试文件通过，独立Chromium回归通过，文档181/25/39；远端CI须另核对精确提交。源码对照见UPSTREAM_ADOPTION_MAP；stdio/公网MCP、通用浏览器兼容与其他未审模块仍待推进，用户Windows11.3未代签。

## 2026-09-15借鉴范围扩展（本批）
用户明确要求尽可能全面发现/吸收，不限原建议或Skills。新增review/UPSTREAM_ADOPTION_MAP_2026-09-15.md：Git全树互斥路径索引、26类机会、已抽查/待深入边界。本批实现外部MCP有界分页发现/总截止时间/严格分片SSE，以及recall中英文关键词/来源/读取预算；没有顺带开放stdio/公网MCP、自动安装、跨工作区记忆或持久登录。下面旧测试数与CI均为历史提交证据；本批本地57测试文件与独立真实Chromium回归通过，文档180/25/39；远端CI另查精确提交，Windows11.3仍未完成。

## 项目身份
- **目标**：本机工作台 + agent-host，让网页 AI 经 MCP 改当前工作区
- **技术栈**：Node（无 TypeScript）、Express 双端口 3000/48271、工作台原生 JS
- **创建时间**：2026-09

## 当前状态
- **2026-09-15当前实施进度**：诊断/追踪/证据与真实浏览器CI已有6ac5f92；回环HTTP MCP逐次审批、有限工作流及认证远程归属已有9fb68d2/656fd3c。本批Skills增加来源ID、有界嵌套发现、hash绑定分页/资源、脚本只读、Ask不发送及workflow.json仅转预览。产品55文件与独立Chromium回归本地通过，文档178/25/39；不代替远端CI或Windows验收。下面52/52与旧CI是历史证据，不是本批结果。stdio/公网MCP、通用非原生聊天扩展、第三方Skill安装/执行尚未实现；用户11.3仍未完成。采纳细节见review/REFERENCE_ARENA_AGENT_2026-09-15.md。
- **本轮审查处置已收尾**：三份外部报告逐项核对，确认缺陷修复与低风险优化已推送；误报/保留设计/需要产品决策的改造见 `review/CURRENT_AUDIT.md`。下文旧“进行中/阻塞”段落仅是时间线，不当成最新待办。
- **最新UI修复**：聊天picker恢复builtin（无需API），上下定位/滚动与事件清理、两主题对比度和小窗口遮挡修复；按授权移除未实现IDE/附件/仿站入口，备注折叠且保留数据，认证Bridge不变。52/52本地通过，额外Chromium153真实保存/内置读取、8组主题尺寸及设置文字检查通过；细节见CURRENT_AUDIT，不代替用户第7步。
- **已验证代码基线**：1c1ff8c / CI34858920756八项通过：Ubuntu+Windows × Node20/22/24、Ubuntu18兼容、Windows安装器。Windows Job Object命令树、严格取消及只杀父进程测试重复验证；此前30204ms失败保留在历史，不因绿灯删除证据。
- **本地与文档**：产品52/52，演示6/6，npm audit（含dev）0已知漏洞；清单168源文件/25目录/38排除，逐函数/非JS详解关联与生成站点漂移通过。没有覆盖率百分比或全语义认证声明。
- **真实用户状态**：Windows桌面VS Code集成CMD中使用Conda，系统Node24；完整重启VS Code已解决npm/npx PATH问题。2026-09-14用户确认第5步复验无报错、第6步启动通过；第7～10及11.1/11.2已报告完成、11.3未完成；新增帮助入口与Bridge可观测性缺陷另行修复（用户报告未另附日志/提交号/退出码数值）。当前会话未连接其本机MCP，未做桌面/UAC/DPI/剪贴板/手机验收。
- **唯一当前审查结论**：review/CURRENT_AUDIT.md；原三份报告、第三轮文末施工与step5日志保留。真正人工验收唯一活基线仍是review/CHECKLIST_WINDOWS.md，线性步骤Windows新手逐步验收.md。
- **保留边界**：命令Job Object不代表外部隧道强杀后自动回收；全局业务状态不是多租户隔离；多文件配置不是事务；CDN/截图例外与遥测已披露；未擅自后台自启、持久配对、迁移历史或大改测试框架。
- **文档编辑限制已解除**：用户已完成阅读，允许更新Conda/验收文档；已阅读不是验收通过。

## 已完成阶段摘要
| 阶段 | 做了什么 | 详情 |
|------|----------|------|
| 审查闭环 | V4-1 / V3-2 / V3-4，过程文档进 review/ | → review/README.md |
| computer-use | 仓库根脚本 + load_skill 按名 | → computer-use/SKILL.md |
| 项目管家 | 官方 SKILL 进 project-manager/ | → manager/stages/s1-handoff.md |
| ShunCode 第一阶段 | 本机 Chat「眼+手」：vision 模型收截图 image_url、纯文本模型诚实拒看、Bridge 恒 text 零改动 | → review/REPORT_SHUNCODE_S1.md |
| ShunCode 第二阶段 | 欢迎页/设置「两条路」分清（本机 Chat vs Bridge）+ README 行号全量校正 | → review/REPORT_SHUNCODE_S2.md |
| ShunCode 第三阶段 | Bridge 把 run_command 截图以 MCP image 内容回传（书面签字存档）；活表面文案全量翻转 | → review/REPORT_SHUNCODE_S3.md |

## 导航规则
- Conda环境与本机验收 → `Conda环境说明.md`、`review/CHECKLIST_WINDOWS.md`
- 逐文件/逐函数复盘与讲解缺口 → `代码复盘指南.md`
- 为什么两端口/隧道/沙箱 → `架构导读.md`
- Windows 从安装到 Bridge → `使用指南.md`
- Skill / computer-use → `技能使用指南.md`
- 有意不做 → `架构导读.md` 第 12 节、`SECURITY.md`
- 往 ShunCode 对齐 → `review/PROMPT_SHUNCODE.md`
- 中断恢复 / 施工进度 / 第一阶段明细 → `review/REPORT_SHUNCODE_S1.md`（含恢复锚点表）
- 第二阶段（两条路会话壳）明细 → `review/REPORT_SHUNCODE_S2.md` 与 `manager/stages/s2-shell.md`
- 第三阶段（Bridge 回图 + 授权原文）→ `review/REPORT_SHUNCODE_S3.md` 与 `manager/stages/s3-bridge-image.md`
- 沙箱回收、测试假绿等踩坑经验 → `manager/docs/experience.md`
- 项目约定 → `manager/agents.md`
- 规则全文（load_skill 截断时）→ `manager/SKILL.md` 或 `project-manager/SKILL.md`

## 遗留问题
→ manager/docs/experience.md#遗留问题追踪

## 本轮续审：OAuth
注册回收改为保护活跃客户端，校验前不修改状态；限制URI/名称，授权输入先校验再消费配对码，公开GET不续发；issuer不采信任意转发头。公开PKCE与机密POST/Basic兼容保留。全局尝试预算DoS只缓解未根除，安装载荷/其余优化继续。用户正在独立复验第5步，未收到结果前不标其本机通过。

### 最新阻塞更新
31767dd / CI34855329666：Windows20 ptyLifecycle取消耗时30204ms失败，其余六任务成功；前批80c72bf / CI34855147938七项全通过。取消存在间歇性反例，不能视为彻底修复；taskkill返回值/时序诊断优先于继续低风险优化，不放宽10秒断言。

## 最新用户反馈（2026-09-14）
用户授权删除根目录两份过时的新旧文档方案，已删除并清理导航；现行manager/docs/documentation.md不变。用户明确反馈第5步复验无误、无报错，按用户报告记通过；这不是其余桌面/手机验收通过。此前“正在复验/未收到结果”是历史状态。

2026-09-15验证补充：功能提交f23ac42已推送；GitHub Actions [34956256898](https://github.com/cccjvav/web_agent/actions/runs/34956256898)九项全部成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、安装器、真实浏览器）。这是该提交的CI证据，不代替用户11.3。后续小补丁仅加强脚本无执行fixture的绝对路径标记并纠正文档旧提示，其CI不由这个run代签。
