# GitHub 身份：令牌验证与设备码逐函数讲解

## 职责与状态

[github.js](github.js) 只实现可选GitHub身份标记，不是MCP OAuth服务器，也不是模型API凭据管理。模块内的pendingDevice保存一次待授权设备码，identityGeneration给所有身份变更排序；身份展示写入store.bridge。PAT与获取到的access_token不写入store，本模块没有长期持有已登录token的缓存。

## 1. 基础函数与令牌路径

| 函数 | 参数/返回 | 语义与失败 |
|---|---|---|
| supersedeIdentityAttempt() | 无→新代次 | identityGeneration递增并清pendingDevice；令牌、设备码、清除和演示身份用它淘汰旧异步结果 |
| supersededResult() | 无→设备轮询终止对象 | 返回E_SUPERSEDED，不把迟到旧结果表述成登录成功 |
| supersededError() | 无→Error | 给设备启动/令牌验证的迟到结果生成status409、code=E_SUPERSEDED |
| githubClientId() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_ID，缺省空，不联网 |
| githubClientSecret() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_SECRET，内部辅助，不作为前端展示字段 |
| deviceAvailable() | 无→boolean | 仅判断clientId是否非空，不证明App配置/网络有效 |
| fetchGitHubUser(token,fetchFn=fetch) | token/可注入fetch→Promise<{login,id,name}> | GET GitHub /user，Bearer/Accept/User-Agent；读text解析JSON失败退空对象。非2xx抛带HTTP status的Error；成功但无login抛status502；id/name转字符串 |
| applyGithubUser(user) | 用户对象→成功展示对象 | store.patch写provider/githubId/username等身份字段；不写token；存储异常会抛出，不“登录已成功但身份一定落盘” |
| loginWithToken(token,fetchFn=fetch) | 输入token→Promise<展示对象> | String/trim空值抛status400；先开启新身份代次，再fetchGitHubUser；返回后仍是当前代次才applyGithubUser，否则抛E_SUPERSEDED |
| clearGithubKeepDemo() | 无→undefined | 淘汰所有旧身份请求并store.patch回local-demo；不是禁用Bridge，也不注销远端GitHub令牌 |
| resetPending() | 无→undefined | 递增代次并清内存设备码，通常供测试/状态清理；不改落盘身份 |

fetchGitHubUser直接fetch，没有显式超时/父请求取消；可注入fetchFn用于测试。只验证能读user，不检查所有后续GitHub操作权限。GitHub身份字段落盘可跨重启存在；不能把“token不持久化”误写成“重启后所有用户名都消失”。

## 2. startDeviceLogin(fetchFn=fetch)

async，返回给UI的userCode、verificationUri、verificationUriComplete、interval、expiresIn。无clientId抛E_NO_GITHUB_APP/status400。

先用supersedeIdentityAttempt开启新代次，再POST GitHub device/code；URLSearchParams带client_id/scope=read:user，有secret才加；resp.json解析失败的匿名catch回调返回{}。响应回来时若已有更新身份操作则抛E_SUPERSEDED；HTTP失败沿用实际status，2xx但缺device_code/user_code按400拒绝。成功覆盖全局pendingDevice，记录generation和polling=false；interval至少5秒，过期默认900秒，保存私密deviceCode和userCode。

返回verificationUri默认官方设备授权页，不将deviceCode作为前端字段。这里不自动打开浏览器、不启动后台轮询；新一次start会替换旧pending，全局没有按客户端分槽。

## 3. pollDeviceLogin(fetchFn=fetch)

无pending返回 `{pending:false,done:false,error}`；超时且仍是当前尝试时淘汰该代次并返回过期错误。局部**current()**同时比较pending对象与generation，作为每次await后的发布屏障。若attempt.polling已真，重复调用直接返回pending而不发第二个GitHub请求；否则置真并在finally复原。

随后构造client_id/device_code/设备码grant_type，可选secret，POST access_token。JSON失败退{}；先检查current，再要求HTTP 2xx。authorization_pending返回pending；slow_down还把服务端保存的interval增加5秒、最高60秒，并把interval回给调用方。此单飞和建议间隔只约束当前Node模块，不是GitHub端限流证明或跨进程锁。

没有access_token时淘汰当前尝试并返回done=false及错误。拿到token后fetchGitHubUser，再次通过current才清pending、applyGithubUser并返回done=true。清除、演示登录、新设备码或PAT验证发生在任一网络等待期间，旧请求都返回E_SUPERSEDED且不能写身份；用户查询/落盘本身失败仍向外传播，不自动重试。

## 4. 验证与复盘

```bat
npm test --prefix webagent-core/agent-host -- --filter=githubAuth
```

测试使用假fetch检查token/user、设备码请求、缺clientId、清除/新尝试淘汰旧结果，以及同尝试重叠poll只发一次请求；不是真实GitHub App兼容性、跨进程或大规模多客户端竞态证明。实际用户授权按人工清单B7，不收集或上传你的PAT。复盘时分别圈出：敏感token在哪里使用、哪些身份字段写磁盘、pending何时失效；不要与MCP OAuth的会话/refresh token混为一谈。
