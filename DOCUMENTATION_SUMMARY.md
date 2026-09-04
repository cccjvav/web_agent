# 文档审查报告（第四阶段）

对照第一～三阶段生成的子文件夹 `README.md` 与根目录 [`总览.md`](./总览.md) 做覆盖率、链接、格式检查。本报告不是产品使用指南。

审查日期：2026-09-03。分支：`arena/01a05d84-web-agent`。

---

## 1. 规模

| 项 | 数量 |
|---|---|
| 含 `README.md` 的目录（含仓库根产品首页） | **20** |
| 其中逆向说明书（目录内行级 README，不含根首页） | **19** |
| 根目录补充说明书（不是文件夹 README） | [`启动脚本说明.md`](./启动脚本说明.md)、[`总览.md`](./总览.md)、[`架构导读.md`](./架构导读.md)、本文件 |
| 被至少一份说明书点名的代码/配置文件 | **103** |
| 按扩展名 | `.js` 78、`.json` 8、`.cmd` 4、`.sh` 3、`.svg` 3、`.html` 2、`.css` 2、`.yaml` 1、`.gitignore` 1、`.gitattributes` 1 |
| [`总览.md`](./总览.md) 内 Markdown 链接 | **60**，相对路径全部能解析到文件（`./` 正确，无误用 `../`） |

未计入：`node_modules/`、`package-lock.json`、`image-search/`（gitignore）、`bin/code-server-runtime/` 里下载出来的 code-server 源码（只说明书占位 `package.json`）。

---

## 2. 覆盖率检查

对照仓库内代码树（`.js` / `.html` / `.css` / `.json` / `.cmd` / `.sh` / `.svg` / `.yaml` / `.gitignore` / `.gitattributes`）：

**第四阶段补漏之前缺 2 个文件：**

| 文件 | 处理 |
|---|---|
| `.config/code-server/config.yaml` | 新建 [`.config/code-server/README.md`](./.config/code-server/README.md)；`run-code-oss.js` 以 `--config` 传入 |
| `.gitattributes` | 写入 [`启动脚本说明.md`](./启动脚本说明.md)（根目录不能覆盖产品 `README.md`） |

补完后：**92 / 92 均被至少一份 README 或 `启动脚本说明.md` 提及。**

Bridge 工具链之后新增 2 个 `.js`，均写入 [`src/tools/README.md`](./webagent-core/agent-host/src/tools/README.md)：

| 文件 | 处理 |
|---|---|
| `webagent-core/agent-host/src/tools/normalize.js` | 工具名/参数别名 |
| `webagent-core/agent-host/src/tools/readCache.js` | 读文件 sha256 进程内缓存 |

之后又新增测试：

| 文件 | 处理 |
|---|---|
| `webagent-core/agent-host/tests/bridgeTunnel.test.js` | stub 隧道接到 `/bridge/start` |
| `webagent-core/agent-host/tests/hostPersist.test.js` | secretKey 写入 config.json；read-hashes.json 跨重启 |

现：**103 / 103**。工作台把原来的单文件 `app.js` IIFE 拆成 `js/state.js`、`js/dom.js`、`js/tabs.js`、`js/chat.js`、`js/bridge.js`、`js/settings.js`、`js/bind.js`（+7），均写入 [`workbench/README.md`](./webagent-core/workbench/README.md)。仓库级约定是 Skill [`docs-sync`](./workspace/.webagent/skills/docs-sync/SKILL.md)（`load_skill` 名 `docs-sync`），不是仓库根 `文档约定.md`。该 Skill 还要求：动到「为什么这样装」时按四层写法改根目录 [`架构导读.md`](./架构导读.md)（产品文，不计入上面的代码文件数）。

故意不单独再拆的：

| 路径 | 原因 |
|---|---|
| `webagent-repro/src/**` 等子目录 | 整树已在 [`webagent-repro/README.md`](./webagent-repro/README.md)；冻结，不复制第二份 |
| `extensions-installed/*.js` | 是 `extension/` 的拷贝，行级见 [`extension/README.md`](./webagent-core/extension/README.md) |
| 根 `README.md` | GitHub 首页，不改成行级模板 |

