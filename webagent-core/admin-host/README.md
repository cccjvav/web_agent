# 可选统计后台：独立服务

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

reports.json是普通文件读写，读取失败可回空列表；不是数据库事务、持久队列或严格schema系统。令牌文件应保密，gitignore不能消除已提交的秘密。

## 验证
adminHost覆盖本地HTTP鉴权、报告与body边界；usageTracker验证客户端部分统计。真实远端部署、浏览器登录体验、长期数据恢复和精确计费不在此测试结论内。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 27 个函数/类节点 |
| [index.js](index.js) | 1 个函数/类节点 |
<!-- docs-inventory:end -->
