# tools 模块说明书

当前处理目标：`shuncode-core/agent-host/src/tools/`

本目录是 **真正改磁盘 / 跑命令** 的实现。MCP（`../mcp/server.js`）和本机 Chat（`../agent/runChat.js`、`../api/routes.js`）都只通过 `index.js` 的 `callTool` 进来。目录内无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 工具注册表 + 路径沙箱 + 补丁 / 读写 / grep / git / 命令执行 / 进度 / Plan 博弈文案。`normalize.js` 把网页 Agent 的别名收成正式名；`readCache.js` 记住最近一次读/写的 sha256，让 `apply_patch` 可以不带 `expectedHash`。
- **依赖的兄弟模块：**
  - `../config`：工作区根。
  - `../utils/eventBus`、`../utils/diff`：广播与 unified diff。
  - `../mcp/errors`、`../mcp/budget`、`../mcp/session`：错误分类、截断、心跳快照。
  - `../models/memory`、`../models/customizations`、`../models/profile`：记忆与工作区画像。
- **谁调用本模块：** `../mcp/server.js`（远程，`callTool` 不传 mode）、`../agent/*`、`../api/routes.js`（传 Ask/Plan/Code）。

---

## 2. 文件级详细说明书

### 📄 文件名：`index.js`

- **文件职责：** 登记约 25 个工具名，做模式锁和危险命令闸，然后把调用派到本目录其它文件。
- **核心类/函数清单：**

  - **Function `tool(def)`（L17–L19）** — 输入工具定义对象，原样返回（无变换）。
  - **Function `pingHost()`（L21–L23）** — 无参。返回 `{ ok, ts, ...snapshot() }`。
  - **Function `getLogs({ maxLines=50 })`（L25–L28）** — `maxLines` clamp 到 1–200；返回 `{ logs, count }`。
  - **Function `getCapabilities()`（L30–L35）** — 工具名+描述 + session snapshot。
  - **Function `getTaskStatus()`（L37–L45）** — 展开 `getTaskState()`；`status==='in_progress'` 时 `suggestedWaitMs=2000`，`etaSeconds = max(1, round((100-progress)/10))`，否则两者为 0。
  - **Const `TOOLS`（L50–L394）** — 每项含 `name` / `aliases` / `description` / `mode` / `inputSchema` / `handler`。名称行号（`name:` 所在行）：

    | 行 | name | mode | handler |
    |---|---|---|---|
    | L52 | ping | ask,plan,code | pingHost |
    | L60 | workspace_info | 同上 | workspaceInfo |
    | L68 | get_capabilities | 同上 | getCapabilities |
    | L76 | get_logs | 同上 | getLogs |
    | L87 | get_task_status | 同上 | getTaskStatus |
    | L95 | remember | 同上 | remember |
    | L107 | recall | 同上 | recall |
    | L118 | list_directory（alias list_dir） | 同上 | listDir |
    | L133 | find_files | 同上 | findFiles |
    | L148 | search_files（alias grep_search） | 同上 | grepSearch |
    | L167 | read_files（alias read_file） | 同上 | readFiles |
    | L183 | git_status | 同上 | gitStatus |
    | L191 | git_diff | 同上 | gitDiff |
    | L206 | load_skill | 同上 | loadSkill |
    | L217 | apply_patch | **code** | applyPatch |
    | L234 | write_file | **code** | writeFile |
    | L254 | delete_file | **code** | deleteFile |
    | L269 | rename_file（alias move_file） | **code** | renameFile |
    | L284 | run_command（alias execute_command） | **code** | executeCommand |
    | L301 | start_command | **code** | startCommand |
    | L318 | get_command_output | ask,plan,code | getCommandOutput |
    | L333 | cancel_command | **code** | cancelCommand |
    | L345 | wait | ask,plan,code | wait |
    | L356 | report_progress | **plan,code** | reportProgress |
    | L372 | set_todos | ask,plan,code | setTodos |

  - **L396–L402** — 把 name 与 aliases 写入 `toolRegistry` Map。
  - **Function `getToolList(currentMode=null)`（L406–L410）** — mode 假则全部；真则 `t.mode.includes(currentMode)`。映射为 `{ name, description, inputSchema }`（不含 handler）。
  - **Function `callTool(name, args={}, currentMode=null)`（L412–L444）**
    - L413：`resolveToolName(name)`（`normalize.js`：`bash`→`run_command`、`cat`→`read_files` 等）。
    - L414：registry 先查 resolved 再查原名。
    - L415–L421：未知名 → `ProtocolError E_UNKNOWN_CMD`，消息含 Available 列表，`detail.retryHint` 提示可用别名。
    - L422–L427：`currentMode` 真且不在该工具 mode 列表 → `E_BAD_ARGS`（Ask/Plan 只读文案）。**`currentMode` 为 null 时跳过（远程 MCP）。**
    - L428：`normalizeToolArgs(toolDef.name, args)`（snake_case、`path`→`filePath`、`"true"`→布尔）。
    - L429–L437：工具名为 `run_command` 或 `start_command` 且命令匹配 `DANGEROUS_RE` 且无 `confirm_dangerous` → `E_BAD_ARGS` + retryHint。
    - L438：`await handler(input)`。
    - L439–L442：`result.isTimeout` 则打 `E_TIMEOUT`、`suggestedWaitMs=0`。
    - L443：`clipJson(result)` 后返回。

