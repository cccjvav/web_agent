# DOM、Monaco与VS Code Webview运行fixture

这四文件比静态HTML ID检查深入，但都不是浏览器/VS Code E2E。

## monacoLoading.test.js

[源码](monacoLoading.test.js)读真实monaco.js，分别构造LF/CRLF两种source，去单个import和export后vm执行；import正则显式支持\r?\n，Windows不再遗漏声明。**$**指状态节点，**captureActiveFile/activateTab**计数；**createElement/appendChild**捕获script；**setTimeout**保存deadline不等真实7秒，**clearTimeout**空实现。

loadMonaco状态先加载中；手动script.onerror→Promise false/纯文本提示；再次加载手动deadline→false；随后注入require（成功回调）、require.config和editor.create，调用迟到onload，必须先捕获缓冲、激活一次并状态就绪；删除require后onload须false而非崩溃。异步IIFE.catch设置exitCode1。没有下载CDN或创建实际Monaco worker。

## workbenchRuntime.test.js

[源码](workbenchRuntime.test.js)父进程以--experimental-vm-modules/--vm-child重启自身，10秒超限，status null算失败。子进程vm.SourceTextModule真实加载state/dom，link回调断言依赖路径并evaluate，防import阶段就异常。

按钮**setAttribute**记录属性；Map存储getItem/setItem，Monaco.setTheme记录themes。验证默认dark、切light同步dataset/storage/Monaco vs/按钮深色标签、重初始化恢复light；非法存储回dark，读写存储抛错不崩；ui.applyTheme必须等于导出函数。

再真实加载bridge，button.classList.remove为空回调，只满足指引页灭灯调用，不检测CSS。Mock setRight/toast，sendChat/fetch均设置为一调用就抛。arenaConnect必须只改提示“尚未建立”，不可偷偷发本机任务/MCP请求。这是负向行为fixture，不只是检查文案。catch exitCode1，内存context随子进程退出释放。

### 模型菜单与定位回归（2026-09-14）

在相同VM中加载真实picker.js。**listen(target)**给document/window注入addEventListener/removeEventListener并用Set计数；setTimeout/clearTimeout用Map模拟未执行timer。createElement建立最小box，querySelector返回search/list，**getBoundingClientRect()**按maxWidth/maxHeight返回测试尺寸，**focus()**记录focused，contains判断box/search/list成员，**remove()**标记removed。这里只模拟几何，不伪称浏览器layout。

**open(extra)**用anchor和onPick记录器打开真实picker；**clean()**断言timer和所有监听均清空。断言：聊天列表包含builtin且注明无需API、外部名称HTML转义；320×240视口底部锚点向上钳制到8px、最大高度178px；搜索无匹配；点击选中builtin回调；合并排除builtin且空表有配置提示；重开取消旧实例，延迟监听只剩一个；内部scroll不关，Escape事件提供preventDefault/stopPropagation空方法，断言恢复focus，resize/外部scroll全部清理；顶部锚点在空间充足时向下开。

renderBrowser额外验证Arena是连接指引、不含arena-send伪按钮；javascript:地址不能成为href。URL为标准Node URL注入，不发外网请求。浏览器另行实测结果见CURRENT_AUDIT，不由本fixture冒充。

### 第31组：状态刷新与模型切换

同一VM新增statusNodes最小DOM，querySelector/getElementById按ID复用节点，bind需要的监听/样式方法仅为空替身。真实加载bridge/settings/bind/picker，执行实际回调而非复制函数。HTTP503、success:false、models坏项/错误caps、坏JSON和网络失败不能污染最近确认快照；finishOlder/finishNewer控制两次GET完成顺序（故意不服从Abort），较旧成功不能覆盖较新成功或较新失败。手动触发计时器验证超时清理。选择成功后，隐藏select和标签必须一致；选中项不存在时不代选builtin。

模型选择在POST待定期间立即恢复确认select；并发点击builtin不增加POST。409/业务失败保留原状态、不报已切回；成功POST后用实际refreshStatus读取并同步标签。保存成功但读取HTTP500或被新请求取代时仍返回保存true、提示刷新失败，只写一次。picker按钮的真实点击负例另由modelStateBrowser覆盖。这里不验证跨标签页写锁、全部status嵌套schema或真实模型服务。

### 第32组：Provider失败消费和共享写入guard