工作区 Skill 文本（`workspace/.webagent/skills/*/SKILL.md`）不是代码，已在 [`workspace/README.md`](./workspace/README.md) 说明。

---

## 3. 链接有效性（`总览.md`）

脚本解析全部 Markdown 链接（方括号标题 + 圆括号相对路径）：

- 子模块「查看详情」均为 `./webagent-core/.../README.md` 或 `./workspace/README.md` 等，**没有**写成 `../`（`总览.md` 在仓库根，`./` 正确）。
- 快速导航锚点指向各 README 的 `### 📄 文件名` 标题；GitHub slug 一般为 `文件名xxxjs`。若渲染器去不掉 emoji，点标题仍可在该文件内搜索文件名。
- 外部链接仅 `https://nodejs.org/`。

其它已生成目录 README 内的相对链接同样解析，无死链。

---

## 4. 格式

- 子文件夹 README 的函数/类已用 **Function \`name\`** / **Class \`name\`**。
- 第四阶段把 [`总览.md`](./总览.md)、[`启动脚本说明.md`](./启动脚本说明.md) 里无语言标记的 ASCII 流程图改成 ` ```text `。Install/Run 命令块保持 ` ```bat ` / ` ```bash `；总图为 ` ```mermaid `。
- 仓库无 Python 服务，没有 ` ```python ` 需求。JSON Key 表用 Markdown 表格而不是未标记代码块。
- 产品指南（`使用指南.md`、`组件说明.md`、`技术实现.md`、`架构导读.md`）里仍有少量无语言标记的示意图，那些不是第一阶段行级 README，本阶段未整篇重排。

---

## 5. 文件夹清单（逆向 README）

| 文件夹 | 说明书 |
|---|---|
| `webagent-core/` | [README](./webagent-core/README.md) |
| `webagent-core/agent-host/` | [README](./webagent-core/agent-host/README.md) |
| `…/src/` | [README](./webagent-core/agent-host/src/README.md) |
| `…/src/mcp/` | [README](./webagent-core/agent-host/src/mcp/README.md) |
| `…/src/tools/` | [README](./webagent-core/agent-host/src/tools/README.md) |
| `…/src/agent/` | [README](./webagent-core/agent-host/src/agent/README.md) |
| `…/src/models/` | [README](./webagent-core/agent-host/src/models/README.md) |
| `…/src/api/` | [README](./webagent-core/agent-host/src/api/README.md) |
| `…/src/tunnel/` | [README](./webagent-core/agent-host/src/tunnel/README.md) |
| `…/src/utils/` | [README](./webagent-core/agent-host/src/utils/README.md) |
| `…/tests/` | [README](./webagent-core/agent-host/tests/README.md) |
| `webagent-core/workbench/` | [README](./webagent-core/workbench/README.md) |
| `webagent-core/extension/` | [README](./webagent-core/extension/README.md) |
| `webagent-core/extensions-installed/` | [README](./webagent-core/extensions-installed/README.md) |
| `webagent-core/scripts/` | [README](./webagent-core/scripts/README.md) |
| `workspace/` | [README](./workspace/README.md) |
| `bin/` | [README](./bin/README.md) |
| `webagent-repro/` | [README](./webagent-repro/README.md) |
| `.config/code-server/` | [README](./.config/code-server/README.md) |
| 仓库根脚本 | [启动脚本说明.md](./启动脚本说明.md) |

知识图谱：[总览.md](./总览.md)。产品怎么跑：[README.md](./README.md)、[使用指南.md](./使用指南.md)。人话架构：[架构导读.md](./架构导读.md)。DeepSeek 扩展：[网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md)。多网站 Chat Plus：[网页ChatPlus使用指南.md](./网页ChatPlus使用指南.md)。
