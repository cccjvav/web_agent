# agent-host：产品后端npm包

## 职责与启动
这是现行后端包：本机API/Chat、认证MCP、文件工具、命令、会话和可选隧道。自绘工作台由本进程提供；网页VS Code模式由启动脚本关闭其3000端口，将UI交给code-server。

从本目录执行：

```sh
npm ci
npm start
```

指定工作区和端口时优先使用仓库启动入口，参见[启动说明](../../启动脚本说明.md)。直接require整个包不是受支持启动方式：package.json的main仍指向不存在的根index.js，真实入口由scripts.start指定为src/index.js。

## 清单与目录分工
| 项目 | 职责 |
|---|---|
| `src/` | 启动组装、运行时模块与工具；见src说明 |
| `scripts/run-tests.js` | 测试发现/顺序、筛选、独立进程、超时和汇总 |
| `tests/` | 模块、HTTP/WS、进程及界面fixture；不是全部平台E2E |
| `package.json` | scripts.start/scripts.test、Node要求和依赖 |
| `package-lock.json` | 锁定依赖树；应与package.json一起更新 |

运行依赖为Express、ws、cors、diff。**开发依赖含Acorn**，用于文档结构检查；不能再写“无devDependencies”。只安装production依赖可用于部分运行入口，但不足以执行完整文档/测试流程。

包清单version不是产品展示版本：展示版本由src/extensionVersion.js读取扩展清单。支持范围以engines及实际CI为依据，不因包能安装就断言所有Node版本已验收。

## 执行流程与边界
scripts.start加载src/index.js，组装共享配置与模块，默认监听UI 3000和MCP 48271。默认回环地址；公共MCP认证与本机控制面分开。admin-host是另一独立服务，不由本包自动启动。

环境与初始化副作用见[src入口说明](src/README.md)；数据持久化保证以[models](src/models/README.md)为准，不能统一推广为所有JSON原子存储。

## 验证
`npm test`运行完整测试；`npm test -- --filter=oauth`只运行文件名匹配项，不等于完整验收。缺依赖/非法参数/零匹配应失败。默认单文件120秒，WEBAGENT_TEST_TIMEOUT_MS允许1000–600000毫秒。详细测试分类见[tests](tests/README.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
