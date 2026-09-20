# 正式全仓逐句审查：逐文件清单

用户2026-09-17明确两项并行任务：继续剩余待办；正式全仓逐句审查。这里记录逐文件覆盖，不是另一份产品指南，也不替代[项目管理索引](../manager/CONTEXT.md)或[发现与证据台账](SEMANTIC_REVIEW_2026-09-16.md)。

## 审查标准

1. 每个段落、表格行、步骤、示例和能力承诺逐句核对：入口/默认值、调用链、磁盘和网络副作用、权限、失败/取消/并发、平台与实际证据。
2. 发现错误直接改正文；发现实现缺陷先复现并补回归，再最小修复。过期无用正文退役，历史授权/失败证据保留。
3. “已读、有问题”“局部核对”“已逐句核对”“暂停”“历史/生成边界”分别记录；目录生成、全文读取或测试绿灯都不等同于逐句通过。
4. 审过的正文或依赖实现再改动，须复核受影响句子；hash只是快照定位，不是认证算法。当前修改和测试证据按阶段10各批次分别追溯。
5. 范围从Git真实文件枚举Markdown/MDX/RST/AsciiDoc/TXT及LICENSE/NOTICE/COPYING，不读忽略的秘密/用户数据、不复制依赖目录。源码注释、HTML/CSS/配置/脚本的语义仍依[源码清单](../docs-site/source-index.md)逐模块对照，不因没有Markdown而漏掉；第三方/冻结/生成项明确边界而非悄悄删分母。

## 首批证据与下一步

- F27-01：逐句核对docs三级导航，实际目录为11篇用户专题与8篇开发专题；路径/归放/暂停/非全审承诺准确，链接守卫验证实际目标。
- F27-02：第28组已修跨端矛盾。DeepSeek/Chat Plus卡片改为unverified及三个null未知字段，移除未经验证的固定安装/站点/订阅保证；UI徽标、DeepSeek指引、复制提示、规则前言及MCP资源同步，VM/协议/HTTP回归通过。两篇专题逐句复核，不认证第三方兼容性；本批精确提交CI九项通过，证据见现行台账，未认证外部服务。
- F28-01：第29组对照registerClient/validateAuthorize与消费者，已修通用/OAuth候选未知状态、固定厂商菜单/订阅保证及配对码专属文案；保留规范/mcp与PKCE。另修unsupported卡片空prompt回退全局连接文本的问题。VM/协议/HTTP回归，不代表第三方兼容或整份OAuth安全实现通过。
- F29-01 / F30：第29组仅搬入manager仍多出独立路线层，第30组彻底合并到原有阶段10的计划/交接章节，CONTEXT负责索引；删两个独立文件且保留R0–R8/P与证据。原198条加路线为199，本次合并退役2项，现存197项；退役不算审查通过。其余API/状态刷新、OAuth深审仍未闭环。
- F27-03：设置文档模型选择/多模型保存段与settings.js、bind.js、POST /models对照；统一成功判断、页内互斥、超时/未知效果、成功保存与刷新失败分离，VM回归；不是全部API/工作流审完。

- F31-01/02：状态GET错误发布、乱序头/JSON、隐藏select/标签不一致及聊天/内置选择失败消费已修；VM与说明对应段核对，新增浏览器fixture执行证据见阶段31组。Provider添加/其余API工作流与R2仍待；不增加整篇通过数。

- F32：Provider发现/仅追加配置与UI对应段对照，修Test假成功、Add覆盖旧表和隐式回退；增加流式预算/断连取消、保存数量确认和组名原型键回归。仅局部核对，精确验证见阶段32组，整篇通过数不变。

- F33-01/02/03：真实写后异常/非终态误判和UI乱序先红测再修，审批控件绑定ID/代次、取消不抹已完成效果；对应长篇与测试仅局部核对，精确验证见阶段33组，不增加整篇通过数。

- F34-01/02：列表失败隔离与检查点预览/恢复合同先红测再修；VM和真实写后异常回归范围见阶段34组。只核对相关段，不增加整篇通过数。

- F35：检查点创建连点/草稿/绑定/未知消费与创建后刷新分离，先红测再修；真实HTTP与新增浏览器证据见阶段35组，仅局部范围，不增加整篇通过数。

- F36：HTTP登记/移除先红测再修，互斥不阻断connecting移除、独立保留停止未确认；真实后端及页面证据见阶段36组，仅局部、不增整篇通过数。

- F37：stdio预览/启动消费红测后修、后端快照与单次消费回归加强，范围及精确验证见阶段37组；只局部，不增整篇通过数。

- F38：真实入口MCP解析前Origin门禁红转绿；控制面与Origin详解全段/函数逐句核对，新增整篇1，入口/安全/测试仅局部。具体失败与边界见阶段38组，不认证浏览器攻击或全部R2。

- F39：OAuth凭据/issuer生产路由回归与文档语义核对，未复现产品认证绕过；OAuth授权详解新增整篇1，其他仅局部。原始夹具失败与范围见阶段39组，非完整OAuth/OIDC/多客户端隔离认证。

- F40：公开peer暴露HTTP会话能力导致任务owner冒用，以及跨OAuth client复用已知SID，两红测转绿。会话/分发与相关测试仅局部核对，不认证完整多租户隔离；证据见阶段40组。

- F41：经典密钥轮换假成功红测修复、条件旧值比较与未知结果，真实HTTP/VM及页面证据见阶段41组；仅对应局部，不认证全部Bridge/原生扩展。

- F42：经典启停重复写红测后修，独立停止/代次/后读分离与条件绑定；VM/HTTP/页面证据见阶段42组。仅扩大相关段局部，不认证跨页/所有进程退出或原生命令。

- F43：原生轮换/停止忽略回包的假成功红测后修，绑定+CAS、模态确认、409与未知分离、写后读分离；证据见阶段43组。仅扩大相关段局部，不认证真实IDE/隧道进程或全部调用方。

