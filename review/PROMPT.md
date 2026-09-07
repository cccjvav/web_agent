# 建议提示词（直接复制给下一个开发助手）

> 用法：整段复制。执行方若是被 Arena 固定在其它分支的会话，按第 0 步用 worktree/只读提取审阅与改码，**不要切换分支**；产出提交只允许落在 `arena/01a05d84-web-agent`（或该会话被固定的分支，二选一并在交付说明里写明）。

## 完成情况对照（核对于 `c92fd7c`；其后还有 Chat Plus 规则补强 `03d40b7`）

下面「待办」1–10 **已经做完**，不要再照做、也不要去改已删除的过程稿。

| 提示词项 | 编号 | 提交 | 说明 |
|---|---|---|---|
| 1 | P1-1 | `d0e1d8e` | admin-host 读接口 Bearer + 默认 127.0.0.1 + body 1MB |
| 2 | P2-1 | `6dbd61f` | `extensionCopy.test.js` 锁副本 |
| 3 | P2-2 | `923147b` | `scripts/run-tests.js` 逐文件汇总 |
| 4 | P2-3 | `0db6d98` | 工作台 `./app.js` 等相对路径 |
| 5 | P2-4 | `cc3d316` | docs-site 路径校验 + 默认 loopback |
| 6–8 | P3-1/2/3 | `47b3cc3` `87bff44` `0e58850` | **删除式**：不要再编辑 `修复任务书.md` / `合并版项目问题清单与修复计划.md` |
| 9 | P3-4 | `d1de7b8` | docs-site 收录范围 |
| 10 | P3-5 | `c92fd7c` | webagent-repro DO-NOT-EDIT 横幅 |

v2 复核（[REPORT_v2.md](./REPORT_v2.md)）新增 N1–N3：admin-host README 鉴权口径、测试缺依赖预检、本文件完成对照。不要重复劳动 v1 的 1–10。

---

你在仓库 `cccjvav/web_agent` 上工作。目标分支：`arena/01a05d84-web-agent`（当前 tip 应为 `6c1b0fa` 或更新）。

## 第 0 步：确认你看到的是正确代码（否则你会审错/改错）

```bash
git ls-remote --heads origin                      # 直接问服务器，唯一可靠
git fetch origin '+refs/heads/arena/01a05d84-web-agent:refs/remotes/origin/arena/01a05d84-web-agent'
git log --oneline -3 origin/arena/01a05d84-web-agent
```

禁止用 `git branch -r` 断言分支不存在（本仓 remote.fetch 可能只配了 main）。若你的会话被固定在其他分支：用 `git worktree add --detach /tmp/w584 origin/arena/01a05d84-web-agent` 或 `git archive origin/arena/01a05d84-web-agent | tar -x -C /tmp/w584` 审阅；提交时只提交到被允许的目标分支。

## 背景（已验证，不要重复劳动）

- `npm test`（webagent-core/agent-host）28 个测试文件全绿；修复任务书 6 项任务已全部闭环（任务 6 为"有意不做 + SECURITY.md 披露"）。
- 危险命令护栏、Origin 403、JSON-RPC batch、模型表格字段均已修且有测试。
- 完整审查报告见上一轮交付（问题编号 P1-1…P4-4），本提示词只列待办。

## 待办（按顺序；每项独立提交，提交信息引用编号）

1. **P1-1 admin-host 鉴权与绑定**（安全，最高优先）
   - `webagent-core/admin-host/app.js`：`GET /`、`GET /api/stats` 增加与 `POST /api/report` 相同的 Bearer token 校验；或改为"读接口仅回环可达"（用 `utils/localControl.js` 同类判定），并提供 `WEBAGENT_ADMIN_BIND` 环境变量显式放开 0.0.0.0。
   - `webagent-core/admin-host/index.js`：默认 bind 改为 127.0.0.1（除非显式环境变量）；启动日志打印**真实** bind 地址，不再固定打印 127.0.0.1。
   - `readBody()` 加 maxBytes（建议 1MB，超限 413）。
   - 验收：新增/扩展 `tests/adminHost.test.js`：无 token 读 `/`、`/api/stats` 得 401（或回环外 403）；有 token 正常；POST 行为不变。
