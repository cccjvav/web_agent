<!-- 定位：阶段10的目标、需求、设计、实现计划、交接约束、验证证据与复盘；由CONTEXT按需导航。 -->

# 阶段10：继续上游借鉴与文档整顿

## 目标

继续完成已授权的剩余施工，并正式开展全仓逐句审查；不将候选、暂停或未实机项目当成已完成。当前焦点与最近验证从[管理索引](../CONTEXT.md)进入。

## 需求

- 用户持续要求完成此前待办、及时推送、逐句对照并整理/更新/退役文档。
- 用户要求交接彻底并入原项目管理，不新增独立路线文件或平行交接入口。
- 探测专项保持暂停，等待外部正式交接；原有失败、授权和用户验收边界不变，见[阶段8](s8-probe-integration.md)。

## 设计

沿用项目管家既有L0/L1/L2：AGENTS发现规则；CONTEXT/agents提供轻量索引与约定；本阶段承载计划、完成条件、交接和证据；专项规范留manager/docs。没有改动只读manager/SKILL.md或project-manager技能原文，也不新增管理文件类型。

工作包状态只维护在下面的表中；后面的实施批次是历史过程，不能把其中“当前/下一项”直接当今天的指令。正式审查的文件覆盖留在review清单，不另排项目优先级。

## 实现

### 当前工作包与交接约束

两项当前任务：继续全部剩余待办，同时按[正式全仓逐句审查清单](../../review/FULL_REVIEW_INDEX.md)逐文件开展正式审查；整理和测试不代替逐句核对。

> 更新：2026-09-17。面向接力助手与项目主人，不替代产品《使用指南》。本交接以Git checkout为准，安装包不保证包含开发测试/管理资料。这是经管理索引按需进入的现行施工计划与交接约束，不是“全部完成”报告。每次完成一项，应更新对应路线状态和证据，而不是只在末尾追加新结论。

#### 1. 接手边界

用户2026-09-17再次要求继续全部既有待办，并优先整理杂乱文档。现已建立[文档中心](../../docs/README.md)；结构归类不代替R2/R3等代码施工或全仓逐句复核，探测仍暂停。

**项目尚未全部完成；探测专项暂停；当前可以继续非探测代码/文档审查，无需重复申请已有授权。** 不要重新设计已交付的权限、恢复和MCP功能，也不要把后续工作压缩成“只差用户手工验收”。

当前提交、验证状态与焦点只从[CONTEXT](../CONTEXT.md)进入，具体CI/失败依据在[阶段10](s10-upstream-adoption.md)。本计划章节不另存一份“最新SHA/CI”表；本阶段的工作包表是当前剩余计划的唯一维护位置。历史批次证据仍保留在阶段记录与Git。

##### 权威入口与冲突处理

1. 当前会话的用户最新要求、平台绑定分支与安全约束优先。
2. [AGENTS](../../AGENTS.md)、[项目规则](../agents.md)、[管理索引](../CONTEXT.md)说明工作方式与现行状态；不支持Skill时先看[管家规则](../SKILL.md)。
3. [逐句审查台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)记已审范围、未审范围和具体失败；[阶段10](s10-upstream-adoption.md)记施工证据。
4. [上游26类采用地图](../../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md)保留候选出处与阅读深度，不把其中早期“本批”当今天状态。
5. [Windows清单](../../review/CHECKLIST_WINDOWS.md)是人工验收判定入口；聊天报告只按用户实际报告的范围记入，不扩大结论。

遇到文档冲突，先对照当前代码和绑定提交的测试，直接修错误正文并保留历史证据。链接/AST齐全不等于全文语义正确。

#### 2. 新助手第一小时的顺序

这是顺序建议，不是必须一小时完成的工期承诺。

1. 先读管理索引，再按导航读本阶段与当前会话要求，确认探测暂停、最终本机验收尚未开始。
2. 在实际checkout读取`git status --short`、`git branch --show-current`、`git log -1 --format=fuller`、`git diff --stat`。记录已有修改归属，不把全部脏树直接add/commit。
3. 用git/gh核对远端当前分支和精确CI。新Arena会话若绑定了不同分支，遵守新会话绑定，不机械切回本文旧分支；同一会话内不得改分支。不要索要GitHub密码、PAT、OAuth Token或2FA。
4. 若沙箱重建后HEAD看起来回到很旧的提交，但文件像最新版：**停止普通提交流程**。先获取远端、备份真实差异，按远端树逐文件核对。不要reset --hard、clean -fd或整树覆盖；是否恢复索引/指针必须有明确证据，不能把此经验变成自动恢复脚本。
5. 安装本checkout开发依赖并跑基线检查，见第6节。依赖缺失不是产品测试已经失败，也不是可以跳过测试的理由；失败保留原始输出。
6. 接手后按第4节实际状态选下一项：R1第24组首包已做，R3第31组状态/选择首包已做，Provider追加第32组已修，续其余API/工作流及R2安全依赖，不重做已交付批次；出现新的可复现高风险缺陷优先插队，先记复现与权限边界，再加回归修复。
7. 完成一个可验证闭环就更新正文、生成站点、全量测试并及时推送。汇报用简明中文直接写聊天，用户不一定能可靠看到报告查看器。

#### 3. 已交付内容：不要重新施工

| 能力 | 现状 | 仍不能声称什么 |
|---|---|---|
| Chat/Bridge及主人权限 | idle/chat/bridge，同类型可并发，跨类型互斥；Read/Edit/Execute/Capture由本机保存 | Execute不是OS沙箱；远端不能替主人改策略，Ask/Plan/Code不是同一个开关 |
| 手机Arena入站MCP | 用户报告手机浏览器登录Arena并用MCP链接连接成功；手机固定Bridge | 不是远程工作台UI；未提供蜂窝/OS/浏览器/全工具结果 |
| Bridge统计/Tasks | 主机快照，页面刷新不清零；任务按会话隔离、显式上报 | Tasks不是工具日志，也不是完成质量证明 |
| 模型失败 | 非builtin配置或模型失败停止；回退只能由用户明确选择 | 不自动换模型、重放修改或伪装通用推理 |
| 外部MCP出站 | 有界发现、回环HTTP(S)、显式stdio、明确批准公网HTTPS/DNS固定连接；工具逐次审批 | 入站Arena不要求启用它；不含自动OAuth登录/刷新；外部结果是自报，真实厂商兼容待验 |
| 文本恢复 | 经典保存回退、原生未保存草稿恢复、任务前跨文件检查点三种入口 | 非原子项目回滚，不恢复创建/删除/重命名/数据库/外部命令效果；部分完成须如实报告 |
| 文档站/测试入口 | 中文和斜线锚点、搜索状态已修；npm test有依赖预检，真实Chromium另跑 | 不认证全部Markdown或真实VSCode窗口 |
| Skill与隧道 | Skill新建拒绝重名覆盖；启停不假报成功；Named/ngrok逐流遮盖跨块Token | 不清洗历史日志，不隐藏进程argv/env，不是所有秘密扫描器 |
| Git只读工具 | 字面路径，NUL状态/原路径，准确截断；禁外部diff/textconv/fsmonitor及已发现自定义filter | 与LFS/转换驱动终端结果可能不同；整仓diff仍可能含已跟踪秘密，不隔离同用户配置竞态 |

##### 恢复功能的不可丢约束

检查点：本机明确创建、1–12个已有普通UTF-8文件、每文件64KiB/原文合计256KiB、最多8条、15分钟惰性TTL。预览绑定hash，确认一次消费；全预检失败零写入，执行中失败可能部分完成，unknown必须查盘。重启/过期丢失，不自动补偿/重放。

详细实现以[编辑回退详解](../../webagent-core/agent-host/src/utils/编辑回退详解.md)、[原生扩展详解](../../webagent-core/extension/入口与Webview详解.md)为准，别为简化UI去掉版本校验。

#### 4. 路线图：按顺序推进，有结束条件

状态含义：**进行中/待做**属于当前计划；**候选**要先设计与核对收益；**暂停**不施工；**待用户实机**不能由沙箱代签。没有截止日期或“全自动做完”的虚假承诺。

