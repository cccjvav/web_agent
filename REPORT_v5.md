# Web Agent 验收复核 + 全面审查报告（v5）

- **对象**：`cccjvav/web_agent` @ `arena/01a05d84-web-agent` tip = `63a960d`（本会话分支已 rebase 同步为 `68d6233` = 他的 tip + CHECKLIST_WINDOWS.md，可 FF）
- **日期**：2026-09-06
- **性质**：只读复核 + 实测探针 + 全量测试 + 依赖审计；未改任何代码
- **前情**：v4 补遗提出 V4-1（P3，工作台 WS 静默断连）；V3-2/V3-4 当时为可选。项目助手合并我的 REPORT_v4 补遗后落地 2 个修复提交：`9b778bf`（V4-1）、`63a960d`（V3-2+V3-4）

---

## 一、验收复核矩阵

| 项 | 提交 | 复核方式 | 结果 |
|---|---|---|---|
| **V4-1** WS 断连（P3） | `9b778bf` | **客户端**：`app.js` 完整重连状态机——`onclose`/构造异常都 `scheduleWsReconnect`，退避 1s×2 封顶 30s，`onopen` 重置退避并清提示，`wsSock` 所有权判断 + readyState 0/1 防重复连接；状态栏新增 `#sb-ws`「事件流重连中」（warn 色）。**服务端**：`eventBus` 改 WeakMap 存 idle 定时器，`_touchIdle`/`_clearIdle`，**broadcast 成功发送即重置 30min**；真空闲仍 1001 关闭（客户端会重连）——与建议完全一致。**测试**：eventBus.test 假 socket+假定时器验证行为（首设 30min、broadcast 清旧设新、idle 触发 1001+清理、第 33 路 1013）+ 源码锁（onclose/重连文案/30000 封顶/Math.min/_touchIdle×2/send→touch 顺序）；`#sb-ws` 被 workbenchHtml+httpSmoke 双锁。**实测**：真起进程，node ws 客户端连 `/ws`，MCP ping 后收到 `tool_call_end` 广播（链路无恙）。**文档**：utils/README、workbench 三份指南、使用指南/技术实现/测试说明全同步 | ✅ 闭环 |
| **V3-2** 时序安全比较 | `63a960d` | `oauth.js` 与 `admin-host/app.js` 各加 `timingSafeEqualString`：**先比 Buffer 长度再 `crypto.timingSafeEqual`**（正确规避了不等长抛 RangeError 的经典坑）；两文件 `require('crypto')` 都在。**测试**：oauth.test 行为级——正确 secretKey 过、**加长一位/截短一位/空串全拒**；adminHost/oauth 源码锁禁 `===` 回潮。**实测**：真 HTTP 层 Bearer 加长/截短 → 401 无 500，正确 → 200；admin 同款三连全过 | ✅ |
| **V3-4** engines 字段 | `63a960d` | `agent-host/package.json` `"engines": {"node": ">=18"}`；oauth.test 锁字段值；agent-host README 表格加行（如实注明"npm 在更旧版本会警告，不硬退出"） | ✅ |
| 报告标注惯例 | `63a960d` | REPORT_v3/v4 文首加"V4-1、V3-2/V3-4 已落地勿重做"；v4 矩阵里 V3-2/4 行由"➖ 保持可选"改为"✅ 之后已落地"、结论同步修正——**改动与事实相符，无美化** | ✅ |
| README/SUMMARY 索引 | `63a960d` | REPORT_v4 已入两处过程文档索引（CHECKLIST_WINDOWS.md 在我分支上，他合并后按惯例补索引即可） | ✅ |

**结论：V4-1、V3-2、V3-4 全部闭环，实现质量高于建议下限（行为级测试 + 源码锁 + 实测三层验证）。**

## 二、本轮全面扫描（@63a960d）

| 检查 | 结果 |
|---|---|
| `npm test`（重装依赖后） | **29/29 绿**（含全部新锁） |
| `npm audit --omit=dev` | **0 漏洞** |
| `node --check` 全 js / md 链接 / 密钥扫描 | 全清 |
| 实测探针 9/9：MCP Bearer 错长×2→401、正确→200；WS 广播端到端；admin 错长×2→401、正确→200、/health→200 | 全过 |
| 文档-代码-测试三同步（重连/timingSafeEqual/engines 在 6+ 份文档一致） | OK |
| v1-v4 既有结论抽查（隧道 buf 封顶、原子写、子进程清理、XSS 面、认证链、回环默认、CI） | 无回归 |

## 三、结论

**本轮无新发现。** 五轮审查（v1→v5）累计提出的 **P1×1、P2×4、P3×8（含 V4-1）、N×3、V3×4 全部闭环**；SECURITY.md 披露的有意取舍保持不变。代码库当前没有已知的未修问题。

**剩余的验证缺口只有一类**：沙箱原理上覆盖不到的 Windows 真机维度，已整理为 `CHECKLIST_WINDOWS.md`（在本分支仓库根）——A 节 11 条给使用者（约 20 分钟），B 节 11 条给开发（junction 分支、.cmd CRLF、真隧道长挂、浏览器 E2E、真实外部服务等）。**注意 B4（V4-1 复现）现已修复，真机验证时预期行为改为：放置 35 分钟后 BRIDGE 日志照常滚动，期间状态栏可能出现「事件流重连中」短暂提示后自动恢复。**

后续建议：正常迭代即可；审查按里程碑抽查；真机清单跑完把结果表回填提交。

---
*过程报告同置仓库根：REPORT.md（v1）/ REPORT_v2.md / REPORT_v3.md / REPORT_v4.md / REPORT_v5.md（本文件）/ CHECKLIST_WINDOWS.md。本轮无待办。*
