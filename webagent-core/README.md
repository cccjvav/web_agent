# webagent-core 模块说明书

当前处理目标：`webagent-core/`

这是本仓库 **正在维护的产品代码**。`run-webagent.cmd` / `run-webagent.sh` 只启动这里的 `agent-host`。

本层直接文件只有 `start-webagent.sh` 与本 README。子目录源码的行级说明在各自内部 README，这里不把 `agent-host/src/**` 再抄一遍。

---

## 1. 模块概述

- **定位：** 产品代码根：工作台、MCP 进程、VS Code 插件、code-server 启动脚本。
- **兄弟依赖：** 被仓库根启动脚本调用；默认工作区是仓库根 `workspace/`（不在本文件夹内）。
- **谁调用：** 根目录 `run-webagent*.cmd/.sh`、`run-tests.cmd`。

| 子目录 | 职责 | 行级 README |
|---|---|---|
| `workbench/` | 浏览器工作台（http://127.0.0.1:3000） | `workbench/README.md` |
| `agent-host/` | MCP `:48271`、本机 Chat、隧道、磁盘工具 | `agent-host/README.md` 与 `src/*/README.md` |
| `extension/` | VS Code 插件：侧栏 + `@webagent` | `extension/README.md` |
| `scripts/` | 网页 VS Code：下载 code-server 并双进程启动 | `scripts/README.md` |
| `extensions-installed/` | `code-server --extensions-dir` 的已安装副本 | `extensions-installed/README.md` |

Windows 操作见根目录 [使用指南.md](../使用指南.md)。工作流见 [组件说明.md](../组件说明.md)。人话架构见 [架构导读.md](../架构导读.md)。测试见 `agent-host/tests/` 与 [测试说明.md](../测试说明.md)。

---

## 2. 文件级详细说明书

### 📄 文件名：`start-webagent.sh`

- **文件职责：** 从 `webagent-core/` 跳回仓库根，转调根目录 `run-webagent.sh`。不是 MCP 实现。
- **核心逻辑拆解（文件共 4 行）：**
  - L1：shebang `#!/bin/bash`
  - L2：`set -e`，命令失败即退出
  - L3：`ROOT` = 本脚本所在目录的上一级（仓库根）
  - L4：`exec "$ROOT/run-webagent.sh"` 替换当前进程，参数不转发（本文件无 `"$@"`）
- **关键变量：** 无配置常量。无函数。

无 `.py` / `.js` / `.html` / `.json` 位于本层。

---

## 3. 执行逻辑流（仅本层）

1. 用户通常 **不** 先进入本目录，而是双击仓库根 `run-webagent.cmd` → `agent-host/src/index.js`。
2. 若有人执行本目录 `start-webagent.sh`：算出仓库根 → `exec run-webagent.sh` → 与根 bash 入口相同。
3. 网页 VS Code：根 `run-webagent-vscode.cmd` → `scripts/run-code-oss.js` → 拷 `extension/` 到 `extensions-installed/`，agent-host 跳过 3000。
