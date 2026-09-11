# tools 模块说明书

当前处理目标：`webagent-core/agent-host/src/tools/`

本目录是 **真正改磁盘 / 跑命令** 的实现。MCP（`../mcp/server.js`）和本机 Chat（`../agent/runChat.js`、`../api/routes.js`）都只通过 `index.js` 的 `callTool` 进来。目录内无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** 工具注册表 + 路径沙箱 + 补丁 / 读写 / grep / git / 命令执行 / 进度 / Plan 多模型回合（`planRound.js`）与本机草案/拼接（`consensusEngine.js`）。`normalize.js` 把网页 Agent 的别名收成正式名；`readCache.js` 记住最近一次读/写的 sha256，让 `apply_patch` 可以不带 `expectedHash`。
- **依赖的兄弟模块：**
  - `../config`：工作区根。
  - `../utils/eventBus`、`../utils/diff`：广播与 unified diff。
  - `../mcp/errors`、`../mcp/budget`、`../mcp/session`：错误分类、截断、心跳快照。
  - `../models/memory`、`../models/customizations`、`../models/profile`：记忆与工作区画像。
- **谁调用本模块：** `../mcp/server.js`（远程，`callTool` 第三参默认 `'code'`，或 `params._meta.mode`）、`../agent/*`、`../api/routes.js`（传 Ask/Plan/Code）。

---

## 2. 文件级详细说明书

### 📄 文件名：`index.js`

- **文件职责：** 登记 **30** 个对外工具名（另隐藏 `send_command_input`），做模式锁和危险命令闸，然后把调用派到本目录其它文件。
- **核心类/函数清单：**

  - **Function `tool(def)`（L19–L21）** — 输入工具定义对象，原样返回（无变换）。
  - **Function `pingHost()`（L23–L27）** — 无参。返回 `{ ok, ts, ...snapshot() }`。
  - **Function `getLogs({ maxLines=50 })`（L29–L40）** — `maxLines` clamp 到 1–200。每条只留 `type`/`timestamp` 以及 payload 里的 `tool`/`success`/`durationMs`/`execId`/`status`/`truncated`（不含 args、补丁、命令输出）。返回 `{ logs, count }`。
  - **Function `getCapabilities()`（L42–L47）** — 工具名+描述 + session snapshot。
  - **Function `getTaskStatus()`（L49–L57）** — 展开 `getTaskState()`；`status==='in_progress'` 时 `suggestedWaitMs=2000`，`etaSeconds = max(1, round((100-progress)/10))`，否则两者为 0。
  - **Const `TOOLS`（L59–L466）** — 每项含 `name` / `aliases` / `description` / `mode` / `inputSchema` / `handler`。名称行号（`name:` 所在行）：

    | 行 | name | mode | handler |
    |---|---|---|---|
    | L61 | ping | ask,plan,code | pingHost |
    | L69 | workspace_info（描述写明 instructions 缺失时先调） | 同上 | workspaceInfo |
    | L77 | get_capabilities | 同上 | getCapabilities |
    | L85 | get_logs | 同上 | getLogs |
    | L96 | get_task_status | 同上 | getTaskStatus |
    | L104 | remember | 同上 | remember |
    | L116 | recall | 同上 | recall |
    | L127 | list_directory（alias list_dir） | 同上 | listDir |
    | L142 | find_files | 同上 | findFiles |
    | L157 | search_files（alias grep_search） | 同上 | grepSearch |
    | L176 | read_files（alias read_file） | 同上 | readFiles |
    | L192 | git_status | 同上 | gitStatus |
    | L200 | git_diff | 同上 | gitDiff |
    | L215–L255 | peers_list / board_* | 同上 | boardTools |
    | L267 | load_skill | 同上 | loadSkill |
    | L278 | apply_patch | **code** | applyPatch |
    | L296 | write_file | **code** | writeFile |
    | L316 | delete_file | **code** | deleteFile |
    | L331 | rename_file（alias move_file） | **code** | renameFile |
    | L346 | run_command（alias execute_command） | **code** | executeCommand |
    | L363 | start_command | **code** | startCommand |
    | L380 | get_command_output | ask,plan,code | getCommandOutput |
    | L395 | cancel_command | **code** | cancelCommand |
    | L407 | send_command_input | **code**（hidden） | sendCommandInput |
    | L423 | wait | ask,plan,code | wait |
    | L434 | report_progress | **plan,code** | reportProgress |
    | L450 | set_todos | ask,plan,code | setTodos |

  - **L468–L474** — 把 name 与 aliases 写入 `toolRegistry` Map。
  - **Function `getToolList(currentMode=null, opts={})`（L484–L489）** — mode 假则全部对外工具；真则 `t.mode.includes(currentMode)`。默认丢掉 `hidden`；`opts.includeHidden` 才带上 `send_command_input`。映射为 `{ name, description, inputSchema }`（不含 handler）。
  - **Function `callTool(name, args={}, currentMode=null, opts={})`（L491–L533）**
    - L492：`resolveToolName(name)`（`normalize.js`：`bash`→`run_command`、`cat`→`read_files` 等）。
    - L493：registry 先查 resolved 再查原名。
    - L494–L500：未知名 → `ProtocolError E_UNKNOWN_CMD`，消息含 Available 列表，`detail.retryHint` 提示可用别名。
    - L501–L506：`currentMode` 真且不在该工具 mode 列表 → `E_BAD_ARGS`（Ask/Plan 只读文案）。远程 MCP 默认传入 `'code'`（见 `mcp/server.remoteToolMode`）；本机 Chat 传入 UI 模式。
    - L507：`normalizeToolArgs(toolDef.name, args)`（snake_case、`path`→`filePath`、`"true"`→布尔）。
    - 远程且工具名 `send_command_input` → **`E_FORBIDDEN`**（交互式 PTY 仅桌面 Chat）。
    - 工具名为 `run_command` 或 `start_command`：走 `assertCommandAllowed`（`dangerous.js`，远程与本机同一处）。`opts.remote` 真 → **`E_FORBIDDEN`**（即使带了 `confirm_dangerous`）；本机无 `confirm_dangerous` → `E_BAD_ARGS`。远程还会把 `timeoutSec` 夹到最多 60。闸包括 `rm -rf` / `rm -r -f` / `find -delete`、`git push`、`curl … | sh`、`iex` / `iwr`、关机格式化等（词法归一，不是 OS 沙箱）。
    - `await handler(input, opts)`。
    - `result.isTimeout` 则打 `E_TIMEOUT`、`suggestedWaitMs=0`。
    - `clipJson(result)` 后返回。

