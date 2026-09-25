# extensions-installed 模块说明书

当前处理目标：`webagent-core/extensions-installed/`

这是 **code-server 的插件安装目录**，不是第二份源码。`scripts/ensure-code-server.js` 的 `syncExtension()` 把 `../extension/` 拷到这里。

副本以核心扩展package版本定位，完整文件集合与逐字节一致性由extensionCopy回归核对；不是重新审过全部扩展或用户IDE验收。

**不要在本目录改 JS。** 改 `../extension/extension.js` / `package.json`，再跑 vscode 入口即可覆盖副本。

无 Python。本层无手写源码；副本文件与 `../extension/` 相同（`extension.js`、`hostManager.js`、`dangerousPolicy.js`、`editorReview.js`、`modeFromChatRequest.js`、`ptyHost.js`、`ptyPolicy.js`、`workspaceMatch.js`、`package.json`、`PTY扩展详解.md`、`入口与Webview详解.md`、`resources/icon.svg`）。桌面 VS Code **不**读本目录，走用户 `~/.vscode/extensions`。本目录不含 `host.json`（只有 install-desktop-extension.js 写入桌面安装目录），code-server 里的主机由 run-webagent-vscode.cmd 启动，插件只接管。

---

## 1. 模块概述

- **定位：** `--extensions-dir` 指向的已安装树，让网页 VS Code 侧栏出现 Web Agent。
- **兄弟依赖：** 源是 `../extension/`；被 `../scripts/ensure-code-server.js` 写入；`extensions.json` 含**本机绝对路径**，故 `.gitignore` 忽略该 json（规则见仓库根`.gitignore`，不依赖固定行号）。
- **谁调用：** `run-code-oss.js` 把 code-server 的 `--extensions-dir` 指过来。经典工作台不从这里加载扩展；安装载荷等流程仍可能校验/复制这些文件。

行级函数说明见 [../extension/README.md](../extension/README.md)，本 README 不把 `extension.js` 再译一遍。

---

## 2. 文件级详细说明书

### 📄 文件名：`webagent.webagent-core-0.7.2/package.json`

- **文件职责：** 安装后的插件清单副本。Key 与 `../extension/package.json` 相同（`name=webagent-core`，`version=0.7.2`，`publisher=webagent`，Chat 参与者 `webagent.agent` 等）。逐 Key 表见 extension 说明书，不在此重复。

### 📄 文件名：`webagent.webagent-core-0.7.2/extension.js`

- **文件职责：** `activate` 等函数的副本。以 `../extension/extension.js` 为准。

### 📄 文件名：`webagent.webagent-core-0.7.2/modeFromChatRequest.js`

- **文件职责：** Chat 模式解析副本。以 `../extension/modeFromChatRequest.js` 为准。`extension.js` 会 `require('./modeFromChatRequest')`。

### 📄 文件名：`webagent.webagent-core-0.7.2/workspaceMatch.js`

- **文件职责：** 工作区路径比对副本。以 `../extension/workspaceMatch.js` 为准。

### 📄 文件名：`webagent.webagent-core-0.7.2/resources/icon.svg`

- **文件职责：** 活动栏图标副本。

### 📄 文件名：`webagent.webagent-core-0.7.2/PTY扩展详解.md`

- **文件职责：** PTY 宿主说明的副本，以 `../extension/PTY扩展详解.md` 为准。
- **已知副作用（不修副本）：** 正文里两条指向 `../agent-host/src/tools/…` 的相对链接是按**源目录** `webagent-core/extension/` 写的，在源位置能正确解析；副本位于更深一层，同样的相对路径在本目录下指不到目标。`extensionCopy` 回归要求副本与源逐字节相同，因此**不单独修改副本**；要读这两篇请从 [../extension/PTY扩展详解.md](../extension/PTY扩展详解.md) 进入。这是拷贝布局造成的链接失效，不是运行时缺陷——VS Code 加载插件不读这两条链接。

### 📄 文件名：`extensions.json`（启动时生成，不进 Git）

- **文件职责：** code-server 扩展列表。`syncExtension` 会写入 `location.path` 为机器绝对路径。不要提交。

---

## 3. 执行逻辑流（仅本目录）

1. vscode/app启动编排（或ensure-code-server的直接CLI）调用syncExtension；当前版本来自规范extension/package.json，不另手填副本版本。
2. 覆盖拷贝 `extension/` → `webagent.webagent-core-0.7.2/`。
3. 写 `extensions.json`（gitignore）。
4. code-server 从本目录加载插件，HTTP 打 agent-host `:48271`。
