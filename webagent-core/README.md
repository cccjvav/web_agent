# 产品源码导航

## 职责与入口
webagent-core是现行产品代码根；历史webagent-repro不是运行依赖。本层start-webagent.sh只定位仓库根并exec根run-webagent.sh，把参数原样转发，不另建一套后端。

## 模块分工
| 模块 | 作用 | 说明 |
|---|---|---|
| agent-host | 本机Chat/API、认证MCP与工具 | [后端包](agent-host/README.md) |
| workbench | 自绘浏览器工作台，默认3000 | [界面](workbench/README.md) |
| extension | VS Code侧栏/Chat与可观测PTY宿主 | [扩展](extension/README.md) |
| scripts | code-server准备、启动和桌面扩展安装 | [启动编排](scripts/README.md) |
| extensions-installed | 扩展发行副本，以extension为准 | [副本](extensions-installed/README.md) |
| admin-host | 独立可选统计服务，默认4174 | [后台](admin-host/README.md) |

## 执行流程与边界
自绘工作台与网页VS Code是两种UI入口，共享agent-host；默认工作区是仓库根workspace，安装版可使用用户数据目录。工作区是被编辑项目，不必等于产品源码目录。

本机Chat由主机调用模型；Bridge由外部Agent调用认证MCP。两者复用工具，不共享同一套模型循环或取消协议。不同入口的权限、结果和生命周期差异以各模块说明为准。

## 验证与阅读
运行和工作区选择见[启动说明](../启动脚本说明.md)，设计原因见[架构导读](../架构导读.md)，回归分类见[测试导航](agent-host/tests/README.md)。需要找函数时使用文档站符号索引，不在产品根重复全部实现。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [start-webagent.sh](start-webagent.sh) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
