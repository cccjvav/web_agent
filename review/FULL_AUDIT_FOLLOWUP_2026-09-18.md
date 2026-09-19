<!-- 定位：第45组全仓交叉审查及第46–48组非探针审批、API/workflow结果边界追加报告；结论按证据范围成立，不是用户实机或形式化安全认证。 -->

# 全仓交叉审查与实修报告（2026-09-18，续至09-19）

- 固定分支：`arena/01a0b053-web-agent`
- 同步目标：`arena/01a0b0da-web-agent`，基线 `81fb5c2527bffe227c6e69afedae466b25aadf82`
- 前置报告：[全仓检查与优化报告](OPTIMIZATION_REPORT_2026-09-18.md)

## 1. 结论摘要

本轮先逐项交叉复核前置报告，再扩展到工作台结果合同、认证并发、文件创建、PTY、HTML/CSS/键盘交互、CI、文档库存和非探针辅助项目。前置报告的P1-A七个结果消费者与P2-D设备码竞态均确认存在并已修；P2-A生产依赖审计改为高危硬门禁。扩展审查另发现并修复Chat流缺可靠终态、`createOnly`链路非独占、补丁后读覆盖草稿、Bridge刷新真假值、模态/页签/工具卡键盘语义和窄屏侧栏。第46组续审非探针审批结果与工作流schema，修复临近审批期限完成的结果立即淘汰、expired不可观察/可被迟到取消改写，工作流/外部请求未知字段与矛盾合同、命令结果/取消/get_logs跨peer未隔离及远程get_task_status误读Local计划及get_capabilities目录ACL不一致。第47组继续结果链：外部MCP的ok:false不再被缺isError覆盖成成功，工作流多文件部分读取失败不能启动后续写入，模型设置POST不再接受空/未知/错类型请求或把脱敏旧Key转绑新端点。第48组再收紧模型工具返回式失败、Skill写后unknown核验与审批历史容量：终态失败不画绿或进入截图分支，创建只在verified时确认，完整15分钟结果/requestKey墓碑不再为新请求提前让位。探针由另一位助手负责，本分支不保留探针实现改动。

在当前自动化与静态证据范围内，没有遗留已知P0/P1阻塞。这个结论不等于形式化安全证明，也不覆盖真实Windows/VS Code、屏幕阅读器、手机、Cloudflare/ngrok或第三方模型服务实机。

## 2. 覆盖方法

| 范围 | 实际检查 |
|---|---|
| JavaScript / Node | 当前库存249项源码、其中204份JS；本批改动JS集中做`node --check`，并阅读网络结果消费者、认证、文件、PTY、补丁、状态发布与UI动态DOM；完整84文件主测试 |
| HTML / CSS / 浏览器代码 | 重复ID、控件名称/标签、原生按钮、ARIA、焦点、键盘页签、11px下限、390px布局静态与VM回归；真实Chromium断言已写入但本机浏览器缺失 |
| Python | 库存中的2份Python用`py_compile`；辅助打包器仍由主测试/Windows CI覆盖 |
| C# / PowerShell / CMD / Shell | 4份Shell以`bash -n`检查；C#/PowerShell/CMD在本机无编译器，仅核对现有Windows CI编译/解析门禁，不冒充本地执行 |
| 文档 | `check-docs --write`重建当前249源码、28目录、110排除库存；函数说明学习/质量/政策/链接守卫、文档站构建与镜像一致性 |
| 非探针辅助项目 | calculator 6项、trace-inspector 77项；冻结`webagent-repro/`保持零差异。探针目录按暂停边界不审不改 |
| 依赖与CI | 生产依赖`npm audit --omit=dev --audit-level=high`；工作流最小`contents: read`权限与高危门禁人工复核 |

## 3. 已修问题与边界

### 3.1 结果消费与可靠终态

- `bind.js`的演示登录、令牌/设备登录、清除身份、新建文件、终端、搜索和Skill创建现在同时验证HTTP、严格业务字段与关键响应形状；写已确认但后续读取失败会单独提示，不自动重放写操作。
- `chat.js`拒绝非2xx、无body、畸形NDJSON、超限未分帧缓冲、无`done/error`终态的断流，以及`error → done`伪成功；只有可靠`done`且未见`error`才写入assistant历史。
- `tabs.js`的文件树、打开文件、保存、预览和回退要求可信内容/hash/路径合同；补丁后读通过`reconcilePatchedFile`协调：干净标签更新磁盘内容，脏草稿保留并依赖旧hash阻止误覆盖。
- Bridge活动刷新返回真实布尔结果；清除本轮的写确认不会因随后状态读取失败被改写成“未清除”。

