# 多报告交叉验证与修复台账（2026-09-11）

**输入基线**：`049b08e`（用户上传报告；产品代码与 `7c9bde5` 一致）。
**外部报告**：[project_audit_report.md](../project_audit_report.md)，原文保留，不修改他人的审查结论。
**另一输入**：本会话 2026-09-11 审查，编号 F01–F38、D01–D06；本文件保留其问题索引及最新状态。
**分支**：`arena/01a08d85-web-agent`。

> 本轮完成逐项交叉验证和**第一批修复**，不是所有问题已经解决。尤其安装器和PTY生命周期仍待修；webview动态文本/CSP已修但真实VS Code验收尚待；编辑器数据保护已在第二批修复但浏览器验收尚待，不能据此宣布版本可发布。

## 一、怎么处理两份报告的分歧

- **误报/已实现**：给出代码/文档/测试证据，不重复实现，更不放宽安全边界。
- **部分属实**：分清发现本身与其建议是否有效。
- **属实**：合并重复项，保留一个修复编号。
- **待验证/需决策**：不把推测当作运行证据，不私自改变产品路线。
- 下表“原文”按上传报告每节表格从上到下编号。短路径 `src/...` 都指 `webagent-core/agent-host/src/...`，避免和冻结原型混淆。

## 二、上传报告的 35 条发现，逐条核对

### 文档与实现（原报告 §2）

| 编号 | 原文主张 | 核对结论与证据 | 处置 |
|---|---|---|---|
| X01 | localControl 文档只看 remoteAddress，漏 CF 头 | **误报**。`技术实现.md` §2 的 `isTunnelRequest/isLocalControlPlane` 已解释 CF 头、公网 Host，明确“不能只看回环”。但 Host 黑名单自身不足是另一真实问题 F06。 | 不重复补不存在的缺项；修 F06 并同步新规则。 |
| X02 | OAuth 文档没有 spentRefresh/revokeAll | **误报**。`技术实现.md` §4.7 已有 `revokeAll` 小节及 refresh 重放、轮换说明。确有旧“四个 Map”计数，实际有五个 token/client Map，另有 rateHits。 | 校正文档计数；不重复实现轮换。 |
| X03 | ≥2 分支才能总结与单分支可 start 矛盾；单分支自动 single | **误报，建议不正确**。`planRound.start` 创建轮次，`addBranch` 加分支，`markMerged` 要求至少两支；`resolvePlanAction` 的 single 取决于 multiModel.enabled=false，而非只有一支。 | 不更改正确的状态语义；串轮次竞态另记 F38。 |
| X04 | DOCUMENTATION_SUMMARY 只有清单，缺状态 | **部分属实**。该文件已有覆盖率和审查说明，不只是清单；但 92/123/127 等历史数字混用、易误读。 | 本轮增加历史基线标识与活台账链接；后续自动化统计。 |
| X05 | 使用指南说自定义路径不存在会创建，应支持 -workdir | **未找到对应错误原句，建议含不存在的参数**。`技术实现.md` 启动步骤已区分默认工作区/显式路径；脚本没有 `-workdir` 参数。真正的相对路径解析问题见 F34。 | 不凭空增加/宣传参数。 |
| X06 | 原型标“不用”但文件还在，可能被误删 | **维护建议，不是功能错误**。README 已明确原型冻结、留作历史参考。 | 保留历史快照，不擅自删除；发行隔离另记 F35。 |

### 代码质量（原报告 §3）

