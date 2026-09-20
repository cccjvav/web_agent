# F54 独立复审：实现、文档、UI 与 ShunCode 取舍


> 修复追踪：本报告保留50c03be基线观察及当时状态。后续第一批已实施会话pin/全忙503、完成后空闲TTL和双向会话头校验；F54-03与F54-06的会话头部分已有回归；第二批又补F54-02及F54-06的RPC ID/版本/批次准入与通知202；第三批又补F54-01缺失目标hash保护和新建块校验，其他发现未关闭。当前门禁与边界见[阶段54修复记录](../manager/stages/s10-upstream-adoption.md)。
日期：2026-09-20。审查实现基线：`50c03bedc97f9eaaf1c875f4767c6e9bb5278d56`，核心版本0.7.2。

**结论：现有工程有相当多有效保护，不应重写；但本轮新增负例已复现多项文件保护、MCP生命周期和结果消费缺陷。84/84与浏览器套件通过，不等于这些边界正确，更不等于全仓逐句审查完成。**

本轮交付是独立审查、复现证据和相邻错误说明的修订，**没有修复产品运行代码，也没有把实验脚本加入正式回归**。下列P1/P2是修复优先级，不是CVSS评分；发现状态均明确写出。项目计划仍只维护在[阶段10](../manager/stages/s10-upstream-adoption.md#当前工作包与交接约束)，本文不是第二份路线图。

## 1. 同步、范围与验证方法

- 在固定分支`arena/01a0bfa9-web-agent`工作。已fetch用户指定的`arena/01a0b053-web-agent`；本轮同步时两者都是上述完整SHA，ahead/behind为0/0，无需合并。没有切分支、重置或恢复Git引用；此前批次的ref恢复事故不是本轮发生的事情。
- 先读manager，再读已有review，但所有本轮行为结论来自当前源码与独立实验，不继承旧报告的“未发现高风险”判断。
- 用户重新确认**保持原分工暂停**：`arena-model-probe/`、`arena-trace-inspector/`、`webagent-core/probe-extension/`及探针专项helper/tests/docs不接手、不修改。完整既有套件自动经过存量用例，不算探针专项审查。
- 基线Git库存836文件，其中197份Markdown、249份JS、32份MJS、18份Python；这些是仓库枚举数，不是语义通过数。18份Python都在暂停范围；当前跟踪主项目没有TS/TSX/MTS实现。参考zip另有8份TS/MTS扩展层文件，不能混为本项目语言栈，更不构成TS重写理由。
- 深入链路包括MCP认证/主体/会话/取消/资源，文件路径/patch/hash与读取缓存，审批/workflow/外部MCP及stdio，模型工具循环，原生聊天消费，经典工作台布局与页签。共享REST、安装/编排、存储、GitHub/统计、Windows脚本/C#、文档站等做了不同深度的对照和既有回归核验；**没有把所有这些目录逐文件、逐函数、逐句审完**。
- 冻结原型、发行副本、示例、历史截图不是可直接修改的主线源码；未重签Windows、真实VS Code、手机、公网服务或历史超时验收。

### 验证结果

| 检查 | 本轮实际结果 | 不能据此推断 |
|---|---|---|
| `npm test --prefix webagent-core/agent-host` | 84/84测试文件通过 | 新负例已进入正式测试、所有分支正确 |
| `npm run test:browser --prefix webagent-core/agent-host` | 通过；包含既有文档站/工作台/审批/外部接入fixture | 真实IDE、外部模型、用户Windows已验收 |
| `node docs-site/check-docs.js` | 249源码/28目录/110排除，基线updated=0 | 249份实现或全部文档语义正确 |
| 非暂停语法/JSON检查 | 201 JS/MJS、4 Shell、14 JSON，共219项通过 | PS1/C#/Inno已编译，Python专项已验 |
| 选定ESLint规则 | 200 JS/MJS；除73处`no-promise-executor-return`风格提示外，无所选规则报警 | 全套lint或类型/安全认证；这些返回值提示本身不是73个功能缺陷 |
| Markdown链接扫描 | 181份MD、5865个本地链接；2个失效链接均在发行副本的PTY详解 | 外部链接、所有锚点/渲染器已通过 |
| calculator示例 | 6/6通过 | 示例是默认工作区 |
| 生产依赖审计 | 0已知漏洞 | 项目逻辑安全、开发依赖/CDN/Node运行时全无风险 |
| 远端精确基线CI | [35470787917](https://github.com/cccjvav/web_agent/actions/runs/35470787917)，九job逐项success | 本轮新报告已有新的CI；旧Windows22超时根因已修复 |

CI九项实际为Ubuntu的Node18/20/22/24、Windows的Node20/22/24、Windows安装器、Chromium，不是Ubuntu18/20等操作系统版本。上传提交`3fbe872`的旧清单失败已被后续`50c03be`绿灯取代为当前基线，但历史失败保留。

浏览器使用Playwright1.63.0与仓库外安装的`@sparticuz/chromium@153.0.0`，实际版本`153.0.8010.0`。官方浏览器下载与apt曾失败；最后用包内Chromium和依赖库启动，**没有关闭web security或TLS验证**。这不是冒充CI固定的CfT构建。额外截图在无CJK字体的Linux环境加了审查专用Noto Sans SC 400回退，没有改产品字号/颜色/布局；Monaco CDN被拦截以检查产品已有textarea回退。缺少emoji字体的方框不作为Windows产品缺陷。

## 2. 已复现的问题

### F54-01 · P1 · 新文件补丁绕过显式hash保护，并可能丢弃编辑

位置：[patchEngine.js](../webagent-core/agent-host/src/tools/patchEngine.js#L278)，尤其285–329行。

真实`callTool('apply_patch', …)`，临时工作区，未替换文件handler：

1. 目标不存在，传入旧内容的`expectedHash`和非空SEARCH块：仍创建文件，正文竟为包含SEARCH/REPLACE标记的原始patch，返回`success:true`、`verification.state:'verified'`。
2. 新文件补丁第一块为空SEARCH创建`first`，第二块将`first`改成`second`：返回成功，文件内容却只有`first`。

原因：不存在分支先于hash核对；非空SEARCH落回整文件正文，空SEARCH只取首块。读回hash验证只能证明“写出的字节等于程序算出的字节”，不能证明补丁含义被正确执行。[旧详解](../webagent-core/agent-host/src/tools/补丁与路径详解.md)其实已经描述了后两种行为，不能因为文档描述了它就把它判成安全设计。

**建议修复合同**：有显式旧hash而目标消失时拒绝且零写；新建只接受明确文件正文或明确支持的创建补丁，非空SEARCH不能变正文，多块必须完整支持或整体拒绝；dryRun同样拒绝不可能的合同。保留现有路径、独占创建、串行写、检查点和审批，不替换文件工具栈。

证据：`file-resource-repro.cjs/.json`前两项。状态：已复现，未修复。

### F54-02 · P1 · RPC准入未拦住不可寻址写调用，批内重复ID仍执行两次

位置：[server.js](../webagent-core/agent-host/src/mcp/server.js#L330)、[requestLifecycle.js](../webagent-core/agent-host/src/mcp/requestLifecycle.js)。

单独真实router与完整`src/index.js`主机均复现：

| 输入 | 实际结果 |
|---|---|
| `id`为对象 | HTTP200，真实`write_file`落盘 |
| `id:null` | HTTP200，落盘 |
| 257字符ID | HTTP200，落盘，但不能进入现有最长256字符的取消键索引 |
| 无ID的`tools/call` | HTTP204，却已写盘 |
| 同一batch两项使用相同ID、分别写两个文件 | HTTP200、两个响应、两个文件均产生 |

对象ID不符合JSON-RPC；MCP请求ID还明确不能为null。257字符不是通用MCP禁止的长度，而是**本项目调用接受范围与取消寻址上限不一致**。无ID方法不能仅靠“通知不回包”掩盖写入。规范依据为[项目声明支持的2025-06-18基础协议](https://modelcontextprotocol.io/specification/2025-06-18/basic)。

当前并非“没有ID登记”：`lifecycle.run`已经按精确凭据+peer+带类型ID防在途重复，64个在途、5分钟期限、断连abort、finally释放都存在。漏洞在准入前形状校验与**整批**预检查；顺序batch每项结束就释放，下一项同ID因此再次被接受。

**建议**：认证和Origin门禁后、分配会话/广播/工具执行前验证envelope、请求与通知的合法组合及预算；兼容的旧协议batch整批校验并原子claim，再执行并可靠释放。数值0与字符串`"0"`仍须区分。claim只是防冲突，不是持久幂等或exactly-once，不能拿它代替现有审批requestKey。

所有写入均使用临时有效凭据、临时目录；**没有证明未认证写入或越过Edit权限**。证据：`mcp-repro`、`full-host-repro`。状态：已复现，未修复。

### F54-03 · P1 · 容量驱逐会删除忙会话，使取消失去入口

位置：[session.js](../webagent-core/agent-host/src/mcp/session.js#L97)，关联[server.js](../webagent-core/agent-host/src/mcp/server.js#L83)。

在真实认证HTTP上挂起一个可控工具调用，再通过内部`createHttpSession`与递增时钟制造超过200条的容量压力：原SID被删除；随后走HTTP发送取消得到404，原工具的AbortSignal仍未abort。

这里用受控handler保证请求在飞，填充通过内部会话API，**不是201次真实HTTP initialize，也不是24小时长跑**。这足以证明当前容量分支不保护busy，却不能推断所有实际工作负载都会发生。

需要区分三个时钟：

- HTTP会话24小时按`lastSeen`惰性清理，不是所有任务固定运行24小时后被杀。
- MCP工具请求通常有5分钟协作式期限；忽略signal的同步/外部工作不一定被硬中断。
- GET SSE当前最多32条、固定10分钟结束，心跳不会重置这一寿命。

所以实际优先问题是**即时容量驱逐和取消/结果归属丢失**，不是把普通长任务泛称为24h TTL杀死。删除会话本身也不是取消或回滚。

**建议**：按可信SID计数`activeRequests/activeStreams`，忙时不参与空闲/容量淘汰；完成与关闭路径单次释放并更新时间。全忙时拒绝新会话，不驱逐旧任务。保留全局预算、超时、显式DELETE/撤销策略，避免忙会话无限占槽。证据：`mcp-repro`。状态：已复现，未修复。

### F54-04 · P1/P2 · tools与resources的上下文隔离没有统一

位置：[resources.js](../webagent-core/agent-host/src/mcp/resources.js#L28)及server的`resources/read`分支。

- **P1，归属/输出正确性**：`get_task_status`工具传remote/callerKey，能得到对应远端计划；`webagent://workspace`却调用无options的`getTaskState()`。本轮先设置本地独有step标记，完整主机的认证远端`resources/read`仍返回该本地标记。新会话不应把Local计划当自己的进度。不是已证明的完整多租户/OS隔离突破。
- **P2，目录投影**：通过带工作区绑定和revision的本机API关闭Edit/Execute/Capture后，`tools/list`正确不含`write_file`，`webagent://capabilities`仍列出它。后者调用无remote选项的`getToolList()`。同一完整主机上的实际远端写调用仍被拒绝、没有产生文件，**这是目录不一致，不是写权限绕过**。

**建议**：工具、资源、GET状态采用统一的可信caller上下文与公开投影；Read仍由现有执行控制检查。不能为修展示而放开执行权限。证据：`file-resource-repro`、`full-host-repro`。状态：已复现，未修复。

### F54-05 · P1 · 原生VS Code聊天流仍会把不可靠结束当正常完成

位置：[extension.js](../webagent-core/extension/extension.js#L138)，消费方`registerChatParticipant`与`ChatView`。

用VM加载真实扩展函数，只替换VS Code依赖，并连真实回环HTTP服务器：302空响应、坏JSON行、只有partial message而无终态，`postNdjson()`均正常resolve。它只拒绝HTTP≥400、吞JSON/回调异常，在`end`无条件resolve。`ChatView`还可能把已累积的部分回答加入history。

经典工作台`chat.js`已经有JSON/事件格式、缓冲与可靠终态检查；这不能自动算原生消费方也完成。`requestJson`和`postNdjson`的响应字节预算、响应流aborted/error处理也应补齐；后两项为静态缺口，本轮未做内存耗尽或真实IDE断网实验。

**建议**：原生消费者拒绝异常HTTP/坏帧/提前结束，区分done、error、cancelled/unknown，只保存确认成功的助手历史；保留用户停止与禁止自动重放修改。真实VS Code窗口还需单独验收。证据：`native-stream-repro`。状态：上述三种输入已复现，未修复。

### F54-06 · P2 · 重复会话头和版本/批次策略不严格

位置：[server.js](../webagent-core/agent-host/src/mcp/server.js#L79)。

- 使用`node:http`发送两个相同`Mcp-Session-Id`头：initialize返回200、新SID，会话数增加1。普通自定义重复头在Node中通常合并为逗号字符串，**不能照抄参考README的“必然string[]、必然TypeError”**。本项目`String(...).trim()`没有显式拒绝重复/逗号值，因而把它当未知SID并建新会话；未证明会话接管。
- 1000个ping的batch仍返回200和1000个响应。现有20MB解析器限额不是“没有body预算”，但缺少batch条目数、整批输出和总耗时预算。
- 完整主机协商2025-06-18后仍接受重复ID的batch；请求头`MCP-Protocol-Version: 1900-01-01`仍获得200结果。

[2025-06-18变更记录](https://modelcontextprotocol.io/specification/2025-06-18/changelog)已经移除batch；[该版HTTP协议](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)规定不支持的版本头应400、接受的通知应202。当前代码通知为204。这里不是要求全面升级SDK，而是不能声明几个版本却共用一套不区分版本的行为。

**建议**：在原始头/headersDistinct层拒绝重复，统一单值、字符、长度与未知会话策略；按明确协议版本决定是否接受batch。预算要兼容现有合法文件大小，不能照搬一个过小全局body限制。证据：`mcp-repro`、`full-host-repro`及源码/官方规范。状态：已复现/对照，未修复。

### F54-07 · P2 · 窄屏中心区消失并溢入聊天，页签ARIA仍有错误

位置：[styles.css](../webagent-core/workbench/styles.css#L86)、[tabs.js](../webagent-core/workbench/js/tabs.js#L4)、[index.html](../webagent-core/workbench/index.html)。

额外真实浏览器检查9个状态，页面JS error为0；但矩形测量显示：

| 视口宽度 | center实际宽度 | rightbar实际宽度 |
|---|---:|---:|
| 1440 | 1036 | 356 |
| 1024 | 620 | 356 |
| 768 | 364 | 356 |
| 640 | 236 | 356 |
| 390 | **0** | 342 |
| 320 | **0** | 272 |

390/320时并非只是把主编辑区有意隐藏：欢迎页的绝对定位内容溢出，叠在聊天和输入区。既有390px断言主要检查根水平溢出、侧栏抽屉和右栏在视口内；`overflow:hidden`能让这些断言通过，却不能证明内容可用。窄屏API设置弹窗则可正常排为纵向，不应全盘否定现有响应式工作。

axe-core4.13.0在这9个状态均报告同一项`aria-required-children`：`#tabs[role=tablist]`还包含关闭按钮。axe的`critical`是辅助功能规则级别，不是安全P0。没有发现这些状态下的自动对比度报警，亦不宣称全部页面WCAG通过。

截图随本报告保存在仓库：`review/evidence/F54-workbench-1440.png`、`review/evidence/F54-workbench-390.png`、`review/evidence/F54-settings-390.png`。文档站收录本文文字，截图在仓库/附属证据包查看。

**建议**：窄屏切为一个主工作面+明确的编辑/Chat/Bridge切换，不要让两个固定栏把center挤到0；补可见主区域最小尺寸、遮挡、点击命中和长内容回归；修tablist子角色时保留可达的关闭/焦点恢复。手机Arena MCP连接与本机工作台是不同入口，不能用前者的既有成功报告代签这次布局。状态：已复现，未修复。

### F54-08 · P2 · 机器指引仍诱导盲目复用错误hash，部分说明互相矛盾

- [resources.js第50行](../webagent-core/agent-host/src/mcp/resources.js#L50)仍发送`Retry using detail.retryHint / detail.currentHash`；新instructions与patch错误已明确要求停下、重读、协调内容，不能盲用错误hash重放。模型会同时看到两种指导；这条机器输出本轮未修。
- 请求分发详解的tools/list、截图别名/Capture、resources与GET主流程，与底部后来补充的权限章节不完全一致。本轮**直接改相应旧段落**，不再靠追加一段“最新说明”掩盖冲突。
- manager仍把`3fbe872`上传清单失败当最新基线，本轮改为已经逐job核验的`50c03be`，历史失败保留在阶段记录。
- 发行副本`webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md`两个`../agent-host/...`链接因目录层级不同而失效；规范扩展目录的原链接有效。不要手改副本破坏一致性测试，应从同步/发行文档重写策略解决。

本轮扫描未在非暂停Markdown/TXT发现实际U+FFFD损坏；测试里有故意匹配旧坏字符串的字面量，不当作编码缺陷。长工具输出显示异常字符不能直接替代磁盘字节证据。

## 3. 对用户五个ShunCode问题的明确回答

参考zip SHA-256：`4114d6e8d583cea5193b48d53e8137921803a681006914a943abf804aa847188`。检查路径、重复项、链接及解压预算后，仅在仓库外解出87文件/594816字节；没有安装或执行参考源码，没有把手写`.d.ts`当接口权威。

### 3.1 会话驱逐：值得借鉴“忙保护”，不整体换会话/身份体系

本项目**已有24h TTL和200条容量LRU**，不是只有TTL；缺少的是请求/流生命周期与淘汰器联动。F54-03给出了比TTL推测更直接的实证。参考`BridgeSessionRegistry.isActive/prune/makeRoom`的思路值得采用，但要在现有SID/principal/独立公开peer框架里实现计数、释放和全忙拒绝。

不能把公开peer变回SID，不能按任意clientInfo或不可信转发头认领任务，不能把同OAuth client的新token直接等价为旧在途请求的取消凭据。旧授权、撤销、所有权和审批语义要保留。

### 3.2 自适应并发：没有等价控制器，但当前绝不是不限流

当前已有：64在途MCP工具、8个后台命令、4个运行审批、20个待批/运行操作、40条保留审批记录、32条SSE、外部服务/响应/步骤等各自预算，以及Chat/Bridge跨模式互斥。它们不是排队信号量，更不是自适应控制器。

参考控制器每12次采样，默认30秒算慢；failure与slow数量相加达到窗口的1/3时减半，至少一半采样曾排队时加1。**失败和慢可来自同一调用而重复计入**；权限拒绝、用户拒批、hash冲突和合法长测试也不等于系统拥塞。没有当前负载的P50/P95、队列等待、资源占用和吞吐证据，不能宣称会更快。

更重要的是参考`Semaphore.release()`：先`current--`，然后无条件唤醒队首。例：active=4、有排队，limit从4降至1，每次释放又补到4，直到队列耗尽才下降。**这不只是“调低不抢占已有任务”的正常设计，而是持续排队时缩容不能生效的静态缺陷。** 未执行参考代码，不把推演称为实测。

建议现在不引入AIMD。若实测确需排队，先做有界、可取消、公平、释放幂等的固定限额队列；先修缩容逻辑，并为取消/结果查询预留独立控制容量，不能一排队就把停止入口堵住。

### 3.3 文件工具：同意不直接替换，但不能把现有hash保护当作没有缺口

保留当前dryRun、hash、真实路径策略、读回核验、编辑草稿/有限回退、跨文件检查点和本机审批。F54-01应在原实现中最小修复，而不是换一整套文件注册/patch工具让上述合同重新丢失。

参考文件输入验证、规范化diff等最多作为测试用例/局部设计线索。其JSON Schema子集、重建ESM连线、缺依赖/测试上下文，都需要独立验证；不能因“纯Node”就认定可直接安全移植。

### 3.4 重复头：有同类准入缺口，但实际表现不同

本项目不是数组直接调用字符串方法导致崩溃；实测为合并值未拒绝、initialize静默生成新会话。应修显式单值/重复头验证。不能把这一结果夸大为未认证访问或跨主体接管。

### 3.5 最终采用表

| 参考模块/路线 | 决定 | 理由 |
|---|---|---|
| 会话busy/stream计数与只驱逐空闲 | **优先借鉴思路** | 已有可复现的忙会话驱逐问题 |
| 整批ID原子claim/release | **优先借鉴思路** | 现有在途登记不保护批内冲突；须先做envelope/版本校验 |
| 固定信号量 | **条件采用，不直接拷贝** | 队列须有界、可取消、公平，且先修缩容；现有64限额不应被悄悄替换 |
| 自适应并发 | **暂缓** | 无真实收益证据，失败信号混杂，依赖的信号量有缺陷 |
| 事件缓冲/Last-Event-ID重放 | **暂缓，按需求单独设计** | 本机WS已有有界日志和状态快照恢复，不等于MCP重放；参考按全局数量而非字节/流/TTL保留，重放须再验证owner；不能重执行写工具 |
| 文件工具整体替换、MCP整体换SDK、分叉IDE/TS重写 | **不采用** | 风险面远大于本次收益，会破坏已有审批/审计/恢复/稳定Chat API路线 |
| 授权/支付 | **不设计** | 不在参考包和用户任务范围内 |

参考包无package.json、若干恢复来源/SDK/协议声明不能由README代替构建验证；本轮核对六个重点core模块及部分TS接线，不宣称审完87文件。README声称SDK2.0.0/协议2025-11-25，扩展层却还含2026-07-28现代无会话分流；版本/依赖兼容性不能由README代签。迁移会涉及现有owner设计，本轮不直接加入未验证协议或依赖。

## 4. 字体、排版与UI优化建议

这些是建议，未改CSS，不把审美偏好当成安全缺陷。

1. **先修可用性，再放大字号。** 优先F54-07的零宽/遮挡、原生流终态和危险操作结果；不要用`overflow:hidden`或强制缩字“消灭”溢出。
2. **建立少量字号与间距变量。** 经典工作台仍有大量11–13px控件/辅助字。建议正文/聊天从14px、辅助说明12px、代码13–14px起评估，中文行高约1.5；保留紧凑模式。权限、unknown和恢复风险说明不应降为难读脚注。42px欢迎标题不值得占用窄屏的主要可用面积。
3. **尊重宿主设置。** 原生Webview仍大量硬编码12px和深色；优先使用`--vscode-font-family`、`--vscode-font-size`及主题变量，并验浅色/高对比。不能把经典页面主题通过算作原生Webview通过。
4. **缩减并排工作面。** 常规宽屏允许编辑+聊天；窄屏用明确切换/抽屉。长模型名、长路径、中文说明、键盘焦点、IME组合键、较低窗口和200%缩放都要覆盖；本轮没有做用户Windows缩放验收。
5. **回归检查真实内容。** 除宽度/scrollWidth，还检查活动编辑区/输入区非零尺寸、无遮挡、按钮命中及切换后的草稿保留；用有代表性的长日志、工具失败、审批与多文件diff状态做截图比较。
6. **保持已有保护。** 不因布局简化取消hash预览、明确确认、unknown状态、停止按钮或内置/真实模型区分；不照搬旧IDE依赖proposed API的卡片。

## 5. 其它风险与工程化取舍

| 项目 | 本轮证据/判断 | 建议 |
|---|---|---|
| readCache长期内存/IO | remember405路径后，磁盘Map已淘汰首项，进程session Map仍保留；详解已准确承认此差别 | 作为有界缓存与同步IO优化项，不冒充新发现的文档错误；须保留版本/读后写保护，不简单删Map |
| 上报/GitHub出站 | 静态可见tracker和auth/github未统一使用已有有界/可取消fetch辅助；不是已复现凭据泄露 | 增加deadline、响应预算、单飞/收尾和断连语义，避免后台无限等候/堆叠 |
| WebSocket与界面历史 | 服务端有500日志/32 WS等上限，但ws.send未按bufferedAmount背压；聊天DOM/history等仍有长期增长路径 | 测慢消费者和长会话；批量刷新/窗口化前先定义保留/丢失语义。未做OOM压测 |
| Windows截图目标 | snap.ps1按通配符标题取第一项，act/type使用唯一字面子串匹配 | 对齐目标身份；静态风险，未在Windows实际点按/截图，不把它记作实机缺陷复现 |
| Node策略 | 截至本轮日期，[Node官方发布表](https://nodejs.org/en/about/previous-releases)列18/20为EOL，22/24为LTS | 区分历史兼容矩阵与推荐生产运行版本；建议主支持22/24，旧矩阵是否保留由兼容目标决定，不借审计顺手删测试 |
| lint | 临时检查器仅选规则，未加入项目依赖 | 先采用低噪声正确性规则；不要为73处Promise返回值风格提示做全仓格式化 |
| 生成物与文档 | 库存/hash/AST很有用，但旧错误正文与追加章节可并存；content.js体量大 | 原地修契约，生成器维护导航；不手改生成物，也不靠新增“审完”标签提高完成率 |
| Windows22旧超时 | 新基线九项CI成功，但没有得到旧超时根因证据 | R4继续独立保留，不放宽时限、不删断言、不重跑到绿后宣称已修 |

## 6. 复现产物、修复门槛与未完成范围

本轮独立实验位于仓库外`/home/user/audit-2026-09-20/`，可随附属`F54-audit-evidence.zip`检查：

- `full-host-repro.cjs/.json`：完整双端口主机、临时有效认证、实际写盘、资源与权限对照；只操作临时工作区，结束清理。
- `mcp-repro.cjs/.json`：真实MCP router、重复原始头、可控在途handler与内部容量压力、1000项batch。
- `file-resource-repro.cjs/.json`：真实文件工具、两个Map保留差异、资源投影。
- `native-stream-repro.cjs/.json`：真实原生扩展函数+VS Code依赖替身+真实回环HTTP坏流。
- `ui-audit.cjs`与`ui/results.json`：9个状态的矩形/字号/axe结果与截图；浏览器/字体约束见第1节。
- `baseline-tests.log`、`browser-baseline.log`、静态检查JSON与`ci-summary.json`：实际基线输出。辅助夹具初版的缺VS Code替身/漏工作区绑定属于夹具错误，已修正后重跑，不算产品红测。

**实验脚本退出0只表示观察运行完成，不表示观察到的产品行为正确。** 正式修复仍须把相应正确合同写成会失败的回归，再在最小变更后转绿；本轮未用这些观察脚本替代主测试或关闭问题。

下一闭环应按阶段10的R2/R3推进：文件消失/hash与创建补丁；RPC准入和busy会话/取消；资源caller/ACL一致性；原生可靠终态；窄屏与ARIA。每包必须守住认证、精确凭据取消、审批/unknown/不重放、文件真实路径和现有恢复合同，并更新相邻说明、生成物、完整测试及真实浏览器。不能一次整体搬入参考包再用绿灯兜底。

本轮**未完成**：全仓每句文档/每个实现分支的语义认证、真实公网/第三方模型与完整OAuth客户端互操作、负载/公平性压测、24h TTL和长SSE实跑、Windows/Conda/真实IDE/高DPI/读屏器验收、历史Windows超时根因、暂停探针专项。正式清单保持逐项状态，不增加“已逐句”项；新增本报告也不自授整篇通过。
