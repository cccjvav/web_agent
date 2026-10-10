# PTY状态机与隧道生命周期fixture

这五份测试区分“已提交/已批准/已捕获退出码”，不把入队或公网上的假URL当执行/联网成功。

## ptyJobs.test.js

[源码](ptyJobs.test.js)开头resetForTests；公开tools30、隐藏列表31，send_command_input仅隐藏列表有。异步**main**在runWithPty上下文中enqueue，**emit(type,data)**收events；短定时等待后取pty_request断言jobId、kind/run、command、queued与pending。

手工report accepted→progress→done/exit0/outputCaptured:true，await原Promise必须ok/pty/有hi且pending空。第二个任务手报denied返回ok:false；noteClient后clientLive。远程callTool send_command_input必须ProtocolError E_FORBIDDEN，本地无PTY返回失败提示，直接handleRpc也拒。

后半静态检查extension/ptyHost/routes包含客户端标识、事件名、node-pty/shellIntegration/输入/确认/注册路径等；不能证明这些代码真正执行。真实调用ptyPolicy：git status只读自动允许、rm危险即使allowSession仍alwaysAsk、npm family允许。同类命令授权不等于任意组合命令许可。成功reset；catch直接exit1。没有启动真实VS Code终端。

## executorEnv.test.js（F104）

验证复审 P2-4（执行环境净化与注入透明化）与 P2-5（动态探测 POSIX shell）：

- **testDetectPosixShell**：第129组起先查commandShellContract：win32文本须含Windows PowerShell 5.1、powershell.exe -NoProfile、不是CMD/bash/pwsh 7、没有&&和||、$env:NAME、不要再套一层、优先于Shell偏好；Linux有bash时写/bin/bash -c并提到桌面PTY用$SHELL -lc；只有/bin/sh且SHELL是fish时写/bin/sh -c和plain POSIX sh，不把fish当-c的shell。然后以注入的存在性判断覆盖：有 bash 时优先 bash（即使 `SHELL` 指向别处）；无 bash 时接受绝对路径且名为 dash 等 POSIX 名的 `SHELL`；fish/zsh/nu/csh 与相对路径 `SHELL` 一律忽略、降级 `/bin/sh` 或 `/usr/bin/sh`；类 Alpine 仅有 `/bin/sh`；另在真实系统上核对未设置 `SHELL` 时的结果；
- **testPrepareCommandEnv**：核对常规变量保留、敏感凭据（GITHUB_TOKEN、AZURE_STORAGE_KEY、MY_API_KEY）从 `env` 中剥离并记录在 `stripped`、默认注入 `CI=true`、`TERM=xterm-256color`、`FORCE_COLOR=1`（Windows 补 `PYTHONIOENCODING=utf-8`）并记录在 `injected`；用户显式传入 `CI: 'false'` 等值时尊重用户设定、不重复注入；
- **testExecuteCommandEnvSummary**：执行真实命令时，返回记录包含 `envSummary` 对象，内部包含 `stripped` 与 `injected` 数组；
- 入口 **main** 串行运行全部异步/同步断言。

## ptyLifecycle.test.js

[源码](ptyLifecycle.test.js)临时workspace中异步IIFE：policy拒git branch -D、分号串联、管道自动许可；noteClient拒错误workspace，接受两client。A claim任务后B不能accepted；finish timeout后A迟到accepted/progress只回already，原Promise失败。循环四种不可靠结果（exit2、未捕获、cancelled、缺退出码）都ok:false；500000字符progress最后stdout≤200KiB。

AbortController取消enqueue返回cancelled；预取消runWithSignal中的write_file拒且never.txt不存在。暂换Module._load仅stub vscode，导入真实PtyHost后立即finally恢复loader。构造器的**agentHostUrl**给假地址，**requestJson**直接回接jobs.noteClient/report，没有HTTP。替换host.confirm为待决Promise，**approve**保存resolver；host.spawn只计数。服务器先timeout再批准，handleRun不能spawn；错误workspace的handleIncoming也不能启动。

