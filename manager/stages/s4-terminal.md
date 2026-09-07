<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 4：终端化（Windows 安装包 + Code-OSS 当默认壳 + UI 对齐）

## 需求与授权
- 任务书第四阶段三子项：真 PTY / 安装包 / Code-OSS 当默认壳；「不要做 Electron exe，除非用户点名」。
- 用户 2026-09-07 点名：**Windows 安装包 + 「基本上就是 vscode 复刻的编辑器」当壳**；图形 UI 参考其 ShunCode 截图。**真 PTY 未点名，仍不做**（架构导读 §12 该取舍保留）。
- UI 参考资料：用户 2026-09-07 补发 18 张 ShunCode 截图（17 张不重复）。**注意：附件字节未落到沙箱盘（/home/user/uploads 缺失，回收时序事故），内容已由会话目视确认并记录于下文索引；图片字节待用户经产品分支入仓或重发后补齐到 `review/shuncode-ui/`。**

## 参考资料索引（目视记录，文件名=用户附件原名 → 内容）
| # | 原附件 | 画面 |
|---|---|---|
| 01 | Screenshot_2026-09-01-17-20-16 | 欢迎页深色：启动/最近/演练三块，右侧 CHAT 空态「使用智能体构建」+「生成智能体指令」链接 |
| 02 | Screenshot_2026-09-01-17-20-50 | 设置概述模态：自定义智能体输入 + 卡片宫格（智能体/技能/指令/挂钩/MCP/插件/Voice/Dictation） |
| 03 | Screenshot_2026-09-01-17-21-09 | Bridge 页停止态：启动 Bridge/复制提示词/打开 ChatGPT/Arena/WorkBuddy/Trae/Qwen/Manus/Shunova 按钮排、账号与授权（GitHub 登录）、连接设置（Quick/Named Tunnel 卡） |
| 04 | Screenshot_2026-09-01-17-23-04 | Bridge 运行态：MCP 地址+复制、黄条「临时地址已复制…替换」、停止 Bridge、已授权/已就绪 pill、快速打开/高级设置折叠 |
| 05 | IMG_20260902_102357 | 右栏 BRIDGE 视图：Tasks 列表、工具卡（Explored/Found/git/Read + ms）、MCP session 卡（Stop Bridge + 4 统计格 + Streamable HTTP · Last tool 行 + output-only 注）、内置浏览器 tab 连 Arena、底部真终端 PS 提示符 |
| 06 | Screenshot_2026-09-02-10-16-43 | API Provider 页：Add API Provider 表单（Endpoint+Key+Test+Add API）、模型表（名称/上下文大小/功能 pill/定价）、底部「key kept in secure secret storage」注 |
| 07 | Screenshot_2026-09-02-10-17-14 | 多模型博弈页深色：说明 bullet + 设置块（启用开关/合并主模型+选择…/使用当前对话模型/合并思考强度/只读验证勾/每回合最大分支数） |
| 08 | Screenshot_2026-09-02-10-18-24 | 内置浏览器双 tab（Arena+WorkBuddy）并排；右下 Agent 菜单：ShunCode Ask / Code / Plan / 配置自定义智能体（Ctrl+Shift+I） |
| 09 | Screenshot_2026-09-02-10-19-57 | 工具卡**失败态**：红框「list_directory failed / read_files failed」+ Failed 徽标 + 说明句 |
| 10 | Screenshot_2026-09-05-18-00-36 | 多模型博弈页**浅色**主题全貌 |
| 11 | Screenshot_2026-09-05-18-01-17 | 同上局部放大（选择…按钮 tooltip「从已配置的模型中选择合并主模型」） |
| 12 | Screenshot_2026-09-05-18-04-25 | 合并主模型选择弹窗：搜索框 + 行「显示名 vendor/endpoint::modelid」+「Current merge model」灰注 |
| 13 | Screenshot_2026-09-05-18-06-32 | ChatGPT tab 内模型搜索弹窗：行尾「Chat Completions · https://…endpoint」 |
| 14 | Screenshot_2026-09-05-18-07-13 | 模型切换弹窗 + Max context 160K / Configurable / Thinking Effort 行；「Switching models mid-session resets prompt cache」黄注 |
| 15 | Screenshot_2026-09-05-18-14-05 | 回合消息右下蓝徽标「gpt-5.6-sol · 分支 4/4」+ 验证要求长文 |
| 16 | Screenshot_2026-09-05-18-15-09 | 同上 + 红圈标「总结/合并」按钮（工具条第三个） |
| 17 | Image_1788771083710.png | MCP session 卡**浅色**：Stop Bridge/Health/Clear log + 4 统计格（745 calls/2.3s/40/94.6%） |

