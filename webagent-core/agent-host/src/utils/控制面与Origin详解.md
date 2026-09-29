# 本机控制面与 Origin：逐函数分层解释

## 职责与调用顺序

[localControl.js](localControl.js)判定是否本机控制请求；[corsAllow.js](corsAllow.js)区分浏览器来源。入口把它们放在API/WS/MCP不同路径，不能用“支持远程MCP”推断远程UI也开放。

```text
API（双端口）：本机socket + 本机Host + 无隧道标识 → Origin/Referer检查 → 正文解析 → 路由复验 → 业务
MCP（MCP端口）：Origin硬拒绝 → CORS（允许的OPTIONS在此结束） → 有效路径token认证 → 正文解析 → 路由复验 → RPC
WS：本机控制面 + 允许API浏览器Origin → 握手/连接
```

这是[入口](../index.js)的请求路径示意；MCP早期认证仅匹配`/mcp`与`/mcp/:secret`，跳过OPTIONS，不保证未知路径都经过认证。允许的浏览器预检无需密钥；不允许的Origin连预检也403。API与MCP路由前保留重复检查，不能靠仅移除CORS头阻止业务。

## 1. localControl.js全部函数

| 函数 | 参数/返回 | 判定与边界 |
|---|---|---|
| isLoopbackAddress(addr) | 地址→boolean | trim/lowercase；::1/localhost或去IPv4映射前缀后的127.0.0.1；不是所有127网段都允许 |
| isTunnelRequest(req) | 请求→boolean | 检查指定Cloudflare/CDN头是否存在真值，或FORWARDING_HEADERS中任一反向代理转发头（x-forwarded-for/-host/-proto、forwarded、x-real-ip、x-original-host）**存在**（空值也算）。后者为2026-09-25第77组补上：用户自行运行`ngrok http --host-header=rewrite`（或`--host-header=localhost:端口`，常见教程写法）时，请求从127.0.0.1进来、Host是localhost、没有cf头，此前被当成本机控制面，公网访客不需任何密钥即可调用整个`/api`（真实主机实测旧代码200、修后404）；ngrok v3改写Host时把原Host放进X-Forwarded-Host并加X-Forwarded-For。主机自己启动的ngrok不改写Host，本来就被isPublicHost拒绝。不验证头的值，也不代表识别所有代理：完全不留痕迹、又把Host改成localhost的代理仍无法区分 |
| hostName(req) | 请求→规范主机名 | Host取逗号首项、小写、去数字端口和方括号；内部辅助 |
| publicTunnelHost() | 无→主机名 | 从config.publicTunnelUrl去协议/路径/端口/方括号；不是完整URL解析器 |
| isPublicHost(req) | 请求→boolean | 本机名除外；识别常见Cloudflare/ngrok后缀或当前配置公网名 |
| isLocalControlPlane(req) | 请求→boolean | 隧道标识直接拒绝；Host必须严格匹配localhost/127.0.0.1/[::1]及1–65535的可选端口；再排公网名；最后优先socket.remoteAddress、否则req.ip，要求回环 |
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

**rejectCrossSiteApi(req,res,next)**：Origin有值时只按API来源检查，拒绝404；无Origin时先看`Sec-Fetch-Site`：值为cross-site（大小写不敏感）拒绝404——外站页面可用普通GET加`referrerpolicy=no-referrer`同时去掉Origin与Referer，但浏览器总带这个头且脚本无法伪造/删除（2026-09-25，第74组记录的`GET /pty/jobs`可被外站标记PTY客户端在线）；same-site（本机另一端口）、same-origin、none（地址栏）放行。只在无Origin分支检查，带本机Origin的请求即使被浏览器标为cross-site（localhost与127.0.0.1是不同站点）仍按原规则放行。再读Referer，非空且非本机拒绝，否则next。旧浏览器不发该头时仍按原规则。不能独立部署它替代本机控制面，非浏览器无头请求本来允许继续。

**mcpCors()**：返回cors包中间件，内部origin(origin,cb)回调以 `cb(null,isAllowedMcpOrigin(origin))`决定CORS头。仅显式暴露响应头`Mcp-Session-Id`和`WWW-Authenticate`，让已允许的浏览器来源能够读取会话ID及401认证挑战；没有暴露全部响应头、开放任意Origin或免除token验证。**仅不发CORS允许头不等于业务没有执行**，所以还有下一层硬拒绝。

