# agent-host 模块说明书

当前处理目标：`webagent-core/agent-host/`

本目录是 **现行 Bridge 进程** 的 npm 包根。本层只有 `package.json`（无 `.js` / `.html`）。源码在 `src/`，测试在 `tests/`，各子目录已有第一阶段 README，这里不重复行级翻译那些 `.js`。

---

## 1. 模块概述

- **定位：** 独立 Node 进程：工作台 UI（默认 3000）、MCP/API（默认 48271）、本机 Chat、磁盘工具、可选隧道。
- **兄弟依赖：** 静态页来自 `../workbench/`（`src/index.js` 挂静态目录）。不依赖 `../extension/`（那是 code-server 插件）。不依赖 `../../webagent-repro/`。
- **谁调用：** 仓库根 `run-webagent.cmd` / `.sh` 执行 `node src/index.js`；`../scripts/run-code-oss.js` 同样启动并设 `WEBAGENT_SKIP_WORKBENCH=1`；`run-tests.cmd` 跑 `npm test`。

---

## 2. 文件级详细说明书

### 📄 文件名：`package.json`

- **文件职责：** npm 清单：启动命令、测试顺序、运行时依赖。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `name` | 包名 | `agent-host` |
  | `version` | npm 版本 | `1.0.0`（展示用产品版本在 `src/config.js` 的 `0.6.9`，不是这个字段） |
  | `main` | Node 默认入口字段 | `index.js`（**本目录根没有该文件**；真正启动走 `scripts.start`） |
  | `scripts.start` | `npm start` | `node src/index.js` |
  | `scripts.test` | `npm test` | 16 个 `tests/*.test.js` 用 `&&` 串联，顺序见 [`tests/README.md`](./tests/README.md)。任一非 0 即停。 |
  | `keywords` | npm 关键词 | `[]` |
  | `author` | 作者 | `""` |
  | `license` | 许可证 | `ISC` |
  | `description` | 简介 | `""` |
  | `dependencies.cors` | CORS 中间件 | `^2.8.6`（`src/utils/corsAllow.js` 的白名单，不再全开） |
  | `dependencies.diff` | jsdiff | `^9.0.0`（`src/utils/diff.js`、`tools/patchEngine.js`） |
  | `dependencies.express` | HTTP | `^5.2.1` |
  | `dependencies.ws` | WebSocket | `^8.21.3`（`src/index.js` 的 `/ws`） |

无 `devDependencies`。测试用 Node 自带 `assert`。

`package-lock.json` 是 lockfile，不在本说明书展开每个嵌套包。

---

## 3. 执行逻辑流（仅本层）

1. `cd webagent-core/agent-host`（或由根 `.cmd` `cd` 进来）。
2. 没有 `node_modules/express` 时 `npm install`（根脚本检查的是这个路径）。
3. `node src/index.js` → 见 `src/README.md`（双端口、OAuth、MCP）。
4. `npm test` → 见 `tests/README.md`。
