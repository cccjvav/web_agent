# workspace 模块说明书

当前处理目标：`workspace/`

这是 `run-webagent.cmd` **默认**挂上的本机项目（`WORKSPACE_ROOT` 未指定时 = 仓库根 `workspace\`）。Chat / Bridge / 网页 Agent 改的就是这里的磁盘。不是 MCP 服务器源码。

无 Python。工作区现在同时包含：`index.html` / `styles.css` / `app.js`（纯 SVG 与原生 SMIL 的「鹈鹕骑自行车」页面）、`server.js`（静态预览服务器），以及原有的 `src/calculator.js` / `tests/calculator.test.js` 演示代码；配置：`package.json`、`.webagent/customizations.json`。

---

## 1. 模块概述

- **定位：** 演示工作区 + 可直接预览的静态视觉页面。页面以海边骑行小故事展示 SVG / SMIL 动画，不是产品进程。
- **兄弟依赖：** **没有第三方运行时依赖。** `index.html`、`styles.css`、`app.js` 和 `server.js` 均为原生文件；原有 calculator 仍用来验证搜-读-补丁-再测。
- **启动页面：** `npm start` 后访问 `http://localhost:4173/`；动画控制调用 SVG 原生 `pauseAnimations()` / `setCurrentTime()`，不依赖 canvas、图片或前端框架。
- **谁调用：** 用户在工作台或 MCP 工具里读写；`npm test` 会同时运行计算器测试和页面结构检查。

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **文件职责：** 演示项目 npm 清单。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | 包名 | `webagent-workspace-target` |
  | `version` | 版本 | `1.0.0` |
  | `description` | 说明 | `Live workspace with a pure SVG and native SMIL pelican cycling scene.` |
  | `main` | 入口字段 | `server.js` |
  | `scripts.start` | 页面预览 | `node server.js` |
  | `scripts.test` | `npm test` | 计算器 + 页面结构检查 |

无 `dependencies`。

---

### 📄 文件名：`index.html`

- **文件职责：** 页面结构与全部插画。内嵌的 `rideScene` 是完整海岸线 SVG，鹈鹕、车轮、云朵、海浪与道路移动都使用原生 SMIL（`animate` / `animateTransform`）。
- **交互入口：** 顶部「暂停动画」和「重播」按钮由 `app.js` 控制 SVG 时间线；导航锚点连接到路线、田野笔记和车队介绍。
- **资源边界：** 不加载图片、canvas、第三方组件或外部字体。

---

### 📄 文件名：`styles.css`

- **文件职责：** 页面布局、响应式断点、卡片与按钮视觉样式。
- **适配：** 桌面双栏 Hero 在窄屏变成单栏；`prefers-reduced-motion` 下停止过渡动画并由脚本暂停 SVG。

---

### 📄 文件名：`app.js`

- **文件职责：** 极少量原生 DOM 行为：暂停/播放、回到时间 0、减少动效偏好，以及滚动时同步导航高亮。
- **不负责：** 插画运动不在 JavaScript 中逐帧实现，全部交给 SVG SMIL 时间线。

---

### 📄 文件名：`server.js`

- **文件职责：** 无依赖的 Node 静态文件服务器，绑定 `0.0.0.0` 方便工作台预览；仅处理 `GET` / `HEAD` 并防止路径逃逸。

---

### 📄 文件名：`src/calculator.js`

- **文件职责：** 被 Agent 改的演示模块。
- **核心类/函数清单：**
  - **Function `add(a, b)`（L5–L7）** — 返回 `a + b`。
  - **Function `subtract(a, b)`（L9–L11）** — 返回 `a - b`。
  - **Function `multiply(a, b)`（L13–L15）** — 返回 `a * b`。
  - **Function `divide(a, b)`（L17–L22）** — L18–L20：`b === 0` 则 throw `Cannot divide by zero`；L21 返回 `a / b`。
  - **Function `power(base, exponent)`（L24–L26）** — `Math.pow`。
  - L28–L34：`module.exports` 五函数。
