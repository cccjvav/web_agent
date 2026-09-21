# 全仓检查与优化报告（F61，2026-09-22）

**审查基线：`63cbbdc7eba23a3bab715810e57294f74a390ee5`。本轮是盘点、横向审查、隔离复现与修复准备，不是“全部代码逐行无问题认证”。**

本次用户再次明确：arena-model-probe、arena-trace-inspector、probe-extension及专项资料继续完全暂停，仅登记路径/排除原因。本报告不撤销这个边界。未读取忽略的真实配置、用户原始失败日志或账号凭据；未登录、调用用户模型、启动真实隧道、安装code-server或操作桌面。

## 一、结论摘要

1. **不宜直接进入大规模功能扩展。** 当前既有测试97/97通过，但本轮在临时工作区复现了Git差异泄露敏感文件标记、文本hash碰撞导致过期写入被接受、GitHub读取忽略父取消、统计文件损坏后覆盖，以及同步diff计算阻塞。这不是由本轮改动引入的新回归；报告基线的实现本来存在这些行为。
2. **优先修数据边界和正确性，再补剩余启动期限。** 第一批建议处理F61-01和F61-02，随后处理F61-05、F61-03与已知F61-06；可选统计后台单独修，不混入MCP核心改造。
3. **文档结构检查总体健康，语义审查远未全部完成。** 158份非暂停、非归档Markdown的简单相对文件链接扫描未找到缺失目标；正式文档门禁通过。但这不能发现默认git_diff绕过逐路径敏感检查、非法编码hash语义或源码注释里的过期路径。已有GitHub/统计详解实际上已承认若干实现局限，不能把这些误说成“文档全部过期”。
4. **上轮F60的限定修复仍成立。** preparation的异步取消、工作期限与直接子进程退出观察没有在本轮发现需要撤销的证据；旧后端依赖fallback尚无独立deadline、npm后代和部分安装不回滚的边界继续保留。
5. **本轮没有完成浏览器实测。** 本地Chromium缺失；一次安装命令因TLS连接被重置失败。没有关闭证书校验、换断言或反复重跑追绿。基线GitHub CI的浏览器成功仅作为该提交的历史证据。

### 严重度与证据口径

- P1：应优先修复的机密性、写入正确性或主机可用性问题；不等同“已被外部攻击”。
- P2：条件性可靠性/数据质量问题，或可选子系统缺口。
- P3：导航、维护和低风险改善。
- **复现**＝实际文件/子进程/回环HTTP或明确标注的替身实验；**静态确认**＝有直接代码路径但本轮未做端到端实验；**风险/建议**不冒充已复现漏洞。

## 二、真实覆盖与排除清单

完整基线目录账本：[F61-file-coverage.csv](evidence/F61-file-coverage.csv)。每行带基线、路径、类别、大小、机械检查、人工复核层级及边界。共873行，一一对应基线Git跟踪文件；不是按已知README反推代码清单。本轮产出的报告/CSV不混入基线分母。开始时非忽略未跟踪文件为0。

| 类别 | 数量 | 本轮实际处理 |
|---|---:|---|
| 源码/配置/测试等 | 256 | 200份JS做AST解析；其他语言按下表检查，重点调用链局部人工复核；不宣称逐行全审 |
| 文档/许可证 | 158 | 其中157份Markdown做相对文件链接扫描；关键合同与实现对照，其余正文未逐句认证 |
| 暂停模块/专项资料 | 118 | 只登记路径和文件大小，不读正文、不接手专项审查或修复 |
| 图片等二进制资产 | 275 | 文件存在/类型/大小盘点；未逐张视觉验收，参考截图不是当前产品UI实测 |
| 生成物/发行副本 | 16 | 元数据登记；既有生成一致性/发行测试另验，不重复当作独立源码认证 |
| 归档/原始参考 | 24 | 历史定位，不执行；参考ZIP仅目录元数据（87成员、解压大小594816字节），不是当前可安装依赖 |
| 冻结原型 | 23 | 17份JS、3份JSON机械解析，README确认冻结；不执行、不改JS、不把旧产品缺陷算主线漏洞 |
| 用户配置边界 | 1 | 不读正文 |
| 受限原始失败证据 | 1 | 不读/不转发正文，保留原文件 |
| 当前依赖锁 | 1 | JSON解析及npm审计，未逐行审计第三方实现 |

