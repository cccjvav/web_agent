# 测试导航：测了什么，以及没有证明什么

下表列出已有逐fixture/断言正文的阅读入口；测试持续新增，不以历史52项计数冒充当前全部测试的逐句认证，也不代表真机验收通过。

## 逐测试详解

| 人工正文 | 对应测试（省略.test.js） |
|---|---|
| [模式画像与Plan测试详解](模式画像与Plan测试详解.md) | chatMode、toolLabel、providers、profile、planRound |
| [安装与运行器测试详解](安装与运行器测试详解.md) | testRunner、codeServerAuth、extensionCopy、desktopExtension、codeServerNotRunnable、installerPackaging |
| [文档守卫测试详解](文档守卫测试详解.md) | documentationPolicy、documentationQuality、documentationLearning |
| [Chat模型与图像测试详解](Chat模型与图像测试详解.md) | runChat、modelLifecycle、chatVision、computerUseScripts |
| [浏览器与Webview测试详解](浏览器与Webview测试详解.md) | monacoLoading、workbenchRuntime、editorRuntime、webviewRuntime |
| [存储完整性与预算测试详解](存储完整性与预算测试详解.md) | stateIntegrity、resourceBudget、auditStorage、hostPersist、usageTracker |
| [PTY与隧道测试详解](PTY与隧道测试详解.md) | ptyJobs、ptyLifecycle、extensionHostSafety、tunnel、tunnelLifecycle、bridgeTunnel |
| [任务板与事件流测试详解](任务板与事件流测试详解.md) | board、mcpBoard、eventBus |
| [工作区与命令安全测试详解](工作区与命令安全测试详解.md) | dangerousCommands、sandbox、workspaceTools |
| [本机边界与跨站测试详解](本机边界与跨站测试详解.md) | auditControl、localControl、corsAllow |
| [OAuth与GitHub测试详解](OAuth与GitHub测试详解.md) | oauth、oauthClientAuth、githubAuth |
| [补丁与编辑API测试详解](补丁与编辑API测试详解.md) | patchEngine、apiFiles |
| [MCP协议与整机入口测试详解](MCP协议与整机入口测试详解.md) | mcpProtocol、mcpInterop、mcpCallerIsolation、httpSmoke、skipWorkbench、operatorQueueCapacity |
| [统计与文档测试](统计与文档测试详解.md) | adminHost、docsSite、docsHttp |
| [工作台HTML结构与测试](../../workbench/页面结构详解.md) | workbenchHtml |

documentationLearning检查全部清单源文件的正文登记；对JS检查具名函数/类方法提及，对非JS检查文件名关联。总计132个JS与36个非JS对应60篇详解，只有机械遗漏/漂移检查，不认证解释准确性，也不代表Windows/Conda实测。

## 职责与运行
这里存放可独立运行的 `.test.js`，统一入口是上一级scripts/run-tests.js。runner检查依赖和必需测试，发现其他测试文件，以独立进程执行，超时/失败非零退出；测试失败仍汇总其余结果。

从仓库根执行：

```sh
npm ci --prefix webagent-core/agent-host
npm test --prefix webagent-core/agent-host
npm test --prefix webagent-core/agent-host -- --filter=oauth
```

也可直接node某个测试文件。筛选结果必须说明范围，不可把一次筛选通过写成全量通过；不要手工维护历史“总共多少测试”的固定列表，文件导航和runner输出才是当次事实。

模型状态消费新增workbenchRuntime的HTTP/业务/乱序/超时与真实bind回调负例；独立test:browser中的modelStateBrowser用真实页面和拦截响应验证按钮、隐藏select与失败提示。后者不是npm test的一部分，不代表真实供应商验收。

Provider追加另由apiFiles真实HTTP校验旧Key/当前选择保留与冲突零写；providers验证回环流式预算、期限和拒跳转，workbenchRuntime覆盖发现失败不写、输入快照/页内互斥和显式手动登记。

审批新增approvedOperations的非终态/unknown判定，workflowPreconditions的真实写后抛错与取消、executionControl的调用前撤权；workbenchRuntime的审阅代次/错ID/双击/超时。独立approvalReviewBrowser验证真实页面控件，与上述Node测试分列证据。

第34组补充列表失败隔离/乱序JSON/检查点错误合同的VM负例、真实写后事件异常保留效果，以及独立checkpointResultsBrowser页面拦截场景；后端检查点逻辑未因本批测试而改写。

