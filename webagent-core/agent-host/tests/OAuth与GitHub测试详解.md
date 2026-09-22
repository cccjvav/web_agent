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

[源码](oauthClientAuth.test.js)异步IIFE开头revokeAll，创建临时工作区并配置两个0端口，require真实index启动UI/MCP，等待两server监听；不再用重新拼装的Express夹具代替生产中间件顺序。固定长verifier用于测试。**basic(client)**将id:secret编码Basic header。unknown auth_method注册必须unsupported。

循环none/client_secret_post/client_secret_basic：注册client、issuePairing、S256 completeAuthorize取code；局部**post(payload,authorization)**用真fetch JSON提交token端点。机密客户端缺secret→401 invalid_client，错误secret→401；Basic与body secret同时提交也401。之后用正确认证换码仍200，证明前述错误凭证没有消耗授权码，verifyAccessToken有效。

refresh同样检查机密客户端缺认证401，再正确认证200，旧access失效。public none无需客户端secret，但仍走PKCE。finally停tracker、关闭两server、revokeAll并删除临时工作区，catch exitCode1。没有测试TLS或第三方连接器实际兼容性，也不证明穷举所有畸形Basic header。

新增回归：三种认证方式均验证有效授权码配错误类型/长度verifier为400，之后正确兑换仍成功；跨客户端提交spent refresh不会撤销持有者，同客户端重放仍撤销。填满80注册项后错误注册不得撤销最老有效token，有效新注册返回503；临时替换Date.now推进6分钟证明可回收空闲注册但保留活跃token，finally恢复时钟。危险scheme/非回环HTTP/凭据/fragment/空白/过长URI、过多回调和过长名字均拒绝；HTTPS、IPv4/IPv6回环允许。无效授权challenge/method/response_type/redirect/state不消耗配对码；成功后公开GET只显示页面不续发码，未知client返回400。origin测试临时替换config.publicTunnelUrl并finally恢复，验证伪造Host/转发头不能改变issuer、可信配置优先以及挑战头不接受注入字段。

第39组新增：每种认证方式刷新后，**ping(token)**向生产/mcp发送只读协议ping确认200；**revoke(payload,auth)**请求真实撤销端点。其他已登记客户端刷新他人refresh为400且不消耗；撤销他人token返回200但原token仍有效；机密客户端缺认证401并保留令牌。已认证未知token为200且不影响现有token，匹配归属时分别覆盖access/refresh作为撤销目标，删除整对后MCP为401、再刷新为400。OAuth revoke传入主机长期密钥不会轮换该密钥；不把200 revoked:true当成目标一定存在或已删除的证明。

**metadataRequest(server,route,headers,body)**使用node:http发送真实Host，默认GET、有body则POST；收集正文并解析JSON，解析/请求/响应错误均reject，3秒socket无活动destroy（不是全程期限）。发现测试最初用fetch发送自定义Host，实际回包是连接端口origin而非期望回退值；这是夹具头被改写，不是产品漏洞，改node:http后保留原边界断言通过。三条well-known和畸形JSON的/mcp早期401共同核对：恶意Host/转发头不选issuer，合法配置origin优先、无配置/坏配置回固定本机，合法本机Host保留且不信X-Forwarded-Proto。finally恢复publicTunnelUrl。

真实form授权负例：错误redirect返回400、无Location、配对码仍可用，HTML中的state转义且不回显配对码。正确POST以redirect:manual接收302，只检查callback origin/path/state/code，不访问外站。随后**exchange()**用urlencoded换码200，再兑换同code为400且不撤销原access。没有浏览器点击、TLS、第三方认证或全面会话身份隔离证明；本轮产品认证实现未改。

## githubAuth.test.js

[源码](githubAuth.test.js)导入前设临时WORKSPACE_ROOT。**jsonResp(status,body)**给ok/status和异步**text()/json()**两种响应接口。异步**run**resetPending/store，patch本机demo初态；空白token必须status400。

**fakeFetch(url,opts)**只接受/user，断言Bearer ghp_前缀，返回octocat/id1；loginWithToken结果与store应github身份、loggedIn真。clearGithubKeepDemo应恢复local-demo/local/空githubId。

删除WEBAGENT_GITHUB_CLIENT_ID后deviceAvailable false，startDeviceLogin E_NO_GITHUB_APP。设测试Client ID后真；**deviceFetch**按URL分支：device/code断言表单client_id并回code/user_code/900秒/5秒；access_token断言设备grant type编码并回authorization_pending。start返回ABCD-1234，poll返回pending。

