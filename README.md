# Web Agent

入口口径：安装版默认快捷方式是 `run-webagent-vscode.cmd`（code-server网页VS Code）；源码最短上手/新手验收使用 `run-webagent.cmd`（自绘经典工作台）。二者默认都用3000，不同时启动。


**环境与复盘入口**：[Windows + Conda](Conda环境说明.md) · [逐项人工验收](review/CHECKLIST_WINDOWS.md) · [从文件到函数的复盘指南](代码复盘指南.md)。

本机工作台 + 独立 agent-host。网页 AI 通过 MCP 改你电脑上的仓库。许可证 [ISC](./LICENSE)。安全边界见 [SECURITY.md](./SECURITY.md)。

同类产品的公开文档可参考 [docs.shuncode.top](https://docs.shuncode.top/docs/intro/)。

GitHub 默认分支 `main` 目前仍是更早的原型快照。现行工作台与 agent-host 在本仓库正在开发的工作分支上（还没有单独的 release）。请以你检出的分支和根目录 `run-webagent.cmd` 为准。

**Windows 用户请先读 [使用指南.md](./使用指南.md)**（安装、CMD、自己的仓库、Bridge 全在里面）。DeepSeek 网页另见 [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md)。多个网页 AI 用 Chat Plus 另见 [网页ChatPlus使用指南.md](./网页ChatPlus使用指南.md)。

**GitHub 上这套东西怎么跑、文件夹是谁：** 请读 **[组件说明.md](./组件说明.md)**。从没写过这种程序、想先用人话搞懂「为什么」： **[架构导读.md](./架构导读.md)**。

**用户探针审阅进度**：[采集层已修复与剩余风险](arena-model-probe/TRANSPORT_REVIEW.md)（离线审阅，不代表模型身份验证）。

**外部页面与主机双向连接核对**：[使用指南](双向连接核对使用指南.md)（不鉴定后台模型、不扩大权限）。

**Bridge计数刷新排查**：[Bridge统计与刷新排查](Bridge统计与刷新排查.md)。

**新手功能入口**：[内置探索 Agent 使用指南](内置探索Agent使用指南.md) · [到底优化了什么（新手版）](借鉴优化说明（新手版）.md)

| 文档 | 读它当… |
|---|---|
| [Windows新手逐步验收.md](./Windows新手逐步验收.md) | 桌面VS Code集成CMD＋Conda的线性验收步骤 |
| [Conda环境说明.md](./Conda环境说明.md) | 环境运行、维护与依赖排错 |
| [启动脚本说明.md](./启动脚本说明.md) | 各脚本的入口、参数与平台差异 |
| [平台启动与CI详解.md](./平台启动与CI详解.md) | Bash/CMD/Inno及自动化验证边界 |
| [代码复盘指南.md](./代码复盘指南.md) | 逐模块、函数和文件类型的学习路线 |
| [使用指南.md](./使用指南.md) | Windows + CMD 从安装到 Bridge |
| [隧道使用指南.md](./隧道使用指南.md) | Quick Tunnel / Named Tunnel / ngrok 逐步（CMD） |
| [技能使用指南.md](./技能使用指南.md) | Skill 放哪、怎么建、load_skill、挂自己仓库 |
| [架构导读.md](./架构导读.md) | 人话 → 比喻 → 文件落地 → 行业叫法（为什么这样装） |
| [docs-site/](./docs-site/) | 同一套导读/直译的可视化 HTML（`node docs-site/serve.js` → http://127.0.0.1:4173/） |
| [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md) | DeepSeek 网页 + DeepSeek++（不 fork 扩展） |
| [网页ChatPlus使用指南.md](./网页ChatPlus使用指南.md) | 多网站 Chat Plus（不 fork、不装 MCP-Gateway） |
| [网页VSCode使用指南.md](./网页VSCode使用指南.md) | 浏览器里真 VS Code |
| [组件说明.md](./组件说明.md) | 整条工作流、怎么跑、为什么这样装、每个目录是谁 |
| [技术实现.md](./技术实现.md) | 对着源码逐步直译：每个函数拆步骤，if/try 不漏；不杜撰未实现的逻辑 |
| [总览.md](./总览.md) | 各子文件夹 README 索引、全局调用链、Install→Run |
| [DOCUMENTATION_SUMMARY.md](./DOCUMENTATION_SUMMARY.md) | 历史计数与审查快照（不是实时覆盖率） |
| [测试说明.md](./测试说明.md) | 怎么跑测试、测了什么 |
| [LICENSE](./LICENSE) | ISC |
| [SECURITY.md](./SECURITY.md) | 隧道、本机密钥、OAuth 只在内存 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 怎么跑测试、改功能时改说明书、不要做的几件事 |
| [review/](./review/) | 过程审查（v1–v6、Windows 清单、PROMPT_SHUNCODE。不是产品指南） |
| [manager/CONTEXT.md](./manager/CONTEXT.md) | 给下一任助手的短索引（项目管家）。不要当用户手册 |

简要对照：

| 目录 | 现在用不用 | 职责 |
|---|---|---|
| `webagent-core/` | **现行主程序** | 工作台 UI + 独立 agent-host（MCP / 工具 / 隧道） |
| `workspace/` | 默认演示工作区 | 计算器示例；`.webagent`（含 `docs-sync` 等 Skill）在这里，不在仓库根 |
| `webagent-repro/` | 不用 | 更早一版纯 Bridge 原型 |
| `bin/code-server-runtime/` | 第二种跑法下载到这里 | npm 完整 code-server，不进 Git |
| `run-webagent-appwindow.cmd` | 可选App样式窗口 | 网页VS Code就绪后打开独立浏览器窗口 |
| `run-webagent-vscode.cmd` | 安装版默认壳 | 浏览器里真 VS Code + Web Agent 侧栏，见 [网页VSCode使用指南.md](./网页VSCode使用指南.md) |
| `install-vscode-extension.cmd` | 本机已装桌面 VS Code | 侧载插件到 `.vscode/extensions`，引擎仍是 `run-webagent.cmd`，见 [使用指南.md](./使用指南.md) 第 5 节 |
| `webagent-core/agent-host/tests/` | 产品测试 | `run-tests.cmd`；不必在仓库根再放 `tests/` |

- 右侧 **Chat**：输入框 **Agent ▾** 默认 **Code**（像 Copilot Agent：搜-读-改-测），只改本机，不需要隧道，不需要 Plus
- **Bridge**：同一套工具变成 MCP。Arena 等网页栏贴 URL 即可；**DeepSeek 网页**要装 DeepSeek++（不 fork 进本仓库），把 Streamable HTTP 填进扩展；**多个网页 AI**（ChatGPT / Gemini / 豆包 / 通义等）可从 GitHub 编译 Chat Plus，同样填 Streamable HTTP，不必装 MCP-Gateway；**ChatGPT 聊天栏贴链接不行**（任何档位）；要对接着设置里的自制 MCP 插件（服务器 URL + OAuth），或 Chat Plus 当手

## Windows 最快开始

```bat
check-env.cmd
run-webagent.cmd
```

浏览器打开 http://127.0.0.1:3000

挂你自己的仓库：

```bat
run-webagent.cmd D:\code\my-app
```

让网页 Agent 改这个仓库：先装一种隧道（默认 `winget install --id Cloudflare.cloudflared`；也可用 ngrok），再在工作台 **启动 Bridge**。逐步填法见 [隧道使用指南.md](./隧道使用指南.md)。Arena 复制提示词；DeepSeek 把 MCP 地址填进 DeepSeek++；多个网页用 Chat Plus；ChatGPT 走设置里的自制插件，不要把地址贴进聊天栏。细节见使用指南第 7 节。

网页里打开真正的 VS Code：

```bat
run-webagent-vscode.cmd
```

验证实现：

```bat
run-tests.cmd
```

说明见 [测试说明.md](./测试说明.md)。

## 其它环境

```bash
./run-webagent.sh
./run-webagent.sh /path/to/my-app
```

bash 入口与 `.cmd` 一样：缺 Node/npm 会退出；默认 `workspace/` 不存在则创建；自定义路径必须已经存在。

**VS Code配套探针**：[安装、分工与验收](webagent-core/probe-extension/README.md)。与WebAgent并装；Companion0.4提供双引擎分析、工作区参考历史与WebAgent只读草稿交接；浏览器包继续使用0.3单采集器。完整浏览器采集、历史和授权自动化仍按完整能力表推进。

**能力范围纠正**：0.1.x曾只有连接核对；0.2.0移植离线内核，0.3.0接入Inspector及同流双解析；完整实时控制/跨端历史/自动化仍在实施。完整参考能力是目标，不以绝对身份认证为前提。见[探针能力对照与迁移边界](探针能力对照与迁移边界.md)。

**当前优先级**：[完整探针整合实施与验收](探针完整整合实施与验收.md)。先完成原型完整参考能力；Chat API背后模型确切验证在此之后。
