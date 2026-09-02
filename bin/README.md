# `bin/`

Git **不再内嵌** code-server。以前那份残缺切片 `code-server-dist/` 已删除，不能当 VS Code 启动。

| 路径 | 进 Git？ | 职责 |
|---|---|---|
| `code-server-runtime/` | 内容忽略 | `run-shuncode-vscode.cmd` 第一次从 npm 下载的完整 `code-server@4.135.0`（带 `out/`） |

第二种跑法：仓库根 **`run-shuncode-vscode.cmd`**。见 [网页VSCode使用指南.md](../网页VSCode使用指南.md)。

主路径仍是 **`run-shuncode.cmd`**（自绘工作台，不经过 code-server）。
