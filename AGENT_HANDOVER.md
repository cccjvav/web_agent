# ShunCode 项目交接与 AI Agent 上手指令 (Agent Handover Prompt)

> **💡 使用说明**：在开启新的 AI 对话或将项目克隆到新环境时，将本文件内容**整段复制粘贴**给 AI Agent，Agent 即可瞬间理解全部架构、技术约束、启动方式并接盘后续开发。

---

## 🤖 [给 AI Agent 的系统上下文与工作任务指令]

你现在接手的是 **ShunCode** 的深度复现工程。
ShunCode 是一款基于 **Code-OSS 载体** 与 **独立 `agent-host` 进程** 的 AI 代码编辑器及远程 Bridge 桥接系统。

### 1. 核心设计原则（必须严格遵守）
1. **解耦架构**：编辑器是 Code-OSS 载体，模型推理和工具执行运行在独立的 `agent-host` 进程（端口 `48271`），**绝对不把模型循环硬编码进 VS Code 内核**。
2. **工具锁定权限控制 (Tool Locks)**：
   * **ASK 模式**：只读问答与代码检索（`read_file`, `grep_search`, `list_dir`），锁死一切写操作与终端。
   * **PLAN 模式**：多模型博弈（Architecture / Security / Coder 三方独立评估，达成共识后输出 `set_todos` 步骤），禁止改写文件。
   * **CODE 模式**：解锁写操作（核心工具是 `apply_patch`）与本地终端测试（`execute_command`）。
3. **核心补丁引擎 (`apply_patch`)**：必须支持原子化写入、版本哈希校验、SEARCH/REPLACE 块匹配与冲突回滚，禁止未预检的部分写入。
4. **Bridge 模式**：将本地工作区暴露为受保护的 **Streamable HTTP MCP Server**（`/mcp/<secret_uuid>`），供外部 Agent（ChatGPT Plus、Arena.ai、Manus 等）远程调用，读写与测试全在本地发生。

---

### 2. 仓库目录导航

```
.
├── AGENT_HANDOVER.md          # [本文件] 专属交接与上下文提示词
├── SHUNCODE_REPRODUCTION_OVERVIEW.md # 详细技术白皮书
├── run-shuncode.sh            # 一键环境准备与双服务启动脚本
├── shuncode-core/
│   ├── start-shuncode.sh      # 启动管理脚本
│   ├── agent-host/            # 独立 MCP 与 Agent 运行时 (Port 48271)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js       # agent-host 主入口 (HTTP + WebSocket)
│   │       ├── config.js      # 端口、工作区与动态 Secret 管理
│   │       ├── mcp/server.js  # 标准 MCP JSON-RPC 2.0 / SSE 协议实现
│   │       ├── api/routes.js  # 面向 VS Code 插件的 REST 接口
│   │       ├── tools/
│   │       │   ├── patchEngine.js     # apply_patch 原子补丁引擎
│   │       │   ├── executor.js        # 本地命令执行与流式回传
│   │       │   ├── consensusEngine.js # Plan 模式多模型博弈引擎
│   │       │   ├── fileOps.js         # read_file, write_file, grep, list
│   │       │   └── progressTracker.js # report_progress, set_todos
│   │       └── utils/
│   └── extension/             # ShunCode VS Code 原生插件
│       ├── package.json       # 插件清单 (定义 Sidebar, Views, Commands)
│       ├── extension.js       # Webview 通信与状态机
│       └── resources/icon.svg # ShunCode 侧边栏图标
├── workspace/                 # 默认挂载的目标项目与测试套件
│   ├── src/calculator.js
│   ├── tests/calculator.test.js
│   └── package.json
└── .gitignore
```

---

### 3. 新环境中一键初始化与启动

当在新沙盒或服务器环境中拉取代码后，执行以下命令即可一键恢复完整环境：

```bash
# 1. 赋予执行权限
chmod +x run-shuncode.sh shuncode-core/start-shuncode.sh

# 2. 一键安装依赖并拉起双服务 (Code-OSS: 3000 + agent-host: 48271)
./run-shuncode.sh
```

#### 手动分步启动指南（备用）：
```bash
# 步骤 A：安装 agent-host 依赖
cd shuncode-core/agent-host && npm install express ws cors diff

# 步骤 B：启动 agent-host
node src/index.js &

# 步骤 C：启动 Code-OSS 载体 (已安装 code-server 情况下)
code-server --bind-addr 0.0.0.0:3000 --auth none --extensions-dir shuncode-core/extensions-installed workspace
```

---

### 4. 关键接口与快速验证测试

#### A. 验证 agent-host 状态
```bash
curl -s http://127.0.0.1:48271/api/status | jq .
```

#### B. 验证 MCP 初始化与工具列表
```bash
# 获取当前 secret 并调用 initialize
SECRET=$(curl -s http://127.0.0.1:48271/api/status | grep -o '"secretKey":"[^"]*' | cut -d'"' -f4)

curl -s -X POST "http://127.0.0.1:48271/mcp/$SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq .
```

#### C. 验证本地测试执行
```bash
curl -s -X POST "http://127.0.0.1:48271/mcp/$SECRET" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute_command","arguments":{"command":"npm test"}}}' | jq .
```

---

### 5. 当前项目就绪状态与后续可扩展任务

* ✅ **已完成**：Code-OSS 编辑器载体完整集成。
* ✅ **已完成**：独立 `agent-host` 进程，支持标准 MCP Streamable HTTP 协议与 Secret 动态重置。
* ✅ **已完成**：Ask / Plan / Code 模式及 Plan 模式下的多模型博弈（Consensus Engine）。
* ✅ **已完成**：`apply_patch` 原子补丁与测试驱动修复闭环。
* 🚀 **后续可扩展任务建议**：
  1. 接入真实的外部 LLM API（OpenAI / DeepSeek / Claude），让 Chat 模式支持配置自定义 API Key 实现在线推理。
  2. 扩展更多 MCP 工具（如 Git 状态审阅、数据库连接器等）。
  3. 进一步优化 VS Code 内置 Webview 的 Diff 视觉对比组件。
