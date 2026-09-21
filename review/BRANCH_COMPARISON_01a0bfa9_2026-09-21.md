# 平行分支审查：arena/01a0bfa9-web-agent（2026-09-21）

用户指令：审查另一助手在 `arena/01a0bfa9-web-agent` 分支上的工作，参考对比并甄别其修复/优化与可能的错误改动。本报告只做审查登记，不改动产品代码；采纳与否由用户决策。

## 审查范围与方法

- 两分支共同基点 `50c03be`（我方 F54 第一批之前）；被审分支 41 提交、112 文件、+21109/-12932，HEAD=`e805bef`。
- 方法：`git diff 50c03be..e805bef` 逐文件细读核心改动（mcp/session.js、server.js、requestLifecycle.js、externalClient.js、resources.js、tools/patchEngine.js、fileOps.js、executor.js、tunnel/ 全部新文件、workbench js/css/html、installer、CI workflow、全部新增测试）；在独立 worktree（临时目录，已核 HEAD 一致）运行其完整套件；对我方 HEAD 运行红测证明其修的缺陷在我方真实存在；对其 HEAD 用 raw socket 运行时抽查其声称的行为。
- 验证结果（本沙箱实测）：
  - 其 HEAD 完整套件 **93/93 测试文件通过**；`check-docs.js` 271/28/110 零漂移；探针目录（arena-model-probe、probe-extension、trace-inspector）**零改动**，遵守暂停分工。
  - 其 HEAD CI 35612499554 九项 success（远端核对）。
  - 运行时抽查其 MCP 服务：重复同名会话头 400、非 ASCII 头 400、批量 65 项 400、纯通知 202、200 个在途会话占满后 initialize 503 —— 全部与其代码注释和测试声明一致。

## 一、确认为真实修复（我方分支同样存在这些缺陷）

1. **patchEngine 缺失目标静默重建（其最重要的发现，我方未发现）**。在我方 HEAD 上红测复现三例：
   - `expectedHash`（旧文件哈希）+ 文件已被删除 → 我方**静默重建新文件**返回 success，而 expectedHash 本应是"文件仍是我读到的那个"的前置条件；
   - 非空 SEARCH 块投给缺失文件 → 我方把**整段补丁原文（含 `<<<<<<< SEARCH` 标记）写成新文件内容**；
   - 多个 SEARCH/REPLACE 块创建新文件 → 我方只写入第一块的 replace（"part A"），静默丢弃其余块。
   其修复语义：缺失文件 + expectedHash → `E_STALE_FILE`（currentHash:null，明确要求停下核对而非自动重建）；非空 SEARCH + 缺失文件 → `E_CONFLICT`；多块创建 → `E_BAD_ARGS`；创建仅接受完整文件体或恰好一个空 SEARCH 块；工具描述同步改写。测试覆盖 dryRun/正式、拒绝不建父目录、不广播事件、不污染 readCache。**这是行为变更但方向正确**：旧行为属于数据丢失级缺陷（模型在文件被外部删除后凭旧哈希"成功"写出残缺内容）。
2. **JSON-RPC 信封准入不完整**。其 postAdmission 补齐：非对象/缺 id/非法 id 类型、批内重复 id、批 >64 项、initialize 混入批、`method` 超长、`params` 非对象 → 400 且不产生副作用（测试验证 write_file 未落盘）。我方仅有部分校验。
3. **MCP-Protocol-Version 请求头**。校验取值并锁定会话协议版本、禁降级，坏版本 400。我方完全没有处理该头（2025-06-18 规范要求）。
4. **会话容量语义**。容量满时不再驱逐最旧在途会话（与我方 F54 修复同向），且 initialize 在无位可用时返回 **503**（我方是静默失败路径）。在途保护用 active 计数 + `beginHttpSessionWork` release 闭包，覆盖 SSE 长流，比我方的实现覆盖面更广。
5. **通知响应 204→202**：规范对齐（实测 202）。
6. **SSE 连接泄漏**：`req.on('close')` → `res.once('close')`，修复某些代理下 close 不触发导致会话计数泄漏。
7. **externalClient 出站**：会话头校验正则与我方一致，另加两点我方没有的——**响应被接受后才 commit 会话头**（避免把被拒响应的 SID 存为会话状态）、`Object.hasOwn(message,'error')` 存在性判断（旧真值判断会把 `result` + `error:null/0/false` 当成功；其台账称已红测确认）。
8. **requestLifecycle**：id 校验 `Number.isSafeInteger`（我方允许任意数字，含 NaN 无穷以外的浮点）。
9. **resources.readResource remote 门控**：远程读取要求 `assertAllowed('read_files')`、workspace 资源要求 callerKey、remote 不回传 recentEvents——补掉一个权限旁路面。
10. **原生链（nativeChatStream/nativeRequestJson）**：其台账记录了红测证明旧 postNdjson 对 302 假完成；修复后仅 2xx NDJSON、坏帧/断流/无终态全拒绝。我方未审计过这条链（该缺陷在共同基点即存在，我方分支同样携带）。

