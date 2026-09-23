# 本机 Chat：模型循环与 Plan

逐函数阅读：[Chat调度详解](Chat调度详解.md) · [模型调用详解](模型调用详解.md)。


## 职责与入口
本目录接收 `/api/chat` 已解析的请求，选择模型、调用共享工具并产生事件。工作台、扩展 webview、原生 VS Code Chat 都可使用这条通道。远程 MCP 在 `mcp/server.js` 调工具，不经过本目录的 Chat 调度；但会复用截图辅助函数。

## 文件分工
| 文件 | 主要职责与调用方 |
|---|---|
| `runChat.js` | `runChat` 选择普通 Chat 或 Plan；`runBuiltin` 做有限的规则式探索；`runPlanRound` 管理分支和总结 |
| `openai.js` | `runOpenAI` 请求 OpenAI 兼容端点，循环处理工具结果；`systemPrompt` 组合模式、画像和自定义指令 |
| `providers.js` | Provider模型列表发现（15秒/512KiB/最多100项、禁止跳转）及仅追加配置登记；addProvider包装和目录项均为固定schema并拒绝未知字段，不靠名字猜能力，不涉及身份探针 |
| `computerUse.js` | 从命令和stdout识别截图路径，校验真实路径及图片大小，供Chat和MCP分别附图 |
| `toolLabel.js` | 将工具结果转换为短标签；标签不替代结果对象中的失败状态 |

## 执行流程
### 普通 Chat
1. `runChat` 读取工作区配置；按明确模型ID或当前活动模型ID精确查找；无效ID不再回退到列表首项。
2. 模型不存在或非builtin模型缺少调用字段时，发送error并停止。已发出的模型请求失败时也停止，交由用户选择重试或换模型；不会自动重放成内置文件修改。
3. 选中builtin时，`runBuiltin` 扫描目录、搜索并读取有限文件。Ask输出探索摘要；Code只识别消息中的明确文件正文/补丁意图，必要时执行探测到的测试命令。它不是通用大模型。
4. `timedTool` 使用共享 `isToolFailure`，把抛出的异常以及 `ok/success:false`、失败/取消/unknown状态、非零退出、超时和未知核验转换成失败工具事件，返回 `{ok:false,result,error}`。原结果保留供调用方核对；不能把“不抛异常”当成功。

### 模型工具循环
`runOpenAI` 发送system、最近历史和当前问题，最多10轮模型请求。每份序列化模型POST在触网前限制为12MiB；超过时抛`E_MODEL_REQUEST_TOO_LARGE`。Provider assistant对象不会原样带入下一轮：只投影role/content/tool_calls及每项固定id/type/function.name/arguments，content必须为字符串或null。每轮最多接受64项唯一、固定形状的tool call；arguments必须是≤256KiB且能解析为非数组对象的JSON，调用名还必须属于本轮实际发送的工具声明。畸形/未声明调用在任何工具副作用前失败，不再静默退化为`{}`；`allowTools:false`因此是执行断路器，而不只是省略声明。

通过校验后每轮最多实际执行前8项工具调用；其余已验证ID都收到“未执行”的限额反馈，保持对话协议完整。工具按模式筛选；执行仍经过 `tools.callTool` 的模式与命令检查。返回式失败同样使用共享 `isToolFailure` 标成失败事件，但把有界原结果作为 tool 消息交给下一轮模型，不伪造异常或丢掉 `operation_result` 的终态详情；失败命令不进入截图成功分支。真正进入callTool后抛出的工具异常会反馈给模型，不代表每次工具失败都立即终止整个循环。**模型协议/服务调用失败停止**与**工具失败作为结果反馈**是两种不同情形。

结果经软预算处理后序列化，保持完整JSON。普通模型POST显式`redirect:'error'`，响应body在解析前以原始字节逐块限制为1MiB；超限为`E_RESPONSE_TOO_LARGE`并尝试取消reader。成功与非2xx正文都受同一预算，Provider错误正文不拼入向UI传播的异常。请求及body另受120秒deadline并服从当前Chat取消信号；外层HTTP Chat还有5分钟总截止时间。12MiB出站/1MiB入站都是序列化字节预算，不是Token额度、代理峰值或整个进程的内存上限，也不验证Provider善意。

### Plan 分支与总结
- `start` 创建全局当前轮次，`branch` 追加分支，`reset` 清空；关闭多模型时使用single草案，不是“只有一支就自动总结”。
- 至少两支才可merge，分支上限由配置限制在2–8。分支返回前检查原round对象；总结还检查分支数，拒绝将迟到结果写入新轮次。
- 远程分支使用只读工具；builtin草案明确标 `simulated:true`。总结结果不是统计意义上的一致率证明。
- 分支及merge遇到不存在/非builtin配置不完整的模型均停止；只有明确选中builtin才允许本机草案或mergeLocalBranches。失败不会标记轮次已合并，不修改待办；用户可补齐配置后主动再总结。

## 截图与数据边界
截图候选必须在允许的工作区或computer-use目录真实路径内，单图上限6MiB。Chat只给标记vision的模型附 `image_url`；未标记时提示看不到图。MCP使用同一截图辅助，但以MCP image内容返回。base64不经事件总线广播。

取消不是回滚：取消到达前已经完成的写入仍然存在；模型最终回答也不是测试通过证明。Plan轮次为进程内共享状态，不是每个浏览器独立会话数据库。

## 验证与继续阅读
`modelLifecycle.test.js` 检查模型失败/工具结果/Plan代次，`chatVision.test.js` 检查附图契约，`ptyLifecycle.test.js` 覆盖请求取消相关边界。真实模型提供商、网络中断和桌面截图效果仍需集成验收。

工具副作用见[工具说明](../tools/README.md)，HTTP事件及结束语义见[API说明](../api/README.md)。函数位置使用文档站源码索引，不手抄旧行号。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [computerUse.js](computerUse.js) | 7 个函数/类节点 |
| [openai.js](openai.js) | 20 个函数/类节点 |
| [providers.js](providers.js) | 20 个函数/类节点 |
| [runChat.js](runChat.js) | 44 个函数/类节点 |
| [toolLabel.js](toolLabel.js) | 1 个函数/类节点 |
<!-- docs-inventory:end -->

新手操作见根目录内置探索Agent使用指南.md。explore不再预设npm test冒充已探测；无声明且无tests目录时testCmd为空，Ask如实说明未探测到测试命令。runChat回归增加空工作区不运行命令检查。
