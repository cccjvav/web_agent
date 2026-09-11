# 本机 API：工作台与扩展的控制接口

## 职责与入口
`routes.js`提供挂载在 `/api` 下的REST和Chat NDJSON流。两端口的挂载规则由上级 `index.js` 决定；本机控制面检查和浏览器Origin检查在进入router前执行。本目录不是远程MCP认证入口，也不能通过开放Origin白名单将远程工作台变成受支持产品。

## 接口导航
以下路径都省略 `/api` 前缀；精确参数见 `routes.js` 和调用方。

| 路径 | 方法 | 用途及关键结果 |
|---|---|---|
| `/status`、`/logs` | GET | 状态快照、日志；status包含本机连接所需信息，不应当成可公开接口 |
| `/bridge/start`、`/bridge/stop`、`/bridge/logout` | POST | 启停隧道或注销；代次控制拒绝迟到启动 |
| `/bridge/reset-secret`、`/bridge/reset-round` | POST | 重置连接身份，或清MCP会话/读取hash缓存；不是同一个操作 |
| `/bridge/login`、`/bridge/token` | POST | 本机演示授权，或验证用户提供的GitHub身份 |
| `/bridge/device`、`/bridge/device/poll`、`/bridge/github/clear` | POST | GitHub设备流及清理；不等同MCP OAuth配对 |
| `/chat` | POST | 本机Chat的NDJSON事件流 |
| `/tool/call`、`/consensus/run`、`/tasks/reset` | POST | 直接调用工具、本机共识流程、清任务状态 |
| `/pty/hello`、`/pty/jobs`、`/pty/jobs/:jobId` | POST / GET / POST | PTY客户端存活、取任务、报告状态 |
| `/files/tree`、`/files/content` | GET | 文件导航与内容/hash读取 |
| `/files/content` | PUT | 通过write_file保存，接受expectedHash |
| `/models` | GET / POST | 模型配置读取/更新；响应隐藏API Key正文 |
| `/providers/probe`、`/profile/detect` | POST / GET | 探测模型、环境与技术栈 |
| `/customizations` | GET / PUT | 自定义配置；其持久化保证见models说明 |
| `/skills` | GET / POST | 列出Skill或创建Skill正文 |

## 执行流程与成功语义
### Bridge
start先验证授权，保存选项，再等待旧隧道停止并启动所选提供商。只有取得公网URL后才将running设为true。为兼容UI，部分启动失败仍返回HTTP 200，但 `success:false`、`running:false` 和 `tunnelError` 表明业务失败。新start/stop/logout使旧start的最终响应变为409。

stop/logout等待停止Promise，失败不能当成功。没有公网隧道时连接信息指向本机MCP端口，而非浏览器页面Host；这不意味着手机仍能连接本机地址。

### Chat流
请求创建AbortController，5分钟到期、请求中止或响应断开触发abort。外层用requestScope传播信号，扩展客户端另启用PTY上下文。`emit`只向仍打开的响应写入一行JSON，最后清理监听器和计时器。

**done是流处理结束，不是整个任务成功的保证。** runChat可以先发送error再返回，router随后仍发送done。客户端应同时处理error、工具ok状态和done，不能只等到done就显示“全部成功”。

### 直接工具调用
`/tool/call`异常返回400。当前实现对正常返回的对象外包 `success:true`，即使内部result可能包含 `ok:false`；事件统计也采用这一外层成功口径。这与MCP按业务失败标记isError不同，调用者须读取result，本轮文档审查未改变该行为。

### 文件保存
GET经安全路径和有界读取返回content/hash；PUT将路径、内容、覆盖确认及expectedHash传给write_file。旧hash冲突映射为409，其他保存异常为400。浏览器应保留未保存缓冲区，再读取新磁盘状态，而不是无条件强制覆盖。

### PTY身份
hello、取任务和报告都要提供clientId与匹配的workspace；不匹配409。job报告还由PTY模块核对所有权和状态，终态不能通过迟到accepted复活。这里只负责协议接线，真正终端运行在扩展端。

## 边界与验证
requestScope由 `/chat`显式创建，**不代表所有REST请求自动拥有同样的断连取消机制**。API参数校验也不等于通用JSON Schema验证器。配置写入的保护程度以各models实现为准。

`httpSmoke`、`apiFiles`、`bridgeTunnel`、`auditControl`、`ptyLifecycle`覆盖实际HTTP和模块边界；不是手机OAuth、真实终端或浏览器全部操作的验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [routes.js](routes.js) | 48 个函数/类节点 |
<!-- docs-inventory:end -->
