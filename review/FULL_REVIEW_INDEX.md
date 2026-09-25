# Markdown文档时效与一致性核对清单

**口径：** 按用户2026-09-22澄清，确认项目.md是否与最新实现/项目状态一致，不要求全仓源码逐行认证。计划仍在[阶段10](../manager/stages/s10-upstream-adoption.md)，写作/生成标准见[唯一规范](../manager/docs/documentation.md)。

## 审查标准

- 本轮基线f317c44，项目内跟踪/未忽略Markdown共200份；不读取用户忽略的私密资料或依赖README。
- 现行正文核对用途、操作/命令/路径、默认值、接口/模式/权限、预算与失败、测试/当前进度，按具体说法查对应实现，不把源码文件数当文档分母。记录的时效结论不表示实机/第三方兼容或算法安全认证。
- 历史原稿只核对位置、基线和现行后续指针，不改当时的失败/授权；13份暂停专项只登记。规则源/副本只读保留。源码索引与三份扩展Markdown副本做生成一致性核验；副本目录的根README是人工说明，不因其旧分类为generated就跳过正文。
- 未检查的文档明确“待核对”；“待证据确认”说明缺的是哪类外部/实际环境证据，不能与未阅读混淆。已修正/已核对一致仅限记录的内容与保留边界，不用改日期/hash冒充。
- 旧深度标签及详细依据可查f317c44版同一文件和下方批次历史；没有把旧“已逐句/局部”直接转为本轮通过。非MD的许可证/原始受限证据放附表，不进入200份分母。

## 本轮进度

<!-- review-status-counts:start -->
Markdown：207（对方本轮分母200 + 01a0c925新增交叉验证台账1 + 26a167e上传的第三方复审报告1 + 01a0d084新增R8本轮验收手册1 + 用户上传R8实机验收记录1 + 01a0d084新增一体化启动返工方案1 + 01a0d084新增插件一键启动验收手册1 + 用户上传R6第一期实机验收记录1）；已核对一致 88、已修正 58、待证据确认 2、历史保留 40、只读保留 2、生成核验 4、暂停 13。分类处置不是全仓安全认证；逐项依据见表。
<!-- review-status-counts:end -->

## 逐文件状态