| 编号 | 原文主张 | 核对结论与证据 | 处置 |
|---|---|---|---|
| X07 | utils/diff 混合行尾会让 Windows patch 失败 | **笼统主张证据不足**。应用补丁在 patchEngine 先 toLf 后 applyEol；已有 CRLF 回归。utils/diff 是输出差异，不是实际写文件引擎。 | 不统一把用户文件永久改成 LF；本轮修真实 git-diff 误覆盖 F08，补 LF/CRLF、BOM 和 dryRun 测试。 |
| X08 | occurrence 没有文档 | **误报**。`技术实现.md` applyPatch 小节、`使用指南.md` 排错、工具 schema、`patchEngine.test.js` 均存在。 | 保留现有实现及文档。 |
| X09 | writeFile 只使用 recalledHash，缺 sessionHash | **误报**。fileOps 已 import/sessionHash，并把显式 hash 和本进程 hash 与磁盘当前内容计算出的 hash 比较；`workspaceTools.test.js` 覆盖跨进程缓存不能授权覆盖。 | 不加 force 绕过；保存 UI 未传 hash 是 F10。 |
| X10 | 进程 crash 未释放计数器，应 close 时删除 execId | **主张缺证据，建议会破坏查询**。没有独立计数器；countRunning 遍历 status=running。error/close 均改变状态，完成记录用于 get_command_output。 | 不在 close 删除可查询结果；进程树/PTY 终态问题仍待 F13–F17/F23。 |
| X11 | access 1 小时没说明；到期必须重新配对 | **误报且建议不准确**。§4.7 TTL 已列 access 1 小时、refresh 7 天。有效 refresh 可换 token，不是每小时重新配对。 | 本轮补一句到期刷新与进程重启失效的区别。 |
| X12 | store.load 坏配置静默 defaults，后续覆盖 | **属实，与 F29 重复**。read/parse 错误都吞掉。只加 warn 不足以防止下一次覆盖。 | 合并 F29，待原子持久化、损坏恢复及输入校验一起修。 |
| X13 | 缺 WEBAGENT_CORS_ORIGINS | **误报**。corsAllow.extraOrigins 已实现；`corsAllow.test.js` 有环境变量扩展测试；使用指南环境变量表已有说明。 | 不重复实现，不扩大 API/WS 白名单。 |
| X14 | initialize 读 instructions 微延迟；应缓存或 ?refresh=true | **待测性能建议**。没有延迟数据，initialize 也不等于每个 SSE 心跳。缓存还需文件变化失效语义。 | 暂不新增协议参数；同步文件扫描性能纳入后续测量。 |
| X15 | Skill 没大小上限；建议“截取 28000/240” | **发现属实，但建议原本就有且不足**。原实现先 readFileSync 全量，再 slice。原会话 F30 只聚焦路径，外部报告补充了明确的有界读取缺口。 | **本轮修复**：普通文件检查、128 KiB 字节上限、按需要读前缀、truncated 标志；并修 F30 用户 Skill 外链。 |
| X16 | findFiles 只支持 **/*，正则当文本 | **部分属实/接口口径**。glob 本来不是 regex，且代码还支持 `?`。glob 的零层目录等匹配细节值得专项测试。 | 文档明确 glob 支持范围；正则使用 search_files 的 isRegex。暂不引入新 glob 库。 |
| X17 | grepSearch.js 的 escapeRegExp 异常；需新增 isRegex | **文件引用错误，功能已实现**。实际是 fileOps.grepSearch，已有 isRegex/caseSensitive，literal 分支会转义正则元字符。 | 不新建重复文件/开关；真实正则时间复杂度问题为 F27。 |
| X18 | 10 轮内仍会无限 tool_calls，缺 max_iterations | **误报**。runOpenAI 外层固定 10 轮，内部每轮只处理前 8 项，不会无限循环。真实问题是剩余 id 无 tool message，F18。 | 不用新参数掩盖协议错误；F18 待修。 |
| X19 | listenOrExit 非 EADDRINUSE 无错误提示 | **误报**。该分支已有 console.error(err) 再 exit(1)。 | 不重复增加日志。 |

### 安全与隐私（原报告 §4）

| 编号 | 原文主张 | 核对结论与证据 | 处置 |
|---|---|---|---|
| X20 | 已跟踪密钥仍可能提交；需 warnTrackedSecrets | **风险真实，建议已实现**。store.trackedSecretFiles/warnTrackedSecrets 已由 config.persistIdentity 启动时调用。 | 不重复实现；安装包绕过 gitignore 是独立 F31，仍待修。 |
| X21 | 配对码只在内存，应脱敏写盘并重载 | **既定设计，建议不采纳**。配对码短时、一次性；脱敏码不能恢复原码，存原码扩大持久化敏感面。重启 OAuth 失效已在 SECURITY 说明。 | 维持内存配对；若需要持久登录，须用户决定完整凭据存储方案，而非偷偷落盘配对码。 |
| X22 | 自定义代理被误拦，应可信 IP/isCustomProxy | **需要设计决策，原描述不完整**。缺 CF 头的陌生代理并不一定被拦；旧代码反而可能把本机代理当作本机控制面。 | 本轮按现有 local-only 边界收紧 Host；不增加泛化代理放行。用户确需代理 UI 再讨论身份认证方案。 |
| X23 | cloudflared 提示只有 winget | **误报**。installHint 已按平台输出 Windows winget / macOS brew / Linux 官方安装说明。 | 不盲加未配置仓库的 apt-get 命令。 |
| X24 | API Key 经 POST /api/chat 在公网传输；HTTPS 已默认 | **数据流描述错误**。Chat 请求体传 modelId 等，不从浏览器传 API Key；主机从 store 取 key 再请求模型。添加模型/探测 API 才会接收 key。本机端口默认 HTTP，外部隧道通常 HTTPS，不能混称“已默认”。 | 不信任 X-Forwarded-Proto 来代替安全边界；远程自定义模型 endpoint 的 HTTPS 验证是独立增强项。 |

### UI/兼容性（原报告 §5）

| 编号 | 原文主张 | 核对结论与证据 | 处置 |
|---|---|---|---|
| X25 | pelican.html SMIL 兼容性 | **不属于项目**。仓库没有 pelican.html；鹈鹕是此前独立测试，未进仓。CSS @supports 也不能直接证明 SMIL 支持。 | 排除，不修改产品来修独立示例。 |
| X26 | Monaco 加载约7秒且无提示 | **部分属实**。7秒是降级等待上限，不是固定加载耗时。缺明显加载/失败反馈可改进，但 F01 模块启动错误更优先。 | 本轮先修 F01 和主题联动；CDN加载体验后续补浏览器验收。 |
| X27 | copy-rules 只在 extension-http 显示 | **行为属实，是否改变属 UX 取舍**。paste-url 配方已有整段提示词；并非所有配方都存在 rulesText。 | 不显示一个没有内容的按钮；通用复制入口可后续统一设计。 |
| X28 | docs-site 移动端 px 导致 iPhone 缩放异常 | **未提供设备/截图/复现，不能确认**。CSS 已有 max-width:980px 媒体查询。px 本身不是错误，把所有 px 改 rem/vh/vw 也非正确通用修法。 | 保留窄屏/缩放/无障碍实测任务，不全局替换单位。 |
| X29 | run-tests 缺 filter | **有效开发体验建议**。原来可直接 node tests/xxx.test.js，但 runner 无筛选；原报告目录 web-agent-core 拼写不正确。 | **本轮新增** `npm test -- --filter=oauth`（文件名子串），零匹配/坏参数非零退出、单文件超时、缺 preferred 文件失败。根 CMD 仍是全量入口。 |

### 测试空白（原报告 §6）

| 编号 | 原文主张 | 核对结论与证据 | 处置 |
|---|---|---|---|
| X30 | patchEngine 未测 occurrence/dryRun hash | **部分误报**。occurrence:2 已有；dryRun 与 hash 的组合边界可以补充。 | 本轮增 dryRun 不落盘、LF/CRLF/BOM及 stale hash 拒绝测试；不重复宣称 occurrence 未测。 |
| X31 | fileOps.test 缺 writeFile stale | **按文件名判断覆盖不正确**。该测试文件不存在；apiFiles.test 已测 PUT 旧 hash 409，workspaceTools 测写入确认。 | 仍需补 UI 冲突验收 F10，但不能称后端从未测 stale。 |
| X32 | executor.test 缺超时 force kill/cancel | **部分属实**。workspaceTools 已测 start/output/cancel，专门验证“拒绝 SIGTERM 的进程组升级强杀”及 PTY 终态的测试不足。 | 合并执行生命周期待修 F13–F17；不删除历史 execId。 |
| X33 | oauth.test 缺 spentRefresh 重放检测 | **误报**。oauth.test 直接验证新旧 refresh 不同、旧 access 作废、旧 refresh 重放、重放后新 access 也作废。 | 保留已有回归。 |
| X34 | skills.test 缺28000截断 | **可补覆盖**，不能因为没有该文件名就说无任何 Skill 测试。 | 本轮 auditStorage 增大文件拒绝、前缀截断、用户 Skill 外链拒绝；共享工具预算还会进一步裁切响应。 |
| X35 | grepSearch.test 缺 (? 特殊字符 | **需具体案例**。已有 isRegex 和正则语法错误处理，合法 lookahead 不该一律封禁。 | 后续针对合法语法/literal/灾难回溯分别测；真实危险点归 F27。 |

### 维护流程建议（原报告 §7）

| 编号 | 建议 | 判定 |
|---|---|---|
| W01 | 源码加 doc-status 然后自动同步 | 标签不能证明行为正确，人工标签也会漂移。先做符号链接/实际行为测试，再考虑自动索引。 |
| W02 | git log 自动变 CHANGELOG | 可优化，但 log 不是用户级发行说明；需要版本范围和归类。暂不把自2024年以来所有提交倾倒进文档。 |
| W03 | npm run lint-docs 并因 TODO/FIXME 拒绝合并 | 当前没有这个 script；可以后续实现真实链接/生成一致性/符号检查。不能把所有合理 TODO 视为失败。 |
| W04 | package.json 写 coverageThreshold 达到80/90 | 现项目是 Node assert 脚本，不是 Jest；单加字段不会生效。先引入覆盖率收集并测基线，再定阈值，避免凭空报百分比。 |

## 三、第一批已经修改的内容

| 来源 | 改动 | 验证 |
|---|---|---|
| F01 | 恢复 applyTheme/initTheme，存储不可用时不崩溃；Monaco 按当前主题初始化 | workbenchRuntime：真实 ES module 求值＋DOM fixture，非浏览器 E2E |
| F03 | 记忆 day 严格日历日期、统一安全路径；recall 不再为了读取创建目录 | auditStorage：坏参数、闰日、目录/文件链接边界 |
| F04 | 内置敏感规则大小写不敏感、适用于任意目录层级；检查 symlink 真实目标；Windows 含歧义部件拒绝 | auditStorage；Windows 专属路径仍待真机 |
| F05/F06 | API 必须回环 socket + 显式本机 Host；WS 在 upgrade 阶段验证 local-control 与 browser Origin | auditControl：真实 HTTP/WS，拒绝跨站/陌生 Host，正常本机与无Origin客户端通过 |
| F08/X07 | 统一识别 git-header/BOM unified diff，只接受单文件有 hunks 的变更；不支持格式拒绝而非当正文 | auditStorage：LF/CRLF、dryRun、无效/多文件diff、旧hash |
| F12（部分） | 规范真实路径作为写锁键；临时文件替换保留普通权限位，失败清理 | auditStorage：别名并发写、0755保留、写失败原文/临时文件检查；短hash前缀策略未改 |
| F26 | 上报返回时仅合并最新当日记录的 lastReportAt，不覆盖新调用 | auditStorage：延迟响应期间调用数不回退 |
| F30/X15/X34 | 用户 Skill realpath 限制；普通文件＋128 KiB硬上限；有界前缀读取、truncated标志 | auditStorage：超限/正常截断/外链 |
| F36 | 文档服务器坏 URL/NUL 返回400，后续请求仍可正常处理 | docsHttp：真实子进程HTTP，400之后首页200 |
| D06/X29 | runner筛选、零匹配/坏参数退出2、缺基线文件退出1、单文件120秒上限（可配） | testRunner：筛选profile、零匹配、参数、非法timeout |

## 四、原会话 F01–F38 全部保留，避免中断后遗漏

**待修不是误报；本轮没做的仍须继续处理。** 以下为原会话编号，不能和 2026-09-08 历史报告的 F 编号混用。

| 编号 | 问题 | 本轮状态 / 下一步 |
|---|---|---|
| F01 | 工作台主题函数未定义导致启动阻断 | 代码与模块回归已修；浏览器E2E待环境 |
| F02 | Inno版本宏被注释、ShellExec错误、PrepareToInstall签名错 | 第四批代码修复＋发行隔离；Windows CI/实机验收待确认 |
| F03 | remember/recall 工作区外读写 | 本轮修复；Windows链接测试待验收 |
| F04 | 敏感文件别名/嵌套/大小写 | 本轮修复主要路径；OS级竞态/硬链接隔离不作保证 |
| F05 | WebSocket跨站Origin未过滤 | 本轮修复＋HTTP/WS回归 |
| F06 | 本机API Host黑名单缺口 | 本轮修复＋HTTP回归 |
| F07 | extension webview任务/日志innerHTML注入 | 第三批代码修复：DOM/textContent、随机nonce CSP、宿主消息校验；VM/DOM回归通过，真实VS Code待验收 |
| F08 | git diff被当文件正文覆盖 | 本轮修复 |
| F09 | 编辑器切tab丢未保存编辑 | 第二批代码修复：每tab模型/dirty/关闭确认/卸载提示；DOM＋Monaco fixture通过，浏览器真机待验收 |
| F10 | 保存失败假成功、缺hash冲突保护 | 第二批代码修复：GET hash/PUT expectedHash/409保留编辑；保存中后续修改不丢失，真实浏览器待验收 |
| F11 | PTY只读自动批准前缀判断过宽 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F12 | 原子写丢可执行位、锁键别名、短hash前缀 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F13 | PTY失败/超时/未捕获被报成功 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F14 | 审批等待超时后仍可能启动命令 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F15 | PTY jobs/输出无界保留 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F16 | VS Code多窗口领取错误工作区任务 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F17 | 取消没贯通后端、请求deadline缺失 | 第六批代码修复＋本地/fixture回归；真实Windows/VS Code仍待验收 |
| F18 | >8 tool_calls 导致缺失结果message | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F19 | 模型失败自动降级继续修改，写失败仍报已写入 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F20 | OAuth声明basic/post但未实现client secret校验 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F21 | clientName@ip身份冲突、无session借用他人身份 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F22 | board状态绕过认领、业务失败被统计成功 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F23 | 隧道stop/start进程对象及exit竞态 | **待修**，实例generation、等待退出、清URL |
| F24 | 无隧道MCP URL回退到UI端口，失败仍running | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F25 | 内置Arena模拟报成功、自动改走本机Code | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F26 | telemetry延迟响应覆盖新增计数 | 本轮修复 |
| F27 | 全量同步文件读取/正则回溯阻塞 | **待修**，文件预算/可终止regex执行；不把所有正则禁用 |
| F28 | budget裁切破坏schema与cursor | **待修**，稳定schema、工具自身分页 |
| F29 | store坏配置静默覆盖、schema不足 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |
| F30 | 用户Skill可读工作区外链接 | 本轮修复；额外采纳X15有界读取 |
| F31 | 安装包递归包含admin-host/data令牌 | 第四批代码修复＋发行隔离；Windows CI/实机验收待确认 |
| F32 | Inno PATH子串删除破坏同前缀目录 | 第四批代码修复＋发行隔离；Windows CI/实机验收待确认 |
| F33 | 系统级安装后普通用户无法写Program Files运行时 | 方案A已实现用户运行时/稳定数据；旧版显式迁移，Windows实机待验收 |
| F34 | 启动相对路径/盘符根/appwindow等待和引号 | 第四批代码修复＋发行隔离；Windows CI/实机验收待确认 |
| F35 | 归档原型可直接启动不安全入口 | 第四批代码修复＋发行隔离；Windows CI/实机验收待确认 |
| F36 | docs服务器畸形URI导致进程退出 | 本轮修复 |
| F37 | computer-use返回失败但脚本报OK、焦点/坐标/剪贴板 | **待修＋Windows桌面验收** |
| F38 | Plan全局轮次await期间更换，结果串任务 | 第五批代码修复＋回归；详见第十节，真实客户端/平台兼容仍待 |

文档待办也保留：D01主题文档本轮更新；D02文档站链接/summary路由仍待修；D03安全/审批承诺本轮仅同步已修项；D04当前分支/管理状态/历史计数本轮标识；D05安装打包/卸载保留待修；D06测试能力本轮补真实模块、HTTP/WS及runner测试，但完整浏览器/平台矩阵未完成。

## 五、用户已确认的产品决策（本次续作）

以下方向已获用户明确同意，不再作为等待用户确认的阻塞项；方向确认不代表代码已经实现。

1. **Windows安装布局A（F33）**：产品文件与用户可写运行时/配置分离；系统安装程序留Program Files，可写数据转到用户目录。迁移、多用户与卸载保留策略随实现测试。
2. **控制面保持本机**：目前不开放远程工作台UI。用户明确保留手机等设备上的Arena经公网MCP连接本机Bridge并发布任务的使用路线。这属于MCP数据通道，不是开放/api或/ws；仍需本机在线、有效MCP认证与可达隧道，具体手机客户端兼容性待实测。
3. **模型失败停止（F19）**：明确报错，由用户主动选择重试/切换/降级，不自动重放修改任务。
4. **OAuth兼容优先（F20）**：保留public-client＋PKCE，补全声明支持的confidential client认证，不以删除认证方式声明作为最终方案。目标客户端的兼容性仍需验收。
5. **暂不持久登录**：保持内存授权，重启重新配对；不持久化短时配对码。今后跨重启授权另立完整存储/吊销设计。

## 六、验收记录与下一批

本轮最终验收：Linux、Node v22.22.3，`npm test` **39/39测试文件通过，明确进程退出码0**；新增五个回归文件。`node docs-site/build.js`重建成功，docsSite回归确认生成内容一致。首次最终运行因文档站尚未重建出现1/39失败，重建后全量复跑通过，不掩盖失败记录。18个新增/修改JS文件通过node --check，git diff --check无错误。CI改用npm ci，远端CI结果须另查，不冒称已通过。

**不得把后续F项因为当前测试通过而标为完成**。真实浏览器Chromium下载出现 `ECONNRESET`，所以模块fixture测试不能代替浏览器E2E；Windows/ISCC、VS Code native PTY、真实隧道/模型API未实际运行。

推荐下一批：F07/F09/F10（webview与编辑器安全）及F02/F31/F32（发行构建）；再进入F11–F23/F38执行生命周期。每一批先补回归、最小修复、同步模块README与技术实现、重建docs-site，然后提交到同一分支。

## 七、第二批：编辑器数据保护

新增editorRuntime.test.js执行实际state/dom/tabs模块，使用DOM与Monaco fixture覆盖：textarea切页保存编辑、dirty、取消关闭、beforeunload、409/500/网络/坏JSON不报成功、携带完整hash、保存中禁止重复提交/关闭、保存时继续编辑及切页不串文件、Monaco晚到迁移、同tab复用模型与视图、关闭释放模型/监听器。不是浏览器E2E。

冲突时保留当前缓冲区并提示核对磁盘；本批不添加强制覆盖、自动合并或草稿磁盘持久化。浏览器崩溃/强制结束不在beforeunload可保证的范围内。F07在随后第三批处理；安装器仍待。

第二批验收：缺失依赖时runner明确退出2；npm ci恢复依赖后，Linux Node v22.22.3全量40/40测试文件通过，退出码0，文档生成一致性通过。真实浏览器/Windows验收仍未运行。

## 八、第三批：扩展webview动态文本

任务/日志改为DOM与textContent；Chat/Bridge HTML每页随机nonce，CSP default-src none、script仅nonce，CSS仍允许inline，base/form禁止。宿主检查消息类型、Chat模式、字符串文本与128000字符上限；无效消息在产生副作用前忽略。任务500条、日志12条显示上限，容忍非数组输入。源与extensions-installed发行副本已同步。

webviewRuntime.test.js使用无脚本的普通HTML标记作为文本样本，验证渲染不调用innerHTML、生成CSP nonce匹配且更新、宿主消息校验实际接线。测试执行真实模板与宿主代码，但不是VS Code容器的CSP运行验收。后端授权、PTY审批等仍是独立待修项。

第三批最终验收：Linux Node v22.22.3，41/41测试文件通过，退出码0；包含编辑器、webview与发行副本一致性回归。文档站重建与一致性检查通过。未运行真实VS Code/browser/Windows安装验收。

## 九、第四批：安装发行与Windows启动

F02/F31/F32/F34/F35发行隔离代码已修；F33按确认方案A实现用户运行时＋稳定用户数据，旧版工作区采取显式备份迁移策略。新package.js白名单staging、生成无密码默认配置、清单校验；Inno只打包payload，不含冻结原型。CMD统一走launch.js，保留cwd/盘符根、app等待healthz而非固定5秒。

新增installerPackaging回归与Windows CI编译任务。旧runtime与用户资料默认保留，卸载不主动清除LocalAppData；代码修复不等于Windows实机安装/迁移/卸载已验收。F35冻结JS未改，只隔离发行。

第四批本地验收：42/42测试文件通过、退出码0；文档生成一致性通过。Windows CI结果另查。

## 十、第五批：执行结果、客户端认证与状态一致性

F18/F19：模型失败停止、不重放内置写入，内置写/补丁失败停止；每tool id有结果，超8项明确限额。F38：旧轮次分支/过期总结不提交。
F20：完整secret-post/basic认证，保留public＋PKCE，刷新/吊销也认证；认证失败不消耗授权码。
F21/F22：随机session归属，不依赖同名/IP，board写需会话、不能代领、不能绕过认领，业务失败如实统计。
F24/F25：无隧道使用本机MCP端口，失败不显示running；内置Arena仅指引不发任务。
F29/F12：坏配置保留拒绝覆盖、校验与原子0600保存；完整hash、已删目标拒绝旧hash重建、链接写入保留链接并替换检查后的目标。

Windows CI补充：第四批首次编译发现缺少可选ChineseSimplified语言包，92ae535修正检测后，GitHub运行34642456660的Windows安装编译与Linux全量测试均通过。这是编译通过，不是安装/升级/卸载/桌面操作人工验收。

第五批本地全量45/45通过，退出码0；首次全量发现通知分支变量引用错误，修正后复跑通过。新增三份回归，Windows安装编译已通过，客户端兼容/桌面实机验收仍待。

## 十一、第六批：PTY与请求生命周期

F11完整只读命令匹配，复合语法需审批。F13真实退出码/超时/输出状态，不可观测fallback不执行。F14审批claimed与accepted分开计时，批准时重新验证。F15输出200Ki、32在途、256保留、15分钟终态TTL；终态不再收progress。F16每插件随机clientId与workspace绑定、所属报告。F17请求ALS取消、5分钟截止、模型120秒、工具开始前检查、普通进程TERM/KILL，PTY取消下发插件；三种Chat入口均传递取消。

新增ptyLifecycle测试，含真实短命子进程取消和真实插件代码fixture；不代表真实Windows/VS Code终端验收完成。旧插件必须同步升级才能访问新增身份校验的PTY API。

第六批全量46/46测试通过，退出码0；HTTP smoke同步验证新PTY身份字段（缺失/错工作区409，匹配成功），真实VS Code/Windows终端验收仍待。
