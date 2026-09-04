# bin 模块说明书

当前处理目标：`bin/`

Git **不再内嵌** code-server。以前那份残缺切片 `code-server-dist/` 已删除，不能当 VS Code 启动。本层无 `.js` / `.html`。

---

## 1. 模块概述

- **定位：** 网页 VS Code 运行时的落盘目录（下载结果）。不是 MCP 实现。
- **兄弟依赖：** `webagent-core/scripts/ensure-code-server.js` 往 `code-server-runtime/` 写文件；`run-code-oss.js` 从这里找 `entry.js`。
- **谁调用：** 仅第二种跑法 `run-webagent-vscode.cmd`。主路径 `run-webagent.cmd` **不读**本目录。

| 路径 | 进 Git？ | 职责 |
|---|---|---|
| `code-server-runtime/` | 内容忽略（保留 `package.json`） | 第一次从 npm 下载的完整 `code-server@4.135.0` |
| `code-server-dist/` | 禁止存在 | 由 `codeServerNotRunnable.test.js` 断言不得出现 |

---

## 2. 文件级详细说明书

### 📄 文件名：`code-server-runtime/package.json`

- **文件职责：** 给 `ensure()` 的占位清单；`.gitignore` 用 `!bin/code-server-runtime/package.json` 保留这一份。`npm install` 之后同目录会出现被忽略的 `node_modules/`。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | 包名 | `webagent-code-server-runtime` |
  | `private` | 禁止当公共包发布 | `true` |
  | `description` | 说明 | 写明下载官方 npm `code-server 4.135.0`；不要用残缺 git 切片 `lib/code-server-4.135.0` |
  | `dependencies.code-server` | 要安装的版本 | **恰好** `4.135.0`（与 `ensure-code-server.js` 的 `VERSION` 一致） |

无 scripts、无 main。本文件被 `ensure()` 在缺失 entry 时也可能重写（见 `scripts/README.md`），以磁盘当时内容为准。

---

## 3. 执行逻辑流（仅本目录）

1. 用户第一次跑 `run-webagent-vscode.cmd`。
2. `ensure-code-server.js` 在 `code-server-runtime/` 执行 npm，拉 `code-server@4.135.0`。
3. 找到 `node_modules/code-server/out/node/entry.js` 后由 `run-code-oss.js` spawn。
4. 这些文件不进 Git；删掉 `node_modules` 后下次会再下载。
5. 主路径工作台仍走 `run-webagent.cmd`，不经过本目录。
