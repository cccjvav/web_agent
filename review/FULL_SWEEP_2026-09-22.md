# 全仓复审（2026-09-22，F56 批次，基线 24c1364）

用户指令：在增量审查平行分支之余，对本分支再做一遍全仓审查。范围：全部非 Probe 源码（JS/HTML/CSS）、文档联动、UI、工程门禁。Probe 专项（arena-model-probe、probe-extension、trace-inspector，含全部 Python）按分工继续暂停，只登记不读实现。本报告登记发现与证据；修复须另行红测后交付，不由本报告代签。

## 验证基线（本沙箱实测）

- 完整套件 84/84；`npm audit --omit=dev` 0 漏洞；`check-docs.js` 249/28/110 updated=0；`git diff --check` 干净。
- 沙箱第九次 ref 漂移（HEAD 回 50c03be、文件保留），按既有恢复程序 soft reset 到 FETCH_HEAD=24c1364 后逐项核对 `git diff HEAD` 为 0 行，未用 hard reset/clean。

## 发现（按严重度排序）

### P1（有真实 HTTP/代码证据）

| 编号 | 位置 | 现象与证据 | 建议 |
|---|---|---|---|
| S1 | `src/utils/corsAllow.js` mcpCors | **已红测复现**：Origin=https://arena.ai 的跨源 initialize 返回 200 且带 `Mcp-Session-Id`，但无 `Access-Control-Expose-Headers`，浏览器 JS 读不到会话头，无法续用会话；401 的 `WWW-Authenticate` 同理不可读 | 仅暴露这两个响应头（平行分支 F55-01 已有同修复+回归可对照） |
| S2 | `workbench/js/chat.js` sendChat | 现版接受 done 之后的 message 并计入助手历史；无 NDJSON content-type 校验；错误正文 `res.text()` 无字节上限；无端到端 deadline；失败路径不 cancel reader/abort；1MiB 界按字符串长度不按 UTF-8 字节 | 对照平行分支 F55-03 合同补齐；先写 VM 红测 |
| S3 | `scripts/run-code-oss.js` waitHealth | 服务器 accept 连接但不回包时，响应/error 回调均不触发，期限检查永不执行，promise 永久挂起（代码结构与平行分支 F56 修复前完全一致，其已用真实回环 HTTP 红测证明） | 独立 deadline 计时器+销毁在途请求；启动失败收尾已 spawn 的子进程 |

### P2（语义缺口，未单独红测，与平行分支既有红测证据同构）

| 编号 | 位置 | 现象 | 备注 |
|---|---|---|---|
| S4 | `src/tools/patchEngine.js` | 缺失目标三例（旧 expectedHash 静默重建/非空 SEARCH 原文写成新文件/多块创建丢弃后续块）——首次分支审查时已在本分支红测复现，见分支对照报告第一节 | 数据丢失级；平行分支已有完整修复+测试 |
| S5 | `src/mcp/server.js` postAdmission | 本轮实测：批量 65 项 200、批内重复 id 200、浮点 id 200、坏 `MCP-Protocol-Version` 头 200（完全未读该头）、纯通知返回 204（2025-06-18 规范为 202） | 信封准入与协议版本合同缺口 |
| S6 | `src/mcp/server.js` SSE 分支 | 释放挂在 `req.on('close')`；某些代理/半关闭场景 req close 不触发而 res close 触发，`sseOpen` 计数与会话在途计数泄漏 | 平行分支改 `res.once('close')` |
| S7 | `src/mcp/externalClient.js:93` | `message.error` 真值判断：`result` 存在且 `error:null/false/0` 的畸形回复被当成功 | 平行分支已改 `Object.hasOwn` 并有红测 |
| S8 | `installer/launch.js` | `ensureDependencies` 用 spawnSync 阻塞且不可取消、无期限；`ready()` 只看 healthz 状态码 200，端口被其他服务占用时误判"已就绪"直接开窗口；appWindow 后台 spawn 后 `child.on('error')` 仅打印不阻止后续等待 | 平行分支 F57/F58 整链重构可对照 |
| S9 | `workbench/index.html` + js | `#chat-stream`/`#agent-stream`/`#bridge-log` 无 tabindex，长日志键盘用户无法滚动；≤700px 无单窗格切换（首次报告已记，未修） | UI/无障碍 |

### P3（观察项，不定罪）

- `workbench/js/dom.js` renderMd：先整体 escapeHtml 再做标记替换，XSS 面已封；但 \`\`\` 代码块内容会再被 `**`/`- ` 规则二次处理，长代码显示可能变形——显示瑕疵非安全问题。
- 全部 innerHTML 插值点抽查（bind.js 搜索命中、bridge.js 日志/客户端卡/能力列表、chat.js 工具卡）均经过 escapeHtml，未发现未转义用户输入。
- oauth.js 秘钥比较用 timingSafeEqual，extension.js setInterval 均有 dispose 清理，eventBus 有 MAX_* 预算——此三面本轮未发现新问题。
- 我方 `?secret=` query 认证维持既有"已裁决不修"结论不变。

## 平行分支增量核对（e805bef..63cbbdc）

17 提交（F55–F60）已全部细读并实测其 HEAD 97/97 全绿；逐项裁决与 CI 红点核对追加在[分支对照报告](BRANCH_COMPARISON_01a0bfa9_2026-09-21.md)末节。上表 S1–S3 即由其增量红测证据触发后在我方独立验证。

## 总结

本分支门禁全绿（84/84、audit 0、docs 零漂移），但 S1–S8 表明 MCP 浏览器消费链、经典 Chat 流、启动编排、patchEngine 缺失目标四个面存在真实缺陷，且平行分支均已有先红后绿的修复。**建议优先决策两分支收敛而非在本分支重复修复**：对方分支功能面已是本分支超集（含我方 F54 全部语义），继续双轨会持续扩大重复施工。若决定在本分支单独修复，S1–S3 有现成红测方法可直接复用。
