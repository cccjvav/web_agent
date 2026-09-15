# WebAgent Probe Companion 0.5.2

这是给模型身份提供**参考**的工具，不是认证器。它保留 Inspector 的 run/span、字段来源、调用和用量，同时复用 Probe 的字段、UUID、协议、行为、指纹和 tokenizer 算法。分数不是正确率，自报身份不是证明。Chat 模式 API 后端的确切验证仍是后续任务。

## 当前交付范围

- 离线模型观测和 Inspector 单次证据导入：独立 Worker，10秒计算预算，原始响应不输出、不上传。
- 显式浏览器配对 → 本机 WebAgent → VSCode 的实时参考：轨迹和响应样本分别订阅，不硬绑不同请求。
- `probe_links`、`probe_report` 供已认证客户端读取已共享参考；Code 模式 `probe_request` 只提交一次审批。使用已有 `operation_result` 查询结果。
- 浏览器远程 start/stop、改名、归档、题目发送、公开映射刷新全部进入本机 operatorQueue。改名/归档/发送另需当前页面确认；不调用私有写接口，不自动重试未知效果。
- 工作区历史保存/查看/比较/删除、整库导入导出、Inspector 批量历史迁移、协议指纹相似度簇，以及精确 UUID 的追加映射参考。
- 只在用户选择后，把参考放入 WebAgent `/ask` 草稿；仍需用户检查并发送。
- 原来的五字段连接挑战独立保留；实时配对不等于通过挑战，更不证明模型身份。

原版 Probe 的网络启动器不会另行启动；整合浏览器包只有 Inspector 一个 CDP/debugger 所有者。源码题库有不适合主动发送的旧题，整合 UI 已将拒答题替换为安全边界问题，不发送旧危险题；替代题结果与原基准不可直接比较。

## 安装：桌面 VSCode 集成 CMD + 已有 Conda

```cmd
conda activate 你的既有环境名
python webagent-core\probe-extension\package_vsix.py --verify
python webagent-core\probe-extension\package_browser.py --verify
code --install-extension webagent-core\probe-extension\dist\webagent-probe-companion-0.5.2.vsix
```

不创建 venv、不需要 pip 依赖。没有 `code` 命令时，扩展面板“…”→“从VSIX安装”。主机须更新到含本版路由的源码/安装包并重启。浏览器 ZIP 解压后加载其中 `webagent-arena-inspector` 文件夹；停用单独的旧 Probe/Inspector，避免重复采集。详见《浏览器整合说明.md》。测试通过不代表已经在用户 Windows 或实际 Arena 账户验证。

## 实时连接：按这个顺序操作

1. 在桌面 VSCode 打开主机实际使用的本地文件夹，并启用 WebAgent 和 Companion；不支持 Remote/WSL 扩展宿主。设置 `webagent.agentHostUrl` 为实际主机的 `http://127.0.0.1:端口`（默认48271）。
2. 在 Arena 打开已保存的 `/agent/会话ID`，打开整合扩展管理页，复制32位扩展ID。第一次先用浏览器原生“开始监听”，再正常发一条有权测试的消息。
3. Ctrl+Shift+P → `WebAgent Probe: 配对浏览器到当前主机工作区`，输入扩展ID。核对显示的工作区，再确认复制。
4. 打开浏览器整合扩展弹窗，把 JSON 粘贴到密码输入框，点“配对并同步当前会话”，批准可选 localhost 权限。凭据只应粘贴到这个扩展；之后可用普通文字覆盖剪贴板。
5. 点“连接状态”。VSCode 执行 `订阅实时浏览器参考`，选择同一会话，然后选 `trace`（调用轨迹）或 `response`（独立响应样本）。输出窗口更新不是自动保存，需执行“保存本次分析到工作区历史”。
6. 需要控制时执行 `申请浏览器操作`；或在浏览器选择题目/刷新映射。随后在 VSCode 执行 `审批一次浏览器操作`，核对不可变的完整动作和文本。提交申请不等于执行。
7. 网页出现确认框时再次核对。题目成功仅表示浏览器报告点击发送，**不表示模型已完成回答**。归档同时删除该会话的浏览器本地记录，既有 VSCode 历史不会联动删除。
8. 用 `取消浏览器操作` 取消队列请求；用 `停止实时参考订阅` 停止 VSCode 读取；用 `撤销浏览器配对` 撤销共享。这是三种不同操作。取消可能晚于副作用，不承诺回滚。

