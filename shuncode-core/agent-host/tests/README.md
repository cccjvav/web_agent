# agent-host 测试

本目录是 **现行产品的测试集**（Node 自带 `assert`，无 Jest）。不需要再在仓库根另建一个 `tests/`。

| 文件 | 覆盖 |
|---|---|
| `patchEngine.test.js` | `apply_patch` 成功、STALE_FILE、冲突、grep |
| `mcpProtocol.test.js` | `initialize.instructions`、资源、24 个工具、危险命令、memory、connect 提示词原文 |
| `workspaceTools.test.js` | git 只读、skills、删/改名、Ask 模式锁、路径逃逸、`start_command` |
| `tunnel.test.js` | 从 cloudflared 日志解析 `*.trycloudflare.com` |
| `httpSmoke.test.js` | 真起进程：`/health`、工作台 HTML、MCP 401、initialize、tools/list、ping |
| `codeServerNotRunnable.test.js` | 断言 `bin/code-server-dist` **缺运行文件**，且启动脚本不调用它 |

仓库根目录 Windows：`run-tests.cmd`  
其它环境：`cd shuncode-core/agent-host && npm test`

说明全文：[测试说明.md](../../../测试说明.md)