### 3.2 认证、文件与PTY

- GitHub身份操作使用服务端和浏览器两层代次。新设备流程、令牌登录、演示登录或清除都会淘汰旧流程；设备poll单飞，旧异步响应不能覆盖新身份。
- 浏览器新建发送`createOnly:true`；路由、工具入口和文件写入均传递该合同，独占临时文件加硬链接完成原子创建；`EEXIST`映射`E_FILE_EXISTS`/HTTP 409。并发HTTP回归证明同一路径只允许一个胜者。该保证不宣称隔离同用户外部进程对父目录的恶意竞态。
- PTY的hello、poll、claim、accept、check、input和cancel消费者只接受2xx及对应严格业务字段；HTTP 409伪成功不能确认或spawn。发行安装镜像与规范扩展按字节同步。

### 3.3 UI、排版与交互

- 静态表单控件补齐可访问名称，伪链接/可点击容器改为原生按钮；动态文件树、搜索结果、编辑器标签、空聊天入口和工具详情均可键盘操作。
- 模态框打开后聚焦内部，`Tab/Shift+Tab`约束可见控件，`Escape`关闭并恢复触发器焦点；折叠`details`里的隐藏后代不进入焦点循环。
- 编辑器标签与右侧Chat/Bridge页签采用`aria-selected`、`aria-controls`、roving tabindex以及左右/Home/End键；tabpanel关系明确。工具卡原生披露按钮同步`aria-expanded`。
- 所有工作台小字下限调整为11px，补统一`focus-visible`轮廓；390px下侧栏改为视口内覆盖抽屉，中心/右栏保持可达并禁止水平溢出。

### 3.4 工程化、文档与辅助项目

- GitHub Actions顶层权限收敛为`contents: read`；生产依赖高/严重公告现在直接使CI失败，不再`continue-on-error`。
- `.webagent`本地身份、用量、记忆和定制文件加入嵌套及根忽略规则，避免启动工作台后反复污染工作树或误提交本地数据。
- 文档库存、函数说明、测试导航、API/认证/PTY/工作台页面与样式说明已同步；自动生成`documentation-manifest.json`、`source-index.md`与`content.js`。
- **范围纠正：** 曾因把“全仓检查”错误理解为可修改所有辅助项目，对`arena-model-probe`运行专项verify并改动README、`src/learned.js`和`tools/e2e.mjs`。用户重申该项目由另一位助手负责后，三文件全部恢复到同步基线`81fb5c2`；观察到的同名建档现象仅作为未裁决线索移交，不在本报告认定缺陷、方案或完成状态。

### 3.5 第46组：审批结果、工作流schema与caller隔离

- `operatorQueue`原来按`createdAt`淘汰所有终态。若操作在15分钟待批期限末才获批，执行结果可能刚完成便在下次查询消失；waiting在同一次prune里先转expired又立即删除，迟到cancel还可把尚未触发清理的超期请求改成denied。
- 修复后进入running和终态分别记录`startedAt`/`finishedAt`；expired、denied及执行终结均从`finishedAt`完整保留15分钟，公开`expiresAt`反映当前阶段的真实保留点，cancel先prune。队列仍是进程内、按访问清理和约40条容量，不宣称持久exactly-once。
- `workflow`定义顶层现在仅允许`steps`，preview/request包装也拒绝未知字段，并继续维持步骤白名单；`exists:false`不能再和必须存在并读取文件的`contains`或`sha256`组合。原扫描还漏掉`$steps.id`整个输出形式及结构上危险/空路径段，可能让必然失败的自/前向引用在先前写入后才暴露；递归`validateReferences`现于审批前限制为安全的前序步骤，正文中间同名文字仍为字面量。
- 同一审批入口的`external_request`/`operation_result`原会静默忽略autoApprove/autoRetry等未知包装字段；运行时和公开schema现分别只接受固定请求字段，未知字段不能进入审阅/查询流程，入队仍不代表批准，未知ID也不是重试许可。
- 相邻命令消费者复核发现`executor`的最近ID与记录全局共享：另一已认证peer可按已知execId读取/取消，不传ID还会取全局最近命令。命令记录现绑定内部owner；远程使用服务端认证后的peer/兼容caller键，显式ID、缺省最近记录和取消均只在该owner名下查找，跨peer统一found:false。桌面仍共享local命名空间，事件/公开结果不暴露owner。`getLogs`也曾忽略handler上下文并汇总全局事件；远程现只得到`sessionIdFor`匹配的有界执行追踪，本机仍可查看宿主事件。`getTaskStatus`还曾忽略handler上下文并向远程返回Local计划；现把options传给`getTaskState/stateFor`，本机和各peer分别只读自身快照；未知peer读取使用未保存idle快照，不消耗16个报告槽。`getCapabilities`也改为远程复用`tools/list`的当前ACL过滤，不再向只读peer重新广告已隐藏的写/命令工具。
- 可控`Date.now`回归覆盖临期完成后的完整结果窗口、最终淘汰、expired可见和迟到cancel；工作流负例覆盖顶层未知字段、两类矛盾条件、完整输出自/前向引用、危险/空路径段及字面量非误判；executionControl用第二peer证明无法读/停原peer命令而原所有者仍可操作。相邻长篇说明仅更新该局部，不因此整篇认证。

