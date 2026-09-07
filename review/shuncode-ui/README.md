# review/shuncode-ui/ — ShunCode 界面参考截图（第四阶段设计依据）

**来源**：用户 2026-09-07 经网页上传入仓（提交 `758532a`，原名 `review/Screenshot_*` / `IMG_*` / `Image_*`），本夹为重命名归档（`git mv`，历史可溯）。目视索引与差距分析见 `manager/stages/s4-terminal.md`。

**用途**：仅设计参考（布局/交互语义/文案口径）。**不**从中抠图、**不**复制素材进产品代码；vendor ShunCode 代码仍是红线。

**隐私说明**：截图含已失效的 trycloudflare 临时地址、公开 GitHub 账号名、用户本机 Windows 路径——作为历史参考保留；**不要**把其中任何 URL/路径/令牌抄进文档或代码（临时地址已作废，但习惯要守）。

## 索引（新名 ← 原附件名 → 画面）
| 文件 | 原附件 | 画面 |
|---|---|---|
| 01-welcome-dark.jpg | Screenshot_2026-09-01-17-20-16 | 欢迎页深色：启动/最近/演练，右 CHAT 空态「使用智能体构建」 |
| 02-settings-overview-dark.jpg | Screenshot_2026-09-01-17-20-50 | 设置概述模态：自定义智能体 + 卡片宫格 |
| 03-bridge-stopped-dark.jpg | Screenshot_2026-09-01-17-21-09 | Bridge 停止态：按钮排/账号与授权/连接设置隧道卡 |
| 04-bridge-running-dark.jpg | Screenshot_2026-09-01-17-23-04 | Bridge 运行态：MCP 地址+黄条提示/停止/已授权/已就绪/折叠组 |
| 05-bridge-waiting-arena-tab.jpg | Screenshot_2026-09-01-17-23-34（**上传新增**，附件轮没有） | Bridge **等待态**：右栏「Waiting for the remote Agent…Input stays in the external client」+ 零统计；内置浏览器 Arena 空态（贴 MCP URL 引导句）、「Connect your GitHub」条 |
| 06-bridge-sidebar-mcp-session.jpg | IMG_20260902_102357 | 右栏 BRIDGE：Tasks/工具卡(ms)/MCP session 4 统计格/output-only 注；底部真终端 |
| 07-api-provider-dark.jpg | Screenshot_2026-09-02-10-16-43 | API Provider：Add 表单 + 模型表（名称/上下文/功能 pill/定价） |
| 08-dual-browser-agent-menu.jpg | Screenshot_2026-09-02-10-18-24 | 内置浏览器双 tab；Agent 菜单 Ask/Code/Plan/配置自定义智能体 |
| 09-multimodel-light.jpg | Screenshot_2026-09-05-18-00-36 | 多模型博弈页浅色全貌 |
| 10-multimodel-light-zoom.jpg | Screenshot_2026-09-05-18-01-17 | 同上放大（选择… tooltip） |
| 11-merge-model-picker.jpg | Screenshot_2026-09-05-18-04-25 | 合并主模型搜索弹窗 + Current merge model 灰注 |
| 12-chatgpt-model-search.jpg | Screenshot_2026-09-05-18-06-32 | 模型搜索弹窗：行尾 Chat Completions · endpoint |
| 13-chatgpt-switch-thinking.jpg | Screenshot_2026-09-05-18-07-13 | 切换模型弹窗 + Max context/Thinking Effort + 缓存重置黄注 |
| 14-branch-badge-4of4.jpg | Screenshot_2026-09-05-18-14-05 | 回合右下蓝徽标「模型 · 分支 4/4」 |
| 15-merge-summarize-button.jpg | Screenshot_2026-09-05-18-15-09 | 红圈标「总结/合并」按钮位置 |
| 16-mcp-session-light.png | Image_1788771083710.png | MCP session 卡浅色：Stop/Health/Clear log + 4 统计格 |

**未入仓的 2 张**（附件轮见过、上传轮缺失，内容仍以 `manager/stages/s4-terminal.md` 目视记录为准）：`Screenshot_2026-09-02-10-17-14`（多模型博弈深色）、`Screenshot_2026-09-02-10-19-57`（WorkBuddy + 失败工具卡红框）。