配对15分钟、主机最多4个配对、每个配对绑定首次同步的一个 tab、最多100次操作申请；参考15秒没有更新即过期。浏览器轮询2秒，MV3 可能休眠，主机/扩展重启需要重新配对，不伪装永久在线。配对允许本机主机及其已认证 MCP 客户端读取共享的模型标签/参考；这不是加密保险箱，也不隔离同机其他进程。

## 离线观测和 tokenizer

命令 `分析模型线索文件（离线参考）` 支持 `sample-observation.json` 的合成示例、`webagent-model-observation/v1` 和 Inspector `schemaVersion:1` 单次证据。0.5.2还识别原版 `buildDump` 导出的 `probe:"arena-model-probe"` 文件：只转换当前 observation，忽略全局 evidence、slots 和缓存 verdict，避免把前次/另一侧的线索混进来。原导出最多保留4000字符，达到边界或截断状态未知都按截断处理；报告中的 observedAt 是导出时间，原请求时间不可证，provenance 和 historical 会明确标注并随摘要保存。没有当前 observation、来源不符或超预算会拒绝；不是接受任意形状的 dump。

观测要求：`requestId`、`observedAt`、固定 `origin:"https://arena.ai"`、`truncated`、`evidence`、`text`；可提供 UUID `models:[{id,publicName}]`、计时和 token 数。文件256KiB（旧原生dump也适用）、标准观测文本200000字符、证据100条、映射1000条、frames64条。非法来源/任意权重拒绝；冲突映射不强选。允许的来源和完整字段检查见 `analysis.js`。

主动题组包含 tokenizer 原始基准文本。**只有确认发送了完整基准、且拿到对应 prompt/input token 数时**，离线观测才设 `tokenizerBenchmark:true` 并填写 `promptTokens`。总 token、输出 token、包含系统提示/历史的输入计数不能冒充纯基准计数。没有可比计数就没有有效测量；系统不会把普通消息 token 套上基准结果。

## 历史、跨端迁移与未知样本

- `保存本次分析到工作区历史`：明确确认后保存白名单摘要，不保存原始响应或令牌；50条、每条64KiB、总1MiB，不静默淘汰。
- `导出工作区参考历史到新文件`：仅新文件，不覆盖已有文件或符号链接；`导入参考历史或浏览器批量记录` 可在另一台桌面/工作区导入，2MiB文件预算。
- 浏览器原历史面板导出的 `schemaVersion:1, conversations:[...]` 可批量迁移；旧 observations 记录也可转换。全部分析成功后一次更新；同内容不重复添加，ID冲突、格式损坏、超额时不覆盖旧库。迁移不是云同步，VSCode历史也不会反向覆盖浏览器原库。
- `按协议指纹查看参考样本簇`：最多50条、完整链接阈值0.93；只有时序/长度没有协议结构的不聚类。簇只是样本相似度，不把邻居名字当身份、不自动溯名。
- 浏览器审批刷新公开目录后，点“导出公开UUID目录”；VSCode 执行 `用公开UUID目录追加历史映射参考`。只对精确、无矛盾 UUID 追加派生记录，保留原记录和原观测时间，并记录映射内容 SHA256。目录来源与日期在导出的目录文件中；hash不是签名或真实性证明。
- `把本次参考填入WebAgent /ask草稿` 最多16KiB，是局部参考，必须人工检查发送。不会自动调用模型或上传文件正文。

## 安全边界和验证

