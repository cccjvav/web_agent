# MCP用量统计与可选上报

## 职责与入口
`tracker.js`记录当前工作区当天的MCP工具调用数和失败数，保存到 `.webagent/usage.json`。它不是精确token计费器，也不自动统计所有Chat、直接REST和后台进程操作。

## 执行流程
record读取当天记录、累计toolCalls/fail、更新lastAt并调度报告。today使用UTC日期；跨天或读取/解析失败时返回当天空记录。successRate在零调用时为null，否则由计数计算百分比。

reportNow仅在配置WEBAGENT_TELEMETRY_URL及WEBAGENT_TELEMETRY_TOKEN且有调用时发送。payload含安装ID、可选GitHub身份、日期、调用计数和产品版本，不发送文件正文、命令或API Key。是否可以关联身份仍应告知用户，不能称完全匿名。

报告返回后重新读取最新当天数据，只更新lastReportAt，不用发出前的旧快照覆盖期间新增计数。定时周期为15分钟，另有调度防抖。

## 数据边界与失败
usage.json顺序写盘，读取异常回空，不是不可丢失的审计日志或数据库事务。网络/上报失败不应被解读为工具失败；业务成功率仍取决于调用入口是否正确传入ok。界面telemetryConfigured只反映部分配置状态，不证明服务器收到报告。

## 验证
usageTracker与auditStorage覆盖统计和延迟报告期间计数不回退。没有远端collector可用性、重试持久队列或精确计费验收保证。管理端职责见[admin-host说明](../../../admin-host/README.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [tracker.js](tracker.js) | 19 个函数/类节点 |
<!-- docs-inventory:end -->
