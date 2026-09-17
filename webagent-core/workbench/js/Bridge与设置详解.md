# Bridge页面、模型表与定制设置逐函数讲解

覆盖[bridge.js](bridge.js)、[settings.js](settings.js)。所有fetch用当前源相对URL；公共隧道不等于放行工作台UI/API。视图提示不是真实外部客户端连接证据。

## 1. bridge.js统计与连接指引函数

| 函数 | 参数/返回 | 状态/回调/边界 |
|---|---|---|
| formatClock(ms) | 时间→本地时钟文本 | 空值空字符串；内部pad(n)补两位；本地时区不是UTC |
| logBridgeTool() | 无→Promise | 兼容事件入口，仅委托refreshBridgeActivity，不在浏览器累加，以免重复或混入本地Chat |
| paintBridgeActivity(snapshot) | 服务端快照→undefined | 校验stats/logs，epoch:revision未变不重复绘制；覆盖state.stats、paintStats、转义后重建最近100条完成摘要；计数不等于当前仍连接 |
| refreshBridgeActivity() | 无→Promise | 单飞GET本机/api/bridge/activity，5秒AbortController超时；成功paint，失败显示统计同步错误并允许下一次相同版本快照恢复；finally清timer与pending |
| paintStats() | 无→undefined | 显示调用/失败/成功率/平均秒；healthLine优先；会话数取httpSessions/alive/clients或调用记录启发式，最后工具附formatClock |
| resetRound() | 无→Promise<void> | 检查POST reset-round的HTTP成功，刷新状态，等待已有快照再取新快照；失败提示而不假装本地清零 |
| selectedClientInfo() | 无→客户端或null | 当前selectedClient优先，否则arena；找不到null |
| promptText() | 无→字符串 | 客户端专用prompt优先、status.prompt其次，再拼mcpUrl+连接说明；可能含密钥，不公开粘贴 |
| paintClients() | 无→undefined | map卡片/步骤，click修改selectedClient并重画；copyRules按connectMode显示；配对码只在Bridge运行且有效信息存在时展示 |
| renderBrowser(tab) | tab→undefined | 绘连接指引页面，不是加载官方站点的真实浏览器进程；各分支如下 |
| arenaConnect() | 无→Promise<void> | 仅切右Bridge、灭会话灯、提示去真实Arena配置；不发送任务给本机Code或外部Arena |
| openSite(key) | 站点键→Promise<void> | 不启动隧道，仅尝试复制prompt，建/复用browser tab、关modal、切Bridge并激活；打开浏览器页不再隐式启动公网Bridge，用户另点启动Bridge |

**renderBrowser**：不再生成Arena/ChatGPT仿站登录、附件和发送界面。DeepSeek分支仍说明真实Chrome/Edge扩展、官方与第三方区别并给安装链接；其余站点统一显示“外部客户端连接指引”、外链和prompt，明确不代登录/发送任务。文本escape；外链先用URL解析，再只允许http/https协议，非法地址不生成可点击链接。arenaConnect保留兼容函数但不再由仿站发送按钮触发，不连接外部会话。

## 2. bridge.js启动/停止/状态函数

**startBridge()**先核对页面与实时status的workspaceRoot/hostInstanceId，再按radio构造provider和可选凭据、POST绑定字段。HTTP或业务失败按error→tunnelError→note→默认文案选择原因，409弹窗，其余toast截180字符；刷新主机状态清掉失败重启后的旧URL，不复制本机fallback URL。成功才显示banner、尝试复制MCP地址并切Bridge。网络/JSON/刷新异常在catch弹窗并false；Token只提交后端，不写localStorage。

**stopBridge()**等待POST和JSON，HTTP及success均成功才清healthLine、刷新并灭灯、true。失败显示error/note或默认提示、false，不因收到HTTP响应就假报停止；网络/JSON/刷新异常catch弹窗、false。丢失响应时实际进程状态未知，应核对主机，不自动重试或强杀。

