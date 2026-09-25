# VS Code 扩展入口、网页消息与贡献声明

## 文件协作

[extension.js](extension.js)在扩展宿主(Node)运行，两个HTML模板里的script在Webview运行，两边只能通过postMessage桥接。本机HTTP默认127.0.0.1指的是**扩展宿主所在机器**，不是远程手机浏览器。[PTY扩展详解](PTY扩展详解.md)接续真实终端链。[apiRelay.js](apiRelay.js)是R6第二期设置页的请求转发层（见第13节）。

## 1. 顶层函数

| 函数 | 输入/返回 | 调用与限制 |
|---|---|---|
| dispatchPty(ev) | 事件→undefined | 只转发pty_request给全局ptyHost，noteStream再handleIncoming；未await返回Promise，不统一接收其异步拒绝 |
| agentHostUrl() | 无→origin文本或抛错 | 顺序：**explicitHostUrl()**（用户/工作区设置或环境变量`WEBAGENT_AGENT_HOST_URL`）→ 插件管理的主机地址`hostManager.currentUrl()` → 默认48271。F71起必须是http/https、主机名为127.0.0.1、localhost或[::1]、不带用户信息/路径/查询/片段，返回URL.origin；否则抛出含`webagent.agentHostUrl`的错误 |
| requestHost(u) | URL→主机名 | 去掉IPv6方括号：URL.hostname为`[::1]`，http.request会把它当DNS名查找而ENOTFOUND；Node据去括号后的地址自动生成`Host: [::1]:端口`，与主机本机判断一致 |
| requestJson(method,url,body,options={}) | HTTP参数→Promise<{status,json,raw,contentType}> | 根据http/https选库，JSON正文带长度；响应最多8MiB，Content-Length声明超限提前拒绝（HEAD仅描述资源长度，不按正文拒绝），实际Buffer字节累计仍独立检查（含chunked）。15秒空闲timeout加总deadline；响应error/aborted/提前close/不完整end拒绝。finish单次结算、清deadline及chunks，失败销毁请求/响应；3xx拒绝且不跟随/重试。完整且有界响应保留{status,json,raw}，坏JSON/空正文仍json=null，4xx/5xx仍由调用方判断业务结果；响应上限不代表进程RSS上限。R6第二期第2批加可选options，只有设置页转发层使用，其他调用方不传、行为不变：rawBody为已序列化的JSON文本、原样发送；timeoutMs替换15秒总期限（错误文字随之写秒数）；signal取消时由内部**onAbort**以“已取消，结果未确认；没有自动重试”结束，信号已取消则直接拒绝、不发请求；结束时移除监听。结果另带响应的contentType |
| postNdjson(url,body,onEvent,signal) | Chat请求→Promise<void> | POST JSON+AbortSignal；仅2xx且application/x-ndjson；5分钟空闲timeout及总deadline。UTF8解码保留跨chunk字符与半行，单行1MiB/总响应16MiB上限；consume验证对象/type及message.text，回调异常向上传播。仅一个done且随后正常end才resolve；error、done后数据、坏帧、aborted/error/提前close均finish拒绝并销毁请求/响应，单次结算清deadline；不跟随重定向或重试 |
| historyFromChatContext(context) | VS Code历史→role/content数组 | 每turn.prompt变user；本扩展result.metadata.webagentCompleted=false的失败turn不回送assistant，未标记的旧历史保持兼容；response.map识别value或value.value后join变assistant；最后12消息，不是12轮；不传引用/工具结构 |
| revealWorkspaceFile(rel) | 相对路径→undefined | 首工作区joinPath，openTextDocument.then成功show预览/保留焦点，打开失败吞；此函数本身不是写入沙箱检查 |
| registerChatParticipant(context) | 上下文→undefined | API存在才尝试创建webagent.agent，设SVG icon，加入订阅；不支持/注册异常不阻止Webview |
| activate(context) | VS Code上下文→undefined | 输出面板“Web Agent Host”→PTY→ChatView/BridgeView provider→HostManager（见第12节）→原生Chat→状态栏→命令订阅；可管理时按`webagent.autoStartHost`启动主机，否则只尝试**attachExisting**接管同一文件夹上已运行的主机，不自动spawn |
| validWebviewMessage(msg,surface) | 不可信消息→boolean | 拒绝空/数组/非字符串type；chat只openNative/cancel/合法模式send且正文非空≤128000；bridge只合法copy、`start`（tunnelProvider缺省或cloudflare/cloudflare-named/ngrok）、布尔`autoBridge`、refresh/stop/reset/hostStart/hostStop/hostLog或严格形状的control消息。没有通配API代理 |
| chatHtml()/bridgeHtml() | 无→完整HTML字符串 | 各生成随机nonce，默认资源禁用，script仅nonce，允许内联style，禁止base/form；事件内容不作HTML注入 |

