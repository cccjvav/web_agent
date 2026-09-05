# code-server 配置说明书

当前处理目标：`.config/code-server/`

本目录只有 `config.yaml`。给第二种跑法（网页 VS Code）用，**不是** MCP 实现。无 `.js` / `.py` / `.html`。

---

## 1. 模块概述

- **定位：** code-server 的 `--config` 文件。`webagent-core/scripts/run-code-oss.js` 拼出本路径，以 `--config` 传入。口令不写在本文件（避免进 Git），由 `codeServerAuth.js` 写到 `.local/share/code-server/webagent-password`。
- **兄弟依赖：** 只被 `run-code-oss.js` 读取。自绘工作台 `run-webagent.cmd` **不读**本文件。
- **谁调用：** `run-webagent-vscode.cmd` → `run-code-oss.js` → code-server 进程。

---

## 2. 文件级详细说明书

### 📄 文件名：`config.yaml`

- **文件职责：** 默认只听本机 3000，要登录，关掉遥测。共 5 行，无函数。明文密码不在这里。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `bind-addr` | 监听地址 | `127.0.0.1:3000`（与 `CODE_SERVER_PORT` 默认一致；进程参数里仍会再传 `--bind-addr`，可用 `WEBAGENT_BIND` 覆盖） |
  | `auth` | 登录 | `password`（口令由环境变量 `PASSWORD` 传入，来自 `CODE_SERVER_PASSWORD` 或 `.local/share/code-server/webagent-password`） |
  | `cert` | TLS 证书 | `false` |
  | `disable-telemetry` | 关遥测 | `true` |
  | `disable-update-check` | 关更新检查 | `true` |

命令行还会加 `--disable-workspace-trust`、`--trusted-origins`（仅 `127.0.0.1` / `localhost`）、`--app-name Web Agent`（见 `run-code-oss.js`），不写在本 yaml 里。`CODE_SERVER_AUTH=none` 时命令行 `--auth none` 关掉登录。

---

## 3. 执行逻辑流（仅本目录）

1. 用户跑 vscode 入口。
2. `run-code-oss.js` 把 `--config` 指到本文件，并设置 `PASSWORD`。
3. code-server 按 yaml + 命令行参数听 3000，浏览器先看到登录页。
4. 改本文件会影响网页 VS Code 的认证/绑定；**不会**改变 agent-host 的 48271。