- **危险命令：** 实现在 `dangerous.js`（`isDangerousCommand` / `assertCommandAllowed`）。先剥空引号、折叠空白、按 `|` / `&&` 分段，再在 token 上判定。不是 OS 沙箱。

---

### 📄 文件名：`patchEngine.js`

- **文件职责：** 工作区路径沙箱、sha256、SEARCH/REPLACE（或 unified diff / 整文件覆盖）写盘。
- **核心类/函数清单：**

  - **Function `computeHash(content)`** — sha256 hex，utf8。
  - **Function `atomicWriteText(fullPath, content)`** — 同目录随机临时文件、wx独占创建、保留已有文件mode的0777位、rename；finally清理临时文件。不是跨进程事务或ACL/所有者复制。
  - **Function `tempSibling(fullPath)`** — `.tmp.${pid}.${Date.now()}.${4字节hex}`，避免同毫秒撞名。
  - **Function `toPosixRel(p)`** — 反斜杠改 `/`。
  - **Function `existingAncestor` / `realPathOrJoin` / `isInsideWorkspace`** — 沿父目录找到已存在的节点再 `realpathSync`，挡住 **symlink / junction** 指到工作区外。
  - **Function `resolveSafePath(relPath)`**
    - 先拒 UNC（`//server/share`）、Windows 盘符（`C:\…`）、`\\?\` 设备路径。
    - 相对 `config.workspaceRoot` 解析。
    - posix 为 `..`、以 `../` 开头、或 `rel` 绝对路径 → 抛 Security error。
    - `isInsideWorkspace` 为假（真实路径跑出工作区，含 symlink / junction）同样抛。
    - 同时检查逻辑相对路径与真实目标的相对路径是否敏感；Windows另拒含冒号/尾随点空格的歧义部件。
    - 返回**逻辑**绝对路径。
  - **Function `withWriteLock(paths, fn)`** — 以规范真实路径排队（Windows键小写），归一`..`等别名。同一文件上的 `apply_patch` / `write_file` / `delete_file` / `rename_file` 串行；后到的若哈希过期会 `STALE_FILE`。
  - **Function `detectEol` / `toLf` / `applyEol`** — 有 `\r\n` 则整文件按 CRLF 写回；匹配在 LF 上进行。
  - **Function `countOccurrences` / `replaceOccurrence`** — 非重叠计数；按 1-based `occurrence` 替换一处。
  - **Function `looksLikeUnifiedDiff(text)`** — 去 BOM/前导空白后，开头是 `diff --git `，或开头像 `--- …` + `+++ ` 且全文含 `@@`。
  - **Function `looksLikeV4A(text)`** — `*** Begin Patch` 或 `Update File` / `Add File` / `Delete File` / `Move to`。
  - **Function `rejectUnsupportedPatchFormat`** — 没有 SEARCH 块且像 V4A → `E_BAD_ARGS` + retryHint；不写盘。
  - **Function `parseSearchReplaceBlocks(patchText)`** — 正则 `<<<<< SEARCH` … `=====` … `>>>>> REPLACE`；SEARCH 与 `=======` 之间的换行可省略（空 SEARCH 新建）。收集 `{ search, replace }`。
  - **Function `applySearchBlocks`** — 已有文件：SEARCH 必须命中 1 次，否则 `E_CONFLICT`（可传 `occurrence`）；空 SEARCH 拒；写回原换行。
  - **Function `applyPatch({ filePath, patch, expectedHash=null, dryRun=false, occurrence })`**
    - 先认 V4A（`*** Begin Patch` / `Update File` / `Add File` / `Delete File` / `Move to`）。没有 SEARCH 块则 `E_BAD_ARGS`，`retryHint` 让改写成 SEARCH/REPLACE；**不**当文件正文、**不**解析 V4A。
    - **文件不存在：** 若整段像 unified diff 且第一块不是空 SEARCH → `E_BAD_ARGS`（禁止把 diff 当新文件正文）。第一块 search trim 为空则用 replace 当新内容，否则整段 `patch`。不改调用方给的换行。
    - **文件存在：** 没 hash 且非 dryRun → `HASH_REQUIRED`；hash 不符 → `STALE_FILE`。有 blocks 走 `applySearchBlocks`；unified diff / 整段覆盖后仍 `applyEol` 回原 CRLF/LF。
    - 已有文件的git header/BOM unified diff解析为单文件补丁，必须有hunks；无效、多文件、/dev/null补丁拒绝，不当正文保存。
    - 已有文件调用`atomicWriteText`替换，保留普通权限位并在失败时清理临时文件。新建路径仍按新文件分支处理。

---

### 📄 文件名：`fileOps.js`

- **文件职责：** 读/写/删/改名/列目录/grep。全部先 `resolveSafePath`。
- **核心类/函数清单：**

  - **Function `readFiles`** — 合并 `paths[]` 与 `filePath`。空 → 抛。恰好 1 个直接 `readFile`。多个则逐个 try，失败变成 `{ filePath, error }`。
  - **Function `readFile`** — 不存在抛；目录抛去用 list_dir。全文 hash；默认 offset=1 limit=400；内容格式 `行号: 文本`。broadcast `file_read`。
  - **Function `deleteFile`** — 无 path 抛。相对路径空或 `.` 拒绝删根。不存在抛。非空目录抛。目录 `rmdirSync`，文件 `unlinkSync`。broadcast `file_deleted`。
  - **Function `renameFile`** — `from||filePath` 与 `to||dest` 缺一抛。源不存在 / 目标已存在抛。mkdir 父目录后 rename。broadcast `file_renamed`。
  - **Function `writeFile`** — `resolveSafePath`（含敏感拦截）。已存在则要 `confirm_overwrite`、匹配的 `expectedHash`，或**本进程** `sessionHash` 仍等于当前 sha256。磁盘上的 `read-hashes.json`（上次进程留下的）**不能**单独放行覆盖。hash 不符 → `E_STALE_FILE`。调用`atomicWriteText`（保留原普通权限位、失败清理临时文件）。broadcast `file_written`；`rememberHash`。
  - **Function `listDir`** — 内嵌 `scan`：depth 超 `maxDepth` 返回 []；真实路径在工作区外或 **符号链接** skip；`isHidden` skip；目录仅 `recursive && currentDepth < maxDepth` 才扫 children。
  - **Function `grepFile`** — 单文件：`>1.5MB` 记 large；含 NUL 记 binary；否则按行匹配，命中 content 截 400 字。
  - **Function `grepSearch`** — 空 query / 超 200 字 / regex 超 120 字 / 嵌套量词（ReDoS）→ `E_BAD_ARGS`。编正则（非 regex 则转义）；非法正则抛。最多扫 800 个文件、收集 2000 条、合计约 8MB；跳过大文件和二进制。分页 `limit` 1–100。返回 `scannedFiles` / `skippedLarge` / `skippedBinary` / `truncated`。

---

### 📄 文件名：`dangerous.js`

- **文件职责：** 破坏性命令判定 + 远程/本机策略。只被 `index.js` `callTool` 调用。
- **核心类/函数清单：**
  - **Function `isDangerousCommand(command)`** — 归一化后按 token 判定 `rm` 递归、`find -delete`、`dd`/`mkfs`/`shred`/`truncate`、`git push`/`reset --hard`、管道进 shell、PowerShell `Remove-Item -Recurse` 等。
  - **Function `assertCommandAllowed(command, { remote, confirmDangerous })`** — 远程一律 `E_FORBIDDEN`；本机无确认 `E_BAD_ARGS`。

### 📄 文件名：`normalize.js`

- **文件职责：** 网页 Agent 常发的别名参数 / 工具名，收成 handler 认识的字段。只被 `index.js` `callTool` 调用。
- **核心类/函数清单：**
  - **Const `TOOL_NAME_ALIASES`（L1–L19）** — `bash|shell|exec|execute`→`run_command`；`str_replace|search_replace|replace_in_file|edit_file`→`apply_patch`；`cat|read`→`read_files`；`ls`→`list_directory`；`grep`→`search_files`；`glob`→`find_files`；`write|create_file`→`write_file`；`rm`→`delete_file`；`mv`→`rename_file`。
  - **Function `isTruthy(v)`（L21–L25）** — `true` / `1` / 字符串 `true|yes|1`（i）为真。
  - **Function `firstDefined(obj, keys)`（L27–L32）** — 第一个非 null 且非 `''` 的键。
  - **Function `resolveToolName(name)`（L34–L41）** — trim；查表（原样与小写）；否则原名。
  - **Function `normalizeToolArgs(toolName, args)`（L43–L145）** — 浅拷贝；先把 snake_case 填到 camelCase；再按工具名把 `path`/`file`/`cmd`/`pattern` 等收到 `filePath`/`dirPath`/`command`/`query`/`patch`；写/删/危险命令的 confirm 走 `isTruthy`。

### 📄 文件名：`readCache.js`

- **文件职责：** posix 路径 → 最近一次读/补丁/写入的 sha256。落盘 `.webagent/read-hashes.json`（最多 400 条）。`POST /api/bridge/reset-round` 会 `resetHashes()`（清 Map 并删文件）。
- **核心类/函数清单：**
  - **Function `norm(filePath)`（L9–L11）** — 反斜杠改 `/`，去掉前导 `./`。
  - **Function `hashFile()`（L13–L15）** — `<workspace>/.webagent/read-hashes.json`。
  - **Function `ensureLoaded()`（L17–L29）** — 按 `workspaceRoot` 懒加载；坏 JSON / 缺文件当空表。
  - **Function `persist()`（L31–L38）** — mkdir 后写 JSON；失败 catch 空。
  - **Function `rememberHash(filePath, hash)`（L42–L54）** — 空路径或空 hash return；写入持久表 **和** 本进程 `session` Map；超过 400 删最老；`persist`。换工作区根会清空 session。
  - **Function `recalledHash(filePath)`（L56–L59）** — 持久表；没有则 `null`。给 `apply_patch` 跨重启复用。
  - **Function `sessionHash(filePath)`（L61–L64）** — 只看本进程读/写过的路径。重启或 `clearSession` 后为 `null`。给 `write_file` 覆盖确认。
  - **Function `forgetHash(filePath)`（L66–L72）** / **`clearSession()`（L74–L76）** / **`resetHashes()`（L78–L83）** — 删一条并 persist / 只清 session / 清空两表并 `unlinkSync`。

### 📄 文件名：`sensitive.js`

- **文件职责：** 敏感路径与噪声目录过滤。
- **核心类/函数清单：**

  - **Function `toPosix`** — `/` 化，去前导 `./`。
  - **Function `globMatch`** — pattern 以 `/` 结尾匹配目录前缀；否则 `*`/`**` 编正则，测整路径或 basename。空或 `.` → false。
  - **Function `loadCustomPatterns`** — 读工作区 `.webagentignore`；不存在或 catch → `[]`；空行与 `#` 丢掉。
  - **Function `isSensitive`** — 内置patterns大小写不敏感、作用于每层目录后缀；`.env.example`等只豁免`.env`规则，不豁免`.ssh/`等敏感目录；内置命中后不能被自定义!解除。再按顺序应用自定义规则。
  - **Function `isNoise`** — 路径任一段在 `NOISE_NAMES`。
  - **Function `isHidden`** — sensitive 或 noise。
  - **Function `assertNotSensitive`** — 敏感则抛 `ACCESS_DENIED_SENSITIVE_FILE`，`code='E_FORBIDDEN'`。

