# VS Code 扩展入口、网页消息与贡献声明

## 文件协作

[extension.js](extension.js)在扩展宿主(Node)运行，两个HTML模板里的script在Webview运行，两边只能通过postMessage桥接。本机HTTP默认127.0.0.1指的是**扩展宿主所在机器**，不是远程手机浏览器。[PTY扩展详解](PTY扩展详解.md)接续真实终端链。

## 1. 顶层函数

| 函数 | 输入/返回 | 调用与限制 |
|---|---|---|
| dispatchPty(ev) | 事件→undefined | 只转发pty_request给全局ptyHost，noteStream再handleIncoming；未await返回Promise，不统一接收其异步拒绝 |
| agentHostUrl() | 无→URL文本 | VS Code设置优先，然后环境变量，再48271；去尾部一个斜杠。manifest设置带默认值，所以通常设置读取本身已有默认 |
| requestJson(method,url,body) | HTTP参数→Promise<{status,json,raw}> | 根据http/https选库，JSON正文带长度；data积累Buffer，end尝试JSON，坏JSON保留raw/json null。15秒timeout destroy，error reject；HTTP4xx/5xx本身不reject，没有通用响应大小上限 |
| postNdjson(url,body,onEvent,signal) | Chat请求→Promise<void> | POST JSON+AbortSignal、5分钟timeout；UTF8 data缓冲按换行解析，保留半行；end解析最后半行再resolve；每行parse和onEvent同一try，回调异常也吞；未先验证HTTP状态/Content-Type |
| historyFromChatContext(context) | VS Code历史→role/content数组 | 每turn.prompt变user，response.map识别value或value.value后join变assistant；最后12消息，不是12轮；不传引用/工具结构 |
| revealWorkspaceFile(rel) | 相对路径→undefined | 首工作区joinPath，openTextDocument.then成功show预览/保留焦点，打开失败吞；此函数本身不是写入沙箱检查 |
| registerChatParticipant(context) | 上下文→undefined | API存在才尝试创建webagent.agent，设SVG icon，加入订阅；不支持/注册异常不阻止Webview |
| activate(context) | VS Code上下文→undefined | PTY→ChatView/BridgeView provider→原生Chat→状态栏→命令订阅；不是启动agent-host服务器 |
| validWebviewMessage(msg,surface) | 不可信消息→boolean | 拒绝空/数组/非字符串type；chat只openNative/cancel/合法模式send且正文非空≤128000；bridge只合法copy或refresh/start/stop/reset。没有通配API代理 |
| chatHtml()/bridgeHtml() | 无→完整HTML字符串 | 各生成随机nonce，默认资源禁用，script仅nonce，允许内联style，禁止base/form；事件内容不作HTML注入 |

**registerChatParticipant的handler(request,chatContext,stream,token)**：AbortController关联取消订阅并处理预取消；modeFromChatRequest取模式，去首个slash命令。空正文输出帮助、dispose返回；非空progress→postNdjson。事件回调先忽略已取消，再PTY分派；status为进度，tool显示结果/补丁打开与reference，message Markdown，error错误，consensus区分模拟汇总。catch统一提示连不上（因此取消/其他网络错误文案未细分），finally dispose取消订阅。

## 2. activate内部回调

**refreshBar()**每5秒GET status，明确检查status≥400/无JSON；有工作区差异显示warning，正常显示Bridge状态，catch离线。context.dispose清interval；已有请求不会因clearInterval自动取消。

三个registerCommand箭头：openBridge打开侧栏；openAgentChat尝试原生Chat预填@webagent，失败回侧栏；resetSecret POST后通知并刷新Bridge，catch错误。这里resetSecret未检查HTTP状态，requestJson resolved不保证API业务成功，不能把通知文字当后端证据。statusBar自身也加入subscriptions管理。

导出的**deactivate匿名箭头**为空，释放依赖VS Code context.subscriptions（含PTY dispose），不是显式关闭agent-host或Bridge进程。

## 3. ChatView全部方法与回调

**constructor()**history空数组。**resolveWebviewView(webviewView)**保存_view、启脚本、设chatHtml、注册onDidReceiveMessage异步回调：

1. validWebviewMessage门禁；openNative分派命令；cancel abort当前controller。
2. send只允许没有controller时开始（单视图串行），建立AbortController，回user消息，取历史末12然后把本轮用户加入本地history。
3. postNdjson事件回调转发PTY和webview event，message累积assistantText，apply_patch结果揭示文件。成功流结束才将助手文本存历史；失败的用户条目仍保留。
4. catch回error，finally controller=null并发finished，使按钮复原。history内存数组没有总长度裁剪，只是每次发送取尾部；重载扩展不持久化聊天。

## 4. BridgeView全部方法与回调

