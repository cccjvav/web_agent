# `bin/` —— 第三方 code-server（现行启动不用）

这里只有一份 [code-server 4.135.0](https://github.com/coder/code-server) 的本地切片：

```
bin/code-server-dist/lib/code-server-4.135.0/
```

官方 ShunCode 用 **Code-OSS / VS Code Web** 当编辑器外壳，模型与工具在独立 `agent-host`。本目录就是按那个架构放进来的载体。

**这不是本项目的第二种运行方式，也不可用。** 不要写、也不要执行「启动 code-server」的步骤。

Windows 请只用仓库根目录的 `run-shuncode.cmd`。浏览器打开的是 `shuncode-core/workbench/`。

这份拷贝：

| 有 | 没有（缺了就不能启动） |
|---|---|
| `package.json`（`code-server@4.135.0`） | **`out/`**（`package.json` 声明的入口 `out/node/entry.js`） |
| Linux 脚本 `bin/code-server`（去 exec `lib/node`） | **`lib/node`** 捆绑 Node |
| `lib/vscode/extensions/` 语言包、图标 | **`lib/vscode/out`**（真正的 VS Code 工作台） |
| 登录页 HTML/CSS、LICENSE | **`node_modules/`**、Windows `.cmd` |

官方 code-server 面向 Linux/macOS，原生 Windows 需 WSL；即便去官网下完整安装包，也和本仓库这份 **残缺切片** 不是一回事。测试 `codeServerNotRunnable.test.js` 会断言上述文件仍然缺失、且启动脚本不引用它。

更完整的说明见 [组件说明.md](../组件说明.md) 第 1.2 节。