- **关键常量：** L5–L35 `SENSITIVE_PATTERNS`（`.env`、密钥、`.webagent/config.json` 等）；L37 例外 `.env.example` 等；L39–L56 `NOISE_NAMES`（`node_modules`、`.git`、`dist`…）。

---

### 📄 文件名：`executor.js`

- **文件职责：** 在工作区跑 shell。Windows 走 PowerShell，其它 bash。
- **核心类/函数清单：**

  - **Function `killChild`（L35–L49）** — 无 pid return。win32 `taskkill /pid /t /f`。非 Windows 先 `process.kill(-pid)` 杀**进程组**，失败再 `child.kill`。
  - **Function `workingDirFrom`（L51–L57）** — 走 `resolveSafePath`（含真实路径），逃出工作区抛 outside workspace。
  - **Function `publicRecord`（L69–L90）** — stdout/stderr 截尾；running 时带 `suggestedWaitMs` 与 poll hint。
  - **Function `scrubEnv(base)`** — 拷贝环境后删掉名字像 API Key / token / secret / password 的变量，避免命令子进程读到宿主密钥。
  - **Function `startProcess`** — `execId` 为 16 位 hex；同时 running 最多 8 条，已结束最多留 40。timeout 至少 1s；spawn 时 `env` 走 `scrubEnv(process.env)` 再加 `CI`/`TERM`/`FORCE_COLOR`；非 Windows `detached:true`；超时 kill 再 2s force，定时器 `unref()`。返回 `{ rec, done }`。
  - **Function `executeCommand` / `startCommand`** — `wantsPty()` 为真则 `ptyJobs.enqueue('run'|'start')`（桌面 Chat `client:'vscode-extension'`）。否则 execute 等到结束；start 立即返回 execId + running。
  - **Function `getCommandOutput`** — id = execId 或 commandId 或最新序号；没有 rec → found false。PTY 活任务同样走这里 poll。
  - **Function `cancelCommand`** — 非 running → cancelled false；PTY 则 enqueue cancel；否则 force kill。
  - **Function `sendCommandInput`** — PTY 活则 enqueue input；否则 `{ ok:false }`（无 stdin）。远程 MCP 到不了这里（先 `E_FORBIDDEN`）。
  - **Function `wait`（L185–L189）** — ms clamp 0–15000。

