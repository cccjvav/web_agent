# scripts 模块说明书

当前处理目标：`webagent-core/scripts/`

网页 VS Code 第二种跑法的启动脚本。`run-webagent.cmd` **不进入**本目录。无 `.html`。

文件：`ensure-code-server.js`、`run-code-oss.js`、`codeServerAuth.js`、`install-desktop-extension.js`。

---

## 1. 模块概述

- **定位：** 第一次从 npm 安装完整 `code-server@4.135.0` 到 `bin/code-server-runtime/`（Git 忽略内容），同步 Web Agent 插件，然后同时拉起 agent-host（跳过工作台 3000）与 code-server（占 3000）。
- **依赖：** Node `fs`/`path`/`http`/`child_process`；本机 npm。
- **谁调用：** 仓库根 `run-webagent-vscode.cmd` / `.sh` 执行 `node webagent-core/scripts/run-code-oss.js <工作区>`。`ensure-code-server.js` 也可作为 CLI（`require.main === module`）。桌面 VS Code 侧载走 `install-desktop-extension.js`（根 `install-vscode-extension.cmd`），**不**进本目录的 code-server 流程。

---

## 2. 文件级详细说明书

### 📄 文件名：`ensure-code-server.js`

- **文件职责：** 下载 code-server、补 VS Code 依赖、拷插件、写 `extensions.json`。
- **核心类/函数清单：**

  - **Function `npmCmd()`（L9–L11）** — win32 → `npm.cmd`，否则 `npm`。
  - **Function `runNpm(args, cwd)`（L13–L24）** — spawnSync inherit；Windows `shell:true`；env 加 `FORCE_NODE_VERSION` 为当前 Node 主版本。`status !== 0` 抛 Error。
  - **Function `findEntry()`（L26–L33）** — 三个候选：`node_modules/code-server/out/node/entry.js`、`code-server-4.135.0/out/node/entry.js`、带 `-linux-amd64` 的同名。第一个 exists 或 null。
  - **Function `vscodeDirFromEntry(entry)`（L35–L37）** — `dirname(entry)/../../lib/vscode`。
  - **Function `ensureVscodeDeps(entry)`（L39–L48）** — 已有 `@microsoft/1ds-core-js` 则 return；无 package.json 抛「包不完整」；否则 npm install `--omit=dev --ignore-scripts`。
  - **Function `ensure()`（L50–L81）** — mkdir runtimeRoot；无 entry 则写私有 package.json（只依赖 code-server）并 npm install `code-server@VERSION`；仍无 entry 抛错；`ensureVscodeDeps`；返回 entry。
  - **Function `extensionVersion()`（L83–L90）** — 读 `webagent-core/extension/package.json` 的 `version`；读失败回退 `'0.6.9'`。
  - **Function `syncExtension()`（L92–L127）** — 目标目录 `extensions-installed/webagent.webagent-core-${version}/`；拷源目录里的 `package.json` 与所有 `.js`（含 `modeFromChatRequest.js`、`workspaceMatch.js`）；有 icon 则拷；写 `extensions.json`，`location.path` 为本机绝对路径（正斜杠）。

- **关键变量：**
  - L5 `VERSION = '4.135.0'`
  - L6 `repoRoot` = 本文件上两级（仓库根）
  - L7 `runtimeRoot` = `bin/code-server-runtime`
  - L119–L126：直接运行时 try ensure+syncExtension，失败 exit 1。
  - L128 导出 `{ ensure, syncExtension, findEntry, VERSION, runtimeRoot, repoRoot }`。

---

### 📄 文件名：`codeServerAuth.js`

- **文件职责：** 网页 VS Code 的登录口令与 CORS Origin 名单。不 spawn code-server。
- **Function `trustedOrigins(port)`（L5–L8）** — `http://127.0.0.1:${port},http://localhost:${port}`。不是 `*`。
- **Function `resolveAuth({ userData, env })`（L10–L35）**
  - L11–L14：`CODE_SERVER_AUTH=none` → `{ mode:'none', password:null }`。
  - L16–L21：否则 `mode:'password'`。`CODE_SERVER_PASSWORD` 有值则用之。
  - L23–L29：读 `userData/webagent-password`（已有则沿用）。
  - L31–L34：没有则 `randomBytes(12)` 的 base64url，写入该文件 `mode 0o600`。
- L37 导出 `{ trustedOrigins, resolveAuth }`。

### 📄 文件名：`run-code-oss.js`

