# extensions-installed 模块说明书

当前处理目标：`shuncode-core/extensions-installed/`

这是 **code-server 的插件安装目录**，不是第二份源码。`scripts/ensure-code-server.js` 的 `syncExtension()` 把 `../extension/` 拷到这里。

**不要在本目录改 JS。** 改 `../extension/extension.js` / `package.json`，再跑 vscode 入口即可覆盖副本。

无 Python。本层无手写源码；副本文件与 `../extension/` 相同（`extension.js`、`package.json`、`resources/icon.svg`）。

---

## 1. 模块概述

- **定位：** `--extensions-dir` 指向的已安装树，让网页 VS Code 侧栏出现 ShunCode。
- **兄弟依赖：** 源是 `../extension/`；被 `../scripts/ensure-code-server.js` 写入；`extensions.json` 含**本机绝对路径**，故 `.gitignore` 忽略该 json（见仓库根 `.gitignore` L28）。
- **谁调用：** `run-code-oss.js` 把 code-server 的 `--extensions-dir` 指过来。自绘工作台 **不读** 本目录。

行级函数说明见 [../extension/README.md](../extension/README.md)，本 README 不把 `extension.js` 再译一遍。

---

## 2. 文件级详细说明书

### 📄 文件名：`shuncode.shuncode-core-0.6.9/package.json`

- **文件职责：** 安装后的插件清单副本。Key 与 `../extension/package.json` 相同（`name=shuncode-core`，`version=0.6.9`，`publisher=shuncode`，Chat 参与者 `shuncode.agent` 等）。逐 Key 表见 extension 说明书，不在此重复。

### 📄 文件名：`shuncode.shuncode-core-0.6.9/extension.js`

- **文件职责：** `activate` 等函数的副本。以 `../extension/extension.js` 为准。

### 📄 文件名：`shuncode.shuncode-core-0.6.9/resources/icon.svg`

- **文件职责：** 活动栏图标副本。

### 📄 文件名：`extensions.json`（启动时生成，不进 Git）

- **文件职责：** code-server 扩展列表。`syncExtension` 会写入 `location.path` 为机器绝对路径。不要提交。

---

## 3. 执行逻辑流（仅本目录）

1. `run-shuncode-vscode.cmd` → `scripts/run-code-oss.js` → `syncExtension()`。
2. 覆盖拷贝 `extension/` → `shuncode.shuncode-core-0.6.9/`。
3. 写 `extensions.json`（gitignore）。
4. code-server 从本目录加载插件，HTTP 打 agent-host `:48271`。