### 3.6 第47组：外部结果、部分读取与模型设置事务

- `externalClient.execute`原来无条件用`output.isError !== true`覆盖第三方结果的`ok`。真实MCP若明确返回`ok:false`但未同时设置标准isError，记录会被改成`ok:true`并由审批队列标succeeded。现先保留外部字段、覆盖宿主external-reported验证，再用共享`isToolFailure`统一派生ok；ok:false/success:false/isError/失败status/非零exitCode等均不能相互覆盖成成功。它仍是外部自报，失败不证明绝无副作用。
- `read_files`的多路径普通调用有意返回成功项和逐项error，不整体抛错；工作流此前只看顶层/trace，因此一个路径缺失时仍会把该步当succeeded并执行后续写。新增`hasPartialReadFailure`仅在固定工作流把显式逐项error提升为failed/E_PARTIAL_READ，后续步骤不派发；普通read_files的部分结果合同不变。
- `/models`旧普通分支会把空对象、拼错字段和非法multiModel当成功或在保存时给非结构化500；GET得到的`••••`整表回写还会把真实Key永久替换成掩码。更危险的是单model浅合并可在省略Key时改baseUrl并沿用旧秘密。新增独立`modelSettings.js`：严格非空包装、1–100模型与字段预算、active/merge引用和multiModel布尔/枚举/2–8范围；旧整表掩码只在同id、protocol/baseUrl/modelId不变时恢复，连接身份变化必须显式提供Key字段。addProvider另从“每批≤100”补为现有加本批总计≤100，不能分批绕开整表预算。全部校验后一次同步save，输入失败配置字节不变；不宣称跨进程CAS、Key有效或真实提供商兼容。
- 三条回归均先在旧实现转红：外部ok:false得到succeeded、双路径部分读取后真实创建文件、整表回写把fixture Key落成四圆点；追加目录预算也先得到200并写入超过100项。修复后定向测试通过。首轮全量另为80/83：文档质量守卫抓到交接表暂失唯一“下一项”，站点守卫抓到源码快照未重建，工作流负例抓到状态重排误少optional chain；均修复、定向复验后最终83/83。保留这些失败，不用最终绿灯抹去红测或施工回归事实。

### 3.7 第48组：模型工具结果、Skill写后确认与队列容量

- `runOpenAI`与`runChat.timedTool`原来只把`ok:false`或`success:false`当作返回式失败。`operation_result`正常返回的公开记录以顶层`status:'failed'`表达终态，因此被发成`ok:true`工具事件；OpenAI路径还会继续走命令截图等成功专属逻辑。两处现统一复用`toolTrace.isToolFailure`，覆盖失败/取消/unknown状态、trace、超时、非零退出及unknown核验。返回式失败保留完整有界result、发`ok:false`和归一错误；OpenAI仍把原JSON作为tool消息给下一轮模型，真正抛错才使用`ERROR:`合同，失败命令不采集截图。模型夹具登记并真实批准一个进程内failed operation，断言下一轮收到原error且UI事件不假绿。
- `/skills`旧路由只等待`write_file` Promise，不检查返回对象。若实际写入后read-back发生变化，中央工具会正常return `success:false`/`E_VERIFY_UNKNOWN`，路由却仍答200创建成功。现成功要求`success===true`且`verification.state==='verified'`；返回式失败或unknown答409并保留code/verification，要求先核对目标而非自动重试，抛出的重名/输入异常仍为400。真实HTTP夹具用一次性`file_written`监听在写入和核验之间删除目标，确认最终不报成功；这不是外部OS竞争穷举或副作用回滚。
- `operatorQueue.prune`虽从finishedAt保留结果，却在`jobs.size>40`时提前删任何终态；持续新请求会在15分钟内丢掉结果查询与requestKey去重墓碑。现40条成为硬上限：prune只删完整窗口外终态；submit先查同owner/key/摘要，原请求在满容量仍可命中，新的不同请求明确拒绝。`operatorQueueCapacity`固定时钟顺序批准40条，锁定首条结果、重复key零重执行、第41条拒绝及窗口后恢复。该策略以可查询和窗口内幂等证据优先，代价是满容量期间拒绝新工作；仍不提供重启/多进程持久exactly-once。
- Agent、API、队列和测试说明同步；另纠正Chat调度说明中“空工作区初始化npm test”的过时描述，实际代码早已初始化空命令。首轮完整套件为83/84，唯一失败是生成库存已发现新测试、documentationLearning映射尚未登记；补入唯一主指南并写明`main`后，五项文档守卫及最终84/84通过。文档249/28/110、生产audit 0漏洞、探针目录零diff。实现`f89767fdbbc3db1787bf48bb10a32895b1dca647`的CI35408375271九项成功，没有继承第47组绿灯。

