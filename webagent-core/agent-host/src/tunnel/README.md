# 隧道：把认证MCP入口映射到公网

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

Named Token必须传给cloudflared命令行，因此可能对有本机进程查看权限的人可见；日志会替换Token。ngrok Authtoken放在子进程环境，不放argv。两者都不是秘密存储系统，勿将完整进程信息或凭据粘贴到公开日志。

## 验证与排查
`tunnel`、`tunnelLifecycle`和`bridgeTunnel`测试覆盖解析、进程引用/代次、停止失败及API结果；进程事件fixture不等于Windows进程树或真实公网验收。

排查顺序：二进制可用 → 提供商选项正确 → 本机MCP健康 → 客户端日志就绪 → 公网OAuth/认证MCP请求成功。详细安装方式见[隧道指南](../../../../隧道使用指南.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [cloudflared.js](cloudflared.js) | 39 个函数/类节点 |
| [ngrok.js](ngrok.js) | 22 个函数/类节点 |
| [stopProcess.js](stopProcess.js) | 8 个函数/类节点 |
<!-- docs-inventory:end -->