2. **P2-1 vendor 副本一致性**：新增测试断言 `webagent-core/extensions-installed/webagent.webagent-core-0.6.9/` 与 `webagent-core/extension/` 除 README.md 外逐字节一致（读两边文件对比即可，无新依赖）。
3. **P2-2 测试 runner**：`package.json` 的 `test` 脚本改为能逐文件报告的形式（优先 `node --test tests/`；若有文件不兼容 node:test 的裸 assert 风格，写一个 ≤20 行的串行 runner 脚本放 `scripts/`），保证 CI 与本地输出一致且单点失败可见全貌。
4. **P2-3 workbench 相对路径**：`webagent-core/workbench/index.html` 的 `/app.js`、`/styles.css`、`/favicon.svg` 改 `./` 前缀；确认 `tests/workbenchHtml.test.js` 仍绿，必要时补断言。
5. **P2-4 docs-site serve 加固**：`docs-site/serve.js` 路径校验改 `file === ROOT || file.startsWith(ROOT + path.sep)`；默认 HOST 改 `127.0.0.1`（保留 `DOCS_HOST` 覆盖）；启动日志打印真实 bind。
6. **P3-1 任务书闭环对照**：在 `修复任务书.md` 文首加"完成情况对照（核对于 <tip hash>）"表：任务一→7254743+tests/dangerousCommands.test.js；任务二→aa645ba；任务三→c0b66c4+6c1b0fa+tests/corsAllow.test.js；任务四→2625e9b；任务五→文档提交（架构导读/SECURITY.md/instructions.js 现行文本）；任务六→不做，SECURITY.md 第 30/34 行披露。
7. **P3-2 孤儿元文档与计数**：README 文档表加一行"过程文档"链接 `修复任务书.md`、`合并版项目问题清单与修复计划.md`；更新 `DOCUMENTATION_SUMMARY.md` 的覆盖计数与清单（或声明元文档不计入的口径），保持其"全部被提及"断言为真。
8. **P3-3 历史快照标注**：`合并版项目问题清单与修复计划.md` 第一节首行加引用块："以下为 2026-09-05 会话的历史记录（当时分支 01a07192）；当前分支状态以 `git ls-remote` 为准。"
9. **P3-4 docs-site 收录范围**：`docs-site/README.md` 补"收录范围"段：站内嵌 架构导读/技术实现/总览/组件说明+各级 README；用户操作指南（隧道/技能/启动脚本/网页系列）以根目录 md 为准。
10. **P3-5 repro 横幅**：`webagent-repro/README.md` 首行加粗横幅："与主线已分叉的旧拷贝，仅供对照；DO-NOT-EDIT（见 架构导读.md 第 12 节与修复任务书 0.2）。"

## 明确不要做（有意取舍，见 架构导读.md 第 12 节 / SECURITY.md）

- 不拆多把 secret；不按客户端隔离全局状态；不接 Codex OAuth；OAuth 不落盘；不做 OS 级沙箱/系统钥匙串/交互式 PTY；不把 API Key 迁出工作区（已披露）；不改 `webagent-repro/` 的 JS 逻辑；不删 docs-site 的 content.js 入库取舍（除非另有决定）。
- 不要"顺手"重构未列出的文件；不要改分支名/推送其它分支；不要提交 node_modules、不要动 `.webagent/config.json`。

## 交付要求

1. 每个编号一个 commit（或明确说明合并理由），提交信息含编号。
2. `npm test` 全量输出贴回（必须全绿，且新增测试确实在跑）。
3. 逐编号说明：做了什么/没做什么/为什么；与本报告编号一一对应。
4. 若某条你实测后发现前提不成立（像上一轮 serve.js 越界被 URL 解析器挡住那样），写清实测命令与输出，改按"加固/降级"处理并在说明中注明。
