# 工作台启动、事件流与Chat逐函数讲解

覆盖[app.js](../app.js)与[chat.js](chat.js)。UI是本机消费者，不是外部Arena会话；Chat POST流与后台WebSocket是两条不同通道。

## 1. app.js全部函数与初始化

ES imports首先填ui，后执行boot。WS_BACKOFF_MIN/MAX为1/30秒，wsBackoffMs/timer/socket在模块实例保存。

- **setWsStatus(text)**找底栏节点；文本非空则显示，否则清空hidden；缺节点静默返回。
- **scheduleWsReconnect()**已有timer不再安排，显示重连；当前delay用于这次，下一次翻倍最高30秒；timeout回调清timer并connectWs，没有随机抖动。
- **connectWs()**依据当前location.protocol选ws/wss，使用location.host的`/ws`，不是硬写localhost。清timer，已有CONNECTING/OPEN则返回；try new WebSocket。
- socket **onopen**重置退避并隐藏状态；**onmessage**JSON解析失败忽略，command_output送terminal；file_patched刷新树；todos_updated按source分流：本地重画Chat，远程拉取Bridge快照；只有source=Bridge-Remote的tool_call_end触发logBridgeTool拉取主机快照；bridge_round_reset也触发同步。不会执行服务器发来的JS。**onclose**只对同socket清引用，然后安排重连；构造异常也安排。无独立onerror处理，依赖close推进恢复。
- **boot()**先try initEditorSafety+bind，错误console.error但继续；setAgentMode(code)、paintTabs/paintChat/terminal提示；先connectWs，再立即refreshBridgeActivity并每3秒定时调用（单飞、5秒超时）；即使WS不可用也能从本机受保护API补回统计。随后Promise.allSettled并发status/tree/skills/custom/Monaco；每个load经Promise.then捕获同步异常。部分失败console记录并toast，仍activateTab；事件流不被初次HTTP/CDN失败阻断。

没有本模块级页面卸载socket/timer清理；浏览器关闭页面通常销毁上下文，但不要解释成显式可靠离线协议。

## 2. chat.js全部显示函数

| 函数 | 参数/返回 | 实现与副作用 |
|---|---|---|
| emptyChat() | 无→静态HTML | 欢迎文字与四个原生button链接样式入口，可用键盘聚焦/触发，不发请求 |
| paintChat() | 无→undefined | 内部paint(box)缺节点返回；空messages插empty并forEach绑定设置链接；非空清容器、forEach renderMsg，滚底；同时画两个Chat区域 |
| summarizeTool(result) | 结果→原值或浅副本 | 只裁顶层content800/stdout1000字符；不是全JSON体积预算/脱敏器 |
| renderMsg(m) | 消息→DOM节点 | 按user/status/tool/consensus/assistant分支，细节下述 |
| pushMsg(m) | 消息→undefined | push共享messages，filter已有两个stream，移空提示，分别renderMsg追加；没有消息数组上限 |
| paintPlanComposer() | 无→undefined | mode/planRound控制分支n/max badge、canMerge按钮和输入placeholder，不改后端Plan状态 |
| paintTodos(todos) | todos→undefined | 只绘chat-tasks、最多50项，统计completed并转义状态/标题；Bridge由paintBridgeTasks独立按远程分组绘制，不能混入本地计划 |
| agentLabel(mode) | 模式→标签 | ask/code明确，其余按Plan显示，不是权限验证 |
| setAgentMode(mode) | 模式→undefined | 改state.mode、两select、Agent标签再paintPlanComposer；真正工具模式锁在服务端 |

**renderMsg**：user/status textContent。tool由ok/error判断类，原生`.tool-card-toggle`按钮与JSON摘要先escape；点击切pre展示并同步aria-expanded，键盘可直接触发。consensus参与者map标签，内部**show(i)**切按钮并用renderMd显示合并稿/分支，行动计划title escape；tabs.onclick取dataset.i；adopt.onclick切code并调用sendChat固定执行提示——这是**用户点击才发生的新任务**，不是服务器自动重放。assistant renderMd，branch存在追加模型/序号/模拟标签。

## 3. sendChat(text,opts={})

