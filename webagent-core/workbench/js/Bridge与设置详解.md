# Bridge页面、模型表与定制设置逐函数讲解

覆盖[bridge.js](bridge.js)、[settings.js](settings.js)。所有fetch用当前源相对URL；公共隧道不等于放行工作台UI/API。视图提示不是真实外部客户端连接证据。

## 1. bridge.js统计与连接指引函数

| 函数 | 参数/返回 | 状态/回调/边界 |
|---|---|---|
| formatClock(ms) | 时间→本地时钟文本 | 空值空字符串；内部pad(n)补两位；本地时区不是UTC |
| logBridgeTool(ev) | 工具事件→undefined | calls/fail/totalMs累加，lastTool/At更新、healthLine清；paintStats，追加escape后的日志卡，点亮sess-dot；不校验事件唯一性 |
| paintStats() | 无→undefined | 显示调用/失败/成功率/平均秒；healthLine优先；会话数取httpSessions/alive/clients或调用记录启发式，最后工具附formatClock |
| resetRound() | 无→Promise<void> | POST reset-round网络失败吞，仍清页面统计/日志、刷新status、toast；UI归零不证明服务端请求成功 |
| selectedClientInfo() | 无→客户端或null | 当前selectedClient优先，否则arena；找不到null |
| promptText() | 无→字符串 | 客户端专用prompt优先、status.prompt其次，再拼mcpUrl+连接说明；可能含密钥，不公开粘贴 |
| paintClients() | 无→undefined | map卡片/步骤，click修改selectedClient并重画；copyRules按connectMode显示；配对码只在Bridge运行且有效信息存在时展示 |
| renderBrowser(tab) | tab→undefined | 绘连接指引页面，不是加载官方站点的真实浏览器进程；各分支如下 |
| arenaConnect(text) | 文本→Promise<void> | 仅切右Bridge、灭会话灯、提示去真实Arena配置；text不发送给本机Code或外部Arena |
| openSite(key) | 站点键→Promise<void> | 未运行尝试startBridge，然后尝试复制prompt，建/复用browser tab、关modal、切Bridge并激活；没有因startBridge返回false而中止引导 |

**renderBrowser**：Arena/ChatGPT分支生成本地外观示例，textarea预填escape后的prompt，发送onclick都调用arenaConnect；DeepSeek分支说明真实Chrome/Edge扩展、官方与第三方区别并给安装链接；其他分支显示外链和prompt。动态文本escape，但escapeHtml不是URL协议白名单，custom URL后续由配置校验与浏览器行为约束。

## 2. bridge.js启动/停止/状态函数

**startBridge()**读取tunnel radio默认cloudflare；named加domain/token，ngrok加对应字段；POST JSON。data.success假则toast并false；成功note截180、healthLine清、await refreshStatus，显示banner，尝试复制mcpUrl、切右Bridge并点亮灯，true。网络/JSON解析异常不在此捕获，按调用者传播；token只提交后端，不写localStorage。

**stopBridge()**POST后清healthLine/刷新/灭灯，未统一检查HTTP业务状态。

**paintBridge()**把state.status映射为运行pill/toggle/MCP块/URL/底栏/installId，domain空输入才回填，radio规范named别名；paintClients。按provider/URL判断隧道类型，显示就绪文案；账目信息区GitHub实际身份、演示授权、未授权分开，deviceAvailable控制按钮；usage显示今日工具计数及是否配置上报；mcpSession.alive/latest/空决定Connected/Idle/Waiting/Stopped，最后paintStats。

需要区分文案与数据：bridge-sub的“活动请求”使用state.stats.calls累计次数，不是并发数；Bridge运行不代表外部Agent已连接；隧道URL存在也不是全公网端到端健康证明。

**checkBridgeHealth()**GET /health，JSON失败变空；refreshStatus，再拼工作台/Bridge/隧道摘要到healthLine；catch错误摘要；只检查本源，不从手机侧探测公网。

**refreshStatus()**GET status→state.status，paintBridge；重建模型options后尝试保留旧select值，按钮显示后端activeModelId；有planRound更新并paintPlanComposer；think仅未touched才由后台设置；paintProviderTable与todos。HTTP错误未显式检查；并发刷新没有序号屏障，迟到响应可能覆盖新状态。

## 3. settings.js全部函数

**rowList(items,render,empty)**空列表返回提示HTML，否则map(render).join；empty由调用者给固定文本，函数本身不转义render结果。

**paintCustom()**读state.custom：填指令/偏好、environment、techStack；rowList回调分别渲染agents/prompts/hooks/mcpServers/plugins/quickLinks，动态值escape。prompts.onclick把data-insert填聊天但不发送，关modal切Chat；quickLinks.onclick以URL为ID建browser tab并激活。Codex状态明确未实现、不读写auth.json。多模型enabled先看custom后由status.multiModel覆盖；模型map options，active/auto都表示当前，填merge/think/readOnly/maxBranches。此函数只是画登记项，不自动运行hook、连接MCP或安装插件。

**paintProviderTable()**排除builtin，空显示提示；forEach按group聚合，map组/行、caps复制补vision；active radio匹配status，所有动态显示escape。radio.onchange POST activeModelId后refreshStatus；未检查HTTP成功/错误，也没有并发选择锁。模型能力/定价来自声明/探测，不保证供应商实时价格或模型真实能力。

**loadCustomizations()**GET/json入state.custom再paintCustom，未检查HTTP状态。**saveCustom(partial)**把旧state.custom与partial浅合并PUT，响应data.customizations替换state，再paint并返回。部分对象不是递归merge；并发两个保存可能都基于旧快照，无前端CAS/version锁。

**loadSkills()**GET skills、取data.skills或空，数量徽标和map article(name/path/preview转义)，没有就提示目录；显示preview不等于模型已load完整Skill。所有函数底部挂ui同名引用。

## 4. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=workbenchRuntime
npm test --prefix webagent-core/agent-host -- --filter=githubAuth
npm test --prefix webagent-core/agent-host -- --filter=profile
```

HTTP状态/并发、真实剪贴板与公网连接的界限应按上述实现理解；自动化与Windows/手机人工验收分开计，不把演示页面称为真实Arena登录。
