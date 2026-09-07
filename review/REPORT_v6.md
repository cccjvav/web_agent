# Web Agent 架构优化审查报告（v6：模块分解与解耦）

- **对象**：`cccjvav/web_agent` @ `arena/01a05d84-web-agent` tip = `63a960d`（审查分支 `arena/01a07238-web-agent`）
- **日期**：2026-09-06
- **性质**：静态结构度量（依赖图/扇入/环/重复扫描）+ 大文件精读。**非缺陷审查**——功能与安全问题已在 v1-v5 全部闭环；本报告只谈"可以更好"，全部为可选优化，不修不影响使用
- **总体判断**：后端分层（agent/api/mcp/models/tools/tunnel/usage/utils）方向正确，utils 无向上依赖，models 内聚良好，eventBus 是健康的 pub/sub 解耦。**主要债务集中在 4 个"聚合点"**：`api/routes.js`、`mcp/oauth.js`、`tools/index.js`、`workbench/js/bind.js`，外加 1 处循环依赖（tunnel）和 8 条 tools→mcp 反向边

---

## 一、结构度量概览

| 指标 | 数值 | 评价 |
|---|---|---|
| src / tests / workbench LOC | 7253 / 3507 / 1741 | 测试占比 ~48%，健康 |
| 最大文件 | bind.js 559、runChat.js 550、routes.js 499、extension.js 484、oauth.js 476、tools/index.js 462 | 6 个 >450 行，见 R1-R7 |
| 扇入 TOP | `config.js` **25**、`utils/eventBus.js` **13**、`mcp/errors.js` 7、`models/customizations.js` 7 | config/eventBus 属实用单例，可接受（R10） |
| 循环依赖 | **1 对**：`tunnel/cloudflared.js ↔ tunnel/ngrok.js` | 必修项里唯一的环（R2） |
| 跨层反向边 | `tools/* → mcp/*` 共 **8 条**（errors×5、budget×1、session×1、instructions×1） | 归位后清零（R4） |
| 单模块层 | `api/` 仅 1 个文件（routes.js 引 **21** 个模块、27 条路由） | 全仓最重的聚合点（R1） |
| 跨进程重复 | `timingSafeEqualString`×2、`escapeHtml`×4 | **有意隔离**，不建议抽取（R8） |

## 二、重构建议（按优先级）

### R1（高）`api/routes.js` 按域拆分
- **现状**：499 行、27 条路由、require 横跨 8 层 21 个模块——任何小改动都在同一个文件里碰头。
- **建议**：拆 7 个子 Router 挂到同一 app：`routes/status.js`、`routes/bridge.js`（含 tunnel 启停+github 六条）、`routes/chat.js`（chat/consensus/tasks）、`routes/files.js`（tree/content/skills）、`routes/models.js`（providers/models/customizations/profile）、`routes/tools.js`（tool/call、logs）。`routes.js` 只剩装配（<60 行）。
- **收益**：每个域的依赖面收窄到 3-5 个模块；改动隔离；新路由有明确归属。
- **同步成本**：api/README 行号全改；httpSmoke.test 断言的是 HTTP 行为不受影响；无源码锁引用 routes 内部结构（核对过）。**风险低**（纯搬移，express 语义不变）。

### R2（高）`tunnel/manager.js` 解循环依赖
- **现状**：cloudflared.js 与 ngrok.js 互相 require（各自要停对方的子进程），CJS 部分导出下能跑但脆弱；routes.js 还要分别引两个 provider。
- **建议**：新建 `tunnel/manager.js` 持有两家 child 句柄与 `stopAll()/snapshot()`，两个 provider 只负责"spawn 自己的进程+解析自己的日志"，互不认识；对外只导出 manager。
- **收益**：唯一的环清零；V3-1 那类"三处同改"的横切修复以后只改一处；bridgeTunnel.test 的 stub 点从 2 个变 1 个。
- **同步成本**：tunnel/README 重写一节；bridgeTunnel/tunnel 两测试的 stub 路径；routes.js 引改一行。**风险中低**（涉及进程生命周期，建议先补 manager 单测再切）。

