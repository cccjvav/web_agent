# 本机控制面与 Origin：逐函数分层解释

## 职责与调用顺序

[localControl.js](localControl.js)判定是否本机控制请求；[corsAllow.js](corsAllow.js)区分浏览器来源。入口把它们放在API/WS/MCP不同路径，不能用“支持远程MCP”推断远程UI也开放。

```text
API：本机socket + 本机Host + 无隧道标识 → 浏览器Origin/Referer检查 → 业务
MCP：允许的Origin（或非浏览器无Origin） → token认证 → RPC
WS：本机控制面 + 允许API浏览器Origin → 握手/连接
```

## 1. localControl.js全部函数

| 函数 | 参数/返回 | 判定与边界 |
|---|---|---|
| isLoopbackAddress(addr) | 地址→boolean | trim/lowercase；::1/localhost或去IPv4映射前缀后的127.0.0.1；不是所有127网段都允许 |
| isTunnelRequest(req) | 请求→boolean | 检查指定Cloudflare/CDN头是否存在真值；不是验证这些头签名，也不代表识别所有代理 |
| hostName(req) | 请求→规范主机名 | Host取逗号首项、小写、去数字端口和方括号；内部辅助 |
| publicTunnelHost() | 无→主机名 | 从config.publicTunnelUrl去协议/路径/端口/方括号；不是完整URL解析器 |
| isPublicHost(req) | 请求→boolean | 本机名除外；识别常见Cloudflare/ngrok后缀或当前配置公网名 |
| isLocalControlPlane(req) | 请求→boolean | 隧道标识直接拒绝；Host必须严格匹配localhost/127.0.0.1/[::1]及合法可选端口；再排公网名；最后优先socket.remoteAddress、否则req.ip，要求回环 |
| rejectUnlessLocalControl(req,res,next) | 中间件 | 通过next；否则404 JSON not found，不在错误中暴露控制API细节 |

本机socket是必要但不充分条件，Host也要匹配，不能只信任代理把请求转发到回环后的地址。该检查不认证操作系统用户、不提供浏览器页面登录，也不限制shell命令能访问哪些系统资源。

## 2. corsAllow.js的常量与规范化函数

EXTENSION_PROTOCOLS列chrome/moz/safari扩展协议，PAGE_ORIGINS列当前维护的网页来源；额外项来自WEBAGENT_CORS_ORIGINS。允许Origin不是接受其工具调用的充分条件，MCP仍需token。

| 函数 | 参数/返回 | 语义 |
|---|---|---|
| extraOrigins() | 无→字符串数组 | 环境变量逗号split，map trim，filter非空，每次读取，不是启动时冻结 |
| parseOrigin(origin) | 字符串→URL或null | new URL异常null；能解析不等于可信来源 |
| isLoopbackHostName(name) | 主机名→boolean | 去方括号、小写，检查三个本机名 |
| isLoopbackOrigin(origin) | URL样文本→boolean | parse后限定http/https，再判本机名；未限制到本产品特定端口 |
| isExtensionOrigin(origin) | URL样文本→boolean | 解析协议在扩展集合内；未按具体扩展ID细分 |
| extraOriginSet() | 无→Set | 额外项可解析则存u.origin，不可解析则存原文本；不是通配子域语法 |
| isAllowedMcpOrigin(origin) | 来源→boolean | 无Origin允许；本机/扩展允许；否则解析成功且在页面白名单或额外集合 |
| isAllowedApiBrowserOrigin(origin) | 来源→boolean | 无Origin或本机http/https；不沿用MCP网页白名单 |
| refererOrigin(req) | 请求→origin或空 | 读referer/referrer，parse成功取origin；无值/坏值为空，不替代socket检查 |

## 3. 三个中间件/工厂

**rejectCrossSiteApi(req,res,next)**：Origin有值时只按API来源检查，拒绝404；无Origin才读Referer，非空且非本机拒绝，否则next。不能独立部署它替代本机控制面，非浏览器无头请求本来允许继续。

**mcpCors()**：返回cors包中间件，内部origin(origin,cb)回调以 `cb(null,isAllowedMcpOrigin(origin))`决定CORS头。**仅不发CORS允许头不等于业务没有执行**，所以还有下一层硬拒绝。

**rejectDisallowedMcpOrigin(req,res,next)**：无Origin或允许来源next，其他403 JSON；入口在MCP路由前使用，避免不允许的浏览器请求仍执行工具。它不验证Bearer，也不要求CLI伪造浏览器头。

## 4. 验证与部署边界

```bat
npm test --prefix webagent-core/agent-host -- --filter=localControl
npm test --prefix webagent-core/agent-host -- --filter=corsAllow
npm test --prefix webagent-core/agent-host -- --filter=auditControl
```

验证回环、Host/Origin与远程控制面拒绝等；真实代理配置仍需按部署路径验收。练习：逐层解释为什么手机可经认证MCP读测试文件，却不能因此访问本机/api；以及为什么不把WEBAGENT_CORS_ORIGINS设为任意站点来解决所有连接问题。
