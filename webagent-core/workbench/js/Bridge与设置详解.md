# Bridge页面、模型表与定制设置逐函数讲解

覆盖[bridge.js](bridge.js)、[settings.js](settings.js)。所有fetch用当前源相对URL；公共隧道不等于放行工作台UI/API。视图提示不是真实外部客户端连接证据。

## 1. bridge.js统计与连接指引函数

| 函数 | 参数/返回 | 状态/回调/边界 |
|---|---|---|
| formatClock(ms) | 时间→本地时钟文本 | 空值空字符串；内部pad(n)补两位；本地时区不是UTC |
| logBridgeTool() | 无→Promise | 兼容事件入口，仅委托refreshBridgeActivity，不在浏览器累加，以免重复或混入本地Chat |
| paintBridgeActivity(snapshot) | 服务端快照→undefined | 校验stats/logs及身份，先绘远程Tasks；epoch:revision未变仅跳过日志重绘。覆盖state.stats、paintStats，按追踪/摘要重建有界日志，计数不等于当前仍连接 |
| refreshBridgeActivity() | 无→Promise<boolean> | 单飞GET本机/api/bridge/activity，5秒AbortController超时；成功完整paint后true，HTTP/解析/快照失败显示同步错误并false，允许下一次相同版本快照恢复；finally清timer与pending |
| paintStats() | 无→undefined | 显示调用/失败/成功率/平均秒；healthLine优先；会话数取httpSessions/alive/clients或调用记录启发式，最后工具附formatClock |
| resetRound() | 无→Promise<boolean> | resetRoundPending拒绝页内重复；POST后要求HTTP成功、JSON对象且success严格true才确认写入，再分别刷新status和活动快照。写确认但读取失败仍返回true并提示手动核对；写未确认false且不假装本地清零、不自动重试 |
| selectedClientInfo() | 无→客户端或null | 当前selectedClient优先，否则arena；找不到null |
| promptText() | 无→字符串 | 有选中卡片时只返回其prompt或空字符串；仅找不到卡片时才用status.prompt或mcpUrl+说明回退，不能向不支持卡片泄露全局密钥提示 |
| paintClients() | 无→undefined | map卡片/步骤；needsPlus严格true/false/其他分别显示要Plus/无需Plus/待核对，verification=unverified加未验证徽标；click修改selectedClient并重画；copyRules按connectMode显示；配对码只在Bridge运行且有效信息存在时展示，供兼容OAuth客户端使用，不称某厂商专属 |
| renderBrowser(tab) | tab→undefined | 绘连接指引页面，不是加载官方站点的真实浏览器进程；各分支如下 |
| arenaConnect() | 无→Promise<void> | 仅切右Bridge、灭会话灯、提示去真实Arena配置；不发送任务给本机Code或外部Arena |
| openSite(key) | 站点键→Promise<void> | 不启动隧道，仅尝试复制prompt，建/复用browser tab、关modal、切Bridge并激活；打开浏览器页不再隐式启动公网Bridge，用户另点启动Bridge |

**renderBrowser**：不再生成Arena/ChatGPT仿站登录、附件和发送界面。DeepSeek分支标兼容性未验证，只给历史参考来源和条件式最小核对步骤，不给固定商店安装链接；其余站点统一显示“外部客户端连接指引”、外链和prompt，明确不代登录/发送任务。文本escape；外链先用URL解析，再只允许http/https协议，非法地址不生成可点击链接。arenaConnect保留兼容函数但不再由仿站发送按钮触发，不连接外部会话。

## 2. bridge.js启动/停止/状态函数

**bridgeStartPending()**返回本页是否有当前启动意图，供真实bind切换按钮在启动中转为停止，而不是按旧status再次启动。**paintBridgeAction()**按启动/停止ticket绘按钮；启动中停止仍可用，停止中禁两按钮，隐藏旧复制banner。**bridgeOutcome(message)**同步设置页与右栏的两个aria-live结果区，普通状态刷新不清除动作结果。

**bridgeRequest(path,body,timeoutMs=10000)**同源no-store GET/POST，AbortController覆盖响应头和JSON；解析后还核对signal.aborted，finally清timer。启动POST45秒、停止POST15秒、预读10秒；取消等待不证明后端未执行。原隧道默认25秒就绪期限和停止清理不因此改变。

