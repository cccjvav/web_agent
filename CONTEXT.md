# Web Agent — 助手索引（不要整份预加载）

给下一任 Agent / 人类接手用。产品怎么点按钮：根目录 `使用指南.md`。本文件只指路。

## 现在在干什么

- 产品：本机工作台 + agent-host MCP 桥。网页 AI 改**当前工作区**，不是 exe。
- 分支：只推会话固定分支（本线是 `arena/01a05d84-web-agent`）。
- 进行中：本机 Chat 视觉 + `computer-use`（任务书 `review/PROMPT_SHUNCODE.md` 第一阶段）。Bridge **不要**回传桌面截图，除非用户另说。

## 该读哪份（按需，一次一两份）

| 你遇到的问题 | 打开 |
|---|---|
| 为什么两端口、隧道、沙箱 | `架构导读.md`（四层写法） |
| Windows 从安装到 Bridge | `使用指南.md` |
| Skill 放哪、computer-use | `技能使用指南.md`（第 10 节） |
| 已知不做什么 | `架构导读.md` 第 12 节、`SECURITY.md` |
| 审查记录 | `review/README.md` |
| 往 ShunCode 对齐 | `review/PROMPT_SHUNCODE.md` |
| 桌面键鼠脚本 | `computer-use/SKILL.md`（本机 Chat 才有「眼」） |
| 本管家 Skill | `project-manager/SKILL.md` |

## 不要做

TypeScript；拆前后端仓；vendor ShunCode / DeepSeek++；改 `webagent-repro/` JS；Flask；Codex OAuth；REPORT_v6 拆文件；把 MCP 地址发到公开处。

## 下一任开场

1. `load_skill` 名 `project-manager`（或先读本文件）。
2. `git log --oneline -8`、`git status`。
3. 只再读上表里对得上的那一份。
