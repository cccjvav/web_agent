# PTY状态机与隧道生命周期fixture

这五份测试区分“已提交/已批准/已捕获退出码”，不把入队或公网上的假URL当执行/联网成功。

## ptyJobs.test.js

[源码](ptyJobs.test.js)开头resetForTests；公开tools30、隐藏列表31，send_command_input仅隐藏列表有。异步**main**在runWithPty上下文中enqueue，**emit(type,data)**收events；短定时等待后取pty_request断言jobId、kind/run、command、queued与pending。

手工report accepted→progress→done/exit0/outputCaptured:true，await原Promise必须ok/pty/有hi且pending空。第二个任务手报denied返回ok:false；noteClient后clientLive。远程callTool send_command_input必须ProtocolError E_FORBIDDEN，本地无PTY返回失败提示，直接handleRpc也拒。

后半静态检查extension/ptyHost/routes包含客户端标识、事件名、node-pty/shellIntegration/输入/确认/注册路径等；不能证明这些代码真正执行。真实调用ptyPolicy：git status只读自动允许、rm危险即使allowSession仍alwaysAsk、npm family允许。同类命令授权不等于任意组合命令许可。成功reset；catch直接exit1。没有启动真实VS Code终端。

## ptyLifecycle.test.js

[源码](ptyLifecycle.test.js)临时workspace中异步IIFE：policy拒git branch -D、分号串联、管道自动许可；noteClient拒错误workspace，接受两client。A claim任务后B不能accepted；finish timeout后A迟到accepted/progress只回already，原Promise失败。循环四种不可靠结果（exit2、未捕获、cancelled、缺退出码）都ok:false；500000字符progress最后stdout≤200KiB。

AbortController取消enqueue返回cancelled；预取消runWithSignal中的write_file拒且never.txt不存在。暂换Module._load仅stub vscode，导入真实PtyHost后立即finally恢复loader。构造器的**agentHostUrl**给假地址，**requestJson**直接回接jobs.noteClient/report，没有HTTP。替换host.confirm为待决Promise，**approve**保存resolver；host.spawn只计数。服务器先timeout再批准，handleRun不能spawn；错误workspace的handleIncoming也不能启动。

再把postJob替换为reports收集器；**onDidEndTerminalShellExecution**存ended并返回**dispose()**空清理接口；execution的异步生成器**read()**先yield output，再queueMicrotask上报exit3；**executeCommand**仅返回此execution。runShellIntegration必须报告error/3。createTerminal fixture的**show/dispose**为空，**sendText**一调用即抛：spawnFallback必须“未执行命令”拒绝，不能退回不可观测执行。host.dispose结束实例。

最后真executeCommand启动Node无限定时器，100ms abort后cancelled/ok:false；global.fetch替身只监听signal abort并reject，用30ms fetchText deadline证明请求超时传播，keep定时器维持事件循环，finally清timer/恢复fetch。外层finally reset jobs/删tmp。这里有真实子进程取消，但没有真实node-pty或Windows窗口批准测试。

## tunnel.test.js

[源码](tunnel.test.js)的**sliceHits(src)**数日志裁剪固定代码：Cloudflare两处、ngrok一处，不准buf += text无界增长，是静态回归锁。真实parse函数验证Quick URL、ngrok键值/JSON/Forwarding三格式、无URL null；canonicalNamedUrl去路径/默认443/小写，空值和localhost拒。

保存并移除NGROK_AUTHTOKEN，Promise.all并行四种启动参数负例：空Named hostname/token、空ngrok token、坏hostname；成功回调主动throw防误通过，失败回调核对E_NAMED_HOSTNAME/E_NAMED_TOKEN/E_NGROK_TOKEN/E_NGROK_HOSTNAME。then/catch都恢复原token（原来无值则保持无值）。不启动实际隧道。

## tunnelLifecycle.test.js

[源码](tunnelLifecycle.test.js)的**fake()**返回EventEmitter子进程及stdout/stderr，kill只记signals，不真终止；**tick**用setImmediate让异步启动推进。stopProcess测试顽固进程SIGTERM后需SIGKILL才发exit，killed标志不能充当退出证明；kill抛错的进程最终应did not exit拒绝。keep定时器避免unref超时让进程提前退出。

tmp假cloudflared文件，CLOUDFLARED_PATH指它；cp.spawn返回fake并记录，spawnSync返回查找失败。第一启动用stdout发first URL完成；第二启动必须等旧exit才spawn新进程，旧stale URL不得发布；新second ready后旧exit不能清新URL。新进程exit1清URL和bridgeRunning；第三启动未ready就stop，启动Promise应cancelled。finally恢复spawn/spawnSync/env并删tmp。模拟事件顺序不是实际SIGKILL或公网探测。

## bridgeTunnel.test.js

[源码](bridgeTunnel.test.js)的**request(server,method,urlPath,body)**真实本机HTTP：JSON字节长度header、data拼接、end解析（坏JSON→null）、error拒绝。异步**main**保存四个tunnel函数，再替换Quick成功、stop清URL；Named/ngrok先包原函数计数供参数负例。Express随机端口只装JSON/API router。

| HTTP序列 | 断言 |
|---|---|
| store直接patch已登录已授权；Quick start/status/stop | success、URL、note、无error、running；stop被调用且URL空 |
| Quick抛E_NO_CLOUDFLARED | HTTP200但success/running false，显示本机MCP与错误，不挂旧公网址 |
| Named缺参 | 不调用Quick、有Named参数错误、不回Quick地址 |
| stub Named成功并传假domain/token | opts准确、返回域名与ready；start/status JSON均不泄token |
| ngrok缺参/成功 | 不调用Quick/Named；成功opts/域名正确，两响应隐藏token |
| Quick启动Promise待决，logout先完成再finishStart | 旧start回409，bridgeRunning仍false |
| 未登录未授权start | 403 |

**readyStart**通知已进入延迟stub、**finishStart**控制返回时刻；计数回调证明无隐式provider回退。finally恢复函数、清URL/running、关闭server并rm。登录是patch fixture不是OAuth，所有成功隧道都是stub；本机HTTP成功不等于Arena手机连通。

## 验证

分别filter ptyJobs/ptyLifecycle/tunnel/tunnelLifecycle/bridgeTunnel或全量npm test。实际桌面PTY捕获、隧道二进制安装及手机MCP连接仍需人工验收。