响应消费负例给poll依次返回合法jobs、HTTP409和jobs:null：只有首项进入handleIncoming，后两项不得把pendingHint清零。rejectedClaimHost让claim的409正文仍写claimed/accepted:true，断言不弹确认、不spawn；另一条先200 claimed、用户允许，再以409 accepted:true拒绝，断言只确认一次且仍不spawn。这里requestJson响应是内存替身，不证明真实VS Code网络栈，但精确覆盖HTTP状态不能被JSON真值绕过。

再把postJob替换为reports收集器；**onDidEndTerminalShellExecution**存ended并返回**dispose()**空清理接口；execution的异步生成器**read()**先yield output，再queueMicrotask上报exit3；**executeCommand**仅返回此execution。runShellIntegration必须报告error/3。createTerminal fixture的**show/dispose**为空，**sendText**一调用即抛：spawnFallback必须“未执行命令”拒绝，不能退回不可观测执行。host.dispose结束实例。

最后真executeCommand启动Node30秒有限定时器，分别50/100/200/400ms以及确认stdout后abort，要求cancelled/ok:false及10秒内管道关闭（不能等自然退出冒充取消）；global.fetch替身监听signal，用不变的30ms fetchText期限验证E_TIMEOUT、fetch/abort各恰好一次及底层signal.aborted=true。F64将原只匹配aborted文案的断言升级为错误码和真实中止的共同约束，不删除取消断言；keep定时器维持事件循环，finally清timer/恢复fetch。外层finally reset jobs/删tmp。这里有真实子进程取消，但没有真实node-pty或Windows窗口批准测试。


## extensionHostSafety.test.js：扩展与主机的信任边界（F71）

[源码](extensionHostSafety.test.js)把真实extension.js放进vm（**loadExtension(getUrl)**注入可变的设置读取），用Module._load替换vscode后加载真实ptyHost（**loadPty(fakeVscode)**，每次清require缓存）。

1. **agentHostUrlContract**：127.0.0.1/localhost（大小写）/[::1]/https与尾斜杠都规范为origin；外部主机名、127.0.0.2、0.0.0.0、`127.0.0.1.evil.test`、IPv4映射IPv6、带用户信息/路径/查询/片段、file/ftp与非URL全部抛含`webagent.agentHostUrl`的错误；空设置得默认值，环境变量回退同样受限。随后用返回被拒地址的PtyHost调用hello与poll，requestJson调用次数必须为0（工作区路径不外发）。
2. **ipv6Loopback**：在::1起HTTP服务，requestJson请求`http://[::1]:端口`得到200，且服务端收到的Host正是`[::1]:端口`（主机本机判断接受的形式）；环境没有IPv6回环时打印跳过原因。
3. **familyContract**：裸程序名（npm、npm.cmd、node、`& git`、带引号的node、Get-ChildItem）得到小写family；C:\路径、./与.\脚本、bin/lint、../、绝对路径、~/、未闭合引号与空白都没有family。批准三条路径形式命令后，format.com、下载目录exe、./other.sh、bin/../../x都不得自动放行；npm家族仍可用。
4. **confirmButtons**：对./build.sh弹窗不含“同类都允许”，即使桩返回该按钮也不加入family且不运行；npm test含该按钮并记入npm。末尾调用**confirmPreviewContract**（F99）：`echo <420个a> && rm -rf ~`的弹窗写明“命令共N字符”“只显示前400字符”并点名“破坏性命令规则”，弹窗正文不含被切掉的`rm -rf ~`，完整命令经构造参数log进入输出面板；短命令无这些附注也不记日志；`cat .env`总是询问但不称破坏性；shouldAutoAllow的reason为dangerous（`echo a && rm -rf build`破坏性优先于复合）/content-read/compound/readish。
5. **windowsExitContract**：九条命令覆盖-Command与-File（换行、非ASCII、超长且末行是注释）两条分支，期望退出码为原生码优先（3/4/6/2）、cmdlet失败1、失败后继续成功的语句0（与executor同一合同）、`exit 5`为5、正常0。Windows上用真实powershell.exe经spawnSync执行spawnSpec产物并比对退出码；其他平台断言POSIX参数不变，并临时把process.platform设为win32结构性核对：命令原样保留、重置语句在前、紧随一行记`$?`、三段退出合同。node-pty自身的Windows参数拼接不在此测试范围内。

