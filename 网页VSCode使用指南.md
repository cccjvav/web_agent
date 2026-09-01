# 网页 VS Code（code-server）使用指南

这是本仓库的 **第二条运行方式**：浏览器里打开 **真正的 VS Code**，左侧活动栏有 **ShunCode** 插件，插件连本机 `agent-host`。ChatGPT / Arena 改磁盘仍然走 Bridge + cloudflared，和第一种方式相同。

| | 方式 A：自绘工作台 | 方式 B：网页 VS Code |
|---|---|---|
| 启动 | `run-shuncode.cmd` | `run-shuncode-vscode.cmd` |
| 浏览器里看到 | 仿 VS Code 的工作台 | **官方 code-server / Code-OSS** |
| 端口 3000 | 工作台 UI | code-server |
| 端口 48271 | agent-host MCP | 同样 |
| 改文件的引擎 | 同一套 MCP 工具 | 同一套 |
| 同时开两个 | **不要**（抢 3000） | **不要** |

官方 [coder/code-server](https://github.com/coder/code-server) **不发布 Windows 安装包**。本仓库也不去修补 Git 里那份残缺的 `bin/code-server-dist/lib/code-server-4.135.0/`（缺编译结果）。  
**做法：** 第一次启动时用 **npm** 下载完整的 `code-server@4.135.0`（带 `out/`），装到 `bin/code-server-runtime/`（不进 Git）。Node 22 LTS 可以跑，尽管上游标注 Node 24。

---

## 1. Windows（CMD）

已能运行 `run-shuncode.cmd` 的前提下（Node LTS + npm）：

```bat
cd /d D:\code\web_agent
run-shuncode-vscode.cmd
```

挂自己的仓库：

```bat
run-shuncode-vscode.cmd D:\code\my-app
```

第一次会：

1. `npm install code-server@4.135.0`（约 50MB 包 + VS Code 依赖，需要能访问 npm）
2. 启动 agent-host（**不**占用 3000）
3. 启动 code-server 监听 **http://127.0.0.1:3000**

浏览器打开：**http://127.0.0.1:3000**  
左侧活动栏最上方（或扩展图标附近）点 **ShunCode**：

- **ShunCode Chat & Agent**：Ask / Plan / Code，请求打到本机 `:48271/api/chat`
- **Bridge 模式**：启动 Bridge、复制提示词（内容与截图 5 那两行一致）

工作区就是你传入的文件夹，VS Code 资源管理器、编辑器、搜索都是真的。

停止：启动窗口 **Ctrl+C**。

### 不要做的事

- 不要和 `run-shuncode.cmd` 同时开。
- 不要去执行 `bin\code-server-dist\lib\code-server-4.135.0\bin\code-server`（那份是残缺切片）。
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
3. **复制提示词**，整段作为 ChatGPT / Arena **新对话第一句**

密钥仍在工作区 `.shuncode\config.json`。Quick Tunnel 域名每次启动都会变。

---

## 3. Linux / macOS

```bash
chmod +x run-shuncode-vscode.sh
./run-shuncode-vscode.sh
./run-shuncode-vscode.sh /path/to/my-app
```

同样需要 npm 网络。也可用环境变量 `CODE_SERVER_PATH` 以外的端口：

```bash
CODE_SERVER_PORT=3000 AGENT_HOST_PORT=48271 ./run-shuncode-vscode.sh
```

---

## 4. 可选：WSL（仅当本机 npm 装 code-server 失败时）

官方推荐 Linux。若 Windows 上 npm 报原生模块错误：

```bat
wsl --install
```

新开 WSL 终端，把仓库放到 Linux 文件系统（例如 `~/web_agent`），再执行 `./run-shuncode-vscode.sh`。  
浏览器仍用 Windows 打开 http://127.0.0.1:3000（WSL 会转发）。

---

## 5. 目录对照

| 路径 | 角色 |
|---|---|
| `run-shuncode-vscode.cmd` / `.sh` | 本方式入口 |
| `shuncode-core/scripts/run-code-oss.js` | 先 ensure，再同时拉起 agent-host + code-server |
| `shuncode-core/scripts/ensure-code-server.js` | 从 npm 安装到 `bin/code-server-runtime/` |
| `bin/code-server-runtime/` | **完整可运行** 的 code-server（Git 忽略内容） |
| `bin/code-server-dist/lib/code-server-4.135.0/` | **不可运行** 的对照切片，不要启动 |
| `shuncode-core/extension/` | 插件源码 |
| `shuncode-core/extensions-installed/` | code-server `--extensions-dir` |

---

## 6. 故障排除

**第一次 npm install 很慢或失败**  
检查能否访问 registry.npmjs.org。可用国内镜像后再跑一次启动脚本。

**端口 3000 被占用**  
关掉 `run-shuncode.cmd` 或其它占用。或：

```bat
set CODE_SERVER_PORT=8080
run-shuncode-vscode.cmd
```

然后打开 http://127.0.0.1:8080

**侧栏没有 ShunCode**  
看启动窗口是否复制了插件；刷新浏览器。扩展目录是 `shuncode-core\extensions-installed`。

**Chat 提示连不上 48271**  
agent-host 没起来。看黑色窗口报错；防火墙是否拦了 Node。

**VS Code 终端打不开**  
见上文「集成终端」。用 Chat CODE 模式跑命令。

**页面提示 Node 版本**  
忽略 engines 警告即可。本仓库用 `--ignore-scripts` + Node 22 已验证能打开工作台。

---

## 7. 和方式 A 怎么选

- 只想让 ChatGPT 改本机仓库、界面够用：继续 **`run-shuncode.cmd`**
- 想要浏览器里完整 VS Code（语法高亮、多文件、插件生态）+ 同一套 Bridge：**`run-shuncode-vscode.cmd`**
