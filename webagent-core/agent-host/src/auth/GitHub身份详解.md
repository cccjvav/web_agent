# GitHub 身份：令牌验证与设备码逐函数讲解

## 职责与状态

[github.js](github.js)只实现可选GitHub身份标记，不是MCP OAuth服务器或模型凭据管理。pendingDevice保存一次模块级设备码尝试，identityGeneration使旧结果失效；展示身份写入store.bridge，PAT/access_token不落盘。该流程与开发沙箱的GitHub仓库连接不是同一套认证。

## 1. 基础函数与网络边界

| 函数 | 输入/输出 | 语义与失败 |
|---|---|---|
| supersedeIdentityAttempt() | 无→新代次 | identityGeneration递增并清pendingDevice；令牌、设备码、清除和演示身份用它淘汰旧异步结果 |
| supersededResult() | 无→设备轮询终止对象 | 返回E_SUPERSEDED，不把迟到旧结果表述成登录成功 |
| supersededError() | 无→Error | 给设备启动/令牌验证的迟到结果生成status409、code=E_SUPERSEDED |
| githubClientId() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_ID，缺省空，不联网 |
| githubClientSecret() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_SECRET，内部辅助，不作为前端展示字段 |
| deviceAvailable() | 无→boolean | 仅判断clientId是否非空，不证明App配置/网络有效 |
| GITHUB_TIMEOUT_MS / GITHUB_MAX_BYTES | 常量 | 每次外发请求的挂钟上限（默认15000毫秒，`WEBAGENT_GITHUB_TIMEOUT_MS`可覆盖）与响应正文字节上限（1MiB）。限制单次请求，不是整个登录流程的总时长 |
| githubJson(fetchFn,url,init) | 传输/地址/init→Promise<{response,data}> | 内部辅助。把fetchFn作为传输交给`utils/requestScope`的fetchText，于是自动获得超时、父请求取消与字节预算；正文解析失败退空对象，**原始正文不外传**，HTML错误页不会经由错误消息泄漏 |
| fetchGitHubUser(token,fetchFn=fetch) | token/可注入fetch→Promise<{login,id,name}> | 经githubJson GET GitHub /user，Bearer/Accept/User-Agent。非2xx抛带HTTP status的Error；成功但无login抛status502；id/name转字符串 |
| applyGithubUser(user) | 用户对象→成功展示对象 | store.patch写provider/githubId/username等身份字段；不写token；存储异常会抛出，不“登录已成功但身份一定落盘” |
| loginWithToken(token,fetchFn=fetch) | 输入token→Promise<展示对象> | String/trim空值抛status400；先开启新身份代次，再fetchGitHubUser；返回后仍是当前代次才applyGithubUser，否则抛E_SUPERSEDED |
| clearGithubKeepDemo() | 无→undefined | 淘汰所有旧身份请求并store.patch回local-demo；不是禁用Bridge，也不注销远端GitHub令牌 |
| resetPending() | 无→undefined | 递增代次并清内存设备码，通常供测试/状态清理；不改落盘身份 |

本模块的三个外发请求（/user、device/code、access_token）**全部**经githubJson走fetchText，因此都有超时、父信号取消和1MiB正文上限；可注入fetchFn仍然有效，它只是被当作传输层，预算照样生效。以前是裸fetch：连接被黑洞吞掉时登录会永久挂着，设备码轮询也一样，用户只能看到一个永不结束的转圈。超时表现为`AbortError`，由调用方决定如何呈现；模块自身**不重试**。这只保证单次请求会结束，不保证GitHub可达、也不校验后续GitHub操作权限。GitHub身份字段落盘可跨重启存在；不能把“token不持久化”误写成“重启后所有用户名都消失”。

requestScope在响应头、正文和异常处核对单调时钟，因此计时器延迟不意味着迟到结果可接受。原生Node fetch支持AbortSignal；不声称能终止不合作的自定义fetch或撤回GitHub已经处理的设备授权/令牌签发。一次成功poll可能串行两次HTTP请求，各自10秒，不是整个poll只有10秒的总期限。

## 2. 用户验证与身份发布

先用supersedeIdentityAttempt开启新代次，再经githubJson POST GitHub device/code（带超时与字节预算）；URLSearchParams带client_id/scope=read:user，有secret才加；正文解析失败退{}。响应回来时若已有更新身份操作则抛E_SUPERSEDED；HTTP失败沿用实际status，2xx但缺device_code/user_code按400拒绝。成功覆盖全局pendingDevice，记录generation和polling=false；interval至少5秒，过期默认900秒，保存私密deviceCode和userCode。