- **文件职责：** 编排：ensure → 装 agent-host 依赖 → 起 agent-host（skip workbench）→ 等 `/health` → 起 code-server。
- **顶层（L8–L17）：** `workspace` = argv[2] 或 `WORKSPACE_ROOT` 或仓库 `workspace`。不存在 `exit(1)`。`mcpPort` 默认 48271，`codePort` 默认 3000。
- **核心类/函数清单：**

  - **Function `waitHealth(url, timeoutMs)`（L19–L36）** — 循环 http.get：200 resolve；超时或持续 error 直到超时 → reject「agent-host 未在时限内就绪」；否则 200ms 再试。
  - **Function `run(command, args, opts)`（L38–L51）** — spawn inherit、windowsHide；error 打印后 exit 1。`env` 与 `process.env` 合并。返回 child。
  - **Function `main()`（L53–L166）**
    - L58–L60：`ensure()` + `syncExtension()`。
    - L62–L74：agent-host 无 `node_modules/express` 则在该目录 npm install；exit 非 0 reject。
    - L76–L95：SIGINT/SIGTERM：Windows `taskkill /pid /t /f`，否则 SIGTERM。
    - L97–L113：`run(process.execPath, ['src/index.js'], { cwd: agentHostDir, env: WORKSPACE_ROOT, AGENT_HOST_PORT, WEBAGENT_SKIP_WORKBENCH:'1' })`。agent exit 真值则 stop 并 exit。
    - L115：`waitHealth(http://127.0.0.1:${mcpPort}/health, 15000)`。
    - L117–L120：`userData` = 仓库根 `.local/share/code-server`（mkdir）；`configFile` = 仓库根 [`.config/code-server/config.yaml`](../../.config/code-server/README.md)；`resolveAuth`。
    - code-server 参数：`--auth` 为 `password`（或 `CODE_SERVER_AUTH=none`）、`--bind-addr ${WEBAGENT_BIND||127.0.0.1}:${codePort}`、关遥测/更新、`--trusted-origins` 仅本机 http 源、**默认不关 workspace-trust**、`--app-name Web Agent`、`--user-data-dir`、`--extensions-dir`、`--config`、最后一项 workspace 路径。
    - L150–L162：打印 VS Code URL；password 模式打印口令与文件路径。
    - L164–L168：spawn 时 password 模式把 `PASSWORD` 传给 code-server；退出则 stop 并 `exit(code||0)`。
  - L168–L171：`main().catch` 打印 message，exit 1。

### 📄 文件名：`install-desktop-extension.js`

- **文件职责：** 把 `webagent-core/extension` 拷进本机桌面 VS Code 的 extensions 目录。不是 code-server 路径（那条仍走 `syncExtension`）。
- **核心类/函数清单：**
  - **Function `readManifest()`** — 读插件 `package.json` 的 publisher / name / version，拼 `webagent.webagent-core-${version}`。
  - **Function `copyTree(from, to)`** — 递归拷贝；跳过 `README.md`。
  - **Function `pruneOld(extensionsDir, keepName)`** — 删除其它 `webagent.webagent-core-*` 目录。
  - **Function `defaultExtensionDirs()`** — `WEBAGENT_VSCODE_EXTENSIONS` 有值则只用它（测试）；否则 `~/.vscode/extensions`，若存在 `~/.vscode-insiders` 再加一份。
  - **Function `installTo(extensionsDir)`** — mkdir、copyTree、pruneOld，返回 dest。
  - **Function `installAll(dirs)`** — 对每个目录 `installTo`。
- **CLI：** `require.main === module` 时 `installAll()`，打印路径与下一步（`run-webagent.cmd`、打开同一工作区、Reload Window）。失败 exit 1。
- **导出：** `{ readManifest, copyTree, pruneOld, defaultExtensionDirs, installTo, installAll, SRC }`。

---

## 3. 执行逻辑流

1. 用户 `run-webagent-vscode.cmd D:\code\my-app`。
2. `run-code-oss.js` 检查工作区存在。
3. `ensure()` 可能下载 ~50MB code-server + VS Code deps。
4. `syncExtension()` 让侧栏出现 Web Agent。
5. agent-host 只听 48271（不占 3000）。
6. `/health` 200 后 code-server 听 3000，打开的是真 VS Code Web，工作区即用户路径。
7. 插件打 48271 的 `/api/chat` 与 `/api/bridge/*`，与自绘工作台同一引擎。
8. 不要与 `run-webagent.cmd` 同时开（抢 3000）。
9. 桌面 VS Code：`install-vscode-extension.cmd` → `install-desktop-extension.js` 拷到 `~/.vscode/extensions`；再单独 `run-webagent.cmd` 听 48271。不进本文件的 ensure/run-code-oss。