第35组补创建生命周期：workbenchRuntime先复现连点两次POST，再测快照/坏响应/绑定变化/超时与写后读失败分离；apiFiles验证规范路径和失败零半条记录，checkpointCreateBrowser另测真实页面/后端，不算Node测试的浏览器执行证据。

第36组增加HTTP登记/移除的VM失败与互斥、externalDiscovery真实connecting移除、stdioMcp区分停止回包与最终PID退出，以及独立externalRegistrationBrowser页面回归；既有后端合同不变。

第37组补stdio页面合同：workbenchRuntime先复现不完整预览/空启动响应，再覆盖草稿/绑定/过期/在途与未知消费；stdioMcp验证失败令牌不重用、原输入args/env不可改已审快照。stdioLifecycleBrowser另测真实页面合成响应，不替代既有真实进程测试。

第45组补齐优化报告中的结果消费者并扩大可靠性/可访问性回归：workbenchRuntime覆盖登录、清除身份、新建文件、终端、搜索、补丁后读、Bridge统计布尔结果及Chat严格流终态；apiFiles以并发HTTP证明createOnly只能一方创建；githubAuth覆盖设备流程代次与poll单飞；ptyLifecycle拒绝非2xx伪成功；workbenchHtml检查标签、ARIA、原生按钮和390px样式源码。独立workbench.browser.js增加帮助模态焦点恢复与390×844边界断言；workbenchRuntime还执行1000→640px断点跨越，防止已展开侧栏遮挡Agent菜单并核对焦点/ARIA恢复；本地没有Chromium时不得把其源码登记写成浏览器执行通过。

第46组只续审非探针R3审批/工作流与相邻结果消费者：approvedOperations拒绝external_request/operation_result未知包装字段，并用可控Date.now证明临近审批期限完成后仍从finishedAt保留完整15分钟、expired可见且迟到cancel不改写为denied；workflowPreconditions拒绝definition及preview/request包装的顶层未知字段、exists:false与contains/sha256矛盾合同，以及完整输出自/前向引用和危险/空路径段；正文中间的同名文字保持字面量；executionControl证明tools/list/get_capabilities使用相同远程ACL，并证明命令显式ID、缺省最近记录、取消及get_logs执行记录均绑定远程peer；taskProgress证明get_task_status只返回本机/当前peer计划，不再向远程回传Local计划，未知peer纯读取也不占16个报告槽。没有修改或专项审查探针项目。

第47组继续非探针API/workflow结果边界：approvedOperations让真实外部MCP返回ok:false但不带isError，要求终态failed且不重放；workflowPreconditions让双路径read_files一项成功、一项missing，要求E_PARTIAL_READ并阻止后续写；apiFiles经真实HTTP验证模型GET掩码整表安全往返、连接字段改写必须显式给Key、严格active/merge/multiModel/包装字段、addProvider整表100项上限与全部输入失败配置字节零变化。未调用真实第三方模型或扩大探针范围。

第48组继续非探针R3结果边界：modelLifecycle令真实operation_result以正常return给出failed，要求OpenAI工具事件不再假绿且下一轮仍收到原终态详情；apiFiles在Skill磁盘写入与read-back间制造确定性变化，要求路由拒绝把unknown核验包装成创建成功；operatorQueueCapacity填满40条终态，证明未过15分钟的结果/稳定key不提前淘汰，新key拒绝而非牺牲去重，窗口届满后再恢复容量。均为Node/HTTP或模拟模型证据，不代签真实提供商、外部OS竞争或主机重启。

第49组继续非探针R3/R2输入与公开投影边界：apiFiles先把带`authorization`等未知属性及已知槽位错类型嵌套秘密的历史模型/multiModel配置注入磁盘，要求models/status只给各自固定且类型有效的schema、模型Key脱敏；再验证普通模型、Provider探测包装、addProvider包装及目录项的未知字段均受控400，探测负例不触网、保存负例配置字节不变且响应不回显Key。providers/modelLifecycle回归守住目录解析、调用及失败语义。该证据只覆盖本机HTTP/模拟fetch与文件字节，不证明外部Provider善意、跨进程写入或探针项目。

第50组继续非探针REST/审批结果边界并交叉R2：bridgeTunnel先证实Bridge start、stop、轮换、清轮及身份端点会静默接受未知包装，且历史对象型授权/展示字段可被truthy消费或经status发布；修后固定提供商专属schema、请求及当前provider保存凭据的字符串预算、空体兼容和公开投影，所有负例在存储/停启/触网前失败且不回显标记。approvedOperations让真实外部MCP只以`verification.state=unknown`报告不确定效果，要求宿主在覆盖验证说明前判定、队列终态unknown且重复批准零重放。测试仍使用本机HTTP和外部MCP fixture，不连接真实隧道/GitHub，也不修改或认证探针项目。

