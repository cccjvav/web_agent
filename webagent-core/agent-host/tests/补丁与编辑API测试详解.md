# 补丁冲突、搜索上限与编辑器HTTP存储测试

两文件都使用真实临时磁盘；不读写用户仓库文件。原子替换失败等补充证据见[存储完整性与预算测试](存储完整性与预算测试详解.md)。

## patchEngine.test.js

[源码](patchEngine.test.js)异步**main**先运行missingTargetSafety，再按链构造fixture，无额外测试框架；每个try/catch仅把期望错误转布尔，紧接assert，防没有抛错也被当成功。

| 链与输入 | 调用/结果/不变量 |
|---|---|
| sample.js含add | readFile返回hash和正文，SEARCH/REPLACE按hash改为Number(a)+Number(b) |
| 携旧read.hash反改 | STALE_FILE；随后省expectedHash改为减法可复用最近patched hash |
| 从未读的orphan.js | HASH_REQUIRED并detail.currentHash；提示不等于自动解锁覆盖 |
| 正确hash但SEARCH不存在 | Patch conflict |
| grep/find | 普通function add可找，(a+)+ regex拒ReDoS；五文件max3→三项truncated，恰三文件max3→非truncated |
| 2MiB大文件/needle/含NUL二进制 | needle仍找到，skippedLarge≥1，二进制跳过或零匹配 |
| 新文件unified diff | 拒且不创建；空SEARCH的REPLACE、纯正文可新建并标isNewFile |
| CRLF win.js | LF写法SEARCH能匹配，结果精确等于全CRLF预期，不只检查含一个CRLF |
| dup.js有两处相同SEARCH | 默认拒matched 2 times且原文不变，occurrence:2只改第二处 |
| race.js同hash两Promise并发补丁 | allSettled筛选恰一success、一STALE_FILE，结果只能2或3，不能混合 |
| V4A *** Begin Patch | looksLikeV4A识别；已有文件E_BAD_ARGS/V4A且retryHint提SEARCH，原文保持；新文件也拒且不存在 |

computeHash用于构造明确版本前提及预览/落盘hash对照，readFile提供真实读取版本；样例正文里的add不是测试辅助函数，也未执行该JS计算结果。成功和main.catch均清理tmp；并发只测一个Node进程内锁，不能外推跨进程协同或断电一致性。

**unmarkedPatchOnExistingFileRejected()**（F63）钉住apply_patch对已有文件的裸正文拒绝：不带SEARCH/REPLACE/unified标记的正文在显式hash、缓存hash与dryRun三种入口均E_BAD_ARGS，message/detail.retryHint指向SEARCH/REPLACE与write_file；事件零广播、rememberHash不更新，且新建文件的裸正文仍合法（合同只收紧已有文件）。

**missingTargetSafety()**用真实临时磁盘、file_patched的observe监听和readCache做第三批回归：不存在目标+显式旧hash（包括空文件hash）在dryRun/正式执行均E_STALE_FILE；非空SEARCH E_CONFLICT，新建多块E_BAD_ARGS。所有拒绝不能创建父目录、发布成功事件或新hash。读取后外部unlink仍拒绝旧hash且保持缓存旧值。合法正文/单空块预览不创建目录/更新缓存，写入hash与预览一致、只发一次成功事件；已有文件的两个串联块必须完整应用。finally移除事件监听。

## apiFiles.test.js

[源码](apiFiles.test.js)的**request(server,method,urlPath,body)**真实本机HTTP，按JSON字节设长度，data累计、end解析（坏JSON为null）、error reject。异步**main**搭Express JSON/API路由，随机端口，workspace指tmp。

1. PUT notes.md携`createOnly:true`：200/success/hash，磁盘正文准确且无.tmp.残留；省略createOnly且无expectedHash的含糊新建400且零文件。
2. PUT .env与../outside.txt也显式走createOnly，仍分别因敏感路径/越界≥400且不创建，证明包装门禁没有代替路径安全。
3. PUT已有notes携错误但格式有效的64位hash：409/STALE_FILE，原正文保持，防UI冲突静默覆盖。
4. POST skills demo-skill：200且真实SKILL.md存在；GET列表有demo、相对skillFile与绝对skillFileAbs。
5. GET notes：原文和hash返回，供下一次编辑版本控制。
6. POST model完整元数据和假apiKey，GET status：模型存在，group/contextSize/caps/pricing保留，hasKey真但无apiKey字段。测试仅保存/脱敏，不访问模型baseUrl。

finally关server、rm tmp；catch exit1。这里直挂router，不是完整index的Origin/Host保护测试，也不运行浏览器编辑器；并发保存与dirty保留另见editorRuntime。

## 验证

分别filter patchEngine/apiFiles，或`npm test --prefix webagent-core/agent-host`。CRLF fixture能在Linux执行，不代表真实Windows权限、杀毒软件占用或编辑器焦点验收。

2026-09-14负例补充：新增截断补丁、完整块加截断尾块、孤立标记，分别对已有/新文件、dryRun真/假断言E_BAD_ARGS且原文件不变/新文件不存在。

