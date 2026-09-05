# models 模块说明书

当前处理目标：`webagent-core/agent-host/src/models/`

工作区磁盘上的配置、指令、记忆。文件都写在 **被编辑项目** 的 `.webagent/` 下，不是 Git 仓库根。无独立 `.html`。产出的 json/md 由本目录函数写入。

---

## 1. 模块概述

- **定位：** 持久化「这个工作区怎么干活」：模型列表与 Bridge 开关（`store.js`）、自定义指令/环境/技术栈（`customizations.js`）、OS/栈探测（`profile.js`）、跨对话备忘（`memory.js`）。
- **依赖：** `../config`（workspaceRoot）。`profile` 被 customizations 与 mcp/instructions、agent/openai 调用。
- **谁调用：** `../index.js` persistIdentity；`../api/routes.js` REST；`../mcp/*` 拼 instructions；工具 `remember`/`recall`。

---

## 2. 文件级详细说明书

### 📄 文件名：`store.js`

- **文件职责：** 读写 `<工作区>/.webagent/config.json`。
- **核心类/函数清单：**

  - **Function `dir`（L8–L10）** / **`storePath`（L12–L14）** — `.webagent` 与其中 `config.json`。
  - **Function `defaults`（L16–L50）** — 见下方 Key。
  - **Function `load`（L52–L65）** — try 读 JSON 与 defaults 浅合并；`models` 非非空数组则用默认；`bridge`/`multiModel` 再与默认合并。**catch 返回 defaults，不抛。**
  - **Function `restrictFileMode`（L67–L71）** — `chmod 0600`；失败 catch 空（Windows 可能无效）。
  - **Function `lineCovers` / `alreadyIgnored`（L77–L91）** — 根或嵌套 `.gitignore` 是否已覆盖 `.webagent/config.json` 等。
  - **Function `ensureNestedIgnore`（L97–L113）** — 写 `.webagent/.gitignore`（`config.json`、`read-hashes.json`），已有则不重复。
  - **Function `ensureWorkspaceGitignore`（L115–L133）** — 仅当工作区根有 `.git` 时，往**该仓库** `.gitignore` 追加上述两行。不是 git 仓库则跳过。
  - **Function `protectWorkspaceSecrets`（L135–L141）** — 嵌套 ignore + 工作区 ignore + 已有 `config.json` 则 chmod。失败 catch 空。
  - **Function `save`（L143–L149）** — mkdir + 美化 JSON + chmod + `protectWorkspaceSecrets`。
  - **Function `patch`（L151–L161）** — load 后浅合并；bridge/multiModel 深一层；`models` 仅当 `partial.models` 真才替换。

- **关键变量 `defaults()` 的 JSON Key：**

  | Key | 含义 | 取值 |
  |---|---|---|
  | `activeModelId` | 当前 Chat 模型 | 默认 `'builtin'` |
  | `models[]` | 模型列表 | 默认一条 builtin：`id/name/protocol/baseUrl/apiKey/modelId` |
  | `models[].protocol` | 协议 | `'builtin'` 或工作台写入的 `'chat.completions'` |
  | `multiModel.enabled` | Plan 是否走博弈 | 默认 `true` |
  | `multiModel.mergeModel` | 合并主模型 | 默认 `'auto'` |
  | `multiModel.thinkLevel` | 思考强度 | 默认 `'high'` |
  | `multiModel.maxBranches` | 最大分支 | 默认 `3` |
  | `multiModel.mergeAllowsRead` | 合并时只读验证 | 默认 `true` |
  | `bridge.loggedIn` | 演示登录 | 默认 `true`（否则 `/bridge/start` 403） |
  | `bridge.deviceAuthorized` | 设备授权 | 默认 `true` |
  | `bridge.provider` / `username` / `license` | 账号展示 | `'github'` / `'demo'` / `'永久顺'` |
  | `bridge.tunnelProvider` | 隧道种类 | 默认 `'cloudflare'` |
  | `bridge.persistentMode` | 持久隧道标记 | 默认 `false`（本目录不消费它去 spawn） |
  | `bridge.ngrokDomain` / `namedDomain` / `namedPort` / `quickLinks` | UI 字段 | 空串 / 48271 / `[]` |

  另外 `persistIdentity` 会往该文件写入 `secretKey`、`installId`（不在 defaults 函数里，由 config 补上）。

---

### 📄 文件名：`customizations.js`

