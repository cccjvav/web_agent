# 任务书：把 Web Agent 往 ShunCode 的「本机助手」对齐（不是换招牌）

> 给审查/开发助手。**不是**产品使用指南。用户操作仍看仓库根 `使用指南.md`。
>
> 本文件在 `arena/01a05d84-web-agent`。你的 Arena 会话若固定在别的分支：先把本分支 **合并进你被固定的分支**，再按下面做。**不要 `git checkout` 离开你的固定分支**，不要推别的分支。

对照：旧审查提示词 [PROMPT.md](./PROMPT.md) 的 1–10 与 N1–N3、V3/V4 **已经做完**，不要重做。v6 拆文件（[REPORT_v6.md](./REPORT_v6.md)）**不要当施工单**。

---

## 0. 你必须先做的 Git

```bat
git fetch origin refs/heads/arena/01a05d84-web-agent:refs/remotes/origin/arena/01a05d84-web-agent
git log --oneline -5 origin/arena/01a05d84-web-agent
```

把 `origin/arena/01a05d84-web-agent` **合并进你当前被固定的分支**（能快进就快进；有分叉就 merge，不要 rebase 丢掉审查记录）。冲突时保留本任务书与 `computer-use/`。

合并后确认至少有：

- 仓库根 `computer-use/SKILL.md` 与 `computer-use/win/`
- `webagent-core/agent-host/src/tools/skills.js` 里 `bundledSkills()`（`load_skill` 能按名字 `computer-use` 找到）
- 本文件 `review/PROMPT_SHUNCODE.md`

当前产品 tip 在写任务书时是 `8220106` 一带；**以你 fetch 到的 origin 为准**，不要死记哈希。

---

## 1. 背景（已核对过的事实，不要再调研成另一套故事）

### 1.1 产品现在是什么

本仓库 **Web Agent**：同一 Node 进程两端口——工作台 `3000`、MCP `48271`。正经工作是 **给网页 AI 一座 MCP 桥**，改 **当前工作区** 里的仓库。Windows 入口是 `run-webagent.cmd`（CMD，不要改成教用户 bash）。

本机右侧 Chat 不走隧道；网页 Agent 要 Bridge + 隧道。ChatGPT **聊天栏贴 MCP 不行**；Arena 贴带密钥 URL；DeepSeek++ / Chat Plus 填扩展。不要写 Flask，不要做 Codex OAuth，不要 vendor 扩展。

### 1.2 ShunCode 实际怎么「看屏幕、点鼠标」

