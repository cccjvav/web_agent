# WebAgent Probe Companion 0.3.0

本项目的目标是**完整保留原型探测能力，为你提供模型参考**，不要求绝对真实。0.3.0在0.2原型分析基础上加入Trace Inspector证据导入，不再只有连接核对；完整浏览器控制、历史与自动化等仍在实施，不能把本版称作“完整版已完成”。具体进度见源码根目录《探针完整整合实施与验收.md》。Chat模式API背后的模型确切验证排在完整探针整合之后。

## 本版能做什么

- 在VS Code选择模型观测JSON，离线运行原型的SSETap、模型候选排序、协议与行为参考、命名解析、指纹向量和tokenizer参考。
- 处理观测提供的UUID映射，指出同ID不同名称的冲突，不强选一个；显示原始来源、截断与未核验状态。
- 每次分析独立Worker，不把上一次请求的证据/映射混进本次。未上传文件正文到WebAgent或任何模型API。
- 继续使用本机连接核对和打开WebAgent Bridge；两扩展ID不同，可以并装。

这不是重新写一套算法：VSIX白名单包含原型的registry/classify/probe/learned/interceptor五个源文件及其SHA256。本版只调用离线分析函数，没有调用网络钩子、自动启动入口、后台轮询或主动提问题组。题库/规则可能包含敏感测试文本，本版不会向模型发送它们。算法本身未统计校准，参考分不是身份正确率。

## 安装（桌面VS Code）

已拿到VSIX，直接在扩展面板“…”→“从VSIX安装”选择0.3.0安装包。与WebAgent在同一个Profile启用。原本安装0.1.x时使用同一扩展ID升级，不另建副本。

从源码构建时，在VS Code集成CMD、既有Conda环境执行：

```cmd
conda activate 你的既有环境名
python webagent-core\probe-extension\package_vsix.py --verify
code --install-extension webagent-core\probe-extension\dist\webagent-probe-companion-0.3.0.vsix
```

使用Python标准库，无pip依赖、不新建venv、不自动发布Marketplace或安装到Windows产品包。没有`code`命令时使用上述界面安装。

## 模型参考分析：具体操作

1. 在受信任的本机桌面工作区中，按Ctrl+Shift+P，执行`WebAgent Probe: 分析模型线索文件（离线参考）`。
2. 选择你有权处理的本地模型观测JSON。可以先选择源码中的`sample-observation.json`了解格式，它是**合成示例，不是真实会话**。
3. 查看“WebAgent Probe · 模型参考与连接核对”输出频道。结果含候选、备选、协议、来源、映射冲突、指纹与截断提示。RESOLVED只表示解析/匹配到了标识，不是认证。
4. 每次只分析选定文件，不扫描工作区、不自动读剪贴板。不会把原文复制到输出结果，但模型字段本身也可能含私密数据；不是通用脱敏器，请自行核对输入内容权限。
5. 本版暂不保存分析历史或自动导出。关闭/重载扩展会取消Worker，不复播分析；10秒计算预算不含文件打开/读取时间。

### 文件格式

模型观测与原来的五字段连接摘要是两个不同契约，不能混用；**原型完整dump不能直接当此格式导入**，浏览器侧自动转换/接入仍待完成。

```json
{
  "schema": "webagent-model-observation/v1",
  "requestId": "example-not-a-real-session",
  "observedAt": "2026-09-15T00:00:00Z",
  "origin": "https://arena.ai",
  "truncated": false,
  "evidence": [],
  "text": "data: {\"model\":\"reference-example-model\"}\n\n"
}
```

必需字段如上。requestId只用于本次报告关联，不是认证标识；历史文件可分析，不套用连接摘要10分钟时效。evidence可填`{ "source": "response.header.model", "modelId": "名称" }`等来源，允许来源列于analysis.js，分数由原引擎决定，不接受用户指定weight。可选models为`[{"id":"UUID","publicName":"名称"}]`，只影响本次分析。可选promptTokens/completionTokens/reasoningTokens/ttftMs/totalMs/frames用于指标与向量。tokenizer只有在输入确实为原型基准文本时才可解释；普通对话的token计数不能当基准。

当前输入上限256KiB、text最多200000字符；SSETap仍保留原型解析预算，超限要显示parserLimit/truncated。Worker内存预算及计算超时用于防止卡住VS Code，不是OS安全沙箱。**这些限制可能漏线索；完整整合仍需配置化采样与流式处理，不宣称本版无损。**

## 连接核对与WebAgent配合（原有功能保留）

1. 启动本机WebAgent。菜单“打开配套诊断”可查看主机/工作区、导入摘要、复制挑战、查询或丢弃记录。
2. 共用`webagent.agentHostUrl`，默认`http://127.0.0.1:48271`，只允许回环HTTP根地址；localhost固定为127.0.0.1，不跟随重定向。分析文件功能不需要此服务，也不需要模型API。
3. 用独立`arena-model-probe/webagent-connection.user.js`导出五字段摘要，再从配套菜单导入。不要粘贴模型观测JSON或登录信息。
4. 显式确认后复制一次性挑战给**已连接的外部MCP客户端**调用confirm_connection；本扩展不会自我确认。剪贴板历史可能保留挑战，不自动改写用户后续剪贴板内容。
5. 查询echo-confirmed只说明该已认证会话持有挑战，不是模型身份认证。配置变化后旧记录仍绑定旧地址/实例；主机变更或过期后需重新创建。
6. 丢弃只清本扩展内存，不全局DELETE主机记录；主机按2分钟TTL清理。失败不自动重试POST，避免重复创建，主机最多8条。

目前拒绝浏览器版/code-server及SSH/WSL/容器远程窗口，避免把“本机”指错。完整整合目标不因此缩减，跨环境支持需明确设计/验收。

## 验证与剩余项

源目录《实现详解.md》解释函数和测试。本版新增真实原型分析的离线测试、取消与并发隔离，以及VSIX共享源码/独立运行检查。它们不证明真实站点的模型准确率，也不代替VS Code桌面安装、浏览器联动或完整能力验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [analysis.js](analysis.js) | 13 个函数/类节点 |
| [analysisWorker.mjs](analysisWorker.mjs) | 8 个函数/类节点 |
| [browserReference.mjs](browserReference.mjs) | 11 个函数/类节点 |
| [client.js](client.js) | 9 个函数/类节点 |
| [extension.js](extension.js) | 12 个函数/类节点 |
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
| [package_browser.py](package_browser.py) | 文件级登记；未做符号完整性证明 |
| [package_vsix.py](package_vsix.py) | 文件级登记；未做符号完整性证明 |
| [sample-observation.json](sample-observation.json) | 文件级登记；未做符号完整性证明 |
| [traceInput.js](traceInput.js) | 6 个函数/类节点 |
<!-- docs-inventory:end -->

## 0.3双引擎与浏览器包
现支持arena-trace-inspector证据抽屉“下载证据 JSON”的单run文件；不是批量会话历史或原始trace。逐span复用Inspector白名单/用量算法和Probe分类/命名，不合并同型号不同调用，不假造没有的正文/分词基准。浏览器整合包以Inspector为唯一采集器，同时显示Probe参考；操作与限制见[浏览器整合说明](浏览器整合说明.md)。VSIX不启动浏览器/网络，浏览器包需用户另行安装并明确开启监听。