**registerChatParticipant的handler(request,chatContext,stream,token)**：AbortController关联取消订阅并处理预取消；modeFromChatRequest取模式，去首个slash命令。空正文输出帮助、dispose返回；非空progress→postNdjson。事件回调先忽略已取消，再PTY分派；status为进度，tool显示结果/补丁打开与reference，message Markdown，error错误，consensus区分模拟汇总。正常完成返回metadata.webagentCompleted=true，失败/预取消返回false；catch提示结果未完成、核对已发生操作、不自动重试，主动取消不弹错误模态框；finally dispose取消订阅。

## 2. activate内部回调

**refreshBar()**每5秒GET status，明确检查status≥400/无JSON。主机“启动中”时显示转圈并把点击改为查看日志；有工作区差异显示warning；正常显示Bridge状态，悬停注明“由插件启动/外部启动”和来源提交告警。catch时：错误来自agentHostUrl拒绝→“主机地址无效”；手工设置了地址→“未连接”并说明；否则→“未启动”，点击即`webagent.startHost`，同时对已接管的外部主机调用markLost。context.dispose清interval。

extension.js直接注册三个registerCommand，另由editorReview登记两个草稿命令：openBridge打开侧栏；openAgentChat尝试原生Chat预填@webagent，失败回侧栏；resetSecret委托**resetSecretCommand({refresh:()=>bridge.refresh()})**，把确认/绑定/回包消费集中在一个可测函数里，不再用内联箭头吞掉HTTP状态。statusBar自身也加入subscriptions管理。

### 原生密钥轮换与停止（第43组）

**workspaceSnapshot()**是workspaceBinding的实体：取before文件夹→GET status→校验HTTP/工作区/主机→取after并sameWorkspace，返回`{status,binding}`；**workspaceBinding()**只返回binding，避免把secretKey随控制/启动请求外发。

**validRotationResult(result,oldSecret)**要求HTTP200、`success`严格true、新24位hex密钥且不同于旧值、`mcpPath`等于`/mcp/<新key>`、`mcpUrl`是无凭据/查询/fragment的http(s) URL且路径与canonical origin一致；否则不确认。它不验证公网可达性。

**resetSecretCommand({refresh})**流程：读快照并检查旧密钥形状→`showWarningMessage(...,{modal:true},'重置')`确认（取消则通知“已取消，未发送”并false）→POST携workspaceRoot/hostInstanceId/expectedSecret→消费结果：

- 请求本身抛错（超时/断连）：结果未确认，可能已生效，不重试。
- HTTP409：主机在写入前拒绝（绑定或旧密钥已变化），报“未轮换”。
- 其他非200、空/坏JSON、success非严格true、密钥未变或地址合同不符：结果未确认。
- 合同成立：写已确认，再读一次快照核对新密钥与同一主机/工作区；核对成功才提示“已重置并核对”，否则明确“原主机已确认轮换，但当前地址未核对”。两种情况都调用refresh刷新侧栏，返回true。

失败提示按sent区分：未发送用`未发送密钥轮换：<原因>`，已发送保留未确认/被拒绝原文。所有提示不含密钥正文。命令级只有页内一次调用顺序，没有跨窗口锁或永久幂等；服务端仍接受旧空体调用（无绑定/CAS），本命令自身不再发空体。

停止分支同样消费结果：先workspaceBinding（不匹配即不发送，避免停到别的主机），POST携绑定字段；请求抛错、非200、`success`非严格true或`running`不为false都报“停止结果未确认”，HTTP409报“未停止”，只有确认才refresh。这里同样不自动重试、不宣称隧道进程已退出。

导出的**deactivate匿名箭头**为空，释放依赖VS Code context.subscriptions（含PTY dispose），不是显式关闭agent-host或Bridge进程。

## 3. ChatView全部方法与回调