workbenchRuntime执行真实bind/settings：Test HTTP500即使JSON success:true也不能报OK；Add发现HTTP/业务/坏JSON/无效列表/网络/超时均不写，固定异常提示不含fixture Key。finishProbe控制在途请求，在此期间修改Endpoint/Key/vision，再重复Test/Add/模型选择不增加请求；实际保存只用原快照且不清新Key草稿。显式manualId只POST addProvider，不重跑发现、不携旧models/activeModelId；成功清未改动Key，409/坏JSON或旧服务器success:true但缺added则未确认且保留Key。Test有manualId也只读列表、不登记。provider-table用__proto__/constructor组名必须可渲染。

## editorRuntime.test.js

[源码](editorRuntime.test.js)父进程15秒VM子模式。**element()**生成value/innerHTML/children/handlers，appendChild、querySelector、addEventListener等最小DOM；**get(id)**Map复用节点；window.confirm由布尔控制；fetch记录calls，从responses队列shift，没有计划响应直接assert失败，Error项抛错。

element.classList.toggle为空回调；beforeunload传入的preventDefault只置布尔标志，不真的关闭页面；editor.setModel把引用记到fixture，非渲染。真实state/dom/tabs模块link/evaluate，toast收messages；initEditorSafety连调两次。**response(data,status=200)**带异步json，**hash(letter)**重复64位生成假版本值。

| fixture链 | 断言 |
|---|---|
| 开one、fallback input编辑、开two再切回 | dirty真、编辑正文保留 |
| confirm=false关闭/触发beforeunload | 取消丢弃保留tab，脏数据阻止离开 |
| 保存409 | 请求expectedHash为原hash，savedContent不改、dirty保留、提示未覆盖 |
| 网络错/500/坏JSON | 提示对应错误，hash/dirty保持，不误报保存成功 |
| 保存pending再次save | calls不增加；即使confirm=true也不能关saving tab |
| pending期间新编辑并切two，再finish成功 | one.savedContent是旧提交快照、content仍较新、dirty真；two正文不被污染 |
| 再保存one | 用新hash，确认后dirty清 |
| 迟到Monaco | **createModel**生成含getValue/setValue/onDidChangeContent/dispose的模型；setValue触发change，listener.dispose留标记。迁移fallback最新正文，切tab保持同model、总计两模型，saveViewState/restoreViewState保行3 |
| 关闭脏tab确认 | model/listener都dispose，活跃转two；剩干净tab不阻beforeunload |

**finish**控制保存Promise时间顺序，无真实磁盘/HTTP/Monaco；并未覆盖所有apply_patch外部更新与dirty冲突分支。

## webviewRuntime.test.js

[源码](webviewRuntime.test.js)VM运行完整extension.js，定制**require(name)**：vscode返回commands.executeCommand/clipboard.writeText记录器，showInformationMessage/showErrorMessage空；相对依赖给空对象，不启动PTY。追加测试导出拿到ChatView/BridgeView/html/validator。

validator负例包括null/数组/字符串/未知type/非法mode/正文对象，正例三mode；纯空白/超128000拒；Bridge非法copy拒，refresh/start/stop/reset允许。伪webview.**onDidReceiveMessage(fn)**存receiver，Chat接null/非法输入不能调command，openNative只能调openAgentChat；Bridge.refresh替换计数，初始化一次、未知不增、refresh再增，copy对象不能写剪贴板、合法字符串能写。

内部**runPage(html)**检script nonce与CSP匹配、default-src/base-uri/form-action none、禁止unsafe script；**element(tag)**的innerHTML setter直接抛，强制动态渲染走安全DOM；appendChild/replaceChildren保存子节点，querySelector返回null、querySelectorAll空数组，classList.toggle/remove为空回调；这些仅提供最小接口，不测样式。**node(id)**Map复用，window.addEventListener收listeners，acquireVsCodeApi.postMessage与setInterval为空。提取真实内嵌script执行，null message不崩。

paintTasks带HTML样式文本和null：仅一个li、textContent保留尖括号而不创建子HTML；非法对象清列表。两次chatHtml nonce不同。Bridge.paintLogs同样尖括号工具名保留纯文本，12ms正确、失败显示Failed、非法列表显示等待。这里CSP只检查字符串，**没有真正浏览器强制执行CSP**；随机nonce“不相同”不是密码学检验。

## 验证