- **关键变量：** `lastExecId`、`commandStore`、`children`、`MAX_CAPTURE=200*1024`、`MAX_RUNNING=8`、`MAX_COMMANDS=40`。

---

### 📄 文件名：`gitOps.js`

- **Function `notGitResult(extra={})`（L7–L20）** — `{ ok:true, available:false, git:false, branch:null, dirty:false, files:[], summary:'', truncated:false, hint:… }` 再 spread extra。hint 写明不要擅自 `git init`。
- **Function `git`（L22–L57）** — `spawnSync git -c color.ui=never`，cwd 工作区，timeout 默认 8s。启动失败：ENOENT/`not found` → `Error` `code='GIT_UNAVAILABLE'`，其它 `E_INTERNAL`。非 0：status 127 / not a git repository / command not found → `GIT_UNAVAILABLE`；否则 `E_INTERNAL` 截 800 字。
- **Function `gitStatus`（L59–L88）** — try porcelain v1 -b；成功 `{ ok, available:true, git:true, branch, dirty, summary, files≤80, truncated }`。catch 仅 `GIT_UNAVAILABLE` → `notGitResult()`，其它再抛。
- **Function `gitDiff`（L90–L118）** — staged → `--cached`；stat → `--stat`；有 filePath 则 resolveSafePath 后相对路径。输出 cap：stat 80 行否则 200。同样把 `GIT_UNAVAILABLE` 收成 `notGitResult`。