**githubRequest(url,options,fetchFn)**是全部身份出站的唯一入口：走`fetchText`并固定`redirect:'error'`、10秒期限、64KiB响应上限。**不跟随重定向是凭据边界**——这些请求在Authorization头里带着GitHub令牌，跟随重定向会把令牌重放给重定向指向的任意主机。失败经**githubResponseError()**归类为`E_CANCELLED`(499)／`E_TIMEOUT`(504)／`E_RESPONSE_TOO_LARGE`／`E_GITHUB_NETWORK`(502)，消息是本机固定文案，**不反射上游正文**，避免把上游的HTML错误页或提示原样回显给调用方。

**githubText(value,maxBytes,optional)**校验从上游取回的字段：必须是字符串且UTF-8不超过给定字节数，可选字段允许缺省。上游返回的形状不被信任——缺字段或超长一律拒绝，而不是截断后当作有效身份。

**applyGithubUser(user)**同步store.patch写provider、username、githubId、loggedIn/deviceAuthorized/license，再返回成功展示；不存token。存储失败仍抛，不声称远端验证成功等于本机必然保存。

**loginWithToken(token,fetchFn=fetch)**先checkCancelled；再String/trim，空值400。只有未取消请求才新建身份代次，查询用户，返回时仍为当前代次才applyGithubUser。这样预先取消不会先清掉健康设备流。

**clearGithubKeepDemo()**递增代次/清pending，明确写回local-demo；不是停Bridge，也不注销GitHub远端token。**resetPending()**只递增代次和清内存设备码，不改落盘身份。身份字段可跨重启保存，不能由token不持久化推导出用户名也不保存。

## 3. startDeviceLogin(fetchFn=fetch)

先checkCancelled；无client ID则E_NO_GITHUB_APP/400。开启新代次，再POST device/code，URLSearchParams包含client_id/read:user及可选secret。HTTP读取/预算/解析经githubRequest，返回后校验代次；失败不反射服务端错误正文。

发布pending之前完整校验：device_code≤4096、user_code≤128字节；interval缺省5，须1–60整数，实际至少5；expires_in缺省900，须1–86400整数；两种授权URL经过deviceUri。非法字段不发布新pending。保存generation、deviceCode、userCode、interval、expiresAt、polling=false，只返回UI需要的码/地址/间隔/期限，不暴露deviceCode。

这里不自动打开浏览器或后台轮询；新尝试替换旧pending，不支持多窗口独立持久登录。

## 4. pollDeviceLogin(fetchFn=fetch)

先checkCancelled，不让预先取消请求短暂占用polling或清理另一流程。无pending或已过期返回非完成对象；局部current()比较pending对象与generation。相同尝试若正在polling则立即pending，不发送第二个请求；首次置真并在finally恢复。

POST access_token后核对current与HTTP状态；authorization_pending保留，slow_down将建议间隔加5、最多60。这里不强制每个调用者遵守建议间隔，也不是GitHub限流证明。缺token则淘汰尝试并给固定非完成错误；有token还须为≤4096字节非空字符串，然后fetchGitHubUser。再次通过current才清pending并发布身份。

清除/新登录后的迟到可用成功结果被E_SUPERSEDED屏障拒绝；发生在屏障前的网络/解析失败仍可能抛对应错误，但不写身份。取消、超时、失败都不自动重试或换身份；不会撤回已完成的远端效果。

## 5. HTTP接线与验证

本机API的token/device/device-poll由identityRequest创建请求专属AbortController：req.aborted或未完成响应的close取消，finally移除监听，已destroyed响应不再json。它不是Chat五分钟scope。直接模块调用只有进入runWithSignal才有父取消，但每次HTTP仍有自身10秒期限。

```bat
npm test -- --filter=githubAuth
npm test -- --filter=githubNetwork
```

原githubAuth保留身份generation、clear/new attempt、重复poll/slow_down相关约定；githubNetwork用假凭据和真实回环HTTP测试头/体停滞、64KiB、重定向、预先取消零触网/不清旧pending、非法形状/URL/期限，以及三个真实REST断开接线；受控时钟检验迟到完成。没有登录真实GitHub、收集用户PAT或认证所有App/多窗口兼容性；具体测试与夹具边界见[OAuth与GitHub测试](../../tests/OAuth与GitHub测试详解.md)。