**doneFetch**对token端点回假access token、/user回hubber/id99，其余URLthrow，下一poll应done/hubber并保存99。局部**startAttempt(deviceCode)**用不同假device_code快速创建后续并发夹具：旧poll已拿token、等待/user时执行clear，迟到用户不得覆盖local-demo；旧poll等待token时启动新设备码，旧token不得继续查用户，新poll必须携新device_code；同一attempt首个poll挂起时第二个poll直接pending，GitHub token请求计数仍为1。三组均检查E_SUPERSEDED或当前请求内容，而不是只看最终文案。

成功resetPending/clear demo/删env/reset store/rm tmp；catch exit1，无finally，原env没有恢复，依赖子进程隔离。未测真实等待间隔、真实GitHub限流/拒绝/过期全部分支、跨进程共享或浏览器多窗口，不声称账号已授权。

## 验证

分别filter oauth/oauthClientAuth/githubAuth或完整`npm test --prefix webagent-core/agent-host`。实际用户配对与手机Arena连接仍需按Windows验收清单执行。

跨客户端配对回归：第二个注册者连续六次错误输入，只消耗自己的尝试预算，快照code保持不变；合法注册者仍可用原码完成配对。未测大规模流量DoS。


## oauthRateLimit.test.js

**main**以createRequire加载真实oauth源码到VM，仅把Date.now替换成可控clock；追加fixture访问器只存在测试VM，不从产品导出内部状态。clientIp检查不直接信任X-Forwarded-For；重复500次拒绝后n与expiresAt不变，恰好过期时恢复。1000个key后新key拒绝但旧key剩余额度可用，窗口到期释放容量。固定LCG seed生成2000个跨7个客户端/时间推进事件，对照独立model的count/until，不引入随机网络不稳定。

真实Express挂载该VM的router，**post**发HTTP并每次消耗响应体；注册两个别名共用预算、伪造头不能分裂来源，授权HTML错误与JSON错误都有Retry-After。时钟前进60秒恢复为正常校验400而非429。finally关闭本测试server；不联网第三方、不验证实际代理用户隔离。验证不等同通用性质/变异测试门禁。

## networkBudget.test.js

F62第2批新增。全程不发真实网络请求：所有传输都是进程内替身，磁盘只用自建临时工作区。

夹具helper：**jsonResp**造带`text()`/`json()`的响应替身；**blackHole**是"连上了但永远不回话"的传输，它先断言请求确实带了`signal`（裸fetch不会有），再只在signal中止时才reject——所以只有客户端自己的deadline能结束它；**deviceFetch**给设备码启动返回一个正常响应；**rejects**把预期的拒绝转成可断言的错误对象；**run**串起全部断言。

文件末尾故意留了一个referenced的`setInterval`保活句柄。这不是凑数：`fetchText`把deadline计时器`unref`了（正确行为，宿主关闭时不该被它拖住），生产里有HTTP服务器撑着事件循环，而在这个测试进程里没有别的东西撑着——少了保活句柄，Node会在黑洞请求还在飞的时候直接以0退出，剩下的断言一条都不会跑，测试看起来"通过"其实是空转。

覆盖的合同：

- `fetchText`接受`options.fetchImpl`指定传输，注入传输**照样**受超时约束；注入不是绕过预算的后门。
- `loginWithToken`、`startDeviceLogin`、`fetchGitHubUser`、`pollDeviceLogin`打到黑洞端点时都必须在各自deadline附近以`AbortError`结束，而不是永远挂着；并且每次调用**只发一个请求**，模块自身不重试。基线是裸fetch，这些调用会一直挂到进程退出。
- 正常响应仍照旧成功；超过1MiB的响应正文抛`E_RESPONSE_TOO_LARGE`。
- 遥测上报超时返回`{ok:false}`而不是抛出——它跑在debounce与周期定时器里，故障不能冒泡出回调；成功路径仍记录`lastReportAt`。
- readCache：同一文件重复记录同一hash只落盘一次（基线是400次读写400次整表）；删除不存在的key不落盘；真正变化仍立即落盘；落盘走临时文件+rename且不留残留。重载后取值、最近使用顺序与旧行为一致。

它证明的是**单次请求一定会结束**，不证明GitHub或遥测端点可达、上报送达、或者不存在在途请求重叠（周期与debounce仍可重叠，这一点没有改变）。
