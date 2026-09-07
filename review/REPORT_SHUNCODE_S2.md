# 交付报告：ShunCode 对齐 第二阶段（工作台更像他们的会话壳）

- **执行分支**：`arena/01a07238-web-agent`（提交 `9d6a2a3`，已推送；此前合并产品分支 tip `92b3e93` → `2d1a4b9`）
- **任务书**：[PROMPT_SHUNCODE.md](./PROMPT_SHUNCODE.md) 第二阶段；用户 2026-09-07 口头「继续」授权
- **日期**：2026-09-07
- **第一阶段报告**：[REPORT_SHUNCODE_S1.md](./REPORT_SHUNCODE_S1.md)

## 做了什么（任务书原文：欢迎页/设置把「本机 Chat」和「Bridge」两条路写得像 ShunCode 文档那样分清）

| 位置 | 改动 |
|---|---|
| 欢迎页右列 | 新增「两条路」标题 + 两张卡：`#walk-local-chat`（本机 Chat——直接改工作区、computer-use 脚本、vision 模型收截图、不用隧道；点击开智能体窗口）、`#walk-bridge`（Bridge——工作区变 MCP 给网页 AI、只回文本、危险命令被拒、要公网地址；点击开设置 Bridge 页） |
| 设置概述页 | 顶部 `#two-paths` 区块：两条路各一段，讲清**谁跑模型 / 能碰什么 / 截图可见性 / 隧道需求** |
| Bridge 页 | `#bridge-sub` 补「Bridge 只回文本，远程看不到桌面」，与第一阶段诚实口径一致 |
| bind.js | 两卡接线，全部复用既有 `openAgentWindow`/`openModal`，零新机制 |

**明确没做**（任务书划界）：MCP session 卡、主题、Health 已有不重做；未动任何后端行为。

## 测了什么

`tests/workbenchHtml.test.js` 追加源码锁：三个新 id、「两条路」文案、「Bridge 只回文本」诚实文案、bind.js 接线。`npm test` → **30/30 passed（exit=0）**，`docs-site/content.js` 重建后复测仍绿。

## 顺手修复

workbench/README.md 的 index.html 行号引用**在本次改动之前就已漂移约 8 行**（titlebar 时代起），本次全部按磁盘实测重写（head L3–L15 … 下拉 L631–L650，bind L10–L575），并同步了三处功能描述。

## Windows 真机待办（并入既有清单）

- 浏览器里看一眼欢迎页两张卡与概述页 `#two-paths` 的排版（浅/深两主题）。
- 第一阶段遗留真机项不变（见 REPORT_SHUNCODE_S1.md）。

## 下一阶段授权状态

- **第三阶段（Bridge 回传图片）**：任务书要求用户**书面同意**（安全边界变化：网页 AI 能看桌面）。尚未取得，未动。
- **第四阶段（真 PTY / 安装包 / Code-OSS 默认壳）**：任务书要求用户**点名**。尚未点名，未动；Electron exe 明确不做除非点名。
