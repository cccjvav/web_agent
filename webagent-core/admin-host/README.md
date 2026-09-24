# 可选统计后台：独立服务

精细实现复盘：[全部函数与HTTP回调](统计服务详解.md)。


## 职责与入口
admin-host使用Node http模块接收用量报告和展示当天排名，默认监听127.0.0.1:4174。主agent-host不会自动启动它；文档站4173和工作台3000是另外的服务。

Windows从仓库根运行run-admin.cmd；macOS/Linux可运行run-admin.sh。直接启动命令为 `node webagent-core/admin-host/index.js`。

## 文件与执行流程
`index.js`读取WEBAGENT_ADMIN_BIND/PORT，创建server并打印地址和数据目录。`app.js`负责令牌、报告读写、排序、HTML及HTTP handler。

| 接口 | 授权 | 用途 |
|---|---|---|
| GET /health | 无 | 健康检查，不包含业务报告 |
| GET / | Bearer | 返回排行榜HTML |
| GET /api/stats?day=YYYY-MM-DD | Bearer | 返回日期统计 |
| POST /api/report | Bearer | 收到installId等字段后保存报告 |

后台使用WEBAGENT_ADMIN_TOKEN，未配置则从数据目录读令牌文件，没有时生成。数据目录优先WEBAGENT_ADMIN_DATA，源码默认本目录data；安装启动器可改为用户admin目录。

报告按installId/day替换该日记录；展示可按GitHub用户或安装ID归并并排序。报告正文由客户端提供，不是不可伪造的计费凭据或审计证据。JSON请求体上限1MiB；读取/解析异常、字段缺失和认证失败应区分处理。

## 浏览器、上报和数据边界
**普通浏览器地址栏不会自动发送Bearer。** 直接打开受保护首页遇到401不是“网页没启动”；当前没有供普通浏览器登录后发cookie的完整流程，应使用能安全设置请求头的访问方式，不能把token放入公开URL。

客户端同时配置WEBAGENT_TELEMETRY_URL与WEBAGENT_TELEMETRY_TOKEN才上报；payload包含安装ID和可选GitHub身份，因此不是完全匿名。服务默认回环，改公网监听需要独立部署评估。

reports.json是普通文件读写。**缺文件或零字节**视为空库；**能读到却不是JSON数组**视为损坏，读取与写入都抛`E_STORE_CORRUPT`并原样保留磁盘字节，不再把损坏当空库从而被下一条上报覆盖掉历史。写入走临时文件+rename发布，避免中途崩溃留下半截文件。这仍不是数据库事务、持久队列或数据库：读取时逐行按已知字段校验；账本上限4MiB/10000行，健康账本到上限时整日轮出最旧日期（F70；此前会让之后所有上报永久500），被轮出的数据不自动归档，需要长期留存请外部备份reports.json。令牌文件应保密：自动生成时以0600创建（F72；Windows上0600不等于完整ACL），gitignore不能消除已提交的秘密。存储类500只对外返回固定文案与`code`，含路径的详情只打印在服务控制台（F72），因为所有上报客户端共用同一个令牌。

## 验证
adminHost保留本地HTTP鉴权/排名/body边界；adminIntegrity覆盖真实子进程畸形URL400且不退出、坏存储保留、schema和写中断。浏览器套件新增320/390/1440统计页：14px正文/12px安装ID、对比度、可聚焦的表格内横向滚动，不让整页溢出；长ID折行。usageTracker只验证客户端部分统计。真实远端部署、浏览器登录体验、长期数据恢复和精确计费不在此测试结论内。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 38 个函数/类节点 |
| [index.js](index.js) | 1 个函数/类节点 |
<!-- docs-inventory:end -->
