# ShunCode 复现工作台

对照官方文档 [docs.shuncode.top](https://docs.shuncode.top/docs/intro/) 的本地可运行版本。

**Windows 用户请先读 [使用指南.md](./使用指南.md)**（安装、CMD、自己的仓库、Bridge 全在里面）。DeepSeek 网页另见 [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md)。

**GitHub 上这套东西怎么跑、文件夹是谁：** 请读 **[组件说明.md](./组件说明.md)**。

| 文档 | 读它当… |
|---|---|
| [使用指南.md](./使用指南.md) | Windows + CMD 从安装到 Bridge |
| [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md) | DeepSeek 网页 + DeepSeek++（不 fork 扩展） |
| [网页VSCode使用指南.md](./网页VSCode使用指南.md) | 浏览器里真 VS Code |
| [组件说明.md](./组件说明.md) | 整条工作流、怎么跑、为什么这样装、每个目录是谁 |
| [技术实现.md](./技术实现.md) | 对着源码逐步直译：每个函数拆步骤，if/try 不漏；不杜撰未实现的逻辑 |
| [总览.md](./总览.md) | 各子文件夹 README 索引、全局调用链、Install→Run |
| [DOCUMENTATION_SUMMARY.md](./DOCUMENTATION_SUMMARY.md) | 文档覆盖率与链接审查 |
| [测试说明.md](./测试说明.md) | 怎么跑测试、测了什么 |

简要对照：

| 目录 | 现在用不用 | 职责 |
|---|---|---|
| `shuncode-core/` | **现行主程序** | 工作台 UI + 独立 agent-host（MCP / 工具 / 隧道） |
| `workspace/` | 默认演示工作区 | 计算器示例；`.shuncode`（含 `docs-sync` 等 Skill）在这里，不在仓库根 |
| `shuncode-repro/` | 不用 | 更早一版纯 Bridge 原型 |
| `bin/code-server-runtime/` | 第二种跑法下载到这里 | npm 完整 code-server，不进 Git |
| `run-shuncode-vscode.cmd` | 第二种跑法 | 浏览器里真 VS Code + ShunCode 侧栏，见 [网页VSCode使用指南.md](./网页VSCode使用指南.md) |
| `shuncode-core/agent-host/tests/` | 产品测试 | `run-tests.cmd`；不必在仓库根再放 `tests/` |

- 右侧 **Chat**：输入框 **Agent ▾** 默认 **Code**（像 Copilot Agent：搜-读-改-测），只改本机，不需要隧道，不需要 Plus
- **Bridge**：同一套工具变成 MCP。Arena 等网页栏贴 URL 即可；**DeepSeek 网页**要装 DeepSeek++（不 fork 进本仓库），把 Streamable HTTP 填进扩展；ChatGPT 免费普通聊天通常调不了 MCP；Plus 开发者模式可用 OAuth 连接器

## Windows 最快开始

```bat
check-env.cmd
run-shuncode.cmd
```

浏览器打开 http://127.0.0.1:3000

挂你自己的仓库：

```bat
run-shuncode.cmd D:\code\my-app
```

让网页 Agent 改这个仓库：先 `winget install --id Cloudflare.cloudflared`，再在工作台 **启动 Bridge**。Arena 复制提示词；DeepSeek 把 MCP 地址填进 DeepSeek++。细节见使用指南第 6 节。

网页里打开真正的 VS Code：

```bat
run-shuncode-vscode.cmd
```

验证实现：

```bat
run-tests.cmd
```

说明见 [测试说明.md](./测试说明.md)。

## 其它环境

```bash
./run-shuncode.sh
```