apiFiles新增POST /files/preview真实HTTP夹具：成功返回diff和基线hash且磁盘不变；缺hash、越界/敏感路径拒绝；旧hash409；文本64KiB/2000行预算拒绝。预览后模拟另一个写入者，再PUT旧hash必须409且保留别人内容。临时夹具恢复基线后继续原测试；不是自动产品回滚。

apiFiles还验证本机保存undo句柄、预览无写入、错绑定/非布尔确认拒绝、磁盘变化拒绝覆盖、成功恢复原hash、同记录不重复回退。直接模块夹具检查64KiB/无变化/敏感路径不登记、16项容量和15分钟TTL；恢复测试文件是测试布置，不是产品自动回滚。

apiFiles以真实本地HTTP测试Skill新建：规范化后重名返回400且保留原文；两个同名并发请求只有一个200、另一400，磁盘保留成功请求正文。另用一次性file_written监听在写入与中央read-back之间移除目标，真实callTool正常return但verification为unknown；路由必须返回409/success:false/E_VERIFY_UNKNOWN并保留核验状态，不能宣称Skill已创建。这是确定性进程内竞争fixture，不代表已穷尽杀毒软件或外部OS写进程。

经典PUT `/files/content`另以两个createOnly请求并发创建同一路径，断言一个200、一个409/E_FILE_EXISTS，磁盘正文只能等于赢家请求，不能被输家覆盖；这是端到端路由→write_file→exclusive发布回归。Node内路径锁会串行同进程请求，exclusive原语还防锁外目标抢占检查与发布之间的位置，但不把测试外推为跨文件事务、网络幂等或所有文件系统的实机兼容证明。

apiFiles的PUT /customizations真实HTTP回归：先存shell+notes，再只改notes，shell保留；instructions对象返回400/success:false/E_BAD_ARGS，配置JSON逐字节不变。不由此认证完整浏览器设置交互或四文件事务。

GET /customizations坏JSON夹具返回500/E_CUSTOM_CORRUPT JSON，磁盘坏原文保持，再由测试显式恢复基线；不是产品自动修复。

### 第32组Provider追加与断连

apiFiles用真实本地HTTP验证addProvider追加两模型，旧模型/真实fixture Key、Bridge与activeModelId保留；标点不同ID不碰撞，响应不含Key。重复端点模型（包括旧版自定义ID）409、错误/超量/重复输入及与整表字段混用400，配置字节不变；两端点并发追加都保留。单host同步保存，不是跨进程CAS。

发现路由fixture暂时替换global.fetch以捕获上游signal，实际发本机HTTP请求、等待上游开始后destroy客户端；2000ms watchdog内必须收到abort。finally清timer并恢复fetch。不是用临时API直接挂载证明完整Origin/Host认证，也不调用真实提供商。

第35组apiFiles检查点创建续测：提交./checkpoint-http.txt别名，返回规范路径checkpoint-http.txt、ready与result:null，原文件字节不变；已有文件加缺失文件的创建400后，GET元数据完整等于失败前，不留半条记录。后续原有预览/严格确认/真实恢复断言保留；这证明既有后端行为，不是本批新加幂等接口。

第47组模型设置API续测：先GET带`••••`的旧整表再POST，磁盘fixture Key必须仍为原值；同连接身份的旧客户端往返保持兼容。合法multiModel五字段保存后响应含实际modelCount，空/数组/未知顶层、空/未知/错类型/越界多模型、未知active/merge引用、空models、models+model混用及坏caps均400/E_BAD_MODEL_SETTINGS，逐次比较配置完整字节不变，错误正文不回显fixture Key。单model用省略Key或掩码把原id改到另一baseUrl也必须零写，防旧秘密被浅合并转绑；显式replacement Key则允许改连接并可显式改回；已有目录再通过addProvider追加100项也因整表超过100而400/零写，不能分批绕过预算。未请求真实模型端点，不认证API Key有效性或跨进程CAS。

第49组模型/Provider固定schema续测：先直接在fixture旧模型写入`authorization`、`internalToken`及嵌套`metadata`，并给caps/mergeModel等已知槽位写错类型嵌套秘密、给multiModel写未知凭据字段；GET `/models`与`/status`均不得发布注入秘密，models只返回固定且类型有效的模型/多模型字段、Key仍脱敏；把该公开快照合法往返后，磁盘Key保持且历史未知字段被清除。POST单条模型带未知字段400/E_BAD_MODEL_SETTINGS且磁盘逐字节不变。`/providers/probe`带未知包装字段时用fetch计数器证明在触网前400/E_BAD_PROVIDER；addProvider包装或目录项带未知字段同样400/E_BAD_PROVIDER、零写，所有错误正文均不含fixture Key。该测试证明的是本机路由的投影/校验顺序，不检查真实远端响应、浏览器网络面板或恶意进程直接改配置。