- F44：新增全仓检查与优化报告（基线e5c8363），含P1剩余假成功消费者7处、CI/工程化建议与交接环境事实；清单由197项增至198项（新增本报告行）。第45组已逐句交叉复核，原始发现保留追溯，当前处置看报告顶部链接。
- F45：交叉复核F44并修七处结果消费者、设备码/Chat/创建/PTY/补丁/Bridge合同、工作台无障碍与390px布局、CI权限/审计门禁。首推Chromium依次发现侧栏遮挡和旧文案断言，两轮8/9失败保留；修复cc77941的CI35381668516九项成功。范围纠正后不保留探针实现/文档修改，探针线索只交给负责该项目的另一位助手；纠正提交27fca73的CI35386685807九项成功。新增[第45组报告](FULL_AUDIT_FOLLOWUP_2026-09-18.md)，明确本地/CI/实机边界；不把相关整篇或全仓未审项自动认证。
- F46：仅续审非探针operatorQueue/workflows结果边界；修临期批准后结果立即淘汰、expired不可见/被迟到cancel改写，并拒绝external_request/operation_result/工作流包装与工作流顶层未知字段、exists:false矛盾读取条件及结构上必败/危险的动态步骤引用；命令查询/取消/get_logs从全局记录改为local/peer调用者隔离，get_task_status也按调用上下文返回对应计划，get_capabilities与tools/list共享远程ACL目录。可控时间/严格schema负例、本地83测试及文档247/28/110库存/站点一致性通过；`a85fa5a`的CI35397169896九项成功。相邻说明仍局部，不增加整篇通过数，探针专项保持暂停。
- F47：继续非探针结果链，三条旧实现均由真实行为红测复现：外部MCP ok:false无isError被覆盖成成功；read_files多路径部分error仍启动后续写；模型GET掩码整表回写破坏Key且单model可省略Key转绑端点。现统一外部失败判定、工作流E_PARTIAL_READ停止，并由独立modelSettings实施严格包装/字段/引用与凭据连接绑定，addProvider总目录同限100，输入失败配置零改写。定向测试转绿；首轮全量80/83暴露并修正文档标记/站点镜像/optional-chain施工回归，最终83/83，248/28/110库存零漂移、生产audit 0漏洞；实现874006e的CI35402127412九项成功。模型README、配置详解与模型调用详解由待逐句转局部，其他相邻长篇维持局部；探针暂停边界不变。
- F48：继续非探针结果链：runOpenAI/timedTool统一共享失败判定，正常return的operation_result failed终态不再画成成功，仍向模型保留原结果且失败命令不进截图分支；Skill创建只在write_file success严格true且read-back verified时确认，unknown答409；operatorQueue不再为容量提前删除15分钟内终态/requestKey墓碑，40条满时旧key仍命中而新key拒绝。真实队列/HTTP/模拟模型回归与相邻测试通过；首轮83/84仅暴露新测试未登记主说明，修后84/84，249/28/110库存零漂移、audit 0漏洞、探针零diff；实现f89767f的CI35408375271九项成功。Chat调度、agent README、Chat测试详解由待逐句转局部，其他受影响长篇维持局部；探针暂停边界不变。
- F49：继续非探针模型/Provider输入与公开投影：真实HTTP红测证明旧模型未知字段会由GET原样发布，扩展复核还覆盖multiModel与已知槽位错类型嵌套值。现models/status只投影固定且类型有效的模型/多模型字段并脱敏Key，合法往返清除历史属性且保留真实Key；模型记录、Provider探测包装、addProvider包装及目录项均拒绝未知字段，探测负例不触网、保存负例零写且错误不回显Key。定向及完整84项、249/28/110文档零漂移、生产audit 0漏洞与探针零diff已通过，实现124b205的CI35428457492九项成功；受影响长篇维持局部，计数不变，探针暂停边界不变。
- F50：继续非探针Bridge/外部MCP结果边界：真实HTTP红测证明Bridge生命周期和身份包装会静默接受未知/错类型/跨provider/超预算输入后产生配置、停启或触网副作用，历史嵌套值还会由status发布且truthy授权对象可通过门禁；真实外部MCP另证明unknown核验会被宿主投影覆盖成成功。现Bridge固定请求schema、provider专属字段及请求/生效保存值字节预算与零副作用400，status只投影有界类型有效字段并严格识别布尔授权；externalClient先判原始结果，保留unknown、ok:false及不可重放。两轮83/84分别只暴露站点镜像未重建和新增具名helper漏登记详解，补齐后最终84/84，249/28/110文档零漂移、audit 0漏洞、正式哈希183项匹配、探针零diff；受影响长篇维持局部，计数不变，探针暂停边界不变。实现11c1689的CI35437963655九项成功，覆盖Windows/Ubuntu矩阵、重复取消/stdio、真实Chromium与安装器。
- F51：继续非探针本机REST包装/模型HTTP边界。`/tool/call`未知字段写盘与`createOnly:'true'`覆盖歧义先确认；现文件/回退/检查点/Skill/工具/Chat/共识/任务/执行控制/审批取消以固定query/body在副作用前400，普通保存必须版本hash，Chat固定枚举及有界历史。模型POST逐块限1MiB、拒跳转且不反射错误正文；共享fetchText标准流默认8MiB并保留deadline/父取消。真实HTTP/模拟fetch及相邻定向回归通过；首轮完整80/84仅为说明/站点尚未同步，补齐后最终84/84、249/28/110文档零漂移、audit 0漏洞、正式哈希183项匹配、探针零diff。c1ea0f8首推CI35445326912为8/9，真实Chromium发现Skill首页空expectedHash不兼容严格合同；a415782省略空字段并补VM回归，CI35448256206九项成功。requestScope逐函数说明由待逐句转局部，正式清单现为局部55、待79；探针暂停边界不变。
- F52：继续非探针PTY/connection-check/external管理包装和模型请求/响应形状。旧PTY hello未知字段200且登记客户端、模型无出站预算均先红测；现PTY身份/报告按状态固定包装并拒矛盾终态，连接挑战及external登记/stdio/删除在调用服务前固定body/query/ID，公网登记要求严格确认和完整成对绑定。模型完整POST在fetch前限12MiB，assistant只回送固定投影，content严格；每轮最多64项tool call且arguments须≤256KiB对象JSON、名字须属于本轮声明集合，禁用/隐藏工具在整份验证后、执行前拒绝，随后才可能执行前8项。真实HTTP/模拟Provider定向通过；首轮83/84仅站点镜像待重建，最终84/84、249/28/110文档零漂移、audit 0漏洞、正式哈希183项匹配、探针零diff。受影响正文均维持局部，清单计数不变；实现94841c3的CI35450192029九项成功，探针暂停边界不变。
- F53：继续非探针query、状态/诊断公开投影和external/workflow接线。真实HTTP红测证明七个只读入口会忽略未知query，Bridge reset-round与tool/call也会越过query产生副作用；现apiRequestBody/bridgeRequestBody统一要求空query，其余路由显式门禁，静态核对确认除暂停的Probe路由外全部REST入口固定query。external/request与两个workflow入口改固定body显式异步接线，未知包装在服务或审批前400。MCP clientInfo入库与status快照固定有界字段；customizations拒绝空/未知/错类型写入并从历史GET投影掉未知顶层/嵌套/列表项，已知损坏仍保留。首轮完整80/84仅为说明/库存/站点未同步，业务测试80项全绿；同步后最终84/84、249/28/110且updated=0、audit 0漏洞、正式哈希183项、git diff与探针零diff。实现397476c的CI35459273776九项成功，证据0b8b9a4的CI35459466444也九项成功。画像与记忆详解仅customizations段由待逐句转局部，因此清单变为局部56、待78；其它状态不变，探针暂停边界不变。
- F54（首轮独立复审记录，后续修复见阶段10）：新增[独立报告](INDEPENDENT_AUDIT_2026-09-20.md)与3份UI截图，真实文件/HTTP/完整主机/原生函数/浏览器复现patch、RPC准入/批内ID、busy会话驱逐、资源归属/ACL、原生坏流终态、窄屏/ARIA缺口；只改相邻错误说明/管理/生成物，未修产品或加入正式回归。基线50c03be本地84/84、既有Chromium套件与CI35470787917九job通过；静态扫描不授语义通过。ShunCode只读未运行，优先借鉴busy pin和整批ID预检，自适应/重放暂缓、不换文件工具。用户再次确认探针原分工暂停。清单200→201，新增报告待逐句，已逐句仍8、局部56、待79。具体基线证据与边界见报告。当前第一批会话pin/全忙拒绝/完成后空闲TTL/双向SID校验已交付；第二批又补RPC envelope/协商版本/64项与批内ID预检/通知202及真实HTTP零写回归；其余缺陷未关闭，见阶段10修复续记。