**constructor()**history空数组。**resolveWebviewView(webviewView)**保存_view、启脚本、设chatHtml、注册onDidReceiveMessage异步回调：

1. validWebviewMessage门禁；openNative分派命令；cancel abort当前controller。
2. send只允许没有controller时开始（单视图串行），建立AbortController，回user消息，取历史末12然后把本轮用户加入本地history。
3. postNdjson事件回调转发PTY和webview event，message累积assistantText，apply_patch结果揭示文件。postNdjson确认done+正常end后才将助手文本存历史；失败的用户条目仍保留。
4. catch回error，finally controller=null并发finished，使按钮复原。history内存数组没有总长度裁剪，只是每次发送取尾部；重载扩展不持久化聊天。

## 4. BridgeView全部方法与回调

**resolveWebviewView(webviewView)**设_view/options/html，消息验证后逐项处理（每个分支都在try内await，失败统一模态弹窗）：refresh调用refresh；start调用**startBridge(tunnelProvider)**（先取工作区绑定，POST `/api/bridge/start`，校验HTTP与success）；hostStart/hostStop/hostLog转给activate注入的hostCommands；autoBridge写globalState`webagent.startBridgeWithHost`；stop先取绑定再POST，严格校验success/running，失败弹未确认而非静默刷新；copy写系统剪贴板并通知；reset执行resetSecret命令。**constructor(context)**保存扩展上下文供globalState使用。

**refresh()**没有_view即返回；refreshPending合并本页在途读取；先组装主机信息（HostManager快照、是否手工地址、autoBridge），GET status必须HTTP200且有JSON才连同host一起post，错误时status只带经hostErrorHint转换的error，finally释放pending。它是HTTP完成/非空候选门禁，不是完整status所有字段的业务真实性验证。

## 5. chatHtml内嵌脚本（不是Node AST中的普通函数）

Webview通过acquireVsCodeApi取得postMessage；mode初始code，sending=false。

- Agent按钮onclick切menu、阻止冒泡；document click关闭菜单；menu.onclick取closest[data-m]后修改mode，forEach按钮on状态和标签。
- **add(cls,text)**移除empty提示，createElement+textContent安全显示，append并滚动；不渲染HTML/Markdown。
- **paintTasks(todos)**只对象数组前500项，filter统计completed，控制容器显示，replaceChildren，forEach建立li/textContent；符号区分completed/in_progress/其他。
- go.onclick：sending时仅发cancel，否则trim输入，清输入，切停止图标，post send。q.onkeydown Enter且无Shift阻止默认并click；open-native.onclick只发openNative。
- window message回调校验对象；finished恢复按钮，user用add，event按status/tool/message/error/consensus渲染；tool失败色并从set_todos结果paintTasks。未知事件忽略，不直接执行来自服务端的脚本。

HTML log/flex滚动区域、任务栏、模式菜单、输入框与发送按钮由id绑定；CSS控制深色布局/状态，不承载授权规则。maxLength是交互限制，宿主validWebviewMessage才是额外输入边界。

## 6. bridgeHtml内嵌脚本

顶部“主机”卡片：【启动】【停止】【日志】与“启动主机后同时开启 Bridge”复选框，**paintHost(host)**按状态（未启动/启动中/运行中/外部启动/启动失败/手工地址；idle但默认端口有主机回答时提示“可能属于其他文件夹，点【启动】核对”）写文字、禁用按钮（手工地址、启动中、运行中、外部时禁用启动；只有插件自己启动的主机或启动中才能点停止，启动中点停止即取消）并显示错误或来源告警。MCP卡片新增隧道下拉框（Quick/Named/ngrok），未被用户改动时跟随status.tunnelProvider（旧值named视为cloudflare-named）；start发送所选tunnelProvider。保存status对象。stop/reset的onclick仅发固定type；copy.onclick优先status.prompt，否则mcpUrl+连接提示，交宿主剪贴板。**paintTasks(todos)**与Chat同样构建安全DOM，不共享函数作用域。**paintLogs(logs)**取tool_call_end前12，payload检查对象，工具名/数值时长写textContent；无工具显示等待。不是倒序重排后的最新12保证，取决于服务端顺序。

window message只接受status，规范对象后更新URL/状态pill，paintTasks/paintLogs。4秒定时post refresh，加载后立即refresh。这里浏览器脚本不直接fetch本机API，CSP也不授予网络连接。

