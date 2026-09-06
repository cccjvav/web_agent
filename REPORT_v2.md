# Web Agent 验收复核 + 全面审查报告（v2）

- **对象**：`cccjvav/web_agent` @ `arena/01a05d84-web-agent` tip = `c92fd7c`（本会话分支已 FF 同步至同一提交并 push）
- **日期**：2026-09-06
- **性质**：只读复核 + 实测探针 + 全量测试；未改任何代码
- **前情**：v1 报告（同目录 REPORT.md，已入库为仓库根 REPORT.md）提出 P1-1…P4-4；项目助手随后落地 8 个修复提交（d0e1d8e…c92fd7c）

---

## 一、验收复核矩阵（v1 的 8 个修复项）

| 编号 | 修复提交 | 复核方式 | 结果 |
|---|---|---|---|
| P1-1 admin-host 鉴权/绑定 | `d0e1d8e` | **实测**：默认 listen 127.0.0.1；`GET /`、`/api/stats` 无 token=401、有 token=200；`/health`=200；POST 无 token=401；>1MB body=413。**测试**：adminHost.test.js 断言同款。**文档**：README L27、启动日志含真实 bind | ✅ 闭环（但见新发现 N1） |
| P2-1 vendor 副本锁 | `6dbd61f` | tests/extensionCopy.test.js：文件清单+逐字节对比；在 runner preferred 列表内 | ✅ |
| P2-2 测试 runner | `923147b` | scripts/run-tests.js 逐文件 PASS/FAIL、失败继续、汇总+退出码；**实测**：缺依赖时 13/29 FAIL 可见全貌，`npm i` 后 **29/29 PASS**；测试说明.md L73 已描述 | ✅（顺带见 N2） |
| P2-3 workbench 相对路径 | `0db6d98` | index.html 全 `./`；workbenchHtml.test.js 断言含 `./app.js` 且不含 `src="/app.js"` | ✅ |
| P2-4 docs-site serve 加固 | `cc3d316` | **实测**：默认 bind 127.0.0.1；`%2e%2e`/`../` 探针 404/403；日志 `bind 127.0.0.1:4197` 真实。**测试**：docsSite.test.js 直接断言 `ROOT + path.sep` 与默认 loopback（修复被测试锁死，防回退） | ✅ |
| P3-1/2/3 元文档处置 | `47b3cc3` `87bff44` `0e58850` | 两份过期元文档**删除**；REPORT/PROMPT 入库并在 README L31、DOCUMENTATION_SUMMARY L7 索引（"过程文档不计入覆盖率"口径）；与我交付件**字节一致** | ✅（解法不同于 v1 建议，等价达标；但见 N3） |
| P3-4 docs-site 收录范围 | `d1de7b8` | docs-site/README "收录范围" 段列明嵌入/不嵌入清单 | ✅ |
| P3-5 repro 横幅 | `c92fd7c` | webagent-repro/README 首行"已冻结+DO-NOT-EDIT+分叉"横幅 | ✅ |

**复核结论：8/8 闭环，无回归。** 29/29 测试绿；CI（`npm test`）与本地同套。

## 二、新发现（本轮）

| 编号 | 级别 | 问题 | 位置 | 建议 |
|---|---|---|---|---|
| **N1** | P3 文档 | admin-host/README.md 自相矛盾：L27 已写"请求头要带 Bearer"，但 L43-46「鉴权」小节仍是旧口径"看网页和 /api/stats：**不需要**令牌" | `webagent-core/admin-host/README.md` L43-46 | 改「鉴权」小节为：`/`、`/api/stats`、`/api/report` 均需 Bearer；`/health` 免 |
| **N2** | P4 DX | 新克隆（无 node_modules）直接 `npm test` 会得到 13 个模块缺失崩溃（本轮实测复现）；Windows 有 run-tests.cmd 兜底安装，Linux/mac 无提示 | `scripts/run-tests.js` / 测试说明.md | runner 开头预检 `node_modules/express` 缺失时打印"先 npm install"并以退出码 2 结束；或测试说明补一行 Linux/mac 前置 |
| **N3** | P4 文档 | 仓库根 PROMPT.md 的 10 项待办**已全部完成**但未标注；其中 6-8 项引用的文件已被删除，后来者照做会扑空 | 根 `PROMPT.md` | 文首加"完成情况对照（核对于 c92fd7c）：1-10 已完成，对应提交 …；6-8 被删除式解法取代（47b3cc3/87bff44/0e58850）" |
| 排除项 | — | `ss` 中每个监听端口另有一条 `169.254.x.x` LISTEN：沙箱平台端口代理镜像，**非项目问题**，勿追 | 环境 | — |

## 三、v2 健康矩阵（全面审查复跑）

| 检查 | 结果 |
|---|---|
| `node --check` 全 js / md 链接 / html 资源 / 密钥扫描 / gitignore 跟踪检查 | 全清 |
| 29/29 测试（含新增 extensionCopy、docsSite 锁修复、adminHost 读鉴权、workbenchHtml 相对路径） | 绿 |
| 内存/边界：eventBus（sanitize+MAX_WS32+日志 slice）、session（MAX_HTTP_SESSIONS200+prune）、readCache（400）、oauth（四类 TTL+prune+rateHits） | 均有界 |
| 子进程：ngrok/cloudflared SIGTERM→SIGKILL 兜底、exit 回调齐 | OK |
| 写路径：fileOps 同目录 tmp+rename 原子写+失败清理 | OK |
| 前端敏感面：workbench 无 localStorage 存秘；renderMd 先 escape；extension 只打本机 API | OK |
| 日志秘钥：仅启动时打印含 secretKey 的 MCP URL（"贴 URL"设计的本意，本地控制台） | 已知取舍 |
| 遗留可接受项（v1 P4，均已在 SECURITY.md/架构导读披露）：`/api/status` 带 secretKey、Key 明文落工作区、activationEvents `*`、content.js 入库 | 保持 |

## 四、提示词补充（v2，接在根 PROMPT.md 之后用）

1. **N1**：修 `webagent-core/admin-host/README.md` L43-46「鉴权」小节，与 L27 及代码对齐（`/`、`/api/stats`、`/api/report` 要 Bearer；`/health` 免）；顺手在 adminHost.test.js 已有断言外无需加测（已覆盖）。
2. **N2**：`scripts/run-tests.js` 顶部加依赖预检（缺 `node_modules/express` → 打印 `先在 webagent-core/agent-host 跑 npm install` 并 `process.exit(2)`）；测试说明.md 补 Linux/mac 前置一行。
3. **N3**：根 `PROMPT.md` 文首加完成情况对照表（1-10 → 提交号；6-8 标注"被删除式解法取代"），避免后来者重复劳动或编辑已删文件。
4. 完成后：`npm test` 全绿贴回；每编号一提交；不要动 SECURITY.md 已披露的有意取舍。

---
*本报告与 v1 同置于 `/home/user/review-01a05d84/`（REPORT.md / PROMPT.md / REPORT_v2.md），并经 4175 端口静态服务可下载。*
