<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 2：工作台更像他们的会话壳（两条路分清）

## 需求
`review/PROMPT_SHUNCODE.md` 第二阶段：欢迎页/设置把「本机 Chat」和「Bridge」两条路写得像 ShunCode 文档那样分清。MCP session 卡、主题、Health 已有，不重做。用户 2026-09-07 说「继续」授权开工。

## 实现（提交 9d6a2a3，30/30 绿）
- 欢迎页右列新增「两条路」标题 + 两张 walk 卡：`#walk-local-chat`（开智能体窗口；本机 Chat 直接改工作区、vision 模型收截图、不用隧道）、`#walk-bridge`（开设置 Bridge 页；网页 AI 经 MCP、恒文本、要公网地址）
- 设置概述页顶部新增 `#two-paths` 区块：两条路各一段，讲清谁跑模型 / 能碰什么 / 截图可见性 / 隧道需求
- Bridge 页 `#bridge-sub` 补诚实文案：「Bridge 只回文本，远程看不到桌面」
- `bind.js` 两卡接线（`openAgentWindow` / `openModal('bridge')`，均为既有函数，零新增机制）
- `workbenchHtml.test.js` 追加源码锁（三 id + 「两条路」+ 诚实文案 + bind 接线）

## 决策
- **只动文案与布局，不造新页面/新机制**：任务书第二阶段就是「写清分清」，会话卡/主题/Health 明示已有不重做
- 卡片复用 `.walk-card`/`.block` 既有样式，零 CSS 新增
- README 行号引用发现**系统性过期约 8 行**（早于本次改动就漂了），借本次全部按磁盘实测校正（head→dropdowns 全段 + bind L10–L575）

## 边界（未动，等授权）
- 第三阶段 Bridge 回图（MCP image content）：需用户**书面同意**，未动
- 第四阶段 真 PTY / 安装包 / Code-OSS 默认壳：需用户**点名**，未动；`run-webagent-vscode.cmd` 仍是浏览器真 VS Code 的入口

## 待更新文档
- [x] workbench/README.md（描述 + 行号）
- [x] docs-site/content.js（重建）
- [x] manager/CONTEXT.md（当前状态）
- [x] review/REPORT_SHUNCODE_S2.md（交付报告）
