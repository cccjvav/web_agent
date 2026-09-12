# Windows安装、用户运行时与升级边界

精细复盘：[Inno全部声明与事件](安装声明详解.md)。


继续逐函数阅读：[launch.js 与 package.js 详解](函数详解.md)；实际运行见[Conda 环境说明](../Conda环境说明.md)。

## 职责与文件
| 文件 | 作用 |
|---|---|
| `package.js` | 从显式白名单构建output/payload与installation.json SHA-256清单 |
| `webagent.iss` | Inno Setup安装定义、入口/PATH及安装前检查 |
| `build-installer.cmd` | 先stage，再调用Inno Setup 6编译 |
| `launch.js` | 无依赖Node启动器，准备用户runtime、解析工作区并启动所选模式 |

## 执行流程
1. 在仓库根运行node installer/package.js，stage只收录产品白名单，不递归打包整个checkout。用户workspace、后台data、node_modules、冻结原型和私密管理资料排除；C#源码等Add-Type依赖必须随包。
2. ISCC只读取payload。installation.json检测内容损坏，不是数字签名，也不是发布者身份认证。
3. 安装版launch读取manifest，以其hash命名用户releases目录；首次复制逐文件校验并在临时目录完成后发布.ready。已有.ready副本直接复用，**不是每次启动都重新校验全部文件**。
4. 依赖与code-server下载在该用户可写runtime中进行，不写Program Files。源码checkout没有installation.json，仍在checkout运行。

## 路径与数据归属
程序安装目录用于静态文件；默认用户根为LOCALAPPDATA/WebAgent，可由WEBAGENT_DATA_HOME覆盖。

| 数据 | 默认位置/策略 |
|---|---|
| runtime | releases/<manifest-hash> |
| 默认工作区 | workspace；显式参数或WORKSPACE_ROOT优先 |
| code-server设置/密码 | code-server目录，跨升级保留 |
| 统计后台 | admin目录 |
| App窗口启动日志 | startup.log |

显式相对工作区相对于调用者cwd解析；传文件取父目录；不存在的显式路径拒绝，缺省路径可创建；Windows盘符根分隔符不随意裁掉。被编辑工作区自身的.webagent配置与用户runtime不是同一层数据。

## 模式、升级与卸载
classic启动自绘工作台；vscode启动code-server编排；app后台启动并等待healthz（当前探测3000端口，最多120秒）后打开窗口；admin启动独立后台；extension侧载桌面扩展。

升级保留用户数据与旧runtime，不自动迁移旧安装目录中的workspace。升级前备份并显式选择用户可写工作区。卸载不删除LocalAppData/WebAgent；彻底清理要先备份，不触碰其他用户目录。PATH按分号条目规范比较，不按子串删除同前缀目录。

## 失败与验收
首次复制校验失败清理临时目录；npm或编译失败应非零退出。Inno缺少ChineseSimplified.isl时仅保留标准英文向导，不把缺语言包冒充可用中文向导。

installerPackaging验证白名单、私密fixture不入包、runtime路径和重要声明；Windows CI编译输入C#、解析PS并编译安装器。普通用户安装/升级迁移/卸载、PATH和浏览器窗口的实际效果仍需Windows实机验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [build-installer.cmd](build-installer.cmd) | 文件级登记；未做符号完整性证明 |
| [launch.js](launch.js) | 21 个函数/类节点 |
| [package.js](package.js) | 4 个函数/类节点 |
| [webagent.iss](webagent.iss) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
