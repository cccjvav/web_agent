# Web Agent 项目全面审查报告

- **审查对象**：`cccjvav/web_agent` @ 分支 `arena/01a05d84-web-agent`，tip = `6c1b0fa`（Wire MCP Origin 403 onto the live mcpApp）
- **审查日期**：2026-09-06
- **审查方式**：`git archive` 只读提取全树（191 文件）到临时目录；不切换/不修改任何分支
- **本轮性质**：只查不改。修复建议见文末"建议提示词"。

---

## 0. 已验证为"健康"的部分（不要重复劳动）

| 检查项 | 结果 |
|---|---|
| `npm test`（28 个测试文件全量） | **全绿**，含 docs-site 漂移锁、workbench 绑定节点、危险命令双路径、Origin 403、OAuth、批量请求 |
| `node --check` 全部 .js | 全部通过 |
| 全部 .md 相对链接 / .html 本地资源 | 无断链（workbench 绝对路径问题单列，见 P2-3） |
| 密钥扫描（sk-/ghp_/Bearer） | 仅测试夹具，无真实密钥入库 |
| 修复任务书 6 项任务闭环状态 | 任务1-5 已修且有测试；任务6 两项"有意不做"且已按任务书要求在 `SECURITY.md` 第 30/34 行披露残留风险 → **6/6 闭环** |
| 工作台 XSS | `renderMd()` 先 escape 再渲染；`innerHTML` 拼接处均过 `escapeHtml`（抽查 bridge/chat/bind） |
| CI | `.github/workflows/test.yml` 与本地 `npm test` 同一套 |
| 危险命令护栏 | 词法归一+分阶段判定（`tools/dangerous.js`），远程/本机策略同处表达；`SECURITY.md`/`instructions.js` 措辞已降级为"尽力拦截、非 OS 沙箱"，代码与承诺一致 |

---

## 1. 问题清单

### P1（安全/隐私，实测确认）

**P1-1 admin-host：读接口无鉴权 + 默认监听 0.0.0.0 + 日志误导**
- 实测：`WEBAGENT_ADMIN_PORT=4198` 启动后，无 token 请求 `GET /` → 200（完整排行榜 HTML）、`GET /api/stats` → 200（JSON）；`POST /api/report` 无 token → 401（写接口有鉴权，读接口没有）。
- `webagent-core/admin-host/index.js:6` `server.listen(port, '0.0.0.0')`；而 `index.js:7` 启动日志打印 `http://127.0.0.1:${port}/` —— 日志与实际绑定不符。
- 泄漏面：排行榜含 `githubUser`、`installId`、`toolCalls`、`fail`、`successRate`、`lastAt`（`app.js` renderPage/rankDay）。同网段任何人可读；若机器在多网段/云环境则面更大。
- 建议：读路由（`/`、`/api/stats`）加与写接口相同的 Bearer 校验，或默认 bind 127.0.0.1 并提供 `WEBAGENT_ADMIN_BIND` 显式放开；同时把启动日志改为打印真实 bind。
- 附带：`app.js` `readBody()` 无 body 长度上限（有 token 前置，风险低，顺手加 maxBytes）。

### P2（健壮性/工程卫生）

**P2-1 extensions-installed vendor 副本无一致性保护**
- `webagent-core/extensions-installed/webagent.webagent-core-0.6.9/` 与 `webagent-core/extension/` 逐文件相同（仅少 README.md），版本均 0.6.9。
- 两份"唯一真源"：改 `extension/` 后忘同步副本不会有任何报错；`tests/` 中 grep 不到任何对 extensions-installed 的断言。
- 建议：新增测试断言两目录（除 README）逐字节一致，或改为启动/安装脚本拷贝生成并把副本 gitignore。

**P2-2 `npm test` 为 28 段 `&&` 串联**
- 任一文件失败后其余不执行、看不到全貌，定位差；CI 只看 exit code 所以没暴露。
- 建议：改 `node --test tests/`（Node 20 原生 runner）或写 10 行串行 runner 逐文件打印结果。

**P2-3 workbench/index.html 使用根绝对路径资源**
- `src="/app.js"`、`href="/styles.css"`、`/favicon.svg`：依赖 agent-host 把 workbench 挂在其服务根；file:// 直开或子路径复用即破。
- 建议：改相对路径 `./app.js` 等（同目录，零风险）。