第51组严格本机包装续测在任何文件夹具写入前先发`/tool/call`未知顶层字段，要求400/E_BAD_API_REQUEST且目标文件不存在；同样拒绝Chat、consensus与tasks/reset未知包装及工具arguments字符串、Chat system历史。execution-control的合法切换字段夹未知键不得改变mode；构造真实待批operation后，未知approve不得运行handler，未知cancel不得改waiting状态，随后合法操作各只生效一次。检查点未知创建不得分配记录，未知restore不得改磁盘/消费previewId，未知remove不得删记录；随后合法一次恢复/移除仍成功。Skill未知POST不得创建目录，目录和load未知query均400。

普通文件链覆盖`createOnly:'true'`不得覆盖现有notes、未知PUT不得创建、无createOnly且无hash的含糊写拒绝、preview未知字段拒绝、GET content未知query拒绝。回退记录上用完整合法确认再加unknown字段，要求400且磁盘仍是undo target，之后记录仍可经历漂移拒绝和一次成功恢复，证明错误包装未消费授权。合法httpSmoke、并发createOnly和旧hash流程继续通过；这是本机临时HTTP/内存/磁盘证据，不是跨进程或浏览器攻击验收。

第52组apiFiles管理包装续测先直接创建一条PTY任务：hello未知字段必须400且客户端数不变；合法hello/jobs后，report未知字段必须400且任务仍pending，随后claimed→accepted，矛盾cancelled/status done须400且仍running，再经progress→done完整链保留输出。connection-check创建未知包装以方法计数证明不分配记录，GET未知query不读取，DELETE未知body不清空，合法清空仍生效。external HTTP登记未知/未确认公网/残缺绑定均在add方法计数前400，合法本机包装只调用一次；stdio preview/start未知字段的服务方法计数保持零，合法start调用一次；DELETE未知query不调用remove，合法删除调用一次。测试finally恢复所有替换方法并清理PTY/连接记录；这证明路由调用顺序与单进程状态，不替代真实VS Code shell、外部服务、stdio预览消费或操作系统进程树验收。

第53组先逐个以真实HTTP向diagnostics、bridge/activity、status、models、logs、profile/detect、customizations附加未知query，均须400/E_BAD_API_REQUEST；诊断合法响应还核对顶层identity/probe/capabilities、identity六字段及能力id/status/reason固定形状。Bridge reset-round附未知query须E_BAD_BRIDGE_REQUEST且resetAt不变；tool/call附未知query不得创建目标文件。models、provider探测、customizations的未知query分别证明零保存、零fetch、零写。

同组临时替换externalClient.request与workflows.previewRequest/request作服务调用计数：query或body未知字段必须在外部查询、预览和审批分配前400且计数为零，固定合法包装各调用一次；finally恢复原方法。MCP session夹具向touch塞入未知记录字段和clientInfo凭据/嵌套对象，先核对allSessions只给固定七字段并证明修改返回副本不会回写内部记录，再要求GET status的latest/sessions保持同一形状、clientInfo只含name/title/version，所有注入/副本变异秘密不得出现在整份响应，随后reset清夹具。

customizations链还验证空对象/数组、未知顶层、environment未知键及agent未知键均400且配置逐字节不变；直接写入历史JSON的三层未知秘密后，GET只返回defaults顶层、固定environment和agent字段，秘密不发布，再由测试显式恢复基线。该证据证明路由顺序、固定公开投影及单进程临时磁盘不变量，不证明已登记URL/命令可信、四文件事务、真实外部MCP执行或公网攻击面。

## diffBudget.test.js

F62独立复审新增，只有一个**run** helper负责建临时工作区、跑断言、清理。

前半段针对`utils/diff.js`：小差异照常渲染，补丁头仍是`--- a/<path>`/`+++ b/<path>`加`@@`hunk，增删计数与旧实现一致，相同输入给出零增零删而不是报错。随后构造8000行的全文替换，要求在声明的预算附近被拒并抛`E_DIFF_BUDGET`，而不是长时间占住事件循环；错误正文不回显文件内容。断言只检查"在预算的数倍之内返回"，不宣称某个具体行数一定算得完，也不是性能基准。

后半段是写入安全：对已有文件提交一个渲染不出来的补丁，必须失败且目标文件逐字节不变，`dryRun`走同一条预算并同样零写；紧接着一个正常的SEARCH/REPLACE补丁仍能成功，证明拒绝没有污染后续状态。补丁引擎在新建与改写两条路径上都先渲染再落盘，所以预算拒绝始终对应零次写入。

同一文件还覆盖admin-host的统计库，因为它和补丁引擎共享"坏状态不许被覆盖"这条口径：缺文件或零字节视为合法空库；截断JSON、顶层是对象、顶层是标量、二进制噪声一律视为损坏，`loadReports`与`ingest`都抛`E_STORE_CORRUPT`并保留原字节；发布走临时文件加rename且不留残留。它证明的是本程序不会覆盖损坏数据，不能恢复已损坏的内容，也管不住别的进程继续写这个文件。