1. 已sending时此调用是停止：abort现chatAbort并返回，不排队新任务。
2. 正文优先显式text，否则右Chat或Agent输入；未显式text才清两个输入。读取当前活跃Agent面板模式或主select。
3. 空正文：merge可继续；Plan满足显式branch或canBranch转branch；无任务Plan提示，其余返回。分支显示占位用户消息，但不把空消息塞历史。
4. sending=true/新AbortController，按钮切停止；stayOnBridge来自opts，不要求转Chat时保留Bridge。取旧历史尾12，本轮非空用户才push历史；merge仅status。
5. 从选择框/status取modelId、thinkLevel，POST `/api/chat`，请求含mode/message/history/modelId/thinkLevel/planAction，不把所有UI事件都发送。捕获本轮controller，拒绝重定向；5分钟总deadline中断请求。内部**checkStopped()**在headers/read完成及事件消费前后检查本轮signal，不让已停止请求因缓冲中仍有done而假成功。
6. 要求HTTP 2xx、可读body及`application/x-ndjson`媒体类型；非2xx逐块限制64KiB错误正文，再优先取JSON error并限制展示长度，不调用无界text。成功流按原始UTF-8字节限制单行1MiB、总量16MiB；同一网络块包含多条短行仍允许。TextDecoder用fatal模式，允许合法Unicode跨块，不将坏UTF-8静默替换。内部**consumeLine(line)**要求非空行是带非空字符串type的对象，message.text必须是字符串；坏JSON/形状立即失败。结束flush并消费无换行尾事件。
7. 必须出现唯一done并到达正常EOF，且无error、无done后的非空事件、未取消，才返回true并写助手历史。空白尾行可忽略；error即使后面还有done也不能发布助手历史。断流明确结果未确认；catch区分5分钟超时、用户停止和普通失败。finally清deadline，未确认则abort并尝试reader.cancel，取消Promise即使不结束也不阻塞收尾；释放reader锁、清sending/controller/恢复按钮。refreshStatus/loadTree的同步抛错或Promise拒绝单独提示，不重放对话。

**具体限制**：事件流形状检查只约束对象/type及message正文类型，不穷举未来事件的全部字段；显示过的部分工具副作用/消息不能事务回滚。失败前已执行的工具不会因abort自动回滚；前端没有自动选别的模型重放任务。

## 4. handleEvent(ev)全部分支

pty_request/done直接忽略，浏览器并不是VS Code PTY宿主；status→状态消息；tool→完整展示记录，stayOnBridge时另记Bridge日志，set_todos重画，run/execute命令输出写terminal。只有apply_patch事件ok严格为true且带filePath才处理：有已开标签时重读同一路径，要求HTTP成功、路径若返回则一致，再交给tabs.reconcilePatchedFile；有diff仍openDiff。

补丁协调按候选验证后发布：干净标签同步content/savedContent/hash及Monaco/textarea；脏草稿与新磁盘正文不同则原样保留草稿和旧hash，提示后续保存会由版本检查拒绝，要求人工核对；重读失败保留可信标签并提示。它不是三方自动合并、补丁事务回滚或跨客户端编辑锁。

consensus显示汇总，planRound更新state并paint，message带branch，error显示文本。没有全局事件去重；同工具可能同时从Chat和WS进入统计/终端，所以UI计数不应当作唯一准确账本。

## 5. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=workbenchRuntime
npm test --prefix webagent-core/agent-host -- --filter=chat
npm test --prefix webagent-core/agent-host -- --filter=editorRuntime
```

测试覆盖HTTP拒绝、坏JSON/UTF-8/媒体类型、对象message正文、done后同块或后续块数据、重复done、字节预算、多字节跨块、合并短行、无换行尾事件、取消及模拟deadline；失败必须abort/cancel/release且不写助手历史。真实Chromium另用Response/ReadableStream验证坏流和永不settle的cancel仍能收尾；它不是服务端真实任务继续运行或被停止的证明。补丁重读/草稿协调回归保留；手机会话、编辑器多窗口与真实模型响应仍需另验。


## 受控执行增量

app.js新增operations.js副作用导入，向ui登记审批页面方法，不自动接入或执行外部工具。

帮助页新增builtin-guide与adoption-guide静态新手步骤和根目录文档定位。既有顶部帮助和欢迎引导打开同一页面；没有把文档文件名伪装成能跨工作区打开的链接。


## 远程Tasks与本地Chat分开

paintTodos现在只更新chat-tasks，最多50项；不能把Chat计划顺手画到Bridge。**paintBridgeTasks(groups,unavailable)**绘制最多16组远程计划、每组50项，按会话摘要显示上报时间、todo状态和报告进度；所有动态文字escapeHtml。没有报告时仍显示set_todos/report_progress说明，完成计数只统计Agent声明completed，并注明非自动核验。unavailable可标最近快照同步失败。

bridge.paintBridgeActivity在日志revision快速返回前也绘制任务，保证TTL清理或重复版本的任务状态可刷新；活动请求失败标任务状态未知，保留最近画面。app.onmessage不再让远程todos覆盖本地Chat。验证见taskProgress、workbenchRuntime与真实浏览器测试。
