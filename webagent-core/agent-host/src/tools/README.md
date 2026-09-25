# 工具层：读取、修改、命令和协作状态

完整工具实现详解：[补丁与路径详解](补丁与路径详解.md) · [文件与搜索详解](文件与搜索详解.md) · [命令与PTY详解](命令与PTY详解.md) · [工具入口与命令策略详解](工具入口与命令策略详解.md) · [任务板与工作区详解](任务板与工作区详解.md)。与Plan、缓存、Skill详解及下方自动导航合起来定位本目录源码；导航存在不等于全部完成当前语义审查。


逐项阅读：[缓存与进度详解](缓存与进度详解.md) · [技能与隐藏规则详解](技能与隐藏规则详解.md)。


逐函数阅读：[Plan状态详解](Plan状态详解.md)。


有限workflows入口见[受控工具与工作流详解](../utils/受控工具与工作流详解.md)：顶层/步骤/条件严格schema且动态值只能引用安全的前序步骤，批准后逐步复核，写入派发后异常保守unknown，停止而不重放。

## 职责与入口
MCP、本机Chat和部分REST操作复用 `index.js` 的callTool。它做工具名称/参数归一、模式检查、远程限制和结果预算，再调用具体handler。**schema用于描述接口，不代表这里有通用JSON Schema执行器**；参数边界仍由归一逻辑和handler检查。

## 文件分工
| 文件 | 负责的行为 |
|---|---|
| `index.js` / `normalize.js` | 工具注册、别名、参数归一、模式及远程调用限制 |
| `fileOps.js` | read_files/write_file/delete_file/rename_file、list_directory和搜索调度 |
| `patchEngine.js` | 工作区安全路径、写锁、hash确认、补丁解析与原子发布 |
| `readCache.js` | 读取hash的持久缓存和本进程缓存；二者用途不同 |
| `sensitive.js` | 内置敏感文件及忽略规则，含真实目标检查 |
| `findFiles.js` | 简化glob文件定位；不是完整shell glob实现 |
| `searchWorker.js` | 在worker中执行fileOps.scanSearch，隔离主线程与可终止搜索 |
| `gitOps.js` | 有预算的git status/diff；字面路径、NUL状态，限定工作区子树，默认diff与显式diff用同一套逐路径敏感规则，禁外部diff/textconv/fsmonitor和已发现的自定义filter |
| `executor.js` | 普通子进程和PTY转发的run/start/output/cancel/input行为 |
| `ptyJobs.js` | 本机扩展任务队列、所有权、审批/执行期限与报告状态 |
| `dangerous.js` | 常见危险命令的词法判断；不是操作系统命令沙箱 |
| `progressTracker.js` | 按本机Chat/Bridge初始化会话隔离任务快照，不是多用户事务库 |
| `planRound.js` / `consensusEngine.js` | 当前Plan轮次、本机草案/合并及相应状态 |
| `board.js` | 根据peer身份调用共享任务板，处理认领和状态更新 |
| `skills.js` | 用户与内置Skill发现、受限正文读取和元信息 |
| `workspaceInfo.js` | 聚合工作区画像、git、目录和instructions供客户端初始化 |

## 调用流程与模式
callTool先检查当前请求取消，再定位工具、检查模式、归一参数，最后执行handler并clipJson。Ask/Plan不开放普通源码写入和命令运行；但todos、memory和协作board属于允许的元数据操作，所以“只读”不能解释为磁盘上一个字节都不会变化。

远程MCP拒绝交互send_command_input；run/start命令还经过远程危险命令限制。远程时限（remoteTimeoutSec，F70第七批）：run_command最多50秒——它在一次MCP请求内回答，官方SDK客户端默认60秒放弃请求，旧的60秒上限让客户端在主机送出超时结果前2毫秒放弃；start_command立即返回并轮询，上限600秒（与PTY队列一致），此前也被夹到60秒而杀掉合法的长构建。命令结果带stdoutChars/stderrChars与stdoutTruncated/stderrTruncated，只返回尾部时调用方能知道输出被截断。tools/list每个工具带MCP annotations（readOnlyHint/destructiveHint/idempotentHint/openWorldHint），ChatGPT开发者模式据此只对写入类工具要求确认；它们只是客户端界面提示，主机照常执行权限、模式、危险命令和本机审批。远程get_capabilities与tools/list使用同一ACL过滤，get_logs只返回当前caller的执行追踪，get_task_status只返回当前caller计划；本机入口仍可看宿主/Local状态。本机显式确认和远程权限不是同一个开关。完整实时工具名单以getToolList/tools/list为准，不手写容易失真的数量。

