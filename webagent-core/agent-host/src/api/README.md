# 本机 API：工作台与扩展的控制接口

逐项阅读：[路由逐项详解](路由逐项详解.md)。


## 职责与入口
`routes.js`提供挂载在 `/api` 下的REST和Chat NDJSON流。两端口的挂载规则由上级 `index.js` 决定；本机控制面检查和浏览器Origin检查在进入router前执行。本目录不是远程MCP认证入口，也不能通过开放Origin白名单将远程工作台变成受支持产品。

## 接口导航
以下路径都省略 `/api` 前缀；精确参数见 `routes.js` 和调用方。

| 路径 | 方法 | 用途及关键结果 |
|---|---|---|
| `/status`、`/logs` | GET | 状态快照、日志；status的模型/多模型及Bridge展示字段使用固定类型投影，历史嵌套值不原样发布，但仍包含本机连接所需信息，不应当成可公开接口 |
| `/bridge/start`、`/bridge/stop`、`/bridge/logout` | POST | 启停隧道或注销；启动只接受固定提供商及其专属域名/凭据字段和预算，未知包装在写配置/停启进程前拒绝；代次控制拒绝迟到启动 |
| `/bridge/reset-secret`、`/bridge/reset-round` | POST | 重置连接身份（新UI携绑定/旧密钥比较，只有完全空的旧请求兼容），或清MCP会话/读取hash缓存；未知字段不触发副作用，不是同一个操作 |
| `/bridge/login`、`/bridge/token` | POST | 本机演示授权，或验证用户提供的GitHub身份；空体/令牌包装严格，令牌在触网前限长且拒绝换行 |
| `/bridge/device`、`/bridge/device/poll`、`/bridge/github/clear` | POST | GitHub设备流及清理；无参操作只接受空体，不等同MCP OAuth配对 |
| `/chat` | POST | 本机Chat的NDJSON事件流；只接受固定顶层字段、枚举及有界user/assistant历史，错误包装在发流式响应头/模型或工具副作用前400 |
| `/tool/call`、`/consensus/run`、`/tasks/reset` | POST | 固定包装下直接调用工具、本机共识流程或清任务状态；未知字段不调度/不重置，统一`E_BAD_API_REQUEST` |
| `/pty/hello`、`/pty/jobs`、`/pty/jobs/:jobId` | POST / GET / POST | PTY客户端存活、取任务、报告状态；固定身份/query/body及逐状态字段/type/预算，错误包装不刷新存活或认领/推进/结束任务 |
| `/files/tree`、`/files/content` | GET | 文件导航与内容/hash读取；tree只收空query，content只收有界path，未知query不读取 |
| `/files/content` | PUT | 固定path/content/expectedHash/createOnly包装；新建必须`createOnly:true`，普通保存必须带64位expectedHash，错类型不会落入覆盖分支 |
| `/files/preview`、`/files/undo/:id` | POST / GET / POST | 有界只读diff、预览与明确确认版本绑定回退；包装/绑定字段固定，未知字段不写盘/不消费回退记录 |
| `/checkpoints`、`/checkpoints/:id/preview`、`/checkpoints/:id/restore`、`/checkpoints/:id/remove` | GET / POST | 固定包装下创建内存检查点、预览与一次恢复；未知字段不分配/写入/消费记录，各POST仍绑定工作区/host，不是多文件原子事务 |
| `/execution-control` | GET / POST | 固定query/body包装下读取或修改主机工作模式/Bridge权限；未知字段不改模式/策略，合法变更仍受绑定和在途/后台屏障保护 |
| `/operations`、`/operations/:id`、`/operations/:id/approve`、`/operations/:id/cancel` | GET / POST | 本机查看/批准/取消有界请求；approve只收confirm、cancel只收空体，未知包装不执行或取消，批准不等于执行成功 |
| `/external/*`、`/workflows/*` | GET / POST / DELETE（依实际路由） | external HTTP登记/删除及stdio预览/启动使用固定包装、严格确认/UUID/绑定；未知字段不触网、不保存、不启动/停止进程；工作流仍按其独立严格合同，不新增远程管理权 |
| `/connection-checks`、`/connection-checks/:id` | POST / GET / DELETE | 创建/检查/清空本机连接核对；body/query/32位十六进制ID固定，未知包装不分配或清除挑战记录，实际确认仍只能经认证MCP工具 |
| `/models` | GET / POST | 模型配置读取/更新；addProvider独立仅追加且整表总量≤100。普通更新严格限制包装/模型/multiModel字段与引用，单条模型拒绝未知字段；GET只投影固定且类型有效的模型与五个多模型字段，脱敏Key只绑定原连接身份，改端点须显式给Key，历史未知属性不会进入响应 |
| `/providers/probe`、`/profile/detect` | POST / GET | Provider探测包装只接受baseUrl/apiKey且在触网前校验；探测模型、环境与技术栈 |
| `/customizations` | GET / PUT | 自定义配置；其持久化保证见models说明 |
| `/skills`、`/skills/load` | GET / POST | 目录/分页查询与Skill独占创建均固定query/body字段和类型；未知包装不扫描/读取/写入，成功创建还要求写后核验为verified |

