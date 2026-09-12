<!-- 定位：项目上下文索引，L1 启动时加载的唯一索引文件，回答「是什么、做到哪、详情在哪」 -->

# Web Agent - 上下文索引

## 项目身份
- **目标**：本机工作台 + agent-host，让网页 AI 经 MCP 改当前工作区
- **技术栈**：Node（无 TypeScript）、Express 双端口 3000/48271、工作台原生 JS
- **创建时间**：2026-09

## 当前状态
- **阶段**：2026-09-11审计交叉验证与分批修复；历史S4/S6代码完成不代表缺陷清零。
- **正在做**：精细复盘累计33个源码文件；新增MCP目录8文件、控制面/Origin/事件总线3文件，覆盖函数/类方法/路由回调，52/52通过。API、其他工具、UI/扩展、平台脚本等仍未全量完成；Conda/Windows交互未实测。
- **唯一活台账**：review/AUDIT_CROSSCHECK_2026-09-11.md（外部35项发现、原F01–F38、验收结果与决策）；阶段记录见manager/stages/audit-2026-09-11.md。
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
