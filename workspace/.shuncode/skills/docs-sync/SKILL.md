# Skill: 文档同步

当用户新增功能、改工具 / MCP / 路由 / 工作台 / 测试，或提到说明书、README、四阶段文档、文档约定时，按这个办法做。功能改完必须同步改对应 README。不要另建仓库根 `文档约定.md`。

对照的行级模板仍是第一阶段：子文件夹 `README.md` 写（1）概述与兄弟依赖（2）每文件职责、全部 Class/Function 参数/返回、**Lxx–Lyy**、常量（3）仅该夹执行流。JSON 每个 Key。解释必须能对上磁盘，不杜撰。

默认 `WORKSPACE_ROOT` 是 `workspace/` 时，工具沙箱进不去仓库其它目录。本 Skill 约束的是改产品源码的那次会话（工作区指到仓库根或 `shuncode-core` 时）。

## Ask

只读：`list_directory` → `search_files` → `read_files` 看将改的源码和同夹 `README.md`。不要 `apply_patch`，不要 `write_file`，不要 `run_command`。

## Plan

从同一起点列出要改的说明书路径。仓库保持不动。

## Code

1. 改 `shuncode-core/agent-host/src/<夹>/*.js` → 该夹 `README.md` 里对应 `### 📄 文件名`：函数行号、分支、返回值。行号用磁盘换行计数（不要用编辑器偏一行的 Lxx）。函数写闭区间 **Lxx–Lyy**（含最后的 `}`）。改完后同文件后面函数的 Lxx 都要重数。
2. 新增 `.js` / `.html` / `.css` / 根 `.cmd` → 所在夹 README 加一节；根脚本走 `启动脚本说明.md`。然后改 `DOCUMENTATION_SUMMARY.md` 的文件数。
3. MCP 工具名、参数、错误码、`initialize.instructions` → `src/tools/README.md`、`src/mcp/README.md`；用户请求 → 响应的全局链路变了再改 `总览.md` §2。
4. `src/api/routes.js` 新路由 → `src/api/README.md` 路由表。
5. `workbench/index.html` 或 `app.js` 按钮/统计 → `workbench/README.md`。
6. `agent-host/tests/*.test.js` 新断言或新文件 → `tests/README.md`；`package.json` 的 `scripts.test` 若加文件也要写进去。
7. 根 `README.md` **不要**改成行级模板。`shuncode-repro/` 冻结：不在那里再拆一套子 README，也不要为了文档去改它的 JS。

禁止：写源码里没有的调用、路由、环境变量、工具名；把指南口吻写成实现（例如 Named / ngrok 下拉**没有** spawn，不要写成已经开了那些隧道）；为对齐文档去改 `CONNECT_LINE` 或其它测试锁死的字符串，除非测试一起改；提交 `bin/code-server-dist/`、`node_modules/`、`image-search/`。

提交前：`cd shuncode-core/agent-host && npm test`（或仓库根 `run-tests.cmd`）绿；新代码文件能在至少一份 README 里搜到文件名；`总览.md` 若新增「查看详情」链接，必须是 `./` 相对路径且目标存在。