- **关键变量：** L47–L48 `DANGEROUS_RE` 匹配 `rm -rf` / `rm -fr` / `mkfs` / `dd if=` / `shutdown` / `reboot` / `git reset --hard` / `git checkout --` / `git clean -f` / `format x:` / `del /s` / `rd /s` / `Remove-Item -Recurse` / `drop database`（i 标志）。

---

### 📄 文件名：`patchEngine.js`

- **文件职责：** 工作区路径沙箱、sha256、SEARCH/REPLACE（或 unified diff / 整文件覆盖）写盘。
- **核心类/函数清单：**

  - **Function `computeHash(content)`（L11–L13）** — sha256 hex，utf8。
  - **Function `toPosixRel(p)`（L15–L17）** — 反斜杠改 `/`。
  - **Function `resolveSafePath(relPath)`（L19–L30）**
    - L20–L23：相对 `config.workspaceRoot` 解析。
    - L24–L26：posix 为 `..`、以 `../` 开头、或 `rel` 绝对路径 → 抛 Security error。
    - L27：posix 非空且不是 `.` → `assertNotSensitive`。
    - L28：返回绝对路径。
  - **Function `parseSearchReplaceBlocks(patchText)`（L32–L43）** — 正则 `<<<<< SEARCH` … `=====` … `>>>>> REPLACE`，收集 `{ search, replace }`。
  - **Function `applyPatch({ filePath, patch, expectedHash=null, dryRun=false })`（L45–L177）**
    - L46：`resolveSafePath`。
    - **文件不存在 L48–L81：** 解析 blocks；若第一块 search trim 为空则用 replace 当新内容，否则整段 `patch`。`dryRun` 只返回成功。否则 mkdir + write；broadcast `file_patched`；`rememberHash`；返回 `isNewFile` + newHash。
    - **文件存在 L83–L176：** 读全文算 `currentHash`。L85–L88：没传 `expectedHash` 则用 `recalledHash(filePath)`（上次 `read_files` / 成功补丁记下的 sha256）。
    - L90–L100：仍无 hash 且非 `dryRun` → `ProtocolError E_BAD_ARGS`，消息 `HASH_REQUIRED`，`detail.currentHash` + `retryHint`。
    - L102–L108：传了 expectedHash 且既不等于也不当前缀 → `ExecutionError E_STALE_FILE`，detail 含 currentHash。
    - L113–L130 有 blocks：统一 `\n`；`includes(search)` 则 replace 第一处；否则 trim 后再试；再失败抛 Patch conflict。
    - L131–L141 无 blocks：以 `--- ` 开头且含 `@@` → `jsdiff.applyPatch`，`false` 则抛；否则整段覆盖。
    - L146–L153 `dryRun` 返回 diff 不写盘。
    - L155–L175：写 `.tmp.${Date.now()}` 再 `renameSync`；`rememberHash`；broadcast；返回 newHash + diff。