| 文件 | 本轮时效处置 | 内容指纹前16位 | 对照依据／保留边界 |
|---|---|---|---|
| [.config/code-server/README.md](../.config/code-server/README.md) | 已修正 | f4b97f654e47efa2 | 核对发行中性模板、配置/参数优先级、环境口令不落盘及源码/安装userData；不读取真实YAML/口令。 依据：installer/package.js; scripts/run-code-oss.js; codeServerAuth.js |
| [.github/workflows/README.md](../.github/workflows/README.md) | 已核对一致 | 528e8f49477f3a6b | 核对三个job/九矩阵任务、Node/Action版本、只读权限、生产audit门禁与Windows重复生命周期；编译不代签实机。 依据：.github/workflows/test.yml |
| [.webagent/skills/commit-now/SKILL.md](../.webagent/skills/commit-now/SKILL.md) | 已修正 | d9d09852adcba323 | 补文件/本地对象/远端提交分别确认、推送失败与安全恢复；提交范围及Code门禁保持。 依据：F64/F66恢复记录; git/gh约定 |
| [.webagent/skills/docs-sync/SKILL.md](../.webagent/skills/docs-sync/SKILL.md) | 已核对一致 | 417415f762f03599 | 唯一规范、正文原地更新、生成/完整测试与Ask/Plan只读约定一致。 依据：manager/docs/documentation.md; docs-site/check-docs.js |
| [.webagent/skills/evidence-check/README.md](../.webagent/skills/evidence-check/README.md) | 已核对一致 | 3cc3038c2dbec215 | 声明式样例/预览和审批不授额外权限，与技能/工作流入口一致。 依据：tools/workflows.js; utils/operatorQueue.js; workflow.json |
| [.webagent/skills/evidence-check/SKILL.md](../.webagent/skills/evidence-check/SKILL.md) | 已核对一致 | 9fdfadcf9f89d83e | ping/workspace_info、资源按需读、只读证据与审批后执行边界一致。 依据：tools/index.js; tools/skills.js; workflows |
| [.webagent/skills/evidence-check/references/checklist.md](../.webagent/skills/evidence-check/references/checklist.md) | 已核对一致 | 8e07e93c431a3c2b | 实例/工作区/hash/审批状态及敏感信息约束对应当前工具；未把外部自报当独立核验。 依据：workspaceInfo; operatorQueue; readFile |
| [.webagent/skills/fix-tests/SKILL.md](../.webagent/skills/fix-tests/SKILL.md) | 已核对一致 | bc401dc72aada5ae | 根npm test转发、安装命令、失败定位、hash保护及示例独立入口一致。 依据：package.json; scripts/run-tests.js; tools/patchEngine.js |
| [.webagent/skills/review/SKILL.md](../.webagent/skills/review/SKILL.md) | 已核对一致 | d30d72094e8aa2e2 | 默认只读、无Git降级及修改授权边界与工具可用性一致；不把本技能当本轮源码逐行要求。 依据：gitOps.js; tools/index.js; F66范围 |
| [AGENTS.md](../AGENTS.md) | 已核对一致 | 436905c57093ee1a | 管家入口、同级文档/生成命令、固定分支与隐私规则均可定位，详情由F66规范限定。 依据：manager/CONTEXT.md; agents.md; documentation.md |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 已核对一致 | 1a54f3466ead86dd | 开发依赖/测试、Conda/CMD、文档闭环及权限边界与现行入口一致。 依据：package.json; run-tests.cmd; CI; SECURITY |
| [README.md](../README.md) | 已修正 | 4bb3061c3709fa9a | 核对启动入口、默认端口/工作区、0.7.2、现有功能与导航；暂停版本改为既有交付记录，不冒称外部最新版。 依据：package.json; launch.js; extension/package.json; 主机/工作台入口 |
| [SECURITY.md](../SECURITY.md) | 已修正 | ff2ea1228ce04dcd | 核对控制面、OAuth/peer、Git/文本、审批/stdio、网络/统计/恢复与清理的现行边界；敏感路径措辞补只读Git/搜索，不约束任意Execute。OS竞态/真实桌面等仍保留。 依据：localControl/corsAllow; mcp/session/oauth; tools; F62–65; 安全相关现有回归 |
| [arena-model-probe/README-PYTHON.md](../arena-model-probe/README-PYTHON.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [arena-model-probe/README.md](../arena-model-probe/README.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [arena-model-probe/TRANSPORT_REVIEW.md](../arena-model-probe/TRANSPORT_REVIEW.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [arena-trace-inspector/README.md](../arena-trace-inspector/README.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [arena-trace-inspector/安装教程.md](../arena-trace-inspector/安装教程.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [bin/README.md](../bin/README.md) | 已修正 | f5fac9774d34c5aa | 4.135.0清单/下载入口一致；修复相对说明定位与经典模式不依赖运行时的措辞。 依据：bin/code-server-runtime/package.json; ensure-code-server.js; installer/package.js |
| [computer-use/SKILL.md](../computer-use/SKILL.md) | 已修正 | 6726a24e154b56d9 | 修snap META/首个通配、info真实字段、mark路径/JSON限制、6MiB/出站预算与剪贴板/视觉不绝对可靠；历史实测与外部归档不冒充当前验收。 依据：win/snap/info/mark/type脚本及C#；agent/computerUse；CI；历史来源边界 |
| [computer-use/win/README.md](../computer-use/win/README.md) | 已修正 | f7eca50a5f7b0b58 | 12脚本/辅助分工正确，区分截图首匹配与点击/输入唯一匹配；SUBMITTED、焦点/剪贴板/实机边界保持。 依据：win脚本参数/调用；CI/installerPackaging |
| [computer-use/win/截图标记与OCR详解.md](../computer-use/win/截图标记与OCR详解.md) | 已修正 | 0659f33cbbd7189f | 核对截图/元信息/标记/OCR方法、参数/局限；修CI现已编译capture/mark，但未实际操作GDI/OCR。 依据：六个PS/C#源码与test.yml编译名单 |
| [computer-use/win/鼠标键盘与剪贴板详解.md](../computer-use/win/鼠标键盘与剪贴板详解.md) | 已核对一致 | 2f5dba67bb07f984 | 参数、窗口唯一性/焦点/坐标、消息提交、Clipboard序号/特殊格式/错误码与源码一致；只读核对未操作桌面。 依据：act/act-bg/type与input/input2/keys源码；既有CI无效句柄检查 |
| [docs-site/README.md](../docs-site/README.md) | 已核对一致 | 6f1b7ea39ee4d415 | 构建/启动/静态范围、内嵌与未内嵌文档、源码快照/生成守卫及发行预构建边界一致；非全网/全文语义检查。 依据：docs-site build/serve/check-docs; config; docsSite/docsHttp现有回归 |
| [docs-site/source-index.md](../docs-site/source-index.md) | 生成核验 | c907b7c2eb3a6f3b | source-index由check-docs生成核验；扩展Markdown按规范源码与整个发行文件集合逐字节比较，不手改副本。 依据：check-docs updated=0; extensionCopy.test.js通过 |
| [docs-site/样式规则详解.md](../docs-site/样式规则详解.md) | 已核对一致 | e8a5d4704e7cc503 | 核对变量/260px网格/组件选择器/980px断点、局部滚动/焦点和实际渲染配合；不代签全部页面或系统字体。 依据：styles.css; app.js; docsViewerBrowser选定状态 |
| [docs-site/浏览与服务详解.md](../docs-site/浏览与服务详解.md) | 已核对一致 | 9d6ef43698a5a8d9 | 核对八路页面/搜索/锚点/源码滚动、预构建/开发服务器与静态路径/方法/匿名边界及真实浏览器验证范围。 依据：app.js; serve.js; index.html; 现有docs相关回归 |
| [docs-site/清单与构建详解.md](../docs-site/清单与构建详解.md) | 已修正 | 798ad5314908b02c | 核对库存/归属/AST、解析/链接重写、快照/排除与输出，原地修CRLF及四主文档独立路径上下文；解析器局限保留。 依据：check-docs.js; build.js; anchors.js; documentationLinks/docsSite |
| [docs/README.md](../docs/README.md) | 已核对一致 | fea451c15541844e | 现行文档任务、11/8专题和主指南/历史/管家入口真实存在且与新口径一致。 依据：目录清单与F66约定 |
| [docs/development/README.md](../docs/development/README.md) | 已核对一致 | d307d5db7afbe601 | 8篇开发专题与源码旁说明/管理导航一致。 依据：Git文档清单; documentation.config.json |
| [docs/development/插件一体化启动返工方案.md](../docs/development/插件一体化启动返工方案.md) | 已核对一致 | 4bae54aece9f11ee | 01a0d084新增R6方案稿：现状事实按c8c2711源码核对（插件视图/按钮、SKIP_WORKBENCH、工作台独有功能与接口、capabilities未声明）；设计与分期为待确认提案（用户澄清后改为两期、网页工作台保留），不代表已实现。 依据：extension.js/package.json、agent-host config/index/routes、workbench js、installer/launch.js。 |
| [docs/development/代码复盘指南.md](../docs/development/代码复盘指南.md) | 已修正 | a674449ec578d89d | 核对全部导航目标和学习主题，修旧requestScope导出数量及避免把教学提纲当全源码必写任务；暂停链接仅定位。 依据：源码/详解路径; requestScope.js; F66标准 |
| [docs/development/借鉴优化说明（新手版）.md](../docs/development/借鉴优化说明（新手版）.md) | 已修正 | 6fb6d72ddef8ea22 | 核对当前已实现能力与候选/延期区别；Windows特定修复不覆盖未解R4，旧59文件/2d42c39留作当时证据并指当前阶段。 依据：src/相关功能; CI矩阵; 阶段10; 上游来源归档边界 |
| [docs/development/平台启动与CI详解.md](../docs/development/平台启动与CI详解.md) | 已核对一致 | fc444924f4233a4b | 逐组核对CMD/sh参数/cwd/退出、npm入口与依赖、CI九任务/权限/审计/编译和浏览器边界。 依据：根脚本; package.json; .github/workflows/test.yml; installer |
| [docs/development/总览.md](../docs/development/总览.md) | 已修正 | 61fca4bc94dff730 | 核对目录/入口/函数导航、执行模式、恢复及端口配置；区分根npm install/test与start自动生产依赖准备。 依据：package.json; launch.js; cfg/index; 对应源码/已有回归 |
| [docs/development/技术实现.md](../docs/development/技术实现.md) | 已修正 | 9fd6a706772f4e6c | 修搜索10秒启动+2秒扫描、严格UTF-8/差异写前预算及admin与usage存储差异；核对执行/取消/授权/恢复链。 依据：fileOps.searchWorker; boundedFile/diff/patchEngine; admin/app; requestScope; 主机路由 |
| [docs/development/架构导读.md](../docs/development/架构导读.md) | 已修正 | e2bea5aeabef78d4 | 分层/授权/控制面/文件/恢复/测试边界与现状匹配，更新文档任务口径，不把历史截图当实现或实机。 依据：主线入口及相关说明/实现，F62–65修复与F66更正 |
| [docs/development/测试说明.md](../docs/development/测试说明.md) | 已核对一致 | a1fead02dbf92451 | 核对完整/筛选/浏览器/示例入口、退出码/依赖、CI/实机边界与已报告通过项；不继承旧通过数。 依据：run-tests.cmd; scripts/run-tests.js; package/CI; CHECKLIST_WINDOWS |
| [docs/development/组件说明.md](../docs/development/组件说明.md) | 已修正 | eff5a35e5991992b | 核对四UI/两模式、入站/出站、数据目录/发行与恢复，补Ask/Plan元数据及本机/远端ACL边界。 依据：src入口/tools/executionControl; installer; 源码目录清单 |
| [docs/guides/Bridge任务栏说明.md](../docs/guides/Bridge任务栏说明.md) | 已修正 | 7672acfa641f0383 | 修report_progress为Plan/Code；核对todo状态、16×50/30分钟/500字符与3秒/4秒快照，实机边界保留。 依据：tools/index.js; progressTracker.js; 工作台/扩展轮询 |
| [docs/guides/Bridge权限与工作模式.md](../docs/guides/Bridge权限与工作模式.md) | 已核对一致 | 939f1e237de312b3 | 核对idle/互斥/权限依赖、revision、后台/审批/stdio/PTY屏障；仍只约束远端工具，不冒称实机或OS沙箱。 依据：executionControl.js; mcp/server.js; tools/index.js |
| [docs/guides/Bridge统计与刷新排查.md](../docs/guides/Bridge统计与刷新排查.md) | 已修正 | d72a923e211a4429 | 恢复2026-09-15用户已确认结果；区分未来复发诊断，补Clear log同时清hash缓存。 依据：CHECKLIST_WINDOWS.md用户记录; bridge.js; routes.js; readCache.js |
| [docs/guides/Conda环境说明.md](../docs/guides/Conda环境说明.md) | 已核对一致 | 563f5c01a267970b | 核对Node与业务Python分层、CMD/PATH/子进程继承、测试/日志/文档命令及E1–E6未验边界。环境导出副作用和本机条件明示，不把可选新环境当产品必需。 依据：launch/executor/ptyPolicy; package/CI; run-tests.cmd; 当前无Conda |
| [docs/guides/README.md](../docs/guides/README.md) | 已核对一致 | 74c45205a36fbc49 | 11篇用户专题真实路径、主指南/管家/暂停边界一致。 依据：Git文档清单; 根文档中心 |
| [docs/guides/R8本轮Arena实机验收.md](../docs/guides/R8本轮Arena实机验收.md) | 已核对一致 | f181c728759e8d68 | 01a0d084新增：第七批/F71/F72的本机逐步验收。参数名、返回字段（stdoutChars/stdoutTruncated/timeoutSec/suggestedWaitMs）、jsonErrors原文、确认框按钮与状态栏文字逐项对照源码；用户机器步骤全部待执行，不代签。 依据：tools/index.js; tools/executor.js; src/index.js; extension/ptyHost.js; extension/extension.js |
| [docs/guides/插件一键启动实机验收.md](../docs/guides/插件一键启动实机验收.md) | 已核对一致 | b373987ce6b1b97b | 01a0d084新增：R6第一期插件一键启动的本机逐步验收（Windows桌面VS Code、集成CMD、Conda、系统Node、Quick Tunnel）。按钮名、确认框、外部主机提示、状态栏与告警文字已逐条对照extension.js/hostManager.js；不代表实机已通过。 |
| [docs/guides/Windows新手逐步验收.md](../docs/guides/Windows新手逐步验收.md) | 已修正 | 1505127799d2dd1f | 移除拉取历史固定分支，改先核当前分支/上游；修已报告完成范围与统计已确认记录、路径引用和MCP连接条件措辞。新增/用户机器步骤保留未执行。 依据：CHECKLIST_WINDOWS/manager用户反馈; 当前启动/测试/恢复/回收接口 |
| [docs/guides/内置探索Agent使用指南.md](../docs/guides/内置探索Agent使用指南.md) | 已修正 | 89b7d9a5514edc51 | 修根package/test入口和非Git available:false；核对6文件/120行、固定探索与真实模型及模式界限。 依据：package.json; agent/runChat.js; gitOps.js; extension |
| [docs/guides/技能使用指南.md](../docs/guides/技能使用指南.md) | 已修正 | 018cc5c558d4b1bc | 目录512/128/3层、128KiB/8000UTF16分页、资源只读、三bundled例外及审批/创建均与源码一致；修gitignore不会撤销既有跟踪的保证。 依据：tools/skills.js; api/skills; customizations; index schema |
| [docs/guides/网页ChatPlus使用指南.md](../docs/guides/网页ChatPlus使用指南.md) | 待证据确认 | a0fbe858990f07d3 | 本项目候选/未验证/不自动安装的文案与clients一致；外部当前版本、安装、套餐、许可及真实认证互操作未验，不虚称最新兼容。 依据：mcp/clients.js; 既定第三方边界 |
| [docs/guides/网页DeepSeek使用指南.md](../docs/guides/网页DeepSeek使用指南.md) | 待证据确认 | d76c9c0f93c2acac | 本项目候选/未验证状态一致；具体第三方包、网站、账号与协议需实际版本证据，保留条件式说明。 依据：mcp/clients.js; 既定第三方边界 |
| [docs/guides/网页VSCode使用指南.md](../docs/guides/网页VSCode使用指南.md) | 已修正 | 89d87d4f1f40da3d | 修环境口令不落盘/userData、顺序启动、下载不等于可运行、期限/重试、实际MCP接入与域名可能变化；Windows平台不代签。 依据：codeServerAuth.js; ensure-code-server.js; run-code-oss.js; clients.js |
| [docs/guides/隧道使用指南.md](../docs/guides/隧道使用指南.md) | 已核对一致 | 001c2a0552400174 | 核对Quick/Named/ngrok配置优先级、参数、25秒解析就绪、令牌/停止/身份边界；真实提供商操作保持未验条件。 依据：tunnel模块; api/bridge/start; 既有隧道回归与源码参数 |
| [examples/calculator/.webagent/instructions.md](../examples/calculator/.webagent/instructions.md) | 已核对一致 | b9fee21ec621714f | 这是示例工作区的更保守用户指令，不宣称全局Ask/Plan绝无元数据写入；路径/内容用途一致。 依据：例子README; models/customizations.js |
| [examples/calculator/README.md](../examples/calculator/README.md) | 已修正 | a676c4a6929a5962 | 对照五运算/六用例和package，移除过期手抄行号并补固定bundled Skill例外；示例不等于产品。 依据：示例src/calculator.js, tests/calculator.test.js, package.json; skills.js |
| [installer/README.md](../installer/README.md) | 已修正 | 576aaaf0c584a6bb | 核对载荷白名单、可写runtime与.ready复用、各模式/准备预算、数据保留及回收边界；将只读R5首包改为历史，衔接已交付确认回收。 依据：package.js; launch.js; appWindow.js; webagent.iss; F65 |
| [installer/函数详解.md](../installer/函数详解.md) | 已修正 | e5675eeb2aa3d483 | 核对manifest/runtime/工作区/三种准备预算、app身份/IPC/回收及打包副作用，修职责漏列appWindow/preparation；平台/全部后代仍未代验。 依据：installer四Node模块/PS/ISS; F60/65真实函数回归; package collect/stage |
| [installer/安装声明详解.md](../installer/安装声明详解.md) | 已修正 | a11f53ac346c3684 | 核对Inno声明/路径权限/注册表/卸载/事件，修默认版本0.7.2和缺漏的回收开始菜单；Windows实操仍未代验。 依据：webagent.iss; installerPackaging/现有Windows CI |
| [manager/CONTEXT.md](../manager/CONTEXT.md) | 已修正 | 6d700c856324c49a | 按F67实际进度更新入口/基线和.md分母；旧CI只作对应提交证据，实机/暂停/遗留单列。 依据：本轮清单、Git HEAD、阶段10与用户更正 |
| [manager/SKILL.md](../manager/SKILL.md) | 只读保留 | 5c8c93d50e52332b | 规范源/副本逐字节相同，作为既有规则保留，不冒称外部最新版；项目特色与F66澄清在manager/agents和唯一文档规范处理。 依据：cmp source/copy; AGENTS只读约定 |
| [manager/agents.md](../manager/agents.md) | 已核对一致 | 72974d815aa58d57 | 技术栈/同进程双端口、代码文档和安全/暂停/固定分支约定与当前授权一致。 依据：AGENTS、用户F66澄清、package/CI |
| [manager/docs/documentation.md](../manager/docs/documentation.md) | 已核对一致 | ac757d0b6f4700c0 | 核对用户新口径、唯一主说明、生成/链接/测试与分类处置；教学标准不膨胀为源码逐行认证。 依据：用户澄清、check-docs/build/tests的实际职责 |
| [manager/docs/experience.md](../manager/docs/experience.md) | 已核对一致 | ec814dee3d4f63ee | 仅保留可复用方法，恢复/测试/并发/文档口径/F62–65经验仍适用，不重复维护当前待办。 依据：本轮实际恢复/文档核对及阶段10历史 |
| [manager/stages/audit-2026-09-11.md](../manager/stages/audit-2026-09-11.md) | 已修正 | 3b8de4f6609d2311 | 补历史阶段横幅，旧分支/基线/授权只属当时；原审计事实不重写。 依据：CONTEXT和阶段10现行入口。 |
| [manager/stages/context-history-through-0.4.md](../manager/stages/context-history-through-0.4.md) | 历史保留 | a4ccaf24eb17241b | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/documentation-2026-09-12.md](../manager/stages/documentation-2026-09-12.md) | 历史保留 | c23c09e4b3615d99 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/probe-dual-integration-2026-09-15.md](../manager/stages/probe-dual-integration-2026-09-15.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [manager/stages/s1-handoff.md](../manager/stages/s1-handoff.md) | 历史保留 | cfc0e427dc08e55c | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s10-upstream-adoption.md](../manager/stages/s10-upstream-adoption.md) | 已核对一致 | 260dbda6917cb10b | 当前唯一工作包表/失败/批次与F66–68实际进度一致；历史段按时间保留，R7仍为下一项。 依据：CONTEXT; 本轮200文档清单; 实际提交/测试/CI记录 |
| [manager/stages/s2-shell.md](../manager/stages/s2-shell.md) | 历史保留 | 5ac447fe582ce09e | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s3-bridge-image.md](../manager/stages/s3-bridge-image.md) | 历史保留 | fbe64b3265d3cf1a | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s4-terminal.md](../manager/stages/s4-terminal.md) | 历史保留 | 1cf1fcca01c51478 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s5-experience-parity.md](../manager/stages/s5-experience-parity.md) | 历史保留 | f5a036d8d7542421 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s6-multi-agent-board.md](../manager/stages/s6-multi-agent-board.md) | 历史保留 | 94899c98f63459c5 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s7-platform-reliability.md](../manager/stages/s7-platform-reliability.md) | 历史保留 | 7e447deda058dc16 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [manager/stages/s8-probe-integration.md](../manager/stages/s8-probe-integration.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [manager/stages/s9-workspace-entry.md](../manager/stages/s9-workspace-entry.md) | 历史保留 | 77367a885aa57c03 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [multi-agent-board/SKILL.md](../multi-agent-board/SKILL.md) | 已修正 | add1cea18f6915d6 | 纠正client@ip、持久化、E_TAKEN owner位置、单进程认领保证及Read/Edit认证范围。 依据：tools/board.js; mcp/session.js; tools/index.js |
| [project-manager/SKILL.md](../project-manager/SKILL.md) | 只读保留 | 5c8c93d50e52332b | 规范源/副本逐字节相同，作为既有规则保留，不冒称外部最新版；项目特色与F66澄清在manager/agents和唯一文档规范处理。 依据：cmp source/copy; AGENTS只读约定 |
| [review/CHECKLIST_WINDOWS.md](CHECKLIST_WINDOWS.md) | 已修正 | 2cb520cfd51af021 | 唯一人工基线、用户已报告项/未执行W/T/M等边界保留；现行指针改为文档与修复证据/管理索引，不把CI代实机。 依据：用户历史反馈; 当前指南/CONTEXT |
| [review/CROSS_VALIDATION_LEDGER_2026-09-22.md](CROSS_VALIDATION_LEDGER_2026-09-22.md) | 已核对一致 | 58394e6dd5cded38 | 分支01a0c925×01a0c932双线交叉验证台账：4项独立同解、1项互补、各自独有3+1、1项分歧（BOM，01a0c925错并已修）；§10记录对方冻结后的逐条吸收结论。本文件由01a0c925新增，不在对方200份分母内，故总数记201。 依据：两分支提交与实测复现脚本 |
| [review/COMPREHENSIVE_AUDIT_2026-09-22.md](COMPREHENSIVE_AUDIT_2026-09-22.md) | 历史保留 | 3311792cb2b31b4c | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [review/FULL_AUDIT_FOLLOWUP_2026-09-18.md](FULL_AUDIT_FOLLOWUP_2026-09-18.md) | 历史保留 | 8a0799b45e63fcdb | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [review/FULL_REVIEW_INDEX.md](FULL_REVIEW_INDEX.md) | 已修正 | 本清单，见提交 | 本清单用200份Markdown实际处置替换旧深度进度，附随非MD单列；待核对没有冒称完成。 依据：Git Markdown库存与逐份核对记录 |
| [review/INDEPENDENT_AUDIT_2026-09-20.md](INDEPENDENT_AUDIT_2026-09-20.md) | 历史保留 | 3b4217a39ab62041 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [review/INDEPENDENT_AUDIT_2026-09-22.md](INDEPENDENT_AUDIT_2026-09-22.md) | 历史保留 | aa953868b8d522d5 | F62–65已交付报告，顶部已有最终提交/CI与未验边界；不作为当前R7完成率或当前计划。 依据：7d36305/3ce1678及对应CI; 阶段10 |
| [review/OPTIMIZATION_REPORT_2026-09-18.md](OPTIMIZATION_REPORT_2026-09-18.md) | 历史保留 | 29391f9e3e15ea70 | 保留当时阶段/基线/失败/取舍；现行入口已由CONTEXT、阶段10或报告顶部指向后续处置，不把正文中的当前/待办/测试数继承到今天。 依据：manager/CONTEXT阶段导航; review/archive/README或报告顶部追踪; Git历史。 |
| [review/README.md](README.md) | 已修正 | f9ca7e001141c416 | 更新F67时效工作入口和报告处置边界；历史/截图/私密证据不作当前实现或验收承诺。 依据：本轮清单、独立报告、阶段10 |
| [review/SEMANTIC_REVIEW_2026-09-16.md](SEMANTIC_REVIEW_2026-09-16.md) | 已修正 | 4392ef6fea8b4ea6 | 仅核对当前入口/批次基线及新进度；旧正文作为当时记录保留，不重写或继承旧PASS。 依据：F62–66提交/阶段记录与本轮清单 |
| [review/web_agent_review_2026-09-23.md](web_agent_review_2026-09-23.md) | 历史保留 | e04844e605713fc6 | 用户上传的第三方只读复审（基线08aa942/f8ab6d0两冻结点），作输入证据原样保留、不改写。F70在26a167e逐条复现后分拣：P1-1/P1-5剩余绕过/P1-6/§5.4-1 Windows退出码/§5.4-3文档漂移/§5.4-7 UTF-16截断等属实并修复；§5.4-2“合并丢失argv字节预算”为**假阳性**（9766c6c已恢复12000字节预算，报告看的是旧基线）。处置与证据见阶段10第70组。 依据：26a167e源码实测; gitOps.js MAX_DIFF_PATHSPEC_BYTES |
| [review/R8实机验收记录-2026-09-24.md](R8实机验收记录-2026-09-24.md) | 历史保留 | 21bfceb44e30af41 | 用户上传的R8本机验收记录（HEAD 9c36c10，总判定通过），作验收证据原样保留；仅按用户同意把Windows用户名换成{{用户名}}并移入review/。未执行项、偏差与产品形态反馈以记录原文为准，后续处置见阶段10第72组之后。 依据：用户2026-09-25确认归档方案。 |
| [review/R6第一期实机验收记录-2026-09-25.md](R6第一期实机验收记录-2026-09-25.md) | 历史保留 | be0936a95fa39e14 | 用户上传的R6第一期（插件一键启动）本机验收记录（506cd0a，总判定通过），原为仓库根 r6result.md；仅把 Windows 用户名替换为 {{用户名}}，其余原样保留作验收证据；手册偏差与产品反馈的处置见返工方案 §8 与 s10 第80组 |
| [review/UPSTREAM_ADOPTION_MAP_2026-09-15.md](UPSTREAM_ADOPTION_MAP_2026-09-15.md) | 已修正 | d7fd4319833b70d6 | 明确固定上游SHA和2026-09-15/16深度、旧测试/下一步不是当前队列；26类来源与已/候选/延期边界保留，现行取舍转阶段10。 依据：固定外部审阅来源; 阶段10 R2–R9/P |
| [review/archive/01a08d85-web-agent-audit.md](archive/01a08d85-web-agent-audit.md) | 历史保留 | 95fc2e2b61e4c58c | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/ARENA_PROBE_INTEGRATION_2026-09-15.md](archive/ARENA_PROBE_INTEGRATION_2026-09-15.md) | 历史保留 | 不读取正文 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/AUDIT_2026-09-13.md](archive/AUDIT_2026-09-13.md) | 历史保留 | b212a7844fccc611 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/AUDIT_CROSSCHECK_2026-09-11.md](archive/AUDIT_CROSSCHECK_2026-09-11.md) | 历史保留 | c12028e97e33883c | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/AUDIT_ROUND3_2026-09-13.md](archive/AUDIT_ROUND3_2026-09-13.md) | 历史保留 | 17b783afe8daf785 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/CURRENT_AUDIT_2026-09-15.md](archive/CURRENT_AUDIT_2026-09-15.md) | 历史保留 | 45a0b7f2e7884abd | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/DOC_QUALITY_2026-09-12.md](archive/DOC_QUALITY_2026-09-12.md) | 历史保留 | 4fcacd89f0eb08d7 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/PROMPT_SHUNCODE.md](archive/PROMPT_SHUNCODE.md) | 历史保留 | a087a76a82ea9f39 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/README.md](archive/README.md) | 已核对一致 | a472ebd84af66cf0 | 归档清单链接存在、当时基线与现行入口分开，原始参考只存档不运行；无须把原稿改成现在。 依据：Git归档路径; manager/CONTEXT与主指南 |
| [review/archive/REFERENCE_ARENA_AGENT_2026-09-15.md](archive/REFERENCE_ARENA_AGENT_2026-09-15.md) | 历史保留 | 440ba3bac277e9e4 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT.md](archive/REPORT.md) | 历史保留 | 36f2670d09fa4624 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_FULLAUDIT_2026-09-08.md](archive/REPORT_FULLAUDIT_2026-09-08.md) | 历史保留 | f5bf537a7bdddb99 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_SHUNCODE_S1.md](archive/REPORT_SHUNCODE_S1.md) | 历史保留 | 2b3a15d8a2fac4f3 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_SHUNCODE_S2.md](archive/REPORT_SHUNCODE_S2.md) | 历史保留 | 087e2f46dc17f0ef | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_SHUNCODE_S3.md](archive/REPORT_SHUNCODE_S3.md) | 历史保留 | fd9d8f8819a65d88 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_SHUNCODE_S4.md](archive/REPORT_SHUNCODE_S4.md) | 历史保留 | e7a835c60e829e1c | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_v2.md](archive/REPORT_v2.md) | 历史保留 | b40c12e57f0a7ecb | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_v3.md](archive/REPORT_v3.md) | 历史保留 | 58ffe90588854a35 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_v4.md](archive/REPORT_v4.md) | 历史保留 | 1c02b374cce0cc45 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_v5.md](archive/REPORT_v5.md) | 历史保留 | 82e1af3e703b2abe | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/REPORT_v6.md](archive/REPORT_v6.md) | 历史保留 | d95e82629f539f37 | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/archive/SEMANTIC_BATCHES_01_15_2026-09-16.md](archive/SEMANTIC_BATCHES_01_15_2026-09-16.md) | 历史保留 | ef0de062d90e338f | 归档入口已明确仅历史基线/授权/证据；核对文件位置存在，不按当前实现重写原稿，不把旧PASS/待办当本次结论。专项原稿正文未接手。 依据：review/archive/README.md; Git路径元数据 |
| [review/shuncode-ui/README.md](shuncode-ui/README.md) | 已修正 | add734fa9168d9ce | 明确25张分批索引，去掉仅凭截图断言必为Electron/安装栈和URL已失效的保证；仅历史参考不认证第三方。 依据：25个图文件路径; 既有来源记录; installer/webagent.iss |
| [webagent-core/README.md](../webagent-core/README.md) | 已核对一致 | ecfd98d990a19163 | 代码/界面分工、主机与独立admin以及工作区/启动导航一致。 依据：各入口、index.js与scripts |
| [webagent-core/admin-host/README.md](../webagent-core/admin-host/README.md) | 已核对一致 | 1945b9d05c3c6620 | F63后Bearer/独立端口/坏存储保留/4MiB与10000行、输入/schema/原子发布与窄屏说明均一致。 依据：admin app/index; adminHost/adminIntegrity/浏览器断言 |
| [webagent-core/admin-host/统计服务详解.md](../webagent-core/admin-host/统计服务详解.md) | 已核对一致 | 2def36105e796a08 | F63输入/存储/URL/HTTP码/先序列化再200/静态表格样式及旧token文件/慢请求局限准确，未混入客户端上报改造。 依据：admin/app/index; adminIntegrity/adminHost/浏览器断言 |
| [webagent-core/agent-host/README.md](../webagent-core/agent-host/README.md) | 已核对一致 | 50e76b0dd2ea53b4 | npm入口/运行与开发依赖、版本来源、控制面/双端口、测试过滤和预算一致。 依据：host/package.json; extensionVersion.js; src/index.js; scripts/run-tests.js |
| [webagent-core/agent-host/scripts/README.md](../webagent-core/agent-host/scripts/README.md) | 已核对一致 | 3b7be8f24f9eb7a6 | 运行器过滤/错误、诊断及两个独立只读/本机确认回收CLI的职责和权限边界一致。 依据：scripts/run-tests.js; tunnel-residue/tunnel-cleanup.js |
| [webagent-core/agent-host/scripts/运行器详解.md](../webagent-core/agent-host/scripts/运行器详解.md) | 已修正 | 764e039db1bc6bc8 | 核对发现/过滤/退出码/120秒/CI注解及两个回收CLI边界；纠正现在已有lifecycleSummary函数，不靠标题猜实现。 依据：run-tests.js; testRunner; tunnel-residue/cleanup; R4限定诊断 |
| [webagent-core/agent-host/src/README.md](../webagent-core/agent-host/src/README.md) | 已核对一致 | d6eefb9043221b0b | 配置/身份/初始化先根验证、双端口/API/WS/Origin和解析顺序与入口一致。 依据：src/index/config; localControl/corsAllow; httpSmoke/auditControl |
| [webagent-core/agent-host/src/agent/Chat调度详解.md](../webagent-core/agent-host/src/agent/Chat调度详解.md) | 已修正 | e843693704f7a748 | 统一runChat包装/body、pickExisting安全路径、显式文件优先/evidence与当前总结提示；未把内置目标推断/测试completed当成功保障。 依据：agent/runChat.js; runChat/modelLifecycle回归 |
| [webagent-core/agent-host/src/agent/README.md](../webagent-core/agent-host/src/agent/README.md) | 已核对一致 | 2831df1caec6465a | 核对builtin/模型/Plan分支、失败区别、10轮/8执行/64声明、12MiB请求1MiB响应及截图边界。 依据：runChat/openai/providers/computerUse; modelLifecycle/chatVision |
| [webagent-core/agent-host/src/agent/模型调用详解.md](../webagent-core/agent-host/src/agent/模型调用详解.md) | 已核对一致 | 34be37323caabf8e | 核对请求/响应/工具调用schema与预算、循环/失败、Provider添加/发现、截图候选与stat-read限制及标签投影；不认证真实供应商。 依据：openai/providers/computerUse/toolLabel; 相关回归与常量 |
| [webagent-core/agent-host/src/api/README.md](../webagent-core/agent-host/src/api/README.md) | 已修正 | 498d0c933ab120e9 | 固定入口/schema/状态与读写效果边界一致；补当前显式网络scope覆盖，复核reset-round清HTTP会话/hash而非轮换令牌。 依据：routes.js; validators; apiFiles/bridgeTunnel/GitHub网络回归 |
| [webagent-core/agent-host/src/api/路由逐项详解.md](../webagent-core/agent-host/src/api/路由逐项详解.md) | 已核对一致 | 55785d08e7a38645 | 逐路由schema/query/body/状态、副作用顺序、Bridge身份scope、文件/检查点/审批/外部/执行控制与活动快照当前契约一致。 依据：api/routes.js; documentationLearning函数守卫; api/bridge/operation相关真实HTTP测试 |
| [webagent-core/agent-host/src/auth/GitHub身份详解.md](../webagent-core/agent-host/src/auth/GitHub身份详解.md) | 已核对一致 | c853982ead1cc67b | F64主体/URI/字段/网络预算/REST取消/早期取消与generation发布边界完整对照，真实账号/跨窗口不冒称验证。 依据：github.js; identityRequest; githubAuth/Network |
| [webagent-core/agent-host/src/auth/README.md](../webagent-core/agent-host/src/auth/README.md) | 已核对一致 | 9bfeb816b5358f3e | F64后10秒/64KiB/父取消/拒跳转和代次/单飞/PAT不落盘与可选身份范围正确。 依据：auth/github.js; identityRequest; githubAuth/githubNetwork |
| [webagent-core/agent-host/src/mcp/OAuth授权详解.md](../webagent-core/agent-host/src/mcp/OAuth授权详解.md) | 已核对一致 | 354a28a2b024daee | 核对5分钟/1小时/7天、80注册/1000限流、回调/PKCE/client认证/消费/轮换/撤销和内存/OIDC局限；非真实账号验收。 依据：oauth.js; oauth/oauthClientAuth/oauthRateLimit |
| [webagent-core/agent-host/src/mcp/README.md](../webagent-core/agent-host/src/mcp/README.md) | 已核对一致 | 8aa319617835b4d2 | 核对入/出站角色、版本/批量/SID与公开peer、权限/取消、OAuth/SSE和软预算；平台/多租户/第三方边界不扩大。 依据：mcp/server/session/oauth/requestLifecycle/budget; MCP回归 |
| [webagent-core/agent-host/src/mcp/会话与结果详解.md](../webagent-core/agent-host/src/mcp/会话与结果详解.md) | 已核对一致 | 8bc16c448d668d85 | 核对双Map/TTL/容量/活跃pin/principal与公开peer、错误分类和软结构预算；reset真实清两类会话，非OAuth/进程。 依据：session/errors/budget; mcpBoard/resourceBudget |
| [webagent-core/agent-host/src/mcp/公网出站详解.md](../webagent-core/agent-host/src/mcp/公网出站详解.md) | 已核对一致 | 1b892e6459f27979 | 核对公网上网显式确认、URL/DNS/TLS固定连接/30秒/256KiB、背压与不重放；测试路由不冒充真实供应商。 依据：publicHttps/externalClient; publicHttps.test.js |
| [webagent-core/agent-host/src/mcp/请求分发详解.md](../webagent-core/agent-host/src/mcp/请求分发详解.md) | 已核对一致 | 709f09582017d909 | 逐入口核对认证/版本/SID/整批预检、pin、结果层、资源/提示与64在途/5分钟取消；旧兼容与协作取消限制准确。 依据：server/requestLifecycle; mcpProtocol/mcpBoard/mcpCancellation/requestLifecycle |
| [webagent-core/agent-host/src/mcp/资源与客户端详解.md](../webagent-core/agent-host/src/mcp/资源与客户端详解.md) | 已修正 | 4e2bb0b3e93da2d6 | 资源八项与caller/ACL、七候选卡片/三态/规则一致，修report_progress旧Code-only；外部客户端不作兼容保证。 依据：instructions/resources/clients; tools/index; protocol回归 |
| [webagent-core/agent-host/src/models/README.md](../webagent-core/agent-host/src/models/README.md) | 已核对一致 | 5753de479181feb6 | 配置/定制/模型掩码绑定/记忆不同存储保证、真实路径/预算/失败与当前实现一致。 依据：models各模块; modelSettings; stateIntegrity/apiFiles/auditStorage |
| [webagent-core/agent-host/src/models/画像与记忆详解.md](../webagent-core/agent-host/src/models/画像与记忆详解.md) | 已核对一致 | d2fcac4884ea2c8d | 定制投影/严格写入与四文件非事务、有限探测/用户覆盖、记忆UTC日期/路径/读写预算/排名同实现。 依据：customizations/profile/memory; profile/memoryRecall等 |
| [webagent-core/agent-host/src/models/配置存储详解.md](../webagent-core/agent-host/src/models/配置存储详解.md) | 已核对一致 | 92e0774c11b48f94 | 配置缺失/坏结构、正规化/单文件发布、模型掩码及端点绑定、ignore/权限/历史兼容描述一致，非全schema/跨进程事务。 依据：store/modelSettings; apiFiles/stateIntegrity/auditStorage |
| [webagent-core/agent-host/src/tools/Plan状态详解.md](../webagent-core/agent-host/src/tools/Plan状态详解.md) | 已核对一致 | 9e2a7973b9b2aadb | 全局round/2–8/至少两支与本地模板的simulated/null共识分开，函数副作用/浅引用与调用方代次一致。 依据：planRound/consensusEngine; runChat; planRound/modelLifecycle |
| [webagent-core/agent-host/src/tools/README.md](../webagent-core/agent-host/src/tools/README.md) | 已修正 | e69bdc4d6162898e | 修搜索启动10+扫描2秒和write_file覆盖条件非强制双重AND；文件/工具/缓存/PTY/协作边界已对照。 依据：tools/index/fileOps/patchEngine/readCache; worker和文件回归 |
| [webagent-core/agent-host/src/tools/任务板与工作区详解.md](../webagent-core/agent-host/src/tools/任务板与工作区详解.md) | 已核对一致 | 4cb61893f1f19aea | 任务板单写者/归属/持久坏存储、F62 Git双名/子目录/argv与输出预算、workspaceInfo错误边界一致。 依据：board/gitOps/workspaceInfo; board/workspaceTools/fileReadSafety |
| [webagent-core/agent-host/src/tools/命令与PTY详解.md](../webagent-core/agent-host/src/tools/命令与PTY详解.md) | 已核对一致 | 3ceb647f3d681556 | 所有者隔离、8并发/40记录/200KiB、取消/timeout与Windows Job、PTY32/256/90秒审批/输出捕获均匹配，发送信号不当退出证明。 依据：executor/ptyJobs/commandJob; ptyLifecycle/executionControl/workspaceTools |
| [webagent-core/agent-host/src/tools/工具入口与命令策略详解.md](../webagent-core/agent-host/src/tools/工具入口与命令策略详解.md) | 已修正 | 15383cd9859b29c3 | 去旧固定工具数、统一dispatchTool与callTool追踪/核验分工；模式、别名、remote ACL和词法危险规则与源码一致。 依据：tools/index/normalize/dangerous; extension/dangerousPolicy; 回归 |
| [webagent-core/agent-host/src/tools/技能与隐藏规则详解.md](../webagent-core/agent-host/src/tools/技能与隐藏规则详解.md) | 已核对一致 | c9c7cf038c3e40ba | 读取/发现/分页/来源/资源与命名规则同实现，显式说明先匹配先返、符号链接、字节/层数与全局Conda未识别边界。 依据：skills/sensitive; skillsLifecycle/workspaceTools |
| [webagent-core/agent-host/src/tools/文件与搜索详解.md](../webagent-core/agent-host/src/tools/文件与搜索详解.md) | 已修正 | cf057665a4c7ec45 | 核对文件/搜索预算和共享worker握手，修请求完成不等待terminate与ready后才扫描，计数释放仍待终止Promise。 依据：fileOps/searchWorker/findFiles; searchWorkerLifecycle/resourceBudget |
| [webagent-core/agent-host/src/tools/缓存与进度详解.md](../webagent-core/agent-host/src/tools/缓存与进度详解.md) | 已修正 | 96a1f9ce2c95715d | 修report_progress Plan/Code，核对双hash缓存/重置/TTL与caller计划、上报非质量证明；清统计会清会话但不删除原计划对象。 依据：readCache/progressTracker; api reset; taskProgress |
| [webagent-core/agent-host/src/tools/补丁与路径详解.md](../webagent-core/agent-host/src/tools/补丁与路径详解.md) | 已核对一致 | 1a30231482dc3264 | 真实路径/写锁/排他发布、格式/新建/过期hash/严格UTF8与F62写前diff限制匹配；明确外部竞态/混合换行不事务。 依据：patchEngine/boundedFile/diff; patchEngine/fileReadSafety/diffBudget |
| [webagent-core/agent-host/src/tunnel/README.md](../webagent-core/agent-host/src/tunnel/README.md) | 已核对一致 | 7d4a7801ecf93b19 | 对照25秒日志就绪与正常stopProcess实际Windows taskkill/非Windows信号，区别于R5持句柄残留回收/准备child；不认可任意旧PID清理。 依据：cloudflared/ngrok/stopProcess; registry/cleanup; 生命周期回归 |
| [webagent-core/agent-host/src/tunnel/停止进程详解.md](../webagent-core/agent-host/src/tunnel/停止进程详解.md) | 已核对一致 | 52019de18e237923 | 正常stopProcess的Windows taskkill/非Windows信号与R5收据/DPAPI/稳定句柄/确认回收分开，历史失败和未验范围不抹除。 依据：stopProcess/processIdentity/registry/protection/cleanup; R5全套回归与CI记录 |
| [webagent-core/agent-host/src/tunnel/隧道生命周期详解.md](../webagent-core/agent-host/src/tunnel/隧道生命周期详解.md) | 已核对一致 | d3760217503e271e | Quick/Named/ngrok发现/参数/generation/25秒/日志红action与旧事件隔离匹配；广播异常和公网未验边界明确。 依据：cloudflared/ngrok/stopProcess; tunnel/tunnelLifecycle/bridgeTunnel |
| [webagent-core/agent-host/src/usage/README.md](../webagent-core/agent-host/src/usage/README.md) | 已核对一致 | 07c4af39ec8eb89c | UTC日统计、双配置才报告、写后重读计数、非可靠账本及未完善在途控制如实保留。 依据：tracker.js; usageTracker/auditStorage |
| [webagent-core/agent-host/src/usage/用量上报详解.md](../webagent-core/agent-host/src/usage/用量上报详解.md) | 已修正 | 4a0fb5224ad1ec73 | 读取/直接保存/计数/首事件4秒与15分钟调度、无网络期限/单飞、stop不取消在途均与源码一致；纠正计数漂移回归所属文件。 依据：tracker.js; usageTracker/auditStorage/stateIntegrity |
| [webagent-core/agent-host/src/utils/README.md](../webagent-core/agent-host/src/utils/README.md) | 已核对一致 | cd1253b17687857e | 本机控制面、WS、共享请求/严格UTF8/有界diff及事件脱敏范围与F62/64后源码匹配。 依据：utils对应模块及相关控制面/预算/网络回归 |
| [webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md](../webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md) | 已修正 | ec3b98c13d4005c7 | 诊断/追踪/失败判定和浏览器各函数对照；把F42“本地无Chromium”限定为当时事实，补F62后本地套件实际运行，仍非用户实机。 依据：hostDiagnostics/toolTrace/isToolFailure/workbench.browser; F62–65记录 |
| [webagent-core/agent-host/src/utils/事件总线详解.md](../webagent-core/agent-host/src/utils/事件总线详解.md) | 已修正 | a0f3df6b2ce01e5c | 修bridgeEpoch不另randomUUID的旧描述；核对raw与脱敏副本、500日志/32WS/30min、独立100完成记录/Tasks和reset，不保证慢客户端总内存有界。 依据：eventBus.js; config; eventBus/taskProgress |
| [webagent-core/agent-host/src/utils/函数详解.md](../webagent-core/agent-host/src/utils/函数详解.md) | 已核对一致 | 76f35e69573a33d7 | 核对scope/共享reader/fetchFn与单调deadline、严格文本BOM/CRLF/上限及workspaceBinding；区分传输解码/文件解码和合作取消。 依据：requestScope/boundedFile/workspaceBinding; F62/64与对应回归 |
| [webagent-core/agent-host/src/utils/受控工具与工作流详解.md](../webagent-core/agent-host/src/utils/受控工具与工作流详解.md) | 已核对一致 | d82ebae6fbf4a2c2 | 审批状态/容量/结果分层、HTTP/stdio/public HTTPS、工作流引用/前后条件、connectionCheck及operations页代次和不重放与现实现一致；真实第三方/OS沙箱不代验。 依据：operatorQueue/externalClient/workflows/stdio/connectionCheck/operations; 对应回归与函数登记 |
| [webagent-core/agent-host/src/utils/差异展示详解.md](../webagent-core/agent-host/src/utils/差异展示详解.md) | 已核对一致 | 426223f4a54b2ee2 | 单次structuredPatch计数、1MiB/2万行/100ms/4000编辑/256KiB及新建写前预检与代码一致。 依据：utils/diff.js; patchEngine; diffBudget |
| [webagent-core/agent-host/src/utils/执行控制详解.md](../webagent-core/agent-host/src/utils/执行控制详解.md) | 已核对一致 | 89a3261da6fd799d | 模式租约、四权限依赖/持久化/修订、后台/审批/PTY/stdio屏障与远端限定准确，未扩大为OS/本机人工隔离。 依据：executionControl.js及调用点; executionControl.test.js |
| [webagent-core/agent-host/src/utils/控制面与Origin详解.md](../webagent-core/agent-host/src/utils/控制面与Origin详解.md) | 已核对一致 | d34281cf6f25c6e6 | 入口顺序、回环Host/socket/隧道、Origin与Referer兼容、MCP双响应头与权限独立匹配；真实代理和全面CSRF仍非认证。 依据：localControl/corsAllow/index; auditControl/corsAllow |
| [webagent-core/agent-host/src/utils/编辑回退详解.md](../webagent-core/agent-host/src/utils/编辑回退详解.md) | 已核对一致 | fd0c59d4ec1f5014 | 核对经典16项/15min/64KiB、检查点8×12/256KiB/一次ticket、全预检及部分unknown、readback与UI消费；无自动/全项目回滚。 依据：editorUndo/fileCheckpoints; apiFiles/fileCheckpoints/editorRuntime |
| [webagent-core/agent-host/src/入口详解.md](../webagent-core/agent-host/src/入口详解.md) | 已修正 | 8d6a679f24bcbeef | 消除第1步已优先检查根却又说不能保证先检查的旧矛盾；核对装配/监听错误/健康/WS/shutdown8秒边界。 依据：src/index.js; workspaceEntry/httpSmoke/skipWorkbench |
| [webagent-core/agent-host/src/运行配置详解.md](../webagent-core/agent-host/src/运行配置详解.md) | 已核对一致 | e62dfc8755d52982 | 默认端口/根/版本/随机与持久身份、先保存再轮换和错误传播同实现；不重写用户配置。 依据：config.js; extensionVersion.js; hostPersist/auditStorage |
| [webagent-core/agent-host/tests/Chat模型与图像测试详解.md](../webagent-core/agent-host/tests/Chat模型与图像测试详解.md) | 已核对一致 | 035550b741d88456 | runChat/modelLifecycle/chatVision/toolLabel各fixture、失败/预算/图片边界与当前测试对应。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md](../webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md) | 已核对一致 | dcd2ba39c1300ee2 | 协议/HTTP/容量/审批等测试入口和隔离边界匹配，未把真实服务代入。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/OAuth与GitHub测试详解.md](../webagent-core/agent-host/tests/OAuth与GitHub测试详解.md) | 已核对一致 | 82ca8fb3a67fd8e0 | OAuth/GitHub及F64真实回环网络、假凭据/取消/形状/期限证据与测试对应。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/PTY与隧道测试详解.md](../webagent-core/agent-host/tests/PTY与隧道测试详解.md) | 已核对一致 | 5df52a13002f2307 | PTY真实子进程/取消、隧道fixture及平台边界、F64稳定E_TIMEOUT断言与现测试一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/README.md](../webagent-core/agent-host/tests/README.md) | 已核对一致 | b0c862da6919a0fa | 测试发现/分类/完整与浏览器分离、fixture/真实平台边界及当前新增回归导航完整；不写固定总数。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/fixtures/README.md](../webagent-core/agent-host/tests/fixtures/README.md) | 已核对一致 | f12a23987a0213b4 | 仅说明隔离测试夹具与非产品/非真实凭据边界，目录职责一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/任务板与事件流测试详解.md](../webagent-core/agent-host/tests/任务板与事件流测试详解.md) | 已核对一致 | 7641edbf28f33515 | board/mcpBoard/eventBus归属/持久化/脱敏/事件统计的fixture与现测试一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/存储完整性与预算测试详解.md](../webagent-core/agent-host/tests/存储完整性与预算测试详解.md) | 已核对一致 | bfbe0daf8ebd65c5 | state/resource/audit/usage及F62/F63文件/diff/admin负例已登记，故障注入不冒充实机。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/安装与运行器测试详解.md](../webagent-core/agent-host/tests/安装与运行器测试详解.md) | 已核对一致 | b10589b57d07f8e6 | runner/安装/扩展/code-server/app/F60/F65受控子进程与未真实下载安装边界一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/工作区与命令安全测试详解.md](../webagent-core/agent-host/tests/工作区与命令安全测试详解.md) | 已核对一致 | 0ccdf1e2d5a8c178 | 工具/路径/危险命令/Git工作区及夹具范围匹配，不称shell完整解析。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/文档守卫测试详解.md](../webagent-core/agent-host/tests/文档守卫测试详解.md) | 已核对一致 | 5b0449d4607a709a | 文档策略/质量/学习及F66新口径防回退与当前断言匹配，明确非语义认证。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/本机边界与跨站测试详解.md](../webagent-core/agent-host/tests/本机边界与跨站测试详解.md) | 已核对一致 | 2d74a89ce33e5044 | 回环Host/Origin/Referer/WS及真实HTTP/浏览器头范围与测试一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/模式画像与Plan测试详解.md](../webagent-core/agent-host/tests/模式画像与Plan测试详解.md) | 已核对一致 | ba7dfd66ace424fa | 模式/Provider/画像/Plan的替身与状态边界对应，不代真实模型。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/浏览器与Webview测试详解.md](../webagent-core/agent-host/tests/浏览器与Webview测试详解.md) | 已核对一致 | ba538bc0e852e707 | DOM/VM/真实Chromium入口、16+12状态及F63 admin三视口的范围与现套件一致。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/统计与文档测试详解.md](../webagent-core/agent-host/tests/统计与文档测试详解.md) | 已核对一致 | 1110bfaff29eadc8 | admin/docs构建/HTTP及F63完整性说明与测试对应；旧标题守卫已按F66更正。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/agent-host/tests/补丁与编辑API测试详解.md](../webagent-core/agent-host/tests/补丁与编辑API测试详解.md) | 已核对一致 | cdd29c8b016917cf | patch/search/files/undo/checkpoint真实临时磁盘与HTTP断言及非事务边界匹配。 依据：documentationLearning具名函数/主说明守卫；本轮完整101/101；相应定向测试。 |
| [webagent-core/extension/PTY扩展详解.md](../webagent-core/extension/PTY扩展详解.md) | 已修正 | b61aa75436eb3a79 | 核对审批/工作区/两后端/输出背压/取消/策略；将两个仅在正本成立的相对链接改为仓库路径文本，使同步副本不再含已知坏链接。 依据：ptyHost/ptyPolicy/dangerousPolicy; ptyLifecycle; 全200 Markdown链接扫描 |
| [webagent-core/extension/README.md](../webagent-core/extension/README.md) | 已修正 | 2bbe05a9ddc26344 | 修旧5JS数量/漏列策略与草稿模块，明确有默认配置值时环境URL不会覆盖；入口/PTY/版本/副本范围已对照。 依据：extension文件/package/activate/agentHostUrl; 既有扩展回归 |
| [webagent-core/extension/resources/README.md](../webagent-core/extension/resources/README.md) | 已核对一致 | 0d1d888d4b5b0bb1 | 静态SVG用途/相对引用与副本同步匹配，没有业务执行承诺。 依据：icon.svg/package/extensionCopy |
| [webagent-core/extension/入口与Webview详解.md](../webagent-core/extension/入口与Webview详解.md) | 已修正 | 6de557a94ec58d31 | 修Bridge.refresh已有HTTP检查/单飞、control消息白名单、5命令注册与workspaceSnapshot实体，核对流/身份/草稿恢复及预算；真实IDE仍未代验。 依据：extension.js; package.json; editorReview; nativeRotation/webviewRuntime/extensionCopy |
| [webagent-core/extensions-installed/README.md](../webagent-core/extensions-installed/README.md) | 已修正 | aa74655c9952f39d | 该根README为人工说明而非自动生成内容；补完整复制范围/根README例外、动态版本与入口，去固定gitignore行号。 依据：ensure-code-server.syncExtension; install-desktop-extension.copyTree; extensionCopy |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md) | 生成核验 | b61aa75436eb3a79 | source-index由check-docs生成核验；扩展Markdown按规范源码与整个发行文件集合逐字节比较，不手改副本。 依据：check-docs updated=0; extensionCopy.test.js通过 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md) | 生成核验 | 0d1d888d4b5b0bb1 | source-index由check-docs生成核验；扩展Markdown按规范源码与整个发行文件集合逐字节比较，不手改副本。 依据：check-docs updated=0; extensionCopy.test.js通过 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md) | 生成核验 | 6de557a94ec58d31 | source-index由check-docs生成核验；扩展Markdown按规范源码与整个发行文件集合逐字节比较，不手改副本。 依据：check-docs updated=0; extensionCopy.test.js通过 |
| [webagent-core/probe-extension/README.md](../webagent-core/probe-extension/README.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [webagent-core/probe-extension/实现详解.md](../webagent-core/probe-extension/实现详解.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [webagent-core/probe-extension/浏览器整合说明.md](../webagent-core/probe-extension/浏览器整合说明.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [webagent-core/scripts/README.md](../webagent-core/scripts/README.md) | 已核对一致 | fe267f7f3f28b7a8 | 四模块、用户runtime/口令、120/180准备、15秒health和直接child收尾/不重放范围一致。 依据：scripts四模块; installer/preparation.js; F65回归 |
| [webagent-core/scripts/编辑器编排详解.md](../webagent-core/scripts/编辑器编排详解.md) | 已核对一致 | 5bd5eb2835bfc4e5 | 实际准备/密码/健康/服务器收尾/副本安装函数与F65一致；明确安装版userData覆盖、无总硬实时/全后代保证。 依据：scripts四模块; preparation; codeServerLifecycle/extensionCopy |
| [webagent-core/workbench/README.md](../webagent-core/workbench/README.md) | 已修正 | 8d01518916223d21 | 修boot先WS/活动轮询再HTTP/CDN的真实顺序；编辑/模型/坏流/轻量界面与当前功能边界一致。 依据：workbench/app.js; chat/tabs/monaco; 浏览器/VM回归 |
| [webagent-core/workbench/js/Bridge与设置详解.md](../webagent-core/workbench/js/Bridge与设置详解.md) | 已修正 | d307c380acad18de | 统一prompt空值不回退、远程Tasks先绘、累计完成数文案与原生已有回归；核对启停/轮换/设置/Skill的代次、预算、确认与未知语义。 依据：bridge.js; settings.js; F31–43/51实现回归 |
| [webagent-core/workbench/js/README.md](../webagent-core/workbench/js/README.md) | 已核对一致 | f24e878cabc1ea24 | 模块注册/分工、状态与写入消费、角色/草稿/审批隔离和测试边界匹配；不等于后端授权。 依据：workbench各模块exports/UI接线; 现有工作台回归 |
| [webagent-core/workbench/js/交互绑定详解.md](../webagent-core/workbench/js/交互绑定详解.md) | 已修正 | ef284880bdac07b2 | 核对控件ID/模式/身份代次/写入确认/配置与文件动作，补预览/回退、清轮hash及页面customBusy已有单飞，非跨窗口事务。 依据：bind.js; settings.js; tabs.js; workbenchRuntime/editorRuntime |
| [webagent-core/workbench/js/启动与Chat详解.md](../webagent-core/workbench/js/启动与Chat详解.md) | 已修正 | cabd73406feac7fd | 修paintTodos旧的两面绘制描述，核对先WS、3秒活动、严格NDJSON/字节/UTF8/唯一done/取消及补丁重读流程。 依据：app.js; chat.js; workbenchRuntime/真实浏览器 |
| [webagent-core/workbench/js/状态与编辑器详解.md](../webagent-core/workbench/js/状态与编辑器详解.md) | 已核对一致 | 5732bc6e058074ee | 对照标签/模型/草稿/预览回退、7秒0.52.2Monaco迟到升级、picker/DOM模式与预算；真实卸载/IME/DPI不代验。 依据：state/dom/tabs/monaco/picker.js; editorRuntime等 |
| [webagent-core/workbench/样式规则详解.md](../webagent-core/workbench/样式规则详解.md) | 已修正 | 36adfc1be705960f | 核对变量/选择器/700与980断点/焦点/本地滚动及主题；去过期的可选axe说法，默认开发门禁真实存在。 依据：styles.css; DOM/HTML; workbench.browser/HTML |
| [webagent-core/workbench/页面结构详解.md](../webagent-core/workbench/页面结构详解.md) | 已修正 | e7be58e88f1ec084 | 核对页面/表单/ARIA/脚本/控件入口，修未同步统计应为—、文件菜单动作；未实施全读屏/桌面验收。 依据：index.html; app/bind/tabs; workbenchHtml/Runtime |
| [webagent-repro/README.md](../webagent-repro/README.md) | 历史保留 | 64dae4453a269b66 | 首部明确冻结/不要运行、主线入口及旧说明适用范围；未执行或改JS，不把旧端口/工具清单套到现产品。 依据：README冻结声明; 主线启动路径 |
| [使用指南.md](../使用指南.md) | 已修正 | 114c97741b699aac | 核对入口/安装/模型/Bridge/工具/恢复/审批主要流程；修Clear log/hash、本机Chat与远端ACL、Ask/Plan元数据、地址重核及已交付原生重置。诊断专项段只保留既有边界，不接手暂停源码；实机不代签。 依据：launcher/appWindow; tools/index/readCache; api/routes; executionControl; F62–65实现与测试 |
| [启动脚本说明.md](../启动脚本说明.md) | 已修正 | b7a0740059d0f6f3 | 核对CMD模式/相对路径/端口；补可配置app端口、主机身份/工作区/IPC核对，不只看healthz。 依据：root CMD/sh; installer/launch.js; appWindow.js |
| [探针入口与实际可用范围.md](../探针入口与实际可用范围.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [探针完整整合实施与验收.md](../探针完整整合实施与验收.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |
| [探针能力对照与迁移边界.md](../探针能力对照与迁移边界.md) | 暂停 | 未读正文 | 沿用用户完全暂停的专项边界，仅登记路径/大小，不读正文、不认证最新。 依据：manager/agents.md暂停约定 |

## 非Markdown附随边界（不计本轮分母）

| 文件 | 原边界记录 | 原指纹 | 说明 |
|---|---|---|---|
| [LICENSE](../LICENSE) | 待逐句核对 | 5aff5a5a5928fe3e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| `review/step5-tests.txt` | 原始证据，受限 | 不读取正文 | 不读取/改写个人路径和原始失败，核查归属与保留 |
| [review/archive/web_agent提示词-修正版-纯净.txt](archive/web_agent提示词-修正版-纯净.txt) | 原始证据，受限 | 799bc9a80abb23a5 | F54逐句读取为用户任务/边界证据，不改写，不把其中对照断言直接当审查结论 |
| [webagent-core/probe-extension/LICENSE](../webagent-core/probe-extension/LICENSE) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |

## 既有批次证据（历史，不作当前待办）

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
- F54（首轮独立复审记录，后续修复见阶段10）：新增[独立报告](INDEPENDENT_AUDIT_2026-09-20.md)与3份UI截图，真实文件/HTTP/完整主机/原生函数/浏览器复现patch、RPC准入/批内ID、busy会话驱逐、资源归属/ACL、原生坏流终态、窄屏/ARIA缺口；只改相邻错误说明/管理/生成物，未修产品或加入正式回归。基线50c03be本地84/84、既有Chromium套件与CI35470787917九job通过；静态扫描不授语义通过。ShunCode只读未运行，优先借鉴busy pin和整批ID预检，自适应/重放暂缓、不换文件工具。用户再次确认探针原分工暂停。清单200→201，新增报告待逐句，已逐句仍8、局部56、待79。具体基线证据与边界见报告。当前第一批会话pin/全忙拒绝/完成后空闲TTL/双向SID校验已交付；第二批又补RPC envelope/协商版本/64项与批内ID预检/通知202及真实HTTP零写回归；第三批补缺失目标hash/新建块拒绝并保留已有文件多块；第四批补资源caller/ACL与机器重试指引；其余缺陷未关闭，见阶段10修复续记。

- F55：从用户更正的01a0bfa9来源67f4f96快进接手，独立HTTP/VM/Chromium红测后修MCP响应头、经典Chat终态/预算/清理，以及文档站键盘/过期跳转/窄屏导航/代码溢出和日志滚动。对应段与新增默认axe门禁、中文截图局部核对；首轮93/94仅新增compact说明漏登记，最终门禁见阶段10。下面受影响说明转局部，已逐句仍8，探针专项暂停；不是全部语言/全仓逐句完成。

- F56：重连后核实036d65b的CI35632714383九job成功。实际HTTP静默连接/预先取消及真实Node启动失败遗留三红测后修run-code-oss总期限、单次停止与有界直接子进程收尾；新增28个分层场景。本地95/95、扩充Chromium和audit 0；提交/精确CI见阶段10。七份相关说明由待转局部，整篇仍8；未安装code-server、不把直接子进程退出扩大为全部后代/窗口/PID复用通过。