## 4. 前置报告交叉复核状态

| 前置项 | 当前状态 |
|---|---|
| P1-A 七个假成功/坏结果消费者 | 已逐项修复并加入VM/HTTP/PTY回归 |
| P2-D 设备码轮询无catch/代次/中止 | 已修：AbortController、浏览器代次、服务端代次及poll单飞 |
| P2-A 审计不阻断CI | 已修：高危生产依赖硬门禁 |
| P2-B Node 18/20 EOL | 保留，属于兼容矩阵与最低版本的产品取舍；不在本轮擅自缩减 |
| P2-C 缺少lint/format | 仍在；当前有语法、Acorn函数文档和行为测试，但不等价ESLint。引入前需处理旧代码告警及冻结目录边界 |
| P2-E 长文件拆分 | 未做；为拆而拆会放大风险，当前优先保持行为修复可审 |
| P3 生成物/截图/发行副本权重 | 未改仓库策略；保留现有生成一致性与安装镜像字节守卫 |

## 5. 验证结果

第46组实现`a85fa5a21a7bba448665f3f6da9671aad56dab6d`之[CI35397169896](https://github.com/cccjvav/web_agent/actions/runs/35397169896)九项逐项成功；第47组没有继承该旧绿灯，其实现`874006e4b8b6d2e1e5bb126e7c2d2a66314acc78`的[CI35402127412](https://github.com/cccjvav/web_agent/actions/runs/35402127412)也已九项逐项成功；第48组实现`f89767fdbbc3db1787bf48bb10a32895b1dca647`的[CI35408375271](https://github.com/cccjvav/web_agent/actions/runs/35408375271)再次九项逐项成功：

- 第48组：定向`modelLifecycle`、`apiFiles`、`operatorQueueCapacity`、`approvedOperations`、`workflowPreconditions`、`runChat`通过；7份改动源码/测试JS通过`node --check`。首轮83/84及登记原因如3.7保留，补齐后完整84/84通过；故意注入的`fixture stop failed`等stderr不代表套件失败。
- 第48组文档/范围：库存249项源码、28目录、110排除，`check-docs`只读updated=0；documentationLearning/Quality/Policy/Links/docsSite五项通过且站点与build一致；生产audit 0漏洞、两个探针目录零diff、`git diff --check`通过。CI实际覆盖Windows Node20/22/24及重复取消/stdio、Ubuntu18/20/22/24、真实Chromium和Windows安装器；不把自动执行的存量探针测试称为专项审查。
- agent-host：第46组代码/回归加入后，83个测试文件全部通过；故意注入的`fixture stop failed`等stderr不代表套件失败。
- 第47组：首轮80/83及原因如3.6保留，修正后的完整83/83通过；`approvedOperations`、`workflowPreconditions`、`apiFiles`与`providers`均在全量中通过，9份相关JS通过`node --check`。
- 第47组文档/范围：库存248项源码、28目录、110排除，`check-docs`只读updated=0，站点内容与build一致；生产依赖audit为0漏洞；相对`ff948013`的两个探针目录零diff。CI覆盖Windows Node20/22/24、Ubuntu18/20/22/24、真实Chromium及Windows安装器；不把全量中自动经过的存量探针测试称为专项审查。
- 第46组定向：`approvedOperations.test.js`、`workflowPreconditions.test.js`、`executionControl.test.js`、`ptyLifecycle.test.js`、`ptyJobs.test.js`和`taskProgress.test.js`通过；相关实现/测试通过`node --check`。
- 文档：247项源码、28个目录、110项排除；清单检查、函数学习/质量守卫及文档站构建一致。扩展后首轮完整套件唯一docsSite失败是恢复段在站点生成后又改文案造成的精确镜像漂移（82/83）；重建后最终83/83。
- 非探针辅助项目：calculator 6/6；trace-inspector 77/77。早先Probe专项结果不再作为本批交付证据。
- 生产依赖审计：0个已知漏洞；结论只对应执行时公告与生产依赖。
- 语法/镜像：202份库存JS、2份Python、4份Shell通过对应本地语法检查；规范扩展与安装镜像一致；`webagent-repro/`零差异。
- 真实浏览器：本机没有Playwright Chromium，下载此前持续`ECONNRESET`。首推`e0fdf65`的[CI 35380095907](https://github.com/cccjvav/web_agent/actions/runs/35380095907)中8个非浏览器任务通过；Chromium实际发现桌面已展开侧栏在首次跨入640px时遮挡Agent菜单。`04c8e04`在跨入700px抽屉断点时收起旧桌面侧栏并恢复ARIA/焦点、升级checkout/setup-node动作运行时；[CI 35381193695](https://github.com/cccjvav/web_agent/actions/runs/35381193695)确认该处已越过并再次8/9，但随后暴露Skill失败提示的浏览器断言仍要求旧版纯错误串。后续断言同时要求新“状态未知”语义和原服务端错误；修复`cc77941`的[CI 35381668516](https://github.com/cccjvav/web_agent/actions/runs/35381668516)九项逐项成功。该结果早于探针边界纠正；三文件恢复提交`27fca73`的[CI 35386685807](https://github.com/cccjvav/web_agent/actions/runs/35386685807)另行九项成功，未继承旧绿灯。

## 6. 仍需保留的风险/决策

1. 当前实现`f89767f`的九项CI覆盖Ubuntu/Windows Node矩阵、Windows C#/PowerShell/Inno和真实Chromium；这仍不代签用户桌面、手机、第三方服务或屏幕阅读器验收。
2. Node 18/20最低兼容与矩阵是否退役需产品决定，并同步`engines`和用户指南。
3. 最小ESLint、`routes.js`拆分及`content.js`生成物策略仍是维护性候选，不是本轮功能缺陷。
4. 真实VS Code、多窗口、屏幕阅读器、手机窄屏、隧道和第三方OAuth/模型服务仍按人工清单验收。
5. 探针专项整体由另一位助手负责并继续暂停；本分支已撤回误做的三文件修改，后续不运行专项审查、不实现线索、不改探针文档，等待正式交接。
6. 全仓逐文件清单中的“待逐句”文档仍不能因本报告自动获得语义认证；本报告只对上表列明的代码链与相邻说明负责。
7. 审批队列仍驻留单进程内存；40条未过保留窗口时会拒绝新请求，窗口届满、重启和跨进程均不保证结果续查。若产品要求持久exactly-once或更高吞吐，需另行设计存储、背压和幂等协议，不能从本次硬容量/保留窗口外推。

## 7. Git工作区恢复记录

对话中断后，沙箱曾四次把固定分支ref恢复到初始`1d532d0`，但工作文件仍保留目标分支及未提交修改。首次先保存二进制diff及未跟踪文件清单，再显式fetch目标分支，确认`FETCH_HEAD=81fb5c2`；第46组期间后两次复现时同样先做外部备份、第三次另存完整非Git/依赖工作树压缩包，并核对远端均为`27fca73`。前三次都只用`update-ref`和`read-tree`恢复当前固定分支引用/索引，没有`reset --hard`、`clean`或覆盖工作文件。第三次先表现为documentationLinks把现行docs/guides文件误判为旧根路径缺项；恢复后原样通过，未为掩盖环境问题改清单。

第48组开始时第四次复现，本地HEAD为`1d532d0`，远端却已从先前核对的`ff948013`前移到`90c0a9b`。任何恢复前先建立`/home/user/r48-recovery-1789775918/`：含binary diff、17个目标文件、状态/校验和及排除`.git`/依赖的全工作树压缩包。只读fetch证明`ff948013`是`90c0a9b`祖先，新增两提交正是第47组实现/证据；随后仅恢复ref/index，远端独有文件从索引取回，八个重叠文本以`ff948013`为共同基线三方合并并人工合并两个同段冲突。目标改动逐项对照备份后通过专项/全量测试。此记录防止后续把上游历史误算成本轮修改，也不能把异常ref当成普通Git状态直接硬重置。