还枚举到984个被Git忽略的文件（时点计数，含依赖/构建/运行缓存）；不读取秘密正文，不把依赖目录当作本项目自有源码逐行审过。没有声称审查了工作区外的所有软件、云端账号或历史不可得日志。

### 按语言与验证能力分列

| 对象 | 实際检查 | 限制 |
|---|---|---|
| JS/CJS/MJS | 217份Acorn解析通过＝当前200＋冻结17；259份源码/脚本文本做风险模式扫描（交叉计数，不与217相加） | 模式命中只定位候选，不算缺陷；55个文件有本轮局部人工复核，CSV逐项区分 |
| JSON | 13份解析通过，含锁文件/冻结配置 | 不是完整schema或权限审查 |
| Python | Git中18份全部属于用户暂停范围 | 本轮不读、不做专项py_compile或语义审查；通用套件的既有暂停模块用例不构成接手 |
| TS/TSX/JSX | 基线没有这些后缀的跟踪文件 | 参考ZIP里的手写类型不能当实际JS行为权威，也没有宣称编译过TS |
| HTML/CSS | 当前各2份、冻结各1份纳入文本风险扫描；UI相关JS局部核对 | 本轮浏览器验证阻塞，不能认证全部布局/焦点/读屏器 |
| C# | 9份文本扫描，持有句柄/Job Object核心片段人工核对 | 本地无dotnet/C#编译器，不是本轮Windows编译或桌面验证 |
| PowerShell | 12份文本扫描，输入/剪贴板、DPAPI和本机回收入口局部核对 | 本地无pwsh，未实际操作Windows、进程DACL或剪贴板 |
| CMD/Inno/YAML | 9份CMD、1份Inno、1份CI YML文本扫描；安装入口/CI权限与矩阵局部核对 | 不把文本扫描当执行或完整语法验证；用户配置YAML排除 |
| Shell/SVG | 4份sh的bash -n通过，2份当前SVG的XML解析通过 | 未运行生产启动脚本；没有认证SVG渲染或外部链接 |

**覆盖诚实性：** 873文件均有分类，不等于873文件都完成语义审查。源码中未深审的函数、归档正文、图片视觉细节和暂停模块仍明确未覆盖。正式逐句清单的“已逐句8份”不因本报告增加；不能给项目编造一个“安全通过率”。

## 三、已确认问题与修复验收条件

### F61-01 · P1 · 默认Git diff绕过敏感文件内容限制【真实临时Git仓库复现】

- 位置：[gitOps.js](../webagent-core/agent-host/src/tools/gitOps.js) `gitDiff`（基线102行起），与[sensitive.js](../webagent-core/agent-host/src/tools/sensitive.js)、工具分发相邻。
- 指定filePath时才调用resolveSafePath；默认无路径直接执行整个仓库的git diff。跟踪过的敏感文件即使后来加入.gitignore，也仍可能进入差异。
- 实验：临时仓库跟踪一个只有假标记的.env并修改。显式.env路径被拒绝，而默认diff及staged diff均返回标记。未读取本仓库的.env或任何实际秘密。
- 影响：能够调用git_diff的调用方，可能通过“整体差异”得到原本read_files/显式diff禁止读取的内容。这不是Git hook执行问题，现有no-ext-diff/no-textconv/filter禁用仍有价值。
- **修复门槛：** 默认、目录、staged、自定义敏感规则和重命名的旧/新两侧都不能泄露标记；NUL文件名解析、字面pathspec、输出预算、已有过滤器禁用保持；不能只在最后输出中替换字符串或只修.env一种名字。
- 文档：tools/README的逐路径敏感边界描述需要跟随实际覆盖，不应由默认diff绕过。

