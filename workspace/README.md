# workspace 模块说明书

当前处理目标：`workspace/`

这是 `run-shuncode.cmd` **默认**挂上的本机项目（`WORKSPACE_ROOT` 未指定时 = 仓库根 `workspace\`）。Chat / Bridge / 网页 Agent 改的就是这里的磁盘。不是 MCP 服务器源码。

无 Python。代码：`src/calculator.js`、`tests/calculator.test.js`；配置：`package.json`、`.shuncode/customizations.json`。

---

## 1. 模块概述

- **定位：** 演示工作区（计算器）。用来验证搜-读-补丁-再测，不是产品进程。
- **兄弟依赖：** **没有 require 产品代码。** 反过来：`agent-host` 的 `config.workspaceRoot` 默认指向本目录；`load_skill` 读 `.shuncode/skills/`；`getInstructions` 会拼 `customizations.json` / `instructions.md`。
- **谁调用：** 用户在工作台或 MCP 工具里读写；`npm test` 在本目录跑计算器测试。

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **文件职责：** 演示项目 npm 清单。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | 包名 | `shuncode-workspace-target` |
  | `version` | 版本 | `1.0.0` |
  | `description` | 说明 | `Live workspace inside ShunCode Editor` |
  | `main` | 入口字段 | `src/calculator.js` |
  | `scripts.test` | `npm test` | `node tests/calculator.test.js` |

无 `dependencies`。

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

---

### 📄 文件名：`.shuncode/customizations.json`

- **文件职责：** 工作区自定义（`src/models/customizations.js` 会读）。Git **跟踪**本文件；`.gitignore` 只忽略 `workspace/.shuncode/config.json`（MCP 密钥，本树当前无该文件）。
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

### 📄 文件名：`.shuncode/instructions.md`

- **文件职责：** 与 `customizations.instructions` 同一句话的 markdown 副本（1 行，无函数）。

---

### 📄 文件名：`.shuncode/skills/fix-tests/SKILL.md`

- **文件职责：** 给模型的 Skill 文本（`load_skill` 可读）。不是可执行 JS。
- **内容结构：**
  - L1–L3：标题「修复失败的单元测试」；触发词：测试失败 / 除以零 / calculator。
  - L5–L6 **Ask：** 只读；文中写了 `list_directory` → `search_files` → `read_files` → `get_diagnostics`；禁止 `apply_patch` / `run_command`。  
    （现行 `getToolList` **没有** `get_diagnostics` / `search_files` 这两个名字，测试锁的是 `find_files`。本文件是演示 Skill 原文，不以它为准改工具层。）
  - L8–L9 **Plan：** 独立分支、写清共识、不改仓库。
  - L11–L23 **Code：** 读 `calculator.js` hash → `apply_patch` 给 `divide` 加除 0 守卫 → `STALE_FILE` 则重读 → `npm test` 要 5/5。

---

### 📄 文件名：`.shuncode/skills/review/SKILL.md`

- **文件职责：** 最短 Skill。L1 标题 `Skill: review`；L2「做 code review。」

---

### 📄 文件名：`.shuncode/skills/docs-sync/SKILL.md`

- **文件职责：** 仓库级「功能改完必须同步改说明书」约定，以 Skill 形式给 `load_skill` 读。不是可执行 JS。不要再在仓库根放 `文档约定.md`。
- **内容结构：**
  - L1–L7：标题「文档同步」；触发词：新功能 / 改工具 MCP 路由 工作台 测试 / 说明书 / README / 四阶段 / 文档约定。写明默认 `workspace/` 沙箱进不去仓库其它目录。
  - L9–L11 **Ask：** 只读 `list_directory` → `search_files` → `read_files`；禁止 `apply_patch` / `write_file` / `run_command`。
  - L13–L15 **Plan：** 列出要改的说明书路径，不改仓库。
  - L17–L29 **Code：** 按改动类型点名对应夹 README / `总览.md` / `DOCUMENTATION_SUMMARY.md`；根 `README.md` 不改成行级模板；`shuncode-repro/` 冻结。禁止杜撰、禁止为对齐文档改 `CONNECT_LINE`、禁止提交 dist。提交前 `npm test` 绿。

---

## 3. 执行逻辑流（仅本目录）

1. agent-host 启动时 `workspaceRoot` 默认为本目录。
2. MCP / Chat 工具的相对路径都相对这里：`src/calculator.js`、`tests/`、`.shuncode/`。
3. 用户或 Agent 执行 `npm test` → `tests/calculator.test.js` 调 `src/calculator.js`。
4. `load_skill` 扫描 `.shuncode/skills/*/SKILL.md`；`getInstructions` 拼 `customizations.json` 的 instructions。
5. 换工作区：`run-shuncode.cmd D:\code\my-repo`，就不再用本演示树。