第51组继续非探针本机文件/工具/Chat包装及模型HTTP响应边界：apiFiles以真实HTTP证明tool/chat/consensus/tasks、执行控制、审批/取消、文件读写/预览/回退、检查点及Skill包装的未知字段在调度、改模式、执行/撤销、扫描、写盘、重置、分配或消费记录前400；`createOnly:'true'`不能退入覆盖，文件新建须显式独占，普通保存须64位expectedHash，错误请求保持磁盘与内存记录不变。modelLifecycle用模拟fetch锁定模型POST拒跳转、401远端正文不反射及1MiB+1响应在JSON解析前以E_RESPONSE_TOO_LARGE失败。httpSmoke等原合法调用仍作兼容回归；这些fixture不连接真实Provider、不测代理内存峰值，也不扩大暂停的探针专项。

第52组续审非探针PTY、connection-check、external本机管理包装及模型协议形状：apiFiles经真实HTTP让未知hello/jobs/report、核对创建/读取/清空、HTTP登记、stdio预览/启动及删除包装在登记客户端、推进任务、分配/清空挑战、触网/保存、分配预览、启动/停止前400，同时跑完整合法PTY状态链。modelLifecycle证明完整序列化模型POST超过12MiB时fetch计数为零；畸形/非对象arguments、64项以上tool_calls及禁用/未声明工具在工具前失败；合法Provider assistant只以固定role/content/tool_calls/function投影回送下一轮。httpSmoke把缺PTY身份明确为400/E_BAD_API_REQUEST并保留错workspace 409。均为本机/模拟Provider证据，不证明真实扩展、第三方进程或模型服务善意；Probe目录仍排除。

第53组续审非探针query、公开投影及external/workflow路由：apiFiles逐个向diagnostics/activity/status/models/logs/profile/customizations及Bridge/tool写入口加入未知query，锁定读取/重置/调度前400；用替换服务计数证明external/request与workflow预览/提交的未知query/body不会查询或分配审批，合法包装各调用一次。它还把未知session extra/clientInfo和历史customizations三层未知秘密注入内存/磁盘，要求内部会话、status与customizations GET只给固定字段，空/数组/未知定制写入逐字节零改动。相邻profile/stateIntegrity/httpSmoke/workflow/external/MCP/board测试守住合法行为；仍是本机HTTP/模块fixture，不证明远端服务、登记内容或四文件事务。

## 按风险选择回归
| 风险/模块 | 主要测试 | 证据类型与限制 |
|---|---|---|
| 路径、写入、hash、补丁、Skill | patchEngine、workspaceTools、sandbox、auditStorage、apiFiles | 临时文件系统与HTTP，含createOnly并发一胜一409；不是外部OS写进程隔离证明 |
| 模型失败、工具结果、Plan | modelLifecycle、runChat、chatMode、planRound、toolLabel | 实际调度模块+模拟模型响应，含返回式终态失败；不是提供商实测 |
| MCP、OAuth、GitHub身份、会话/board | mcpProtocol、oauth、oauthClientAuth、githubAuth、mcpBoard、board | 真实index验证OAuth issuer/撤销、公开peer不可冒用及跨主体会话；GitHub设备流以HTTP替身验证代次/单飞，非第三方实机验收 |
| 本机控制面、WS、Origin | auditControl、localControl、corsAllow、httpSmoke | 真实入口双端口API门禁、MCP Origin/认证先于解析、预检与WS；代理/跨站浏览器须另测 |
| PTY审批、取消、归属、捕获 | ptyLifecycle、ptyJobs、desktopExtension | 部分真实子进程+VS Code事件fixture，含扩展对非2xx回包的拒绝；原生终端效果须另测 |
| 隧道启停 | tunnel、bridgeTunnel、tunnelLifecycle | 解析、API及进程引用fixture；非真实公网隧道 |
| 原生扩展命令消费 | nativeRotationCommands | 真实activate+VS Code/HTTP替身；非真实IDE或隧道进程退出证明 |
| 文件编辑、webview、主题、Monaco、无障碍结构 | editorRuntime、webviewRuntime、workbenchRuntime、monacoLoading、workbenchHtml | 真实源码配DOM/Monaco/宿主fixture及静态语义检查；不等同浏览器E2E、屏幕阅读器或手机实测 |
| 配置、环境、统计、后台 | stateIntegrity、hostPersist、profile、usageTracker、adminHost | 模块与HTTP边界；不代表所有配置事务一致 |
| 截图 | chatVision、mcpProtocol | 图片路径/大小/内容契约，不证明模型理解画面 |
| 发行与启动 | installerPackaging、extensionCopy、codeServerAuth、codeServerNotRunnable、skipWorkbench | payload/副本/关键参数；安装、升级和UI另验收 |
| 文档与runner | documentationPolicy、documentationQuality、docsSite、docsHttp、testRunner | 清单/坏链接/生成一致性/HTTP及失败退出，不认证正文语义 |