基线红测：修复前五组各自单独运行都失败（LOCALHOST未规范化、`[::1]` ENOTFOUND、C:\程序得到family、路径命令仍出现同类按钮并被批准、缺少退出合同）。
## tunnel.test.js

[源码](tunnel.test.js)的**sliceHits(src)**数日志裁剪固定代码：Cloudflare两处、ngrok一处，不准buf += text无界增长，是静态回归锁。真实parse函数验证Quick URL、ngrok键值/JSON/Forwarding三格式、无URL null；canonicalNamedUrl去路径/默认443/小写，空值和localhost拒。

保存并移除NGROK_AUTHTOKEN，Promise.all并行四种启动参数负例：空Named hostname/token、空ngrok token、坏hostname；成功回调主动throw防误通过，失败回调核对E_NAMED_HOSTNAME/E_NAMED_TOKEN/E_NGROK_TOKEN/E_NGROK_HOSTNAME。then/catch都恢复原token（原来无值则保持无值）。不启动实际隧道。

## tunnelLifecycle.test.js

[源码](tunnelLifecycle.test.js)的**fake()**返回EventEmitter子进程及stdout/stderr，kill只记signals，不真终止；**tick**用setImmediate让异步启动推进。stopProcess测试顽固进程SIGTERM后需SIGKILL才发exit，killed标志不能充当退出证明；kill抛错的进程最终应did not exit拒绝。keep定时器避免unref超时让进程提前退出。

tmp假cloudflared文件，CLOUDFLARED_PATH指它。第129组起，首次Quick Tunnel前把HOME/USERPROFILE指到临时目录，断言argv恰为`tunnel --config <临时home>/.webagent/cloudflared-quick-tunnel.yml --no-autoupdate --protocol auto --url …`，配置内容只有no-autoupdate、POSIX下权限0600、不留.tmp；预先放好的符号链接被替换、目标文件不变；home是普通文件时返回原因而不抛出；quickTunnelArgs在needShell下给带空格的路径加引号，含`&`、`%`、`^`、`!`时不传`--config`；ngrok循环之后另起两次ngrok：stderr出现含Token和ERR_NGROK_334的一行，拒绝的错误code为ERR_NGROK_334、retryable:false、message恰为NGROK_FAILURES里的文字且不含Token，假进程已收到停止信号；表外的ERR_NGROK_8012在exit时给官方说明链接而不是安装提示；纯函数另查“endpoint … is already online”文字形式识别为334、小写err_ngrok_108能识别、正常的started tunnel返回null；最后把HOME/USERPROFILE临时指向一个普通文件再启动Quick Tunnel：argv不含`--config`、末尾仍是`--no-autoupdate --protocol auto --url …`，tunnel_log里有提到Quick Tunnel和`~/.cloudflared/config.yml`的提示；除这一段外整个文件期间HOME/USERPROFILE都指向临时目录，finally才恢复，所以任何一次Quick Tunnel都不会写进真实用户目录；cp.spawn返回fake并记录（F100起同时记录cmd/args/options：Named与ngrok的Token都不得出现在args里，必须分别在options.env的TUNNEL_TOKEN/NGROK_AUTHTOKEN，Named的args固定为`tunnel --no-autoupdate run`），spawnSync返回查找失败。第一启动用stdout发first URL完成；第二启动必须等旧exit才spawn新进程，旧stale URL不得发布；新second ready后旧exit不能清新URL。新进程exit1清URL和bridgeRunning；第三启动未ready就stop，启动Promise应cancelled。finally恢复spawn/spawnSync/env并删tmp。模拟事件顺序不是实际SIGKILL或公网探测。

