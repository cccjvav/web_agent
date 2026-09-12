# GitHub 身份：令牌验证与设备码逐函数讲解

## 职责与状态

[github.js](github.js) 只实现可选GitHub身份标记，不是MCP OAuth服务器，也不是模型API凭据管理。唯一模块内可变状态pendingDevice保存一次待授权设备码；身份展示写入store.bridge。PAT与获取到的access_token不写入store，本模块没有长期持有已登录token的缓存。

## 1. 基础函数与令牌路径

| 函数 | 参数/返回 | 语义与失败 |
|---|---|---|
| githubClientId() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_ID，缺省空，不联网 |
| githubClientSecret() | 无→trim后的字符串 | 读WEBAGENT_GITHUB_CLIENT_SECRET，内部辅助，不作为前端展示字段 |
| deviceAvailable() | 无→boolean | 仅判断clientId是否非空，不证明App配置/网络有效 |
| fetchGitHubUser(token,fetchFn=fetch) | token/可注入fetch→Promise<{login,id,name}> | GET GitHub /user，Bearer/Accept/User-Agent；读text解析JSON失败退空对象。非2xx抛带HTTP status的Error；成功但无login抛status502；id/name转字符串 |
| applyGithubUser(user) | 用户对象→成功展示对象 | store.patch写provider/githubId/username等身份字段；不写token；存储异常会抛出，不“登录已成功但身份一定落盘” |
| loginWithToken(token,fetchFn=fetch) | 输入token→Promise<展示对象> | String/trim空值抛status400；先fetchGitHubUser验证，再applyGithubUser |
| clearGithubKeepDemo() | 无→undefined | 清pendingDevice，store.patch回local-demo；不是禁用Bridge，也不注销远端GitHub令牌 |
| resetPending() | 无→undefined | 只清内存设备码，通常供测试/状态清理；不改落盘身份 |

fetchGitHubUser直接fetch，没有显式超时/父请求取消；可注入fetchFn用于测试。只验证能读user，不检查所有后续GitHub操作权限。GitHub身份字段落盘可跨重启存在；不能把“token不持久化”误写成“重启后所有用户名都消失”。

## 2. startDeviceLogin(fetchFn=fetch)

async，返回给UI的userCode、verificationUri、verificationUriComplete、interval、expiresIn。无clientId抛E_NO_GITHUB_APP/status400。

POST GitHub device/code，URLSearchParams带client_id/scope=read:user，有secret才加；resp.json解析失败的匿名catch回调返回{}。非成功或缺device_code/user_code抛status400。成功覆盖全局pendingDevice，interval至少5秒，过期默认900秒，保存私密deviceCode和userCode。

返回verificationUri默认官方设备授权页，不将deviceCode作为前端字段。这里不自动打开浏览器、不启动后台轮询；新一次start会替换旧pending，全局没有按客户端分槽。

## 3. pollDeviceLogin(fetchFn=fetch)

无pending返回 `{pending:false,done:false,error}`；超时清pending并返回过期错误。否则构造client_id/device_code/设备码grant_type，可选secret，POST access_token。

JSON失败仍以catch回调退{}。authorization_pending或slow_down返回pending=true、done=false、userCode；**这里没有按slow_down增大间隔，也没有服务端轮询频率闸门**，interval只是start返回的建议，由调用方调度。

没有access_token：清pending，返回done=false及错误。拿到token：先清pending，再fetchGitHubUser，成功applyGithubUser并返回done=true。用户查询/落盘失败时设备码已经清空，异常向外传播；不会恢复此前pending。

另一个重要边界：此函数未单独以resp.ok作为所有分支的前置条件，主要按返回JSON字段判断。await期间若另一个请求替换/清空pending，后续读取pendingDevice.userCode或清空动作也没有原请求代次保护。不能套用Chat Plan的旧回合保护来宣称设备登录并发也已隔离。

## 4. 验证与复盘

```bat
npm test --prefix webagent-core/agent-host -- --filter=githubAuth
```

测试使用假fetch检查token/user、设备码请求和缺clientId，不是真实GitHub App兼容性或多客户端竞态全覆盖。实际用户授权按人工清单B7，不收集或上传你的PAT。复盘时分别圈出：敏感token在哪里使用、哪些身份字段写磁盘、pending何时失效；不要与MCP OAuth的会话/refresh token混为一谈。
