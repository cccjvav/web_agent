# 上游借鉴覆盖地图与实施队列

现行状态（2026-09-16）：用户已确认Windows新手11.3是协作边界说明，标记完成/关闭，不再作为验收阻塞。下文带日期的“11.3未完成”仅保留历史事实，不是当前待办；不因此新增真实手机/桌面证据。


日期：2026-09-15。目标由“几个定向建议”扩大为**尽可能全面发现值得借鉴的设计和实现，并逐项增强现有项目**。

## 1. 方法与证据边界

- 固定上游IvanSkainet/arena-agent提交`46d97048a75ed2fe7227a5ca6f2a85778d32ccd9`；源码在产品仓库外，只读静态检查，不安装/启动上游或运行其测试。
- 先遍历Git跟踪路径，确保大模块不被遗忘；再检查入口、实现、边界、相关测试和我们的对应实现。**路径全覆盖不是源码全审，也不是所有借鉴点已穷尽。**
- 本文是持续队列，状态分为已落地/已部分吸收/候选/待深入/原决定延期；“候选”不代表我们已实现或验证了上游整条调用链。
- 采纳设计不等于复制源码。若以后实质复制代码，必须保留MIT版权/许可，并核对依赖及资源的独立许可。
- 不以“安全原因”笼统略过功能：能保留价值的，要明确安全落点和可执行验收；涉及新权限/产品边界的记录前置条件，不默默开放。

## 2. 已识别的26类机会与取舍

表中简写源码路径除特别标注外相对`arena/`；本批抽查到哪一段就标到哪，不把前100行叫全文。前批专项的具体引用见[原定向审阅](REFERENCE_ARENA_AGENT_2026-09-15.md)。