**rejectDisallowedMcpOrigin(req,res,next)**：无Origin或允许来源next，其他403 JSON。MCP端口的`applyCommon`在`/mcp`前缀先挂它，早于CORS、认证及JSON/表单解析；路由前也保留它。不允许的Origin即使携带有效凭据和畸形JSON也先403，而非解析器400；没有Origin或来源允许不代表免认证。它不验证Bearer，也不要求CLI伪造浏览器头。

API有Origin优先，不用Referer覆盖它；无Origin才检查可解析Referer。两者缺失或Referer无法解析时仍允许本机请求，这是兼容CLI的既有策略，不是完整CSRF登录机制。不同本机HTTP(S)端口也被允许，不是严格同源隔离。`parseOrigin`用通用URL解析，可接受带路径/凭据等非规范Origin文本；本轮没有改为严格序列化Origin校验。浏览器生成Origin、非浏览器可伪造头，不能把人工构造文本被接受直接称为浏览器越权。

## 3b. contentSecurity.js：两张HTML页面的CSP（F101，复审P1-1）

| 函数 | 输入→输出 | 边界 |
|---|---|---|
| sourceHash(text) | 文本→`'sha256-<base64>'` | 对元素**原文**（含首尾换行与缩进）做sha256，与浏览器校验内联脚本/样式的方式一致 |
| inlineScriptHashes(html) | 页面HTML→哈希数组 | 只取没有src=的`<script>`；工作台index.html里只有主题引导一段，contentSecurity测试锁“恰好一个” |
| inlineStyleHashes(html) | 页面HTML→哈希数组 | 取每个`<style>`块；OAuth配对页只有一个固定样式块 |
| workbenchPolicy({scriptHashes, host}) | 哈希与请求Host→策略串 | `default-src 'self'`；`script-src 'self'`+哈希；`worker-src 'self' blob:`（Monaco 0.52总是用blob引导worker再importScripts同源workerMain.js）；`style-src 'self' 'unsafe-inline'`（Monaco渲染写内联样式，页面也有style=）；`font-src 'self' data:`；`img-src 'self' data: blob:`；`connect-src 'self' ws://Host wss://Host`（Host须匹配主机名/IPv6字面量+可选端口的HOST正则，否则只留'self'——部分浏览器不把同主机ws:算'self'）；`object-src 'none'`、`base-uri 'self'`、`form-action 'self'`、`frame-ancestors 'none'`。策略里不出现任何http/https来源 |
| authorizePolicy({styleHashes}) | 样式哈希→策略串 | `default-src 'none'; style-src <哈希>; base-uri 'none'; frame-ancestors 'none'`。有意不设form-action：Chrome会把它套到POST后302跳转客户端redirect_uri上，OAuth流程会断 |

index.js的mountWorkbench在启动时算一次工作台哈希并对每个响应按req.headers.host生成策略；oauth.js对`authorizeHtml({}, '')`模板算一次样式哈希，GET与错误重渲染都带。VS Code设置页webview有自己的nonce策略（extension/settingsPanel.js），不用这里。CSP只约束浏览器加载/执行什么，不是认证，也不替代`escapeHtml`。

## 4. 验证与部署边界

```bat
npm test --prefix webagent-core/agent-host -- --filter=localControl
npm test --prefix webagent-core/agent-host -- --filter=corsAllow
npm test --prefix webagent-core/agent-host -- --filter=auditControl
npm test --prefix webagent-core/agent-host -- --filter=contentSecurity
```

localControl覆盖回环、严格Host、远程socket优先于伪造ip/转发头及缺失地址；corsAllow验证额外MCP来源不放开API。auditControl直接加载真实入口，在两端口验证恶意Host/隧道头/外站Origin与Referer的404早于正文解析，验证WS握手拒绝、MCP恶意来源403早于解析、允许预检204、缺密钥401及合法初始化。这些HTTP/WS用例不是浏览器攻击复现；独立`mcpCorsBrowser`还在真实Chromium跨端口读取会话头、续用会话列工具及读取401挑战。没有证明工具执行越权、全面代理识别或网络层抗DoS，真实代理配置仍需按部署路径验收。练习：逐层解释为什么手机可经认证MCP读测试文件，却不能因此访问本机/api；以及为什么不把WEBAGENT_CORS_ORIGINS设为任意站点来解决所有连接问题。