---

### 📄 文件名：`findFiles.js`

输入为简化glob（`*`、`**`、`?`），不是正则；完整正则内容搜索请用`search_files`的`isRegex:true`。

- **Function `globToRegExp`（L7–L16）** — 默认 `**/*`；`**`→`.*`，`*`→`[^/]*`。
- **Function `findFiles`（L18–L59）** — 起点不存在抛。内嵌 `walk`：readdir 失败 return；hidden skip。命中文件时若已满 `maxResults`（默认 40，夹到 1–200）才 `truncated:true` 并停；恰好收满 cap 且没有下一条不算截断。`glob==='**/*'` 时文件都收。起点是文件则只 push 自己。

---

### 📄 文件名：`skills.js`

- **Function `skillRoots`** — `.webagent/skills` 与工作区 `skills/`。
- **Const `BUNDLED_SKILL_NAMES`** — `computer-use`、`project-manager`、`multi-agent-board`。
- **Function `bundledSkills`** — 仓库根 `<name>/SKILL.md`（与工作区无关）。缺文件则跳过。
- **Function `skillFileFields(dir)`** — `{ skillFile: 相对工作区的 SKILL.md, skillFileAbs: 绝对路径 }`。
- **Function `readSkillPrefix` / `preview`** — 打开前检查普通文件，fd上再次检查类型与128 KiB字节上限；按所需字符数最多读取对应UTF-8字节前缀，不先读完整大文件。预览240字符，加载28000字符；超限预览显示错误，加载抛E_BAD_ARGS。
- **Function `listSkills`** — 工作区两处 + bundled；用户skill须通过resolveSafePath，越界链接不入目录；同名工作区优先，每项带skillFile/skillFileAbs。
- **Function `loadSkill`** — 无 name 返回列表+hint（含 skillFile）。找不到 `{ found:false, available }`。找到从 `absDir` 读最多 **28000** 字，返回带 `absDir`/`skillFile`/`skillFileAbs`/`truncated`；`computer-use` 额外带 `scriptsDir`（仓库根 `computer-use/win`）与 `runHint`（「手」的薄转发：Windows 本机 Chat 经 run_command 用绝对路径跑 `snap.ps1` 等，`-Out` 截图存工作区内，Chat 会把新截图作为图片附给标记 vision 的模型；Bridge 在第三阶段用户签字后会把截图以 image 内容回给网页 Agent）。

