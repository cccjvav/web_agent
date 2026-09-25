# 后端进程组装与共享配置

逐函数阅读：[运行配置详解](运行配置详解.md)。


逐函数阅读：[index.js 初始化与回调详解](入口详解.md)。

## 职责与文件
本层负责把子模块装成服务，不重复实现MCP或工具业务。admin-host在另一个目录和进程中，默认4174；文档站默认4173，二者都不是这里自动创建的服务器。

| 文件 | 主要职责 |
|---|---|
| `config.js` | 单例工作区/端口/身份/隧道状态；persistIdentity加载或保存连接密钥和安装ID |
| `extensionVersion.js` | 从扩展package.json读取展示版本，失败或版本格式不合法时明确报错 |
| `index.js` | 加载模块、初始化身份和统计、组装两套Express/HTTP及WS，处理监听错误 |

## 配置入口
| 环境项 | 作用 | 默认 |
|---|---|---|
| WORKSPACE_ROOT | 被编辑项目的根目录 | 源码仓库根目录 |
| AGENT_HOST_PORT | MCP/API端口 | 48271 |
| WORKBENCH_PORT | 自绘工作台端口 | 3000 |
| WEBAGENT_BIND | 监听地址 | 127.0.0.1 |
| WEBAGENT_SKIP_WORKBENCH | 为code-server让出UI端口 | 非1时不跳过 |

config.secretKey/installId先产生内存值，再由persistIdentity用磁盘配置替换或写回。generateNewSecret先保存再更新内存，存储失败抛错并保留旧内存凭据；成功返回也不等于fsync或跨进程事务。

## 执行流程与路由边界
```text
启动入口 → config / 模块加载 → persistIdentity → reporter
  ├─ uiApp：health → 本机API → 工作台静态页/SPA → uiServer上的WS
  └─ mcpApp：公共门禁/解析 → health/OAuth → 复验Origin/认证的MCP → 仅本机可用的API
```

两端口都对API使用localControl与跨站检查；MCP端口不挂工作台静态页。WS只挂uiServer，在upgrade校验本机来源和Origin，连接后的首事件不包含secretKey。

applyCommon关闭x-powered-by、设置no-store；/api先做本机与跨站检查，MCP端口/mcp先硬拒绝不允许的Origin，再CORS（允许预检可结束）和有效路径认证，最后才解析正文。普通JSON限20MiB，OAuth JSON/表单64KiB、表单最多32参数；未知路径不保证经过认证。路由仍复验并按自身语义验证，完整顺序见入口详解。listen错误（包括端口占用）会打印并退出，不应把日志已输出当作服务已监听。

**初始化顺序**：直接启动index.js时，先检查工作区存在且为目录，再加载MCP/API等模块并persistIdentity；显式错误目录不会为了保存身份而创建。Windows启动器也验证显式工作区，但安装版默认用户工作区首次创建是单独分支，不将两条路径混称为一条。

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
| [index.js](index.js) | 24 个函数/类节点 |
<!-- docs-inventory:end -->