**P2-4 docs-site/serve.js 路径校验不严谨（防御层，实测不可直接利用）**
- `serve.js:33` `if (!file.startsWith(ROOT))` 未加路径分隔符：逻辑上兄弟目录 `docs-site*` 前缀可过校验。
- 实测：`/..%2e/`、`/%2e%2e/` 等形式被 WHATWG URL 解析器先行归一化，HTTP 层打不穿（返回 404/403）；但作为静态服务默认 `DOCS_HOST=0.0.0.0`，仍建议加固为 `file === ROOT || file.startsWith(ROOT + path.sep)`，并把默认 HOST 改 127.0.0.1、日志打印真实 bind（与 P1-1 同类误导）。

**P2-5 admin-host readBody 无大小限制**（同 P1-1 附带，此处编号备查）

### P3（文档漂移/卫生）

**P3-1 《修复任务书.md》自身过期**
- 文内基线 `638d800`，当前 tip `6c1b0fa`（领先 8 提交）。6 项任务实际已全部闭环（1-5 有对应提交 7254743/aa645ba/c0b66c4+6c1b0fa/2625e9b/文档提交；6 走"披露式不做"），但文档没有完成情况对照，后来者会误以为未修而重复劳动。
- 建议：文首加对照表：任务→修复 commit→验收测试文件名。

**P3-2 两份元文档是孤儿 + DOCUMENTATION_SUMMARY 计数过期**
- `修复任务书.md`、`合并版项目问题清单与修复计划.md` 未被 README / DOCUMENTATION_SUMMARY / 任何 README 提及（全仓 grep 证实）。
- `DOCUMENTATION_SUMMARY.md` 的 "92/92 均被提及"、"123/123 代码文件" 断言不含上述新文件，已不成立。
- 建议：要么纳入索引（README 表加"过程文档"行），要么在 DOCUMENTATION_SUMMARY 中声明元文档不计入并更新计数。

**P3-3 《合并版项目问题清单与修复计划.md》第一节是历史快照**
- 该节描述"当前本地分支 arena/01a07192、未见 01a05d84"等当时沙箱状态；如今 01a05d84 存在且为最新。无"历史记录"标注易被误读为现状。
- 建议：节首加一行"以下为 2026-09-05 某会话的历史记录，现分支状态以 git 为准"。

**P3-4 docs-site 收录范围未声明**
- build.js 只嵌 架构导读/技术实现/总览/组件说明 + 各级 README；新增用户文档（隧道/技能/启动脚本/网页系列指南）不在站内。属设计选择，但站点与 docs-site/README 均未说明收录范围，容易被下一次审查当"漂移"。
- 建议：docs-site/README 补一句收录范围与"用户指南看根目录 md"的指引。

**P3-5 webagent-repro/ 旧拷贝仍在**
- README 标"不用"、任务书 0.2 明确"不要改 repro 的 JS"，但其内 patchEngine/diff/eventBus 等是主线旧拷贝且已分叉，package-lock 也在库内、其测试不在 CI。
- 建议（择一）：目录顶加 DO-NOT-EDIT 横幅文件；或归档到独立 tag/分支后删除；至少在其 README 首行加"与主线已分叉，仅供对照"。

### P4（信息级，可不做）

- **P4-1** `/api/status` 仍下发 `secretKey`、API Key 明文存工作区 `.webagent/config.json`：均为 SECURITY.md 已披露的有意残留（第 30/34 行），仅备查；若将来要收回前端持钥，改法见任务书 6.2（`GET /api/bridge/secret` + bridge.js 联动）。
- **P4-2** `extension/package.json` `activationEvents` 含 `"*"`（开机即激活），现代 VS Code 建议收窄。
- **P4-3** `docs-site/content.js`（约 608KB 生成物）入库：有漂移锁测试保护，属可接受取舍；若嫌仓库膨胀可改 CI 生成不入库（会改变离线可用特性，权衡后定）。
- **P4-4** admin-host 上报需手工配 `WEBAGENT_TELEMETRY_URL/TOKEN`：可在 run-admin.sh 启动时打印一键 export 片段（纯体验）。

---

## 2. 建议提示词（交给下一个助手执行用）

见同目录 `PROMPT.md`。
