# 文档语义审查台账与剩余施工

## 当前状态

本轮正在进行，不是全仓完成证书。起始清单有188份跟踪Markdown；列出路径、批量读取、AST或hash匹配均不算逐句审查通过。下面明确区分全文重写核对、局部修订、待审；未列为完成的正文不能继承本表的结论。

## 已处理的原句与依据

| 文档／原判断 | 对照依据（仓库相对路径） | 处理 |
|---|---|---|
| README：探针0.4/0.3是当前能力、第三方装好即可连接 | `webagent-core/probe-extension/package.json`、探针入口矩阵、当前授权范围 | 全文重写；改为0.5.2与当前核心0.7.2，撤掉第三方兼容保证和已取消入口施工承诺 |
| README：当前优先事项仍是旧探针批次 | `manager/CONTEXT.md`、阶段10、Tasks交付记录 | 全文重写；交付、剩余施工、验收分开；导航不再重复整份使用手册 |
| CONTRIBUTING：不需要另装工具链 | agent-host `package.json`、`docs-site/check-docs.js`、CI工作流 | 全文重写；明确开发依赖、浏览器与安装器另有前置条件；保留Conda主路径 |
| 使用指南：默认workspace、禁止打开源码仓库 | `installer/launch.js`、`agent-host/src/index.js` 的目录检查 | 改为源码根默认，IDE与主机实际目录一致 |
| 使用指南：新建CMD即可更新PATH | VS Code父进程继承环境；用户此前完整重启的反馈 | 明确完全退出VS Code再开集成CMD |
| 使用指南：命令只能在工作区读写、密钥不会经MCP读出 | executor执行OS用户程序；敏感路径检查在文件工具层 | 删除过强安全承诺，区分文件工具与命令权限 |
| 使用指南：拿错误currentHash重试 | patchEngine版本校验；MCP instructions禁止盲目重放 | 改为重读、核对意图与冲突后重新生成操作 |
| 使用指南：没有安装包、发行副本0.7.1 | `installer/`、核心扩展版本清单 | 改为源码/安装版区别与0.7.2 |
| 网页VSCode：齿轮里有完整智能体设置 | 经典workbench设置页、核心extension界面与run-code-oss启动逻辑 | 明确这是经典工作台菜单；给同一工作区停止/切换入口配置的办法 |
| 网页VSCode：忽略Node版本警告、终端故障不影响其他功能 | ensure-code-server固定包版本、ignore-scripts；CI未操作真实code-server窗口 | 撤销保证；分别检查Node要求、终端、Chat、Bridge |
| 技术实现：主机先初始化身份再验证目录 | `agent-host/src/index.js`：目录检查早于路由加载及persistIdentity | 直接纠正启动顺序，不再用旧风险说明否定新修复 |
| 技术实现：customizations读取异常静默默认、直接覆盖文件 | `models/customizations.js`：loadCustom/saveCustom/writeCustomFile | 仅ENOENT默认；损坏拒绝；单文件临时写rename；仍非多文件事务 |
| SECURITY：PTY审批与取消仍待处理 | `tools/ptyBroker.js`、扩展PTY生命周期及当前安全说明后文 | 移除与后文冲突的未修结论；保留真实平台验收边界 |
| manager/agents：CI只用20 | `.github/workflows/test.yml` | 改为实际主机矩阵，不推广为code-server兼容矩阵 |
| DOCUMENTATION_SUMMARY：92/123/127等历史覆盖计数 | 内容已不能描述当前树；自动清单已有主位置 | 删除；旧内容在Git历史，不另留无意义跳转Markdown；文档站summary旧路由改指本台账 |

“全文重写”仅指上表明确标出的README与CONTRIBUTING新版正文逐句核对；其他文件本批是逐句检查所涉及章节并修订，**不是整份文档已审完**。尤其SECURITY、技术实现、使用指南的未改章节仍需继续复核。源码函数讲解、Conda线性验收和真实用户证据保留，不为缩小审查工作量而删除。

## 从文档反查出的施工状态（续作更新）

| 类型 | 项目 | 证据与下一步 |
|---|---|---|
| 本次已修，待本次CI绑定 | Plan merge仅明确builtin才本机拼接 | `agent/runChat.js` action=merge的canCallModel/else；已对无效/不完整配置停止补回归，保留原轮次与分支 |
| 本次已修，待本次CI绑定 | 直接`/api/tool/call`与MCP共享业务失败判定 | `api/routes.js`对应路由；已统一success/isError与完成事件，保留原结果；HTTP200不代表业务成功 |
| 本次已修，待本次CI绑定 | MCP notifications/cancelled接入在途调用信号 | `mcp/server.js` notification分支；已按初始化peer/同一凭据/带类型ID隔离；已写文件不回滚，不自动重放 |
| 既定施工尚未完成 | 公网出站MCP | HTTPS、DNS与实际连接一致、重定向、凭据隔离、审批和测试；当前本机HTTP/stdio不是公网实现 |
| 既定施工尚未完成 | 受保护回滚、完整预览UX | 已有dryRun/baseHash/proposedHash，不等于回滚；恢复前必须核对当前版本 |
| 借鉴候选，尚非全部承诺施工 | 文件变化通知、可信代理下公平性、OCR/图像预处理、桌面目标加固、性质/变异测试、发布签名 | 各自设计与权限前置条件见上游26类队列，不把候选一概报成产品缺陷 |
| 延期 | 持久登录、Chat API确切模型后端身份 | 不随文档整顿偷偷启用；探针保持参考证据定位 |
| 已取消 | 经典工作台/code-server探针入口 | 不再加入待办；不删除现有桌面探针 |
| 人工验收，不是代码施工 | 用户真实桌面/code-server/浏览器探针/公网手机端条件 | 不拿CI或静态源代码代签；用户已关闭11.3，不重新打开 |

