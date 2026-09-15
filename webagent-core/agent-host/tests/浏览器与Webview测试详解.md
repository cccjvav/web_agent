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
