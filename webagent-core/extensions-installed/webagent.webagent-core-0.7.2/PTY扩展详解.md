# VS Code PTY 扩展：审批、真实执行与结果回传

## 职责与调用链

[ptyHost.js](ptyHost.js)从本机API领取任务，使用VS Code终端与node-pty/shell integration执行；[ptyPolicy.js](ptyPolicy.js)决定本地是否自动允许。后端队列不等于真实终端，主机队列说明位于`webagent-core/agent-host/src/tools/命令与PTY详解.md`。

## 1. ptyHost.js顶层函数

| 函数 | 输入/返回 | 实现和失败 |
|---|---|---|
| loadNodePty() | 无→模块或null | 从vscode.env.appRoot下普通/asar node_modules尝试require；失败尝试下个，不自行下载安装 |
| stripAnsi(s) | 文本→显示文本 | 去常见CSI/OSC和回车，不是完整终端模拟器 |
| successfulResponse(response) | requestJson结果→boolean | 只接受整数status且在200–299；JSON里自称成功不能覆盖HTTP拒绝 |
| scrubEnv(base)，导入ptyPolicy | 环境→副本 | 去凭据命名字段，保留一般PATH/Conda变量；不加载Conda profile |
| windowsGuarded(text) | 命令文本→PowerShell脚本 | F71：与主机executor的guardedCommand同一退出合同。先`$global:LASTEXITCODE = $null`，原样放入用户命令，下一行记`$__wa_ok = $?`，再依次：原生程序非零码优先退出该码、`$?`为假退出1、否则退出0。收尾从新行开始，用户命令末尾的注释吞不掉它。修前`-File`正常结束恒为0、`-Command`只报最后一条语句的`$?`，多行命令里失败的npm test会被报成成功 |
| spawnSpec(command) | 文本→shell/args/cleanup | 非Windows选SHELL或bash -lc，命令原样；Windows短ASCII单行用powershell -Command，其他用crypto随机前缀+mkdtemp私有目录，wx/0600写带UTF-8 BOM的ps1再-File；两条分支的正文都经windowsGuarded包裹。cleanup/cleanupDir给调用者，写失败删除目录并抛错 |
| waitForShellIntegration(terminal,ms=2500) | 终端→Promise<integration或null> | 已可executeCommand直接返回；无事件API返回null；否则注册变更回调，只接该终端；finish一次性清timer/dispose订阅/resolve，超时读当前integration |
| startPtyHost(context,deps) | VS Code上下文/依赖→host或null | new PtyHost再start，初始化异常console.warn并null；不保证异步hello已成功 |

spawnSpec的临时脚本不是凭据文件，仍要注意命令正文可能敏感；spawn/终端创建失败、正常退出与dispose均清理临时目录。Windows中文脚本的编码/系统PowerShell行为需真实验证。

## 2. PtyHost构造与生命周期方法

**constructor({agentHostUrl,requestJson})**保存两个依赖，初始审批allowSession=false/allowedFamilies空，sessions/seen容器、polling/disposed标志、序号、随机clientId、pendingHint与流新鲜期。状态只在本扩展实例，不持久化跨重启授权。

| 方法 | 参数/返回 | 语义 |
|---|---|---|
| start(context) | context→undefined | 立即hello，每3秒hello回调，armPoll；context订阅dispose回调；计时器可unref |
| pollDelayMs() | 无→毫秒 | 流新鲜时2秒，待任务时400ms，否则2秒 |
| armPoll() | 无→undefined | disposed返回；清旧timer，超时调用poll.catch吞错.finally再armPoll；避免固定interval重叠轮询 |
| noteStream() | 无→undefined | 流事件后2.5秒新鲜，pendingHint至少1，让即时流和轮询去重配合 |
| dispose() | 无→undefined | 标disposed、清hello/poll计时器，逐session尝试kill及cleanup后clear；未逐个证明操作系统进程退出，也未await在途HTTP |
| url(p) | API路径→字符串 | 每次读agentHostUrl依赖后拼路径 |
| identity() | 无→clientId/workspace | 只取第一个workspaceFolder，不是多根独立会话 |
| hello() | 无→Promise | POST hello带身份；仅HTTP 2xx且pending为非负整数才更新hint，拒绝/畸形响应保留最后可信值；异常吞，允许服务尚未启动 |
| poll() | 无→Promise | disposed/已有轮询/流新鲜时跳过；GET jobs带身份，仅HTTP 2xx且jobs为对象数组才发布pendingHint并逐个await handleIncoming；拒绝/畸形响应保留旧队列提示，finally解除polling，网络失败下一轮再试 |
| postJob(jobId,body) | ID/报告→requestJson Promise | body后合并本机identity，防传入body覆盖身份字段 |