## 二、确认为合理优化

- **工作台窄屏（≤700px）**：单窗格切换器（editor/chat/bridge），`aria-pressed`、焦点跟随、隐藏窗格保留草稿；关闭按钮集中为 `#btn-close-tab` 且带 aria-label、Delete 键关标签。CSS 干净、用变量、不动桌面布局。真实 Chromium 640px 回归在其 CI 通过。曾有一次 CI 抓到 640px 侧栏遮挡（e0fdf65 8/9），随即以行为修复而非改断言关闭——处置正确。
- **进程诊断（R4）**：`WEBAGENT_DEBUG_PROCESS=1` 才开，executor/搜索 worker 生命周期 trace，固定 schema 不记命令/输出/凭据；CI 仅 Windows 开启。为其历史 Windows Node22 超时未定位问题铺观测，未改任何超时/重试策略——克制、合理。
- **审批队列两处真 bug**（operatorQueue：终态淘汰锚定 createdAt 使 expired 不可观察、容量压力下提前删终态破坏 requestKey 去重墓碑），配容量测试锁定。

## 三、重点甄别项（大胆改动）的裁决

- **Windows 隧道清理子系统（R5，全新 ~1500 行）**：registry receipts（DPAPI CurrentUser 密封、O_NOFOLLOW+uid+mode 严格读取）+ PowerShell/C# 帮助进程。细读 tunnelCleanup.cs 后确认其安全设计扎实：**先 OpenProcess 持有内核句柄再校验**（创建时间 ticks + 完整镜像路径 + NtQueryInformationProcess 双向 PID/PPID 匹配），terminate 作用于**已持有的同一句柄**而非按 PID 重开——PID 复用误杀被结构性排除；owner PID 上有任何活进程即拒绝清理（宁可漏杀）；仅允许 `cloudflared.exe`/`ngrok.exe` 文件名；保护自身与 controller PID；两阶段 nonce 确认、4 秒预算、EOF 只关句柄。**结论：设计正确，但只能在真实 Windows 上验收**，其台账也如实登记"真实 ACL/跨用户及真实隧道桌面未验、R5 整体不关闭"。
- **历史 CI 红绿交替（近 8 次 4 失败）**：逐一核对其台账——881230c 是漏生成文档导航（补交后绿）、befee7d 是 Windows Node22 夹具返回 unknown（登记未定根因、后续以线程级令牌隔离消除测试范围风险但明确"不等于查明因果"）、037b0ce 是 **windows-installer job 的 Probe 打包失败**（远端核对属实；其未读/改 Probe，归暂停分工处理，符合约束）。**没有发现掩盖失败、放宽断言或借旧绿灯代签的行为**；相反其提交纪律（失败保留、不重跑抹绿）与我方台账标准一致。
- **docs manifest ±27285 行**：抽样比对，实为 JSON 重排+每文档 sha256/lineCount 随内容更新，由生成器产出，非手写风险面。

## 四、发现的问题/保留意见

1. **initialize 的 peerKey 每次随机**（server.js：`peer:${randomBytes}`）——同一会话重复 initialize 时若 existing.key 缺失会生成新 key，边界行为未见专门测试；影响小（仅标签），登记不定罪。
2. **patchEngine 行为变更的兼容性**：`E_STALE_FILE` 拒绝重建会改变依赖旧行为的调用方（若有脚本故意用旧哈希重建文件）。检索两分支未发现此类调用方，其工具描述已同步，风险低，但合入时应在变更说明中显式标注。
3. **R5 子系统体量大且 Windows-only**：沙箱无法执行 ps1/cs 路径，其测试用夹具模拟；真实验收缺口其自己已登记。合入后我方也继承这个"待实机"负债。
4. **两分支已实质分叉**：其不含我方 `48b08ab`/`2e865bd`；MCP 会话修复语义同向但实现不同（其 active 计数 vs 我方 pin 机制），**不可自动合并**，需择一实现为准（其实现覆盖 SSE、附 503 背压与协议版本锁定，功能面是我方超集）。

## 五、结论与建议

该分支质量高于预期：本沙箱实测 93/93 全绿、HEAD CI 九项 success、探针边界干净、失败记录诚实。其修复中 patchEngine 缺失目标、信封准入、协议版本头、externalClient error 存在性判断、resources remote 门控均为**我方分支现存真实缺陷**（patchEngine 三例已在我方 HEAD 红测复现）。若用户决定收敛两分支，建议以该分支的 MCP 会话/准入实现为基础（我方 F54 的独立价值——畸形头 400 语义——其已等价覆盖），另行合入我方 `4f522f1` 之后的台账与文档差异；patchEngine 行为变更随附迁移说明；R5 隧道清理保持"代码合入、实机验收单列"。合并动作本身未获授权，本报告不执行。

---

## 追加：增量审查（2026-09-22，e805bef..63cbbdc，17 提交）

