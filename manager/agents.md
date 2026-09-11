<!-- 定位：项目约定，记录技术环境、编码规范、开发流程等对所有任务通用的项目级约定 -->

# Web Agent 项目约定

## 技术环境
- **语言**：JavaScript（禁止 TypeScript 重写）
- **运行**：Node >=18（CI 用 20）；同一进程双端口，不拆前后端仓
- **测试**：`cd webagent-core/agent-host && npm test` 或根目录 `run-tests.cmd`

## 编码规范
- 解释对得上磁盘，不杜撰未实现的逻辑
- 改功能同步对应夹 README；动「为什么这样装」改根 `架构导读.md`（四层）
- 文档唯一规范：`manager/docs/documentation.md`；先审查正文，再运行 `node docs-site/check-docs.js --write` 与 `node docs-site/build.js`，禁止把结构校验等同语义认证。

## 开发流程
- 只提交、只推当前 Arena 固定分支
- 测绿再 commit，不要攒大包（`commit-now` Skill）
- 不要改 `webagent-repro/` 的 JS；不要 vendor ShunCode / DeepSeek++ / Chat Plus

## 工具偏好
- 壳 = workbench/extension，引擎 = agent-host
- Windows 用户指南用 CMD，不要改成 bash
- Bridge 会把 run_command 的桌面截图回给网页模型（第三阶段，用户 2026-09-07 书面签字）；computerUse 白名单 / 6MB 边界不变
