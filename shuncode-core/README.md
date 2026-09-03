# shuncode-core

这是本仓库 **正在维护的产品代码**。`run-shuncode.cmd` / `run-shuncode.sh` 只启动这里的 `agent-host`。

| 子目录 | 职责 |
|---|---|
| `workbench/` | 浏览器工作台（http://127.0.0.1:3000） |
| `agent-host/` | 独立进程：MCP `:48271`、本机 Chat、cloudflared 隧道、磁盘工具 |
| `extension/` | VS Code 插件：侧栏 Chat/Bridge + 原生 Chat `@shuncode`（默认 Agent） |
| `extensions-installed/` | 供 `code-server --extensions-dir` 的已安装副本 |

Windows 操作见根目录 [使用指南.md](../使用指南.md)。整条工作流和每个文件夹是谁，见 [组件说明.md](../组件说明.md)。测试见 `agent-host/tests/` 与 [测试说明.md](../测试说明.md)。
