# review/shuncode-ui/ — 参考截图索引（第四阶段设计依据）

**本项目是 Web Agent（webagent）**。本夹存放的是**参考产品 ShunCode** 的界面截图（源自同名 bilibili 频道视频帧，用户 2026-09-07 两批网页上传入仓：`758532a` 16 张 + `176cabf` 补齐 2 张，共 18 张；与原归档重复的原件已 `git rm` 去重）。**参考归参考：产品命名、文案归属一律以 Web Agent 为准**，本夹只作设计对照，不抠图、不复制素材、不引入 vendor 代码。

## 命名与归属约定
- 文件名 = `NN-<画面主体>.<ext>`，**主体指截图里正在被参考的那个界面**；本项目组件名不出现在这里（我们的实现见 workbench README 与 REPORT_SHUNCODE_S4）。
- 帧内**内嵌的第三方画面**（ChatGPT 客户端网页、WorkBuddy 网页、Arena 网页）只作背景，在索引「背景」列注明，**不进文件名**——上一版把 12/13 的 ShunCode 模型弹层误命名为 `chatgpt-*`（ChatGPT 只是内嵌背景），已纠正为 `shuncode-*`。
- 归属判据：ShunCode 欢迎页品牌字（01）、聊天面板署名与水印（05/18）、弹层锚定其底部 composer 且列出其 API Provider 自定义端点（11–13）。

## 索引（18 张）
| 文件 | 主体画面 | 背景/备注 |
|---|---|---|
| 01-welcome-dark.jpg | ShunCode 欢迎页深色（品牌字「ShunCode 编辑进化」）：启动/最近/演练，右 CHAT 空态 | — |
| 02-settings-overview-dark.jpg | ShunCode 设置概述模态：自定义智能体 + 卡片宫格 | — |
| 03-bridge-stopped-dark.jpg | ShunCode Bridge 停止态：按钮排/账号与授权/连接设置隧道卡 | — |
| 04-bridge-running-dark.jpg | ShunCode Bridge 运行态：MCP 地址+黄条/停止/已授权/已就绪/折叠组 | — |
| 05-bridge-waiting-arena-tab.jpg | ShunCode Bridge 等待态：「Waiting for the remote Agent…」+ 零统计 | 内置浏览器 Arena 网页空态（贴 MCP URL 引导句） |
| 06-bridge-sidebar-mcp-session.jpg | ShunCode 右栏 BRIDGE：Tasks/工具卡(ms)/MCP session 4 统计格 | 屏摄；底部真终端 |
| 07-api-provider-dark.jpg | ShunCode API Provider：Add 表单 + 模型表（名称/上下文/能力 pill/定价） | — |
| 08-dual-browser-agent-menu.jpg | ShunCode 内置浏览器双 tab；Agent 菜单 Ask/Code/Plan/配置自定义智能体 | — |
| 09-multimodel-light.jpg | ShunCode 多模型博弈页浅色全貌 | — |
| 10-multimodel-light-zoom.jpg | 同上放大（选择… tooltip） | — |
| 11-merge-model-picker.jpg | ShunCode 合并主模型搜索弹窗 + Current merge model 灰注 | — |
| 12-shuncode-model-search.jpg | ShunCode 模型搜索弹窗：Search models + 行尾 Chat Completions · endpoint | 内嵌 ChatGPT 客户端网页作背景 |
| 13-shuncode-switch-thinking.jpg | ShunCode 切换模型弹窗：Max Context/Thinking Effort + 缓存重置黄注 | 内嵌 ChatGPT 客户端网页作背景 |
| 14-branch-badge-4of4.jpg | ShunCode 回合右下蓝徽标「模型 · 分支 4/4」 | — |
| 15-merge-summarize-button.jpg | ShunCode「总结/合并」按钮位置红圈 | — |
| 16-mcp-session-light.png | ShunCode MCP session 卡浅色：Stop/Health/Clear log + 4 统计格 | — |
| 17-multimodel-settings-dark.jpg | ShunCode 设置「多模型博弈」页深色：启用开关/合并主模型/思考强度/只读验证/每回合分支数 | 顶栏内置浏览器 Arena 与 WorkBuddy 两 tab |
| 18-failed-toolcards-red.jpg | ShunCode 聊天面板失败工具卡红框 + Failed 标（list_directory/read_files） | 三屏对照：左 Arena 网页、中 WorkBuddy 网页 |

## 安装系列（第三批 `1eb1cad`，2026-09-07 夜上传）与技术栈取证
| 文件 | 主体画面 | 背景/备注 |
|---|---|---|
| 19-install-exe-versions.jpg | 资源管理器：ShunCode-0.5.0→0.6.5-win32-x64-Setup.exe 历版安装包（各约 224MB） | tooltip：ShunCode Setup / 0.6.5.0 / 219MB |
| 20-install-license.jpg | 安装向导许可协议页：MIT + Copyright Microsoft Corporation（= Code-OSS 许可证原文） | 单选「我同意/我不同意」= Inno Setup 页式 |
| 21-install-destdir.jpg | 选择目标位置：默认 `D:\Program Files\ShunCode`，提示装后需 1.10GB | 系统级安装（非 per-user） |
| 22-install-startmenu.jpg | 选择开始菜单文件夹：ShunCode + 「不创建」复选 | Inno 标准页 |
| 23-install-additional-tasks.jpg | 附加任务：桌面快捷方式 / 「通过 ShunCode 打开」文件+目录上下文菜单 / 注册为受支持文件类型编辑器 / 添加到 PATH | 任务集与 VS Code 官方安装器同构 |
| 24-install-ready.jpg | 准备安装汇总页 | Inno 标准页 |
| 25-install-finished-launch.jpg | 安装完成页 + 「运行 ShunCode」复选 + 完成按钮 | 太极 logo |

**技术栈结论（取证）**：ShunCode = **Code-OSS（VS Code）分支桌面版 ⇒ 运行时必为 Electron**（许可页 MIT/Microsoft 原文 + VS Code 同构界面 + 224MB 安装包/1.1GB 装后体积佐证；未拍到关于页/安装目录，属高置信推断）；**安装包工具 = Inno Setup**（各页中文文案与 Inno 逐字一致，标题「安装 - ShunCode」），与我方 `installer/webagent.iss` 同工具；附加任务集照搬 VS Code（上下文菜单×2、注册编辑器、PATH）。

## 隐私说明
截图含已失效的 trycloudflare 临时地址、公开账号名、他人本机路径（如视频作者工作区目录）——作为历史参考保留；**不要**把其中任何 URL/路径/令牌抄进文档或代码。