**startBridge()**页内单飞，不在停止在途时启动。同步捕获workspaceRoot/hostInstanceId、provider及所选domain/token，预读后复查页面绑定及实时核心状态；实时已运行则不重启，不混入await期间改过的新草稿。当前ticket才允许POST。回包必须HTTP成功、success/running严格true、provider匹配、完整密钥/路径/URL合同（复用validRotatedSecret并以空旧值只验证地址），不据此认证公网可达。

确认写后读取失败、被更新读取取代、当前主机/地址/密钥/运行标记不符，保留“原主机启动已确认，当前未核对”，返回true；仅刷新确认的同目标地址才点灯并切右栏。**不再自动复制或自动显示已复制banner**，用户核对后手动复制。发送前失败明确未启动POST；发出后失败保守未确认，固定文案不回显原始错误或Token；同绑定时尝试一次只读刷新，不重复POST。停止递增代次后，旧预读不再POST、旧启动回包不覆盖结果/点灯/复制；已确认写而后读途中被停止取代仍返回写确认true，但不覆盖新结果。

**stopBridge()**独立停止guard，立即取代本页启动ticket，不等待启动回包或密钥轮换锁。捕获当前绑定直接POST，不增加可能挂住停止的GET；没有绑定就不发送。HTTP成功且success严格true/running严格false才确认；后读异常/不匹配仍保留确认true，只有同绑定、bridgeRunning=false才灭灯。失败明确停止未确认，不自动重试/强杀。finally释放自己的guard，旧启动finally不能释放较新的启动ticket。

停止接口收到任一绑定字段便要求完整匹配；旧无字段调用保持兼容。页面代次不是服务器永久幂等、跨页/跨进程锁，已发送但尚未被服务器受理的启动不保证被先到的停止撤回；之后其它启动也会改变状态。停止确认不自动取消已接受的工具任务，更不等于所有后代/第三方进程已退出。原生命令/其他API消费仍另审。

### 经典工作台密钥轮换（第41组）

**secretRequest(path,body)**独立GET/POST帮助函数：同源、no-store、10秒AbortController覆盖取头和JSON正文，HTTP失败/空回包/明确success:false拒绝，finally清timer。异常不直接展示远端文字或密钥；abort不是撤回服务端轮换。

**sameSecretBinding(snapshot,expected)**对比workspaceRoot和identity.hostInstanceId；**validRotatedSecret(data,oldSecret)**要求success严格true、新24位hex secret与旧值不同、mcpPath匹配、HTTP(S)完整URL无凭据/查询/fragment且canonical URL同源/mcp。它不认证公网可达性。

**resetSecret()**使用页内secretRotating与禁按钮防并发；捕获页面工作区/主机/旧密钥，先GET当前状态验证核心形状及同绑定/同旧密钥。明确confirm告知OAuth撤销但任务/隧道不停止，确认前后复查页面；取消不POST。请求携workspaceRoot/hostInstanceId/expectedSecret，服务端单进程比较后再轮换，旧页面不应直接重发。轮换响应通过完整消费合同才确认；随后只刷新状态，不再POST。刷新失败/被取代/主机或secret不匹配保留“原主机轮换已确认、当前地址未核对”。

请求发出后遇HTTP/业务/JSON/网络/超时/坏合同一律结果未确认，旧显示地址可能过期，先读状态而非再次重置；没有自动重试。发送前失败明确未发送。结果写独立secret-result（aria-live），不沿用无条件成功toast，不自动复制地址；finally释放guard。仅页内互斥，不是跨标签锁或永久幂等；服务端旧空体扩展调用仍兼容，不因此获得新绑定/CAS保证。经典UI的证据不代签原生路径；原生命令随后已有独立F43回归，实机/其它消费者仍单列。启动/停止没有共用此锁，启动在途停止不能被密钥轮换锁挡住；本批经典启停消费见上节，原生扩展的绑定/确认/未知消费见入口与Webview详解及F43回归，不据此宣称所有实机场景已验。

