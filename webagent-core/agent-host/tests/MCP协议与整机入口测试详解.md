# MCP调度与真实Node入口冒烟

“真实入口”指本机Node子进程和HTTP，不是Windows安装器、浏览器、手机或公网隧道的交互验收。

## mcpProtocol.test.js

[源码](mcpProtocol.test.js)临时workspace，**req(method,params,extra={})**构造ip、JSON-RPC id1/body，再展开extra覆盖字段。异步**main**直接handleRpc，不先经过HTTP认证中间件。

| 断言组 | fixture、实际调用及结果 |
|---|---|
| initialize/ping/resources | instructions含Bridge/资源URI，capabilities有resources/prompts，serverInfo有name；ping ok，资源列表含protocol/memory/profile/clients，读取protocol提Streamable HTTP |
| 连接与页面规则 | CONNECT_LINE/PAGE_RULES_LEAD精确文案，getBootstrapPrompt拼URL+空行+提示；getPageRulesPrompt前缀及Bridge说明 |
| 工具/预算 | 公开30项含核心读写/记忆/任务/命令工具，无lsp/隐藏input，includeHidden才有input；clipJson对20000字符stdout裁剪 |
| 本地权限与错误 | rm、reset --hard、push、下载pipe shell均要求confirm_dangerous；unknown工具为ProtocolError E_UNKNOWN_CMD且提示Available |
| 远程限制 | 即使确认危险命令仍E_FORBIDDEN，send_command_input也拒；cat/path别名返回正文和hash；unknown RPC转isError，Ask apply_patch拒只读锁 |
| 图片 | 写只有PNG头的shot.png，真实run_command echo路径后文本content仍第一，附image/png裸base64；echo无路径不附图。不是有效截图展示/视觉理解测试 |
| 日志 | 远程ping成功；get_logs数组含ping结束摘要，没有args/chunk/result/patch正文 |
| 记忆 | remember一句→recall含句子无Markdown二级标题；再加五条，limit3返回count3/truncated且三条列表 |
| prompts/resources客户端 | connect prompt有连接短语，clients资源有非Plus专用说明 |
| listClients目录 | 本地Chat无需隧道，Arena支持MCP且rulesText空；DeepSeek/Chat Plus扩展HTTP用secret URL和需手贴规则，扩展ID/repo及安装提示正确；普通ChatGPT目录项标不支持，连接器项用canonical /mcp并含开发者模式/新建插件步骤 |

客户端字段只是仓库目录契约，不是对外部产品当前权限的在线认证。数组some/map/find与匿名filter回调在这些组中分别选择目标记录、投影name/URI、统计匹配数，不触发远程操作。

局部**fakeRes()**提供headers/statusCode/body；**setHeader(k,v)**小写记键，**status/json**记录并链式返回，**end()**仅返回this，**write()**空（本组不验证SSE字节）。**post(body)**用无header/params的请求直接handlePost：空batch→400/-32600；ping+tools/list batch保两id与对应result；notification+ping只回ping；纯notification→204；id0必须返回0而非误作通知。成功rm tmp，catch exit1；没有finally，session状态由单文件进程结束隔离。

## httpSmoke.test.js

[源码](httpSmoke.test.js)在两个随机范围端口启动真实src/index.js。**request(method,url,body,extraHeaders)**解析URL、JSON序列化、补Content-Type/长度，data收集、end同时给raw/json（坏JSON为null），error拒。**waitHealth(url,timeoutMs)**内部**tick**每120ms重试HTTP，响应resume释放流，超12秒拒。**stop(proc)**Windows taskkill树、其他SIGTERM；已killed跳过，**并未等待确切exit证明**。

**main**spawn process.execPath并传tmp/两port，stdout/stderr的data回调累积log；exit回调目前条件体仅注释，没有检测提前退出，真正失败靠health或请求错误。try内按如下链验证：

1. health 200/ok/Web Agent；首页包含产品、API、picker、环境/技术栈/技能、连接/统计/授权、隧道、模型/Plan/规则/think等控件与限制说明；禁止旧授权/模式限制文案。app.js/state.js真能HTTP读取，模块入口、WS重连代码与状态ID存在。**均是源字符串，不是点击控件**。
2. MCP端口本机/api/status含secret、连接prompt、30个简化tools（无inputSchema）、客户端目录及规则、canonical /mcp；默认bridge本机demo登录，Plan inactive/maxBranches4。这里secret只应给本机管理面。
3. 错secret和无Bearer canonical /mcp initialize 401；正确secret initialize有instructions，tools/list30项、discovery有授权端点，ping工具成功。
4. status recentLogs存在ping，每个payload键只能tool/success/durationMs；get_logs不含args/chunk/patch；usage.json落盘有调用数。空bridge token400，reset-round后session客户端0但累计usage不能减少。
5. 模拟Cloudflare headers访问status/chat/pty/tool均404且status不泄secret，公网Host也404；同样headers带secret访问MCP initialize仍200。恶意Origin管理API404、本机Origin200；工作台端口的恶意reset-round也404。
6. PTY hello缺identity或错workspace409；正确clientId/workspace200，带同identity查询jobs数组。没有执行PTY任务。
7. OPTIONS恶意Origin没有allow-origin，DeepSeek/扩展Origin回精确allow-origin；恶意Origin MCP执行请求403无命令回显，受信Origin ping正常。MCP端口根页不能含工作台picker，防管理UI暴露。
8. 工作台/api/chat Ask以真实builtin处理临时空工作区，按NDJSON逐行JSON.parse、非法行null并filter掉，要求list_directory tool/message/done。局部**ndjson(raw)**抽出同一解析逻辑供Plan：起始一branch无consensus，追加第二branch可merge但仍无consensus，显式merge才有simulated:true且agreementRate null。不是实际多模型共识。

成功log加finished；catch先打印server log再throw；finally stop、等300ms、rm tmp，最外catch exit1。随机范围端口可能碰撞；没有完整HTTP请求deadline（health循环有总时间但单个挂起请求未单设超时），也没有把每个NDJSON非法行当失败。不能外推页面视觉正确/真实模型/隧道连通。

## skipWorkbench.test.js

[源码](skipWorkbench.test.js)的**get(url)**收真实HTTP状态/raw；**waitOk(url,ms)**内部**tick**每120ms重试直到200或10秒期限，错误同样重试。**main**spawn Node入口，传临时workspace、随机MCP端口、固定工作台19999和WEBAGENT_SKIP_WORKBENCH=1。

等MCP health正常再GET断言200；请求19999只要有HTTP响应就reject，仅连接error才resolve，证明本fixture没有启动UI端口。固定端口若已被其他程序占用会误报失败；连接error也不是严格端口所有权探针。finally Windows taskkill或SIGTERM、等200ms、rm tmp；catch exit1。子进程stdout/stderr虽pipe但未消费，长日志可能影响测试；这里启动日志短。它证明跳过旧工作台，不证明VS Code桌面插件或code-server窗口已可交互。

## 验证

分别filter mcpProtocol/httpSmoke/skipWorkbench，或`npm test --prefix webagent-core/agent-host`。Windows/Conda/浏览器/手机人工执行项仍以安装验收清单为准，不能以这些文件命名替代实测。
