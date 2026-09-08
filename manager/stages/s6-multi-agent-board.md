<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 6：多 Agent 任务板（MCP 复用 → 互知 + 临时任务分配）

## 需求与授权
- 用户 2026-09-08：ShunCode 官方称其 MCP 支持复用（多网页 agent 同连）；希望我们设计「互知 + 临时所属任务表」，**利用 skills、像 computer-use 一样内置**；用户自陈小白想法，工程实现授权助手完善。
- 信任边界评估：板子只存任务元数据（标题/状态/归属/注记），不扩文件/命令权限、不含对话与密钥 ⇒ 与既有工具同边界，**无需第三阶段式书面同意**（该同意仅针对 Bridge 回传桌面截图）。

## 设计（用户想法的工程化）
- **互知**：会话注册表（mcp/session.js，键 clientName@ip）本就存在 ⇒ 暴露为 `peers_list`（10 分钟 alive 窗）。
- **临时任务表**：`.webagent/board.json`（随工作区、删即清）；5 工具：peers_list/board_list/board_create/board_claim/board_update。
- **认领原子**：单写者 promise 队列串行化读-改-写；并发 claim 仅一胜，输家 E_TAKEN（带 owner）。
- **归属身份**：tools/call 穿 callerKey（Mcp-Session-Id→initialize 键绑定；无头时 ip 回落且具名行优先）；所有 touch 身份感知，杜绝匿名 mcp@ip 幻影 peer。
- **权限矩阵**：状态仅 owner 改（open=释放）；注记任何在场者可加；done/failed 为终态信号（交付以仓库改动为准）。
- **是分配不是协作**：无消息总线、无锁步；协作协议留作未来候选（用户提及「还没有引申出这个能力」）。

## 落地
- C1 `507ceb9`：src/tools/board.js + 5 工具注册 + session 身份 + board.test.js/mcpBoard.test.js（32/32）。
- C2（本提交）：内置 skill `multi-agent-board/`（BUNDLED_SKILL_NAMES 第三位）+ 技能使用指南/架构导读/CHECKLIST D13 + 本文件。

## 验收
真机基线 D13：双网页客户端同连互见、跨客户端认领竞争、owner/注记权限、板文件落盘与保留。