具体测试文件名和路径见下方自动导航。每个测试中的assert才决定实际范围，表格只是选择入口，未列到的文件不意味着没有执行。

## 实际执行链与常见误判
- HTTP smoke会启动服务子进程，不只是搜索源码字符串；端口检查应区分UI、MCP、admin和docs。
- extensionCopy比较规范扩展与发行副本。新增资源README也可能影响列表，不能通过忽略差异让测试假绿。
- documentationPolicy在真实工作区检查漂移，并用临时git仓库验证新增/删除/坏链接等负例。生成器不得将“已登记”写成“已审查准确”。
- documentationQuality防止本次已纠正的关键矛盾回归，并检查单标题、表格/围栏和真实本页目录函数fixture；关键词断言不证明任意新解释正确。
- docsSite重新构建content.js对比快照，并检查README导航/源码hash；它可以证明生成一致性，但不能证明解释准确、布局舒适或所有链接都可交互。
- installerPackaging向不该发行的位置放fixture标记并验证不进入payload。文档源码快照同样可能成为间接打包通道，测试正文不应嵌入发行内容。

## 平台与质量边界
Windows CI还会编译输入辅助C#、解析PS并编译Inno安装器。这是编译/静态验证，不是普通用户安装、迁移、卸载保留、DPI/焦点/剪贴板实测。

仍须独立记录真实VS Code多窗口、shell integration、浏览器键盘/窄屏/缩放、手机Arena OAuth/MCP和真实模型网络错误的验收。测试文件数不是断言数、覆盖率、缺陷关闭率或安全认证。

## 新增测试规则
改功能时优先增加能使旧实现失败的行为断言，明确fixture与真实进程部分；清理临时目录/服务器，避免遗留计时器。不要为绿灯删除必要断言或修改冻结原型。测试使用非真实凭据，不把用户秘密写入fixture或日志。

F54会话修复：stateIntegrity锁定空闲TTL/全忙拒绝；mcpProtocol与mcpCancellation覆盖头校验及真实HTTP/SSE pin；externalDiscovery用真实回环服务器验证重复/空白/显式空响应SID拒绝和合法单值回传。

F54第二批：mcpProtocol新增真实HTTP整份准入/版本协商/旧版批预算与零写回归；requestLifecycle锁共享ID预算，mcpCancellation通知按202接受且不弱化归属断言。

F54第三批：patchEngine的missingTargetSafety锁新建hash/块校验、无mkdir/事件/缓存副作用和正例预览；httpSmoke经真实主机入口交叉验证。

F54第四批：executionControl/httpSmoke以真实HTTP验证Local/远端A/B资源归属、客户端上下文伪装无效、能力目录与ACL一致及实际写入仍受禁止；覆盖Read撤销/权限恢复和错误hash指引。

F54交叉复审：mcpProtocol对初始化指引与apply_patch工具目录增加hash复用范围断言，防止再次把现存文件的缓存保护泛化到缺失目标。

F54第六批：workbench.browser的narrowWorkspaceBrowser验证320/390/640工作面、输入命中/草稿、有效ARIA子角色、长名称/dirty关闭/焦点及768/1024/1440桌面保留；AXE_PATH可附加两条真实axe角色规则。

nativeRequestJson.test.js：真实HTTP+VM原生函数验证响应预算/总时限/清理，密钥轮换与停止结果未知时不重放；正例/409/500/有界坏JSON合同保持。详见工作区与命令安全测试详解。

R4：processDiagnostics在可控worker时钟及真实子进程上检查阶段元数据、默认关闭/敏感标记不泄漏/诊断输出失败隔离；testRunner补真实隔离失败/超时元数据。详见存储完整性与预算、安装与运行器测试详解。

R2/R3：externalDiscovery和stdioMcp补真实JSON/SSE/stdio矛盾响应、登记清理与已批准调用unknown/不重放，详见受控工具与工作流详解。

