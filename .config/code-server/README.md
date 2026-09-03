# code-server 配置说明书

当前处理目标：`.config/code-server/`

本目录只有 `config.yaml`。给第二种跑法（网页 VS Code）用，**不是** MCP 实现。无 `.js` / `.py` / `.html`。

---

## 1. 模块概述

- **定位：** code-server 的 `--config` 文件。`shuncode-core/scripts/run-code-oss.js` L116 拼出本路径，L139–L140 以 `--config` 传入。
- **兄弟依赖：** 只被 `run-code-oss.js` 读取。自绘工作台 `run-shuncode.cmd` **不读**本文件。
- **谁调用：** `run-shuncode-vscode.cmd` → `run-code-oss.js` → code-server 进程。

---

## 2. 文件级详细说明书

### 📄 文件名：`config.yaml`

- **文件职责：** 关掉登录与遥测，监听所有网卡 3000 端口。共 5 行，无函数。
- **每一个 Key：**

  | Key | 用途 | 取值 |
  |---|---|---|
  | `bind-addr` | 监听地址 | `0.0.0.0:3000`（与 `CODE_SERVER_PORT` 默认一致；进程参数里仍会再传 `--bind-addr`） |
  | `auth` | 登录 | `none`（无密码；只应在本机或受控预览用） |
  | `cert` | TLS 证书 | `false` |
  | `disable-telemetry` | 关遥测 | `true` |
  | `disable-update-check` | 关更新检查 | `true` |

命令行还会加 `--disable-workspace-trust`、`--trusted-origins *`、`--app-name ShunCode`（见 `run-code-oss.js` L120–L147），不写在本 yaml 里。

---

## 3. 执行逻辑流（仅本目录）

1. 用户跑 vscode 入口。
2. `run-code-oss.js` 把 `--config` 指到本文件。
3. code-server 按 yaml + 命令行参数听 3000。
4. 改本文件会影响网页 VS Code 的认证/绑定；**不会**改变 agent-host 的 48271。
