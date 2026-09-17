# OAuth 配对与令牌：逐函数、路由和状态顺序

## 职责、状态与总流程

[oauth.js](oauth.js) 是MCP的内存授权服务，独立于GitHub身份和模型API Key。导入建立router、clients/authCodes/accessTokens/refreshTokens/spentRefresh五张Map、pairing以及限流Map；不自动持久化。

```text
发现metadata → registerClient → 本机取得配对码
 → 授权页面completeAuthorize（精确redirect + S256类型 + 配对）
 → 授权码 → handleToken（客户端认证 + redirect + verifier）
 → access/refresh → MCP Bearer验证
 → refresh旋转；旧refresh重放可撤销该客户端令牌
```

当前TTL：配对5分钟、授权码5分钟、access1小时、refresh7天。重启全部内存授权丢失，重新注册/配对；长期URL secret来自另一份运行配置。

## 1. 时间、随机数与地址函数

| 函数 | 参数/返回 | 边界 |
|---|---|---|
| now() | 无→毫秒数 | Date.now包装，方便统一时间读取，不是独立单调时钟 |
| randomToken(prefix,bytes=24) | 前缀/字节数→hex token | crypto.randomBytes，不读磁盘 |
| randomPairingCode() | 无→8字符 | 随机8字节，map到去掉易混字符的字母数字表；不是从时间戳生成 |
| safeOrigin(value) | 字符串→规范origin或null | 拒绝非字符串、空白和反斜杠；URL解析后仅HTTP(S)、无凭据、pathname为/且无查询/fragment，允许根路径尾斜杠与URL规范化；不是DNS信任校验 |
| requestOrigin(req) | 请求→origin字符串 | 有效config.publicTunnelUrl优先；否则仅本机Host（localhost/127.0.0.1/[::1]），最后固定本机config.port。不直接读取转发Host/proto；协议取req.protocol，当前入口未启trust proxy。远端须由本机控制面设置公网origin，修改代理信任策略须重验 |
| s256(verifier) | 字符串/Buffer→base64url摘要 | SHA-256；不在此检查verifier长度/字符集 |
| timingSafeEqualString(a,b) | 两值→boolean | String转UTF8 Buffer，长度不同false，相等长度用crypto.timingSafeEqual；不把任意长度比较说成全流程常时 |

## 2. 配对生命周期：四个函数

**issuePairing()**覆盖全局pairing，写新code、createdAt、expiresAt、attempts为空Map，返回snapshotPairing。不会保留多个客户端各自的码。

**snapshotPairing()**无值或expiresAt严格小于now时返回code:null、expired:true；否则返回实际code和四舍五入的剩余秒数，expired:false。它不主动删除过期对象；实际code只能通过本机控制面适当展示，不可公开日志。

**ensurePairing()**若快照过期/无码则issue，否则返回当前快照。

**consumePairing(code,clientId=direct)**过期/无值抛400；以已验证的注册clientId计数，超过5只拒绝该client（429），不清除全局pairing；错误400，正确清pairing、返回true。直接模块调用缺省direct用于内部兼容；公开路由必须先验证client再传ID。每个客户端第6次仍超限，其他客户端不会被它换码/作废；成功一次即废。

## 3. 元数据与认证挑战

- **authorizationServerMetadata(origin)**返回issuer及authorize/token/register/revoke端点，声明code/refresh、S256、none/post/basic三种认证方式和scope。
- **protectedResourceMetadata(origin)**给resource=`origin/mcp`、授权服务器及header bearer方式。
- **wwwAuthenticate(origin)**先safeOrigin排除非法输入（失败回本机），再构造Bearer挑战，指向protected-resource元数据。

这些函数不验证客户端；origin语法/来源限制不等于验证域名归属。metadata包含openid scope，但本文件没有签发ID token/UserInfo完整OIDC流程；不能因此称为完整OpenID Connect提供者。

## 4. 注册与清理函数

### pruneExpiredTokens()

分别在各自截止严格小于now时删除access/refresh，spentRefresh按记录时间超过7天删，authCodes按exp删；调用触发的清理，不是定时器。清一个access不自动清仍有效的refresh。

### revokeClientTokens(clientId)

遍历access/refresh，匹配clientId就删；不删除clients注册、不清authCodes或所有spent记录。用于refresh重放处理；容量淘汰不再撤销有效令牌。

### pruneClients()

先pruneExpiredTokens；注册表不足80直接返回。满时遍历授权码/access/refresh建立protectedIds；只移除注册超过5分钟且无上述有效记录的客户端，腾出一位即返回；没有可移除项抛503 temporarily_unavailable。不会为新注册踢掉活跃/正在授权客户端。未配对注册仍能占满短期容量，这是有界拒绝服务风险，不宣称消灭注册滥用。

### registerClient(body={})

