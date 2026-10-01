# 用户脚本

| 文件 | 作用 |
|---|---|
| [webagent-connection.user.js](webagent-connection.user.js) | 可选的 Tampermonkey/Violentmonkey 脚本：在已登录的 `https://arena.ai` 页面点击后生成最小页面摘要（来源、页面类型、路径 SHA-256、时间），由你手动复制到工作台“连接核对”。不联网、不拦截请求、不读取 Cookie/JWT，也不推测模型身份。 |

摘要格式与主机端校验见[受控工具与工作流详解](../agent-host/src/utils/受控工具与工作流详解.md#connectioncheck连接证据而非模型身份)，使用步骤见[使用指南](../../使用指南.md)。脚本原先放在已删除的 `arena-model-probe/` 目录里（F122 删除探针时迁到这里），内容未改。

`connectionCheck.test.js` 在隔离的 vm 里运行本脚本，确认不自动采集、不发网络请求、导出内容不含路径原文与查询参数。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [webagent-connection.user.js](webagent-connection.user.js) | 3 个函数/类节点 |
<!-- docs-inventory:end -->