前三项最初由文档复核确认，现已在续作中修复；验证层级见下文。文件变化/OCR/签名等也不能因为列进表格就算已实现。

## 删除与历史资料策略

优先删掉失去独立用途的统计/重复方案，修好导航再生成站点。外部审查原文、失败日志和授权来源不立即批量销毁：先将仍有效问题迁入当前台账并检查引用。历史报告没有因此得到语义认证，后续继续判断合并或删除。

## 验证记录

本批修改产品说明与文档站summary来源，不修改产品运行逻辑。已执行清单生成（232源码/28目录/109排除）、站点构建及受检链接校验，完整75测试文件通过。首次缺Acorn后安装完整开发依赖解决；首次diff检查发现的修改行尾空格已清理。第一组提交c38ead31c5323ee3787ea55a3ecab5909c31c75e的CI35036910154九项成功；该证据不覆盖随后第二组修改。此前核心0.7.2的75文件测试及86e4dbc对应九项CI属于上一批证据，不能覆盖本次提交。

## 第二组：管理经验与逐函数说明复核

- 全文重写并逐句复核`manager/docs/experience.md`：删除“origin能无损恢复全部状态”及未核对就reset --hard的操作建议；改正Bridge恒text的过时契约，保留截图白名单、6MiB及非OS沙箱边界。历史任务表不再与CONTEXT重复维护。
- 全文对照`docs-site/app.js`（385行）、`serve.js`及`index.html`，复核`docs-site/浏览与服务详解.md`全部函数/事件说明。直接改掉“启动总先build”与安装版预构建段落的矛盾；保留真实存在的搜索旧结果未清除、guide坏编码缺少局部catch等限制，不伪称已修。
- 文档站全景页静态文案同步改正：不再说无Key自动builtin、Bridge只能经WS显示、任意命令都限工作区；第三方客户端、截图/代码数据外发与code-server独立进程也不作过强保证。这些是说明文字变更，不是新增产品能力。
- `docs-site/README.md`修正源码构建／安装预构建的入口说明；其余构建器/检查器细节没有因此获得全量语义认证。
- 删除`review/archive/project_audit_report.md`重复稿：换行归一后逐处比较，两稿差异在标题、引言、表头及少数措辞，同组发现保留在`review/01a08d85-web-agent-audit.md`；不声称两稿字节相同。修复review索引及原交叉审查来源说明，原始措辞仍在Git历史。去重不等于认可外部报告中的错误建议。

本组新增完成范围仅为管理经验新版全文与文档站浏览/服务逐函数说明；全仓其余正文仍待审。不得据此给所有Markdown打已认证标签。

第二组本地重新生成清单/站点、校验受检链接与diff，完整75测试文件通过；第二组149a951a7b80893b0107ce27170aebc06a1296df的CI35037123530九项成功（Ubuntu/Windows矩阵、安装器、真实Chromium）；不代表用户真实桌面或全仓语义审查完成。

## 第三组：实际施工与协议文档逐句复核

三个优先缺口现已改代码，不再留作仅文档说明。模型ID不命中也不回退active/首项；merge只允许明确builtin本机拼接。API与MCP共用isToolFailure，返回式失败及unknown保留详情。新增requestLifecycle按初始化peer+凭据摘要+带类型ID隔离取消，最多64在途、5分钟abort、断连清理；不缓存完成后的取消，不强制终止忽略信号的同步代码，不自动回滚/重放。

本组全文逐句对照：`src/mcp/请求分发详解.md`与server/requestLifecycle完整函数分支；`src/mcp/会话与结果详解.md`与session/errors/budget完整函数。修正请求分发里“缺会话早退没有结束事件”、错误分类顺序及取消码保留；补新生命周期每个函数、闭包与限制。API/Agent及根指南相关章节同步修订，但本组未将其余整篇宣称已审完。

新测试使用真实认证HTTP与受控可取消工具，不是实际桌面进程；验证同名不同会话、不同凭据、未认证、ID=0与字符串0、活动重复ID、容量、超时、断连/异常清理、ID复用、API完成事件与错误详情。已有Windows/命令树回归仍须按本次CI结果判断。start_command已经返回execId后不再属于在途RPC，使用命令管理接口。

首轮完整77文件有2项文档门禁失败：旧断言要求MCP没有取消映射，以及新增源码未登记详细指南；修正后第二轮剩新测试observe回调漏讲解，已补明确职责而非删除门禁。全文审查仍未覆盖全仓，公网出站MCP、保护回滚/预览UX与其他候选继续保留。