## 7. 其余两个JS文件

[modeFromChatRequest.js](modeFromChatRequest.js)唯一函数 **modeFromChatRequest(request)**：request.command合法值优先，其次prompt首部/ask、/plan、/code，默认code；不因普通文字包含ask就切换。UI所说Ask只读主要指工作区文件，内部任务/记忆元数据权限以后端注册表为准。

[workspaceMatch.js](workspaceMatch.js)：**normalizePath(p)**字符串化、反斜杠改正斜杠、去尾斜杠；只在Windows或Windows盘符/UNC文本时转小写；**sameWorkspace(vscodeFolder,hostRoot)**空路径false，否则比较规范文本。这不是realpath/inode验证，POSIX路径保留大小写，但符号链接别名仍可能被保守拒绝；PTY cwdFor还额外realpath检查边界，不应据此函数声称所有平台路径已严格同一。

## 8. package.json与SVG（非JS也属于实现）

[package.json](package.json)不是启动命令脚本：name/publisher/version标识扩展，engines.vscode声明兼容最低范围；main指extension.js；activationEvents用`onStartupFinished`在窗口启动完成后激活（状态栏与PTY宿主需要常驻；F70由`*`改来，`*`会在每个窗口启动关键路径上同步激活，VS Code文档明确不建议），onChatParticipant声明原生Chat入口；视图、命令在engines ^1.90下由contributes自动生成激活事件。只在源码上核对，未在真实VS Code/code-server窗口实测激活时序。contributes.configuration给本机host默认地址；chatParticipants id必须与createChatParticipant一致、commands对应模式；viewsContainers activitybar icon对应[resources/icon.svg](resources/icon.svg)；views两个id必须匹配registerWebviewViewProvider；commands五个id须分别匹配extension直接注册的三项和editorReview注册的两项。配置声明不代表VS Code每版本原生Chat API都存在，因此实现有特性检测。

SVG根元素指定24×24尺寸和同范围viewBox，fill=none、紫色stroke=#6366f1、宽2、圆端点/拐角；三个path分别画右尖括号、左尖括号和斜线，组合成代码图标。没有script、外链或事件属性。SVG是静态图标，由活动栏和participant引用；不是浏览器应用入口、HTTP鉴权或点击处理器。图形坐标、路径与描边决定图标外观，交互由贡献声明和activate注册负责。要验证资源本身有效，应解析SVG及检查打包包含，而不是用JS函数名覆盖率替代资产检查。

## 9. 测试与限制

```bat
npm test --prefix webagent-core/agent-host -- --filter=extension
npm test --prefix webagent-core/agent-host -- --filter=webviewRuntime
npm test --prefix webagent-core/agent-host -- --filter=pty
```

这些自动化检查使用静态/Mock宿主环境；不能代替Windows真实扩展加载、Chat participant可用性、菜单焦点、终端输出和手机MCP。源码里的实际限制已解释，本次没有为了让描述好看而暗改运行逻辑。

chatHtml在日志区外增加原生details使用帮助，首屏可见且不随聊天清空；不新增消息指令/自动发送。说明扩展跟随host模型，Ask不是模型选择器。发行副本同步。


## 10. 工作区绑定与启动拒绝（0.7.1）

**workspaceSnapshot()**（见第2节）返回status与binding；**workspaceBinding()**是它的薄封装。**workspacePaths()**先检查workspace.isTrusted；要求首文件夹为file URI并有fsPath，空窗口/虚拟目录直接抛中文提醒。返回本地文件夹路径。实体workspaceSnapshot先取before，再请求实时/api/status，核对HTTP、workspaceRoot及identity.hostInstanceId，之后再取after；内部**matches**按sameWorkspace比较首文件夹。前后任一不匹配则拒绝。首根规则与revealWorkspaceFile和PTY identity一致；多根项目建议将目标单独打开，不支持运行中自动改绑主机。

BridgeView启动/停止、原生Chat handler及ChatView send都先await workspaceBinding，然后把两个绑定字段随POST送往主机；失败showErrorMessage以modal=true弹窗，Bridge启动校验HTTP及success，停止另要求running为false。原生轮换改用workspaceSnapshot以取得旧密钥做比较。Chat校验后才登记历史，取消后不发送；postNdjson遇HTTP错误明确reject，不能把409正文吞成完成。refreshBar对空/不信任/首根不匹配给出警告，工作区变更会刷新，轮询仍保留。