按monacoLoading、workbenchRuntime、editorRuntime、webviewRuntime分别filter，或全量npm test。真实焦点、浏览器安全策略、CDN、桌面VS Code插件与终端仍应执行人工验收。

workbenchRuntime续测：openSite配startBridge抛错替身，仍能打开站点tab且不触发隧道。独立bootContext执行真实app.js，stateStub/monacoStub/empty合成模块注入；bootUi.loadTree同步抛错、loadMonaco异步拒绝，WebSocket替身计数sockets，activateTab与toast分别计数activated/warnings。等setImmediate后断言socket已连接尝试、初始tab仍激活且有可见错误提示。其他bootUi方法为空操作，console.error仅吞预期fixture失败，不模拟真实浏览器网络/剪贴板。

## Bridge活动前端回归补充
在同一VM调用真实paintBridgeActivity：快照calls7但只一条日志仍显示累计7；同epoch/revision不重绘、不叠加；工具名HTML转义。注入AbortController和fetch替身，refreshBridgeActivity同时两次调用必须返回同一个Promise，只请求一次；503显示同步失败，下一次成功即使revision相同也恢复文字；新revision清零，全部请求清除超时timer。真实浏览器与认证MCP链路另行测试，不由此fixture替代。

新增回归核对经典工作台帮助里的读取示例/未完成边界，以及扩展chatHtml里独立模型与模式说明；不把扩展VM静态检查称作真实Windows VS Code点击验收。

workbench.browser新增统计接口503时刷新页面显示—而非0，恢复接口并手动同步后核对原计数、trace、epoch/resetAt不变，再次普通刷新仍恢复；明确清除后核对operator-cleared。workbenchRuntime验证cache:no-store和无效JSON快照不抹掉原数字。

probeTransport.test只导入原型采集层（不导入自动boot入口），用隔离ReadableStream/Response/Xhr/Socket/Events桩验证预算、取消、Response身份、静态常量及复用；不访问账号。workbench.browser失败时向CI输出有界且删去URL/长ID的annotation，便于日志下载不可用时定位；连接核对的跨站本机API应精确404/not found，不是MCP路由的403。

probeTransport测试实现：bytes用TextEncoder生成纯夹具字节；ReadableStream的start填入超大块，cancel设置已取消标记，pull产生持续单字节用于块数上限。setTimeout桩捕获截止回调并验证15000ms，clearTimeout桩不触发真实等待；finally恢复全局计时器。fetch桩只返回已有Response并记下参数，从不联网。Socket/Events的constructor记录参数，addEventListener为空实现；Child继承被包装的WebSocket验证new.target和instanceof。Xhr.constructor建立监听集合，open/send为空原生替身，addEventListener/removeEventListener维护集合验证重复send不叠加。最后恢复window/document并stopCaptures，测试不加载自动启动main。

probeTransport生命周期续测：repeated为重复注册的同一函数，offA/offB分别只移除自己的注册；offFirst/offSecond在emit中退订验证快照语义，offThrow/offReject模拟同步抛错与异步拒绝。Target.constructor创建事件集合，addEventListener/removeEventListener管理函数集合，fire发送快照，count核对残留数，getBoundingClientRect返回固定坐标。scheduleBoot只传计数替身，不启动main；覆盖pending/ready/failed/blocked及重复排队。HUD用Object.create构造隔离实例，down是鼠标事件夹具，host.remove只计数；实际_draggable/destroy/log/render验证非左键、失焦、重复拖动、mouseup和销毁后的静默行为。

真实浏览器新增probeHudBrowser：另开空白页，路由全部abort，只把ui.js去掉ESM export标记后加载，不注入main/interceptor/令牌模块。beginDrag依据实际DOM坐标在Shadow DOM标题上触发mousedown；mousemove确认移动、blur确认停止移动；拖动中click关闭后，对移除的root再次触发拖动也不得修改位置。验证真实close处理、销毁后render/log无效、提示“不停止采集”，finally关闭夹具页。这个测试覆盖UI实际DOM，不等于真实Arena原型运行验收。

probeTransport的account通过oncePerObservation把中性完成观测写入BUS预算，offBudget退订用于计数的观察者；重复1000次同对象只记一次，1000个新对象仍受500条上限约束。recursive回调再进入自身只能执行一次；failing抛错后同对象不得重放。测试未执行原型行为题库；mainSource静态检查appendCanaries位于分类快照之前且不再直接push证据数组。