## bridgeTunnel.test.js

[源码](bridgeTunnel.test.js)的**request(server,method,urlPath,body)**真实本机HTTP：JSON字节长度header、data拼接、end解析（坏JSON→null）、error拒绝。异步**main**保存四个tunnel函数，再替换Quick成功、stop清URL；Named/ngrok先包原函数计数供参数负例。Express随机端口只装JSON/API router。

| HTTP序列 | 断言 |
|---|---|
| store直接patch已登录已授权；Quick start/status/stop | success、URL、note、无error、running；stop被调用且URL空 |
| start未知/错类型/未知provider/跨provider Token/4097字节Token | 统一400/E_BAD_BRIDGE_REQUEST，响应不含私密标记，配置字节和全部停启计数不变 |
| reset-round/login/device/poll/clear/logout未知包装及Token未知/超长/换行 | 触网、身份写入、停止前400；GitHub函数替身计数保持0，finally恢复 |
| 历史Bridge展示/授权槽位注入对象/数组秘密，当前provider保存Token超预算 | status固定为字符串/布尔且不含标记；truthy对象及非法保存凭据不能通过start，停启计数不变 |
| Quick抛E_NO_CLOUDFLARED | HTTP200但success/running false，显示本机MCP与错误，不挂旧公网址 |
| Named缺参 | 不调用Quick、有Named参数错误、不回Quick地址 |
| stub Named成功并传假domain/token | opts准确、返回域名与ready；start/status JSON均不泄token |
| ngrok缺参/成功 | 不调用Quick/Named；成功opts/域名正确，两响应隐藏token |
| Quick启动Promise待决，logout先完成再finishStart | 旧start回409，bridgeRunning仍false |
| 未登录未授权start | 403 |

**readyStart**通知已进入延迟stub、**finishStart**控制返回时刻；计数回调证明无隐式provider回退。finally恢复函数、清URL/running、关闭server并rm。登录是patch fixture不是OAuth，所有成功隧道都是stub；本机HTTP成功不等于Arena手机连通。

## 验证

分别filter ptyJobs/ptyLifecycle/tunnel/tunnelLifecycle/bridgeTunnel或全量npm test。实际桌面PTY捕获、隧道二进制安装及手机MCP连接仍需人工验收。

2026-09-14负例补充：ptyLifecycle增加三种授权状态下正文/危险命令不可自动许可；secrets环境fixture核对scrubEnv不改原对象并保留PATH/CONDA_PREFIX。oldEnqueue/finishLate替身制造取消后迟到成功，getCommandOutput必须cancelled且ok:false，finally恢复enqueue；createTerminal断言strictEnv。

取消回归现在覆盖50/100/200/400ms四个启动时刻，并通过command_output中的固定fixture标记确认Node后代已开始后再取消。每次仍要求10秒内关闭捕获管道、cancelled且ok:false；30秒有限工作负载只防无限遗留，不可靠自然退出通过。WEBAGENT_DEBUG_PROCESS在测试子进程开启，输出taskkill及exit/close时序诊断。

新增局部onOutput(event)监听command_output，仅命中固定标记时设置readySeen，并在ready用例触发AbortController；finally移除监听，其他命令输出不改变控制流。

背压fixture：EventEmitter/constructor/fire/dispose与fakePty.spawn/onData/onExit/kill/write为替身；streamHost的postJob首个progress由releaseProgress阻塞，2000个输出块仍只有一请求在途，onExit等待释放再done且尾部≤200Ki。Windows读取scriptPath检查BOM，正常退出、spawn异常、无onExit的dispose均删除私有目录。

另一个Windows用例让真实Node后代仅终止自己的PowerShell父进程（不调用taskkill /T）；根退出后必须10秒内关闭后代持有的管道，且必须先见到真实启动标记。这直接验证Job Object保障，不仅验证taskkill正常树枚举。

## 隧道Token增量遮盖回归