### F61-02 · P1 · 非法UTF-8解码合并不同字节，削弱过期写保护【真实文件复现】

- 位置：[boundedFile.js](../webagent-core/agent-host/src/utils/boundedFile.js)、[fileOps.js](../webagent-core/agent-host/src/tools/fileOps.js) `readFile/writeFileBody`、[patchEngine.js](../webagent-core/agent-host/src/tools/patchEngine.js) `computeHash`。
- readBoundedText使用Buffer.toString('utf8')，非法字节会被替换字符吸收，随后hash基于解码后的字符串而非严格验证的原始字节。
- 实验：文件字节`41 ff 0a`读取后，外部改为`41 fe 0a`，两次读取hash相同；用第一次hash写入仍返回success。也就是说，这次原始字节变化没有触发STALE_FILE。
- 影响：非UTF-8文本/损坏编码/误读二进制可导致版本判断失真或回写改码。不是证明全部合法UTF-8文件的hash保护失效。
- **修复门槛：** 明确支持编码；优先考虑拒绝非法UTF-8而不是自动“修复”字节。覆盖非法序列、BOM、CRLF、正常中文/emoji及受控写前冲突；不破坏已有hash、审批、跨文件检查点，不整体替换文件工具。

### F61-03 · P2 · GitHub身份网络链缺少应用层取消/响应预算【真实回环HTTP＋替身复现】

- 位置：[github.js](../webagent-core/agent-host/src/auth/github.js) `fetchGitHubUser/startDeviceLogin/pollDeviceLogin`。
- 真实HTTP夹具发送响应头后暂停正文；取消requestScope的父signal后80ms调用仍未结算，补完正文后仍返回用户。请求未传signal。另一个假fetch接受了超过1MiB的JSON，源码text/json没有预缓冲字节上限；1MiB不是现有文档承诺的阈值，只是本轮夹具大小。
- 影响：断开/取消不停止网络读取，慢响应可占用资源。不能把Node底层网络超时当整个身份操作的总期限；也没有证据宣称已经泄露真实GitHub token。
- 已有generation发布屏障仍能防旧登录结果覆盖新身份，不应推翻这部分实现；身份详解已诚实记录没有timeout，不属于“文档撒谎”。
- **修复门槛：** 三条请求链共用有限字节、整个头/体期限、父取消、禁止意外跳转与稳定错误；旧generation、poll去重/slow_down、清除身份不晚写保持。只用假令牌和隔离HTTP，不要求用户提供PAT。

### F61-04 · P2 · 可选统计后台的坏存储被下一次上报覆盖【真实临时文件复现】

- 位置：[admin-host/app.js](../webagent-core/admin-host/app.js) `loadReports/saveReports/ingest`（基线36/45/54行附近）。
- 实验：把临时reports.json写成坏JSON后ingest；既未拒绝，也未保留坏文件原字节。loadReports把错误当空数组，saveReports直接整文件覆盖。
- 影响：已有统计可能不可恢复。此项不影响核心models/store已经具备的坏配置保护，也不是支付/授权功能设计。
- 统计详解已经明确这个局限，本轮把它实际复现并提升为可执行修复项。
- **修复门槛：** 区分ENOENT与损坏/不可读；失败保留原字节，原子发布、备份/恢复政策明确；增加坏JSON、截断、无权限与写中断用例。数值/日期schema、容量归档另作相邻小包，不虚称跨进程锁已解决。

### F61-05 · P1 · 补丁展示的同步diff缺少计算预算【隔离子进程复现】