editorRuntime对真实tabs模块增加草稿previewActive/savePreview：仅预览无PUT、确认后一次消费、修改草稿后拒绝、await期间编辑淘汰旧预览。workbench.browser使用文件菜单打开diff，先检查磁盘未变，再点击确认保存并核对实际正文。验证仍区分VM、CI Chromium与用户真实VS Code。

editorRuntime验证保存句柄后的previewUndo/savePreview：回退期间在Monaco改稿，响应只更新磁盘基线，保留新草稿dirty；脏稿不发预览请求。真实浏览器回归通过文件菜单预览回退、确认按钮，再查磁盘去掉上一保存的新增行。

公网接入UI回归拦截/api/external/servers，不访问真实第三方：默认复选框关闭，明确确认后请求包含publicHttps/confirmedPublic及实际主机/工作区绑定，令牌输入清空。DNS/TLS/审批实现在publicHttps隔离TLS测试验证，两种证据不能冒充公网供应商已验收。

stdio审批回归必须等待具体requestId的approve响应为succeeded，再核对结果显示与实际文件；不能仅等待输入参数中本来就有的STDIO-APPROVED文本来推断调用已结束。该竞态在b321432 CI暴露，保留严格文件证据。

### docsViewerBrowser(browser)

使用真实Chromium单独页面，通过route白名单提供实际docs-site/index.html/app.js/content.js/styles.css，其他请求中止；不连接外网服务。验证有结果→无匹配替换→清空移除，坏guide百分号不阻断全文，以及真实MCP详解含斜线标题的目标。覆写scrollIntoView仅记录被调用元素ID，不把它当滚动动画/视觉验收；pageerror收集未处理错误，finally关页面。此用例使用真实DOM/脚本，不是VM，但也不覆盖静态服务器网络/全部浏览器或所有标题语法。

workbenchRuntime实际Bridge模块VM失败路径已按第42组更新：HTTP200/success:false或HTTP失败均在独立结果区显示未确认、不回显tunnelError/note中的凭据，启动失败仍尝试一次只读刷新且不复制URL；停止时HTTP失败、业务失败、响应丢失不假灭灯，写确认和后续读取单独消费。它使用模拟fetch/DOM，不是公网提供商或Windows进程验收。

R3定制设置回归：workbenchRuntime加载真实settings模块，先用400负例复现旧保存返回undefined/污染state，再覆盖HTTP/业务/坏JSON/形状/网络失败保留旧值、超时AbortSignal与finally释放、忙时拒绝第二次加载/保存、只提交partial、保存响应不覆盖其他草稿、显式加载填表。计时器为VM替身，不是实际网络超时。workbench.browser点击实际指令保存按钮、拦截400响应，断言错误可见、草稿保留、不显示成功；不据此认证用户本机或所有设置按钮。

正式审查首批：workbenchRuntime执行saveModelSettings真实模块，覆盖HTTP/业务/网络失败不刷新、保存请求互斥、成功刷新一次以及保存成功但刷新失败的独立提示。没有执行真实供应商模型切换，也不认证其他/api/models调用或refreshStatus的全部HTTP语义。

### 结果消费、流终止与可信候选回归（2026-09-18）

workbenchRuntime在真实bind/bridge/settings/tabs/chat模块上执行确认合同。认证按钮覆盖HTTP拒绝、业务假成功、坏JSON、令牌草稿保留、设备轮询代次/Abort及单飞；画像探测覆盖畸形候选、环境与技术栈共享请求、等待期间草稿变化；新建文件发送createOnly且失败不打开，终端/搜索拒绝失败或坏形状。Bridge清轮、health、diagnostics与Execution Control必须同时满足HTTP/业务/核心形状，写确认后的读失败与写未确认分开。

Skill目录和正文先验证完整候选再发布，失败保留可信列表/正文；真实浏览器对创建400同时要求保留服务端错误、明确“状态未知”且磁盘零创建，不再把旧版纯错误串当唯一文案。文件树坏候选不替换旧树；apply_patch重读只在合法hash/正文后协调，干净标签同步、脏草稿保留。局部**streamResponse(chunks,status=200)**构造NDJSON响应，body的**getReader()**逐块返回Buffer；覆盖非2xx错误正文、合法无换行尾done、坏JSON、提前断流，以及message→error→done仍不得写assistant历史。该reader是VM替身，不模拟真实背压、TCP分片时序或浏览器解码器实现。