---

### 📄 文件名：`fileOps.js`

- **文件职责：** 读/写/删/改名/列目录/grep。全部先 `resolveSafePath`。
- **核心类/函数清单：**

  - **Function `readFiles`（L8–L25）** — 合并 `paths[]` 与 `filePath`。空 → 抛。恰好 1 个直接 `readFile`。多个则逐个 try，失败变成 `{ filePath, error }`。
  - **Function `readFile`（L27–L60）** — 不存在抛；目录抛去用 list_dir。全文 hash；默认 offset=1 limit=400；内容格式 `行号: 文本`。broadcast `file_read`。
  - **Function `deleteFile`（L62–L84）** — 无 path 抛。相对路径空或 `.` 拒绝删根。不存在抛。非空目录抛。目录 `rmdirSync`，文件 `unlinkSync`。broadcast `file_deleted`。
  - **Function `renameFile`（L86–L100）** — `from||filePath` 与 `to||dest` 缺一抛。源不存在 / 目标已存在抛。mkdir 父目录后 rename。broadcast `file_renamed`。
  - **Function `writeFile`（L102–L116）** — mkdir + writeFileSync，无哈希预检。broadcast `file_written`。
  - **Function `listDir`（L118–L150）** — 内嵌 `scan`：depth 超 `maxDepth` 返回 []；`isHidden` skip；目录仅 `recursive && currentDepth < maxDepth` 才扫 children。从 depth=1 开始。
  - **Function `grepSearch`（L152–L211）** — 编正则（非 regex 则转义）；非法正则抛。目录递归；文件 try 读，catch 空。分页 `limit` 1–100，`nextCursor` 或 null。

---

### 📄 文件名：`normalize.js`

- **文件职责：** 网页 Agent 常发的别名参数 / 工具名，收成 handler 认识的字段。只被 `index.js` `callTool` 调用。
- **核心类/函数清单：**
  - **Const `TOOL_NAME_ALIASES`（L1–L19）** — `bash|shell|exec|execute`→`run_command`；`str_replace|search_replace|replace_in_file|edit_file`→`apply_patch`；`cat|read`→`read_files`；`ls`→`list_directory`；`grep`→`search_files`；`glob`→`find_files`；`write|create_file`→`write_file`；`rm`→`delete_file`；`mv`→`rename_file`。
  - **Function `isTruthy(v)`（L21–L25）** — `true` / `1` / 字符串 `true|yes|1`（i）为真。
  - **Function `firstDefined(obj, keys)`（L27–L32）** — 第一个非 null 且非 `''` 的键。
  - **Function `resolveToolName(name)`（L34–L41）** — trim；查表（原样与小写）；否则原名。
  - **Function `normalizeToolArgs(toolName, args)`（L43–L145）** — 浅拷贝；先把 snake_case 填到 camelCase；再按工具名把 `path`/`file`/`cmd`/`pattern` 等收到 `filePath`/`dirPath`/`command`/`query`/`patch`；写/删/危险命令的 confirm 走 `isTruthy`。

### 📄 文件名：`readCache.js`

- **文件职责：** 进程内 `Map`：posix 路径 → 最近一次读/补丁/写入的 sha256。`POST /api/bridge/reset-round` 会 `resetHashes()`。
- **核心类/函数清单：**
  - **Function `norm(filePath)`（L3–L5）** — `\\`→`/`，去掉前导 `./`。
  - **Function `rememberHash(filePath, hash)`（L7–L11）** — 空路径或空 hash 直接 return。
  - **Function `recalledHash(filePath)`（L13–L15）** — 没有则 `null`。
  - **Function `forgetHash(filePath)`（L17–L19）** / **`resetHashes()`（L21–L23）** — 删一条 / `Map.clear`。

