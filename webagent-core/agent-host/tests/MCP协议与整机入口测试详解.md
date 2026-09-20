# MCP调度与真实Node入口冒烟

“真实入口”指本机Node子进程和HTTP，不是Windows安装器、浏览器、手机或公网隧道的交互验收。

## mcpProtocol.test.js

[源码](mcpProtocol.test.js)临时workspace，**req(method,params,extra={})**构造ip、JSON-RPC id1/body，再展开extra覆盖字段。异步**main**先运行httpAdmission真实认证HTTP回归，再保留直接handleRpc的工具/展示合同测试；后者本身不经过认证中间件。

| 断言组 | fixture、实际调用及结果 |
|---|---|
| initialize/ping/resources | instructions含Bridge/资源URI，capabilities有resources/prompts，serverInfo有name；ping ok，资源列表含protocol/memory/profile/clients，读取protocol提Streamable HTTP |
| 连接与页面规则 | CONNECT_LINE/PAGE_RULES_LEAD精确文案，getBootstrapPrompt拼URL+空行+提示；getPageRulesPrompt前缀及Bridge说明 |
| 工具/预算 | 公开30项含核心读写/记忆/任务/命令工具，无lsp/隐藏input，includeHidden才有input；clipJson对20000字符stdout裁剪 |
| 本地权限与错误 | rm、reset --hard、push、下载pipe shell均要求confirm_dangerous；unknown工具为ProtocolError E_UNKNOWN_CMD且提示Available |
| 远程限制 | 即使确认危险命令仍E_FORBIDDEN，send_command_input也拒；cat/path别名返回正文和hash；unknown RPC转isError，Ask apply_patch拒只读锁 |
| 图片 | 写只有PNG头的shot.png，真实run_command echo路径后文本content仍第一，附image/png裸base64；echo无路径不附图。不是有效截图展示/视觉理解测试 |
| 日志 | 远程ping成功；get_logs数组含ping结束摘要，没有args/chunk/result/patch正文 |
| 记忆 | remember一句→recall含句子无Markdown二级标题；再加五条，limit3返回count3/truncated且三条列表 |
| prompts/resources客户端 | connect prompt有连接短语，clients资源有非Plus专用说明 |
| listClients目录 | 本地Chat无需隧道，Arena支持MCP且rulesText空；DeepSeek/Chat Plus扩展HTTP用secret URL和需手贴规则，扩展ID/repo及安装提示正确；普通ChatGPT目录项标不支持，连接器项用canonical /mcp并含开发者模式/新建插件步骤 |

客户端字段只是仓库目录契约，不是对外部产品当前权限的在线认证。数组some/map/find与匿名filter回调在这些组中分别选择目标记录、投影name/URI、统计匹配数，不触发远程操作。

局部**fakeRes()**提供headers/statusCode/body；**setHeader(k,v)**小写记键，**status/json**记录并链式返回，**end()**仅返回this，**write()**空（本组不验证SSE字节）。**post(body)**用无header/params的请求直接handlePost：空batch→400/-32600；ping+tools/list batch保两id与对应result；notification+ping只回ping；纯notification→202；id0必须返回0而非误作通知。成功与catch均rm tmp，catch exit1；session状态由单文件进程结束隔离。

## httpSmoke.test.js

[源码](httpSmoke.test.js)在两个随机范围端口启动真实src/index.js。**request(method,url,body,extraHeaders)**解析URL、JSON序列化、补Content-Type/长度，data收集、end同时给raw/json（坏JSON为null），error拒。**waitHealth(url,timeoutMs)**内部**tick**每120ms重试HTTP，响应resume释放流，超12秒拒。**stop(proc)**Windows taskkill树、其他SIGTERM；已killed跳过，**并未等待确切exit证明**。

**main**spawn process.execPath并传tmp/两port，stdout/stderr的data回调累积log；exit回调目前条件体仅注释，没有检测提前退出，真正失败靠health或请求错误。try内按如下链验证：

1. health 200/ok/Web Agent；首页包含产品、API、picker、环境/技术栈/技能、连接/统计/授权、隧道、模型/Plan/规则/think等控件与限制说明；禁止旧授权/模式限制文案。app.js/state.js真能HTTP读取，模块入口、WS重连代码与状态ID存在。**均是源字符串，不是点击控件**。
2. MCP端口本机/api/status含secret、连接prompt、35个简化tools（无inputSchema）、客户端目录及规则、canonical /mcp；默认bridge本机demo登录，Plan inactive/maxBranches4。这里secret只应给本机管理面。
3. 错secret和无Bearer canonical /mcp initialize 401；正确secret initialize有instructions，tools/list30项、discovery有授权端点，ping工具成功。
4. status recentLogs存在ping，每个payload键只能tool/success/durationMs；get_logs不含args/chunk/patch；usage.json落盘有调用数。空bridge token400，reset-round后session客户端0但累计usage不能减少。
5. 模拟Cloudflare headers访问status/chat/pty/tool均404且status不泄secret，公网Host也404；同样headers带secret访问MCP initialize仍200。恶意Origin管理API404、本机Origin200；工作台端口的恶意reset-round也404。
6. PTY hello缺identity为400/E_BAD_API_REQUEST且错workspace仍409；正确clientId/workspace200，带同identity查询jobs数组。没有执行PTY任务；完整状态链及未知包装零副作用另见apiFiles。
7. OPTIONS恶意Origin没有allow-origin，DeepSeek/扩展Origin回精确allow-origin；恶意Origin MCP执行请求403无命令回显，受信Origin ping正常。MCP端口根页不能含工作台picker，防管理UI暴露。
8. 工作台/api/chat Ask以真实builtin处理临时空工作区，按NDJSON逐行JSON.parse、非法行null并filter掉，要求list_directory tool/message/done。局部**ndjson(raw)**抽出同一解析逻辑供Plan：起始一branch无consensus，追加第二branch可merge但仍无consensus，显式merge才有simulated:true且agreementRate null。不是实际多模型共识。

