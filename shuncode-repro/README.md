# ShunCode Bridge Host (Core Reproduction)

> **中文说明（先读这个）**  
> 这是仓库里 **第一代、已冻结的 Bridge Host 原型**：一个 Node 进程同时提供简易网页控制台和 MCP（默认端口 **3000**，工作区是本目录下的 `workspace_demo/`）。  
> **现行产品不在这里。** Windows 请回到仓库根目录运行 `run-shuncode.cmd`，代码在 `shuncode-core/`。  
> 本目录不会被启动脚本调用。完整对比见根目录 [组件说明.md](../组件说明.md) 第 1.1 节。

---

This project is a complete, runnable reproduction of the **ShunCode Bridge Architecture & Workspace Engine**. It transforms your local project workspace into a secure, standard **Streamable HTTP MCP (Model Context Protocol) Server**, allowing remote AI Agents (e.g. ChatGPT Plus, Arena.ai, Manus, Qwen, Trae) to command your machine through a browser while keeping all code read/write and test execution local.

---

## 🌟 Key Architecture & Capabilities

1. **Standard MCP Server (Streamable HTTP & SSE)**:
   - Full Model Context Protocol compliance (`initialize`, `tools/list`, `tools/call`, `notifications/initialized`).
   - Secure routing via randomized secret tokens (`/mcp/<secret_uuid>`).
   - Instant token revocation & rotation.

2. **Built-in Local Tool Suite**:
   - `apply_patch`: Atomic patch engine supporting `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` blocks, unified diffs, hash pre-checks, and conflict rollback.
   - `execute_command`: Spawns local sub-processes (e.g. `npm test`, `pytest`, `cargo test`, `git`), capturing exit codes, durations, and streaming stdout/stderr in real-time.
   - `read_file` & `write_file`: Workspace bounded file reading with line numbers and safe writes.
   - `list_dir` & `grep_search`: Fast project file tree traversal and regex pattern matching.
   - `report_progress` & `set_todos`: Real-time task progress and step breakdown synchronized to the IDE UI.

3. **Interactive Host Studio UI**:
   - **Bridge Control Center**: MCP URL display, instant prompt generation, one-click secret reset.
   - **Live Tool Call Stream**: Real-time inspection of remote Agent requests and responses.
   - **Diff Inspector**: Colorized visual diff of code modifications applied by `apply_patch`.
   - **Live Terminal**: Streaming console output for commands run on the host.
   - **Task & TODO Board**: Visual progress bar and dynamic task checklist.
   - **Built-in Agent Simulator**: Allows testing and verifying the complete bugfix loop directly in the UI without needing an external ChatGPT session.

---

## 📁 Directory Structure

```
shuncode-repro/
├── package.json               # Project dependencies & scripts
├── README.md                  # Technical documentation & usage guide
├── src/
│   ├── index.js               # Main server entry & WebSocket IPC hub
│   ├── config.js              # Server, workspace & token configuration
│   ├── mcp/
│   │   ├── server.js          # Standard MCP HTTP / SSE router
│   │   ├── auth.js            # Secret token verification & rotation
│   │   └── tools/
│   │       ├── index.js       # Tool registry & MCP JSON Schemas
│   │       ├── patchEngine.js # Atomic apply_patch engine & diff generator
│   │       ├── fileOps.js     # read_file, write_file, list_dir, grep_search
│   │       ├── executor.js    # Child process spawn & real-time output stream
│   │       └── progressTracker.js # report_progress & set_todos state manager
│   ├── tunnel/
│   │   └── tunnelManager.js   # Cloudflare Quick/Named tunnel & local preview
│   ├── api/
│   │   └── routes.js          # REST API for IDE Dashboard & Simulator
│   └── utils/
│       ├── diff.js            # Unified diff generator & colorizer
│       └── eventBus.js        # Real-time WebSocket event broadcaster
├── public/                    # Interactive ShunCode Host Studio UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── workspace_demo/            # Demo project workspace (Calculator & unit tests)
│   ├── src/
│   │   └── calculator.js      # Target module
│   ├── tests/
│   │   └── calculator.test.js # Test suite (with initial failing zero division bug)
│   └── package.json
└── tests/
    └── patchEngine.test.js    # Unit test suite for core patch & file operations
```

---

## 🚀 How to Run

### 1. Install dependencies (Already installed)
```bash
cd /home/user/shuncode-repro
npm install
```

### 2. Start the ShunCode Bridge Host
```bash
npm start
```

### 3. Connect from External AI Agent
Copy the generated MCP prompt:
```text
http://<your-host>/mcp/<secret_uuid>

快速连接这个 MCP（URL），明确使用规则，熟悉可用工具，做好处理接下来一系列工作的准备。
```
Paste this into ChatGPT / Arena Agent / Manus to begin remote workspace assistance.
