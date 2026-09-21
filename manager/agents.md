<!-- 定位：项目约定，记录技术环境、编码规范、开发流程等对所有任务通用的项目级约定 -->

# Web Agent 项目约定

## 技术环境
- **语言**：JavaScript（禁止 TypeScript 重写）
- **运行**：Node >=18（主机CI：Ubuntu 18/20/22/24，Windows 20/22/24；不代表code-server兼容性）；同一进程双端口，不拆前后端仓
- **测试**：`cd webagent-core/agent-host && npm test` 或根目录 `run-tests.cmd`

## 编码规范
- 解释对得上磁盘，不杜撰未实现的逻辑
- 改功能同步对应夹 README；动「为什么这样装」改 `docs/development/架构导读.md`（四层）
- 文档唯一规范：`manager/docs/documentation.md`；先审查正文，再运行 `node docs-site/check-docs.js --write` 与 `node docs-site/build.js`，禁止把结构校验等同语义认证。

## 开发流程
- 只提交、只推当前 Arena 固定分支
- 测绿再 commit，不要攒大包（`commit-now` Skill）
- 用户2026-09-20重申：每批须复审自己此前的累计改动与依赖链，核对旧功能合同、兼容变化和项目整体目标；不能只凭新测试/CI绿灯认定无回归。发现问题先记录证据、补负例再最小修正，未审/未验范围明确保留。
- 不要改 `webagent-repro/` 的 JS；不要 vendor ShunCode / DeepSeek++ / Chat Plus

## 工具偏好
- 壳 = workbench/extension，引擎 = agent-host
- Windows 用户指南用 CMD，不要改成 bash
- Bridge 会把 run_command 的桌面截图回给网页模型（第三阶段，用户 2026-09-07 书面签字）；computerUse 白名单 / 6MB 边界不变

## 管理职责分工
遵循原管家L0/L1/L2，不新增独立路线文件：CONTEXT是接手索引和短摘要；当前stages文件承载目标、需求、设计、实施计划/交接、复盘和待更新文档；manager/docs保存可复用专项规范。review正式清单是文件覆盖、语义台账是发现证据，不替代项目计划。接手先读CONTEXT/agents，再按需读阶段，不预加载全部L2。

R4诊断首包（2026-09-21）：历史Windows22两项超时annotations已复取，根因未定位；默认关闭的命令/worker阶段元数据与Windows CI启用，不加超时/重试。Linux debug=1和0分别全套87/87、文档252/28/110；实现144833a的CI35560613257精确SHA九项通过，不是历史根因修复证明。范围、失败迭代及证据在阶段10R4节，探针原分工继续暂停。

R2/R3响应互斥续修：两种外部传输拒绝result与error假值并存，真实传输先红测，unknown/不重放回归保留；其余未完成项见阶段10，不据局部绿灯关闭队列。

R2/R3会话提交时序续修：复审前批拒绝响应的相邻状态写入，真实后续请求红测SID被污染，现延后至RPC接受后提交；未知结果/不重放与有效结果/通知兼容同时回归。
