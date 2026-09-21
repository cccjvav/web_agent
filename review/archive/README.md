# 历史审查归档

这里只保留必要的授权变更、隐私处置及旧提交/CI证据，不作为当前产品指南、待办或验收门槛。现状见[管理索引](../../manager/CONTEXT.md)，操作见[使用指南](../../使用指南.md)。已被现行指南完整吸收且没有独立证据价值的说明直接删除，Git历史仍可追溯，不另留空壳跳转文件。

- [早期探针接入记录](ARENA_PROBE_INTEGRATION_2026-09-15.md)：0.1–0.3范围调整和验证来源；不能把“只做连接诊断”或已关闭11.3恢复成当前要求。

- [三报告处置及旧CI](CURRENT_AUDIT_2026-09-15.md)：保存历史编号、误报判定与权限取舍。
- [上游定向源码审阅](REFERENCE_ARENA_AGENT_2026-09-15.md)：固定上游SHA的源码观察/许可证/风险区别，不是当前未实现清单。

- [第1–15组语义审查批次](SEMANTIC_BATCHES_01_15_2026-09-16.md)：原句/失败/精确CI的历史证据，现行状态已从时间线分离，不覆盖当前台账。

## 集中的旧报告

- [AUDIT_2026-09-13.md](AUDIT_2026-09-13.md)
- [PROMPT_SHUNCODE.md](PROMPT_SHUNCODE.md)
- [REPORT.md](REPORT.md)
- [REPORT_FULLAUDIT_2026-09-08.md](REPORT_FULLAUDIT_2026-09-08.md)
- [REPORT_SHUNCODE_S1.md](REPORT_SHUNCODE_S1.md)
- [REPORT_SHUNCODE_S2.md](REPORT_SHUNCODE_S2.md)
- [REPORT_SHUNCODE_S3.md](REPORT_SHUNCODE_S3.md)
- [REPORT_SHUNCODE_S4.md](REPORT_SHUNCODE_S4.md)
- [REPORT_v2.md](REPORT_v2.md)
- [REPORT_v3.md](REPORT_v3.md)
- [REPORT_v4.md](REPORT_v4.md)
- [REPORT_v5.md](REPORT_v5.md)
- [REPORT_v6.md](REPORT_v6.md)
- [01a08d85-web-agent-audit.md](01a08d85-web-agent-audit.md)
- [AUDIT_CROSSCHECK_2026-09-11.md](AUDIT_CROSSCHECK_2026-09-11.md)
- [AUDIT_ROUND3_2026-09-13.md](AUDIT_ROUND3_2026-09-13.md)
- [DOC_QUALITY_2026-09-12.md](DOC_QUALITY_2026-09-12.md)

## 上传参考原件（只存档，不运行）

2026-09-21从仓库根归入本目录，文件内容与上传原件逐字节一致；归档不表示用户任务撤销或相关建议已采纳。当前取舍与后续任务只看阶段10，不能把原始提示词当最新施工指令。

| 原件 | 定位与完整性 |
|---|---|
| [shuncode-bridge-source.zip](shuncode-bridge-source.zip) | 用户参考源码包，201993字节；SHA-256 `4114d6e8d583cea5193b48d53e8137921803a681006914a943abf804aa847188` |
| [web_agent提示词-修正版-纯净.txt](web_agent提示词-修正版-纯净.txt) | 原始任务/授权边界证据，2870字节；SHA-256 `799bc9a80abb23a5807a5780cbd1452460bb90f705fb5ae530803a76a8033da2` |

本轮只移动原件，不解包、安装或执行，不将包内代码作为可安装依赖。此前安全解包阅读的范围、手写类型不授信及不整体替换MCP的约束见[阶段10](../../manager/stages/s10-upstream-adoption.md)的F54参考包记录。参考原件不进产品安装白名单。

## 已退役的施工提示词

review/PROMPT.md已删除：其1–10项已在旧版完成，含过期分支/副本/能力限制，当前施工由manager/CONTEXT导航到现有阶段计划，不留可复制执行的旧任务单。保留其历史完成映射：P1-1→d0e1d8e；P2-1→6dbd61f；P2-2→923147b；P2-3→0db6d98；P2-4→cc3d316；P3-1/2/3→47b3cc3、87bff44、0e58850；P3-4→d1de7b8；P3-5→c92fd7c；后续Chat Plus补强03d40b7。原稿见迁移前提交1d532d05c3df8b972e320ec33a240cbc1b7c3e6b的review/PROMPT.md；这些提交不是本轮或全项目完成证明。
