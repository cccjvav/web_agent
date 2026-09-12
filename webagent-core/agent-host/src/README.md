# 后端进程组装与共享配置

逐函数阅读：[index.js 初始化与回调详解](入口详解.md)。

## 职责与文件
本层负责把子模块装成服务，不重复实现MCP或工具业务。admin-host在另一个目录和进程中，默认4174；文档站默认4173，二者都不是这里自动创建的服务器。

| 文件 | 主要职责 |
|---|---|
| `config.js` | 单例工作区/端口/身份/隧道状态；persistIdentity加载或保存连接密钥和安装ID |
| `extensionVersion.js` | 从扩展package.json读取展示版本，失败时使用代码里的回退值 |
| `index.js` | 加载模块、初始化身份和统计、组装两套Express/HTTP及WS，处理监听错误 |

## 配置入口
| 环境项 | 作用 | 默认 |
|---|---|---|
| WORKSPACE_ROOT | 被编辑项目的根目录 | 仓库workspace |
| AGENT_HOST_PORT | MCP/API端口 | 48271 |
| WORKBENCH_PORT | 自绘工作台端口 | 3000 |
| WEBAGENT_BIND | 监听地址 | 127.0.0.1 |
| WEBAGENT_SKIP_WORKBENCH | 为code-server让出UI端口 | 非1时不跳过 |

config.secretKey/installId先产生内存值，再由persistIdentity用磁盘配置替换或写回。generateNewSecret更新内存后尝试落盘，保存失败目前被捕获；不能保证每一次换钥匙都已持久化。

## 执行流程与路由边界
```text
启动入口 → config / 模块加载 → persistIdentity → reporter
  ├─ uiApp：health → 本机API → 工作台静态页/SPA → uiServer上的WS
  └─ mcpApp：CORS → health/OAuth → 认证MCP → 仅本机可用的API
```

两端口都对API使用localControl与跨站检查；MCP端口不挂工作台静态页。WS只挂uiServer，在upgrade校验本机来源和Origin，连接后的首事件不包含secretKey。

applyCommon关闭x-powered-by，设置no-store，JSON请求体限20MB；路由再按自己的语义验证。listen错误（包括端口占用）会打印并退出，不应把日志已输出当作服务已监听。

**初始化顺序限制**：直接启动index.js时，persistIdentity先于工作区存在性检查；写配置可能先创建目录。因而不能声称“直接node启动时，不存在的显式工作区一定零副作用拒绝”。仓库Windows启动器会先resolveWorkspace验证，二者不是同一路径。

## 阅读导航
| 任务 | 文档 |
|---|---|
| 人机接口与成功语义 | [api](api/README.md) |
| 远程协议和OAuth | [mcp](mcp/README.md) |
| 模型与Plan | [agent](agent/README.md) |
| 文件、命令和PTY | [tools](tools/README.md) |
| 配置与记忆 | [models](models/README.md) |
| GitHub可选身份 | [auth](auth/README.md) |
| 隧道和公网就绪 | [tunnel](tunnel/README.md) |
| 统计与公共辅助 | [usage](usage/README.md)、[utils](utils/README.md) |

## 验证
httpSmoke、skipWorkbench和auditControl验证双端口及HTTP/WS边界，hostPersist验证部分身份持久化。真实代理、Windows启动和平台路径行为不能仅由这些测试替代。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [config.js](config.js) | 2 个函数/类节点 |
| [extensionVersion.js](extensionVersion.js) | 1 个函数/类节点 |
| [index.js](index.js) | 13 个函数/类节点 |
<!-- docs-inventory:end -->