workbenchHtml另遍历非隐藏表单控件检查可访问名称，要求欢迎卡/动态源码语义及输入focus-visible、窄屏抽屉规则。workbenchRuntime局部**classSet(initial)**用Set实现add/remove/toggle/contains的最小classList替身，不做CSS布局；再执行宽度从1000跨到640的真实绑定闭包，要求自动收起遮挡抽屉、aria-pressed归false且隐藏焦点恢复到活动按钮。真实workbench.browser检查模态打开聚焦、Escape恢复触发点和390px无水平溢出；本机缺Chromium时只由CI或有浏览器环境执行，不能把静态/VM PASS冒充这三项真实DOM布局已运行。

F27-02的workbenchRuntime负例先复现null被paintClients显示“无需Plus”，修复后执行真实Bridge模块，断言待核对/未验证徽标以及DeepSeek指引无固定商店ID。DOM/HTTP回归不是真实浏览器安装第三方扩展或兼容验收。

F28-01负例先复现配对码被说成仅ChatGPT需要；workbenchRuntime实际Bridge模块验证通用OAuth文案，以及unsupported卡片空prompt不泄落到全局连接文本。这里不连接真实厂商服务。

## 第33组：审批审阅绑定与结果消费

workbenchRuntime加载真实operations模块。opsNode建立textContent/value/disabled与children，append/replaceChildren模拟控件挂载/清除；opsResponse只构造HTTP/JSON响应。finishReviewA/B故意乱序，即使旧fetch忽略abort也不能覆盖新ID；草稿预览清掉批准按钮，持有的旧按钮调用也零POST。finishApproval延迟批准，验证先消费审阅、双击只一POST、期间切换新请求后旧回包不重开旧卡。ID错配不给控件，HTTP200/ok:false返回false；finishSubmission延迟提交，重复点击只生成一次请求，finally释放在途标志。计时器替身触发10秒中断，迟到详情不能复活按钮；不是实网计时精度验收。

approvalReviewBrowser的真实页面夹具主解释见[主机诊断与调用追踪详解](../src/utils/主机诊断与调用追踪详解.md)的第33组测试段；VM不能代替它的实际执行证据。

## 第34组：独立列表与检查点响应

workbenchRuntime沿用opsNode/opsResponse加载真实operations模块。先复现检查点GET抛错使审批GET计数为0，以及返回其它ID的检查点预览仍出现恢复按钮；修复后分别为独立可刷新和零恢复控件。listBodies/checkpointBodies控制JSON完成顺序，旧列表不覆盖新列表；一条null记录拒绝整批，不发布部分按钮，detachedRequest也不能重新读取。checkpointRecord/checkpointPreview提供有绑定的结构夹具；缺previewId、空files、缺diff均拒绝。boundRestore在workspaceRoot变化后零POST；restoreValue覆盖null/错ID/成功但逐文件unknown的矛盾响应，保留“未取得可信完成结果”、消费按钮不重放；合法unknown和succeeded照实保留。这里是VM而非磁盘恢复测试。

真实磁盘写后异常由fileCheckpoints.test.js验证；checkpointResultsBrowser的真实页面拦截测试说明位于[主机诊断与调用追踪详解](../src/utils/主机诊断与调用追踪详解.md)，执行证据按第34组精确CI记录。

## 第35组：创建检查点的在途生命周期

workbenchRuntime在已有真实operations模块上先用finishCreate挂起响应，连续调用实际onclick，旧实现checkpointCreates=2，新实现必须1。checkpointCreateBody证明发送原路径快照，等待中编辑createInput保留新草稿，确认后按钮恢复。reply表覆盖HTTP失败、业务失败、坏JSON、null、非ready、文件数不符和非空result：每次明确点击仅一POST，零自动刷新/重试、无恢复按钮、结果未确认。creationLists注入确认后的列表失败，ID仍在并有独立note。取消confirm、空/重复/过多路径、空绑定是未发送；绑定在await期间变化则不发布旧工作区成功。计时器替身触发10秒后，迟到有效JSON也不能假确认；创建期间选择另一个恢复预览，旧创建回包不能覆盖previewId。finally释放与草稿保留分别断言。这是VM而非实网截止时间证明。

真实HTTP创建/失败零半条记录由apiFiles验证；checkpointCreateBrowser真实页面及真实后端创建场景主说明见[主机诊断与调用追踪详解](../src/utils/主机诊断与调用追踪详解.md)，实际执行按第35组CI记录。