| ID / 优先级 | 状态与工作包 | 入口与依赖 | 完成标准 |
|---|---|---|---|
| R0 / 持续 | 交接、证据与范围同步 | 本页、CONTEXT、语义台账、阶段10 | 新助手不翻聊天也能知道下一项、精确基线、失败和阻塞；每批改对应状态 |
| R1 / 本包完成 | 第24组三模块复核与确认缺陷修复已交付，范围/验证见阶段10 | [画像与记忆详解](../../webagent-core/agent-host/src/models/画像与记忆详解.md)，profile.js/customizations.js/memory.js；不依赖探测或用户本机 | 整篇对照实际函数/磁盘路径/预算/坏文件/中文召回/并发；核对假阳性后修代码，profile/memoryRecall及全量回归通过，明确未审的依赖 |
| R2 / 高，穿插 | 进行中：安全正文剩余实现对照 | [SECURITY](../../SECURITY.md)，localControl、corsAllow、OAuth、externalClient、执行控制、事件和存储模块；已有Git/隧道修复不重做 | 按入口→认证→权限→执行→取消→输出查调用链；对发现风险做真实负例，修错误正文，不以读完整安全说明代替实现审计 |
| R3 / 下一项，高 | 进行中：第25/27/31/32组定制设置、模型选择/多模型保存、状态刷新及Provider追加首包已修；继续operatorQueue/workflows与其余API结果/状态消费者 | [API逐项详解](../../webagent-core/agent-host/src/api/路由逐项详解.md)、operatorQueue/workflows、工具入口与相关测试 | 每路由核对HTTP与业务结果、审批前后复查、deep copy/幂等/取消/unknown；失败不自动重放，不扩大任意命令权限 |
| R4 / 高，独立追查 | 未定位：Windows22历史两项超时 | 第5节确切失败记录；executor/commandJob/patchEngine/searchWorker与Windows CI | 保留原失败，获得可解释复现或足够诊断证据；有证据才改根因并验证，不以加时限/重复到绿结案 |
| R5 / 中 | 待做：PTY/Windows互操作与剩余目录说明 | executor/ptyJobs、核心扩展ptyHost/ptyPolicy、computer-use既有实现；不进入暂停的探测整合 | 核对所有者、可观察退出、审批过期、取消、路径/脚本/编译分支；代码与说明修好，实机项继续单列 |
| R6 / 中 | 候选设计与分项实现 | 第4.2节、上游26类地图；完成明确缺陷修复优先 | 每项先写最小范围、输入/预算/权限/失败、回归与取舍；有收益且不突破授权边界再落地，不把全部候选统一许诺为必做 |
| R7 / 结构首包已做，语义继续 | 第26组集中19篇专题、归档17篇旧审查、删除过期PROMPT；其余README/管理旧现状继续核对 | 源码清单、目录README、根维护/安装说明及阶段索引 | 活跃正文无相互矛盾的“当前”；无用旧指南退役，有效教学/历史失败保留；给出已审和未审清单而不是总称100% |
| R8 / 分项就绪后 | 待用户实机：项目根MCP验收 | 第7节、Windows清单M/W/T/G等；用户接入后核对工具身份 | 逐项有提交、实际环境、动作、退出码/效果与脱敏证据；失败/未执行如实留存，不借CI代签 |
| P / 暂停 | 探测整合、迁移与专项复核 | 第8节，另一助手正式交接前不动 | 交接后先锁版本/权限/接口/数据方案并重排范围，不自行恢复施工 |

##### 4.1 当前路线的证据入口

R1及R3已交付部分以表内范围为准，细节见[阶段10第24–28组](s10-upstream-adoption.md)；不能把早先的CI阻塞提示当作今天的状态。正式逐句审查的文件状态只维护在[审查清单](../../review/FULL_REVIEW_INDEX.md)，发现和处置见[语义台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)。本计划章节维护工作包与结束条件，逐批实现/CI日志保留在下面的历史证据章节。

##### 4.2 候选的范围与决策门槛

| 候选 | 先设计什么 | 不默认承诺 |
|---|---|---|
| 文件变化提示 | 用户启用、限定目录、去抖/背压、失效与删除、关闭回收 | 跨工作区常驻监视或无限扫描 |
| 公平性/限流 | 可信会话身份、拒绝不增计数、队列/取消/公平测试 | 根据不可信代理头分配身份，或仅凭已有入口限流就说公平性完成 |
| 性质/变异测试 | 先做路径、SSE、hash、审批的有界生成/变异；已有OAuth/Token有界对照不重做 | 小范围穷举等于形式化证明、小时级全仓门禁 |
| OCR/图片/桌面增强 | 中文质量门槛、像素/字节预算、目标窗口/焦点/DPI、明确可选依赖 | 自动安装OpenCV、通用OCR准确性、Linux测试替代Windows桌面 |
| 发布来源/签名 | 校验和、产物来源、构建可复现性、发布权限与验签说明 | 自动申请密钥、提高OIDC权限、发布Release或签名证书 |
| 通用补偿/回滚 | 哪些副作用可逆、部分失败记录、操作者确认与冲突 | 把现有内容检查点扩称原子事务或自动重试系统 |

新增收费/凭据/第三方上传、系统安装、扩大公网暴露、OS权限或发布权限，以及删迁用户数据的决定要及时向用户说明。已经授权的审查、复现、修复、测试、文档和正常推送不反复询问。

#### 5. 已知失败与未解决风险

##### 5.1 Windows超时尚未查明

