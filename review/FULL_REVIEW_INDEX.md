# 正式全仓逐句审查：逐文件清单

用户2026-09-17明确两项并行任务：继续剩余待办；正式全仓逐句审查。这里记录逐文件覆盖，不是另一份产品指南，也不替代[路线图](../交接与路线图.md)或[发现与证据台账](SEMANTIC_REVIEW_2026-09-16.md)。

## 审查标准

1. 每个段落、表格行、步骤、示例和能力承诺逐句核对：入口/默认值、调用链、磁盘和网络副作用、权限、失败/取消/并发、平台与实际证据。
2. 发现错误直接改正文；发现实现缺陷先复现并补回归，再最小修复。过期无用正文退役，历史授权/失败证据保留。
3. “已读、有问题”“局部核对”“已逐句核对”“暂停”“历史/生成边界”分别记录；目录生成、全文读取或测试绿灯都不等同于逐句通过。
4. 审过的正文或依赖实现再改动，须复核受影响句子；hash只是快照定位，不是认证算法。当前修改和测试证据见第27组。
5. 范围从Git真实文件枚举Markdown/MDX/RST/AsciiDoc/TXT及LICENSE/NOTICE/COPYING，不读忽略的秘密/用户数据、不复制依赖目录。源码注释、HTML/CSS/配置/脚本的语义仍依[源码清单](../docs-site/source-index.md)逐模块对照，不因没有Markdown而漏掉；第三方/冻结/生成项明确边界而非悄悄删分母。

## 首批证据与下一步

- F27-01：逐句核对docs三级导航，实际目录为11篇用户专题与8篇开发专题；路径/归放/暂停/非全审承诺准确，链接守卫验证实际目标。
- F27-02：第28组已修跨端矛盾。DeepSeek/Chat Plus卡片改为unverified及三个null未知字段，移除未经验证的固定安装/站点/订阅保证；UI徽标、DeepSeek指引、复制提示、规则前言及MCP资源同步，VM/协议/HTTP回归通过。两篇专题逐句复核，不认证第三方兼容性；本批精确提交CI九项通过，证据见现行台账，未认证外部服务。
- F28-01：第29组对照registerClient/validateAuthorize与消费者，已修通用/OAuth候选未知状态、固定厂商菜单/订阅保证及配对码专属文案；保留规范/mcp与PKCE。另修unsupported卡片空prompt回退全局连接文本的问题。VM/协议/HTTP回归，不代表第三方兼容或整份OAuth安全实现通过。
- F29-01：交接与管理职责收拢，根只导航，manager/ROADMAP唯一维护工作包；CONTEXT摘要、stages证据、审查清单覆盖各司其职。原待办与历史失败未删除。其余API/状态刷新、OAuth实现深审仍未闭环。
- F27-03：设置文档模型选择/多模型保存段与settings.js、bind.js、POST /models对照；统一成功判断、页内互斥、超时/未知效果、成功保存与刷新失败分离，VM回归；不是全部API/工作流审完。

## 逐文件状态

基线为2f569c24b385ba58e0cd41229468878e2ff39a41后的本次工作区；本清单自身属于维护索引，不自我授予语义通过。新文件须登记；历史先前批次仅作证据，未自动标为本轮完成。

当前条目数：199（原198，加管理路线）；状态：待逐句核对 133、暂停，只登记路径 15、生成定位，非语义认证 1、已逐句核对 5、待边界核对 7、只读规范副本 1、待历史定位核对 33、原始证据，受限 1、局部核对 3。这是文件计数，不是语义准确率。

