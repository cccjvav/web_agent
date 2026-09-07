# 交付报告：ShunCode 对齐 第四阶段（安装包 + 默认壳 + UI 对齐 + 资料归档）

- **执行分支**：`arena/01a07238-web-agent`（提交链 `3d869c1` 规划 → `4a85ecf` → `8a73df0` → `ce6d52f` → `7e7e6e1` → `277cb71`；均已推送）
- **任务书**：[PROMPT_SHUNCODE.md](./PROMPT_SHUNCODE.md) 第四阶段（用户在 S3 签字轮点名：「依照 shuncode 的形式来……windows 安装包，加上一个基本上就是 vscode 复刻的编辑器」）
- **日期**：2026-09-07
- **前序报告**：[S1](./REPORT_SHUNCODE_S1.md) · [S2](./REPORT_SHUNCODE_S2.md) · [S3](./REPORT_SHUNCODE_S3.md)
- **图形参考**：[shuncode-ui/](./shuncode-ui/README.md)（用户 2026-09-07 两批网页上传入仓 `758532a`+`176cabf`，18 张归档 + 索引 + 命名归属约定）

## 做了什么

**S4-1 Windows 安装包（`4a85ecf`，Inno Setup 6，非 Electron）**：`installer/webagent.iss` + `installer/build-installer.cmd` + `installer/README.md`。用户级安装（lowest privileges）、固定 AppId GUID、默认目录 `{autopf}\WebAgent`、中英双语言；装仓库文件（排除 `.git`/`node_modules`/运行时缓存/工作区产物）；桌面+开始菜单快捷方式**默认指向 `run-webagent-vscode.cmd`**，另留「经典工作台」入口指向 `run-webagent.cmd`；前置检查 Node≥18/npm，缺失不阻断、指引 `check-env.cmd`；卸载只清运行时缓存，不动用户工作区与配置。code-server 仍首跑自下载（gitignore 既定，不内嵌）。**沙箱（Linux）无法编译 .iss**：交付脚本 + 文档 + 语法自查清单，真机编译列入下方验收。

**S4-2 Code-OSS 当默认壳（`8a73df0`，文档口径翻转）**：安装器与全部活文档把 vscode 壳立为主入口——使用指南.md 推荐入口条目、架构导读.md §12「Code-OSS 当默认壳」从"不做"表移入"已经做了"、启动脚本说明.md 职责翻转（vscode=安装器默认壳，经典=备用）。docs-site content.js 重建。

**S4-3 UI 对齐（`8a73df0` 抛光 + `ce6d52f` 弹层）**：规划 5 项差距，侦察后 2 项（失败工具卡红框+Failed、Bridge 快速打开/高级设置折叠）**早已在代码里**，从清单移除（教训入经验库）；实做 3 项——①composer 回合 chip 与右下**branch-pill**（模型·分支徽标，对照 14 图）；②**可搜索模型弹层** `js/picker.js`（`openModelPicker`：搜索过滤 name/id/modelId/group，行显 displayName+group/modelId+上下文+能力 pill，合并页带「Current merge model」灰注，Esc/外点关闭、视口内钳位；composer `#model-pick-btn` 可见 + `#model-select` 隐藏但仍是状态源与 onchange 契约；多模型页 `#mm-merge-display` 只读显 + `#btn-mm-pick`/`#btn-mm-active`，对照 11/12/13 图）；③bridge 状态细节行。全部带 `workbenchHtml.test.js` 结构锁 + workbench README 行号校正 + content.js 重建。

**S4-4 资料归档（`277cb71` 首批 + 本提交补齐）**：首批 16 张 `git mv` 入 `review/shuncode-ui/` 重命名 + 索引；第二批（`176cabf`）补齐附件轮缺的 2 张（17 多模型博弈设置页深色、18 失败工具卡红框三屏对照），并 `git rm` 16 个与归档重复的原名原件。**归属纠正**：12/13 曾误名 `chatgpt-*`——弹层实为 ShunCode 自有模型弹层（锚其 composer、列其 API Provider 端点），ChatGPT 客户端只是内嵌背景，已改 `shuncode-*`。夹内 README 立「命名与归属约定」：本项目是 Web Agent，ShunCode 仅参考；内嵌第三方画面只进背景列不进文件名。05 图 Bridge 等待态列入真机文案对照。

## 测了什么

- `tests/workbenchHtml.test.js` 新增/翻转锁：composer chip、branch-pill、`#model-pick-btn` 可见 + `#model-select` 隐藏、mm 页只读显与双按钮、bridge details 行。
- `npm test` 每提交后复跑：**30/30 passed（exit=0）**；docs-site content.js 每次 README 编辑后重建。
- 安装包：沙箱内做了 .iss 语法自查清单 + `[Files]`/`[Icons]`/排除项人工核对；**编译与安装行为只能真机验证**（见下）。

## 故意不做（红线与取舍，保持原样）

- **真 PTY / 终端复用**：架构导读 §12 既定取舍不变（伪终端会话保持未提名=不建）；安装包装的是现有两壳，不新增 shell 层。
- **Electron**：任务书与用户点名均未许可 Electron 打包，继续以 Inno Setup 装文件 + cmd 入口的形式交付。
- **vendor ShunCode / DSH / 扩展**：截图仅作设计参考，未抠图、未复制素材、未引入任何 vendor 代码。
- 无 TS 重写；`resolveSafePath` 未开驱动器读取口子；base64 不经 eventBus；日志无 API key。

## Windows 真机验收清单

**已并入唯一活基线 [CHECKLIST_WINDOWS.md](./CHECKLIST_WINDOWS.md)（2026-09-07 合并）**：D 节 D1–D8＝本阶段交付形态（安装包编译/安装/卸载冒烟、缺 Node 指引、模型弹层明暗、branch-pill、等待态文案对照 05 图、S3 遗留远程实收 image 与 >6MB 降级）；A/B 节继承项同轮修订三处过时（B8 端口拓扑：3000 属主=code-server；A2/A3 默认壳定位；A10/C 节 29→30）。本报告不再复列清单，执行结果填基线各节结果表。

## 阶段结论

第四阶段代码面**完工**：安装包、默认壳口径、UI 三件套、截图归档全部入库并锁测试；真机验收清单如上，执行权在用户 Windows。ShunCode 对齐四阶段（S1 视觉/文案、S2 交互结构、S3 Bridge 回图、S4 交付形态）至此全部关闭代码面，后续仅真机反馈驱动的小修。
