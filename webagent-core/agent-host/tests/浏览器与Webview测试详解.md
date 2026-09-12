# DOM、Monaco与VS Code Webview运行fixture

这四文件比静态HTML ID检查深入，但都不是浏览器/VS Code E2E。

## monacoLoading.test.js

[源码](monacoLoading.test.js)读真实monaco.js，去单个import和export后vm执行。**$**指状态节点，**captureActiveFile/activateTab**计数；**createElement/appendChild**捕获script；**setTimeout**保存deadline不等真实7秒，**clearTimeout**空实现。

loadMonaco状态先加载中；手动script.onerror→Promise false/纯文本提示；再次加载手动deadline→false；随后注入require（成功回调）、require.config和editor.create，调用迟到onload，必须先捕获缓冲、激活一次并状态就绪；删除require后onload须false而非崩溃。异步IIFE.catch设置exitCode1。没有下载CDN或创建实际Monaco worker。

## workbenchRuntime.test.js

[源码](workbenchRuntime.test.js)父进程以--experimental-vm-modules/--vm-child重启自身，10秒超限，status null算失败。子进程vm.SourceTextModule真实加载state/dom，link回调断言依赖路径并evaluate，防import阶段就异常。

按钮**setAttribute**记录属性；Map存储getItem/setItem，Monaco.setTheme记录themes。验证默认dark、切light同步dataset/storage/Monaco vs/按钮深色标签、重初始化恢复light；非法存储回dark，读写存储抛错不崩；ui.applyTheme必须等于导出函数。

再真实加载bridge，button.classList.remove为空回调，只满足指引页灭灯调用，不检测CSS。Mock setRight/toast，sendChat/fetch均设置为一调用就抛。arenaConnect必须只改提示“尚未建立”，不可偷偷发本机任务/MCP请求。这是负向行为fixture，不只是检查文案。catch exitCode1，内存context随子进程退出释放。

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
