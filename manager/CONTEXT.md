<!-- 定位：项目上下文索引，L1 启动时加载的唯一索引文件，回答「是什么、做到哪、详情在哪」 -->

# Web Agent - 上下文索引

## 项目身份
- **目标**：本机工作台 + agent-host，让网页 AI 经 MCP 改当前工作区
- **技术栈**：Node（无 TypeScript）、Express 双端口 3000/48271、工作台原生 JS
- **创建时间**：2026-09

## 当前状态
- **本轮跨平台证据**：7825e7a / CI34853878428，Ubuntu+Windows × Node20/22/24六个全量任务及安装器均通过。用户本机仍需拉取后重跑第5步；OAuth/载荷/其余优化审查继续。
- **新审查进行中**：已取得三份外部报告及Windows step5日志；已修3个Windows测试fixture/等待问题及新矩阵发现的文档CRLF漂移；P0五项与P1存储/分支/错误/探测期限已补回归，其他OAuth/打包/文档优化仍待继续，未宣称全量完成。
- **实际开发终端**：Windows VS Code 集成 CMD 中激活 Conda；本机另装 Node.js。用户确认完整重启VS Code后npm/npx恢复，旧PATH继承问题已解决，其他验收不据此标通过。线性操作入口：Windows新手逐步验收.md；允许先暂缓自动测试做最小启动/MCP连接，但当前Agent会话未接本机工具。
- **文档编辑限制已解除**：用户已完成阅读，允许按核对结果更新Conda/验收文档；已阅读不等于人工验收通过。
- **阶段**：2026-09-11审计交叉验证与分批修复；历史S4/S6代码完成不代表缺陷清零。
- **文档复盘**：清单166个源文件的人工详解关联已补齐：130个JS（含全部52个测试）+36个非JS，共60篇；测试包含fixture/调用/断言/清理/局限说明。全量本地52/52通过；守卫已要求新增测试也登记正文，机械关联不等于语义认证。真实Windows/Conda/浏览器/手机验收仍未完成。
- **唯一活台账**：review/AUDIT_ROUND3_2026-09-13.md 文末维护者交叉验证（旧证据见review/AUDIT_CROSSCHECK_2026-09-11.md）（外部35项发现、原F01–F38、验收结果与决策）；阶段记录见manager/stages/audit-2026-09-11.md。
- **验收限制**：Windows CI运行34644206411已通过安装器及输入C#编译/PS解析；交互安装/升级/卸载、桌面DPI/剪贴板、浏览器/真实VS Code PTY与手机Arena公网MCP仍未验收。

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
