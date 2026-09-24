# Chat、模型生命周期与图像链测试

## runChat.test.js

[源码](runChat.test.js)mkdtemp覆盖config.workspaceRoot。**collect()**返回events和**emit(type,data={})**收集事件；**main()**写真实小项目README、src/app.js、package test与断言脚本，防内置Agent硬编码演示计算器。

| 流程 | 断言目的 |
|---|---|
| Ask分析 | tool集合包含list/find/read，不含未实现diagnostics或apply_patch；消息指实际README/Widget/app.js，无calculator，find标签有数量 |
| Plan第一轮 | 无consensus，branches1，状态/消息标分支1及simulated，含set_todos，不引用演示文件 |
| 空输入branch | 两分支且canMerge，仍未自动合并 |
| 新回合一支merge | error含至少两个，不伪造总结 |
| 两支merge | simulated=true、consensusReached=false、agreementRate=null、参与者2，不伪造投票比例；F70：canonical必须包含每个分支答案、总结消息含“### 分支 1/2”（此前分支原文拼好后被丢弃，VS Code里只显示一句模板话；基线红） |
| Code跑测试 | 真run_command事件存在且ok，消息含npm test或ok，实际运行临时项目测试 |
| emit放payload | 和第二参数回调方式均能收到工具和消息 |
| Code显式写notes.md | 文件实际存在且内容匹配 |

filter/map/find/some都是从事件数组找上述证据，不代表全部事件顺序经过断言。末尾rm不在finally，main.catch打印/exit1；故失败可能留tmp，但独立子进程不污染产品工作区。

## modelLifecycle.test.js

[源码](modelLifecycle.test.js)保留workspace/fetch，临时store保存外部模型。**reply(message)**返回带异步text()的兼容响应，不联网。首个缺mode调用核对默认只读工具，同时直接断言模型fetch的`redirect==='error'`，防以后无意恢复默认跟随。

F70先用九个modelId核对真实请求体的采样字段：gpt-5/o3/o4-mini/`openai/gpt-5-mini`发送同档`reasoning_effort`（缺省high）且不发temperature，`gpt-5-chat-latest`两者都不发，gpt-4o/deepseek-chat/qwen-max及以o开头但不是o系列的`omni-model`保持0.1/0.4/0.7温度映射；基线在gpt-5这一例红（推理模型收到temperature会被提供方400拒绝）。复审补充十二例带/不带工具的组合：gpt-5.4、`openai/gpt-5.5`、gpt-5.6-sol、gpt-6-luna带工具时必须发`reasoning_effort:'none'`且首条status含“思考强度本次不生效”；同一gpt-6-luna/gpt-5.4不带工具时保留所选档位；gpt-5.2、gpt-5、gpt-5-mini、o4-mini带工具仍发所选档位；gpt-5.4-chat-latest两者都不发；gpt-4o/gpt-4.1带工具仍是温度。同时断言tools确实随allowTools出现。基线在gpt-5.4带工具这一例红（发了high，真实端点会400），gpt-6系列在基线还被当成普通模型发temperature。

随后用标准WHATWG Response造401正文`REMOTE_SECRET_SHOULD_NOT_BE_REFLECTED`：异常必须保留HTTP 401但不得含该标记；再造1MiB+1字节200正文，必须以`E_RESPONSE_TOO_LARGE`失败而不是读完后落到JSON语法错。这证明模拟fetch下的错误反射与模型响应预算合同，不是实际供应商、代理或网络内存剖析。

第52组先断言导出的`MODEL_REQUEST_MAX_BYTES`恰为12MiB，再以同量extraSystem构成必然超限的完整JSON，要求`E_MODEL_REQUEST_TOO_LARGE`且fetch调用数为零。模拟tool call分别给破损JSON和数组arguments，均须报“参数不是对象JSON”且工具事件为零；65项调用须在执行前整体拒绝。allowTools=false时返回普通只读调用、allowTools=true时返回隐藏send_command_input也都须作为未声明工具在执行前拒绝。最后一个合法调用故意夹带assistant/function未知秘密字段，第二轮捕获请求并断言回送assistant只有role/content/tool_calls、tool_call只有id/type/function、function只有name/arguments，同时真实工具事件恰一次。它验证模型边界的投影/顺序，不认证Provider善意或进程峰值内存。

下一fetch直接抛不可用；runChat Code面对创建文件请求必须有“已停止”错误、没有tool且文件不存在，防模型失败自动builtin重放。工具额度组首轮返回9个list_directory调用（Array.from生成独立id），次轮解析请求messages筛tool，必须有9个响应，第9个ok=false；最终runOpenAI答done，证明8项执行额度外也补齐已验证协议结果，而非丢失tool_call_id。

