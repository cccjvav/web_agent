# 工作台启动、事件流与Chat逐函数讲解

覆盖[app.js](../app.js)与[chat.js](chat.js)。UI是本机消费者，不是外部Arena会话；Chat POST流与后台WebSocket是两条不同通道。

## 1. app.js全部函数与初始化

ES imports首先填ui，后执行boot。WS_BACKOFF_MIN/MAX为1/30秒，wsBackoffMs/timer/socket在模块实例保存。

- **setWsStatus(text)**找底栏节点；文本非空则显示，否则清空hidden；缺节点静默返回。
- **scheduleWsReconnect()**已有timer不再安排，显示重连；当前delay用于这次，下一次翻倍最高30秒；timeout回调清timer并connectWs，没有随机抖动。
- **connectWs()**依据当前location.protocol选ws/wss，使用location.host的`/ws`，不是硬写localhost。清timer，已有CONNECTING/OPEN则返回；try new WebSocket。
- socket **onopen**重置退避并隐藏状态；**onmessage**JSON解析失败忽略，command_output送terminal；file_patched刷新树；todos_updated重画任务；tool_call_end整理payload给logBridgeTool。不会执行服务器发来的JS。**onclose**只对同socket清引用，然后安排重连；构造异常也安排。无独立onerror处理，依赖close推进恢复。
- **boot()**先try initEditorSafety+bind，错误console.error但继续；setAgentMode(code)、paintTabs/paintChat/terminal提示；Promise.all并发status/tree/skills/custom/Monaco，完成后connectWs并activateTab。其中某个未自捕获Promise拒绝会阻止后续WS初始化，最外boot().catch仅记录，不假装整个页面准备完毕。

没有本模块级页面卸载socket/timer清理；浏览器关闭页面通常销毁上下文，但不要解释成显式可靠离线协议。

## 2. chat.js全部显示函数

| 函数 | 参数/返回 | 实现与副作用 |
|---|---|---|
| emptyChat() | 无→静态HTML | 欢迎文字与四个设置链接，不发请求 |
| paintChat() | 无→undefined | 内部paint(box)缺节点返回；空messages插empty并forEach绑定设置链接；非空清容器、forEach renderMsg，滚底；同时画两个Chat区域 |
| summarizeTool(result) | 结果→原值或浅副本 | 只裁顶层content800/stdout1000字符；不是全JSON体积预算/脱敏器 |
| renderMsg(m) | 消息→DOM节点 | 按user/status/tool/consensus/assistant分支，细节下述 |
| pushMsg(m) | 消息→undefined | push共享messages，filter已有两个stream，移空提示，分别renderMsg追加；没有消息数组上限 |
| paintPlanComposer() | 无→undefined | mode/planRound控制分支n/max badge、canMerge按钮和输入placeholder，不改后端Plan状态 |
| paintTodos(todos) | todos→undefined | filter统计completed，chat/bridge两个prefix中map任务HTML，escape状态/标题；不像扩展Webview版有对象过滤/500上限，依赖服务端有效数组 |
| agentLabel(mode) | 模式→标签 | ask/code明确，其余按Plan显示，不是权限验证 |
| setAgentMode(mode) | 模式→undefined | 改state.mode、两select、Agent标签再paintPlanComposer；真正工具模式锁在服务端 |

**renderMsg**：user/status textContent。tool由ok/error判断类，header与JSON摘要先escape；header.onclick切pre展示。consensus参与者map标签，内部**show(i)**切按钮并用renderMd显示合并稿/分支，行动计划title escape；tabs.onclick取dataset.i；adopt.onclick切code并调用sendChat固定执行提示——这是**用户点击才发生的新任务**，不是服务器自动重放。assistant renderMd，branch存在追加模型/序号/模拟标签。

## 3. sendChat(text,opts={})

1. 已sending时此调用是停止：abort现chatAbort并返回，不排队新任务。
2. 正文优先显式text，否则右Chat或Agent输入；未显式text才清两个输入。读取当前活跃Agent面板模式或主select。
3. 空正文：merge可继续；Plan满足显式branch或canBranch转branch；无任务Plan提示，其余返回。分支显示占位用户消息，但不把空消息塞历史。
4. sending=true/新AbortController，按钮切停止；stayOnBridge来自opts，不要求转Chat时保留Bridge。取旧历史尾12，本轮非空用户才push历史；merge仅status。
5. 从选择框/status取modelId、thinkLevel，POST `/api/chat`，请求含mode/message/history/modelId/thinkLevel/planAction，不把所有UI事件都发送。
6. reader/TextDecoder逐块按换行解析NDJSON，半行留buf，坏JSON忽略；handleEvent并累计message正文。循环done后仅把累计助手正文入history。
7. catch显示请求失败（包括AbortError）；finally清sending/controller/恢复按钮，触发refreshStatus/loadTree，未await它们。

**具体限制**：未检查res.ok；res.body空会进入catch；末尾buf无换行不会额外解析，decoder也无最终flush，不可声称任意NDJSON尾部都完整处理。失败前已执行的工具不会因abort自动回滚；前端没有自动选别的模型重放任务。

## 4. handleEvent(ev)全部分支

pty_request/done直接忽略，浏览器并不是VS Code PTY宿主；status→状态消息；tool→完整展示记录，stayOnBridge时另记Bridge日志，set_todos重画，run/execute命令输出写terminal；apply_patch对已开tab发GET内容，then修改tab.content、活跃时applyEditor，并有diff则openDiff。

补丁后的刷新并非完整编辑冲突协调：未检查GET状态/hash，没有同步savedContent/hash；既有Monaco model不会因applyEditor自动setValue；也未先保护dirty正文。这里如实描述风险，不把“打开diff”当成编辑器已安全同步磁盘。

consensus显示汇总，planRound更新state并paint，message带branch，error显示文本。没有全局事件去重；同工具可能同时从Chat和WS进入统计/终端，所以UI计数不应当作唯一准确账本。

## 5. 验证

```bat
npm test --prefix webagent-core/agent-host -- --filter=workbenchRuntime
npm test --prefix webagent-core/agent-host -- --filter=chat
npm test --prefix webagent-core/agent-host -- --filter=editorRuntime
```

测试中成功模拟事件不能替代网络断流、手机会话或模型真实响应。这里暴露的HTTP/尾行/编辑同步限制未通过文档工作悄悄改变实现。
