# 跨模块辅助：控制面、取消、事件与有界读取

逐项阅读：[差异展示详解](差异展示详解.md)。


逐函数/类方法阅读：[控制面与Origin详解](控制面与Origin详解.md) · [事件总线详解](事件总线详解.md)。


逐函数阅读：[requestScope 与 boundedFile 详解](函数详解.md)。其他文件不因此视为已逐函数讲完。

## 职责与文件分工
这些模块为API、MCP和工具提供公共能力，不独立监听HTTP或运行模型。

| 文件 | 职责 | 必须知道的限制 |
|---|---|---|
| `localControl.js` | 校验回环socket、显式本机Host及隧道特征 | 回环socket本身不足以证明本机来源；不是用户登录系统 |
| `corsAllow.js` | 本机API浏览器Origin与MCP Origin规则 | CORS不是认证；无Origin客户端仍需相应入口认证 |
| `requestScope.js` | AsyncLocalStorage传递AbortSignal；fetchText包装请求/body deadline | 只有显式runWithSignal的调用链才拥有请求上下文 |
| `boundedFile.js` | 普通文件与8MiB默认文本读取预算 | 是有界同步读取，不是所有IO异步化或OS沙箱 |
| `eventBus.js` | 进程内事件、脱敏日志和WS广播 | 内部订阅者仍收到原始payload；脱敏不适用于所有数据通道 |
| `diff.js` | 用diff库生成展示补丁和增删统计 | 展示统计不负责决定写入是否安全 |

## 执行流程与边界
### 本机控制面
isLocalControlPlane先拒绝隧道特征头，再要求Host为localhost、127.0.0.1或[::1]及有效可选端口，最后检查回环地址。未知/缺失Host不放行。HTTP路由和WS升级各自接入检查；不允许用“本机代理转发”绕过既定local-only边界。

API浏览器Origin只接受本机；没有Origin时还检查可用Referer。MCP有独立白名单和WEBAGENT_CORS_ORIGINS扩展项，不在名单的显式Origin返回403。放行MCP Origin不放行API，也不跳过MCP令牌验证。

### 取消与读取
runWithSignal建立异步链上下文；checkCancelled看到aborted抛E_CANCELLED。fetchText将父取消连接到内部controller，并用deadline覆盖fetch和body读取，finally清理timer/listener。外层是否真的建立该上下文必须看调用方，不能对所有REST或MCP请求一概保证。

readBoundedText在路径与打开的fd上检查普通文件和大小，以64KiB块读取，最多多读1字节检测超预算，finally关fd。文件仍可能被其他进程修改；读取上限不是一致性事务。

### 事件、日志与WS
broadcast把原payload交给进程内EventEmitter订阅者，脱敏副本用于日志和WS。日志最多500条；WS最多32路，空闲计时30分钟，有发送活动会刷新。秘密键和常见token模式会被替换，大字段、深度、键/数组数受限。

这是减少泄漏和内存占用的防线，不是所有秘密形式都能被识别的证明。工具结果、模型请求、配置文件和进程参数不自动继承eventBus脱敏。

## 验证
`localControl`/`auditControl`测试实际HTTP/WS边界，`corsAllow`检查Origin规则，`eventBus`检查脱敏，`resourceBudget`检查有界读取，`ptyLifecycle`检查部分取消传播。协议完整性和平台进程行为应查看对应模块测试，而不是只测公共函数。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [boundedFile.js](boundedFile.js) | 1 个函数/类节点 |
| [corsAllow.js](corsAllow.js) | 14 个函数/类节点 |
| [diff.js](diff.js) | 1 个函数/类节点 |
| [eventBus.js](eventBus.js) | 12 个函数/类节点 |
| [localControl.js](localControl.js) | 7 个函数/类节点 |
| [requestScope.js](requestScope.js) | 5 个函数/类节点 |
<!-- docs-inventory:end -->
