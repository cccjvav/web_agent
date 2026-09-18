# 测试导航：测了什么，以及没有证明什么

下表列出已有逐fixture/断言正文的阅读入口；测试持续新增，不以历史52项计数冒充当前全部测试的逐句认证，也不代表真机验收通过。

## 逐测试详解

| 人工正文 | 对应测试（省略.test.js） |
|---|---|
| [模式画像与Plan测试详解](模式画像与Plan测试详解.md) | chatMode、toolLabel、providers、profile、planRound |
| [安装与运行器测试详解](安装与运行器测试详解.md) | testRunner、codeServerAuth、extensionCopy、desktopExtension、codeServerNotRunnable、installerPackaging |
| [文档守卫测试详解](文档守卫测试详解.md) | documentationPolicy、documentationQuality、documentationLearning |
| [Chat模型与图像测试详解](Chat模型与图像测试详解.md) | runChat、modelLifecycle、chatVision |
| [浏览器与Webview测试详解](浏览器与Webview测试详解.md) | monacoLoading、workbenchRuntime、editorRuntime、webviewRuntime |
| [存储完整性与预算测试详解](存储完整性与预算测试详解.md) | stateIntegrity、resourceBudget、auditStorage、hostPersist、usageTracker |
| [PTY与隧道测试详解](PTY与隧道测试详解.md) | ptyJobs、ptyLifecycle、tunnel、tunnelLifecycle、bridgeTunnel |
| [任务板与事件流测试详解](任务板与事件流测试详解.md) | board、mcpBoard、eventBus |
| [工作区与命令安全测试详解](工作区与命令安全测试详解.md) | dangerousCommands、sandbox、workspaceTools |
| [本机边界与跨站测试详解](本机边界与跨站测试详解.md) | auditControl、localControl、corsAllow |
| [OAuth与GitHub测试详解](OAuth与GitHub测试详解.md) | oauth、oauthClientAuth、githubAuth |
| [补丁与编辑API测试详解](补丁与编辑API测试详解.md) | patchEngine、apiFiles |
| [MCP协议与整机入口测试详解](MCP协议与整机入口测试详解.md) | mcpProtocol、httpSmoke、skipWorkbench |
| [统计与文档测试](统计与文档测试详解.md) | adminHost、docsSite、docsHttp |
| [工作台HTML结构与测试](../../workbench/页面结构详解.md) | workbenchHtml |

documentationLearning检查全部清单源文件的正文登记；对JS检查具名函数/类方法提及，对非JS检查文件名关联。总计130个JS与36个非JS对应60篇详解，只有机械遗漏/漂移检查，不认证解释准确性，也不代表Windows/Conda实测。

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

