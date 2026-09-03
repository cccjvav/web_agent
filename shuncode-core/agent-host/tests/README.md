# agent-host 测试

本目录是 **现行产品的测试集**（Node 自带 `assert`，无 Jest）。不需要再在仓库根另建一个 `tests/`。

| 文件 | 覆盖 |
|---|---|
| `patchEngine.test.js` | `apply_patch` 成功、STALE_FILE、冲突、grep |
| `mcpProtocol.test.js` | `initialize.instructions`、资源、**25** 个工具、危险命令、memory、connect 提示词、DeepSeek 客户端配方 |
| `workspaceTools.test.js` | git 只读、skills、删/改名、Ask 模式锁、路径逃逸、`start_command` |
| `tunnel.test.js` | 从 cloudflared 日志解析 `*.trycloudflare.com` |
| `httpSmoke.test.js` | 真起进程：`/health`、工作台 HTML、MCP 401、initialize、tools/list、ping、DeepSeek 按钮 |
| `codeServerNotRunnable.test.js` | Git 不内嵌 code-server-dist；vscode 入口走 npm runtime |
| `skipWorkbench.test.js` | `SHUNCODE_SKIP_WORKBENCH=1` 不占用工作台端口 |
| `runChat.test.js` | 内置 Chat 对任意工作区搜-读-再测；不依赖 calculator.js；不调用 get_diagnostics |
| `chatMode.test.js` | VS Code Chat `@shuncode` 默认 Agent（code）；`/ask` `/plan` 切换 |
| `profile.test.js` | 环境偏好 / 技术栈写入 `.shuncode`，并进入 Chat / MCP 指令 |
| `oauth.test.js` | OAuth 发现、配对、PKCE、Bearer `/mcp`、SSE |

仓库根目录 Windows：`run-tests.cmd`  
其它环境：`cd shuncode-core/agent-host && npm test`

说明全文：[测试说明.md](../../../测试说明.md)
