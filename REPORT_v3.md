# Web Agent 验收复核 + 全面审查报告（v3）

- **对象**：`cccjvav/web_agent` @ `arena/01a05d84-web-agent` tip = `78a540b`（本会话分支已 FF 同步并 push）
- **日期**：2026-09-06
- **性质**：只读复核 + 实测探针 + 全量测试 + 依赖审计；未改任何代码
- **前情**：v2（REPORT_v2.md，已入库）验收 8/8 闭环并提出 N1-N3；项目助手随后落地 3 个提交：`bc14a71`（REPORT_v2 入库+标注）、`03d40b7`（Chat Plus / DeepSeek++「复制规则」新功能）、`78a540b`（关闭 N1-N3 + 修「MCP 设置谎言」）

---

## 一、验收复核矩阵（v2 的 N1-N3 + 新功能）

| 项 | 提交 | 复核方式 | 结果 |
|---|---|---|---|
| N1 admin README 鉴权口径 | `78a540b` | 「鉴权」小节改为 `/health` 免、其余全 Bearer，与 L27 及代码一致；**adminHost.test.js 新增 4 断言把 README 口径锁死**（含"不得再出现旧句"） | ✅ |
| N2 runner 依赖预检 | `78a540b` | run-tests.js 顶部预检；**实测**：无 node_modules 时打印「缺少依赖。先在 webagent-core/agent-host 跑：npm install」并 `exit=2`；codeServerNotRunnable.test.js 锁 `process.exit(2)`；agent-host README、tests/README、测试说明.md 三处口径同步 | ✅ |
| N3 PROMPT.md 完成对照 | `78a540b` | 文首新增对照表（1-10→提交号，6-8 标注删除式解法，明示"不要重复劳动"）；README/DOCUMENTATION_SUMMARY 把 REPORT_v2 一并索引 | ✅ |
| 「MCP 设置谎言」 | `78a540b` | 工作台 MCP 服务器卡片/页从"连接外部工具服务器"改为诚实口径"只记地址，Chat 和 Bridge 都不会去连"；models/README 同步；httpSmoke+workbenchHtml 双向锁（必须含"都不会"、不得含旧句） | ✅ |
| 新功能：复制规则 | `03d40b7` | 管线全走通：`getPageRulesPrompt()`→`hydrateClient().rulesText`（仅 extension-http）→`/api/status`→工作台 `#btn-copy-rules`（默认 hidden，选中 DeepSeek++/Chat Plus 才显示）→**只进剪贴板不进 DOM**。`workspace_info` 新增 `rules` 字段兜底丢 instructions 的网页客户端。**实测**：deepseek/chat-plus rulesText=4306B 以 PAGE_RULES_LEAD 开头，arena=''，页面含按钮，MCP tools/call 返回 rules=4202B+新 hint。测试三层锁（mcpProtocol/httpSmoke/workspaceTools/workbenchHtml） | ✅ |
| REPORT_v2 入库 | `bc14a71`+`78a540b` | 与我交付件一致，仅文首加一行"N1-N3 已落地勿重做"标注（合理） | ✅ |

**结论：N1-N3 全部闭环且被测试锁死；新功能实现干净、文档-测试-代码三方同步。29/29 测试绿。**

## 二、新发现（本轮深挖，此前未覆盖的区域）

| 编号 | 级别 | 问题 | 位置 | 建议 |
|---|---|---|---|---|
| **V3-1** | **P3 性能/内存** | 隧道日志缓冲 `buf += text` **无上限**，且每个数据块都对整个 buf 重跑正则（`parseTunnelUrl(buf)` / `NGROK_READY_RE.test(buf)`）→ O(n²)。`onData` 在 settled 后也不摘除（还要给 eventBus 广播，广播本身没问题、按 chunk 截 400B）。产品文案明说"一次任务可以挂几小时"，ngrok 还是 `--log=stdout` 每请求一行：长 Bridge 会话内存与 CPU 随时间线性涨 | `src/tunnel/cloudflared.js` L107/L119/L122、L170/L182/L184；`src/tunnel/ngrok.js` L111/L133/L136-137 | `buf = (buf + text).slice(-65536)`（就绪判定只需近期窗口；广播用的是 `text` 不受影响）；三处同改；加一条源码锁测试（docsSite.test 风格断言 slice 存在） |
| **V3-2** | P4 加固 | secretKey / admin token 比较用 `===`，非时序安全（`token === config.secretKey`、`bearer(req) === token`）。回环+24 位随机 hex，网络抖动远大于比较时差，实际可利用性≈0 | `src/mcp/oauth.js` L212；`admin-host/app.js` L233 | 可选换 `crypto.timingSafeEqual`（等长时），非紧急 |
| **V3-3** | P4 加固 | MCP 认证额外接受 `?secret=` **query 参数**；经公共隧道使用时 query 可能落入边缘/代理访问日志。文档只宣传 path/Bearer，SECURITY.md 未提这条路径 | `src/mcp/server.js` L22（extractToken） | 保留但在 SECURITY.md 加一句"优先 `/mcp/<secret>` 或 Bearer，`?secret=` 仅兜底，可能进第三方日志" |
| **V3-4** | P4 小项 | `package.json` 无 `engines` 字段；CI 用 Node 20，本地旧 Node 无前置提示 | `webagent-core/agent-host/package.json` | 加 `"engines": { "node": ">=18" }` |

**排除项**（勿追）：`ss` 里每端口另一条 `169.254.x.x` LISTEN = 沙箱平台端口代理镜像；搜索结果的 `h.line` 未走 escapeHtml = 服务端产数字，非用户可控。

## 三、v3 健康矩阵（全面审查复跑 + 新增维度）

| 检查 | 结果 |
|---|---|
| `node --check` 全 js / md 链接 / 密钥扫描 / gitignore 跟踪检查 | 全清 |
| `npm test` @78a540b（重装依赖后） | **29/29 绿** |
| `npm audit --omit=dev` | **0 漏洞** |
| CI：`on: push + pull_request`，Node 20，与本地同套 `npm test`；`.gitattributes` 在 | OK |
| XSS 面：43 处 innerHTML 全查——搜索命中（file/content）、客户端卡（id/name/summary）、步骤列表均 `escapeHtml`；配对码走 `textContent`；`rulesText` 只进剪贴板 | OK |
| MCP 认证链：Bearer → secretKey 或 OAuth access token（TTL+prune）；`/mcp/:secret` 路由全走 `requireAuth` | OK（V3-2/3 为加固项） |
| workspace_info.rules（4202B）在 clipJson 2 万预算内；get_logs 不含 result 的既有断言仍绿 | OK |
| v1/v2 既有结论（内存有界、原子写、子进程清理、回环默认等） | 保持 |

## 四、提示词补充（v3）

1. **V3-1**：`cloudflared.js` 两处 + `ngrok.js` 一处的 `buf += text` 改为 `buf = (buf + text).slice(-65536)`；补一条源码锁测试（断言三处都有 slice 上限），跑 `npm test` 全绿贴回。
2. **V3-3**：SECURITY.md 补一句 `?secret=` 的日志暴露提示（不改代码）。
3. **V3-2 / V3-4**：可选，不阻塞：timingSafeEqual、engines 字段。
4. 除上述外未发现新问题；请勿动已披露的有意取舍（SECURITY.md 各条）。

---
*过程报告同置仓库根：REPORT.md（v1）/ REPORT_v2.md（v2）/ REPORT_v3.md（本文件）。给执行方的待办只有第四节。*
