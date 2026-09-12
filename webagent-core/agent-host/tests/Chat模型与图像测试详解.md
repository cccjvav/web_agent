# Chat、模型生命周期与图像链测试

## runChat.test.js

[源码](runChat.test.js)mkdtemp覆盖config.workspaceRoot。**collect()**返回events和**emit(type,data={})**收集事件；**main()**写真实小项目README、src/app.js、package test与断言脚本，防内置Agent硬编码演示计算器。

| 流程 | 断言目的 |
|---|---|
| Ask分析 | tool集合包含list/find/read，不含未实现diagnostics或apply_patch；消息指实际README/Widget/app.js，无calculator，find标签有数量 |
| Plan第一轮 | 无consensus，branches1，状态/消息标分支1及simulated，含set_todos，不引用演示文件 |
| 空输入branch | 两分支且canMerge，仍未自动合并 |
| 新回合一支merge | error含至少两个，不伪造总结 |
| 两支merge | simulated=true、consensusReached=false、agreementRate=null、参与者2，不伪造投票比例 |
| Code跑测试 | 真run_command事件存在且ok，消息含npm test或ok，实际运行临时项目测试 |
| emit放payload | 和第二参数回调方式均能收到工具和消息 |
| Code显式写notes.md | 文件实际存在且内容匹配 |

filter/map/find/some都是从事件数组找上述证据，不代表全部事件顺序经过断言。末尾rm不在finally，main.catch打印/exit1；故失败可能留tmp，但独立子进程不污染产品工作区。

## modelLifecycle.test.js

[源码](modelLifecycle.test.js)保留workspace/fetch，临时store保存外部模型。**reply(message)**返回带异步text()的兼容响应，不联网。

第一fetch直接抛不可用；runChat Code面对创建文件请求必须有“已停止”错误、没有tool且文件不存在，防模型失败自动builtin重放。第二fetch：首轮返回9个list_directory工具调用（Array.from生成独立id），次轮解析请求messages筛tool，必须有9个响应，第9个ok=false；最终runOpenAI答done，证明超额度也补齐协议结果，而非丢失tool_call_id。

后两组用Promise保存**finish**延迟响应：旧Plan开始后新start替换回合，旧回答不得插新回合；新回合两支启动merge后再加第三支，迟到merge不得标已合并。finally恢复workspace/fetch、reset回合、rm临时目录；catch exitCode1。不是实时服务端网络race测试，而是可控延迟的确定性状态竞争fixture。

## chatVision.test.js

[源码](chatVision.test.js)假1px PNG、两个临时目录，不依赖显示器。前半静态/函数断言：findShotCandidates识别反斜杠-Out、引号空格路径、mark JSON out，无关命令不误报；resolveShotPath允许工作区相对/绝对，拒外部与非图片。symlink逃逸断言放在宽catch内，**可能连断言失败也被catch吞掉**，不能把这段视为所有平台坚实覆盖；另有沙箱/预算测试补充。

collectShot须返回PNG data URL、bytes/rel；MAX_BYTES断言等于6MiB，**未实际构造超限文件验证tooBig分支**。modelSeesImages检查vision布尔/caps/capabilities三来源，以及无声明/null反例。loadSkill computer-use须给绝对目录、脚本目录与snap提示/Bridge回图说明；未知Skill found=false。

**withProvider(responses,run)**真实http server监听随机loopback，data收正文，end解析并存bodies、按序返回预设响应（末项重复），listen回调调用run(baseUrl,bodies)，then/catch都关闭server再完成。**toolCallResp(cmd)**构造run_command调用，**finalResp(text)**构造最终答复。cmd只echo -Out预置PNG，不真实截屏。

**main()**中vision模型两轮：首轮无图，第二轮有image_url/data URL与路径说明；返回文本正确，事件status提截图，整个events不得含图片base64。文本模型同样两轮，所有请求不得有image_url，但有“未标记可看图”提示且UI诚实说明。最后静态检查m-vision控件、bind写vision、settings显示pill，以及MCP server复用computerUse、含image内容且不broadcast图片。

末尾删除两tmp，main.catch退出1；无finally包所有前置同步assert，错误可留下文件。测试中“我看到截图”只是假provider固定回答，绝不是视觉理解质量或真实远程截图授权的证据。

## 验证

`npm test --prefix webagent-core/agent-host -- --filter=runChat`，另分别filter=modelLifecycle、chatVision。涉及命令仅操作临时工作区，真实模型账户/图像理解、Windows桌面与手机MCP仍需单列实测。