验证：workspaceEntry的真实扩展VM处理器覆盖空窗口无请求、首根不匹配不启动、不信任和查询期间关闭文件夹；bridgeTunnel真实HTTP覆盖缺失/过期绑定409且不改变隧道/授权。VM不等于真实桌面VSCode弹窗验收。服务器收到的字段是客户端声明，不是后台读取IDE的证明，也不是认证或OS隔离。


## 11. Bridge Tasks（0.7.2，共用于桌面和code-server）

BridgeView.refresh以refreshPending合并并行请求、拒绝HTTP错误，避免轮询重叠导致旧状态倒灌；finally释放单飞状态。服务端status.bridgeTaskStates是远程报告，status.taskState只属于本地Chat，不能混读。Bridge页**paintBridgeTasks(groups)**规范最多16组/每组50项，带会话摘要把todo交给paintTasks（Bridge最多800条，Chat仍500）；追加报告进度及空状态/非自动核验说明，所有文字textContent渲染，不接受HTML。

Bridge任务区域不再因空列表隐藏，限制35vh并滚动/长词换行，颜色使用VSCode主题变量。请求失败保留最近计划但标记“同步失败，当前状态未知”；4秒消息刷新保留。code-server和桌面都加载该核心扩展，发行副本字节一致由extensionCopy验证。这里只说明代码/VM覆盖，未声称已在用户桌面或code-server窗口实测。

## 12. 一键启动主机（R6第一期）

[hostManager.js](hostManager.js)是纯Node模块（不引用vscode，便于测试），由activate创建一个**HostManager**实例。它让插件版不再需要CMD和浏览器：以VS Code首个文件夹为工作区，在后台运行`node installer/launch.js host <文件夹>`（不开3000端口的网页工作台）。

| 函数/方法 | 作用与边界 |
|---|---|
| readHostLocation(extensionDir) | 读插件目录的`host.json`（由install-desktop-extension.js写入）：format必须为1、root为绝对路径且含`installer/launch.js`与`agent-host/src/index.js`；缺文件、格式错、目录已搬走分别给出“重新运行install-vscode-extension.cmd”的说明。commit/contentHash格式不对时置null |
| portFree(port,host) / findFreePort({base,span,isFree}) | 在127.0.0.1上试监听判断空闲；从48271起最多找20个端口，全占用返回null |
| probeStatus(url,{timeoutMs}) | 1.5秒内GET `/api/status`，响应超1MiB、非200、非JSON、缺`workspaceRoot`或`identity.hostInstanceId`都返回null；其中`done`保证只结算一次 |
| repoCommit(root) | `git -C root rev-parse HEAD`，失败/非Git返回null |
| killTree(pid,platform) | Windows用`taskkill /pid <pid> /T /F`；其他平台对进程组发SIGKILL（spawn时detached建组），失败再杀单进程 |
| waitExit(child,ms) | 等exit事件或超时，返回是否已退出；内部`onExit`清定时器 |
| short(sha) / sleep(ms) | 提交号取前7位；等待辅助 |
| constructor(options) | 可注入log、onChange、workspaceMatches（插件用sameWorkspace）、nodePath、probe、spawnImpl、isPortFree、killTreeImpl、repoCommit、端口范围与各超时，默认就绪180秒、轮询1秒、停止等待10秒 |
| snapshot() / currentUrl() / setState(state,extra) | 状态为idle、starting、running、external、error；snapshot的warning合并来源告警与端口说明（离开starting/running时setState清除端口说明）；currentUrl在idle/error时为null，其余返回地址供agentHostUrl使用；setState后回调onChange刷新状态栏与侧栏 |
| checkSource() | 读host.json并比较主机仓库当前提交，不一致时给出warning（R8偏差c：插件装旧了不再无声） |
| locate(workspace) | 并行探测48271–48290，找到**工作区相同**的主机才返回；服务其他文件夹的主机记入others，从不接管或关闭。若最终端口不是48271，_start写端口说明：48271被谁占用、本主机用哪个端口，以及token模式Named Tunnel入口写死48271时远程会连到占用者 |
| attachExisting(workspace) | 只接管、从不启动：idle或error且没有子进程时，若同一文件夹已有主机（例如run-webagent.cmd启动的），状态设为external并清除错误。激活时调用；refreshBar经默认地址连上同一文件夹的主机而管理器仍是idle/error时也调用（VS Code先开、CMD后开的情况），卡片因此不再误显“未启动” |
| start(workspace) / _start(workspace) | 在途启动合并；自己的主机仍在为另一个文件夹运行（首个文件夹变了）时拒绝并提示先停止，绝不在旧进程之上再生成一个而让旧的成为孤儿；已running/external且同一文件夹直接返回。先locate，找到就接管；否则checkSource、读host.json、找空闲端口、spawnHost、waitReady。失败时先内部清理（stop的cancel:false），再置error；用户在启动中点停止则置idle并抛cancelled错误，不当失败 |
| spawnHost(workspace,port) | env加`AGENT_HOST_PORT`、`WEBAGENT_PARENT_PID`（扩展宿主pid）、`WEBAGENT_LIFELINE=stdin`，删`WEBAGENT_AGENT_HOST_URL`；stdio三路管道、windowsHide、shell:false。`pipeLines`把stdout/stderr逐行写入输出面板（单行2000字符截断）；ENOENT提示安装Node或设置webagent.nodePath；exit区分就绪前退出与运行中意外退出 |
| waitReady(workspace) | 轮询probeStatus直到回答且工作区相同；回答了别的工作区立即报错；子进程退出或超时报错（提示首次需联网装依赖） |
| stop({quiet,cancel}) | 启动中但进程尚未生成（探测、核对来源、选端口）时只置取消标记，`throwIfCancelled()`在各步与spawn前抛出，保证不再生成进程；之后只停**自己启动**的主机：关闭stdin管道（主机随即执行自己的shutdown，先停命令与隧道），10秒不退出才killTree；接管的外部主机只记录说明、返回external:true，绝不关闭 |
| markLost() / dispose() | 外部主机不再回答时忘掉它；dispose供deactivate调用，停止自己启动的主机 |

