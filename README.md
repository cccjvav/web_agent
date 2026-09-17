# Web Agent

本机工作台与 agent-host：本机 Chat 使用工作区工具，外部兼容 MCP 客户端通过认证 Bridge 操作同一工作区。工作台 UI 不是远程桌面；手机 Arena 路线是认证 MCP，而不是公开本机 `/api`。许可证：[ISC](LICENSE)。安全边界：[SECURITY.md](SECURITY.md)。

## 从哪里开始

Windows 用户的主路径是**桌面 VS Code 集成 CMD、原来的 Conda 环境、系统 Node.js/npm**。安装或修改 PATH 后应完全退出并重开 VS Code，不能只新建终端。

```bat
check-env.cmd
run-webagent.cmd
```

从仓库根执行，浏览器打开 http://127.0.0.1:3000 。源码默认工作区就是本仓库根，不是旧 `workspace` 子目录。要操作另一个已经存在的项目：

```bat
run-webagent.cmd "D:\My Projects\my-app"
```

先核对启动窗口与界面的工作区，再允许修改。缺少模型配置时请明确选择内置探索 Agent；它是确定性探索器，不是通用大模型，也不会凭自然语言自动完成任意开发任务。

## 选择界面

| 入口 | 提供什么 | 边界 |
|---|---|---|
| `run-webagent.cmd` | 经典轻量工作台＋agent-host | 源码新手主路径；默认 UI 3000、主机 48271 |
| `run-webagent-vscode.cmd` | code-server＋同一主机 | 安装版默认快捷方式；与经典入口默认端口冲突，不同时启动 |
| `install-vscode-extension.cmd`＋已运行的主机 | 桌面 VS Code 核心扩展 | 扩展自身不启动引擎；IDE 首个可信本地文件夹须与主机一致 |
| `run-webagent-appwindow.cmd` | 网页 VS Code 的独立浏览器窗口 | 不是另一套 Electron IDE |

code-server 不等于微软桌面 VS Code；Windows 集成终端和扩展兼容性需分别验证，不能用主机单测替代。完整操作见[使用指南](使用指南.md)和[网页 VS Code 指南](docs/guides/网页VSCode使用指南.md)。

## 当前能力与未完成范围

- 核心版本为 **0.7.2**，探针 Companion／统一浏览器 Inspector 为 **0.5.2**；以各自包清单为版本来源。
- Bridge 统计和 Tasks 来自主机快照，刷新页面不清零。Tasks 是 Agent 显式上报的待办，不是工具日志，也不是完成质量证明。见[任务栏说明](docs/guides/Bridge任务栏说明.md)及[统计排查](docs/guides/Bridge统计与刷新排查.md)。
- 文件补丁有 dryRun/hash 保护，经典工作台有草稿diff及单次保存回退，原生扩展有草稿diff/恢复；现增加任务前手动建立的跨文件内容检查点，任务后预览/确认恢复。都是有界、版本保护的文本恢复，不是全项目原子回滚或shell副作用撤销。见[使用指南](使用指南.md#跨文件内容检查点任务前备份任务后恢复)。
- 出站外部 MCP 支持本机 HTTP、显式批准的 stdio，以及显式确认的公网 HTTPS（每次DNS/连接地址检查、拒绝跳转、工具逐次审批；真实供应商兼容性须另验）。这与公网客户端通过认证 Bridge **入站**连接本机是两回事。
- 探测相关施工暂停，等待另一助手的外部整合项目正式交接；既有桌面探针保留，不提前宣称新工作台/code-server/VSCode整合已验收。见[暂停范围与交接门槛](manager/stages/s8-probe-integration.md)、[存量入口矩阵](探针入口与实际可用范围.md)。探针结果仍是参考，不鉴定真实后台模型。
- 第三方 Chat Plus／DeepSeek 扩展只是候选接入，不能保证当前版本、站点、认证或订阅条件；分别见[Chat Plus](docs/guides/网页ChatPlus使用指南.md)、[DeepSeek](docs/guides/网页DeepSeek使用指南.md)。不要把聊天栏里的一条 URL 当作已经建立 MCP 连接。

剩余施工、候选设计与人工验收分开记录在[阶段 10](manager/stages/s10-upstream-adoption.md)和[上游采用队列](review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)。当前文档审查范围见[文档状态](review/SEMANTIC_REVIEW_2026-09-16.md)，不以索引生成或 CI 绿灯宣称全仓逐句审查完成。

## 文档导航

专题已集中到[文档中心](docs/README.md)：[用户专题](docs/guides/README.md)、[开发与学习](docs/development/README.md)。源码教学仍在模块旁，旧报告集中归档，不再与当前待办混排。

| 目的 | 唯一主入口 |
|---|---|
| 接手开发与后续计划 | [项目管理索引](manager/CONTEXT.md)（源码checkout） |
| 按动作逐步验收 | [Windows 新手逐步验收](docs/guides/Windows新手逐步验收.md)、[人工清单](review/CHECKLIST_WINDOWS.md) |
| 环境安装与维护 | [Conda 环境](docs/guides/Conda环境说明.md)、[启动入口](启动脚本说明.md)、[安装器](installer/README.md) |
| 公网 Bridge | [隧道配置](docs/guides/隧道使用指南.md)、[当前权限与工作模式](docs/guides/Bridge权限与工作模式.md) |
| 本机探索、Skills | [内置探索 Agent](docs/guides/内置探索Agent使用指南.md)、[技能指南](docs/guides/技能使用指南.md) |
| 了解模块与学习函数 | [总览](docs/development/总览.md)、[组件](docs/development/组件说明.md)、[架构](docs/development/架构导读.md)、[技术实现](docs/development/技术实现.md)、[代码复盘](docs/development/代码复盘指南.md) |
| 开发与测试 | [贡献说明](CONTRIBUTING.md)、[测试说明](docs/development/测试说明.md)、[平台启动与 CI](docs/development/平台启动与CI详解.md) |
| 管理与证据 | [当前上下文](manager/CONTEXT.md)、[审查目录](review/README.md) |

文档站展示仓库中的同一份正文：`node docs-site/serve.js`，默认 http://127.0.0.1:4173/ ，只在本机使用；源码快照和自动符号索引不是人工语义认证。

`webagent-core/` 是现行程序；`examples/calculator/` 是可选示例；`webagent-repro/` 是冻结原型，不是启动目标。下载的 code-server 运行时放在 `bin/code-server-runtime/`，不提交 Git。安装版程序与可写数据布局见安装器说明，不要把工作成果保存在 Program Files。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->

主机模式与所有者权限：[Bridge权限与工作模式](docs/guides/Bridge权限与工作模式.md)。Chat/Bridge互斥，同类型可并行；远端Read/Edit/Execute/Capture由本机保存，Execute不是OS沙箱。