## 按风险选择回归
| 风险/模块 | 主要测试 | 证据类型与限制 |
|---|---|---|
| 路径、写入、hash、补丁、Skill | patchEngine、workspaceTools、sandbox、auditStorage、apiFiles | 临时文件系统与HTTP；不是OS沙箱证明 |
| 模型失败、工具结果、Plan | modelLifecycle、runChat、chatMode、planRound、toolLabel | 实际调度模块+模拟模型响应，不是提供商实测 |
| MCP、OAuth、会话/board | mcpProtocol、oauth、oauthClientAuth、mcpBoard、board | 真实index验证OAuth issuer/撤销、公开peer不可冒用及跨主体会话；另测取消具体凭据隔离，非第三方实机验收 |
| 本机控制面、WS、Origin | auditControl、localControl、corsAllow、httpSmoke | 真实入口双端口API门禁、MCP Origin/认证先于解析、预检与WS；代理/跨站浏览器须另测 |
| PTY审批、取消、归属、捕获 | ptyLifecycle、ptyJobs、desktopExtension | 部分真实子进程+VS Code事件fixture；原生终端效果须另测 |
| 隧道启停 | tunnel、bridgeTunnel、tunnelLifecycle | 解析、API及进程引用fixture；非真实公网隧道 |
| 文件编辑、webview、主题、Monaco | editorRuntime、webviewRuntime、workbenchRuntime、monacoLoading、workbenchHtml | 真实源码配DOM/Monaco/宿主fixture，不等同浏览器E2E |
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

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [adminHost.test.js](adminHost.test.js) | 9 个函数/类节点 |
| [apiFiles.test.js](apiFiles.test.js) | 32 个函数/类节点 |
| [approvedOperations.test.js](approvedOperations.test.js) | 12 个函数/类节点 |
| [auditControl.test.js](auditControl.test.js) | 20 个函数/类节点 |
| [auditStorage.test.js](auditStorage.test.js) | 19 个函数/类节点 |
| [board.test.js](board.test.js) | 4 个函数/类节点 |
| [bridgeTunnel.test.js](bridgeTunnel.test.js) | 32 个函数/类节点 |
| [chatMode.test.js](chatMode.test.js) | 0 个函数/类节点 |
| [chatVision.test.js](chatVision.test.js) | 21 个函数/类节点 |
| [codeServerAuth.test.js](codeServerAuth.test.js) | 0 个函数/类节点 |
| [codeServerNotRunnable.test.js](codeServerNotRunnable.test.js) | 0 个函数/类节点 |
| [connectionCheck.test.js](connectionCheck.test.js) | 18 个函数/类节点 |
| [corsAllow.test.js](corsAllow.test.js) | 20 个函数/类节点 |
| [dangerousCommands.test.js](dangerousCommands.test.js) | 11 个函数/类节点 |
| [desktopExtension.test.js](desktopExtension.test.js) | 0 个函数/类节点 |
| [docsHttp.test.js](docsHttp.test.js) | 14 个函数/类节点 |
| [docsSite.test.js](docsSite.test.js) | 7 个函数/类节点 |
| [documentationLearning.test.js](documentationLearning.test.js) | 7 个函数/类节点 |
| [documentationLinks.test.js](documentationLinks.test.js) | 21 个函数/类节点 |
| [documentationPolicy.test.js](documentationPolicy.test.js) | 12 个函数/类节点 |
| [documentationQuality.test.js](documentationQuality.test.js) | 10 个函数/类节点 |
| [editorReview.test.js](editorReview.test.js) | 29 个函数/类节点 |
| [editorRuntime.test.js](editorRuntime.test.js) | 37 个函数/类节点 |
| [eventBus.test.js](eventBus.test.js) | 9 个函数/类节点 |
| [executionControl.test.js](executionControl.test.js) | 28 个函数/类节点 |
| [extensionCopy.test.js](extensionCopy.test.js) | 2 个函数/类节点 |
| [externalDiscovery.test.js](externalDiscovery.test.js) | 13 个函数/类节点 |
| [fileCheckpoints.test.js](fileCheckpoints.test.js) | 25 个函数/类节点 |
| [githubAuth.test.js](githubAuth.test.js) | 8 个函数/类节点 |
| [hostDiagnostics.test.js](hostDiagnostics.test.js) | 9 个函数/类节点 |
| [hostPersist.test.js](hostPersist.test.js) | 6 个函数/类节点 |
| [httpSmoke.test.js](httpSmoke.test.js) | 42 个函数/类节点 |
| [installerPackaging.test.js](installerPackaging.test.js) | 23 个函数/类节点 |
| [localControl.test.js](localControl.test.js) | 1 个函数/类节点 |
| [mcpBoard.test.js](mcpBoard.test.js) | 19 个函数/类节点 |
| [mcpCancellation.test.js](mcpCancellation.test.js) | 14 个函数/类节点 |
| [mcpProtocol.test.js](mcpProtocol.test.js) | 33 个函数/类节点 |
| [memoryRecall.test.js](memoryRecall.test.js) | 8 个函数/类节点 |
| [modelLifecycle.test.js](modelLifecycle.test.js) | 21 个函数/类节点 |
| [monacoLoading.test.js](monacoLoading.test.js) | 12 个函数/类节点 |
| [oauth.test.js](oauth.test.js) | 15 个函数/类节点 |
| [oauthClientAuth.test.js](oauthClientAuth.test.js) | 29 个函数/类节点 |
| [oauthRateLimit.test.js](oauthRateLimit.test.js) | 15 个函数/类节点 |
| [patchEngine.test.js](patchEngine.test.js) | 7 个函数/类节点 |
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
| [profile.test.js](profile.test.js) | 8 个函数/类节点 |
| [providers.test.js](providers.test.js) | 30 个函数/类节点 |
| [ptyJobs.test.js](ptyJobs.test.js) | 12 个函数/类节点 |
| [ptyLifecycle.test.js](ptyLifecycle.test.js) | 59 个函数/类节点 |
| [publicHttps.test.js](publicHttps.test.js) | 19 个函数/类节点 |
| [requestLifecycle.test.js](requestLifecycle.test.js) | 12 个函数/类节点 |
| [resourceBudget.test.js](resourceBudget.test.js) | 14 个函数/类节点 |
| [runChat.test.js](runChat.test.js) | 29 个函数/类节点 |
| [sandbox.test.js](sandbox.test.js) | 3 个函数/类节点 |
| [searchWorkerLifecycle.test.js](searchWorkerLifecycle.test.js) | 14 个函数/类节点 |
| [skillsLifecycle.test.js](skillsLifecycle.test.js) | 19 个函数/类节点 |
| [skipWorkbench.test.js](skipWorkbench.test.js) | 16 个函数/类节点 |
| [stateIntegrity.test.js](stateIntegrity.test.js) | 25 个函数/类节点 |
| [stdioMcp.test.js](stdioMcp.test.js) | 24 个函数/类节点 |
| [stdioOwnerFixture.js](stdioOwnerFixture.js) | 2 个函数/类节点 |
| [stdioServerFixture.js](stdioServerFixture.js) | 3 个函数/类节点 |
| [taskProgress.test.js](taskProgress.test.js) | 9 个函数/类节点 |
| [testRunner.test.js](testRunner.test.js) | 1 个函数/类节点 |
| [toolLabel.test.js](toolLabel.test.js) | 0 个函数/类节点 |
| [traceIntegration.test.js](traceIntegration.test.js) | 4 个函数/类节点 |
| [tunnel.test.js](tunnel.test.js) | 14 个函数/类节点 |
| [tunnelLifecycle.test.js](tunnelLifecycle.test.js) | 14 个函数/类节点 |
| [usageTracker.test.js](usageTracker.test.js) | 4 个函数/类节点 |
| [webviewRuntime.test.js](webviewRuntime.test.js) | 27 个函数/类节点 |
| [workbench.browser.js](workbench.browser.js) | 203 个函数/类节点 |
| [workbenchHtml.test.js](workbenchHtml.test.js) | 0 个函数/类节点 |
| [workbenchRuntime.test.js](workbenchRuntime.test.js) | 337 个函数/类节点 |
| [workflowPreconditions.test.js](workflowPreconditions.test.js) | 9 个函数/类节点 |
| [workspaceEntry.test.js](workspaceEntry.test.js) | 20 个函数/类节点 |
| [workspaceTools.test.js](workspaceTools.test.js) | 15 个函数/类节点 |
<!-- docs-inventory:end -->

