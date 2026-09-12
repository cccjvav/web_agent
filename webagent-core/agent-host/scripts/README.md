# agent-host维护脚本

逐步阅读：[run-tests.js 顶层执行流程与回调详解](运行器详解.md)。

## 职责与入口
run-tests.js是npm test的统一入口，不是产品服务启动器。

## 执行流程
先检查依赖，解析--filter及单测试超时配置，核对优先测试清单，再发现其余.test.js。每个测试独立子进程执行，汇总退出码；未知参数、零匹配、缺依赖、缺基线测试、超时或测试失败均不能报绿。

## 验证与边界
从agent-host执行npm test；testRunner.test.js覆盖筛选、非法参数和失败边界。测试文件通过数量不等于测试覆盖率，也不代表真实Windows/浏览器验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [run-tests.js](run-tests.js) | 4 个函数/类节点 |
<!-- docs-inventory:end -->
