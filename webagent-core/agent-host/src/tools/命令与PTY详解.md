# 命令执行与 PTY 队列：逐函数和状态机

## 职责与双路径

[executor.js](executor.js)保存命令记录并运行经典子进程或委托PTY；[ptyJobs.js](ptyJobs.js)是本机扩展的任务队列，不直接启动终端。实际终端在extension/ptyHost.js。入口链：callTool危险检查 → executor → 经典spawn，或enqueue → 扩展报告 → finish。

## 1. executor.js辅助函数

| 函数 | 参数/返回 | 过程/边界 |
|---|---|---|
| commandOwner(options={}) | 调用上下文→所有者键 | 本机缺省local；远程须有服务端认证后的callerKey（初始化peer或兼容凭据回退），否则E_SESSION_REQUIRED；键不进入公开结果 |
| lastCommandId(owner) | 所有者键→ID/空串 | 只在最多40条commandStore中反向找该调用者最新记录，不共享全局最近命令 |
| countRunning() | 无→数量 | 遍历commandStore中status=running；取消标终态可早于进程真正退出 |
| pruneCommands() | 无→undefined | 记录≥40时按Map顺序删非running至<40；不主动kill、不提供无限历史 |
| killChild(child,force=false) | 子进程→undefined | Windows同步taskkill PID树（3秒期限，失败记录退出状态/错误；WEBAGENT_DEBUG_PROCESS=1额外记录成功结果）；其他先杀进程组再回退child.kill，TERM/KILL按force。吞发送错误，不等待退出证明 |
| workingDirFrom(cwd) | 目录→安全绝对路径 | resolveSafePath，任何异常统一改成outside workspace提示，原失败原因可能被泛化 |
| scrubEnv(base)，导入extension/ptyPolicy | 环境对象→副本 | 删除名称匹配凭据模式的字段；不是值扫描；保留PATH/一般Conda变量，不自动conda activate |
| publicRecord(rec,tail) | 内部记录→展示对象 | stdout/stderr取尾部，tail默认8000钳500–200Ki字符，附状态/退出码/建议等待；截断不保留完整日志 |
| storePtyResult(result,owner) | PTY结果/所有者→记录 | 写入带内部owner的commandStore，标execution=pty；不启动/查询系统进程 |

## 2. startProcess({command,cwd='.',timeoutSec=30},owner)

running≥8拒绝，prune，生成execId与带内部owner的运行记录；验证cwd，算至少1秒timeout，广播started。Windows用powershell.exe NoProfile/NonInteractive，其他/bin/bash -c；非Windows detached便于进程组停止。env经scrub，加CI/TERM/FORCE_COLOR。

保存child后接入当前请求signal。内部 **abort()**先标cancelled/ok=false，killChild，再2秒force回调；deadline回调设isTimeout、发送停止并2秒升级。计时器支持unref。

**append(field,chunk)**追加保留尾200Ki字符、广播原chunk；stdout/stderr data回调转换字符串。**done Promise**的error回调移除signal、清timer、仅在未成功启动或已有退出状态时删children、更新错误/耗时、广播并reject；close回调同样清理，保存code/signal/耗时，仅仍running时改为done/error/timeout，算ok并resolve publicRecord。取消状态不被普通close覆盖。

返回 `{rec,done}`，其中rec是可变记录。spawn成功不是业务成功；事件回调异常不都被隔离。killChild在Windows有3秒spawnSync超时，且“cancelled记录”不等于等待真实退出。

## 3. executor的公开执行函数

**executeCommand(opts,options={})**：checkCancelled并绑定commandOwner；wantsPty时prune、await enqueue(run)、storePtyResult、publicRecord；否则把owner交给startProcess并返回done。普通run等待结束，PTY等待扩展报告，绝不是写终端后立即猜成功。

**startCommand(opts,options={})**：绑定所有者后立即返回execId/status=running/建议等待。经典路径startProcess，done.catch补error与stderr。PTY路径检查8运行上限，先存带owner的running记录和started事件，再enqueue(run)。onChunk闭包累计/广播；then合并结果、退出码、输出与finished事件，catch将仍running标error。

PTY迟到结果不覆盖已经cancelled的status，ok也要求当前状态仍非cancelled且result.ok严格为true。记录在enqueue前已创建，排队失败也需查记录错误。