- 位置：[utils/diff.js](../webagent-core/agent-host/src/utils/diff.js) `createUnifiedDiff`，以及patchEngine对它的调用。
- createTwoFilesPatch与diffLines都未传计算预算，同一差异还算两次；在主机事件循环内同步执行。文件检查点的另一处diff已使用timeout/maxEditLength，不能套用到这里。
- 实验：两侧各8000行互不相同的短文本，远低于8MiB输入上限，隔离Node子进程在2005ms被2秒测试看门狗终止，errorCode=ETIMEDOUT、signal=SIGTERM。这个2秒是测试观察窗，不是产品已承诺或已实现的diff期限；没有声称测到了完整最坏耗时。
- 影响：有界字节不等于有界CPU，长diff会阻塞主机及时处理取消和其他请求。
- **修复门槛：** 明确算法/输出预算，避免重复计算，必要时隔离worker；超限拒绝必须发生在预期写入前。特别复核当前新建文件“写入后再生成diff”分支，不能超限后错误宣称未写，也不能自动重放。

### F61-06 · P2 · 旧后端依赖fallback仍没有独立期限【静态确认，已知剩余】

- 位置：[run-code-oss.js](../webagent-core/scripts/run-code-oss.js) 基线168–180行。
- express marker缺失时launch异步npm install，等待install.finished或stopped，没有该步骤自己的deadline。SIGINT/SIGTERM仍可处理，不能重新误报成F60的同步阻塞。
- **修复门槛：** 为这一分支接入有所有权、工作预算、未知退出的准备控制，保留现有npm参数/依赖策略或显式说明兼容变化；取消后零agent/editor，不能扩大到任意PID/树清理。

## 四、待验证风险与工程优化（不冒充已复现漏洞）

| 项目 | 当前证据与适用条件 | 建议与收益 | 验收/约束 |
|---|---|---|---|
| R1 用量上报网络 | tracker.reportNow无signal/应用层timeout；stopReporter只清调度器；只有配置了URL/token才触发 | 合并在途上报、设总期限与小正文预算，避免周期/debounce重叠 | 故障服务、正文停滞、stop后资源释放；不要自动重放修改类操作 |
| R2 截图字节预算 | readShotAsDataUrl先stat再整文件read；检查与读取之间文件可能增长/被替换，本轮未做该竞态复现 | 以已打开文件描述符验证普通文件并有界读取，核查实际读取字节 | 保留6MiB与现有路径白名单；不能把元数据大小当实际分配上限 |
| R3 Monaco供应链/离线 | monaco.js从固定版本CDN装载脚本；已有7秒后纯文本回退 | 评估可校验的本地资源包、许可证/大小成本；保留纯文本回退 | 不是已发现CDN被入侵；不因优化引入未知版本或复制参考产品 |
| O1 文本与diff统一预算 | 当前各处存在重复/不同级别预算 | 提炼明确的小型内部合同，分别限定读取、解析、计算、输出；优先修F61-02/05 | 不进行“一次重写整个工具栈” |
| O2 统计存储与容量 | 每次整表读改写、无保留上限，数值校验不完整 | 坏文件保护后再加分页/归档、finite整数/日期校验 | 先测数据规模和耗时，不为小规模可选后台盲目上数据库 |
| O3 可观测性 | R4已有阶段诊断，但不是全部失败原因；F60只能确认直接子进程 | 给准备/外部网络/CPU预算统一有限错误码与阶段、明确unknown | 不记录token、命令正文/路径隐私；不以日志补齐冒充根因修复 |
| O4 构建可复现性 | Actions使用主版本引用，Inno通过环境/choco可变工具链 | 评估Action SHA与编译器版本锁定、缓存校验、构建来源记录 | 原Windows/浏览器门禁保留；更新有可逆升级策略 |
| O5 UI/API契约 | Chat已有有界流；其他部分API仍直接response.json；页内generation/绑定保护有价值 | 按端点最大响应与状态schema逐步统一有界消费，不引入全局自动重试 | 重新跑真实Chromium、键盘/窄屏/未知结果场景；本轮不代签 |
| O6 文档可维护性 | 大型阶段/逐函数说明易遗留当前指针；结构检查不能验证语义 | 每批交付固定复核基线、当前状态、失败证据、覆盖账本；只生成结构事实 | 不把生成hash自动变成“已逐句”；不建立第二份路线图 |

## 五、文档与实现对应检查

