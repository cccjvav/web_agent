<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 3：Bridge 回传图片（MCP image 内容）

## 需求
`review/PROMPT_SHUNCODE.md` 第三阶段：MCP `content:[{type:'image'}]`，等于网页 AI 能看桌面，安全边界变化，**必须用户书面同意**。2026-09-07 用户经 ask_user 选择「书面同意，现在开工」，授权原文存档于 `review/REPORT_SHUNCODE_S3.md`。

## 实现（提交 4bceede 后端 + a6a10e7 文案，30/30 绿）
- `mcp/server.js` tools/call 成功分支：`run_command` → `collectShot`（复用 agent 层：白名单/realpath/6MB）→ content 文本部件后追加 `{type:'image', data:裸 base64, mimeType}`；认不出静默回文本
- 边界不变：危险命令 E_FORBIDDEN、工作区沙箱、base64 不经 eventBus、isError 语义
- 测试：mcpProtocol 行为锁（假 PNG + echo → image 部件；无图不附）；chatVision 源码锁翻转（必须引用 computerUse + type:'image'，禁止广播 base64）；workbenchHtml 文案锁翻转
- 文案全量翻转：工作台三处、技能指南 §10、架构导读 §12（取舍行删除 → 「已经做了」注记）、agents.md、各 README；历史记录（S1/S2 报告、stages、任务书）不改写

## 决策
- **text 永远是 content[0]**：兼容只认文本的老客户端（image 是追加部件，不是替换）
- 复用 computerUse 而非另写 MCP 版：白名单/上限一份实现，两处消费，防边界漂移
- tooBig（>6MB）在 Bridge 侧静默降级为纯文本（远程无法像 Chat 那样对话式提示降 Quality；文本结果里有 stdout 可供判断）
- 行号债偿还：mcp/README method 表（漂 ~33 行）与 tests/README mcpProtocol 明细（漂 ~40 行）借本次全部实测校正

## 待更新文档
- [x] workbench/README.md、src/mcp/README.md、src/agent/README.md、src/tools/README.md、tests/README.md、测试说明.md
- [x] 技能使用指南.md §10、架构导读.md §12、manager/agents.md
- [x] docs-site/content.js 重建
- [x] manager/CONTEXT.md、review/REPORT_SHUNCODE_S3.md

## 复盘
- 安全边界类改动流程跑通：任务书预埋「停下等签字」→ ask_user 拿授权 → 报告存档原文 → 才动共享层。此流程应成为后续同类改动模板。