**paintBridge()**把state.status映射为运行pill/toggle/MCP块/URL/底栏/installId，domain空输入才回填，radio规范named别名；paintClients。按provider/URL判断隧道类型，显示就绪文案；账目信息区GitHub实际身份、演示授权、未授权分开，deviceAvailable控制按钮；usage显示今日工具计数及是否配置上报；mcpSession.alive/latest/空决定Connected/Idle/Waiting/Stopped，最后paintStats。

需要区分文案与数据：bridge-sub已将累计完成数标为“外部工具调用”，不再误称活动请求；Bridge运行不代表外部Agent已连接；隧道URL存在也不是全公网端到端健康证明。

**checkBridgeHealth()**以no-store GET /health，只有HTTP 2xx且health.ok严格true才继续refreshStatus；被更新读取取代也算未确认。成功再拼工作台/Bridge/隧道摘要到healthLine，失败走错误摘要，不用拒绝正文里的ok真值假报健康；只检查本源，不从手机侧探测公网。

**isStatusSnapshot(value)**验证本次消费的核心形状：online、非success:false、bridgeRunning布尔、activeModelId字符串、models数组；模型项须对象、id非空且不重复，name若有须字符串、caps若有须数组。允许当前ID不在列表，此时不偷偷选第一个或builtin。它不是整个status（包括权限/任务/客户端等嵌套对象）的完整schema、主机身份认证或模型兼容性验证。

**refreshStatus()**只读GET `/api/status`，no-store、10秒AbortController；statusRequest递增并中止上次读取，在响应头和JSON解析后都检查ticket。只有最新请求HTTP成功且核心形状有效才发布state.status；被取代的请求返回false，即使新请求失败，也不接受旧请求迟到成功作为回退。超时/网络/解析/HTTP/核心形状失败保留最近快照，状态栏明确“状态同步失败”，并reject；成功显示完成返回true。finally清timer，仅最新请求清controller。取消仅是优化，序号才是发布屏障；没有自动重试或写入。

发布后paintExecutionControl/paintBridge，重建模型options，隐藏select与按钮都按同一activeModelId设置，不再恢复旧select；不存在的ID令select空并显示模型不可用，后续Chat仍带原配置ID让后端明确拒绝，不回退内置。name空则用id。有planRound才更新并paintPlanComposer；think仅未touched才取后台设置；再画Provider与todos。渲染异常单独标“状态显示失败”并reject，已经发布的新快照/部分DOM不承诺事务回滚；此处不认证全部嵌套消费者。

## 3. settings.js全部函数

**rowList(items,render,empty)**空列表返回提示HTML，否则map(render).join；empty由调用者给固定文本，函数本身不转义render结果。

**paintCustom({preserveDrafts=false}={})**读state.custom：填指令/偏好、environment、techStack；rowList回调分别渲染agents/prompts/hooks/mcpServers/plugins/quickLinks，动态值escape。prompts.onclick把data-insert填聊天但不发送，关modal切Chat；quickLinks.onclick以URL为ID建browser tab并激活。Codex状态明确未实现、不读写auth.json。多模型enabled先看custom后由status.multiModel覆盖；模型map options，active/auto都表示当前，填merge/think/readOnly/maxBranches。保存成功时传preserveDrafts:true，只重画登记列表，不覆盖指令/偏好/环境/技术栈或多模型表单，保留请求期间及其他页未提交的草稿；初始加载才填全部字段。此函数只是画登记项，不自动运行hook、连接MCP或安装插件。

**paintProviderTable()**排除builtin，空显示提示；forEach用无原型字典按group聚合，__proto__/constructor也只是普通组名，map组/行、caps复制补vision；active radio匹配status，所有动态显示escape。radio.onchange调用saveModelSettings提交activeModelId；失败恢复最近state.status确认的选中项，但未知写入仍须人工核对，不证明服务端没有改变。模型能力/定价来自声明/探测，不保证供应商实时价格或模型真实能力。

**withModelSettings(action)**页面内统一guard，忙时toast并返回false、不排队；否则await action，finally释放busy。覆盖模型选择/多模型/内置及Test/Add从准备、发现、保存到刷新整个过程，不是跨标签页或服务端锁。