R2/R3续修：externalDiscovery用真实JSON/SSE验证拒绝响应不提交候选SID，后续单独批准调用沿用旧会话；unknown不重放及有效结果/通知SID正例同时保留。

R5：tunnelRegistry/tunnelOwnerFixture验证只读归属分类、坏记录/边界、真实宿主强杀后的孤儿检测及其他活进程不受影响；tunnelLifecycle检查三个provider接线。只是检测首包，无清理按钮，详见tunnel/停止进程详解。

R5第二包：tunnelReceiptProtection覆盖可信标签与旧明文隔离、密文/文件名篡改、封装失败不降级、迟到退出；Windows运行真实CurrentUser DPAPI辅助，Linux不代签Windows。无终止操作。

R5第三包：tunnelCleanup为协议/过期/确认/未知的模拟测试，tunnelCleanupWindows仅Windows执行实际句柄、归属保护和确认终止，非Windows明确未执行。原检测/保护/生命周期回归保留。

R5第四包新增tunnelCleanupAcl：真实Windows测试专用进程DACL拒绝；Linux明确不执行原生测试。夹具不入安装包，实际状态见阶段10。

F62独立复审新增三个回归，均在自建临时工作区里跑，不碰用户数据：

- `sensitiveBoundary.test.js`：`.webagentignore`在一次列目录里只被stat而不是被每个候选路径重读；编辑或删除规则文件后下一次检查即刻生效；超过512条模式或64KiB的规则文件按上限截断并标记`truncated`，不静默半截生效。它测的是规则**加载**的代价与上限，不证明匹配语义覆盖了所有秘密文件名。
- `textEncoding.test.js`：合法UTF-8（含CJK、emoji、CRLF、BOM，以及正好跨64KiB读块边界的多字节字符）内容与hash不变；非法字节（孤立代理、截断序列、overlong、`F5`）一律`E_ENCODING`且不发hash，覆盖写入时原字节保持不变。它锁定的是"被接受的读取里hash与磁盘字节一一对应"，不是编码探测或转码能力。
- `commandEncoding.test.js`：命令输出跨管道分块边界必须还原成原文；基线下逐字节输出的中文会变成一串U+FFFD并被模型当作真实结果。同时钉住尾窗口按字符截断、stdout/stderr各自独立解码。
- `networkBudget.test.js`：GitHub身份与遥测上报的外发请求必须带deadline，打到"永不回话"的端点时以`AbortError`结束且不自行重试；注入传输照样受预算约束；readCache重复记录同一hash不再重写整张表。用进程内传输替身，不发真实网络请求；它证明单次请求一定会结束，不证明端点可达或上报送达。
- `diffBudget.test.js`：差异计算有显式时间/编辑距离预算，超限抛`E_DIFF_BUDGET`而不是长期占住事件循环；被拒的补丁（含dryRun）让目标文件逐字节不变。同一文件还覆盖admin-host统计库：损坏的`reports.json`读取和写入都fail-closed并保留原字节，零字节文件仍算合法空库，发布走临时文件+rename且不留残留。预算数值可由`WEBAGENT_DIFF_TIMEOUT_MS`/`WEBAGENT_DIFF_MAX_EDIT`覆盖；测试不断言某个具体行数一定能算完。

