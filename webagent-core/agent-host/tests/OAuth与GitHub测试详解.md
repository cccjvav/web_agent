# OAuth令牌轮换、客户端认证与GitHub登录fixture

令牌和用户均为测试数据。OAuth是在本机测试服务上真跑协议；GitHub响应是注入的替身，未请求真实账号。

## oauth.test.js

[源码](oauth.test.js)的**request(server,method,urlPath,{body,headers,json=true})**同时支持字符串/对象、JSON/表单Content-Type和字节长度；data收Buffer，end解析（非JSON保留raw、json:null），error reject。**main**在tmp搭Express JSON/urlencoded、oauth.router、MCP，随机本机端口。

| 顺序与fixture | 断言 |
|---|---|
| discovery两端点 | authorization URL/S256/resource末尾mcp；源字符串需timingSafeEqual不得直接=== secret，package Node≥18 |
| 无凭证canonical MCP | 401和resource_metadata challenge |
| verifyAccessToken | 当前secret认kind:secret，增减字符与空值拒 |
| URL secret initialize、POST Accept SSE ping | instructions正确、HTTP200、text/event-stream与message事件 |
| 随机verifier/s256、registerClient、issuePairing、completeAuthorize | redirect state回传，产生code |
| handleToken换access/refresh，再refresh | scat_/scrt_前缀，refresh变更、旧access失效、新access有效 |
| 重放旧refresh | 报replay且新access也撤销，即整族撤销 |
| 重新配对授权取token | 独立新族可供后续Bearer访问；不存在code+wrong verifier应抛 |
| Bearer canonical workspace_info | 200且非工具错误、正文有root信息 |
| initialize返回session ID，复用/未知/DELETE/删除后复用 | 原id保持，未知404，删除204，再用404 |
| GET SSE | data回调等endpoint事件再destroy请求，核对200及data路径；3秒请求超时reject，预期ECONNRESET忽略 |
| 连续21次HTTP register | 最后429，验证IP速率限制 |
| revokeAll再Bearer ping | 401 |

“pkceFailed”变量对应的是**不存在授权码同时错误verifier**，不足以单独证明有效code下错误PKCE分支；timingSafeEqual检查也不是计时侧信道实测。finally关闭server/删tmp；异常catch exit1。授权直接调用函数，未点击真实授权HTML页面；内存重启失效是设计约束而非此fixture持久化测试。

## oauthClientAuth.test.js

[源码](oauthClientAuth.test.js)异步IIFE开头revokeAll，本机Express装JSON/OAuth；固定长verifier用于测试。**basic(client)**将id:secret编码Basic header。unknown auth_method注册必须unsupported。

循环none/client_secret_post/client_secret_basic：注册client、issuePairing、S256 completeAuthorize取code；局部**post(payload,authorization)**用真fetch JSON提交token端点。机密客户端缺secret→401 invalid_client，错误secret→401；Basic与body secret同时提交也401。之后用正确认证换码仍200，证明前述错误凭证没有消耗授权码，verifyAccessToken有效。

refresh同样检查机密客户端缺认证401，再正确认证200，旧access失效。public none无需客户端secret，但仍走PKCE。finally关server/revokeAll，catch exitCode1。没有测试TLS或第三方连接器实际兼容性，也不证明穷举所有畸形Basic header。

## githubAuth.test.js

[源码](githubAuth.test.js)导入前设临时WORKSPACE_ROOT。**jsonResp(status,body)**给ok/status和异步**text()/json()**两种响应接口。异步**run**resetPending/store，patch本机demo初态；空白token必须status400。

**fakeFetch(url,opts)**只接受/user，断言Bearer ghp_前缀，返回octocat/id1；loginWithToken结果与store应github身份、loggedIn真。clearGithubKeepDemo应恢复local-demo/local/空githubId。

删除WEBAGENT_GITHUB_CLIENT_ID后deviceAvailable false，startDeviceLogin E_NO_GITHUB_APP。设测试Client ID后真；**deviceFetch**按URL分支：device/code断言表单client_id并回code/user_code/900秒/5秒；access_token断言设备grant type编码并回authorization_pending。start返回ABCD-1234，poll返回pending。

**doneFetch**对token端点回假access token、/user回hubber/id99，其余URLthrow，下一poll应done/hubber并保存99。成功resetPending/clear demo/删env/reset store/rm tmp；catch exit1，无finally，原env没有恢复，依赖子进程隔离。未测真实等待间隔、GitHub限流/拒绝/过期全部分支，不声称账号已授权。

## 验证

分别filter oauth/oauthClientAuth/githubAuth或完整`npm test --prefix webagent-core/agent-host`。实际用户配对与手机Arena连接仍需按Windows验收清单执行。
