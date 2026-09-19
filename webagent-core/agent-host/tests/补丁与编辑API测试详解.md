# 补丁冲突、搜索上限与编辑器HTTP存储测试

两文件都使用真实临时磁盘；不读写用户仓库文件。原子替换失败等补充证据见[存储完整性与预算测试](存储完整性与预算测试详解.md)。

## patchEngine.test.js

[源码](patchEngine.test.js)异步**main**按链构造fixture，无额外测试框架；每个try/catch仅把期望错误转布尔，紧接assert，防没有抛错也被当成功。

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

computeHash导入但本文件没有直接调用，版本来自readFile；样例正文里的add不是测试辅助函数，也未执行该JS计算结果。成功rm tmp，main.catch打印exit1，无finally；并发只测一个Node进程内锁，不能外推跨进程协同或断电一致性。

## apiFiles.test.js

[源码](apiFiles.test.js)的**request(server,method,urlPath,body)**真实本机HTTP，按JSON字节设长度，data累计、end解析（坏JSON为null）、error reject。异步**main**搭Express JSON/API路由，随机端口，workspace指tmp。

1. PUT notes.md：200/success/hash，磁盘正文准确且无.tmp.残留。
2. PUT .env：≥400且敏感/ACCESS_DENIED等错误，文件不存在；PUT ../outside.txt：≥400/outside。
3. PUT已有notes携deadbeef：409/STALE_FILE，原正文保持，防UI冲突静默覆盖。
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
