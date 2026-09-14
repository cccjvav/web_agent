# 过程审查（不是产品指南）

**最新进展（2026-09-14）**：用户第5/6步已报告通过，第7步待复验。经典工作台空内置模型、菜单越界和主题问题已修复；按授权收敛为轻量界面并保留认证Bridge。代码/浏览器证据见CURRENT_AUDIT，重启复验见根目录Windows新手逐步验收。

给审查助手和后来改本仓的人看的记录，**不是**使用说明书。怎么安装、怎么开 Bridge，仍看仓库根 [使用指南.md](../使用指南.md)。

| 文件 | 留它当… |
|---|---|
| [CURRENT_AUDIT.md](CURRENT_AUDIT.md) | 本轮统一结论：逐项处置、验证证据、保留边界与产品决策 |
| [AUDIT_ROUND3_2026-09-13.md](AUDIT_ROUND3_2026-09-13.md) | 原第三份报告＋文末逐批施工记录；最终处置看CURRENT_AUDIT，原文不视为全部属实 |
| [AUDIT_2026-09-13.md](AUDIT_2026-09-13.md) | 第二份外部审查原文，已逐项处置，结论看CURRENT_AUDIT |
| [01a08d85-web-agent-audit.md](01a08d85-web-agent-audit.md) | 第一份外部审查，含过时判断，保留来源不直接执行建议 |
| [step5-tests.txt](step5-tests.txt) | 用户Windows Node24的3/52失败原始证据，可能含个人路径，勿公开转发 |
| [AUDIT_CROSSCHECK_2026-09-11.md](./AUDIT_CROSSCHECK_2026-09-11.md) | 前轮历史台账：外部35项发现及旧F/X处理证据；当前状态见CURRENT_AUDIT |
| [REPORT_v5.md](./REPORT_v5.md) | 历史验收：V4-1 / V3-2 / V3-4 已闭环，当时无新缺陷 |
| [REPORT_v6.md](./REPORT_v6.md) | 拆模块建议（可选备忘）。**没有**当成施工任务跑；贴桥不靠拆文件 |
| [CHECKLIST_WINDOWS.md](./CHECKLIST_WINDOWS.md) | Windows 真机验收**唯一活基线**（A/B 继承项 + D1–D13，含阶段 6 任务板） |
| [PROMPT.md](./PROMPT.md) | 审查助手用过的提示词；文首有 1–10 完成对照 |
| [PROMPT_SHUNCODE.md](./PROMPT_SHUNCODE.md) | 往 ShunCode「本机助手」对齐（第一阶段=本机 Chat 看图）。不是产品指南 |
| [REPORT.md](./REPORT.md) … [REPORT_v4.md](./REPORT_v4.md) | 更早几轮发现与验收，查历史用 |
| [REPORT_SHUNCODE_S1.md](./REPORT_SHUNCODE_S1.md) … [S4](./REPORT_SHUNCODE_S4.md) | ShunCode 对齐四阶段交付报告（S4 含真机清单并入说明） |
| [shuncode-ui/](./shuncode-ui/README.md) | 参考产品截图索引（25 图 + 命名归属约定 + 技术栈取证） |
| [REPORT_FULLAUDIT_2026-09-08.md](./REPORT_FULLAUDIT_2026-09-08.md) | 全面检查（发现制；F1–F6 已修见后续提交） |

根目录不再堆这些文件。v6 第四节的六批拆分默认不做。

根目录[早期审查](../project_audit_report.md)保留为历史。两份代码级文档新旧方案已被[现行文档维护规范](../manager/docs/documentation.md)取代，2026-09-14经用户同意删除，可从Git历史追溯；外部审查原文、测试证据和授权记录仍保留。最终处置统一在CURRENT_AUDIT，第三轮文末保留施工过程。