认证方式缺省none，只允许none/client_secret_post/client_secret_basic。redirect_uris必须1–16项；逐项调用validateRedirectUri。client_name可缺省或不超过256字符的字符串。全部检查完成后才pruneClients，避免错误请求修改注册表。

**validateRedirectUri(value)**：类型为字符串、非空、最长2048、无空白/反斜杠/fragment；new URL解析，拒绝用户凭据。允许HTTPS或HTTP回环localhost/127.0.0.1/[::1]。内部reject统一抛400。原始字符串保留用于精确匹配，不用URL规范化扩大回调匹配。自定义scheme不受支持；原生连接器需使用回环回调。

生成clientId和secret，存redirects副本、名字、方法、createdAt；返回注册元数据。即使none也返回secret，但该客户端使用none方式认证，不应误以为“有返回secret就必须Basic”。容量错误503；其他注册验证错误400。

### issueAccess(clientId) 与 tokenResponse(issued)

issueAccess生成access/refresh，创建含两个截止的共享记录，同时以两个token为键插入两张Map，返回记录。tokenResponse返回标准字段access_token/token_type/expires_in/refresh_token/scope=mcp；不把记录全部泄露。没有为每个client限制最大未过期token数量。

### verifyAccessToken(token)

空null；先常时比较当前config.secretKey，匹配返回kind=secret、clientId=url-secret；否则prune后查access，超时删并返回null，有效返回kind=oauth及clientId。refresh不能直接作为access使用；验证不续期，不把HTTP session ID当token。

### revokeAll()

清五张Map、pairing及rateHits；不会更换config.secretKey，也不清MCP session/任务板/运行进程。因此名字“全部撤销”是OAuth模块内范围，不是所有接入方式都失效。

## 5. 配对HTML与 completeAuthorize(body)

**escapeHtml(s)**用replace回调映射&、尖括号、单双引号，防止错误/隐藏字段作为HTML解释；不是URL合法性或权限校验。

**authorizeHtml(query,error)**返回完整HTML，包含配对输入、client/redirect/state/challenge/method等隐藏字段与固定response_type=code；动态字段经过escapeHtml。配对码本身不嵌在HTML；页面让用户从本机Bridge读取后输入。内联CSS定义弹性居中表单，代码生成HTML不等于完成键盘/小屏验收。

**validateAuthorize(body)**在GET和POST共用：查client、精确redirect匹配、code_challenge_method缺省S256且仅允许S256、challenge必须43字符base64url、response_type可缺省为code但非code拒绝、state可缺省或最长2048字符串；最后validateRedirectUri构造URL。返回client和url。全部失败都在配对码消耗之前，不重定向到错误输入地址。

**completeAuthorize(body)**先validateAuthorize，再consumePairing，生成/存入授权码，然后给已解析URL添加code和可选state。scope/resource尚未完整实现，不宣称完整OAuth/OIDC标准覆盖。缺省response_type/method保留已有直接调用兼容，但不允许空challenge。

## 6. authenticateClient(body,authorization='',inferredId)

返回clientId，失败抛status401/oauthError=invalid_client。内部 **reject()**统一创建错误，**decode(value)**用于Basic中application/x-www-form-urlencoded风格的加号/百分号解码。

默认clientId为body值或推断ID；body.client_secret非null/undefined就采用post（包括空字符串），否则none。有authorization时要求Basic形态且不混用body secret；base64解码后以首个冒号分隔，缺id失败；decode clientId/secret，并拒绝body.client_id与Basic id不一致。

查client并要求实际方式与注册方式一致；非none还要求secret是字符串且常时比较匹配。Basic解析异常走reject。none只核对已注册ID和方法，并不证明持有客户端secret；refresh/revoke可从已知token记录推断ID。这不是操作者身份认证。这个函数不验证grant/code/PKCE，那些在handleToken；也不是GitHub confidential client的实现。

## 7. handleToken(body={},authorization='')

先prune，必要时从refresh或spent记录推断clientId，然后authenticateClient；复制body补规范client_id。**客户端认证在读取/消耗授权码或处理重放之前**。

### authorization_code 分支

查code存在/未过期 → clientId一致 → redirectUri一致 → verifier为43–128位RFC7636未保留字符字符串且s256等于challenge，全部通过才delete授权码、issueAccess、tokenResponse。前面的认证/PKCE失败不提前消耗授权码；成功后不能二次兑换。错误多为status400，路由sendError默认映射invalid_request，而非每个分支精细区分invalid_grant。

### refresh_token 分支

有效refresh需clientId一致；把旧refresh记入spentRefresh，删旧access和refresh，再签新的一对。不能把刷新说成延长旧access有效期，旧access已删除。

无有效refresh但在spent中命中且归属已认证clientId时，revokeClientTokens(spent.clientId)，抛“重放检测、已撤销”；其撤销范围是该client所有access/refresh，不只是刚刷新的一个。无记录则invalid refresh。认证失败不会先做这条撤销，先走登记的认证方式；none并没有额外secret证明。