| 编号 | 借鉴方向 | 源码证据/阅读深度 | 与当前项目关系 | 处置/验收要求 |
|---|---|---|---|---|
| 01 | 能力、依赖与缺口解释 | capabilities.py；capability_gaps.py（前批专项） | 已有hostIdentity/diagnostics；缺依赖、未验证与已执行分开 | 已部分吸收；下一步把真实故障结构化为复现/验证记录，不自动安装 |
| 02 | 调用、事件与任务证据 | observability/tracing_core.py；events/runtime.py（前批专项） | 已有taskId/callId、读回验证、进程内Bridge快照 | 已部分吸收；长时历史需先约定保留、脱敏与删除，不把WS当重放库 |
| 03 | Skill注册、说明与资源 | skills/registry.py、runner.py、cache.py（前批专项） | 已有分层来源ID、hash分页、资源源码查看、Ask草稿 | 已落地；安装、hook、执行与说明继续分离 |
| 04 | 真正接入第三方MCP | mcp_client/client.py:list_tools/request/stop（前后两批抽查） | 已有回环HTTP与单次审批；上游list_tools此处也只读单页，不应称它实现了分页 | 本批自行补有界分页、总预算/总截止时间、深拷贝目录、严格分片SSE；stdio已实现显式启动/回收；现新增明确确认的公网HTTPS/Bearer及DNS固定连接，真实服务待验 |
| 05 | 审批、工作流与副作用 | mcp/custom_tools.py；scenarios/runtime.py（前批专项） | 已有固定白名单工作流、单次本机批准、失败/未知停止 | 已部分吸收；不照搬可重放副作用的retry。条件分支/补偿不是本批功能 |
| 06 | 记忆相关性及来源 | memory/recall_score.py（完整函数）、recall_sources.py（前100行）、profiles.py（完整） | 原recall只按日期、整文件读取；上游tokenizer为拉丁/西里尔字母范围，不能直接满足中文 | 本批字面关键词检索、NFKC规范化、文件行号、输入扫描预算；不是embedding语义库，不跨工作区自动召回 |
| 07 | 启发式规划的诚实契约 | planner/logic.py:infer_memory_profile/build_plan（前100行） | 我们有模型规划/Plan与确定性builtin，不能再把规则模板叫通用推理 | 候选：建议步骤标依据/风险/需哪些工具，实际权限再校验；中文与模糊任务需回归 |
| 08 | 安全编辑的预览/确认/回退 | files/safe_edit.py:build_edit_preview/create_preview/apply_preview（前150行） | 我们已有hash冲突、补丁与审批；上游应用前比对原内容、预览有TTL | 已部分吸收：工作流before显式前置条件、写保护提示及严格条件schema；新文件可读diff与新旧文件预览baseHash/proposedHash已在0.7.2补齐；完整预览交互/受保护回退仍待做。回退也必须检查当前版本，不能无条件覆盖。未认证其并发回退安全 |
| 09 | 文件变化与失效处理 | filewatch/runtime.py:_snapshot/_resolve_target（前120行） | 目前Skill即时重扫、编辑器hash保护；不存在跨工作区watch服务 | 候选：用户启用的目录失效提示、去抖/背压、删除检测；扫描上限要算访问条目而非仅匹配文件 |
| 10 | 后台异步生命周期 | async_lifecycle.py（全文） | 已有请求Abort、命令进程树、隧道生命周期；Python强引用机制不能机械移植Node | 本批MCP登记父取消/总截止时间/清理；后续核对全宿主关闭时所有后台资源归属，不能把取消说成副作用回滚 |
| 11 | 限流恢复与公平性 | rate_limit.py（全文） | 已有MCP入口边界与资源限制，但不能由限流名称推断有会话公平性 | 2026-09-16已部分落地：拒绝不增计数、JSON/HTML Retry-After、1000-key恢复与生成/真实HTTP回归；可信代理下的用户/会话公平性仍待实现，不按不可信头任意取身份 |
| 12 | 公网URL、SSRF及重定向 | security_ssrf.py（前130行） | 默认IP回环，另显式开启公网HTTPS；DNS全答案检查+固定socket lookup，全部重定向拒绝 | 公网接入前置专项：非标准IP/IPv6映射、DNS解析与实际连接一致、重定向逐跳、凭据不跨源。未完成其所有调用链审计 |
| 13 | OCR/文本结果质量门槛 | document/structure.py:assess_text_quality（前125行） | 现有视觉模型与截图，没有通用OCR/结构化任务接口 | 候选：低置信度不编造任务；该词正则未包含中文，不能原样复制质量门槛 |
| 14 | 图片预处理与可解释降级 | image/preprocess.py（前115行） | 现有截图大小/vision声明，没有Pillow/OpenCV流水线 | 候选：限定像素/字节、裁剪/缩放记录、可选依赖缺失说明；不为对齐而自动安装OpenCV |
| 15 | 桌面目标窗口约束 | desktop/text_window_target.py（前115行） | 现有act.ps1窗口标题/句柄约束，不从零重做 | 候选：同名窗/进程/焦点变化拒绝、显示器坐标/DPI与截图变换核对；要Windows真实窗口证据，不以Linux模拟代签 |
| 16 | 多Agent会话撤销与可观测性 | multiagent/agents.py（前65行） | 已有认证会话归属和单工作区，非多租户隔离 | 候选：按会话撤销和有界事件统计；该模块的独立token也不证明文件/进程隔离。多工作区仍延期 |
| 17 | 审阅与CI绑定具体提交 | governance/reviewer_evidence.py（前100行） | 已有CI run与SHA记录；不能拿旧绿灯覆盖新提交 | 持续吸收：记录exact/stale/unbound证据；报告明确源码深度及未运行项，不以测试文件存在当通过 |
| 18 | 变异/性质/模糊测试 | pyproject.toml的dev依赖；.github/workflows/mutation-sweep.yml（前65行） | 已有跨平台真实回归，尚无性质/变异门禁 | 已开始：OAuth限流2000步固定种子生成对照；路径/SSE/hash/审批生成用例及独立变异任务仍待做，不复制小时级全仓门禁 |
| 19 | 发布来源与产物签名 | .github/workflows/sign-release.yml（前65行） | 现有Windows安装器构建，不等于发布产物已签名或可验证 | 候选：校验和→来源证明→签名验证说明；OIDC权限、发布流程与证据绑定先设计，不擅自发release/申请密钥 |
| 20 | 依赖分层与运行可用性 | pyproject.toml（前45行） | Node核心与可选PTY已有区分；本地Python文档按Conda | 候选：按功能显式安装可选组件、缺依赖解释/锁定版本；不复制Python版本或环境管理约定 |
| 21 | 无原生MCP聊天网站接入 | chat_extension/manifest.json/content.js/sidepanel.js（前批专项） | 当前是原生MCP/VS Code扩展路线 | 候选：最小站点权限、可信操作者确认、DOM去重/流式完整性/回填关联；不能承诺任意网站永久兼容 |
| 22 | 认证、TLS、密钥生命周期 | auth/、tls/、token_storage.py（本批仅索引；不是新审计结论） | 我们已有OAuth/PKCE/secret兼容、进程内配对 | 待深入差异检查；保持本机控制面与认证远程面分离，持久登录不随借鉴自动启用 |
| 23 | 自主执行、沙箱与资源预算 | autonomy/posture.py/runner.py（前批专项）；sandbox/（待展开） | Windows Job Object负责进程树，不是OS文件/网络沙箱 | 候选：按要求验证实际隔离可用性、缺失时拒绝；stdio执行器必须带来源/参数/环境/树回收设计 |
| 24 | 多模型、长期任务及失败恢复 | agentic/runtime.py（前批专项）；missions、foundry、ship、cluster（仅索引） | 已有模型失败显式停止、手选fallback、任务板 | 待深入；不以“自我修复”自动重放修改，不复制集群/后台自主部署 |
| 25 | 移动端、语音、模拟器、游戏 | android_app、mobile、emulator、game、hardware等（仅索引） | 当前用户目标是手机Arena经认证Bridge操作本机，不是另造Android客户端 | 保留发现入口；先抽取可复用协议/诊断思想，整个产品域扩张需另评估 |
| 26 | 文档、可访问性与新手路径 | docs、dashboard、workbench、gui、public、scripts（本批仅全树索引） | 已有逐函数文档、生成站点、Windows CMD/Conda线性步骤和轻量工作台 | 待深入实际交互/样式/安装故障路径，不将README承诺当实现；保持两主题与小窗口真实浏览器回归 |