---

### 📄 文件名：`ptyJobs.js`

- **文件职责：** 桌面 Chat 档 B：把 run/start/cancel/input 排进队列，NDJSON `pty_request`，等插件 POST `/api/pty/jobs/:id`。`runWithPty` 用 AsyncLocalStorage，因此 `timedTool`/`callTool` 不必传 opts。
- **Function `runWithPty(ctx, fn)`** — `{ pty, remote, emit }` 写入 ALS。
- **Function `enqueue(kind, payload)`** — 发 `pty_request`；超时 120s；插件 `done` 后 resolve。
- **Function `report(jobId, body)`** — accepted / progress / done。
- **Function `listPending` / `noteClient` / `snapshot` / `resetForTests`**。

### 📄 文件名：`workspaceInfo.js`

- **Function `workspaceInfo`（L11–L53）** — loadCustom + resolve env/stack；try gitStatus，catch 记 error；try listDir 顶层 maxDepth 1；try 读 package.json `name`。返回 root、packageName、git 摘要、skills 名、topLevel、**`rules: getInstructions()`**（给丢掉 `initialize.instructions` 的网页扩展）、hint 写明先看 `rules`、不要 dump 整树。

---

### 📄 文件名：`progressTracker.js`

- **模块状态 L3–L10** `currentTaskState` 初始 idle。
- **Function `reportProgress`（L12–L27）** — percentage≥100 → completed 否则 in_progress；progress clamp 0–100；broadcast `progress_updated`。
- **Function `setTodos`（L29–L46）** — 补 id/title/status；broadcast `todos_updated`。
- **Function `getTaskState`（L48–L50）** / **`resetTaskState`（L52–L63）** — reset 回到 idle 并 broadcast。