`/api` 的回环/跨站防护不放宽；浏览器只走独立 `/probe-link`，校验回环来源、Host、精确 Chrome 扩展 Origin 与内存 Bearer。令牌不放 URL/日志/浏览器持久存储；用户明确复制时会暂留剪贴板。实时数据白名单投影，不是通用脱敏器，标签仍可能敏感。

公开映射只拉3个固定 Arena leaderboard URL，`credentials:omit`、拒绝跳转、每页2MiB、最多1000项、可取消；失败保留旧缓存并报错。真实页面是否仍匹配解析器、Chrome 权限/选择器、账户计费等必须实机验证。

验证命令：`npm test --prefix webagent-core/agent-host`、两个打包器 `--verify`。新测试包含实际回环 HTTP 与合成浏览器传输，**不是用户真实浏览器验收**。逐函数解释见《实现详解.md》；完整阶段和待验收项见根目录《探针完整整合实施与验收.md》及 `manager/stages/s8-probe-integration.md`。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [analysis.js](analysis.js) | 14 个函数/类节点 |
| [analysisWorker.mjs](analysisWorker.mjs) | 10 个函数/类节点 |
| [browserActions.js](browserActions.js) | 17 个函数/类节点 |
| [browserBridge.mjs](browserBridge.mjs) | 13 个函数/类节点 |
| [browserIntegration.mjs](browserIntegration.mjs) | 17 个函数/类节点 |
| [browserPopup.mjs](browserPopup.mjs) | 14 个函数/类节点 |
| [browserReference.mjs](browserReference.mjs) | 14 个函数/类节点 |
| [catalog.mjs](catalog.mjs) | 5 个函数/类节点 |
| [client.js](client.js) | 9 个函数/类节点 |
| [extension.js](extension.js) | 17 个函数/类节点 |
| [genericCapture.mjs](genericCapture.mjs) | 14 个函数/类节点 |
| [history.js](history.js) | 27 个函数/类节点 |
| [historyClustering.js](historyClustering.js) | 12 个函数/类节点 |
| [historyTransfer.js](historyTransfer.js) | 5 个函数/类节点 |
| [liveClient.js](liveClient.js) | 7 个函数/类节点 |
| [liveCommands.js](liveCommands.js) | 18 个函数/类节点 |
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
| [package_browser.py](package_browser.py) | 文件级登记；未做符号完整性证明 |
| [package_vsix.py](package_vsix.py) | 文件级登记；未做符号完整性证明 |
| [referenceInput.js](referenceInput.js) | 5 个函数/类节点 |
| [sample-observation.json](sample-observation.json) | 文件级登记；未做符号完整性证明 |
| [traceInput.js](traceInput.js) | 7 个函数/类节点 |
<!-- docs-inventory:end -->

### 0.5.2复核修正
通用采样等待CDP流式启用完成后再处理结束事件；异步返回核对监听实例、generation、会话和具体entry，停止/导航/ID复用后的旧响应不能发布或删除新样本。标准/轻量限额同时应用于WS、流块和完整响应，按UTF-8字节计算；base64完整响应正确按UTF-8解码。配对使用独立代次，等待期间断开或新选择会使旧配对失效。新增竞态回归不代表真实站点已验收。

### 页面采集与发送前复检
0.5.2区分页面采集代次与轨迹查询重启，避免正常查询刷新导致响应参考漏采。题目写入后、点击发送前再次检查同一个可写编辑器及完整已批准文本；用户改稿或界面替换时不发送，保留现有草稿。相关回归是合成测试，实际页面仍需验收。


## 三种启动方式并非同一套探针界面

详见[探针入口与实际可用范围](../../探针入口与实际可用范围.md)。核心WebAgent扩展与Probe Companion是独立扩展；普通CMD启动已有主机接口，但没有完整探针面板；code-server只自动同步核心扩展，Companion目前显式拒绝Web UI/远程宿主，不能用“主机接口存在”宣称完整接入。