## 逐文件状态

最近独立核验的实现基线为`50c03bedc97f9eaaf1c875f4767c6e9bb5278d56`，[CI35470787917](https://github.com/cccjvav/web_agent/actions/runs/35470787917)已逐job核实九项success，覆盖Ubuntu的Node18/20/22/24、Windows的Node20/22/24、Windows安装器与真实Chromium。3fbe872任务TXT漏登记、F51首推Chromium以及更早Windows22超时保留为历史证据，不当当前失败或已修根因。本轮产品代码未改，新增负例未入正式回归；报告/说明修改后的门禁看阶段54组。本清单是文件库存，不自我授予语义通过；新报告也待逐句，不能用扫描/绿灯把全仓未审项批量签过。

<!-- review-status-counts:start -->
现存条目数：201（合并退役2项，不计通过）；状态：待逐句核对 79、局部核对 56、暂停，只登记路径 15、生成定位，非语义认证 1、已逐句核对 8、待边界核对 7、只读规范副本 1、待历史定位核对 32、原始证据，受限 2。这是文件计数，不是语义准确率。
<!-- review-status-counts:end -->

| 文件 | 状态 | SHA-256前16位 | 依据/下一动作 |
|---|---|---|---|
| [.config/code-server/README.md](../.config/code-server/README.md) | 待逐句核对 | 488ad9897d5593bb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.github/workflows/README.md](../.github/workflows/README.md) | 局部核对 | 38fea57b26161810 | F45核对最小权限、高危生产依赖门禁及九任务边界；其余历史证据不自动认证 |
| [.webagent/skills/commit-now/SKILL.md](../.webagent/skills/commit-now/SKILL.md) | 待逐句核对 | 579a602c15977541 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/docs-sync/SKILL.md](../.webagent/skills/docs-sync/SKILL.md) | 待逐句核对 | 417415f762f03599 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/README.md](../.webagent/skills/evidence-check/README.md) | 待逐句核对 | 3cc3038c2dbec215 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/SKILL.md](../.webagent/skills/evidence-check/SKILL.md) | 待逐句核对 | 9fdfadcf9f89d83e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/references/checklist.md](../.webagent/skills/evidence-check/references/checklist.md) | 待逐句核对 | 8e07e93c431a3c2b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/fix-tests/SKILL.md](../.webagent/skills/fix-tests/SKILL.md) | 待逐句核对 | bc401dc72aada5ae | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/review/SKILL.md](../.webagent/skills/review/SKILL.md) | 待逐句核对 | d30d72094e8aa2e2 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [AGENTS.md](../AGENTS.md) | 待逐句核对 | 436905c57093ee1a | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 待逐句核对 | 1a54f3466ead86dd | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [LICENSE](../LICENSE) | 待逐句核对 | 5aff5a5a5928fe3e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [README.md](../README.md) | 待逐句核对 | 2de158b2b9b26713 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [SECURITY.md](../SECURITY.md) | 局部核对 | 1c51ff086a0fa70e | F43仅原生轮换确认/绑定/CAS与停止绑定边界；前批局部保留 |
| [arena-model-probe/README-PYTHON.md](../arena-model-probe/README-PYTHON.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-model-probe/README.md](../arena-model-probe/README.md) | 暂停，只登记路径 | 不读取正文 | P：由另一位助手负责；正式交接前不审实现、能力或文档 |
| [arena-model-probe/TRANSPORT_REVIEW.md](../arena-model-probe/TRANSPORT_REVIEW.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-trace-inspector/README.md](../arena-trace-inspector/README.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-trace-inspector/安装教程.md](../arena-trace-inspector/安装教程.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [bin/README.md](../bin/README.md) | 待逐句核对 | 1d178ba60794c1ff | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/SKILL.md](../computer-use/SKILL.md) | 待逐句核对 | 106cb36f2a71ea3e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/README.md](../computer-use/win/README.md) | 待逐句核对 | af270f2624b459c1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/截图标记与OCR详解.md](../computer-use/win/截图标记与OCR详解.md) | 待逐句核对 | 1deb2309a14f2568 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/鼠标键盘与剪贴板详解.md](../computer-use/win/鼠标键盘与剪贴板详解.md) | 待逐句核对 | 2f5dba67bb07f984 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/README.md](../docs-site/README.md) | 待逐句核对 | 72c6c3ae4ad1d781 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/source-index.md](../docs-site/source-index.md) | 生成定位，非语义认证 | 3270fc57db0aa01c | 检查生成一致性，逐函数含义另查主说明 |
| [docs-site/样式规则详解.md](../docs-site/样式规则详解.md) | 待逐句核对 | 294d6015d16c6b6e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/浏览与服务详解.md](../docs-site/浏览与服务详解.md) | 待逐句核对 | 2e72d034f06c6f91 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/清单与构建详解.md](../docs-site/清单与构建详解.md) | 待逐句核对 | 63b60e93bb1c59ca | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/README.md](../docs/README.md) | 已逐句核对 | c89e415eff942b9b | F27-01：目录/归放规则/边界与实际路径一致 |
| [docs/development/README.md](../docs/development/README.md) | 已逐句核对 | e6e3efaad5c31918 | F27-01：目录/归放规则/边界与实际路径一致 |
| [docs/development/代码复盘指南.md](../docs/development/代码复盘指南.md) | 待逐句核对 | 616d7a10f8e77b1a | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/借鉴优化说明（新手版）.md](../docs/development/借鉴优化说明（新手版）.md) | 待逐句核对 | 9ebe206b9422dcac | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/平台启动与CI详解.md](../docs/development/平台启动与CI详解.md) | 局部核对 | b326eff6320f4ad7 | F45仅Actions权限、审计硬门禁与任务边界；Windows/Conda实机未验 |
| [docs/development/总览.md](../docs/development/总览.md) | 待逐句核对 | f21bb595dea9d6c6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/技术实现.md](../docs/development/技术实现.md) | 待逐句核对 | 73bdc67d0ea73694 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/架构导读.md](../docs/development/架构导读.md) | 待逐句核对 | acfe99744992d411 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/测试说明.md](../docs/development/测试说明.md) | 待逐句核对 | 2a8cd9d6c5785611 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/组件说明.md](../docs/development/组件说明.md) | 待逐句核对 | b2e996c12fc2a5e8 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge任务栏说明.md](../docs/guides/Bridge任务栏说明.md) | 待逐句核对 | 1415ed7cbc71ad12 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge权限与工作模式.md](../docs/guides/Bridge权限与工作模式.md) | 待逐句核对 | 939f1e237de312b3 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge统计与刷新排查.md](../docs/guides/Bridge统计与刷新排查.md) | 待逐句核对 | 2b8db632d81b0cab | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Conda环境说明.md](../docs/guides/Conda环境说明.md) | 待逐句核对 | 563f5c01a267970b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/README.md](../docs/guides/README.md) | 已逐句核对 | d46da3929bd2f0f0 | F27-01：目录/归放规则/边界与实际路径一致 |
| [docs/guides/Windows新手逐步验收.md](../docs/guides/Windows新手逐步验收.md) | 待逐句核对 | 6f91ce6b2edbfa92 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/内置探索Agent使用指南.md](../docs/guides/内置探索Agent使用指南.md) | 待逐句核对 | 7d39608590b06355 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/技能使用指南.md](../docs/guides/技能使用指南.md) | 待逐句核对 | ceb23a42a9736616 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/网页ChatPlus使用指南.md](../docs/guides/网页ChatPlus使用指南.md) | 已逐句核对 | a0fbe858990f07d3 | F27-02：正文/卡片/资源/复制提示同步；第三方兼容性未验证 |
| [docs/guides/网页DeepSeek使用指南.md](../docs/guides/网页DeepSeek使用指南.md) | 已逐句核对 | d76c9c0f93c2acac | F27-02：正文/卡片/DeepSeek指引同步；第三方兼容性未验证 |
| [docs/guides/网页VSCode使用指南.md](../docs/guides/网页VSCode使用指南.md) | 待逐句核对 | 7fd83648d162c3e4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/隧道使用指南.md](../docs/guides/隧道使用指南.md) | 待逐句核对 | 9e174df444c52a80 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [examples/calculator/.webagent/instructions.md](../examples/calculator/.webagent/instructions.md) | 待边界核对 | b9fee21ec621714f | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [examples/calculator/README.md](../examples/calculator/README.md) | 待边界核对 | b81ce0560907d6d3 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [installer/README.md](../installer/README.md) | 待逐句核对 | f2edbd500219def5 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [installer/函数详解.md](../installer/函数详解.md) | 待逐句核对 | e56bd9d538e2a089 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [installer/安装声明详解.md](../installer/安装声明详解.md) | 待逐句核对 | 5c8566d2ce5b1bc8 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/CONTEXT.md](../manager/CONTEXT.md) | 局部核对 | 7040555889f4d4b5 | F54压缩为轻量当前索引，记录来源同步/50c03be精确CI与未修新证据；历史保留阶段，不自授整篇通过 |
| [manager/SKILL.md](../manager/SKILL.md) | 只读规范副本 | 5c8c93d50e52332b | 只核对引用与适用范围，不修改技能副本 |
| [manager/agents.md](../manager/agents.md) | 待逐句核对 | 4466f9c59524232f | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/docs/documentation.md](../manager/docs/documentation.md) | 待逐句核对 | dff435c047431d16 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/docs/experience.md](../manager/docs/experience.md) | 待逐句核对 | a6d9e3bf5dfeda87 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/stages/audit-2026-09-11.md](../manager/stages/audit-2026-09-11.md) | 待历史定位核对 | d6064bf51020b073 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/context-history-through-0.4.md](../manager/stages/context-history-through-0.4.md) | 待历史定位核对 | a4ccaf24eb17241b | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/documentation-2026-09-12.md](../manager/stages/documentation-2026-09-12.md) | 待历史定位核对 | c23c09e4b3615d99 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/probe-dual-integration-2026-09-15.md](../manager/stages/probe-dual-integration-2026-09-15.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [manager/stages/s1-handoff.md](../manager/stages/s1-handoff.md) | 待历史定位核对 | cfc0e427dc08e55c | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s10-upstream-adoption.md](../manager/stages/s10-upstream-adoption.md) | 局部核对 | a9e8b115fe43edd4 | F54更新R2/R3与实际审查/未修边界、基线和ShunCode取舍；保留历史失败，其余阶段不重签 |
| [manager/stages/s2-shell.md](../manager/stages/s2-shell.md) | 待历史定位核对 | 5ac447fe582ce09e | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s3-bridge-image.md](../manager/stages/s3-bridge-image.md) | 待历史定位核对 | fbe64b3265d3cf1a | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s4-terminal.md](../manager/stages/s4-terminal.md) | 待历史定位核对 | 1cf1fcca01c51478 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s5-experience-parity.md](../manager/stages/s5-experience-parity.md) | 待历史定位核对 | f5a036d8d7542421 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s6-multi-agent-board.md](../manager/stages/s6-multi-agent-board.md) | 待历史定位核对 | 94899c98f63459c5 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s7-platform-reliability.md](../manager/stages/s7-platform-reliability.md) | 待历史定位核对 | 7e447deda058dc16 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s8-probe-integration.md](../manager/stages/s8-probe-integration.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [manager/stages/s9-workspace-entry.md](../manager/stages/s9-workspace-entry.md) | 待历史定位核对 | 77367a885aa57c03 | 核对归档/引用/证据，不将旧结论改成现状 |
| [multi-agent-board/SKILL.md](../multi-agent-board/SKILL.md) | 待逐句核对 | 29b4015a8d562bfb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [project-manager/SKILL.md](../project-manager/SKILL.md) | 待逐句核对 | 5c8c93d50e52332b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/CHECKLIST_WINDOWS.md](../review/CHECKLIST_WINDOWS.md) | 待逐句核对 | 6cbc79b4c85111ed | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/INDEPENDENT_AUDIT_2026-09-20.md](../review/INDEPENDENT_AUDIT_2026-09-20.md) | 待逐句核对 | 51b78db802cb762d | F54独立证据与取舍；新报告不自授通过，不等同产品修复、全仓逐句或实机认证 |
| [review/OPTIMIZATION_REPORT_2026-09-18.md](../review/OPTIMIZATION_REPORT_2026-09-18.md) | 已逐句核对 | 29391f9e3e15ea70 | F45逐项交叉复核；P1-A/P2-D/P2-A已处置，原始发现保留，剩余取舍见顶部链接 |
| [review/FULL_AUDIT_FOLLOWUP_2026-09-18.md](../review/FULL_AUDIT_FOLLOWUP_2026-09-18.md) | 待逐句核对 | 8a0799b45e63fcdb | F45–48交叉审查/实修与验证报告；本页不自我授予整篇语义认证，结论按列明证据边界复核 |
| [review/README.md](../review/README.md) | 局部核对 | d30769159502c795 | F54加入独立报告并明确未修/未验；历史入口不扩大认证 |
| [review/SEMANTIC_REVIEW_2026-09-16.md](../review/SEMANTIC_REVIEW_2026-09-16.md) | 待逐句核对 | 7eca34328077c1e2 | F54只更新当前状态/新证据和精确基线，历史长台账仍逐段待核，不自授整篇通过 |
| [review/UPSTREAM_ADOPTION_MAP_2026-09-15.md](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md) | 待逐句核对 | e454a1ff6891f7bc | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/archive/01a08d85-web-agent-audit.md](../review/archive/01a08d85-web-agent-audit.md) | 待历史定位核对 | 95fc2e2b61e4c58c | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/ARENA_PROBE_INTEGRATION_2026-09-15.md](../review/archive/ARENA_PROBE_INTEGRATION_2026-09-15.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [review/archive/AUDIT_2026-09-13.md](../review/archive/AUDIT_2026-09-13.md) | 待历史定位核对 | b212a7844fccc611 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/AUDIT_CROSSCHECK_2026-09-11.md](../review/archive/AUDIT_CROSSCHECK_2026-09-11.md) | 待历史定位核对 | c12028e97e33883c | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/AUDIT_ROUND3_2026-09-13.md](../review/archive/AUDIT_ROUND3_2026-09-13.md) | 待历史定位核对 | 17b783afe8daf785 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/CURRENT_AUDIT_2026-09-15.md](../review/archive/CURRENT_AUDIT_2026-09-15.md) | 待历史定位核对 | 45a0b7f2e7884abd | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/DOC_QUALITY_2026-09-12.md](../review/archive/DOC_QUALITY_2026-09-12.md) | 待历史定位核对 | 4fcacd89f0eb08d7 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/PROMPT_SHUNCODE.md](../review/archive/PROMPT_SHUNCODE.md) | 待历史定位核对 | a087a76a82ea9f39 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/README.md](../review/archive/README.md) | 待历史定位核对 | 7fc8be61d8d1f983 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REFERENCE_ARENA_AGENT_2026-09-15.md](../review/archive/REFERENCE_ARENA_AGENT_2026-09-15.md) | 待历史定位核对 | 440ba3bac277e9e4 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT.md](../review/archive/REPORT.md) | 待历史定位核对 | 36f2670d09fa4624 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_FULLAUDIT_2026-09-08.md](../review/archive/REPORT_FULLAUDIT_2026-09-08.md) | 待历史定位核对 | f5bf537a7bdddb99 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S1.md](../review/archive/REPORT_SHUNCODE_S1.md) | 待历史定位核对 | 2b3a15d8a2fac4f3 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S2.md](../review/archive/REPORT_SHUNCODE_S2.md) | 待历史定位核对 | 087e2f46dc17f0ef | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S3.md](../review/archive/REPORT_SHUNCODE_S3.md) | 待历史定位核对 | fd9d8f8819a65d88 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S4.md](../review/archive/REPORT_SHUNCODE_S4.md) | 待历史定位核对 | e7a835c60e829e1c | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v2.md](../review/archive/REPORT_v2.md) | 待历史定位核对 | b40c12e57f0a7ecb | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v3.md](../review/archive/REPORT_v3.md) | 待历史定位核对 | 58ffe90588854a35 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v4.md](../review/archive/REPORT_v4.md) | 待历史定位核对 | 1c02b374cce0cc45 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v5.md](../review/archive/REPORT_v5.md) | 待历史定位核对 | 82e1af3e703b2abe | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v6.md](../review/archive/REPORT_v6.md) | 待历史定位核对 | d95e82629f539f37 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/SEMANTIC_BATCHES_01_15_2026-09-16.md](../review/archive/SEMANTIC_BATCHES_01_15_2026-09-16.md) | 待历史定位核对 | ef0de062d90e338f | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/shuncode-ui/README.md](../review/shuncode-ui/README.md) | 待逐句核对 | d0fe77f07fab6f11 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| `review/step5-tests.txt` | 原始证据，受限 | 不读取正文 | 不读取/改写个人路径和原始失败，核查归属与保留 |
| [web_agent提示词-修正版-纯净.txt](../web_agent提示词-修正版-纯净.txt) | 原始证据，受限 | 799bc9a80abb23a5 | F54逐句读取为用户任务/边界证据，不改写，不把其中对照断言直接当审查结论 |
| [webagent-core/README.md](../webagent-core/README.md) | 待逐句核对 | ecfd98d990a19163 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/admin-host/README.md](../webagent-core/admin-host/README.md) | 待逐句核对 | debfb2fbc9ef4eea | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/admin-host/统计服务详解.md](../webagent-core/admin-host/统计服务详解.md) | 待逐句核对 | 211b9659f879e40b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/README.md](../webagent-core/agent-host/README.md) | 待逐句核对 | 37629c9e85eaf2c0 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/scripts/README.md](../webagent-core/agent-host/scripts/README.md) | 待逐句核对 | 5bba04de80773ff6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/scripts/运行器详解.md](../webagent-core/agent-host/scripts/运行器详解.md) | 待逐句核对 | 592c3004e0bc1673 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/README.md](../webagent-core/agent-host/src/README.md) | 局部核对 | 66b531b3c3417e03 | F38仅双端口门禁及解析顺序段；其它初始化/依赖未整篇认证 |
| [webagent-core/agent-host/src/agent/Chat调度详解.md](../webagent-core/agent-host/src/agent/Chat调度详解.md) | 局部核对 | 7822bab886a59c42 | F48核对timedTool返回式失败、原结果保留及空工作区测试命令说明；其余探索/调度段待逐句 |
| [webagent-core/agent-host/src/agent/README.md](../webagent-core/agent-host/src/agent/README.md) | 局部核对 | cb5e853eb6247b87 | F52核对模型12MiB请求、assistant/tool-call严格形状/声明白名单/投影摘要；F51/F49/F48局部保留，其余模块段待逐句 |
| [webagent-core/agent-host/src/agent/模型调用详解.md](../webagent-core/agent-host/src/agent/模型调用详解.md) | 局部核对 | 0a4b754a27c9df90 | F52逐函数核对请求预算、响应投影及tool-call验证/执行段；F51/F49–47边界保留，其余未重审 |
| [webagent-core/agent-host/src/api/README.md](../webagent-core/agent-host/src/api/README.md) | 局部核对 | c010d19ee9d99260 | F53核对非Probe query闭环、状态/诊断/定制投影及external/workflow固定接线；F52–45局部保留 |
| [webagent-core/agent-host/src/api/路由逐项详解.md](../webagent-core/agent-host/src/api/路由逐项详解.md) | 局部核对 | f8a4f10511dcd983 | F53核对请求辅助器、只读路由、external/workflow及定制/会话投影段；F52–45相关段保留，其它路由待逐句 |
| [webagent-core/agent-host/src/auth/GitHub身份详解.md](../webagent-core/agent-host/src/auth/GitHub身份详解.md) | 局部核对 | b0e67384fb82e08f | F45核对令牌/设备流代次、poll单飞与淘汰边界；非GitHub实机兼容认证 |
| [webagent-core/agent-host/src/auth/README.md](../webagent-core/agent-host/src/auth/README.md) | 局部核对 | b185e82b8aab40a1 | F45核对GitHub身份代次、清除与失败合同；其余认证范围不扩大 |
| [webagent-core/agent-host/src/mcp/OAuth授权详解.md](../webagent-core/agent-host/src/mcp/OAuth授权详解.md) | 已逐句核对 | 4bdb82f25ef83149 | F39全部段落/函数对照oauth.js与路由/生产HTTP回归；非标准认证/第三方兼容/全部会话隔离 |
| [webagent-core/agent-host/src/mcp/README.md](../webagent-core/agent-host/src/mcp/README.md) | 局部核对 | 6756db99ac104214 | F53扩展clientInfo固定入库/status投影与HTTP证据；F50/F47外部结果及F40会话局部保留 |
| [webagent-core/agent-host/src/mcp/会话与结果详解.md](../webagent-core/agent-host/src/mcp/会话与结果详解.md) | 局部核对 | ca47cdae668c9af0 | F53核对session固定入库/公开投影与深拷贝；F40主体绑定保留，errors/budget等其余待逐句 |
| [webagent-core/agent-host/src/mcp/公网出站详解.md](../webagent-core/agent-host/src/mcp/公网出站详解.md) | 待逐句核对 | 1b892e6459f27979 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/请求分发详解.md](../webagent-core/agent-host/src/mcp/请求分发详解.md) | 局部核对 | 61c460a1c46342fb | F54对照权限过滤、Capture别名、模式租约/Read和现存准入/资源缺口；仍局部，不认证完整协议符合性 |
| [webagent-core/agent-host/src/mcp/资源与客户端详解.md](../webagent-core/agent-host/src/mcp/资源与客户端详解.md) | 局部核对 | dc7618792cb8f5ab | F28：第三方卡片/三态资源/规则前言；其余资源与卡片待审 |
| [webagent-core/agent-host/src/models/README.md](../webagent-core/agent-host/src/models/README.md) | 局部核对 | 61421d785bb25d42 | F53扩展customizations固定schema/历史投影/非事务边界；F49/F47模型连接与投影保留，其它摘要未重审 |
| [webagent-core/agent-host/src/models/画像与记忆详解.md](../webagent-core/agent-host/src/models/画像与记忆详解.md) | 局部核对 | d2fcac4884ea2c8d | F53逐函数核对customizations固定schema/历史投影/保存边界；profile/memory其余段不继承旧批次整篇通过 |
| [webagent-core/agent-host/src/models/配置存储详解.md](../webagent-core/agent-host/src/models/配置存储详解.md) | 局部核对 | 0a9fe111d7732267 | F49复核modelSettings固定字段、类型投影与历史属性清洗；F47保存/失败边界保留，store其余段未重审 |
| [webagent-core/agent-host/src/tools/Plan状态详解.md](../webagent-core/agent-host/src/tools/Plan状态详解.md) | 待逐句核对 | 41b1274526eaa6ee | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/README.md](../webagent-core/agent-host/src/tools/README.md) | 局部核对 | 1fcaa1ce48354d8b | F50登记外部unknown/失败判定顺序与不可重放；F47/F46及前批局部保留 |
| [webagent-core/agent-host/src/tools/任务板与工作区详解.md](../webagent-core/agent-host/src/tools/任务板与工作区详解.md) | 待逐句核对 | 31700b0377ab42c7 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/命令与PTY详解.md](../webagent-core/agent-host/src/tools/命令与PTY详解.md) | 局部核对 | 8ceed20ed4c27fca | F46核对executor记录/最近ID/查询/取消所有者段；其余PTY/平台段仍待逐句 |
| [webagent-core/agent-host/src/tools/工具入口与命令策略详解.md](../webagent-core/agent-host/src/tools/工具入口与命令策略详解.md) | 局部核对 | 7416c9f0b12b794e | F46扩展getCapabilities/命令/getLogs/getTaskStatus上下文段；F45 write_file段保留，其它仍待逐句 |
| [webagent-core/agent-host/src/tools/技能与隐藏规则详解.md](../webagent-core/agent-host/src/tools/技能与隐藏规则详解.md) | 待逐句核对 | a3087c1481326910 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/文件与搜索详解.md](../webagent-core/agent-host/src/tools/文件与搜索详解.md) | 局部核对 | c17c12fc340ac893 | F45仅createOnly独占创建、锁内检查及外部进程边界；其余搜索/文件段待审 |
| [webagent-core/agent-host/src/tools/缓存与进度详解.md](../webagent-core/agent-host/src/tools/缓存与进度详解.md) | 局部核对 | 0f536593ebccbaac | F46核对progressTracker状态归属/get_task_status段；readCache及其余边界仍待逐句 |
| [webagent-core/agent-host/src/tools/补丁与路径详解.md](../webagent-core/agent-host/src/tools/补丁与路径详解.md) | 待逐句核对 | 39c2719c14f3df20 | F54核对并警示新建分支忽略hash/原patch落盘/丢块，dryRun说明对齐；其余边界不重签 |
| [webagent-core/agent-host/src/tunnel/README.md](../webagent-core/agent-host/src/tunnel/README.md) | 待逐句核对 | 24289f1b902c1aea | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tunnel/停止进程详解.md](../webagent-core/agent-host/src/tunnel/停止进程详解.md) | 待逐句核对 | a9bc461bf5f9629d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tunnel/隧道生命周期详解.md](../webagent-core/agent-host/src/tunnel/隧道生命周期详解.md) | 待逐句核对 | 8ec14204b6ad1276 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/usage/README.md](../webagent-core/agent-host/src/usage/README.md) | 待逐句核对 | 07c4af39ec8eb89c | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/usage/用量上报详解.md](../webagent-core/agent-host/src/usage/用量上报详解.md) | 待逐句核对 | e71286c5a4ef2560 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/README.md](../webagent-core/agent-host/src/utils/README.md) | 局部核对 | 1bfb3d736789c007 | F51核对fetchText流式字节预算与fallback边界；F46/F38及前批局部保留 |
| [webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md](../webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md) | 局部核对 | 7596b4812d743efc | F46扩展sessionIdFor/get_logs隔离段；F42非探针诊断局部保留，探针暂停 |
| [webagent-core/agent-host/src/utils/事件总线详解.md](../webagent-core/agent-host/src/utils/事件总线详解.md) | 待逐句核对 | f477dcc70d518fe1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/函数详解.md](../webagent-core/agent-host/src/utils/函数详解.md) | 局部核对 | 9d3a21fb75c757c3 | F51逐函数核对requestScope全部deadline/流式预算/fallback；boundedFile与workspaceBinding旧正文未重审 |
| [webagent-core/agent-host/src/utils/受控工具与工作流详解.md](../webagent-core/agent-host/src/utils/受控工具与工作流详解.md) | 局部核对 | 181e9c578deb760f | F50核对外部unknown终态、ok:false与不可重放；F48–46队列/workflow局部保留，非全链认证 |
| [webagent-core/agent-host/src/utils/差异展示详解.md](../webagent-core/agent-host/src/utils/差异展示详解.md) | 待逐句核对 | 24a14ba502a09366 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/执行控制详解.md](../webagent-core/agent-host/src/utils/执行控制详解.md) | 局部核对 | d05cd1ee26ffaa54 | F46扩展目录ACL及命令/日志跨peer隔离回归；F33撤权段保留，非全部授权链认证 |
| [webagent-core/agent-host/src/utils/控制面与Origin详解.md](../webagent-core/agent-host/src/utils/控制面与Origin详解.md) | 已逐句核对 | cb19caab2cdd774a | F38全部段落/函数对照localControl/corsAllow/真实入口及HTTP/WS回归；非完整浏览器攻击或代理验收 |
| [webagent-core/agent-host/src/utils/编辑回退详解.md](../webagent-core/agent-host/src/utils/编辑回退详解.md) | 局部核对 | fd0c59d4ec1f5014 | F35仅创建UI与规范路径/失败零半条记录回归段；前批局部范围保留 |
| [webagent-core/agent-host/src/入口详解.md](../webagent-core/agent-host/src/入口详解.md) | 局部核对 | edb6ad5c9b85ce6a | F38仅applyCommon和路由装配顺序；其它段待逐句，探测专项不审 |
| [webagent-core/agent-host/src/运行配置详解.md](../webagent-core/agent-host/src/运行配置详解.md) | 待逐句核对 | e62dfc8755d52982 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/Chat模型与图像测试详解.md](../webagent-core/agent-host/tests/Chat模型与图像测试详解.md) | 局部核对 | 6f6f9bb2869d55da | F52核对模型12MiB请求、严格arguments/content/64项、声明白名单及响应投影fixture；F51/F48段保留，其余模型/图像待逐句 |
| [webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md](../webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md) | 局部核对 | 34d087d46f2b4f3c | F52核对PTY缺身份400/错工作区409兼容断言；F48/F40局部保留，其余待逐句 |
| [webagent-core/agent-host/tests/OAuth与GitHub测试详解.md](../webagent-core/agent-host/tests/OAuth与GitHub测试详解.md) | 局部核对 | 23eb4a19149c403c | F45扩展GitHub代次/单飞测试段；OAuth前批局部与实机边界保留 |
| [webagent-core/agent-host/tests/PTY与隧道测试详解.md](../webagent-core/agent-host/tests/PTY与隧道测试详解.md) | 局部核对 | 8b47f1a6b0d2b392 | F50扩展Bridge包装/预算/历史投影/truthy授权及零副作用矩阵；F45 PTY局部保留 |
| [webagent-core/agent-host/tests/README.md](../webagent-core/agent-host/tests/README.md) | 局部核对 | fe7973f8efe83a7f | F53扩展query/服务计数/会话与定制投影证据；F52–45边界保留 |
| [webagent-core/agent-host/tests/fixtures/README.md](../webagent-core/agent-host/tests/fixtures/README.md) | 待逐句核对 | f12a23987a0213b4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/任务板与事件流测试详解.md](../webagent-core/agent-host/tests/任务板与事件流测试详解.md) | 局部核对 | f61772bbf560aab1 | F40仅mcpBoard直接RPC及真实index会话归属测试；其余待逐句 |
| [webagent-core/agent-host/tests/存储完整性与预算测试详解.md](../webagent-core/agent-host/tests/存储完整性与预算测试详解.md) | 局部核对 | 122234371981f0e7 | F40仅stateIntegrity的principal/peer夹具；其它存储/预算待逐句 |
| [webagent-core/agent-host/tests/安装与运行器测试详解.md](../webagent-core/agent-host/tests/安装与运行器测试详解.md) | 待逐句核对 | 177b9c61b0d924b9 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/工作区与命令安全测试详解.md](../webagent-core/agent-host/tests/工作区与命令安全测试详解.md) | 局部核对 | 58c6e220c56c7619 | F43仅nativeRotationCommands夹具与断言段；其余仍待逐句 |
| [webagent-core/agent-host/tests/文档守卫测试详解.md](../webagent-core/agent-host/tests/文档守卫测试详解.md) | 待逐句核对 | 7f6b92bfe28617b5 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/本机边界与跨站测试详解.md](../webagent-core/agent-host/tests/本机边界与跨站测试详解.md) | 局部核对 | d1c307368e44ac98 | F38仅新增HTTP/WS与Host/socket回归及函数说明；其余测试段待逐句 |
| [webagent-core/agent-host/tests/模式画像与Plan测试详解.md](../webagent-core/agent-host/tests/模式画像与Plan测试详解.md) | 待逐句核对 | ba7dfd66ace424fa | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/浏览器与Webview测试详解.md](../webagent-core/agent-host/tests/浏览器与Webview测试详解.md) | 局部核对 | 4ac7df2a47634637 | F51核对Skill首页省略空hash的VM回归；F45浏览器/布局边界保留，真实Chromium本地未跑 |
| [webagent-core/agent-host/tests/统计与文档测试详解.md](../webagent-core/agent-host/tests/统计与文档测试详解.md) | 待逐句核对 | eae0ac61c526af18 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/补丁与编辑API测试详解.md](../webagent-core/agent-host/tests/补丁与编辑API测试详解.md) | 局部核对 | 54a4bf56af5f26f0 | F53扩展query零副作用、external/workflow服务计数、session与定制固定投影HTTP负例；F52–45局部保留 |
| [webagent-core/extension/PTY扩展详解.md](../webagent-core/extension/PTY扩展详解.md) | 局部核对 | bfe0bd649605b241 | F45核对poll/claim/accept/check/input/cancel的2xx和业务字段门禁；非真实IDE |
| [webagent-core/extension/README.md](../webagent-core/extension/README.md) | 局部核对 | 92e30c0b278276cf | F45扩展PTY严格回包边界；其余扩展功能仍待逐句 |
| [webagent-core/extension/resources/README.md](../webagent-core/extension/resources/README.md) | 待逐句核对 | 0d1d888d4b5b0bb1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extension/入口与Webview详解.md](../webagent-core/extension/入口与Webview详解.md) | 局部核对 | 765d29c97b1a0495 | F43仅activate命令委托、workspaceSnapshot/validRotationResult/resetSecretCommand与停止消费段；其余仍待逐句 |
| [webagent-core/extensions-installed/README.md](../webagent-core/extensions-installed/README.md) | 待边界核对 | 73a4586246a63f1e | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md) | 待边界核对 | bfe0bd649605b241 | F45已按字节同步规范说明；发行副本不独立授予产品语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md) | 待边界核对 | 0d1d888d4b5b0bb1 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md) | 待边界核对 | 765d29c97b1a0495 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/probe-extension/LICENSE](../webagent-core/probe-extension/LICENSE) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/README.md](../webagent-core/probe-extension/README.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/实现详解.md](../webagent-core/probe-extension/实现详解.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/浏览器整合说明.md](../webagent-core/probe-extension/浏览器整合说明.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/scripts/README.md](../webagent-core/scripts/README.md) | 待逐句核对 | cc9b3ed05acaba8e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/scripts/编辑器编排详解.md](../webagent-core/scripts/编辑器编排详解.md) | 待逐句核对 | 2799dc3c76bccb52 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/README.md](../webagent-core/workbench/README.md) | 局部核对 | 0de539d3b87ad605 | F45扩展严格NDJSON、结果消费、无障碍/390px证据与人工缺口 |
| [webagent-core/workbench/js/Bridge与设置详解.md](../webagent-core/workbench/js/Bridge与设置详解.md) | 局部核对 | 2a2112c07a39275d | F51核对Skill首页省略空hash/续页版本绑定；F45 Bridge与设置结果消费保留 |
| [webagent-core/workbench/js/README.md](../webagent-core/workbench/js/README.md) | 局部核对 | 70a31f4ec6981bc9 | F45同步六模块职责与结果/无障碍边界；自动导航另由生成器维护 |
| [webagent-core/workbench/js/交互绑定详解.md](../webagent-core/workbench/js/交互绑定详解.md) | 局部核对 | c2b24b9f335d93b9 | F45核对认证/文件/终端/搜索/Skill结果合同、设备代次及模态/页签键盘 |
| [webagent-core/workbench/js/启动与Chat详解.md](../webagent-core/workbench/js/启动与Chat详解.md) | 局部核对 | a995d46fe2af8496 | F45核对Chat可靠终态、补丁协调、原生空状态/工具披露按钮；非真实模型实测 |
| [webagent-core/workbench/js/状态与编辑器详解.md](../webagent-core/workbench/js/状态与编辑器详解.md) | 局部核对 | 04108577ebbc8588 | F45核对文件响应/hash、补丁协调、树/标签键盘及tabpanel同步 |
| [webagent-core/workbench/样式规则详解.md](../webagent-core/workbench/样式规则详解.md) | 局部核对 | ae1551e7f49bff04 | F54既有浏览器套件通过但独立390/320px零宽/遮挡与ARIA失败，直接修窄屏验证描述；非真实Windows验收 |
| [webagent-core/workbench/页面结构详解.md](../webagent-core/workbench/页面结构详解.md) | 局部核对 | 8f9d04a05f6e3f26 | F45扩展表单名称、ARIA、模态/页签/tabpanel和窄屏结构；屏幕阅读器未验 |
| [webagent-repro/README.md](../webagent-repro/README.md) | 待边界核对 | 64dae4453a269b66 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [使用指南.md](../使用指南.md) | 局部核对 | 571f9f0bd600ac4a | F43仅原生重置确认与失败提示说明；前批局部保留 |
| [启动脚本说明.md](../启动脚本说明.md) | 待逐句核对 | 36b62ac2985e3f29 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [探针入口与实际可用范围.md](../探针入口与实际可用范围.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [探针完整整合实施与验收.md](../探针完整整合实施与验收.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [探针能力对照与迁移边界.md](../探针能力对照与迁移边界.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |

## 合并退役记录

- `manager/ROADMAP.md`：第30组整体并入现有阶段10，工作包与交接约束保留，不是已完成或取消待办。
- `交接与路线图.md`：第30组删除导航壳，所有入口改为CONTEXT/现有阶段；原稿均可从2f270e66c636a307b28926448a08690d111b38e6追溯。