tunnel.test执行createTokenRedactor，遍历ASCII、重复前缀与中文Token的每个UTF-8字节切分位置，再逐字节喂入；完整Token遮盖，普通错配前缀仍输出。tunnelLifecycle以实际Named/ngrok启动回调及模拟ChildProcess事件交错stdout/stderr，检查分流游标、潜在秘密前缀不提前发布、正常ready、停止后旧数据拒绝、事件历史不含完整测试Token。未调用外部程序或真实账号，不代表Windows进程树/公网验收。

collect(event)是tunnelLifecycle临时订阅回调，仅收集已脱敏的event.chunk供断言，finally移除监听；测试还恢复NGROK_PATH，避免污染后续环境。tunnel.test额外穷举长度0–8的二元文本、四种重叠Token，以整体split/join为对照验证逐字符输出；这是有界性质检查，不是任意输入形式化证明。

## 第41组：密钥轮换的真实HTTP与持久化边界

bridgeTunnel的main新增真实POST reset-secret：部分绑定/错主机/错expectedSecret均409，原key和配对码保留。暂替store.patch使保存抛错，HTTP500且内存key/OAuth配对不变，finally恢复。两个相同完整绑定和旧key并发请求恰200/409，成功回包key/path与内存/磁盘一致、旧key失效、配对撤销。

再暂替eventBus.broadcast，仅secret_rotated时模拟写后失败：HTTP500但磁盘/内存已轮换；同一旧expectedSecret再发409且不二次轮换，finally恢复broadcast。验证未知响应可能已有副作用，不是回滚。最后无新字段的旧空体调用仍200并轮换，保证现有扩展协议兼容；不是原生UI成功提示的验收。原隧道函数依旧替身，不声称本测试连接了公网。

## 第42组：停止绑定及在途启动

bridgeTunnel通过真实HTTP检验stop部分/错主机/错目录绑定409，stopCalls、运行标记及配置不变；挂起start时错误stop不递增generation，原start仍成功。另一次挂起start被已有租约拒重复start409，但合法绑定stop不等待启动完成；放行旧start得409且运行false/URL空。stopTunnel注入抛错500仍运行，广播注入抛错500但停止已生效，finally恢复替身。旧空体stop仍兼容。这里启动/停止进程函数是替身，证明路由次序/状态/响应而非真实OS退出，真实进程旧回归仍独立保留。

## 第50组：Bridge严格包装与历史投影

bridgeTunnel先以真实HTTP重现start接受未知字段、对象provider、跨提供商Token和超预算Token后仍写配置/停启；另重现stop、reset-secret及无参身份路由把未知包装当合法操作。修后这些请求统一在副作用前400/E_BAD_BRIDGE_REQUEST，固定错误不含fixture私密标记；配置JSON、停启计数及GitHub触网替身计数保持不变。Named/ngrok只接受各自domain/Token，Token与绑定字段有字节预算，完全空体的旧stop/reset-secret仍单独保留兼容。

同一夹具向历史Bridge已知槽位注入带authorization标记的对象/数组：GET status只能返回固定字符串/布尔投影且不含标记，这些退役账户键（F106）在读取时被丢弃、status不再有bridgeAccount；登录/身份6条旧路由应404；再把当前Named provider保存Token置为超预算字符串，要求空start在配置改写或停启前400，证明旧配置不能绕过生效字段预算。随后恢复原Bridge快照再跑全部既有Quick/Named/ngrok、代次、CAS与写前/后失败断言，避免负例污染成功链。这里证明路由次序、响应投影和零调用替身，不证明真实GitHub、隧道厂商或磁盘被同进程外篡改时的完整恢复。

第117组：ptyLifecycle用EventEmitter仿node-pty的socket错误处理（非EAGAIN/EIO且error监听不足2个就重新抛出），对spawnNodePty的会话连发两次ENXIO：不得抛出、只kill一次；随后onExit(0)的最终回报须为status:'error'、ok:false、outputCaptured:false，原因在message字段（不得出现error字段）。用修复前的ptyHost运行该段会因“read ENXIO”未捕获而失败。