| 文件 | 状态 | SHA-256前16位 | 依据/下一动作 |
|---|---|---|---|
| [.config/code-server/README.md](../.config/code-server/README.md) | 待逐句核对 | 488ad9897d5593bb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.github/workflows/README.md](../.github/workflows/README.md) | 待逐句核对 | 7558f1b569cd357d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/commit-now/SKILL.md](../.webagent/skills/commit-now/SKILL.md) | 待逐句核对 | 579a602c15977541 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/docs-sync/SKILL.md](../.webagent/skills/docs-sync/SKILL.md) | 待逐句核对 | 417415f762f03599 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/README.md](../.webagent/skills/evidence-check/README.md) | 待逐句核对 | 3cc3038c2dbec215 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/SKILL.md](../.webagent/skills/evidence-check/SKILL.md) | 待逐句核对 | 9fdfadcf9f89d83e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/evidence-check/references/checklist.md](../.webagent/skills/evidence-check/references/checklist.md) | 待逐句核对 | 8e07e93c431a3c2b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/fix-tests/SKILL.md](../.webagent/skills/fix-tests/SKILL.md) | 待逐句核对 | bc401dc72aada5ae | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [.webagent/skills/review/SKILL.md](../.webagent/skills/review/SKILL.md) | 待逐句核对 | d30d72094e8aa2e2 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [AGENTS.md](../AGENTS.md) | 待逐句核对 | bb0872845a7a3d6e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | 待逐句核对 | 1a54f3466ead86dd | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [LICENSE](../LICENSE) | 待逐句核对 | 5aff5a5a5928fe3e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [README.md](../README.md) | 待逐句核对 | b3f6f4e1bfd41996 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [SECURITY.md](../SECURITY.md) | 待逐句核对 | 5329435edae22a5e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [arena-model-probe/README-PYTHON.md](../arena-model-probe/README-PYTHON.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-model-probe/README.md](../arena-model-probe/README.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-model-probe/TRANSPORT_REVIEW.md](../arena-model-probe/TRANSPORT_REVIEW.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-trace-inspector/README.md](../arena-trace-inspector/README.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [arena-trace-inspector/安装教程.md](../arena-trace-inspector/安装教程.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [bin/README.md](../bin/README.md) | 待逐句核对 | 1d178ba60794c1ff | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/SKILL.md](../computer-use/SKILL.md) | 待逐句核对 | 106cb36f2a71ea3e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/README.md](../computer-use/win/README.md) | 待逐句核对 | af270f2624b459c1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/截图标记与OCR详解.md](../computer-use/win/截图标记与OCR详解.md) | 待逐句核对 | 1deb2309a14f2568 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [computer-use/win/鼠标键盘与剪贴板详解.md](../computer-use/win/鼠标键盘与剪贴板详解.md) | 待逐句核对 | 2f5dba67bb07f984 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/README.md](../docs-site/README.md) | 待逐句核对 | 72c6c3ae4ad1d781 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/source-index.md](../docs-site/source-index.md) | 生成定位，非语义认证 | 1223b7681c67deca | 检查生成一致性，逐函数含义另查主说明 |
| [docs-site/样式规则详解.md](../docs-site/样式规则详解.md) | 待逐句核对 | 294d6015d16c6b6e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/浏览与服务详解.md](../docs-site/浏览与服务详解.md) | 待逐句核对 | 2e72d034f06c6f91 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs-site/清单与构建详解.md](../docs-site/清单与构建详解.md) | 待逐句核对 | 63b60e93bb1c59ca | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/README.md](../docs/README.md) | 已逐句核对 | fce319adaa09b3b2 | F27-01：目录/归放规则/边界与实际路径一致 |
| [docs/development/README.md](../docs/development/README.md) | 已逐句核对 | b9a092f0d812f978 | F27-01：目录/归放规则/边界与实际路径一致 |
| [docs/development/代码复盘指南.md](../docs/development/代码复盘指南.md) | 待逐句核对 | 616d7a10f8e77b1a | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/借鉴优化说明（新手版）.md](../docs/development/借鉴优化说明（新手版）.md) | 待逐句核对 | 9ebe206b9422dcac | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/平台启动与CI详解.md](../docs/development/平台启动与CI详解.md) | 待逐句核对 | 971b7af5bd95712d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/总览.md](../docs/development/总览.md) | 待逐句核对 | f21bb595dea9d6c6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/技术实现.md](../docs/development/技术实现.md) | 待逐句核对 | 73bdc67d0ea73694 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/架构导读.md](../docs/development/架构导读.md) | 待逐句核对 | acfe99744992d411 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/测试说明.md](../docs/development/测试说明.md) | 待逐句核对 | 2a8cd9d6c5785611 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/development/组件说明.md](../docs/development/组件说明.md) | 待逐句核对 | b2e996c12fc2a5e8 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge任务栏说明.md](../docs/guides/Bridge任务栏说明.md) | 待逐句核对 | 1415ed7cbc71ad12 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge权限与工作模式.md](../docs/guides/Bridge权限与工作模式.md) | 待逐句核对 | 939f1e237de312b3 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Bridge统计与刷新排查.md](../docs/guides/Bridge统计与刷新排查.md) | 待逐句核对 | 2b8db632d81b0cab | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/Conda环境说明.md](../docs/guides/Conda环境说明.md) | 待逐句核对 | 563f5c01a267970b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [docs/guides/README.md](../docs/guides/README.md) | 已逐句核对 | 093ab012b5f2b622 | F27-01：目录/归放规则/边界与实际路径一致 |
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
| [manager/CONTEXT.md](../manager/CONTEXT.md) | 待逐句核对 | 383b9d051f69a181 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/SKILL.md](../manager/SKILL.md) | 只读规范副本 | 5c8c93d50e52332b | 只核对引用与适用范围，不修改技能副本 |
| [manager/agents.md](../manager/agents.md) | 待逐句核对 | 0e15bb59ab4f5cae | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/docs/documentation.md](../manager/docs/documentation.md) | 待逐句核对 | 5ca34800737d3d49 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/docs/experience.md](../manager/docs/experience.md) | 待逐句核对 | 24713b48c0b4fecb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [manager/stages/audit-2026-09-11.md](../manager/stages/audit-2026-09-11.md) | 待历史定位核对 | d6064bf51020b073 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/context-history-through-0.4.md](../manager/stages/context-history-through-0.4.md) | 待历史定位核对 | a4ccaf24eb17241b | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/documentation-2026-09-12.md](../manager/stages/documentation-2026-09-12.md) | 待历史定位核对 | c23c09e4b3615d99 | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/probe-dual-integration-2026-09-15.md](../manager/stages/probe-dual-integration-2026-09-15.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [manager/stages/s1-handoff.md](../manager/stages/s1-handoff.md) | 待历史定位核对 | cfc0e427dc08e55c | 核对归档/引用/证据，不将旧结论改成现状 |
| [manager/stages/s10-upstream-adoption.md](../manager/stages/s10-upstream-adoption.md) | 待历史定位核对 | aacba86fd296a3d2 | 核对归档/引用/证据，不将旧结论改成现状 |
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
| [review/CHECKLIST_WINDOWS.md](../review/CHECKLIST_WINDOWS.md) | 待逐句核对 | ab7353aa3ef02689 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/README.md](../review/README.md) | 待逐句核对 | 39b659a2cf479dd4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/SEMANTIC_REVIEW_2026-09-16.md](../review/SEMANTIC_REVIEW_2026-09-16.md) | 待逐句核对 | 444d068d2e37a267 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/UPSTREAM_ADOPTION_MAP_2026-09-15.md](../review/UPSTREAM_ADOPTION_MAP_2026-09-15.md) | 待逐句核对 | e454a1ff6891f7bc | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [review/archive/01a08d85-web-agent-audit.md](../review/archive/01a08d85-web-agent-audit.md) | 待历史定位核对 | ace0ab3d1b1d6f53 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/ARENA_PROBE_INTEGRATION_2026-09-15.md](../review/archive/ARENA_PROBE_INTEGRATION_2026-09-15.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [review/archive/AUDIT_2026-09-13.md](../review/archive/AUDIT_2026-09-13.md) | 待历史定位核对 | 7eca81ed28754f90 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/AUDIT_CROSSCHECK_2026-09-11.md](../review/archive/AUDIT_CROSSCHECK_2026-09-11.md) | 待历史定位核对 | 21c1ef3d2ac0ce23 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/AUDIT_ROUND3_2026-09-13.md](../review/archive/AUDIT_ROUND3_2026-09-13.md) | 待历史定位核对 | 5fab78e4f0abc149 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/CURRENT_AUDIT_2026-09-15.md](../review/archive/CURRENT_AUDIT_2026-09-15.md) | 待历史定位核对 | 45a0b7f2e7884abd | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/DOC_QUALITY_2026-09-12.md](../review/archive/DOC_QUALITY_2026-09-12.md) | 待历史定位核对 | 59f73e57c57c2e36 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/PROMPT_SHUNCODE.md](../review/archive/PROMPT_SHUNCODE.md) | 待历史定位核对 | a5dd710f0212f9e5 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/README.md](../review/archive/README.md) | 待历史定位核对 | f279d0bc2ee211a0 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REFERENCE_ARENA_AGENT_2026-09-15.md](../review/archive/REFERENCE_ARENA_AGENT_2026-09-15.md) | 待历史定位核对 | 440ba3bac277e9e4 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT.md](../review/archive/REPORT.md) | 待历史定位核对 | 360302d9ff5c88e3 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_FULLAUDIT_2026-09-08.md](../review/archive/REPORT_FULLAUDIT_2026-09-08.md) | 待历史定位核对 | 345f07d14d87a99d | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S1.md](../review/archive/REPORT_SHUNCODE_S1.md) | 待历史定位核对 | edebdd55cbacde97 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S2.md](../review/archive/REPORT_SHUNCODE_S2.md) | 待历史定位核对 | a04c9e4ae53f8358 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S3.md](../review/archive/REPORT_SHUNCODE_S3.md) | 待历史定位核对 | 6b69c19b35209183 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_SHUNCODE_S4.md](../review/archive/REPORT_SHUNCODE_S4.md) | 待历史定位核对 | e1974aff781823eb | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v2.md](../review/archive/REPORT_v2.md) | 待历史定位核对 | 48db8b9fffa92e8a | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v3.md](../review/archive/REPORT_v3.md) | 待历史定位核对 | 5b7e77eaa61b928c | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v4.md](../review/archive/REPORT_v4.md) | 待历史定位核对 | 89e715a5aefa1bbc | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v5.md](../review/archive/REPORT_v5.md) | 待历史定位核对 | b07945725868f586 | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/REPORT_v6.md](../review/archive/REPORT_v6.md) | 待历史定位核对 | 2282f9b2a5373d3f | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/archive/SEMANTIC_BATCHES_01_15_2026-09-16.md](../review/archive/SEMANTIC_BATCHES_01_15_2026-09-16.md) | 待历史定位核对 | ef0de062d90e338f | 核对归档/引用/证据，不将旧结论改成现状 |
| [review/shuncode-ui/README.md](../review/shuncode-ui/README.md) | 待逐句核对 | d0fe77f07fab6f11 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| `review/step5-tests.txt` | 原始证据，受限 | 不读取正文 | 不读取/改写个人路径和原始失败，核查归属与保留 |
| [webagent-core/README.md](../webagent-core/README.md) | 待逐句核对 | ecfd98d990a19163 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/admin-host/README.md](../webagent-core/admin-host/README.md) | 待逐句核对 | debfb2fbc9ef4eea | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/admin-host/统计服务详解.md](../webagent-core/admin-host/统计服务详解.md) | 待逐句核对 | 211b9659f879e40b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/README.md](../webagent-core/agent-host/README.md) | 待逐句核对 | 37629c9e85eaf2c0 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/scripts/README.md](../webagent-core/agent-host/scripts/README.md) | 待逐句核对 | 5bba04de80773ff6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/scripts/运行器详解.md](../webagent-core/agent-host/scripts/运行器详解.md) | 待逐句核对 | 592c3004e0bc1673 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/README.md](../webagent-core/agent-host/src/README.md) | 待逐句核对 | 52890254feb29269 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/agent/Chat调度详解.md](../webagent-core/agent-host/src/agent/Chat调度详解.md) | 待逐句核对 | 9b6af3b8d4bd6259 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/agent/README.md](../webagent-core/agent-host/src/agent/README.md) | 待逐句核对 | 0b819265ea31f315 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/agent/模型调用详解.md](../webagent-core/agent-host/src/agent/模型调用详解.md) | 待逐句核对 | 2f0b95f09d983190 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/api/README.md](../webagent-core/agent-host/src/api/README.md) | 待逐句核对 | c84a96775eeb7d46 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/api/路由逐项详解.md](../webagent-core/agent-host/src/api/路由逐项详解.md) | 待逐句核对 | c53dfb341b32720b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/auth/GitHub身份详解.md](../webagent-core/agent-host/src/auth/GitHub身份详解.md) | 待逐句核对 | 8beb37193d9e8e38 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/auth/README.md](../webagent-core/agent-host/src/auth/README.md) | 待逐句核对 | 73967febc3ec9506 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/OAuth授权详解.md](../webagent-core/agent-host/src/mcp/OAuth授权详解.md) | 待逐句核对 | fa8899aa2185e898 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/README.md](../webagent-core/agent-host/src/mcp/README.md) | 待逐句核对 | d585534c9d3869c3 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/会话与结果详解.md](../webagent-core/agent-host/src/mcp/会话与结果详解.md) | 待逐句核对 | bd09d07886a550b8 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/公网出站详解.md](../webagent-core/agent-host/src/mcp/公网出站详解.md) | 待逐句核对 | 1b892e6459f27979 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/请求分发详解.md](../webagent-core/agent-host/src/mcp/请求分发详解.md) | 待逐句核对 | ff420c9dbaf0d4d4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/mcp/资源与客户端详解.md](../webagent-core/agent-host/src/mcp/资源与客户端详解.md) | 局部核对 | 4a0fdffed080e68c | F28：第三方卡片/三态资源/规则前言；其余资源与卡片待审 |
| [webagent-core/agent-host/src/models/README.md](../webagent-core/agent-host/src/models/README.md) | 待逐句核对 | 0fb2581c85b8d01d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/models/画像与记忆详解.md](../webagent-core/agent-host/src/models/画像与记忆详解.md) | 待逐句核对 | dd4fad1da5e31d80 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/models/配置存储详解.md](../webagent-core/agent-host/src/models/配置存储详解.md) | 待逐句核对 | fd8ac25586b827af | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/Plan状态详解.md](../webagent-core/agent-host/src/tools/Plan状态详解.md) | 待逐句核对 | 41b1274526eaa6ee | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/README.md](../webagent-core/agent-host/src/tools/README.md) | 待逐句核对 | 40922f5b91f461c1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/任务板与工作区详解.md](../webagent-core/agent-host/src/tools/任务板与工作区详解.md) | 待逐句核对 | 31700b0377ab42c7 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/命令与PTY详解.md](../webagent-core/agent-host/src/tools/命令与PTY详解.md) | 待逐句核对 | aeb7d20fbb656250 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/工具入口与命令策略详解.md](../webagent-core/agent-host/src/tools/工具入口与命令策略详解.md) | 待逐句核对 | 51aff54bc4ad24eb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/技能与隐藏规则详解.md](../webagent-core/agent-host/src/tools/技能与隐藏规则详解.md) | 待逐句核对 | a3087c1481326910 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/文件与搜索详解.md](../webagent-core/agent-host/src/tools/文件与搜索详解.md) | 待逐句核对 | 415ad7ece886d72d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/缓存与进度详解.md](../webagent-core/agent-host/src/tools/缓存与进度详解.md) | 待逐句核对 | fe2bb6da5ca852d3 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tools/补丁与路径详解.md](../webagent-core/agent-host/src/tools/补丁与路径详解.md) | 待逐句核对 | 020bcea09bb43763 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tunnel/README.md](../webagent-core/agent-host/src/tunnel/README.md) | 待逐句核对 | 24289f1b902c1aea | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tunnel/停止进程详解.md](../webagent-core/agent-host/src/tunnel/停止进程详解.md) | 待逐句核对 | a9bc461bf5f9629d | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/tunnel/隧道生命周期详解.md](../webagent-core/agent-host/src/tunnel/隧道生命周期详解.md) | 待逐句核对 | 8ec14204b6ad1276 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/usage/README.md](../webagent-core/agent-host/src/usage/README.md) | 待逐句核对 | 07c4af39ec8eb89c | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/usage/用量上报详解.md](../webagent-core/agent-host/src/usage/用量上报详解.md) | 待逐句核对 | e71286c5a4ef2560 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/README.md](../webagent-core/agent-host/src/utils/README.md) | 待逐句核对 | ec00d3f886e6de0c | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md](../webagent-core/agent-host/src/utils/主机诊断与调用追踪详解.md) | 待逐句核对 | 9854a29d8b3bf712 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/事件总线详解.md](../webagent-core/agent-host/src/utils/事件总线详解.md) | 待逐句核对 | f477dcc70d518fe1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/函数详解.md](../webagent-core/agent-host/src/utils/函数详解.md) | 待逐句核对 | 2f7cfa678bc04168 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/受控工具与工作流详解.md](../webagent-core/agent-host/src/utils/受控工具与工作流详解.md) | 待逐句核对 | 4e58884ef1f190e8 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/差异展示详解.md](../webagent-core/agent-host/src/utils/差异展示详解.md) | 待逐句核对 | 24a14ba502a09366 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/执行控制详解.md](../webagent-core/agent-host/src/utils/执行控制详解.md) | 待逐句核对 | 3f4660f3fc4f8b39 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/控制面与Origin详解.md](../webagent-core/agent-host/src/utils/控制面与Origin详解.md) | 待逐句核对 | 8ea3d616eec7d01c | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/utils/编辑回退详解.md](../webagent-core/agent-host/src/utils/编辑回退详解.md) | 待逐句核对 | 93d78d39dcc985d4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/入口详解.md](../webagent-core/agent-host/src/入口详解.md) | 待逐句核对 | 5faac9f426f7eddb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/src/运行配置详解.md](../webagent-core/agent-host/src/运行配置详解.md) | 待逐句核对 | e62dfc8755d52982 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/Chat模型与图像测试详解.md](../webagent-core/agent-host/tests/Chat模型与图像测试详解.md) | 待逐句核对 | 344935b4f029176b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md](../webagent-core/agent-host/tests/MCP协议与整机入口测试详解.md) | 待逐句核对 | 53b3d65903be991b | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/OAuth与GitHub测试详解.md](../webagent-core/agent-host/tests/OAuth与GitHub测试详解.md) | 待逐句核对 | 94a94a37ae6253d6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/PTY与隧道测试详解.md](../webagent-core/agent-host/tests/PTY与隧道测试详解.md) | 待逐句核对 | 3bc8ed6f63312fe9 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/README.md](../webagent-core/agent-host/tests/README.md) | 待逐句核对 | d58ba3539415cbe1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/fixtures/README.md](../webagent-core/agent-host/tests/fixtures/README.md) | 待逐句核对 | f12a23987a0213b4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/任务板与事件流测试详解.md](../webagent-core/agent-host/tests/任务板与事件流测试详解.md) | 待逐句核对 | 00ca46446aad70ae | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/存储完整性与预算测试详解.md](../webagent-core/agent-host/tests/存储完整性与预算测试详解.md) | 待逐句核对 | 7462f148bf3cb763 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/安装与运行器测试详解.md](../webagent-core/agent-host/tests/安装与运行器测试详解.md) | 待逐句核对 | 177b9c61b0d924b9 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/工作区与命令安全测试详解.md](../webagent-core/agent-host/tests/工作区与命令安全测试详解.md) | 待逐句核对 | 044f6ccc1bb136eb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/文档守卫测试详解.md](../webagent-core/agent-host/tests/文档守卫测试详解.md) | 待逐句核对 | dc4aeb1a8af40adb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/本机边界与跨站测试详解.md](../webagent-core/agent-host/tests/本机边界与跨站测试详解.md) | 待逐句核对 | 4dc0800d11be2533 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/模式画像与Plan测试详解.md](../webagent-core/agent-host/tests/模式画像与Plan测试详解.md) | 待逐句核对 | 57a2d6bd58938d94 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/浏览器与Webview测试详解.md](../webagent-core/agent-host/tests/浏览器与Webview测试详解.md) | 待逐句核对 | 914c77d9ed2454c3 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/统计与文档测试详解.md](../webagent-core/agent-host/tests/统计与文档测试详解.md) | 待逐句核对 | eae0ac61c526af18 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/agent-host/tests/补丁与编辑API测试详解.md](../webagent-core/agent-host/tests/补丁与编辑API测试详解.md) | 待逐句核对 | eacfb76fd87171f4 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extension/PTY扩展详解.md](../webagent-core/extension/PTY扩展详解.md) | 待逐句核对 | 326f33969dbf1704 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extension/README.md](../webagent-core/extension/README.md) | 待逐句核对 | dea73f53c5040790 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extension/resources/README.md](../webagent-core/extension/resources/README.md) | 待逐句核对 | 0d1d888d4b5b0bb1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extension/入口与Webview详解.md](../webagent-core/extension/入口与Webview详解.md) | 待逐句核对 | cb436127d898acfb | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/extensions-installed/README.md](../webagent-core/extensions-installed/README.md) | 待边界核对 | 73a4586246a63f1e | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/PTY扩展详解.md) | 待边界核对 | 326f33969dbf1704 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/resources/README.md) | 待边界核对 | 0d1d888d4b5b0bb1 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md](../webagent-core/extensions-installed/webagent.webagent-core-0.7.2/入口与Webview详解.md) | 待边界核对 | cb436127d898acfb | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [webagent-core/probe-extension/LICENSE](../webagent-core/probe-extension/LICENSE) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/README.md](../webagent-core/probe-extension/README.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/实现详解.md](../webagent-core/probe-extension/实现详解.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/probe-extension/浏览器整合说明.md](../webagent-core/probe-extension/浏览器整合说明.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [webagent-core/scripts/README.md](../webagent-core/scripts/README.md) | 待逐句核对 | cc9b3ed05acaba8e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/scripts/编辑器编排详解.md](../webagent-core/scripts/编辑器编排详解.md) | 待逐句核对 | 2799dc3c76bccb52 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/README.md](../webagent-core/workbench/README.md) | 待逐句核对 | bd6aa6866cb8cb32 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/js/Bridge与设置详解.md](../webagent-core/workbench/js/Bridge与设置详解.md) | 局部核对 | c5072a6d3de9a957 | F27-03：仅模型选择、多模型与定制保存段；其余待审 |
| [webagent-core/workbench/js/README.md](../webagent-core/workbench/js/README.md) | 待逐句核对 | 868e8ac660843ae1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/js/交互绑定详解.md](../webagent-core/workbench/js/交互绑定详解.md) | 局部核对 | c0ed55d2986e031e | F27-03：仅模型选择、多模型与定制保存段；其余待审 |
| [webagent-core/workbench/js/启动与Chat详解.md](../webagent-core/workbench/js/启动与Chat详解.md) | 待逐句核对 | 09bf0d599a296756 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/js/状态与编辑器详解.md](../webagent-core/workbench/js/状态与编辑器详解.md) | 待逐句核对 | d3f646fbe507694e | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/样式规则详解.md](../webagent-core/workbench/样式规则详解.md) | 待逐句核对 | 999054567aabb5e6 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-core/workbench/页面结构详解.md](../webagent-core/workbench/页面结构详解.md) | 待逐句核对 | e11fb7b1f5c360b1 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [webagent-repro/README.md](../webagent-repro/README.md) | 待边界核对 | 64dae4453a269b66 | 冻结原型/示例/发行副本，不冒称产品主线语义认证 |
| [交接与路线图.md](../交接与路线图.md) | 待逐句核对 | 6d905b51edbbd015 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [使用指南.md](../使用指南.md) | 待逐句核对 | c5aa5e3da03dc506 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [启动脚本说明.md](../启动脚本说明.md) | 待逐句核对 | 36b62ac2985e3f29 | 不继承旧批次整篇通过；逐句比对来源/失败/权限/平台 |
| [探针入口与实际可用范围.md](../探针入口与实际可用范围.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [探针完整整合实施与验收.md](../探针完整整合实施与验收.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [探针能力对照与迁移边界.md](../探针能力对照与迁移边界.md) | 暂停，只登记路径 | 不读取正文 | P：外部正式交接前不审实现或能力 |
| [manager/ROADMAP.md](../manager/ROADMAP.md) | 待逐句核对 | 695ad6f362e392c9 | F29：工作包迁入管理体系；结构迁移不授予全文认证 |