## 3. 审批与目录检查

**confirm(command)**调用shouldAutoAllow；允许直接true，否则最多400字符预览，危险/复合只给运行/拒绝，普通还给会话允许，且**只有**命令有family（首词是裸程序名）时才给同类允许（F71）。showWarningMessage取消视拒绝；会话允许改实例布尔，同类允许仅在该按钮确实展示过时把family加入Set。

**cwdFor(job)**要求当前首工作区与job.workspaceRoot sameWorkspace，resolve cwd并realpath根和目标，relative不能离开根；目标不存在也抛错，不自行建cwd。

**handleRun(job)**先向后端claimed，只有HTTP 2xx且JSON claimed严格为true才弹confirm；拒绝回done/status denied；允许后也只有HTTP 2xx且accepted严格true、实例未disposed才执行。JSON即使声称claimed/accepted，HTTP 409等拒绝仍不能授权。之后cwdFor并spawn。异常尝试回done/error，回报再次失败吞掉。**审批后再向后端确认有效性**，避免90秒过期后迟到点击仍运行。

## 4. 两种执行后端

**spawn(job,cwd)**有node-pty就spawnNodePty（注册回调后即返回），没有则await spawnFallback；不是等价的返回时机，真正完成都靠postJob。

### spawnNodePty(nodePty,job,cwd)

spawnSpec，创建写/关VS Code EventEmitter，序号命名终端，nodePty.spawn传120×30尺寸、cwd和scrubEnv。onData回调经sliceTextTail保留尾200Ki字符（不切断代理对）、发终端显示、40ms合并进pending再由flushProgress串行post progress（失败吞）。PTY对象的open为空回调，close尝试kill，handleInput尝试write；createTerminal并show，sessions按execId保存proc/terminal/emitter以及buf()闭包。

timeout回调设timedOut并kill；onExit通过cleanup清timer/临时目录，发关闭事件、删session，等待在途progress并释放emitter，再报告真实exitCode、完整尾部输出、outputCaptured=true。超时不因code0变成功。stdout是PTY合并输出，不承诺独立stderr；事件发送/网络回报失败不会恢复已结束进程。

### runShellIntegration(si,job,terminal)

缺onDidEndTerminalShellExecution就拒绝且不执行。ended Promise注册退出事件，只接受同一个execution；timer超时dispose终端并resolve undefined。try内executeCommand，异步reading要求execution.read并for-await累计输出/await progress回报。

reading.then标readFinished，catch记录readError并dispose，防等待exit时出现未处理拒绝。await ended后最多再等250ms读取收尾；只有未超时、读完且无读取错误、exitCode0才成功。报告outputCaptured反映读取真实状态；finally清timer/dispose listener/删session。非零/无退出码/读取未完成均不假报成功。

### spawnFallback(job,cwd)

创建普通VS Code terminal和只有kill(dispose)的session，waitForShellIntegration 2.5秒；没有可观察执行接口就抛错，不使用sendText猜结果。再次post check确认后端仍running/实例未停，再runShellIntegration；失败dispose/删session后重新抛给handleRun。

## 5. 输入、取消与去重

**handleInput(job)**先要求accepted响应同时HTTP 2xx且accepted严格true，再查execId活session且proc.write可用；没有则done/error。正常write(input)后done/ok true，这只是输入已提交，不代表被运行应用处理；fallback只有kill无write，所以不能伪装支持stdin。handleCancel与fallback执行前的check也使用相同HTTP+JSON合同，不能把拒绝状态里的真值字段当许可。

**handleIncoming(job)**先校验jobId及工作区。cancelRequested先处理：kill匹配session、回cancelled，不受seen去重阻止。普通job已seen跳过，新增seen最多400（删最早）；input/cancel分别委托。run使用handleRun.catch而不await，让轮询在审批/执行期间继续收到取消。

**handleCancel(job)**accepted成功后尝试kill对应session，即使session不在也回done/ok；所有异常吞掉。该确认不等于实际进程树退出审计；后端终态与终端关闭需要结合实际事件。