## 3. 本批实际实现：不是只写清单

### A. 外部MCP发现完整性与生命周期
我们原实现看到nextCursor直接拒绝。现有受控回环HTTP客户端改为完整有界发现：最多10页/100工具、分页合计256KiB、整个登记30秒；cursor循环/重复工具/坏schema拒绝，失败不留下半个服务器。总取消与移除服务器联动；元数据返回深拷贝。SSE增补严格UTF8、单字节分片及CR/LF/CRLF处理。

**上游此处也未处理工具分页，分页是我们对照协议需求自行补的，不把它虚称为移植其现成功能。**工具描述/readOnlyHint仍不授予权限，发现全过程不发送tools/call；后续调用仍逐次本机批准。不新增stdio/公网接入、刷新自动换工具或自动重试。

### B. 有界、可追溯的记忆召回
recall新增query，NFKC/大小写规范化后按空白分词做字面匹配，覆盖中文和全角输入；附日记文件/行号，提醒先核对当前证据。不移植上游仅适用部分文字范围的词正则。

读取由无界readdir/readFile变为最多512目录项/30文件/每文件256KiB/总2MiB/5000行，输出仍最多8000字符。超限、坏项、读失败明确truncated/warnings，原文件保留。无query保留原日期/行顺序；未自动新增记忆、跨工作区检索、上传embedding、删历史或持久登录。

### C. 测试证据
新增externalDiscovery.test.js（真实HTTP发现/取消、错误目录、深拷贝、分片SSE）和memoryRecall.test.js（中文/全角/排序/来源、只读与独立预算夹具）；保留原审批/工作流/认证MCP用例。本地57个产品测试文件通过；独立真实Chromium原回归通过，涵盖帮助/Bridge、断WS恢复、主题/保存、Skills、认证远程审批。文档生成库存180文件/25目录/39排除。新增外部MCP分页由真实HTTP夹具验证，不冒称第三方厂商兼容认证；新增记忆由隔离文件夹具验证，不冒称真实模型效果评估。远端CI需绑定提交另查，不由本地通过推断。

## 4. 新增源码定位