- **关键变量：** 无模块级配置。

---

### 📄 文件名：`tests/calculator.test.js`

- **文件职责：** 手写 assert 套件，对应 `npm test`。
- **模块变量：** L7–L8 `passed` / `failed` 计数。
- **Function `test(name, fn)`（L10–L19）**
  - 输入：`name` 字符串；`fn` 无参函数。
  - L11–L14：`fn()` 成功则打印 PASS，`passed++`。
  - L14–L18：catch 打印 FAIL 与 `err.message`，`failed++`。无返回值。
- **用例（L21–L40）：**
  - L21–L23：`add(2,3)===5`
  - L25–L27：`subtract(10,4)===6`
  - L29–L31：`multiply(6,7)===42`
  - L33–L35：`divide(10,2)===5`
  - L37–L40：`divide(10,0)` 必须 throw，消息匹配 `/Cannot divide by zero/`
- L42–L52：打印 Summary；`failed>0` → `exit(1)`，否则 `exit(0)`。
- **没有测 `power`。**

### 📄 文件名：`tests/page.test.js`

- **文件职责：** 不启动浏览器的静态检查，确认页面包含可访问的 inline SVG、至少 10 个 SMIL 动画、无栅格图片依赖、存在暂停/重播控制和 reduced-motion 规则。
- **运行方式：** 通过 `npm test` 与计算器测试串联执行。

---

### 📄 文件名：`.webagent/customizations.json`

- **文件职责：** 工作区自定义（`src/models/customizations.js` 会读）。Git **跟踪**本文件；`.gitignore` 忽略 `**/.webagent/config.json`、`read-hashes.json`、`usage.json`（MCP 密钥 / 读缓存 / 日用量，本树当前无这些文件）。
- **每一个 Key：**

  | Key | 用途 | 当前取值 |
  |---|---|---|
  | `preference` | 环境偏好自由文本 | `""` |
  | `instructions` | 追加进 MCP `initialize.instructions` | 中文：提交说明用中文；尽量 `apply_patch`；Ask/Plan 只读；改动带测试 |
  | `agents` | 智能体列表 | 一项 `id=default`，`name=默认编程智能体`，`role` 说明 Ask/Plan/Code |
  | `agents[].id` / `name` / `role` | 卡片主键、显示名、职责 | 见上 |
  | `prompts` | 自定义 MCP prompts | 一项 `id=diagnose`，`name=诊断测试失败`，`content` 只读探查、不要改文件 |
  | `hooks` | 钩子 | `[]`（产品代码若未读则无效果） |
  | `mcpServers` | 额外 MCP | `[]` |
  | `plugins` | 插件 | `[]` |
  | `quickLinks` | 快捷链接 | `[]` |
  | `voice` / `dictation` | 语音 | `""` |
  | `codex.loggedIn` | 登录标记 | `false` |
  | `codex.account` | 账号 | `""` |

---

### 📄 文件名：`.webagent/instructions.md`

- **文件职责：** 与 `customizations.instructions` 同一句话的 markdown 副本（1 行，无函数）。

---

### 📄 文件名：`.webagent/skills/fix-tests/SKILL.md`

- **文件职责：** 给模型的 Skill 文本（`load_skill` 可读）。不是可执行 JS。
- **内容结构：**
  - L1–L3：标题「修复失败的单元测试」；触发词：测试失败 / 除以零 / calculator。
  - L5–L6 **Ask：** 只读；文中写了 `list_directory` → `search_files` → `read_files` → `get_diagnostics`；禁止 `apply_patch` / `run_command`。  
    （现行 `getToolList` **没有** `get_diagnostics` / `search_files` 这两个名字，测试锁的是 `find_files`。本文件是演示 Skill 原文，不以它为准改工具层。）
  - L8–L9 **Plan：** 独立分支、写清共识、不改仓库。
  - L11–L23 **Code：** 读 `calculator.js` hash → `apply_patch` 给 `divide` 加除 0 守卫 → `STALE_FILE` 则重读 → `npm test` 要 5/5。

