# GitHub 身份：令牌验证与设备码逐函数讲解

## 职责与状态

[github.js](github.js)只实现可选GitHub身份标记，不是MCP OAuth服务器或模型凭据管理。pendingDevice保存一次模块级设备码尝试，identityGeneration使旧结果失效；展示身份写入store.bridge，PAT/access_token不落盘。该流程与开发沙箱的GitHub仓库连接不是同一套认证。

## 1. 基础函数与网络边界

| 函数 | 输入/输出 | 语义与失败 |
|---|---|---|
| supersedeIdentityAttempt() | 无→新代次 | 递增generation、清pending；使旧成功结果失效，不直接中止其它HTTP连接 |
| supersededResult() / supersededError() | 无→对象/Error | 轮询返回pending=false/done=false/E_SUPERSEDED；启动/令牌迟到成功结果抛409/E_SUPERSEDED |
| githubClientId() / githubClientSecret() | 无→trim后的环境值 | WEBAGENT_GITHUB_CLIENT_ID/SECRET，不返回secret给前端 |
| deviceAvailable() | 无→布尔 | 只判断client ID存在，不证明App或网络可用 |
| githubResponseError() | 无→Error | 固定502/E_GITHUB_RESPONSE，不反射远端正文 |
| githubText(value,maxBytes,optional=false) | 值→布尔 | 有界UTF-8字符串、无ASCII控制字符；非optional还须trim后非空，不是全部GitHub字段schema |
| deviceUri(value,fallback,userCode) | 值→规范URL | 缺省/空用fallback；否则≤2048字节，仅https://github.com/login/device，无凭据/hash，query仅可有一项匹配当前码的user_code。拒绝脚本协议、其它站点及混入参数 |
| githubRequest(url,options,fetchFn) | 请求→Promise<{response,data}> | 三条身份请求共用fetchText；每次头/体合计10秒、响应64KiB、redirect:error、继承父取消。成功响应必须为对象JSON，非成功正文无需信任/反射 |

网络错误归一：E_TIMEOUT/504、E_RESPONSE_TOO_LARGE/502、E_GITHUB_NETWORK/502；在途父取消E_CANCELLED/499。入口checkCancelled的预先取消可能由REST默认400处理，断开的响应通常不再发送。HTTP拒绝另以E_GITHUB_HTTP保留状态码；不回显error_description、token或原始响应。64KiB是解码前body字节预算，不是进程总内存上限。

requestScope在响应头、正文和异常处核对单调时钟，因此计时器延迟不意味着迟到结果可接受。原生Node fetch支持AbortSignal；不声称能终止不合作的自定义fetch或撤回GitHub已经处理的设备授权/令牌签发。一次成功poll可能串行两次HTTP请求，各自10秒，不是整个poll只有10秒的总期限。

## 2. 用户验证与身份发布

**fetchGitHubUser(token,fetchFn=fetch)**向固定GitHub /user发送Bearer、Accept和User-Agent，调用githubRequest。非2xx抛HTTP错误；login须非空有界字符串，name为有界字符串或缺省回login，id为有界字符串或非负安全整数。返回规范login/id/name；不将对象强制转换成用户名。

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