## 与现有工作台的差距（目视比对结论）
**已对齐（不动）**：欢迎页三块结构、设置模态 nav 全页、Bridge 页元素集（启动/停止/复制/客户端打开/授权/隧道卡）、MCP session 4 统计格、多模型博弈设置项、Agent 三模式+自定义、内置浏览器多 tab、双主题。
**差距清单（S4-3 范围，按价值排序）**：
1. **可搜索模型选择弹窗**（06/12/13/14）：现为原生 `<select>`；改为带搜索框的弹层，行显示「显示名 + vendor/endpoint::modelid + 能力 pill + 上下文」，合并主模型选择复用同一组件并标「Current merge model」。
2. **工具卡失败态红色样式**（09）：失败工具卡红框 + Failed 徽标 + 一句人话原因（现样式未区分成败色）。
3. **回合分支徽标**（15/16）：多模型博弈回合消息右下「模型名 · 分支 x/y」蓝徽标（现有 plan-badge 只标 Plan）。
4. **Bridge 页折叠分组**（04）：「快速打开」「高级设置」两块折叠，减少首屏高度。
5. 聊天输入下 chip 行补「本地 / 默认审批」语义标签（08 右下）。
**不做**：真 PTY（未点名）、Electron、vendor 任何 ShunCode 代码/资源（截图仅作设计参考，不抠图不抄素材）。

## 子计划
 - **S4-1 安装包（Inno Setup，非 Electron，提交 4a85ecf）**：`installer/webagent.iss` + `installer/build-installer.cmd` + `installer/README.md`。装：仓库文件（排 node_modules/.cache/code-server-runtime）+ 开始菜单/桌面快捷方式（**默认指向 run-webagent-vscode.cmd**）+ 卸载项；前置检查 Node≥18/npm，缺则指引 check-env.cmd；code-server 仍首跑自下载（gitignore 既定）。沙箱无法编译 .iss：交付脚本+文档+语法自查清单，真机编译列进验收。
 - **S4-2 Code-OSS 当默认壳（提交 8a73df0，文档口径）**：安装器与文档把 `run-webagent-vscode.cmd` 立为主入口（桌面图标=它），`run-webagent.cmd` 改名语义「经典工作台（备用）」；启动脚本说明.md / 使用指南.md / 架构导读 §12 同步（§12「Code-OSS 当默认壳」行从不做表移入「已经做了」）。
 - **S4-3 UI 对齐（提交 8a73df0 抛光 + ce6d52f 弹层）**：差距 1（可搜索模型弹层 picker.js）、3（branch-pill）、5（composer chip）已做；**差距 2/4 侦察发现早已实现**（失败卡红框+Failed、Bridge 快速打开/高级设置 details），从清单移除；全部带 workbenchHtml 锁 + README 行号校正 + content.js 重建。
- **S4-4 资料补齐**：截图字节入 `review/shuncode-ui/`（待用户重发或产品分支入仓后 fetch）。

## 决策
- 安装器选 **Inno Setup** 而非 NSIS/zip：单文件 exe、标准卸载、脚本可读可审；不碰 Electron 红线。
- 默认壳 = Code-OSS 但**不删**自研工作台：双入口都在，安装器只改默认快捷方式（回退零成本）。
- 截图只作设计参考：不入库 vendor 素材、不抠图；差距清单只描述布局与交互语义。

## 待更新文档
- [x] 启动脚本说明.md、使用指南.md、架构导读.md §12、installer/README.md（新）
- [x] workbench/README.md、tests/README.md
- [x] manager/CONTEXT.md
- [ ] review/REPORT_SHUNCODE_S4.md（收尾时写：含真机验收清单——.iss 编译/安装冒烟/模型弹层浏览器交互/远程客户端实收 image）
- [ ] S4-4 截图字节入 review/shuncode-ui/（用户自行入仓后 fetch 核对）
