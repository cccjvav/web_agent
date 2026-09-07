# 交付报告：ShunCode 对齐 第一阶段（本机 Chat 的「眼 + 手」最小集）

- **执行分支**：`arena/01a07238-web-agent`（审查会话固定分支；已按任务书第 0 步合并 `arena/01a05d84-web-agent` tip `1f2bcf6`）
- **任务书**：[PROMPT_SHUNCODE.md](./PROMPT_SHUNCODE.md) 第一阶段；第二～四阶段未动
- **日期**：2026-09-07

## 施工进度（滚动更新，兼作中断恢复锚点）

| 批次 | 内容 | 状态 |
|---|---|---|
| B1 | 后端「眼+手」：computerUse.js / openai.js / skills.js / routes.js + chatVision.test + 四份文档同步 + content.js 重建 | ✅ 30/30 绿，已提交推送 |
| B2 | 设置页 vision 勾选（index.html/bind.js/settings.js）+ workbench README + 测试锁 | ⏳ 进行中 |
| B3 | 技能使用指南 §10 重写 + 架构导读 §12 更新 + content.js 重建 | ⏳ 待做 |
| B4 | 本报告定稿 + 最终 npm test 输出 | ⏳ 待做 |

## 做了什么（B1 明细）

### 「手」——模型能跑仓库根的 computer-use 脚本（选的做法：薄转发，executor 零改动）

- **调研结论**：`executor.js` 只锁 **cwd**（`workingDirFrom`→`resolveSafePath`），命令串本来就可以引用工作区外路径——这是 SECURITY.md/架构导读已披露的边界；`powershell -File …` 也不触发 `dangerous.js`（它只拦 `-EncodedCommand` 等）。所以任务书两个允许方案中选了**成本最低的薄转发**：不动 executor、不加白名单代码，改为把「怎么跑」直接喂给模型。
- `src/tools/skills.js` `loadSkill({name})`：返回新增 `absDir`；`computer-use` 额外返回 `scriptsDir`（仓库根 `computer-use/win` 绝对路径）与 `runHint`（现成命令模板：`& "<scriptsDir>\snap.ps1" -WindowTitle <子串> -Out shots\cur.png`，并写明截图要 `-Out` 到工作区内、Bridge 不回传图片）。
- **没有**放开任意 `D:\` 读文件；`read_files`/`resolveSafePath` 一字未动。

### 「眼」——截图作为图片进下一轮请求（仅本机 Chat；Bridge 不动）

- 新文件 `src/agent/computerUse.js`（108 行）：
  - `findShotCandidates`：从 run_command 的命令串认 `-Out <路径>`（带/不带引号），从 stdout 认 mark.ps1 的 `"out":"….png"` JSON 与裸图片路径。
  - `resolveShotPath`：**白名单** = 工作区内（realpath 判定，symlink 逃逸同拒）或仓库根 `computer-use/` 内；仅 `.png/.jpg/.jpeg`。
  - `readShotAsDataUrl`：上限 **6MB**，转 `data:image/<mime>;base64,…`。
  - `collectShot`：主入口，超限返回 `{tooBig}` 供诚实提示。
- `src/agent/openai.js`：
  - `modelSeesImages(model)`：`model.vision === true` 或 `caps/capabilities` 含 `vision`。
  - 工具循环里 `run_command` 成功后 `collectShot`；vision 模型 → 追加 `role:'user'` 多模态消息（text + `image_url` data URL）进下一轮；**纯文本模型 → 永不附图**，注入 `[系统提示]` 要求模型如实转告「当前模型不会看图，computer-use 看不了屏幕」，同时 emit status 让 UI 直接可见（诚实失败，不假装 OCR）。
  - 超 6MB → 提示降 `-Quality` 重截。
  - base64 **只进模型请求体**；eventBus/事件流只带相对路径（测试锁断言事件不含 base64）。
- `src/api/routes.js`：`/api/status` models 映射新增 `vision: Boolean(m.vision)`（不泄露 apiKey 的既有约定不变）。
- **MCP/Bridge 零改动**：`mcp/server.js` 未引用 computerUse，`tools/call` 仍只回 `type:'text'`——chatVision.test 有源码锁。

### 测试（不依赖真显示器）

`tests/chatVision.test.js`（新，第 30 个）：假 PNG + 本地假 provider（脚本化两轮响应、记录请求体）。覆盖：解析三来源、白名单四拒绝（区外/非图/symlink/不存在）、vision 判定、load_skill 转发说明、**集成**（vision 模型第二轮请求含 `image_url`+data URL、第一轮无图、事件流无 base64；纯文本模型全程无图+诚实提示注入）、MCP 不变源码锁。`npm test` **30/30 全绿**。

### 文档同步（B1 部分）

`src/agent/README.md`（openai 节重写 + computerUse 新节 + 文件清单）、`src/tools/README.md`（loadSkill 返回）、`tests/README.md`（表行 + 明细节）、`测试说明.md`（表行）、`docs-site/content.js`（build 重建，docsSite.test 过）。

## Bridge 为何没动

任务书第一阶段第 5 条：网页 MCP 回图 = 远程 AI 能看桌面，安全边界变化，属第三阶段、需用户书面同意。本实现把图片通路完全关在 agent 层（`src/agent/computerUse.js` 只被 `openai.js` 引用），MCP 协议层物理上摸不到它，并加了防回潮源码锁。

## Windows 真机还缺什么（沙箱为 Linux，无法覆盖）

1. 真跑 `snap.ps1/act-bg.ps1/type.ps1`（PowerShell + Win32 API）；沙箱只验证了命令解析与图片管线协议。
2. 真视觉模型端到端（如 GPT-4o/GLM-4V 兼容端点）看图 → 报坐标 → mark/act-bg。
3. 设置页 vision 勾选的浏览器交互（B2 交付后）。
4. 以上已并入 `CHECKLIST_WINDOWS.md` 的执行框架，建议真机验证时补一条「computer-use 冒烟」。

## 已知取舍（第一阶段范围内有意为之）

- 每轮 run_command 后只附**第一张**可解析截图（多目标连拍场景模型可分多轮）；
- vision 判定不做 modelId 猜测（`gpt-4o` 之类不自动放行）——宁可让用户显式勾选，符合「诚实失败」要求；
- 截图白名单含仓库根 `computer-use/`（兼容 `-Out` 写到 shots/ 老习惯的用法），仍不放开任意路径。