**paintBridge()**把state.status映射为运行pill/toggle/MCP块/URL/底栏/installId，domain空输入才回填，radio规范named别名；paintClients。按provider/URL判断隧道类型，显示就绪文案；账目信息区GitHub实际身份、演示授权、未授权分开，deviceAvailable控制按钮；usage显示今日工具计数及是否配置上报；mcpSession.alive/latest/空决定Connected/Idle/Waiting/Stopped，最后paintStats。

需要区分文案与数据：bridge-sub的“活动请求”使用state.stats.calls累计次数，不是并发数；Bridge运行不代表外部Agent已连接；隧道URL存在也不是全公网端到端健康证明。

**checkBridgeHealth()**GET /health，JSON失败变空；refreshStatus，再拼工作台/Bridge/隧道摘要到healthLine；catch错误摘要；只检查本源，不从手机侧探测公网。

**refreshStatus()**GET status→state.status，paintBridge；重建模型options后尝试保留旧select值，按钮显示后端activeModelId；有planRound更新并paintPlanComposer；think仅未touched才由后台设置；paintProviderTable与todos。HTTP错误未显式检查；并发刷新没有序号屏障，迟到响应可能覆盖新状态。

## 3. settings.js全部函数

**rowList(items,render,empty)**空列表返回提示HTML，否则map(render).join；empty由调用者给固定文本，函数本身不转义render结果。

**paintCustom({preserveDrafts=false}={})**读state.custom：填指令/偏好、environment、techStack；rowList回调分别渲染agents/prompts/hooks/mcpServers/plugins/quickLinks，动态值escape。prompts.onclick把data-insert填聊天但不发送，关modal切Chat；quickLinks.onclick以URL为ID建browser tab并激活。Codex状态明确未实现、不读写auth.json。多模型enabled先看custom后由status.multiModel覆盖；模型map options，active/auto都表示当前，填merge/think/readOnly/maxBranches。保存成功时传preserveDrafts:true，只重画登记列表，不覆盖指令/偏好/环境/技术栈或多模型表单，保留请求期间及其他页未提交的草稿；初始加载才填全部字段。此函数只是画登记项，不自动运行hook、连接MCP或安装插件。

**paintProviderTable()**排除builtin，空显示提示；forEach按group聚合，map组/行、caps复制补vision；active radio匹配status，所有动态显示escape。radio.onchange调用saveModelSettings提交activeModelId；失败恢复最近state.status确认的选中项，但未知写入仍须人工核对，不证明服务端没有改变。模型能力/定价来自声明/探测，不保证供应商实时价格或模型真实能力。

**saveModelSettings(partial)**用于模型表格选择和多模型保存按钮；只POST本次字段，页面内modelSettingsBusy拒绝重叠请求，10秒AbortController限制保存等待。HTTP成功且success严格true才提示已保存并刷新状态；拒绝/业务错误/解析/网络/超时不假成功、不自动重试，未知效果需核对。保存已确认但刷新抛错，单独提示“已保存，但状态刷新失败”，仍返回true，不把保存重做一次。finally释放计时器与busy。不是跨标签页锁或服务端事务；refreshStatus自身的HTTP与并发语义另待审查，不能将它不抛错等同于快照已验证。模型新增等其他/api/models调用不由此自动覆盖。

**isCustomSnapshot(value)**检查用于渲染的顶层对象、指令/偏好字符串、环境/技术栈对象和六类列表；列表项须非数组对象，plugins另允许字符串。不是后台所有字段的完整schema或业务真实性校验。

**loadCustomizations()**GET/no-store，HTTP成功且返回快照形状有效才替换state.custom并paintCustom。HTTP/业务/解析/网络错误保留旧state和当前表单，toast原因，返回false；成功返回快照。后端损坏配置返回500 JSON及E_CUSTOM_CORRUPT，原文件保留，不以默认值覆盖。

**saveCustom(partial)**只PUT本次partial，不再携带缓存state.custom的其他字段；必须HTTP成功、success严格true且快照有效才更新state，并以preserveDrafts重画列表、返回快照。失败返回false并保留草稿；未知响应/网络/超时提示状态未知，服务端顺序发布可能部分完成，不能宣称回滚。bind中所有saveCustom调用都检查返回值，false立即结束，不继续写成功状态或toast。