不支持的grant抛400。没有落盘、跨进程共享或后台刷新；网络客户端自己保存新token并按协议请求。

## 8. 限流、错误和所有路由回调

**clientIp(req)**只取Express按明确trust-proxy策略解析的req.ip，再回退socket.remoteAddress/local；不直接相信转发头。默认未设trust proxy，隧道后的多个真实用户可能共用同一代理IP预算。**rateLimit(key,max,windowMs)**固定窗口计数，超max抛429；每次调用按expiresAt清除过期key；最多1000项，新key遇满时429，已有key仍可使用剩余额度；拒绝请求不增加计数、不延长窗口。不同端点前缀不共用次数，授权GET/POST共用auth前缀。

**sendError(res,err)**status默认500；401附Basic挑战；oauthError优先，否则429 slow_down、400 invalid_request、其他server_error，附error_description。不是JSON-RPC错误外壳。

| 路由/具名处理器 | 动作 | 失败出口 |
|---|---|---|
| 三个well-known GET回调 | requestOrigin后返回授权/资源metadata；含资源/mcp别名 | 不要求Bearer，便于发现 |
| registerHandler / POST oauth/register、register | IP每分钟20次，registerClient，201 | catch sendError |
| GET oauth/authorize | 每IP授权限流30/分钟、validateAuthorize后返回HTML | 不生成或更新配对码；过期提示去本机工作台生成，不公开码；失败sendError |
| POST oauth/authorize | 共用授权30/分钟限流、completeAuthorize，302 | catch按status或400重新渲染错误HTML，不任意跳到失败输入地址 |
| POST oauth/token | IP每分钟60次，handleToken后json | catch sendError |
| POST oauth/revoke | token/access_token中取目标，查两张Map，authenticateClient；匹配所属client才删这一对 | 认证通过后，即使未知token或不属该client也200 revoked:true；认证失败仍sendError（401），不是匿名统一200 |

revoke路由不是revokeAll，也不为该token新建spentRefresh重放记录。200仅表示撤销请求已处理，不能据此确认目标曾存在或已删除别人的令牌；只有已知且归属匹配才删除一对access/refresh。长期config.secretKey不在这两张表内，OAuth撤销不会轮换它。授权/撤销与注册/token的限流策略不同，不能写“所有OAuth端点统一限流”。

## 9. 验证与不冒充的保证

```bat
npm test --prefix webagent-core/agent-host -- --filter=oauth
```

此filter匹配oauth、oauthClientAuth、oauthRateLimit三个文件。oauthClientAuth现加载真实index双server：三种认证方式、刷新/撤销归属、撤销后MCP早期401、issuer/挑战一致性，以及表单授权→302（禁止自动跟随）→换码/拒绝重兑。伪造Host用node:http发送，避免fetch改写头导致假阳性；其余请求仍在本机，无第三方回调访问。单元部分继续覆盖登记容量、无效授权不消耗配对及公开GET不续发码；时间/限流独立VM回归不是实时时钟精度证明。真实手机/第三方OAuth客户端是否接受字段和重定向，需人工F节。上文明确记录未全面校验的输入、Map容量与内存策略，不因此声称OAuth全标准认证，也不在文档任务中静默调整授权产品决策。

### 本轮安全边界

公开GET不能再自动续发配对码；issuePairing/ensurePairing仍供本机控制面使用。错误预算现按已注册clientId隔离，避免另一注册者作废正常码；客户端ID不是秘密，攻击者若已知道目标ID仍可针对其尝试预算或进行流量DoS，不把此称为完整抗DoS。重启仍重新配对，不引入持久化密钥。单客户端令牌族数量、所有可能代理部署、真实Arena/手机回调尚未穷举验收。


## 限流恢复与公平性（2026-09-16）

rateLimit在expiresAt<=now时清理；n达到max先抛429，不写回n。容量仍限1000个key；新key遇满时retryAfter取最早过期窗口的秒数向上取整、最少1；已有key不因新key容量满而被清空。**retryHeader(res,err)**只对429及正安全整数设置Retry-After，sendError JSON路径和授权POST的HTML错误路径都调用。该数字表示可重试时间，不保证届时请求一定成功，也不触发客户端自动重放。

验证oauthRateLimit.test：固定时钟边界、大量拒绝后窗口不漂移、1000项容量/旧key可用、2000步生成调度对照独立模型，以及真实HTTP端点伪造X-Forwarded-For仍共用预算、JSON/HTML均返回Retry-After和过期恢复。没有更改默认代理信任或按未经认证client_id任意拆预算；共享NAT/隧道IP下的按用户公平性仍未实现，需另做可信身份/部署设计。

计数指“通过限流门槛”的请求；后续OAuth业务校验返回400/401仍消耗额度。只有限流本身拒绝的请求不增加计数，不能用无效凭据绕开预算。
