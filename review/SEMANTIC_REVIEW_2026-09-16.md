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

## 从文档反查出的实际未完工项

| 类型 | 项目 | 证据与下一步 |
|---|---|---|
| 已确认实现差异，需优先修复 | Plan merge在合并模型不可调用时仍走mergeLocalBranches | `agent/runChat.js` action=merge的canCallModel/else；需仅允许明确选择builtin，其他配置错误停止，并补回归 |
| 已确认实现差异，需优先修复 | 直接`/api/tool/call`将不抛异常的工具业务失败外包为success:true | `api/routes.js`对应路由；需统一工具失败判定与事件语义，不把HTTP完成当业务成功 |
| 已确认缺口，需设计取消归属 | MCP notifications/cancelled目前只确认通知，不映射正在执行的工具取消 | `mcp/server.js` notification分支；需按已认证调用归属管理，不能跨会话取消或声称撤销已写文件 |
| 既定施工尚未完成 | 公网出站MCP | HTTPS、DNS与实际连接一致、重定向、凭据隔离、审批和测试；当前本机HTTP/stdio不是公网实现 |
| 既定施工尚未完成 | 受保护回滚、完整预览UX | 已有dryRun/baseHash/proposedHash，不等于回滚；恢复前必须核对当前版本 |
| 借鉴候选，尚非全部承诺施工 | 文件变化通知、可信代理下公平性、OCR/图像预处理、桌面目标加固、性质/变异测试、发布签名 | 各自设计与权限前置条件见上游26类队列，不把候选一概报成产品缺陷 |
| 延期 | 持久登录、Chat API确切模型后端身份 | 不随文档整顿偷偷启用；探针保持参考证据定位 |
| 已取消 | 经典工作台/code-server探针入口 | 不再加入待办；不删除现有桌面探针 |
| 人工验收，不是代码施工 | 用户真实桌面/code-server/浏览器探针/公网手机端条件 | 不拿CI或静态源代码代签；用户已关闭11.3，不重新打开 |

前三项是在本次复核中确认仍存在的实现行为，不是本批已经修复。文件变化/OCR/签名等也不能因为列进表格就算已实现。

## 删除与历史资料策略

优先删掉失去独立用途的统计/重复方案，修好导航再生成站点。外部审查原文、失败日志和授权来源不立即批量销毁：先将仍有效问题迁入当前台账并检查引用。历史报告没有因此得到语义认证，后续继续判断合并或删除。

## 验证记录

本批修改产品说明与文档站summary来源，不修改产品运行逻辑。已执行清单生成（232源码/28目录/109排除）、站点构建及受检链接校验，完整75测试文件通过。首次缺Acorn后安装完整开发依赖解决；首次diff检查发现的修改行尾空格已清理。远端CI待本次提交后查询。此前核心0.7.2的75文件测试及86e4dbc对应九项CI属于上一批证据，不能覆盖本次提交。
