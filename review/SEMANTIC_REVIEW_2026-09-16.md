# 文档语义审查台账与剩余施工

## 当前状态

第54组F54独立复审证据已落档；以下首轮证据属于修复前基线：[报告](INDEPENDENT_AUDIT_2026-09-20.md)。2026-09-20从指定01a0b053来源fetch，固定会话分支与来源均为`50c03bedc97f9eaaf1c875f4767c6e9bb5278d56`；[CI35470787917](https://github.com/cccjvav/web_agent/actions/runs/35470787917)九job逐项success，已取代3fbe872新TXT漏登记的失败基线，历史失败不删。本轮重读manager/review但不沿用旧结论：真实文件/HTTP/完整主机/原生函数/浏览器另复现patch创建保护、RPC准入/批内ID、busy会话丢失取消、资源归属/目录ACL、原生坏流假完成与窄屏/ARIA缺陷；没有证明未认证写入，禁止Edit的实际写调用仍被拒绝。首轮当时所有新增缺陷未修，观察夹具不是正式回归。当前第一批已实施会话pin/全忙503、完成后空闲TTL及双向SID校验，并补正式回归；第二批现补RPC整份准入、版本协商绑定、旧版64项与批内ID预检、通知202并有真实HTTP零写回归；第三批现修缺失目标携hash的拒绝和新建单空块合同，并补dryRun/真实HTTP零写回归；第四批现补资源可信caller/目录ACL与错误hash指引，原生与UI仍待修，门禁看阶段54修复续记。

本轮基线本地84/84、既有Chromium套件通过，文档249/28/110且updated=0、生产audit 0漏洞、非暂停219项语法/JSON/Shell和calculator6/6；追加9种UI状态、独立静态/链接扫描与受控负例，边界见报告。只修改报告、管理、对应旧说明/生成物，正式清单201项：已逐句8、局部56、待79，其余不变；新增报告不自授通过。本轮修改后的门禁/推送以阶段54组续记为准。ShunCode仅仓库外安全解包/阅读，未安装/执行，不授信手写类型；优先借鉴busy pin/整批ID预检，暂不采用自适应并发/重放，保留文件/审批栈。探针原分工经用户再次确认保持暂停；R2/R3与全仓未审、Windows/真实IDE验收及旧超时仍未闭环。

第53组F53：继续非探针query/只读投影/external-workflow接线并交叉R2。真实HTTP红测证明diagnostics、activity、status、models、logs、profile与customizations忽略未知query，Bridge reset-round和tool/call仍会产生状态/调度副作用；现apiRequestBody及bridgeRequestBody统一先拒绝query，原始body路由显式门禁，逐路由静态核对确认除明确暂停的`/probe/*`外全部当前REST入口均固定query。external/request与两个workflow入口改为固定body的显式异步路由，错误包装在服务查询/预览/审批分配前400。MCP peer记录入库及status快照只保留固定七字段，clientInfo只留有界name/title/version；diagnostics固定三层公开形状。customizations完整固定defaults顶层、嵌套及六类≤100项列表，空/未知/错类型写入零改动，历史未知属性不经GET发布，已知损坏仍保留原文报错；四文件仍非事务。apiFiles及相邻定向回归通过；首轮完整80/84仅为函数说明/库存/站点尚未同步，80项业务测试全绿；同步后最终84/84、文档249/28/110且updated=0、生产audit 0漏洞、正式哈希183项、git diff与探针目录零diff。实现`397476c7bc29d256781c759f3386beac91d9c147`的[CI35459273776](https://github.com/cccjvav/web_agent/actions/runs/35459273776)九项成功；探针专项保持暂停。

第52组F52：继续非探针PTY、connection-check、external本机管理包装及模型协议形状并交叉R2。真实HTTP红测先证明PTY hello未知字段会200并登记客户端；模型fixture证明没有显式出站字节预算。现PTY hello/poll/report固定body/query/ID和逐状态字段/type/预算，错误包装与矛盾终态在刷新客户端或推进任务前400；connection-check创建/检查/清空及external HTTP登记、stdio预览/启动、删除也在分配记录、触网/保存、启动/停止前固定包装，公网登记严格确认并要求成对完整绑定。模型每轮完整JSON在fetch前限12MiB，assistant只投影固定role/content/tool_calls/function字段；content严格，tool call最多64项、唯一有界ID，arguments须≤256KiB对象JSON且名字必须在本轮声明集合内；禁用/隐藏工具同样在整份验证后、执行前拒绝，随后才可能执行前8项。apiFiles/modelLifecycle及相邻定向回归通过；首轮完整83/84唯一为尚未重建站点镜像，刷新后最终84/84、249/28/110文档零漂移、生产audit 0漏洞、正式哈希183项匹配、探针目录零diff。受影响API/Agent/三篇测试正文维持局部，正式清单199项计数不变；实现`94841c38410591e062867cbe8da92dd9ae2aacdc`的[CI35450192029](https://github.com/cccjvav/web_agent/actions/runs/35450192029)九项逐项成功，探针专项保持暂停。

第51组F51：继续非探针本机REST包装与模型HTTP边界并交叉R2。真实HTTP红测证明`/tool/call`未知包装仍200并写盘，静态复核确认`createOnly:'true'`会落入覆盖分支；模型fixture证明POST未拒跳转，非2xx还反射正文且body无字节预算。现以固定body/query字段表在副作用前拒绝文件/content/tree/preview/undo、检查点、Skill、tool/chat/consensus/tasks、execution-control与operations审批/取消的未知或错类型包装；文件新建须显式布尔createOnly，普通保存须64位expectedHash。Chat另固定枚举、消息及12条user/assistant历史预算。requestScope标准流逐块默认8MiB，模型显式1MiB、`redirect:'error'`且错误不拼远端正文。apiFiles/modelLifecycle及相邻定向回归通过；首轮完整80/84仅为说明/站点未同步的四项门禁，补齐后最终84/84、249/28/110文档零漂移、生产audit 0漏洞、正式哈希183项匹配且探针目录零diff。首推`c1ea0f8c019c4829be2fd6acb2692cc219b652b8`的CI35445326912为8/9，真实Chromium发现Skill首页仍携空expectedHash而被严格合同拒绝；`a4157822238f6669cce6cbc994ee86989afc40ec`改为省略空字段并加VM回归，[CI35448256206](https://github.com/cccjvav/web_agent/actions/runs/35448256206)九项成功。相关API/Agent/测试正文维持局部，requestScope逐函数说明由待逐句转局部；正式清单199项现为已逐句8、局部55、待逐句79，其余状态不变；探针专项保持暂停。

第50组F50：继续非探针REST/审批结果边界并交叉R2。真实HTTP红测先证明Bridge start会静默接受未知字段、对象provider、跨提供商Token与超预算Token后写配置/停启，stop/reset-secret及清轮/身份端点也会把未知包装当合法操作；历史Bridge已知槽位中的对象/数组还会经status原样发布，truthy对象可通过启动授权。现固定Bridge提供商及专属domain/Token schema与字节预算，当前provider实际复用的历史保存值也须通过同一预算；只有完全空体保留旧stop/reset-secret兼容，其余无参端点只接受空体；所有包装失败在存储、停启或GitHub触网前固定400且不回显输入。status只投影类型有效、截长的Bridge字符串/严格布尔，启动授权也只认布尔true。另以真实外部MCP复现`verification.state=unknown`在宿主覆盖验证说明后变succeeded；externalClient现先判原对象，再投影external-reported/unknown，使队列终态unknown、ok:false且重复批准不重放。首轮完整套件83/84唯一失败为改源码后尚未重建docs-site镜像，重建后84/84；追加历史保存凭据预算负例后，下一轮83/84唯一由documentationLearning抓到新增具名helper漏登记详解，补函数表并重建后最终84/84。两个施工漂移均未靠删守卫/断言处理；文档249/28/110零漂移、audit 0漏洞、正式哈希183项匹配、探针目录零diff。相关API/MCP/测试说明维持局部，正式清单计数不变，探针专项保持暂停。实现`11c168915a1f0bace11128b77a022cf403f74c9d`的[CI35437963655](https://github.com/cccjvav/web_agent/actions/runs/35437963655)九项逐项成功，含Windows/Ubuntu矩阵、重复取消/stdio、真实Chromium与安装器。

第49组F49：继续非探针R3并交叉R2输入/公开投影边界。真实HTTP先证明旧模型记录中的`authorization`会被GET `/models`随浅拷贝发布；同链复核扩展到models/status的multiModel及已知槽位错类型嵌套值。modelSettings现集中投影固定模型字段与五个multiModel字段，公开响应仅复制类型/预算有效值并脱敏Key，合法快照往返保留真实Key且清除历史未知属性；模型POST拒绝记录级未知字段，caps/capabilities共享预算，单模型合并不传播历史属性。Provider探测包装只接受baseUrl/apiKey且未知字段在fetch前400/E_BAD_PROVIDER；addProvider包装与目录项也固定schema。apiFiles验证双响应不泄漏、往返清洗、探测零触网、保存零写和错误不回显Key，providers/modelLifecycle相邻回归通过；最终84/84、文档249/28/110零漂移、生产audit 0漏洞、探针目录零diff；实现`124b205`的CI35428457492九项成功，含Windows/Ubuntu矩阵、真实Chromium与安装器。相关模型/Agent/API/测试说明维持局部，正式清单199项计数不变；探针专项保持暂停。

第48组F48：继续非探针R3结果边界。模型工具循环与内置`timedTool`原只认ok/success=false，导致正常return的operation_result顶层failed终态仍发`ok:true`事件并进入成功消费者；现统一共享isToolFailure，失败事件保留有界原结果与归一错误，OpenAI下一轮仍看到终态JSON，失败命令不采集截图。Skill创建原忽略write_file返回对象，写后read-back为unknown仍答成功；现仅success严格true且verified才确认，unknown答409并保留核验。operatorQueue原在总量>40时提前淘汰未满15分钟终态/requestKey墓碑；现40条硬上限先保留重复key命中，新key拒绝，窗口后才清理。真实进程内operation/HTTP写后变化/固定时钟40条回归及相邻测试通过；首轮83/84唯一失败为新增测试未登记主说明，补齐后最终84/84，文档249/28/110且只读零漂移、生产audit 0漏洞、探针目录零diff；实现`f89767f`的CI35408375271九项成功，含Windows/Ubuntu矩阵、真实Chromium与安装器。Agent/Chat/API/审批与三篇测试说明相关段转或维持局部，正式清单199项现为已逐句8、局部54、待逐句80、历史32、暂停15、边界7、生成1、规范1、受限1；探针专项保持暂停。

第47组F47：继续非探针R3 API/workflow结果边界。真实回环MCP先证明tools/call返回ok:false但无isError时被覆盖为ok:true/succeeded；externalClient现用共享失败判定派生ok，保留外部失败且不重放，但external-reported仍非副作用独立证明。真实双路径read_files先证明一项missing/error仍启动后续写；workflow新增hasPartialReadFailure，固定流程将其标failed/E_PARTIAL_READ并停止，普通工具部分返回不变。模型GET掩码整表回写先把fixture Key落成四圆点，单model还可省略Key改baseUrl并沿用旧秘密；新增modelSettings严格非空包装/记录/multiModel/active与merge引用，掩码仅同连接身份恢复，改protocol/baseUrl/modelId必须显式给Key字段，addProvider整表也限100项，输入失败配置字节零变化。三项定向红转绿；首轮全量80/83精确暴露并修正文档交接标记/站点镜像/optional-chain施工回归，最终83/83，文档248/28/110且只读零漂移、生产audit 0漏洞、探针目录零diff；实现`874006e`的CI35402127412九项成功，覆盖Windows/Ubuntu矩阵、Chromium及安装器。相关模型/API/工作流/测试正文仍局部，不增加整篇通过数；正式清单199项现为已逐句8、局部51、待逐句83、历史32、暂停15、边界7、生成1、规范1、受限1；探针专项保持暂停。

第46组F46：仅续审非探针R3审批/工作流。operatorQueue原终态保留按createdAt，导致临近15分钟才批准的结果完成后立即淘汰；同次prune还让expired不可见，迟到cancel可改写成denied。现记录finishedAt并从终态完整保留15分钟，cancel先prune；不扩称持久exactly-once。workflow及external_request/operation_result拒绝未知包装/顶层字段，workflow另拒绝exists:false与contains/sha256矛盾合同，并于审批前拦截完整输出形式的自/前向引用和危险/空路径段。executor命令记录/最近ID现绑定local或远程peer，跨peer显式/缺省查询与取消统一found:false，get_logs只返回本caller追踪；get_task_status现按调用上下文返回Local或当前peer计划，不再向远程泄露/混入Local任务；get_capabilities与tools/list共享远程ACL过滤。approvedOperations可控时间与workflowPreconditions负例、本地83测试及文档247/28/110库存/站点一致性通过；探针专项明确排除；实现`a85fa5a`的CI35397169896九项成功。相关长篇仍只局部核对，不增加整篇通过数；命令及缓存/进度详解从待逐句转为局部后，正式清单199项现为已逐句8、局部48、待逐句86、历史32、暂停15、边界7、生成1、规范1、受限1。

第45组F45：按用户要求接手并交叉审查第44组报告，确认并修复七处结果消费者、设备码代次/单飞、Chat可靠终态、`createOnly`独占创建、补丁后读协调、PTY 2xx门禁与Bridge布尔合同；工作台补原生控件、标签、模态焦点恢复、页签键盘语义、11px下限和390px抽屉。CI新增`contents: read`并把高危生产依赖审计改为硬门禁。完整范围、验证和未验边界见[第45组报告](FULL_AUDIT_FOLLOWUP_2026-09-18.md)。本地83测试、文档库存/构建、calculator、trace-inspector和生产审计通过；首推两轮真实Chromium先后暴露窄屏侧栏遮挡与Skill旧文案断言并保留8/9失败，修复`cc77941`的CI35381668516九项成功（含Chromium、Windows矩阵/安装器）。范围纠正：误改的3个model-probe文件已恢复到`81fb5c2`，不把另一位助手负责的探针专项计入本批审查/实现/验证；线索只移交，边界纠正`27fca73`的CI35386685807九项成功。正式清单当时为199项：已逐句8、局部46、待逐句88、历史32、暂停15、边界7、生成1、规范1、受限1；未审正文不自动认证。

第44组F44：按用户要求做全仓检查并产出[优化报告](OPTIMIZATION_REPORT_2026-09-18.md)（基线e5c8363，83测试文件/247源码/审计0漏洞/两次九项CI）。报告用文件:行给出7处仍存在的“请求发出即当成功”消费者（bind.js登录/清除/新建文件/终端/搜索、chat.js补丁后读、ptyHost.poll），并给CI审计可见化、EOL矩阵、缺lint、生成物churn、浅克隆交接事实与逐句进度策略；明确不做项与未验证缺口。本批未改产品源码。清单增至198项（新增报告行，待逐句）。


第43组F43：原生`webagent.resetSecret`空体POST且忽略status/json，HTTP500仍提示“已重置”，VM执行真实activate复现后修：模态确认、绑定+expectedSecret、严格回包合同、409拒绝与未知分开、写确认后读取失败保留确认；原生停止带绑定并要求running=false（测试另抓出success:"true"假成功）。本地83测试文件与文档检查通过，实现db85323c770137f7cbe7b15d570869d13c43a004的[CI35332743748](https://github.com/cccjvav/web_agent/actions/runs/35332743748)九项逐项成功；夹具是VS Code/HTTP替身，不代签真实IDE或隧道进程。仅局部；本批把extension详解与命令安全测试说明由待逐句改为局部，清单实际为197项：逐句7、局部32、待逐句101（此前文案沿用30/103已更正）；剩余R3消费者、R2、全仓/实机/历史超时与探测暂停保留。

第42组F42：经典startBridge挂起时重复调用两POST，红测后改单飞；停止独立且页面代次拒旧预读/回包/旧finally覆盖。捕获绑定与草稿、完整回包/期限、写后读取失败保留确认，不自动复制或重试；stop有字段条件绑定、旧无字段兼容。VM/真实HTTP通过，隧道进程是替身；新增真实bind页面合成场景本地未执行。82本地测试/文档检查通过，实现53a0560c7b1af1fcf2936988ae9c52f4cd0ec8c7的[CI35329103242](https://github.com/cccjvav/web_agent/actions/runs/35329103242)九项逐项成功，含新增bridgeLifecycleBrowser合成响应场景；不代签真实公网/用户实机。仅局部，197项逐句7、局部30、待103不变；下一包原生重置命令，剩余R3/R2、全仓/实机/历史超时与探测暂停保留。

第41组F41：经典reset-secret回调HTTP500仍报成功先红测后修；页内确认/互斥、绑定与旧secret条件比较、完整响应与后读失败分离，未知不重放。真实HTTP覆盖零副作用拒绝/并发一成功、保存前失败保留旧key、保存后失败已轮换及旧值重发409；旧扩展空体兼容，不代签原生命令UI。新增浏览器合成场景本地未执行；82本地测试/文档检查通过。首轮CI35309852333为8/9，浏览器夹具未开设置弹窗导致按钮不可见；修真实导航，保留失败、不强制点击，修正CI35310130909浏览器通过，但漏提交tests/README生成计数导致其他8项库存门禁失败；补齐导航、不弱化门禁，529752b8e453942d5e42c76089714185f3502a5c的[CI35310276345](https://github.com/cccjvav/web_agent/actions/runs/35310276345)九项逐项成功，含新增真实Chromium页面合成响应场景；后端实际写入/异常由HTTP另证，不代签实机。仅局部，197项逐句7、局部30、待逐句103；下一包Bridge启停与原生重置命令，其余待办/暂停边界保留。

第40组F40：真实index复现公开peer泄露SID、另一个同密钥客户端可改owner任务（磁盘claimed→done）；另一个OAuth client可复用已知私有SID（200而非404）。独立公开peer+会话principal绑定后转绿；刷新保留归属，取消仍按原具体凭据，DELETE幂等响应不删他人。仅已认证协作者边界，非OS/完整多租户隔离。新增生产HTTP/磁盘/取消/不续期回归，本地82测试与文档检查通过，实现bff848389183ee099d42a227aa04bc73f974f306的[CI35291325766](https://github.com/cccjvav/web_agent/actions/runs/35291325766)九项逐项成功（含既有Chromium，不是新增浏览器攻击用例）；逐句7、局部28、待逐句105，共197。续接Git基线错配经备份、远端逐项对照及hash复验无损恢复，过程见阶段40组。下一包R3 Bridge启停/密钥轮换消费，余项及暂停边界保留。

第39组F39：OAuth凭据/issuer/撤销与表单授权改用真实index回归，未复现认证绕过，产品源码不改。Host负例最初受fetch头改写影响，改node:http后保持原断言通过，不算产品红测。OAuth授权详解逐句核对，修none返回secret/撤销200语义及代理边界，其余安全/测试仅局部；197项中已逐句7、局部23、待逐句110。本地82测试/文档检查通过，提交526dfadb1065d2de5f903cd4d47dd3bccd339f38的[CI35288609389](https://github.com/cccjvav/web_agent/actions/runs/35288609389)九项逐项成功（含既有Chromium，无新增浏览器场景）。下一包MCP会话/peer与凭据、任务/取消边界，不把未验证候选当漏洞；探测/实机/历史超时边界保留。

第38组F38：真实index中合法密钥+恶意Origin+畸形JSON先400，改为MCP端口解析前硬拒绝403，合法预检/认证/CLI兼容不变；不是已证明的工具执行越权。新增双端口API/Host/WS及socket优先级负例。控制面与Origin详解逐句核对完成，入口/安全/测试相关段局部；正式清单197项，已逐句6、局部21、待逐句113。本地82测试和文档生成/构建/一致性通过，实现ca7ab17df95adf1526c791176c0fc71cb748c8af的[CI35287587285](https://github.com/cccjvav/web_agent/actions/runs/35287587285)九项逐项成功（含既有Chromium，不是新增跨站攻击用例）。R2下一包OAuth凭据/issuer，其余R3、全仓、实机、历史Windows超时根因及探测暂停边界保留。

第37组F37：仅ID启用stdio启动、HTTP200/null被按成功消费先红测后修；完整预览/绑定/草稿/过期复查、busy与先消费授权，启动元数据不可信则未知、不重启。真实后端单次/快照回归加强但源码未改，非后端越权修复。本地82测试/文档生成/构建/一致性通过，实现beb6d48fa355b5bef59d4bd9c4e2dd69a25a933b的[CI35284740947](https://github.com/cccjvav/web_agent/actions/runs/35284740947)九项逐项成功，含新增Chromium stdio场景；只扩大局部，下一包R2本机控制面/跨站拒绝链，R3余项/全仓/实机和探测暂停边界保留。

第36组F36：HTTP登记连点两POST、removed:false被消费为成功先红测复现后修；表单快照/操作键互斥、独立结果与固定异常提示、移除停止未确认。允许移除connecting且旧登记回包不覆盖新移除；真实HTTP服务仍活着及stdio最终退出分别验证，后端合同未改。本地82测试/文档生成/构建/一致性通过，实现0b79fc41ae3465b4259a065450e445168756d1c6的[CI35282860722](https://github.com/cccjvav/web_agent/actions/runs/35282860722)九项逐项成功，含新增Chromium接入页面场景；仅局部审查，下一包stdio预览/启动，R2/实机/全仓与暂停边界保留。

第35组F35：创建检查点在途连点两次POST先红测复现，修页内互斥/快照/绑定与失败消费；已确认创建但列表失败保留ID，不重建，不承诺跨页或持久去重。真实HTTP证明规范路径与失败零半条记录，未改既有后端。本地82测试与文档生成/构建/一致性通过，实现048a584df8d968d2515cf93c1714491e7b2c01ae的[CI35280644858](https://github.com/cccjvav/web_agent/actions/runs/35280644858)九项逐项成功，含新增Chromium真实后端创建场景；只扩大相关局部，不关闭全仓、R2、实机，探测仍暂停。

第34组F34-01/02：先复现检查点GET失败阻断审批GET、错ID预览仍授权；修为两列表独立校验/代次发布、检查点完整预览与恢复逐文件合同复核，未知不重放。真实写后事件异常证明后端既有unknown/停止后步正确，不冒充新增修复。本地82测试与文档生成/构建/一致性通过，实现677f47ab22bdfebe18daa13561e6a93776d2d581的[CI35279294245](https://github.com/cccjvav/web_agent/actions/runs/35279294245)九项逐项成功，含新增Chromium检查点场景实际执行。正文只扩大相关局部，不关闭全仓逐句、R2或实机；探测保持暂停。

第33组F33-01/02/03：真实写后事件异常、队列非终态假成功和UI旧审阅覆盖新请求均先红测复现后修。工作流区分调用前拒绝/已派发未知，队列保留cancelRequested，可靠末步成功不因请求取消而否认；审批/预览代次与ID绑定、POST前消费按钮、提交在途互斥和完整响应期限。定向通过；全量初次81/82因浏览器函数说明放错主归属，已修正后最终本地82测试与文档生成/构建检查通过。实现70c55a5718412460df3ebcff6828435314066cfa的[CI35276596251](https://github.com/cccjvav/web_agent/actions/runs/35276596251)九项逐项成功，含新增Chromium审批夹具实际执行，不代签实机；只扩大对应段局部范围。下一包operations列表/检查点与其他API消费，R2及全仓逐句未完成。

第32组F32：Provider配置链首包已修，本地82测试与文档生成/构建通过；实现87b1e918ff153c64b510c38cee8b44e9b5fac33a的[CI35270917981](https://github.com/cccjvav/web_agent/actions/runs/35270917981)九项逐项成功。Add仅追加、不切当前模型；同端点同模型冲突拒绝，不回传脱敏旧Key。Test/Add/模型设置共用guard、输入快照与显式手动登记；后端既有15秒期限不重复算新增，本次加入断连取消、流式512KiB/100项与字段预算、拒跳转/错误正文不回显。VM先复现HTTP500却报Test OK；HTTP追加/旧Key保留/冲突零写、回环正文超时/跳转和UI失败消费通过，新增浏览器点击已在本批CI实际执行。只核对对应章节，不扩大到全模型调用、安全链或供应商兼容。

第31组F31-01/02：R3状态刷新与聊天/内置选择已修，本地82测试文件和文档生成/构建通过，实现78ebac2daac3904cd7d1ce71ea26a3c4152878a7的[CI35269106675](https://github.com/cccjvav/web_agent/actions/runs/35269106675)九项逐项成功。HTTP/核心形状错误不发布；新请求序号阻止旧头/JSON覆盖，select与标签按同一确认ID，未知模型不回退。选择按钮共用模型保存guard；写后读失败/被取代不重写。局部源码/说明与VM已核对；新增真实页面fixture已在CI Chromium执行通过；本沙箱Chromium下载ECONNRESET，未本地执行。Provider添加的发现/保存缺口当时转第32组，现已完成该首包；R2和全仓审查未完成。

第30组彻底回归原管家结构：计划、工作包与交接纳入[现有阶段10](../manager/stages/s10-upstream-adoption.md#当前工作包与交接约束)，CONTEXT仍是唯一接手索引；不再保留根交接文件或单独路线。第29组OAuth指引/空prompt修复与验证仍看阶段历史；第30组当时只整理管理文档，不增加语义完成数。本地82测试文件通过；7439388ed80359bdcc814a8f0cfe3fb5a8267baf的[CI35266822926](https://github.com/cccjvav/web_agent/actions/runs/35266822926)九项成功，范围见阶段30组，不代替剩余审查或实机验收。

第28组28f26e166be5294bc2963b30e195e800ef48f05d，[CI35263924819](https://github.com/cccjvav/web_agent/actions/runs/35263924819)逐项九项成功（Ubuntu18/20/22/24、Windows20/22/24、安装器、Chromium）。本地82测试文件通过，246源码/28目录/110排除。本次CI实际执行，不再把账户问题列为当前全局阻塞；不推断账单如何恢复，不删除25–27组未启动历史，也不据此关闭Windows旧超时根因或第三方实机验收。

第27组实现b07d41d552e6cd7ee2ccc5c1a757b79fab1a68c9，[CI35252848573](https://github.com/cccjvav/web_agent/actions/runs/35252848573)九任务annotation均为账户付款/支出上限问题，未启动测试；本地82测试文件通过，不代签Windows/Chromium，不自动重跑。

正式全仓审查以[逐文件清单](FULL_REVIEW_INDEX.md)为覆盖入口；既有台账保留发现与证据，不将旧“已全文读取”批次直接当作本轮逐句通过。第27组继续R3模型设置失败消费，首批F27-01/02/03明确已核对、未闭环与局部范围。

第26组按用户要求完成文档结构首包：[文档中心](../docs/README.md)集中19篇专题，17篇历史报告归档，过期PROMPT删除且完成证据保留。搬迁与断链修复不等于重新逐句审完19篇或关闭其他代码待办。

第26组8ccbcc3b515c06b1b81b9c806c32b4cde6a75a7a，本地82测试文件、文档构建/链接/安装载荷回归通过；[CI35250548224](https://github.com/cccjvav/web_agent/actions/runs/35250548224)九任务仍因GitHub账户付款/支出上限未启动。不是代码测试九项执行失败，也不代表Windows/Chromium已通过；需所有者检查Billing & plans，未重跑或放宽断言。

**全仓逐句审查仍未完成。** 这里是现行范围，不再把初始“公网MCP/回退尚未做”表留在顶部，再靠后面十几批附录纠正。第1–15组原始说明、失败与精确CI移至[历史批次证据](archive/SEMANTIC_BATCHES_01_15_2026-09-16.md)；保留追溯，不篡改当时测试数。

源码/hash/AST/链接检查与人工语义审查不同。下表是已明确记录的审查范围，不是全仓文件清单；未明确列为全文的文档不能默认算已审完。语义认证也不会由一次修改的CI自动延伸到该模块所有平台和场景。

第28组F27-02实现侧已修：第三方卡片/DeepSeek独立指引/页面与复制规则/MCP资源使用未知和未验证状态，两个专题逐句对照；VM、协议和HTTP共82本地测试通过。未做第三方实机兼容验收；F28-01其余客户端与OAuth提示仍待，按正式清单推进。

## 当前施工与验收边界

| 分类 | 状态 | 剩余边界 |
|---|---|---|
| Plan失败、API/MCP结果、MCP取消 | 已实现并有绑定提交的回归 | 失败不自动换模型/重放，不撤回已完成副作用 |
| 四项主人权限、Chat/Bridge互斥 | 已交付 | 同类型并发保留；任意Execute仍是OS用户级信任 |
| 公网出站MCP | 显式HTTPS/Bearer/DNS固定连接/逐次审批已交付 | 真实提供商兼容待验，不含自动OAuth登录/刷新 |
| 经典保存/原生草稿/跨文件检查点 | 三种有限内容恢复均已实现 | 检查点非原子事务；全项目创建/删除/改名/外部副作用回滚不是这些功能 |
| 文件变化提示、OCR/图像/桌面增强、限流公平性、性质/变异、来源/签名 | 借鉴候选，未统一承诺全部实施 | 分别设计/验证，不自动申请密钥、安装依赖或扩大权限 |
| 持久登录、Chat API确切后台身份 | 按约定延期 | 探针是参考，不鉴定绝对真实身份 |
| 探测项目及经典/code-server入口 | 2026-09-17起暂停，等待外部整合项目交接 | 保留既有实现；未拉取/审查/验收外部代码，交接门槛见[阶段8](../manager/stages/s8-probe-integration.md) |
| 手机Arena连接、11.3 | 用户连接报告通过；11.3协作说明已关闭 | 不重开同一阻塞项，不推断蜂窝/OS/所有工具 |
| 新功能人工验收 | 原生窗口、安装生命周期、真实探针/公网服务等仍待 | CI/源码阅读不代签用户实机 |

## 已明确处理的语义范围

| 范围 | 已完成的对照/修订 | 不作什么推断 |
|---|---|---|
| README、CONTRIBUTING、manager/docs/experience | 已全文重写核对，后续能力行同步 | 不给其他根文档自动盖章 |
| 架构导读、组件说明 | 第14组全文重写，清理重复过期说明，保留四层教学与职责导航 | 不认证第三方厂商、整套OS隔离 |
| 总览、技术实现 | 第15组全文读取、现行导航/关键执行链复核及修订 | 技术实现中的模块说明不代替每份实现详解重审 |
| 使用指南 | 第20组全文读取，非探测操作正文与启动/安装/Bridge/配置忽略规则重点对照修订 | 探测小节保留并标暂停，其他模块详细实现仍按队列逐个审查 |
| 测试说明、代码复盘指南 | 第16组全文复核并修订运行/证据/阅读入口 | 删除旧计数不是删掉函数教学；仍保留逐文件详解 |
| Conda环境说明、平台启动与CI详解 | 第17组全文读取并对照环境约束、实际CMD/Shell、包清单与CI；修正文档步骤和过期分支 | 未在用户Windows/Conda实机执行，不由阅读代签E1–E6 |
| 技能使用指南 | 第19组全文读取，完整对照skills.js，另核对创建API/UI与截图候选路径；清理旧第三方比较和四篇/旧workspace说法 | 非全部工具/PTY模块认证，内置来源例外与Execute信任保留 |
| 隧道使用指南、隧道模块README/生命周期/停止进程详解 | 第18组全文读取，对照Cloudflare/ngrok/stopProcess与Bridge启停分支，重写过时操作说明 | 日志就绪不是公网请求证明；Windows进程树、提供商账户和跨块日志秘密边界仍单列 |
| 任务板与工作区详解 | 第22组整篇读取，对照完整board/gitOps/workspaceInfo；修坏板保留、身份字段与Git实现说明 | Git与同用户进程不隔离；模型画像/记忆、元数据路径和其它模块仍按独立队列审查 |
| MCP请求分发、会话与结果详解 | 第3组按server/requestLifecycle/session/errors/budget完整函数对照 | 后续变化仍需复核，非协议形式化证明 |
| Bridge与设置/交互绑定的定制设置段 | 第25组对照定制load/save/paint和全部saveCustom按钮；修失败消费、旧state回写与草稿覆盖 | 仅对应章节；模型选择、多模型/工作流及其余API仍待 |
| 画像与记忆详解、models README | 第24组全文对照profile/customizations/memory与定制PUT路由；修嵌套字段丢失、预渲染/字节预算、画像假推断、记忆超限与悬空链接 | 不认证四文件事务/跨进程隔离；UI消费链转R3，通用安全依赖转R2 |
| models配置存储详解、运行配置详解 | 第4组完整函数对照，修损坏保护/秘密轮换及启动顺序 | 非fsync或跨进程事务保证 |
| 文档站浏览/服务详解 | 第2组全文函数/事件对照 | 构建/样式等其它详解不随之全部认证 |
| 公网、模式、恢复、导航新增章节 | 对照本批实际模块/测试，范围与失败记录见历史批次及下方 | 新章节完成不等于合并所在整篇都已重审 |
| SECURITY、安装/其它模块说明 | 已处理明确涉及的章节与矛盾 | 未审章节仍保留为待审，不说“只差实机” |

下一轮优先级、入口、完成条件与用户参与节点统一见[项目管理索引](../manager/CONTEXT.md)。本台账保留审查证据；路线图不代替语义认证。

## 待审工作如何继续

1. 根操作/维护指南中未整篇对照的部分：安全及其他维护指南（使用指南已读并修非探测操作正文，Conda/平台CI/隧道/技能已整篇复核，后续变化仍需维护）；先核对执行步骤、路径、权限和数据保留。
2. 模块详解中仅有旧函数覆盖记录而未逐句复核的部分：工具/工作流、API长篇（定制设置消费首包已修，继续模型选择/多模型设置及工作流）、PTY/Windows互操作等；探测专项暂停待交接，不进入当前施工队列；已有说明必须保留，逐个核对失败/并发/平台分支。
3. 目录README和管理阶段中的遗漏状态：第26组已完成专题集中/历史归档首包；不能因主要根导读修好就假定所有旧“当前”已清零。
4. 历史报告/冻结原型按用途归档与维护导航，不为缩小待审分母删除有效代码教学和用户验收记录。

这是一份可执行的范围顺序，不是已完成清单。下一次修订更新本页对应状态；历史明细继续进入明确标为历史的证据文件，不把当前表改回逐批追加的时间线。

## 本组：测试运行与复盘入口

全文读取测试说明142行、复盘指南238行，对照run-tests.cmd、run-tests.js、CI YAML和既有测试/模块详解导航。修正“没有Playwright”、固定52/166文件、测试目录只剩人工验收、手机连接完全未验等旧结论。根测试说明改为运行方法/证据层级，完整逐测试入口仍留在tests/README。

直接npm test原先只检查express，生产依赖齐全但缺Acorn时仍开始一长串失败。runner改为先检查express/Acorn入口，缺少退出2并给锁文件安装命令，不自动安装。新增临时runner副本测试，覆盖全缺和只有express两种情形，不改真实checkout依赖；不是依赖完整性校验器。

## 本组续作：文档站残留交互问题

第2组曾记录的搜索旧结果不清理、guide坏百分号阻断渲染现已修复；正文/文件路由也解码完整中文/斜线标题ID。VM覆盖短输入、无匹配、标签转义和编码；新增真实Chromium加载实际站点资源的搜索/guide/目标节点回归，网络由白名单fixture提供，不把它当静态服务或所有浏览器验收。相关说明直接改正文限制，不让已修条目继续作为现行缺陷。

## 第17组：环境/CI整篇复核与Playwright澄清

全文读取Conda环境说明282行、平台启动与CI详解101行，对照真实根/后端package.json、CMD薄层/check-env/run-tests/build-installer、Shell入口及test.yml。Playwright一直是Node开发依赖（当前1.63.0），删除的是旧“没有Playwright”的错误说明，不是删除依赖。补包/浏览器缓存/独立test:browser/生产运行的区别：日常Arena入站不要求它，也不会自动新增远端浏览器工具。

直接替换平台说明中只检查express/npm install、Shell相对路径未修、两个CI任务、不编译capture/mark等旧断言，整合追加的stdio/探针包验证到现行job流程。根package.json实际存在，纠正上一批总览“源码根无统一入口”而不隐藏失误。check-env实际提示改为修改PATH后完整重开VSCode。Conda使用原有环境/系统Node，不改成venv，不冒充沙箱已运行Conda。

新增真实包版本/命令入口/关键文案与隐藏控制字符守卫；扩展环境/CI指南链接检查。修改中新插入CMD路径曾产生一个BEL转义字符，已修成反斜线并加入守卫；不把通过生成检查当人工语义准确率。

## 第18组：隧道操作、启停失败与最终本机验收约定

对照完整cloudflared.js/ngrok.js/stopProcess.js及API Bridge启停、经典UI实际函数，整篇重写隧道使用指南：不再称HTTP200失败为成功、不把fallback当3000工作台、不保证每次域名必变、不建议写System32/盲开防火墙。说明Named远端映射与日志就绪区别、凭据argv/env及chunk内替换限制、停止失败链与残留核对。相关模块说明全文读取；SECURITY只修相关权限/非破坏性承诺与域名段，不由此宣称整份安全说明已认证。

发现并修复实际经典UI：startBridge忽略tunnelError/note，stopBridge不检查HTTP/业务失败就继续灭灯。现在启动显示具体原因并刷新失败重启状态，停止明确成功才灭灯，响应丢失报未知；不自动重试。VM执行真实模块覆盖启动失败/刷新/不复制URL及停止HTTP/业务/网络失败，Chromium增加实际页面模块＋拦截失败响应的DOM验证，不启动外部隧道。安装提示同步完整重开VSCode父进程。

用户2026-09-16指定最终在本机项目根通过Arena MCP验收，已更新新手说明与清单M1–M5。实际工具可用→ping/workspace_info身份与root→提交/改动→受控测试→本机收尾。当前会话没有本机MCP工具，不虚构已连接，不拿沙箱替代；源码根不授权覆盖已有改动/破坏性边界实验，11.3不重开。

## 第19组：Skill创建假成功与同名覆盖

完整读取276行技能使用指南与198行skills.js，按来源ID、分页、资源、128KiB/8000字符边界和当前示例目录对照。修frontmatter.name/目录身份混淆、过期四篇与旧workspace、bundled绝对路径例外；删无必要的旧第三方产品比较，保留现有桌面/回图解释且不把候选图片保证为新截图、不把Execute称OS沙箱。

发现新建Skill按钮无HTTP/业务检查而假报已创建，API默认confirm_overwrite:true可覆盖规范化重名。改成内部createOnly在既有写路径锁中拒绝已存在目标，UI只在明确成功后刷新/提示；失败显示原因、响应异常报状态未知、不自动重试。未扩展通用MCP write_file schema，不承诺与外部OS写进程原子隔离。apiFiles真实HTTP覆盖规范化重名与同名并发，保留胜出正文；Chromium点击按钮并拦截400，核对具体错误和无新文件。首次本地全量因新文案守卫要求“状态未知”而正文写“结果未知”出现1/82失败，统一实际UI措辞后重测；失败未推送、未跳过守卫。

## 第20组：外部探测交接暂停与主使用指南

2026-09-17用户报告外部arena-ai-probe整合版由另一助手开发，并明确暂停本项目探测施工直到完成交接。阶段8当前状态/入口表、管理索引、README和本台账已更新，交接需锁定SHA/版本、许可/构建测试、三宿主支持矩阵、权限/数据迁移及并存方案。本轮未访问或拉取外部项目，不把用户报告扩展成已验证能力；保留存量功能与既有回归。

全文读取使用指南545行，但探测专项暂停：该小节仅加存量/暂停说明，不继续验证其实现。非探测正文对照Windows启动器、扩展安装、Bridge实际业务结果与既有精确验证，修旧System32/父进程PATH、MCP回退3000、缺Key自动拼接、根无.webagent、只忽略两文件、旧固定PASS列表、Skill来源例外等。重点审查操作路径与已知误述，不把长篇中引用的所有模块自动标为逐函数重审完成。新增当前管理状态/旧说法回流守卫和两份文档链接检查。

## 第21组：安全说明复核与隧道日志跨块泄露

读取安全说明全文，重点验证已记录的Named/ngrok日志逐chunk替换缺口；探测专项未恢复，OAuth/执行器等安全正文尚未全部逐句对照其所有实现。修复同一Token跨日志chunk时可能先广播部分原文：stdout/stderr分别使用UTF-8解码器与KMP前缀状态，完整匹配遮盖后再裁剪，未完成前缀结束时不flush。就绪识别仍用原有有界缓冲，不改变进程参数/权限/退出语义。

测试遍历每个字节切分、逐字节、重复前缀、中文编码，以及实际提供商回调/事件历史/交错流/停止后的旧事件。更新模块函数、测试、隧道指南及安全边界；精确Token遮盖不覆盖变形文本、未知秘密、历史日志或进程argv/env。当前不需要用户操作；怀疑历史凭据泄露才由其在来源撤销，未声称已发生用户泄露或要求提供凭据。首轮本地1/82失败来自collect测试回调漏函数说明，补齐登记指南后重测，未移除守卫或推送失败版本。

## 第22组：只读Git执行边界与状态解析

整篇读取任务板/Git/工作区详解并对照三个模块。修git_status逐行解析导致特殊路径/重命名损坏、无提交分支误读以及80项误报截断，改NUL记录和originalPath。git_diff字面路径，禁外部diff/textconv/fsmonitor；进一步临时仓库验证发现clean filter仍可执行，故补配置键名发现与逐驱动临时禁用clean/smudge/process/required，共享原剩余时间预算。不修改用户配置、不通过任意命令回退。

真实临时Git/Node辅助程序正反对照覆盖上述执行入口；状态测试覆盖中文、重命名、无提交、POSIX换行及80/81界限。修文档中坏板会被空板覆盖的过时断言，并同步任务板源码的旧peer/卸载/授权注释。过滤后差异可能不同于终端，整仓diff仍可能含敏感正文；对恶意同用户配置竞态/替换Git不作隔离承诺。探测暂停保持，当前不需用户操作。

## 第23组：接力交接与可执行路线图

按用户优先要求新增根交接与路线图，并接入README、AGENTS、管理索引与文档站。明确现有基线、已交付限制、R0–R8/P工作包、下一项画像与记忆的实际文件/测试/结束条件、候选设计门槛、Windows旧超时证据、探测暂停交接与最终本机MCP验收。写出计划不表示对应实现或审查已经完成；本组未修改产品运行逻辑。

## 第24组：R1三模块与确定缺陷修复

全文对照画像与记忆指南及profile/customizations/memory。隔离旧模块证实notes局部修改重置shell、非法instructions发布JSON后失败、超大记忆写后不可召回、悬空记忆链接在外部创建文件。修已确认问题并补回归：有限输入类型/先渲染与8MiB输出预算/真实路径、两个子对象保留字段；清单256KiB且普通文件/对象，jsconfig不猜TS、Python标记不猜pytest；记忆正文16KiB/每日256KiB、CR/LF与NUL校验、lstat拒悬空链接。新预算不会自动清理已有超大日记或重试写操作。

对应README、函数/测试说明及PUT错误格式同步；profile finally恢复工作区。全量82测试通过；55c3656d7842e5c361fefa27b376fa6db1ed8b75的[CI35245544812](https://github.com/cccjvav/web_agent/actions/runs/35245544812)九项逐项成功。R1完成的是这三个模块的整篇对照与本包修复；settings.js失败消费/旧状态提交列入R3，通用路径、安全执行链列入R2；任意扩展字段schema、四文件事务、同用户跨进程竞态不由本包保证。

## 第25组：R3定制设置失败消费

真实模块VM先复现400返回undefined并污染state，修HTTP/业务/快照检查、失败false与所有按钮提前退出；只PUT本次字段，不重放旧state；保存响应不覆盖表单草稿。页面内busy/10秒AbortController，未知写入不自动重试；GET坏配置500 JSON保留文件。VM/HTTP及本地82测试通过，实现483510a的CI35247957459九任务因GitHub账户付款/支出上限未启动，新增Chromium点击负例尚未执行；沙箱浏览器下载ECONNRESET，未冒充通过；文档只认证上述章节，非全部设置/API完成。

## 验证与维护入口

第23组历史核验cd2a3eaa42831526e3a6ef7a504370144e857da5，[CI35243219647](https://github.com/cccjvav/web_agent/actions/runs/35243219647)九项逐项成功。本地82测试文件、246源码/28目录/110排除。首推0fac6f0漏带自动tests/README导航，CI35243193771仅1/9成功（浏览器）、整体失败；立即补齐而未删守卫，未将首推当绿灯。本组仅交接、导航与回归约束，无产品运行逻辑变更。

第22组核验52b2148b96bbb01431f0ead70352e7d4a90e4f64，[CI35235675274](https://github.com/cccjvav/web_agent/actions/runs/35235675274)九项逐项成功；本地82测试文件、246源码/28目录/110排除。真实Git临时仓库/自写辅助程序正反对照在主机矩阵通过；不等于用户项目的LFS配置或所有Git版本验收。

第21组核验2e1bc29c280ab08b7cebe985bb6ba602c968f483，[CI35233048258](https://github.com/cccjvav/web_agent/actions/runs/35233048258)九项逐项成功；本地82测试文件、246源码/28目录/110排除。包含真实提供商模块＋模拟进程事件的日志回归，不是实际Cloudflare/ngrok连接验收。

第20组核验b4cd7ae4852c113e6d9cf51fdce3da6cf3ba279d，[CI35231427025](https://github.com/cccjvav/web_agent/actions/runs/35231427025)九项逐项成功（七组主机、安装器、Chromium）；本地82测试文件、246源码/28目录/110排除。仅验证本仓库变更，不认证外部探测项目，不证明此前Windows超时根因已修复。

第19组完整核验：e470d5ff7efbdcfe3ef03d86f42519f147003a9a，[CI35125876577](https://github.com/cccjvav/web_agent/actions/runs/35125876577)九项逐项成功。该提交仅记录上一轮证据，未修改实现或放宽测试；新的完整CI通过，先前Windows22超时根因仍未证明。

第18组ae97f65e20f2b23f2ca3838aa9131934ad0471d4，[CI35124844106](https://github.com/cccjvav/web_agent/actions/runs/35124844106)九项逐项成功。第19组36ff82f4b21ee4714dcacd9ff0cd657c47e88def本地82测试文件通过，但[CI35125290301](https://github.com/cccjvav/web_agent/actions/runs/35125290301)首轮8/9成功、整体失败；不能继承前一组绿灯。246源码/28目录/110排除。

第19组Windows Node22的npm test有两项超时：mcpProtocol截图路径echo命令约30.5秒超时且无输出；patchEngine的搜索worker启动超过10秒。浏览器、安装器及其余六组主机成功。通过check-run annotations获取到具体错误，日志下载两次EOF；请求一次诊断性rerun被GitHub拒绝（“cannot be rerun; its workflow file may be broken”），并未实际重跑，不据此诊断workflow损坏。没有放宽时限、删断言或改为自动重试；尚未证明根因或修复这些超时。后续新提交验证也不能抹去本次失败。

| 本组提交 | 验证结果 | 说明 |
|---|---|---|
| f6a7bff267c1678a26fcbfa90f20f601ad1f2574 | CI35116022251九项成功 | 缺测试依赖前置拒绝、测试/复盘说明及台账整理 |
| 6ed9adff87798dcfd21af9072a995cc5c1e233c9 | CI35116366728为2/9成功，整体失败 | 浏览器/安装器通过；本地定位新增docsViewerBrowser漏在登记指南中说明，未隐瞒失败提交 |
| 8ed049663bb943a5880f873ba4a33cd3f5a9b8fc | CI35116453656九项成功 | 补齐实际登记指南后全量通过，未删除文档守卫或浏览器断言 |
| 23ce0a3345d4d55685d9a21202f3ec0f6a440e98 | CI35120320368九项成功 | 第17组Conda/平台CI说明、Playwright边界和实际check-env提示，未代签Conda实机 |
| ae97f65e20f2b23f2ca3838aa9131934ad0471d4 | CI35124844106九项成功 | 第18组Bridge启停失败处理及本机MCP验收约定 |
| 36ff82f4b21ee4714dcacd9ff0cd657c47e88def | CI35125290301首轮8/9成功，整体失败 | 第19组Skill创建修复；Windows22两项超时未定位根因，浏览器/安装器成功 |
| e470d5ff7efbdcfe3ef03d86f42519f147003a9a | CI35125876577九项成功 | 证据更新后全量核验，同一实现未再现超时，不等于根因已修复 |

最新基线统一见[管理索引](../manager/CONTEXT.md)和[阶段10](../manager/stages/s10-upstream-adoption.md)。

当前人工结果只记录于[验收清单](CHECKLIST_WINDOWS.md)，逐步动作见[Windows新手验收](../docs/guides/Windows新手逐步验收.md)。归档批次中的“当前/未完成”不再作为现行导航，历史失败和用户授权仍可追溯。

### F54交叉复审补记（2026-09-20）

用户要求复审助手自身工作、防旧功能回归和目标偏移。以20ad7b2为基线复核前四批七处运行时代码及相邻调用合同；明确本地预算/版本/新建块/SID兼容变化，不外推跨进程事务或全面租户隔离。发现工具目录和initialize.instructions自动hash复用承诺仍过宽，mcpProtocol先红测后收窄为目标存在时复用，缺失目标须保留显式hash并协调。只改说明，不偷偷改变新建合同；定向13项及完整84/84、既有真实Chromium通过。详细范围、错误命令与未验项见阶段10交叉复审记录，原生终态仍未修，正式整篇认证数不变。

### F54第五批补记（2026-09-21）

原生postNdjson的302假完成先红测，现拒绝非2xx/非NDJSON/坏帧/无终态/断流/错误/取消与预算超限；唯一done加正常EOF才完成。ChatView失败不存助手历史，participant用metadata标记并过滤失败助手上下文，不自动重放。VM真实扩展+回环HTTP覆盖两种消费者，完整85/85和既有真实Chromium通过；规范扩展与发行副本由syncExtension同步。具体门禁及失败在阶段10；requestJson预算/实际Windows IDE与窄屏/ARIA仍待，不增加整篇认证数。