### R3（高）`mcp/oauth.js` 一拆三
- **现状**：476 行混四种职责：内存 token 存储（5 个 Map+TTL+prune）、OAuth 流程（PKCE/设备/刷新轮换）、**HTML 页面渲染**（authorizeHtml+escapeHtml）、限速；还兼管 URL-secret 校验（timingSafeEqualString）。
- **建议**：`oauth/store.js`（Map+TTL+prune+verifyAccessToken+secret 校验）、`oauth/pages.js`（HTML+escapeHtml）、`oauth/index.js`（流程与路由处理，门面保持原导出名，调用方零改动）。
- **收益**：store 可独立单测（现在 oauth.test 279 行大半在起 HTTP 测存储语义）；页面文案改动不再碰认证逻辑。
- **同步成本**：mcp/README oauth 节重写；oauth.test 源码锁路径（`../src/mcp/oauth.js` 字符串断言）需随门面保留或改锁 store；githubAuth 不受影响。**风险低**（门面模式，对外 API 不变）。

### R4（中）共享层归位，消掉 tools→mcp 反向边
- **现状**：`mcp/errors.js`（被 tools 5 处引用）和 `mcp/budget.js`（1 处）实为通用件却住在传输层；`tools/workspaceInfo.js → mcp/instructions.js` 是最后 1 条反向边；`tools/index.js → mcp/session.js`（回合统计）1 条。
- **建议**：① `mcp/errors.js`、`mcp/budget.js` 移到 `common/`（或 `utils/`）；② `instructions.js` 移到 `models/`（它组装的是"工作区操作规则"= SERVER_INSTRUCTIONS+customizations+profile+skills，语义属模型域；mcp 与 tools 从此都向下引用）；③ session 一条边保留并在 README 注明理由（回合计数确属 MCP 会话语义）。
- **收益**：依赖方向变成严格的 api/agent→mcp→tools→models/common/utils；8 条反向边只剩 1 条有注记的。
- **同步成本**：**这是全表里锁最多的**——多处源码锁测试按路径读文件（dangerousCommands、mcpProtocol 等 require 路径）、7 份 README 的相对链接、docs-site content.js 重生成。建议单独一批做，机械替换后全量测试兜底。**风险低但琐碎**。

### R5（中）`tools/index.js` 定义分组
- **现状**：462 行 = 注册器 `tool()` + 4 个本地 handler + **25 个内联 schema 定义** + `getToolList/callTool` 分派。
- **建议**：`tools/defs/` 按域分 5 文件：`meta.js`（ping/capabilities/logs/task_status/wait/progress/todos/remember/recall）、`fs.js`（list/find/search/read）、`edit.js`（apply_patch/write/delete/rename）、`cmd.js`（run/start/get_output/cancel）、`git.js`（status/diff）+ `skill.js`。index 只留注册器与分派（<120 行）。
- **收益**：tools 是最常改的层（15 个文件扇出最大），加新工具不再碰 462 行文件；mcpProtocol.test 的"25 个工具"锁天然继续生效。
- **同步成本**：tools/README 的注册表行号；无源码锁引用 defs 内部。**风险低**。

### R6（中）前端：bind.js 分页控制器 + bridge.js 抽假浏览器 + ui 契约显式化
- **现状**：`bind.js` 559 行单个 `bind()` 挂 **65 个事件**；`bridge.js` 332 行里混着 Bridge 控制、客户端卡和**假浏览器渲染**（renderBrowser/arenaConnect ~120 行）；跨模块用 **52 处 `ui.xxx = fn` 猴补丁**组成隐式接口。
- **建议**：① bind 按设置页/聊天/文件/Bridge 拆 4-5 个 `bindXxx()`，bind.js 只装配；② `browser.js` 独立；③ 在 workbench/README 里把 `ui.*` 契约列成一张表（谁提供、谁消费）——或改成显式 export+一个 wiring 模块（原生 ESM 无打包，拆文件零成本）。
- **收益**：前端是最大的"单人知识依赖"区；拆分后每页改动隔离，ui 契约可被 workbenchHtml.test 按表锁。
- **同步成本**：workbenchHtml.test 锁的是 index.html 的 id，不受 js 拆分影响；workbench/README 两份节重写。**风险低**。