## 执行流程与成功语义
### Bridge
start先校验固定包装、字段类型/长度、提供商与专属凭据组合及工作区绑定；未知字段、错类型、跨提供商Token在保存配置、停止旧隧道或触网前以固定`E_BAD_BRIDGE_REQUEST`拒绝，错误正文不回显输入。历史授权槽位只有严格布尔true才可启动；随后才保存选项，等待旧隧道停止并启动所选提供商。只有取得公网URL后才将running设为true。为兼容UI，部分启动失败仍返回HTTP 200，但 `success:false`、`running:false` 和 `tunnelError` 表明业务失败。新start/stop/logout使旧start的最终响应变为409。

stop/logout等待停止Promise，失败不能当成功；stop只兼容完全空的旧请求或固定绑定字段，logout等无参身份操作只接受空体。没有公网隧道时连接信息指向本机MCP端口，而非浏览器页面Host；这不意味着手机仍能连接本机地址。

### Chat流
进入任何AbortController、响应头或runChat前，路由先要求顶层只含`mode/message/history/modelId/thinkLevel/planAction/client/workspaceRoot/hostInstanceId`。mode仅ask/plan/code，thinkLevel仅low/medium/high，Plan动作仅start/branch/merge/reset且不能挂在其它mode；Ask/Code与Plan start要求非空消息。history最多12条、合计1MiB，每条只含user/assistant角色和≤256KiB字符串content；消息最多1MiB。`vscode-extension`以外客户端不得夹带绑定字段，扩展的真实绑定仍由assertWorkspaceBinding作409语义核对。未知/错类型固定400/E_BAD_API_REQUEST且不回显输入。

校验后请求创建AbortController，5分钟到期、请求中止或响应断开触发abort。外层用requestScope传播信号，扩展客户端另启用PTY上下文。`emit`只向仍打开的响应写入一行JSON，最后清理监听器和计时器。

**done是流处理结束，不是整个任务成功的保证。** runChat可以先发送error再返回，router随后仍发送done。客户端应同时处理error、工具ok状态和done，不能只等到done就显示“全部成功”。

### 直接工具调用
`/tool/call`只接受name/arguments/mode；name为小写工具标识，arguments缺省空对象但存在时必须为对象，mode固定三枚举。`/consensus/run`只接受非空有界taskDescription，`/tasks/reset`只接受空对象。任何未知字段都在事件广播、执行租约和状态重置前400/E_BAD_API_REQUEST。合法tool调用异常返回400；正常返回保留HTTP200，但通过共享isToolFailure判断业务结果并同步外层success与完成事件。显式失败、非零退出、超时、取消、unknown均不包装为成功；running/等待审批只表示已受理，不证明工作完成。MCP复用相同失败判定。

### 文件保存
GET tree拒绝任意query；GET content只接受单个有界path，再经安全路径和有界读取返回content/hash。PUT只接受path/content/expectedHash/createOnly：独占新建必须显式`createOnly:true`且不能混带expectedHash；其余保存必须携当前64位小写hash，不能省略版本后盲目覆盖。createOnly字符串等错类型和未知字段在capture/callTool前400/E_BAD_API_REQUEST。合法旧hash冲突映射为409，其他保存异常为400。preview与undo也先固定包装，undo只有严格confirmed true、hash和完整绑定才可能消费记录。浏览器应保留未保存缓冲区，再读取新磁盘状态，而不是无条件强制覆盖。

### PTY身份
hello、取任务和报告都只接受clientId/workspace身份字段：clientId须为8–80位ASCII字母/数字/下划线/连字符，workspace为非空单行且不超过4096字节；POST还要求空query。未知/缺失/错类型固定400/E_BAD_API_REQUEST，发生在noteClient前，因此不会刷新客户端存活。结构合法但workspace不匹配409。jobId严格为16位小写十六进制；报告顶层只接受身份及state/status/message/stdout/stderr/ok/exitCode/outputCaptured，并按check/claimed/accepted/progress/终态限制字段。progress必须显式给stdout或stderr且每项≤1MiB；终态状态为done/denied/error/timeout/cancelled，可带有界结果，非done状态不能通过矛盾status/ok重标成功。结构通过后才登记身份，路由只把投影后的报告交PTY模块；模块继续核对所有权和状态，终态不能通过迟到accepted复活。真正终端运行在扩展端。

## 边界与验证
requestScope由 `/chat`显式创建，**不代表所有REST请求自动拥有同样的断连取消机制**。`apiRequestBody/apiRequestQuery`已接到上表所述文件/工具/Chat/共识/任务、PTY、external管理及connection-check等端点，但仍不是router全局JSON Schema验证器，也不替代各服务内部参数schema、路径检查、工作区绑定或取消语义。配置写入的保护程度以各models实现为准。

`httpSmoke`、`apiFiles`、`bridgeTunnel`、`auditControl`、`ptyLifecycle`覆盖实际HTTP和模块边界；不是手机OAuth、真实终端或浏览器全部操作的验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [routes.js](routes.js) | 112 个函数/类节点 |
<!-- docs-inventory:end -->

第42组经典停止调用携工作区/主机绑定；有任一字段时完整匹配才递增generation或停隧道，只有完全空体的旧请求兼容，未知字段400且零停启。停隧道失败和停止完成后广播失败可能都500但效果不同，不能从HTTP错误猜测回滚。
