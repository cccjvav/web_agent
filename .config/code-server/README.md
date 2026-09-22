# code-server配置的来源与优先级

## 职责与入口

`.config/code-server/config.yaml`是可选网页VS Code进程的配置路径，不是MCP实现，也不是经典工作台配置。调用链为`run-webagent-vscode.cmd` → `installer/launch.js vscode` → `webagent-core/scripts/run-code-oss.js` → code-server；app入口也复用这条编排。经典工作台不启动该运行时。

本页描述**源码中的发行模板和启动参数**，不读取或宣称核对过用户真实YAML、密码文件。目录还包含本README，不能用固定“只有一个文件/共五行”描述用户的实际配置。

## 默认配置与生效值

安装打包器`installer/package.js`生成中性模板，不复制操作者的真实配置或密码：

| 模板键 | 发行默认 | 启动参数与边界 |
|---|---|---|
| bind-addr | 127.0.0.1:3000 | 编排另传`--bind-addr`，由WEBAGENT_BIND与CODE_SERVER_PORT决定，默认仍回环3000 |
| auth | password | 编排另传`--auth`；CODE_SERVER_AUTH=none才显式关闭，其他值走password |
| cert | false | 此为发行模板值，不认证用户自定义TLS或HTTPS启动链 |
| disable-telemetry | true | 编排同时传关闭开关 |
| disable-update-check | true | 编排同时传关闭开关 |

`run-code-oss.js`传`--config`指向本路径，也传本机trusted origins、应用名、工作区、用户数据与扩展目录。命令行覆盖的槽位不能只靠修改YAML改变；未传禁用workspace-trust的开关。

## 口令与用户数据

`codeServerAuth.resolveAuth`先取非空CODE_SERVER_PASSWORD；此分支**不写密码文件**。否则复用/生成当前userData下的webagent-password，再通过PASSWORD环境传给code-server。userData优先WEBAGENT_USER_DATA_DIR；源码默认仓库`.local/share/code-server`，安装器会指向用户可写runtime。不是所有入口都写源码仓库，也不应把该口令提交Git。

CODE_SERVER_AUTH=none时没有PASSWORD要求，不能再说浏览器一定先看到登录页。编排可能显示口令用于本机登录，分享日志前需清除敏感内容。本配置不会改agent-host的AGENT_HOST_PORT（默认48271）。

## 验证与限制

对照`installer/package.js`中性模板、`codeServerAuth.js`和`run-code-oss.js`的实际参数；codeServerAuth/installerPackaging/codeServerLifecycle测试验证分支和打包。没有读取个人配置、检查真实口令权限或运行用户code-server/TLS，实际文件内容和桌面结果需在本机核对。