extension.js新增：**explicitHostUrl()**用`inspect`区分“用户/工作区真的填了”与package.json默认值（填了就只连接、不自启）；**nodePathSetting()**只读用户级`webagent.nodePath`（package.json声明scope为machine，工作区值被忽略），必须是绝对路径，留空用PATH中的node；**hostErrorHint(err)**把ECONNREFUSED/ECONNRESET译成“主机未启动，请点【启动】”；activate内的**startHost({quiet})**（拒绝手工地址→首个文件夹→HostManager.start→接管时提示→按复选框用主机记录的隧道类型启动Bridge）与**stopHost()**（启动中直接取消；外部主机只提示；Bridge运行或状态未知时先模态确认会断开远程连接）；**deactivate()**返回dispose的Promise。新命令：`webagent.startHost`、`webagent.stopHost`、`webagent.showHostLog`；新设置：`webagent.nodePath`、`webagent.autoStartHost`（默认false，只启动本机主机，从不自动开Bridge）。

**与网页工作台并存：** 网页工作台版不变。已用run-webagent.cmd为同一文件夹启动主机时插件自动接管（显示“外部启动”），VS Code与网页看到同一主机；插件停止或关闭窗口不会结束它。两个VS Code窗口打开同一文件夹时，第二个窗口接管第一个的主机；第一个窗口关闭后主机随之停止，第二个窗口状态栏回到“未启动”，需再点一次启动。

**限制：** 主机代码仍来自仓库或安装目录（host.json），未打包进插件；Named Tunnel/ngrok的域名与Token仍在网页工作台保存（第二期迁移）；token模式Named Tunnel若在Cloudflare后台把入口写死为48271，需让插件主机拿到48271（第一个窗口通常就是）。Windows进程树结束与父进程看护由Windows CI上的hostLaunch测试验证，真实桌面关闭VS Code后的端口/cloudflared释放仍需用户实机验收。

## 13. 设置页请求转发（R6第二期第2批）

[apiRelay.js](apiRelay.js)不依赖vscode，可单独测试。设置页webview里的工作台模块经`js/api.js`→`js/vscodeRelay.js`把请求`postMessage`给扩展进程，由这里转发到本窗口启动或接管的主机（第3批接线时注入的send绑定agentHostUrl()与requestJson）。webview自身不访问127.0.0.1，主机的Origin与本机控制面检查不放宽：转发请求不带Origin/Sec-Fetch-*，Host为127.0.0.1，即主机已接受的本机CLI路径。