- [arena/memory/recall_score.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/memory/recall_score.py)
- [arena/memory/recall_sources.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/memory/recall_sources.py)
- [arena/memory/profiles.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/memory/profiles.py)
- [arena/planner/logic.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/planner/logic.py)
- [arena/files/safe_edit.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/files/safe_edit.py)
- [arena/files/safe_extract.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/files/safe_extract.py)
- [arena/filewatch/runtime.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/filewatch/runtime.py)
- [arena/async_lifecycle.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/async_lifecycle.py)
- [arena/rate_limit.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/rate_limit.py)
- [arena/security_ssrf.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/security_ssrf.py)
- [arena/document/structure.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/document/structure.py)
- [arena/image/preprocess.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/image/preprocess.py)
- [arena/desktop/text_window_target.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/desktop/text_window_target.py)
- [arena/multiagent/agents.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/multiagent/agents.py)
- [arena/governance/reviewer_evidence.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/governance/reviewer_evidence.py)

测试路径索引（只确认存在，未运行）：tests/test_memory_recall_relevance.py、test_memory_profiles.py、test_fs_safe_editor.py、test_filewatch.py、test_async_lifecycle.py、test_rate_limit_recovery.py、test_reviewer_evidence.py。files/safe_extract.py额外抽查了接口和前100行预算定义：未来Skill安装需字节/成员数/链接/解压目标检查，不因文件名叫safe就认定实现全部安全。

## 5. 全树发现覆盖（机械索引，不是语义认证）

该固定提交共有 **1886 个Git跟踪文件**，按下列 **86 个互斥路径组**登记（每个文件恰好计入一组）。非arena目录、CI/安装脚本/文档/前端/资源也进入清单；这里只记录路径与数量，没有拷贝上游内容。