- **文件职责：** `customizations.json`，并同步写出 `instructions.md` / `preference.md` / `tech-stack.md`。
- **核心类/函数清单：**

  - **Function `file`（L6–L8）** — `…/.webagent/customizations.json`。
  - **Function `defaults`（L10–L50）** — 见 Key 表。
  - **Function `loadCustom`（L52–L65）** — try 合并 environment/techStack；catch 返回 defaults。
  - **Function `saveCustom`（L67–L78）** — 与 defaults 合并；有 next.environment / techStack 再深合并；写 json + 三份 md。
  - **Function `patchCustom`（L80–L82）** — `saveCustom({ ...loadCustom(), ...partial })`。

- **关键变量 `defaults()` Key：**

  | Key | 含义 | 默认 |
  |---|---|---|
  | `preference` | 概述页偏好句 | `''` |
  | `environment.os/shell` | 系统/壳 | `'auto'`（由 profile 探测） |
  | `environment.replyLanguage/commitLanguage` | 回复/提交语言 | `'zh-CN'` |
  | `environment.notes` | 备注 | `''` |
  | `techStack.languages/frameworks/packageManager/testCommand/notes` | 技术栈 | 全 `''` |
  | `instructions` | 始终生效指令 | 中文默认句（提交用中文、Ask 只读等） |
  | `agents[]` | 自定义智能体 | 一条 default |
  | `prompts[]` | 可插入提示 | 一条 diagnose |
  | `hooks` / `mcpServers` / `plugins` / `quickLinks` | UI 列表 | `[]`（hooks 无运行时执行器） |
  | `voice` / `dictation` | 占位 | `''` |
  | `codex.loggedIn/account` | 演示登录 | false / `''` |

---

### 📄 文件名：`profile.js`

- **文件职责：** 探测 OS 与仓库技术栈；拼给模型的上下文；生成两份 markdown。**不写磁盘。**
- **核心类/函数清单：**

  - **Function `detectEnvironment`（L5–L16）** — win32→windows/powershell；darwin→macos/bash；否则 linux/bash。语言写死 zh-CN。
  - **Function `readJson`（L18–L24）** — 失败 null。
  - **Function `exists`（L26–L28）** — `existsSync(join(root,rel))`。
  - **Function `detectTechStack`（L30–L76）**
    - L38–L50：有 package.json → JS；tsconfig/jsconfig → TS；deps 判 Next/React/Nuxt/Vue/Express；lock 判 pnpm/yarn/npm；`scripts.test` → `${packageManager} test`。
    - L51–L55：Python 清单 → pytest 命令（仅当 testCommand 仍空）。
    - L56–L64：Cargo.toml / go.mod 同样仅当字段仍空。
    - L65：index.html 且不含 HTML → 加 HTML。
    - L67–L75：uniq join。`notes` 数组从未 push，恒空串。
  - **Function `resolveEnvironment`（L78–L88）** — os/shell 仅当用户值存在且不是 `'auto'` 才覆盖；语言用 `||`。
  - **Function `resolveTechStack`（L90–L100）** — 各字段 `stack.xxx || detected.xxx`。
  - **Function `languageLabel`（L102–L107）** — zh-CN/zh→中文；en→English；follow-user→跟随用户。
  - **Function `osLabel`（L109–L111）** — windows/macos/linux 映射。
  - **Function `formatWorkspaceContext`（L113–L147）** — markdown 三段 Environment / Tech stack / Skills。栈全空时加 not declared。skills 空则提示目录。
  - **Function `markdownPreference`（L149–L166）** / **`markdownTechStack`（L168–L182）** — 中文 md；`filter(l !== null)` 保留空字符串当空行。

---

### 📄 文件名：`memory.js`

- **文件职责：** `.webagent/memory/YYYY-MM-DD.md` 追加备忘。
- **Function `memoryDir`（L5–L7）** / **`dayFile`（L9–L12）** — day 缺省 ISO 日期。
- **Function `remember`（L14–L22）** — text trim 空 → `{ ok:false, error:'text required' }`。存在则 append；否则先写 `# 日期`。换行压成空格。
- **Function `recall`（L24–L38）** — 指定 day 只读一天；否则所有 `.md` sort reverse。拼接超 8000 字 break。再按行 `slice(0, max(5,limit))`。空则 `'(empty memory)'`。

---

## 3. 执行逻辑流

1. 进程启动：`config.persistIdentity(store)` 从 `config.json` 取回 secret/installId，没有则 patch 进去；然后 `protectWorkspaceSecrets`（密钥仍在工作区，但 git 忽略）。
2. 工作台设置页 PUT `/api/customizations` → `saveCustom` 写 json+md。
3. MCP `initialize` / Chat systemPrompt 读 `loadCustom` + `formatWorkspaceContext`。
4. 工具 remember/recall 只碰 `memory/`。
5. Add API / 多模型开关走 `store.save` / `patch`，与 customizations 文件分开。
