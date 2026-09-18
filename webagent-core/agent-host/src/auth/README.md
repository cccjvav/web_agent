# GitHub可选身份验证

逐函数阅读：[GitHub身份详解](GitHub身份详解.md)。


## 职责与入口
`github.js`通过GitHub API确认用户名和用户ID，供Bridge显示可选GitHub身份。它不是模型服务登录，不是MCP OAuth配对；本机Chat不要求先完成此流程。

## 执行流程
- `loginWithToken`临时接收用户PAT，先淘汰旧身份尝试，调用fetchGitHubUser验证；只有返回时仍是当前代次，才由applyGithubUser保存provider、username、githubId及授权标志。PAT不写入config.json。
- `startDeviceLogin`需要WEBAGENT_GITHUB_CLIENT_ID，可选client secret；请求设备码后将带代次的pendingDevice留在内存，新身份操作会使迟到响应失效。
- `pollDeviceLogin`同一尝试单飞，检查HTTP与代次，处理待批准、slow_down（增加建议间隔）、过期和token响应；取得token后查询真实用户并再次核对代次才保存身份。
- `clearGithubKeepDemo`淘汰设备流及其它在途身份结果，明确回到本机演示授权；`resetPending`同样递增代次但不改落盘身份。请求失败本身不能笼统等同自动切换授权状态。

## 边界
没有client ID时设备流不可用；验证用户名不等于验证仓库写权限、订阅权益或MCP客户端授权。设备流是模块级内存状态，重启丢失，不能宣传成多窗口独立持久登录。

fetchGitHubUser的请求失败、非预期数据或无login会报错；实际HTTP deadline能力须看本文件，不自动继承Chat的requestScope包装。

## 验证
githubAuth使用可注入fetch响应验证流程、身份字段、清除/替换时的迟到结果和重复poll单飞。真实GitHub应用设置、网络、跨进程并发和用户授权仍需集成测试。API入口见[api说明](../api/README.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [github.js](github.js) | 16 个函数/类节点 |
<!-- docs-inventory:end -->