## 文件读取与安全边界
路径必须通过resolveSafePath及敏感规则；绝对盘符、越界路径、真实链接目标等按实现检查。目录遍历跳过链接及隐藏项，不能据此宣称任意外部程序也被限制在工作区。

read_files返回带行号的content和hash；offset从1开始，不是字节位置。批读最多20路径；单个文本读写和补丁结果上限8MiB。读取使用严格UTF-8，非法字节抛E_ENCODING且不改码；保留BOM和CRLF，因此合法文本hash对应原字节。apply_patch另有展示预算：每侧1MiB/20000行、算法1500ms/20000编辑、diff输出256KiB，超限E_DIFF_BUDGET在写入及建目录前拒绝。有界读取检查普通文件，按块读取并探测读取期间增长，不先无限readFileSync再截字符串。

### 写入/补丁步骤
1. 对规范真实路径取得进程内写锁，锁获得后再检查取消。
2. 读取当前正文计算完整SHA-256，与显式或该操作允许的缓存hash比较。短前缀不当作相等；write_file可由显式覆盖确认、匹配的expectedHash或匹配的本进程读取hash满足覆盖条件；明示旧hash即使已确认仍拒绝，持久缓存不等于本进程确认。
3. apply_patch对已有文件只接受单文件unified diff或SEARCH/REPLACE；既无标记也不是diff的正文在hash门前就E_BAD_ARGS拒绝，不再当成整文件内容写回（F70，外部复审P1-1；整文件替换走write_file）。标记须独占整行、分隔行与开头标记同长，空REPLACE整行删除；多处匹配需要正确occurrence。新文件不能把unified diff头当正文，应使用正文或空SEARCH。
4. dryRun只检查并返回结果，不发布写入。实际发布先写独占临时文件、保留已有普通权限，再rename；新建补丁与write_file的显式createOnly都用排他发布，期间目标被创建则以EEXIST/E_FILE_EXISTS失败而不覆盖。
5. 成功更新hash缓存并广播变更。取消或失败不是回滚已完成写入；进程内锁也不锁住外部编辑器。符号链接写入跟随已校验目标，不用新文件替掉链接本身。

冲突应重新读取和计算补丁，不要把旧hash移除后盲目覆盖。delete_file要求确认，不递归清空非空目录；rename拒绝已存在的目标。

## 搜索与分页
| 操作 | 边界与结果含义 |
|---|---|
| list_directory | 扫描1000项，深度最多8；truncated表示需缩小目录，不承诺存在下一页cursor |
| find_files | 默认最多40结果，夹到1–200；扫描条目有上限；支持简化的*、**、?及**/零层匹配 |
| search_files | query最长200字符；regex另限制120字符并做启发式预检；最多800文件、8MiB扫描、2000匹配；单文件超过1.5MiB跳过 |
| 搜索worker | 最多4个，启动10秒、ready后扫描2秒（不是整体2秒），可随当前请求取消；结束后等待worker终止才释放名额 |

搜索返回cursor/nextCursor、scannedFiles及跳过/截短信息。页是本次扫描的结果切片，不是持久化快照；两次调用之间文件变化时不保证稳定顺序。正则启发式检查不是时间复杂度证明，可终止worker才是额外的执行边界。

## 命令与PTY
普通子进程最多8个同时运行，保留有界历史；stdout/stderr各保留约200Ki字符尾部，不是完整日志归档。run等待结果，start返回execId供get_command_output轮询；记录和缺省“最近命令”按本机local/远程peer所有者隔离，跨peer查询/取消统一found:false；取消/超时/非零退出不能当done成功。取消先TERM，必要时2秒后升级KILL；实际系统进程树效果须平台验收。

扩展Chat启用PTY时，ptyJobs把任务发给匹配workspace/clientId的宿主：
- 排队 → claim并绑定所有者 → 当次审批 → accepted再检查有效期 → running → 终态。
- 审批窗口90秒；accepted后执行timer按timeoutSec另加报告余量。最多32在途、保留记录约256，终态15分钟清理；输出有界。
- 迟到progress/approval不能复活终态；取消通知所属扩展停止。run成功要求exitCode为0且结果未标明捕获失败；宿主负责真实输出完成判断。
- node-pty不可用时，只允许可观测shell integration；无观测能力拒绝执行。真正终端事件如何被捕获见[扩展说明](../../../extension/README.md)。