成功log加finished；catch先打印server log再throw；finally stop、等300ms、rm tmp，最外catch exit1。随机范围端口可能碰撞；没有完整HTTP请求deadline（health循环有总时间但单个挂起请求未单设超时），也没有把每个NDJSON非法行当失败。不能外推页面视觉正确/真实模型/隧道连通。

## skipWorkbench.test.js

[源码](skipWorkbench.test.js)的**get(url)**收真实HTTP状态/raw；**waitOk(url,ms)**内部**tick**每120ms重试直到200或10秒期限，错误同样重试。**main**spawn Node入口，传临时workspace、随机MCP端口、固定工作台19999和WEBAGENT_SKIP_WORKBENCH=1。

等MCP health正常再GET断言200；请求19999只要有HTTP响应就reject，仅连接error才resolve，证明本fixture没有启动UI端口。固定端口若已被其他程序占用会误报失败；连接error也不是严格端口所有权探针。finally Windows taskkill或SIGTERM、等200ms、rm tmp；catch exit1。子进程stdout/stderr虽pipe但未消费，长日志可能影响测试；这里启动日志短。它证明跳过旧工作台，不证明VS Code桌面插件或code-server窗口已可交互。

## 验证

分别filter mcpProtocol/httpSmoke/skipWorkbench，或`npm test --prefix webagent-core/agent-host`。Windows/Conda/浏览器/手机人工执行项仍以安装验收清单为准，不能以这些文件命名替代实测。

httpSmoke增加真实HTTP早期边界：未认证MCP提交JSON字符串（严格对象解析本会拒绝）仍先401，证明认证先于解析；OAuth注册70KiB字段先413而非入库/一般字段校验。现有合法MCP、OAuth、跨站与本机请求保持回归。

## 整机Bridge活动接口回归补充
httpSmoke在真实认证MCP ping完成后GET活动快照，确认calls非零、包含成功ping，且摘要无args/result。重复读取deepEqual不重计；带隧道头读取返回404；本地reset-round之后stats归零且logs为空。不要求打开浏览器才能记录。

截图回传的echo夹具断言仍要求isError=false；shotDetail只在失败时提供该合成调用首个text结果最多1600字符，并替换URL和长十六进制ID，避免只看到true!==false无法定位。不增加超时、不自动重跑命令、不放宽结果断言。

## operatorQueueCapacity.test.js：审批历史容量与窗口内去重

[源码](operatorQueueCapacity.test.js)的`main`替换Date.now为固定时钟，登记无副作用的capacity-fixture并顺序提交/批准40个不同requestKey。填满后第一条终态仍必须可读取原值，同owner重用第一条key必须返回同requestId且执行计数不增加；第41个新key必须明确因历史容量拒绝，不能通过提前删第一条伪装可用。时钟前进15分钟加1毫秒后，惰性清理允许新请求并只新增一次执行。finally恢复Date.now；每个测试文件独立进程使内部Map不会继承其它夹具。它证明单进程完整窗口/40条上限，不是重启后持久exactly-once或多进程共享去重。

## requestLifecycle.test.js：生命周期单元回归
main创建短期限与容量实例，owner分别改变会话或凭据；wait订阅currentSignal的abort，避免用sleep猜测是否取消。ID=0与字符串0不得混同，重复ID拒绝，错误owner取消无影响。正确取消后await完成并复用ID，确认没有取消墓碑；EventEmitter模拟close，断连和异常后监听数归零。两个在途占满后第三个拒绝，取消释放再继续。10ms期限配1s引用watchdog防止unref导致测试提前退出，checkCancelled必须抛E_CANCELLED。最后分别枚举失败/unknown与已受理/available:false正反例；catch仅设置进程失败码。

## mcpCancellation.test.js：真实HTTP边界
main在临时工作区挂真实MCP与API router，rpc使用fetch编码JSON和凭据；init建立两个同名但不同ID会话。唯一受控替身是workspace_info的handler：普通调用返回结果式失败，wait调用订阅当前请求信号并通过started通知夹具已进入工具。它不模拟Windows进程，也不更改工具权限。

