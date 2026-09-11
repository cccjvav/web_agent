# 持续集成

## 职责与入口
`test.yml`定义Linux agent-host测试与Windows安装器验证。它不部署产品，不代替桌面验收。

## 执行流程与边界
Linux安装锁定依赖后执行npm test；文档清单检查是其中的测试，源码新增和hash漂移必须修正后才能通过。Windows构建白名单payload，编译输入辅助C#、解析PowerShell，最后编译Inno安装器。Windows步骤成功不是安装、升级或桌面交互成功。

## 验证
推送/PR触发GitHub Actions。工作流修改应检查两个job和退出码，保留失败日志；禁止仅修改断言来掩盖失败。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [test.yml](test.yml) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