首次审查后该分支又推进 17 提交（79 文件，+19524/−12502），自述批次 F55–F60。本次增量在新 worktree 实测其 HEAD `63cbbdc`：**完整 97/97 测试文件通过、docs 278/28/111 零漂移、探针目录零 diff、HEAD CI 35663331086 success**。

### 增量修复内容（细读 diff 后逐项裁决）

1. **F55 浏览器消费链（确认为真实缺陷，我方同样存在）**：
   - `mcpCors` 缺 `Access-Control-Expose-Headers`——跨源浏览器 initialize 成功却读不到 `Mcp-Session-Id`（401 也读不到 `WWW-Authenticate`）。**已在我方 HEAD 用真实 HTTP 红测复现**（本报告作者，2026-09-22）：`expose-headers` 为空、会话头对浏览器 JS 不可见。其修复只暴露这两个头，未放开 Origin/token，方向正确。
   - 经典 Chat 流（workbench/js/chat.js）：我方现版仍接受 done 之后的 message 并写入助手历史、`sawError` 后仍算部分成功路径、无 NDJSON content-type 校验、错误正文读取无字节上限、无 5 分钟 deadline、失败不 cancel reader/abort 请求。其修复补齐全部（1MiB 行/16MiB 总量/64KiB 错误正文/严格 UTF-8/done 后数据拒绝），且逐帧字节计数按原始 UTF-8 字节而非字符串长度——我方现版 `buffer.length > 1MiB` 是字符数近似。
   - 文档站/工作台无障碍：架构卡改原生链接、日志区 tabindex+role、灰字对比度、320–390px 布局横溢修复；配 axe-core 固定开发依赖默认执行（16 工作台+12 文档状态）。
2. **F56–F58 启动生命周期（外层编排重构，质量高）**：
   - `run-code-oss.js` waitHealth 旧版（=我方现版）只在响应/错误回调里查期限：服务器接受连接但不回包时 promise 永不结束；新版共享 deadline+abort signal+销毁在途请求。旧版 spawn 失败直接 `process.exit(1)`、主机退出不收尾编辑器子进程；新版单一 owner 统一 finally，SIGTERM 9 秒宽限→同句柄 SIGKILL→1 秒观察，删除了旧 `taskkill /pid /t /f` 按 PID 树补杀路径（避免 stale PID 误杀，同时明确"不再承诺清掉所有后代"的范围收窄）。
   - `installer/appWindow.js`（新 268 行）：修"端口上有任何 200 就当自己人"的就绪误判——现在 /healthz 严格 schema+/api/diagnostics 主机身份（hostInstanceId/版本/端口/workspaceRoot 归一化比对）双探测，非预期占用拒绝打开窗口不停止已有服务；浏览器 spawn 失败显式报错（旧版静默）；启动失败只收尾本轮 IPC 直接子进程，超时后明确"未按名称/端口/PID 补杀"。异常路径审查未发现误杀面；`hostIdentity` 拒绝不匹配时不泄漏细节。
   - `installer/preparation.js`：npm ci 从 spawnSync（阻塞不可取消）改为异步+timeout+abort；强制停止后 1 秒观察期，未确认时标记 `cleanupUnconfirmed` 不谎报已清理。
3. **F55 之后新增 R5 桌面入口**：`installer/tunnel-recovery.ps1` + launch.js recovery 分支。PS 侧拒绝任何参数/管道输入（防确认重放）、每用户 mutex 防并发、只解析 node.exe Application；launch 侧要求 win32+TTY。设计与 R5 既有"预览→输入 RECYCLE 确认"链一致，未见新攻击面。
4. **测试运行器诊断**：run-tests.js 从 stderr 提取固定 schema 生命周期摘要（≤6 行/1800 字节，白名单事件/字段），坏行不破坏 runner——为 Windows echo 超时未决根因积累证据，克制。

### 增量期间 CI 红点核对

近 20 次 run 中新增 1 个 failure：`a22428a`（开始菜单入口批）Windows Node20 主机 job——mcpProtocol 测试专用 echo 30 秒超时无输出，与 R4 历史症状相同；其台账如实登记"八项成功+该失败、不确认同根因、不重跑抹绿"，且新入口相关测试全过。**仍未发现掩盖失败行为**。另其台账 F59 自纠了 F58 的一个证据错误（"同步阻塞取消"声明与实际不符），F60 当天即以真实红测修复——自纠链完整。

### 增量结论

该分支 F55–F60 与首次审查同等质量。其中 **F55 的 CORS expose-headers 与经典 Chat 流合同、F56 的 waitHealth 挂起，均为我方分支现存真实缺陷**（CORS 一项已在我方红测复现；waitHealth 我方代码结构与其修复前完全一致）。收敛建议不变且更强：两分支差距在扩大，其分支已覆盖我方全部独立修复（F54 两批的语义其均有等价或超集实现），建议尽快决策收敛方向，避免重复施工。
