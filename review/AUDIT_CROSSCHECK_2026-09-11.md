# 多报告交叉验证与修复台账（2026-09-11）

**输入基线**：`049b08e`（用户上传报告；产品代码与 `7c9bde5` 一致）。
**外部报告**：[project_audit_report.md](../project_audit_report.md)，原文保留，不修改他人的审查结论。
**另一输入**：本会话 2026-09-11 审查，编号 F01–F38、D01–D06；本文件保留其问题索引及最新状态。
**分支**：`arena/01a08d85-web-agent`。

> 本轮完成逐项交叉验证和**第一批修复**，不是所有问题已经解决。尤其安装器、编辑器数据丢失、webview 注入和 PTY 生命周期等仍在待修列表，不能据此宣布版本可发布。

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
| F02 | Inno版本宏被注释、ShellExec错误、PrepareToInstall签名错 | **待修＋Windows编译** |
| F03 | remember/recall 工作区外读写 | 本轮修复；Windows链接测试待验收 |
| F04 | 敏感文件别名/嵌套/大小写 | 本轮修复主要路径；OS级竞态/硬链接隔离不作保证 |
| F05 | WebSocket跨站Origin未过滤 | 本轮修复＋HTTP/WS回归 |
| F06 | 本机API Host黑名单缺口 | 本轮修复＋HTTP回归 |
| F07 | extension webview任务/日志innerHTML注入 | **待修**，动态文本DOM渲染＋CSP＋消息校验 |
| F08 | git diff被当文件正文覆盖 | 本轮修复 |
| F09 | 编辑器切tab丢未保存编辑 | **待修**，独立model/dirty/关闭确认 |
| F10 | 保存失败假成功、缺hash冲突保护 | **待修**，贯通GET hash/PUT expectedHash/409 UI |
| F11 | PTY只读自动批准前缀判断过宽 | **待修**，保守策略，命令复合表达式需审批 |
| F12 | 原子写丢可执行位、锁键别名、短hash前缀 | 权限和锁已修；短hash及symlink写入语义待统一 |
| F13 | PTY失败/超时/未捕获被报成功 | **待修＋真实VS Code** |
| F14 | 审批等待超时后仍可能启动命令 | **待修**，审批/执行分别计时、批准时再次验证 |
| F15 | PTY jobs/输出无界保留 | **待修**，上限/TTL/终态后拒绝progress |
| F16 | VS Code多窗口领取错误工作区任务 | **待修＋双窗口验收**，job/client/workspace身份 |
| F17 | 取消没贯通后端、请求deadline缺失 | **待修**，request-scoped AbortController |
| F18 | >8 tool_calls 导致缺失结果message | **待修**，为每个id形成结果或明确拒绝 |
| F19 | 模型失败自动降级继续修改，写失败仍报已写入 | **待修**，结果驱动状态/降级策略 |
| F20 | OAuth声明basic/post但未实现client secret校验 | **待修/需确定兼容方案**；不是PKCE无效 |
| F21 | clientName@ip身份冲突、无session借用他人身份 | **待修**，显示名与稳定peer id分离 |
| F22 | board状态绕过认领、业务失败被统计成功 | **待修**，状态机/owner/业务错误统一 |
| F23 | 隧道stop/start进程对象及exit竞态 | **待修**，实例generation、等待退出、清URL |
| F24 | 无隧道MCP URL回退到UI端口，失败仍running | **待修**，区分server/bridge/tunnel状态 |
| F25 | 内置Arena模拟报成功、自动改走本机Code | **待修**，明确模拟，不以连接操作启动修改任务 |
| F26 | telemetry延迟响应覆盖新增计数 | 本轮修复 |
| F27 | 全量同步文件读取/正则回溯阻塞 | **待修**，文件预算/可终止regex执行；不把所有正则禁用 |
| F28 | budget裁切破坏schema与cursor | **待修**，稳定schema、工具自身分页 |
| F29 | store坏配置静默覆盖、schema不足 | **待修**，与X12合并 |
| F30 | 用户Skill可读工作区外链接 | 本轮修复；额外采纳X15有界读取 |
| F31 | 安装包递归包含admin-host/data令牌 | **待修**，干净staging/明确文件清单 |
| F32 | Inno PATH子串删除破坏同前缀目录 | **待修＋Windows验收** |
| F33 | 系统级安装后普通用户无法写Program Files运行时 | **需用户决策＋实施** |
| F34 | 启动相对路径/盘符根/appwindow等待和引号 | **待修＋CMD验收** |
| F35 | 归档原型可直接启动不安全入口 | **发行隔离待修**；冻结JS变更需先确认 |
| F36 | docs服务器畸形URI导致进程退出 | 本轮修复 |
| F37 | computer-use返回失败但脚本报OK、焦点/坐标/剪贴板 | **待修＋Windows桌面验收** |
| F38 | Plan全局轮次await期间更换，结果串任务 | **待修**，round id/version校验 |

文档待办也保留：D01主题文档本轮更新；D02文档站链接/summary路由仍待修；D03安全/审批承诺本轮仅同步已修项；D04当前分支/管理状态/历史计数本轮标识；D05安装打包/卸载保留待修；D06测试能力本轮补真实模块、HTTP/WS及runner测试，但完整浏览器/平台矩阵未完成。

## 五、需要用户拍板的项目

现在不阻塞局部错误修复，但实施以下变化前需明确选择：

1. **系统级安装运行时布局（F33）**：推荐运行时/配置移到用户可写目录，产品文件留Program Files；或仅支持用户级安装。前者需兼容迁移与卸载策略。
2. **是否支持通过自定义代理远程访问UI（X22）**：当前维持本机控制面；若需要远程UI，应先设计认证，而不是仅信任代理头/IP。
3. **模型失败后的行为（F19）**：推荐停止并明确报错；内置探索作为用户主动选择的降级，不自动重放修改任务。
4. **OAuth兼容范围（F20）**：选择仅public-client+PKCE并如实声明，或补全confidential client验证；以实际目标客户端兼容性测试决定。
5. **持久登录/凭据存储（X21）**：推荐维持当前内存配对；若要跨重启保留OAuth登录，单独设计生命周期/存储/吊销，而非把配对码写盘。

不需要用户决定的修复（错误提示、越界拒绝、编辑器冲突保护、正确退出状态等）可直接按台账继续。

## 六、验收记录与下一批

本轮最终验收：Linux、Node v22.22.3，`npm test` **39/39测试文件通过，明确进程退出码0**；新增五个回归文件。`node docs-site/build.js`重建成功，docsSite回归确认生成内容一致。首次最终运行因文档站尚未重建出现1/39失败，重建后全量复跑通过，不掩盖失败记录。18个新增/修改JS文件通过node --check，git diff --check无错误。CI改用npm ci，远端CI结果须另查，不冒称已通过。

**不得把后续F项因为当前测试通过而标为完成**。真实浏览器Chromium下载出现 `ECONNRESET`，所以模块fixture测试不能代替浏览器E2E；Windows/ISCC、VS Code native PTY、真实隧道/模型API未实际运行。

推荐下一批：F07/F09/F10（webview与编辑器安全）及F02/F31/F32（发行构建）；再进入F11–F23/F38执行生命周期。每一批先补回归、最小修复、同步模块README与技术实现、重建docs-site，然后提交到同一分支。
