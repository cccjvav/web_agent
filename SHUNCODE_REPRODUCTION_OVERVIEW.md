# ShunCode 深度全面复现系统 (Code-OSS 载体 + 独立 agent-host)

> **阅读提示（2026-09）：** 本文是早期架构草稿。  
> **现行默认启动不内嵌 code-server。** Windows 用 `run-shuncode.cmd`，UI 是 `shuncode-core/workbench/`，MCP 在 `agent-host`。网页 VS Code 用 `run-shuncode-vscode.cmd`。  
> 每个 GitHub 目录的现行职责以 **[组件说明.md](./组件说明.md)** 为准。`shuncode-repro/` 是更早的 Bridge 原型，不要当主程序。

本复现项目严格按照 ShunCode 官方架构白皮书及技术实现构建，完整复刻了 **“以 Code-OSS 为编辑器载体，模型推理与工具循环跑在独立进程 `agent-host`，不硬编码写入 VS Code 内核”** 的设计。

---

## 🏗️ 核心架构三层拆解

```
+-----------------------------------------------------------------------------------------+
|                                1. 顶层：Code-OSS 载体 (Port 3000)                         |
|   - 基于 VS Code Web (Code-OSS 1.135.0 / code-server) 构建                               |
|   - 挂载工作区：/home/user/workspace                                                    |
|   - 内置原生 ShunCode 核心插件 (shuncode-core):                                          |
|     ├── 侧边栏 ShunCode 图标与控制台                                                    |
|     ├── 视图 1：ShunCode Chat & Agent (Ask / Plan / Code 三模式)                         |
|     │    └── 内置 Plan 模式多模型博弈引擎 ("意见一致再行动")                              |
|     ├── 视图 2：Bridge 模式控制台 (远程指挥台、一键直连 ChatGPT/Arena/Manus、重置 Secret)|
|     └── 底部状态栏：$(zap) ShunCode: Bridge Online (Port 48271)                         |
+--------------------------------------------+--------------------------------------------+
                                             | 本地 HTTP / IPC
                                             v
+-----------------------------------------------------------------------------------------+
|                           2. 中间层：独立进程 agent-host (Port 48271)                    |
|   - 独立于 VS Code 内核运行，保障模型调度高可用与解耦                                      |
|   - Streamable HTTP / SSE MCP 服务端 (对外暴露 /mcp/<secret>)                            |
|   - 内置原子补丁引擎 (apply_patch): 支持 SEARCH/REPLACE 块、冲突预检与回滚                 |
|   - 本地命令与测试执行器 (execute_command): 支持 npm test / pytest 并在本地执行             |
|   - 多模型博弈引擎 (Multi-Model Consensus): Plan 阶段架构/安全/编码三方独立作答与决策    |
|   - 任务状态机 (report_progress, set_todos)                                             |
+--------------------------------------------+--------------------------------------------+
                                             | 隧道穿透 / MCP 调度
                                             v
+-----------------------------------------------------------------------------------------+
|                           3. 远端层：外部 AI 指挥台 (ChatGPT / Arena / Manus)             |
|   - 任意能够打开浏览器、支持 Agent 的设备均可连接 MCP URL 进行远程指挥                     |
+-----------------------------------------------------------------------------------------+
```

---

## 📂 源码与目录结构

```
/home/user/
├── shuncode-core/
│   ├── start-shuncode.sh            # 一键启动脚本 (同时调起 agent-host 与 Code-OSS)
│   ├── agent-host/                  # 独立 agent-host 进程源码 (端口 48271)
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.js             # 主入口
│   │       ├── config.js            # 工作区与动态 Secret 管理
│   │       ├── mcp/server.js        # 标准 MCP JSON-RPC 2.0 路由
│   │       ├── api/routes.js        # IDE 扩展交互 API
│   │       ├── tools/
│   │       │   ├── patchEngine.js   # 核心 apply_patch 引擎
│   │       │   ├── executor.js      # 本地命令行与测试执行
│   │       │   ├── fileOps.js       # read_file, write_file, list_dir, grep_search
│   │       │   ├── consensusEngine.js # 多模型博弈引擎 (Plan 模式)
│   │       │   └── progressTracker.js # report_progress, set_todos
│   │       └── utils/
│   └── extension/                   # ShunCode VS Code 原生插件
│       ├── package.json             # 插件 Manifest (contributes views & statusbar)
│       ├── extension.js             # Webview Provider 与命令注册
│       └── resources/icon.svg       # ShunCode 品牌图标
│
├── workspace/                       # 真实挂载的项目工作区
│   ├── package.json
│   ├── src/calculator.js            # 包含除以零缺陷的目标模块
│   └── tests/calculator.test.js     # 单元测试用例
│
└── .local/share/code-server/extensions/shuncode.shuncode-core-0.6.9/ # 已部署插件
```

---

## ⚡ 如何在编辑器中体验功能

1. **进入 Code-OSS 编辑器**：
   - 预览窗口直接显示正在运行的 Code-OSS IDE。
   - 点击左侧活动栏（Activity Bar）最上方的 **ShunCode** 图标。

2. **Chat 模式：Ask / Plan / Code 模式切换**：
   - **ASK（只读问答）**：点击预设动作 “🔍 诊断测试 failure”，Agent 仅调用只读工具定位问题。
   - **PLAN（多模型博弈）**：点击 “⚖️ 启动多模型博弈”，系统触发架构模型、安全边界模型和编码模型独立分析，达成 98.5% 一致并输出 4 步 TODO。
   - **CODE（执行修补）**：点击 “🚀 一键修 Bug”，Agent 调用 `apply_patch` 将 `src/calculator.js` 增加防除以零逻辑，并自动在终端执行 `npm test`（5/5 PASS）。

3. **Bridge 模式（远程指挥台）**：
   - 切换到下方 “Bridge 模式” 视图。
   - 可一键复制 MCP 连接提示词，或点击快捷按钮直达 Arena.ai / ChatGPT / Manus。
   - 支持一键重置 Secret，使旧链接即刻失效。