官方文档：[产品简介](https://docs.shuncode.top/docs/intro/)、[Chat 模式](https://docs.shuncode.top/docs/chat/overview/)、[Skills](https://docs.shuncode.top/docs/advanced/skills/)。

他们 **没有**在宿主里新做一套名叫 screenshot/mouse 的 MCP 工具。仓库根 `computer-use/SKILL.md` 写明 **「ShunCode 本体零改动」**：

1. **手**：`computer-use/win/*.ps1`（`snap` 截图、`act-bg` 后台点击、`type` 打字），经本机终端跑。
2. **眼**：PNG 必须走 **原生图像通道**（附件 / 读图 / URL）交给 **会看图的模型**。用 `run_command` 回 base64 会在约 65537 字符截断，不能当眼睛。

ShunCode Windows 是 **安装包 + Code-OSS + 真 PTY + 本机 Chat 把 PNG 喂给视觉模型**。Bridge 只是网页来填工单。汽水音乐 / 键鼠演示，对得上的是 **本机 Chat + 视觉模型**，不是「网页只收到一段 JSON 文本」。

本仓库缺的就是「眼」：`src/mcp/server.js` 的 `tools/call` 只回 `{ type: 'text' }`；`src/agent/openai.js` / `runChat.js` **没有** `image_url`。`run_command` 的 cwd 不能出工作区；没有 PTY（`executor.js` `sendCommandInput` 恒失败）。这是 [架构导读.md](../架构导读.md) 第 12 节的有意取舍，不是漏修——**本任务允许在第一阶段只打开「本机 Chat 的眼睛」**，不要顺便拆掉工作区沙箱、也不要先做安装包。

### 1.3 和 DeepSeek Harness 不要混

DSH 官方是 `npx @deepseek-ai/dsh web`（Node 运行时 + 本机网页），不是官方 exe。和我们更像一类。不要把项目改成 Cordis 插件树，也不要 TypeScript 重写。

### 1.4 已经对齐过、不要重做

- Bridge MCP session 卡（Stop / Health / Clear log、四格统计、Health 写在 Streamable HTTP 那一行）
- 工作台浅色/深色（CSS 变量，不是 exe 皮肤）
- `load_skill({ name: 'computer-use' })` 扫仓库根那份
- 过程文档在 `review/`，不要搬回根目录
- 审查 v1–v5 缺陷已闭环；v6 拆 `routes.js` 等 **不做**

---

## 2. 目标（人话）

用户希望 **用起来更像 ShunCode 的本机助手**：本机对话框能按 `computer-use` 说明书截屏、把图给视觉模型看、再点窗口——而不必每次复制 `D:\…\skills\computer-use`。

**不是**：改名 ShunCode、fork `ZS520L/shuncode`、做安装包、把整台 Windows 经 Bridge 交给网页、重写成 TypeScript。

品牌、仓库名、双端口、工作区沙箱 **保持 Web Agent**。

---

## 3. 阶段（一次只做一阶段；本提示词授权的是第一阶段）

### 第一阶段（本次就要做完）— 本机 Chat 的「眼 + 手」最小集

让 **工作台右侧 Chat**（`POST /api/chat` → `runChat.js`）在 Windows 上能：

1. 用户说「按 computer-use 做，打开某某窗口 / 看屏幕」时，模型能 `load_skill` 到仓库根那份说明书（已有）。
2. 模型经 `run_command` 能跑 `computer-use/win/snap.ps1` 等脚本（脚本在仓库根，不在工作区）。允许的做法（选成本最低的一种，写进交付说明）：
   - 给 `run_command` 增加 **白名单可执行文件**：仅 `computer-use/win/*.ps1`（realpath 必须落在该目录），**或**
   - 工作区里放一个薄包装 `.webagent/skills/computer-use` 只含转发说明，实际 `-File` 指向仓库根脚本（仍要能通过 cwd 规则）。
   - **禁止** 放开任意 `D:\` 路径读文件。
3. **眼睛**：`runChat` / `openai.js` 在本机 Chat 请求里支持多模态（OpenAI 兼容的 `image_url` / `data:image/...;base64`）。截图文件出现后，下一轮要能把 **那张 PNG 当作图片** 发给当前配置的模型，而不是把整段 base64 塞进 `run_command` 的文本结果（会截断）。
4. 没有视觉能力的模型（纯文本 Endpoint）必须 **诚实失败**：toast/回复写明「当前模型不会看图，computer-use 看不了屏幕」，不要假装 OCR 成功。
5. **默认不改 Bridge**：`tools/call` 继续只回 `type: text`。网页 MCP 仍然不能当桌面遥控器。若你觉得必须顺手改 MCP 图片类型——**停下，写进报告等用户点头**。
6. 测试：不依赖真显示器。用假 PNG + stub 模型请求，断言 Chat 循环带了 image 部分；纯文本模型走失败分支。`npm test` 全绿。
7. 文档：`技能使用指南.md` 第 10 节改成「本机 Chat 可以看图；Bridge 仍不能」；若动了「为什么这样装」改 `架构导读.md` 对应小节（四层写法）。动了 FILE_DOCS 里的 README 后跑 `node docs-site/build.js`。
8. 提交：小步、测绿再提交。推 **你被固定的那条分支**。

验收口令（Windows 真机可后补，Linux 沙箱用测试锁住协议）：

- 本机 Chat + 配了会看图的模型：能 `load_skill computer-use`，能触发 snap，下一轮请求里有图片字段。
- 本机 Chat + 不会看图的模型：明确拒绝，不瞎点。
- Bridge / 网页 MCP：行为与现在一致（无图片 content）。

### 第二阶段（不要在本次做）— 工作台更像他们的会话壳

欢迎页/设置把「本机 Chat」和「Bridge」两条路写得像 ShunCode 文档那样分清。已有 MCP session 卡、主题、Health。等用户说「继续」。

### 第三阶段（不要在本次做）— Bridge 回传图片

MCP `content: [{ type: 'image' }]`。这等于网页 AI 能看桌面。安全边界变了，必须用户书面同意。

### 第四阶段（不要在本次做）— 真 PTY / 安装包 / Code-OSS 当默认壳

第 12 节现有取舍。`run-webagent-vscode.cmd` 已是「浏览器里真 VS Code」。不要做 Electron exe，除非用户下一轮点名。

---

## 4. 明确不要做

- 不要 TypeScript；不要拆前后端两个仓库；壳仍是 workbench/extension，引擎仍是 agent-host，**同一 Node 双端口**。
- 不要 vendor `ZS520L/shuncode`、不要拷 `shuncode-core/`、不要 vendor DeepSeek++ / Chat Plus。
- 不要改 `webagent-repro/` 的 JS。
- 不要 Flask、不要 Codex OAuth、不要把演示钮改回「使用 GitHub 登录」。
- 不要按 REPORT_v6 拆 `routes.js` / `oauth.js` / tunnel 解环。
- 不要为了对齐而打穿 `resolveSafePath`（任意盘符读文件）。
- 不要把 API Key 打进日志；截图不要经 `eventBus` 全文广播。
- 不要切换/推送除你固定分支以外的分支。
- 不要恢复已删除的根目录过程稿。

---

## 5. 交付（第一阶段结束时）

1. `cd webagent-core/agent-host && npm test` 全绿，输出贴回。
2. 在 `review/REPORT_SHUNCODE_S1.md` 写一页：做了什么、文件路径、本机 Chat 如何带图、Bridge 为何没动、测了什么、Windows 真机还缺什么。
3. 推你的固定分支。用户会再叫本会话（`arena/01a05d84-web-agent`）合并验收。

若第一阶段做到一半发现「当前 Chat 循环无法在不重写 runChat 的前提下夹图片」，写清卡点与最小补丁方案，**停在可编译/测试绿的中间态**，不要改去第四阶段。