---

### 📄 文件名：`.webagent/skills/review/SKILL.md`

- **文件职责：** 代码审查 Skill（`load_skill` 可读）。默认只读。
- **内容结构：**
  - L1–L3：标题与触发词（审查 / code review / 找风险 / 看 diff / 合并前检查）。
  - L5–L7 **Ask：** `git_status` → `git_diff` → `list_directory` → `search_files` → `read_files`；禁止 patch / write / run_command。
  - L9–L11 **Plan：** 列出风险，不改仓库。
  - L13–L21 **Code：** 用户明确说要修才动手；`workspace_info` → git 或目录 → `read_files` → 按文件写严重/建议/风格 → 需要时 `apply_patch` 再跑测试。不是 git 仓库时 `available:false`，不要 `git init`。

---

### 📄 文件名：`.webagent/skills/docs-sync/SKILL.md`

- **文件职责：** 仓库级「功能改完必须同步改说明书」约定，以 Skill 形式给 `load_skill` 读。不是可执行 JS。不要再在仓库根放 `文档约定.md`。动到设计理由时还要改根目录 `架构导读.md`（四层：人话 → 比喻 → 文件落地 → 行业叫法）。
- **内容结构：**
  - L1–L14：标题「文档同步」；触发词含新功能 / 改工具 MCP 路由 工作台 测试 / 说明书 / README / 四阶段 / 文档约定 / 架构 / 导读 / 为什么这样装。四层写法说明。默认 `workspace/` 沙箱进不去仓库其它目录。
  - L16–L18 **Ask：** 只读 `list_directory` → `search_files` → `read_files`（含根 `架构导读.md`）；禁止 `apply_patch` / `write_file` / `run_command`。
  - L20–L22 **Plan：** 列出要改的说明书路径（含是否动导读），不改仓库。
  - L24–L33 **Code：** 按改动类型点名对应夹 README / `总览.md` / `DOCUMENTATION_SUMMARY.md`；第 8 条：架构/数据流/钥匙隧道/新工单入口改 `架构导读.md` 对应小节。根 `README.md` 不改成行级模板；`webagent-repro/` 冻结。
  - L35：禁止杜撰、禁止为对齐文档改 `CONNECT_LINE`、禁止提交 dist。
  - L37：提交前 `npm test` 绿；动过设计理由则导读能对上新代码。

---

### 📄 文件名：`.webagent/skills/commit-now/SKILL.md`

- **文件职责：** 教训：未提交的改动会随沙盒 `reset` 丢掉。测绿就 commit+push 当前分支，不要攒大包，也不要等全部修复结束才写 Skill。
- **内容结构：**
  - 标题「测绿就提交」；触发词含及时提交 / 不要攒 / 补回来 / 沙盒丢了未提交。
  - **Ask：** 只读 `git status` / diff。
  - **Plan：** 列出这一小包文件。
  - **Code：** npm test 绿 → add（含新目录）→ commit → push 当前分支；PAT 与 `admin-host/data/` 不进 Git。

---

## 3. 执行逻辑流（仅本目录）

1. agent-host 启动时 `workspaceRoot` 默认为本目录。
2. MCP / Chat 工具的相对路径都相对这里：`src/calculator.js`、`tests/`、`.webagent/`。
3. 用户或 Agent 执行 `npm test` → `tests/calculator.test.js` 调 `src/calculator.js`。
4. `load_skill` 扫描 `.webagent/skills/*/SKILL.md`；`getInstructions` 拼 `customizations.json` 的 instructions。
5. 换工作区：`run-webagent.cmd D:\code\my-repo`，就不再用本演示树。
