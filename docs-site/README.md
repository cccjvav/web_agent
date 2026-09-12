# 文档站：正文、索引与源码快照的只读展示

非JS实现复盘：[全部CSS规则组](样式规则详解.md)。


精细实现复盘：[清单与构建逐函数](清单与构建详解.md) · [浏览与服务逐函数](浏览与服务详解.md)。


新增阅读入口位于“运行与验收”“源码复盘”分组：Conda 环境、当前人工验收清单、代码复盘路线及首组逐函数讲解；这是正文资料，不是自动符号名翻译。

## 职责与文件
文档站不是工作台，也不运行Agent工具。正文来自仓库Markdown，不在content.js手工维护另一份解释。

| 文件 | 职责 |
|---|---|
| documentation.config.json | 纳入源码、排除理由与额外页面配置 |
| check-docs.js | 重新扫描git文件集合，校验README归属/链接并生成结构产物 |
| documentation-manifest.json | 自动hash、文档归属及JS AST结构，不是语义审查证书 |
| source-index.md | 自动源码/符号索引，行号对应hash快照 |
| build.js | 保留历史页面ID，自动收录清单中的README，转换Markdown及源码快照 |
| index.html / app.js / styles.css | 文档浏览壳、导航、搜索与源码展示 |
| content.js | 构建生成物，不直接修改 |
| serve.js / serve.cmd | 重建后提供本目录静态文件，默认回环4173 |

## 生成与启动流程
先安装开发依赖，审查对应源码和正文，再从仓库根运行：

```sh
npm ci --prefix webagent-core/agent-host
node docs-site/check-docs.js --write
node docs-site/build.js
node docs-site/serve.js
```

打开http://127.0.0.1:4173。serve会运行build，但不会替你刷新过期的源码清单；build发现源码hash漂移会拒绝生成。DOCS_HOST/DOCS_PORT可覆盖监听，文档预览与产品本机控制面不是同一服务。

## 页面与阅读路径
- 架构导读：发生了什么、为什么这样拆。
- 技术实现：跨模块执行链和关键边界，不再逐函数复制所有README。
- 文件夹说明书：模块职责、分工、错误路径、验证与本页目录。
- 维护规范/源码索引：规则和自动定位；源码快照按行高亮，使用textContent而非执行源码HTML。
- 总览、组件说明、历史文档统计：各自保留定位，历史计数不当作当前质量分数。

实际收录由build的兼容列表、清单归属和extraSiteDocs共同决定。**启动脚本说明已经收录**；不能继续写成站外文档。使用指南、各第三方客户端教程等未全部内嵌，以根Markdown为准。

## 安全与质量边界
静态服务器不新增任意仓库路径读取接口，路径必须位于docs-site范围。源码快照来自配置纳入文件，hash一致才生成；测试fixture正文不嵌入可能随安装包发行的content.js，仅保留结构和归属。

JS/CJS/MJS用Acorn提取节点；其他语言只有文件级登记。链接检查范围是受检文档的内联本地文件目标，不证明全部标题锚点、外部URL可用或正文准确。排版和语义必须另外审查。

## 验证
文档门禁使用documentationPolicy的真实清单检查及负例；documentationQuality检查本次关键契约、表格/围栏及本页目录函数fixture；docsSite验证生成一致性、归属导航和快照hash；docsHttp验证畸形URL及正常请求。浏览器窄屏/键盘/视觉效果仍需实测，不以生成成功代替。

规范见[文档维护规范](../manager/docs/documentation.md)，正文质量审查见[本次审查](../review/DOC_QUALITY_2026-09-12.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 50 个函数/类节点 |
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
