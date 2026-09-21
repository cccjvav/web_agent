# 隧道：把认证MCP入口映射到公网

逐函数与生命周期：[Cloudflare/ngrok详解](隧道生命周期详解.md) · [停止进程详解](停止进程详解.md)。


逐函数阅读：[stopProcess 的事件与清理详解](停止进程详解.md)。

## 职责与文件
隧道目标是agent-host的MCP端口（默认48271），不是开放本机工作台控制面。调用者为API的Bridge启停流程。

| 文件 | 职责 |
|---|---|
| `cloudflared.js` | Quick/Named Tunnel的二进制发现、参数校验、启动就绪检测、合并状态与停止协调 |
| `ngrok.js` | ngrok二进制、Authtoken与域名选项、日志就绪检测；复用Cloudflare模块停止旧提供商 |
| `stopProcess.js` | 对捕获的旧ChildProcess引用发信号并等待退出；不以killed标志充当退出证明 |

## 执行流程
1. 校验选项并寻找二进制。Quick不需要用户Token；Named需要合法主机名和Token；ngrok需要参数或环境中的Authtoken，域名可选。
2. 停止旧提供商，记录generation，等待停止Promise；若已被另一个操作替代，拒绝启动。
3. spawn进程，保留该进程引用。日志缓冲最多64Ki字符；只有当前进程且代次匹配的输出能触发ready。
4. Quick从日志提取trycloudflare URL；Named识别注册连接就绪日志后发布用户域名；ngrok识别启动/转发日志。日志显示ready只证明客户端连接状态，不证明Public Hostname或公网请求已端到端验证。
5. 当前进程退出清空URL/running。旧进程的迟到日志或exit不会清掉新状态；未就绪启动被stop取消并reject。

## 停止、超时和失败
默认就绪等待25秒。共享停止辅助在非Windows先TERM，1.5秒后尝试KILL，3秒未退出则reject；Windows先用taskkill结束树，启动失败时尝试TERM。signal发送失败不能直接标记退出。

已有pid的error仍走停止等待；没有成功spawn的error可以清理失败状态。替换必须等旧进程确认退出。停止失败会阻止后续替换，需要人工核对残留进程或重启主机，不能因为URL字段已清空就断言公网连接必然关闭。

Named Token必须传给cloudflared命令行，因此可能对有本机进程查看权限的人可见；日志在逐pipe增量遮盖完整Token后再裁剪，分块前缀暂扣；结束时不输出未完成前缀。ngrok Authtoken放在子进程环境，不放argv。两者都不是秘密存储系统，勿将完整进程信息或凭据粘贴到公开日志。

## 验证与排查
`tunnel`、`tunnelLifecycle`和`bridgeTunnel`测试覆盖解析、进程引用/代次、停止失败及API结果；进程事件fixture不等于Windows进程树或真实公网验收。

排查顺序：二进制可用 → 提供商选项正确 → 本机MCP健康 → 客户端日志就绪 → 公网OAuth/认证MCP请求成功。详细安装方式见[隧道指南](../../../../docs/guides/隧道使用指南.md)。

## 残留检测首包（R5）

新启动的quick/named/ngrok增加私有归属记录，只读检测入口见`scripts/tunnel-residue.js`。记录在当前OS用户home的`.webagent/tunnel-processes-v1`，不含Token/argv；模块解释与边界见[只读归属](停止进程详解.md)。只读检测本身不改变Bridge、URL或任何目标进程；另有下述Windows本机确认回收入口，尚无图形按钮；旧版无记录、包装脚本、查询失败等明确不能确认。Windows/Linux有身份查询，其他平台保守unknown。不要把磁盘记录或疑似残留状态当成终止授权。

R5记录完整性续包：Windows新收据使用CurrentUser DPAPI，封装失败不落回明文；v1仍只读且unverified，v2验证后报告os-user-protected。此标签不是WebAgent来源证明或终止授权，检测报告的清理标志仍禁用；实际终止必须走独立本机确认和原生句柄复核。

## Windows本机确认回收

零参数交互终端运行`scripts/tunnel-cleanup.js`。仅接受DPAPI验证且有界完整扫描中的记录；同一原生句柄核对目标创建时间/映像路径/原始父PID，任何仍存活的宿主都阻止清理。仅cloudflared.exe/ngrok.exe直接子隧道根进程，包装器/重命名程序/旧明文/无记录项跳过；不调用stopTunnel、不按进程名/端口枚举或taskkill进程树。

预览60秒有效，本机输入RECYCLE才会重读记录指纹并在持有的目标句柄上再次核对、终止和观察退出。权限/身份不确定即跳过，结果未知不自动重放。DPAPI不隔离同用户恶意代码/管理员，TTY也不是防自动化的人类身份认证；无HTTP/MCP清理接口、不提权。图形按钮、非Windows回收及真实隧道桌面验收仍待。完整合同见[句柄回收](停止进程详解.md)。

R5第五包：helperDiagnostics在既有WEBAGENT_DEBUG_PROCESS=1下记录有界脱敏辅助阶段，不记录收据/参数/路径/输出正文，默认关闭；不改8秒期限或unknown保护，历史Windows22根因仍待。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [cloudflared.js](cloudflared.js) | 44 个函数/类节点 |
| [helperDiagnostics.js](helperDiagnostics.js) | 6 个函数/类节点 |
| [ngrok.js](ngrok.js) | 25 个函数/类节点 |
| [processIdentity.js](processIdentity.js) | 15 个函数/类节点 |
| [receiptProtection.js](receiptProtection.js) | 14 个函数/类节点 |
| [receiptProtection.ps1](receiptProtection.ps1) | 文件级登记；未做符号完整性证明 |
| [stopProcess.js](stopProcess.js) | 8 个函数/类节点 |
| [tunnelCleanup.cs](tunnelCleanup.cs) | 文件级登记；未做符号完整性证明 |
| [tunnelCleanup.js](tunnelCleanup.js) | 28 个函数/类节点 |
| [tunnelCleanup.ps1](tunnelCleanup.ps1) | 文件级登记；未做符号完整性证明 |
| [tunnelRegistry.js](tunnelRegistry.js) | 27 个函数/类节点 |
<!-- docs-inventory:end -->
