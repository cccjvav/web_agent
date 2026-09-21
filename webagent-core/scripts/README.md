# 网页VS Code与桌面扩展启动编排

四个JS实现的全部函数、认证与进程回调：[编辑器编排详解](编辑器编排详解.md)。


## 职责与文件
本目录为code-server或桌面扩展准备环境，不实现MCP或本机Chat业务。经典工作台不需要code-server。

| 文件 | 职责 |
|---|---|
| `ensure-code-server.js` | 查找/下载指定版本code-server、补必要运行依赖、同步扩展并生成扩展位置清单 |
| `run-code-oss.js` | 校验工作区、准备后端依赖、启动agent-host和code-server、协调退出 |
| `codeServerAuth.js` | 决定网页VS Code密码模式、生成/复用密码以及本机trusted origins |
| `install-desktop-extension.js` | 将规范扩展复制到桌面VS Code/Insiders扩展目录并清理旧版副本 |

## 执行流程
1. run-code-oss从参数/WORKSPACE_ROOT/默认目录选工作区，不存在则拒绝；安装器在其外层还负责用户runtime和工作区解析。
2. ensure准备code-server运行时，缺依赖时可能访问npm；仅存在下载目录不代表安装完整。
3. 同步扩展后启动agent-host，设WEBAGENT_SKIP_WORKBENCH=1，默认只占MCP端口48271；health共享15秒总期限及取消信号，收到200也会释放连接；它不认证实际实例/工作区。
4. code-server占默认3000，载入工作区、扩展目录和用户设置；配置/启动失败、主机退出（包括0）或停止信号统一取消探测并清理本轮直接子进程。保留对象而非按PID另起taskkill；9秒宽限后必要时force，再观察1秒，未确认退出须非零并明确提示，不自动重启/按名称或端口补杀。

这不是全部进程树退出保证：npm脚本、code-server worker、PTY和隧道等孙进程及用户窗口仍须单列验收；不会回滚已写目录/口令，也不把unref当终止。同步ensure/npm准备不计入15秒健康检查预算。

安装版由installer/launch.js从用户可写runtime执行，并注入WEBAGENT_USER_DATA_DIR以保留code-server用户数据。源码模式回退仓库.local/share/code-server；不能把源码默认路径写成所有安装模式的路径。

## 密码、信任与安装边界
codeServerAuth默认password，优先环境CODE_SERVER_PASSWORD，再复用用户数据中的webagent-password，没有则生成。CODE_SERVER_AUTH=none是显式关闭，不是默认。trusted origins不是通配符，也不是整个产品的MCP认证系统。

默认不禁用workspace-trust。安装桌面扩展不会自动安装VS Code、登录模型或启动后端；还需打开与agent-host相同的工作区并重载扩展。

下载、npm安装和实际code-server启动受网络、Node/系统版本影响。日志和口令文件应保密；清单路径是本机生成信息，不应把本机绝对路径硬编码到跨机器包中。

## 验证
codeServerAuth、codeServerNotRunnable、skipWorkbench、desktopExtension、extensionCopy检查配置、入口和副本；codeServerLifecycle另用真实HTTP/Node子进程与受控故障验证启动期限/取消及直接子进程收尾。真实Windows code-server和原生VS Code会话仍需端到端验证；不能以参数字符串存在推断启动成功。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [codeServerAuth.js](codeServerAuth.js) | 2 个函数/类节点 |
| [ensure-code-server.js](ensure-code-server.js) | 28 个函数/类节点 |
| [install-desktop-extension.js](install-desktop-extension.js) | 7 个函数/类节点 |
| [run-code-oss.js](run-code-oss.js) | 37 个函数/类节点 |
<!-- docs-inventory:end -->