新增先从真实peers_list枚举公开key并当作会话头发送取消，全部404且原信号不触发；公开标签不再充当私有会话。cancel通知从另一会话返回202但不触发信号；无认证请求401；同owner重复活动ID返回协议错误。正确取消使原调用保留ID=0、isError和cancelled trace；完成后同ID可以重用。 局部**mint()**为同一个已注册OAuth client分别配对换取两个同时有效access；rpc的auth参数兼容布尔值与显式token。用第一token初始化并开始等待，第二token使用同SID发送取消仍202但不取消，第一token才可取消。验证session按client稳定绑定不削弱原调用按具体凭据隔离；不是令牌刷新后自动停止的保证。observe回调收集tool_call_end，断言后移除监听；直接REST调用要保留HTTP200和内部错误细节，但success及tool_call_end都为false。finally恢复原handler、关闭连接/服务器并删除临时工作区；测试并不开放产品本机控制面，真实回环/Origin保护另有专门测试。

F27-02回归：mcpProtocol/httpSmoke断言DeepSeek/Chat Plus为unverified，三项描述字段严格null，移除固定商店ID/构建命令；保留extension-http候选的地址和规则输出，规则不授权或建连。MCP clients资源必须显示Plus/tunnel unknown而非no。原把固定商店ID当产品合同的断言已替换为未知状态与安全前置条件，不代表第三方实测。

F28-01协议/HTTP断言通用和OAuth连接器候选的未知状态、规范/mcp地址、S256 PKCE前置、无固定/plugins地址，替换旧开发者菜单断言；普通粘贴卡prompt为空。后端OAuth既有公有/秘密客户端回归继续保留，未放宽认证。

### F54修复第一批新增回归

`mcpProtocol.main`中的`postWithSession(sessionHeader)`用fakeRes验证合并串/数组/空/非ASCII/超长值400及单未知ID404。`mcpCancellation.main`中的`rawSession(method,value)`用真实HTTP发送重复原始头，验证POST/GET/DELETE拒绝且会话数不变；真实挂起工具handler加内部容量注入验证取消送达、POST释放；真实SSE打开/关闭验证pin释放。全200 busy由内部API构造，initialize/GET SSE通过真实HTTP验证503；不是200并发HTTP可达或24小时压测证明。

### F54第二批RPC准入回归

`httpAdmission()`启动真实Express/MCP router与临时工作区，真实文件工具、不替换handler。内部`request(body,options)`使用node:http发送可重复原始版本头、可选SID/JSON或SSE Accept，收HTTP/raw/JSON；Express严格JSON解析可能在路由前对primitive返回400 HTML，夹具保留状态而不强制解析为JSON。`write(id)`/`ping(id)`构造消息；`rejectBeforeEffects`要求400、会话/peer快照不变（去掉纯时间派生ageMs/alive）、没有tool_call_start、目标文件不存在且不返回新SID。`initialize(version)`断言实际握手及返回版本。

覆盖非法ID/params/顶层字段/初始化元数据、无ID工具调用、有ID通知、非法取消目标；先写后坏成员/重复ID的整份批次必须零写。版本空值/重复/不支持在POST/GET/DELETE拒绝；协商2025-06-18后省略头仍拒绝batch，不能降级重握手，错误DELETE不删会话。旧版合法1–64项、0与字符串0、通知202、合法单写、单SSE响应、未知提案fallback与正常DELETE204/后续404有正例。requestLifecycle另锁直接run的非法ID不执行fn；mcpCancellation只将通知接受状态从204纠正202，原同owner/精确凭据/跨会话和取消信号断言均保留。不是全部客户端互操作认证，不测试持久exactly-once或跨文件批事务。

httpSmoke第二批还通过真实src/index.js验证零写与正例：`admissionWrite(id)`构造临时write_file请求，协商现代会话后拒绝null/对象/无ID、现代batch、旧版重复ID及坏版本；合法ID必须真的写成同一文件，随后fixture删除。避免仅由权限关闭导致“零写”假阳性。

F54第三批：httpSmoke继续通过真实src/index.js、合法现代会话调用apply_patch：显式hash但不存在、非空SEARCH和多块新建，在dryRun与正式执行均HTTP200/result.isError且错误码正确、父目录不创建；单空块新建预览零写、提交内容精确为created。区分HTTP成功与工具失败，不改审批或权限。

F54第四批：httpSmoke的`resourceRpc(method,params,headers)`复用真实src/index.js会话发资源/工具请求。先经带workspaceRoot/hostInstanceId的本机执行控制切Chat，用本机tool/call上报Local标记，再切回Bridge；两个远端SID分别上报并读取自己资源，不得串Local或另一peer。带绑定与revision的Read-only策略更新必须status200/success=true，capabilities资源工具名逐项等于tools/list且无write_file；实际write_file仍isError且无文件。最后按新revision恢复原权限并核对成功，避免策略修改失败或未恢复造成假阳性。

F54交叉复审：main检查initialize.instructions与getToolList的apply_patch描述明确existing file only，并提示保留expectedHash/未给hash的缺失目标走创建合同。旧文案先红测，修复仅收窄机器说明，不将字符串断言当作跨进程删除保护；实际缺失目标行为仍由patchEngine/httpSmoke回归证明。