**checkRequest(message)**：默认拒绝。路径须以单个`/`开头、不超过2048字符、不含反斜杠/控制字符/`#`；用URL解析后若来源变化、pathname与原文不同（点段）或含`%2e`，直接拒绝而不是规范化——白名单正则两端锚定且ID只允许字母数字`_-`，这一层是冗余防线（去掉它测试不红，已记录）。方法+路径须命中RULES：状态/诊断/执行控制、Bridge启停与重置、GitHub登录、模型与Provider探测、自定义配置、画像探测、技能列表/读取/新增、审批列表与批准/取消、工作流预览/请求、检查点、连接自检。**不转发**：chat、tool/call、pty、files、tasks/reset（不属于设置，tool/call会让设置页变成任意工具入口）；external、consensus（决定D4：第二期结束前只在网页工作台）；probe（探针暂停、由他人负责）。只有`/api/skills/load`接受查询串。GET/DELETE不得带正文；正文须为1MiB内的有效JSON文本，原样转发。

**createApiRelay({send,post,maxInFlight=16,timeoutMs=120000})**：返回handle/request/abort/dispose与size。**request(message)**：编号须为1–64位`[A-Za-z0-9_-]`字符串，否则忽略（无处回复）；重复编号、超过并发上限、白名单拒绝都回`ok:false`且不调用send。send结果的状态码须为200–599整数，否则按失败回复；网络失败、期限、取消、重定向都回`ok:false`与原因，从不编造状态码；HTTP 4xx/5xx作为正常回答原样转回（`ok:true,status`）。120秒上限高于工作台各模块自己的计时器，模块超时先以取消消息到达。**abort(message)**取消在途请求，已结束的返回false。**handle(message)**分发`webagent-api`/`webagent-api-abort`，其他消息返回false留给原有处理。**dispose()**在面板关闭时取消全部在途请求；之后经**reply**的任何结果都不再发给已关闭的webview，新请求也不回复。**size**为在途数。

验证见[浏览器与Webview测试详解](../agent-host/tests/浏览器与Webview测试详解.md)的settingsRelay：单元、webview端与真实主机端到端。

## Bridge所有者控件

BridgeView的control消息只接受chat/bridge，或含64字符revision与四个布尔permissions。宿主调用workspaceBinding（包含工作区信任和主机核对），仅发固定字段到/api/execution-control；失败弹错误，成功发controlSaved并刷新。bridgeHtml保存policyDirty/policyRevision，周期status不覆盖未保存草稿；重新读取主动放弃草稿。控件依赖提示不自动增权。经典和code-server核心扩展共享策略；这是权限界面，不是新增探针入口。验证见webviewRuntime与executionControl；真实桌面显示仍需另验。

## editorReview.js：原生单文件草稿预览与恢复

这是用户在命令面板显式执行的本地编辑器操作，不调用agent-host、不启动Chat、不成为远程MCP工具，也不绕过Bridge所有者策略替模型执行任务。支持桌面VS Code以及运行同一核心扩展的code-server；不是经典工作台按钮。命令注册由activate调用registerEditorReview。

- **diskSnapshot(vscode,doc)**：要求可信工作区、未关闭file文档，getWorkspaceFolder确认归属；root/file真实路径再检查包含关系，拒绝指向工作区外的符号链接。打开普通文件、fstat后按最多65537字节增量读取，超过64KiB拒绝；严格UTF-8解码，拒绝NUL/BOM。不支持未保存的新文件、远程虚拟文件、非UTF-8或二进制。finally关闭fd。O_NOFOLLOW/O_NONBLOCK按平台支持启用；路径父目录恶意替换仍不是OS沙箱或原子事务。
- **registerEditorReview(vscode,context)**：登记两条命令及只读TextDocumentContentProvider，context负责释放；busy防止同一扩展同时打开多个恢复确认。**prune()**按15分钟惰性TTL清理，最多16份64KiB文本；**snapshot(text)**用随机URI存不可变文本。**provideTextDocumentContent(uri)**只返回该快照，过期显示重新预览提示；不是可任意读盘的URL处理器。dispose清内存并使尚未确认的恢复失效，已经打开的VS Code虚拟文档副本由编辑器管理，不承诺内存安全擦除。
- **review(restore)**：捕获原编辑器、document.version、草稿与磁盘文本，通过vscode.diff显示两份只读快照。预览不修改/保存文件；差异窗口不是实时追踪磁盘。恢复另需模态确认，自动保存必须off，再核对信任/工作区、文档未关闭、版本/草稿与磁盘文本未变。editor.edit以单次replace及undoStopBefore/After建立原生撤销边界；不调用save、不强制覆盖、不自动重试。原生编辑器处理版本冲突，拒绝时显示错误。编辑器可能规范化行尾；这是文本草稿恢复，不保证原始字节/元数据恢复。
- 命令回调统一捕获错误并showErrorMessage；finally释放busy。磁盘在最终检查后仍可能被其他程序修改，自动保存设置也可能由其他扩展随后改变；不是文件锁/保存事务。未来手动保存仍须遵从VS Code磁盘冲突提示。

