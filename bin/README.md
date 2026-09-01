# `bin/` —— 第三方 code-server（现行启动不用）

这里只有一份 [code-server 4.135.0](https://github.com/coder/code-server) 的本地切片：

```
bin/code-server-dist/lib/code-server-4.135.0/
```

官方 ShunCode 用 **Code-OSS / VS Code Web** 当编辑器外壳，模型与工具在独立 `agent-host`。本目录就是按那个架构放进来的载体。

**现在不要从这里启动任何东西。** Windows 请用仓库根目录的 `run-shuncode.cmd`，浏览器打开的是 `shuncode-core/workbench/`，不是 code-server。

这份拷贝：

- **有**：`package.json`（version `4.135.0`）、启动脚本 `bin/code-server`、`lib/vscode` 下大量语言扩展与资源、许可证
- **没有**：可运行所需的 `out/` 编译结果、`node_modules/`，也没有 Windows `.cmd`
- 因此它不能当「安装好的 VS Code」用，只供对照架构

更完整的说明见仓库根目录 [组件说明.md](../组件说明.md) 第 1.2 节。
