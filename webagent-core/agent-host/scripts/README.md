# agent-host维护脚本

逐步阅读：[run-tests.js 顶层执行流程与回调详解](运行器详解.md)。

## 职责与入口
run-tests.js是npm test的统一入口，不是产品服务启动器。

## 执行流程
先检查依赖，解析--filter及单测试超时配置，核对优先测试清单，再发现其余.test.js。每个测试独立子进程执行，汇总退出码；未知参数、零匹配、缺依赖、缺基线测试、超时或测试失败均不能报绿。

## 验证与边界
从agent-host执行npm test；testRunner.test.js覆盖筛选、非法参数和失败边界。测试文件通过数量不等于测试覆盖率，也不代表真实Windows/浏览器验收。

R4：逐文件context/result固定元数据与有界失败annotation帮助区分测试进程未退出和内部产品超时；不增加超时或重跑，不自动修复业务。

R5增加`tunnel-residue.js`零参数只读本地检测，JSON明确不支持清理；详见运行器详解独立章节。不会停止当前Bridge或按名称杀进程。

R5新增独立`tunnel-cleanup.js`：仅Windows本机交互终端零参数，预览后RECYCLE确认；只读tunnel-residue.js不变。无图形/HTTP/MCP清理入口，未知不重放。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [run-tests.js](run-tests.js) | 5 个函数/类节点 |
| [tunnel-cleanup.js](tunnel-cleanup.js) | 8 个函数/类节点 |
| [tunnel-residue.js](tunnel-residue.js) | 2 个函数/类节点 |
<!-- docs-inventory:end -->
