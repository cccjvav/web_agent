# 测试导航：测了什么，以及没有证明什么

## 职责与运行
这里存放可独立运行的 `.test.js`，统一入口是上一级scripts/run-tests.js。runner检查依赖和必需测试，发现其他测试文件，以独立进程执行，超时/失败非零退出；测试失败仍汇总其余结果。

从仓库根执行：

```sh
npm ci --prefix webagent-core/agent-host
npm test --prefix webagent-core/agent-host
npm test --prefix webagent-core/agent-host -- --filter=oauth
```

也可直接node某个测试文件。筛选结果必须说明范围，不可把一次筛选通过写成全量通过；不要手工维护历史“总共多少测试”的固定列表，文件导航和runner输出才是当次事实。

## 按风险选择回归
| 风险/模块 | 主要测试 | 证据类型与限制 |
|---|---|---|
| 路径、写入、hash、补丁、Skill | patchEngine、workspaceTools、sandbox、auditStorage、apiFiles | 临时文件系统与HTTP；不是OS沙箱证明 |
| 模型失败、工具结果、Plan | modelLifecycle、runChat、chatMode、planRound、toolLabel | 实际调度模块+模拟模型响应，不是提供商实测 |
| MCP、OAuth、会话/board | mcpProtocol、oauth、oauthClientAuth、mcpBoard、board | 本地HTTP/模块协议回归，不是所有第三方客户端验收 |
| 本机控制面、WS、Origin | auditControl、localControl、corsAllow、httpSmoke | 本地真实HTTP/WS与fixture；代理部署须另测 |
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
| [apiFiles.test.js](apiFiles.test.js) | 13 个函数/类节点 |
| [auditControl.test.js](auditControl.test.js) | 17 个函数/类节点 |
| [auditStorage.test.js](auditStorage.test.js) | 19 个函数/类节点 |
| [board.test.js](board.test.js) | 4 个函数/类节点 |
| [bridgeTunnel.test.js](bridgeTunnel.test.js) | 20 个函数/类节点 |
| [chatMode.test.js](chatMode.test.js) | 0 个函数/类节点 |
| [chatVision.test.js](chatVision.test.js) | 20 个函数/类节点 |
| [codeServerAuth.test.js](codeServerAuth.test.js) | 0 个函数/类节点 |
| [codeServerNotRunnable.test.js](codeServerNotRunnable.test.js) | 0 个函数/类节点 |
| [corsAllow.test.js](corsAllow.test.js) | 20 个函数/类节点 |
| [dangerousCommands.test.js](dangerousCommands.test.js) | 11 个函数/类节点 |
| [desktopExtension.test.js](desktopExtension.test.js) | 0 个函数/类节点 |
| [docsHttp.test.js](docsHttp.test.js) | 14 个函数/类节点 |
| [docsSite.test.js](docsSite.test.js) | 4 个函数/类节点 |
| [documentationPolicy.test.js](documentationPolicy.test.js) | 11 个函数/类节点 |
| [documentationQuality.test.js](documentationQuality.test.js) | 9 个函数/类节点 |
| [editorRuntime.test.js](editorRuntime.test.js) | 33 个函数/类节点 |
| [eventBus.test.js](eventBus.test.js) | 9 个函数/类节点 |
| [extensionCopy.test.js](extensionCopy.test.js) | 2 个函数/类节点 |
| [githubAuth.test.js](githubAuth.test.js) | 8 个函数/类节点 |
| [hostPersist.test.js](hostPersist.test.js) | 3 个函数/类节点 |
| [httpSmoke.test.js](httpSmoke.test.js) | 40 个函数/类节点 |
| [installerPackaging.test.js](installerPackaging.test.js) | 9 个函数/类节点 |
| [localControl.test.js](localControl.test.js) | 1 个函数/类节点 |
| [mcpBoard.test.js](mcpBoard.test.js) | 6 个函数/类节点 |
| [mcpProtocol.test.js](mcpProtocol.test.js) | 31 个函数/类节点 |
| [modelLifecycle.test.js](modelLifecycle.test.js) | 16 个函数/类节点 |
| [monacoLoading.test.js](monacoLoading.test.js) | 12 个函数/类节点 |
| [oauth.test.js](oauth.test.js) | 15 个函数/类节点 |
| [oauthClientAuth.test.js](oauthClientAuth.test.js) | 8 个函数/类节点 |
| [patchEngine.test.js](patchEngine.test.js) | 4 个函数/类节点 |
| [planRound.test.js](planRound.test.js) | 6 个函数/类节点 |
| [profile.test.js](profile.test.js) | 1 个函数/类节点 |
| [providers.test.js](providers.test.js) | 6 个函数/类节点 |
| [ptyJobs.test.js](ptyJobs.test.js) | 12 个函数/类节点 |
| [ptyLifecycle.test.js](ptyLifecycle.test.js) | 32 个函数/类节点 |
| [resourceBudget.test.js](resourceBudget.test.js) | 14 个函数/类节点 |
| [runChat.test.js](runChat.test.js) | 21 个函数/类节点 |
| [sandbox.test.js](sandbox.test.js) | 3 个函数/类节点 |
| [skipWorkbench.test.js](skipWorkbench.test.js) | 16 个函数/类节点 |
| [stateIntegrity.test.js](stateIntegrity.test.js) | 14 个函数/类节点 |
| [testRunner.test.js](testRunner.test.js) | 1 个函数/类节点 |
| [toolLabel.test.js](toolLabel.test.js) | 0 个函数/类节点 |
| [tunnel.test.js](tunnel.test.js) | 11 个函数/类节点 |
| [tunnelLifecycle.test.js](tunnelLifecycle.test.js) | 13 个函数/类节点 |
| [usageTracker.test.js](usageTracker.test.js) | 4 个函数/类节点 |
| [webviewRuntime.test.js](webviewRuntime.test.js) | 25 个函数/类节点 |
| [workbenchHtml.test.js](workbenchHtml.test.js) | 0 个函数/类节点 |
| [workbenchRuntime.test.js](workbenchRuntime.test.js) | 18 个函数/类节点 |
| [workspaceTools.test.js](workspaceTools.test.js) | 11 个函数/类节点 |
<!-- docs-inventory:end -->
