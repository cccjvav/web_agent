# Web Agent 验收复核 + 全面审查报告（v4）

- **对象**：`cccjvav/web_agent` @ `arena/01a05d84-web-agent` tip = `2a49505`（本会话分支已 FF 同步并 push）
- **日期**：2026-09-06
- **性质**：只读复核 + 全量测试 + 依赖审计 + 机械全查；未改任何代码
- **前情**：v3（REPORT_v3.md，已入库）验收 N1-N3 与「复制规则」功能并提出 V3-1…V3-4；项目助手合并我的分支后落地 `2a49505`（关闭 V3-1 / V3-3）
- **V4-1 落地**：工作台 `/ws` `onclose` 退避重连（1s→30s）；状态栏「事件流重连中」；`broadcast` 成功发送重置 30min idle。V3-2 / V3-4 仍为可选。不要再按第四节重复 V4-1。

---

## 一、验收复核矩阵（v3 待办）

| 项 | 复核方式 | 结果 |
|---|---|---|
| **V3-1** 隧道日志缓冲封顶（P3） | 代码：`cloudflared.js` L119/L182、`ngrok.js` L133 三处全部改为 `buf = (buf + text).slice(-65536)`；全仓 grep 无残留 `buf += text`。**测试**：`tunnel.test.js` 新增源码锁——slice 出现次数 cloudflared=2、ngrok=1，且禁止无界追加回潮。**文档**：tunnel/README、tests/README、测试说明.md 三处口径同步（广播仍用当前 `text` 截 400，不受影响——与修复建议一致） | ✅ 闭环 |
| **V3-3** `?secret=` 日志暴露提示（P4） | SECURITY.md 隧道节新增完整一段：优先 path/Bearer，query 仅兜底、可能进边缘/代理日志；与代码 `server.js` L22 事实相符 | ✅ 闭环 |
| REPORT_v3 入库索引 | README 文档表 + DOCUMENTATION_SUMMARY 过程文档行均已加入；REPORT_v3.md 文首加"V3-1/V3-3 已落地勿重做"标注（沿用 v2 惯例） | ✅ |
| V3-2（timingSafeEqual）/ V3-4（engines） | 未做——**符合预期**：v3 即标注为可选不阻塞，REPORT_v3 标注里也如实写明 | ➖ 保持可选 |
| docs-site/content.js | 已随文档变更重新生成；docsSite.test（build→逐字节比对）PASS，确定性保持 | ✅ |

## 二、本轮全面扫描（@2a49505）

| 检查 | 结果 |
|---|---|
| `npm test`（重装依赖后） | **29/29 绿**（含新隧道源码锁） |
| `npm audit --omit=dev` | **0 漏洞** |
| `node --check` 全 js / md 链接 / 密钥扫描 / gitignore 跟踪检查 | 全清 |
| `.gitattributes`：`*.cmd`/`*.bat` 强制 CRLF，其余 `text=auto` | OK（Windows 启动脚本换行有保护） |
| 根启动脚本清点：run-webagent / run-admin / run-tests / run-webagent-vscode / check-env 的 .cmd+.sh 成对齐全 | OK |
| v1-v3 既有结论（内存有界、原子写、子进程清理、XSS 面、认证链、回环默认、CI push+PR） | 抽查保持，无回归 |

## 三、结论（已按第四节补遗修正）

**~~无新发现~~ → 追问复查后新增 1 条 P3（V4-1，见第四节补遗）。** 四轮审查（v1 @6c1b0fa → v2 @c92fd7c → v3 @78a540b → v4 @2a49505）累计提出的 P1×1、P2×4、P3×7、N×3、V3×2 全部闭环；剩余为 V4-1（待修）、两条明示可选项（V3-2 时序安全比较、V3-4 engines 字段）与 SECURITY.md 已披露的有意取舍。

建议的后续节奏：修掉 V4-1 后可正常迭代新功能；每次功能提交保持现有习惯（代码+README+测试锁三同步）。

## 四、补遗（v4 交付后追问复查所得）

| 编号 | 级别 | 问题 | 证据 | 建议 |
|---|---|---|---|---|
| **V4-1** | **P3 功能/UX** | 工作台事件流**静默死亡**：`workbench/app.js` `connectWs()` 只在 boot 调一次（L71），**无 `onclose`/`onerror`、无任何重连**；服务端 `eventBus.addWsClient` 的一次性 idle 定时器（`WS_IDLE_MS=30min`，L58-61）**不随 broadcast 活动重置**，到点必以 1001 关闭每个 WS；`MAX_WS=32` 拒绝（1013）客户端同样无反应。后果：Bridge 任务超 30 分钟（文档主推"一次任务可以挂几小时"）后，BRIDGE 工具调用日志、终端输出、`file_patched` 文件树自刷、todos 全部停更，**无任何提示**；数据面不受影响（MCP 调用/写盘照常），仅刷新页面可恢复。全部文档无"断线需刷新"提示 | app.js L9-31/L70-71；eventBus.js L10-11/L54-67；`grep -rn "reconnect\|onclose" workbench/` 为空；无 setInterval 轮询兜底（refreshStatus 仅用户动作触发） | ① 客户端：`ws.onclose = () => setTimeout(connectWs, 退避 1s→30s 封顶)`，状态栏显示"事件流重连中"；② 服务端：broadcast 成功发送时重置 idle 定时器（或 60s 心跳 ping）；③ 按项目惯例加源码锁测试（app.js 必须含 onclose 重连；eventBus broadcast 必须 touch 定时器）；④ workbench README 数据流第 6 条与使用指南补一句 |

**审查方法学备注**（本轮教训，供后续审查者参考）：V4-1 在 v1-v4 四轮中都漏过，原因是此前对前端只查了 XSS/路径/按钮存在性，没有沿"服务端主动断连 × 客户端重连策略"这条跨层链路对过账；且一次 `grep -v "//"` 过滤把含 URL 的 WebSocket 命中行滤掉过。跨层生命周期（连接、定时器、子进程）应作为固定审查维度。

## 五、剩余风险边界（沙箱内无法验证、需真机确认的维度）

1. **Windows 真机行为**：junction/symlink 测试是 win32 门槛（本沙箱 Linux 跳过）、`.cmd` 脚本引号/编码、CRLF 全链路——建议真机跑一遍 `run-webagent.cmd` + `run-tests.cmd` + 网页 VS Code 模式。
2. **真隧道长挂**：cloudflared/ngrok 从未真实 spawn（无二进制，测试全为 stub+源码锁）；V3-1 修复后建议真开 Bridge 挂 2 小时以上观察 RSS 与日志流。
3. **浏览器 E2E**：工作台只做过源码级断言与只读探针，无真实点击流（沙箱无 Playwright）；Monaco CDN 失败回退已有 textarea 兜底（代码确认），但整页交互未实测。
4. **真实外部服务**：GitHub OAuth 设备流、真实模型 API、DeepSeek++/Chat Plus 扩展实连——只验到协议层/源码层。
5. **压测/覆盖率**：无负载测试；29 个测试文件无覆盖率度量（未装 c8/nyc）。

---
*过程报告同置仓库根：REPORT.md（v1）/ REPORT_v2.md / REPORT_v3.md / REPORT_v4.md（本文件）。待办：第四节 V4-1（P3）；V3-2/V3-4 仍为可选。*
