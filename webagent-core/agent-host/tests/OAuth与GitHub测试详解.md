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


## F64：githubNetwork.test.js的独立网络与REST负例

[githubNetwork.test.js](githubNetwork.test.js)的run()建立临时工作区、假App/凭据和真实回环http.Server；fetchProxy只把固定GitHub路径重定向到该自建服务，保留产品method/headers/signal/redirect。不访问GitHub，不读取用户账号。check(name,fn)收集失败；resetServer()在每例后关本测试socket/重开随机端口，避免未消费连接池跨例复用；最后清目录/恢复依赖。bounded(promise,ms)是1.5秒测试看门狗，超时即失败，不冒充产品超时。

注入的scope.fetchText先断言产品确实传入10000ms/65536字节/redirect:error，仅期限场景把测试调用预算缩至500ms；生产值未放宽。正文期限场景必须实际收到头；正文取消在body锁定读取后发生。预先取消不得触网或清健康pending；正常设备流仍可完成，旧githubAuth的generation/clear/poll单飞保留。

真实HTTP另覆盖三端点的流式预算、拒跳转；Response夹具覆盖非对象JSON/错误字段、远端error_description不反射、非法授权URL/期限及非Error拒绝。WHATWG ReadableStream的start()/cancel()模拟清理Promise永不settle，必须及时得到预算错误；它不是声称远端已攻破Node的原生cancel。

VM仅替换共享读取模块的单调时钟/计时器：timer不触发、正文完成或socket错误发生在expires之后，均必须E_TIMEOUT。REST用真实Express/router，将三个身份动作临时替为等待scope的函数；真实client.destroy必须触发其AbortSignal，finally还原。这个场景验证接线，不代签主机所有Origin/权限或真实GitHub授权。

初版夹具关闭共用端口的池连接导致合法流程UND_ERR_SOCKET，先改每例新端口而非放宽产品网络错误；失败历史见阶段10。验证：`npm test -- --filter=githubNetwork`，再跑githubAuth、modelLifecycle、resourceBudget、requestLifecycle、bridgeTunnel和完整累计测试。

夹具中的entered()通知服务端请求到达，received()通知客户端取得响应头；每例恢复为空通知，避免复用前例Promise。VM假timer的unref()为空接口实现，clearTimeout不执行实际定时；只为了验证逻辑expires不能依赖timer先运行。