- 提交36ff82f4b21ee4714dcacd9ff0cd657c47e88def的[CI35125290301](https://github.com/cccjvav/web_agent/actions/runs/35125290301)首轮8/9成功，整体失败。
- Windows Node22：mcpProtocol.test.js的截图路径echo约30.5秒超时、无stdout/stderr；patchEngine.test.js的搜索worker启动超10秒。浏览器、安装器、其余六组主机通过。
- 两次下载日志EOF；check-run `104892732306` annotations取得具体错误。一次诊断性rerun请求被拒绝，未实际重跑，错误文案不能证明workflow损坏。
- 后续未改实现的e470d5f完整CI35125876577成功；之后多轮也成功。**没有据此宣称根因已修复，也没有放宽时限、删断言或自动重试。**
- 继续时先确认同类失败是否再现及时间线；区分进程启动、编译、IO/取消、worker ready与runner负载，不凭“像环境问题”定案。

##### 5.2 不能丢的其它证据

本交接首推0fac6f0漏带生成的tests/README.md导航，CI35243193771仅1/9成功、整体失败；立即补交cd2a3ea后CI35243219647九项成功。不是测试不存在或功能失败，可复用教训是提交前将check-docs --write实际改出的全部生成文件纳入核对，不能只凭本地测试绿灯推断Git提交完整。

第16组6ed9adf曾漏登记docsViewerBrowser函数说明，CI35116366728仅2/9成功；8ed0496补齐后CI35116453656九项成功。历史失败原样保留在台账/归档，不通过删守卫或改历史测试数美化结果。

当前Git辅助程序禁用、隧道Token遮盖不代表全面OS隔离或所有秘密不外泄；源码中的路径/hash检查也不解决所有硬链接/父目录竞态。没有实机窗口/真实提供商证据时，必须继续写未执行。

#### 6. 开发、测试、说明与推送闭环

从仓库根操作。下面命令用于开发checkout；不要在正在运行并用于MCP验收的产品目录里盲目重建依赖。

```bat
npm ci --include=dev --no-audit --no-fund --prefix webagent-core/agent-host
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
echo %ERRORLEVEL%
```

Windows在VSCode集成CMD逐条运行，失败停止。Conda用于用户已有业务环境，WebAgent是Node项目，不安装根requirements.txt/pytest或新建venv。`npm ci`会重建该包node_modules；直接测试运行器检查express/Acorn入口，但不是依赖完整性认证。

R1回归入口（已做首包，供复核）：

```bat
npm test --prefix webagent-core/agent-host -- --filter=profile
npm test --prefix webagent-core/agent-host -- --filter=memoryRecall
```

修改解释正文后再生成：

```bat
node docs-site/check-docs.js --write
node docs-site/build.js
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
git diff --check
git status --short
```

不要手改清单、source-index、content.js。新增函数要补在documentationLearning登记的**实际主指南**，不是随便一篇相关说明中出现名字就算完成。

Playwright是Node开发依赖，现有版本以package/lockfile为准；普通运行不必安装浏览器。`npm test`不含独立浏览器入口，需要时另运行：

```bat
cd webagent-core\agent-host
npx playwright install chromium
npm run test:browser
cd ..\..
```

下载失败不关闭TLS校验；CI安装Chromium不代表用户电脑已有缓存。浏览器fixture中的route/VM与真实公网、真实VSCode窗口不是同一证据。

确认diff仅含自己的改动后选择文件提交，及时推到当前会话绑定分支。Bash脚本采用失败即停止的链式控制；CMD逐条检查退出，不能让tail/echo的成功掩盖测试失败。

本会话的推送与核验例子：

```sh
git push origin arena/01a0b0da-web-agent
gh run list --branch arena/01a0b0da-web-agent --limit 5 --json databaseId,headSha,status,conclusion
gh run view RUN_ID --json headSha,conclusion,jobs
```

RUN_ID需替换实际编号。核对headSha及每个job，不只看最后一行绿色；本地/远端/用户实机分别报告。CI的Action运行时Node20弃用警告与项目Node矩阵不同，不能混报失败。

#### 7. 用户参与节点与最终本机验收

**现在没有要求用户操作或提前接入。** 用户明确希望剩余施工完成后，由其让Arena连接本机WebAgent MCP，选择本项目根目录做验收。

- 当前会话若未列出本机WebAgent工具，就没有可用本机MCP通道；不能用沙箱bash/fetch或聊天文字冒充。
- 接入后先ping/workspace_info，比较root、identity.hostInstanceId与本机诊断；再读取README/CONTEXT并核对真实提交、Node路径、已有Git改动。主机重启需重新核对。
- 根目录不授权覆盖源码、清空.git、硬reset、删除用户改动；写入/检查点测试仅用约定的独立临时文件，完成后对照Git状态。
- Chat与Bridge互斥；需要本机Chat/PTY的项目先由操作者正确切换。原生窗口、安装/升级/卸载、真实桌面/DPI、供应商兼容要分别记录。
- 停止后远端失联不是进程退出证明；最后由本机操作者确认隧道/进程。完整动作见[新手手册](../../docs/guides/Windows新手逐步验收.md)，判定见[清单M1–M5及其它项](../../review/CHECKLIST_WINDOWS.md)。

已有用户结果：完整重启VSCode后npm/npx恢复；步骤7–10及11.1/11.2已报告完成，11.3作为协作说明关闭，不得改名重列为同一阻塞；Bridge计数/记录刷新后保留已确认；手机Arena连接已报告通过。不要让用户无故重做这些，也不把它们扩成新增权限、检查点、原生窗口或全部网络验收。

#### 8. 探测交接：明确暂停，不抢另一助手工作

外部来源：[phuang6666/arena-ai-probe，arena/01a0ab8a-arena-ai-probe分支](https://github.com/phuang6666/arena-ai-probe/tree/arena/01a0ab8a-arena-ai-probe)。用户报告其整合版面向工作台/code-server外接与VSCode配套插件；**本项目未拉取、审查、运行或验收该整合项目。**

暂停新增入口、采集/分析/插件改造、迁移整合和探测专项复核；保留当前实现及既有回归，不删功能、不跳测试。交接后要求固定SHA/版本、构建与失败证据、来源许可、三宿主矩阵、扩展ID/命令/端口、认证/工作区绑定、采集所有权、审批/取消/幂等、数据迁移/并存/卸载方案。详细门槛见[阶段8](s8-probe-integration.md)。

探测只作参考，持久登录与Chat API确切后台身份验证按约定后置。外部项目声称“完成”不自动改变本仓库权限和验收结果。

#### 9. 每次交班的最小记录

接力助手完成一批后更新本页路线（任务变更时）、CONTEXT焦点摘要与阶段证据（各按职责），按以下模板向用户直接报告：

```text
本次提交/推送：实际SHA；工作树是否还有别人的改动。
实际改动：代码与对应说明；哪些验证了，哪些只阅读。
验证：本地命令/退出/数量；CI run、headSha及逐job；实机单列。
失败/风险：原始失败、是否再现、根因是否已证实；不抹去历史。
下一项：路线ID、具体文件、测试与完成条件。
需要用户：没有 / 明确动作、原因、风险、预期证据。
暂停/延期：探测待交接；其它边界是否改变。
```

下一位助手可以直接按R3的operatorQueue/workflows与其余API结果消费、R2继续，无需用户重新复述此前授权和约束；如发现与实际代码不符，以核验结果修订交接，而不是照抄本页当绝对真相。

### 实施批次与证据

以下保留先前批次的实际决策、失败与验证；旧路径和旧组织方式描述仅作历史。

#### 已交付：限流与生成测试批次

- 11限流：OAuth JSON/HTML 429都返回Retry-After；超额请求不增加计数/延长窗口；1000-key容量有恢复提示且旧key剩余额度不被挤掉；来源不直接回退不可信转发头。原固定窗口本来不会被连续拒绝无限延长，此处不虚报修复了不存在的问题。
- 18生成测试的一小部分：2000步固定种子时序与独立参考模型、容量/过期边界、真实HTTP伪造头/端点预算回归。不是完整性质/变异门禁。
- 文档：11.3按用户确认完成/关闭；探针三入口矩阵核对；历史根审计输入曾移入review/archive并修链接（重复归档后续已删除，保留Git来源和对照稿）；重写两个未经当前验证的第三方扩展安装保证；旧计数标记历史。
- 本地74测试文件通过。代码9dfa0ad2853fd60f256e3ae47cf29145663e4ed4的CI35031845316九项成功（Ubuntu/Windows、安装器/探针包解包验证、真实Chromium）：https://github.com/cccjvav/web_agent/actions/runs/35031845316 。不是实机账户验收。

#### 本批续作：Bridge Tasks与编辑预览（0.7.2）

修正Bridge/本地Chat任务共用、无报告即隐藏以及远程事件丢失后不能恢复的问题。远程报告按服务端会话键摘要隔离，主机快照供工作台和桌面/code-server核心扩展轮询，明确Agent报告与工具执行不是同一件事。新增有界/不可变/TTL及UI回归，最近统计日志只显示远程来源。

借鉴08继续落地新文件可读diff、现有/新文件预览版本hash及漂移拒绝回归；没有把可读预览当成完整回退实现。公网MCP、保护回退与目录变化通知等继续保留，不谎报全部完成。

本批还纠正MCP旧工作流提示“拿STALE_FILE的currentHash直接重试”，改为停止本次写入、重读并协调新内容，冲突询问操作者，未知效果不重放。不是放宽哈希检查来让测试通过。


##### 本批验证结论

代码99f46e9628546d6f787262784e8d91082b7c82ea，CI35033494833九项成功：https://github.com/cccjvav/web_agent/actions/runs/35033494833 。本地完整75文件通过，232受管源码/28目录/109排除，生成站点同步。

- 工作台：真实Chromium经MCP上报Tasks，禁用WS仍轮询显示；刷新恢复、completed更新、第二会话隔离、本地Chat不串入，均通过。
- 桌面/code-server/App：核心扩展同源及发行副本一致；真实生成的Bridge Webview脚本在VM验证分组/空提示/转义，HTTP服务快照经测试。未在真实桌面VSCode或code-server窗口操作，不冒充可视实机验收。
- 新文件/已有文件dryRun预览、哈希与漂移拒绝通过；回退尚未实现。
- 中途5eb354b的回归错用了只含连接URL的getBootstrapPrompt，断言失败；99f46e9改为真实getInstructions后全绿。保留失败事实，不借旧绿灯覆盖。沙箱Chromium下载仍ECONNRESET，本次真实浏览器证据来自上述CI，而非本地。

#### 当前任务：文档逐句审查（2026-09-16）

Tasks代码批已交付；当前清理过时产品正文，不再只在旧文后叠加更正。已重写README/CONTRIBUTING、修订使用/网页VSCode/技术/安全说明，删除失效统计摘要并重接summary站点路由。逐条依据、全文与局部审查范围、实际剩余施工见[审查台账](../../review/SEMANTIC_REVIEW_2026-09-16.md)。全仓语义审查尚未完成，逐函数教学文档未删除。

当时优先处理的实现差异（现已在后续批次修复）：Plan merge缺配置时本机拼接、直接工具API业务失败外包、MCP取消通知未接执行取消。此处为历史起点，也不把公网MCP/受保护回滚与候选OCR/签名混称为同一完成度。

本批本地验证：开发依赖首次缺Acorn，安装完整依赖后，清单232源码/28目录/109排除通过，站点构建通过，完整75测试文件通过。首次diff检查发现一处修改行尾空格，已清理。远端CI需绑定本次提交后另查，不沿用上一批九项绿灯。

第二组继续：全文重写管理经验，纠正破坏性恢复建议与Bridge恒text；完整对照文档站app/serve/index复核其逐函数说明，修复预构建矛盾与全景页旧文案。比较后删除重复外部报告归档，保留原稿Git证据与对照稿，修复引用。范围明细见语义台账；其余文档仍待审。

验证续记：第一组c38ead31c5323ee3787ea55a3ecab5909c31c75e的CI35036910154九项成功（含真实Chromium、Windows矩阵和安装编译）。第二组本地75文件、文档生成校验与diff通过；第二组远端结果不沿用第一组。

第二组远端确认：149a951a7b80893b0107ce27170aebc06a1296df，CI35037123530全部九项成功：https://github.com/cccjvav/web_agent/actions/runs/35037123530 。CI另提示checkout/setup-node v4的Action运行时弃用警告；这与主机Node测试矩阵不同，未擅自升级工作流。

#### 续作：三项优先实现缺口修复

实现与边界见语义台账第三组；MCP请求分发、会话/错误/预算两篇逐函数说明已全文对照，其他文档仅涉及章节同步。没有实现公网出站MCP、受保护回滚/完整UX，也没有重开取消的探针入口或11.3。两次门禁失败及修正已保留，不借旧CI计入本批。

本批本地最终验证：77测试文件通过，235源码/28目录/109排除，站点构建、受检链接、diff检查通过。远端CI提交后按精确SHA查询；真实第三方客户端与用户桌面尚未验收。

#### 配置审查续作

完整核对store与config/extensionVersion两篇详解，整合过期秘密名单和错误的启动顺序。另发现并修复generateNewSecret吞掉保存失败：先保存成功再发布内存新密钥，失败不上报成功；新增坏JSON与EACCES保留旧密钥回归。未承诺跨进程/断电事务。models主README定制保存契约同步改正文，其他部分未计全文。

验证确认：0465073a489fe30d968964dbab791df473174a27 / CI35038038886、faeaa1f60dfd780598a1ffeb43c4a0c8a5f5feb5 / CI35038187350分别全部九项成功，均本地77文件通过。最新代码CI：https://github.com/cccjvav/web_agent/actions/runs/35038187350 。其余施工及全仓语义审查不关闭。

#### 手机实测与权限能力核对

用户2026-09-16报告手机浏览器登录Arena、使用WebAgent MCP链接成功连接，用法与电脑浏览器相同；清单F2记录通过，不重开11.3、不强制另找OAuth菜单。用户上传的是另一产品的Read/Edit/Execute/Capture控制参考，不是本产品这些开关的实测证据。

98ad224批次时尚无由本机所有者锁定的四分类Bridge权限开关；Ask/Plan/Code由调用参数选择，不能当作远端不可提升的权限上限。文件/命令边界、PTY审批及受控外部调用/工作流审批确实存在，详见SECURITY当前能力对照。此为当时范围；用户随后明确授权实施，当前施工见下节，不再将它留作待评估。

继续审阅审批执行链，发现operatorQueue只按ok/success/isError判断失败，status=failed、非零退出或isTimeout可能被记为succeeded；已复用isToolFailure纠正，保留cancelled/unknown及终态不重放。补实际队列回归，不新增或扩大授权。

本批本地验证：77测试文件通过；235源码/28目录/109排除，文档构建、受检链接与diff检查通过。手机通过来自用户实测反馈，与本批自动测试来源分开；本批没有新增权限开关或开放远程控制面。

本批远端验证：98ad224d3d4ad103c4a2e2da8114b8eeae92f741，CI35085304002成功：https://github.com/cccjvav/web_agent/actions/runs/35085304002 。手机F2仍以用户报告为证据，不归功于CI；四分类权限开关仍未实现。

#### 当前施工：所有者权限与主机模式互斥

用户确认手机Arena固定Bridge；Chat与Bridge不得同时执行，同类型多模型/多Agent可并行。新增executionControl租约、持久四类权限、工作区/主机/revision本机设置，经典工作台与VS Code/code-server核心扩展同名控件。Read/Edit/Execute/Capture不是四个OS沙箱：Edit依赖Read，Execute必须四项全开。默认兼容全开，详见[操作与边界](../../docs/guides/Bridge权限与工作模式.md)。

别名、资源/提示词、审批时与工作流步骤复查权限；等待审批允许撤权但阻止切模式；运行请求、后台子进程/stdio未close、PTY未确认取消阻止切换/撤权。隧道启动在await前预占；不自动取消、回退模式或重放。人工编辑/审批沿用当前模式，不当作同时启动另一个Chat模型。

新增executionControl真实HTTP/后台命令/PTY/隧道夹具，旧混合模式测试改为明确切换；浏览器用实际控件切换、保存、回读与拒绝别名，Webview模拟轮询不覆盖草稿。新增操作手册与逐函数解释；命令/PTY、协议、Chat、API及审批相关章节同步，测试README陈旧“全部52项”改为真实范围。不宣称全仓逐句完成，公网出站MCP/受保护回退等原队列仍保留。

验证状态：本地78测试文件全部通过，237源码/28目录/109排除，文档构建及diff检查通过；产品提交348ce98a80af2bfe7fb81eba3a366a74ad51dfef已推送；CI35097629168九项成功，含workbench-browser真实Chromium、Windows安装器、Ubuntu Node18/20/22/24及Windows20/22/24：https://github.com/cccjvav/web_agent/actions/runs/35097629168 。浏览器本地运行因缺Chromium无法启动，Playwright下载TLS前ECONNRESET失败；本地不能声称真实浏览器通过；随后本分支CI真实Chromium已成功，两处证据来源分开。新增控件Windows/手机人工验收未做。

#### 续作：旧连接指南退役与探针正文核对

按用户要求，删除根目录旧双向连接核对指南；不保留同名空壳。现行有效步骤及不鉴定身份、挑战转交/TTL/清除范围等边界合并到使用指南；原始捕获隐私提醒保留SECURITY。旧connection-check-guide文档站入口移除，安装包删除旧指南并补现行权限/探针入口说明。早期ARENA_PROBE_INTEGRATION报告归档至review/archive，显著标识0.1–0.3历史状态，不再作为当前未完工清单。

发现并改正文：原型README同时声称“完整参考整合”与“产品只接入最小核对”；当前验收页仍教安装0.5.1；入口页核心扩展仍写0.7.1；现行探针文档只提Code/审批却遗漏新所有者权限与互斥模式。逐项对照当前源码修订，未删除现有可选诊断功能，也未恢复已取消探针UI施工。Companion描述/菜单移除早期总括“完整移植进行中”，具体实机未验收继续保留。

新增文档退役及安装包防回流断言。本批本地78测试文件通过，237源码/28目录/109排除，文档构建与diff检查通过；提交72ad02f79b42c48fae191ba7d7f49a09cd4e8870的CI35099997405九项成功，含真实Chromium、Windows安装器和七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35099997405 。该结果不等于用户探针实机验收。全仓逐句审查及公网出站MCP、受保护回退等施工仍未完成。

#### 续作：经典已有文件预览与确认保存

新POST /files/preview只读、路径/hash/文本/diff计算预算；经典文件菜单生成不可变草稿预览，明确确认才PUT，保存再查磁盘hash。异步草稿/标签漂移淘汰旧预览，确认前消费快照防重复发送。保留Ctrl+S，未伪造受保护回退已完成。源码核对还发现工具描述和write/patch错误retryHint仍鼓励错误hash立即重试，与已修指令矛盾；本批改为停止、重读、协调，不放松门禁。

API/编辑器VM/浏览器流程增加回归；本地78测试文件通过，237源码/28目录/109排除、文档构建与diff检查通过，产品提交6e57fec3668eaefdc56d7efd0b8721ee01b7d6d4的CI35101343496九项成功，含真实Chromium菜单预览/确认保存、Windows安装器及七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35101343496 。这是CI隔离场景，不代签用户Windows实机。余项继续按表推进，不重新开启已取消入口。

#### 续作：经典单次保存受保护回退

editorUndo有限内存旧正文、保存后hash绑定；本机API预览及工作区/主机/严格确认后恢复，记录发起执行前一次消费。经典菜单先预览再确认，脏草稿拒绝；回退期间新编辑保留。最多16项、每项64KiB、15分钟按访问清理，非持久备份。只覆盖经典已有文件的版本化已验证保存，不把shell/删除/改名/多文件或原生VS Code回退报完成。

针对API/容量/到期/旧hash/重复/VM草稿与真实浏览器增加回归，逐函数说明及操作/安全正文同步。本地78测试文件通过，238源码/28目录/109排除，文档构建和diff检查通过；产品提交ec16f9eeeb40e00696f567ee7fe6eada4b1c311a的CI35103728795九项成功，含真实Chromium菜单回退、Windows安装器和七组Node矩阵：https://github.com/cccjvav/web_agent/actions/runs/35103728795 。不等于用户Windows/原生VS Code实机验收。全仓逐句审查、公网出站MCP和其余施工继续。

#### 集中续作：公网HTTPS出站与剩余范围归一

新增publicHttps传输：每次解析全部DNS并拒绝非公网/混合答案，固定socket lookup不二次解析，正常TLS/Host验证，不跟随3xx、不复用连接。IPv4特殊范围和保守IPv6范围明确；支持显式Bearer，参数仍在本机逐次审批后发送。公网登记默认关闭，必须外发确认+工作区/主机绑定。没有把入站手机连接误作出站实现证据。

真实隔离TLS测试覆盖固定lookup、Host、自签名无CA拒绝、目录发现、审批前零调用、DNS变私网拒绝、307不跟随、body超限和取消；测试专用socket路由并非真实公网连通证明。UI拦截测试独立检查开关、确认、绑定和令牌清空。安装包包含传输，不含测试TLS私钥。

本地79测试文件通过，240源码/28目录/109排除；本批CI待精确提交后核对。现行README/使用/安全/工具说明直接改掉“仅回环、不支持互联网”的旧描述；历史报告不因此自动成为现行指南。

剩余范围：真实第三方HTTPS/Bearer服务、Windows/手机新增控件待用户环境；通用多文件/任意Agent回滚未实现（不能无设计地自动补偿）；全仓逐句审查仍有未审正文。文件通知、公平性/OCR/目标识别、性质/变异与签名仍按候选分类，不未经确认启用系统签名密钥或扩大OS权限；既定延期/取消保持。

首轮公网b321432 CI35105260201为7/9成功；Node18 Readable.toWeb取消重复close及旧浏览器stdio等待输入文本的竞态已修复。改显式terminal/背压适配，浏览器等待具体审批成功再核对真实文件；本地79测试文件通过，不抹去失败或放宽断言。旧CURRENT_AUDIT与上游定向报告已归档保留编号/CI/许可/授权，DOC_SWEEP重复结构筛查报告删除；现行导航直指管理/逐句台账。修复代码7790e55bfbaf481ce52a1942e9e72da56e6b7f81，[CI35105944367](https://github.com/cccjvav/web_agent/actions/runs/35105944367)九项全部成功，已逐项确认：Ubuntu Node18/20/22/24、Windows Node20/22/24、安装器、真实Chromium。包括Node18取消与stdio审批等待修正；不是公网提供商/用户桌面实机验收。

#### 续作：角色说明与协议描述一致性

使用指南补Arena→WebAgent→第三方可选链路、两套凭据、登记与逐次批准、operation_result取结果及正文外发边界。移除正文遗漏的“不连接公网”；同步修正真正提供给模型的external_servers描述，新增守卫，权限不变。第十一组审查范围见逐句台账。跨文件/通用回滚、原生UX和其余逐句审查仍未完成，不把解释工作算作这些实现。

2026-09-16续作：核心扩展新增原生单文件草稿只读diff及明确确认恢复命令，64KiB/UTF-8/信任与真实路径边界、版本/磁盘复查、自动保存关闭、editor.edit撤销边界；不主动保存，不是已保存的Agent历史回滚。真实VS Code/code-server窗口验收仍待，测试只证明API契约。

##### 原生草稿批次验证

本批代码47ee11c232e7c267bf56ac7a414e9bd77079d302，[CI35108769347](https://github.com/cccjvav/web_agent/actions/runs/35108769347)九项全部成功：Ubuntu18/20/22/24、Windows20/22/24、安装器、经典工作台Chromium回归。本地80测试文件通过，242源码/28目录/110排除。源码/发行副本已同步，真实原生VS Code/code-server的diff与撤销交互仍未验收。首次本地全文测试因新夹具onConfirm等具名函数未补详解失败，补齐后80项全过，未放宽文档守卫。

上一批角色说明38bb741ec429e4876755edc18cbcd9ea8e1ad03e的CI35107665944也已逐项确认九项成功，不将新功能证据倒签到上一批。

#### 本批：跨文件内容检查点

本机任务前显式保存1–12个已有文件原文，任务后预览/确认恢复；8条/15分钟/单文件64KiB/合计256KiB。全文件预检、逐文件复查、共享hash写入/verified读回；部分失败保留restored/unknown/not-started并消费，不重试或补偿。经典工具接入页有创建、列表、diff、确认恢复/移除；刷新恢复记录而重启不持久。未保存草稿、创建/删除/改名、元数据和第三方副作用不在范围。

修正README仍称“没有回滚/界面”的陈旧断言；说明三种恢复入口的区别，更新管理当前表与采用映射。新模块/测试/接口/前端逐函数说明已补。初轮本地81文件通过，244源码/28目录/110排除；最终验证与精确CI随提交核对，不代签人工Windows。

##### 检查点批次证据

代码6ef3ac7cb2a618a1e773b9a5a2022ed46b121daf，[CI35112168535](https://github.com/cccjvav/web_agent/actions/runs/35112168535)九项全部成功，已逐项核对Ubuntu18/20/22/24、Windows20/22/24、安装器和真实Chromium。浏览器实际两文件建立、外部改写、只读预览、取消零写入、确认恢复及consumed列表通过；不是用户手机/Windows桌面编辑器人工验收。本地81文件通过，244源码/28目录/110排除。

##### 第十四组：核心导读全文归一

逐段读取原架构导读426行与组件说明424行，全文重写两篇而不在旧结论后加附录。保留四层教学、目录/数据/执行链职责；操作细节统一指现行专项指南/模块详解。修正默认计算器、无安装包、无Playwright、无条件Chat/Bridge并行、无配置自动builtin、Chat不联网、固定30工具、密钥等于无限授权、GPL泛化和扩展仅HTTP等错误。新增针对旧断言的文档回归守卫；这是局部语义证据，不认证全仓所有Markdown。

#### 第十五组：总览/技术执行链与导航实修

完整读取旧总览349行、技术实现112行。总览改为当前详解导航和模式/出站/恢复执行链，删除虚假的自动builtin回退、固定30工具、旧“全项目无Build”和建议开放0.0.0.0等陈述；技术实现补已交付模式、出站、恢复/存储边界，现行审查链接不再指旧质量报告。进程README的工作区默认/初始化顺序及API表遗漏同步修正。

文档站实际代码也修正：GitHub风格片段与站点slug不同导致链接到不了标题；根文档渲染复用了最后一个子文档上下文；同文档#片段误当父目录。新增共享anchors与范围明确的导航回归，五份根导航目标/标题检查及实际生成href/id对应。首次新守卫发现computer-use/README.md不存在，改成真正的win/README.md。未把受支持标题子集当完整GFM解析，也未把这些检查当全仓逐句认证。

##### 第十五组验证证据

代码c0ada67170558b6a9860739051f049f3668b3bfb，[CI35114310216](https://github.com/cccjvav/web_agent/actions/runs/35114310216)九项全部成功，逐项确认Ubuntu18/20/22/24、Windows20/22/24、安装器、Chromium回归。本地82文件通过，246源码/28目录/110排除。首次全量因旧docsSite VM用测试目录解析新anchors模块而失败；改createRequire(buildPath)后原CRLF逐字节断言仍保留并通过，不是跳过失败测试。新增导航守卫范围为五份核心根文档和明确标题子集，不是全仓Markdown/GFM认证或用户实机验收。

#### 第十六组：测试复盘与审查台账收拢

测试说明、代码复盘指南全文复核，去旧测试数/无Playwright/手机完全未验结论，保留完整函数/fixture教学导航。当前语义台账重写为已交付能力、精确全文/章节范围和待审顺序；1–15组原始失败/CI移至review/archive，修相对链接，不销毁证据。runner补缺express/Acorn时退出2的明确前置检查，隔离副本回归不移动真实依赖。现行导航链接守卫扩至这两份指南和台账。

本批另修第2组已记录但未修的文档站问题：搜索短输入清旧结果、无匹配明确替换、搜索标签转义；guide坏百分号不阻断，正文/文件章节拼接并解码完整中文/斜线ID。VM覆盖状态与编码，真实Chromium加载实际静态资源检查搜索/guide/目标节点（白名单网络fixture，不是静态HTTP服务验收）。

##### 第十六组验证

f6a7bff267c1678a26fcbfa90f20f601ad1f2574的CI35116022251九项成功。文档站交互续作6ed9adff87798dcfd21af9072a995cc5c1e233c9的CI35116366728仅浏览器/安装器成功（2/9），本地完整测试暴露docsViewerBrowser漏在登记的主指南说明，已补齐，未删除守卫。最终8ed049663bb943a5880f873ba4a33cd3f5a9b8fc，[CI35116453656](https://github.com/cccjvav/web_agent/actions/runs/35116453656)逐项九项成功；本地82测试文件、246源码/28目录/110排除。真实Chromium加载实际文档资源验证搜索、坏guide编码及带斜线标题目标；资源由白名单fixture提供，不伪称静态服务器网络或用户实机验收。

#### 第十七组：Conda/平台CI全文复核

Playwright并未删除：当前Node开发依赖1.63.0，浏览器任务独立安装Chromium并运行test:browser，普通运行与Arena连接不依赖它。Conda/测试/CI指南补清晰操作和边界，不要求Python Playwright或venv。对照实际脚本修平台指南中express旧检查/Shell相对路径/两job/不编译Drawing文件等过时正文；对照实际根package.json修总览误述。check-env输出同步提醒VSCode父进程PATH。新回归核对依赖版本、入口、链接、关键提示与隐藏控制字符。整篇阅读不等于Windows/Conda实机验收。

第17组代码/文档23ce0a3345d4d55685d9a21202f3ec0f6a440e98，[CI35120320368](https://github.com/cccjvav/web_agent/actions/runs/35120320368)九项已逐项确认成功（七组主机Node、Windows安装器、Chromium）；本地82测试文件、246源码/28目录/110排除。上述CI不证明用户Conda/Windows新操作已执行。

#### 第十八组：隧道实义对照与最终MCP验收入口

完成隧道指南/模块README/生命周期与停止说明整篇读取，对照实际三份源码、API启停与经典UI。修正文档旧HTTP200成功/回退3000/每次域名必变、System32安装与父进程PATH说明；安全说明的非破坏性命令承诺与域名段同步，不冒充安全全文完成。经典UI实际修复启动丢失具体原因、停止无HTTP/业务检查；失败刷新与不复制URL、停止失败不假灭灯有真实模块VM，新Chromium使用实际页面模块与拦截失败响应验证，公网提供商/Windows进程未执行。

用户安排最终本机项目根MCP验收，已进入管理索引及清单M1–M5：先实际工具/主机/根核对，不读取密钥、不覆盖源码改动、不代签原生窗口和断连后的进程状态；当前无本机MCP接入，不提前标通过。

#### 第十九组：Skill新建与现行操作说明

完整读取技能使用指南276行、skills.js198行，核对创建API/UI与图像候选读取路径，修来源ID/frontmatter、旧示例工作区与四篇说法，删未验证第三方比较。实际修API默认覆盖同名Skill（含规范化重名），内部createOnly在写路径锁内拒绝已有文件；新建按钮确认HTTP和业务结果，不再失败也成功。真实HTTP覆盖同名并发保留成功者，Chromium点按钮核对400错误；OS进程竞态、桌面真实窗口、当前MCP接入仍未代签。

第18组ae97f65e20f2b23f2ca3838aa9131934ad0471d4，CI35124844106九项逐项成功。第19组36ff82f4b21ee4714dcacd9ff0cd657c47e88def本地82测试文件通过，CI35125290301首轮8/9成功、整体失败：Windows22 npm test中mcpProtocol命令echo约30.5秒超时、patchEngine搜索worker启动10秒超时；浏览器/安装器/其余六组主机成功。日志下载EOF，check-run annotations提供具体错误；诊断性rerun请求被拒绝，未实际重跑。未放宽超时/删断言/自动重试，根因未证实，后续绿灯不抹去首轮失败。

后续证据提交e470d5ff7efbdcfe3ef03d86f42519f147003a9a，[CI35125876577](https://github.com/cccjvav/web_agent/actions/runs/35125876577)九项逐项成功，包括Windows22与新增Chromium失败响应测试。未改实现/放宽断言，仅新完整运行未再现上一轮超时；原失败与未定位根因仍保留。

#### 第20组：探测暂停与主使用指南非探测部分

按2026-09-17用户指令暂停探测专项等待外部整合项目交接，阶段8改为当前暂停并列交接门槛；未拉取/审查新项目，不删除现有功能或跳过原有回归。主使用指南全文读取，非探测正文核对启动器/安装/Bridge失败状态与配置保护，修错误回退/自动拼接/忽略规则/安装PATH等。探测小节只加存量范围说明，其实现不在本轮复核。

第20组b4cd7ae4852c113e6d9cf51fdce3da6cf3ba279d，[CI35231427025](https://github.com/cccjvav/web_agent/actions/runs/35231427025)九项逐项成功；本地82测试文件、246源码/28目录/110排除，文档构建/链接/diff检查通过。未拉取外部探测项目，既有探测回归保留不等于继续专项开发或替外部验收。原Windows超时根因仍未定位。

#### 第21组：隧道日志凭据边界

安全说明全文读取，聚焦修复已披露的Named/ngrok跨chunk Token泄露：逐stdout/stderr的UTF-8/KMP状态先遮盖后裁剪，结束不flush候选前缀。新增所有字节切分、中文/重复前缀及实际提供商回调/历史/交错流/停止回归；不代表通用秘密扫描或清除历史日志，不改变argv/env信任边界。探测暂停保持，当前不需用户操作，其他安全实现对照及Windows超时仍未全部解决。

第21组2e1bc29c280ab08b7cebe985bb6ba602c968f483，[CI35233048258](https://github.com/cccjvav/web_agent/actions/runs/35233048258)九项逐项成功，本地82测试文件、246源码/28目录/110排除。首轮本地遗漏collect函数说明导致1/82失败，补登记指南后全量通过，未推送失败版本。既有Windows历史超时根因不由本次通过代替，探测暂停不变。

#### 第22组：只读Git与工作区说明

任务板/Git/工作区详解整篇对照。Git状态改NUL记录，保留中文/重命名originalPath、识别无提交分支且超过80才截断；差异使用字面pathspec，禁external diff/textconv/fsmonitor，补实测仍能执行的clean filter入口，发现配置键名后临时禁clean/smudge/process/required，保留总预算和配置本身。真实临时Git及自写辅助程序正反对照，无用户仓库/凭据参与。原Git环境与同用户竞态不是隔离保证；任务板坏文件保留等旧说明/注释已修，探测仍暂停。

第22组52b2148b96bbb01431f0ead70352e7d4a90e4f64，[CI35235675274](https://github.com/cccjvav/web_agent/actions/runs/35235675274)九项逐项成功，包括七组主机的真实Git回归；本地82测试文件、246源码/28目录/110排除，构建/链接/diff通过。Windows旧超时根因与用户最终本机验收仍未关闭，探测继续暂停。

#### 第23组：优先交接与路线图

用户考虑其它助手接力，要求先准备交接并包含计划。新增根《交接与路线图》，由README/AGENTS/CONTEXT及文档站进入；记录精确基线、历史失败、权限/模式/恢复不可丢约束、R0–R8/P优先级/状态/入口/完成标准，R1画像与记忆可直接作为下一包。不恢复暂停探测，不将候选统一承诺实施，不提前连接本机或代签；本组未修改产品运行逻辑。

第23组cd2a3eaa42831526e3a6ef7a504370144e857da5，[CI35243219647](https://github.com/cccjvav/web_agent/actions/runs/35243219647)九项逐项成功；本地82测试文件、246源码/28目录/110排除。首推0fac6f0漏带生成tests/README导航，CI35243193771整体失败（仅浏览器1/9通过）；立即补齐cd2a3ea，无测试削弱。交接首版已可接力，下一项仍R1，未把路线待办冒充已实施。

#### 第24组：R1画像、定制与记忆

整篇对照画像与记忆详解及三个完整模块，读取profile/memoryRecall/stateIntegrity与路径/有界读取相关调用；同步models README、对应测试详解及PUT路由说明。隔离9639558旧模块复现：仅patch notes把shell重置auto；instructions对象写坏JSON后才抛ERR_INVALID_ARG_TYPE；260KiB条目可写但recall跳过；悬空日期文件链接可在工作区外创建目标。首个旧版副本复现夹具漏extension/package元数据，补齐临时目录布局后运行，不覆盖真实源码/用户文件。

修复：validateCustom对画像文本/子对象做有限类型校验；坏旧配置拒覆盖，所有输出先安全路径解析/渲染/8MiB校验，再逐文件rename；patch分别保留environment/techStack旧字段；PUT非法输入400 JSON，其余错误500。profile清单最多256KiB且只认对象/普通文件，jsconfig不当TS证据，Python标记不直接推断pytest。remember正文16KiB/NUL/类型校验，每日文件含新增字节不超过256KiB，lstat拒最终链接含悬空链接，CR/LF归一、新文件0600；旧日记不删除/轮转。

profile/API/记忆新增负例与字节保留断言；Windows外部目录用junction测试，悬空文件symlink负例仅非Windows。单Node同步调用无await穿插，但没有外部OS写进程锁/版本控制、四文件事务或断电耐久性；辅助列表不是完整schema。R1本包结束，下一包R3继续settings.js加载/保存失败呈现与旧state提交链，R2继续共享路径/安全实现，不据此关闭全部优化。探测继续暂停，实机与Windows历史超时仍待。

第24组55c3656d7842e5c361fefa27b376fa6db1ed8b75，[CI35245544812](https://github.com/cccjvav/web_agent/actions/runs/35245544812)九项逐项成功（七组主机Node、Windows安装器、Chromium）；本地82测试文件、246源码/28目录/110排除。悬空文件链接负例只在非Windows执行，Windows目录链接用junction；不是用户实机或同用户OS进程竞态验收，不关闭历史Windows22超时根因。

更新路线状态后的本地全量曾1/82失败：旧交接守卫写死“R1 / 下一项”。改为检查R0–R8/P齐全且恰有一个当前下一项，保留结束标准/历史CI/暂停/验收守卫，再重跑；没有为过时断言把实际状态倒退为待做。

#### 第25组：R3定制设置失败消费首包

对照settings的定制加载/保存/渲染、bind全部saveCustom调用与对应GET/PUT路由，非整个settings/bind/API语义认证。先在真实ES模块VM新增400负例，旧实现返回undefined且替换state，失败已复现；修为加载/保存HTTP、业务与可渲染快照检查，失败返回false、保留state和草稿，所有调用方成功提示均受结果控制。只提交partial，避免旧state无关字段回写；保存后只重画登记列表，保留请求期间和其他页的未提交表单。

页面内load/save共用busy，拒绝而不排队；10秒AbortController超时、finally释放。不是跨客户端CAS；错误/超时可能已经部分写盘，明确核对、不自动重试、不宣称回滚。GET损坏配置统一500 JSON/no-store、保留原文件。

VM覆盖HTTP/业务/JSON/形状/网络/超时、忙拒绝、partial与草稿；HTTP覆盖坏文件500和字节保留；Chromium新增真实保存按钮400/草稿/无假成功回归。相应正文、README、函数与测试教学直接同步。本地82通过；本批精确提交CI受账户级阻塞，证据如下。下一项继续R3模型选择/多模型设置等未检查响应的调用与工作流长篇；R2共享安全依赖、Windows旧超时和实机边界未关闭，探测保持暂停。

##### 第25组验证阻塞（不借旧绿灯）

实现提交483510a64b02fc2e124523ce13a668199411f722，[CI35247957459](https://github.com/cccjvav/web_agent/actions/runs/35247957459)整体失败，逐项九任务annotation均为“The job was not started because recent account payments have failed or your spending limit needs to be increased.”；并非九项代码测试执行失败，未运行主机矩阵/安装器/Chromium。已告知用户由仓库所有者检查GitHub Billing & plans，不代调付费额度、不重跑到绿。日志下载EOF，注释提供阻塞原因。

本地82测试文件、文档生成/构建/diff通过；包含实际ES模块VM与HTTP负例。沙箱无Chromium可执行文件，一次锁定版本的Playwright浏览器安装命令因cdn.playwright.dev TLS连接ECONNRESET失败，未执行新增浏览器用例。没有删除断言、放宽测试时限或冒充Windows/Chromium通过；解阻后核对包含本次实现的精确提交CI。

#### 第26组：用户要求的文档集中与旧稿退役

用户明确重申之前待办继续完成，并要求先整理集中仓库文档、做好链接、更新与删除过时材料。建立docs/README统一入口及guides/development二级索引，迁移19篇根专题；根保留主指南/交接/约定安全/脚本同级说明和暂停的探测三篇，源码逐函数教学留模块旁。17篇历史审查归archive并标非现行指令，review只保留活清单/台账/采用图与证据入口。

完整核对旧PROMPT：其1–10早已完成，仍包含旧分支、旧副本和失效能力限制；删除任务正文，将唯一完成映射保留在archive README，原稿可查迁移前1d532d0。ShunCode授权、Windows原始step5日志、历史失败/误报均保留，不用归档减少未完事项。DOC_QUALITY旧“当前差异”不再被活清单/站点README当当前结论，改指现行台账。

同步相对链接、文档站读取路径/稳定页面ID、安装白名单及实际界面帮助路径（核心扩展副本一致）；新增中央目录的逐文档链接/标题与无根副本回归。首次全量发现旧DOC_QUALITY配置和HTML帮助路径遗漏，修正；随后历史报告误入extraSiteDocs被既有守卫拒绝，移除该过时入口，不削弱禁止历史混入现行站点的断言。不是全仓逐句语义认证，R2/R3/R4/R5/R6/R8/P原状态继续。

第26组8ccbcc3b515c06b1b81b9c806c32b4cde6a75a7a，本地82测试文件、文档构建/链接/安装载荷回归通过；[CI35250548224](https://github.com/cccjvav/web_agent/actions/runs/35250548224)九任务仍因GitHub账户付款/支出上限未启动。不是代码测试九项执行失败，也不代表Windows/Chromium已通过；需所有者检查Billing & plans，未重跑或放宽断言。

#### 第27组：正式全仓逐句审查与剩余施工并行

用户明确两项任务，新增review/FULL_REVIEW_INDEX逐文件状态，198份Markdown/许可/文本证据全量枚举；维护索引自身除外、受限日志只登记路径，暂停探测不读正文。不把目录搬迁、旧批次阅读全文或生成通过当本轮认证。首批3篇导航按实际目录/入口逐句核对，2篇第三方说明全文对照发现clients.js固定安装/订阅/站点保证与指南不一致（F27-02未闭环，下一包优先），2篇设置说明仅模型/多模型保存段核对。

R3实修saveModelSettings：表格选择和多模型保存共用HTTP/success严格检查、页面内互斥、10秒等待；失败不假成功/重试，失败选择退回最近确认状态；保存已成功但刷新抛错单独提示而不重做保存。VM覆盖HTTP/业务/网络失败、互斥、成功刷新与保存成功/刷新失败；不是全部/api/models调用或refreshStatus的HTTP认证，也不代签真实模型服务/浏览器。

开头发现沙箱Git HEAD回到7c9bde5，文件仍是2f569c2：逐个比对远端blob，只有9份CMD换行不同且规范化后完全一致，先备份再mixed恢复索引/指针，立即clean；未hard reset、清理或覆盖工作树。验证结果以本批实际执行为准，CI账单阻塞仍单列。

第27组本地82测试文件通过，246源码/28目录/110排除；恢复依赖时发现Acorn缺失，按锁文件npm ci后生成/构建及全量通过。正式清单守卫验证全量文件登记而非语义自动通过。

第27组实现b07d41d552e6cd7ee2ccc5c1a757b79fab1a68c9，[CI35252848573](https://github.com/cccjvav/web_agent/actions/runs/35252848573)九任务annotation均为账户付款/支出上限问题，未启动测试；本地82测试文件通过，不代签Windows/Chromium，不自动重跑。

#### 第28组：F27-02第三方客户端跨端矛盾

完整读取clients.js，按needsPlus/needsTunnel/supportsMcp/connectMode检索消费者，发现除旧商店ID/构建/站点保证外，paintClients和MCP资源把null当false输出无需Plus/no；DeepSeek独立指引页和页面规则前言也保留固定安装/注入行为保证。先用真实Bridge模块VM复现未知被误报，随后修正两张候选卡为unverified/null，保留候选地址与复制规则但无安装/连接副作用；严格三态展示、移除固定商店入口、条件式认证/请求位置/版本核对、规则不授予权限。同步两篇专题、逐函数说明、页面提示及MCP/HTTP/VM回归，旧固定商店ID断言改为未知字段/无固定安装保证，CORS的扩展Origin测试原样保留。

正式清单198条：两篇专题从“已读有问题”转逐句核对，总计5篇；资源客户端详解仅对应章节核对，局部3篇。F28-01记录其余ChatGPT/通用卡片与配对提示的厂商/菜单/订阅保证仍待，未认证全部clients或OAuth实现、第三方站点和安装。未拉取探测/第三方源码，探测暂停。Git元数据重建再次显示旧HEAD，先逐文件核对远端5401103（9份CMD仅换行差异并备份）后mixed对齐，立即clean，没有覆盖源码；依赖缺diff，按锁文件npm ci恢复。

本地82测试文件、246源码/28目录/110排除通过；CI以本批精确提交为准，不继承旧绿灯。

第28组28f26e166be5294bc2963b30e195e800ef48f05d，[CI35263924819](https://github.com/cccjvav/web_agent/actions/runs/35263924819)逐项九项成功（Ubuntu18/20/22/24、Windows20/22/24、安装器、Chromium）。本地82测试文件通过，246源码/28目录/110排除。本次CI实际执行，不再把账户问题列为当前全局阻塞；不推断账单如何恢复，不删除25–27组未启动历史，也不据此关闭Windows旧超时根因或第三方实机验收。

#### 第29组：交接并入项目管理与F28-01续作

用户指出根路线与项目管理职责重复。将完整工作包/约束移入manager/ROADMAP，修相对链接；删除另存的最新SHA/CI快照表和重复批次续作日志，证据仍在阶段记录/Git。根交接页只导航，CONTEXT是摘要，stages是过程/证据，正式清单是文件覆盖。守卫迁至真正路线，根不准复制任务表，新增路线纳入全仓清单；不是再建第二套管理系统或取消原计划。

继续读取OAuth注册/授权检查相关函数，证实按客户端参数和PKCE而非ChatGPT厂商名验证。移除通用/OAuth卡的固定菜单、/plugins、订阅保证，标未知候选；配对码提示改兼容OAuth客户端。VM先复现旧专属提示，协议/HTTP核对新合同且保留认证测试。另发现已选unsupported卡片空prompt回退全局密钥连接文案，改已选卡片直接返回空；复制空值不写剪贴板，不假报成功。没有变更OAuth授权执行逻辑，不认证厂商服务或整份OAuth实现。

原R2/R3/Windows超时/实机/P暂停保留。本批管理路线完整内容尚未重新逐句认证，正式清单199条；结构去重不自动增加审查完成数。

第29组本地完整82测试文件通过，246源码/28目录/110排除；生成/构建、管理入口/全量文件登记/链接与协议/HTTP/VM回归均通过。实现6da5f89e8f8f84abc35a6d62843a9bfe74c7bce8，[CI35265619136](https://github.com/cccjvav/web_agent/actions/runs/35265619136)逐项九项成功（七组主机Node、Windows安装器、Chromium）。没有变更OAuth授权逻辑，不是客户端厂商兼容/用户本机验收；Windows历史超时根因仍未关闭。

#### 第30组：彻底回归原项目管家结构

核对manager/SKILL.md的L0/L1/L2和阶段模板，确认CONTEXT负责索引，stages本来就承载目标/需求/设计/实现/复盘/待更新文档。第29组将路线单独放manager仍属不必要的扩展，本次撤销：原工作包、候选门槛、接手顺序、测试方法、权限/恢复/验收/暂停约束并入本阶段；根交接文件和manager/ROADMAP.md删除，不留跳转壳。

原阶段的重复“当前剩余范围”表移除，唯一R0–R8/P表完整保留；日期批次证据保持，旧文件可从2f270e6追溯。同步所有内联引用、管理入口、站点路由和审查退役登记。没有取消剩余工作或增加语义完成数，本批不改产品运行逻辑。

本地验证：82测试文件通过，文档246源码/28目录/110排除；生成与链接守卫通过，两个只读技能文件无改动。首次直接构建被源码快照漂移守卫拒绝，按规定先运行check-docs --write再构建通过，未绕过守卫。远端核验：7439388ed80359bdcc814a8f0cfe3fb5a8267baf的[CI35266822926](https://github.com/cccjvav/web_agent/actions/runs/35266822926)九项全部成功（七组Linux/Windows主机矩阵、Windows安装器、真实Chromium），不替代用户实机验收或Windows旧超时根因。

#### 第31组：R3状态发布屏障与模型选择确认

接手在固定arena/01a0b0da-web-agent上fetch并快进同步来源01a08d85的73456b5，干净工作树；该来源精确CI35267082732九项成功，本地基线82测试文件通过。本批不切换/推送来源分支，不重复已交付功能，探测施工保持暂停。

对照GET status、POST models、store校验、bridge/settings/bind和Chat消费select链。先加真实VM负例，旧refreshStatus对HTTP503未reject而失败（Missing expected rejection），证实会发布错误JSON；实现加入核心形状验证、10秒/no-store、headers/body双序号屏障，新请求即使失败也不允许旧GET回填。成功显示后的select和按钮同用后台ID，未知ID不选builtin；读失败保留旧快照并标状态同步失败，渲染失败单独标注，不宣称DOM事务或全部嵌套schema已验。

聊天picker不再乐观更新标签，隐藏select在保存前立即恢复最近确认值；聊天选择、表格、多模型和显式切内置共用saveModelSettings的HTTP/业务检查及页内互斥。内置失败不报已切回；保存确认后刷新reject或被新读取代仍报告“已保存但刷新失败”，不重新POST。Chat结束的后台刷新新增catch，不把读取失败变成对话重放。

VM覆盖错误HTTP/业务/JSON/坏模型形状、网络、超时释放、乱序头/JSON迟到、新读失败不采纳旧成功、未知ID/think草稿、真实bind并发点击/失败与成功、一写后刷新失败。新增modelStateBrowser通过真实页面点击和拦截响应验证标签/select/错误提示及读恢复不重放；本沙箱Chromium下载因cdn.playwright.dev TLS握手前ECONNRESET失败，无可用浏览器，不将新增浏览器用例写成本地已执行。未降低TLS校验或改浏览器版本。

验证：workbenchRuntime筛选通过；文档生成/构建与完整82测试文件通过，246源码/28目录/110排除，git diff --check通过。实现78ebac2daac3904cd7d1ce71ea26a3c4152878a7已推当前固定分支；[CI35269106675](https://github.com/cccjvav/web_agent/actions/runs/35269106675)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium）。新增modelStateBrowser在CI实际执行通过；本地下载失败事实保留，不代签用户本机或Windows历史超时根因。对应说明只认证已改章节，正式清单完成数不增加。Provider添加仍有探测HTTP/超时/失败消费、整表替换旧模型、写请求互斥等独立缺口，下一包先明确替换/保留边界并补回归；其他状态嵌套消费者、API/工作流、安全依赖、Windows旧超时及用户本机验收未关闭。

#### 第32组：Provider仅追加、发现期限与失败消费

范围是本机API Provider的/models发现与配置，不是暂停的身份/轨迹探针。对照bind/settings、providers、POST models及store同步保存链，确认旧Add构建builtin+发现列表整表替换、忽略保存结果；VM先复现HTTP500但success:true仍报Test OK。新增addProvider合同的HTTP回归初次失败是旧路由忽略新字段只回success、并未追加，故前端另检查added防假兼容。最初VM夹具缺m-base节点导致TypeError，补齐夹具后得到真实产品失败；不把夹具错误当产品缺陷。

决策：Add仅追加、不切换当前模型；同Endpoint/modelId（含旧版记录）冲突整批409，不覆盖密钥，不把脱敏旧列表提交回去。新ID由规范Endpoint+完整远端ID的SHA256生成，避免标点清洗碰撞；保留旧模型/Key、Bridge及其他配置。全部校验后单host同步load/check/save；不宣称跨进程CAS、旧模型更新/删除UI或完整配置schema已完成。通用POST models原整表能力保留兼容，只有新增分支严格禁止混用字段。

Test/Add全流程与模型选择共用guard，捕获Endpoint/Key/manualId/vision快照；普通发现失败不保存，明确填manualId后Add只登记此项。POST必须HTTP/业务成功且added匹配才确认，保存后刷新失败不重放。确认后只清仍等于本次输入的Key，保留新草稿。Provider表用无原型字典避免__proto__/constructor组名崩溃；HTML和说明改成列表成功不等于Chat/工具/视觉兼容。

后端15秒期限原已存在，本次修正文档中“无期限”旧断言；新增断连取消传播、逐块512KiB预算（非进程内存上限）、1–100项/字段预算、URL/key校验、拒跳转及错误正文不回显。发现只向用户明确指定的HTTP(S)端点发送Key，可含本机服务；没有套用externalMCP的公网DNS/SSRF隔离保证。旧ProviderKey更新/删除、其他状态消费者和R2剩余安全调用链仍未完成。

验证：apiFiles、providers、workbenchRuntime和chatVision筛选通过；VM、真实回环HTTP、body停顿/跳转与配置保留已覆盖。新增浏览器点击fixture在本批CI实际通过；沙箱仍无Chromium，沿用第31组下载失败记录，不伪造本地浏览器通过。完整82测试文件、生成/构建/一致性检查通过（246源码/28目录/110排除），实现87b1e918ff153c64b510c38cee8b44e9b5fac33a已推当前固定分支，[CI35270917981](https://github.com/cccjvav/web_agent/actions/runs/35270917981)九项逐项成功（Ubuntu Node18/20/22/24、Windows Node20/22/24、Windows安装器、真实Chromium），不代签用户本机或关闭Windows旧超时根因；正式清单只扩大对应章节局部范围，不增加整篇通过数。

## 复盘

- 上一轮只改文件所在目录，没有消除额外管理层次；应先核对已有规则，而不是先引入新文件类型。
- 交接是项目管理的用途，不需要独立的第二份状态源。只有章节职责清晰还不够，启动顺序也须保持L0+L1、L2按需。
- 元复盘：现有技能规则已足以承载本次需求，问题在项目执行方式，无需修改或升级技能原文/只读副本。

## 待更新文档

- [x] AGENTS、CONTEXT、agents、文档中心和现行审查入口：统一指向原管理索引和本阶段。
- [x] 旧路线/交接引用、站点入口及文档守卫：改为现有文件，保留全部工作包检查。
- [ ] 全仓逐句审查与剩余模块说明：按上面的工作包和正式清单持续推进，不能由本次结构合并勾选完成。