- **D1 已确认导航滞后（本轮仅纠正导航）。** review/README只介绍到F58，正式清单的“最近接手/本次”仍指F55–58；F59纠偏和F60限定修复不容易从入口辨认。这也是此前交付留下的同步遗漏。本轮更新入口、当前基线和报告链接，保留旧失败历史，不改运行时。
- **D2 源码注释里的旧路径。** computerUse.js仍提`review/REPORT_SHUNCODE_S3.md`，文件现位于`review/archive/REPORT_SHUNCODE_S3.md`。Markdown相对链接扫描0错误不会检出这种注释内的纯文本路径；列入后续文档修复，不冒充功能错误。
- **D3 文档已说明但实现未补齐。** GitHub网络、usage上报、admin坏存储的限制均可在对应详解找到。应建立修复验收，不只是重写措辞。
- **D4 缺少明确编码/差异出口合同。** 文本工具需要说明支持编码、hash对应哪种字节语义、非法文本是否拒绝；Git整体diff需要与单文件敏感规则一致。先修回归与实现，再同步正文，不能只修改文档把问题合理化。
- 暂停/冻结/历史资料的描述不自动成为当前产品承诺；许可证、第三方资料和参考图片未作法律或内容真实性认证。

## 六、模块检查矩阵

| 模块 | 本轮重点 | 尚未覆盖/不可代签 |
|---|---|---|
| 启动/安装/准备 | F60前后Promise、停止/unknown；Inno入口/白名单；F61-06 | 真正首次安装、非默认文件系统、Windows双击/关窗/npm后代 |
| 文件/patch/search/Git | 路径/敏感规则、hash、diff预算、真实文件反例 | 所有文件系统竞态、全部搜索正则/跨进程写入逐行证明 |
| MCP/OAuth/外部服务 | session active pin、固定Origin、DNS pin、审批单次与unknown边界局部核对；既有全量回归 | 所有传输/第三方服务互通；没有新增公网端点试探 |
| 模型/身份/统计 | 请求形状/预算、GitHub父取消、admin持久化 | 真实账号/App/模型调用与长期统计规模 |
| Workbench/原生扩展 | HTML转义、代次/绑定、编辑器回退、原生request/轮换部分链 | 本轮Chromium阻塞；VS Code实际窗口、读屏器及高DPI |
| Windows输入/回收 | C#/PS的句柄持有、活宿主否决、TTY/剪贴板与submitted边界 | 没有本轮本地编译/桌面/跨用户/实际PID复用证据 |
| 文档站/CI/示例/冻结原型 | 静态清单、链接、生成/打包门禁、可选示例6例；冻结仅静态 | 不运行旧原型；不声明全站视觉检查或所有历史正文准确 |
| 暂停探针与资料 | 元数据登记、边界再次确认 | 完全未接手专项审查/修复 |

没有把以下模式命中直接当缺陷：正常HTML转义后的innerHTML；同用户可修改工作区带来的“不是OS沙箱”；DPAPI不等于应用签名；发布generation能防旧结果但不等于取消底层I/O；确认参数中的字符串false经normalize白名单处理，不是看到Boolean就认定授权绕过。

## 七、执行结果与证据可得性

