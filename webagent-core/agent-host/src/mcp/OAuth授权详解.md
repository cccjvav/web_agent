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
| requestOrigin(req) | 请求→origin字符串 | 有config.publicTunnelUrl优先去末斜杠；否则转发proto/host优先于本地请求值，取逗号首项。**不是独立可信代理/Host校验器**，部署须配合入口限制 |
| s256(verifier) | 字符串/Buffer→base64url摘要 | SHA-256；不在此检查verifier长度/字符集 |
| timingSafeEqualString(a,b) | 两值→boolean | String转UTF8 Buffer，长度不同false，相等长度用crypto.timingSafeEqual；不把任意长度比较说成全流程常时 |

## 2. 配对生命周期：四个函数

**issuePairing()**覆盖全局pairing，写新code、createdAt、expiresAt、attempts=0，返回snapshotPairing。不会保留多个客户端各自的码。

**snapshotPairing()**无值/已超时返回code:null、expired:true；否则返回实际code和四舍五入的剩余秒数，expired:false。它不主动删除过期对象；实际code只能通过本机控制面适当展示，不可公开日志。

**ensurePairing()**若快照过期/无码则issue，否则返回当前快照。

**consumePairing(code)**过期/无值抛status400；每次尝试先加计数，超过5清pairing并抛429；输入trim/大写后比较，错误400但保留对象及已增加次数；正确则清pairing、返回true。因此第6次即使输入正确也已超限；成功一次即废。

## 3. 元数据与认证挑战

- **authorizationServerMetadata(origin)**返回issuer及authorize/token/register/revoke端点，声明code/refresh、S256、none/post/basic三种认证方式和scope。
- **protectedResourceMetadata(origin)**给resource=`origin/mcp`、授权服务器及header bearer方式。
- **wwwAuthenticate(origin)**构造Bearer挑战，指向protected-resource元数据。

这些函数纯构造对象/字符串，不验证域名或客户端。metadata包含openid scope，但本文件没有签发ID token/UserInfo完整OIDC流程；不能因此称为完整OpenID Connect提供者。

## 4. 注册与清理函数

### pruneExpiredTokens()

分别按各自截止删除access/refresh，spentRefresh按记录时间超过7天删，authCodes按exp删；调用触发的清理，不是定时器。清一个access不自动清仍有效的refresh。

### revokeClientTokens(clientId)

遍历access/refresh，匹配clientId就删；不删除clients注册、不清authCodes或所有spent记录。用于客户端淘汰和refresh重放处理。

### pruneClients()

先pruneExpiredTokens；注册表达到80时找最早createdAt，撤其access/refresh后删客户端，循环到有空间。不是按最近活跃度淘汰；不保证Map内其他种类状态也有数量上限。

### registerClient(body={})

**先pruneClients再验证新请求**。认证方式缺省none，只允许none/client_secret_post/client_secret_basic；redirect_uris需数组filter(Boolean)后非空，否则status400。这里没有完整URL/类型/scheme检查；精确匹配不等于已做redirect URL语义验证。

生成clientId和secret，存redirects、名字、方法、createdAt；返回注册元数据。即使none也返回secret，但该客户端使用none方式认证，不应误以为“有返回secret就必须Basic”。失败注册之前也可能已发生容量淘汰。

### issueAccess(clientId) 与 tokenResponse(issued)

issueAccess生成access/refresh，创建含两个截止的共享记录，同时以两个token为键插入两张Map，返回记录。tokenResponse返回标准字段access_token/token_type/expires_in/refresh_token/scope=mcp；不把记录全部泄露。没有为每个client限制最大未过期token数量。

### verifyAccessToken(token)

空null；先常时比较当前config.secretKey，匹配返回kind=secret、clientId=url-secret；否则prune后查access，超时删并返回null，有效返回kind=oauth及clientId。refresh不能直接作为access使用；验证不续期，不把HTTP session ID当token。

### revokeAll()

清五张Map、pairing及rateHits；不会更换config.secretKey，也不清MCP session/任务板/运行进程。因此名字“全部撤销”是OAuth模块内范围，不是所有接入方式都失效。

## 5. 配对HTML与 completeAuthorize(body)

**escapeHtml(s)**用replace回调映射&、尖括号、单双引号，防止错误/隐藏字段作为HTML解释；不是URL合法性或权限校验。

**authorizeHtml(query,error)**返回完整HTML，包含配对输入、client/redirect/state/challenge/method等隐藏字段与固定response_type=code；动态字段经过escapeHtml。配对码本身不嵌在HTML；页面让用户从本机Bridge读取后输入。内联CSS定义弹性居中表单，代码生成HTML不等于完成键盘/小屏验收。

