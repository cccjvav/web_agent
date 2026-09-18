# 持续集成

精细复盘：[CI逐job与嵌入PowerShell解释](../../docs/development/平台启动与CI详解.md)。


## 职责与入口
`test.yml`定义跨平台agent-host测试、Windows安装器与真实浏览器验证。它不部署产品，不代替桌面验收。

## 执行流程与边界
工作流顶层权限只授予contents:read；三个job不发布产物、不写仓库。checkout/setup-node使用v5的Node 24动作运行时，避免继续依赖GitHub已弃用的旧动作运行时；这不改变被测Node矩阵。Ubuntu Node18/20/22/24和Windows Node20/22/24安装锁定依赖后先检查文档，再以`npm audit --omit=dev --audit-level=high`把高/严重生产依赖公告设为门禁，随后执行npm test。审计依赖npm公告服务可用，且不覆盖开发依赖、源码逻辑或供应链签名。Windows构建白名单payload，编译输入辅助C#、解析PowerShell，最后编译Inno安装器。Windows步骤成功不是安装、升级或桌面交互成功。

## 验证
推送/PR触发GitHub Actions。工作流修改应检查三个job定义（矩阵展开九个任务）和退出码，保留失败日志；禁止仅修改断言来掩盖失败。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [test.yml](test.yml) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->

新增workbench-browser：Ubuntu/Node22，独立10分钟限时；npm ci、Playwright Chromium及系统库安装、npm run test:browser。它实际操作浏览器和认证MCP，不代替Windows桌面输入或用户手机验收。

Windows矩阵在全套测试后重复ptyLifecycle五次、stdioMcp两次；stdio每个版本合计三轮，保留原请求/文件超时和协议预算断言，不靠延长时间隐藏启动问题。
