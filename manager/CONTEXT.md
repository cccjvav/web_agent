<!-- 定位：项目上下文索引，L1 启动时加载的唯一索引文件，回答「是什么、做到哪、详情在哪」 -->

# Web Agent - 上下文索引

## 项目身份
- **目标**：本机工作台 + agent-host，让网页 AI 经 MCP 改当前工作区
- **技术栈**：Node（无 TypeScript）、Express 双端口 3000/48271、工作台原生 JS
- **创建时间**：2026-09

## 当前状态
- **阶段**：S1-本机 Chat 视觉与交接（代码已完成，待 Windows 真机冒烟）
- **正在做**：PROMPT_SHUNCODE 第一阶段已在会话分支 `arena/01a07238-web-agent` 交付（4fb4fcd/71c2806/3300e9d/f61b09c，并合并产品分支 tip 92b3e93 → 2d1a4b9）
- **阻塞项**：Windows 真机冒烟未做（真跑 ps1 / 真视觉模型端到端）；Bridge 回图属第三阶段，需用户书面签字，未动

## 已完成阶段摘要
| 阶段 | 做了什么 | 详情 |
|------|----------|------|
| 审查闭环 | V4-1 / V3-2 / V3-4，过程文档进 review/ | → review/README.md |
| computer-use | 仓库根脚本 + load_skill 按名 | → computer-use/SKILL.md |
| 项目管家 | 官方 SKILL 进 project-manager/ | → manager/stages/s1-handoff.md |
| ShunCode 第一阶段 | 本机 Chat「眼+手」：vision 模型收截图 image_url、纯文本模型诚实拒看、Bridge 恒 text 零改动 | → review/REPORT_SHUNCODE_S1.md |

## 导航规则
- 为什么两端口/隧道/沙箱 → `架构导读.md`
- Windows 从安装到 Bridge → `使用指南.md`
- Skill / computer-use → `技能使用指南.md`
- 有意不做 → `架构导读.md` 第 12 节、`SECURITY.md`
- 往 ShunCode 对齐 → `review/PROMPT_SHUNCODE.md`
- 中断恢复 / 施工进度 / 第一阶段明细 → `review/REPORT_SHUNCODE_S1.md`（含恢复锚点表）
- 沙箱回收、测试假绿等踩坑经验 → `manager/docs/experience.md`
- 项目约定 → `manager/agents.md`
- 规则全文（load_skill 截断时）→ `manager/SKILL.md` 或 `project-manager/SKILL.md`

## 遗留问题
→ manager/docs/experience.md#遗留问题追踪