**completeAuthorize(body)**同步顺序非常重要：

1. 查已注册client，否则400。
2. redirect_uri必须与注册列表includes精确匹配，否则400。
3. code_challenge_method缺省S256，仅允许S256，否则400。
4. consumePairing。
5. 生成code，写clientId/redirectUri/challenge/exp。
6. new URL(redirect_uri)，添加code和可选state，返回重定向地址。

这里未完整验证response_type、challenge格式/非空、scope或resource；URL构造在消耗配对码/写授权码之后，非法已注册URL可导致最后失败而前面状态已变。不能把“精确redirect与S256验证”概括为所有OAuth授权输入都完整验证。没有自动回滚前述状态。

## 6. authenticateClient(body,authorization='',inferredId)

返回clientId，失败抛status401/oauthError=invalid_client。内部 **reject()**统一创建错误，**decode(value)**用于Basic中application/x-www-form-urlencoded风格的加号/百分号解码。

默认clientId为body值或推断ID；有body.client_secret就采用post，否则none。有authorization时要求Basic形态且不混用body secret；base64解码后以首个冒号分隔，缺id失败；decode clientId/secret，并拒绝body.client_id与Basic id不一致。

查client并要求实际方式与注册方式一致；非none还要求secret是字符串且常时比较匹配。Basic解析异常走reject。这个函数不验证grant/code/PKCE，那些在handleToken；也不是GitHub confidential client的实现。

## 7. handleToken(body={},authorization='')

先prune，必要时从refresh或spent记录推断clientId，然后authenticateClient；复制body补规范client_id。**客户端认证在读取/消耗授权码或处理重放之前**。

### authorization_code 分支

查code存在/未过期 → clientId一致 → redirectUri一致 → 有verifier且s256等于challenge，全部通过才delete授权码、issueAccess、tokenResponse。前面的认证/PKCE失败不提前消耗授权码；成功后不能二次兑换。错误多为status400，路由sendError默认映射invalid_request，而非每个分支精细区分invalid_grant。

### refresh_token 分支

有效refresh需clientId一致；把旧refresh记入spentRefresh，删旧access和refresh，再签新的一对。不能把刷新说成延长旧access有效期，旧access已删除。

无有效refresh但在spent中命中时，revokeClientTokens(spent.clientId)，抛“重放检测、已撤销”；其撤销范围是该client所有access/refresh，不只是刚刷新的一个。无记录则invalid refresh。认证失败不会先做这条撤销，必须先证明客户端身份。

不支持的grant抛400。没有落盘、跨进程共享或后台刷新；网络客户端自己保存新token并按协议请求。

## 8. 限流、错误和所有路由回调

**clientIp(req)**取req.ip/转发头/local，逗号首项trim；代理配置决定实际粒度。**rateLimit(key,max,windowMs)**固定窗口计数，超max抛429；老key只有再次访问才重置，rateHits没有全局过期清扫或容量上限，不可声称全部Map都数量有界。

**sendError(res,err)**status默认500；401附Basic挑战；oauthError优先，否则429 slow_down、400 invalid_request、其他server_error，附error_description。不是JSON-RPC错误外壳。

| 路由/具名处理器 | 动作 | 失败出口 |
|---|---|---|
| 三个well-known GET回调 | requestOrigin后返回授权/资源metadata；含资源/mcp别名 | 不要求Bearer，便于发现 |
| registerHandler / POST oauth/register、register | IP每分钟20次，registerClient，201 | catch sendError |
| GET oauth/authorize | ensurePairing，返回HTML | 不在这个回调先校验client/redirect；不返回配对码 |
| POST oauth/authorize | completeAuthorize，302 | catch按status或400重新渲染错误HTML，不任意跳到失败输入地址 |
| POST oauth/token | IP每分钟60次，handleToken后json | catch sendError |
| POST oauth/revoke | token/access_token中取目标，查两张Map，authenticateClient；匹配所属client才删这一对 | 成功统一200 revoked:true，未知token不泄露存在性；catch sendError |

revoke路由不是revokeAll，也不为该token新建spentRefresh重放记录。GET授权/撤销与注册/token的限流策略不同，不能写“所有OAuth端点统一限流”。

## 9. 验证与不冒充的保证

```bat
npm test --prefix webagent-core/agent-host -- --filter=oauth
```

此filter会匹配基础OAuth及client auth测试；涵盖发现、配对/PKCE、public与secret方式、刷新旋转/重放等断言。真实手机/第三方OAuth客户端是否接受字段和重定向，需人工F节。上文明确记录未全面校验的输入、Map容量与内存策略，不因此声称OAuth全标准认证，也不在文档任务中静默调整授权产品决策。