| 路径组 | 文件数 | 当前阅读状态 |
|---|---:|---|
| `.github/` | 28 | 有部分文件抽查；其余待深入 |
| `android_app/` | 10 | 已索引，待深入 |
| `arena/admin/` | 41 | 已索引，待深入 |
| `arena/agent_helpers/` | 4 | 已索引，待深入 |
| `arena/agentctl_cli/` | 15 | 已索引，待深入 |
| `arena/agentctl_extras/` | 7 | 已索引，待深入 |
| `arena/agentic/` | 3 | 有专项或函数抽查；不代表整目录已审 |
| `arena/api_v2/` | 6 | 已索引，待深入 |
| `arena/auth/` | 5 | 已索引，待深入 |
| `arena/autonomy/` | 7 | 有专项或函数抽查；不代表整目录已审 |
| `arena/batch/` | 2 | 已索引，待深入 |
| `arena/browser/` | 99 | 已索引，待深入 |
| `arena/chat_cli/` | 5 | 已索引，待深入 |
| `arena/cluster/` | 3 | 已索引，待深入 |
| `arena/compat_surface/` | 1 | 已索引，待深入 |
| `arena/contexts/` | 8 | 已索引，待深入 |
| `arena/desktop/` | 41 | 有专项或函数抽查；不代表整目录已审 |
| `arena/document/` | 2 | 有专项或函数抽查；不代表整目录已审 |
| `arena/emulator/` | 3 | 已索引，待深入 |
| `arena/events/` | 3 | 有专项或函数抽查；不代表整目录已审 |
| `arena/exec/` | 12 | 已索引，待深入 |
| `arena/extension_bridge/` | 5 | 有专项或函数抽查；不代表整目录已审 |
| `arena/files/` | 6 | 有专项或函数抽查；不代表整目录已审 |
| `arena/filewatch/` | 3 | 有专项或函数抽查；不代表整目录已审 |
| `arena/foundry/` | 2 | 已索引，待深入 |
| `arena/game/` | 3 | 已索引，待深入 |
| `arena/gateway/` | 3 | 已索引，待深入 |
| `arena/governance/` | 5 | 有专项或函数抽查；不代表整目录已审 |
| `arena/grpc/` | 3 | 已索引，待深入 |
| `arena/gui/` | 9 | 已索引，待深入 |
| `arena/handlers/` | 3 | 已索引，待深入 |
| `arena/image/` | 2 | 有专项或函数抽查；不代表整目录已审 |
| `arena/input_helper/` | 3 | 已索引，待深入 |
| `arena/inventory/` | 22 | 已索引，待深入 |
| `arena/mcp/` | 68 | 有专项或函数抽查；不代表整目录已审 |
| `arena/mcp_client/` | 2 | 有专项或函数抽查；不代表整目录已审 |
| `arena/mcp_marketplace/` | 4 | 已索引，待深入 |
| `arena/memory/` | 18 | 有专项或函数抽查；不代表整目录已审 |
| `arena/missions_cli/` | 5 | 已索引，待深入 |
| `arena/mobile/` | 34 | 已索引，待深入 |
| `arena/multiagent/` | 3 | 有专项或函数抽查；不代表整目录已审 |
| `arena/observability/` | 25 | 有专项或函数抽查；不代表整目录已审 |
| `arena/planner/` | 3 | 有专项或函数抽查；不代表整目录已审 |
| `arena/profiles/` | 6 | 已索引，待深入 |
| `arena/project_cli/` | 6 | 已索引，待深入 |
| `arena/public/` | 5 | 已索引，待深入 |
| `arena/relay/` | 6 | 已索引，待深入 |
| `arena/resources/` | 18 | 已索引，待深入 |
| `arena/route_registry/` | 7 | 已索引，待深入 |
| `arena/runtime/` | 2 | 已索引，待深入 |
| `arena/runtime_deps/` | 5 | 已索引，待深入 |
| `arena/sandbox/` | 3 | 已索引，待深入 |
| `arena/scenarios/` | 6 | 有专项或函数抽查；不代表整目录已审 |
| `arena/service/` | 13 | 已索引，待深入 |
| `arena/ship/` | 5 | 已索引，待深入 |
| `arena/skills/` | 13 | 有专项或函数抽查；不代表整目录已审 |
| `arena/system/` | 15 | 已索引，待深入 |
| `arena/tasks/` | 5 | 有专项或函数抽查；不代表整目录已审 |
| `arena/tls/` | 2 | 已索引，待深入 |
| `arena/watchdog/` | 3 | 已索引，待深入 |
| `arena/wiring/` | 30 | 已索引，待深入 |
| `arena/workbench/` | 8 | 已索引，待深入 |
| `arena/（根模块）` | 52 | 有部分文件抽查；其余待深入 |
| `assets/` | 2 | 已索引，待深入 |
| `backups/` | 1 | 已索引，待深入 |
| `bin/` | 27 | 已索引，待深入 |
| `chat_extension/` | 22 | 有部分文件抽查；其余待深入 |
| `chat_extension_firefox/` | 22 | 已索引，待深入 |
| `ci/` | 2 | 已索引，待深入 |
| `dashboard/` | 89 | 已索引，待深入 |
| `dev/` | 4 | 已索引，待深入 |
| `docs/` | 45 | 已索引，待深入 |
| `hooks/` | 2 | 已索引，待深入 |
| `integrations/` | 2 | 已索引，待深入 |
| `logs/` | 1 | 已索引，待深入 |
| `mcp/` | 2 | 已索引，待深入 |
| `memory/` | 1 | 已索引，待深入 |
| `missions/` | 8 | 已索引，待深入 |
| `projects/` | 4 | 已索引，待深入 |
| `queue/` | 4 | 已索引，待深入 |
| `reports/` | 3 | 已索引，待深入 |
| `scripts/` | 137 | 已索引，待深入 |
| `skills/` | 95 | 已索引，待深入 |
| `subagents/` | 1 | 已索引，待深入 |
| `tests/` | 609 | 已索引，待深入 |
| `（仓库根文件）` | 57 | 有部分文件抽查；其余待深入 |

## 6. 下一批优先队列与禁止混淆

1. 将MCP stdio当作独立进程执行功能设计：显式程序/参数/工作目录、最小环境、不用npx自动装包、帧/总输出预算、并发取消与Windows进程树回收；先可控夹具再第三方服务。公网连接另做SSRF/认证/凭据边界，不能随stdio一并默认开放。
2. 继续对照文件预览/冲突、限流恢复、宿主关闭清理，把已有机制中的真实缺口转为回归；不重复实现已有hash/Job Object。
3. 对未审目录按入口与用户路径继续展开，优先浏览器接入、安装更新/供应链、认证生命周期；对文档/资源/移动端等也记录可复用点，而不是只看Python后端。
4. Windows11.3仍由用户真机验收；持续集成不是桌面输入/手机网络证据。持久配对、后台自启、多工作区隔离仍按原决定延期。

本次不是“所有点已找全”的收尾，而是把原来的零散建议升级为可以继续核对、不丢范围的采纳台账。

