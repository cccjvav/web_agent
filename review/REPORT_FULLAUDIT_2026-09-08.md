# 全面检查报告（2026-09-08，tip = `a5a1f14`）

- **性质**：只出发现、不擅自修（用户惯例）。覆盖：git/仓库卫生、测试与语法、安全面、文档漂移、安装器自查、PM 体系、工作台锁、多 Agent 板。
- **检查时插曲**：第 4 次沙箱回收变体（.git HEAD 回滚 `bfd040f`、148 条伪改动）于检查 opening 发生；按经验库方子 `reset --hard a5a1f14` 无损恢复后再查，结论基于恢复后干净树。

## 分区结论矩阵

| 区 | 结论 | 证据 |
|---|---|---|
| git/分支 | ✅ 干净：树 0 改动；本地=远端=`a5a1f14`；仅推 pinned 分支 | `git status`=0；ls-remote 对齐 |
| 测试/语法 | ✅ 32/32 exit=0；`node --check` 全 js 无错；tests/README 行=32 文件 | audit 批 1 |
| 安全面 | ✅ 密钥扫描仅测试夹具命中（eventBus 防泄漏锁的假 key）；`.gitattributes` CRLF 含新 cmd；AppId GUID 未换；LICENSE/SECURITY.md 在位 | grep 扫描；iss 自查 |
| 安装器 | ✅ 任务/图标/注册表 Tasks 引用自洽；许可页/说明页路径存在；UninstallDelete 覆盖运行时目录 | .iss 自查批 |
| PM 体系 | ✅ CONTEXT 39/80 行；双 SKILL 副本一致（v13）；stages/experience 首行定位齐；AGENTS.md 在轨 | diff/wc/head |
| 文档索引 | ✅ shuncode-ui README 25 行=25 图；workbench README bind L10–L608 经核**准确**；docs-site 新鲜（docsSite 测试绿） | 抽查 |
| 多 Agent 板 | ✅ 锁齐全（并发认领单胜/owner 权限/跨客户端 E_TAKEN）；⚠ 1 处设计上限见 F6 | board/mcpBoard 测试 |
| 文档漂移 | ⚠ 4 处过时/缺口（F1–F3、F4 属卫生） | 见下 |

## 发现（按严重度；P3=文档/卫生级，无 P1/P2 功能缺陷）

| # | 级 | 发现 | 证据 | 建议修法 |
|---|---|---|---|---|
| F1 | P3 | CHECKLIST 测试数过时：A10「30 test files passed」、C 节「30/30」；实际 **32** | CHECKLIST_WINDOWS.md L55、L113 | 改 32（A10 括注保留） |
| F2 | P3 | CHECKLIST B2 的 .cmd 清单漏 `run-webagent-appwindow.cmd`（写 6 个，实 7 个） | L74 vs `ls *.cmd`+docs-site/serve | 清单补名、6→7 |
| F3 | P3 | review/README 索引表缺 REPORT_SHUNCODE_S1–S4 与 shuncode-ui/ 行；CHECKLIST 行措辞「S4 D 节」应为「D1–D13（含阶段 6）」 | review/README.md 表 | 补 5 行 + 改措辞 |
| F4 | P3 | `.gitignore` 未含 `**/.webagent/board.json`：默认工作区用板后会产生未跟踪噪声（config/read-hashes/usage 已忽略，board 漏） | .gitignore L24–27 | 加一行忽略 |
| F5 | P3 | 安装器 [Files] Excludes 无 `.webagent\*` 兜底：现状靠 `workspace\*` + 根无 .webagent 而安全；若自定义工作区设于仓内子目录则理论可打包配置 | installer/webagent.iss L46 | Excludes 加 `.webagent\*`（belt-and-suspenders） |
| F6 | P3 | peers_list 上限 8：`snapshot()` 对 sessions `slice(0, 8)`（session.js L44），>8 客户端同连时 count/peers 少报 | session.js L44；board.js peersList | 板工具改用全量列表或提高上限 |
| F7 | info | 仓体积：pack 14.6MiB，其中 shuncode-ui 25 图 13MB——用户点名入仓的参考资产，属既定约定；记增长观察项 | count-objects/du | 不修；再增图先议 |
| F8 | info | [Icons] UninstallDisplayIcon 指向 .cmd（图标可能不渲染），S4 起既有，纯观感 | webagent.iss | 有图标资产时再换 |
| F9 | info | 回收变体第 4 次（检查 opening）；恢复无损；方子已在 experience.md | 本文件文首 | 不修 |

## 正面确认（无发现即好消息）
- 安全承诺与代码一致：base64 不进 eventBus（chatVision 锁）、resolveSafePath junction 锁在、危险命令远程 E_FORBIDDEN 锁在；板子红线（禁密钥/owner 权限）有测试。
- v13 元管理回路在位：收工第 5 条+模板勾选+P1 触发器；首条『技能进化』已记。
- 唯一活基线 CHECKLIST 结构完好（A/B/D13 节、结果表、已知未修表）；B8/A2/A3 上轮修订仍准确。
- 安装器 P5-1 任务集与文档三处（installer/README、启动脚本说明、CHECKLIST D9–D12）互相对应，无口径分叉。

## 建议处置
F1–F6 为一个小文档/卫生批（约 6 处单行级修改+1 行 gitignore+1 行 Excludes+peers 上限），可一次绿提交修完；F7–F9 不修。等用户点名后动。
