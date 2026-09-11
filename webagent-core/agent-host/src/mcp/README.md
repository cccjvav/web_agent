# MCP：远程客户端协议、认证与工具结果

## 职责与文件分工
MCP使外部Agent在认证后调用当前工作区工具；它不开放本机 `/api` 或WebSocket控制面，也不负责本机Chat的模型循环。

| 文件 | 主要职责 |
|---|---|
| `server.js` | HTTP/JSON-RPC分发、认证入口、会话、tools/resources/prompts及SSE |
| `oauth.js` | 动态客户端注册、配对授权、PKCE、token认证/轮换/撤销 |
| `session.js` | MCP HTTP会话及心跳/调用统计；提供协作任务板的peer标识 |
| `budget.js` | 保留JSON结构和游标的软字符预算 |
| `errors.js` | ProtocolError/ExecutionError及对外错误对象转换 |
| `instructions.js` | initialize说明、连接引导和给网页模型的规则文本 |
| `resources.js` | 主机、工作区、记忆和客户端连接说明资源，不是任意磁盘读取接口 |
| `clients.js` | 客户端连接方式、配方与文案；列出配方不表示第三方客户端当前可用性已实测 |

## 建立连接
### 地址和凭据
规范路径为 `/mcp`，兼容 `/mcp/<secret>`。extractToken依次检查Bearer、路径secret、x-mcp-secret和query secret；验证由oauth模块完成，支持主机连接密钥或有效OAuth访问令牌。不要把带secret的URL当普通公开链接。

未认证返回401并给WWW-Authenticate发现提示。允许浏览器Origin只是CORS层条件，不代替凭据认证。OAuth发现/注册/授权/token端点挂在MCP端口，由上层index挂载。

### initialize与会话
initialize协商支持的协议版本，返回能力、服务器信息和instructions，并建立Mcp-Session-Id。当前声明支持2024-11-05、2025-03-26、2025-06-18；客户端应保存服务器选择的版本和会话ID。

会话使用随机ID，初始化后的peer由该ID关联，不再以相同IP/显示名称作为唯一身份。无会话仍可走部分兼容调用，但修改board必须先初始化；未知已提供的session通常404，重新initialize可建立新会话。会话和授权凭据不是同一个对象，不能把显示名称当认证用户。

HTTP会话有24小时TTL及200上限。进程重启会丢失内存会话；客户端需要重新初始化，而不是持续重发失效ID。

## 请求、通知与结果
- POST支持单个JSON-RPC请求或batch。batch逐项执行；仅通知无返回结果时为204；空batch拒绝。HTTP200不意味着其中每个RPC/工具成功。
- `tools/list`返回可见工具schema；`tools/call`最终经过共享callTool，远程命令权限与本机审批不同。
- 工具返回 `ok:false` 或 `success:false` 时，MCP结果带 `isError:true`；抛出的异常也变成失败内容。客户端应检查isError及错误对象，而非只看HTTP状态。
- 公共工具错误含layer、code、msg、detail；未分类错误可能归为E_INTERNAL。错误分类器的字符串匹配不是完整异常类型系统。
- run_command可附截图image内容；无可用截图则只有文本，识别图片失败不应把文本结果丢掉。图片有真实路径和6MiB边界，base64不广播到日志。

**取消差异**：当前 `notifications/cancelled` 只是被接收并返回空处理结果，没有建立RPC请求ID到执行AbortController的映射。不能把本机Chat的取消实现宣传为MCP协议级取消已经贯通。远程命令仍依赖自身超时或受支持的命令取消工具。

### SSE
POST在Accept要求时可返回SSE格式的RPC结果后结束；GET SSE用于连接/心跳，最多32路，15秒发送心跳，10分钟定时结束。这里的结束计时不因心跳刷新，不能描述成永久事件订阅或可靠消息重放。

## OAuth授权流程与边界
1. register登记redirect URI及token端点认证方式：none、client_secret_basic或client_secret_post。后两种返回客户端secret。
2. 用户完成配对授权，服务器核对已注册redirect URI、配对码及PKCE方式，只支持S256。
3. 换token前先认证客户端，再验证code、redirect URI和code_verifier；验证通过才消费code。
4. refresh成功轮换新access/refresh并作废旧访问令牌；重复使用已消费refresh会撤销该客户端令牌。
5. revoke/reset清理相应内存状态。主机连接密钥和OAuth客户端secret各有用途，不应混用。

| 对象 | 当前有效期/性质 |
|---|---|
| 配对码 | 5分钟、一次性 |
| 授权码 | 5分钟 |
| access token | 1小时 |
| refresh token | 7天，使用时轮换 |
| 授权存储 | 进程内存；重启后重新配对，不是持久登录 |

## 输出预算不是截断JSON
16k字符是软目标。clipJson保留数组成员、类型、标识符和分页字段；带offset/cursor/nextCursor的页及子内容不再被静默裁切。非分页文本可显式缩短；对象可标 `_truncated`、`originalChars`、`_budgetExceeded`。数组不会为加元数据而变成对象。

因此不是所有响应都严格小于16k，也不是所有类型都带同样的截短标志。大文件、搜索和命令捕获的硬上限在各工具实现；需要更小返回应缩小查询范围或limit。

## 验证与排查
`mcpProtocol`覆盖RPC、通知/batch和附图，`oauth`与`oauthClientAuth`覆盖PKCE/刷新/客户端认证，`mcpBoard`覆盖会话任务归属，`resourceBudget`覆盖schema与游标。测试不等同手机Arena、所有代理或第三方连接器的端到端验收。

排查顺序：本机健康 → 公网路由 → 认证 → initialize/session → tools/list → 只读工具 → 经明确授权的写入。精确工具模式和文件边界见[工具说明](../tools/README.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [budget.js](budget.js) | 6 个函数/类节点 |
| [clients.js](clients.js) | 5 个函数/类节点 |
| [errors.js](errors.js) | 6 个函数/类节点 |
| [instructions.js](instructions.js) | 3 个函数/类节点 |
| [oauth.js](oauth.js) | 41 个函数/类节点 |
| [resources.js](resources.js) | 5 个函数/类节点 |
| [server.js](server.js) | 32 个函数/类节点 |
| [session.js](session.js) | 13 个函数/类节点 |
<!-- docs-inventory:end -->