### R7（低）`runChat.js` 抽 Ask 启发式
- **现状**：550 行里 ~200 行是 Ask 模式的本地启发式（explore/summarizeAsk/keywordsFrom/pickExisting/detectTestCommand/stripLineNumbers），与流式编排无关。
- **建议**：抽 `agent/askHeuristics.js`；runChat 保留流式循环、runBuiltin、模型挑选。
- **收益**：Ask 路径可独立单测（现在只能整链路测）。**风险低**。

### R8（低）跨进程重复：注记而不抽取
`timingSafeEqualString`（oauth.js/admin app.js）与 `escapeHtml`（×4）跨 admin-host、workbench、docs-site 三个独立运行环境。**保持重复是正确的**（抽公共包会把刻意隔离的进程耦起来）；建议在每处加一行注释指向同胞实现（"改动需同步 N 处"），并可在各自 README 列明。

### R9（低·实现级）两个小性能点
- `getInstructions()` 每次调用都读盘（loadCustom+profile+skills）；`listClients` 每张 extension-http 卡各调一次 → 一次 `/api/status` 读盘 ×2。建议调用内记忆化（一次 status 内复用）即可，不必上 mtime 缓存。
- `tools/fileOps.js` 25 处同步 IO：写路径的同步是**特性**（配合 hash 锁保证原子性，别改）；但只读扫描（search/find 大目录）会阻塞事件循环、卡住 WS 广播。若未来支持大工作区，可只把只读扫描改异步；当前单人本地场景可不动，建议 README 注明取舍。

### R10（不动项，明示理由）
- `config.js` 扇入 25：实用单例，全仓读同一份 `.webagent/config.json`，注入化改造收益<成本。
- `eventBus` 扇入 13：这就是解耦手段本身（pub/sub），不是债务。
- `extension.js` 484 行单文件：vendor 副本被 extensionCopy.test 逐字节锁，拆分要双份同步，收益低。
- `webagent-repro/`：冻结，任何重构不得触碰。
- admin-host `app.js` 303 行三合一：独立稳定小组件，可拆可不拆，排最后。

## 三、本项目特有的重构成本模型（执行前必读）

这个仓库有两条自己立的规矩，使重构成本比普通项目高 30-50%：
1. **行号级 README**：几乎每个文件在各级 README 里有 `L127–L152` 式行号注记，拆分后全部要重算；
2. **源码锁测试**：多处测试直接读源码字符串断言（`docsSite.test`、`tunnel.test`、`eventBus.test`、`oauth.test`、`adminHost.test`、`workbenchHtml.test`…），移动/改名文件会让锁失效或锁错对象。

因此：**每个 R 项独立成批、批内一次提交、批间 `npm test` 全绿**；每批的提交说明列出"动了哪些锁/README"。宁可做 3 个小批，不做 1 个大批。

## 四、建议执行顺序

```
第1批 R2（tunnel manager，解环）      —— 唯一结构性硬伤
第2批 R4（共享层归位）                —— 锁最多，趁改动面小时做
第3批 R3（oauth 一拆三）+ R9.1（记忆化）
第4批 R1（routes 按域拆）
第5批 R5（tools defs）+ R7（askHeuristics）
第6批 R6（前端拆分）+ R8（重复注记）
```
每批验收：`npm test` 29/29 绿；`node --check` 全清；对应 README 行号更新；docs-site `npm run build` 后 content.js 无 diff（docsSite.test 自动验）；行为零变化（httpSmoke/bridgeTunnel 兜底）。

## 五、给项目助手的提示词补充（v6）

1. 按第四节顺序分批执行 R1-R9（R10 明示不动）；每批独立提交，提交说明写清同步了哪些源码锁与 README 行号。
2. R2 先行：为 manager 补一个"stopAll 停两家 child"的单测再切换 routes 引用。
3. R4 做完后跑一遍 md 链接全查（相对路径改动最多的一批）。
4. 任何一批测试红了就停在该批，不要带红前进。
5. 完成后每批各回一行验收结果；全部完成后我做 v7 复核。

---
*过程报告同置仓库根：REPORT.md（v1）… REPORT_v5.md（验收）/ REPORT_v6.md（本文件，架构优化）/ CHECKLIST_WINDOWS.md（真机清单）。*
