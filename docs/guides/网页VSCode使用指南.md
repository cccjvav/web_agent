# 网页 VS Code（code-server）使用指南

> 2026-09-16说明：文中第三方Chat Plus/DeepSeek++仅为候选客户端，不是当前兼容性认证。现行前置条件见各自指南；本机扩展不一律要求隧道，认证以实际协议为准。探针三种入口的实装范围见[入口矩阵](../../探针入口与实际可用范围.md)。


这是本仓库的 **第二条运行方式**：浏览器里打开 **真正的 VS Code**，左侧活动栏有 **Web Agent** 插件，插件连本机 `agent-host`。ChatGPT / Arena 改磁盘仍然走 Bridge + cloudflared，和第一种方式相同。

| | 方式 A：自绘工作台 | 方式 B：网页 VS Code | 方式 C：本机桌面 VS Code |
|---|---|---|---|
| 启动 | `run-webagent.cmd` | `run-webagent-vscode.cmd` | `run-webagent.cmd` + `install-vscode-extension.cmd` |
| 界面 | 仿 VS Code 的工作台 | code-server（基于 Code-OSS） | 已安装的微软 VS Code |
| 端口 3000 | 工作台 UI | code-server | **不占用**（可与 A 同时开） |
| 端口 48271 | agent-host MCP | 同样 | 同样（插件打这扇门） |
| 改文件的引擎 | 同一套 MCP 工具 | 同一套 | 同一套 |
| 同时开 A 与 B | **不要**（抢 3000） | **不要** | C 不抢 3000 |

