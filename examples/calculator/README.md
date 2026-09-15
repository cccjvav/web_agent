# 可选计算器示例说明书

当前处理目标：`examples/calculator/`

这是可选计算器示例，不再是默认工作区。源码启动器默认使用仓库根目录。只有显式指定 `examples/calculator` 才以本示例为任务目标。

无 Python。代码：`src/calculator.js`、`tests/calculator.test.js`；配置：`package.json`、`.webagent/customizations.json`。

---

## 1. 模块概述

- **定位：** 演示工作区（计算器）。用来验证搜-读-补丁-再测，不是产品进程。
- **兄弟依赖：** **没有 require 产品代码。** 反过来：`agent-host` 的 `config.workspaceRoot` 默认指向仓库根目录，只有显式选择才指向本目录；`load_skill` 读 `.webagent/skills/`；`getInstructions` 会拼 `customizations.json` / `instructions.md`。
- **谁调用：** 用户在工作台或 MCP 工具里读写；`npm test` 在本目录跑计算器测试。

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **文件职责：** 演示项目 npm 清单。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | 包名 | `webagent-workspace-target` |
  | `version` | 版本 | `1.0.0` |
  | `description` | 说明 | `Live workspace inside Web Agent Editor` |
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
- **已测 `power(2, 10) === 1024`。**

---

### 📄 文件名：`.webagent/customizations.json`

- **文件职责：** 工作区自定义（`src/models/customizations.js` 会读）。Git **跟踪**本文件；`.gitignore` 忽略 `**/.webagent/config.json`、`read-hashes.json`、`usage.json`（MCP 密钥 / 读缓存 / 日用量，不提交本地运行数据）。
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

共用Skills已迁至仓库根`.webagent/skills`，不再位于本示例目录；详见[技能指南](../../技能使用指南.md)。

## 3. 执行逻辑流（仅本目录）

1. 显式传入examples/calculator时 `workspaceRoot` 才是本目录。
2. MCP / Chat 工具的相对路径都相对这里：`src/calculator.js`、`tests/`、`.webagent/`。
3. 用户或 Agent 执行 `npm test` → `tests/calculator.test.js` 调 `src/calculator.js`。
4. `load_skill` 仅扫描所选工作区的Skills；不会越过边界自动读取根工作区Skills。`getInstructions`拼本示例的customizations.instructions。
5. 换工作区：`run-webagent.cmd D:\code\my-repo`，就不再用本演示树。

## 运行数据迁移
旧workspace目录中的本地忽略数据随示例保留，不自动带入新的根工作区；用户升级Git checkout后若旧目录仍有本地数据，先备份再决定是否删除，不执行强制清空。