F70新增`hostShutdown.test.js`（POSIX；Windows明确跳过，因Node无法给Windows子进程投递真实Ctrl+C，且commandJob已把命令绑到关闭即杀的OS作业）：启动真实主机、经本机API的start_command起一个带唯一参数的sleep，向主机发SIGINT后要求8秒内以0退出、且该命令不再存活。基线26a167e红——命令在独立进程组里收不到Ctrl+C，shutdown只关外部MCP，命令成了孤儿。详解见[工作区与命令安全测试](工作区与命令安全测试详解.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [adminHost.test.js](adminHost.test.js) | 9 个函数/类节点 |
| [adminIntegrity.test.js](adminIntegrity.test.js) | 63 个函数/类节点 |
| [apiFiles.test.js](apiFiles.test.js) | 59 个函数/类节点 |
| [appWindowLifecycle.test.js](appWindowLifecycle.test.js) | 79 个函数/类节点 |
| [approvedOperations.test.js](approvedOperations.test.js) | 17 个函数/类节点 |
| [auditControl.test.js](auditControl.test.js) | 20 个函数/类节点 |
| [auditStorage.test.js](auditStorage.test.js) | 19 个函数/类节点 |
| [board.test.js](board.test.js) | 4 个函数/类节点 |
| [bridgeTunnel.test.js](bridgeTunnel.test.js) | 34 个函数/类节点 |
| [chatMode.test.js](chatMode.test.js) | 0 个函数/类节点 |
| [chatVision.test.js](chatVision.test.js) | 21 个函数/类节点 |
| [codeServerAuth.test.js](codeServerAuth.test.js) | 0 个函数/类节点 |
| [codeServerLifecycle.test.js](codeServerLifecycle.test.js) | 118 个函数/类节点 |
| [codeServerNotRunnable.test.js](codeServerNotRunnable.test.js) | 0 个函数/类节点 |
| [commandEncoding.test.js](commandEncoding.test.js) | 8 个函数/类节点 |
| [computerUseScripts.test.js](computerUseScripts.test.js) | 7 个函数/类节点 |
| [connectionCheck.test.js](connectionCheck.test.js) | 18 个函数/类节点 |
| [corsAllow.test.js](corsAllow.test.js) | 20 个函数/类节点 |
| [dangerousCommands.test.js](dangerousCommands.test.js) | 12 个函数/类节点 |
| [desktopExtension.test.js](desktopExtension.test.js) | 0 个函数/类节点 |
| [diffBudget.test.js](diffBudget.test.js) | 19 个函数/类节点 |
| [docsHttp.test.js](docsHttp.test.js) | 14 个函数/类节点 |
| [docsSite.test.js](docsSite.test.js) | 7 个函数/类节点 |
| [documentationLearning.test.js](documentationLearning.test.js) | 7 个函数/类节点 |
| [documentationLinks.test.js](documentationLinks.test.js) | 25 个函数/类节点 |
| [documentationPolicy.test.js](documentationPolicy.test.js) | 12 个函数/类节点 |
| [documentationQuality.test.js](documentationQuality.test.js) | 10 个函数/类节点 |
| [editorReview.test.js](editorReview.test.js) | 29 个函数/类节点 |
| [editorRuntime.test.js](editorRuntime.test.js) | 38 个函数/类节点 |
| [eventBus.test.js](eventBus.test.js) | 9 个函数/类节点 |
| [executionControl.test.js](executionControl.test.js) | 41 个函数/类节点 |
| [extensionCopy.test.js](extensionCopy.test.js) | 2 个函数/类节点 |
| [extensionHostSafety.test.js](extensionHostSafety.test.js) | 26 个函数/类节点 |
| [externalDiscovery.test.js](externalDiscovery.test.js) | 13 个函数/类节点 |
| [fileCheckpoints.test.js](fileCheckpoints.test.js) | 25 个函数/类节点 |
| [fileReadSafety.test.js](fileReadSafety.test.js) | 21 个函数/类节点 |
| [githubAuth.test.js](githubAuth.test.js) | 21 个函数/类节点 |
| [githubNetwork.test.js](githubNetwork.test.js) | 82 个函数/类节点 |
| [hostDiagnostics.test.js](hostDiagnostics.test.js) | 9 个函数/类节点 |
| [hostLaunch.test.js](hostLaunch.test.js) | 62 个函数/类节点 |
| [hostPersist.test.js](hostPersist.test.js) | 6 个函数/类节点 |
| [hostShutdown.test.js](hostShutdown.test.js) | 13 个函数/类节点 |
| [httpSmoke.test.js](httpSmoke.test.js) | 46 个函数/类节点 |
| [identityRequestLifetime.test.js](identityRequestLifetime.test.js) | 16 个函数/类节点 |
| [installerPackaging.test.js](installerPackaging.test.js) | 26 个函数/类节点 |
| [installerPreparation.test.js](installerPreparation.test.js) | 61 个函数/类节点 |
| [localControl.test.js](localControl.test.js) | 1 个函数/类节点 |
| [mcpBoard.test.js](mcpBoard.test.js) | 19 个函数/类节点 |
| [mcpCallerIsolation.test.js](mcpCallerIsolation.test.js) | 18 个函数/类节点 |
| [mcpCancellation.test.js](mcpCancellation.test.js) | 24 个函数/类节点 |
| [mcpInterop.test.js](mcpInterop.test.js) | 12 个函数/类节点 |
| [mcpProtocol.test.js](mcpProtocol.test.js) | 53 个函数/类节点 |
| [memoryRecall.test.js](memoryRecall.test.js) | 8 个函数/类节点 |
| [modelLifecycle.test.js](modelLifecycle.test.js) | 55 个函数/类节点 |
| [monacoLoading.test.js](monacoLoading.test.js) | 12 个函数/类节点 |
| [nativeChatStream.test.js](nativeChatStream.test.js) | 27 个函数/类节点 |
| [nativeRequestJson.test.js](nativeRequestJson.test.js) | 28 个函数/类节点 |
| [nativeRotationCommands.test.js](nativeRotationCommands.test.js) | 58 个函数/类节点 |
| [networkBudget.test.js](networkBudget.test.js) | 22 个函数/类节点 |
| [oauth.test.js](oauth.test.js) | 18 个函数/类节点 |
| [oauthClientAuth.test.js](oauthClientAuth.test.js) | 29 个函数/类节点 |
| [oauthRateLimit.test.js](oauthRateLimit.test.js) | 15 个函数/类节点 |
| [oauthSpentRefreshBudget.test.js](oauthSpentRefreshBudget.test.js) | 8 个函数/类节点 |
| [operatorQueueCapacity.test.js](operatorQueueCapacity.test.js) | 5 个函数/类节点 |
| [patchEngine.test.js](patchEngine.test.js) | 20 个函数/类节点 |
| [planRound.test.js](planRound.test.js) | 6 个函数/类节点 |
| [probeAnalysis.test.js](probeAnalysis.test.js) | 6 个函数/类节点 |
| [probeBridge.test.js](probeBridge.test.js) | 11 个函数/类节点 |
| [probeCaptureLifecycle.test.js](probeCaptureLifecycle.test.js) | 30 个函数/类节点 |
| [probeCompanion.test.js](probeCompanion.test.js) | 39 个函数/类节点 |
| [probeHistory.test.js](probeHistory.test.js) | 7 个函数/类节点 |
| [probeIntegration.test.js](probeIntegration.test.js) | 29 个函数/类节点 |
| [probeLegacyImport.test.js](probeLegacyImport.test.js) | 4 个函数/类节点 |
| [probePairLifecycle.test.js](probePairLifecycle.test.js) | 15 个函数/类节点 |
| [probeQuestionGuard.test.js](probeQuestionGuard.test.js) | 31 个函数/类节点 |
| [probeTransport.test.js](probeTransport.test.js) | 59 个函数/类节点 |
| [processDiagnostics.test.js](processDiagnostics.test.js) | 35 个函数/类节点 |
| [profile.test.js](profile.test.js) | 8 个函数/类节点 |
| [providers.test.js](providers.test.js) | 30 个函数/类节点 |
| [ptyJobs.test.js](ptyJobs.test.js) | 12 个函数/类节点 |
| [ptyLifecycle.test.js](ptyLifecycle.test.js) | 69 个函数/类节点 |
| [publicHttps.test.js](publicHttps.test.js) | 19 个函数/类节点 |
| [requestLifecycle.test.js](requestLifecycle.test.js) | 13 个函数/类节点 |
| [resourceBudget.test.js](resourceBudget.test.js) | 14 个函数/类节点 |
| [runChat.test.js](runChat.test.js) | 30 个函数/类节点 |
| [sandbox.test.js](sandbox.test.js) | 3 个函数/类节点 |
| [searchWorkerLifecycle.test.js](searchWorkerLifecycle.test.js) | 14 个函数/类节点 |
| [sensitiveBoundary.test.js](sensitiveBoundary.test.js) | 6 个函数/类节点 |
| [skillsLifecycle.test.js](skillsLifecycle.test.js) | 19 个函数/类节点 |
| [skipWorkbench.test.js](skipWorkbench.test.js) | 16 个函数/类节点 |
| [stateIntegrity.test.js](stateIntegrity.test.js) | 40 个函数/类节点 |
| [stdioMcp.test.js](stdioMcp.test.js) | 25 个函数/类节点 |
| [stdioOwnerFixture.js](stdioOwnerFixture.js) | 2 个函数/类节点 |
| [stdioServerFixture.js](stdioServerFixture.js) | 3 个函数/类节点 |
| [taskProgress.test.js](taskProgress.test.js) | 9 个函数/类节点 |
| [testRunner.test.js](testRunner.test.js) | 13 个函数/类节点 |
| [textEncoding.test.js](textEncoding.test.js) | 10 个函数/类节点 |
| [toolLabel.test.js](toolLabel.test.js) | 0 个函数/类节点 |
| [traceIntegration.test.js](traceIntegration.test.js) | 4 个函数/类节点 |
| [tunnel.test.js](tunnel.test.js) | 14 个函数/类节点 |
| [tunnelCleanup.test.js](tunnelCleanup.test.js) | 30 个函数/类节点 |
| [tunnelCleanupAcl.test.js](tunnelCleanupAcl.test.js) | 1 个函数/类节点 |
| [tunnelCleanupAclFixture.cs](tunnelCleanupAclFixture.cs) | 文件级登记；未做符号完整性证明 |
| [tunnelCleanupAclFixture.ps1](tunnelCleanupAclFixture.ps1) | 文件级登记；未做符号完整性证明 |
| [tunnelCleanupWindows.test.js](tunnelCleanupWindows.test.js) | 17 个函数/类节点 |
| [tunnelHelperDiagnostics.test.js](tunnelHelperDiagnostics.test.js) | 20 个函数/类节点 |
| [tunnelLifecycle.test.js](tunnelLifecycle.test.js) | 17 个函数/类节点 |
| [tunnelOwnerFixture.js](tunnelOwnerFixture.js) | 4 个函数/类节点 |
| [tunnelReceiptProtection.test.js](tunnelReceiptProtection.test.js) | 17 个函数/类节点 |
| [tunnelRecoveryLauncher.test.js](tunnelRecoveryLauncher.test.js) | 11 个函数/类节点 |
| [tunnelRegistry.test.js](tunnelRegistry.test.js) | 14 个函数/类节点 |
| [usageTracker.test.js](usageTracker.test.js) | 4 个函数/类节点 |
| [webviewRuntime.test.js](webviewRuntime.test.js) | 27 个函数/类节点 |
| [workbench.browser.js](workbench.browser.js) | 278 个函数/类节点 |
| [workbenchHtml.test.js](workbenchHtml.test.js) | 1 个函数/类节点 |
| [workbenchRuntime.test.js](workbenchRuntime.test.js) | 472 个函数/类节点 |
| [workflowPreconditions.test.js](workflowPreconditions.test.js) | 15 个函数/类节点 |
| [workspaceEntry.test.js](workspaceEntry.test.js) | 20 个函数/类节点 |
| [workspaceTools.test.js](workspaceTools.test.js) | 17 个函数/类节点 |
<!-- docs-inventory:end -->

## 真实浏览器回归（不是DOM fixture）
`npm run test:browser --prefix webagent-core/agent-host`运行workbench.browser.js；首次需在agent-host运行`npx playwright install chromium`（Linux还需系统库）。CI有独立workbench-browser任务，安装浏览器依赖后运行。普通npm test仍跑跨平台基础套件，未运行浏览器命令不能声称浏览器验收。逐函数说明见utils/主机诊断与调用追踪详解。


受控外部MCP与固定工作流新增模块、审批页面和真实HTTP回归的逐函数解释见 `webagent-core/agent-host/src/utils/受控工具与工作流详解.md`。默认回环HTTP(S)，另支持本机显式确认的公网HTTPS及stdio启动；工具仍逐次本机批准，不自动安装或重试。

## 请求取消与失败外包回归
requestLifecycle.test.js：按会话/凭据和带类型RPC ID隔离取消；重复与容量拒绝、超时/断连/抛错清理；共享失败判定正反例。mcpCancellation.test.js：真实Express/认证HTTP、两个同名初始化客户端、取消ID=0、未认证拒绝、ID复用与直接API结果式失败。工具使用受控可取消夹具，不冒称真实桌面进程或第三方兼容性。runChat.test.js增加无效/缺配置合并模型不产生consensus/工具调用、不改变已有分支，随后明确builtin可合并。

新增[执行控制源码与测试解释](../src/utils/执行控制详解.md)对应executionControl.test.js，覆盖模式互斥与持久权限，不代表Windows/手机新控件实测。

第41组：workbenchRuntime验证经典重置密钥的真实回调/未知消费；bridgeTunnel覆盖HTTP绑定/CAS、保存前/后失败与旧空体兼容；浏览器合成响应场景见主机诊断与调用追踪详解。三类证据不互相冒充。

第42组：经典Bridge页内启停独立互斥/代次/写后读失败由VM验证；真实bind浏览器合成响应另证；bridgeTunnel以HTTP验证停止绑定、启动在途可停止及错误的前后副作用。不是公网/用户进程退出验收。

第43组补原生命令消费：nativeRotationCommands先复现HTTP500仍提示“已重置”，再覆盖绑定/CAS、确认、坏合同、409拒绝、写后读分离与停止严格判定；后端绑定合同仍由bridgeTunnel证明。

nativeChatStream.test.js：真实回环HTTP与VM原生扩展，验证NDJSON失败/终态/预算/取消和两个消费者的历史；入口及helper main详见工作区与命令安全测试详解。