**saveModelSettings(partial)**供表格、多模型、聊天和内置选择使用，只通过withModelSettings委托内部postModelSettings。**postModelSettings(partial)**POST本次字段，10秒AbortController；HTTP成功且success严格true才确认，addProvider另要求added与提交数相等，防旧主机忽略新字段仍报成功。失败false、未知写入需核对，不自动重试；Provider失败仅用固定提示（冲突码单独解释），不回显响应错误/解析异常里的Key；确认后调用refreshStatus，reject/返回false单独提示“已保存但刷新失败”，仍返回保存true。finally清timer，不在此提前释放整个Provider动作的guard。

**probeProvider(input)**位于settings.js，取已捕获的baseUrl/apiKey，POST providers/probe，20秒客户端等待（后台默认15秒）；检查HTTP、success和非空≤100项/非空字符串ID核心形状；完整记录schema由后台检查。超时/解析/网络失败throw，finally清timer。没有自动保存或失败后的隐式manual回退。

**configureProvider(input,testOnly=false)**进入guard前浅拷贝四个原始字段，避免请求期间编辑串入本次保存；捕获输入只含字符串和vision布尔。Test总是发现，只报“模型列表读取成功，未保存/未验兼容”；Add有显式manualId时只登记该ID、不联网发现，无manualId才发现后登记。通过postModelSettings发送单独addProvider，后端从磁盘追加，不用status或脱敏models重建旧Key。不自动改当前模型、不覆盖重复模型/Key；失败只显示未确认/未写入的对应阶段，不重试。确认后仅当Key输入仍等于本次快照才清空，保留新草稿；发现异常用固定提示，不回显含Key的异常正文。新增模型需要操作者另行选择。

**isCustomSnapshot(value)**检查用于渲染的顶层对象、指令/偏好字符串、环境/技术栈对象和六类列表；列表项须非数组对象，plugins另允许字符串。不是后台所有字段的完整schema或业务真实性校验。

**loadCustomizations()**GET/no-store，HTTP成功且返回快照形状有效才替换state.custom并paintCustom。HTTP/业务/解析/网络错误保留旧state和当前表单，toast原因，返回false；成功返回快照。后端损坏配置返回500 JSON及E_CUSTOM_CORRUPT，原文件保留，不以默认值覆盖。

**saveCustom(partial)**只PUT本次partial，不再携带缓存state.custom的其他字段；必须HTTP成功、success严格true且快照有效才更新state，并以preserveDrafts重画列表、返回快照。失败返回false并保留草稿；未知响应/网络/超时提示状态未知，服务端顺序发布可能部分完成，不能宣称回滚。bind中所有saveCustom调用都检查返回值，false立即结束，不继续写成功状态或toast。

load/save共用页面内customBusy，已有请求时明确拒绝新请求而不排队；各用10秒AbortController和finally清timer/释放busy，避免迟到加载覆盖保存结果。取消等待不证明服务器未写入；不自动重放。它不是跨标签页/跨进程CAS，两个客户端修改同一字段或整列表仍可能后写覆盖前写；明确加载会重填表单，不是草稿恢复功能。

**validSkillSummary(skill)**要求目录项为对象、id/name为非空字符串，description/preview若有也须字符串。**validSkillPage(page,id,resource,offset)**在此基础上要求found严格true、请求ID/资源/offset回显一致、正文字符串、64位hash、非负字节/总字符、合法递增或null的nextOffset，resources若有须逐项path字符串/readable布尔；这是发布形状合同，不认证说明内容可信。

**loadSkills()**以no-store获取目录，只有HTTP成功且skills/truncated/warnings完整形状有效才替换skillCatalog并paint；失败保留最后可信列表，只更新扫描错误说明并返回false。它同时绑定搜索、重扫、查看、下一页、资源和填入对话按钮。**paintSkills()**按id/description过滤并转义生成卡片，显示来源和同名项。**readSkillPage(id,resource,offset,hash)**调用受保护的GET `/api/skills/load`，5秒AbortController超时；新请求取消上一个且用ticket忽略迟到响应，只有validSkillPage通过才发布。第一页省略尚不存在的expectedHash并替换正文；后续页才携可信页hash，按同id/resource拼接且由服务端校验expectedHash防混版；错误清选择并提示从头读取，不允许继续操作旧内容。正文textContent展示，不执行Markdown/脚本。