| 检查 | 结果 |
|---|---|
| 基线主机完整测试 | 97/97，退出0；不新增放宽断言 |
| 文档门禁 | 278源码、28目录、111排除，updated=0 |
| npm audit（含dev） | info/low/moderate/high/critical均0；只覆盖此刻锁定的host依赖与公告库，不是源码安全认证 |
| 独立语法/链接扫描 | JS217、JSON13、sh4、SVG2通过；Markdown158份简单相对文件链接缺失候选0 |
| 可选计算器示例 | 6 passed，0 failed；未运行冻结原型 |
| 新隔离反例 | F61-01/02/04真实文件；03真实回环HTTP及替身；05受控子进程；06静态确认 |
| 本轮本地Chromium | 未通过启动：浏览器文件缺失；安装报ECONNRESET/TLS握手前断开。环境阻塞，不冒充断言失败或已验 |
| 基线远端CI | [35663331086](https://github.com/cccjvav/web_agent/actions/runs/35663331086) headSha精确63cbbdc，9个job均success；是基线历史证据，不代签新反例或本轮桌面 |
| Windows/C#/PowerShell | 本轮本地无编译/运行环境；只能引用基线CI已有覆盖，明确其范围 |

原始命令日志在本轮仓库外临时目录，不能保证跨沙箱保留。可携带证据为本文的基线、复现方法/结果、源码定位、CI链接及CSV。没有将用户个人路径或实际凭据复制进证据包。F61发现尚未加入正式回归、尚未修复；应在各修复小包先固化红测。

## 八、修复准备与下一步

执行计划只维护在[阶段10 F61记录](../manager/stages/s10-upstream-adoption.md)，本报告提供验收输入，不另立路线图。

1. 下一轮先复核本报告、来源63cbbdc与新增反例，再把F61-01/02转换为正式负例；优先堵住机密性旁路和版本保护缺口。
2. F61-05计算预算单独小包，与新建/已有文件的副作用顺序一起验证；再补F61-03身份网络和F61-06剩余准备期限。
3. 可选admin/telemetry、CDN与构建优化单独排期；没有真实证据的风险先复现，不按猜测扩大重构。
4. 继续CSV中未逐句的函数/文档审查。若要解除暂停探针、访问用户账号或操作Windows桌面，必须另行确认；本轮确认的是继续暂停。
5. 每包保留红→绿、旧合同、失败历史和精确SHA CI；不延长期限、删断言、无限重试或自动重放未知写入。测试绿灯不注销本报告已确认的问题。

## 附录：最小可携带复现

以下仅在自己创建的临时目录写假数据，调用当前仓库函数；不运行npm安装、真实账号/隧道或用户工作区。建议在仓库根保存为仓库外.cjs运行。代码对应本报告基线；修复后应转成正式拒绝/保留原字节的断言。

### A. 文件、Git、统计与网络参数

```js
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const root=process.cwd();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'webagent-f61-'));
process.env.WORKSPACE_ROOT=tmp;
(async()=>{
 const file=path.join(tmp,'encoding.txt');
 const ops=require(root+'/webagent-core/agent-host/src/tools/fileOps');
 fs.writeFileSync(file,Buffer.from([65,255,10]));
 const before=ops.readFile({filePath:'encoding.txt'});
 fs.writeFileSync(file,Buffer.from([65,254,10]));
 const changed=ops.readFile({filePath:'encoding.txt'});
 const write=await ops.writeFile({filePath:'encoding.txt',content:'edited\n',expectedHash:before.hash,confirm_overwrite:true});
 console.log(JSON.stringify({case:'F61-02',differentRawBytesHaveSameReadHash:before.hash===changed.hash,staleWriteAccepted:write.success}));
 const git=(...args)=>cp.execFileSync('git',args,{cwd:tmp,stdio:'pipe'});
 git('init','-q');fs.writeFileSync(path.join(tmp,'.env'),'AUDIT_FAKE_VALUE=before\n');git('add','.env');git('-c','user.name=Audit Fixture','-c','user.email=audit@example.invalid','commit','-qm','fixture');
 fs.writeFileSync(path.join(tmp,'.env'),'AUDIT_FAKE_VALUE=after\n');
 const g=require(root+'/webagent-core/agent-host/src/tools/gitOps');
 let explicitDenied=false;try{g.gitDiff({filePath:'.env'});}catch(e){explicitDenied=true;}
 const broad=g.gitDiff();git('add','.env');const staged=g.gitDiff({staged:true});
 console.log(JSON.stringify({case:'F61-01',explicitDenied,defaultDiffExposesMarker:broad.diff.includes('AUDIT_FAKE_VALUE=after'),stagedDiffExposesMarker:staged.diff.includes('AUDIT_FAKE_VALUE=after')}));
 const admin=require(root+'/webagent-core/admin-host/app');
 const data=path.join(tmp,'admin');fs.mkdirSync(data);fs.writeFileSync(path.join(data,'reports.json'),'{broken');
 const rejected=(()=>{try{admin.ingest(data,{installId:'fixture-only',toolCalls:1});return false;}catch(e){return true;}})();
 console.log(JSON.stringify({case:'F61-04',corruptStoreRejected:rejected,corruptBytesPreserved:fs.readFileSync(path.join(data,'reports.json'),'utf8')==='{broken'}));
 const auth=require(root+'/webagent-core/agent-host/src/auth/github');
 let options;
 const c=new AbortController();
 await require(root+'/webagent-core/agent-host/src/utils/requestScope').runWithSignal(c.signal,()=>auth.fetchGitHubUser('FAKE_AUDIT_VALUE',async(_url,opts)=>{
  options=opts;c.abort();return{ok:true,text:async()=>JSON.stringify({login:'fixture-user',id:1,padding:'x'.repeat(1024*1024+1)})};
 }));
 console.log(JSON.stringify({case:'F61-03',fetchHasSignal:!!options.signal,parentAborted:c.signal.aborted,acceptedOverOneMiB:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>fs.rmSync(tmp,{recursive:true,force:true}));
```

基线输出：F61-01的explicitDenied/defaultDiffExposesMarker/stagedDiffExposesMarker均true；F61-02的differentRawBytesHaveSameReadHash/staleWriteAccepted均true；F61-04的corruptStoreRejected/corruptBytesPreserved均false；F61-03的fetchHasSignal=false、parentAborted=true、acceptedOverOneMiB=true。

### B. 真实HTTP父取消

```js
const http=require('http'),path=require('path'),fs=require('fs'),os=require('os');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'webagent-f61-network-'));process.env.WORKSPACE_ROOT=tmp;
const root=process.cwd(), sockets=new Set();let response,requestSeen;
const received=new Promise(r=>requestSeen=r);
const server=http.createServer((req,res)=>{response=res;res.writeHead(200,{'Content-Type':'application/json'});res.flushHeaders();requestSeen();});
server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const parent=new AbortController();let settled=false;
 const auth=require(root+'/webagent-core/agent-host/src/auth/github');
 const scope=require(root+'/webagent-core/agent-host/src/utils/requestScope');
 const pending=scope.runWithSignal(parent.signal,()=>auth.fetchGitHubUser('FAKE_ONLY',(_url,opts)=>fetch('http://127.0.0.1:'+server.address().port,opts))).finally(()=>settled=true);
 await received;parent.abort();await new Promise(r=>setTimeout(r,80));
 const settledAfterAbort=settled;
 response.end(JSON.stringify({login:'fixture',id:1}));
 await pending;
 console.log(JSON.stringify({case:'F61-03-real-http',settledAfterParentAbort:settledAfterAbort,returnedUserAfterAbort:true}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{for(const socket of sockets)socket.destroy();server.close();fs.rmSync(tmp,{recursive:true,force:true});});
```

基线输出：settledAfterParentAbort=false、returnedUserAfterAbort=true。没有发往GitHub，所有连接仅为本夹具回环服务。

### C. 同步diff的有界观察

```js
const cp = require('child_process');
const modulePath = require('path').resolve('webagent-core/agent-host/src/utils/diff');
const code = `const a=Array.from({length:8000},(_,i)=>'before-'+i).join('\\n'), b=Array.from({length:8000},(_,i)=>'after-'+i).join('\\n'); require(${JSON.stringify(modulePath)}).createUnifiedDiff('fixture.txt',a,b);`;
const started = Date.now();
const result = cp.spawnSync(process.execPath, ['-e', code], {timeout:2000, encoding:'utf8'});
console.log({elapsedMs:Date.now()-started, status:result.status, signal:result.signal, errorCode:result.error?.code});
```

基线输出：elapsedMs=2005、status=null、signal=SIGTERM、errorCode=ETIMEDOUT。不同硬件时长会变化；不是用2秒测试窗修改产品预算。
