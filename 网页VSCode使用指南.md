# 网页 VS Code（code-server）使用指南

这是本仓库的 **第二条运行方式**：浏览器里打开 **真正的 VS Code**，左侧活动栏有 **Web Agent** 插件，插件连本机 `agent-host`。ChatGPT / Arena 改磁盘仍然走 Bridge + cloudflared，和第一种方式相同。

| | 方式 A：自绘工作台 | 方式 B：网页 VS Code |
|---|---|---|
| 启动 | `run-webagent.cmd` | `run-webagent-vscode.cmd` |
| 浏览器里看到 | 仿 VS Code 的工作台 | **官方 code-server / Code-OSS** |
| 端口 3000 | 工作台 UI | code-server |
| 端口 48271 | agent-host MCP | 同样 |
| 改文件的引擎 | 同一套 MCP 工具 | 同一套 |
| 同时开两个 | **不要**（抢 3000） | **不要** |

官方 [coder/code-server](https://github.com/coder/code-server) **不发布 Windows 安装包**。Git 里也不再内嵌 code-server。  
**做法：** 第一次启动时用 **npm** 下载完整的 `code-server@4.135.0`（带 `out/`），装到 `bin/code-server-runtime/`（不进 Git）。Node 22 LTS 可以跑，尽管上游标注 Node 24。

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
3. 启动 code-server 监听 **http://127.0.0.1:3000**

浏览器打开：**http://127.0.0.1:3000**  
左侧活动栏最上方（或扩展图标附近）点 **Web Agent**：

- **Web Agent Chat & Agent**（侧栏，像 Copilot）：输入框下 **Agent ▾** 默认 **Web Agent Code**。发任务就会对当前文件夹搜、读、改、测。
- **VS Code 原生 Chat**（和 Copilot 同一个 Chat 面板）：打开 Chat，输入 `@webagent` 后发任务。`/ask` 只读，`/plan` 博弈，默认就是 Agent（`/code`）。打补丁后会在编辑器里打开文件。命令 **Web Agent: 打开 Agent Chat** 或点状态栏也会打开这块。
- **Bridge 模式**：启动 Bridge、复制提示词（内容与截图 5 那两行一致）

### Chat 里的 Agent（对照 Copilot）

侧载的 GitHub Copilot 在 **原生 Chat** 输入框上有 Ask / Edit / **Agent** 下拉：Agent 会自己搜文件、改多文件、跑终端。本仓库不依赖 Copilot 本体，对等能力在两处：

1. **原生 Chat `@webagent`**（插件 `chatParticipants`，`isDefault`）。不写 slash 就是 **Agent / Code**。`/ask`、`/plan`、`/code` 对应 Copilot 的只读 / 方案 / 动手。工具轨迹会写成 Chat 消息；`apply_patch` 后在编辑器打开该文件。
2. **活动栏 Web Agent 侧栏** 输入框下的 **Agent · Web Agent Code ▾**，同一套 Ask / Plan / Code。

两边都打本机 `http://127.0.0.1:48271/api/chat`。填了 API Key 会走模型工具循环；没 Key 时内置探索 Agent 仍会搜、读、必要时打补丁并跑测试。

GitHub Copilot 自己的 Ask/Edit/Agent 下拉是 Copilot 扩展私有 UI，第三方扩展开不进去。若你同时装了 Copilot，请用 **`@webagent`** 或左侧 **Web Agent** 侧栏，不要指望 Copilot 的 Agent 下拉里出现 Web Agent。

齿轮 → **智能体自定义设置** 里可填 **环境偏好**、**技术栈**，并用 **技能引导** 建 `SKILL.md`。这些会写进工作区 `.webagent/`，原生 Chat `@webagent` 和 Bridge 都会带上。

工作区就是你传入的文件夹，VS Code 资源管理器、编辑器、搜索都是真的。

停止：启动窗口 **Ctrl+C**。

### 不要做的事

- 不要和 `run-webagent.cmd` 同时开。
- 不要把 MCP 地址发到公开地方。

### 集成终端

为了在 Windows 上不编译 node-pty 等原生模块，安装时加了 `--ignore-scripts`。  
**VS Code 底栏「终端」可能不可用或报错。** 跑测试请用：

- 侧栏 Chat，切到 **CODE**，让 Agent `run_command` / `npm test`（agent-host 走 PowerShell）
- 或本机另开一个 CMD

Chat / Bridge / 编辑文件不受影响。

---

## 2. 网页 Agent 改本机仓库（和方式 A 相同）

1. 已安装 cloudflared（`check-env.cmd`）
2. 侧栏 Bridge → **启动 Bridge**，等到 `https://….trycloudflare.com/mcp/…`
3. **Arena 类：** **复制提示词**，整段作为新对话第一句。**DeepSeek 网页：** 把 MCP 地址填进本机 Chrome/Edge 的 DeepSeek++ 侧边栏，见 [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md)

密钥仍在工作区 `.webagent\config.json`。Quick Tunnel 域名每次启动都会变。

---

## 3. Linux / macOS

```bash
chmod +x run-webagent-vscode.sh
./run-webagent-vscode.sh
./run-webagent-vscode.sh /path/to/my-app
```

同样需要 npm 网络。也可用环境变量 `CODE_SERVER_PATH` 以外的端口：

```bash
CODE_SERVER_PORT=3000 AGENT_HOST_PORT=48271 ./run-webagent-vscode.sh
```

---

## 4. 可选：WSL（仅当本机 npm 装 code-server 失败时）

官方推荐 Linux。若 Windows 上 npm 报原生模块错误：

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
| `webagent-core/scripts/run-code-oss.js` | 先 ensure，再同时拉起 agent-host + code-server |
| `webagent-core/scripts/ensure-code-server.js` | 从 npm 安装到 `bin/code-server-runtime/` |
| `bin/code-server-runtime/` | **完整可运行** 的 code-server（Git 忽略内容） |
| `webagent-core/extension/` | 插件源码 |
| `webagent-core/extensions-installed/` | code-server `--extensions-dir` |

---

## 6. 故障排除

**第一次 npm install 很慢或失败**  
检查能否访问 registry.npmjs.org。可用国内镜像后再跑一次启动脚本。

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

**页面提示 Node 版本**  
忽略 engines 警告即可。本仓库用 `--ignore-scripts` + Node 22 已验证能打开工作台。

---

## 7. 和方式 A 怎么选

- 只想让 ChatGPT 改本机仓库、界面够用：继续 **`run-webagent.cmd`**
- 想要浏览器里完整 VS Code（语法高亮、多文件、插件生态）+ 同一套 Bridge：**`run-webagent-vscode.cmd`**