### 新手操作与验收

1. 在可信本地工作区打开一个已保存、无BOM的UTF-8小文本文件（≤64KiB）。先备份；使用无重要数据的临时文件。
2. 修改正文但不要保存，Ctrl+Shift+P运行“Web Agent: 预览当前草稿与磁盘差异”。左侧是读取时磁盘，右侧是草稿快照，两侧只读；磁盘不应变化。
3. 关闭差异或返回原文件，关闭自动保存。运行“Web Agent: 预览并恢复当前草稿为磁盘版本”，审阅后确认。原文件草稿变为读到的磁盘文本，不主动保存。
4. 返回原文件，Ctrl+Z应恢复刚才草稿；可继续使用VS Code原生redo。撤销栈由VS Code管理，关闭文档/重载/其他编辑可影响它，不提供长期保证。
5. 在确认期间修改原文件草稿或由另一程序修改磁盘，再确认必须拒绝；取消应零修改。自动保存开启、未信任、超预算和不支持编码也应明确拒绝。

**不是Agent修改历史或经典保存回退**：只恢复当前未保存草稿到当时磁盘文本。已保存的Agent多文件修改、创建/删除/重命名/shell副作用、事务补偿仍不在此范围。不会凭这个功能宣称通用回滚完成。

### editorReview.test.js

**main()**使用真实临时磁盘与注入的VS Code API替身；**run(restore)**调用实际注册命令。断言只读左右快照、取消零编辑、自动保存拒绝、确认期间草稿/磁盘/信任变化拒绝、明确确认后仅一次editor.edit、undoStopBefore/After与无直接磁盘写入；严格编码、BOM/NUL、大小和非file失败。替身中的executeCommand、edit/replace和showWarningMessage只记录/触发状态变化，不能证明真实VS Code diff/撤销栈可视交互通过。真实桌面/code-server五步验收仍待，不把VM测试当作实机结果。

夹具细节：onConfirm在模态确认返回前注入草稿/磁盘/信任变化；getText/positionAt返回模拟文档文本和位置；Range的constructor保存起止位置。parse/toString只包装虚拟URI，getWorkspaceFolder/getConfiguration/get提供临时工作区和自动保存值；registerTextDocumentContentProvider保存provider，registerCommand保存真实回调。showErrorMessage收集错误，showInformationMessage不触发真实UI；dispose清理由测试finally统一执行。替身不负责模拟操作系统并发或完整编辑器行为。

F54原生流回归：nativeChatStream用真实回环HTTP与VM中的真实postNdjson/ChatView/注册handler，替换VS Code及workspaceBinding；覆盖302/格式/坏帧/提前结束/断流/取消（含done回调时取消）、回调异常、单行/总预算、控制时钟的deadline、跨UTF8字节/无尾换行正例，以及失败不进助手历史。不是实际VS Code窗口验收；该第五批当时未修requestJson；第七批现补其响应预算/总时限/断流清理及重定向拒绝，实际IDE验收仍单列。

F54第七批：requestJson失败不表示变更未发生。resetSecretCommand与Bridge停止消费方继续显示未确认、不自动重放；有界完整409仍进入既有“主机拒绝”分支。PTY的hello/poll及claimed/accepted仍由successfulResponse和各自JSON字段复查，本次不改变终端执行授权。请求正文预算、跨请求并发总量与真实Windows窗口/网络环境不由本次响应字节上限认证。