### 📄 文件名：`sensitive.js`

- **文件职责：** 敏感路径与噪声目录过滤。
- **核心类/函数清单：**

  - **Function `toPosix`（L58–L60）** — `/` 化，去前导 `./`。
  - **Function `globMatch`（L62–L79）** — pattern 以 `/` 结尾匹配目录前缀；否则 `*`/`**` 编正则，测整路径或 basename。空或 `.` → false。
  - **Function `loadCustomPatterns`（L81–L93）** — 读工作区 `.shuncodeignore`；不存在或 catch → `[]`；空行与 `#` 丢掉。
  - **Function `isSensitive`（L95–L110）** — basename 在例外列表 → false；内置 patterns 命中 true；自定义以 `!` 开头命中则 false（放行）。
  - **Function `isNoise`（L112–L117）** — 路径任一段在 `NOISE_NAMES`。
  - **Function `isHidden`（L119–L121）** — sensitive 或 noise。
  - **Function `assertNotSensitive`（L123–L129）** — 敏感则抛 `ACCESS_DENIED_SENSITIVE_FILE`，`code='E_FORBIDDEN'`。

- **关键常量：** L5–L35 `SENSITIVE_PATTERNS`（`.env`、密钥、`.shuncode/config.json` 等）；L37 例外 `.env.example` 等；L39–L56 `NOISE_NAMES`（`node_modules`、`.git`、`dist`…）。

---

### 📄 文件名：`executor.js`

- **文件职责：** 在工作区跑 shell。Windows 走 PowerShell，其它 bash。
- **核心类/函数清单：**

  - **Function `killChild`（L11–L20）** — 无 pid return。win32 恒 `taskkill /pid /t /f`（force 两支都是 `/f`）。非 Windows SIGKILL/SIGTERM。catch 空。
  - **Function `workingDirFrom`（L22–L29）** — cwd 解析后 relative 以 `..` 开头或绝对 → 抛 outside workspace。
  - **Function `publicRecord`（L31–L48）** — stdout/stderr 截尾；running 时带 `suggestedWaitMs` 与 poll hint。
  - **Function `startProcess`（L50–L132）** — `execId` 自增；timeout 至少 1s；broadcast `command_started`；spawn PowerShell 或 bash；超时 kill 再 2s force；stdout/stderr 环形 200KB；error reject；close 时 status `timeout` 或 `done`。返回 `{ rec, done }`。
  - **Function `executeCommand`（L134–L137）** — 返回 `done`（等到结束）。
  - **Function `startCommand`（L139–L152）** — 不等待；`done.catch` 标 error；立即返回 execId + running。
  - **Function `getCommandOutput`（L154–L161）** — id = execId 或 commandId 或最新序号；没有 rec → found false。
  - **Function `cancelCommand`（L163–L174）** — 非 running → cancelled false；否则 force kill。
  - **Function `sendCommandInput`（L176–L183）** — **恒定** `{ ok:false }`，无 PTY。
  - **Function `wait`（L185–L189）** — ms clamp 0–15000。

- **关键变量：** L6–L9 `commandSequence`、`commandStore`、`children`、`MAX_CAPTURE=200*1024`。

---

### 📄 文件名：`gitOps.js`