## 真实浏览器回归（不是DOM fixture）
`npm run test:browser --prefix webagent-core/agent-host`运行workbench.browser.js；首次需在agent-host运行`npx playwright install chromium`（Linux还需系统库）。CI有独立workbench-browser任务，安装浏览器依赖后运行。普通npm test仍跑跨平台基础套件，未运行浏览器命令不能声称浏览器验收。逐函数说明见utils/主机诊断与调用追踪详解。


受控外部MCP与固定工作流新增模块、审批页面和真实HTTP回归的逐函数解释见 `webagent-core/agent-host/src/utils/受控工具与工作流详解.md`。默认回环HTTP(S)，另支持本机显式确认的公网HTTPS及stdio启动；工具仍逐次本机批准，不自动安装或重试。

## 请求取消与失败外包回归
requestLifecycle.test.js：按会话/凭据和带类型RPC ID隔离取消；重复与容量拒绝、超时/断连/抛错清理；共享失败判定正反例。mcpCancellation.test.js：真实Express/认证HTTP、两个同名初始化客户端、取消ID=0、未认证拒绝、ID复用与直接API结果式失败。工具使用受控可取消夹具，不冒称真实桌面进程或第三方兼容性。runChat.test.js增加无效/缺配置合并模型不产生consensus/工具调用、不改变已有分支，随后明确builtin可合并。

新增[执行控制源码与测试解释](../src/utils/执行控制详解.md)对应executionControl.test.js，覆盖模式互斥与持久权限，不代表Windows/手机新控件实测。

第41组：workbenchRuntime验证经典重置密钥的真实回调/未知消费；bridgeTunnel覆盖HTTP绑定/CAS、保存前/后失败与旧空体兼容；浏览器合成响应场景见主机诊断与调用追踪详解。三类证据不互相冒充。

第42组：经典Bridge页内启停独立互斥/代次/写后读失败由VM验证；真实bind浏览器合成响应另证；bridgeTunnel以HTTP验证停止绑定、启动在途可停止及错误的前后副作用。不是公网/用户进程退出验收。