“填入Ask”保留已有草稿，追加明确load_skill ID和授权限制，切Ask并聚焦，**不发送**；提示内置探索不能解释任意Skill。完整读完≤32KiB的`workflow.json`才启用转工作流按钮；只复制已读取的文本到现有operations页并触发结构/风险预览，不提交审批、不执行；现有流程仍需另外提交和本机批准。其他资源只是参考文本，不根据run.py/run.sh名字自动启动。

## 4. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=workbenchRuntime
npm test --prefix webagent-core/agent-host -- --filter=githubAuth
npm test --prefix webagent-core/agent-host -- --filter=profile
```

HTTP状态/并发、真实剪贴板与公网连接的界限应按上述实现理解；自动化与Windows/手机人工验收分开计，不把演示页面称为真实Arena登录。

会话数显示sessions (≤24h)，不是当前正在执行的任务数；后端snapshot已主动清理过期会话，alive另按10秒心跳窗口判断。

## 身份与追踪界面
paintBridgeActivity先显示snapshot.identity，存在executions时优先展示进行中/完成的工具追踪、任务/会话/callId、核验与execId，而不是只列完成摘要；状态文本均转义。**refreshDiagnostics()**先清旧身份，以no-store GET只读诊断；只有HTTP成功、identity带字符串hostInstanceId/workspaceRoot且capabilities每项id/status/reason均为字符串才发布currentDiagnostics并渲染。失败不能沿用旧身份做匹配。**compareHost()**校验用户填的UUID与当前主机一致性，不接收密钥；不一致要求停止修改任务并核对工作区。

paintBridgeActivity校验epoch/revision和非负统计，渲染完成后才提交activityVersion；失败仍可重试。同一版本避免日志重绘。activityInfo保存当前页已取得的主机身份/本轮起点；paintStats在未同步时显示—，统一更新Bridge摘要，不再把完成数叫活动请求。paintBridge不再覆盖sess-note，避免一般状态和活动快照竞态。refreshBridgeActivity使用cache:no-store，无效快照同HTTP失败一样显示错误且不清除已知计数。

诊断页新增连接核对区。operations.initOperations内部connectionAction显示固定异常，创建按钮清空输入后上传最小JSON，checkGeneration防旧成功响应覆盖新状态；本机只显示toolRequest，不自动调用。查询丢弃旧generation，清除递增generation且不注销MCP。页面刷新丢弃当前checkId，旧记录由主机TTL清理。


startBridge工作区校验（0.7.1）：记录页面state.status，再fetch实时status，必须与页面的workspaceRoot/identity.hostInstanceId一致才POST两个绑定字段。缺失、主机重启/更换项目、409或请求异常在独立结果区区分未发送/未确认并返回false；不能拿新主机状态悄悄替换旧页面目标。刷新整页核对项目后再启动。验证由workbenchRuntime与bridgeTunnel覆盖，实机另记。


0.7.2 paintBridgeActivity在日志版本短路前更新远程Tasks；refreshBridgeActivity沿用3秒单飞轮询，在错误时给任务计数标“同步失败，当前状态未知”。计划独立于工具日志，不根据工具名称生成。Tasks只读Agent报告并显示会话和更新时间，重启丢失、30分钟未更新过期。

## 所有者模式/权限控件

**paintExecutionControl()**从status.executionControl画主机模式/请求数；没有新主机字段显示未知，存在未保存草稿则不覆盖勾选和revision。**initExecutionControl()**绑定两模式按钮、四项复选框、保存与重新读取。内部**change(value)**用controlChangePending单飞及10秒AbortController POST `/api/execution-control`，带当前workspaceRoot、identity.hostInstanceId，权限附草稿revision；只有HTTP成功且success严格true才清dirty并确认主机写入。后续状态刷新成功才显示已应用；写确认但刷新失败单独提示手动核对，写未确认固定提示且不自动重试。Read关会在草稿关Edit；缺Read/Edit/Capture会关Execute并提示，不自动扩大权限。保存才实际生效。refreshStatus调用paintExecutionControl，bind经ui.initExecutionControl接线。验证见executionControl.test与浏览器回归，不能视为真实Windows控件验收。

promptText对已选卡片直接返回其prompt或空字符串；不支持普通粘贴/本机Chat的空prompt不能回退成全局带密钥连接提示。仅没有卡片时保留旧全局回退；复制按钮遇空文本提示无配置并退出，不假报已复制。