## 6. ptyPolicy.js全部函数

READISH仅自动许可有限元数据/目录/简单echo，不自动许可cat/type/Get-Content或Git正文/历史读取，COMPOUND检查连接/扩展字符，基本危险分类复用dangerousPolicy，与agent-host一致；EXTRA_DANGER是扩展更保守的附加审批条件。

- **isReadishCommand(command)**trim后白名单匹配，不证明命令读取绝无敏感信息。
- **looksDangerousCommand(command)**共享词法检测加附加正则，非完整shell解析。
- **commandFamily(command)**去前导`&`调用符后取完整首词（可带一对双/单引号），只有首词是裸程序名（字母数字下划线开头，仅含字母数字`_.+-`）时返回其小写，否则空串。F71前取首个`[A-Za-z0-9_.+-]+`片段：`"C:\…\node.exe"`得到`c`、`./a.sh`得到`.`，一次同类允许即自动放行所有C:\程序或所有./脚本（实测含`C:\Windows\System32\format.com D:`）。现在路径形式的程序没有family，只能逐条或经“本会话都允许”批准。
- **shouldAutoAllow(command,state={})**先CONTENT_READ正文读取、复合/危险→allow:false、alwaysAsk:true；然后只读→允许；再allowSession、allowedFamilies；其余需要询问但可提供持久到本会话的选项。危险/复合不会因会话允许就跳过询问。

扩展审批不绕过后端Code模式或远程拒绝策略。自动放行不是撤销操作系统权限，用户仍要在独立测试工作区验收。

## 7. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=pty
npm test --prefix webagent-core/agent-host -- --filter=webviewRuntime
```

检查队列与VS Code API fixture相关路径；真实node-pty版本、shell integration、焦点、取消和Conda解释器继续按人工G/E节。不要把Mock事件顺序当所有VS Code版本都支持的证明。

### 2026-09-14 凭据与审批加固

ptyPolicy的**sliceTextTail(text,limit)**（F70，外部复审§5.4-7）保留文本最后limit个UTF-16单元，但若起点落在代理对的低半部分就后移一位丢掉孤立的低代理项；普通`.slice(-limit)`在emoji或CJK扩展B字符中间截断时会留下不是合法Unicode的孤立代理项。它被主机executor的输出尾窗/捕获上限、ptyJobs的任务输出以及本扩展ptyHost的两处200Ki缓冲共用。

ptyPolicy的**scrubEnv(base)**是经典executor和PTY共用的纯函数：复制输入对象，遍历键名删除token、access key、storage key、secret等模式，原对象不改。不按值识别未知命名的凭据。spawnFallback创建终端用strictEnv:true，防VS Code合并父环境把已删除字段重新继承回来。

CONTENT_READ识别常见cat/type/Get-Content及git diff/log/show，先于allowSession/allowedFamilies要求每次确认；连普通文件也询问，因为词法路径检查不能保证无符号链接或已跟踪密钥。EXTRA_DANGER补dd/shred/truncate/mkfs、下载执行入口与npm publish等；两套危险命令词表仍非统一解析器，编码/别名不是完整覆盖。其他命令的会话或命令族授权仍是宽授权，用户仅应向可信任务授予；这不是逐文件权限沙箱。

### 输出背压与临时脚本清理

spawnNodePty局部cleanup清除progressTimer/killer并移除spec.cleanupDir，ended阻止继续排队；写文件exclusive失败也清理私有目录。flushProgress最多一条HTTP在途（flight），pending最多200Ki字符；请求结束后有待发内容才再定40ms计时器。onExit先cleanup/关闭终端信号，再await flight，然后发送完整尾部快照，避免progress越过done。正常终态释放两个EventEmitter；spawn或终端创建抛错时释放资源并上抛。

这是有界合并，不保证每个输出字节都被HTTP逐条传输；最终快照与终端缓冲仍有200Ki字符上限。进程异常强杀扩展仍可能留下临时文件，不能承诺finally在断电时执行；Windows目录权限继承用户Temp ACL，0600不是完整Windows ACL证明。

ptyPolicy的looksDangerousCommand先调用共享dangerousPolicy.isDangerousCommand，再叠加EXTRA_DANGER，原独立DANGEROUS正则已删除。共享检测器逐函数说明主机策略说明位于`webagent-core/agent-host/src/tools/工具入口与命令策略详解.md`。