**getCommandOutput({execId,commandId,tail}={},options={})**：只在commandOwner名下查显式execId/commandId；缺省时用lastCommandId找该调用者最新记录。不存在或属于另一peer均返回found:false，不泄露记录是否属于他人；local桌面仍共享local命名空间。

**cancelCommand({execId}={},options={})**：先要求记录属于commandOwner，未知/跨peer统一found:false；非running cancelled:false。PTY上下文再标cancelled、cancelExec并await enqueue(cancel)，错误吞，必要时kill已有child；经典直接标cancelled/kill并返回。选择依赖当前PTY上下文，不只看原rec.execution，调用路径要一致。

**sendCommandInput({execId,input}={})**：PTY队列input；经典返回ok:false及说明，不向经典进程stdin猜写。远程调用在工具入口另拒绝。

**wait({ms=800}={})**：Number或800，限0–15000，Promise timer回调返回waitedMs；0因假值会回800，且这里不接入AbortSignal。

## 4. ptyJobs.js上下文、客户端与清理

| 函数 | 参数/返回 | 实现 |
|---|---|---|
| runWithPty(ctx,fn) | 上下文/回调→fn返回值 | AsyncLocalStorage.run(ctx或{},fn)，不启动终端 |
| ptyContext() | 无→ctx或null | 读取当前异步链 |
| wantsPty() | 无→boolean | ctx.pty且非remote |
| canonical(value) | 路径→比较键 | resolve，尽力realpath，Windows小写；失败不是路径存在证明 |
| noteClient(info) | client信息→boolean | 有info时校验8–80字符ID、workspace canonical匹配；新ID超128删最早Map项；更新clients与全局clientSeenAt。无info仍更新全局时间 |
| hasClient() | 无→boolean | 最近seen不足8秒；不是某指定客户端可用证明 |
| prune() | 无→undefined | done且无cancelRequested超过15分钟删除，clients超8秒删；jobs≥256只删已确认done到阈值下，未确认取消与活任务一起由enqueue限32 |
| publicJob(job) | 内部任务→展示对象 | ID/类型/命令/目录/输入/时限/状态/取消请求，不给resolve与计时器 |
| listPending(clientId) | ID→列表 | prune后filter未done（或该客户端取消待确认），只给无owner/同owner；map publicJob |
| snapshot() | 无→摘要 | clientLive、pending、retained；调用listPending会清理状态 |

## 5. enqueue、报告和结束状态

**armTimer(job,ms)**清旧timer，至少1秒；到期若未done，将有owner任务标cancelRequested，finish(timeout)。计时器只更新队列状态，真正停止终端仍靠扩展观察。

**enqueue(kind,payload={})**：先checkCancelled/prune；command≤128000、input≤64000字符，未done及cancelRequested合计少于32。随机jobId，Promise执行器建queued记录、timeoutSec限1–600、owner=null并存Map。内部 **abort()**标取消请求并finish(cancelled)，**cleanup()**移除signal监听；注册后再次检查已aborted。当前ctx.emit发pty_request；run等90秒审批，其他任务15秒。Promise正常resolve为最终业务结果；超限返回拒绝。emit抛错可能让Promise拒绝但已有记录需后续清理，不能说所有失败自动撤销入队。

**finish(jobId,result={})**：找不到/已done返回false；标done/finishedAt、清timer/cleanup，合并尾200Ki输出。只有status=done、ok非false、outputCaptured非false，并且run.exitCode===0（非run要求ok===true）才成功；不满足将done转换error。resolve一次，然后清resolve/onChunk/cleanup引用。耗时含审批等待。

**report(jobId,body={},clientId)**：找不到null；有clientId时检查注册及owner，不符返回错误。已done仅允许owner的done/cancelled回报清cancelRequested，绝不重新执行。

- check只回running判断。
- claimed仅queued→claimed并记录owner，不重设审批deadline。
- accepted允许queued/claimed→running、可赋owner，设执行时限+15秒余量。
- progress仅running，追加stdout/stderr并调用onChunk，返回ok。
- done/denied/error/timeout/cancelled调用finish，status可取body.status；其他返回unknown state。

API入口先noteClient，因此正常网络调用带完整所有权检查；直接内部调用若省clientId并不执行同样验证。不能把辅助函数当独立认证边界。