## 协作、Skill与缓存
board从调用上下文获取当前peer，不相信参数任意指定owner；先认领再更新受保护任务状态。Plan轮次仍有本机共享状态；progress的本机计划与各远程peer隔离，get_task_status也只返回调用者计划，但这仍不是OS用户级多租户事务库。

用户Skill限定在工作区允许路径，普通UTF8文件128KiB上限；每页最多8000 UTF16字符，用nextOffset/expectedHash续读。来源ID区分工作区根与内置产品目录，引用/脚本资源只读。Skill是说明文本，不等于后台插件执行器；详见技能与隐藏规则详解。

readCache的read-hashes.json是辅助记录，读/保存异常可能被忽略（落盘已改为临时文件+rename，避免半截JSON被当成"没有任何hash"），但仍不具备models/store那样的损坏拒绝策略；不要把缓存当完整事务日志。

**两个覆盖路径的hash口径不同，这是有意的，不要"统一"掉。** `apply_patch`在没给expectedHash时会回退到`recalledHash()`，即**可跨进程重启**的落盘记录——补丁本身自带SEARCH/REPLACE或unified diff的上下文，内容对不上会先失败，落盘hash只是省掉一次重读。`write_file`用整块新内容覆盖，没有任何内容级校验，所以它只认`sessionHash()`——**本进程内确实读过**才允许免确认覆盖，重启后一律要求显式`confirm_overwrite`。把write_file也改成认落盘hash，等于让新进程凭上一次运行留下的记录盲覆盖文件。

## 验证与定位
`patchEngine`、`workspaceTools`、`auditStorage`、`resourceBudget`覆盖文件与预算；`ptyLifecycle`覆盖审批、所属客户端及捕获；`mcpBoard`/`board`覆盖协作；`modelLifecycle`/`planRound`覆盖轮次。缺省的模块/进程fixture不能代替VS Code和Windows交互验收。

F54第三批：apply_patch新建分支在预览/提交前校验显式hash及块结构；缺失目标携hash拒绝，新建只接受正文或单空SEARCH块，多块整体拒绝，已有文件多块支持保留。

F54交叉复审：apply_patch工具目录明确现存文件才可自动复用读取hash；缺失目标未带expectedHash按既有创建合同，不承诺自动删除检测。

R4：executor/fileOps复用WEBAGENT_DEBUG_PROCESS=1输出有界生命周期元数据（不含命令/搜索/输出正文），默认关闭；超时/取消/容量/结果合同不变，历史Windows根因未关闭。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [board.js](board.js) | 22 个函数/类节点 |
| [commandJob.cs](commandJob.cs) | 文件级登记；未做符号完整性证明 |
| [consensusEngine.js](consensusEngine.js) | 8 个函数/类节点 |
| [dangerous.js](dangerous.js) | 1 个函数/类节点 |
| [executor.js](executor.js) | 39 个函数/类节点 |
| [fileOps.js](fileOps.js) | 36 个函数/类节点 |
| [findFiles.js](findFiles.js) | 6 个函数/类节点 |
| [gitOps.js](gitOps.js) | 13 个函数/类节点 |
| [index.js](index.js) | 24 个函数/类节点 |
| [normalize.js](normalize.js) | 4 个函数/类节点 |
| [patchEngine.js](patchEngine.js) | 42 个函数/类节点 |
| [planRound.js](planRound.js) | 10 个函数/类节点 |
| [progressTracker.js](progressTracker.js) | 12 个函数/类节点 |
| [ptyJobs.js](ptyJobs.js) | 23 个函数/类节点 |
| [readCache.js](readCache.js) | 10 个函数/类节点 |
| [searchWorker.js](searchWorker.js) | 1 个函数/类节点 |
| [sensitive.js](sensitive.js) | 18 个函数/类节点 |
| [skills.js](skills.js) | 20 个函数/类节点 |
| [workflows.js](workflows.js) | 23 个函数/类节点 |
| [workspaceInfo.js](workspaceInfo.js) | 3 个函数/类节点 |
<!-- docs-inventory:end -->


受控外部MCP与固定工作流新增模块、审批页面和真实HTTP回归的逐函数解释见 `webagent-core/agent-host/src/utils/受控工具与工作流详解.md`。默认回环HTTP(S)，另支持本机显式确认的公网HTTPS及stdio启动；external_request与operation_result包装字段严格白名单，外部ok:false等明确失败以及verification unknown在覆盖宿主验证说明前判定，不被缺失isError或投影顺序改写为成功。工作流把read_files逐项error提升为步骤失败并停止后续效果；工具仍逐次本机批准，不自动安装或重试。
