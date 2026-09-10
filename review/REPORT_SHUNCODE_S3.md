# 交付报告：ShunCode 对齐 第三阶段（Bridge 回传图片）

- **执行分支**：`arena/01a07238-web-agent`（提交 `4bceede` 后端 + `a6a10e7` 文案 + 本提交；均已推送）
- **任务书**：[PROMPT_SHUNCODE.md](./PROMPT_SHUNCODE.md) 第三阶段（「必须用户书面同意」——已取得，见下）
- **日期**：2026-09-07
- **前序报告**：[S1](./REPORT_SHUNCODE_S1.md) · [S2](./REPORT_SHUNCODE_S2.md)

## 用户书面同意（原文存档）

2026-09-07，本会话 ask_user 交互记录：

> **问**：第三阶段（Bridge 回传图片）：MCP tools/call 增加 {type:'image'} 内容 = 拿着你隧道地址的网页 AI 能看到你的桌面截图。任务书要求你的书面同意才会动。你的决定？
> **答（用户选择）**：「书面同意，现在开工」——本条对话记录即书面凭证；我会把授权原文写进报告再动 mcp/server.js。

同轮用户对第四阶段点名：「依照 shuncode 的形式来……windows 安装包，加上一个基本上就是 vscode 复刻的编辑器」（详见「下一阶段」）。

## 做了什么

**行为变化（唯一一处）**：`src/mcp/server.js` `tools/call` 成功分支——当工具是 `run_command` 时，用 agent 层 `computerUse.collectShot` 从命令串与 stdout 认截图（`-Out` 参数 / mark JSON `"out"` / 裸图片路径），命中白名单（工作区内或仓库根 `computer-use/`，realpath 判定 symlink 逃逸同拒，仅 png/jpg，≤6MB）就在 `content` 数组的文本部件**之后**追加 `{ type:'image', data:<裸 base64>, mimeType }`。认不出截图静默回纯文本；识别异常不影响调用结果。

**不变的边界**：远程危险命令 `E_FORBIDDEN`；工作区路径沙箱；base64 **不经 eventBus 广播**（工作台事件流只见相对路径）；`tools/call` 失败仍是 `isError:true` 文本；其余 24 个工具回包不变。

**配套**：`computerUse.js` 头注释改为「两个消费方」；`skills.js` runHint 翻转（Bridge 会把截图以 image 内容回传）；全部活表面文案翻转（工作台欢迎卡/概述两条路/Bridge 页副标、技能使用指南 §10、架构导读 §12「已经做了」注记、workbench README、manager/agents.md）。历史记录（S1/S2 报告、stages、任务书）保持原样不改写。

## 测了什么

- `tests/mcpProtocol.test.js`（行为锁，真 `handleRpc`）：tmp 工作区写假 PNG → `run_command echo <abs>.png` → 回包 `content[0].type==='text'`、存在 `type:'image'` 部件、`mimeType==='image/png'`、data 为裸 base64（无 `data:` 前缀）；无截图路径的命令**不**附图。
- `tests/chatVision.test.js`（源码锁，第一阶段锁翻转）：`server.js` 必须引用 `computerUse`、必须含 `type:'image'`、**不得** `broadcast(...base64/dataUrl)`。
- `tests/workbenchHtml.test.js`：文案锁翻转（「image 内容」+「签字」）。
- `npm test` → **30/30 passed（exit=0）**，content.js 重建后复测绿。

## 安全姿态（签字后的诚实说明)

拿到隧道地址 = 能看桌面截图（这正是签字的内容）。缓解不变：地址即施工证（勿外传）、任务做完点停止 Bridge、危险命令远程拒绝、白名单/6MB 防任意文件读取与超大回包。工作台 Bridge 页与两条路文案均已写明此代价。

## Windows 真机还缺什么

1. 真机跑 `snap.ps1` → 远程网页 Agent（Arena/ChatGPT 自制插件）实际收到 image 内容并描述画面（部分 MCP 客户端对 image content 的渲染支持不一，需逐个验证）。
2. 大截图（>6MB）走 tooBig 静默降级路径的真机确认。
3. S1 遗留真机项不变（见 S1 报告）。

## 下一阶段（第四阶段，已点名未开工）

用户点名：**Windows 安装包 + Code-OSS（VS Code 复刻）当壳**，图形 UI 参考其持有的 ShunCode 图形页面截图。经查产品分支与仓库内**均无该截图**（只存在于用户与前任助手的聊天里），已请用户补发；收到后开工第四阶段规划（涉及架构导读 §12「交互式 PTY / Code-OSS」取舍改写与 `run-webagent-vscode.cmd` 升级路径）。