## 第36组：HTTP接入登记与移除结果

workbenchRuntime先复现removed:false被实际onclick当true，以及finishExternal挂起时externalPosts从1变2。修后测试本次URL/Token快照、新Token草稿保留、HTTP/业务/坏JSON/null/connecting/端点错配/非审批工具拒绝，固定提示不包含反射的fixture Token；公网取消确认/非法URL零POST且不清未发送Token。VM计时器模拟40秒后晚回失败，成功登记但列表失败仍保留ID。移除按钮消费后不能复用，经刷新得到同ID新按钮也被externalPending挡住；stopping:true提示尚未确认退出，普通列表刷新不抹提示。允许在登记等待时移除connecting接入，旧登记回包不能覆盖更新的移除结果。计时器与响应均为fixture，不代替真实网络/进程退出证明。

真实HTTP connecting移除与HTTP服务仍活着由externalDiscovery测试；stdioMcp先确认移除请求回包，再等closeAll与PID退出。真实页面externalRegistrationBrowser的主说明见[主机诊断与调用追踪详解](../src/utils/主机诊断与调用追踪详解.md)，是否执行以第36组精确CI为准。

## 第37组：stdio完整预览与启动确认

workbenchRuntime先复现两处红测：只有previewId即启用启动，启动回null仍返回成功。launchPreview构造程序/hash/args/cwd/envKeys/审阅文件的完整元数据；stdioRecord构造已发现进程状态。覆盖requiresConfirmation:false、过期、缺stamp、参数不符、审阅文件数不符均不能启动；确认取消零POST且保留未消费授权，stdioClock推进VM时钟后过期零POST（finally恢复），程序化改草稿/绑定变化也零POST。启动connecting/closed/launch错配/无审批工具都未确认且不能重放；合法启动而列表失败保留ID。

finishStdio挂起预览/启动，证明busy拒第二次预览（不能因首个请求清env而自动发无env的新预览）和第二次启动；编辑后旧回包不覆盖新草稿/警告。env值仅发送后从草稿去除，坏JSON/网络异常用固定提示不回显fixture密钥；VM计时器分别模拟预览10秒、启动40秒后晚回，失败不复活旧授权。真实后端一次性/快照由stdioMcp测试，不把VM模拟当实际进程启动。

stdioLifecycleBrowser的实际页面合同负例主说明见[主机诊断与调用追踪详解](../src/utils/主机诊断与调用追踪详解.md)，实际执行看第37组精确CI；main已有真实进程/远端调用审批仍另作证据。

## 第41组：经典密钥轮换结果消费

workbenchRuntime执行真实bind的reset-secret回调：HTTP500不得toast“已重置”先红测；修后确保有效页面/预读状态下实际发送过一次POST，而非因夹具缺字段提前返回假通过。rotationReply给JSON/HTTP替身，rotationResult读取独立结果区；覆盖null/缺字段/非布尔success/旧secret/错路径、取消、confirm期间绑定变化、实时旧密钥不匹配、POST在途重复onclick一写，以及10秒期限覆盖迟到JSON。finally禁按钮释放；确认POST后刷新失败仍true且保留写成功，不回显异常secret、不自动再POST；正常刷新核对新secret。这里是VM，不是浏览器或真实密钥轮换。

## 第42组：启动去重、停止优先与迟到响应

workbenchRuntime先以挂起POST复现两次startBridge发两POST（实际2、期望1）；不是只比源码。actionReply提供有效核心status与完整启停合同，actionResult读取独立结果区；修后验证缺失/改变主机及实时已运行零启动，预读期间页面变绑零POST，畸形success/running/provider/地址/HTTP错误不确认，固定提示不回显fixture Token。已确认启动/停止后读reject/false/不匹配仍true；正确读取才点灯/灭灯，启动不自动复制。

start/stop各自单飞，启动中停止可达并携绑定，停止中不得再启动；旧启动迟到不能覆盖已停文案或灯。停止发生于GET等待时零启动POST。domain/token与provider同时捕获，等待期间编辑不混入旧请求。缺绑定的停止零POST；模拟计时器过期后迟到JSON不能被消费为成功。actionTimeout/actionClear恢复计时器，VM响应/灯/剪贴板均为替身，不是公网或真实桌面证据。真实bind切换按钮与浏览器执行见bridgeLifecycleBrowser，真实HTTP见bridgeTunnel。