返回式失败组登记并批准一个真实进程内operation，handler正常return但状态为failed；模拟模型调用operation_result，下一轮必须收到含failed及原error的完整有界结果，工具事件必须ok=false且保留result。它专门防止只检查ok/success字段而把终态失败画成绿色；不把夹具审批当真实外部副作用。

后两组用Promise保存**finish**延迟响应：旧Plan开始后新start替换回合，旧回答不得插新回合；新回合两支启动merge后再加第三支，迟到merge不得标已合并。finally恢复workspace/fetch、reset回合、rm临时目录；catch exitCode1。不是实时服务端网络race测试，而是可控延迟的确定性状态竞争fixture。

## chatVision.test.js

[源码](chatVision.test.js)假1px PNG、两个临时目录，不依赖显示器。前半静态/函数断言：findShotCandidates识别反斜杠-Out、引号空格路径、mark JSON out，无关命令不误报；resolveShotPath允许工作区相对/绝对，拒外部与非图片。symlink创建仅Windows EPERM/EACCES明确跳过，链接成功后的逃逸断言在catch外，不能吞失败。

collectShot须返回PNG data URL、bytes/rel；MAX_BYTES断言等于6MiB，**未实际构造超限文件验证tooBig分支**。modelSeesImages检查vision布尔/caps/capabilities三来源，以及无声明/null反例。loadSkill computer-use须给绝对目录、脚本目录与snap提示/Bridge回图说明；未知Skill found=false。

**withProvider(responses,run)**真实http server监听随机loopback，data收正文，end解析并存bodies、按序返回预设响应（末项重复），listen回调调用run(baseUrl,bodies)，then/catch都关闭server再完成。**toolCallResp(cmd)**构造run_command调用，**finalResp(text)**构造最终答复。cmd只echo -Out预置PNG，不真实截屏。

**main()**中vision模型两轮：首轮无图，第二轮有image_url/data URL与路径说明；返回文本正确，事件status提截图，整个events不得含图片base64。文本模型同样两轮，所有请求不得有image_url，但有“未标记可看图”提示且UI诚实说明。最后静态检查m-vision控件、bind写vision、settings显示pill，以及MCP server复用computerUse、含image内容且不broadcast图片。

末尾删除两tmp，main.catch退出1；无finally包所有前置同步assert，错误可留下文件。测试中“我看到截图”只是假provider固定回答，绝不是视觉理解质量或真实远程截图授权的证据。

## computerUseScripts.test.js（F72）

[源码](computerUseScripts.test.js)首次逐行审查computer-use/win后新增，锁住三处修复。所有平台先跑三项：**snapContract()**核对snap.ps1不再用`-like "*$WindowTitle*"`、改用与act/type相同的忽略大小写字面子串IndexOf且`.Count -ne 1`时输出ERR_WINDOW_MISSING_OR_AMBIGUOUS/exit2、绝对-Out走IsPathRooted；**markContract()**核对mark.cs经JsonText转义in/out/pts；**hostParsesEscapedJson()**给findShotCandidates一段转义JSON，候选须含解码后的`C:\repo\shots\cur-marked.png`，再给旧式未转义输出（`C:\temp\new-marked.png`，其中`\t` `\n`会被JSON误解码），原文候选仍须在。

Windows上**windowsRuns()**经**powershell(file,args)**（`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File`，120秒上限）真实执行：mark.ps1以绝对路径输入输出，末行必须能JSON.parse、out等于给定路径、文件非空，且collectShot能把这份标记图作为附件找到；snap.ps1以含`[`与`*`的不存在标题运行须exit2并输出ERR_WINDOW_MISSING_OR_AMBIGUOUS、不生成文件；snap.ps1全屏写到带空格子目录的绝对路径：成功时文件非空且META.file等于该路径，runner无可截桌面时容许exit3，但输出不得是路径格式错误（修前正是“given path's format is not supported”）。其他平台打印SKIP。结构断言在修前即红；Windows实跑的红/绿以Windows CI为准，截图能力取决于runner桌面，不代表真实桌面验收。

## 验证

`npm test --prefix webagent-core/agent-host -- --filter=runChat`，另分别filter=modelLifecycle、chatVision。涉及命令仅操作临时工作区，真实模型账户/图像理解、Windows桌面与手机MCP仍需单列实测。

2026-09-14 Windows回归修正：集成命令echo只接收完整引号路径，不再让PowerShell把裸-Out解释为参数。先断言第二轮tool结果exitCode=0、stdout含cur.png，再核对image_url；失败时报告真实工具错误，不以模型固定文本代替执行成功。

2026-09-14负例补充：modelLifecycle先省mode发模拟模型请求，defaultTools必须含read_files而无write_file；未知mode返回ok:false。
