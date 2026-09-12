# 命令执行与 PTY 队列：逐函数和状态机

## 职责与双路径

[executor.js](executor.js)保存命令记录并运行经典子进程或委托PTY；[ptyJobs.js](ptyJobs.js)是本机扩展的任务队列，不直接启动终端。实际终端在extension/ptyHost.js。入口链：callTool危险检查 → executor → 经典spawn，或enqueue → 扩展报告 → finish。

## 1. executor.js辅助函数

| 函数 | 参数/返回 | 过程/边界 |
|---|---|---|
| countRunning() | 无→数量 | 遍历commandStore中status=running；取消标终态可早于进程真正退出 |
| pruneCommands() | 无→undefined | 记录≥40时按Map顺序删非running至<40；不主动kill、不提供无限历史 |
| killChild(child,force=false) | 子进程→undefined | Windows同步taskkill PID树；其他先杀进程组再回退child.kill，TERM/KILL按force。吞发送错误，不等待退出证明 |
| workingDirFrom(cwd) | 目录→安全绝对路径 | resolveSafePath，任何异常统一改成outside workspace提示，原失败原因可能被泛化 |
| scrubEnv(base) | 环境对象→副本 | 删除名称匹配凭据模式的字段；不是值扫描；保留PATH/一般Conda变量，不自动conda activate |
| publicRecord(rec,tail) | 内部记录→展示对象 | stdout/stderr取尾部，tail默认8000钳500–200Ki字符，附状态/退出码/建议等待；截断不保留完整日志 |
| storePtyResult(result) | PTY结果→记录 | 更新lastExecId、commandStore，标execution=pty；不启动/查询系统进程 |

## 2. startProcess({command,cwd='.',timeoutSec=30})

running≥8拒绝，prune，生成execId与运行记录；验证cwd，算至少1秒timeout，广播started。Windows用powershell.exe NoProfile/NonInteractive，其他/bin/bash -c；非Windows detached便于进程组停止。env经scrub，加CI/TERM/FORCE_COLOR。

保存child后接入当前请求signal。内部 **abort()**先标cancelled/ok=false，killChild，再2秒force回调；deadline回调设isTimeout、发送停止并2秒升级。计时器支持unref。

**append(field,chunk)**追加保留尾200Ki字符、广播原chunk；stdout/stderr data回调转换字符串。**done Promise**的error回调移除signal、清timer、删children、更新错误/耗时、广播并reject；close回调同样清理，保存code/signal/耗时，仅仍running时改为done/error/timeout，算ok并resolve publicRecord。取消状态不被普通close覆盖。

返回 `{rec,done}`，其中rec是可变记录。spawn成功不是业务成功；事件回调异常不都被隔离。killChild在Windows没有显式spawnSync超时，且“cancelled记录”不等于等待真实退出。

## 3. executor的公开执行函数

**executeCommand(opts)**：checkCancelled；wantsPty时prune、await enqueue(run)、storePtyResult、publicRecord；否则startProcess并返回done。普通run等待结束，PTY等待扩展报告，绝不是写终端后立即猜成功。

**startCommand(opts)**：立即返回execId/status=running/建议等待。经典路径startProcess，done.catch补error与stderr。PTY路径检查8运行上限，先存running记录和started事件，再enqueue(run)。onChunk闭包累计/广播；then合并结果、退出码、输出与finished事件，catch将仍running标error。

现状：PTY then先计算尊重cancelled的ok，后面又赋result.ok，不能把它描述成所有迟到结果字段均严格不变；status保留与ok赋值是不同代码。记录在enqueue前已创建，排队失败也需查记录错误。

**getCommandOutput({execId,commandId,tail}={})**：优先execId/commandId，缺省lastExecId；不存在返回found:false，不抛错。未指定ID可能看到其他调用最近的命令，全局不是每用户隔离。

**cancelCommand({execId}={})**：无记录found:false、非running cancelled:false。PTY上下文先标cancelled、cancelExec，再await enqueue(cancel)，错误吞，必要时kill已有child；经典直接标cancelled/kill并返回。选择依赖当前PTY上下文，不只看原rec.execution，调用路径要一致。

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
| prune() | 无→undefined | done超过15分钟删除，clients超8秒删；jobs≥256优先删done到阈值下，活任务另由enqueue限32 |
| publicJob(job) | 内部任务→展示对象 | ID/类型/命令/目录/输入/时限/状态/取消请求，不给resolve与计时器 |
| listPending(clientId) | ID→列表 | prune后filter未done（或该客户端取消待确认），只给无owner/同owner；map publicJob |
| snapshot() | 无→摘要 | clientLive、pending、retained；调用listPending会清理状态 |

## 5. enqueue、报告和结束状态

**armTimer(job,ms)**清旧timer，至少1秒；到期若未done，将有owner任务标cancelRequested，finish(timeout)。计时器只更新队列状态，真正停止终端仍靠扩展观察。

**enqueue(kind,payload={})**：先checkCancelled/prune；command≤128000、input≤64000字符，未done少于32。随机jobId，Promise执行器建queued记录、timeoutSec限1–600、owner=null并存Map。内部 **abort()**标取消请求并finish(cancelled)，**cleanup()**移除signal监听；注册后再次检查已aborted。当前ctx.emit发pty_request；run等90秒审批，其他任务15秒。Promise正常resolve为最终业务结果；超限返回拒绝。emit抛错可能让Promise拒绝但已有记录需后续清理，不能说所有失败自动撤销入队。

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