load/save共用页面内customBusy，已有请求时明确拒绝新请求而不排队；各用10秒AbortController和finally清timer/释放busy，避免迟到加载覆盖保存结果。取消等待不证明服务器未写入；不自动重放。它不是跨标签页/跨进程CAS，两个客户端修改同一字段或整列表仍可能后写覆盖前写；明确加载会重填表单，不是草稿恢复功能。

**loadSkills()**获取带来源/截断/错误提示的目录，并绑定搜索、重扫、查看、下一页、资源和填入对话按钮。**paintSkills()**按id/description过滤并转义生成卡片，显示来源和同名项。**readSkillPage(id,resource,offset,hash)**调用受保护的GET `/api/skills/load`，5秒AbortController超时；新请求取消上一个且用ticket忽略迟到响应。第一页清旧正文；后续页按同id/resource拼接，服务端校验expectedHash防混版；错误清选择并提示从头读取，不允许继续操作旧内容。正文textContent展示，不执行Markdown/脚本。只将loadSkills作为原ui启动入口，新增导出也可供测试直接调用。

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
paintBridgeActivity先显示snapshot.identity，存在executions时优先展示进行中/完成的工具追踪、任务/会话/callId、核验与execId，而不是只列完成摘要；状态文本均转义。**refreshDiagnostics()**先清旧身份，GET只读诊断后显示identity/capabilities，失败不能沿用旧身份做匹配。**compareHost()**校验用户填的UUID与当前主机一致性，不接收密钥；不一致要求停止修改任务并核对工作区。

paintBridgeActivity校验epoch/revision和非负统计，渲染完成后才提交activityVersion；失败仍可重试。同一版本避免日志重绘。activityInfo保存当前页已取得的主机身份/本轮起点；paintStats在未同步时显示—，统一更新Bridge摘要，不再把完成数叫活动请求。paintBridge不再覆盖sess-note，避免一般状态和活动快照竞态。refreshBridgeActivity使用cache:no-store，无效快照同HTTP失败一样显示错误且不清除已知计数。

诊断页新增连接核对区。operations.initOperations内部connectionAction显示固定异常，创建按钮清空输入后上传最小JSON，checkGeneration防旧成功响应覆盖新状态；本机只显示toolRequest，不自动调用。查询丢弃旧generation，清除递增generation且不注销MCP。页面刷新丢弃当前checkId，旧记录由主机TTL清理。


startBridge工作区校验（0.7.1）：记录页面state.status，再fetch实时status，必须与页面的workspaceRoot/identity.hostInstanceId一致才POST两个绑定字段。缺失、主机重启/更换项目、409或请求异常均弹窗并返回false；不能拿新主机状态悄悄替换旧页面目标。刷新整页核对项目后再启动。验证由workbenchRuntime与bridgeTunnel覆盖，实机另记。


0.7.2 paintBridgeActivity在日志版本短路前更新远程Tasks；refreshBridgeActivity沿用3秒单飞轮询，在错误时给任务计数标“同步失败，当前状态未知”。计划独立于工具日志，不根据工具名称生成。Tasks只读Agent报告并显示会话和更新时间，重启丢失、30分钟未更新过期。

## 所有者模式/权限控件

**paintExecutionControl()**从status.executionControl画主机模式/请求数；没有新主机字段显示未知，存在未保存草稿则不覆盖勾选和revision。**initExecutionControl()**绑定两模式按钮、四项复选框、保存与重新读取。内部**change(value)** POST /api/execution-control，带当前workspaceRoot、identity.hostInstanceId，权限附草稿revision；仅成功后清dirty并刷新主机。出错显示原因，不假装切换成功。Read关会在草稿关Edit；缺Read/Edit/Capture会关Execute并提示，不自动扩大权限。保存才实际生效。refreshStatus调用paintExecutionControl，bind经ui.initExecutionControl接线。验证见executionControl.test与浏览器回归，不能视为真实Windows控件验收。
