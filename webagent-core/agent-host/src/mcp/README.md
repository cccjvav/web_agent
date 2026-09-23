# MCP：远程客户端协议、认证与工具结果

stdio/受控外部接入：[受控工具与工作流详解](../utils/受控工具与工作流详解.md)。

逐函数/类方法阅读：[会话与结果详解](会话与结果详解.md) · [资源与客户端详解](资源与客户端详解.md) · [请求分发详解](请求分发详解.md) · [OAuth授权详解](OAuth授权详解.md)。


## 职责与文件分工
入站MCP使外部Agent在认证后调用当前工作区工具；它不开放本机 `/api` 或WebSocket控制面，也不负责本机Chat的模型循环。出站客户端是另一职责：经本机登记/批准后调用第三方服务，WebAgent此时作为client。两条连接可串联，但出站不是Arena连接本机的前提。角色图与新手例子见[使用指南](../../../../使用指南.md#公网出站mcp不是手机连接本机的那条链路)。

| 文件 | 主要职责 |
|---|---|
| `requestLifecycle.js` | 有界在途请求、按peer和凭据绑定的取消、断连/期限与清理 |
| `externalClient.js` | 登记第三方回环HTTP(S)/公网HTTPS/stdio服务、发现目录、经审批调用；先判原始结果再覆盖宿主验证说明，外部unknown/失败不被改写成功；不把入站授权透传给第三方 |
| `publicHttps.js` | 仅负责公网出站HTTPS：DNS全答案过滤、固定连接地址、正常TLS及有界消费所用流适配 |
| `stdioLaunch.js` / `stdioTransport.js` | 本机程序启动审阅与受监督JSON行传输，不是OS沙箱 |
| `server.js` | HTTP/JSON-RPC分发、认证入口、会话、tools/resources/prompts及SSE |
| `oauth.js` | 动态客户端注册、配对授权、PKCE、token认证/轮换/撤销 |
| `session.js` | MCP HTTP会话及心跳/调用统计；提供协作任务板的peer标识 |
| `budget.js` | 保留JSON结构和游标的软字符预算 |
| `errors.js` | ProtocolError/ExecutionError及对外错误对象转换 |
| `instructions.js` | initialize说明、连接引导和给网页模型的规则文本 |
| `resources.js` | 主机、工作区、记忆和客户端连接说明资源，不是任意磁盘读取接口 |
| `clients.js` | 客户端候选方式与文案；第三方卡片三态能力/订阅/隧道字段，null为未知，不是免费或无需隧道的保证 |

## 建立连接
### 地址和凭据
规范路径为 `/mcp`，兼容 `/mcp/<secret>`。extractToken依次检查Bearer、路径secret、x-mcp-secret和query secret；验证由oauth模块完成，支持主机连接密钥或有效OAuth访问令牌。不要把带secret的URL当普通公开链接。

未认证返回401并给WWW-Authenticate发现提示。允许浏览器Origin只是CORS层条件，不代替凭据认证。OAuth发现/注册/授权/token端点挂在MCP端口，由上层index挂载。

### initialize与会话
initialize协商支持的协议版本，返回能力、服务器信息和instructions，并建立Mcp-Session-Id。当前声明支持2024-11-05、2025-03-26、2025-06-18；客户端应保存服务器选择的版本和会话ID。版本保存在私有会话；缺省版本头沿用已知协商值，无已知信息才按2025-03-26兼容。重复/不支持/冲突版本头在POST/GET/DELETE副作用前400，活会话不允许重新initialize降级。

HTTP会话使用私有随机ID，初始化peer另取独立随机公开标签，公开peers/任务归属不能还原会话头。会话绑定OAuth注册client或当前长期secret的主体摘要；同client刷新沿用，跨client不可复用/删除，不以IP/显示名称判身份。initialize提交的clientInfo在统计入库时只保留有界name/title/version，未知extra不保留；status/snapshot再按固定key/时间/计数/busy/clientInfo深投影，不能把远端任意对象展开进本机状态响应。无会话仍可走部分兼容调用，但修改board必须先初始化；无会话调用者按“显示名称@来源IP＋由已验证凭据派生的盐化标签”区分（F71）：经隧道时来源IP恒为127.0.0.1，URL密钥与各OAuth客户端仍是不同调用者，命令输出与get_logs互不可见；同一凭据下的多个对话仍合并为一个调用者，要按对话区分须initialize并保留会话ID。未知已提供的session通常404，重新initialize可建立新会话。会话和授权凭据不是同一个对象，不能把显示名称当认证用户；同主体持有真正会话ID仍可使用它，需保密，非完整多租户隔离。

HTTP会话有24小时TTL及200上限。进程重启会丢失内存会话；客户端需要重新初始化，而不是持续重发失效ID。

## 请求、通知与结果
- POST先完整校验RPC envelope/ID/params与协议版本。2025-06-18拒绝batch；旧版本允许1–64项batch，先检查全体形状和类型区分的批内重复ID，通过后才顺序执行；initialize必须单独请求。合法通知（单个/旧版批次）202空体，DELETE仍204。ID预算为≤256字符串或安全整数；不接受无ID工具调用。上述上限是本地策略，不是通用协议限制。HTTP200不意味着其中每个RPC/工具成功，预检不是跨工具事务或持久去重。
- `tools/list`返回可见工具schema；`tools/call`最终经过共享callTool，远程命令权限与本机审批不同。
- 工具结果经共享isToolFailure检查，显式失败、非零退出、超时、取消或unknown时，MCP结果带 `isError:true`；抛出的异常也变成失败内容。客户端应检查isError及错误对象，而非只看HTTP状态。
- 公共工具错误含layer、code、msg、detail；未分类错误可能归为E_INTERNAL。错误分类器的字符串匹配不是完整异常类型系统。
- JSON-RPC层：`ping`只回`{}`（MCP规定；主机快照用ping工具或GET /mcp）；未知方法是HTTP 200上的-32601，HTTP 404只表示会话不存在；畸形JSON回HTTP 400的-32700。任何路径的解析/超限错误都只回JSON，不含调用栈或安装路径（F70第七批，用官方SDK与一致性套件对真实主机复核）。
- tools/list带MCP annotations（readOnlyHint等）。ChatGPT开发者模式据此只对写入类工具要求确认；注解是客户端提示，不放宽主机权限与审批。
- run_command可附截图image内容；无可用截图则只有文本，识别图片失败不应把文本结果丢掉。图片有真实路径和6MiB边界，base64不广播到日志。

**请求取消**：HTTP tools/call通过requestLifecycle在requestScope中执行；通知仅可取消相同初始化peer＋相同凭据＋同类型RPC ID的在途调用。无会话兼容调用没有可寻址取消键；仍有断连和5分钟abort信号。通知始终无查询结果，不泄露其他调用是否存在。信号是协作式取消，不回滚已执行修改；已返回execId的start_command不再属于在途RPC。完整逐函数边界见[请求分发详解](请求分发详解.md)。

### SSE
POST在Accept要求时可返回SSE格式的RPC结果后结束；带Mcp-Session-Id的GET SSE是Streamable HTTP监听流，只发注释（本主机从不主动推送服务器消息），最多32路，15秒发送心跳，10分钟定时结束。这里的结束计时不因心跳刷新，不能描述成永久事件订阅或可靠消息重放。**只支持Streamable HTTP**：不带会话ID的GET流是旧版2024-11-05 HTTP+SSE握手，本主机未实现，直接405（F70第七批前会开流并发endpoint事件，官方旧版SSE客户端因此永远等不到initialize响应）；GET流从不分配会话，过期会话404。

## OAuth授权流程与边界
1. register登记redirect URI及token端点认证方式：none、client_secret_basic或client_secret_post。三种方式都返回客户端secret，但none不校验该secret，不等于机密客户端认证。
2. 用户完成配对授权，服务器核对已注册redirect URI、配对码及PKCE方式，只支持S256。
3. 换token前先认证客户端，再验证code、redirect URI和code_verifier；验证通过才消费code。
4. refresh成功轮换新access/refresh并作废旧访问令牌；重复使用已消费refresh会撤销该客户端令牌。
5. revoke先按注册方式认证，仅对匹配client的已知token删除access/refresh对；未知或其他归属也返回200，不是已删除目标的证明。它不轮换主机连接密钥，revokeAll也只是清OAuth内存状态。主机密钥轮换走独立本机入口。

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
`mcpProtocol`覆盖RPC、通知/batch和附图，`oauth`与`oauthClientAuth`覆盖PKCE/刷新/客户端认证，后者直接加载真实index验证issuer/挑战、表单授权及撤销后MCP拒绝，`mcpBoard`以真实index验证公开peer不可冒充、跨主体会话限制及OAuth刷新保留任务归属，`apiFiles`把未知session extra/clientInfo嵌套送入真实status HTTP并核对固定投影，`resourceBudget`覆盖schema与游标。测试不等同手机Arena、所有代理或第三方连接器的端到端验收。

排查顺序：本机健康 → 公网路由 → 认证 → initialize/session → tools/list → 只读工具 → 经明确授权的写入。精确工具模式和文件边界见[工具说明](../tools/README.md)。

F54第一批：POST/SSE会话使用active pin防止忙时TTL/容量淘汰；全忙拒绝新分配（503），最后release启动空闲TTL。入站原始重复/畸形SID拒绝400；出站畸形响应SID不保存/回传。采用1–512可见ASCII、禁逗号的较窄SID策略，不是完整协议符合性承诺。

F54第四批：resources/read固定使用已认证peer上下文，workspace远端读取须保留初始化SID；只返回本peer任务并省略全局事件类型，Local内部默认不变。capabilities资源复用tools/list的当前ACL；Read仍是资源正文门槛。协议资源明确错误hash仅诊断、停下重读协调，不得去hash重放。

F54交叉复审：initialize.instructions限定自动hash复用仅适用于现存文件；先前读取的目标消失须保留expectedHash并协调，缺hash的新建不获得隐式删除保护。与protocol资源和工具目录对齐，不改变patch实现。

R2/R3响应互斥：externalClient.rpc与stdioTransport.frame按error字段存在性拒绝错误响应，不能让result+error:null/false/0变成功；保持审批unknown与不重放。

R2/R3会话提交时序：HTTP/SSE响应SID先校验但不立即保存，RPC响应接受后才提交，拒绝回复不得改变下一次批准调用的会话；合法结果/通知现有SID兼容不变。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [budget.js](budget.js) | 6 个函数/类节点 |
| [clients.js](clients.js) | 5 个函数/类节点 |
| [errors.js](errors.js) | 6 个函数/类节点 |
| [externalClient.js](externalClient.js) | 24 个函数/类节点 |
| [instructions.js](instructions.js) | 3 个函数/类节点 |
| [oauth.js](oauth.js) | 49 个函数/类节点 |
| [publicHttps.js](publicHttps.js) | 17 个函数/类节点 |
| [requestLifecycle.js](requestLifecycle.js) | 8 个函数/类节点 |
| [resources.js](resources.js) | 5 个函数/类节点 |
| [server.js](server.js) | 39 个函数/类节点 |
| [session.js](session.js) | 21 个函数/类节点 |
| [stdioBridge.cs](stdioBridge.cs) | 文件级登记；未做符号完整性证明 |
| [stdioBridge.ps1](stdioBridge.ps1) | 文件级登记；未做符号完整性证明 |
| [stdioLaunch.js](stdioLaunch.js) | 11 个函数/类节点 |
| [stdioSupervisor.js](stdioSupervisor.js) | 2 个函数/类节点 |
| [stdioTransport.js](stdioTransport.js) | 29 个函数/类节点 |
<!-- docs-inventory:end -->


受控外部MCP与固定工作流新增模块、审批页面和真实HTTP回归的逐函数解释见 `webagent-core/agent-host/src/utils/受控工具与工作流详解.md`。默认回环HTTP(S)，另支持本机显式确认的公网HTTPS及stdio启动；工具仍逐次本机批准，不自动安装或重试。

[公网出站详解](公网出站详解.md)：逐函数解释publicHttps、明确外发确认、DNS/socket/TLS边界与隔离TLS测试。
