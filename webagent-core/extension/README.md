# VS Code扩展：本机Chat界面与可观测PTY宿主

逐函数与嵌入脚本详解：[入口与Webview](入口与Webview详解.md) · [PTY扩展](PTY扩展详解.md)。覆盖本目录5个JS文件，并讲解package.json贡献声明和SVG资源。


## 职责与入口
扩展为VS Code提供Web Agent侧栏和可用时的原生Chat参与者，调用本机agent-host；它不是新的远程模型服务器。桌面Chat可把命令交给本目录PTY宿主，网页MCP仍走主机的普通命令执行路径。

规范源码在本目录；extensions-installed是发行副本。修改源码或资源时同步副本并运行extensionCopy测试，不在两个地方分别设计行为。

## 文件分工
| 文件 | 主要职责 |
|---|---|
| `package.json` | 扩展元数据、激活条件、命令和配置贡献 |
| `extension.js` | 激活、HTTP/NDJSON客户端、侧栏webview、原生Chat接线和取消 |
| `ptyHost.js` | 注册随机clientId、轮询/接收任务、审批、终端运行、捕获输出和报告 |
| `ptyPolicy.js` | 不依赖VS Code的命令判断；决定是否可自动批准或必须重新询问 |
| `workspaceMatch.js` | 规范路径并比较当前文件夹与host工作区 |
| `modeFromChatRequest.js` | 将命令/提示前缀收敛为ask、plan、code，未指定时默认code |
| `resources/` | 图标；见该目录说明 |

## 执行流程
1. 激活时建立agent-host客户端，注册侧栏及当前VS Code版本支持的Chat能力。HTTP普通请求和NDJSON有各自的超时/取消处理。
2. 用户消息发到 `/api/chat`；原生取消token和webview停止消息可中止请求。响应中的tool、message、error、done由各界面分别呈现。
3. 扩展PTY以clientId和workspace标识自己。接到job先验证工作区和cwd真实路径，再claim；批准后重新向host报告accepted并确认仍可执行，不凭一个过期弹窗直接启动。
4. 优先尝试node-pty。不可用时只使用能观察执行结束和读取输出的shell integration；等待后仍不可用则拒绝执行，**不通过不可观测的sendText猜测成功**。
5. 输出分段上报，结束要结合真实退出码与完整捕获状态；未知退出码、非零退出、不完整捕获、取消或超时都不能报run成功。

## 审批与并发边界
- 自动批准只适用于保守的完整简单只读命令匹配；不能把只读前缀推广到复合命令。
- 会话/命令族允许不意味着所有后续语法都免审；危险或复杂命令仍须当次确认。
- host负责90秒审批窗口及job状态；扩展持续处理取消，不因弹窗或长命令阻塞所有轮询。
- 客户端工作区比较不是操作系统隔离。外部程序仍拥有当前用户权限，焦点/终端集成行为需实机验证。

## 界面与连接边界
webview动态文本使用DOM文本节点，CSP含nonce，宿主只接受预期消息。不能把HTML转义/CSP当作后端授权。Bridge启动失败可能HTTP200但success=false；没有隧道时得到的是本机MCP地址，不能从网页页面Host推断公网可达。

## 验证
`extensionCopy`验证规范源码与副本，`webviewRuntime`运行实际模板/消息fixture，`desktopExtension`、`ptyLifecycle`覆盖接口与任务边界。尚不能据此声称真实VS Code多窗口、shell integration、Windows审批和取消全部验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [extension.js](extension.js) | 42 个函数/类节点 |
| [modeFromChatRequest.js](modeFromChatRequest.js) | 1 个函数/类节点 |
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
| [ptyHost.js](ptyHost.js) | 55 个函数/类节点 |
| [ptyPolicy.js](ptyPolicy.js) | 4 个函数/类节点 |
| [workspaceMatch.js](workspaceMatch.js) | 2 个函数/类节点 |
<!-- docs-inventory:end -->