**resolveWebviewView(webviewView)**设_view/options/html，消息验证后switch式if处理：refresh调用refresh；start POST cloudflare；stop POST停止；copy写系统剪贴板并通知；reset委托命令。start/stop响应未统一校验状态，再刷新状态才见实际结果；catch显示错误。初始化立即refresh。

**refresh()**没有_view即返回；GET status后post状态JSON，网络失败回带error的状态。和状态栏不同，该方法未检查HTTP错误码，所以不要仅凭界面无exception认定成功。

## 5. chatHtml内嵌脚本（不是Node AST中的普通函数）

Webview通过acquireVsCodeApi取得postMessage；mode初始code，sending=false。

- Agent按钮onclick切menu、阻止冒泡；document click关闭菜单；menu.onclick取closest[data-m]后修改mode，forEach按钮on状态和标签。
- **add(cls,text)**移除empty提示，createElement+textContent安全显示，append并滚动；不渲染HTML/Markdown。
- **paintTasks(todos)**只对象数组前500项，filter统计completed，控制容器显示，replaceChildren，forEach建立li/textContent；符号区分completed/in_progress/其他。
- go.onclick：sending时仅发cancel，否则trim输入，清输入，切停止图标，post send。q.onkeydown Enter且无Shift阻止默认并click；open-native.onclick只发openNative。
- window message回调校验对象；finished恢复按钮，user用add，event按status/tool/message/error/consensus渲染；tool失败色并从set_todos结果paintTasks。未知事件忽略，不直接执行来自服务端的脚本。

HTML log/flex滚动区域、任务栏、模式菜单、输入框与发送按钮由id绑定；CSS控制深色布局/状态，不承载授权规则。maxLength是交互限制，宿主validWebviewMessage才是额外输入边界。

## 6. bridgeHtml内嵌脚本

保存status对象。start/stop/reset的onclick仅发固定type；copy.onclick优先status.prompt，否则mcpUrl+连接提示，交宿主剪贴板。**paintTasks(todos)**与Chat同样构建安全DOM，不共享函数作用域。**paintLogs(logs)**取tool_call_end前12，payload检查对象，工具名/数值时长写textContent；无工具显示等待。不是倒序重排后的最新12保证，取决于服务端顺序。

window message只接受status，规范对象后更新URL/状态pill，paintTasks/paintLogs。4秒定时post refresh，加载后立即refresh。这里浏览器脚本不直接fetch本机API，CSP也不授予网络连接。

## 7. 其余两个JS文件

[modeFromChatRequest.js](modeFromChatRequest.js)唯一函数 **modeFromChatRequest(request)**：request.command合法值优先，其次prompt首部/ask、/plan、/code，默认code；不因普通文字包含ask就切换。UI所说Ask只读主要指工作区文件，内部任务/记忆元数据权限以后端注册表为准。

[workspaceMatch.js](workspaceMatch.js)：**normalizePath(p)**字符串化、反斜杠改正斜杠、去尾斜杠、全小写；**sameWorkspace(vscodeFolder,hostRoot)**空路径false，否则比较规范文本。这不是realpath/inode验证，非Windows大小写敏感文件系统可能误判；PTY cwdFor还额外realpath检查边界，不应据此函数声称所有平台路径已严格同一。

## 8. package.json与SVG（非JS也属于实现）

[package.json](package.json)不是启动命令脚本：name/publisher/version标识扩展，engines.vscode声明兼容最低范围；main指extension.js；activationEvents的`*`让加载积极激活，onChatParticipant声明原生Chat入口。contributes.configuration给本机host默认地址；chatParticipants id必须与createChatParticipant一致、commands对应模式；viewsContainers activitybar icon对应[resources/icon.svg](resources/icon.svg)；views两个id必须匹配registerWebviewViewProvider；commands三个id必须匹配注册处理器。配置声明不代表VS Code每版本原生Chat API都存在，因此实现有特性检测。

SVG根元素指定24×24尺寸和同范围viewBox，fill=none、紫色stroke=#6366f1、宽2、圆端点/拐角；三个path分别画右尖括号、左尖括号和斜线，组合成代码图标。没有script、外链或事件属性。SVG是静态图标，由活动栏和participant引用；不是浏览器应用入口、HTTP鉴权或点击处理器。图形坐标、路径与描边决定图标外观，交互由贡献声明和activate注册负责。要验证资源本身有效，应解析SVG及检查打包包含，而不是用JS函数名覆盖率替代资产检查。

## 9. 测试与限制

```bat
npm test --prefix webagent-core/agent-host -- --filter=extension
npm test --prefix webagent-core/agent-host -- --filter=webviewRuntime
npm test --prefix webagent-core/agent-host -- --filter=pty
```

这些自动化检查使用静态/Mock宿主环境；不能代替Windows真实扩展加载、Chat participant可用性、菜单焦点、终端输出和手机MCP。源码里的实际限制已解释，本次没有为了让描述好看而暗改运行逻辑。
