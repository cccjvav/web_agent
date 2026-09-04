# Skill: 文档同步

当用户新增功能、改工具 / MCP / 路由 / 工作台 / 测试，或提到说明书、README、四阶段文档、文档约定、架构、导读、为什么这样装时，按这个办法做。功能改完必须同步改对应 README **和**（若动到设计理由）根目录 `架构导读.md`。不要另建仓库根 `文档约定.md`。

对照的行级模板仍是第一阶段：子文件夹 `README.md` 写（1）概述与兄弟依赖（2）每文件职责、全部 Class/Function 参数/返回、**Lxx–Lyy**、常量（3）仅该夹执行流。JSON 每个 Key。解释必须能对上磁盘，不杜撰。

**架构导读**（仓库根 `架构导读.md`）给完全没写过这种程序的人。改端口、谁改磁盘、工单怎么进门、钥匙/隧道、工作区边界、或「为什么拆这个文件夹」时，改对应小节，每节仍四层、禁止只堆术语：

1. **人话** — 先讲发生了什么、不这样会出什么事。
2. **生活比喻** — 车间/门卡/点菜单一类，帮助记住为什么。
3. **落在仓库哪** — 点名真实文件与函数；没有的实现标未实现。
4. **行业里管这叫什么** — 一句对照（MCP、沙箱、Quick Tunnel…），不要反过来用缩写当第一句。

默认 `WORKSPACE_ROOT` 是 `workspace/` 时，工具沙箱进不去仓库其它目录。本 Skill 约束的是改产品源码的那次会话（工作区指到仓库根或 `webagent-core` 时）。

## Ask

只读：`list_directory` → `search_files` → `read_files` 看将改的源码、同夹 `README.md`、根 `架构导读.md`。不要 `apply_patch`，不要 `write_file`，不要 `run_command`。

## Plan

从同一起点列出要改的说明书路径（含是否动 `架构导读.md`）。仓库保持不动。

## Code

1. 改 `webagent-core/agent-host/src/<夹>/*.js` → 该夹 `README.md` 里对应 `### 📄 文件名`：函数行号、分支、返回值。行号用磁盘换行计数（不要用编辑器偏一行的 Lxx）。函数写闭区间 **Lxx–Lyy**（含最后的 `}`）。改完后同文件后面函数的 Lxx 都要重数。
2. 新增 `.js` / `.html` / `.css` / 根 `.cmd` → 所在夹 README 加一节；根脚本走 `启动脚本说明.md`。然后改 `DOCUMENTATION_SUMMARY.md` 的文件数。
3. MCP 工具名、参数、错误码、`initialize.instructions` → `src/tools/README.md`、`src/mcp/README.md`；用户请求 → 响应的全局链路变了再改 `总览.md` §2。
4. `src/api/routes.js` 新路由 → `src/api/README.md` 路由表。
5. `workbench/index.html` 或 `app.js` 按钮/统计 → `workbench/README.md`。
6. `agent-host/tests/*.test.js` 新断言或新文件 → `tests/README.md`；`package.json` 的 `scripts.test` 若加文件也要写进去。
7. 根 `README.md` **不要**改成行级模板。`webagent-repro/` 冻结：不在那里再拆一套子 README，也不要为了文档去改它的 JS。
8. 架构 / 数据流 / 工作区边界 / 钥匙与隧道 / 新工单入口 / 「为什么这样装」变了 → 改根目录 `架构导读.md` 对应小节（仍四层：人话 → 比喻 → 文件落地 → 行业叫法）。新实现若只加函数、不改变「电脑上同时活着谁」，可只改该夹 README，但导读第 11 节「不要写成已经接上」若会误导必须改。交叉入口：根 `README.md` 文档表、`总览.md` 第 4 节、`组件说明.md` 第 8 节，新增产品文档时挂上链接。可视化页 `docs-site/` 只呈现这些 Markdown：改导读或行级 README 后跑 `node docs-site/build.js` 或重启 `node docs-site/serve.js`，不要在 `content.js` 里手写实现。

禁止：写源码里没有的调用、路由、环境变量、工具名；把指南口吻写成实现（例如 Named / ngrok 下拉**没有** spawn，不要写成已经开了那些隧道）；为对齐文档去改 `CONNECT_LINE` 或其它测试锁死的字符串，除非测试一起改；提交 `bin/code-server-dist/`、`node_modules/`、`image-search/`。

提交前：`cd webagent-core/agent-host && npm test`（或仓库根 `run-tests.cmd`）绿；新代码文件能在至少一份 README 里搜到文件名；`总览.md` 若新增「查看详情」链接，必须是 `./` 相对路径且目标存在；动过设计理由则 `架构导读.md` 对应节能对上新代码。