- **Function `notGitResult(extra={})`（L7–L20）** — `{ ok:true, available:false, git:false, branch:null, dirty:false, files:[], summary:'', truncated:false, hint:… }` 再 spread extra。hint 写明不要擅自 `git init`。
- **Function `git`（L22–L57）** — `spawnSync git -c color.ui=never`，cwd 工作区，timeout 默认 8s。启动失败：ENOENT/`not found` → `Error` `code='GIT_UNAVAILABLE'`，其它 `E_INTERNAL`。非 0：status 127 / not a git repository / command not found → `GIT_UNAVAILABLE`；否则 `E_INTERNAL` 截 800 字。
- **Function `gitStatus`（L59–L88）** — try porcelain v1 -b；成功 `{ ok, available:true, git:true, branch, dirty, summary, files≤80, truncated }`。catch 仅 `GIT_UNAVAILABLE` → `notGitResult()`，其它再抛。
- **Function `gitDiff`（L90–L118）** — staged → `--cached`；stat → `--stat`；有 filePath 则 resolveSafePath 后相对路径。输出 cap：stat 80 行否则 200。同样把 `GIT_UNAVAILABLE` 收成 `notGitResult`。

---

### 📄 文件名：`findFiles.js`

- **Function `globToRegExp`（L7–L16）** — 默认 `**/*`；`**`→`.*`，`*`→`[^/]*`。
- **Function `findFiles`（L18–L54）** — 起点不存在抛。内嵌 `walk`：readdir 失败 return；hidden skip；满 `maxResults`（默认 40）停止。`glob==='**/*'` 时文件都收。起点是文件则只 push 自己。

---

### 📄 文件名：`skills.js`

- **Function `skillRoots`（L5–L10）** — `.shuncode/skills` 与工作区 `skills/`。
- **Function `listSkills`（L12–L29）** — 必须是目录且有 `SKILL.md`；preview 前 240 字。
- **Function `loadSkill`（L31–L55）** — 无 name 返回列表+hint。找不到 `{ found:false, available }`。找到读最多 8000 字。

---

### 📄 文件名：`workspaceInfo.js`

- **Function `workspaceInfo`（L10–L51）** — loadCustom + resolve env/stack；try gitStatus，catch 记 error；try listDir 顶层 maxDepth 1；try 读 package.json `name`。返回 root、packageName、git 摘要、skills 名、topLevel、hint 不要 dump 整树。

---

### 📄 文件名：`progressTracker.js`

- **模块状态 L3–L10** `currentTaskState` 初始 idle。
- **Function `reportProgress`（L12–L27）** — percentage≥100 → completed 否则 in_progress；progress clamp 0–100；broadcast `progress_updated`。
- **Function `setTodos`（L29–L46）** — 补 id/title/status；broadcast `todos_updated`。
- **Function `getTaskState`（L48–L50）** / **`resetTaskState`（L52–L63）** — reset 回到 idle 并 broadcast。

---

### 📄 文件名：`consensusEngine.js`

- **文件职责：** Plan 模式三分支文案。**不请求任何 LLM HTTP。** `consensusReached` / `agreementRate:'97%'` / `disagreements:[]` 写死。
- **Function `sleep`（L3–L5）** / **`clip`（L7–L10）** — 截到 n（默认 900）。
- **Function `runMultiModelConsensus`（L16–L102）** — 从 facts 取 files/readme/pkg/test；broadcast `consensus_started`；sleep 200 三次构造 planA/B/C（架构/安全/编码），有 emit 则发 status/branch；sleep 180；拼 unifiedActionPlan 三条 pending；broadcast `consensus_finished`。

---

## 3. 执行逻辑流

1. 调用方 `callTool(name, args, mode?)`（`index.js` L412）。
2. `resolveToolName` → 查 registry → 可选模式锁 → `normalizeToolArgs` → 可选危险命令闸。
3. handler 进入具体文件：读走 `fileOps`/`findFiles`/`gitOps`/`skills`/`workspaceInfo`/`memory`；写走 `patchEngine`/`fileOps.writeFile`；命令走 `executor`。读/补丁成功会 `rememberHash`。
4. 所有写路径先 `resolveSafePath` → `assertNotSensitive`。
5. 结果经 `clipJson` 返回；副作用经 `eventBus.broadcast` 到工作台。
6. 远程 MCP 不传 mode，锁不生效；本机 Chat 传 ask/plan/code。
7. 不是 git 仓库时 `git_status`/`git_diff` 返回 `available:false`，不抛。