---

### 📄 文件名：`planRound.js`

- **文件职责：** 内存里的 **一次 Plan 多模型回合**（进程级单例，不落盘）。串行分支、满额拒绝、≥2 才能总结。不调 HTTP。
- **Function `clampMax(n)`（L5–L9）** — 非有限数 → 4；否则 round 后夹到 2–8。
- **Function `previewOf(text)`（L11–L14）** — 空白压成空格，超 160 加省略号。
- **Function `snapshot()`（L16–L48）** — 无回合：`active:false`、空 branches、`canBranch/canMerge` 假。有回合：`canBranch` = 已有 ≥1 支且未满且未合并；`canMerge` = ≥2 且未合并；branches 只带 preview。
- **Function `reset()`（L50–L53）** — `round=null`，返回 snapshot。
- **Function `start({ task, maxBranches, mergeModelId, thinkLevel })`（L55–L72）** — task trim 空 → `Error` `code='E_PLAN_NO_TASK'`。否则覆盖 `round`，broadcast `plan_round_started`。
- **Function `current()`（L74–L76）** — 内部对象或 `null`。
- **Function `addBranch(branch)`（L78–L109）** — 无回合 `E_PLAN_NO_ROUND`；已合并 `E_PLAN_MERGED`；已满 `E_PLAN_FULL`。记下 index/model/thinkLevel/`simulated`/answer，broadcast `plan_branch`。
- **Function `markMerged(result)`（L111–L125）** — 无回合 `E_PLAN_NO_ROUND`；`<2` 支 `E_PLAN_NEED_TWO`。`round.merged = result`，broadcast `plan_merged`。
- **Function `branches()`（L127–L129）** — 拷贝数组或 `[]`。

### 📄 文件名：`consensusEngine.js`

- **文件职责：** **没有 API Key** 时的本机单支草案 + 原文拼接。不请求 LLM HTTP。`simulated:true`；`consensusReached:false`；`agreementRate:null`（**没有**假 97%）。有 Key 时的真分支/合并在 `../agent/runChat.js` 调 `runOpenAI`。
- **Function `clip`（L3–L6）** — 截到 n（默认 900）。
- **Function `localPlanText`（L8–L25）** — 用 facts 的文件/README/清单拼一段中文草案，并写明「这是本机内置探索」。
- **Function `draftLocalBranch`（L27–L39）** — 返回 `{ simulated:true, answer, modelName, thinkLevel, focus:'本机只读摸底' }`。
- **Function `mergeLocalBranches`（L41–L77）** — 把各支 `answer` 原文拼进 canonical；summary 写「不是假的 97% 投票」；broadcast `consensus_finished`。
- **Function `runMultiModelConsensus`（L78–L88）** — 无活回合时出一份本机草案再 `mergeLocalBranches`（单支）。给 `POST /consensus/run` 用。

---

## 3. 执行逻辑流

1. 调用方 `callTool(name, args, mode?)`（`index.js` L491）。
2. `resolveToolName` → 查 registry → 可选模式锁 → `normalizeToolArgs` → 可选危险命令闸。
3. handler 进入具体文件：读走 `fileOps`/`findFiles`/`gitOps`/`skills`/`workspaceInfo`/`memory`；写走 `patchEngine`/`fileOps.writeFile`；命令走 `executor`。读/补丁成功会 `rememberHash`。
4. 所有写路径先 `resolveSafePath` → `assertNotSensitive`。
5. 结果经 `clipJson` 返回；副作用经 `eventBus.broadcast` 到工作台。
6. 远程 MCP 不传 mode，锁不生效；本机 Chat 传 ask/plan/code。
7. 不是 git 仓库时 `git_status`/`git_diff` 返回 `available:false`，不抛。