**cancelExec(execId)**遍历未done的run任务，标cancelRequested并finish取消；不立刻从Map删，不直接kill终端。**resetForTests()**先finish全部取消再清jobs/clients/seen，不用于用户持久化恢复。

## 6. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=pty
npm test --prefix webagent-core/agent-host -- --filter=workspaceTools
```

对照审批迟到、所有权、输出/退出码和取消断言；真实VS Code node-pty/shellIntegration及Conda解释器要按人工G/E项。测试通过不等于任意系统命令的后代进程都被可靠回收。

取消时立即设rec.ok=false；PTY迟到成功只合并结果数据，不得覆盖cancelled/ok:false。经典命令和扩展共用ptyPolicy.scrubEnv，剔除token/access key/storage key等凭据名称，保留PATH/Conda；不是值扫描或OS沙箱。

R4诊断：WEBAGENT_DEBUG_PROCESS=1仅用于排错。startProcess的trace(event,code)按固定schema输出process lifecycle JSON：kind/事件、父/子PID、单调elapsedMs、spawned/exited、stdout/stderr字节数和整数退出码；记录created/spawn/首次输出/取消/超时/error/exit/close，不记录命令、cwd或输出正文。首输出各只记一次，不随输出流逐块刷屏。trace自身失败被捕获，不改变执行/清理。默认关闭，不进入工具公开结果或业务事件；既有taskkill诊断仍独立。不能据spawn事件推断PowerShell Add-Type/Attach已经完成，也不是关闭管道绕过退出验收。

## Windows进程树保障：commandJob.cs

[commandJob.cs](commandJob.cs)用Windows Job Object补足taskkill枚举时序不能提供的生命周期保障。startProcess在任何用户命令之前用Add-Type加载，再调用WebAgentCommandJob.Attach；加载或加入job失败直接exit 1，不无保护地继续。

- WebAgentCommandJob的static job保留唯一非继承句柄直到PowerShell退出。Attach幂等，CreateJobObjectW用空安全属性创建非继承句柄；SetInformationJobObject的class=9设置ExtendedLimits，LimitFlags=0x2000（KILL_ON_JOB_CLOSE）；AssignProcessToJobObject把当前PowerShell纳入。失败先保存Win32错误、CloseHandle，再抛Win32Exception；成功不手工关闭，操作系统在进程退出时关闭。
- GetCurrentProcess返回当前进程伪句柄。BasicLimits包含时间/flags/工作集/进程数/affinity/优先级字段，IoCounters包含六个64位IO计数，ExtendedLimits顺序组合两者与四个指针宽度内存字段；StructLayout.Sequential与UIntPtr保持32/64位ABI布局。未使用的限制字段为零，不额外限制内存/CPU。
- 后代默认继承job成员关系而不继承job句柄，因此父PowerShell被终止、正常退出或崩溃时，最后句柄关闭会终止后代。这覆盖枚举后才出现的后代；不依赖记住旧PID再杀、不靠提前销毁stdout制造完成。
- 这是一次性命令的生命周期策略，不是安全沙箱。Windows非PTY命令不能通过Start-Process把后台任务留在shell之外；长运行服务用保持前台的start_command。现有桌面PTY路径不受此改动影响。Add-Type增加每次启动开销；受限语言模式/不允许嵌套job的运行环境会明确失败，不能静默降级。
- 验证：Windows矩阵运行真实取消用例，包含确认Node已启动后取消；仅Linux通过不能证明P/Invoke/Job Object可用。

Windows taskkill失败/超时/抛错时会用持有的ChildProcess句柄终止根进程；用户命令开始前已加入Job Object，因此不需要靠失效PID重新枚举后代。该回退与commandJob必须共同理解，不适用于任意未纳入job的外部进程。

## 模式切换的activeCount验证

executor.activeCount取countRunning与children.size较大值，cancelled记录不能遮住未close子进程。PTY.activeCount统计未done或cancelRequested；prune不得因TTL/容量淘汰未确认取消项，32项入队预算包含它们。确认依赖PTY所有者报告，失联不能自动当作停止。executionControl同时检查这些后台状态和stdio未closed，而不只看工具Promise已返回。真实Node后台命令和PTY确认夹具见executionControl.test；不是任意脱离OS进程隔离证明。

子进程error不必然表示退出（如停止失败）；已有pid且未退出时保留children直至close。cancelCommand在仍持有child时允许再次明确停止，即使记录已非running；不自动重放命令。
