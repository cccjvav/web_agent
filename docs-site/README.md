# 架构 / 源码可视化导览

把仓库根的 **架构导读**、**技术实现**、**总览**、**组件说明**，以及各夹行级 README 收成一套可点的 HTML。不另写实现；正文来自那些 Markdown。

## 收录范围

站内嵌的是：架构导读、技术实现、总览、组件说明、以及清单自动发现的源码目录README、维护规范与源码符号索引。旧FILE_DOCS保留历史页面ID，新目录不再依赖手填该列表。

**不**嵌进站点的：根目录用户操作指南（[使用指南.md](../使用指南.md)、[隧道使用指南.md](../隧道使用指南.md)、[技能使用指南.md](../技能使用指南.md)、[启动脚本说明.md](../启动脚本说明.md)、网页 DeepSeek / Chat Plus / VS Code 指南）。那些以仓库根 Markdown 为准。

## 打开（Windows CMD）

在仓库根：

```bat
node docs-site\serve.js
```

浏览器打开 **http://127.0.0.1:4173/**

启动时会重新跑 `build.js`，所以改过 `架构导读.md` / `技术实现.md` 后只要重启这个进程。

Linux / macOS：

```bash
node docs-site/serve.js
```

不要和 `run-webagent.cmd` 抢端口：导览默认 **4173**，工作台仍是 3000。

## 页面

| 页 | 看什么 |
|---|---|
| 全景图 | 远端 / 车间 / 店堂三层；路径 A/B/C；一次 apply_patch |
| 架构导读 | 每节四层卡片（人话、比喻、文件、行业叫法） |
| 代码直译 | `技术实现.md` 全文 + 左侧目录 |
| 知识图谱 | `总览.md` |
| 工作流 | `组件说明.md` |
| 文件夹说明书 | 各子夹 README |
| 术语 | 导读第 12 节 |

## 文件

| 文件 | 职责 |
|---|---|
| `index.html` / `styles.css` / `app.js` | 壳 |
| `build.js` | 把 Markdown 打成 `content.js`（无 npm 依赖） |
| `serve.js` | 先 build，再在 **127.0.0.1:4173** 提供静态页（`DOCS_HOST` 可覆盖）。路径必须落在本目录内（`ROOT + sep`）；畸形URL、非法百分号编码/NUL返回400而不退出进程。`DOCS_PORT=0`可用于测试，日志显示实际监听端口。侧栏链到 `#/guide` 等站内 hash，**不**链 `../架构导读.md`（那个路径 404） |
| `content.js` | 生成物；不要手改 |

改导读或行级 README 后：再执行一次 `node docs-site/build.js` 或重启 `serve.js`。`npm test` 末尾的 `docsSite.test.js` 会再跑一遍 build，并断言提交的 `content.js` 没有漂移（`builtAt` 只精确到日期）。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 48 个函数/类节点 |
| [build.js](build.js) | 26 个函数/类节点 |
| [check-docs.js](check-docs.js) | 17 个函数/类节点 |
| [documentation.config.json](documentation.config.json) | 文件级登记；未做符号完整性证明 |
| [index.html](index.html) | 文件级登记；未做符号完整性证明 |
| [serve.cmd](serve.cmd) | 文件级登记；未做符号完整性证明 |
| [serve.js](serve.js) | 3 个函数/类节点 |
| [styles.css](styles.css) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->

## 文档工程入口
唯一规范见[文档维护规范](../manager/docs/documentation.md)。`documentation.config.json`定义范围/排除理由；`check-docs.js`从git文件集合重新发现源码，Acorn提取JS结构，`--write`生成清单、索引与README受管理导航区，默认模式只读检查。运行前需`npm ci --prefix webagent-core/agent-host`安装开发依赖。

`documentation-manifest.json`和`source-index.md`是自动产物，不直接修改。改源码/README后先生成清单再build；build消费清单，不代替覆盖检查。JS之外暂只登记文件，不声称跨语言符号完整。受检链接仅内联本地文件目标，不是全网链接/全部标题锚点认证。

源码快照视图只展示构建时按清单采集的文件，不增加读取任意磁盘路径的HTTP接口。源码以textContent显示，函数索引跳转到对应行并高亮。测试fixture不嵌入content.js，避免随安装包分发；清单仍记录其归属与AST结构。快照hash不匹配时build拒绝生成，要求先审查并刷新清单。