本仓库不捆绑Windows版code-server，也没有取得此npm路径在用户Windows上的完整实机可用证据。请按指定版本核对[coder/code-server](https://github.com/coder/code-server)的当前平台支持；Windows主路径仍推荐桌面VS Code＋核心扩展。Git里不内嵌code-server。
**做法：** 第一次启动时用 **npm** 下载完整的 `code-server@4.135.0`（带 `out/`），装到 `bin/code-server-runtime/`（不进 Git）。主机的 Node 测试矩阵不等于 code-server 运行时兼容矩阵；应按所用 code-server 版本核对 Node 要求，不忽略 engines 警告作为验收办法。

---

## 1. Windows（CMD）

已能运行 `run-webagent.cmd` 的前提下（Node LTS + npm）：

```bat
cd /d D:\code\web_agent
run-webagent-vscode.cmd
```

挂自己的仓库：

```bat
run-webagent-vscode.cmd D:\code\my-app
```

第一次会：

1. `npm install code-server@4.135.0`（约 50MB 包 + VS Code 依赖，需要能访问 npm）
2. 启动 agent-host（**不**占用 3000）
3. agent-host在15秒健康期限内就绪后，才启动code-server，默认 **http://127.0.0.1:3000**、password登录；失败不会继续启动编辑器。

浏览器打开：**http://127.0.0.1:3000**  
启动窗口会显示本机登录所需信息。非空CODE_SERVER_PASSWORD优先且不写密码文件；否则使用当前userData下的webagent-password。userData优先WEBAGENT_USER_DATA_DIR，源码默认仓库`.local/share/code-server`，安装版使用用户目录；是否有文件以窗口给出的来源为准，不是所有口令都写源码仓库。请勿公开日志或口令。

自定密码、或不要登录页：

```bat
set CODE_SERVER_PASSWORD=你自己的口令
run-webagent-vscode.cmd
```

```bat
set CODE_SERVER_AUTH=none
run-webagent-vscode.cmd
```

`none` 只应在本机、且你清楚谁能打开浏览器时用。  
左侧活动栏最上方（或扩展图标附近）点 **Web Agent**：

- **Web Agent Chat & Agent**（侧栏，像 Copilot）：输入框下 **Agent ▾** 默认 **Web Agent Code**。发任务就会对当前文件夹搜、读、改、测。
- **VS Code 原生 Chat**（和 Copilot 同一个 Chat 面板）：打开 Chat，输入 `@webagent` 后发任务。`/ask` 只读，`/plan` 多模型分支（换模型后再发同一任务；明确选择 builtin 时是本机草案），默认就是 Agent（`/code`）。打补丁后会在编辑器里打开文件。命令 **Web Agent: 打开 Agent Chat** 或点状态栏也会打开这块。
- **Bridge 模式**：启动 Bridge、复制提示词（内容与截图 5 那两行一致）

### Chat 里的 Agent（对照 Copilot）

侧载的 GitHub Copilot 在 **原生 Chat** 输入框上有 Ask / Edit / **Agent** 下拉：Agent 会自己搜文件、改多文件、跑终端。本仓库不依赖 Copilot 本体，对等能力在两处：

1. **原生 Chat `@webagent`**（插件 `chatParticipants`，`isDefault`）。不写 slash 就是 **Agent / Code**。`/ask`、`/plan`、`/code` 对应 Copilot 的只读 / 方案 / 动手。工具轨迹会写成 Chat 消息；`apply_patch` 后在编辑器打开该文件。
2. **活动栏 Web Agent 侧栏** 输入框下的 **Agent · Web Agent Code ▾**，同一套 Ask / Plan / Code。

两边都打本机 `http://127.0.0.1:48271/api/chat`。填了 API Key 会走模型工具循环；明确选择内置探索 Agent 时可以执行确定性探索；非 builtin 配置不足则停止，不自动换成内置模型。

GitHub Copilot 自己的 Ask/Edit/Agent 下拉是 Copilot 扩展私有 UI，第三方扩展开不进去。若你同时装了 Copilot，请用 **`@webagent`** 或左侧 **Web Agent** 侧栏，不要指望 Copilot 的 Agent 下拉里出现 Web Agent。

这些完整设置页属于**经典工作台**，不是 code-server 的 VS Code 齿轮菜单。需要编辑环境偏好、技术栈或使用技能引导时，先停止 code-server 入口，再以同一工作区启动 `run-webagent.cmd` 配置，完成后停下并切回；不要同时启动两个主机。这些会写进工作区 `.webagent/`，原生 Chat `@webagent` 和 Bridge 都会带上。Skills 逐步见 [技能使用指南.md](技能使用指南.md)。

工作区就是你传入的文件夹，VS Code 资源管理器、编辑器、搜索都是真的。

停止：启动窗口 **Ctrl+C**。

### 不要做的事

- 不要和 `run-webagent.cmd` 同时开。
- 不要把 MCP 地址发到公开地方。
- 不要把启动窗口里的 code-server 密码发到群里。

### 集成终端

为了在 Windows 上不编译 node-pty 等原生模块，安装时加了 `--ignore-scripts`。  
**VS Code 底栏「终端」可能不可用或报错。** 跑测试请用：

- 侧栏 Chat，切到 **CODE**，让 Agent `run_command` / `npm test`（agent-host 走 PowerShell）
- 或本机另开一个 CMD

终端模块失败不必然表示所有其他功能失败；Chat、Bridge 和编辑器仍须分别验证，不能由启动成功推断可用。

---

## 2. 网页 Agent 改本机仓库（和方式 A 相同）

1. 已安装 cloudflared（`check-env.cmd`）
2. 侧栏 Bridge → **启动 Bridge**，等到 `https://….trycloudflare.com/mcp/…`
3. **Arena 类：** 按实际MCP连接入口接入；只有该客户端明确支持时才使用**复制提示词**，普通聊天粘贴不等于建立工具通道。**DeepSeek第三方候选：** 先核对当前版本/权限/认证，不保证只填URL即可使用，见 [网页DeepSeek使用指南.md](网页DeepSeek使用指南.md)

密钥仍在工作区 `.webagent\config.json`。Quick Tunnel域名重启后可能变化，应始终核对，不保证每次必变或永不复用。

---

## 3. Linux / macOS

```bash
chmod +x run-webagent-vscode.sh
./run-webagent-vscode.sh
./run-webagent-vscode.sh /path/to/my-app
```

同样需要 npm 网络。也可用下面的环境变量指定其他端口（没有CODE_SERVER_PATH开关）：

```bash
CODE_SERVER_PORT=3000 AGENT_HOST_PORT=48271 ./run-webagent-vscode.sh
```

---

## 4. 可选：WSL（仅当本机 npm 装 code-server 失败时）

这是另一个平台环境，不是修复经典Windows工作台的必经步骤。若明确选择WSL，需要用户同意新增系统组件、可能的提升权限和重启，再按系统指引操作；Windows上的源码、Conda与桌面控制不能自动当作WSL中同一环境。不要为了文档验收直接更改日常机器。准备条件满足时才使用：

```bat
wsl --install
```

新开 WSL 终端，把仓库放到 Linux 文件系统（例如 `~/web_agent`），再执行 `./run-webagent-vscode.sh`。  
浏览器仍用 Windows 打开 http://127.0.0.1:3000（WSL 会转发）。

---

## 5. 目录对照

| 路径 | 角色 |
|---|---|
| `run-webagent-vscode.cmd` / `.sh` | 本方式入口 |
| `install-vscode-extension.cmd` | 方式 C：侧载到本机桌面 VS Code |
| `webagent-core/scripts/run-code-oss.js` | 先准备，启动agent-host并等待健康确认，再启动code-server |
| `webagent-core/scripts/install-desktop-extension.js` | 拷插件到 `~/.vscode/extensions` |
| `webagent-core/scripts/ensure-code-server.js` | 从 npm 安装到 `bin/code-server-runtime/` |
| `bin/code-server-runtime/` | 运行时下载目录（内容被Git忽略）；入口存在不证明本机平台可运行 |
| `webagent-core/extension/` | 插件源码 |
| `webagent-core/extensions-installed/` | code-server `--extensions-dir` |

---

## 6. 故障排除

**第一次 npm install 很慢或失败**  
核对可信npm源、平台/Node要求及原始失败原因。下载工作预算180秒，必要依赖与后端补装各120秒；取消/超时不会继续启动，部分node_modules不自动回滚。先核查再明确重试，不关闭TLS校验或为追绿随意换不可信源。

**端口 3000 被占用**  
关掉 `run-webagent.cmd` 或其它占用。或：

```bat
set CODE_SERVER_PORT=8080
run-webagent-vscode.cmd
```

然后打开 http://127.0.0.1:8080

**侧栏没有 Web Agent**  
看启动窗口是否复制了插件；刷新浏览器。扩展目录是 `webagent-core\extensions-installed`。

**Chat 提示连不上 48271**  
agent-host 没起来。看黑色窗口报错；防火墙是否拦了 Node。

**VS Code 终端打不开**  
见上文「集成终端」。用 Chat CODE 模式跑命令。

**打开 3000 要密码**  
核对启动窗口报告的口令来源；环境口令分支没有对应密码文件，其它分支读取当前userData下的webagent-password。不要公开该内容。

**页面提示 Node 版本**  
核对当前 code-server 包的 Node 要求与完整启动日志；不要仅忽略 engines 警告，也不要把 agent-host CI 当作真实网页 VS Code 验收。

---

## 7. 和方式 A 怎么选

- 只想让网页 Agent 改本机仓库、界面够用：继续 **`run-webagent.cmd`**
- 想要浏览器里完整 VS Code（语法高亮、多文件、插件生态）+ 同一套 Bridge：**`run-webagent-vscode.cmd`**
- 本机已经装了 VS Code：走方式 C（下一节），不必下载 code-server

---

## 8. 方式 C：本机已安装的桌面 VS Code

不经过浏览器、不占 3000。插件源码仍是 `webagent-core/extension/`，和方式 B 同一份。

1. 仓库根双击 `install-vscode-extension.cmd`（拷到 `%USERPROFILE%\.vscode\extensions\webagent.webagent-core-<版本>`，不要 vsix）。
2. `run-webagent.cmd D:\code\my-app`，黑色窗口保持开着。
3. 完全退出 VS Code 再打开；**文件 → 打开文件夹** = 第 2 步那个路径（默认启动时可以是 `web_agent` 源码根；显式指定其他项目时打开那个目录）。
4. 活动栏 **Web Agent**；Chat 里 `@webagent`。状态栏「未连接 48271」= 引擎没起来；「工作区不一致」= 打开的文件夹和 `Workspace` 不是同一个。

逐步与排错见 [使用指南.md](../../使用指南.md) 第 5 节。

安全边界：网页壳受信Origin仅本机127.0.0.1/localhost；WEBAGENT_BIND不是开放远程UI的许可。不要为LAN访问扩大Origin/关闭保护，手机使用认证MCP。