## 2026-09-15追加：审批后的文件前置检查
继续读到files/safe_edit.py的apply_preview/rollback_change：应用前比较预览旧内容，回退前比较应用后的内容，另有force绕过分支。我们不复制force回退；已有原生expectedHash，不另造平行编辑器。

本批在现有工作流增加可选before（exists/contains/sha256）：批准之后、步骤执行之前检查；失败标E_PRECONDITION/not-started，后续停止。原expect仍是执行后验证，失败语义不同。预览列writeChecks，提示没有显式保护的写步骤；不自动读盘、申请或执行，也不假装所有旧工作流已受新条件保护。

加强条件对象和步骤字段校验，防止拼错保护字段却被静默忽略。条件本身不是文件锁，已有文件写入仍应带工具expectedHash；先前步骤的副作用保留，无回滚/重试。新增隔离文件测试和真实浏览器“提交后其他程序创建文件→批准拒绝→内容保留”用例。其余全树借鉴队列继续有效，未将26类机会宣布全部完成。

本批本地验证：58个测试文件通过，独立真实Chromium回归通过；文档生成181文件/25目录/39排除。没有运行上游测试，也不替代用户真机验收。

## 2026-09-15连续推进：stdio MCP接入闭环

本批把优先队列的stdio从规划变成产品能力：本机JSON配置只读预览、程序/显式入口hash、2分钟一次性确认；绝对程序路径、字面args、工作区cwd、最小环境；Windows固定PS/C#二进制转发与现有Job Object、父死亡监视，POSIX监督器/进程组/父死亡监视。复用既有初始化/有界分页/逐次审批/remote会话归属，不另造执行队列。

传输单帧256KiB、进程累计8MiB、stderr1MiB/不保存正文、4096帧、8并发、请求30秒；取消/超限/退出停止整服务，服务器主动sampling/roots等请求拒绝，不自动重启或重放。页面与新路由仍仅本机，启动确认与工具调用批准独立。src/index.js补stdio关闭链；安装包与CI包含Windows桥的编译/解析检查。

明确限制：这是启动可信OS用户程序，不是OS沙箱；代码可读工作区外文件/联网/访问本机API，也可能自行安装依赖。我们不自动npx安装，不声称环境过滤或解释器白名单隔离代码。WindowsJob仅管生命周期；POSIX恶意脱组不在保证内。hash不覆盖所有依赖/并发改盘，第三方输出可能主动带秘密。

本地验证59个测试文件通过；独立真实Chromium走通“预览无进程→取消确认无进程→确认启动→认证远程申请→本机批准才调用一次→移除”。专项真实Node夹具覆盖引号/反斜杠/中文、凭据不继承、程序与入口变更、预览过期、取消/帧/输出预算，以及只杀宿主后的子孙回收。Windows真实执行须以本批CI结果为准，不以Linux结果代签；用户11.3及第三方具体包仍未验收。

尚未完成公网MCP、非原生网站扩展适配、独立OS沙箱、发布签名及其余未深读模块；原队列仍保留，不把stdio完成写成所有借鉴工作完成。安装器已存在逐文件hash manifest，已核对，不再重复造一个同功能清单。

## 2026-09-15 stdio Windows运行闭环证据

修复提交d28c6216e2c744c42b263c5844449f03979a037e的[CI34965636564](https://github.com/cccjvav/web_agent/actions/runs/34965636564)九项全部成功：Ubuntu Node18/20/22/24、Windows Node20/22/24、安装器、Chromium。此前5e488ae及后续诊断提交曾失败；最初只查stdin刷新并不足以解决。固定阶段诊断最终将卡点定位到PowerShell脚本已进入、JSON/环境清理尚未完成；显式Utility模块限定调用和.NET环境/路径API之后全矩阵通过。保留独立二进制线程、Flush、启动屏障、辅助环境与目标环境隔离，以及不含原始stderr的阶段/停止原因。未放宽30秒请求期限或120秒测试文件期限。

测试不再用旧夹具PID或任意启动失败冒充预算触发；每个预算模式清理标记、要求真实启动，并核对预期错误。当前追加Windows stdio重复两轮、就绪完整顺序断言与本文档更新；上述链接只认证d28c621，不代签后续提交。用户11.3和实际第三方软件包仍待真实验收，公网MCP/网站兼容/独立OS隔离/发布签名及其余借鉴项并未宣布完成。
